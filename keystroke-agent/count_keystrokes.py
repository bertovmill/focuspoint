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
      The write is atomic (temp file + rename), so a crash mid-write can't leave an empty
      or half-written file behind.
    - On startup it also asks the server for today's total and resumes from whichever is
      higher. This is the recovery path for a lost or wiped state file (e.g. after a hard
      crash): the server keeps the larger of what it has and what arrives, so counting up
      from zero would otherwise be silently ignored until the local tally caught up.

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
# How often today's total is written to STATE_PATH. Separate from FLUSH_SECONDS because the
# menu bar app (menubar/) reads that file to show a live count: a local file write is free,
# so it happens often, while the network POST stays at one a minute.
STATE_SECONDS = int(os.environ.get("KEYSTROKE_STATE_SECONDS", "2"))
STATE_PATH = Path(os.environ.get("KEYSTROKE_STATE", str(Path.home() / ".focuspoint-keystrokes.json")))
# Backoff before the single retry of the startup GET (DNS is often still down right after
# a reboot). Kept short so the listener starts within seconds even when offline.
STARTUP_RETRY_SECONDS = float(os.environ.get("KEYSTROKE_STARTUP_RETRY_SECONDS", "5"))

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
    """Write today's tally atomically: temp file beside STATE_PATH, then os.replace().

    A plain write_text() truncates first and fills second, so a crash (or a thermal
    shutdown) in between leaves an empty file and the next start resumes at 0. The rename
    is atomic on APFS, so readers — this process on restart, and the menu bar — only ever
    see the old complete file or the new complete file.
    """
    tmp = STATE_PATH.with_name(STATE_PATH.name + ".tmp")
    try:
        with open(tmp, "w") as f:
            f.write(json.dumps({"date": _date, "count": _count}))
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, STATE_PATH)
    except OSError:
        try:
            tmp.unlink()
        except OSError:
            pass


def fetch_server_count(date: str) -> int | None:
    """GET today's total from the server, or None if it can't be reached.

    One retry with a short backoff: right after a reboot DNS can be down for a few minutes,
    and this only runs once at startup. Never raises — a failed lookup means "trust the
    local file", and startup must not block on the network.
    """
    req = urllib.request.Request(
        f"{FOCUSPOINT_URL}/api/keystrokes",
        method="GET",
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
            if data.get("today") != date:
                # Server-side "today" disagrees (clock skew around midnight): don't adopt a
                # number that belongs to a different day.
                sys.stderr.write(
                    f"[keystrokes] server says today is {data.get('today')!r}, "
                    f"we say {date}; keeping local count\n"
                )
                return None
            return int(data.get("todayCount", 0))
        except Exception as e:  # noqa: BLE001 - startup must survive any network state
            sys.stderr.write(f"[keystrokes] GET (attempt {attempt}) failed: {e}\n")
            if attempt == 1:
                time.sleep(STARTUP_RETRY_SECONDS)
    return None


def reconcile_with_server() -> None:
    """After load_state(): if the server already has more for today, resume from there."""
    global _count, _dirty
    server = fetch_server_count(_date)
    if server is None:
        sys.stderr.write(f"[keystrokes] server unreachable at startup; using local count {_count}\n")
        return
    with _lock:
        if server > _count:
            sys.stderr.write(
                f"[keystrokes] local count {_count} is behind server {server}; "
                f"resuming from server\n"
            )
            _count = server
            _dirty = True
            save_state()


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


def state_loop() -> None:
    """Keep STATE_PATH close to live for the menu bar, without touching the network."""
    while True:
        time.sleep(STATE_SECONDS)
        with _lock:
            if _dirty:
                save_state()


def main() -> None:
    if not TOKEN:
        sys.stderr.write("KEYSTROKE_TOKEN is not set. See README.\n")
        sys.exit(1)

    load_state()
    reconcile_with_server()
    sys.stderr.write(
        f"[keystrokes] counting to {FOCUSPOINT_URL} every {FLUSH_SECONDS}s "
        f"(resumed today at {_count})\n"
    )
    # An immediate flush proves the token/endpoint work before the first minute elapses.
    with _lock:
        flush_locked(final=True)

    threading.Thread(target=flush_loop, daemon=True).start()
    threading.Thread(target=state_loop, daemon=True).start()
    with keyboard.Listener(on_press=on_press) as listener:
        listener.join()


if __name__ == "__main__":
    main()
