#!/usr/bin/env python3
"""Count keystrokes on this Mac and report the daily total to focuspoint.

Privacy — read this first:
    This counts *how many* keys you press. It never records *which* keys. The listener
    callback below increments a single integer and immediately discards the key object;
    nothing is ever written down, buffered, or sent except a running number per day. It
    is a pedometer for your hands, not a keylogger.

What it does:
    - Listens for key presses (needs macOS Accessibility permission — see README). If you
      see "This process is not trusted! ... accessibility clients", grant it there.
    - Keeps a per-day total, bucketed in America/Toronto so a key pressed at 11pm counts
      for today and not tomorrow.
    - Every FLUSH_SECONDS, POSTs {date, count} to $FOCUSPOINT_URL/api/keystrokes with a
      bearer $KEYSTROKE_TOKEN.
    - Persists today's total to STATE_PATH so a restart resumes instead of starting over.

Config (environment variables):
    KEYSTROKE_TOKEN   required — must match the server's KEYSTROKE_TOKEN.
    FOCUSPOINT_URL    optional — defaults to https://cael.bertomill.com.
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - Python < 3.9
    ZoneInfo = None  # type: ignore

try:
    from pynput import keyboard
except ImportError:
    sys.stderr.write(
        "pynput is not installed. Run ./install.sh, or: pip install pynput\n"
    )
    sys.exit(1)

FOCUSPOINT_URL = os.environ.get("FOCUSPOINT_URL", "https://cael.bertomill.com").rstrip("/")
TOKEN = os.environ.get("KEYSTROKE_TOKEN", "")
TIMEZONE = os.environ.get("KEYSTROKE_TIMEZONE", "America/Toronto")
FLUSH_SECONDS = int(os.environ.get("KEYSTROKE_FLUSH_SECONDS", "60"))
STATE_PATH = Path(os.environ.get("KEYSTROKE_STATE", str(Path.home() / ".focuspoint-keystrokes.json")))

_tz = ZoneInfo(TIMEZONE) if ZoneInfo else None

_lock = threading.Lock()
_date = ""       # YYYY-MM-DD the count below belongs to
_count = 0       # keystrokes counted for _date
_dirty = False   # unsent changes since the last successful POST


def today_key() -> str:
    return datetime.now(_tz).strftime("%Y-%m-%d")


def load_state() -> None:
    """Resume today's tally from disk; ignore a stale (yesterday's) file."""
    global _date, _count
    _date = today_key()
    _count = 0
    try:
        saved = json.loads(STATE_PATH.read_text())
        if saved.get("date") == _date:
            _count = int(saved.get("count", 0))
    except (OSError, ValueError, TypeError):
        pass


def save_state() -> None:
    try:
        STATE_PATH.write_text(json.dumps({"date": _date, "count": _count}))
    except OSError:
        pass


def post(date: str, count: int) -> bool:
    body = json.dumps({"date": date, "count": count}).encode()
    req = urllib.request.Request(
        f"{FOCUSPOINT_URL}/api/keystrokes",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return 200 <= resp.status < 300
    except urllib.error.HTTPError as e:
        sys.stderr.write(f"[keystrokes] POST failed: HTTP {e.code}\n")
    except Exception as e:  # noqa: BLE001 - network hiccups shouldn't kill the counter
        sys.stderr.write(f"[keystrokes] POST error: {e}\n")
    return False


def on_press(_key) -> None:
    """Increment only. The key argument is intentionally discarded, never inspected."""
    global _date, _count, _dirty
    now = today_key()
    with _lock:
        if now != _date:
            # Day rolled over mid-session: bank yesterday, then start the new day at zero.
            flush_locked(final=True)
            _date, _count = now, 0
        _count += 1
        _dirty = True


def flush_locked(final: bool = False) -> None:
    """Send the current total. Caller holds _lock. `final` forces a send on rollover."""
    global _dirty
    if not _dirty and not final:
        return
    save_state()
    if post(_date, _count):
        _dirty = False


def flush_loop() -> None:
    while True:
        time.sleep(FLUSH_SECONDS)
        with _lock:
            flush_locked()


def main() -> None:
    if not TOKEN:
        sys.stderr.write("KEYSTROKE_TOKEN is not set. See README.\n")
        sys.exit(1)

    load_state()
    sys.stderr.write(
        f"[keystrokes] counting to {FOCUSPOINT_URL} every {FLUSH_SECONDS}s "
        f"(resumed today at {_count})\n"
    )
    # An immediate flush proves the token/endpoint work before the first minute elapses.
    with _lock:
        flush_locked(final=True)

    threading.Thread(target=flush_loop, daemon=True).start()
    with keyboard.Listener(on_press=on_press) as listener:
        listener.join()


if __name__ == "__main__":
    main()
