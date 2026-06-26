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

use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::menu::{MenuBuilder, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt;

const WINDOW_LABEL: &str = "main";

/// Panel ids + tray labels. Single source of truth for tray shortcuts and
/// Tray "Launch" submenu clients: (provider id, display name, optional GUI app
/// id). Clients with a desktop app get an "App" item (proxy-launched); all get
/// a "Terminal" item. Mirrors @clihub/core's launch registry — the actual
/// launch runs through the daemon via `window.__clihubLaunch` (no logic fork).
// (cli provider id, display name, gui app id). cli=None → no Terminal item
// (Chromium browsers are GUI-only); gui=None → no App item (CLI-only clients).
const LAUNCH_CLIENTS: [(Option<&str>, &str, Option<&str>); 11] = [
    (Some("claude-code"), "Claude", Some("claude-desktop")),
    (Some("codex"), "Codex", Some("codex-desktop")),
    (Some("kiro-cli"), "Kiro", Some("kiro-desktop")),
    (Some("cursor"), "Cursor", Some("cursor-desktop")),
    (Some("gemini-cli"), "Gemini", None),
    (Some("qwen-code"), "Qwen", None),
    (Some("goose"), "Goose", None),
    (Some("opencode"), "OpenCode", None),
    (None, "Chrome", Some("chrome")),
    (None, "Edge", Some("edge")),
    (None, "Brave", Some("brave")),
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

/// How to launch the daemon, resolved at RUNTIME.
enum DaemonCmd {
    /// Packaged: a `bun --compile` standalone binary bundled as a Tauri
    /// resource. Self-contained (embeds the bun runtime) — exec it directly,
    /// so a user machine needs neither bun nor the repo source.
    Sidecar(PathBuf),
    /// Dev: no bundled resource, run the daemon's TypeScript source under bun.
    BunSource(PathBuf),
}

/// Resolve how to launch the daemon.
///
/// `env!("CARGO_MANIFEST_DIR")` is a COMPILE-TIME path pointing at the build
/// machine, useless on a user's machine — so a packaged build resolves its own
/// resource dir for the compiled sidecar. `tauri dev` has no bundled resource,
/// so it falls back to the repo source under bun.
fn resolve_daemon(app: &AppHandle) -> DaemonCmd {
    let bin = if cfg!(windows) { "clihub-daemon.exe" } else { "clihub-daemon" };
    if let Ok(res) = app.path().resolve(format!("binaries/{bin}"), BaseDirectory::Resource) {
        if res.exists() {
            return DaemonCmd::Sidecar(res);
        }
    }
    DaemonCmd::BunSource(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages/daemon/src/main.ts"),
    )
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
fn spawn_daemon(app: &AppHandle) -> Result<(DaemonInfo, Child), Box<dyn std::error::Error>> {
    // LaunchServices hands GUI apps a minimal PATH (/usr/bin:/bin:...), so the
    // daemon's provider.detect() would miss CLIs installed under ~/.local/bin
    // etc. and report everything as not installed. Prepend the usual homes.
    let home = std::env::var("HOME").unwrap_or_default();
    let base = std::env::var("PATH").unwrap_or_else(|_| "/usr/bin:/bin".into());
    let path = format!("{home}/.local/bin:{home}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:{base}");

    let mut command = match resolve_daemon(app) {
        // Standalone binary — exec directly, no bun needed. Tauri resource copy
        // may drop the exec bit; restore it before spawn.
        DaemonCmd::Sidecar(bin) => {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&bin, fs::Permissions::from_mode(0o755));
            }
            Command::new(bin)
        }
        // Dev: bun runs the TypeScript source.
        DaemonCmd::BunSource(src) => {
            let mut c = Command::new(bun_path());
            c.arg("run").arg(src);
            c
        }
    };

    let mut child = command
        .env("PATH", path)
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

/// Show the popover at the top-right of the primary monitor (under the menubar).
fn show_popover(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        if let Ok(Some(monitor)) = window.primary_monitor() {
            let m = monitor.size();
            let w = window
                .outer_size()
                .unwrap_or(tauri::PhysicalSize::new(440, 760));
            let x = (m.width as i32 - w.width as i32 - 12).max(0);
            let y = (28.0 * monitor.scale_factor()) as i32;
            let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
        }
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Tray click: toggle the popover (hide if visible, else show near the tray).
fn toggle_popover(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
            return;
        }
    }
    show_popover(app);
}

/// Any `clihub://…` deep link just surfaces the popover — the menubar panel
/// shows every section at once, so there are no per-panel routes to honor.
fn route_deep_link(app: &AppHandle, _url: &Url) {
    show_popover(app);
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
            show_popover(app);
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

            let (info, child) = spawn_daemon(app.handle())?;
            app.state::<DaemonState>().0.lock().unwrap().replace(child);

            // Inject the daemon endpoint + bearer before any SPA JS executes.
            let script = format!(
                "window.__CLIHUB__ = {{ baseUrl: {}, token: {} }};",
                serde_json::to_string(&info.url)?,
                serde_json::to_string(&info.token)?,
            );
            // Menubar popover: borderless, off-taskbar, always-on-top, hidden on
            // start. The tray icon toggles it; it hides on blur. No daily window.
            WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::default())
                .title("clihub")
                .inner_size(440.0, 760.0)
                .decorations(false)
                .resizable(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .visible(false)
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

            // System tray: open popover + launch shortcuts + update + quit.
            // "Launch" submenu: one-click open each client's desktop app
            // (proxy) and/or CLI in a terminal — the CodexBar-style launcher,
            // mirrored from the in-window dropdown.
            let mut launch = SubmenuBuilder::new(app, "Launch");
            for (prov, name, gui) in LAUNCH_CLIENTS {
                let mut sub = SubmenuBuilder::new(app, name);
                if let Some(g) = gui {
                    sub = sub.text(format!("launch:gui:{g}"), "App");
                }
                if let Some(c) = prov {
                    sub = sub.text(format!("launch:cli:{c}"), "Terminal");
                }
                launch = launch.item(&sub.build()?);
            }
            let launch = launch.build()?;

            let menu = MenuBuilder::new(app)
                .text("open", "Open clihub")
                .item(&launch)
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
                    "open" => show_popover(app),
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
                        if let Some(rest) = other.strip_prefix("launch:") {
                            // rest = "gui:<appId>" | "cli:<provId>" — fire the
                            // SAME daemon launch the dropdown uses, via the
                            // WebView's __clihubLaunch (kept alive while hidden).
                            if let Some((kind, id)) = rest.split_once(':') {
                                if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
                                    let js = format!(
                                        "window.__clihubLaunch && window.__clihubLaunch('{kind}','{id}')"
                                    );
                                    let _ = window.eval(js.as_str());
                                }
                            }
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
                        toggle_popover(tray.app_handle());
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
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            // Menubar popover: hide when it loses focus (click elsewhere).
            WindowEvent::Focused(false) => {
                let _ = window.hide();
            }
            _ => {}
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
            tauri::RunEvent::Reopen { .. } => show_popover(app),
            _ => {}
        });
}
