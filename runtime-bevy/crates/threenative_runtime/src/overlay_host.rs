use std::path::{Path, PathBuf};
#[cfg(feature = "native-webview")]
use std::sync::mpsc::{Receiver, Sender};
#[cfg(feature = "native-webview")]
use std::{
    fs,
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
};

use crate::overlay::{
    NativeOverlayBridge, NativeOverlayInputPolicy, OverlayDiagnostic, native_overlay_input_policy,
    report_unsupported_desktop_webview, sorted_overlay_mount_order,
};
use bevy::prelude::*;
#[cfg(feature = "native-webview")]
use bevy::winit::WinitWindows;
#[cfg(feature = "native-webview")]
use gtk::prelude::*;
#[cfg(feature = "native-webview")]
use serde::Deserialize;
#[cfg(feature = "native-webview")]
use serde_json::Value;
use threenative_loader::{OverlayIr, OverlaysIr};

pub fn overlay_host_diagnostics(
    overlays: Option<&OverlaysIr>,
    desktop_webview_enabled: bool,
) -> Vec<OverlayDiagnostic> {
    if desktop_webview_enabled {
        Vec::new()
    } else {
        report_unsupported_desktop_webview(overlays)
    }
}

pub fn input_capture_policy(input: &str) -> NativeOverlayInputPolicy {
    native_overlay_input_policy(input)
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeOverlayMount {
    pub entry_path: PathBuf,
    pub id: String,
    pub input: NativeOverlayInputPolicy,
    pub transparent: bool,
    pub z_index: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeOverlayHostPlan {
    pub backend: &'static str,
    pub mounts: Vec<NativeOverlayMount>,
}

#[derive(Clone, Debug, PartialEq, Eq, Resource)]
pub struct NativeOverlayHostPlanResource(pub NativeOverlayHostPlan);

#[cfg(feature = "native-webview")]
pub struct NativeOverlayWebviewHost {
    #[cfg(all(
        feature = "native-webview",
        any(
            target_os = "linux",
            target_os = "dragonfly",
            target_os = "freebsd",
            target_os = "netbsd",
            target_os = "openbsd"
        )
    ))]
    _gtk_windows: Vec<gtk::Window>,
    ipc_rx: Receiver<String>,
    mounts: Vec<NativeOverlayMount>,
    _servers: Vec<NativeOverlayStaticServer>,
    webviews: Vec<wry::WebView>,
}

#[cfg(feature = "native-webview")]
struct NativeOverlayStaticServer {
    address: SocketAddr,
    handle: Option<JoinHandle<()>>,
    stop: Arc<AtomicBool>,
}

#[cfg(feature = "native-webview")]
impl Drop for NativeOverlayStaticServer {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        let _ = TcpStream::connect(self.address);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

#[derive(Debug, Resource)]
pub struct NativeOverlayBridgeResource {
    pub bridge: NativeOverlayBridge,
    pub overlays: OverlaysIr,
}

impl NativeOverlayBridgeResource {
    pub fn new(overlays: OverlaysIr) -> Self {
        Self {
            bridge: NativeOverlayBridge::new(),
            overlays,
        }
    }
}

pub fn create_native_overlay_host_plan(
    overlays: Option<&OverlaysIr>,
    bundle_path: &Path,
) -> Result<Option<NativeOverlayHostPlan>, Vec<OverlayDiagnostic>> {
    let Some(overlays) = overlays else {
        return Ok(None);
    };
    let desktop_overlays: Vec<&OverlayIr> = sorted_overlay_mount_order(overlays)
        .into_iter()
        .filter(|overlay| {
            overlay
                .target_profiles
                .iter()
                .any(|profile| profile == "desktop")
        })
        .collect();
    if desktop_overlays.is_empty() {
        return Ok(None);
    }
    if !native_webview_backend_available() {
        return Err(report_unsupported_desktop_webview(Some(overlays)));
    }
    Ok(Some(NativeOverlayHostPlan {
        backend: native_webview_backend_name(),
        mounts: desktop_overlays
            .into_iter()
            .map(|overlay| NativeOverlayMount {
                entry_path: bundle_path.join(&overlay.entry),
                id: overlay.id.clone(),
                input: native_overlay_input_policy(&overlay.input),
                transparent: overlay.transparent,
                z_index: overlay.z_index,
            })
            .collect(),
    }))
}

pub fn native_webview_backend_available() -> bool {
    cfg!(feature = "native-webview")
}

pub fn native_webview_backend_name() -> &'static str {
    #[cfg(feature = "native-webview")]
    {
        wry_backend_name()
    }
    #[cfg(not(feature = "native-webview"))]
    {
        "unsupported"
    }
}

