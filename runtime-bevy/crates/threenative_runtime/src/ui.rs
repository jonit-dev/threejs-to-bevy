use std::{collections::HashMap, fs};

use bevy::a11y::{
    AccessibilityNode,
    accesskit::{NodeBuilder, Role},
};
use bevy::input::mouse::{MouseScrollUnit, MouseWheel};
use bevy::prelude::*;
use bevy::render::camera::ClearColorConfig;
use bevy::render::{
    render_asset::RenderAssetUsages,
    render_resource::{Extent3d, TextureDimension, TextureFormat},
};
use bevy::text::BreakLineOn;
use bevy::ui::prelude::{BorderRect, ImageScaleMode, SliceScaleMode, TextureSlicer};
use bevy::ui::{FocusPolicy, IsDefaultUiCamera, TargetCamera};
use serde::Serialize;
use thiserror::Error;
use threenative_components::ThreeNativeId;
use threenative_loader::{
    LoadedBundle, UiBindingIr, UiFontAssetIr, UiGradientIr, UiImageMetadataIr, UiIr,
    UiMinimapBoundsIr, UiMinimapMarkerIr, UiNodeIr, UiRichTextSpanIr, UiShadowIr, UiStyleIr,
};

#[cfg(target_os = "linux")]
const DEFAULT_UI_FONT_PATHS: &[&str] = &[
    "/usr/share/fonts/Adwaita/AdwaitaMono-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSansMono-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
];

#[cfg(target_os = "macos")]
const DEFAULT_UI_FONT_PATHS: &[&str] = &[
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
];

#[cfg(target_os = "windows")]
const DEFAULT_UI_FONT_PATHS: &[&str] = &[
    "C:/Windows/Fonts/segoeui.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/calibri.ttf",
];

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
const DEFAULT_UI_FONT_PATHS: &[&str] = &[];

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

#[derive(Debug, Default, Resource)]
pub struct NativeUiServiceEffectQueue(pub Vec<crate::systems_effects::NativeSystemServiceEffect>);

pub fn queue_native_ui_service_effects(
    queue: &mut NativeUiServiceEffectQueue,
    logs: &[crate::systems_effects::NativeSystemEffectLog],
) {
    queue.0.extend(
        logs.iter()
            .flat_map(|log| log.entries.iter())
            .filter_map(|entry| {
                let service = entry.service.as_deref()?;
                if service != "ui.setDisabled" && service != "ui.setValue" {
                    return None;
                }
                Some(crate::systems_effects::NativeSystemServiceEffect {
                    payload: entry.payload.clone()?,
                    service: service.to_owned(),
                })
            }),
    );
}

