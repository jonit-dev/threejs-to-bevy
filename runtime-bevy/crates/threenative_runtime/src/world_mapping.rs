use std::collections::HashMap;

use bevy::prelude::*;
use threenative_loader::LoadedBundle;

pub fn attach_entity_hierarchy(
    world: &mut World,
    bundle: &LoadedBundle,
    entities_by_id: &HashMap<&str, Entity>,
) {
    for entity in &bundle.world.entities {
        let Some(parent_id) = entity
            .components
            .hierarchy
            .as_ref()
            .and_then(|hierarchy| hierarchy.parent.as_deref())
        else {
            continue;
        };
        if let (Some(child), Some(parent)) = (
            entities_by_id.get(entity.id.as_str()),
            entities_by_id.get(parent_id),
        ) {
            world.entity_mut(*parent).push_children(&[*child]);
        }
    }
}
