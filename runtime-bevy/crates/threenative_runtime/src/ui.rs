use std::collections::HashMap;

use bevy::a11y::{
    AccessibilityNode,
    accesskit::{NodeBuilder, Role},
};
use bevy::input::mouse::{MouseScrollUnit, MouseWheel};
use bevy::prelude::*;
use bevy::text::BreakLineOn;
use serde::Serialize;
use thiserror::Error;
use threenative_components::ThreeNativeId;
use threenative_loader::{
    UiFontAssetIr, UiGradientIr, UiImageMetadataIr, UiIr, UiMinimapBoundsIr,
    UiMinimapMarkerIr, UiNodeIr, UiRichTextSpanIr, UiShadowIr, UiStyleIr, LoadedBundle,
    UiBindingIr,
};

#[derive(Clone, Component, Debug, Eq, PartialEq)]
pub struct NativeUiKind(pub String);

#[derive(Clone, Component, Debug, Eq, PartialEq)]
pub struct NativeUiAction(pub String);

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeUiActionEvent {
    pub action: String,
    pub node: String,
}

#[derive(Debug, Default, Resource)]
pub struct NativeUiActionQueue {
    pub events: Vec<NativeUiActionEvent>,
}

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

    let mut entities_by_id = HashMap::new();
    spawn_node(world, &ui.root, &ui.fonts, &mut entities_by_id);
    attach_children(world, &ui.root, &entities_by_id);

    Ok(())
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

pub fn trace_ui_navigation(ui: &UiIr, inputs: &[&str]) -> UiNavigationTrace {
    let mut nodes = Vec::new();
    collect_nodes(&ui.root, &mut nodes);
    let focus_order = ui.focus_order.clone().unwrap_or_else(|| {
        nodes
            .iter()
            .filter(|node| is_focusable(node))
            .map(|node| node.id.clone())
            .collect()
    });
    let mut focus = focus_order.first().cloned();
    let mut events = Vec::new();
    for input in inputs {
        let Some(current) = focus.clone() else {
            break;
        };
        if *input == "activate" {
            events.push(UiNavigationEvent {
                action: find_node(&nodes, &current).and_then(|node| node.action.clone()),
                focus: current,
                input: (*input).to_owned(),
                kind: "activate".to_owned(),
            });
            continue;
        }
        let next = find_node(&nodes, &current)
            .and_then(|node| navigation_target(node, input))
            .or_else(|| sequential_target(&focus_order, &current, input));
        if let Some(next) = next {
            if next != current {
                focus = Some(next.clone());
                events.push(UiNavigationEvent {
                    action: None,
                    focus: next,
                    input: (*input).to_owned(),
                    kind: "focus".to_owned(),
                });
            }
        }
    }
    UiNavigationTrace {
        events,
        final_focus: focus,
        focus_order: focus_order.clone(),
        initial_focus: focus_order.first().cloned(),
        safe_area: ui.safe_area.clone(),
    }
}

pub fn trace_native_ui_visual_effects(world: &mut World) -> NativeUiVisualEffectTrace {
    let mut query = world.query::<(
        &ThreeNativeId,
        Option<&NativeUiRenderedGradient>,
        Option<&NativeUiRenderedShadow>,
    )>();
    let mut effects = query
        .iter(world)
        .filter_map(|(id, gradient, shadow)| {
            if gradient.is_none() && shadow.is_none() {
                return None;
            }
            Some(NativeUiVisualEffectObservation {
                gradient: gradient.map(|gradient| NativeUiRenderedGradientTrace {
                    angle: gradient.angle,
                    from: gradient.from.clone(),
                    kind: gradient.kind.clone(),
                    to: gradient.to.clone(),
                }),
                node: id.0.clone(),
                shadow: shadow.map(|shadow| NativeUiRenderedShadowTrace {
                    blur: shadow.blur,
                    color: shadow.color.clone(),
                    offset_x: shadow.offset_x,
                    offset_y: shadow.offset_y,
                    spread: shadow.spread,
                }),
            })
        })
        .collect::<Vec<_>>();
    effects.sort_by(|left, right| left.node.cmp(&right.node));
    NativeUiVisualEffectTrace { effects }
}

