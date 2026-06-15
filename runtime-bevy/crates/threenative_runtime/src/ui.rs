use std::collections::HashMap;

use bevy::a11y::{
    accesskit::{NodeBuilder, Role},
    AccessibilityNode,
};
use bevy::input::mouse::{MouseScrollUnit, MouseWheel};
use bevy::prelude::*;
use bevy::text::BreakLineOn;
use serde::Serialize;
use thiserror::Error;
use threenative_components::ThreeNativeId;
use threenative_loader::{UiGradientIr, UiIr, UiNodeIr, UiShadowIr, UiStyleIr};

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

#[derive(Clone, Component, Debug, Eq, PartialEq)]
pub struct NativeUiImageSrc(pub String);

#[derive(Clone, Debug, PartialEq)]
pub struct NativeUiNode {
    pub action: Option<String>,
    pub accessibility_label: Option<String>,
    pub children: Vec<NativeUiNode>,
    pub focusable: Option<bool>,
    pub id: String,
    pub kind: String,
    pub label: Option<String>,
    pub max: Option<f32>,
    pub navigation: Option<NativeUiNavigation>,
    pub role: Option<String>,
    pub style: Option<NativeUiStyle>,
    pub src: Option<String>,
    pub text: Option<String>,
    pub value: Option<f32>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeUiStyle {
    pub background_color: Option<String>,
    pub border_color: Option<String>,
    pub border_radius: Option<f32>,
    pub border_width: Option<f32>,
    pub color: Option<String>,
    pub font_size: Option<f32>,
    pub gradient: Option<NativeUiGradient>,
    pub opacity: Option<f32>,
    pub shadow: Option<NativeUiShadow>,
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
    spawn_node(world, &ui.root, &mut entities_by_id);
    attach_children(world, &ui.root, &entities_by_id);

    Ok(())
}

fn build_node(node: &UiNodeIr, path: &str) -> Result<NativeUiNode, UiDiagnostic> {
    if !matches!(
        node.kind.as_str(),
        "bar" | "button" | "column" | "image" | "row" | "stack" | "text" | "touchControl"
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
        children: node
            .children
            .iter()
            .enumerate()
            .map(|(index, child)| build_node(child, &format!("{path}/children/{index}")))
            .collect::<Result<Vec<_>, _>>()?,
        focusable: node.focusable,
        id: node.id.clone(),
        kind: node.kind.clone(),
        label: node.label.clone(),
        max: node.max,
        navigation: node
            .navigation
            .as_ref()
            .map(|navigation| NativeUiNavigation {
                down: navigation.down.clone(),
                left: navigation.left.clone(),
                right: navigation.right.clone(),
                up: navigation.up.clone(),
            }),
        role: node.role.clone(),
        style: node.style.as_ref().map(|style| NativeUiStyle {
            background_color: style.background_color.clone(),
            border_color: style.border_color.clone(),
            border_radius: style.border_radius,
            border_width: style.border_width,
            color: style.color.clone(),
            font_size: style.font_size,
            gradient: style.gradient.as_ref().map(native_ui_gradient),
            opacity: style.opacity,
            shadow: style.shadow.as_ref().map(native_ui_shadow),
            text_align: style.text_align.clone(),
            wrap: style.wrap.clone(),
        }),
        src: node.src.clone(),
        text: node.text.clone(),
        value: node.value,
    })
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
    entities_by_id: &mut HashMap<String, Entity>,
) -> Entity {
    let entity = match node.kind.as_str() {
        "text" => world
            .spawn(text_bundle(
                node.text
                    .as_deref()
                    .or(node.label.as_deref())
                    .unwrap_or_default(),
                node,
            ))
            .id(),
        "button" | "touchControl" => world
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
        if let Some(focusable) = node.focusable {
            entity_mut.insert(NativeUiFocusable(focusable));
        }
        if let Some(z_index) = node.layout.as_ref().and_then(|layout| layout.z_index) {
            entity_mut.insert(ZIndex::Local(z_index));
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

    spawn_runtime_children(world, entity, node);

    entities_by_id.insert(node.id.clone(), entity);
    for child in &node.children {
        spawn_node(world, child, entities_by_id);
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

fn spawn_runtime_children(world: &mut World, parent: Entity, node: &UiNodeIr) {
    if node.kind == "button" || node.kind == "touchControl" {
        if let Some(label) = node.label.as_ref() {
            let label = world
                .spawn(text_bundle(label.clone(), node))
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

fn text_bundle(value: impl Into<String>, node: &UiNodeIr) -> TextBundle {
    let mut bundle = TextBundle::from_section(value, text_style(node));
    bundle.text.justify = text_justify(node);
    bundle.text.linebreak_behavior = text_wrap(node);
    bundle
}

fn text_style(node: &UiNodeIr) -> TextStyle {
    TextStyle {
        color: text_color(node),
        font_size: node
            .style
            .as_ref()
            .and_then(|style| style.font_size)
            .unwrap_or_else(|| TextStyle::default().font_size),
        ..Default::default()
    }
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
