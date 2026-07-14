use std::{
    cell::{Cell, RefCell},
    collections::VecDeque,
    path::{Path, PathBuf},
    rc::Rc,
    sync::OnceLock,
    time::{Duration, Instant},
};

use bevy::{
    input::{
        ButtonState,
        keyboard::{Key, KeyboardInput},
        mouse::{MouseScrollUnit, MouseWheel},
    },
    prelude::*,
    render::{
        render_asset::RenderAssetUsages,
        render_resource::{Extent3d, TextureDimension, TextureFormat},
    },
};
use cef::rc::Rc as _;
use cef::{
    App, BeforeDownloadCallback, Browser, BrowserSettings, CefString, Client, CommandLine,
    ContextMenuHandler, DictionaryValue, DisplayHandler, DownloadHandler, DownloadItem, Frame,
    ImplApp, ImplBrowser, ImplBrowserHost, ImplClient, ImplCommandLine, ImplContextMenuHandler,
    ImplDisplayHandler, ImplDownloadHandler, ImplFrame, ImplLifeSpanHandler, ImplListValue,
    ImplMediaAccessCallback, ImplMenuModel, ImplPermissionHandler, ImplPermissionPromptCallback,
    ImplProcessMessage, ImplRenderHandler, ImplRenderProcessHandler, ImplRequest,
    ImplRequestHandler, ImplResourceRequestHandler, ImplSchemeHandlerFactory, ImplSchemeRegistrar,
    ImplV8Context, ImplV8Handler, ImplV8Value, KeyEvent, KeyEventType, LifeSpanHandler,
    LogSeverity, MediaAccessCallback, MenuModel, MouseButtonType, MouseEvent, PermissionHandler,
    PermissionPromptCallback, PermissionRequestResult, PopupFeatures, ProcessId, ProcessMessage,
    Rect, RenderHandler, RenderProcessHandler, Request, RequestHandler, ResourceHandler,
    ResourceRequestHandler, SchemeHandlerFactory, SchemeOptions, SchemeRegistrar, ScreenInfo,
    Settings, TerminationStatus, V8Context, V8Handler, V8Propertyattribute, V8Value, WindowInfo,
    WindowOpenDisposition, WrapApp, WrapClient, WrapContextMenuHandler, WrapDisplayHandler,
    WrapDownloadHandler, WrapLifeSpanHandler, WrapPermissionHandler, WrapRenderHandler,
    WrapRenderProcessHandler, WrapRequestHandler, WrapResourceRequestHandler,
    WrapSchemeHandlerFactory, WrapV8Handler, api_hash, browser_host_create_browser_sync,
    execute_process, initialize, process_message_create, register_scheme_handler_factory, shutdown,
    stream_reader_create_for_file, sys, v8_value_create_function,
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
const DEFAULT_FIRST_PAINT_TIMEOUT: Duration = Duration::from_secs(10);
const CEF_OVERLAY_PROCESS_MESSAGE: &str = "threenative.overlay.send";
const CEF_OVERLAY_SCHEME: &str = "threenative-overlay";
const CEF_OVERLAY_ORIGIN: &str = "threenative-overlay://bundle/";
const CEF_OVERLAY_ORIGIN_PREFIX: &str = "threenative-overlay://";

/// Selects the last mount at the greatest z-index that is both visible and
/// currently claims the pointer. Mount order is stable, so later equal-z
/// surfaces composite above earlier ones just like Bevy UI siblings.
pub fn select_topmost_cef_surface<'a>(
    surfaces: &'a [(&'a str, u32, bool, bool)],
) -> Option<&'a str> {
    surfaces
        .iter()
        .enumerate()
        .filter(|(_, (_, _, visible, claims_pointer))| *visible && *claims_pointer)
        .max_by_key(|(mount_order, (_, z_index, _, _))| (*z_index, *mount_order))
        .map(|(_, (id, _, _, _))| *id)
}

pub fn cef_surface_physical_extent(width: u32, height: u32, scale_factor: f32) -> (u32, u32) {
    let scale_factor = if scale_factor.is_finite() && scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    };
    (
        (width as f32 * scale_factor).round().max(1.0) as u32,
        (height as f32 * scale_factor).round().max(1.0) as u32,
    )
}

pub fn cef_input_position(
    window_position: Vec2,
    bounds: crate::overlay_host::NativeOverlayBounds,
) -> Result<Vec2, String> {
    if !window_position.is_finite() {
        return Err(format!(
            "TN_OVERLAY_CEF_INPUT_MAPPING_INVALID: non-finite window position ({}, {})",
            window_position.x, window_position.y
        ));
    }
    Ok(Vec2::new(
        window_position.x - bounds.x as f32,
        window_position.y - bounds.y as f32,
    ))
}

pub fn cef_process_crash_diagnostic(overlay_id: &str, status: u32, detail: &str) -> String {
    format!("TN_OVERLAY_CEF_PROCESS_CRASHED: overlay={overlay_id:?}, status={status}, {detail}")
}

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
    pub generation: u64,
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
    spare: Option<Vec<u8>>,
}

impl CefPaintQueue {
    pub fn push_bgra_premultiplied(
        &mut self,
        width: u32,
        height: u32,
        bgra: &[u8],
    ) -> Result<(), String> {
        self.push_bgra_premultiplied_for_generation(0, width, height, bgra)
    }

    pub fn push_bgra_premultiplied_for_generation(
        &mut self,
        generation: u64,
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
        let mut rgba = if let Some(frame) = self.latest.take() {
            self.metrics.dropped += 1;
            frame.rgba
        } else {
            self.spare.take().unwrap_or_default()
        };
        rgba.resize(expected, 0);
        let copy_started = Instant::now();
        normalize_bgra_premultiplied_to_rgba_into(bgra, &mut rgba);
        record_bounded_sample(
            &mut self.metrics.copy_micros,
            self.metrics.accepted,
            copy_started.elapsed().as_micros() as u64,
        );
        self.metrics.accepted += 1;
        self.latest = Some(CefPaintFrame {
            generation,
            width,
            height,
            rgba,
        });
        Ok(())
    }

    pub fn take_latest(&mut self) -> Option<CefPaintFrame> {
        self.latest.take()
    }

    pub fn recycle(&mut self, mut rgba: Vec<u8>) {
        rgba.clear();
        if self.spare.is_none() {
            self.spare = Some(rgba);
        }
    }

    pub fn pending_len(&self) -> usize {
        usize::from(self.latest.is_some())
    }

    pub fn metrics(&self) -> CefPaintQueueMetrics {
        self.metrics.clone()
    }
}

pub fn normalize_bgra_premultiplied_to_rgba(bgra: &[u8]) -> Vec<u8> {
    let mut rgba = vec![0; bgra.len()];
    normalize_bgra_premultiplied_to_rgba_into(bgra, &mut rgba);
    rgba
}

fn normalize_bgra_premultiplied_to_rgba_into(bgra: &[u8], rgba: &mut [u8]) {
    let table = unpremultiply_table();
    for (pixel, output) in bgra.chunks_exact(4).zip(rgba.chunks_exact_mut(4)) {
        let alpha = pixel[3];
        output[0] = table[alpha as usize][pixel[2] as usize];
        output[1] = table[alpha as usize][pixel[1] as usize];
        output[2] = table[alpha as usize][pixel[0] as usize];
        output[3] = alpha;
    }
}

