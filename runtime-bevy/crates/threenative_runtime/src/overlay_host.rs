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

#[derive(Clone, Debug, PartialEq)]
pub struct NativeOverlayMount {
    pub entry_path: PathBuf,
    pub id: String,
    pub input: NativeOverlayInputPolicy,
    pub layout: Option<threenative_loader::OverlayLayoutIr>,
    pub transparent: bool,
    pub z_index: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeOverlayHostPlan {
    pub backend: &'static str,
    pub mounts: Vec<NativeOverlayMount>,
}

#[derive(Clone, Debug, PartialEq, Resource)]
pub struct NativeOverlayHostPlanResource(pub NativeOverlayHostPlan);

#[cfg(feature = "native-webview")]
pub struct NativeOverlayWebviewHost {
    #[cfg(any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    ))]
    gtk_windows: Vec<gtk::Window>,
    #[cfg(any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    ))]
    gtk_window_visible: Vec<std::cell::Cell<bool>>,
    input_regions: Vec<Option<Vec<NativeOverlayBounds>>>,
    #[cfg(any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    ))]
    synchronized_bounds: Vec<std::cell::Cell<Option<NativeOverlayBounds>>>,
    #[cfg(any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    ))]
    synchronized_screen_positions: Vec<std::cell::Cell<Option<(i32, i32)>>>,
    ipc_rx: Receiver<String>,
    mounts: Vec<NativeOverlayMount>,
    _servers: Vec<NativeOverlayStaticServer>,
    webviews: Vec<wry::WebView>,
    delivered_sequence: std::cell::Cell<u64>,
}

#[cfg(feature = "native-webview")]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NativeWebviewAttachment {
    ChildWindow,
    SynchronizedOverlayWindow,
}

#[cfg(feature = "native-webview")]
pub const fn native_webview_attachment() -> NativeWebviewAttachment {
    #[cfg(any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    ))]
    {
        NativeWebviewAttachment::SynchronizedOverlayWindow
    }
    #[cfg(not(any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    )))]
    {
        NativeWebviewAttachment::ChildWindow
    }
}

pub const fn native_overlay_screen_position(
    parent_x: i32,
    parent_y: i32,
    overlay_x: u32,
    overlay_y: u32,
) -> (i32, i32) {
    (parent_x + overlay_x as i32, parent_y + overlay_y as i32)
}

pub const fn native_overlay_host_clear_color(transparent: bool) -> Option<[f64; 4]> {
    if transparent {
        Some([0.0, 0.0, 0.0, 0.0])
    } else {
        None
    }
}

