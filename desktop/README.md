# Cael Desktop

A native macOS app (Tauri v2) that wraps the production web app at
`https://cael-agent-seven.vercel.app` in the system WebView — no Chrome involved.

Because it loads the deployed site, every `vercel --prod` deploy updates the
desktop app automatically; there is nothing to rebuild unless you want to
change the shell itself (window size, target URL, icon, native behavior).

## Prerequisites (one-time)

- Rust toolchain: `curl https://sh.rustup.rs -sSf | sh -s -- -y`
- Xcode Command Line Tools (already present on most dev Macs)

## Build

```bash
cd desktop
npm install
npx tauri build          # outputs Cael.app + a .dmg
```

Output lands in `desktop/src-tauri/target/release/bundle/`:

- `macos/Cael.app` — copy to /Applications
- `dmg/Cael_*.dmg` — shareable installer

`npx tauri dev` runs the shell without bundling (still loads production).

## Notes

- The shell lives in `src-tauri/src/main.rs`. It keeps navigation on the app
  host (plus localhost) and opens any external link in the default browser.
  `target="_blank"` links are rewritten via an init script because WKWebView
  drops them otherwise.
- Login cookie persists in the WebView's data store, so you only log in once.
- To point the app at a different URL (e.g. localhost during dev), edit
  `APP_URL` in `main.rs` and `build.frontendDist` in `tauri.conf.json`.
- App icon is generated from `app-icon.png` (rasterized from
  `public/icon.svg`) via `npx tauri icon app-icon.png`.
