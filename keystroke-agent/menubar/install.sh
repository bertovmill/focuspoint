#!/usr/bin/env bash
# Put today's keystroke count in the Mac menu bar.
#
# What it does:
#   1. Compiles KeystrokeMenuBar.swift into a minimal .app bundle (LSUIElement, so it lives
#      only in the menu bar — no Dock icon, no app switcher entry).
#   2. Writes a launchd plist so it starts at login and comes back if it ever crashes.
#   3. Loads it now.
#
# Re-running is safe: it rebuilds, rewrites the plist, and reloads.
#
# The token and URL are lifted from the counter's own launch agent
# (com.focuspoint.keystrokes) so there is nothing to retype. Set KEYSTROKE_TOKEN /
# FOCUSPOINT_URL in the environment to override.
#
# This needs no permissions of its own: it reads the count the counter already wrote to
# ~/.focuspoint-keystrokes.json. Accessibility is the counter's business, not this app's.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LABEL="com.focuspoint.keystrokes.menubar"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
COUNTER_PLIST="$HOME/Library/LaunchAgents/com.focuspoint.keystrokes.plist"
APP="$DIR/KeystrokeMenuBar.app"
BIN="$APP/Contents/MacOS/KeystrokeMenuBar"

# Inherit the counter's settings when they exist — one token, configured once.
read_counter_env() {
  local key="$1"
  [[ -f "$COUNTER_PLIST" ]] || return 0
  /usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:${key}" "$COUNTER_PLIST" 2>/dev/null || true
}

KEYSTROKE_TOKEN="${KEYSTROKE_TOKEN:-$(read_counter_env KEYSTROKE_TOKEN)}"
FOCUSPOINT_URL="${FOCUSPOINT_URL:-$(read_counter_env FOCUSPOINT_URL)}"
FOCUSPOINT_URL="${FOCUSPOINT_URL:-https://cael-keystrokes.vercel.app}"

if [[ -z "${KEYSTROKE_TOKEN}" ]]; then
  echo "No KEYSTROKE_TOKEN found (checked \$KEYSTROKE_TOKEN and ${COUNTER_PLIST})." >&2
  echo "Today's count will still show; the high score and 7-day average will not." >&2
fi

echo "→ Building ${APP##*/}…"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
swiftc -O "$DIR/KeystrokeMenuBar.swift" -o "$BIN"

cat > "$APP/Contents/Info.plist" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Keystrokes</string>
  <key>CFBundleDisplayName</key>
  <string>Keystrokes</string>
  <key>CFBundleIdentifier</key>
  <string>${LABEL}</string>
  <key>CFBundleExecutable</key>
  <string>KeystrokeMenuBar</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
</dict>
</plist>
PLISTEOF

# Ad-hoc sign so macOS treats it as one stable app across rebuilds rather than re-prompting.
codesign --force --sign - "$APP" 2>/dev/null || true

echo "→ Writing launch agent to $PLIST"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${BIN}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>KEYSTROKE_TOKEN</key>
    <string>${KEYSTROKE_TOKEN}</string>
    <key>FOCUSPOINT_URL</key>
    <string>${FOCUSPOINT_URL}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardErrorPath</key>
  <string>${DIR}/menubar.log</string>
  <key>StandardOutPath</key>
  <string>${DIR}/menubar.log</string>
</dict>
</plist>
PLISTEOF

echo "→ (Re)loading…"
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

cat <<DONE

Installed. Look at the right-hand end of your menu bar — ⌨ and today's count.
Click it for the high score and your 7-day average.

Restart:   launchctl kickstart -k gui/\$(id -u)/${LABEL}
Stop:      launchctl unload "$PLIST"
Logs:      tail -f "$DIR/menubar.log"
DONE