pub fn trace_native_ui_text_styles(world: &mut World) -> NativeUiTextStyleTrace {
    let mut query = world.query::<(&ThreeNativeId, &NativeUiRenderedTextStyle)>();
    let mut styles = query
        .iter(world)
        .map(|(id, style)| NativeUiTextStyleObservation {
            font_family: style.font_family.clone(),
            font_weight: style.font_weight.clone(),
            node: id.0.clone(),
            spans: style
                .spans
                .iter()
                .map(|span| NativeUiRenderedTextSpanTrace {
                    decoration: span.decoration.clone(),
                    font_family: span.font_family.clone(),
                    font_size: span.font_size,
                    index: span.index,
                    text: span.text.clone(),
                    weight: span.weight.clone(),
                })
                .collect(),
            text_decoration: style.text_decoration.clone(),
        })
        .collect::<Vec<_>>();
    styles.sort_by(|left, right| left.node.cmp(&right.node));
    NativeUiTextStyleTrace { styles }
}

pub fn trace_native_ui_image_rendering(world: &mut World) -> NativeUiImageRenderTrace {
    let mut query = world.query::<(
        &ThreeNativeId,
        Option<&NativeUiImageSrc>,
        &NativeUiImageMetadata,
    )>();
    let mut images = query
        .iter(world)
        .map(|(id, src, image)| NativeUiImageRenderObservation {
            atlas: image
                .atlas
                .map(|(x, y, width, height)| NativeUiImageRectTrace {
                    height,
                    width,
                    x,
                    y,
                }),
            flip_x: image.flip_x,
            flip_y: image.flip_y,
            nine_slice: image.nine_slice.map(|(left, right, top, bottom)| {
                NativeUiImageInsetsTrace {
                    bottom,
                    left,
                    right,
                    top,
                }
            }),
            node: id.0.clone(),
            scale_mode: image.scale_mode.clone(),
            source_size: image
                .source_size
                .map(|(width, height)| NativeUiImageSizeTrace { height, width }),
            src: src.map(|src| src.0.clone()),
            tile_size: image
                .tile_size
                .map(|(width, height)| NativeUiImageSizeTrace { height, width }),
            tint: image.tint.clone(),
        })
        .collect::<Vec<_>>();
    images.sort_by(|left, right| left.node.cmp(&right.node));
    NativeUiImageRenderTrace { images }
}

fn collect_nodes<'a>(node: &'a UiNodeIr, nodes: &mut Vec<&'a UiNodeIr>) {
    nodes.push(node);
    for child in &node.children {
        collect_nodes(child, nodes);
    }
}

fn find_node<'a>(nodes: &[&'a UiNodeIr], id: &str) -> Option<&'a UiNodeIr> {
    nodes.iter().copied().find(|node| node.id == id)
}

