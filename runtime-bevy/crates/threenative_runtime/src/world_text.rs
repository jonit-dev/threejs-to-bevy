use bevy::prelude::*;

use threenative_components::ThreeNativeId;
use threenative_loader::LoadedBundle;

#[derive(Component, Debug, Default)]
pub struct NativeWorldText;

pub fn sync_native_world_text(
    bundle: &LoadedBundle,
    nodes: &mut Query<(&ThreeNativeId, &mut Text, Option<&NativeWorldText>)>,
) {
    for (id, mut text, marker) in nodes.iter_mut() {
        if marker.is_none() {
            continue;
        }
        let Some(entity) = bundle.world.entities.iter().find(|entity| entity.id == id.0) else {
            continue;
        };
        let Some(component) = entity.components.world_text.as_ref() else {
            continue;
        };
        if let Some(section) = text.sections.first_mut() {
            if section.value != component.text {
                section.value = component.text.clone();
            }
            if component.fade == Some(true) {
                let opacity = component.lifetime.map_or(1.0, |lifetime| 1.0 - (component.elapsed.unwrap_or(0.0) / lifetime.max(0.0001)).clamp(0.0, 1.0));
                section.style.color = section.style.color.with_alpha(opacity);
            }
        }
    }
}
