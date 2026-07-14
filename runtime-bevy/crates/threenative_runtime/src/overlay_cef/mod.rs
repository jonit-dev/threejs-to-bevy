use std::{
    cell::{Cell, RefCell},
    collections::VecDeque,
    path::{Path, PathBuf},
    rc::Rc,
    time::{Duration, Instant},
};

use bevy::{
    prelude::*,
    render::{
        render_asset::RenderAssetUsages,
        render_resource::{Extent3d, TextureDimension, TextureFormat},
    },
};
use cef::rc::Rc as _;
use cef::{
    App, Browser, BrowserSettings, CefString, Client, CommandLine, DisplayHandler, ImplApp,
    ImplBrowser, ImplBrowserHost, ImplClient, ImplCommandLine, ImplDisplayHandler, ImplFrame,
    ImplLifeSpanHandler, ImplRenderHandler, LifeSpanHandler, LogSeverity, MouseButtonType,
    MouseEvent, Rect, RenderHandler, Settings, WindowInfo, WrapApp, WrapClient, WrapDisplayHandler,
    WrapLifeSpanHandler, WrapRenderHandler, api_hash, browser_host_create_browser_sync,
    execute_process, initialize, shutdown, sys,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use threenative_loader::OverlaysIr;

pub const CEF_CRATE_VERSION: &str = "150.0.0+150.0.10";
pub const CEF_DISTRIBUTION_VERSION: &str = "150.0.10+g8042e43";
pub const CEF_CHROMIUM_VERSION: &str = "150.0.7871.101";
pub const CEF_DESKTOP_BLINK_SETTINGS: &str =
    "primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4";
const MAX_METRIC_SAMPLES: usize = 2_048;
const MAX_PENDING_BRIDGE_MESSAGES: usize = 64;
const CEF_SPIKE_IPC_PREFIX: &str = "TN_OVERLAY_CEF_IPC:";

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct CefSpikeIpcEnvelope {
    overlay_id: String,
    #[serde(rename = "type")]
    message_type: String,
    payload: Value,
}

#[derive(Clone, Debug)]
pub struct CefSpikeFrameProbeConfig {
    pub baseline_report_path: Option<PathBuf>,
    pub mode: String,
    pub report_path: PathBuf,
    pub sample_frames: usize,
    pub warmup_frames: usize,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CefSpikeFrameStats {
    pub count: usize,
    pub max_ms: f64,
    pub mean_ms: f64,
    pub p50_ms: f64,
    pub p95_ms: f64,
    pub p99_ms: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CefSpikeFrameDelta {
    pub mean_ms: f64,
    pub p95_ms: f64,
    pub p99_ms: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CefSpikeFrameReport {
    pub schema: String,
    pub version: String,
    pub mode: String,
    pub physical_width: u32,
    pub physical_height: u32,
    pub warmup_frames: usize,
    pub sample_frames: usize,
    pub frames: CefSpikeFrameStats,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub baseline: Option<CefSpikeFrameStats>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_frame_delta: Option<CefSpikeFrameDelta>,
}

#[derive(Resource)]
pub struct CefSpikeFrameProbe {
    config: CefSpikeFrameProbeConfig,
    intervals_micros: Vec<u64>,
    previous_start: Option<Instant>,
    skipped: usize,
}

impl CefSpikeFrameProbe {
    pub fn new(config: CefSpikeFrameProbeConfig) -> Self {
        Self {
            config,
            intervals_micros: Vec::new(),
            previous_start: None,
            skipped: 0,
        }
    }

    pub fn observe_frame_start(&mut self, now: Instant) -> bool {
        let Some(previous) = self.previous_start.replace(now) else {
            return false;
        };
        if self.skipped < self.config.warmup_frames {
            self.skipped += 1;
            return false;
        }
        if self.intervals_micros.len() < self.config.sample_frames {
            self.intervals_micros
                .push(now.duration_since(previous).as_micros() as u64);
        }
        self.intervals_micros.len() == self.config.sample_frames
    }

    pub fn sample_count(&self) -> usize {
        self.intervals_micros.len()
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CefPaintFrame {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct CefPaintQueueMetrics {
    pub accepted: u64,
    pub copy_micros: Vec<u64>,
    pub dropped: u64,
}

#[derive(Debug, Default)]
pub struct CefPaintQueue {
    latest: Option<CefPaintFrame>,
    metrics: CefPaintQueueMetrics,
}

impl CefPaintQueue {
    pub fn push_bgra_premultiplied(
        &mut self,
        width: u32,
        height: u32,
        bgra: &[u8],
    ) -> Result<(), String> {
        let expected = width as usize * height as usize * 4;
        if width == 0 || height == 0 || bgra.len() != expected {
            return Err(format!(
                "TN_OVERLAY_CEF_PAINT_INVALID: expected {expected} bytes for {width}x{height}, received {}",
                bgra.len()
            ));
        }
        if self.latest.is_some() {
            self.metrics.dropped += 1;
        }
        let copy_started = Instant::now();
        let rgba = normalize_bgra_premultiplied_to_rgba(bgra);
        record_bounded_sample(
            &mut self.metrics.copy_micros,
            self.metrics.accepted,
            copy_started.elapsed().as_micros() as u64,
        );
        self.metrics.accepted += 1;
        self.latest = Some(CefPaintFrame {
            width,
            height,
            rgba,
        });
        Ok(())
    }

    pub fn take_latest(&mut self) -> Option<CefPaintFrame> {
        self.latest.take()
    }

    pub fn pending_len(&self) -> usize {
        usize::from(self.latest.is_some())
    }

    pub fn metrics(&self) -> CefPaintQueueMetrics {
        self.metrics.clone()
    }
}

pub fn normalize_bgra_premultiplied_to_rgba(bgra: &[u8]) -> Vec<u8> {
    let mut rgba = Vec::with_capacity(bgra.len());
    for pixel in bgra.chunks_exact(4) {
        let alpha = pixel[3];
        rgba.extend_from_slice(&[
            unpremultiply(pixel[2], alpha),
            unpremultiply(pixel[1], alpha),
            unpremultiply(pixel[0], alpha),
            alpha,
        ]);
    }
    rgba
}

fn unpremultiply(channel: u8, alpha: u8) -> u8 {
    match alpha {
        0 => 0,
        255 => channel,
        _ => {
            (((u32::from(channel) * 255) + u32::from(alpha) / 2) / u32::from(alpha)).min(255) as u8
        }
    }
}

cef::wrap_render_handler! {
    struct CefSpikeRenderHandler {
        queue: Rc<RefCell<CefPaintQueue>>,
        width: Rc<Cell<i32>>,
        height: Rc<Cell<i32>>,
    }

    impl RenderHandler {
        fn view_rect(&self, _browser: Option<&mut Browser>, rect: Option<&mut Rect>) {
            if let Some(rect) = rect {
                rect.width = self.width.get();
                rect.height = self.height.get();
            }
        }

        fn on_paint(
            &self,
            _browser: Option<&mut Browser>,
            _type: cef::PaintElementType,
            _dirty_rects: Option<&[Rect]>,
            buffer: *const u8,
            width: i32,
            height: i32,
        ) {
            if buffer.is_null() || width <= 0 || height <= 0 {
                return;
            }
            let length = width as usize * height as usize * 4;
            let bytes = unsafe { std::slice::from_raw_parts(buffer, length) };
            let _ = self.queue.borrow_mut().push_bgra_premultiplied(
                width as u32,
                height as u32,
                bytes,
            );
        }
    }
}

cef::wrap_life_span_handler! {
    struct CefSpikeLifeSpanHandler {
        closed: Rc<Cell<bool>>,
    }

    impl LifeSpanHandler {
        fn on_before_close(&self, _browser: Option<&mut Browser>) {
            self.closed.set(true);
        }
    }
}

cef::wrap_client! {
    struct CefSpikeClient {
        render_handler: RenderHandler,
        life_span_handler: LifeSpanHandler,
        display_handler: DisplayHandler,
    }

    impl Client {
        fn render_handler(&self) -> Option<RenderHandler> {
            Some(self.render_handler.clone())
        }

        fn life_span_handler(&self) -> Option<LifeSpanHandler> {
            Some(self.life_span_handler.clone())
        }

        fn display_handler(&self) -> Option<DisplayHandler> {
            Some(self.display_handler.clone())
        }
    }
}

cef::wrap_display_handler! {
    struct CefSpikeDisplayHandler {
        ipc_queue: Rc<RefCell<VecDeque<String>>>,
    }

    impl DisplayHandler {
        fn on_console_message(
            &self,
            _browser: Option<&mut Browser>,
            level: LogSeverity,
            message: Option<&CefString>,
            source: Option<&CefString>,
            line: i32,
        ) -> i32 {
            let message_text = message.map(ToString::to_string).unwrap_or_default();
            if let Some(payload) = message_text.strip_prefix(CEF_SPIKE_IPC_PREFIX) {
                let mut queue = self.ipc_queue.borrow_mut();
                if queue.len() == MAX_PENDING_BRIDGE_MESSAGES {
                    queue.pop_front();
                }
                queue.push_back(payload.to_string());
            } else {
                eprintln!(
                    "TN_OVERLAY_CEF_CONSOLE: {level:?}: {message_text} ({source:?}:{line})"
                );
            }
            1
        }
    }
}

cef::wrap_app! {
    struct CefSpikeApp {}

    impl App {
        fn on_before_command_line_processing(
            &self,
            _process_type: Option<&cef::CefString>,
            command_line: Option<&mut CommandLine>,
        ) {
            #[cfg(target_os = "linux")]
            if let Some(command_line) = command_line {
                command_line.append_switch_with_value(
                    Some(&"ozone-platform".into()),
                    Some(&"x11".into()),
                );
                command_line.append_switch_with_value(
                    Some(&"blink-settings".into()),
                    Some(&CEF_DESKTOP_BLINK_SETTINGS.into()),
                );
                command_line.append_switch(Some(&"allow-file-access-from-files".into()));
            }
        }
    }
}

pub fn dispatch_cef_subprocess() -> Option<i32> {
    let _ = api_hash(sys::CEF_API_VERSION_LAST, 0);
    let args = cef::args::Args::new();
    let mut app = CefSpikeApp::new();
    let exit_code = execute_process(
        Some(args.as_main_args()),
        Some(&mut app),
        std::ptr::null_mut(),
    );
    (exit_code >= 0).then_some(exit_code)
}

pub fn dispatch_cef_subprocess_with(
    execute: impl FnOnce() -> i32,
    initialize_browser_process: impl FnOnce(),
) -> Option<i32> {
    let exit_code = execute();
    if exit_code >= 0 {
        Some(exit_code)
    } else {
        initialize_browser_process();
        None
    }
}

pub struct CefOsrRuntime {
    browser: Option<Browser>,
    bridge_injected: bool,
    closed: Rc<Cell<bool>>,
    delivered_sequence: u64,
    input_policy: crate::overlay::NativeOverlayInputPolicy,
    ipc_queue: Rc<RefCell<VecDeque<String>>>,
    overlay_id: String,
    pointer_moves_sent: Cell<u64>,
    queue: Rc<RefCell<CefPaintQueue>>,
    process_started_at: Instant,
    spike_scenario_result: Option<Result<usize, String>>,
    visible: bool,
}

impl CefOsrRuntime {
    pub fn initialize(
        url: &str,
        width: u32,
        height: u32,
        cache_path: &Path,
        process_started_at: Instant,
        overlay_id: String,
    ) -> Result<Self, String> {
        std::fs::create_dir_all(cache_path).map_err(|error| {
            format!(
                "TN_OVERLAY_CEF_INIT_FAILED: could not create cache {}: {error}",
                cache_path.display()
            )
        })?;
        let _ = api_hash(sys::CEF_API_VERSION_LAST, 0);
        let args = cef::args::Args::new();
        let mut app = CefSpikeApp::new();
        let settings = Settings {
            no_sandbox: 1,
            root_cache_path: cache_path.to_string_lossy().as_ref().into(),
            windowless_rendering_enabled: 1,
            external_message_pump: 1,
            background_color: 0,
            ..Default::default()
        };
        if initialize(
            Some(args.as_main_args()),
            Some(&settings),
            Some(&mut app),
            std::ptr::null_mut(),
        ) != 1
        {
            return Err("TN_OVERLAY_CEF_INIT_FAILED: cef_initialize returned false".to_string());
        }

        let queue = Rc::new(RefCell::new(CefPaintQueue::default()));
        let ipc_queue = Rc::new(RefCell::new(VecDeque::new()));
        let closed = Rc::new(Cell::new(false));
        let render_handler = CefSpikeRenderHandler::new(
            queue.clone(),
            Rc::new(Cell::new(width as i32)),
            Rc::new(Cell::new(height as i32)),
        );
        let life_span_handler = CefSpikeLifeSpanHandler::new(closed.clone());
        let display_handler = CefSpikeDisplayHandler::new(ipc_queue.clone());
        let mut client = CefSpikeClient::new(render_handler, life_span_handler, display_handler);
        let browser = browser_host_create_browser_sync(
            Some(&WindowInfo {
                windowless_rendering_enabled: 1,
                external_begin_frame_enabled: 0,
                #[cfg(target_os = "linux")]
                parent_window: 0,
                ..Default::default()
            }),
            Some(&mut client),
            Some(&url.into()),
            Some(&BrowserSettings {
                windowless_frame_rate: 60,
                ..Default::default()
            }),
            None,
            None,
        )
        .ok_or_else(|| {
            shutdown();
            "TN_OVERLAY_CEF_INIT_FAILED: windowless browser creation failed".to_string()
        })?;

        Ok(Self {
            browser: Some(browser),
            bridge_injected: false,
            closed,
            delivered_sequence: 0,
            input_policy: crate::overlay::native_overlay_input_policy("modal"),
            ipc_queue,
            overlay_id,
            pointer_moves_sent: Cell::new(0),
            queue,
            process_started_at,
            spike_scenario_result: None,
            visible: true,
        })
    }

    pub fn pump(&mut self) {
        cef::do_message_loop_work();
    }

    pub fn take_latest_paint(&mut self) -> Option<CefPaintFrame> {
        self.queue.borrow_mut().take_latest()
    }

    pub fn metrics(&self) -> CefPaintQueueMetrics {
        self.queue.borrow().metrics()
    }

    pub fn startup_elapsed(&self) -> Duration {
        self.process_started_at.elapsed()
    }

    pub fn inject_spike_bridge(&mut self) -> Result<(), String> {
        if self.bridge_injected {
            return Ok(());
        }
        let frame = self
            .browser
            .as_ref()
            .and_then(ImplBrowser::main_frame)
            .ok_or_else(|| "TN_OVERLAY_CEF_INIT_FAILED: main frame is unavailable".to_string())?;
        let script = cef_spike_bridge_script(&self.overlay_id)?;
        frame.execute_java_script(Some(&script.as_str().into()), None, 0);
        if std::env::var_os("TN_OVERLAY_CEF_SPIKE_BRIDGE_PROBE").is_some() {
            frame.execute_java_script(
                Some(
                    &r#"window.threenativeOverlayBridge.send("overlay:set-visible", { visible: false });
                       window.threenativeOverlayBridge.send("overlay:set-input", { mode: "pointer" });
                       setTimeout(() => window.threenativeOverlayBridge.send("overlay:set-visible", { visible: true }), 50);"#
                        .into(),
                ),
                None,
                0,
            );
        }
        if std::env::var_os("TN_OVERLAY_CEF_SPIKE_MODAL_PROBE").is_some() {
            frame.execute_java_script(Some(&cef_spike_modal_probe_script().into()), None, 0);
        }
        self.bridge_injected = true;
        Ok(())
    }

    fn drain_ipc(&mut self) -> Vec<String> {
        self.ipc_queue.borrow_mut().drain(..).collect()
    }

    fn deliver_snapshot(&mut self, snapshot: &crate::overlay::OverlayBridgeEnvelope) -> bool {
        if !self.bridge_injected || snapshot.overlay_id != self.overlay_id {
            return false;
        }
        let Some(frame) = self.browser.as_ref().and_then(ImplBrowser::main_frame) else {
            return false;
        };
        let script = format!(
            "window.__threenativeDispatchOverlaySnapshot?.({}, {}, {});",
            serde_json::to_string(&snapshot.message_type).unwrap_or_else(|_| "\"\"".to_string()),
            serde_json::to_string(&snapshot.payload).unwrap_or_else(|_| "null".to_string()),
            snapshot.sequence,
        );
        frame.execute_java_script(Some(&script.as_str().into()), None, 0);
        if self.delivered_sequence == 0
            && std::env::var_os("TN_OVERLAY_CEF_SPIKE_BRIDGE_PROBE").is_some()
        {
            frame.execute_java_script(
                Some(
                    &r#"window.threenativeOverlayBridge.subscribe((type, _payload, metadata) => {
                         console.info(`TN_OVERLAY_CEF_BRIDGE_REPLAY:${JSON.stringify({ type, sequence: metadata.sequence })}`);
                       });"#
                        .into(),
                ),
                None,
                0,
            );
        }
        self.delivered_sequence = self.delivered_sequence.max(snapshot.sequence);
        true
    }

    pub fn send_mouse_move(&self, position: Vec2, mouse_leave: bool) {
        if !self.visible || !self.input_policy.captures_pointer {
            return;
        }
        let Some(host) = self.browser.as_ref().and_then(ImplBrowser::host) else {
            return;
        };
        self.pointer_moves_sent
            .set(self.pointer_moves_sent.get().saturating_add(1));
        host.set_focus(1);
        host.send_mouse_move_event(
            Some(&MouseEvent {
                x: position.x.round() as i32,
                y: position.y.round() as i32,
                modifiers: 0,
            }),
            i32::from(mouse_leave),
        );
    }

    pub fn send_mouse_button(&self, position: Vec2, button: MouseButton, released: bool) {
        if !self.visible || !self.input_policy.captures_pointer {
            return;
        }
        let Some(host) = self.browser.as_ref().and_then(ImplBrowser::host) else {
            return;
        };
        let button = match button {
            MouseButton::Left => MouseButtonType::LEFT,
            MouseButton::Middle => MouseButtonType::MIDDLE,
            MouseButton::Right => MouseButtonType::RIGHT,
            _ => return,
        };
        host.set_focus(1);
        host.send_mouse_click_event(
            Some(&MouseEvent {
                x: position.x.round() as i32,
                y: position.y.round() as i32,
                modifiers: 0,
            }),
            button,
            i32::from(released),
            1,
        );
    }

    fn set_input_mode(&mut self, mode: &str) -> bool {
        if !matches!(
            mode,
            "keyboard" | "modal" | "none" | "pointer" | "pointer-and-keyboard"
        ) {
            return false;
        }
        self.input_policy = crate::overlay::native_overlay_input_policy(mode);
        true
    }

    fn set_visible(&mut self, visible: bool) {
        self.visible = visible;
        if let Some(host) = self.browser.as_ref().and_then(ImplBrowser::host) {
            host.was_hidden(i32::from(!visible));
        }
    }
}

pub fn cef_spike_modal_probe_script() -> &'static str {
    r#"(async () => {
         const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
         const button = (label) => Array.from(document.querySelectorAll("button"))
           .find((candidate) => candidate.textContent?.includes(label));
         const waitFor = async (predicate, label) => {
           for (let attempt = 0; attempt < 100; attempt += 1) {
             const value = predicate();
             if (value) return value;
             await delay(25);
           }
           throw new Error(`timed out waiting for ${label}`);
         };
         try {
           (await waitFor(() => button("Play Black"), "Play Black button")).click();
           await waitFor(() => button("Settings"), "Settings button");
           for (let transition = 0; transition < 10; transition += 1) {
             button("Settings").click();
             await waitFor(() => document.querySelector("[role='dialog']"), "settings dialog");
             await delay(100);
             (await waitFor(() => button("Done"), "Done button")).click();
             await waitFor(() => document.querySelector("[role='dialog']") === null, "settings removal");
             await delay(100);
           }
           await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
           window.threenativeOverlayBridge.send("overlay:spike-modal-probe", { completed: true, transitions: 10 });
         } catch (error) {
           window.threenativeOverlayBridge.send("overlay:spike-modal-probe", { completed: false, error: String(error) });
         }
       })();"#
}

pub fn cef_spike_bridge_script(overlay_id: &str) -> Result<String, String> {
    let overlay_id = serde_json::to_string(overlay_id)
        .map_err(|error| format!("TN_OVERLAY_CEF_INIT_FAILED: {error}"))?;
    Ok(r#"(() => {
          const overlayId = __OVERLAY_ID__;
          const listeners = new Set();
          const snapshots = new Map();
          window.ipc = window.ipc || {};
          window.threenativeOverlayBridge = {
            send(type, payload) {
              console.info(`TN_OVERLAY_CEF_IPC:${JSON.stringify({ overlayId, type, payload })}`);
              return true;
            },
            subscribe(listener) {
              listeners.add(listener);
              for (const snapshot of snapshots.values()) {
                listener(snapshot.type, snapshot.payload, { sequence: snapshot.sequence });
              }
              return () => listeners.delete(listener);
            },
            snapshot(type) {
              if (type !== undefined) return snapshots.get(type);
              return Array.from(snapshots.values()).at(-1);
            }
          };
          window.__threenativeDispatchOverlaySnapshot = (type, payload, sequence) => {
            const snapshot = { payload, sequence, type };
            snapshots.set(type, snapshot);
            for (const listener of listeners) listener(type, payload, { sequence });
          };
          window.dispatchEvent(new Event("threenative:bridge-ready"));
        })();"#
        .replace("__OVERLAY_ID__", &overlay_id))
}

