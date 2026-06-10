//! clihub-desktop — Tauri 2 shell.
//!
//! The shell is a thin supervisor over the @clihub/daemon sidecar. On startup it
//! spawns the daemon, reads its one-line JSON handshake from stdout
//! (`{"clihub_daemon":{"url","port","token"}}`), then creates the main window with
//! an initialization script that injects `window.__CLIHUB__ = { baseUrl, token }`
//! BEFORE any SPA code runs — so the WebView holds the bearer in a JS global
//! (never in a URL). The daemon child is killed when the window is destroyed.

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// Holds the daemon child so it can be killed on window close.
#[derive(Default)]
struct DaemonState(Mutex<Option<Child>>);

#[derive(serde::Deserialize)]
struct Handshake {
    clihub_daemon: DaemonInfo,
}

#[derive(serde::Deserialize)]
struct DaemonInfo {
    url: String,
    token: String,
}

/// Daemon entrypoint for `tauri dev` runs (CARGO_MANIFEST_DIR = src-tauri).
/// A packaged build will instead ship a compiled sidecar binary (externalBin);
/// wiring that is a later step.
fn daemon_entry() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages/daemon/src/main.ts")
}

/// Resolve the bun binary. LaunchServices-launched apps get a minimal PATH
/// (/usr/bin:/bin:...) that misses user installs, so probe the common install
/// locations first and only then fall back to PATH lookup. A packaged build
/// will ship a compiled sidecar instead (externalBin) and drop this.
fn bun_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        format!("{home}/.bun/bin/bun"),
        "/opt/homebrew/bin/bun".to_string(),
        "/usr/local/bin/bun".to_string(),
    ];
    for c in &candidates {
        if Path::new(c).exists() {
            return PathBuf::from(c);
        }
    }
    PathBuf::from("bun")
}

/// Spawn the daemon and block until its handshake line is parsed.
fn spawn_daemon() -> Result<(DaemonInfo, Child), Box<dyn std::error::Error>> {
    // LaunchServices hands GUI apps a minimal PATH (/usr/bin:/bin:...), so the
    // daemon's provider.detect() would miss CLIs installed under ~/.local/bin
    // etc. and report everything as not installed. Prepend the usual homes.
    let home = std::env::var("HOME").unwrap_or_default();
    let base = std::env::var("PATH").unwrap_or_else(|_| "/usr/bin:/bin".into());
    let path = format!("{home}/.local/bin:{home}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:{base}");

    let mut child = Command::new(bun_path())
        .env("PATH", path)
        .arg("run")
        .arg(daemon_entry())
        .stdout(Stdio::piped())
        .spawn()?;

    let stdout = child.stdout.take().ok_or("daemon stdout unavailable")?;
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    loop {
        line.clear();
        if reader.read_line(&mut line)? == 0 {
            return Err("daemon exited before printing a handshake".into());
        }
        if let Ok(parsed) = serde_json::from_str::<Handshake>(line.trim()) {
            // Drain the rest of stdout in a thread so the child never blocks on a full pipe.
            std::thread::spawn(move || {
                let mut sink = String::new();
                while reader.read_line(&mut sink).unwrap_or(0) > 0 {
                    sink.clear();
                }
            });
            return Ok((parsed.clihub_daemon, child));
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DaemonState::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let (info, child) = spawn_daemon()?;
            app.state::<DaemonState>().0.lock().unwrap().replace(child);

            // Inject the daemon endpoint + bearer before any SPA JS executes.
            let script = format!(
                "window.__CLIHUB__ = {{ baseUrl: {}, token: {} }};",
                serde_json::to_string(&info.url)?,
                serde_json::to_string(&info.token)?,
            );
            WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("clihub")
                .inner_size(1000.0, 700.0)
                .initialization_script(&script)
                .build()?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.app_handle().try_state::<DaemonState>() {
                    if let Some(mut child) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
