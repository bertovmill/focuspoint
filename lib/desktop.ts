// Bridge to the Cael desktop shell (Tauri). The shell injects window.__TAURI__
// via withGlobalTauri; in a plain browser these are no-ops.

type TauriGlobal = { core?: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } };

export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

/** Toggle the native side of pin mode: always-on-top, top-left, compact, translucent. */
export async function setNativePinMode(pinned: boolean): Promise<void> {
  const tauri = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
  try {
    await tauri?.core?.invoke("set_pin_mode", { pinned });
  } catch {
    // Older installed shell without the command — web-side pin view still works.
  }
}

/** Hop the pinned window to the next top corner (other side, then other monitors). */
export async function cyclePinCorner(): Promise<void> {
  const tauri = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
  try {
    await tauri?.core?.invoke("cycle_pin_corner");
  } catch {
    // Older installed shell without the command — nothing to move.
  }
}

/** Bring the app window to the front (desktop shell) and best-effort focus the tab (browser). */
export function focusAppWindow(): void {
  const tauri = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
  if (tauri?.core) {
    tauri.core.invoke("focus_window").catch(() => {});
  }
  try {
    window.focus();
  } catch {
    // Browsers may silently ignore this outside a user gesture — fine, best-effort.
  }
}

/**
 * Re-fit the pinned window to however many task rows it's holding (1–5). The
 * focus limit decides that number, so dropping to one thing shrinks the window
 * to one line instead of leaving four rows of dead space. A no-op in the browser
 * and on older installed shells that don't have the command yet.
 */
export async function setPinWindowRows(rows: number): Promise<void> {
  const tauri = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
  try {
    await tauri?.core?.invoke("set_pin_rows", { rows: Math.max(1, Math.min(5, Math.round(rows))) });
  } catch {
    // Older installed shell without the command — the window just keeps its size.
  }
}