#[cfg(feature = "native-webview")]
pub fn initialize_native_webview_backend() -> Result<(), String> {
    initialize_gtk_backend()
}

#[cfg(all(
    feature = "native-webview",
    any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    )
))]
fn initialize_gtk_backend() -> Result<(), String> {
    if std::env::var_os("DISPLAY").is_some() {
        // WRY's X11 child-window path assumes GTK has selected an X11 display.
        unsafe {
            std::env::set_var("GDK_BACKEND", "x11");
        }
    }
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        // WebKitGTK can fail to allocate GBM buffers on some NVIDIA/Xwayland
        // setups, which leaves the child webview black even though it mounted.
        unsafe {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }
    gtk::init()
        .map_err(|error| format!("failed to initialize GTK for native webview overlays: {error}"))
}

#[cfg(all(
    feature = "native-webview",
    not(any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    ))
))]
fn initialize_gtk_backend() -> Result<(), String> {
    Ok(())
}

#[cfg(feature = "native-webview")]
fn wry_backend_name() -> &'static str {
    let _type_anchor = std::any::type_name::<wry::WebViewBuilder>();
    "wry"
}

#[cfg(feature = "native-webview")]
pub fn create_wry_webview_builder(mount: &NativeOverlayMount) -> wry::WebViewBuilder<'static> {
    create_wry_webview_builder_with_ipc(mount, None, native_overlay_file_url(&mount.entry_path))
}

#[cfg(feature = "native-webview")]
fn create_wry_webview_builder_with_ipc(
    mount: &NativeOverlayMount,
    ipc_tx: Option<Sender<String>>,
    url: String,
) -> wry::WebViewBuilder<'static> {
    let mut builder = wry::WebViewBuilder::new()
        .with_devtools(false)
        .with_initialization_script(native_overlay_initialization_script(&mount.id))
        .with_transparent(mount.transparent)
        .with_url(url);
    if let Some(ipc_tx) = ipc_tx {
        builder = builder.with_ipc_handler(move |request| {
            let _ = ipc_tx.send(request.body().clone());
        });
    }
    builder
}

#[cfg(feature = "native-webview")]
fn native_overlay_initialization_script(overlay_id: &str) -> String {
    format!(
        r#"
window.threenativeOverlayBridge = {{
  send(type, payload) {{
    window.ipc?.postMessage(JSON.stringify({{
      overlayId: {overlay_id},
      type,
      payload,
    }}));
  }},
}};
window.addEventListener('contextmenu', (event) => {{
  event.preventDefault();
}}, {{ capture: true }});
document.documentElement.style.background = 'transparent';
window.addEventListener('DOMContentLoaded', () => {{
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  const style = document.createElement('style');
  style.textContent = `
    html, body, #root {{
      background: transparent !important;
      min-height: 207px !important;
      height: 207px !important;
      overflow: hidden !important;
      width: 242px !important;
    }}
    .inventory {{
      margin: 0 !important;
      width: 242px !important;
    }}
  `;
  document.head.append(style);
}});
"#,
        overlay_id =
            serde_json::to_string(overlay_id).unwrap_or_else(|_| "\"inventory\"".to_owned()),
    )
}

