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

/// The full sidebar app window (tray "Open clihub", deep links, dock reopen).
const MAIN_LABEL: &str = "main";
/// The borderless menubar tab-panel, tray-toggled and hidden on blur.
const POPOVER_LABEL: &str = "popover";

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

/// Show the popover just under the menubar. `anchor` is the tray-icon click
/// position (physical px, in the virtual-desktop space spanning all monitors).
/// None falls back to the primary monitor's top-right.
fn show_popover(app: &AppHandle, anchor: Option<(f64, f64)>) {
    if let Some(window) = app.get_webview_window(POPOVER_LABEL) {
        // Multi-display: anchor to the monitor UNDER the click, not the primary
        // one — otherwise a click on a secondary screen pops up on the primary.
        let monitor = anchor
            .and_then(|(ax, ay)| {
                window
                    .available_monitors()
                    .ok()
                    .into_iter()
                    .flatten()
                    .find(|m| {
                        let p = m.position();
                        let s = m.size();
                        let (xi, yi) = (ax as i32, ay as i32);
                        xi >= p.x && xi < p.x + s.width as i32 && yi >= p.y && yi < p.y + s.height as i32
                    })
            })
            .or_else(|| window.primary_monitor().ok().flatten());

        if let Some(mon) = monitor {
            let mp = mon.position();
            let m = mon.size();
            let w = window
                .outer_size()
                .unwrap_or(tauri::PhysicalSize::new(440, 760));
            let scale = mon.scale_factor();
            let margin = (12.0 * scale) as i32;
            let min_x = mp.x + margin;
            let max_x = (mp.x + m.width as i32 - w.width as i32 - margin).max(min_x);
            let x = match anchor {
                // Center under the click, but keep the panel on THIS monitor.
                Some((ax, _)) => (ax as i32 - w.width as i32 / 2).clamp(min_x, max_x),
                None => max_x,
            };
            let y = mp.y + (28.0 * scale) as i32;
            let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
        }
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Tray click: toggle the popover (hide if visible, else show under the icon).
fn toggle_popover(app: &AppHandle, anchor: Option<(f64, f64)>) {
    if let Some(window) = app.get_webview_window(POPOVER_LABEL) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
            return;
        }
    }
    show_popover(app, anchor);
}

/// Show + focus the full main window (the sidebar app). It is hide-to-tray, so
/// it lives hidden between opens; this just surfaces it.
fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Any `clihub://…` deep link opens the full app window.
fn route_deep_link(app: &AppHandle, _url: &Url) {
    show_main(app);
}

/// Check the GitHub releases updater endpoint; install + restart if newer.
/// Errors are logged, never fatal — offline, no releases yet, or a dev binary
/// (whose install step cannot work) all land here.
#[cfg(desktop)]
/// Is any of our windows currently on screen? An auto-update must not restart
/// the app out from under a user who has the main window or popover open.
#[cfg(desktop)]
fn any_window_visible(app: &AppHandle) -> bool {
    [MAIN_LABEL, POPOVER_LABEL].iter().any(|label| {
        app.get_webview_window(label)
            .and_then(|w| w.is_visible().ok())
            .unwrap_or(false)
    })
}

/// Check the updater endpoint; install + restart if a newer build exists.
/// `auto` = an unattended check (launch / periodic): it silently defers the
/// install+restart while a window is open, so we never yank the user mid-task.
/// A manual "Check for updates…" passes `auto = false` to always proceed.
async fn check_updates(app: AppHandle, auto: bool) {
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
            if auto && any_window_visible(&app) {
                log::info!(
                    "update {} available — deferring install (a window is open)",
                    update.version
                );
                return;
            }
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
            show_main(app);
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
            // Full app window — the sidebar UI. Decorated + normal, but hidden on
            // start: it is hide-to-tray (open from the tray "Open clihub" item),
            // so the daemon stays warm without a daily window in your face.
            WebviewWindowBuilder::new(app, MAIN_LABEL, WebviewUrl::default())
                .title("clihub")
                .inner_size(1000.0, 700.0)
                .min_inner_size(720.0, 520.0)
                .center()
                .visible(false)
                .initialization_script(&script)
                .build()?;

            // Menubar popover: borderless, off-taskbar, always-on-top, hidden on
            // start. The tray icon toggles it; it hides on blur.
            WebviewWindowBuilder::new(app, POPOVER_LABEL, WebviewUrl::default())
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

            // Dev convenience: `tauri dev` has no installed bundle, so neither
            // the clihub:// deep link nor a Dock relaunch can reach show_main —
            // the app would sit invisibly in the tray. Reveal the main window on
            // debug launch so the UI is inspectable. Release stays hide-to-tray.
            #[cfg(debug_assertions)]
            if let Some(w) = app.get_webview_window(MAIN_LABEL) {
                let _ = w.show();
                let _ = w.set_focus();
            }

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
                    "open" => show_main(app),
                    "update" =>
                    {
                        #[cfg(desktop)]
                        {
                            let handle = app.clone();
                            tauri::async_runtime::spawn(async move {
                                check_updates(handle, false).await;
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
                                if let Some(window) = app.get_webview_window(POPOVER_LABEL) {
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
                        position,
                        ..
                    } = event
                    {
                        // Center the popover under the click (the menubar icon),
                        // on whichever monitor that click landed on.
                        toggle_popover(tray.app_handle(), Some((position.x, position.y)));
                    }
                })
                .build(app)?;

            // Auto-update — packaged builds only (a dev binary is not an
            // installed bundle, so its install step can never succeed). Checks
            // shortly after launch, then every 6h for long-lived sessions. Each
            // check defers the restart while a window is open (see check_updates).
            #[cfg(all(desktop, not(debug_assertions)))]
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    // Let the window + daemon settle before the first check.
                    std::thread::sleep(std::time::Duration::from_secs(8));
                    loop {
                        tauri::async_runtime::block_on(check_updates(handle.clone(), true));
                        std::thread::sleep(std::time::Duration::from_secs(6 * 60 * 60));
                    }
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
            // Only the popover hides on blur (click elsewhere). The main window
            // is a normal window — losing focus must NOT make it vanish.
            WindowEvent::Focused(false) if window.label() == POPOVER_LABEL => {
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
            tauri::RunEvent::Reopen { .. } => show_main(app),
            _ => {}
        });
}
