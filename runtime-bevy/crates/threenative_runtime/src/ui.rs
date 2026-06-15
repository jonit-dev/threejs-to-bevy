use std::collections::HashMap;

use bevy::prelude::*;
use serde::Serialize;
use thiserror::Error;
use threenative_components::ThreeNativeId;
use threenative_loader::{UiIr, UiNodeIr};

#[derive(Clone, Component, Debug, Eq, PartialEq)]
pub struct NativeUiKind(pub String);

#[derive(Clone, Component, Debug, Eq, PartialEq)]
pub struct NativeUiAction(pub String);

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeUiBar {
    pub max: f32,
    pub value: f32,
}

#[derive(Clone, Component, Debug, Eq, PartialEq)]
pub struct NativeUiFocusable(pub bool);

#[derive(Clone, Debug, PartialEq)]
pub struct NativeUiNode {
    pub action: Option<String>,
    pub children: Vec<NativeUiNode>,
    pub focusable: Option<bool>,
    pub id: String,
    pub kind: String,
    pub label: Option<String>,
    pub max: Option<f32>,
    pub navigation: Option<NativeUiNavigation>,
    pub text: Option<String>,
    pub value: Option<f32>,
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
        "bar" | "button" | "column" | "row" | "stack" | "text" | "touchControl"
    ) {
        return Err(UiDiagnostic {
            code: "TN_BEVY_UI_NODE_UNSUPPORTED".to_owned(),
            message: format!("Unsupported UI node '{}'.", node.kind),
            path: format!("{path}/kind"),
        });
    }
    Ok(NativeUiNode {
        action: node.action.clone(),
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
        text: node.text.clone(),
        value: node.value,
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
        "next" | "down" | "right" => order.get((index + 1).min(order.len() - 1)).cloned(),
        "previous" | "up" | "left" => order.get(index.saturating_sub(1)).cloned(),
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
            .spawn(TextBundle::from_section(
                node.text
                    .as_deref()
                    .or(node.label.as_deref())
                    .unwrap_or_default(),
                TextStyle::default(),
            ))
            .id(),
        "button" => world
            .spawn(ButtonBundle {
                style: leaf_style(node),
                background_color: BackgroundColor(Color::srgb(0.15, 0.17, 0.2)),
                ..Default::default()
            })
            .id(),
        "bar" => world
            .spawn(NodeBundle {
                style: bar_style(node),
                background_color: BackgroundColor(Color::srgb(0.16, 0.18, 0.2)),
                ..Default::default()
            })
            .id(),
        _ => world
            .spawn(NodeBundle {
                style: layout_style(node),
                background_color: BackgroundColor(Color::NONE),
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
        if let Some(focusable) = node.focusable {
            entity_mut.insert(NativeUiFocusable(focusable));
        }
        if let Some(z_index) = node.layout.as_ref().and_then(|layout| layout.z_index) {
            entity_mut.insert(ZIndex::Local(z_index));
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
    style
}

fn leaf_style(node: &UiNodeIr) -> Style {
    let mut style = Style {
        padding: UiRect::axes(Val::Px(12.0), Val::Px(8.0)),
        ..Default::default()
    };
    apply_layout(&mut style, node.layout.as_ref());
    style
}

fn bar_style(node: &UiNodeIr) -> Style {
    let mut style = Style {
        width: Val::Px(160.0),
        height: Val::Px(12.0),
        ..Default::default()
    };
    apply_layout(&mut style, node.layout.as_ref());
    style
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
    if let Some(grow) = layout.grow {
        style.flex_grow = grow;
    }
    if let Some(overflow) = layout.overflow.as_deref() {
        style.overflow = match overflow {
            "hidden" => Overflow::clip(),
            _ => Overflow::visible(),
        };
    }
}

fn spawn_runtime_children(world: &mut World, parent: Entity, node: &UiNodeIr) {
    if node.kind == "button" {
        if let Some(label) = node.label.as_ref() {
            let label = world
                .spawn(TextBundle::from_section(
                    label.clone(),
                    TextStyle::default(),
                ))
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