pub fn native_overlay_input_rectangles(
    input: NativeOverlayInputPolicy,
    bounds: NativeOverlayBounds,
    input_regions: Option<&[NativeOverlayBounds]>,
) -> Vec<NativeOverlayBounds> {
    let full_bounds = NativeOverlayBounds {
        height: bounds.height,
        width: bounds.width,
        x: 0,
        y: 0,
    };
    if input.modal {
        return vec![full_bounds];
    }
    if !input.captures_pointer {
        return Vec::new();
    }
    let Some(input_regions) = input_regions else {
        return Vec::new();
    };
    input_regions
        .iter()
        .filter_map(|input_region| {
            let x = input_region.x.min(bounds.width);
            let y = input_region.y.min(bounds.height);
            let width = input_region.width.min(bounds.width.saturating_sub(x));
            let height = input_region.height.min(bounds.height.saturating_sub(y));
            (width > 0 && height > 0).then_some(NativeOverlayBounds {
                height,
                width,
                x,
                y,
            })
        })
        .collect()
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
                layout: overlay.layout.clone(),
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
pub fn native_overlay_initialization_script(overlay_id: &str) -> String {
    format!(
        r#"
window.threenativeOverlayBridge = {{
  _listeners: new Set(),
  _snapshots: new Map(),
  send(type, payload) {{
    window.ipc?.postMessage(JSON.stringify({{
      overlayId: {overlay_id},
      type,
      payload,
    }}));
  }},
  subscribe(listener) {{
    this._listeners.add(listener);
    for (const snapshot of this._snapshots.values()) {{
      listener(snapshot.type, snapshot.payload, {{ sequence: snapshot.sequence }});
    }}
    return () => this._listeners.delete(listener);
  }},
  snapshot(type) {{
    if (type !== undefined) return this._snapshots.get(type);
    return Array.from(this._snapshots.values()).at(-1);
  }},
}};
window.__threenativeDispatchOverlaySnapshot = (type, payload, sequence) => {{
  window.threenativeOverlayBridge._snapshots.set(type, {{ payload, sequence, type }});
  for (const listener of window.threenativeOverlayBridge._listeners) listener(type, payload, {{ sequence }});
}};
window.addEventListener('contextmenu', (event) => {{
  event.preventDefault();
}}, {{ capture: true }});
document.documentElement.style.background = 'transparent';
window.addEventListener('DOMContentLoaded', () => {{
  window.dispatchEvent(new Event('threenative:bridge-ready'));
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  const publishInputRegions = () => {{
    const regions = Array.from(document.querySelectorAll('[data-threenative-interactive]'))
      .filter((element) => {{
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }})
      .map((element) => {{
        const rect = element.getBoundingClientRect();
        return {{ x: rect.x, y: rect.y, width: rect.width, height: rect.height }};
      }})
      .filter((region) => region.width > 0 && region.height > 0);
    window.ipc?.postMessage(JSON.stringify({{
      overlayId: {overlay_id},
      type: 'overlay:set-input-regions',
      payload: {{ regions }},
    }}));
  }};
  new ResizeObserver(publishInputRegions).observe(document.documentElement);
  new MutationObserver(() => requestAnimationFrame(publishInputRegions)).observe(document.body, {{
    attributes: true,
    childList: true,
    subtree: true,
  }});
  window.addEventListener('resize', publishInputRegions);
  requestAnimationFrame(publishInputRegions);
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
    #[cfg(any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
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
                #[cfg(any(
                    target_os = "linux",
                    target_os = "dragonfly",
                    target_os = "freebsd",
                    target_os = "netbsd",
                    target_os = "openbsd"
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
            #[cfg(any(
                target_os = "linux",
                target_os = "dragonfly",
                target_os = "freebsd",
                target_os = "netbsd",
                target_os = "openbsd"
            ))]
            gtk_windows,
            #[cfg(any(
                target_os = "linux",
                target_os = "dragonfly",
                target_os = "freebsd",
                target_os = "netbsd",
                target_os = "openbsd"
            ))]
            gtk_window_visible: (0..webviews.len())
                .map(|_| std::cell::Cell::new(true))
                .collect(),
            input_regions: vec![None; webviews.len()],
            #[cfg(any(
                target_os = "linux",
                target_os = "dragonfly",
                target_os = "freebsd",
                target_os = "netbsd",
                target_os = "openbsd"
            ))]
            synchronized_bounds: (0..webviews.len())
                .map(|_| std::cell::Cell::new(None))
                .collect(),
            #[cfg(any(
                target_os = "linux",
                target_os = "dragonfly",
                target_os = "freebsd",
                target_os = "netbsd",
                target_os = "openbsd"
            ))]
            synchronized_screen_positions: (0..webviews.len())
                .map(|_| std::cell::Cell::new(None))
                .collect(),
            ipc_rx,
            mounts: plan.0.mounts.clone(),
            _servers: servers,
            webviews,
            delivered_sequence: std::cell::Cell::new(0),
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

    let gtk_window = gtk::Window::new(gtk::WindowType::Toplevel);
    gtk_window.set_decorated(false);
    gtk_window.set_resizable(true);
    gtk_window.set_accept_focus(false);
    gtk_window.set_focus_on_map(false);
    gtk_window.set_app_paintable(true);
    gtk_window.set_keep_above(false);
    gtk_window.set_skip_pager_hint(true);
    gtk_window.set_skip_taskbar_hint(true);
    gtk_window.set_type_hint(gtk::gdk::WindowTypeHint::Utility);
    if let Some(screen) = gtk::prelude::GtkWindowExt::screen(&gtk_window) {
        if let Some(visual) = screen.rgba_visual() {
            gtk_window.set_visual(Some(&visual));
        }
    }
    if let Some([red, green, blue, alpha]) = native_overlay_host_clear_color(mount.transparent) {
        gtk_window.connect_draw(move |_, context| {
            context.set_operator(gtk::cairo::Operator::Source);
            context.set_source_rgba(red, green, blue, alpha);
            let _ = context.paint();
            gtk::glib::Propagation::Proceed
        });
    }
    resize_native_overlay_window(&gtk_window, bounds);
    position_native_overlay_window(&gtk_window, parent, bounds);

    let fixed = gtk::Fixed::new();
    fixed.set_size_request(bounds.width as i32, bounds.height as i32);
    gtk_window.add(&fixed);
    gtk_window.show_all();
    gtk_window.present();
    resize_native_overlay_window(&gtk_window, bounds);
    position_native_overlay_window(&gtk_window, parent, bounds);

    let webview = create_wry_webview_builder_with_ipc(mount, ipc_tx, url)
        .with_bounds(Rect {
            position: LogicalPosition::new(0, 0).into(),
            size: LogicalSize::new(bounds.width, bounds.height).into(),
        })
        .build_gtk(&fixed)
        .map_err(|error| error.to_string())?;
    apply_native_overlay_input_shape(&gtk_window, &webview, mount.input, bounds, None);
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
fn resize_native_overlay_window(gtk_window: &gtk::Window, bounds: NativeOverlayBounds) {
    if let Some(child) = gtk_window.child() {
        child.set_size_request(bounds.width as i32, bounds.height as i32);
    }
    gtk_window.set_size_request(bounds.width as i32, bounds.height as i32);
    gtk_window.resize(bounds.width as i32, bounds.height as i32);
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
) -> Option<(i32, i32)> {
    let parent_position = parent.outer_position().or_else(|_| parent.inner_position());
    let Ok(parent_position) = parent_position else {
        return None;
    };
    let (x, y) =
        native_overlay_screen_position(parent_position.x, parent_position.y, bounds.x, bounds.y);
    gtk_window.move_(x, y);
    Some((x, y))
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
fn apply_native_overlay_input_shape(
    gtk_window: &gtk::Window,
    webview: &wry::WebView,
    input: NativeOverlayInputPolicy,
    bounds: NativeOverlayBounds,
    input_regions: Option<&[NativeOverlayBounds]>,
) {
    use wry::WebViewExtUnix;

    let region = gtk::cairo::Region::create();
    for input_region in native_overlay_input_rectangles(input, bounds, input_regions) {
        let _ = region.union_rectangle(&gtk::cairo::RectangleInt::new(
            input_region.x as i32,
            input_region.y as i32,
            input_region.width as i32,
            input_region.height as i32,
        ));
    }
    gtk_window.input_shape_combine_region(Some(&region));
    webview.webview().input_shape_combine_region(Some(&region));
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
pub fn synchronize_native_overlay_webviews(
    host: Option<NonSend<NativeOverlayWebviewHost>>,
    windows: Query<(Entity, &Window), With<bevy::window::PrimaryWindow>>,
    winit_windows: Option<NonSend<WinitWindows>>,
) {
    let (Some(host), Some(winit_windows)) = (host, winit_windows) else {
        return;
    };
    let Ok((window_entity, window)) = windows.get_single() else {
        return;
    };
    let Some(parent) = winit_windows.get_window(window_entity) else {
        return;
    };
    for (index, gtk_window) in host.gtk_windows.iter().enumerate() {
        let Some(mount) = host.mounts.get(index) else {
            continue;
        };
        let Some(webview) = host.webviews.get(index) else {
            continue;
        };
        let bounds =
            native_overlay_bounds(mount, window.resolution.width(), window.resolution.height());
        let bounds_changed = host.synchronized_bounds[index].get() != Some(bounds);
        if bounds_changed {
            use wry::WebViewExtUnix;
            webview
                .webview()
                .set_size_request(bounds.width as i32, bounds.height as i32);
            resize_native_overlay_window(gtk_window, bounds);
            if let Err(error) =
                set_wry_webview_bounds(webview, native_overlay_webview_bounds(bounds))
            {
                warn!(
                    "TN_OVERLAY_NATIVE_RESIZE_FAILED: failed to synchronize native overlay '{}': {}",
                    mount.id, error
                );
            }
            host.synchronized_bounds[index].set(Some(bounds));
            apply_native_overlay_input_shape(
                gtk_window,
                webview,
                mount.input,
                bounds,
                host.input_regions[index].as_deref(),
            );
        }
        let parent_position = parent.outer_position().or_else(|_| parent.inner_position());
        if let Ok(parent_position) = parent_position {
            let screen_position = native_overlay_screen_position(
                parent_position.x,
                parent_position.y,
                bounds.x,
                bounds.y,
            );
            if host.synchronized_screen_positions[index].get() != Some(screen_position) {
                gtk_window.move_(screen_position.0, screen_position.1);
                host.synchronized_screen_positions[index].set(Some(screen_position));
            }
        }
        let should_show = window.focused && window.visible;
        if should_show {
            if !host.gtk_window_visible[index].replace(true) {
                gtk_window.show();
                if let Some(window) = gtk_window.window() {
                    window.raise();
                }
            }
        } else if host.gtk_window_visible[index].replace(false) {
            gtk_window.hide();
        }
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
pub fn synchronize_native_overlay_webviews() {}

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
    mut host: Option<NonSendMut<NativeOverlayWebviewHost>>,
    mut bridge: Option<ResMut<NativeOverlayBridgeResource>>,
) {
    drain_native_overlay_ipc(host.as_deref_mut(), bridge.as_deref_mut());
    deliver_native_overlay_snapshots(host.as_deref(), bridge.as_deref());
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
    mut host: Option<NonSendMut<NativeOverlayWebviewHost>>,
    mut bridge: Option<ResMut<NativeOverlayBridgeResource>>,
) {
    drain_native_overlay_ipc(host.as_deref_mut(), bridge.as_deref_mut());
    deliver_native_overlay_snapshots(host.as_deref(), bridge.as_deref());
}

#[cfg(feature = "native-webview")]
fn deliver_native_overlay_snapshots(
    host: Option<&NativeOverlayWebviewHost>,
    bridge: Option<&NativeOverlayBridgeResource>,
) {
    let (Some(host), Some(bridge)) = (host, bridge) else {
        return;
    };
    let delivered = host.delivered_sequence.get();
    let mut newest = delivered;
    for snapshot in bridge
        .bridge
        .snapshots()
        .iter()
        .filter(|entry| entry.sequence > delivered)
    {
        let Some(index) = host
            .mounts
            .iter()
            .position(|mount| mount.id == snapshot.overlay_id)
        else {
            continue;
        };
        let script = native_overlay_snapshot_script(
            &snapshot.message_type,
            &snapshot.payload,
            snapshot.sequence,
        );
        if let Err(error) = host.webviews[index].evaluate_script(&script) {
            warn!(
                "TN_OVERLAY_NATIVE_DELIVERY_FAILED: failed to deliver snapshot to '{}': {}",
                snapshot.overlay_id, error
            );
            continue;
        }
        info!(
            "delivered native overlay '{}' snapshot '{}' sequence {}",
            snapshot.overlay_id, snapshot.message_type, snapshot.sequence
        );
        newest = newest.max(snapshot.sequence);
    }
    host.delivered_sequence.set(newest);
}

pub fn native_overlay_snapshot_script(
    message_type: &str,
    payload: &serde_json::Value,
    sequence: u64,
) -> String {
    format!(
        "window.__threenativeDispatchOverlaySnapshot?.({}, {}, {});",
        serde_json::to_string(message_type).unwrap_or_else(|_| "\"\"".to_owned()),
        serde_json::to_string(payload).unwrap_or_else(|_| "null".to_owned()),
        sequence,
    )
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
#[derive(Deserialize)]
struct NativeOverlayInputRegion {
    height: f64,
    width: f64,
    x: f64,
    y: f64,
}

#[cfg(feature = "native-webview")]
fn drain_native_overlay_ipc(
    host: Option<&mut NativeOverlayWebviewHost>,
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
        if let Some(index) = host
            .mounts
            .iter()
            .position(|mount| mount.id == envelope.overlay_id)
        {
            if envelope.message_type == "overlay:set-visible" {
                if let Some(visible) = envelope.payload.get("visible").and_then(Value::as_bool) {
                    if let Err(error) = host.webviews[index].set_visible(visible) {
                        warn!("TN_OVERLAY_NATIVE_VISIBILITY_FAILED: {error}");
                    }
                    continue;
                }
            }
            if envelope.message_type == "overlay:set-input" {
                if let Some(mode) = envelope.payload.get("mode").and_then(Value::as_str) {
                    if matches!(
                        mode,
                        "keyboard" | "modal" | "none" | "pointer" | "pointer-and-keyboard"
                    ) {
                        let previous_input = host.mounts[index].input;
                        let next_input = native_overlay_input_policy(mode);
                        if previous_input != next_input {
                            host.mounts[index].input = next_input;
                            info!(
                                "native overlay '{}' input mode changed to '{}'",
                                envelope.overlay_id, mode
                            );
                            synchronize_native_overlay_input_shape(host, index);
                        }
                        continue;
                    }
                }
            }
            if envelope.message_type == "overlay:set-input-regions" {
                let regions = envelope.payload.get("regions").cloned().and_then(|value| {
                    serde_json::from_value::<Vec<NativeOverlayInputRegion>>(value).ok()
                });
                if let Some(regions) = regions {
                    let regions = regions
                        .into_iter()
                        .filter(|region| {
                            region.x.is_finite()
                                && region.y.is_finite()
                                && region.width.is_finite()
                                && region.height.is_finite()
                                && region.width > 0.0
                                && region.height > 0.0
                        })
                        .map(|region| NativeOverlayBounds {
                            height: region.height.ceil().max(1.0) as u32,
                            width: region.width.ceil().max(1.0) as u32,
                            x: region.x.floor().max(0.0) as u32,
                            y: region.y.floor().max(0.0) as u32,
                        })
                        .collect::<Vec<_>>();
                    let regions_changed =
                        host.input_regions[index].as_deref() != Some(regions.as_slice());
                    if regions_changed {
                        info!(
                            "native overlay '{}' input regions changed to {:?}",
                            envelope.overlay_id, regions
                        );
                        host.input_regions[index] = Some(regions);
                        synchronize_native_overlay_input_shape(host, index);
                    }
                    continue;
                }
            }
        }
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
fn synchronize_native_overlay_input_shape(host: &NativeOverlayWebviewHost, index: usize) {
    let (Some(gtk_window), Some(webview), Some(mount), Some(bounds)) = (
        host.gtk_windows.get(index),
        host.webviews.get(index),
        host.mounts.get(index),
        host.synchronized_bounds
            .get(index)
            .and_then(std::cell::Cell::get),
    ) else {
        return;
    };
    apply_native_overlay_input_shape(
        gtk_window,
        webview,
        mount.input,
        bounds,
        host.input_regions[index].as_deref(),
    );
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
fn synchronize_native_overlay_input_shape(_host: &NativeOverlayWebviewHost, _index: usize) {}

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
    if let Some(layout) = &mount.layout {
        return NativeOverlayBounds {
            height: (layout.height.max(1.0) as u32).min(full_height),
            width: (layout.width.max(1.0) as u32).min(full_width),
            x: (layout.x.max(0.0) as u32).min(full_width.saturating_sub(1)),
            y: (layout.y.max(0.0) as u32).min(full_height.saturating_sub(1)),
        };
    }

    NativeOverlayBounds {
        height: full_height,
        width: full_width,
        x: 0,
        y: 0,
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
