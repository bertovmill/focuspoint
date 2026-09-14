// The keystroke count, in the Mac menu bar.
//
// Deliberately a *separate* process from count_keystrokes.py rather than a menu bar bolted
// onto it. The counting is the valuable part — it feeds the day score and can't be
// reconstructed after the fact — so nothing about drawing a menu should be able to take it
// down. If this app crashes, the counter keeps counting and the number keeps reaching
// focuspoint; only the display goes away.
//
// Two sources, because they answer different questions:
//   - Today's count comes from ~/.focuspoint-keystrokes.json, the counter's own state file,
//     re-read every REFRESH_LOCAL seconds. It is on disk, so the title is live and costs
//     nothing — no network, no server round-trip to watch a number tick up.
//   - The high score, the 7-day average and the daily goal come from focuspoint's
//     /api/keystrokes, polled every REFRESH_REMOTE seconds. That history lives server-side
//     and survives this Mac being wiped, so it is the authority; it also changes at most
//     once a day, which is why it is polled slowly.
//
// The title is drawn, not typed: the number sits on a slim bar that fills toward the goal
// through the day, and crossing the goal fires a celebration out of the menu bar — once a
// day, and a different one each day so it stays a surprise. The bar is what you glance at a
// hundred times; the celebration is what you remember.
//
// Privacy is inherited: this reads a number the counter already wrote. It never sees keys.

import AppKit
import Foundation
import QuartzCore

// MARK: - Configuration

/// The counter's state file: {"date": "2026-09-02", "count": 7272}
let statePath = ProcessInfo.processInfo.environment["KEYSTROKE_STATE"]
    ?? NSHomeDirectory() + "/.focuspoint-keystrokes.json"

let focuspointURL = (ProcessInfo.processInfo.environment["FOCUSPOINT_URL"]
    ?? "https://cael-keystrokes.vercel.app").trimmingCharacters(in: CharacterSet(charactersIn: "/"))

let token = ProcessInfo.processInfo.environment["KEYSTROKE_TOKEN"] ?? ""

/// Until the server has answered, assume the goal focuspoint has used since 2026-09-05.
let defaultTarget = 30_000

/// The state file is written every couple of seconds by the counter, so re-reading it this
/// often keeps the title honest without being busy work.
let refreshLocal: TimeInterval = 2
/// History changes at most once a day. Five minutes is already generous.
let refreshRemote: TimeInterval = 300

/// UserDefaults keys. `celebratedDate` is the day (YYYY-MM-DD) the goal show last fired, so
/// a relaunch — or the 2-second re-read — can't fire it twice in one day; `celebration` is
/// which show it was, so the menu can say and tomorrow can avoid repeating it.
let celebratedKey = "celebratedDate"
let celebrationKey = "celebration"

let debugging = ProcessInfo.processInfo.environment["KEYSTROKE_DEBUG_DUMP"] != nil

// MARK: - Model

struct Summary {
    var todayCount: Int = 0
    var target: Int = defaultTarget
    var average7: Int = 0
    var bestCount: Int?
    var bestDate: String?
    var lastSync: Date?
    var reachable: Bool = false

    var goalMet: Bool { target > 0 && todayCount >= target }
    /// 0…1, clamped: the bar is full at the goal and stays full past it.
    var progress: CGFloat { target > 0 ? min(1, CGFloat(todayCount) / CGFloat(target)) : 0 }
    var percent: Int { target > 0 ? Int((Double(todayCount) / Double(target) * 100).rounded(.down)) : 0 }
}

/// 7272 -> "7,272"
func grouped(_ n: Int) -> String {
    let f = NumberFormatter()
    f.numberStyle = .decimal
    return f.string(from: NSNumber(value: n)) ?? String(n)
}

/// "2026-08-29" -> "Aug 29", without dragging the value through a local timezone.
func shortDate(_ key: String) -> String {
    let parts = key.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return key }
    var c = DateComponents()
    c.year = parts[0]; c.month = parts[1]; c.day = parts[2]
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(identifier: "UTC")!
    guard let date = cal.date(from: c) else { return key }
    let f = DateFormatter()
    f.dateFormat = "MMM d"
    f.timeZone = TimeZone(identifier: "UTC")
    return f.string(from: date)
}

