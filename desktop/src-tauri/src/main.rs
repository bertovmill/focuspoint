#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{LogicalPosition, LogicalSize, WebviewUrl, WebviewWindowBuilder};

const APP_URL: &str = "https://cael-agent.vercel.app";

// WKWebView silently drops target="_blank" clicks and window.open() calls
// (there is no popup handler). Rewrite them into same-window navigations so
// on_navigation below can route them.
const INIT_SCRIPT: &str = r#"
  window.open = function (url) { if (url) location.href = url; return null; };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (a && (a.target === '_blank' || a.rel.includes('external'))) {
      e.preventDefault();
      location.href = a.href;
    }
  }, true);
"#;

// Pin mode: park the window in the top-left corner, always on top and slightly
// translucent, sized for the compact top-3 view. Unpinning restores the normal window.
#[tauri::command]
fn set_pin_mode(window: tauri::WebviewWindow, pinned: bool) {
    let _ = window.set_always_on_top(pinned);
    if pinned {
        let _ = window.set_min_size(Some(LogicalSize::new(300.0, 360.0)));
        let _ = window.set_size(LogicalSize::new(360.0, 480.0));
        // y=40 keeps the title bar clear of the macOS menu bar.
        let _ = window.set_position(LogicalPosition::new(12.0, 40.0));
        set_window_alpha(&window, 0.92);
    } else {
        let _ = window.set_min_size(Some(LogicalSize::new(400.0, 500.0)));
        let _ = window.set_size(LogicalSize::new(1280.0, 860.0));
        let _ = window.center();
        set_window_alpha(&window, 1.0);
    }
}

#[cfg(target_os = "macos")]
fn set_window_alpha(window: &tauri::WebviewWindow, alpha: f64) {
    use objc::{msg_send, sel, sel_impl};
    let win = window.clone();
    // NSWindow must be touched on the main thread.
    let _ = window.run_on_main_thread(move || {
        if let Ok(ns_window) = win.ns_window() {
            let ns_window = ns_window as *mut objc::runtime::Object;
            unsafe {
                let _: () = msg_send![ns_window, setAlphaValue: alpha];
            }
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn set_window_alpha(_window: &tauri::WebviewWindow, _alpha: f64) {}

fn main() {
    let app_host = APP_URL.parse::<tauri::Url>().unwrap().host_str().unwrap().to_string();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![set_pin_mode])
        .setup(move |app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(APP_URL.parse().unwrap()))
                .title("Cael")
                .min_inner_size(400.0, 500.0)
                .inner_size(1280.0, 860.0)
                .center()
                .initialization_script(INIT_SCRIPT)
                .on_navigation(move |url| {
                    let host = url.host_str().unwrap_or("");
                    if host == app_host || host == "localhost" || host == "127.0.0.1" {
                        return true;
                    }
                    // External link: hand off to the default browser.
                    let _ = std::process::Command::new("open").arg(url.as_str()).spawn();
                    false
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Cael");
}
