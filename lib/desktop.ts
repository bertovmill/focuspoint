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