fn unpremultiply_table() -> &'static [[u8; 256]] {
    static TABLE: OnceLock<Vec<[u8; 256]>> = OnceLock::new();
    TABLE.get_or_init(|| {
        (0..=u8::MAX)
            .map(|alpha| std::array::from_fn(|channel| unpremultiply(channel as u8, alpha)))
            .collect()
    })
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
        generation: Rc<Cell<u64>>,
        scale_factor: Rc<Cell<f32>>,
    }

    impl RenderHandler {
        fn view_rect(&self, _browser: Option<&mut Browser>, rect: Option<&mut Rect>) {
            if let Some(rect) = rect {
                rect.width = self.width.get();
                rect.height = self.height.get();
            }
        }

        fn screen_info(
            &self,
            _browser: Option<&mut Browser>,
            screen_info: Option<&mut ScreenInfo>,
        ) -> i32 {
            if let Some(screen_info) = screen_info {
                screen_info.device_scale_factor = self.scale_factor.get();
            }
            1
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
            let (expected_width, expected_height) = cef_surface_physical_extent(
                self.width.get().max(1) as u32,
                self.height.get().max(1) as u32,
                self.scale_factor.get(),
            );
            if width != expected_width as i32 || height != expected_height as i32 {
                return;
            }
            let length = width as usize * height as usize * 4;
            let bytes = unsafe { std::slice::from_raw_parts(buffer, length) };
            let _ = self.queue.borrow_mut().push_bgra_premultiplied_for_generation(
                self.generation.get(),
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
        fn on_before_popup(
            &self,
            _browser: Option<&mut Browser>,
            _frame: Option<&mut cef::Frame>,
            _popup_id: i32,
            target_url: Option<&CefString>,
            _target_frame_name: Option<&CefString>,
            _target_disposition: WindowOpenDisposition,
            _user_gesture: i32,
            _popup_features: Option<&PopupFeatures>,
            _window_info: Option<&mut WindowInfo>,
            _client: Option<&mut Option<Client>>,
            _settings: Option<&mut BrowserSettings>,
            _extra_info: Option<&mut Option<DictionaryValue>>,
            _no_javascript_access: Option<&mut i32>,
        ) -> i32 {
            eprintln!(
                "TN_OVERLAY_CEF_RESOURCE_REJECTED: {}: new windows are disabled",
                target_url.map(ToString::to_string).unwrap_or_default()
            );
            1
        }

        fn on_before_close(&self, _browser: Option<&mut Browser>) {
            self.closed.set(true);
        }
    }
}

cef::wrap_resource_request_handler! {
    struct CefDeniedResourceRequestHandler {}

    impl ResourceRequestHandler {}
}

cef::wrap_request_handler! {
    struct CefOverlayRequestHandler {
        crash_queue: Rc<RefCell<VecDeque<String>>>,
        overlay_id: String,
    }

    impl RequestHandler {
        fn on_before_browse(
            &self,
            _browser: Option<&mut Browser>,
            _frame: Option<&mut cef::Frame>,
            request: Option<&mut Request>,
            _user_gesture: i32,
            _is_redirect: i32,
        ) -> i32 {
            let url = request
                .map(|request| CefString::from(&request.url()).to_string())
                .unwrap_or_default();
            i32::from(!cef_overlay_url_allowed(&url))
        }

        fn on_open_urlfrom_tab(
            &self,
            _browser: Option<&mut Browser>,
            _frame: Option<&mut cef::Frame>,
            _target_url: Option<&CefString>,
            _target_disposition: WindowOpenDisposition,
            _user_gesture: i32,
        ) -> i32 {
            1
        }

        fn resource_request_handler(
            &self,
            _browser: Option<&mut Browser>,
            _frame: Option<&mut cef::Frame>,
            request: Option<&mut Request>,
            _is_navigation: i32,
            _is_download: i32,
            _request_initiator: Option<&CefString>,
            disable_default_handling: Option<&mut i32>,
        ) -> Option<ResourceRequestHandler> {
            let url = request
                .map(|request| CefString::from(&request.url()).to_string())
                .unwrap_or_default();
            if cef_overlay_url_allowed(&url) {
                return None;
            }
            if let Some(disable_default_handling) = disable_default_handling {
                *disable_default_handling = 1;
            }
            eprintln!(
                "TN_OVERLAY_CEF_RESOURCE_REJECTED: {url}: remote and external resource loads are disabled"
            );
            Some(CefDeniedResourceRequestHandler::new())
        }

        fn on_render_process_terminated(
            &self,
            _browser: Option<&mut Browser>,
            status: TerminationStatus,
            error_code: i32,
            error_string: Option<&CefString>,
        ) {
            let detail = format!(
                "errorCode={error_code}, {}",
                error_string.map(ToString::to_string).unwrap_or_else(|| "renderer exited".to_string())
            );
            self.crash_queue.borrow_mut().push_back(cef_process_crash_diagnostic(
                &self.overlay_id,
                status.get_raw(),
                &detail,
            ));
        }
    }
}

cef::wrap_context_menu_handler! {
    struct CefDeniedContextMenuHandler {}

    impl ContextMenuHandler {
        fn on_before_context_menu(
            &self,
            _browser: Option<&mut Browser>,
            _frame: Option<&mut Frame>,
            _params: Option<&mut cef::ContextMenuParams>,
            model: Option<&mut MenuModel>,
        ) {
            if let Some(model) = model {
                model.clear();
            }
        }
    }
}

cef::wrap_client! {
    struct CefSpikeClient {
        render_handler: RenderHandler,
        life_span_handler: LifeSpanHandler,
        display_handler: DisplayHandler,
        download_handler: DownloadHandler,
        permission_handler: PermissionHandler,
        request_handler: RequestHandler,
        context_menu_handler: ContextMenuHandler,
        ipc_queue: Rc<RefCell<VecDeque<String>>>,
    }

    impl Client {
        fn render_handler(&self) -> Option<RenderHandler> {
            Some(self.render_handler.clone())
        }

        fn life_span_handler(&self) -> Option<LifeSpanHandler> {
            Some(self.life_span_handler.clone())
        }

        fn request_handler(&self) -> Option<RequestHandler> {
            Some(self.request_handler.clone())
        }


        fn context_menu_handler(&self) -> Option<ContextMenuHandler> {
            Some(self.context_menu_handler.clone())
        }

        fn display_handler(&self) -> Option<DisplayHandler> {
            Some(self.display_handler.clone())
        }

        fn download_handler(&self) -> Option<DownloadHandler> {
            Some(self.download_handler.clone())
        }

        fn permission_handler(&self) -> Option<PermissionHandler> {
            Some(self.permission_handler.clone())
        }

        fn on_process_message_received(
            &self,
            _browser: Option<&mut Browser>,
            _frame: Option<&mut Frame>,
            source_process: ProcessId,
            message: Option<&mut ProcessMessage>,
        ) -> i32 {
            if source_process != ProcessId::RENDERER {
                return 0;
            }
            let Some(message) = message else {
                return 0;
            };
            if CefString::from(&message.name()).to_string() != CEF_OVERLAY_PROCESS_MESSAGE {
                return 0;
            }
            let Some(arguments) = message.argument_list() else {
                return 1;
            };
            let payload = CefString::from(&arguments.string(0)).to_string();
            let mut queue = self.ipc_queue.borrow_mut();
            if queue.len() == MAX_PENDING_BRIDGE_MESSAGES {
                queue.pop_front();
            }
            queue.push_back(payload);
            1
        }
    }
}

cef::wrap_download_handler! {
    struct CefDeniedDownloadHandler {}

    impl DownloadHandler {
        fn can_download(
            &self,
            _browser: Option<&mut Browser>,
            _url: Option<&CefString>,
            _request_method: Option<&CefString>,
        ) -> i32 {
            0
        }

        fn on_before_download(
            &self,
            _browser: Option<&mut Browser>,
            _download_item: Option<&mut DownloadItem>,
            _suggested_name: Option<&CefString>,
            _callback: Option<&mut BeforeDownloadCallback>,
        ) -> i32 {
            eprintln!("TN_OVERLAY_CEF_RESOURCE_REJECTED: downloads are disabled");
            1
        }
    }
}

cef::wrap_permission_handler! {
    struct CefDeniedPermissionHandler {}

    impl PermissionHandler {
        fn on_request_media_access_permission(
            &self,
            _browser: Option<&mut Browser>,
            _frame: Option<&mut Frame>,
            _requesting_origin: Option<&CefString>,
            _requested_permissions: u32,
            callback: Option<&mut MediaAccessCallback>,
        ) -> i32 {
            if let Some(callback) = callback {
                callback.cancel();
            }
            eprintln!("TN_OVERLAY_CEF_RESOURCE_REJECTED: media permissions are disabled");
            1
        }

        fn on_show_permission_prompt(
            &self,
            _browser: Option<&mut Browser>,
            _prompt_id: u64,
            _requesting_origin: Option<&CefString>,
            _requested_permissions: u32,
            callback: Option<&mut PermissionPromptCallback>,
        ) -> i32 {
            if let Some(callback) = callback {
                callback.cont(PermissionRequestResult::DENY);
            }
            eprintln!("TN_OVERLAY_CEF_RESOURCE_REJECTED: browser permissions are disabled");
            1
        }
    }
}

cef::wrap_display_handler! {
    struct CefSpikeDisplayHandler {}

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
            eprintln!("TN_OVERLAY_CEF_CONSOLE: {level:?}: {message_text} ({source:?}:{line})");
            1
        }
    }
}