func agoString(_ date: Date?) -> String {
    guard let date else { return "never" }
    let s = Int(Date().timeIntervalSince(date))
    if s < 60 { return "\(s)s ago" }
    if s < 3600 { return "\(s / 60)m ago" }
    return "\(s / 3600)h ago"
}

/// The counter buckets days in America/Toronto to match the rest of focuspoint; the menu
/// bar has to agree with it or the count would blank out for hours around midnight.
func todayKey() -> String {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    f.timeZone = TimeZone(identifier: "America/Toronto")
    return f.string(from: Date())
}

// MARK: - Title image

/// Draws "⌨ 12,982" with a 2pt bar under the digits filled to `progress`. A single template
/// image rather than icon + title text so the bar can sit exactly under the number and the
/// whole thing tints with the menu bar (the track is the same ink at low alpha, which is how
/// the system battery icon draws its own fill).
func titleImage(_ s: Summary) -> NSImage {
    let symbol = NSImage(systemSymbolName: s.goalMet ? "star.fill" : "keyboard", accessibilityDescription: nil)!
        .withSymbolConfiguration(.init(pointSize: 13, weight: .regular))!
    let font = NSFont.monospacedDigitSystemFont(ofSize: 12.5, weight: .medium)
    let text = grouped(s.todayCount) as NSString
    let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor.black]
    let textSize = text.size(withAttributes: attrs)

    let gap: CGFloat = 5
    let barHeight: CGFloat = 2
    let barGap: CGFloat = 1.5
    let height: CGFloat = 20
    let width = ceil(symbol.size.width + gap + textSize.width)
    let textY = barHeight + barGap

    let image = NSImage(size: NSSize(width: width, height: height), flipped: false) { _ in
        let symbolY = textY + (textSize.height - symbol.size.height) / 2
        symbol.draw(in: NSRect(x: 0, y: symbolY, width: symbol.size.width, height: symbol.size.height))

        let textX = symbol.size.width + gap
        text.draw(at: NSPoint(x: textX, y: textY), withAttributes: attrs)

        let track = NSRect(x: textX, y: 0, width: textSize.width, height: barHeight)
        NSColor.black.withAlphaComponent(0.22).setFill()
        NSBezierPath(roundedRect: track, xRadius: 1, yRadius: 1).fill()

        var fill = track
        fill.size.width = max(0, round(track.width * s.progress))
        if fill.width > 0 {
            NSColor.black.setFill()
            NSBezierPath(roundedRect: fill, xRadius: 1, yRadius: 1).fill()
        }
        return true
    }
    image.isTemplate = true
    image.accessibilityDescription = "Keystrokes: \(grouped(s.todayCount)) of \(grouped(s.target))"
    return image
}

// MARK: - Celebrations

/// The shows in the daily rotation. One is picked at random when the goal is hit, never the
/// same as the last one, so the reward is variable — that is the whole point. Every show is
/// a CAEmitterLayer in a borderless, click-through, transparent window: cheap, GPU-driven,
/// and gone again in seconds, so a celebration never costs the day anything.
enum Celebration: String, CaseIterable {
    case confetti, fireworks, goldRain, emojiShower, streamers, digits, balloons, starfield

    var title: String {
        switch self {
        case .confetti: return "Confetti"
        case .fireworks: return "Fireworks"
        case .goldRain: return "Gold rain"
        case .emojiShower: return "Emoji shower"
        case .streamers: return "Streamers"
        case .digits: return "Falling 30,000"
        case .balloons: return "Balloons"
        case .starfield: return "Starfield"
        }
    }

    /// Random, excluding whatever fired last time — the same surprise twice in a row isn't one.
    static func pick(avoiding last: String?) -> Celebration {
        let pool = allCases.filter { $0.rawValue != last }
        return pool.randomElement() ?? .confetti
    }
}

/// Where and for how long a show runs. `frame` is in screen coordinates; emission stops
/// after `burst` seconds and the window is torn down after `total`.
struct Show {
    var frame: NSRect
    var layers: [CAEmitterLayer]
    var burst: TimeInterval
    var total: TimeInterval
}

let palette: [NSColor] = [
    .systemRed, .systemOrange, .systemYellow, .systemGreen,
    .systemTeal, .systemBlue, .systemPurple, .systemPink,
]

// MARK: Sprites