impl Drop for CefOsrRuntime {
    fn drop(&mut self) {
        if let Some(browser) = self.browser.take()
            && let Some(host) = browser.host()
        {
            host.close_browser(1);
            let deadline = Instant::now() + Duration::from_secs(2);
            while !self.closed.get() && Instant::now() < deadline {
                cef::do_message_loop_work();
                std::thread::yield_now();
            }
        }
        shutdown();
    }
}

#[derive(Resource)]
pub struct CefSpikeTexture {
    pub entity: Entity,
    pub handle: Handle<Image>,
    pub first_paint_ms: Option<f64>,
    pub upload_bytes: u64,
    pub upload_micros: Vec<u64>,
    pub uploads: u64,
}

pub fn install_cef_spike_frame_probe(
    app: &mut bevy::prelude::App,
    config: CefSpikeFrameProbeConfig,
) -> Result<(), String> {
    if config.sample_frames == 0 || config.sample_frames > MAX_METRIC_SAMPLES {
        return Err(format!(
            "TN_OVERLAY_CEF_FRAME_BASELINE_INVALID: sampleFrames must be between 1 and {MAX_METRIC_SAMPLES}"
        ));
    }
    if config.mode != "baseline" && config.mode != "overlay" {
        return Err(format!(
            "TN_OVERLAY_CEF_FRAME_BASELINE_INVALID: unsupported probe mode {:?}",
            config.mode
        ));
    }
    if config.mode == "overlay" && config.baseline_report_path.is_none() {
        return Err(
            "TN_OVERLAY_CEF_FRAME_BASELINE_INVALID: overlay mode requires a baseline report"
                .to_string(),
        );
    }
    app.insert_resource(CefSpikeFrameProbe::new(config));
    app.add_systems(
        First,
        sample_cef_spike_frame_probe.before(bevy::time::TimeSystem),
    );
    Ok(())
}