cef::wrap_v8_handler! {
    struct CefOverlayV8Handler {
        frame: Frame,
    }

    impl V8Handler {
        fn execute(
            &self,
            name: Option<&CefString>,
            _object: Option<&mut V8Value>,
            arguments: Option<&[Option<V8Value>]>,
            _retval: Option<&mut Option<V8Value>>,
            exception: Option<&mut CefString>,
        ) -> i32 {
            if name.map(ToString::to_string).as_deref() != Some("__threenativeOverlaySend") {
                return 0;
            }
            let payload = arguments
                .and_then(|arguments| arguments.first())
                .and_then(Option::as_ref)
                .filter(|value| value.is_string() == 1)
                .map(|value| CefString::from(&value.string_value()).to_string());
            let Some(payload) = payload else {
                if let Some(exception) = exception {
                    *exception = "ThreeNative overlay messages must be JSON strings".into();
                }
                return 1;
            };
            let Some(mut message) = process_message_create(Some(&CEF_OVERLAY_PROCESS_MESSAGE.into())) else {
                if let Some(exception) = exception {
                    *exception = "ThreeNative could not allocate an overlay process message".into();
                }
                return 1;
            };
            if let Some(arguments) = message.argument_list() {
                arguments.set_string(0, Some(&payload.as_str().into()));
                self.frame
                    .send_process_message(ProcessId::BROWSER, Some(&mut message));
            }
            1
        }
    }
}

cef::wrap_render_process_handler! {
    struct CefOverlayRenderProcessHandler {}

    impl RenderProcessHandler {
        fn on_context_created(
            &self,
            _browser: Option<&mut Browser>,
            frame: Option<&mut Frame>,
            context: Option<&mut V8Context>,
        ) {
            let (Some(frame), Some(context)) = (frame, context) else {
                return;
            };
            if frame.is_main() != 1 {
                return;
            }
            let Some(global) = context.global() else {
                return;
            };
            let mut handler = CefOverlayV8Handler::new(frame.clone());
            let Some(mut function) = v8_value_create_function(
                Some(&"__threenativeOverlaySend".into()),
                Some(&mut handler),
            ) else {
                return;
            };
            global.set_value_bykey(
                Some(&"__threenativeOverlaySend".into()),
                Some(&mut function),
                V8Propertyattribute::default(),
            );
        }
    }
}

cef::wrap_scheme_handler_factory! {
    struct CefOverlaySchemeHandlerFactory {
        origin: String,
        resource_root: PathBuf,
    }

    impl SchemeHandlerFactory {
        fn create(
            &self,
            _browser: Option<&mut Browser>,
            _frame: Option<&mut cef::Frame>,
            _scheme_name: Option<&CefString>,
            request: Option<&mut Request>,
        ) -> Option<ResourceHandler> {
            let request_url = request.map(|request| CefString::from(&request.url()).to_string())?;
            let (path, mime_type) = match resolve_cef_overlay_resource_from_origin(
                &self.resource_root,
                &self.origin,
                &request_url,
            ) {
                Ok(resource) => resource,
                Err(error) => {
                    eprintln!("{error}");
                    return None;
                }
            };
            let stream = stream_reader_create_for_file(Some(&path.to_string_lossy().as_ref().into()))?;
            Some(
                cef::wrapper::stream_resource_handler::StreamResourceHandler::new_with_stream(
                    mime_type.to_string(),
                    stream,
                ),
            )
        }
    }
}

cef::wrap_app! {
    struct CefSpikeApp {
        render_process_handler: RenderProcessHandler,
    }

    impl App {
        fn render_process_handler(&self) -> Option<RenderProcessHandler> {
            Some(self.render_process_handler.clone())
        }
        fn on_register_custom_schemes(&self, registrar: Option<&mut SchemeRegistrar>) {
            let Some(registrar) = registrar else {
                return;
            };
            let options = SchemeOptions::STANDARD.get_raw()
                | SchemeOptions::SECURE.get_raw()
                | SchemeOptions::CORS_ENABLED.get_raw()
                | SchemeOptions::FETCH_ENABLED.get_raw();
            if registrar.add_custom_scheme(Some(&CEF_OVERLAY_SCHEME.into()), options as i32) == 0 {
                eprintln!(
                    "TN_OVERLAY_CEF_INIT_FAILED: could not register {CEF_OVERLAY_SCHEME} scheme"
                );
            }
        }

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
    let mut app = CefSpikeApp::new(CefOverlayRenderProcessHandler::new());
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
    crash_queue: Rc<RefCell<VecDeque<String>>>,
    delivered_sequence: u64,
    input_policy: crate::overlay::NativeOverlayInputPolicy,
    input_regions: Vec<crate::overlay_host::NativeOverlayBounds>,
    ipc_queue: Rc<RefCell<VecDeque<String>>>,
    modal_probe_expected_transitions: usize,
    overlay_id: String,
    pointer_moves_sent: Cell<u64>,
    queue: Rc<RefCell<CefPaintQueue>>,
    process_started_at: Instant,
    spike_scenario_result: Option<Result<usize, String>>,
    surface_generation: Rc<Cell<u64>>,
    surface_height: Rc<Cell<i32>>,
    surface_width: Rc<Cell<i32>>,
    scale_factor: Rc<Cell<f32>>,
    visible: bool,
    shutdown_on_drop: bool,
    render_timeout_reported: bool,
}

pub struct CefBundleSurfaceInit<'a> {
    pub cache_path: &'a Path,
    pub entry_name: &'a str,
    pub height: u32,
    pub overlay_id: String,
    pub process_started_at: Instant,
    pub resource_root: &'a Path,
    pub width: u32,
}