pub fn apply_queued_native_ui_service_effects(world: &mut World) {
    let effects = {
        let Some(mut queue) = world.get_resource_mut::<NativeUiServiceEffectQueue>() else {
            return;
        };
        std::mem::take(&mut queue.0)
    };
    apply_native_ui_service_effects(world, &effects);
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiTextEditTrace {
    pub capability: NativeUiTextInputCapability,
    pub frames: Vec<NativeUiTextEditFrame>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiTextInputCapability {
    pub caret: &'static str,
    pub ime: &'static str,
    pub text_editing: &'static str,
    pub virtual_keyboard: &'static str,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiTextEditFrame {
    pub caret: usize,
    pub operation: String,
    pub value: String,
}

#[derive(Clone, Debug, PartialEq)]
pub enum NativeUiTextEditOperation {
    Backspace,
    Insert(String),
    Move(isize),
}

#[derive(Clone, Debug, Resource)]
struct NativeUiFallbackFont(Handle<Font>);

#[derive(Clone, Debug, PartialEq, Resource)]
pub struct NativeUiFallbackFontStatus {
    pub diagnostic: Option<UiDiagnostic>,
    pub source_path: Option<String>,
}

#[derive(Clone, Debug, Default, Resource)]
pub struct NativeUiBindingTargets {
    bindings_by_node: HashMap<String, UiBindingIr>,
    component_entities_by_node: HashMap<String, String>,
}

#[derive(Clone, Debug, Resource)]
pub struct NativeUiResponsiveState {
    root: UiNodeIr,
    target: String,
}

impl NativeUiBindingTargets {
    pub fn binding_for(&self, node_id: &str) -> Option<&UiBindingIr> {
        self.bindings_by_node.get(node_id)
    }

    pub fn component_entity_for(&self, node_id: &str) -> Option<&str> {
        self.component_entities_by_node
            .get(node_id)
            .map(String::as_str)
    }

    pub fn len(&self) -> usize {
        self.bindings_by_node.len()
    }

    pub fn is_empty(&self) -> bool {
        self.bindings_by_node.is_empty()
    }

    pub fn has_component_bindings(&self) -> bool {
        !self.component_entities_by_node.is_empty()
    }
}

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeUiBar {
    pub max: f32,
    pub value: f32,
}

#[derive(Clone, Component, Debug, Eq, PartialEq)]
pub struct NativeUiVisualLayer {
    pub kind: String,
    pub owner: String,
}

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeUiEffectLayer {
    pub active_since_seconds: Option<f32>,
    pub base_color: Color,
    pub effect: String,
    pub kind: String,
    pub owner: Entity,
    pub pulse_duration_seconds: Option<f32>,
    pub pulse_iterations: Option<u32>,
    pub strategy: String,
    pub trigger: String,
}

#[derive(Clone, Component, Debug, Default, PartialEq)]
pub struct NativeUiEffectState {
    pub predicates: HashMap<String, bool>,
    pub selected: bool,
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
    pub font_asset: Option<String>,
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
    pub font_asset: Option<String>,
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

#[derive(Clone, Component, Debug, PartialEq)]
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

pub fn native_ui_target_for_viewport(width: f32, _height: f32) -> &'static str {
    if width < 768.0 {
        "mobile"
    } else if width < 1200.0 {
        "tablet"
    } else {
        "desktop"
    }
}

pub fn resolve_native_ui_node(node: &UiNodeIr, target: &str) -> UiNodeIr {
    let mut resolved = node.clone();
    if let Some(rule) = node.responsive.iter().find(|rule| rule.target == target) {
        resolved.layout = merge_native_ui_layout(node.layout.as_ref(), rule.layout.as_ref());
        resolved.style = merge_native_ui_style(node.style.as_ref(), rule.style.as_ref());
    }
    resolved.children = node
        .children
        .iter()
        .map(|child| resolve_native_ui_node(child, target))
        .collect();
    resolved
}

fn merge_native_ui_layout(
    base: Option<&threenative_loader::UiLayoutIr>,
    override_value: Option<&threenative_loader::UiLayoutIr>,
) -> Option<threenative_loader::UiLayoutIr> {
    let Some(override_value) = override_value else {
        return base.cloned();
    };
    let inset = match (
        base.and_then(|layout| layout.inset.as_ref()),
        override_value.inset.as_ref(),
    ) {
        (None, None) => None,
        (base, override_value) => Some(threenative_loader::UiInsetIr {
            bottom: override_value
                .and_then(|value| value.bottom)
                .or_else(|| base.and_then(|value| value.bottom)),
            left: override_value
                .and_then(|value| value.left)
                .or_else(|| base.and_then(|value| value.left)),
            right: override_value
                .and_then(|value| value.right)
                .or_else(|| base.and_then(|value| value.right)),
            top: override_value
                .and_then(|value| value.top)
                .or_else(|| base.and_then(|value| value.top)),
        }),
    };
    let grid = match (
        base.and_then(|layout| layout.grid.as_ref()),
        override_value.grid.as_ref(),
    ) {
        (None, None) => None,
        (base, override_value) => Some(threenative_loader::UiGridLayoutIr {
            auto_flow: override_value
                .and_then(|value| value.auto_flow.clone())
                .or_else(|| base.and_then(|value| value.auto_flow.clone())),
            columns: override_value
                .and_then(|value| value.columns)
                .or_else(|| base.and_then(|value| value.columns)),
            rows: override_value
                .and_then(|value| value.rows)
                .or_else(|| base.and_then(|value| value.rows)),
        }),
    };
    let base = base.cloned().unwrap_or(threenative_loader::UiLayoutIr {
        align: None,
        column_gap: None,
        direction: None,
        grid: None,
        grow: None,
        height: None,
        inset: None,
        justify: None,
        max_height: None,
        max_width: None,
        min_height: None,
        min_width: None,
        overflow: None,
        padding: None,
        position: None,
        row_gap: None,
        width: None,
        z_index: None,
    });
    Some(threenative_loader::UiLayoutIr {
        align: override_value.align.clone().or(base.align),
        column_gap: override_value.column_gap.or(base.column_gap),
        direction: override_value.direction.clone().or(base.direction),
        grid,
        grow: override_value.grow.or(base.grow),
        height: override_value.height.or(base.height),
        inset,
        justify: override_value.justify.clone().or(base.justify),
        max_height: override_value.max_height.or(base.max_height),
        max_width: override_value.max_width.or(base.max_width),
        min_height: override_value.min_height.or(base.min_height),
        min_width: override_value.min_width.or(base.min_width),
        overflow: override_value.overflow.clone().or(base.overflow),
        padding: override_value.padding.or(base.padding),
        position: override_value.position.clone().or(base.position),
        row_gap: override_value.row_gap.or(base.row_gap),
        width: override_value.width.or(base.width),
        z_index: override_value.z_index.or(base.z_index),
    })
}

fn merge_native_ui_style(
    base: Option<&UiStyleIr>,
    override_value: Option<&UiStyleIr>,
) -> Option<UiStyleIr> {
    let Some(override_value) = override_value else {
        return base.cloned();
    };
    let base = base.cloned().unwrap_or(UiStyleIr {
        background_color: None,
        border_color: None,
        border_radius: None,
        border_width: None,
        color: None,
        font_family: None,
        font_size: None,
        font_weight: None,
        gradient: None,
        opacity: None,
        shadow: None,
        text_decoration: None,
        text_align: None,
        wrap: None,
    });
    Some(UiStyleIr {
        background_color: override_value
            .background_color
            .clone()
            .or(base.background_color),
        border_color: override_value.border_color.clone().or(base.border_color),
        border_radius: override_value.border_radius.or(base.border_radius),
        border_width: override_value.border_width.or(base.border_width),
        color: override_value.color.clone().or(base.color),
        font_family: override_value.font_family.clone().or(base.font_family),
        font_size: override_value.font_size.or(base.font_size),
        font_weight: override_value.font_weight.clone().or(base.font_weight),
        gradient: override_value.gradient.clone().or(base.gradient),
        opacity: override_value.opacity.or(base.opacity),
        shadow: override_value.shadow.clone().or(base.shadow),
        text_decoration: override_value
            .text_decoration
            .clone()
            .or(base.text_decoration),
        text_align: override_value.text_align.clone().or(base.text_align),
        wrap: override_value.wrap.clone().or(base.wrap),
    })
}

pub fn build_native_ui(ui: &UiIr) -> Result<NativeUiNode, UiDiagnostic> {
    build_node(&ui.root, "ui.ir.json/root")
}

pub fn map_ui_into_world(world: &mut World, ui: &UiIr) -> Result<(), UiDiagnostic> {
    build_native_ui(ui)?;

    let (width, height) = native_ui_logical_viewport(world).unwrap_or((1280.0, 720.0));
    let target = native_ui_target_for_viewport(width, height);
    let resolved_root = resolve_native_ui_node(&ui.root, target);

    install_native_ui_fallback_font(world);
    world.insert_resource(build_native_ui_binding_targets(ui));
    world.insert_resource(NativeUiResponsiveState {
        root: ui.root.clone(),
        target: target.to_owned(),
    });
    let mut entities_by_id = HashMap::new();
    spawn_node(world, &resolved_root, &ui.fonts, &mut entities_by_id, true);
    attach_children(world, &resolved_root, &entities_by_id);

    Ok(())
}

pub fn reconcile_native_ui_responsive_layout(world: &mut World) {
    let Some((width, height)) = native_ui_logical_viewport(world) else {
        return;
    };
    let target = native_ui_target_for_viewport(width, height);
    let Some(state) = world.get_resource::<NativeUiResponsiveState>() else {
        return;
    };
    if state.target == target {
        return;
    }
    let resolved_root = resolve_native_ui_node(&state.root, target);
    let mut resolved_nodes = HashMap::new();
    collect_resolved_ui_nodes(&resolved_root, true, &mut resolved_nodes);
    let entities = world
        .query::<(Entity, &ThreeNativeId)>()
        .iter(world)
        .filter_map(|(entity, id)| {
            resolved_nodes
                .get(&id.0)
                .cloned()
                .map(|node| (entity, node))
        })
        .collect::<Vec<_>>();
    for (entity, (node, is_root)) in entities {
        world
            .entity_mut(entity)
            .insert(ui_node_style(&node, is_root, |node| {
                match node.kind.as_str() {
                    "bar" => bar_style(node),
                    "minimap" => minimap_style(node),
                    "button" | "image" | "text" | "textInput" | "touchControl" | "slider"
                    | "scrollbar" => leaf_style(node),
                    _ => layout_style(node),
                }
            }));
    }
    world.resource_mut::<NativeUiResponsiveState>().target = target.to_owned();
}

pub fn apply_native_ui_service_effects(
    world: &mut World,
    effects: &[crate::systems_effects::NativeSystemServiceEffect],
) {
    for effect in effects {
        if effect.service != "ui.setDisabled" && effect.service != "ui.setValue" {
            continue;
        }
        let Some(request) = effect.payload.get("request") else {
            continue;
        };
        let Some(node_id) = request.get("node").and_then(serde_json::Value::as_str) else {
            continue;
        };
        let entity = world
            .query::<(Entity, &ThreeNativeId)>()
            .iter(world)
            .find(|(_, id)| id.0 == node_id)
            .map(|(entity, _)| entity);
        let Some(entity) = entity else {
            continue;
        };
        if effect.service == "ui.setDisabled" {
            let Some(disabled) = request.get("disabled").and_then(serde_json::Value::as_bool)
            else {
                continue;
            };
            let clear_focus = disabled
                && world
                    .get_resource::<bevy::a11y::Focus>()
                    .is_some_and(|focus| focus.0 == Some(entity));
            {
                let mut entity_mut = world.entity_mut(entity);
                entity_mut.insert(NativeUiDisabled(disabled));
                if let Some(mut accessibility) = entity_mut.get_mut::<AccessibilityNode>() {
                    if disabled {
                        accessibility.set_disabled();
                    } else {
                        accessibility.clear_disabled();
                    }
                }
            }
            if clear_focus {
                world.insert_resource(bevy::a11y::Focus(None));
            }
            continue;
        }
        let Some(value) = request.get("value") else {
            continue;
        };
        let mut entity = world.entity_mut(entity);
        if let Some(mut widget) = entity.get_mut::<NativeUiWidget>() {
            if let Some(number) = value.as_f64().filter(|number| number.is_finite()) {
                widget.value = (number as f32).clamp(widget.min, widget.max);
                widget.value_text = Some(number.to_string());
            } else if let Some(text) = value.as_str() {
                widget.value_text = Some(text.to_owned());
            }
        }
        if let Some(mut accessibility) = entity.get_mut::<AccessibilityNode>() {
            if let Some(number) = value.as_f64().filter(|number| number.is_finite()) {
                accessibility.clear_value();
                accessibility.set_numeric_value(number);
            } else if let Some(text) = value.as_str() {
                accessibility.clear_numeric_value();
                accessibility.set_value(text.to_owned());
            }
        }
    }
}

fn native_ui_logical_viewport(world: &mut World) -> Option<(f32, f32)> {
    world
        .query_filtered::<&Window, With<bevy::window::PrimaryWindow>>()
        .iter(world)
        .next()
        .map(|window| (window.resolution.width(), window.resolution.height()))
}

fn collect_resolved_ui_nodes(
    node: &UiNodeIr,
    is_root: bool,
    nodes: &mut HashMap<String, (UiNodeIr, bool)>,
) {
    nodes.insert(node.id.clone(), (node.clone(), is_root));
    for child in &node.children {
        collect_resolved_ui_nodes(child, false, nodes);
    }
}

fn install_native_ui_fallback_font(world: &mut World) {
    if world.get_resource::<NativeUiFallbackFont>().is_some() {
        if world.get_resource::<NativeUiFallbackFontStatus>().is_none() {
            world.insert_resource(NativeUiFallbackFontStatus {
                diagnostic: None,
                source_path: None,
            });
        }
        return;
    }
    let status = load_native_ui_fallback_font(world, DEFAULT_UI_FONT_PATHS);
    world.insert_resource(status);
}

fn load_native_ui_fallback_font(world: &mut World, paths: &[&str]) -> NativeUiFallbackFontStatus {
    let loaded = {
        let Some(mut fonts) = world.get_resource_mut::<Assets<Font>>() else {
            return NativeUiFallbackFontStatus {
                diagnostic: Some(missing_native_ui_font_diagnostic(paths)),
                source_path: None,
            };
        };
        paths.iter().find_map(|path| {
            let bytes = fs::read(path).ok()?;
            let font = Font::try_from_bytes(bytes).ok()?;
            Some((fonts.add(font), (*path).to_owned()))
        })
    };
    if let Some((handle, source_path)) = loaded {
        world.insert_resource(NativeUiFallbackFont(handle));
        return NativeUiFallbackFontStatus {
            diagnostic: None,
            source_path: Some(source_path),
        };
    }
    NativeUiFallbackFontStatus {
        diagnostic: Some(missing_native_ui_font_diagnostic(paths)),
        source_path: None,
    }
}

fn missing_native_ui_font_diagnostic(paths: &[&str]) -> UiDiagnostic {
    UiDiagnostic {
        code: "TN_BEVY_UI_FONT_FALLBACK_MISSING".to_owned(),
        message: format!(
            "No usable native UI fallback font was found. Checked platform paths: {}.",
            if paths.is_empty() {
                "<none>".to_owned()
            } else {
                paths.join(", ")
            }
        ),
        path: "ui.ir.json/fonts".to_owned(),
    }
}

pub fn diagnose_native_ui_font_fallback(world: &World) -> Option<UiDiagnostic> {
    world
        .get_resource::<NativeUiFallbackFontStatus>()
        .and_then(|status| status.diagnostic.clone())
}

pub fn diagnose_native_ui_scale_boundary(_ui: &UiIr) -> UiDiagnostic {
    UiDiagnostic {
        code: "TN_BEVY_UI_ABSOLUTE_PIXEL_SCALE_BOUNDARY".to_owned(),
        message: "Native Bevy UI currently treats authored pixel values as absolute UI pixels; DPI-aware scaling is not promoted.".to_owned(),
        path: "ui.ir.json/root".to_owned(),
    }
}

pub fn build_native_ui_binding_targets(ui: &UiIr) -> NativeUiBindingTargets {
    let mut targets = NativeUiBindingTargets::default();
    collect_native_ui_binding_targets(&ui.root, &mut targets);
    targets
}

fn collect_native_ui_binding_targets(node: &UiNodeIr, targets: &mut NativeUiBindingTargets) {
    if let Some(binding) = node.binding.as_ref() {
        targets
            .bindings_by_node
            .insert(node.id.clone(), binding.clone());
        if let UiBindingIr::Component { entity, .. } = binding {
            targets
                .component_entities_by_node
                .insert(node.id.clone(), entity.clone());
        }
    }
    for child in &node.children {
        collect_native_ui_binding_targets(child, targets);
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
    diagnose_node_font_weight_fallbacks(&ui.root, "ui.ir.json/root", &ui.fonts, &mut diagnostics);
    diagnostics
}

pub fn diagnose_native_ui_font_weight_fallbacks(ui: &UiIr) -> Vec<UiDiagnostic> {
    let mut diagnostics = Vec::new();
    diagnose_node_font_weight_fallbacks(&ui.root, "ui.ir.json/root", &ui.fonts, &mut diagnostics);
    diagnostics
}

pub fn diagnose_native_ui_nested_axis_scroll(ui: &UiIr) -> Vec<UiDiagnostic> {
    let mut diagnostics = Vec::new();
    diagnose_nested_axis_scroll_node(&ui.root, "ui.ir.json/root", false, &mut diagnostics);
    diagnostics
}

fn diagnose_nested_axis_scroll_node(
    node: &UiNodeIr,
    path: &str,
    inside_scroll: bool,
    diagnostics: &mut Vec<UiDiagnostic>,
) {
    let is_scroll = node
        .layout
        .as_ref()
        .and_then(|layout| layout.overflow.as_deref())
        == Some("scroll");
    if is_scroll && inside_scroll {
        diagnostics.push(UiDiagnostic {
            code: "TN_BEVY_UI_NESTED_SCROLL_PARTIAL".to_owned(),
            message: "Native Bevy UI does not yet route wheel input to the deepest hovered nested scroll container.".to_owned(),
            path: format!("{path}/layout/overflow"),
        });
    }
    if is_scroll && node.orientation.as_deref() == Some("horizontal") {
        diagnostics.push(UiDiagnostic {
            code: "TN_BEVY_UI_HORIZONTAL_SCROLL_PARTIAL".to_owned(),
            message: "Native Bevy UI currently applies scroll offsets on the vertical axis only."
                .to_owned(),
            path: format!("{path}/orientation"),
        });
    }
    for (index, child) in node.children.iter().enumerate() {
        diagnose_nested_axis_scroll_node(
            child,
            &format!("{path}/children/{index}"),
            inside_scroll || is_scroll,
            diagnostics,
        );
    }
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

fn diagnose_node_font_weight_fallbacks(
    node: &UiNodeIr,
    path: &str,
    fonts: &[UiFontAssetIr],
    diagnostics: &mut Vec<UiDiagnostic>,
) {
    let style = node.style.as_ref();
    if style.and_then(|style| style.font_weight.as_deref()) == Some("bold") {
        diagnose_font_weight_fallback(
            style.and_then(|style| style.font_family.as_deref()),
            format!("{path}/style/fontWeight"),
            fonts,
            diagnostics,
        );
    }
    for (index, span) in node.spans.iter().enumerate() {
        if span.weight.as_ref().is_some_and(ui_font_weight_is_bold) {
            diagnose_font_weight_fallback(
                span.font_family
                    .as_deref()
                    .or_else(|| style.and_then(|style| style.font_family.as_deref())),
                format!("{path}/spans/{index}/weight"),
                fonts,
                diagnostics,
            );
        }
    }
    for (index, child) in node.children.iter().enumerate() {
        diagnose_node_font_weight_fallbacks(
            child,
            &format!("{path}/children/{index}"),
            fonts,
            diagnostics,
        );
    }
}

fn diagnose_font_weight_fallback(
    family: Option<&str>,
    path: String,
    fonts: &[UiFontAssetIr],
    diagnostics: &mut Vec<UiDiagnostic>,
) {
    let Some(font) = fonts
        .iter()
        .find(|font| Some(font.family.as_str()) == family)
    else {
        return;
    };
    if font.bold_asset.is_none() {
        diagnostics.push(UiDiagnostic {
            code: "TN_BEVY_UI_FONT_WEIGHT_FALLBACK".to_owned(),
            message: format!(
                "Native UI requested bold family '{}' without a boldAsset; the regular face is used.",
                font.family
            ),
            path,
        });
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

fn rendered_text_style(node: &UiNodeIr, fonts: &[UiFontAssetIr]) -> Option<NativeUiRenderedTextStyle> {
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
        font_asset: native_ui_font_asset_path(
            fonts,
            font_family.as_deref(),
            font_weight.as_deref() == Some("bold"),
        )
        .map(str::to_owned),
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

include!("ui/visuals.rs");
include!("ui/widgets.rs");

include!("ui/interactions.rs");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_ui_shadow_texture_is_a_soft_ring_with_a_transparent_center() {
        let pixels = native_ui_shadow_pixels();
        let alpha = |x: usize, y: usize| pixels[(y * 32 + x) * 4 + 3];

        assert_eq!(alpha(16, 16), 0);
        assert!(alpha(7, 16) > alpha(0, 16));
        assert!(alpha(7, 16) > 200);
    }

    #[test]
    fn native_ui_binding_targets_cache_bound_nodes() {
        let ui: UiIr = serde_json::from_value(serde_json::json!({
            "schema": "threenative.ui",
            "version": "0.1.0",
            "root": {
                "id": "root",
                "kind": "column",
                "children": [
                    {
                        "id": "score",
                        "kind": "text",
                        "binding": {
                            "kind": "resource",
                            "name": "Game",
                            "field": "score"
                        }
                    },
                    {
                        "id": "health",
                        "kind": "text",
                        "binding": {
                            "kind": "component",
                            "entity": "player",
                            "component": "Health",
                            "field": "value"
                        }
                    }
                ]
            }
        }))
        .expect("ui fixture should deserialize");

        let targets = build_native_ui_binding_targets(&ui);

        assert_eq!(targets.len(), 2);
        assert!(targets.has_component_bindings());
        assert!(matches!(
            targets.binding_for("score"),
            Some(UiBindingIr::Resource { name, field, .. })
                if name == "Game" && field.as_deref() == Some("score")
        ));
        assert_eq!(targets.component_entity_for("health"), Some("player"));
    }

    #[test]
    fn missing_native_ui_fallback_font_reports_stable_diagnostic() {
        let mut world = World::new();
        world.insert_resource(Assets::<Font>::default());

        let status = load_native_ui_fallback_font(&mut world, &[]);

        assert_eq!(status.source_path, None);
        assert_eq!(
            status
                .diagnostic
                .as_ref()
                .map(|diagnostic| diagnostic.code.as_str()),
            Some("TN_BEVY_UI_FONT_FALLBACK_MISSING")
        );
        assert_eq!(
            status
                .diagnostic
                .as_ref()
                .map(|diagnostic| diagnostic.path.as_str()),
            Some("ui.ir.json/fonts")
        );
    }

    #[test]
    fn native_ui_scale_boundary_reports_absolute_pixel_diagnostic() {
        let ui: UiIr = serde_json::from_value(serde_json::json!({
            "schema": "threenative.ui",
            "version": "0.1.0",
            "root": { "id": "root", "kind": "column" }
        }))
        .expect("ui fixture should deserialize");

        let diagnostic = diagnose_native_ui_scale_boundary(&ui);

        assert_eq!(diagnostic.code, "TN_BEVY_UI_ABSOLUTE_PIXEL_SCALE_BOUNDARY");
        assert_eq!(diagnostic.path, "ui.ir.json/root");
    }

    #[test]
    fn native_text_input_should_report_caret_after_edit_trace() {
        let trace = trace_native_ui_text_edit(
            "Nova",
            &[
                NativeUiTextEditOperation::Move(-1),
                NativeUiTextEditOperation::Insert("r".to_owned()),
                NativeUiTextEditOperation::Backspace,
            ],
        );

        assert_eq!(
            trace
                .frames
                .iter()
                .map(|frame| (frame.value.as_str(), frame.caret))
                .collect::<Vec<_>>(),
            vec![("Nova", 4), ("Nova", 3), ("Novra", 4), ("Nova", 3)]
        );
        assert_eq!(trace.capability.ime, "platform-diagnostic");
    }

    #[test]
    fn native_ui_should_resolve_responsive_boundaries_and_merge_base_fields() {
        let ui: UiIr = serde_json::from_value(serde_json::json!({
            "schema": "threenative.ui", "version": "0.1.0",
            "root": { "id": "hud", "kind": "column",
                "layout": { "height": 80, "width": 320, "inset": { "left": 24, "top": 16 } },
                "style": { "color": "#ffffff", "opacity": 1 },
                "responsive": [
                    { "target": "mobile", "layout": { "width": 156, "inset": { "left": 8 } }, "style": { "opacity": 0.5 } },
                    { "target": "tablet", "layout": { "width": 240 } }
                ] }
        })).expect("responsive ui");

        assert_eq!(native_ui_target_for_viewport(767.0, 900.0), "mobile");
        assert_eq!(native_ui_target_for_viewport(768.0, 900.0), "tablet");
        assert_eq!(native_ui_target_for_viewport(1200.0, 900.0), "desktop");
        let mobile = resolve_native_ui_node(&ui.root, "mobile");
        let layout = mobile.layout.as_ref().unwrap();
        assert_eq!(layout.width, Some(156.0));
        assert_eq!(layout.height, Some(80.0));
        assert_eq!(
            layout.inset.as_ref().and_then(|inset| inset.left),
            Some(8.0)
        );
        assert_eq!(
            layout.inset.as_ref().and_then(|inset| inset.top),
            Some(16.0)
        );
        assert_eq!(
            mobile.style.as_ref().and_then(|style| style.opacity),
            Some(0.5)
        );
        assert_eq!(
            mobile
                .style
                .as_ref()
                .and_then(|style| style.color.as_deref()),
            Some("#ffffff")
        );
    }

    #[test]
    fn native_ui_should_reconcile_responsive_layout_after_logical_viewport_resize() {
        let ui: UiIr = serde_json::from_value(serde_json::json!({
            "schema": "threenative.ui", "version": "0.1.0",
            "root": { "id": "hud", "kind": "column", "layout": { "width": 320 },
                "responsive": [{ "target": "mobile", "layout": { "width": 156 } }] }
        }))
        .expect("responsive ui");
        let mut world = World::new();
        world.insert_resource(Assets::<Font>::default());
        world.spawn((
            Window {
                resolution: bevy::window::WindowResolution::new(1280.0, 720.0),
                ..Default::default()
            },
            bevy::window::PrimaryWindow,
        ));
        map_ui_into_world(&mut world, &ui).expect("ui should map");
        assert_eq!(native_ui_style_width(&mut world, "hud"), Val::Px(320.0));

        world
            .query_filtered::<&mut Window, With<bevy::window::PrimaryWindow>>()
            .single_mut(&mut world)
            .resolution
            .set(600.0, 900.0);
        reconcile_native_ui_responsive_layout(&mut world);

        assert_eq!(native_ui_style_width(&mut world, "hud"), Val::Px(156.0));
    }

    #[test]
    fn native_ui_should_keep_nested_axis_scroll_explicitly_partial() {
        let ui: UiIr = serde_json::from_value(serde_json::json!({
            "schema":"threenative.ui","version":"0.1.0",
            "root":{"id":"outer","kind":"column","orientation":"vertical","layout":{"overflow":"scroll"},
                "children":[{"id":"inner","kind":"row","orientation":"horizontal","layout":{"overflow":"scroll"}}]}
        })).expect("nested scroll ui");

        let diagnostics = diagnose_native_ui_nested_axis_scroll(&ui);
        assert!(
            diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == "TN_BEVY_UI_NESTED_SCROLL_PARTIAL")
        );
        assert!(
            diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == "TN_BEVY_UI_HORIZONTAL_SCROLL_PARTIAL")
        );
    }

    #[test]
    fn native_ui_service_effects_should_update_ecs_widget_and_accessibility_state() {
        let mut world = World::new();
        let mut builder = NodeBuilder::new(Role::Slider);
        builder.set_name("Volume".to_owned());
        let entity = world
            .spawn((
                ThreeNativeId("audio.volume".to_owned()),
                NativeUiDisabled(false),
                NativeUiWidget {
                    kind: "slider".to_owned(),
                    min: 0.0,
                    max: 1.0,
                    orientation: "horizontal".to_owned(),
                    step: Some(0.1),
                    value: 0.2,
                    value_text: Some("20 percent".to_owned()),
                },
                AccessibilityNode::from(builder),
            ))
            .id();
        let effects = vec![
            crate::systems_effects::NativeSystemServiceEffect {
                service: "ui.setValue".to_owned(),
                payload: serde_json::json!({"request":{"node":"audio.volume","value":0.6}}),
            },
            crate::systems_effects::NativeSystemServiceEffect {
                service: "ui.setDisabled".to_owned(),
                payload: serde_json::json!({"request":{"node":"audio.volume","disabled":true}}),
            },
        ];

        apply_native_ui_service_effects(&mut world, &effects);

        assert_eq!(world.get::<NativeUiWidget>(entity).unwrap().value, 0.6);
        assert!(world.get::<NativeUiDisabled>(entity).unwrap().0);
        let accessibility = world.get::<AccessibilityNode>(entity).unwrap();
        assert!(accessibility.is_disabled());
        assert_eq!(accessibility.numeric_value(), Some(0.6));
    }

    fn native_ui_style_width(world: &mut World, id: &str) -> Val {
        world
            .query::<(&ThreeNativeId, &Style)>()
            .iter(world)
            .find(|(candidate, _)| candidate.0 == id)
            .map(|(_, style)| style.width)
            .expect("ui style")
    }
}