pub fn install_cef_spike_surface(
    app: &mut bevy::prelude::App,
    runtime: CefOsrRuntime,
    overlays: OverlaysIr,
    width: u32,
    height: u32,
) {
    let hidden_fallback_roots = hide_native_ui_fallback_for_cef(app.world_mut());
    info!(
        "TN_OVERLAY_CEF_FALLBACK_HIDDEN: hid {hidden_fallback_roots} retained native UI root(s) after successful CEF initialization"
    );
    let image = Image::new_fill(
        Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        &[0, 0, 0, 0],
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    );
    let handle = app.world_mut().resource_mut::<Assets<Image>>().add(image);
    let entity = app
        .world_mut()
        .spawn(ImageBundle {
            style: Style {
                position_type: PositionType::Absolute,
                left: Val::Px(0.0),
                top: Val::Px(0.0),
                width: Val::Px(width as f32),
                height: Val::Px(height as f32),
                ..Default::default()
            },
            image: UiImage::new(handle.clone()),
            z_index: ZIndex::Global(i32::MAX),
            ..Default::default()
        })
        .id();
    app.insert_resource(CefSpikeTexture {
        entity,
        handle: handle.clone(),
        first_paint_ms: None,
        upload_bytes: 0,
        upload_micros: Vec::new(),
        uploads: 0,
    });
    app.insert_resource(crate::overlay_host::NativeOverlayBridgeResource::new(
        overlays,
    ));
    app.insert_non_send_resource(runtime);
    app.add_systems(
        Update,
        (
            pump_cef_spike_surface.before(crate::run_scripted_runtime_systems),
            route_cef_spike_pointer.after(pump_cef_spike_surface),
            deliver_cef_spike_snapshots.after(crate::run_scripted_runtime_systems),
        ),
    );
    app.add_systems(Last, report_cef_spike_summary);
}