/// Every sprite is drawn at 2x and marked as such on the cell, so it is crisp on Retina.
let spriteScale: CGFloat = 2

/// White on transparent unless told otherwise; the cell's `color` tints it.
func sprite(_ size: NSSize, _ draw: @escaping (NSRect) -> Void) -> CGImage? {
    let px = NSSize(width: size.width * spriteScale, height: size.height * spriteScale)
    let image = NSImage(size: px, flipped: false) { rect in
        NSGraphicsContext.current?.cgContext.scaleBy(x: spriteScale, y: spriteScale)
        draw(NSRect(origin: .zero, size: size))
        return true
    }
    var rect = NSRect(origin: .zero, size: px)
    return image.cgImage(forProposedRect: &rect, context: nil, hints: nil)
}

func rectangleSprite(_ w: CGFloat, _ h: CGFloat) -> CGImage? {
    sprite(NSSize(width: w, height: h)) { NSColor.white.setFill(); NSBezierPath(roundedRect: $0, xRadius: 1, yRadius: 1).fill() }
}

func circleSprite(_ d: CGFloat) -> CGImage? {
    sprite(NSSize(width: d, height: d)) { NSColor.white.setFill(); NSBezierPath(ovalIn: $0).fill() }
}

func starSprite(_ d: CGFloat) -> CGImage? {
    sprite(NSSize(width: d, height: d)) { rect in
        let path = NSBezierPath()
        let c = NSPoint(x: rect.midX, y: rect.midY)
        let outer = d / 2, inner = d / 4.6
        for i in 0..<10 {
            let r = i.isMultiple(of: 2) ? outer : inner
            let a = CGFloat(i) * .pi / 5 + .pi / 2
            let p = NSPoint(x: c.x + cos(a) * r, y: c.y + sin(a) * r)
            i == 0 ? path.move(to: p) : path.line(to: p)
        }
        path.close()
        NSColor.white.setFill()
        path.fill()
    }
}

/// An oval body on a knot with a string hanging below; the body takes the cell's colour.
func balloonSprite() -> CGImage? {
    sprite(NSSize(width: 30, height: 56)) { rect in
        NSColor.white.setFill()
        NSBezierPath(ovalIn: NSRect(x: 1, y: 20, width: 28, height: 35)).fill()
        let knot = NSBezierPath()
        knot.move(to: NSPoint(x: 15, y: 21)); knot.line(to: NSPoint(x: 11, y: 15)); knot.line(to: NSPoint(x: 19, y: 15))
        knot.close(); knot.fill()
        let string = NSBezierPath()
        string.move(to: NSPoint(x: 15, y: 15))
        string.curve(to: NSPoint(x: 13, y: 0), controlPoint1: NSPoint(x: 20, y: 10), controlPoint2: NSPoint(x: 9, y: 5))
        string.lineWidth = 1
        NSColor.white.withAlphaComponent(0.7).setStroke()
        string.stroke()
    }
}

/// Text as a sprite. Emoji keep their own colours; anything else is white for tinting.
func glyphSprite(_ text: String, size: CGFloat, weight: NSFont.Weight = .bold) -> CGImage? {
    let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: size, weight: weight),
        .foregroundColor: NSColor.white,
    ]
    let measured = (text as NSString).size(withAttributes: attrs)
    let box = NSSize(width: ceil(measured.width) + 4, height: ceil(measured.height) + 4)
    return sprite(box) { _ in (text as NSString).draw(at: NSPoint(x: 2, y: 2), withAttributes: attrs) }
}

// MARK: Cells

func cell(_ contents: CGImage?, color: NSColor = .white) -> CAEmitterCell {
    let c = CAEmitterCell()
    c.contents = contents
    c.contentsScale = spriteScale
    c.color = color.cgColor
    return c
}

func emitterLayer(in size: NSSize) -> CAEmitterLayer {
    let e = CAEmitterLayer()
    e.frame = CGRect(origin: .zero, size: size)
    e.renderMode = .oldestFirst
    e.beginTime = CACurrentMediaTime()
    return e
}

// MARK: Shows