pub struct CefOsrHost {
    pub surfaces: Vec<CefOsrRuntime>,
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
        Self::initialize_with_resource_root(
            url,
            width,
            height,
            cache_path,
            process_started_at,
            overlay_id,
            None,
        )
    }

    pub fn initialize_bundle(
        resource_root: &Path,
        entry_name: &str,
        width: u32,
        height: u32,
        cache_path: &Path,
        process_started_at: Instant,
        overlay_id: String,
    ) -> Result<Self, String> {
        if Path::new(entry_name).components().count() != 1 {
            return Err(cef_resource_rejected(
                entry_name,
                "pass an entry filename below the declared overlay root",
            ));
        }
        Self::initialize_with_resource_root(
            &format!("{CEF_OVERLAY_ORIGIN}{entry_name}"),
            width,
            height,
            cache_path,
            process_started_at,
            overlay_id,
            Some(resource_root),
        )
    }

    fn initialize_with_resource_root(
        url: &str,
        width: u32,
        height: u32,
        cache_path: &Path,
        process_started_at: Instant,
        overlay_id: String,
        resource_root: Option<&Path>,
    ) -> Result<Self, String> {
        initialize_cef(cache_path)?;
        if let Some(resource_root) = resource_root {
            let canonical_root = match resource_root.canonicalize() {
                Ok(root) => root,
                Err(error) => {
                    shutdown();
                    return Err(cef_resource_rejected(
                        &resource_root.display().to_string(),
                        &format!("make the declared overlay root readable: {error}"),
                    ));
                }
            };
            let mut factory =
                CefOverlaySchemeHandlerFactory::new(CEF_OVERLAY_ORIGIN.to_string(), canonical_root);
            if register_scheme_handler_factory(
                Some(&CEF_OVERLAY_SCHEME.into()),
                Some(&"bundle".into()),
                Some(&mut factory),
            ) == 0
            {
                shutdown();
                return Err(format!(
                    "TN_OVERLAY_CEF_INIT_FAILED: could not install {CEF_OVERLAY_SCHEME} resource handler"
                ));
            }
        }

        Self::create_browser(url, width, height, process_started_at, overlay_id, true)
    }

    fn create_browser(
        url: &str,
        width: u32,
        height: u32,
        process_started_at: Instant,
        overlay_id: String,
        shutdown_on_drop: bool,
    ) -> Result<Self, String> {
        let queue = Rc::new(RefCell::new(CefPaintQueue::default()));
        let ipc_queue = Rc::new(RefCell::new(VecDeque::new()));
        let crash_queue = Rc::new(RefCell::new(VecDeque::new()));
        let closed = Rc::new(Cell::new(false));
        let surface_generation = Rc::new(Cell::new(0));
        let surface_width = Rc::new(Cell::new(width as i32));
        let surface_height = Rc::new(Cell::new(height as i32));
        let scale_factor = Rc::new(Cell::new(1.0));
        let render_handler = CefSpikeRenderHandler::new(
            queue.clone(),
            surface_width.clone(),
            surface_height.clone(),
            surface_generation.clone(),
            scale_factor.clone(),
        );
        let life_span_handler = CefSpikeLifeSpanHandler::new(closed.clone());
        let display_handler = CefSpikeDisplayHandler::new();
        let download_handler = CefDeniedDownloadHandler::new();
        let permission_handler = CefDeniedPermissionHandler::new();
        let request_handler =
            CefOverlayRequestHandler::new(crash_queue.clone(), overlay_id.clone());
        let context_menu_handler = CefDeniedContextMenuHandler::new();
        let mut client = CefSpikeClient::new(
            render_handler,
            life_span_handler,
            display_handler,
            download_handler,
            permission_handler,
            request_handler,
            context_menu_handler,
            ipc_queue.clone(),
        );
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
            "TN_OVERLAY_CEF_INIT_FAILED: windowless browser creation failed".to_string()
        })?;

        Ok(Self {
            browser: Some(browser),
            bridge_injected: false,
            closed,
            crash_queue,
            delivered_sequence: 0,
            input_policy: crate::overlay::native_overlay_input_policy("modal"),
            input_regions: Vec::new(),
            ipc_queue,
            modal_probe_expected_transitions: 10,
            overlay_id,
            pointer_moves_sent: Cell::new(0),
            queue,
            process_started_at,
            spike_scenario_result: None,
            surface_generation,
            surface_height,
            surface_width,
            scale_factor,
            visible: true,
            shutdown_on_drop,
            render_timeout_reported: false,
        })
    }

    pub fn pump(&mut self) {
        cef::do_message_loop_work();
    }

    pub fn take_latest_paint(&mut self) -> Option<CefPaintFrame> {
        self.queue.borrow_mut().take_latest()
    }

    pub fn recycle_paint_buffer(&mut self, rgba: Vec<u8>) {
        self.queue.borrow_mut().recycle(rgba);
    }

    pub fn metrics(&self) -> CefPaintQueueMetrics {
        self.queue.borrow().metrics()
    }

    pub fn startup_elapsed(&self) -> Duration {
        self.process_started_at.elapsed()
    }

    pub fn surface_generation(&self) -> u64 {
        self.surface_generation.get()
    }

    pub fn resize(&mut self, width: u32, height: u32, scale_factor: f32) -> bool {
        let width = width.max(1) as i32;
        let height = height.max(1) as i32;
        let scale_factor = if scale_factor.is_finite() && scale_factor > 0.0 {
            scale_factor
        } else {
            1.0
        };
        if self.surface_width.get() == width
            && self.surface_height.get() == height
            && (self.scale_factor.get() - scale_factor).abs() < f32::EPSILON
        {
            return false;
        }
        self.surface_width.set(width);
        self.surface_height.set(height);
        let scale_changed =
            (self.scale_factor.replace(scale_factor) - scale_factor).abs() >= f32::EPSILON;
        self.surface_generation
            .set(self.surface_generation.get().saturating_add(1));
        self.queue.borrow_mut().latest = None;
        if let Some(host) = self.browser.as_ref().and_then(ImplBrowser::host) {
            if scale_changed {
                host.notify_screen_info_changed();
            }
            host.was_resized();
        }
        true
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
            self.modal_probe_expected_transitions =
                std::env::var("TN_OVERLAY_CEF_MODAL_TRANSITIONS")
                    .ok()
                    .and_then(|value| value.parse::<usize>().ok())
                    .filter(|value| (1..=1_000).contains(value))
                    .unwrap_or(10);
            let script = cef_modal_probe_script(self.modal_probe_expected_transitions);
            frame.execute_java_script(Some(&script.as_str().into()), None, 0);
        }
        self.bridge_injected = true;
        Ok(())
    }

    fn drain_ipc(&mut self) -> Vec<String> {
        self.ipc_queue.borrow_mut().drain(..).collect()
    }

    fn drain_crashes(&mut self) -> Vec<String> {
        self.crash_queue.borrow_mut().drain(..).collect()
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

    fn claims_pointer(&self, position: Vec2) -> bool {
        if !self.visible || !self.input_policy.captures_pointer {
            return false;
        }
        if self.input_policy.modal {
            return true;
        }
        self.input_regions.iter().any(|region| {
            position.x >= region.x as f32
                && position.y >= region.y as f32
                && position.x < region.x.saturating_add(region.width) as f32
                && position.y < region.y.saturating_add(region.height) as f32
        })
    }

    pub fn send_mouse_move(&self, position: Vec2, mouse_leave: bool) {
        if !self.claims_pointer(position) && !mouse_leave {
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
        if !self.claims_pointer(position) {
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

    pub fn send_mouse_wheel(&self, position: Vec2, delta: Vec2) {
        if !self.claims_pointer(position) {
            return;
        }
        let Some(host) = self.browser.as_ref().and_then(ImplBrowser::host) else {
            return;
        };
        host.send_mouse_wheel_event(
            Some(&MouseEvent {
                x: position.x.round() as i32,
                y: position.y.round() as i32,
                modifiers: 0,
            }),
            delta.x.round() as i32,
            delta.y.round() as i32,
        );
    }

    pub fn send_keyboard_input(&self, event: &KeyboardInput) {
        if !self.visible || !self.input_policy.captures_keyboard {
            return;
        }
        let Some(host) = self.browser.as_ref().and_then(ImplBrowser::host) else {
            return;
        };
        let (windows_key_code, character) = cef_key_values(&event.logical_key);
        let pressed = event.state == ButtonState::Pressed;
        host.send_key_event(Some(&KeyEvent {
            type_: if pressed {
                KeyEventType::RAWKEYDOWN
            } else {
                KeyEventType::KEYUP
            },
            windows_key_code,
            native_key_code: windows_key_code,
            character,
            unmodified_character: character,
            ..Default::default()
        }));
        if pressed && character != 0 {
            host.send_key_event(Some(&KeyEvent {
                type_: KeyEventType::CHAR,
                windows_key_code,
                native_key_code: windows_key_code,
                character,
                unmodified_character: character,
                ..Default::default()
            }));
        }
    }

    pub fn send_focus(&self, focused: bool) {
        if let Some(host) = self.browser.as_ref().and_then(ImplBrowser::host) {
            host.set_focus(i32::from(focused && self.visible));
            if !focused {
                host.send_capture_lost_event();
            }
        }
    }

    fn captures_keyboard(&self) -> bool {
        self.visible && self.input_policy.captures_keyboard
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

    pub fn set_input_policy(&mut self, policy: crate::overlay::NativeOverlayInputPolicy) {
        self.input_policy = policy;
    }

    fn set_visible(&mut self, visible: bool) {
        self.visible = visible;
        if let Some(host) = self.browser.as_ref().and_then(ImplBrowser::host) {
            host.was_hidden(i32::from(!visible));
        }
    }
}

impl CefOsrHost {
    pub fn initialize_bundles(requests: &[CefBundleSurfaceInit<'_>]) -> Result<Self, String> {
        let Some(first) = requests.first() else {
            return Err(
                "TN_OVERLAY_CEF_INIT_FAILED: no desktop overlay surfaces were declared".to_string(),
            );
        };
        initialize_cef(first.cache_path)?;
        let initialized = (|| {
            let mut surfaces = Vec::with_capacity(requests.len());
            for (mount_order, request) in requests.iter().enumerate() {
                if Path::new(request.entry_name).components().count() != 1 {
                    return Err(cef_resource_rejected(
                        request.entry_name,
                        "pass an entry filename below the declared overlay root",
                    ));
                }
                let canonical_root = request.resource_root.canonicalize().map_err(|error| {
                    cef_resource_rejected(
                        &request.resource_root.display().to_string(),
                        &format!("make the declared overlay root readable: {error}"),
                    )
                })?;
                let domain = format!("surface-{mount_order}");
                let origin = format!("{CEF_OVERLAY_ORIGIN_PREFIX}{domain}/");
                let mut factory =
                    CefOverlaySchemeHandlerFactory::new(origin.clone(), canonical_root);
                if register_scheme_handler_factory(
                    Some(&CEF_OVERLAY_SCHEME.into()),
                    Some(&domain.as_str().into()),
                    Some(&mut factory),
                ) == 0
                {
                    return Err(format!(
                        "TN_OVERLAY_CEF_INIT_FAILED: could not install resource handler for overlay {:?}",
                        request.overlay_id
                    ));
                }
                surfaces.push(CefOsrRuntime::create_browser(
                    &format!("{origin}{}", request.entry_name),
                    request.width,
                    request.height,
                    request.process_started_at,
                    request.overlay_id.clone(),
                    false,
                )?);
            }
            Ok(surfaces)
        })();
        match initialized {
            Ok(surfaces) => Ok(Self { surfaces }),
            Err(error) => {
                shutdown();
                Err(error)
            }
        }
    }
}

fn initialize_cef(cache_path: &Path) -> Result<(), String> {
    let _ = unpremultiply_table();
    std::fs::create_dir_all(cache_path).map_err(|error| {
        format!(
            "TN_OVERLAY_CEF_INIT_FAILED: could not create cache {}: {error}",
            cache_path.display()
        )
    })?;
    let _ = api_hash(sys::CEF_API_VERSION_LAST, 0);
    let args = cef::args::Args::new();
    let mut app = CefSpikeApp::new(CefOverlayRenderProcessHandler::new());
    let settings = Settings {
        no_sandbox: 0,
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
    Ok(())
}

pub fn cef_key_values(key: &Key) -> (i32, u16) {
    if let Key::Character(value) = key {
        let character = value.encode_utf16().next().unwrap_or(0);
        let key_code = value
            .chars()
            .next()
            .map(|value| value.to_ascii_uppercase() as i32)
            .unwrap_or(0);
        return (key_code, character);
    }
    let key_code = match key {
        Key::Enter => 13,
        Key::Tab => 9,
        Key::Space => 32,
        Key::ArrowLeft => 37,
        Key::ArrowUp => 38,
        Key::ArrowRight => 39,
        Key::ArrowDown => 40,
        Key::Backspace => 8,
        Key::Delete => 46,
        Key::Home => 36,
        Key::End => 35,
        Key::PageUp => 33,
        Key::PageDown => 34,
        Key::Escape => 27,
        _ => 0,
    };
    (key_code, 0)
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
           const transitionCount = 10;
           (await waitFor(() => button("Play Black"), "Play Black button")).click();
           await waitFor(() => button("Settings"), "Settings button");
           for (let transition = 0; transition < transitionCount; transition += 1) {
             button("Settings").click();
             await waitFor(() => document.querySelector("[role='dialog']"), "settings dialog");
             await delay(100);
             (await waitFor(() => button("Done"), "Done button")).click();
             await waitFor(() => document.querySelector("[role='dialog']") === null, "settings removal");
             await delay(100);
           }
           await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
           if (transitionCount >= 100) await delay(5000);
           window.threenativeOverlayBridge.send("overlay:spike-modal-probe", { completed: true, transitions: transitionCount });
         } catch (error) {
           window.threenativeOverlayBridge.send("overlay:spike-modal-probe", { completed: false, error: String(error) });
         }
       })();"#
}

pub fn cef_modal_probe_script(transitions: usize) -> String {
    cef_spike_modal_probe_script().replace(
        "transitionCount = 10",
        &format!("transitionCount = {transitions}"),
    )
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
              window.__threenativeOverlaySend(JSON.stringify({ overlayId, type, payload }));
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
          let inputRegionFrame = 0;
          const reportInputRegions = () => {
            cancelAnimationFrame(inputRegionFrame);
            inputRegionFrame = requestAnimationFrame(() => {
              const regions = Array.from(document.querySelectorAll(
                "[data-threenative-interactive],button,a,input,select,textarea,[role='button'],[tabindex]"
              )).filter((element) => {
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                return style.display !== "none" && style.visibility !== "hidden"
                  && style.pointerEvents !== "none" && rect.width > 0 && rect.height > 0;
              }).map((element) => {
                const rect = element.getBoundingClientRect();
                return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
              });
              window.threenativeOverlayBridge.send("overlay:set-input-regions", { regions });
            });
          };
          new MutationObserver(reportInputRegions).observe(document.documentElement, {
            attributes: true, childList: true, subtree: true
          });
          new ResizeObserver(reportInputRegions).observe(document.documentElement);
          reportInputRegions();
          window.dispatchEvent(new Event("threenative:bridge-ready"));
        })();"#
        .replace("__OVERLAY_ID__", &overlay_id))
}

