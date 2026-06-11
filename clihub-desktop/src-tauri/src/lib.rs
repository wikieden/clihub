//! clihub-desktop — Tauri 2 shell.
//!
//! The shell is a thin supervisor over the @clihub/daemon sidecar. On startup it
//! spawns the daemon, reads its one-line JSON handshake from stdout
//! (`{"clihub_daemon":{"url","port","token"}}`), then creates the main window with
//! an initialization script that injects `window.__CLIHUB__ = { baseUrl, token }`
//! BEFORE any SPA code runs — so the WebView holds the bearer in a JS global
//! (never in a URL).
//!
//! Lifecycle: closing the window hides it to the system tray (the daemon stays
//! up); the tray's Quit item / Cmd+Q exits for real, and the daemon child is
//! killed in RunEvent::Exit — the single point that fires on every exit path.
//! `clihub://<panel>` deep links route the SPA via location.hash (App.svelte
//! listens for hashchange).

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::menu::{MenuBuilder, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt;

const WINDOW_LABEL: &str = "main";

/// Panel ids + tray labels. Single source of truth for tray shortcuts and
/// clihub:// deep-link validation — ids must match App.svelte's PANELS.
const PANELS: [(&str, &str); 9] = [
    ("dashboard", "Dashboard"),
    ("drift", "Drift"),
    ("endpoints", "Endpoints"),
    ("mcp", "MCP"),
    ("skills", "Skills"),
    ("profiles", "Profiles"),
    ("versions", "Versions"),
    ("yaml", "Yaml"),
    ("sync", "Sync/Team"),
];

/// Holds the daemon child so it can be killed on exit.
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

/// Kill the daemon sidecar (idempotent — the state slot is taken once).
fn kill_daemon(app: &AppHandle) {
    if let Some(state) = app.try_state::<DaemonState>() {
        if let Some(mut child) = state.0.lock().unwrap().take() {
            let _ = child.kill();
        }
    }
}

/// Show + focus the main window, optionally routing the SPA to a panel.
/// Routing sets location.hash — App.svelte's hashchange listener reacts, so
/// this works on a hidden, already-loaded window. Only whitelisted panel ids
/// are ever eval'd (deep-link input never reaches eval unvalidated).
fn show_window(app: &AppHandle, panel: Option<&str>) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        if let Some(p) = panel {
            if PANELS.iter().any(|(id, _)| *id == p) {
                let _ = window.eval(format!("location.hash = '/{p}'").as_str());
            }
        }
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Map `clihub://<panel>` (also accepts `clihub://panel/<panel>`) onto the SPA.
/// Unknown panels still surface the window — they just don't change the hash.
fn route_deep_link(app: &AppHandle, url: &Url) {
    let host = url.host_str().unwrap_or("");
    let panel = if host == "panel" {
        url.path_segments().and_then(|mut s| s.next()).unwrap_or("")
    } else {
        host
    };
    show_window(app, if panel.is_empty() { None } else { Some(panel) });
}

/// Check the GitHub releases updater endpoint; install + restart if newer.
/// Errors are logged, never fatal — offline, no releases yet, or a dev binary
/// (whose install step cannot work) all land here.
#[cfg(desktop)]
async fn check_updates(app: AppHandle) {
    use tauri_plugin_updater::UpdaterExt;
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            log::warn!("updater unavailable: {e}");
            return;
        }
    };
    match updater.check().await {
        Ok(Some(update)) => {
            log::info!("update {} available — downloading", update.version);
            match update.download_and_install(|_, _| {}, || {}).await {
                Ok(()) => {
                    // Windows force-exits during install; on macOS/Linux we get
                    // here — kill the sidecar ourselves before restarting.
                    kill_daemon(&app);
                    app.restart();
                }
                Err(e) => log::warn!("update install failed: {e}"),
            }
        }
        Ok(None) => log::info!("clihub is up to date"),
        Err(e) => log::warn!("update check failed: {e}"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Official guidance: single-instance must be the FIRST plugin. On Windows/
    // Linux a clihub:// URL spawns a second process; the plugin's "deep-link"
    // feature re-fires on_open_url in this instance, so the callback only
    // needs to surface the window.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_window(app, None);
        }));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .manage(DaemonState::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            let (info, child) = spawn_daemon()?;
            app.state::<DaemonState>().0.lock().unwrap().replace(child);

            // Inject the daemon endpoint + bearer before any SPA JS executes.
            let script = format!(
                "window.__CLIHUB__ = {{ baseUrl: {}, token: {} }};",
                serde_json::to_string(&info.url)?,
                serde_json::to_string(&info.token)?,
            );
            WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::default())
                .title("clihub")
                .inner_size(1000.0, 700.0)
                .initialization_script(&script)
                .build()?;

            // clihub:// scheme. macOS only registers via Info.plist at bundle
            // time (deep links need the installed .app); Linux re-registers on
            // every launch (AppImage paths go stale), Windows only in dev.
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            app.deep_link().register_all()?;

            // Cold start via clihub://… — route once the window exists.
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for url in &urls {
                    route_deep_link(app.handle(), url);
                }
            }
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    route_deep_link(&handle, &url);
                }
            });

            // System tray: panel shortcuts + update check + real quit.
            let mut panels = SubmenuBuilder::new(app, "Panels");
            for (id, label) in PANELS {
                panels = panels.text(format!("panel:{id}"), label);
            }
            let panels = panels.build()?;
            let menu = MenuBuilder::new(app)
                .text("open", "Open clihub")
                .item(&panels)
                .separator()
                .text("update", "Check for updates…")
                .separator()
                .text("quit", "Quit clihub")
                .build()?;
            let icon = app
                .default_window_icon()
                .ok_or("default window icon missing")?
                .clone();
            TrayIconBuilder::with_id("clihub-tray")
                .icon(icon)
                .tooltip("clihub")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_window(app, None),
                    "update" =>
                    {
                        #[cfg(desktop)]
                        {
                            let handle = app.clone();
                            tauri::async_runtime::spawn(async move {
                                check_updates(handle).await;
                            });
                        }
                    }
                    // app.exit(0) carries code Some(0), which the ExitRequested
                    // guard below deliberately lets through.
                    "quit" => app.exit(0),
                    other => {
                        if let Some(p) = other.strip_prefix("panel:") {
                            show_window(app, Some(p));
                        }
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    // Linux never emits tray mouse events — the menu is the
                    // only path there; this is the macOS/Windows nicety.
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_window(tray.app_handle(), None);
                    }
                })
                .build(app)?;

            // Background update check — packaged builds only (a dev binary is
            // not an installed bundle, its install step can never succeed).
            #[cfg(all(desktop, not(debug_assertions)))]
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    check_updates(handle).await;
                });
            }

            Ok(())
        })
        // Hide-to-tray: the close button conceals the window, daemon stays up.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            // code: None = "last window gone" style exit requests — swallow
            // them so the tray keeps the app alive. Programmatic exits
            // (app.exit/restart, code Some) pass through.
            tauri::RunEvent::ExitRequested { code: None, api, .. } => {
                api.prevent_exit();
            }
            // The single exit point on every real quit path (tray Quit, Cmd+Q,
            // updater restart): with hide-to-tray, WindowEvent::Destroyed no
            // longer fires on close, so the daemon kill lives here.
            tauri::RunEvent::Exit => kill_daemon(app),
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => show_window(app, None),
            _ => {}
        });
}