pub fn hide_native_ui_fallback_for_cef(world: &mut World) -> usize {
    let mut roots =
        world.query_filtered::<&mut Visibility, (With<crate::ui::NativeUiKind>, Without<Parent>)>();
    let mut hidden = 0;
    for mut visibility in roots.iter_mut(world) {
        *visibility = Visibility::Hidden;
        hidden += 1;
    }
    hidden
}

fn pump_cef_spike_surface(
    mut runtime: NonSendMut<CefOsrRuntime>,
    mut bridge: ResMut<crate::overlay_host::NativeOverlayBridgeResource>,
    mut texture: ResMut<CefSpikeTexture>,
    mut images: ResMut<Assets<Image>>,
    mut visibility: Query<&mut Visibility>,
    mut exits: EventWriter<bevy::app::AppExit>,
) {
    runtime.pump();
    drain_cef_spike_ipc(&mut runtime, &mut bridge);
    if let Some(result) = runtime.spike_scenario_result.take() {
        match result {
            Ok(transitions) => {
                info!(
                    "TN_OVERLAY_CEF_MODAL_PROBE_PASS: transitions={transitions}, windowCount=1, viewport=1280x720"
                );
                exits.send(bevy::app::AppExit::Success);
            }
            Err(error) => {
                error!("TN_OVERLAY_CEF_MODAL_PROBE_FAILED: {error}");
                exits.send(bevy::app::AppExit::error());
            }
        }
    }
    if let Ok(mut surface_visibility) = visibility.get_mut(texture.entity) {
        *surface_visibility = if runtime.visible {
            Visibility::Inherited
        } else {
            Visibility::Hidden
        };
    }
    let Some(frame) = runtime.take_latest_paint() else {
        return;
    };
    if texture.first_paint_ms.is_none() {
        let first_paint_ms = runtime.startup_elapsed().as_secs_f64() * 1_000.0;
        let nontransparent_pixels = frame
            .rgba
            .chunks_exact(4)
            .filter(|pixel| pixel[3] != 0)
            .count();
        if nontransparent_pixels > 0 {
            texture.first_paint_ms = Some(first_paint_ms);
            info!(
                "TN_OVERLAY_CEF_FIRST_NONBLANK_PAINT: {:.2} ms, {}x{}, {} nontransparent pixels",
                first_paint_ms, frame.width, frame.height, nontransparent_pixels
            );
            if let Err(error) = runtime.inject_spike_bridge() {
                warn!("{error}");
            }
            if std::env::var_os("TN_OVERLAY_CEF_SPIKE_EXIT_AFTER_FIRST_PAINT").is_some() {
                exits.send(bevy::app::AppExit::Success);
            }
        }
        if nontransparent_pixels > 0
            && let Some(path) = std::env::var_os("TN_OVERLAY_CEF_SPIKE_FIRST_PAINT")
            && let Err(error) = image::save_buffer(
                &path,
                &frame.rgba,
                frame.width,
                frame.height,
                image::ColorType::Rgba8,
            )
        {
            warn!(
                "TN_OVERLAY_CEF_SPIKE_CAPTURE_FAILED: {}: {error}",
                Path::new(&path).display()
            );
        }
    }
    texture.upload_bytes += frame.rgba.len() as u64;
    if let Some(directory) = std::env::var_os("TN_OVERLAY_CEF_SPIKE_CAPTURE_DIR") {
        let directory = PathBuf::from(directory);
        let path = directory.join(format!("paint-{:04}.png", texture.uploads));
        if let Err(error) = std::fs::create_dir_all(&directory).and_then(|()| {
            image::save_buffer(
                &path,
                &frame.rgba,
                frame.width,
                frame.height,
                image::ColorType::Rgba8,
            )
            .map_err(std::io::Error::other)
        }) {
            warn!(
                "TN_OVERLAY_CEF_SPIKE_CAPTURE_FAILED: {}: {error}",
                path.display()
            );
        }
    }
    if let Some(image) = images.get_mut(&texture.handle) {
        let upload_started = Instant::now();
        apply_paint_to_image(image, frame);
        let upload_sequence = texture.uploads;
        record_bounded_sample(
            &mut texture.upload_micros,
            upload_sequence,
            upload_started.elapsed().as_micros() as u64,
        );
        texture.uploads += 1;
    }
}

