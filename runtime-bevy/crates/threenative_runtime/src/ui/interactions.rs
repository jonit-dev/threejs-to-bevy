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
        (
            &Interaction,
            &NativeUiAction,
            &ThreeNativeId,
            Option<&NativeUiDisabled>,
        ),
        (Changed<Interaction>, With<Button>),
    >,
) {
    for (interaction, action, id, disabled) in &interactions {
        if *interaction == Interaction::Pressed && disabled.is_none_or(|disabled| !disabled.0) {
            queue.events.push(NativeUiActionEvent {
                action: action.0.clone(),
                node: id.0.clone(),
                value: None,
            });
        }
    }
}

pub fn drain_native_ui_action_ids(queue: &mut NativeUiActionQueue) -> Vec<String> {
    let mut actions = queue
        .events
        .drain(..)
        .map(|event| event.action)
        .collect::<Vec<_>>();
    actions.sort();
    actions.dedup();
    actions
}

pub fn queue_native_ui_text_input_value(
    queue: &mut NativeUiActionQueue,
    id: &ThreeNativeId,
    action: &NativeUiAction,
    value: impl Into<String>,
) {
    queue.events.push(NativeUiActionEvent {
        action: action.0.clone(),
        node: id.0.clone(),
        value: Some(value.into()),
    });
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
        let (left, top) =
            minimap_point(marker_data.x, marker_data.z, &minimap.bounds, width, height);
        style.left = Val::Px(left - radius);
        style.top = Val::Px(top - radius);
        style.width = Val::Px(radius * 2.0);
        style.height = Val::Px(radius * 2.0);
        *background = BackgroundColor(styled_color(
            marker_data.color.as_ref(),
            (1.0, 0.55, 0.16, 1.0),
            None,
        ));
        *visibility = Visibility::Visible;
    }
}

fn minimap_binding_value(
    bundle: &LoadedBundle,
    binding: &UiBindingIr,
) -> Option<serde_json::Value> {
    match binding {
        UiBindingIr::Resource { name, field, .. } => {
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
    node.children
        .iter()
        .find_map(|child| find_node_by_id(child, id))
}

fn spawn_runtime_children(
    world: &mut World,
    parent: Entity,
    node: &UiNodeIr,
    fonts: &[UiFontAssetIr],
) {
    if node.kind == "button" || node.kind == "textInput" || node.kind == "touchControl" {
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
                    background_color: BackgroundColor(styled_color(
                        path.color.as_ref(),
                        (0.75, 0.88, 1.0, 0.82),
                        None,
                    )),
                    border_radius: BorderRadius::all(Val::Px(4.0)),
                    ..Default::default()
                })
                .insert((
                    NativeUiMinimapPathPoint {
                        root_id: node.id.clone(),
                    },
                    Name::new(format!("{}.path", node.id)),
                ))
                .id();
            children.push(dot);
        }
    }
    let static_markers = minimap.markers.iter().cloned().collect::<Vec<_>>();
    for index in 0..NATIVE_MINIMAP_MARKER_CAPACITY {
        let marker = static_markers.get(index);
        let radius = marker
            .and_then(|marker| marker.radius)
            .unwrap_or(3.0)
            .max(2.0);
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
                background_color: BackgroundColor(styled_color(
                    marker.and_then(|marker| marker.color.as_ref()),
                    (1.0, 0.55, 0.16, 1.0),
                    None,
                )),
                border_radius: BorderRadius::all(Val::Px(radius)),
                visibility: if marker.is_some() {
                    Visibility::Visible
                } else {
                    Visibility::Hidden
                },
                ..Default::default()
            })
            .insert((
                NativeUiMinimapMarker {
                    index,
                    root_id: node.id.clone(),
                },
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

fn minimap_point(
    x: f32,
    z: f32,
    bounds: &UiMinimapBoundsIr,
    width: f32,
    height: f32,
) -> (f32, f32) {
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
    bundle.style = leaf_style(node);
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
    let bold = span
        .and_then(|span| span.weight.as_ref())
        .is_some_and(ui_font_weight_is_bold)
        || span.is_none()
            && node
                .style
                .as_ref()
                .and_then(|style| style.font_weight.as_deref())
                == Some("bold");
    let font = font_family
        .and_then(|family| fonts.iter().find(|font| font.family == family))
        .and_then(|font| {
            let asset = if bold {
                font.bold_asset.as_ref().unwrap_or(&font.asset)
            } else {
                &font.asset
            };
            asset_server.map(|asset_server| asset_server.load(asset.clone()))
        })
        .or_else(|| {
            world
                .get_resource::<NativeUiFallbackFont>()
                .map(|font| font.0.clone())
        })
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
    }
}

fn ui_font_weight_is_bold(weight: &serde_json::Value) -> bool {
    weight.as_str() == Some("bold") || weight.as_u64().is_some_and(|weight| weight >= 600)
}

pub fn native_ui_font_asset_path<'a>(
    fonts: &'a [UiFontAssetIr],
    family: Option<&str>,
    bold: bool,
) -> Option<&'a str> {
    let font = fonts
        .iter()
        .find(|font| Some(font.family.as_str()) == family)?;
    Some(if bold {
        font.bold_asset.as_deref().unwrap_or(&font.asset)
    } else {
        &font.asset
    })
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
