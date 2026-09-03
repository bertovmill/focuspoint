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
//   - The high score and the 7-day average come from focuspoint's /api/keystrokes, polled
//     every REFRESH_REMOTE seconds. That history lives server-side and survives this Mac
//     being wiped, so it is the authority; it also changes at most once a day, which is why
//     it is polled slowly.
//
// Privacy is inherited: this reads a number the counter already wrote. It never sees keys.

import AppKit
import Foundation

// MARK: - Configuration

/// The counter's state file: {"date": "2026-09-02", "count": 7272}
let statePath = ProcessInfo.processInfo.environment["KEYSTROKE_STATE"]
    ?? NSHomeDirectory() + "/.focuspoint-keystrokes.json"

let focuspointURL = (ProcessInfo.processInfo.environment["FOCUSPOINT_URL"]
    ?? "https://cael-keystrokes.vercel.app").trimmingCharacters(in: CharacterSet(charactersIn: "/"))

let token = ProcessInfo.processInfo.environment["KEYSTROKE_TOKEN"] ?? ""

/// The state file is written every couple of seconds by the counter, so re-reading it this
/// often keeps the title honest without being busy work.
let refreshLocal: TimeInterval = 2
/// History changes at most once a day. Five minutes is already generous.
let refreshRemote: TimeInterval = 300

// MARK: - Model

struct Summary {
    var todayCount: Int = 0
    var average7: Int = 0
    var bestCount: Int?
    var bestDate: String?
    var lastSync: Date?
    var reachable: Bool = false
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

// MARK: - App

final class MenuBarController: NSObject, NSMenuDelegate {
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private var summary = Summary()
    private var localTimer: Timer?
    private var remoteTimer: Timer?

    override init() {
        super.init()

        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "keyboard", accessibilityDescription: "Keystrokes")
            button.image?.isTemplate = true
            button.imagePosition = .imageLeading
        }

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

    /// The counter buckets days in America/Toronto to match the rest of focuspoint; the menu
    /// bar has to agree with it or the count would blank out for hours around midnight.
    private func todayKey() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "America/Toronto")
        return f.string(from: Date())
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
        statusItem.button?.title = " " + grouped(summary.todayCount)
        rebuildMenu()
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
}

// MARK: - Entry point

let app = NSApplication.shared
app.setActivationPolicy(.accessory) // menu bar only: no Dock icon, no app switcher entry
let controller = MenuBarController()
app.run()