fn drain_cef_spike_ipc(
    runtime: &mut CefOsrRuntime,
    bridge: &mut crate::overlay_host::NativeOverlayBridgeResource,
) {
    for raw in runtime.drain_ipc() {
        let envelope = match serde_json::from_str::<CefSpikeIpcEnvelope>(&raw) {
            Ok(envelope) => envelope,
            Err(error) => {
                warn!("TN_OVERLAY_NATIVE_IPC_REJECTED: {error}");
                continue;
            }
        };
        if envelope.overlay_id != runtime.overlay_id {
            warn!(
                "TN_OVERLAY_NATIVE_IPC_REJECTED: expected overlay {:?}, received {:?}",
                runtime.overlay_id, envelope.overlay_id
            );
            continue;
        }
        match envelope.message_type.as_str() {
            "overlay:spike-modal-probe" => {
                let completed = envelope
                    .payload
                    .get("completed")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let transitions = envelope
                    .payload
                    .get("transitions")
                    .and_then(Value::as_u64)
                    .and_then(|value| usize::try_from(value).ok());
                runtime.spike_scenario_result = if completed && transitions == Some(10) {
                    Some(Ok(10))
                } else {
                    Some(Err(envelope
                        .payload
                        .get("error")
                        .and_then(Value::as_str)
                        .unwrap_or("scenario did not complete 10 transitions")
                        .to_string()))
                };
            }
            "overlay:set-visible" => {
                if let Some(visible) = envelope.payload.get("visible").and_then(Value::as_bool) {
                    runtime.set_visible(visible);
                    info!("TN_OVERLAY_CEF_VISIBILITY: visible={visible}");
                }
            }
            "overlay:set-input" => {
                if let Some(mode) = envelope.payload.get("mode").and_then(Value::as_str)
                    && !runtime.set_input_mode(mode)
                {
                    warn!("TN_OVERLAY_NATIVE_IPC_REJECTED: invalid input mode {mode:?}");
                } else if let Some(mode) = envelope.payload.get("mode").and_then(Value::as_str) {
                    info!("TN_OVERLAY_CEF_INPUT_MODE: mode={mode}");
                }
            }
            "overlay:set-input-regions" => {}
            _ => {
                if bridge.bridge.receive_overlay_message(
                    &bridge.overlays,
                    &envelope.overlay_id,
                    &envelope.message_type,
                    envelope.payload,
                ) {
                    info!(
                        "native CEF overlay '{}' sent '{}'",
                        envelope.overlay_id, envelope.message_type
                    );
                } else if let Some(diagnostic) = bridge.bridge.diagnostics().last() {
                    warn!("{}: {}", diagnostic.code, diagnostic.message);
                }
            }
        }
    }
}

