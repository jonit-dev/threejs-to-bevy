use std::{collections::HashMap, fs};

use bevy::a11y::{
    AccessibilityNode,
    accesskit::{NodeBuilder, Role},
};
use bevy::input::mouse::{MouseScrollUnit, MouseWheel};
use bevy::prelude::*;
use bevy::render::camera::ClearColorConfig;
use bevy::text::BreakLineOn;
use bevy::ui::{IsDefaultUiCamera, TargetCamera};
use serde::Serialize;
use thiserror::Error;
use threenative_components::ThreeNativeId;
use threenative_loader::{
    LoadedBundle, UiBindingIr, UiFontAssetIr, UiGradientIr, UiImageMetadataIr, UiIr,
    UiMinimapBoundsIr, UiMinimapMarkerIr, UiNodeIr, UiRichTextSpanIr, UiShadowIr, UiStyleIr,
};

const DEFAULT_UI_FONT_PATHS: &[&str] = &[
    "/usr/share/fonts/Adwaita/AdwaitaMono-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSansMono-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
];

#[derive(Clone, Component, Debug, Eq, PartialEq)]
pub struct NativeUiKind(pub String);

#[derive(Clone, Component, Debug, Eq, PartialEq)]
pub struct NativeUiAction(pub String);

#[derive(Clone, Component, Debug, Eq, PartialEq)]
pub struct NativeUiDisabled(pub bool);

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeUiActionEvent {
    pub action: String,
    pub node: String,
    pub value: Option<String>,
}

#[derive(Debug, Default, Resource)]
pub struct NativeUiActionQueue {
    pub events: Vec<NativeUiActionEvent>,
}

#[derive(Clone, Debug, Resource)]
struct NativeUiFallbackFont(Handle<Font>);

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeUiBar {
    pub max: f32,
    pub value: f32,
}

#[derive(Clone, Component, Debug, Eq, PartialEq)]
pub struct NativeUiFocusable(pub bool);

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeUiScrollContainer {
    pub offset_y: f32,
}

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeUiMinimapMarker {
    pub index: usize,
    pub root_id: String,
}

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeUiMinimapPathPoint {
    pub root_id: String,
}

