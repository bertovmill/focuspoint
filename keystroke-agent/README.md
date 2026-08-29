# Keystroke counter

A small login agent for your Mac that counts how many keys you press each day and
reports the daily total to focuspoint, where it shows up on the dashboard.

## Privacy

**It counts, it does not record.** The listener increments one integer per key press and
throws the key away — see `on_press` in `count_keystrokes.py`. No key identity is ever
stored, buffered, or sent. What leaves your machine is a single number per day
(`{"date": "2026-08-29", "count": 12345}`). It is a pedometer for your hands.

## Setup

1. **Add a token to focuspoint.** Pick any long random string and set it in both places
   as `KEYSTROKE_TOKEN`:
   - `.env.local` (for local dev)
   - Vercel production (`vercel env add KEYSTROKE_TOKEN production`, then redeploy)

   Generate one with: `openssl rand -hex 32`

2. **Install the agent on your Mac:**

   ```bash
   cd keystroke-agent
   ./install.sh
   ```

   It creates a Python venv, installs `pynput`, and registers a launchd agent that runs
   at login. It will ask for the `KEYSTROKE_TOKEN` you chose above.

3. **Grant Input Monitoring** (one time). After the counter runs and you press a key,
   macOS lists it under **System Settings → Privacy & Security → Input Monitoring**.
   Enable the **Python** entry, then restart the agent:

   ```bash
   launchctl kickstart -k gui/$(id -u)/com.focuspoint.keystrokes
   ```

That's it. Today's count appears on the focuspoint dashboard within a minute and updates
every minute after that.

## Running it by hand (to test)

```bash
KEYSTROKE_TOKEN=... FOCUSPOINT_URL=https://cael.bertomill.com \
  ./.venv/bin/python3 count_keystrokes.py
```

Type a few keys and you should see it post. Point `FOCUSPOINT_URL` at
`http://localhost:3000` to test against a local dev server.

## Managing it

| | |
|---|---|
| Logs | `tail -f keystroke-agent/keystrokes.log` |
| Restart | `launchctl kickstart -k gui/$(id -u)/com.focuspoint.keystrokes` |
| Stop | `launchctl unload ~/Library/LaunchAgents/com.focuspoint.keystrokes.plist` |
| Uninstall | the line above, then delete the plist and this folder's `.venv` |

## How the number behaves

- Days roll over at midnight **America/Toronto** (matches the rest of focuspoint), so a
  key pressed at 11:59pm counts for that day.
- The agent sends the day's *running total*, and the server keeps the **larger** of what
  it has and what arrives. So if the agent restarts and briefly loses its local tally, it
  can never walk the number backward — it just climbs back up and continues.
- Today's total is cached to `~/.focuspoint-keystrokes.json` so a restart resumes.