pub fn receive_cef_spike_game_message(
    raw: &str,
    expected_overlay_id: &str,
    bridge: &mut crate::overlay_host::NativeOverlayBridgeResource,
) -> Result<bool, String> {
    let envelope = serde_json::from_str::<CefSpikeIpcEnvelope>(raw)
        .map_err(|error| format!("TN_OVERLAY_NATIVE_IPC_REJECTED: {error}"))?;
    if envelope.overlay_id != expected_overlay_id {
        return Err(format!(
            "TN_OVERLAY_NATIVE_IPC_REJECTED: expected overlay {expected_overlay_id:?}, received {:?}",
            envelope.overlay_id
        ));
    }
    if envelope.message_type.starts_with("overlay:") {
        return Ok(false);
    }
    let accepted = bridge.bridge.receive_overlay_message(
        &bridge.overlays,
        &envelope.overlay_id,
        &envelope.message_type,
        envelope.payload,
    );
    Ok(accepted)
}

fn deliver_cef_spike_snapshots(
    mut runtime: NonSendMut<CefOsrRuntime>,
    bridge: Res<crate::overlay_host::NativeOverlayBridgeResource>,
) {
    let pending = bridge
        .bridge
        .snapshots()
        .iter()
        .filter(|snapshot| snapshot.sequence > runtime.delivered_sequence)
        .cloned()
        .collect::<Vec<_>>();
    for snapshot in &pending {
        if runtime.deliver_snapshot(snapshot) {
            info!(
                "delivered CEF overlay '{}' snapshot '{}' sequence {}",
                snapshot.overlay_id, snapshot.message_type, snapshot.sequence
            );
        }
    }
}

