use std::collections::HashMap;

use bevy::prelude::*;
use threenative_loader::LoadedBundle;

pub fn attach_entity_hierarchy(
    world: &mut World,
    bundle: &LoadedBundle,
    entities_by_id: &HashMap<&str, Entity>,
) {
    let desired_parents = bundle
        .world
        .entities
        .iter()
        .filter_map(|entity| {
            let child = entities_by_id.get(entity.id.as_str()).copied()?;
            let parent_id = entity
                .components
                .hierarchy
                .as_ref()
                .and_then(|hierarchy| hierarchy.parent.as_deref())?;
            let parent = entities_by_id.get(parent_id).copied()?;
            Some((child, parent))
        })
        .collect::<HashMap<_, _>>();

    for entity in &bundle.world.entities {
        let Some(child) = entities_by_id.get(entity.id.as_str()).copied() else {
            continue;
        };
        let current_parent = world.get::<Parent>(child).map(Parent::get);
        match (current_parent, desired_parents.get(&child).copied()) {
            (Some(current_parent), Some(parent)) if current_parent == parent => {}
            (Some(current_parent), Some(parent)) => {
                world.entity_mut(current_parent).remove_children(&[child]);
                world.entity_mut(parent).push_children(&[child]);
            }
            (None, Some(parent)) => {
                world.entity_mut(parent).push_children(&[child]);
            }
            (Some(_), None) => {
                world.entity_mut(child).remove_parent();
            }
            (None, None) => {}
        }
    }
}