#[cfg(feature = "native-webview")]
pub fn create_wry_webview_builder_without_ipc(
    mount: &NativeOverlayMount,
) -> wry::WebViewBuilder<'static> {
    wry::WebViewBuilder::new()
        .with_devtools(false)
        .with_initialization_script(native_overlay_initialization_script(&mount.id))
        .with_transparent(mount.transparent)
        .with_url(native_overlay_file_url(&mount.entry_path))
}

#[cfg(feature = "native-webview")]
pub fn mount_native_overlay_webviews(world: &mut World) {
    if world
        .get_non_send_resource::<NativeOverlayWebviewHost>()
        .is_some()
    {
        return;
    }
    let Some(plan) = world
        .get_resource::<NativeOverlayHostPlanResource>()
        .cloned()
    else {
        return;
    };
    let mut windows =
        world.query_filtered::<(Entity, &Window), With<bevy::window::PrimaryWindow>>();
    let Ok((window_entity, window)) = windows.get_single(world) else {
        return;
    };
    let window_width = window.resolution.width();
    let window_height = window.resolution.height();
    let Some(winit_windows) = world.get_non_send_resource::<WinitWindows>() else {
        return;
    };
    let Some(winit_window) = winit_windows.get_window(window_entity) else {
        return;
    };

    let (ipc_tx, ipc_rx) = std::sync::mpsc::channel();
    #[cfg(all(
        feature = "native-webview",
        any(
            target_os = "linux",
            target_os = "dragonfly",
            target_os = "freebsd",
            target_os = "netbsd",
            target_os = "openbsd"
        )
    ))]
    let mut gtk_windows = Vec::new();
    let mut servers = Vec::new();
    let mut webviews = Vec::new();
    for mount in &plan.0.mounts {
        let Ok((server, url)) = start_native_overlay_static_server(mount) else {
            warn!(
                "TN_OVERLAY_NATIVE_SERVER_FAILED: failed to serve native overlay '{}'",
                mount.id
            );
            continue;
        };
        let bounds = native_overlay_bounds(mount, window_width, window_height);
        match build_native_overlay_webview(
            mount,
            Some(ipc_tx.clone()),
            url,
            &**winit_window,
            bounds,
        ) {
            Ok((webview, gtk_window)) => {
                if mount.transparent {
                    if let Err(error) = webview.set_background_color((0, 0, 0, 0)) {
                        warn!(
                            "TN_OVERLAY_NATIVE_BACKGROUND_FAILED: failed to make native overlay '{}' transparent: {}",
                            mount.id, error
                        );
                    }
                }
                if let Err(error) =
                    set_wry_webview_bounds(&webview, native_overlay_webview_bounds(bounds))
                {
                    warn!(
                        "TN_OVERLAY_NATIVE_RESIZE_FAILED: failed to size native overlay '{}': {}",
                        mount.id, error
                    );
                }
                #[cfg(all(
                    feature = "native-webview",
                    any(
                        target_os = "linux",
                        target_os = "dragonfly",
                        target_os = "freebsd",
                        target_os = "netbsd",
                        target_os = "openbsd"
                    )
                ))]
                if let Some(gtk_window) = gtk_window {
                    gtk_windows.push(gtk_window);
                }
                webviews.push(webview);
                servers.push(server);
                info!(
                    "mounted native overlay '{}' using {}",
                    mount.id, plan.0.backend
                );
            }
            Err(error) => {
                warn!(
                    "TN_OVERLAY_NATIVE_MOUNT_FAILED: failed to mount native overlay '{}': {}",
                    mount.id, error
                );
            }
        }
    }
    if !webviews.is_empty() {
        world.insert_non_send_resource(NativeOverlayWebviewHost {
            #[cfg(all(
                feature = "native-webview",
                any(
                    target_os = "linux",
                    target_os = "dragonfly",
                    target_os = "freebsd",
                    target_os = "netbsd",
                    target_os = "openbsd"
                )
            ))]
            _gtk_windows: gtk_windows,
            ipc_rx,
            mounts: plan.0.mounts.clone(),
            _servers: servers,
            webviews,
        });
    }
}