/// Builds one show. `anchor` is the status item's frame on `screen`, both in screen coords;
/// layer coords inside a show follow the unflipped view, so y grows upward and the top edge
/// is `height`.
func build(_ kind: Celebration, screen: NSScreen, anchor: NSRect) -> Show {
    /// A window of `size` hung from the top of the screen, centred on the item and kept on
    /// screen horizontally.
    func hung(_ size: NSSize) -> NSRect {
        let x = min(max(anchor.midX - size.width / 2, screen.frame.minX), screen.frame.maxX - size.width)
        return NSRect(x: x, y: screen.frame.maxY - size.height, width: size.width, height: size.height)
    }

    switch kind {
    case .confetti:
        let size = NSSize(width: 520, height: 520)
        let e = emitterLayer(in: size)
        e.emitterPosition = CGPoint(x: size.width / 2, y: size.height - 6)
        e.emitterShape = .point
        e.emitterCells = palette.flatMap { color in
            [rectangleSprite(6, 10), rectangleSprite(8, 8), circleSprite(7)].map { shape in
                let c = cell(shape, color: color)
                c.birthRate = 14
                c.lifetime = 4; c.lifetimeRange = 1
                // Straight down, spread almost to horizontal either side, then gravity.
                c.emissionLongitude = -.pi / 2; c.emissionRange = .pi / 2.2
                c.velocity = 220; c.velocityRange = 120
                c.yAcceleration = -320
                c.spin = 3; c.spinRange = 5
                c.scale = 1; c.scaleRange = 0.4
                c.alphaSpeed = -0.25
                return c
            }
        }
        return Show(frame: hung(size), layers: [e], burst: 0.7, total: 5)

    case .fireworks:
        // Invisible "shells" pop at random points below the item, each throwing out a
        // burst of one-colour sparks that arc and fade under gravity.
        let size = NSSize(width: 760, height: 460)
        let e = emitterLayer(in: size)
        e.emitterPosition = CGPoint(x: size.width / 2, y: size.height * 0.55)
        e.emitterShape = .rectangle
        e.emitterSize = CGSize(width: size.width * 0.8, height: size.height * 0.6)
        e.emitterCells = palette.map { color in
            let shell = CAEmitterCell()
            shell.birthRate = 0.5
            shell.lifetime = 0.06
            shell.velocity = 0
            let spark = cell(circleSprite(5), color: color)
            spark.birthRate = 2200
            spark.lifetime = 1.1; spark.lifetimeRange = 0.4
            spark.emissionRange = .pi * 2
            spark.velocity = 170; spark.velocityRange = 70
            spark.yAcceleration = -140
            spark.scale = 1; spark.scaleSpeed = -0.6
            spark.alphaSpeed = -0.9
            let glint = cell(starSprite(9), color: .white)
            glint.birthRate = 160
            glint.lifetime = 0.9
            glint.emissionRange = .pi * 2
            glint.velocity = 120; glint.velocityRange = 60
            glint.yAcceleration = -120
            glint.spin = 4
            glint.scaleSpeed = -0.8
            glint.alphaSpeed = -1
            shell.emitterCells = [spark, glint]
            return shell
        }
        return Show(frame: hung(size), layers: [e], burst: 3.2, total: 6)

    case .goldRain:
        // Slow, shimmering, and long: flakes in three golds and a highlight drift the height
        // of the screen. The gentlest show in the set, on purpose.
        let size = NSSize(width: 560, height: screen.frame.height)
        let e = emitterLayer(in: size)
        e.emitterPosition = CGPoint(x: size.width / 2, y: size.height - 4)
        e.emitterShape = .line
        e.emitterSize = CGSize(width: size.width * 0.9, height: 1)
        let golds: [NSColor] = [
            NSColor(red: 1.0, green: 0.84, blue: 0.0, alpha: 1),
            NSColor(red: 0.96, green: 0.77, blue: 0.26, alpha: 1),
            NSColor(red: 0.85, green: 0.65, blue: 0.13, alpha: 1),
            NSColor(red: 1.0, green: 0.95, blue: 0.7, alpha: 1),
        ]
        e.emitterCells = golds.flatMap { color in
            [rectangleSprite(4, 7), circleSprite(5), starSprite(8)].map { shape in
                let c = cell(shape, color: color)
                c.birthRate = 12
                c.lifetime = 9; c.lifetimeRange = 2
                c.emissionLongitude = -.pi / 2; c.emissionRange = .pi / 10
                c.velocity = 70; c.velocityRange = 40
                c.yAcceleration = -45
                c.spin = 1.5; c.spinRange = 2
                c.scale = 0.9; c.scaleRange = 0.4
                c.alphaSpeed = -0.1
                return c
            }
        }
        return Show(frame: hung(size), layers: [e], burst: 3.5, total: 12)

    case .emojiShower:
        let size = NSSize(width: 600, height: 600)
        let e = emitterLayer(in: size)
        e.emitterPosition = CGPoint(x: size.width / 2, y: size.height - 10)
        e.emitterShape = .point
        e.emitterCells = ["🎉", "🔥", "⌨️", "💪", "🏆", "⚡️", "🚀", "✨"].map { emoji in
            let c = cell(glyphSprite(emoji, size: 26))
            c.birthRate = 9
            c.lifetime = 4.5; c.lifetimeRange = 1
            c.emissionLongitude = -.pi / 2; c.emissionRange = .pi / 2.4
            c.velocity = 200; c.velocityRange = 110
            c.yAcceleration = -260
            c.spin = 0.6; c.spinRange = 1.6
            c.scale = 1; c.scaleRange = 0.3
            c.alphaSpeed = -0.2
            return c
        }
        return Show(frame: hung(size), layers: [e], burst: 0.9, total: 6)

    case .streamers:
        // Long thin ribbons, thrown wide, tumbling fast, hanging in the air longer than
        // confetti would.
        let size = NSSize(width: 700, height: 560)
        let e = emitterLayer(in: size)
        e.emitterPosition = CGPoint(x: size.width / 2, y: size.height - 6)
        e.emitterShape = .point
        e.emitterCells = palette.flatMap { color in
            [rectangleSprite(3, 34), rectangleSprite(4, 24)].map { shape in
                let c = cell(shape, color: color)
                c.birthRate = 10
                c.lifetime = 5.5; c.lifetimeRange = 1
                c.emissionLongitude = -.pi / 2; c.emissionRange = .pi / 1.9
                c.velocity = 260; c.velocityRange = 140
                c.yAcceleration = -160
                c.spin = 6; c.spinRange = 6
                c.scale = 1; c.scaleRange = 0.3
                c.alphaSpeed = -0.2
                return c
            }
        }
        return Show(frame: hung(size), layers: [e], burst: 0.8, total: 6.5)

    case .digits:
        // The number itself, raining: whole "30,000"s among a shower of single digits.
        let size = NSSize(width: 620, height: 600)
        let e = emitterLayer(in: size)
        e.emitterPosition = CGPoint(x: size.width / 2, y: size.height - 8)
        e.emitterShape = .line
        e.emitterSize = CGSize(width: 160, height: 1)
        var cells: [CAEmitterCell] = []
        for (i, color) in palette.enumerated() {
            let digit = cell(glyphSprite(["3", "0", "0", "0", "0", ","][i % 6], size: 22), color: color)
            digit.birthRate = 7
            digit.lifetime = 4.5; digit.lifetimeRange = 1
            digit.emissionLongitude = -.pi / 2; digit.emissionRange = .pi / 3
            digit.velocity = 150; digit.velocityRange = 90
            digit.yAcceleration = -240
            digit.spin = 1; digit.spinRange = 3
            digit.scale = 1; digit.scaleRange = 0.4
            digit.alphaSpeed = -0.25
            cells.append(digit)
            let whole = cell(glyphSprite("30,000", size: 20, weight: .heavy), color: color)
            whole.birthRate = 2.5
            whole.lifetime = 5
            whole.emissionLongitude = -.pi / 2; whole.emissionRange = .pi / 4
            whole.velocity = 120; whole.velocityRange = 60
            whole.yAcceleration = -200
            whole.spin = 0.3; whole.spinRange = 1
            whole.alphaSpeed = -0.2
            cells.append(whole)
        }
        e.emitterCells = cells
        return Show(frame: hung(size), layers: [e], burst: 1.2, total: 6.5)

    case .balloons:
        // The one show that comes *up*: released along the bottom of the screen under the
        // item, drifting the full height to the menu bar and out.
        let size = NSSize(width: 640, height: screen.frame.height)
        let e = emitterLayer(in: size)
        e.emitterPosition = CGPoint(x: size.width / 2, y: -30)
        e.emitterShape = .line
        e.emitterSize = CGSize(width: size.width * 0.8, height: 1)
        e.emitterCells = palette.map { color in
            let c = cell(balloonSprite(), color: color)
            c.birthRate = 1.6
            c.lifetime = 11; c.lifetimeRange = 2
            c.emissionLongitude = .pi / 2; c.emissionRange = .pi / 14
            c.velocity = 95; c.velocityRange = 45
            c.yAcceleration = 8
            c.spin = 0.1; c.spinRange = 0.5
            c.scale = 1; c.scaleRange = 0.35
            c.alphaSpeed = -0.06
            return c
        }
        return Show(frame: hung(size), layers: [e], burst: 3, total: 14)

    case .starfield:
        // Stars pop in and fade across a wide band under the menu bar — twinkle, not fall.
        let size = NSSize(width: 900, height: 300)
        let e = emitterLayer(in: size)
        e.emitterPosition = CGPoint(x: size.width / 2, y: size.height / 2)
        e.emitterShape = .rectangle
        e.emitterSize = CGSize(width: size.width * 0.95, height: size.height * 0.9)
        let tints: [NSColor] = [.white, .systemYellow, NSColor(red: 0.8, green: 0.9, blue: 1, alpha: 1), .systemPink]
        e.emitterCells = tints.flatMap { color in
            [starSprite(14), starSprite(8), circleSprite(4)].map { shape in
                let c = cell(shape, color: color)
                c.birthRate = 9
                c.lifetime = 1.4; c.lifetimeRange = 0.6
                c.velocity = 0
                c.scale = 0.1; c.scaleSpeed = 0.9
                c.spin = 1.2; c.spinRange = 1
                c.alphaSpeed = -0.75
                return c
            }
        }
        return Show(frame: hung(size), layers: [e], burst: 3.5, total: 6.5)
    }
}

