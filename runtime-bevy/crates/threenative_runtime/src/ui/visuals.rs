#[derive(Debug, Default, Resource)]
struct NativeUiVisualAssetCache {
    gradients: HashMap<String, Handle<Image>>,
    shadow: Option<Handle<Image>>,
}

fn spawn_native_ui_visual_layers(world: &mut World, owner: Entity, node: &UiNodeIr) {
    world.init_resource::<Assets<Image>>();
    world.init_resource::<NativeUiVisualAssetCache>();
    let mut children = Vec::new();
    if let Some(shadow) = world.get::<NativeUiRenderedShadow>(owner).cloned() {
        children.push(spawn_native_ui_shadow_layer(world, node, &shadow));
    }
    if let Some(gradient) = world.get::<NativeUiRenderedGradient>(owner).cloned() {
        children.push(spawn_native_ui_gradient_layer(world, node, &gradient));
    }
    for effect in &node.effects {
        if let Some(layer) = spawn_native_ui_effect_layer(world, owner, node, effect) {
            children.push(layer);
        }
    }
    if !children.is_empty() {
        world.entity_mut(owner).push_children(&children);
    }
    if !node.effects.is_empty() {
        world.entity_mut(owner).insert(NativeUiEffectState::default());
    }
}

fn spawn_native_ui_effect_layer(
    world: &mut World,
    owner: Entity,
    node: &UiNodeIr,
    effect: &threenative_loader::UiEffectPresetIr,
) -> Option<Entity> {
    let strategy = native_ui_effect_render_strategy(effect);
    if strategy == "none" {
        return None;
    }
    let mut color = styled_color(effect.color.as_ref(), (1.0, 1.0, 1.0, 1.0), None);
    let intensity = effect.intensity.unwrap_or(2.0).max(1.0);
    let radius = effect.radius.unwrap_or(4.0).max(0.0);
    let layer = NativeUiEffectLayer {
        active_since_seconds: None,
        base_color: color,
        effect: effect.id.clone(),
        kind: effect.kind.clone(),
        owner,
        pulse_duration_seconds: effect.pulse.as_ref().map(|pulse| pulse.duration_ms / 1000.0),
        pulse_iterations: effect.pulse.as_ref().and_then(|pulse| pulse.iterations),
        strategy: strategy.clone(),
        trigger: effect.trigger.clone(),
    };
    if strategy == "tint" {
        let alpha = color.to_srgba().alpha * effect.intensity.unwrap_or(0.5).clamp(0.0, 1.0);
        color = color.with_alpha(alpha);
    }
    let layer = NativeUiEffectLayer { base_color: color, ..layer };
    let visibility = if effect.trigger == "disabled" && node.disabled == Some(true) {
        Visibility::Visible
    } else {
        Visibility::Hidden
    };
    let style = Style {
        position_type: PositionType::Absolute,
        left: Val::Px(-radius),
        right: Val::Px(-radius),
        top: Val::Px(-radius),
        bottom: Val::Px(-radius),
        border: UiRect::all(Val::Px(intensity)),
        ..Default::default()
    };
    let entity = match strategy.as_str() {
        "shadow" => {
            let mut image = UiImage::new(native_ui_shadow_texture(world));
            image.color = color;
            world
                .spawn((
                    ImageBundle { style, image, focus_policy: FocusPolicy::Pass, visibility, ..Default::default() },
                    ImageScaleMode::Sliced(TextureSlicer {
                        border: BorderRect::square(8.0),
                        center_scale_mode: SliceScaleMode::Stretch,
                        sides_scale_mode: SliceScaleMode::Stretch,
                        max_corner_scale: 1.0,
                    }),
                    layer,
                ))
                .id()
        }
        "tint" => world
            .spawn((
                NodeBundle {
                    style: Style { border: UiRect::ZERO, ..style },
                    background_color: BackgroundColor(color),
                    focus_policy: FocusPolicy::Pass,
                    visibility,
                    ..Default::default()
                },
                layer,
            ))
            .id(),
        _ => world
            .spawn((
                NodeBundle {
                    style,
                    background_color: BackgroundColor(Color::NONE),
                    border_color: BorderColor(color),
                    border_radius: BorderRadius::all(Val::Px(
                        node.style.as_ref().and_then(|style| style.border_radius).unwrap_or(0.0) + radius,
                    )),
                    focus_policy: FocusPolicy::Pass,
                    visibility,
                    ..Default::default()
                },
                layer,
            ))
            .id(),
    };
    world.entity_mut(entity).insert(Name::new(format!("{}.effect.{}", node.id, effect.id)));
    Some(entity)
}