fn is_focusable(node: &UiNodeIr) -> bool {
    node.focusable == Some(true) || matches!(node.kind.as_str(), "button" | "touchControl")
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

fn spawn_node(
    world: &mut World,
    node: &UiNodeIr,
    fonts: &[UiFontAssetIr],
    entities_by_id: &mut HashMap<String, Entity>,
) -> Entity {
    let entity = match node.kind.as_str() {
        "text" => world
            .spawn(text_bundle(
                world,
                node.text
                    .as_deref()
                    .or(node.label.as_deref())
                    .unwrap_or_default(),
                node,
                fonts,
            ))
            .id(),
        "button" | "touchControl" | "slider" | "scrollbar" => world
            .spawn(ButtonBundle {
                style: leaf_style(node),
                background_color: background_color(node, (0.15, 0.17, 0.2, 1.0)),
                border_color: border_color(node),
                border_radius: border_radius(node),
                ..Default::default()
            })
            .id(),
        "bar" => world
            .spawn(NodeBundle {
                style: bar_style(node),
                background_color: background_color(node, (0.16, 0.18, 0.2, 1.0)),
                border_color: border_color(node),
                border_radius: border_radius(node),
                ..Default::default()
            })
            .id(),
        "minimap" => world
            .spawn(NodeBundle {
                style: minimap_style(node),
                background_color: minimap_background_color(node),
                border_color: border_color(node),
                border_radius: border_radius(node),
                ..Default::default()
            })
            .id(),
        "image" => world
            .spawn((
                ImageBundle {
                    style: leaf_style(node),
                    image: ui_image(world, node),
                    background_color: background_color(node, (0.0, 0.0, 0.0, 0.0)),
                    ..Default::default()
                },
                border_color(node),
                border_radius(node),
            ))
            .id(),
        _ => world
            .spawn(NodeBundle {
                style: layout_style(node),
                background_color: background_color(node, (0.0, 0.0, 0.0, 0.0)),
                border_color: border_color(node),
                border_radius: border_radius(node),
                ..Default::default()
            })
            .id(),
    };

    {
        let mut entity_mut = world.entity_mut(entity);
        entity_mut.insert((
            ThreeNativeId(node.id.clone()),
            NativeUiKind(node.kind.clone()),
            Name::new(node.id.clone()),
        ));
        if let Some(action) = node.action.as_ref() {
            entity_mut.insert(NativeUiAction(action.clone()));
        }
        if let Some(accessibility) = accessibility_node(node) {
            entity_mut.insert(accessibility);
        }
        if let Some(src) = node.src.as_ref() {
            entity_mut.insert(NativeUiImageSrc(src.clone()));
        }
        if let Some(image) = node.image.as_ref() {
            entity_mut.insert(native_ui_image_metadata(image));
        }
        if let Some(focusable) = node.focusable {
            entity_mut.insert(NativeUiFocusable(focusable));
        }
        if node.kind == "slider" || node.kind == "scrollbar" {
            entity_mut.insert(NativeUiWidget {
                kind: node.kind.clone(),
                max: node.max.unwrap_or(1.0),
                min: node.min.unwrap_or(0.0),
                orientation: node
                    .orientation
                    .clone()
                    .unwrap_or_else(|| "horizontal".to_owned()),
                step: node.step,
                value: node.value.unwrap_or(node.min.unwrap_or(0.0)),
                value_text: node.value_text.clone(),
            });
        }
        if let Some(z_index) = node.layout.as_ref().and_then(|layout| layout.z_index) {
            entity_mut.insert(ZIndex::Local(z_index));
        }
        if let Some(gradient) = node
            .style
            .as_ref()
            .and_then(|style| style.gradient.as_ref())
        {
            entity_mut.insert(NativeUiRenderedGradient {
                angle: gradient.angle,
                from: gradient.from.clone(),
                kind: gradient.kind.clone(),
                to: gradient.to.clone(),
            });
        }
        if let Some(shadow) = node.style.as_ref().and_then(|style| style.shadow.as_ref()) {
            entity_mut.insert(NativeUiRenderedShadow {
                blur: shadow.blur,
                color: shadow.color.clone(),
                offset_x: shadow.offset_x,
                offset_y: shadow.offset_y,
                spread: shadow.spread,
            });
        }
        if let Some(text_style) = rendered_text_style(node) {
            entity_mut.insert(text_style);
        }
        if node
            .layout
            .as_ref()
            .and_then(|layout| layout.overflow.as_deref())
            == Some("scroll")
        {
            entity_mut.insert(NativeUiScrollContainer { offset_y: 0.0 });
        }
        if node.kind == "bar" {
            entity_mut.insert(NativeUiBar {
                value: node.value.unwrap_or(0.0),
                max: node.max.unwrap_or(1.0),
            });
        }
    }

    spawn_runtime_children(world, entity, node, fonts);

    entities_by_id.insert(node.id.clone(), entity);
    for child in &node.children {
        spawn_node(world, child, fonts, entities_by_id);
    }

    entity
}

fn attach_children(world: &mut World, node: &UiNodeIr, entities_by_id: &HashMap<String, Entity>) {
    let Some(parent) = entities_by_id.get(node.id.as_str()).copied() else {
        return;
    };
    let children = node
        .children
        .iter()
        .filter_map(|child| entities_by_id.get(child.id.as_str()).copied())
        .collect::<Vec<_>>();
    if !children.is_empty() {
        world.entity_mut(parent).push_children(&children);
    }
    for child in &node.children {
        attach_children(world, child, entities_by_id);
    }
}

fn layout_style(node: &UiNodeIr) -> Style {
    let mut style = Style {
        flex_direction: match node.kind.as_str() {
            "row" => FlexDirection::Row,
            "stack" => FlexDirection::Column,
            _ => FlexDirection::Column,
        },
        row_gap: Val::Px(8.0),
        column_gap: Val::Px(8.0),
        padding: UiRect::all(Val::Px(8.0)),
        ..Default::default()
    };
    apply_layout(&mut style, node.layout.as_ref());
    apply_visual_style(&mut style, node.style.as_ref());
    style
}

fn leaf_style(node: &UiNodeIr) -> Style {
    let mut style = Style {
        padding: UiRect::axes(Val::Px(12.0), Val::Px(8.0)),
        ..Default::default()
    };
    apply_layout(&mut style, node.layout.as_ref());
    apply_visual_style(&mut style, node.style.as_ref());
    style
}

fn bar_style(node: &UiNodeIr) -> Style {
    let mut style = Style {
        width: Val::Px(160.0),
        height: Val::Px(12.0),
        ..Default::default()
    };
    apply_layout(&mut style, node.layout.as_ref());
    apply_visual_style(&mut style, node.style.as_ref());
    style
}

fn minimap_style(node: &UiNodeIr) -> Style {
    let mut style = leaf_style(node);
    style.position_type = PositionType::Relative;
    style.overflow = Overflow::clip();
    style.padding = UiRect::ZERO;
    style
}

fn minimap_background_color(node: &UiNodeIr) -> BackgroundColor {
    BackgroundColor(styled_color(
        node.minimap
            .as_ref()
            .and_then(|minimap| minimap.background_color.as_ref())
            .or_else(|| node.style.as_ref().and_then(|style| style.background_color.as_ref())),
        (0.03, 0.07, 0.12, 0.94),
        node.style.as_ref().and_then(|style| style.opacity),
    ))
}

fn ui_image(world: &World, node: &UiNodeIr) -> UiImage {
    let Some(src) = node.src.as_ref() else {
        return UiImage::default();
    };
    world
        .get_resource::<AssetServer>()
        .map(|asset_server| UiImage::new(asset_server.load(src.clone())))
        .unwrap_or_default()
}

fn accessibility_node(node: &UiNodeIr) -> Option<AccessibilityNode> {
    let role = accessibility_role(node)?;
    let mut builder = NodeBuilder::new(role);
    if let Some(name) = accessibility_name(node) {
        builder.set_name(name);
    }
    Some(AccessibilityNode::from(builder))
}

fn accessibility_role(node: &UiNodeIr) -> Option<Role> {
    match node.role.as_deref() {
        Some("button") => Some(Role::Button),
        Some("group") => Some(Role::Group),
        Some("image") => Some(Role::Image),
        Some("list") => Some(Role::List),
        Some("listitem") => Some(Role::ListItem),
        Some("none") => None,
        Some("progressbar") => Some(Role::ProgressIndicator),
        Some("text") => Some(Role::StaticText),
        None => match node.kind.as_str() {
            "bar" => Some(Role::ProgressIndicator),
            "button" | "touchControl" => Some(Role::Button),
            "slider" => Some(Role::Slider),
            "scrollbar" => Some(Role::ProgressIndicator),
            "image" => Some(Role::Image),
            "text" => Some(Role::StaticText),
            _ => None,
        },
        _ => None,
    }
}

fn accessibility_name(node: &UiNodeIr) -> Option<String> {
    node.accessibility_label
        .clone()
        .or_else(|| node.label.clone())
        .or_else(|| node.text.clone())
}

fn apply_visual_style(style: &mut Style, visual: Option<&UiStyleIr>) {
    let Some(visual) = visual else {
        return;
    };
    if let Some(border_width) = visual.border_width {
        style.border = UiRect::all(Val::Px(border_width));
    }
}

fn apply_layout(style: &mut Style, layout: Option<&threenative_loader::UiLayoutIr>) {
    let Some(layout) = layout else {
        return;
    };
    if let Some(direction) = layout.direction.as_deref() {
        style.flex_direction = match direction {
            "row" => FlexDirection::Row,
            _ => FlexDirection::Column,
        };
    }
    if let Some(grid) = layout.grid.as_ref() {
        style.display = Display::Grid;
        if let Some(columns) = grid.columns {
            style.grid_template_columns = RepeatedGridTrack::flex(columns, 1.0);
        }
        if let Some(rows) = grid.rows {
            style.grid_template_rows = RepeatedGridTrack::flex(rows, 1.0);
        }
        if let Some(auto_flow) = grid.auto_flow.as_deref() {
            style.grid_auto_flow = match auto_flow {
                "column" => GridAutoFlow::Column,
                _ => GridAutoFlow::Row,
            };
        }
    }
    if let Some(justify) = layout.justify.as_deref() {
        style.justify_content = match justify {
            "center" => JustifyContent::Center,
            "end" => JustifyContent::FlexEnd,
            "spaceBetween" => JustifyContent::SpaceBetween,
            _ => JustifyContent::FlexStart,
        };
    }
    if let Some(align) = layout.align.as_deref() {
        style.align_items = match align {
            "center" => AlignItems::Center,
            "end" => AlignItems::FlexEnd,
            "stretch" => AlignItems::Stretch,
            _ => AlignItems::FlexStart,
        };
    }
    if let Some(row_gap) = layout.row_gap {
        style.row_gap = Val::Px(row_gap);
    }
    if let Some(column_gap) = layout.column_gap {
        style.column_gap = Val::Px(column_gap);
    }
    if let Some(padding) = layout.padding {
        style.padding = UiRect::all(Val::Px(padding));
    }
    if let Some(position) = layout.position.as_deref() {
        style.position_type = match position {
            "absolute" => PositionType::Absolute,
            _ => PositionType::Relative,
        };
    }
    if let Some(inset) = layout.inset.as_ref() {
        if let Some(top) = inset.top {
            style.top = Val::Px(top);
        }
        if let Some(right) = inset.right {
            style.right = Val::Px(right);
        }
        if let Some(bottom) = inset.bottom {
            style.bottom = Val::Px(bottom);
        }
        if let Some(left) = inset.left {
            style.left = Val::Px(left);
        }
    }
    if let Some(width) = layout.width {
        style.width = Val::Px(width);
    }
    if let Some(height) = layout.height {
        style.height = Val::Px(height);
    }
    if let Some(min_width) = layout.min_width {
        style.min_width = Val::Px(min_width);
    }
    if let Some(max_width) = layout.max_width {
        style.max_width = Val::Px(max_width);
    }
    if let Some(min_height) = layout.min_height {
        style.min_height = Val::Px(min_height);
    }
    if let Some(max_height) = layout.max_height {
        style.max_height = Val::Px(max_height);
    }
    if let Some(grow) = layout.grow {
        style.flex_grow = grow;
    }
    if let Some(overflow) = layout.overflow.as_deref() {
        style.overflow = match overflow {
            "hidden" => Overflow::clip(),
            "scroll" => Overflow::clip_y(),
            _ => Overflow::visible(),
        };
    }
}

pub fn scroll_native_ui(
    mut mouse_wheel_events: EventReader<MouseWheel>,
    mut containers: Query<(&mut NativeUiScrollContainer, &Children, &Node)>,
    child_nodes: Query<&Node>,
    mut child_styles: Query<&mut Style>,
) {
    for event in mouse_wheel_events.read() {
        let dy = match event.unit {
            MouseScrollUnit::Line => event.y * 20.0,
            MouseScrollUnit::Pixel => event.y,
        };
        for (mut scroll, children, container_node) in &mut containers {
            let content_height = children
                .iter()
                .filter_map(|child| child_nodes.get(*child).ok())
                .map(|node| node.size().y)
                .sum::<f32>();
            let max_scroll = (content_height - container_node.size().y).max(0.0);
            scroll.offset_y = (scroll.offset_y + dy).clamp(-max_scroll, 0.0);
            for child in children.iter() {
                if let Ok(mut style) = child_styles.get_mut(*child) {
                    style.position_type = PositionType::Relative;
                    style.top = Val::Px(scroll.offset_y);
                }
            }
        }
    }
}

pub fn dispatch_native_ui_actions(
    mut queue: ResMut<NativeUiActionQueue>,
    interactions: Query<
        (&Interaction, &NativeUiAction, &ThreeNativeId),
        (Changed<Interaction>, With<Button>),
    >,
) {
    for (interaction, action, id) in &interactions {
        if *interaction == Interaction::Pressed {
            queue.events.push(NativeUiActionEvent {
                action: action.0.clone(),
                node: id.0.clone(),
            });
        }
    }
}

pub fn sync_native_minimap_markers(
    bundle: &LoadedBundle,
    markers: &mut Query<(
        &NativeUiMinimapMarker,
        &mut Style,
        &mut BackgroundColor,
        &mut Visibility,
    )>,
) {
    let Some(ui) = bundle.ui.as_ref() else {
        return;
    };
    for (marker, mut style, mut background, mut visibility) in markers.iter_mut() {
        let Some(node) = find_node_by_id(&ui.root, &marker.root_id) else {
            continue;
        };
        let Some(minimap) = node.minimap.as_ref() else {
            continue;
        };
        let dynamic_markers = node
            .binding
            .as_ref()
            .and_then(|binding| minimap_binding_value(bundle, binding))
            .and_then(|value| minimap_markers_from_value(&value));
        let marker_data = dynamic_markers
            .as_ref()
            .and_then(|markers| markers.get(marker.index))
            .or_else(|| minimap.markers.get(marker.index));
        let Some(marker_data) = marker_data else {
            *visibility = Visibility::Hidden;
            continue;
        };
        let width = layout_px(node.layout.as_ref().and_then(|layout| layout.width), 160.0);
        let height = layout_px(node.layout.as_ref().and_then(|layout| layout.height), 120.0);
        let radius = marker_data.radius.unwrap_or(3.0).max(2.0);
        let (left, top) = minimap_point(marker_data.x, marker_data.z, &minimap.bounds, width, height);
        style.left = Val::Px(left - radius);
        style.top = Val::Px(top - radius);
        style.width = Val::Px(radius * 2.0);
        style.height = Val::Px(radius * 2.0);
        *background = BackgroundColor(styled_color(marker_data.color.as_ref(), (1.0, 0.55, 0.16, 1.0), None));
        *visibility = Visibility::Visible;
    }
}

fn minimap_binding_value(bundle: &LoadedBundle, binding: &UiBindingIr) -> Option<serde_json::Value> {
    match binding {
        UiBindingIr::Resource { name, field } => {
            let value = bundle.world.resources.get(name)?;
            let value = match field {
                Some(field) => value.get(field)?,
                None => value,
            };
            if let Some(text) = value.as_str() {
                serde_json::from_str(text).ok()
            } else {
                Some(value.clone())
            }
        }
        UiBindingIr::Component { .. } => None,
    }
}

fn minimap_markers_from_value(value: &serde_json::Value) -> Option<Vec<UiMinimapMarkerIr>> {
    value
        .get("markers")
        .cloned()
        .and_then(|markers| serde_json::from_value(markers).ok())
}

fn find_node_by_id<'a>(node: &'a UiNodeIr, id: &str) -> Option<&'a UiNodeIr> {
    if node.id == id {
        return Some(node);
    }
    node.children.iter().find_map(|child| find_node_by_id(child, id))
}

