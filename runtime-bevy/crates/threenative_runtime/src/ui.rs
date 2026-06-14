use std::collections::HashMap;

use bevy::prelude::*;
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
    pub text: Option<String>,
    pub value: Option<f32>,
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
        text: node.text.clone(),
        value: node.value,
    })
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
                style: leaf_style(),
                background_color: BackgroundColor(Color::srgb(0.15, 0.17, 0.2)),
                ..Default::default()
            })
            .id(),
        "bar" => world
            .spawn(NodeBundle {
                style: bar_style(),
                background_color: BackgroundColor(Color::srgb(0.16, 0.18, 0.2)),
                ..Default::default()
            })
            .id(),
        _ => world
            .spawn(NodeBundle {
                style: layout_style(node.kind.as_str()),
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

fn layout_style(kind: &str) -> Style {
    Style {
        flex_direction: match kind {
            "row" => FlexDirection::Row,
            "stack" => FlexDirection::Column,
            _ => FlexDirection::Column,
        },
        row_gap: Val::Px(8.0),
        column_gap: Val::Px(8.0),
        padding: UiRect::all(Val::Px(8.0)),
        ..Default::default()
    }
}

fn leaf_style() -> Style {
    Style {
        padding: UiRect::axes(Val::Px(12.0), Val::Px(8.0)),
        ..Default::default()
    }
}

fn bar_style() -> Style {
    Style {
        width: Val::Px(160.0),
        height: Val::Px(12.0),
        ..Default::default()
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
