#!/usr/bin/env bash
# Set up the focuspoint keystroke counter as a login agent on this Mac.
#
# What it does:
#   1. Creates a Python venv in ./.venv and installs pynput into it.
#   2. Writes a launchd plist to ~/Library/LaunchAgents so the counter starts at login
#      and restarts if it ever crashes.
#   3. Loads it now.
#
# Re-running is safe: it reinstalls, rewrites the plist, and reloads.
#
# You will be asked once for KEYSTROKE_TOKEN (unless it's already in the environment).
# After the first run, macOS will prompt to grant "Input Monitoring" — see the README.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LABEL="com.focuspoint.keystrokes"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
PY="$DIR/.venv/bin/python3"

FOCUSPOINT_URL="${FOCUSPOINT_URL:-https://cael.bertomill.com}"

if [[ -z "${KEYSTROKE_TOKEN:-}" ]]; then
  read -rsp "KEYSTROKE_TOKEN (from focuspoint .env.local): " KEYSTROKE_TOKEN
  echo
fi
if [[ -z "${KEYSTROKE_TOKEN}" ]]; then
  echo "No token given. Aborting." >&2
  exit 1
fi

echo "→ Creating venv and installing pynput…"
python3 -m venv "$DIR/.venv"
"$PY" -m pip install --quiet --upgrade pip
"$PY" -m pip install --quiet pynput

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
    <string>${PY}</string>
    <string>${DIR}/count_keystrokes.py</string>
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
  <string>${DIR}/keystrokes.log</string>
  <key>StandardOutPath</key>
  <string>${DIR}/keystrokes.log</string>
</dict>
</plist>
PLISTEOF

echo "→ (Re)loading the agent…"
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

cat <<DONE

Installed. The counter is running and will start on every login.

One-time permission: macOS needs to allow it to observe key presses.
  System Settings → Privacy & Security → Input Monitoring
  → enable the entry for Python (it appears after the first key press).
Then restart it:  launchctl kickstart -k gui/\$(id -u)/${LABEL}

Logs:   tail -f "$DIR/keystrokes.log"
Stop:   launchctl unload "$PLIST"
DONE