#[cfg(all(
    feature = "native-webview",
    any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    )
))]
fn build_native_overlay_webview(
    mount: &NativeOverlayMount,
    ipc_tx: Option<Sender<String>>,
    url: String,
    parent: &winit::window::Window,
    bounds: NativeOverlayBounds,
) -> Result<(wry::WebView, Option<gtk::Window>), String> {
    use wry::{
        Rect, WebViewBuilderExtUnix,
        dpi::{LogicalPosition, LogicalSize},
    };

    let gtk_window = gtk::Window::new(gtk::WindowType::Popup);
    gtk_window.set_decorated(false);
    gtk_window.set_resizable(false);
    gtk_window.set_accept_focus(false);
    gtk_window.set_app_paintable(true);
    gtk_window.set_keep_above(true);
    if let Some(screen) = gtk::prelude::GtkWindowExt::screen(&gtk_window) {
        if let Some(visual) = screen.rgba_visual() {
            gtk_window.set_visual(Some(&visual));
        }
    }
    gtk_window.set_size_request(bounds.width as i32, bounds.height as i32);
    gtk_window.resize(bounds.width as i32, bounds.height as i32);
    position_native_overlay_window(&gtk_window, parent, bounds);

    let fixed = gtk::Fixed::new();
    fixed.set_size_request(bounds.width as i32, bounds.height as i32);
    gtk_window.add(&fixed);
    gtk_window.show_all();
    gtk_window.present();
    position_native_overlay_window(&gtk_window, parent, bounds);

    let webview = create_wry_webview_builder_with_ipc(mount, ipc_tx, url)
        .with_bounds(Rect {
            position: LogicalPosition::new(0, 0).into(),
            size: LogicalSize::new(bounds.width, bounds.height).into(),
        })
        .build_gtk(&fixed)
        .map_err(|error| error.to_string())?;
    Ok((webview, Some(gtk_window)))
}

#[cfg(all(
    feature = "native-webview",
    not(any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    ))
))]
fn build_native_overlay_webview(
    mount: &NativeOverlayMount,
    ipc_tx: Option<Sender<String>>,
    url: String,
    parent: &winit::window::Window,
    bounds: NativeOverlayBounds,
) -> Result<(wry::WebView, Option<()>), String> {
    let webview = create_wry_webview_builder_with_ipc(mount, ipc_tx, url)
        .build_as_child(parent)
        .map_err(|error| error.to_string())?;
    set_wry_webview_bounds(&webview, bounds).map_err(|error| error.to_string())?;
    Ok((webview, None))
}

#[cfg(all(
    feature = "native-webview",
    any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    )
))]
fn position_native_overlay_window(
    gtk_window: &gtk::Window,
    parent: &winit::window::Window,
    bounds: NativeOverlayBounds,
) {
    let Ok(parent_position) = parent.outer_position() else {
        return;
    };
    gtk_window.move_(
        parent_position.x + bounds.x as i32,
        parent_position.y + bounds.y as i32,
    );
}

#[cfg(feature = "native-webview")]
fn start_native_overlay_static_server(
    mount: &NativeOverlayMount,
) -> std::io::Result<(NativeOverlayStaticServer, String)> {
    let root = mount
        .entry_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| mount.entry_path.clone());
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    listener.set_nonblocking(true)?;
    let address = listener.local_addr()?;
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);
    let server_root = root.clone();
    let handle = thread::spawn(move || {
        while !thread_stop.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok((stream, _)) => serve_native_overlay_request(stream, &server_root),
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(std::time::Duration::from_millis(8));
                }
                Err(_) => break,
            }
        }
    });
    let url = format!("http://{address}/index.html");
    info!(
        "serving native overlay '{}' from '{}' at {}",
        mount.id,
        root.display(),
        url
    );
    Ok((
        NativeOverlayStaticServer {
            address,
            handle: Some(handle),
            stop,
        },
        url,
    ))
}

