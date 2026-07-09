pub fn trace_ui_navigation(ui: &UiIr, inputs: &[&str]) -> UiNavigationTrace {
    let mut nodes = Vec::new();
    collect_nodes(&ui.root, &mut nodes);
    let focus_order = ui.focus_order.clone().unwrap_or_else(|| {
        nodes
            .iter()
            .filter(|node| is_focusable(node))
            .map(|node| node.id.clone())
            .collect()
    }).into_iter()
    .filter(|id| find_node(&nodes, id).is_some_and(is_focusable))
    .collect::<Vec<_>>();
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
        let explicit_target = find_node(&nodes, &current).and_then(|node| navigation_target(node, input));
        let next = explicit_target
            .filter(|target| find_node(&nodes, target).is_some_and(is_focusable))
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

pub fn trace_native_ui_screen_dispatch(
    ui: &UiIr,
    inputs: &[(&str, &str)],
) -> NativeUiScreenDispatchTrace {
    let mut nodes = Vec::new();
    collect_nodes(&ui.root, &mut nodes);
    let active_screens = active_ui_screens(ui);
    let events = inputs
        .iter()
        .map(|(node_id, input)| {
            let node = find_node(&nodes, node_id);
            let screen = active_screens
                .iter()
                .find(|screen| node_is_within_root(&ui.root, &screen.root, node_id))
                .map(|screen| screen.id.clone());
            let blocked_by = screen.as_ref().and_then(|screen_id| {
                let screen_index = active_screens
                    .iter()
                    .position(|screen| screen.id == *screen_id)?;
                active_screens[screen_index + 1..]
                    .iter()
                    .rev()
                    .find(|screen| {
                        screen
                            .focus_scope
                            .as_ref()
                            .is_some_and(|scope| scope.input_capture != "none")
                    })
                    .map(|screen| screen.id.clone())
            });
            NativeUiScreenDispatchObservation {
                action: (*input == "activate")
                    .then(|| node.and_then(|node| node.action.clone()))
                    .flatten(),
                blocked_by: blocked_by.clone(),
                dispatched: blocked_by.is_none(),
                input: (*input).to_owned(),
                node: (*node_id).to_owned(),
                screen,
            }
        })
        .collect();
    NativeUiScreenDispatchTrace { events }
}

pub fn trace_native_ui_virtual_list_range(
    ui: &UiIr,
    node_id: &str,
    scroll_offset: f32,
) -> NativeUiVirtualListRangeTrace {
    let mut nodes = Vec::new();
    collect_nodes(&ui.root, &mut nodes);
    let Some(node) = find_node(&nodes, node_id) else {
        return NativeUiVirtualListRangeTrace {
            end_index: -1,
            end_item: None,
            node: node_id.to_owned(),
            start_index: -1,
            start_item: None,
        };
    };
    let Some(range) = node.virtual_range.as_ref() else {
        return NativeUiVirtualListRangeTrace {
            end_index: -1,
            end_item: None,
            node: node.id.clone(),
            start_index: -1,
            start_item: None,
        };
    };
    let buffer = range.buffer.unwrap_or(0);
    let start_index =
        ((scroll_offset / range.item_extent).floor() as isize - buffer as isize).max(0);
    let visible_count = (range.viewport_extent / range.item_extent).ceil() as usize + buffer * 2;
    let end_index = ((start_index as usize + visible_count).saturating_sub(1))
        .min(range.item_count.saturating_sub(1)) as isize;
    NativeUiVirtualListRangeTrace {
        end_index,
        end_item: node
            .children
            .get(end_index as usize)
            .map(|child| child.id.clone()),
        node: node.id.clone(),
        start_index,
        start_item: node
            .children
            .get(start_index as usize)
            .map(|child| child.id.clone()),
    }
}

pub fn trace_native_ui_affordances(ui: &UiIr) -> NativeUiAffordanceTrace {
    let mut nodes = Vec::new();
    collect_nodes(&ui.root, &mut nodes);
    NativeUiAffordanceTrace {
        glyphs: nodes
            .iter()
            .filter_map(|node| {
                node.glyph.as_ref().map(|glyph| NativeUiGlyphObservation {
                    action: glyph.action.clone(),
                    glyph_set: glyph.glyph_set.clone(),
                    label: glyph.label.clone(),
                    node: node.id.clone(),
                })
            })
            .collect(),
        tooltips: nodes
            .iter()
            .filter_map(|node| {
                node.tooltip
                    .as_ref()
                    .map(|tooltip| NativeUiTooltipObservation {
                        anchor: tooltip.anchor.clone(),
                        delay_ms: tooltip.delay_ms,
                        description: tooltip.description.clone(),
                        dismiss_action: tooltip.dismiss_action.clone(),
                        focus: tooltip.focus.clone(),
                        node: node.id.clone(),
                        open: tooltip.open.clone(),
                    })
            })
            .collect(),
    }
}

pub fn trace_native_ui_effect_presets(
    ui: &UiIr,
    active_states: &[&str],
) -> NativeUiEffectPresetTrace {
    let mut nodes = Vec::new();
    collect_nodes(&ui.root, &mut nodes);
    let mut effects = nodes
        .iter()
        .flat_map(|node| {
            node.effects.iter().filter_map(|effect| {
                if effect.trigger != "predicate"
                    && !active_states
                        .iter()
                        .any(|state| *state == effect.trigger.as_str())
                {
                    return None;
                }
                Some(NativeUiEffectPresetObservation {
                    effect: effect.id.clone(),
                    kind: effect.kind.clone(),
                    node: node.id.clone(),
                    state: effect.trigger.clone(),
                    strategy: native_ui_effect_strategy(effect),
                })
            })
        })
        .collect::<Vec<_>>();
    effects.sort_by(|left, right| {
        format!("{}:{}", left.node, left.effect).cmp(&format!("{}:{}", right.node, right.effect))
    });
    NativeUiEffectPresetTrace { effects }
}

fn native_ui_effect_strategy(effect: &threenative_loader::UiEffectPresetIr) -> String {
    match effect.kind.as_str() {
        "glow" | "pulse" => effect
            .fallback
            .as_ref()
            .filter(|fallback| fallback.as_str() != "none")
            .map(|fallback| format!("fallback:{fallback}"))
            .unwrap_or_else(|| "direct".to_owned()),
        _ => "direct".to_owned(),
    }
}

pub fn trace_native_ui_attachment_projection(
    ui: &UiIr,
    target_entity: &str,
    world_position: [f32; 3],
    camera_id: &str,
    viewport: [f32; 2],
) -> NativeUiAttachmentProjectionTrace {
    let mut nodes = Vec::new();
    collect_nodes(&ui.root, &mut nodes);
    let mut projections = nodes
        .iter()
        .filter_map(|node| {
            let attach = node.attach_to.as_ref()?;
            let target = attach.target.id.as_deref()?;
            if attach.target.kind != "entity" || target != target_entity {
                return None;
            }
            let offset = attach.local_offset.unwrap_or([0.0, 0.0, 0.0]);
            let projected = [
                viewport[0] / 2.0 + world_position[0] + offset[0],
                viewport[1] / 2.0 - (world_position[1] + offset[1]),
            ];
            let screen = if attach.clamp.as_deref() == Some("screenEdge") {
                [
                    projected[0].clamp(0.0, viewport[0]),
                    projected[1].clamp(0.0, viewport[1]),
                ]
            } else {
                projected
            };
            Some(NativeUiAttachmentProjectionObservation {
                camera: camera_id.to_owned(),
                clamped: screen != projected,
                depth: world_position[2] + offset[2],
                node: node.id.clone(),
                occluded: false,
                scale: native_attachment_scale(attach.distance_scale.as_ref(), world_position[2]),
                screen: NativeUiScreenPosition {
                    x: screen[0],
                    y: screen[1],
                },
                target: target.to_owned(),
                visible_nodes: std::iter::once(node.id.clone())
                    .chain(node.children.iter().map(|child| child.id.clone()))
                    .collect(),
            })
        })
        .collect::<Vec<_>>();
    projections.sort_by(|left, right| left.node.cmp(&right.node));
    NativeUiAttachmentProjectionTrace { projections }
}

fn native_attachment_scale(
    scale: Option<&threenative_loader::UiAttachmentDistanceScaleIr>,
    depth: f32,
) -> f32 {
    let Some(scale) = scale else {
        return 1.0;
    };
    let normalized = (depth.abs() / 100.0).clamp(0.0, 1.0);
    scale.max - (scale.max - scale.min) * normalized
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