fn spawn_runtime_children(
    world: &mut World,
    parent: Entity,
    node: &UiNodeIr,
    fonts: &[UiFontAssetIr],
) {
    if node.kind == "button" || node.kind == "touchControl" {
        if let Some(label) = node.label.as_ref() {
            let label = world
                .spawn(text_bundle(world, label.clone(), node, fonts))
                .insert(Name::new(format!("{}.label", node.id)))
                .id();
            world.entity_mut(parent).push_children(&[label]);
        }
    }

    if node.kind == "bar" {
        let max = node.max.unwrap_or(1.0).max(f32::EPSILON);
        let value = node.value.unwrap_or(0.0).clamp(0.0, max);
        let fill = world
            .spawn(NodeBundle {
                style: Style {
                    width: Val::Percent((value / max) * 100.0),
                    height: Val::Percent(100.0),
                    ..Default::default()
                },
                background_color: BackgroundColor(Color::srgb(0.22, 0.74, 0.42)),
                ..Default::default()
            })
            .insert(Name::new(format!("{}.fill", node.id)))
            .id();
        world.entity_mut(parent).push_children(&[fill]);
    }

    if node.kind == "minimap" {
        spawn_minimap_children(world, parent, node);
    }
}

const NATIVE_MINIMAP_MARKER_CAPACITY: usize = 12;