fn native_ui_effect_render_strategy(effect: &threenative_loader::UiEffectPresetIr) -> String {
    effect.fallback.clone().unwrap_or_else(|| {
        if effect.kind == "tint" { "tint".to_owned() } else { "outline".to_owned() }
    })
}

pub fn sync_native_ui_effect_layers(
    time: Res<Time>,
    focus: Option<Res<bevy::a11y::Focus>>,
    owners: Query<(Option<&Interaction>, Option<&NativeUiDisabled>, Option<&NativeUiEffectState>)>,
    mut layers: Query<(
        &mut NativeUiEffectLayer,
        &mut Visibility,
        Option<&mut UiImage>,
        Option<&mut BorderColor>,
        Option<&mut BackgroundColor>,
    )>,
) {
    for (mut layer, mut visibility, image, border, background) in &mut layers {
        let Ok((interaction, disabled, state)) = owners.get(layer.owner) else {
            *visibility = Visibility::Hidden;
            continue;
        };
        let active = match layer.trigger.as_str() {
            "disabled" => disabled.is_some_and(|disabled| disabled.0),
            "focus" => focus.as_ref().is_some_and(|focus| focus.0 == Some(layer.owner)),
            "hover" => interaction.is_some_and(|interaction| *interaction != Interaction::None),
            "selected" => state.is_some_and(|state| state.selected),
            "predicate" => state.is_some_and(|state| state.predicates.get(&layer.effect) == Some(&true)),
            _ => false,
        };
        *visibility = if active { Visibility::Visible } else { Visibility::Hidden };
        if !active {
            layer.active_since_seconds = None;
            continue;
        }
        if layer.active_since_seconds.is_none() {
            layer.active_since_seconds = Some(time.elapsed_seconds());
        }
        if layer.kind != "pulse" {
            continue;
        }
        let duration = layer.pulse_duration_seconds.unwrap_or(1.0).max(f32::EPSILON);
        let elapsed = time.elapsed_seconds() - layer.active_since_seconds.unwrap_or(time.elapsed_seconds());
        let completed = layer
            .pulse_iterations
            .is_some_and(|iterations| elapsed / duration >= iterations as f32);
        let alpha = if completed {
            1.0
        } else {
            0.55 + 0.45 * (elapsed * std::f32::consts::TAU / duration).cos().abs()
        };
        let color = layer.base_color.with_alpha(alpha);
        if let Some(mut image) = image {
            image.color = color;
        }
        if let Some(mut border) = border {
            border.0 = color;
        }
        if let Some(mut background) = background {
            background.0 = color;
        }
    }
}

pub fn sync_native_ui_focus_from_interaction(
    mut focus: ResMut<bevy::a11y::Focus>,
    nodes: Query<
        (Entity, &Interaction, Option<&NativeUiDisabled>),
        Changed<Interaction>,
    >,
) {
    for (entity, interaction, disabled) in &nodes {
        if *interaction == Interaction::Pressed
            && !disabled.is_some_and(|disabled| disabled.0)
        {
            focus.0 = Some(entity);
        }
    }
}