#[cfg(feature = "native-webview")]
fn serve_native_overlay_request(mut stream: TcpStream, root: &Path) {
    let mut buffer = [0_u8; 4096];
    let Ok(read) = stream.read(&mut buffer) else {
        return;
    };
    let request = String::from_utf8_lossy(&buffer[..read]);
    let Some(path) = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
    else {
        let _ = write_native_overlay_response(&mut stream, 400, "text/plain", b"Bad Request");
        return;
    };
    let path = path.split('?').next().unwrap_or("/");
    let path = if path == "/" {
        "index.html"
    } else {
        path.trim_start_matches('/')
    };
    if path.contains("..") || path.contains('\\') {
        warn!(
            "TN_OVERLAY_NATIVE_REQUEST_FORBIDDEN: rejected native overlay request for '{}'",
            path
        );
        let _ = write_native_overlay_response(&mut stream, 403, "text/plain", b"Forbidden");
        return;
    }
    let file_path = root.join(path);
    match fs::read(&file_path) {
        Ok(body) => {
            info!(
                "served native overlay asset '{}' ({} bytes)",
                file_path.display(),
                body.len()
            );
            let _ = write_native_overlay_response(
                &mut stream,
                200,
                native_overlay_content_type(&file_path),
                &body,
            );
        }
        Err(_) => {
            warn!(
                "TN_OVERLAY_NATIVE_ASSET_MISSING: native overlay asset '{}' was not found",
                file_path.display()
            );
            let _ = write_native_overlay_response(&mut stream, 404, "text/plain", b"Not Found");
        }
    }
}

#[cfg(feature = "native-webview")]
fn write_native_overlay_response(
    stream: &mut TcpStream,
    status: u16,
    content_type: &str,
    body: &[u8],
) -> std::io::Result<()> {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        _ => "Error",
    };
    write!(
        stream,
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
        body.len()
    )?;
    stream.write_all(body)
}

#[cfg(feature = "native-webview")]
fn native_overlay_content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|extension| extension.to_str()) {
        Some("css") => "text/css; charset=utf-8",
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("svg") => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

#[cfg(feature = "native-webview")]
pub fn resize_native_overlay_webviews(
    host: Option<NonSend<NativeOverlayWebviewHost>>,
    windows: Query<&Window, (With<bevy::window::PrimaryWindow>, Changed<Window>)>,
) {
    let Some(host) = host else {
        return;
    };
    let Ok(window) = windows.get_single() else {
        return;
    };
    for (index, webview) in host.webviews.iter().enumerate() {
        let Some(mount) = host.mounts.get(index) else {
            continue;
        };
        if let Err(error) = resize_wry_webview(
            webview,
            mount,
            window.resolution.width(),
            window.resolution.height(),
        ) {
            let id = mount.id.as_str();
            warn!(
                "TN_OVERLAY_NATIVE_RESIZE_FAILED: failed to resize native overlay '{}': {}",
                id, error
            );
        }
    }
}

#[cfg(all(
    feature = "native-webview",
    any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    )
))]
pub fn pump_native_overlay_webview_events(
    host: Option<NonSend<NativeOverlayWebviewHost>>,
    mut bridge: Option<ResMut<NativeOverlayBridgeResource>>,
) {
    drain_native_overlay_ipc(host.as_deref(), bridge.as_deref_mut());
    while gtk::events_pending() {
        gtk::main_iteration_do(false);
    }
}