impl Drop for CefOsrRuntime {
    fn drop(&mut self) {
        self.close_browser();
        if self.shutdown_on_drop {
            shutdown();
        }
    }
}

impl CefOsrRuntime {
    fn close_browser(&mut self) {
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
    }
}

impl Drop for CefOsrHost {
    fn drop(&mut self) {
        for surface in &mut self.surfaces {
            surface.close_browser();
        }
        shutdown();
    }
}

pub struct CefSurfaceTexture {
    pub overlay_id: String,
    pub bounds: crate::overlay_host::NativeOverlayBounds,
    pub entity: Entity,
    pub fills_window: bool,
    pub generation: u64,
    pub handle: Handle<Image>,
    pub first_paint_ms: Option<f64>,
    pub upload_bytes: u64,
    pub upload_micros: Vec<u64>,
    pub uploads: u64,
    pub z_index: u32,
}

#[derive(Resource)]
pub struct CefSurfaceTextures(pub Vec<CefSurfaceTexture>);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CefSurfaceConfig {
    pub bounds: crate::overlay_host::NativeOverlayBounds,
    pub fills_window: bool,
    pub z_index: u32,
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

pub fn install_cef_surfaces(
    app: &mut bevy::prelude::App,
    host: CefOsrHost,
    overlays: OverlaysIr,
    configs: Vec<CefSurfaceConfig>,
) {
    assert_eq!(host.surfaces.len(), configs.len());
    let hidden_fallback_roots = hide_native_ui_fallback_for_cef(app.world_mut());
    info!(
        "TN_OVERLAY_CEF_FALLBACK_HIDDEN: hid {hidden_fallback_roots} retained native UI root(s) after successful CEF initialization"
    );
    let mut textures = Vec::with_capacity(configs.len());
    for (runtime, config) in host.surfaces.iter().zip(configs) {
        let image = Image::new_fill(
            Extent3d {
                width: config.bounds.width,
                height: config.bounds.height,
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
                    left: Val::Px(config.bounds.x as f32),
                    top: Val::Px(config.bounds.y as f32),
                    width: Val::Px(config.bounds.width as f32),
                    height: Val::Px(config.bounds.height as f32),
                    ..Default::default()
                },
                image: UiImage::new(handle.clone()),
                z_index: ZIndex::Global(config.z_index.min(i32::MAX as u32) as i32),
                ..Default::default()
            })
            .id();
        textures.push(CefSurfaceTexture {
            overlay_id: runtime.overlay_id.clone(),
            bounds: config.bounds,
            entity,
            fills_window: config.fills_window,
            generation: runtime.surface_generation(),
            handle,
            first_paint_ms: None,
            upload_bytes: 0,
            upload_micros: Vec::new(),
            uploads: 0,
            z_index: config.z_index,
        });
    }
    app.insert_resource(CefSurfaceTextures(textures));
    app.insert_resource(crate::overlay_host::NativeOverlayRenderReadiness {
        ready_surface_ids: Vec::new(),
        surface_count: host.surfaces.len(),
    });
    app.insert_resource(crate::overlay_host::NativeOverlayBridgeResource::new(
        overlays,
    ));
    app.init_resource::<crate::overlay_host::NativeOverlayInputCapture>();
    app.insert_non_send_resource(host);
    app.add_systems(
        PreUpdate,
        route_cef_spike_input.before(crate::input::capture_native_input),
    );
    app.add_systems(
        Update,
        (
            resize_cef_spike_surface.before(pump_cef_spike_surface),
            pump_cef_spike_surface.before(crate::run_scripted_runtime_systems),
            deliver_cef_spike_snapshots.after(crate::run_scripted_runtime_systems),
        ),
    );
    app.add_systems(Last, report_cef_spike_summary);
}