fn sample_cef_spike_frame_probe(
    mut probe: ResMut<CefSpikeFrameProbe>,
    windows: Query<&Window, With<bevy::window::PrimaryWindow>>,
    mut exits: EventWriter<bevy::app::AppExit>,
) {
    if !probe.observe_frame_start(Instant::now()) {
        return;
    }
    let Ok(window) = windows.get_single() else {
        error!("TN_OVERLAY_CEF_FRAME_BASELINE_INVALID: primary window is unavailable");
        exits.send(bevy::app::AppExit::error());
        return;
    };
    match build_cef_spike_frame_report(
        &probe.config,
        window.physical_width(),
        window.physical_height(),
        &probe.intervals_micros,
    )
    .and_then(|report| {
        crate::trace_report::write_pretty_json_report(&probe.config.report_path, &report).map_err(
            |error| {
                format!(
                    "TN_OVERLAY_CEF_FRAME_BASELINE_INVALID: could not write {}: {error}",
                    probe.config.report_path.display()
                )
            },
        )
    }) {
        Ok(()) => {
            exits.send(bevy::app::AppExit::Success);
        }
        Err(error) => {
            error!("{error}");
            exits.send(bevy::app::AppExit::error());
        }
    };
}

pub fn build_cef_spike_frame_report(
    config: &CefSpikeFrameProbeConfig,
    physical_width: u32,
    physical_height: u32,
    intervals_micros: &[u64],
) -> Result<CefSpikeFrameReport, String> {
    if physical_width != 1_280 || physical_height != 720 {
        return Err(format!(
            "TN_OVERLAY_CEF_FRAME_BASELINE_INVALID: expected a 1280x720 physical viewport, received {physical_width}x{physical_height}"
        ));
    }
    if intervals_micros.len() != config.sample_frames {
        return Err(format!(
            "TN_OVERLAY_CEF_FRAME_BASELINE_INVALID: expected {} frame samples, received {}",
            config.sample_frames,
            intervals_micros.len()
        ));
    }
    let frames = cef_spike_frame_stats(intervals_micros).ok_or_else(|| {
        "TN_OVERLAY_CEF_FRAME_BASELINE_INVALID: frame samples are empty".to_string()
    })?;
    let baseline_report = config
        .baseline_report_path
        .as_ref()
        .map(|path| read_cef_spike_baseline(path, config, physical_width, physical_height))
        .transpose()?;
    let baseline = baseline_report.as_ref().map(|report| report.frames.clone());
    let total_frame_delta = baseline
        .as_ref()
        .map(|baseline| compare_cef_spike_frame_stats(&frames, baseline));
    Ok(CefSpikeFrameReport {
        schema: "threenative.native-overlay-cef-frame-probe".to_string(),
        version: "0.1.0".to_string(),
        mode: config.mode.clone(),
        physical_width,
        physical_height,
        warmup_frames: config.warmup_frames,
        sample_frames: config.sample_frames,
        frames,
        baseline,
        total_frame_delta,
    })
}

fn read_cef_spike_baseline(
    path: &Path,
    config: &CefSpikeFrameProbeConfig,
    physical_width: u32,
    physical_height: u32,
) -> Result<CefSpikeFrameReport, String> {
    let bytes = std::fs::read(path).map_err(|error| {
        format!(
            "TN_OVERLAY_CEF_FRAME_BASELINE_INVALID: could not read {}: {error}",
            path.display()
        )
    })?;
    let report: CefSpikeFrameReport = serde_json::from_slice(&bytes).map_err(|error| {
        format!(
            "TN_OVERLAY_CEF_FRAME_BASELINE_INVALID: could not parse {}: {error}",
            path.display()
        )
    })?;
    if report.schema != "threenative.native-overlay-cef-frame-probe"
        || report.version != "0.1.0"
        || report.mode != "baseline"
        || report.physical_width != physical_width
        || report.physical_height != physical_height
        || report.warmup_frames != config.warmup_frames
        || report.sample_frames != config.sample_frames
        || report.frames.count != config.sample_frames
    {
        return Err(format!(
            "TN_OVERLAY_CEF_FRAME_BASELINE_INVALID: {} does not match the overlay probe policy",
            path.display()
        ));
    }
    Ok(report)
}

