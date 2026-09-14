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
// through the day, and crossing the goal fires confetti out of the menu bar — once a day.
// The bar is what you glance at a hundred times; the confetti is what you remember.
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

/// UserDefaults key holding the day (YYYY-MM-DD) the goal confetti last fired, so a
/// relaunch — or the 2-second re-read — can't fire it twice in one day.
let celebratedKey = "celebratedDate"

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

// MARK: - Confetti

/// A borderless, click-through, transparent window hung from the menu bar item, with a
/// CAEmitterLayer pouring confetti down out of it for a few seconds. Its own window rather
/// than a layer on the status button because the button is 22pt tall and the point is to
/// spill *out* of the menu bar onto the screen.
final class Confetti {
    private var window: NSWindow?

    func fire(from anchor: NSRect?) {
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

        let size = NSSize(width: 520, height: 520)
        let frame = NSRect(x: anchor.midX - size.width / 2, y: anchor.maxY - size.height,
                           width: size.width, height: size.height)

        if ProcessInfo.processInfo.environment["KEYSTROKE_DEBUG_DUMP"] != nil {
            FileHandle.standardError.write("confetti anchor=\(anchor) screen=\(screen.frame) window=\(frame)\n".data(using: .utf8)!)
        }
        let win = NSWindow(contentRect: frame, styleMask: .borderless, backing: .buffered, defer: false)
        win.isOpaque = false
        win.backgroundColor = .clear
        win.hasShadow = false
        win.ignoresMouseEvents = true
        win.level = .popUpMenu
        win.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]

        let view = NSView(frame: NSRect(origin: .zero, size: size))
        view.wantsLayer = true
        win.contentView = view

        let emitter = CAEmitterLayer()
        emitter.frame = view.bounds
        // Layer coords follow the (unflipped) view: y grows upward, so the top edge is `height`.
        emitter.emitterPosition = CGPoint(x: size.width / 2, y: size.height - 6)
        emitter.emitterShape = .point
        emitter.renderMode = .oldestFirst
        emitter.beginTime = CACurrentMediaTime()
        emitter.emitterCells = Confetti.cells()
        view.layer?.addSublayer(emitter)

        win.orderFrontRegardless()
        window = win

        // A short, dense burst rather than a steady stream: it should read as an event.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { emitter.birthRate = 0 }
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
            guard self?.window === win else { return }
            win.orderOut(nil)
            self?.window = nil
        }
    }

    private static func cells() -> [CAEmitterCell] {
        let colors: [NSColor] = [
            .systemRed, .systemOrange, .systemYellow, .systemGreen,
            .systemTeal, .systemBlue, .systemPurple, .systemPink,
        ]
        let shapes = [rectangle(6, 10), rectangle(8, 8), circle(7)]
        var cells: [CAEmitterCell] = []
        for color in colors {
            for shape in shapes {
                let c = CAEmitterCell()
                c.contents = shape
                c.color = color.cgColor
                c.birthRate = 14
                c.lifetime = 4
                c.lifetimeRange = 1
                // Straight down, spread almost to horizontal either side, then gravity.
                c.emissionLongitude = -.pi / 2
                c.emissionRange = .pi / 2.2
                c.velocity = 220
                c.velocityRange = 120
                c.yAcceleration = -320
                c.spin = 3
                c.spinRange = 5
                c.scale = 1
                c.scaleRange = 0.4
                c.alphaSpeed = -0.25
                cells.append(c)
            }
        }
        return cells
    }

    private static func rectangle(_ w: CGFloat, _ h: CGFloat) -> CGImage? {
        shape(NSSize(width: w, height: h)) { NSBezierPath(roundedRect: $0, xRadius: 1, yRadius: 1) }
    }

    private static func circle(_ d: CGFloat) -> CGImage? {
        shape(NSSize(width: d, height: d)) { NSBezierPath(ovalIn: $0) }
    }

    /// White on transparent; the cell's `color` tints it.
    private static func shape(_ size: NSSize, _ path: @escaping (NSRect) -> NSBezierPath) -> CGImage? {
        let image = NSImage(size: size, flipped: false) { rect in
            NSColor.white.setFill()
            path(rect).fill()
            return true
        }
        var rect = NSRect(origin: .zero, size: size)
        return image.cgImage(forProposedRect: &rect, context: nil, hints: nil)
    }
}

// MARK: - App

final class MenuBarController: NSObject, NSMenuDelegate {
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let confetti = Confetti()
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

    /// Fires the confetti the first time today's count is seen at or past the goal. Keyed on
    /// the day, not on a crossing being *observed*, so hitting 30k while this app was down
    /// still gets its moment at the next launch.
    private func celebrateIfDue() {
        guard summary.goalMet else { return }
        let today = todayKey()
        guard UserDefaults.standard.string(forKey: celebratedKey) != today else { return }
        UserDefaults.standard.set(today, forKey: celebratedKey)
        // Deferred so a launch that lands already past the goal fires after the run loop has
        // placed the item in the menu bar — synchronously in init, its window has no frame yet.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self else { return }
            self.confetti.fire(from: self.statusItem.button?.window?.frame)
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
            menu.addItem(row("🎉 Goal", "\(grouped(summary.target)) · \(summary.percent)%"))
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

        let replay = NSMenuItem(title: "Replay celebration", action: #selector(replayCelebration), keyEquivalent: "")
        replay.target = self
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

    /// For the camera — and for checking the thing works before the day it matters.
    @objc private func replayCelebration() {
        confetti.fire(from: statusItem.button?.window?.frame)
    }
}

// MARK: - Entry point

let app = NSApplication.shared
app.setActivationPolicy(.accessory) // menu bar only: no Dock icon, no app switcher entry
let controller = MenuBarController()
app.run()