fn spawn_minimap_children(world: &mut World, parent: Entity, node: &UiNodeIr) {
    let Some(minimap) = node.minimap.as_ref() else {
        return;
    };
    let width = layout_px(node.layout.as_ref().and_then(|layout| layout.width), 160.0);
    let height = layout_px(node.layout.as_ref().and_then(|layout| layout.height), 120.0);
    let mut children = Vec::new();
    for path in &minimap.paths {
        for point in path.points.iter().step_by(4) {
            let (left, top) = minimap_point(point[0], point[1], &minimap.bounds, width, height);
            let dot = world
                .spawn(NodeBundle {
                    style: Style {
                        position_type: PositionType::Absolute,
                        left: Val::Px(left),
                        top: Val::Px(top),
                        width: Val::Px(path.width.unwrap_or(2.0).max(1.0)),
                        height: Val::Px(path.width.unwrap_or(2.0).max(1.0)),
                        ..Default::default()
                    },
                    background_color: BackgroundColor(styled_color(path.color.as_ref(), (0.75, 0.88, 1.0, 0.82), None)),
                    border_radius: BorderRadius::all(Val::Px(4.0)),
                    ..Default::default()
                })
                .insert((NativeUiMinimapPathPoint { root_id: node.id.clone() }, Name::new(format!("{}.path", node.id))))
                .id();
            children.push(dot);
        }
    }
    let static_markers = minimap.markers.iter().cloned().collect::<Vec<_>>();
    for index in 0..NATIVE_MINIMAP_MARKER_CAPACITY {
        let marker = static_markers.get(index);
        let radius = marker.and_then(|marker| marker.radius).unwrap_or(3.0).max(2.0);
        let (left, top) = marker
            .map(|marker| minimap_point(marker.x, marker.z, &minimap.bounds, width, height))
            .unwrap_or((-1000.0, -1000.0));
        let dot = world
            .spawn(NodeBundle {
                style: Style {
                    position_type: PositionType::Absolute,
                    left: Val::Px(left - radius),
                    top: Val::Px(top - radius),
                    width: Val::Px(radius * 2.0),
                    height: Val::Px(radius * 2.0),
                    ..Default::default()
                },
                background_color: BackgroundColor(styled_color(marker.and_then(|marker| marker.color.as_ref()), (1.0, 0.55, 0.16, 1.0), None)),
                border_radius: BorderRadius::all(Val::Px(radius)),
                visibility: if marker.is_some() { Visibility::Visible } else { Visibility::Hidden },
                ..Default::default()
            })
            .insert((
                NativeUiMinimapMarker { index, root_id: node.id.clone() },
                Name::new(format!("{}.marker.{}", node.id, index)),
            ))
            .id();
        children.push(dot);
    }
    world.entity_mut(parent).push_children(&children);
}

