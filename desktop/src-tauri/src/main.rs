#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{LogicalSize, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

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

// Gap from a monitor's edges when parked. The larger top inset keeps the title
// bar clear of the macOS menu bar.
const CORNER_MARGIN: f64 = 12.0;
const CORNER_TOP_INSET: f64 = 40.0;

// Every top corner the pinned window can sit in: top-left and top-right of each
// connected monitor, ordered monitor by monitor. Physical pixels, since that's
// what monitor geometry and window positions are given in.
fn top_corners(window: &tauri::WebviewWindow) -> Vec<PhysicalPosition<i32>> {
    let win_width = window.outer_size().map(|s| s.width as f64).unwrap_or(360.0);
    let mut corners = Vec::new();
    for m in window.available_monitors().unwrap_or_default() {
        let scale = m.scale_factor();
        let pos = m.position();
        let size = m.size();
        let margin = CORNER_MARGIN * scale;
        let top = (pos.y as f64 + CORNER_TOP_INSET * scale).round() as i32;
        corners.push(PhysicalPosition::new((pos.x as f64 + margin).round() as i32, top));
        corners.push(PhysicalPosition::new(
            (pos.x as f64 + size.width as f64 - win_width - margin).round() as i32,
            top,
        ));
    }
    corners
}

// Pin mode: park the window in a top corner, always on top and slightly
// translucent, sized for the compact top-5 view. Unpinning restores the normal window.
#[tauri::command]
fn set_pin_mode(window: tauri::WebviewWindow, pinned: bool) {
    let _ = window.set_always_on_top(pinned);
    if pinned {
        // Five one-line rows plus the header — still barely taller than a toolbar.
        let _ = window.set_min_size(Some(LogicalSize::new(280.0, 120.0)));
        let _ = window.set_size(LogicalSize::new(340.0, 268.0));
        // Size first, then park — the corner math needs the pinned width.
        if let Some(corner) = top_corners(&window).into_iter().next() {
            let _ = window.set_position(corner);
        }
        set_window_alpha(&window, 0.92);
    } else {
        let _ = window.set_min_size(Some(LogicalSize::new(400.0, 500.0)));
        let _ = window.set_size(LogicalSize::new(1280.0, 860.0));
        let _ = window.center();
        set_window_alpha(&window, 1.0);
    }
}

// Hop the pinned window to the next top corner — the other side of this monitor,
// then around the other monitors. Wraps back to the first corner at the end.
#[tauri::command]
fn cycle_pin_corner(window: tauri::WebviewWindow) {
    let corners = top_corners(&window);
    if corners.is_empty() {
        return;
    }
    let current = window.outer_position().unwrap_or(PhysicalPosition::new(0, 0));
    // Nearest corner to where the window sits now is treated as the current one,
    // so dragging the window by hand doesn't break the cycle.
    let nearest = corners
        .iter()
        .enumerate()
        .min_by_key(|(_, c)| {
            let dx = (c.x - current.x) as i64;
            let dy = (c.y - current.y) as i64;
            dx * dx + dy * dy
        })
        .map(|(i, _)| i)
        .unwrap_or(0);
    let _ = window.set_position(corners[(nearest + 1) % corners.len()]);
}

// Bring the app window to the front (e.g. when a task timer finishes).
#[tauri::command]
fn focus_window(window: tauri::WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
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
        .invoke_handler(tauri::generate_handler![set_pin_mode, cycle_pin_corner, focus_window])
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