pub fn cef_spike_frame_stats(samples_micros: &[u64]) -> Option<CefSpikeFrameStats> {
    if samples_micros.is_empty() {
        return None;
    }
    let mut sorted = samples_micros.to_vec();
    sorted.sort_unstable();
    let percentile_ms = |percentile: f64| {
        let index = ((sorted.len() as f64 * percentile).ceil() as usize).saturating_sub(1);
        sorted[index] as f64 / 1_000.0
    };
    Some(CefSpikeFrameStats {
        count: sorted.len(),
        max_ms: *sorted.last().unwrap() as f64 / 1_000.0,
        mean_ms: sorted.iter().sum::<u64>() as f64 / sorted.len() as f64 / 1_000.0,
        p50_ms: percentile_ms(0.50),
        p95_ms: percentile_ms(0.95),
        p99_ms: percentile_ms(0.99),
    })
}

pub fn compare_cef_spike_frame_stats(
    overlay: &CefSpikeFrameStats,
    baseline: &CefSpikeFrameStats,
) -> CefSpikeFrameDelta {
    CefSpikeFrameDelta {
        mean_ms: overlay.mean_ms - baseline.mean_ms,
        p95_ms: overlay.p95_ms - baseline.p95_ms,
        p99_ms: overlay.p99_ms - baseline.p99_ms,
    }
}

fn route_cef_spike_pointer(
    runtime: NonSend<CefOsrRuntime>,
    buttons: Res<ButtonInput<MouseButton>>,
    mut cursor_moved: EventReader<bevy::window::CursorMoved>,
    mut cursor_left: EventReader<bevy::window::CursorLeft>,
    mut last_position: Local<Option<Vec2>>,
) {
    for event in cursor_moved.read() {
        runtime.send_mouse_move(event.position, false);
        *last_position = Some(event.position);
    }
    if cursor_left.read().next().is_some() {
        runtime.send_mouse_move(last_position.unwrap_or(Vec2::ZERO), true);
    }
    let Some(position) = *last_position else {
        return;
    };
    for button in [MouseButton::Left, MouseButton::Middle, MouseButton::Right] {
        if buttons.just_pressed(button) {
            runtime.send_mouse_button(position, button, false);
        }
        if buttons.just_released(button) {
            runtime.send_mouse_button(position, button, true);
        }
    }
}

fn report_cef_spike_summary(
    mut exits: EventReader<bevy::app::AppExit>,
    runtime: NonSend<CefOsrRuntime>,
    texture: Res<CefSpikeTexture>,
) {
    if exits.read().next().is_none() {
        return;
    }
    let paint = runtime.metrics();
    println!(
        "{}",
        serde_json::json!({
            "schema": "threenative.native-overlay-cef-spike-summary",
            "version": "0.1.0",
            "firstNonblankPaintMs": texture.first_paint_ms,
            "paint": {
                "accepted": paint.accepted,
                "copyP95Micros": percentile_95(&paint.copy_micros),
                "dropped": paint.dropped,
            },
            "upload": {
                "bytes": texture.upload_bytes,
                "count": texture.uploads,
                "p95Micros": percentile_95(&texture.upload_micros),
            },
            "input": {
                "pointerMovesSent": runtime.pointer_moves_sent.get(),
            },
        })
    );
}

fn percentile_95(samples: &[u64]) -> Option<u64> {
    if samples.is_empty() {
        return None;
    }
    let mut samples = samples.to_vec();
    samples.sort_unstable();
    let index = ((samples.len() as f64 * 0.95).ceil() as usize).saturating_sub(1);
    samples.get(index).copied()
}

fn record_bounded_sample(samples: &mut Vec<u64>, sequence: u64, sample: u64) {
    if samples.len() < MAX_METRIC_SAMPLES {
        samples.push(sample);
        return;
    }
    samples[sequence as usize % MAX_METRIC_SAMPLES] = sample;
}

pub fn apply_paint_to_image(image: &mut Image, frame: CefPaintFrame) {
    // Authored texture loading may generate a mip chain for every newly added
    // RGBA image. CEF replaces only the complete base level, so keep this
    // dynamic surface explicitly single-mip before replacing its bytes.
    image.texture_descriptor.mip_level_count = 1;
    image.resize(Extent3d {
        width: frame.width,
        height: frame.height,
        depth_or_array_layers: 1,
    });
    image.data = frame.rgba;
}

pub fn overlay_entry_url(bundle_path: &Path) -> Result<(PathBuf, String), String> {
    let bundle = threenative_loader::load_bundle(bundle_path)
        .map_err(|error| format!("TN_OVERLAY_CEF_RESOURCE_REJECTED: {error}"))?;
    let overlay = bundle
        .overlays
        .as_ref()
        .and_then(|overlays| overlays.overlays.first())
        .ok_or_else(|| {
            "TN_OVERLAY_CEF_RESOURCE_REJECTED: bundle declares no overlay entry".to_string()
        })?;
    let entry = bundle.bundle_path.join(&overlay.entry);
    let canonical = entry.canonicalize().map_err(|error| {
        format!(
            "TN_OVERLAY_CEF_RESOURCE_REJECTED: {}: {error}",
            entry.display()
        )
    })?;
    Ok((canonical.clone(), format!("file://{}", canonical.display())))
}
