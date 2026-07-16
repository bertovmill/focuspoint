#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{WebviewUrl, WebviewWindowBuilder};

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

fn main() {
    let app_host = APP_URL.parse::<tauri::Url>().unwrap().host_str().unwrap().to_string();

    tauri::Builder::default()
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