/// Runs one show at a time in a borderless, transparent, click-through window. Its own
/// window rather than a layer on the status button because the button is 22pt tall and the
/// point is to spill *out* of the menu bar onto the screen.
final class CelebrationPlayer {
    private var window: NSWindow?

    func play(_ kind: Celebration, from anchor: NSRect?) {
        window?.orderOut(nil)

        // The status item's window frame is only trustworthy once it is actually on a screen;
        // before layout, or with the menu bar hidden by a full-screen app, it comes back
        // degenerate. Then the best guess is the menu bar's right-hand extras area on the
        // primary display, which is where status items live.
        let onScreen = anchor.flatMap { a in NSScreen.screens.first { a.height > 0 && $0.frame.intersects(a) } }
        guard let screen = onScreen ?? NSScreen.screens.first else { return }
        let anchor = onScreen != nil
            ? anchor!
            : NSRect(x: screen.frame.maxX - 300, y: screen.frame.maxY - 1, width: 1, height: 1)

        let show = build(kind, screen: screen, anchor: anchor)
        if debugging {
            FileHandle.standardError.write("\(kind.rawValue) anchor=\(anchor) screen=\(screen.frame) window=\(show.frame)\n".data(using: .utf8)!)
        }

        let win = NSWindow(contentRect: show.frame, styleMask: .borderless, backing: .buffered, defer: false)
        win.isOpaque = false
        win.backgroundColor = .clear
        win.hasShadow = false
        win.ignoresMouseEvents = true
        win.level = .popUpMenu
        win.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]