fn layout_px(value: Option<f32>, fallback: f32) -> f32 {
    value.unwrap_or(fallback).max(1.0)
}

fn minimap_point(x: f32, z: f32, bounds: &UiMinimapBoundsIr, width: f32, height: f32) -> (f32, f32) {
    let nx = ((x - bounds.min_x) / (bounds.max_x - bounds.min_x).max(f32::EPSILON)).clamp(0.0, 1.0);
    let nz = ((z - bounds.min_z) / (bounds.max_z - bounds.min_z).max(f32::EPSILON)).clamp(0.0, 1.0);
    (nx * width, (1.0 - nz) * height)
}

fn background_color(node: &UiNodeIr, fallback: (f32, f32, f32, f32)) -> BackgroundColor {
    BackgroundColor(styled_color(
        node.style
            .as_ref()
            .and_then(|style| style.background_color.as_ref()),
        fallback,
        node.style.as_ref().and_then(|style| style.opacity),
    ))
}

fn border_color(node: &UiNodeIr) -> BorderColor {
    BorderColor(styled_color(
        node.style
            .as_ref()
            .and_then(|style| style.border_color.as_ref()),
        (0.0, 0.0, 0.0, 0.0),
        node.style.as_ref().and_then(|style| style.opacity),
    ))
}