#[derive(Clone, Component, Debug, Eq, PartialEq)]
pub struct NativeUiImageSrc(pub String);

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeUiImageMetadata {
    pub atlas: Option<(f32, f32, f32, f32)>,
    pub flip_x: bool,
    pub flip_y: bool,
    pub nine_slice: Option<(f32, f32, f32, f32)>,
    pub scale_mode: Option<String>,
    pub source_size: Option<(f32, f32)>,
    pub tile_size: Option<(f32, f32)>,
    pub tint: Option<String>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiImageRenderTrace {
    pub images: Vec<NativeUiImageRenderObservation>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiImageRenderObservation {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub atlas: Option<NativeUiImageRectTrace>,
    pub flip_x: bool,
    pub flip_y: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nine_slice: Option<NativeUiImageInsetsTrace>,
    pub node: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scale_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_size: Option<NativeUiImageSizeTrace>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub src: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tile_size: Option<NativeUiImageSizeTrace>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tint: Option<String>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiImageRectTrace {
    pub height: f32,
    pub width: f32,
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiImageInsetsTrace {
    pub bottom: f32,
    pub left: f32,
    pub right: f32,
    pub top: f32,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiImageSizeTrace {
    pub height: f32,
    pub width: f32,
}

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeUiWidget {
    pub kind: String,
    pub max: f32,
    pub min: f32,
    pub orientation: String,
    pub step: Option<f32>,
    pub value: f32,
    pub value_text: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeUiNode {
    pub action: Option<String>,
    pub accessibility_label: Option<String>,
    pub anchor_id: Option<String>,
    pub children: Vec<NativeUiNode>,
    pub disabled: Option<bool>,
    pub focusable: Option<bool>,
    pub id: String,
    pub image: Option<NativeUiImageMetadata>,
    pub kind: String,
    pub label: Option<String>,
    pub max: Option<f32>,
    pub min: Option<f32>,
    pub navigation: Option<NativeUiNavigation>,
    pub orientation: Option<String>,
    pub role: Option<String>,
    pub spans: Vec<NativeUiRichTextSpan>,
    pub step: Option<f32>,
    pub style: Option<NativeUiStyle>,
    pub src: Option<String>,
    pub text: Option<String>,
    pub value: Option<f32>,
    pub value_text: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeUiRichTextSpan {
    pub accessibility_text: Option<String>,
    pub color: Option<String>,
    pub decoration: Option<String>,
    pub font_family: Option<String>,
    pub font_size: Option<f32>,
    pub italic: Option<bool>,
    pub text: String,
    pub weight: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeUiStyle {
    pub background_color: Option<String>,
    pub border_color: Option<String>,
    pub border_radius: Option<f32>,
    pub border_width: Option<f32>,
    pub color: Option<String>,
    pub font_family: Option<String>,
    pub font_size: Option<f32>,
    pub font_weight: Option<String>,
    pub gradient: Option<NativeUiGradient>,
    pub opacity: Option<f32>,
    pub shadow: Option<NativeUiShadow>,
    pub text_decoration: Option<String>,
    pub text_align: Option<String>,
    pub wrap: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeUiGradient {
    pub angle: Option<f32>,
    pub from: String,
    pub kind: String,
    pub to: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeUiShadow {
    pub blur: Option<f32>,
    pub color: String,
    pub offset_x: Option<f32>,
    pub offset_y: Option<f32>,
    pub spread: Option<f32>,
}

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeUiRenderedGradient {
    pub angle: Option<f32>,
    pub from: String,
    pub kind: String,
    pub to: String,
}

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeUiRenderedShadow {
    pub blur: Option<f32>,
    pub color: String,
    pub offset_x: Option<f32>,
    pub offset_y: Option<f32>,
    pub spread: Option<f32>,
}

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeUiRenderedTextStyle {
    pub font_family: Option<String>,
    pub font_weight: Option<String>,
    pub spans: Vec<NativeUiRenderedTextSpanStyle>,
    pub text_decoration: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeUiRenderedTextSpanStyle {
    pub decoration: Option<String>,
    pub font_family: Option<String>,
    pub font_size: Option<f32>,
    pub index: usize,
    pub text: String,
    pub weight: Option<String>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiVisualEffectTrace {
    pub effects: Vec<NativeUiVisualEffectObservation>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiVisualEffectObservation {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gradient: Option<NativeUiRenderedGradientTrace>,
    pub node: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadow: Option<NativeUiRenderedShadowTrace>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiRenderedGradientTrace {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub angle: Option<f32>,
    pub from: String,
    pub kind: String,
    pub to: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiRenderedShadowTrace {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blur: Option<f32>,
    pub color: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset_x: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset_y: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spread: Option<f32>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiTextStyleTrace {
    pub styles: Vec<NativeUiTextStyleObservation>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiTextStyleObservation {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_weight: Option<String>,
    pub node: String,
    pub spans: Vec<NativeUiRenderedTextSpanTrace>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_decoration: Option<String>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiRenderedTextSpanTrace {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decoration: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f32>,
    pub index: usize,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weight: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeUiNavigation {
    pub down: Option<String>,
    pub left: Option<String>,
    pub right: Option<String>,
    pub up: Option<String>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiNavigationTrace {
    pub events: Vec<UiNavigationEvent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub final_focus: Option<String>,
    pub focus_order: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub initial_focus: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub safe_area: Option<threenative_loader::UiSafeAreaIr>,
}

#[derive(Debug, PartialEq, Serialize)]
pub struct UiNavigationEvent {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    pub focus: String,
    pub input: String,
    pub kind: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiScreenDispatchTrace {
    pub events: Vec<NativeUiScreenDispatchObservation>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiScreenDispatchObservation {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocked_by: Option<String>,
    pub dispatched: bool,
    pub input: String,
    pub node: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub screen: Option<String>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiVirtualListRangeTrace {
    pub end_index: isize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_item: Option<String>,
    pub node: String,
    pub start_index: isize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_item: Option<String>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiAffordanceTrace {
    pub glyphs: Vec<NativeUiGlyphObservation>,
    pub tooltips: Vec<NativeUiTooltipObservation>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiGlyphObservation {
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub glyph_set: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub node: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiTooltipObservation {
    pub anchor: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delay_ms: Option<f32>,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dismiss_action: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub focus: Option<String>,
    pub node: String,
    pub open: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiEffectPresetTrace {
    pub effects: Vec<NativeUiEffectPresetObservation>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiEffectPresetObservation {
    pub effect: String,
    pub kind: String,
    pub node: String,
    pub state: String,
    pub strategy: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiAttachmentProjectionTrace {
    pub projections: Vec<NativeUiAttachmentProjectionObservation>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiAttachmentProjectionObservation {
    pub camera: String,
    pub clamped: bool,
    pub depth: f32,
    pub node: String,
    pub occluded: bool,
    pub scale: f32,
    pub screen: NativeUiScreenPosition,
    pub target: String,
    pub visible_nodes: Vec<String>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiScreenPosition {
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Debug, Error, PartialEq)]
#[error("{code}: {message} at {path}")]
pub struct UiDiagnostic {
    pub code: String,
    pub message: String,
    pub path: String,
}

pub fn build_native_ui(ui: &UiIr) -> Result<NativeUiNode, UiDiagnostic> {
    build_node(&ui.root, "ui.ir.json/root")
}

pub fn map_ui_into_world(world: &mut World, ui: &UiIr) -> Result<(), UiDiagnostic> {
    build_native_ui(ui)?;

    install_native_ui_fallback_font(world);
    let mut entities_by_id = HashMap::new();
    spawn_node(world, &ui.root, &ui.fonts, &mut entities_by_id, true);
    attach_children(world, &ui.root, &entities_by_id);

    Ok(())
}

fn install_native_ui_fallback_font(world: &mut World) {
    if world.get_resource::<NativeUiFallbackFont>().is_some() {
        return;
    }
    let Some(mut fonts) = world.get_resource_mut::<Assets<Font>>() else {
        return;
    };
    for path in DEFAULT_UI_FONT_PATHS {
        let Ok(bytes) = fs::read(path) else {
            continue;
        };
        let Ok(font) = Font::try_from_bytes(bytes) else {
            continue;
        };
        let handle = fonts.add(font);
        world.insert_resource(NativeUiFallbackFont(handle));
        return;
    }
}

pub fn install_native_ui_overlay_camera(world: &mut World) {
    let max_camera_order = world
        .query::<&Camera>()
        .iter(world)
        .map(|camera| camera.order)
        .max()
        .unwrap_or(0);
    let mut overlay_camera = Camera2dBundle::default();
    overlay_camera.camera.order = max_camera_order + 100;
    overlay_camera.camera.clear_color = ClearColorConfig::None;
    world.spawn(overlay_camera).insert((
        Name::new("threenative.ui.overlay.camera"),
        IsDefaultUiCamera,
    ));
}

pub fn route_native_ui_to_active_scene_camera(world: &mut World) -> bool {
    let scene_camera = world
        .query_filtered::<(Entity, &Camera), Without<IsDefaultUiCamera>>()
        .iter(world)
        .filter(|(_, camera)| camera.is_active)
        .max_by_key(|(_, camera)| camera.order)
        .map(|(entity, _)| entity);
    let Some(scene_camera) = scene_camera else {
        return false;
    };

    let overlay_cameras = world
        .query_filtered::<Entity, With<IsDefaultUiCamera>>()
        .iter(world)
        .collect::<Vec<_>>();
    for entity in overlay_cameras {
        if let Some(mut entity_mut) = world.get_entity_mut(entity) {
            entity_mut.remove::<IsDefaultUiCamera>();
            if let Some(mut camera) = entity_mut.get_mut::<Camera>() {
                camera.is_active = false;
            }
        }
    }

    let root_nodes = world
        .query_filtered::<Entity, (With<Node>, Without<Parent>)>()
        .iter(world)
        .collect::<Vec<_>>();
    for root_node in root_nodes {
        world
            .entity_mut(root_node)
            .insert(TargetCamera(scene_camera));
    }
    true
}

pub fn diagnose_native_ui_visual_support(ui: &UiIr) -> Vec<UiDiagnostic> {
    let mut diagnostics = Vec::new();
    diagnose_node_visual_support(&ui.root, "ui.ir.json/root", &mut diagnostics);
    diagnostics
}

fn diagnose_node_visual_support(node: &UiNodeIr, path: &str, diagnostics: &mut Vec<UiDiagnostic>) {
    for (index, span) in node.spans.iter().enumerate() {
        let span_path = format!("{path}/spans/{index}");
        if span.italic == Some(true) {
            diagnostics.push(UiDiagnostic {
                code: "TN_BEVY_UI_TEXT_ITALIC_UNSUPPORTED".to_owned(),
                message:
                    "Bevy native UI maps rich text spans and font handles but cannot render per-span italic metadata yet."
                        .to_owned(),
                path: format!("{span_path}/italic"),
            });
        }
    }
    for (index, child) in node.children.iter().enumerate() {
        diagnose_node_visual_support(child, &format!("{path}/children/{index}"), diagnostics);
    }
}

fn build_node(node: &UiNodeIr, path: &str) -> Result<NativeUiNode, UiDiagnostic> {
    if !matches!(
        node.kind.as_str(),
        "bar"
            | "button"
            | "column"
            | "contextMenu"
            | "image"
            | "minimap"
            | "row"
            | "scrollbar"
            | "slider"
            | "stack"
            | "text"
            | "textInput"
            | "touchControl"
    ) {
        return Err(UiDiagnostic {
            code: "TN_BEVY_UI_NODE_UNSUPPORTED".to_owned(),
            message: format!("Unsupported UI node '{}'.", node.kind),
            path: format!("{path}/kind"),
        });
    }
    Ok(NativeUiNode {
        action: node.action.clone(),
        accessibility_label: node.accessibility_label.clone(),
        anchor_id: node.anchor_id.clone(),
        children: node
            .children
            .iter()
            .enumerate()
            .map(|(index, child)| build_node(child, &format!("{path}/children/{index}")))
            .collect::<Result<Vec<_>, _>>()?,
        disabled: node.disabled,
        focusable: node.focusable,
        id: node.id.clone(),
        image: node.image.as_ref().map(native_ui_image_metadata),
        kind: node.kind.clone(),
        label: node.label.clone(),
        max: node.max,
        min: node.min,
        navigation: node
            .navigation
            .as_ref()
            .map(|navigation| NativeUiNavigation {
                down: navigation.down.clone(),
                left: navigation.left.clone(),
                right: navigation.right.clone(),
                up: navigation.up.clone(),
            }),
        orientation: node.orientation.clone(),
        role: node.role.clone(),
        style: node.style.as_ref().map(|style| NativeUiStyle {
            background_color: style.background_color.clone(),
            border_color: style.border_color.clone(),
            border_radius: style.border_radius,
            border_width: style.border_width,
            color: style.color.clone(),
            font_family: style.font_family.clone(),
            font_size: style.font_size,
            font_weight: style.font_weight.clone(),
            gradient: style.gradient.as_ref().map(native_ui_gradient),
            opacity: style.opacity,
            shadow: style.shadow.as_ref().map(native_ui_shadow),
            text_decoration: style.text_decoration.clone(),
            text_align: style.text_align.clone(),
            wrap: style.wrap.clone(),
        }),
        spans: node.spans.iter().map(native_rich_text_span).collect(),
        step: node.step,
        src: node.src.clone(),
        text: node.text.clone(),
        value: node.value,
        value_text: node.value_text.clone(),
    })
}

fn native_ui_image_metadata(image: &UiImageMetadataIr) -> NativeUiImageMetadata {
    NativeUiImageMetadata {
        atlas: image
            .atlas
            .as_ref()
            .map(|atlas| (atlas.x, atlas.y, atlas.width, atlas.height)),
        flip_x: image.flip_x.unwrap_or(false),
        flip_y: image.flip_y.unwrap_or(false),
        nine_slice: image
            .nine_slice
            .as_ref()
            .map(|slice| (slice.left, slice.right, slice.top, slice.bottom)),
        scale_mode: image.scale_mode.clone(),
        source_size: image
            .source_size
            .as_ref()
            .map(|size| (size.width, size.height)),
        tile_size: image
            .tile_size
            .as_ref()
            .map(|size| (size.width, size.height)),
        tint: image.tint.clone(),
    }
}

fn native_rich_text_span(span: &UiRichTextSpanIr) -> NativeUiRichTextSpan {
    NativeUiRichTextSpan {
        accessibility_text: span.accessibility_text.clone(),
        color: span.color.clone(),
        decoration: span.decoration.clone(),
        font_family: span.font_family.clone(),
        font_size: span.font_size,
        italic: span.italic,
        text: span.text.clone(),
        weight: span.weight.as_ref().map(value_to_string),
    }
}

fn native_ui_gradient(gradient: &UiGradientIr) -> NativeUiGradient {
    NativeUiGradient {
        angle: gradient.angle,
        from: gradient.from.clone(),
        kind: gradient.kind.clone(),
        to: gradient.to.clone(),
    }
}

fn native_ui_shadow(shadow: &UiShadowIr) -> NativeUiShadow {
    NativeUiShadow {
        blur: shadow.blur,
        color: shadow.color.clone(),
        offset_x: shadow.offset_x,
        offset_y: shadow.offset_y,
        spread: shadow.spread,
    }
}

fn rendered_text_style(node: &UiNodeIr) -> Option<NativeUiRenderedTextStyle> {
    let style = node.style.as_ref();
    let font_family = style.and_then(|style| style.font_family.clone());
    let font_weight = style.and_then(|style| style.font_weight.clone());
    let text_decoration = style.and_then(|style| style.text_decoration.clone());
    let spans = node
        .spans
        .iter()
        .enumerate()
        .filter_map(|(index, span)| {
            let has_style = span.decoration.is_some()
                || span.font_family.is_some()
                || span.font_size.is_some()
                || span.weight.is_some();
            has_style.then(|| NativeUiRenderedTextSpanStyle {
                decoration: span.decoration.clone(),
                font_family: span.font_family.clone(),
                font_size: span.font_size,
                index,
                text: span.text.clone(),
                weight: span.weight.as_ref().map(value_to_string),
            })
        })
        .collect::<Vec<_>>();
    if font_family.is_none()
        && font_weight.is_none()
        && spans.is_empty()
        && text_decoration.is_none()
    {
        return None;
    }
    Some(NativeUiRenderedTextStyle {
        font_family,
        font_weight,
        spans,
        text_decoration,
    })
}

include!("ui/traces.rs");
fn collect_nodes<'a>(node: &'a UiNodeIr, nodes: &mut Vec<&'a UiNodeIr>) {
    nodes.push(node);
    for child in &node.children {
        collect_nodes(child, nodes);
    }
}

fn find_node<'a>(nodes: &[&'a UiNodeIr], id: &str) -> Option<&'a UiNodeIr> {
    nodes.iter().copied().find(|node| node.id == id)
}

fn active_ui_screens(ui: &UiIr) -> Vec<&threenative_loader::UiScreenIr> {
    let Some(screens) = ui.screens.as_ref() else {
        return Vec::new();
    };
    let active = ui
        .screen_stack
        .as_ref()
        .map(|stack| stack.active.clone())
        .unwrap_or_else(|| {
            screens
                .iter()
                .filter(|screen| screen.active == Some(true))
                .map(|screen| screen.id.clone())
                .collect()
        });
    active
        .iter()
        .filter_map(|id| {
            screens
                .iter()
                .find(|screen| screen.id == *id && screen.hidden != Some(true))
        })
        .collect()
}

fn node_is_within_root(node: &UiNodeIr, root_id: &str, target_id: &str) -> bool {
    if node.id == root_id {
        return contains_node_id(node, target_id);
    }
    node.children
        .iter()
        .any(|child| node_is_within_root(child, root_id, target_id))
}

fn contains_node_id(node: &UiNodeIr, target_id: &str) -> bool {
    node.id == target_id
        || node
            .children
            .iter()
            .any(|child| contains_node_id(child, target_id))
}

fn is_focusable(node: &UiNodeIr) -> bool {
    node.disabled != Some(true)
        && (node.focusable == Some(true)
            || matches!(node.kind.as_str(), "button" | "textInput" | "touchControl"))
}

fn navigation_target(node: &UiNodeIr, input: &str) -> Option<String> {
    let navigation = node.navigation.as_ref()?;
    match input {
        "down" => navigation.down.clone(),
        "left" => navigation.left.clone(),
        "right" => navigation.right.clone(),
        "up" => navigation.up.clone(),
        _ => None,
    }
}

fn sequential_target(order: &[String], current: &str, input: &str) -> Option<String> {
    let index = order.iter().position(|id| id == current)?;
    match input {
        "next" | "tab" | "down" | "right" => order.get((index + 1).min(order.len() - 1)).cloned(),
        "previous" | "shiftTab" | "up" | "left" => order.get(index.saturating_sub(1)).cloned(),
        _ => None,
    }
}

include!("ui/widgets.rs");

include!("ui/interactions.rs");