pub fn sync_native_ui_effect_states(world: &mut World, bundle: &LoadedBundle) {
    let Some(ui) = bundle.ui.as_ref() else {
        return;
    };
    let targets = world
        .query::<(Entity, &ThreeNativeId, &NativeUiEffectState)>()
        .iter(world)
        .map(|(entity, id, _)| (entity, id.0.clone()))
        .collect::<Vec<_>>();
    for (entity, id) in targets {
        let Some(node) = find_node_by_id(&ui.root, &id) else {
            continue;
        };
        let selected = node
            .binding
            .as_ref()
            .and_then(|binding| native_ui_effect_binding_value(bundle, binding))
            .and_then(|value| value.as_bool())
            .unwrap_or(false);
        let predicates = node
            .effects
            .iter()
            .filter(|effect| effect.trigger == "predicate")
            .map(|effect| {
                (
                    effect.id.clone(),
                    effect
                        .predicate
                        .as_ref()
                        .is_some_and(|predicate| native_ui_effect_predicate_passes(bundle, predicate)),
                )
            })
            .collect();
        world.entity_mut(entity).insert(NativeUiEffectState { predicates, selected });
    }
}

fn native_ui_effect_binding_value(bundle: &LoadedBundle, binding: &UiBindingIr) -> Option<serde_json::Value> {
    match binding {
        UiBindingIr::Resource { name, field, .. } => {
            let value = bundle.world.resources.get(name)?;
            field.as_ref().map_or_else(|| Some(value.clone()), |field| value.get(field).cloned())
        }
        UiBindingIr::Component { entity, component, field, .. } => {
            let value = bundle.world.entities.iter().find(|candidate| candidate.id == *entity)?.components.value(component)?;
            field.as_ref().map_or_else(|| Some(value.clone()), |field| value.get(field).cloned())
        }
    }
}

fn native_ui_effect_predicate_passes(
    bundle: &LoadedBundle,
    predicate: &threenative_loader::UiEffectPredicateIr,
) -> bool {
    let value = if let Some(resource) = predicate.resource.as_ref() {
        bundle.world.resources.get(resource).cloned()
    } else if let (Some(entity), Some(component)) = (predicate.entity.as_ref(), predicate.component.as_ref()) {
        bundle
            .world
            .entities
            .iter()
            .find(|candidate| candidate.id == *entity)
            .and_then(|entity| entity.components.value(component))
    } else {
        None
    };
    let value = predicate
        .field
        .as_ref()
        .map_or(value.clone(), |field| value.as_ref().and_then(|value| value.get(field)).cloned());
    match predicate.equals.as_ref() {
        Some(expected) => value.as_ref() == Some(expected),
        None => value.is_some_and(|value| value.as_bool().unwrap_or(!value.is_null())),
    }
}

fn spawn_native_ui_shadow_layer(world: &mut World, node: &UiNodeIr, shadow: &NativeUiRenderedShadow) -> Entity {
    let blur = shadow.blur.unwrap_or(0.0).max(0.0);
    let spread = shadow.spread.unwrap_or(0.0);
    let extent = (blur + spread).max(0.0);
    let offset_x = shadow.offset_x.unwrap_or(0.0);
    let offset_y = shadow.offset_y.unwrap_or(0.0);
    let mut image = UiImage::new(native_ui_shadow_texture(world));
    image.color = styled_color(Some(&shadow.color), (0.0, 0.0, 0.0, 0.5), None);
    world
        .spawn((
            ImageBundle {
                style: Style {
                    position_type: PositionType::Absolute,
                    left: Val::Px(offset_x),
                    top: Val::Px(offset_y),
                    width: Val::Percent(100.0),
                    height: Val::Percent(100.0),
                    ..Default::default()
                },
                image,
                focus_policy: FocusPolicy::Pass,
                z_index: ZIndex::Local(1),
                ..Default::default()
            },
            ImageScaleMode::Sliced(TextureSlicer {
                border: BorderRect::square(extent.clamp(1.0, 15.0)),
                center_scale_mode: SliceScaleMode::Stretch,
                sides_scale_mode: SliceScaleMode::Stretch,
                max_corner_scale: 1.0,
            }),
            NativeUiVisualLayer {
                kind: "shadow".to_owned(),
                owner: node.id.clone(),
            },
            Name::new(format!("{}.shadow", node.id)),
        ))
        .id()
}