fn border_radius(node: &UiNodeIr) -> BorderRadius {
    node.style
        .as_ref()
        .and_then(|style| style.border_radius)
        .map(|radius| BorderRadius::all(Val::Px(radius)))
        .unwrap_or_default()
}

fn text_color(node: &UiNodeIr) -> Color {
    styled_color(
        node.style.as_ref().and_then(|style| style.color.as_ref()),
        (1.0, 1.0, 1.0, 1.0),
        node.style.as_ref().and_then(|style| style.opacity),
    )
}

fn text_bundle(
    world: &World,
    value: impl Into<String>,
    node: &UiNodeIr,
    fonts: &[UiFontAssetIr],
) -> TextBundle {
    let mut bundle = if node.spans.is_empty() {
        TextBundle::from_section(value, text_style(world, node, None, fonts))
    } else {
        TextBundle::from_sections(
            node.spans
                .iter()
                .map(|span| {
                    TextSection::new(
                        span.text.clone(),
                        text_style(world, node, Some(span), fonts),
                    )
                })
                .collect::<Vec<_>>(),
        )
    };
    bundle.text.justify = text_justify(node);
    bundle.text.linebreak_behavior = text_wrap(node);
    bundle
}

fn text_style(
    world: &World,
    node: &UiNodeIr,
    span: Option<&UiRichTextSpanIr>,
    fonts: &[UiFontAssetIr],
) -> TextStyle {
    let asset_server = world.get_resource::<AssetServer>();
    let font_family = span
        .and_then(|span| span.font_family.as_deref())
        .or_else(|| {
            node.style
                .as_ref()
                .and_then(|style| style.font_family.as_deref())
        });
    let font = font_family
        .and_then(|family| fonts.iter().find(|font| font.family == family))
        .and_then(|font| asset_server.map(|asset_server| asset_server.load(font.asset.clone())))
        .unwrap_or_default();
    TextStyle {
        color: span
            .and_then(|span| span.color.as_ref())
            .map(|color| {
                styled_color(
                    Some(color),
                    (1.0, 1.0, 1.0, 1.0),
                    node.style.as_ref().and_then(|style| style.opacity),
                )
            })
            .unwrap_or_else(|| text_color(node)),
        font,
        font_size: span
            .and_then(|span| span.font_size)
            .or_else(|| node.style.as_ref().and_then(|style| style.font_size))
            .unwrap_or_else(|| TextStyle::default().font_size),
        ..Default::default()
    }
}