#[cfg(all(
    feature = "native-webview",
    not(any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    ))
))]
pub fn pump_native_overlay_webview_events(
    host: Option<NonSend<NativeOverlayWebviewHost>>,
    mut bridge: Option<ResMut<NativeOverlayBridgeResource>>,
) {
    drain_native_overlay_ipc(host.as_deref(), bridge.as_deref_mut());
}

#[cfg(feature = "native-webview")]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeOverlayIpcEnvelope {
    overlay_id: String,
    #[serde(rename = "type")]
    message_type: String,
    payload: Value,
}

#[cfg(feature = "native-webview")]
fn drain_native_overlay_ipc(
    host: Option<&NativeOverlayWebviewHost>,
    bridge: Option<&mut NativeOverlayBridgeResource>,
) {
    let (Some(host), Some(bridge)) = (host, bridge) else {
        return;
    };
    while let Ok(message) = host.ipc_rx.try_recv() {
        let Ok(envelope) = serde_json::from_str::<NativeOverlayIpcEnvelope>(&message) else {
            warn!("TN_OVERLAY_NATIVE_IPC_REJECTED: native overlay sent malformed IPC payload");
            continue;
        };
        if bridge.bridge.receive_overlay_message(
            &bridge.overlays,
            &envelope.overlay_id,
            &envelope.message_type,
            envelope.payload,
        ) {
            info!(
                "native overlay '{}' sent '{}'",
                envelope.overlay_id, envelope.message_type
            );
        } else if let Some(diagnostic) = bridge.bridge.diagnostics().last() {
            warn!("{}: {}", diagnostic.code, diagnostic.message);
        }
    }
}

#[cfg(feature = "native-webview")]
fn resize_wry_webview(
    webview: &wry::WebView,
    mount: &NativeOverlayMount,
    width: f32,
    height: f32,
) -> wry::Result<()> {
    set_wry_webview_bounds(
        webview,
        native_overlay_webview_bounds(native_overlay_bounds(mount, width, height)),
    )
}

#[cfg(feature = "native-webview")]
fn set_wry_webview_bounds(webview: &wry::WebView, bounds: NativeOverlayBounds) -> wry::Result<()> {
    use wry::{
        Rect,
        dpi::{LogicalPosition, LogicalSize},
    };

    webview.set_bounds(Rect {
        position: LogicalPosition::new(bounds.x, bounds.y).into(),
        size: LogicalSize::new(bounds.width, bounds.height).into(),
    })
}

#[cfg(all(
    feature = "native-webview",
    any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    )
))]
fn native_overlay_webview_bounds(bounds: NativeOverlayBounds) -> NativeOverlayBounds {
    NativeOverlayBounds {
        height: bounds.height,
        width: bounds.width,
        x: 0,
        y: 0,
    }
}

#[cfg(all(
    feature = "native-webview",
    not(any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    ))
))]
fn native_overlay_webview_bounds(bounds: NativeOverlayBounds) -> NativeOverlayBounds {
    bounds
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NativeOverlayBounds {
    pub height: u32,
    pub width: u32,
    pub x: u32,
    pub y: u32,
}

pub fn native_overlay_bounds(
    mount: &NativeOverlayMount,
    window_width: f32,
    window_height: f32,
) -> NativeOverlayBounds {
    let full_width = window_width.max(1.0) as u32;
    let full_height = window_height.max(1.0) as u32;
    if mount.input.modal {
        return NativeOverlayBounds {
            height: full_height,
            width: full_width,
            x: 0,
            y: 0,
        };
    }

    let width = full_width.min(242);
    let height = full_height.min(207);
    NativeOverlayBounds {
        height,
        width,
        x: full_width.saturating_sub(width + 24),
        y: 24.min(full_height.saturating_sub(height)),
    }
}

pub fn native_overlay_file_url(path: &Path) -> String {
    let raw = path.to_string_lossy().replace('\\', "/");
    if raw.starts_with('/') {
        format!("file://{raw}")
    } else {
        format!("file:///{raw}")
    }
}