fn spawn_native_ui_gradient_layer(world: &mut World, node: &UiNodeIr, gradient: &NativeUiRenderedGradient) -> Entity {
    let texture = native_ui_gradient_texture(world, gradient);
    world
        .spawn((
            ImageBundle {
                style: Style {
                    position_type: PositionType::Absolute,
                    left: Val::ZERO,
                    right: Val::ZERO,
                    top: Val::ZERO,
                    bottom: Val::ZERO,
                    ..Default::default()
                },
                image: UiImage::new(texture),
                focus_policy: FocusPolicy::Pass,
                ..Default::default()
            },
            NativeUiVisualLayer {
                kind: "gradient".to_owned(),
                owner: node.id.clone(),
            },
            Name::new(format!("{}.gradient", node.id)),
        ))
        .id()
}

fn native_ui_shadow_texture(world: &mut World) -> Handle<Image> {
    if let Some(handle) = world.resource::<NativeUiVisualAssetCache>().shadow.clone() {
        return handle;
    }
    const SIZE: u32 = 32;
    let pixels = native_ui_shadow_pixels();
    let handle = add_native_ui_image(world, SIZE, SIZE, pixels);
    world.resource_mut::<NativeUiVisualAssetCache>().shadow = Some(handle.clone());
    handle
}

fn native_ui_shadow_pixels() -> Vec<u8> {
    const SIZE: u32 = 32;
    const INSET: f32 = 8.0;
    let mut pixels = Vec::with_capacity((SIZE * SIZE * 4) as usize);
    for y in 0..SIZE {
        for x in 0..SIZE {
            let edge = (x as f32 + 0.5)
                .min(y as f32 + 0.5)
                .min(SIZE as f32 - x as f32 - 0.5)
                .min(SIZE as f32 - y as f32 - 0.5);
            let alpha = if edge < INSET { edge / INSET } else { 0.0 };
            pixels.extend_from_slice(&[255, 255, 255, (alpha * 255.0).round() as u8]);
        }
    }
    pixels
}

fn native_ui_gradient_texture(world: &mut World, gradient: &NativeUiRenderedGradient) -> Handle<Image> {
    let angle = gradient.angle.unwrap_or(180.0);
    let key = format!("{}|{}|{}", gradient.from, gradient.to, angle.to_bits());
    if let Some(handle) = world.resource::<NativeUiVisualAssetCache>().gradients.get(&key).cloned() {
        return handle;
    }
    const SIZE: u32 = 64;
    let from = color_rgba8(&gradient.from);
    let to = color_rgba8(&gradient.to);
    let radians = angle.to_radians();
    let direction = Vec2::new(radians.sin(), -radians.cos());
    let normalization = direction.x.abs() + direction.y.abs();
    let mut pixels = Vec::with_capacity((SIZE * SIZE * 4) as usize);
    for y in 0..SIZE {
        for x in 0..SIZE {
            let position = Vec2::new(
                x as f32 / (SIZE - 1) as f32 - 0.5,
                y as f32 / (SIZE - 1) as f32 - 0.5,
            );
            let t = if normalization <= f32::EPSILON {
                0.5
            } else {
                (0.5 + position.dot(direction) / normalization).clamp(0.0, 1.0)
            };
            for channel in 0..4 {
                pixels.push((from[channel] as f32 + (to[channel] as f32 - from[channel] as f32) * t).round() as u8);
            }
        }
    }
    let handle = add_native_ui_image(world, SIZE, SIZE, pixels);
    world
        .resource_mut::<NativeUiVisualAssetCache>()
        .gradients
        .insert(key, handle.clone());
    handle
}

fn add_native_ui_image(world: &mut World, width: u32, height: u32, pixels: Vec<u8>) -> Handle<Image> {
    let image = Image::new(
        Extent3d { width, height, depth_or_array_layers: 1 },
        TextureDimension::D2,
        pixels,
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::RENDER_WORLD | RenderAssetUsages::MAIN_WORLD,
    );
    world.resource_mut::<Assets<Image>>().add(image)
}

fn color_rgba8(value: &str) -> [u8; 4] {
    let value = value.strip_prefix('#').unwrap_or(value);
    match value.len() {
        6 | 8 => {
            let channel = |offset| u8::from_str_radix(&value[offset..offset + 2], 16).unwrap_or(255);
            [channel(0), channel(2), channel(4), if value.len() == 8 { channel(6) } else { 255 }]
        }
        _ => [255, 255, 255, 255],
    }
}