fn value_to_string(value: &serde_json::Value) -> String {
    value
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| value.to_string())
}

fn text_justify(node: &UiNodeIr) -> JustifyText {
    match node
        .style
        .as_ref()
        .and_then(|style| style.text_align.as_deref())
    {
        Some("center") => JustifyText::Center,
        Some("right") => JustifyText::Right,
        _ => JustifyText::Left,
    }
}

fn text_wrap(node: &UiNodeIr) -> BreakLineOn {
    match node.style.as_ref().and_then(|style| style.wrap.as_deref()) {
        Some("character") => BreakLineOn::AnyCharacter,
        Some("none") => BreakLineOn::NoWrap,
        _ => BreakLineOn::WordBoundary,
    }
}

fn styled_color(
    value: Option<&String>,
    fallback: (f32, f32, f32, f32),
    opacity: Option<f32>,
) -> Color {
    let opacity = opacity.unwrap_or(1.0);
    if let Some(value) = value.and_then(|value| parse_hex_color(value, opacity)) {
        return value;
    }
    Color::srgba(fallback.0, fallback.1, fallback.2, fallback.3 * opacity)
}

fn parse_hex_color(value: &str, opacity: f32) -> Option<Color> {
    let value = value.strip_prefix('#')?;
    if value.len() != 6 && value.len() != 8 {
        return None;
    }
    let red = u8::from_str_radix(&value[0..2], 16).ok()?;
    let green = u8::from_str_radix(&value[2..4], 16).ok()?;
    let blue = u8::from_str_radix(&value[4..6], 16).ok()?;
    let alpha = if value.len() == 8 {
        u8::from_str_radix(&value[6..8], 16).ok()? as f32 / 255.0
    } else {
        1.0
    };
    Some(Color::srgba(
        red as f32 / 255.0,
        green as f32 / 255.0,
        blue as f32 / 255.0,
        alpha * opacity,
    ))
}