fn resize_cef_spike_surface(
    mut host: NonSendMut<CefOsrHost>,
    mut textures: ResMut<CefSurfaceTextures>,
    windows: Query<&Window, With<bevy::window::PrimaryWindow>>,
    mut images: ResMut<Assets<Image>>,
    mut styles: Query<&mut Style>,
) {
    let Ok(window) = windows.get_single() else {
        return;
    };
    let width = window.width().max(1.0).round() as u32;
    let height = window.height().max(1.0).round() as u32;
    let scale_factor = window.scale_factor() as f32;
    for (runtime, texture) in host.surfaces.iter_mut().zip(&mut textures.0) {
        let logical_width = if texture.fills_window {
            width
        } else {
            texture.bounds.width
        };
        let logical_height = if texture.fills_window {
            height
        } else {
            texture.bounds.height
        };
        if !runtime.resize(logical_width, logical_height, scale_factor) {
            continue;
        }
        texture.generation = runtime.surface_generation();
        if texture.fills_window {
            texture.bounds.width = width;
            texture.bounds.height = height;
        }
        let (physical_width, physical_height) =
            cef_surface_physical_extent(logical_width, logical_height, scale_factor);
        if let Some(image) = images.get_mut(&texture.handle) {
            image.resize(Extent3d {
                width: physical_width,
                height: physical_height,
                depth_or_array_layers: 1,
            });
            image.data.fill(0);
        }
        if let Ok(mut style) = styles.get_mut(texture.entity) {
            style.width = Val::Px(width as f32);
            style.height = Val::Px(height as f32);
        }
        info!(
            "TN_OVERLAY_CEF_SURFACE_RESIZED: overlay={:?}, generation={}, viewport={}x{}",
            runtime.overlay_id, texture.generation, logical_width, logical_height
        );
    }
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
    mut host: NonSendMut<CefOsrHost>,
    mut bridge: ResMut<crate::overlay_host::NativeOverlayBridgeResource>,
    mut textures: ResMut<CefSurfaceTextures>,
    mut images: ResMut<Assets<Image>>,
    mut visibility: Query<&mut Visibility>,
    mut exits: EventWriter<bevy::app::AppExit>,
    mut render_readiness: ResMut<crate::overlay_host::NativeOverlayRenderReadiness>,
) {
    cef::do_message_loop_work();
    for (runtime, texture) in host.surfaces.iter_mut().zip(&mut textures.0) {
        pump_cef_surface(
            runtime,
            texture,
            &mut bridge,
            &mut images,
            &mut visibility,
            &mut exits,
        );
    }
    render_readiness.ready_surface_ids = textures
        .0
        .iter()
        .filter(|texture| texture.first_paint_ms.is_some())
        .map(|texture| texture.overlay_id.clone())
        .collect();
}

fn pump_cef_surface(
    runtime: &mut CefOsrRuntime,
    texture: &mut CefSurfaceTexture,
    bridge: &mut crate::overlay_host::NativeOverlayBridgeResource,
    images: &mut Assets<Image>,
    visibility: &mut Query<&mut Visibility>,
    exits: &mut EventWriter<bevy::app::AppExit>,
) {
    drain_cef_spike_ipc(runtime, bridge);
    for crash in runtime.drain_crashes() {
        error!("{crash}");
        exits.send(bevy::app::AppExit::error());
    }
    if texture.first_paint_ms.is_none()
        && !runtime.render_timeout_reported
        && runtime.startup_elapsed() >= first_paint_timeout()
    {
        runtime.render_timeout_reported = true;
        error!(
            "TN_OVERLAY_CEF_RENDER_TIMEOUT: overlay={:?}: no nonblank paint within {} ms; inspect overlay console, resource, and process diagnostics",
            runtime.overlay_id,
            first_paint_timeout().as_millis()
        );
        exits.send(bevy::app::AppExit::error());
    }
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
    if frame.generation != texture.generation {
        warn!(
            "TN_OVERLAY_CEF_STALE_PAINT_DROPPED: paintGeneration={}, surfaceGeneration={}",
            frame.generation, texture.generation
        );
        runtime.recycle_paint_buffer(frame.rgba);
        return;
    }
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
        let recycled = apply_paint_to_image(image, frame);
        runtime.recycle_paint_buffer(recycled);
        let upload_sequence = texture.uploads;
        record_bounded_sample(
            &mut texture.upload_micros,
            upload_sequence,
            upload_started.elapsed().as_micros() as u64,
        );
        texture.uploads += 1;
    }
}

