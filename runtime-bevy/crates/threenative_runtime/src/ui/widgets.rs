fn spawn_node(
    world: &mut World,
    node: &UiNodeIr,
    fonts: &[UiFontAssetIr],
    entities_by_id: &mut HashMap<String, Entity>,
    is_root: bool,
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
        "button" | "textInput" | "touchControl" | "slider" | "scrollbar" => world
            .spawn(ButtonBundle {
                style: ui_node_style(node, is_root, leaf_style),
                background_color: background_color(node, (0.15, 0.17, 0.2, 1.0)),
                border_color: border_color(node),
                border_radius: border_radius(node),
                ..Default::default()
            })
            .id(),
        "bar" => world
            .spawn(NodeBundle {
                style: ui_node_style(node, is_root, bar_style),
                background_color: background_color(node, (0.16, 0.18, 0.2, 1.0)),
                border_color: border_color(node),
                border_radius: border_radius(node),
                ..Default::default()
            })
            .id(),
        "minimap" => world
            .spawn(NodeBundle {
                style: ui_node_style(node, is_root, minimap_style),
                background_color: minimap_background_color(node),
                border_color: border_color(node),
                border_radius: border_radius(node),
                ..Default::default()
            })
            .id(),
        "image" => world
            .spawn((
                ImageBundle {
                    style: ui_node_style(node, is_root, leaf_style),
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
                style: ui_node_style(node, is_root, layout_style),
                background_color: background_color(node, (0.0, 0.0, 0.0, 0.0)),
                border_color: border_color(node),
                border_radius: border_radius(node),
                ..Default::default()
            })
            .id(),
    };

    insert_ui_node_components(world, entity, node, fonts);

    spawn_native_ui_visual_layers(world, entity, node);
    spawn_runtime_children(world, entity, node, fonts);

    entities_by_id.insert(node.id.clone(), entity);
    for child in &node.children {
        spawn_node(world, child, fonts, entities_by_id, false);
    }

    entity
}

fn ui_node_style(
    node: &UiNodeIr,
    is_root: bool,
    build_style: impl FnOnce(&UiNodeIr) -> Style,
) -> Style {
    let mut style = build_style(node);
    if is_root {
        style.position_type = PositionType::Absolute;
        if node
            .layout
            .as_ref()
            .and_then(|layout| layout.width)
            .is_none()
        {
            style.width = Val::Percent(100.0);
        }
        if node
            .layout
            .as_ref()
            .and_then(|layout| layout.height)
            .is_none()
        {
            style.height = Val::Percent(100.0);
        }
        if node
            .layout
            .as_ref()
            .and_then(|layout| layout.overflow.as_deref())
            .is_none()
        {
            style.overflow = Overflow::clip();
        }
    }
    style
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
            .or_else(|| {
                node.style
                    .as_ref()
                    .and_then(|style| style.background_color.as_ref())
            }),
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
    if node.disabled == Some(true) {
        builder.set_disabled();
    }
    if let Some(value) = node.value {
        builder.set_numeric_value(f64::from(value));
    }
    if let Some(value_text) = node
        .value_text
        .as_ref()
        .or(node.text.as_ref().filter(|_| node.kind == "textInput"))
    {
        builder.set_value(value_text.clone());
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
            "column" | "component" | "row" | "stack" => Some(Role::Group),
            "textInput" => Some(Role::TextInput),
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

fn insert_ui_node_components(
    world: &mut World,
    entity: Entity,
    node: &UiNodeIr,
    fonts: &[UiFontAssetIr],
) {
    let mut entity_mut = world.entity_mut(entity);
    entity_mut.insert((
        ThreeNativeId(node.id.clone()),
        NativeUiKind(node.kind.clone()),
        Name::new(node.id.clone()),
    ));
    if let Some(action) = node.action.as_ref() {
        entity_mut.insert(NativeUiAction(action.clone()));
    }
    if let Some(disabled) = node.disabled {
        entity_mut.insert(NativeUiDisabled(disabled));
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
    if let Some(navigation) = node.navigation.as_ref() {
        entity_mut.insert(NativeUiNavigation {
            down: navigation.down.clone(),
            left: navigation.left.clone(),
            right: navigation.right.clone(),
            up: navigation.up.clone(),
        });
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
    if node.kind == "textInput" {
        entity_mut.insert(NativeUiWidget {
            kind: node.kind.clone(),
            max: 0.0,
            min: 0.0,
            orientation: "horizontal".to_owned(),
            step: None,
            value: 0.0,
            value_text: node.text.clone().or_else(|| node.value_text.clone()),
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
    if let Some(text_style) = rendered_text_style(node, fonts) {
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
