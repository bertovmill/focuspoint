import { WINDOW_STYLES, type WindowStyle, type WindowStyleId } from "./scene";

/**
 * Which window is in the wall, shared by the shader (read every frame), the
 * CSS fallback, the sill the jar stands on and the pill that cycles it. A tiny
 * external store, like `blindStore`.
 *
 * The choice lives in the URL as `?window=arched` so a link shows the same
 * window, and in localStorage so it sticks for the next visit. The server and
 * the first client paint both use the default; the saved one lands on mount.
 */

const STORAGE_KEY = "site:window-style";
const PARAM = "window";

let current: WindowStyle = WINDOW_STYLES[0];
let hydrated = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

function find(id: string | null | undefined): WindowStyle | undefined {
  return WINDOW_STYLES.find((style) => style.id === id);
}

function readSaved(): WindowStyle | undefined {
  if (typeof window === "undefined") return undefined;
  const fromUrl = find(new URLSearchParams(window.location.search).get(PARAM));
  if (fromUrl) return fromUrl;
  try {
    return find(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return undefined;
  }
}

function persist(style: WindowStyle) {
  try {
    window.localStorage.setItem(STORAGE_KEY, style.id);
  } catch {
    // Private windows and blocked storage: the choice still holds for this visit.
  }
  const url = new URL(window.location.href);
  if (style.id === WINDOW_STYLES[0].id) url.searchParams.delete(PARAM);
  else url.searchParams.set(PARAM, style.id);
  window.history.replaceState(window.history.state, "", url);
}

export const windowStyleStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get: () => current,
  getServer: () => WINDOW_STYLES[0] as WindowStyle,
  /** Picks up the saved choice once, on the client. */
  hydrate() {
    if (hydrated) return;
    hydrated = true;
    const saved = readSaved();
    if (saved && saved !== current) {
      current = saved;
      emit();
    }
  },
  set(id: WindowStyleId) {
    const next = find(id);
    if (!next || next === current) return;
    current = next;
    persist(next);
    emit();
  },
  /** The next window along, wrapping round. */
  cycle(step = 1) {
    const i = WINDOW_STYLES.findIndex((style) => style.id === current.id);
    const n = WINDOW_STYLES.length;
    windowStyleStore.set(WINDOW_STYLES[(i + step + n) % n].id);
  },
};