fn first_paint_timeout() -> Duration {
    std::env::var("TN_OVERLAY_CEF_FIRST_PAINT_TIMEOUT_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| (100..=120_000).contains(value))
        .map(Duration::from_millis)
        .unwrap_or(DEFAULT_FIRST_PAINT_TIMEOUT)
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
                runtime.spike_scenario_result =
                    if completed && transitions == Some(runtime.modal_probe_expected_transitions) {
                        Some(Ok(runtime.modal_probe_expected_transitions))
                    } else {
                        Some(Err(envelope
                            .payload
                            .get("error")
                            .and_then(Value::as_str)
                            .unwrap_or("scenario did not complete the requested transitions")
                            .to_string()))
                    };
            }
            "overlay:set-visible" => {
                if let Some(visible) = envelope.payload.get("visible").and_then(Value::as_bool) {
                    runtime.set_visible(visible);
                    debug!("TN_OVERLAY_CEF_VISIBILITY: visible={visible}");
                }
            }
            "overlay:set-input" => {
                if let Some(mode) = envelope.payload.get("mode").and_then(Value::as_str)
                    && !runtime.set_input_mode(mode)
                {
                    warn!("TN_OVERLAY_NATIVE_IPC_REJECTED: invalid input mode {mode:?}");
                } else if let Some(mode) = envelope.payload.get("mode").and_then(Value::as_str) {
                    debug!("TN_OVERLAY_CEF_INPUT_MODE: mode={mode}");
                }
            }
            "overlay:set-input-regions" => {
                let mut regions = envelope
                    .payload
                    .get("regions")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(parse_cef_input_region)
                    .take(256)
                    .collect::<Vec<_>>();
                regions.sort_by_key(|region| (region.y, region.x, region.height, region.width));
                regions.dedup();
                runtime.input_regions = regions;
                debug!(
                    "TN_OVERLAY_CEF_INPUT_REGIONS: count={}",
                    runtime.input_regions.len()
                );
            }
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
    mut host: NonSendMut<CefOsrHost>,
    bridge: Res<crate::overlay_host::NativeOverlayBridgeResource>,
) {
    for runtime in &mut host.surfaces {
        let pending = bridge
            .bridge
            .snapshots()
            .iter()
            .filter(|snapshot| snapshot.sequence > runtime.delivered_sequence)
            .cloned()
            .collect::<Vec<_>>();
        let delivered_sequence = runtime.delivered_sequence;
        let cursor = advance_snapshot_delivery(delivered_sequence, &pending, |snapshot| {
            let delivered = runtime.deliver_snapshot(snapshot);
            if delivered {
                debug!(
                    "delivered CEF overlay '{}' snapshot '{}' sequence {}",
                    snapshot.overlay_id, snapshot.message_type, snapshot.sequence
                );
            }
            delivered
        });
        runtime.delivered_sequence = cursor;
    }
}

fn parse_cef_input_region(value: &Value) -> Option<crate::overlay_host::NativeOverlayBounds> {
    let finite_nonnegative = |field: &str| {
        value
            .get(field)
            .and_then(Value::as_f64)
            .filter(|number| number.is_finite() && *number >= 0.0)
    };
    let x = finite_nonnegative("x")?;
    let y = finite_nonnegative("y")?;
    let width = finite_nonnegative("width")?;
    let height = finite_nonnegative("height")?;
    if width <= 0.0 || height <= 0.0 {
        return None;
    }
    Some(crate::overlay_host::NativeOverlayBounds {
        x: x.round().min(u32::MAX as f64) as u32,
        y: y.round().min(u32::MAX as f64) as u32,
        width: width.round().min(u32::MAX as f64) as u32,
        height: height.round().min(u32::MAX as f64) as u32,
    })
}