        let view = NSView(frame: NSRect(origin: .zero, size: show.frame.size))
        view.wantsLayer = true
        win.contentView = view
        for layer in show.layers { view.layer?.addSublayer(layer) }

        win.orderFrontRegardless()
        window = win

        // Emission stops well before teardown so the last particles finish their fall
        // instead of being cut off mid-air.
        DispatchQueue.main.asyncAfter(deadline: .now() + show.burst) {
            for layer in show.layers { layer.birthRate = 0 }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + show.total) { [weak self] in
            guard self?.window === win else { return }
            win.orderOut(nil)
            self?.window = nil
        }
    }
}

// MARK: - App

final class MenuBarController: NSObject, NSMenuDelegate {
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let player = CelebrationPlayer()
    private var summary = Summary()
    private var localTimer: Timer?
    private var remoteTimer: Timer?

    override init() {
        super.init()

        statusItem.button?.imagePosition = .imageOnly

        let menu = NSMenu()
        menu.delegate = self
        statusItem.menu = menu

        readLocal()
        fetchRemote()
        render()

        // Dev only: KEYSTROKE_DEBUG_SHOW=fireworks plays that show once the item is placed.
        if let raw = ProcessInfo.processInfo.environment["KEYSTROKE_DEBUG_SHOW"], let kind = Celebration(rawValue: raw) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                guard let self else { return }
                self.player.play(kind, from: self.statusItem.button?.window?.frame)
            }
        }

        localTimer = Timer.scheduledTimer(withTimeInterval: refreshLocal, repeats: true) { [weak self] _ in
            self?.readLocal()
            self?.render()
        }
        remoteTimer = Timer.scheduledTimer(withTimeInterval: refreshRemote, repeats: true) { [weak self] _ in
            self?.fetchRemote()
        }
    }

    // MARK: Data

    /// Today's live count, straight off the counter's state file. A file that is missing,
    /// unreadable, or stamped with an earlier date all mean the same thing — no count for
    /// today yet — so they are handled identically rather than as errors.
    private func readLocal() {
        guard
            let data = FileManager.default.contents(atPath: statePath),
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let date = obj["date"] as? String,
            let count = obj["count"] as? Int
        else {
            summary.todayCount = 0
            return
        }
        summary.todayCount = (date == todayKey()) ? count : 0
    }

    private func fetchRemote() {
        guard !token.isEmpty, let url = URL(string: "\(focuspointURL)/api/keystrokes") else { return }
        var req = URLRequest(url: url, timeoutInterval: 20)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        URLSession.shared.dataTask(with: req) { [weak self] data, response, _ in
            guard
                let self,
                let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                let data,
                let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else {
                // A failed poll leaves the last known history in place rather than zeroing
                // it: stale-but-true beats blank every time here.
                DispatchQueue.main.async { self?.summary.reachable = false; self?.render() }
                return
            }
            DispatchQueue.main.async {
                self.summary.average7 = obj["average7"] as? Int ?? self.summary.average7
                if let target = obj["target"] as? Int, target > 0 { self.summary.target = target }
                if let best = obj["bestDay"] as? [String: Any] {
                    self.summary.bestCount = best["count"] as? Int
                    self.summary.bestDate = best["date"] as? String
                }
                self.summary.lastSync = Date()
                self.summary.reachable = true
                self.render()
            }
        }.resume()
    }

    // MARK: Rendering

    private func render() {
        let image = titleImage(summary)
        statusItem.button?.image = image
        if let dump = ProcessInfo.processInfo.environment["KEYSTROKE_DEBUG_DUMP"] {
            // Dev only: write the title as drawn (black ink on transparent) to inspect it
            // without needing a screenshot of the menu bar.
            let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(image.size.width) * 2,
                                       pixelsHigh: Int(image.size.height) * 2, bitsPerSample: 8,
                                       samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                       colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
            rep.size = image.size
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
            image.draw(in: NSRect(origin: .zero, size: image.size))
            NSGraphicsContext.restoreGraphicsState()
            try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: dump))
        }
        rebuildMenu()
        celebrateIfDue()
    }

    /// Today's show, if the goal has already been celebrated today.
    private var todaysCelebration: Celebration? {
        let d = UserDefaults.standard
        guard d.string(forKey: celebratedKey) == todayKey() else { return nil }
        return d.string(forKey: celebrationKey).flatMap(Celebration.init(rawValue:))
    }

    /// Fires a show the first time today's count is seen at or past the goal. Keyed on the
    /// day, not on a crossing being *observed*, so hitting 30k while this app was down still
    /// gets its moment at the next launch.
    private func celebrateIfDue() {
        guard summary.goalMet, todaysCelebration == nil else { return }
        let d = UserDefaults.standard
        let kind = Celebration.pick(avoiding: d.string(forKey: celebrationKey))
        d.set(todayKey(), forKey: celebratedKey)
        d.set(kind.rawValue, forKey: celebrationKey)
        // Deferred so a launch that lands already past the goal fires after the run loop has
        // placed the item in the menu bar — synchronously in init, its window has no frame yet,
        // and at half a second it still sometimes isn't.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            guard let self else { return }
            self.player.play(kind, from: self.statusItem.button?.window?.frame)
            self.rebuildMenu()
        }
    }

    /// A row of "Label            value", using a right-aligned tab stop so the numbers line
    /// up in a column rather than drifting with the label's width.
    private func row(_ label: String, _ value: String, bold: Bool = false) -> NSMenuItem {
        let style = NSMutableParagraphStyle()
        style.tabStops = [NSTextTab(textAlignment: .right, location: 190)]
        let text = NSMutableAttributedString(
            string: "\(label)\t\(value)",
            attributes: [
                .paragraphStyle: style,
                .font: NSFont.menuFont(ofSize: 13),
            ])
        if bold {
            text.addAttribute(.font, value: NSFont.monospacedDigitSystemFont(ofSize: 13, weight: .semibold),
                              range: NSRange(location: 0, length: text.length))
        }
        let mi = NSMenuItem()
        mi.attributedTitle = text
        mi.isEnabled = false
        return mi
    }

    private func rebuildMenu() {
        guard let menu = statusItem.menu else { return }
        menu.removeAllItems()

        menu.addItem(row("Today", grouped(summary.todayCount), bold: true))

        if summary.goalMet {
            let show = todaysCelebration.map { " · \($0.title)" } ?? ""
            menu.addItem(row("🎉 Goal", "\(grouped(summary.target)) · \(summary.percent)%\(show)"))
        } else {
            menu.addItem(row("Goal", "\(grouped(summary.target)) · \(summary.percent)%"))
        }

        if let best = summary.bestCount, let date = summary.bestDate {
            if summary.todayCount > best {
                // Today has already cleared the standing best — say so, and keep showing the
                // old bar so the size of the win is visible.
                menu.addItem(row("🏆 New high score", "beat \(grouped(best))"))
            } else {
                menu.addItem(row("High score", "\(grouped(best)) · \(shortDate(date))"))
            }
        } else {
            menu.addItem(row("High score", "—"))
        }

        menu.addItem(row("7-day average", summary.average7 > 0 ? grouped(summary.average7) : "—"))

        menu.addItem(NSMenuItem.separator())

        if token.isEmpty {
            menu.addItem(row("History", "no token set"))
        } else if !summary.reachable && summary.lastSync == nil {
            menu.addItem(row("History", "unreachable"))
        } else {
            menu.addItem(row("Synced", agoString(summary.lastSync)))
        }

        let refresh = NSMenuItem(title: "Refresh now", action: #selector(refreshNow), keyEquivalent: "r")
        refresh.target = self
        menu.addItem(refresh)

        let open = NSMenuItem(title: "Open focuspoint", action: #selector(openApp), keyEquivalent: "o")
        open.target = self
        menu.addItem(open)

        // For the camera — and for checking each show works before the day it matters.
        let replay = NSMenuItem(title: "Replay celebration", action: nil, keyEquivalent: "")
        let shows = NSMenu()
        let surprise = NSMenuItem(title: "Surprise me", action: #selector(replaySurprise), keyEquivalent: "")
        surprise.target = self
        shows.addItem(surprise)
        shows.addItem(NSMenuItem.separator())
        for kind in Celebration.allCases {
            let mi = NSMenuItem(title: kind.title, action: #selector(replay(_:)), keyEquivalent: "")
            mi.target = self
            mi.representedObject = kind.rawValue
            shows.addItem(mi)
        }
        replay.submenu = shows
        menu.addItem(replay)

        menu.addItem(NSMenuItem.separator())
        let quit = NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.addItem(quit)
    }

    /// Opening the menu is the one moment the numbers are actually being looked at, so both
    /// sources are re-read right then — the poll timers are for the title, not for this.
    func menuWillOpen(_ menu: NSMenu) {
        readLocal()
        render()
        fetchRemote()
    }

    @objc private func refreshNow() {
        readLocal()
        fetchRemote()
        render()
    }

    @objc private func openApp() {
        if let url = URL(string: focuspointURL) { NSWorkspace.shared.open(url) }
    }

    @objc private func replaySurprise() {
        player.play(Celebration.allCases.randomElement()!, from: statusItem.button?.window?.frame)
    }

    @objc private func replay(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let kind = Celebration(rawValue: raw) else { return }
        player.play(kind, from: statusItem.button?.window?.frame)
    }
}

// MARK: - Entry point

let app = NSApplication.shared
app.setActivationPolicy(.accessory) // menu bar only: no Dock icon, no app switcher entry
let controller = MenuBarController()
app.run()