pub fn advance_snapshot_delivery(
    delivered_sequence: u64,
    snapshots: &[crate::overlay::OverlayBridgeEnvelope],
    mut deliver: impl FnMut(&crate::overlay::OverlayBridgeEnvelope) -> bool,
) -> u64 {
    let mut cursor = delivered_sequence;
    for snapshot in snapshots
        .iter()
        .filter(|snapshot| snapshot.sequence > delivered_sequence)
    {
        if !deliver(snapshot) {
            break;
        }
        cursor = cursor.max(snapshot.sequence);
    }
    cursor
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

fn route_cef_spike_input(
    host: NonSend<CefOsrHost>,
    textures: Res<CefSurfaceTextures>,
    buttons: Res<ButtonInput<MouseButton>>,
    mut cursor_moved: EventReader<bevy::window::CursorMoved>,
    mut cursor_left: EventReader<bevy::window::CursorLeft>,
    mut focused: EventReader<bevy::window::WindowFocused>,
    mut keyboard: EventReader<KeyboardInput>,
    mut mouse_wheel: EventReader<MouseWheel>,
    mut last_position: Local<Option<Vec2>>,
    mut last_target: Local<Option<usize>>,
    mut capture: ResMut<crate::overlay_host::NativeOverlayInputCapture>,
    mut input_mapping_invalid: Local<bool>,
) {
    for event in cursor_moved.read() {
        if let Err(diagnostic) = cef_input_position(
            event.position,
            crate::overlay_host::NativeOverlayBounds {
                x: 0,
                y: 0,
                width: u32::MAX,
                height: u32::MAX,
            },
        ) {
            if !*input_mapping_invalid {
                warn!("{diagnostic}");
                *input_mapping_invalid = true;
            }
            continue;
        }
        let target = topmost_cef_surface_at(&host, &textures, event.position);
        if *last_target != target
            && let Some(previous) = *last_target
            && let (Some(runtime), Some(texture)) =
                (host.surfaces.get(previous), textures.0.get(previous))
        {
            runtime.send_mouse_move(local_cef_position(event.position, texture.bounds), true);
        }
        if let Some(target) = target
            && let (Some(runtime), Some(texture)) =
                (host.surfaces.get(target), textures.0.get(target))
        {
            runtime.send_mouse_move(local_cef_position(event.position, texture.bounds), false);
        }
        *last_target = target;
        *last_position = Some(event.position);
    }
    if cursor_left.read().next().is_some() {
        if let Some(target) = *last_target
            && let (Some(runtime), Some(texture)) =
                (host.surfaces.get(target), textures.0.get(target))
        {
            runtime.send_mouse_move(
                local_cef_position(last_position.unwrap_or(Vec2::ZERO), texture.bounds),
                true,
            );
        }
        *last_target = None;
        *last_position = None;
    }
    for event in focused.read() {
        for runtime in &host.surfaces {
            runtime.send_focus(event.focused);
        }
    }
    let keyboard_target = host
        .surfaces
        .iter()
        .zip(&textures.0)
        .enumerate()
        .filter(|(_, (runtime, _))| runtime.captures_keyboard())
        .max_by_key(|(mount_order, (_, texture))| (texture.z_index, *mount_order))
        .map(|(index, _)| index);
    for event in keyboard.read() {
        if let Some(runtime) = keyboard_target.and_then(|index| host.surfaces.get(index)) {
            runtime.send_keyboard_input(event);
        }
    }
    if let (Some(position), Some(target)) = (*last_position, *last_target) {
        for event in mouse_wheel.read() {
            let factor = match event.unit {
                MouseScrollUnit::Line => 120.0,
                MouseScrollUnit::Pixel => 1.0,
            };
            if let (Some(runtime), Some(texture)) =
                (host.surfaces.get(target), textures.0.get(target))
            {
                runtime.send_mouse_wheel(
                    local_cef_position(position, texture.bounds),
                    Vec2::new(event.x * factor, event.y * factor),
                );
            }
        }
    } else {
        mouse_wheel.clear();
    }
    capture.pointer = last_target.is_some();
    capture.keyboard = keyboard_target.is_some();
    if let (Some(position), Some(target)) = (*last_position, *last_target) {
        for button in [MouseButton::Left, MouseButton::Middle, MouseButton::Right] {
            if let (Some(runtime), Some(texture)) =
                (host.surfaces.get(target), textures.0.get(target))
            {
                let local = local_cef_position(position, texture.bounds);
                if buttons.just_pressed(button) {
                    runtime.send_mouse_button(local, button, false);
                }
                if buttons.just_released(button) {
                    runtime.send_mouse_button(local, button, true);
                }
            }
        }
    }
}

fn local_cef_position(
    window_position: Vec2,
    bounds: crate::overlay_host::NativeOverlayBounds,
) -> Vec2 {
    cef_input_position(window_position, bounds).unwrap_or(Vec2::splat(f32::NEG_INFINITY))
}

fn topmost_cef_surface_at(
    host: &CefOsrHost,
    textures: &CefSurfaceTextures,
    window_position: Vec2,
) -> Option<usize> {
    host.surfaces
        .iter()
        .zip(&textures.0)
        .enumerate()
        .filter(|(_, (runtime, texture))| {
            runtime.claims_pointer(local_cef_position(window_position, texture.bounds))
        })
        .max_by_key(|(mount_order, (_, texture))| (texture.z_index, *mount_order))
        .map(|(index, _)| index)
}

fn report_cef_spike_summary(
    mut exits: EventReader<bevy::app::AppExit>,
    host: NonSend<CefOsrHost>,
    textures: Res<CefSurfaceTextures>,
) {
    if exits.read().next().is_none() {
        return;
    }
    let paint_accepted = host
        .surfaces
        .iter()
        .map(|runtime| runtime.metrics().accepted)
        .sum::<u64>();
    let paint_dropped = host
        .surfaces
        .iter()
        .map(|runtime| runtime.metrics().dropped)
        .sum::<u64>();
    let paint_copy_micros = host
        .surfaces
        .iter()
        .flat_map(|runtime| runtime.metrics().copy_micros)
        .collect::<Vec<_>>();
    let upload_micros = textures
        .0
        .iter()
        .flat_map(|texture| texture.upload_micros.iter().copied())
        .collect::<Vec<_>>();
    println!(
        "{}",
        serde_json::json!({
            "schema": "threenative.native-overlay-cef-spike-summary",
            "version": "0.1.0",
            "firstNonblankPaintMs": textures.0.iter().filter_map(|texture| texture.first_paint_ms).reduce(f64::max),
            "surfaceCount": host.surfaces.len(),
            "paint": {
                "accepted": paint_accepted,
                "copyP95Micros": percentile_95(&paint_copy_micros),
                "dropped": paint_dropped,
            },
            "upload": {
                "bytes": textures.0.iter().map(|texture| texture.upload_bytes).sum::<u64>(),
                "count": textures.0.iter().map(|texture| texture.uploads).sum::<u64>(),
                "p95Micros": percentile_95(&upload_micros),
            },
            "input": {
                "pointerMovesSent": host.surfaces.iter().map(|runtime| runtime.pointer_moves_sent.get()).sum::<u64>(),
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

pub fn apply_paint_to_image(image: &mut Image, frame: CefPaintFrame) -> Vec<u8> {
    // Authored texture loading may generate a mip chain for every newly added
    // RGBA image. CEF replaces only the complete base level, so keep this
    // dynamic surface explicitly single-mip before replacing its bytes.
    image.texture_descriptor.mip_level_count = 1;
    let extent = Extent3d {
        width: frame.width,
        height: frame.height,
        depth_or_array_layers: 1,
    };
    if image.texture_descriptor.size != extent {
        image.resize(extent);
    }
    std::mem::replace(&mut image.data, frame.rgba)
}

pub fn apply_paint_to_image_if_current(
    image: &mut Image,
    frame: CefPaintFrame,
    surface_generation: u64,
) -> bool {
    if frame.generation != surface_generation {
        return false;
    }
    let _ = apply_paint_to_image(image, frame);
    true
}

pub fn resolve_cef_overlay_resource(
    resource_root: &Path,
    request_url: &str,
) -> Result<(PathBuf, &'static str), String> {
    resolve_cef_overlay_resource_from_origin(resource_root, CEF_OVERLAY_ORIGIN, request_url)
}

fn resolve_cef_overlay_resource_from_origin(
    resource_root: &Path,
    origin: &str,
    request_url: &str,
) -> Result<(PathBuf, &'static str), String> {
    let relative = request_url
        .strip_prefix(origin)
        .ok_or_else(|| cef_resource_rejected(request_url, "use the declared bundle origin"))?
        .split(['?', '#'])
        .next()
        .unwrap_or_default();
    if relative.is_empty() || relative.contains('%') || relative.contains('\\') {
        return Err(cef_resource_rejected(
            request_url,
            "use a non-empty, unencoded bundle-local path",
        ));
    }
    let relative = Path::new(relative);
    if relative.components().any(|component| {
        !matches!(
            component,
            std::path::Component::Normal(_) | std::path::Component::CurDir
        )
    }) {
        return Err(cef_resource_rejected(
            request_url,
            "remove absolute or parent-directory path components",
        ));
    }
    let canonical_root = resource_root.canonicalize().map_err(|error| {
        cef_resource_rejected(
            request_url,
            &format!("make the declared overlay root readable: {error}"),
        )
    })?;
    let candidate = canonical_root.join(relative);
    let canonical = candidate.canonicalize().map_err(|error| {
        cef_resource_rejected(
            request_url,
            &format!("add the declared bundle-local resource: {error}"),
        )
    })?;
    if !canonical.starts_with(&canonical_root) || !canonical.is_file() {
        return Err(cef_resource_rejected(
            request_url,
            "serve only regular files below the declared overlay root",
        ));
    }
    Ok((canonical.clone(), cef_overlay_mime_type(&canonical)))
}

pub fn cef_overlay_url_allowed(url: &str) -> bool {
    url.starts_with(CEF_OVERLAY_ORIGIN_PREFIX)
}

fn cef_resource_rejected(request_url: &str, fix: &str) -> String {
    format!("TN_OVERLAY_CEF_RESOURCE_REJECTED: {request_url}: {fix}")
}

fn cef_overlay_mime_type(path: &Path) -> &'static str {
    match path.extension().and_then(|extension| extension.to_str()) {
        Some("css") => "text/css",
        Some("gif") => "image/gif",
        Some("html") => "text/html",
        Some("jpeg" | "jpg") => "image/jpeg",
        Some("js" | "mjs") => "text/javascript",
        Some("json") => "application/json",
        Some("png") => "image/png",
        Some("svg") => "image/svg+xml",
        Some("wasm") => "application/wasm",
        Some("webp") => "image/webp",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        _ => "application/octet-stream",
    }
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
