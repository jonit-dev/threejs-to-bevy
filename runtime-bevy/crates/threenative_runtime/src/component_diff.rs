use std::collections::{BTreeMap, BTreeSet};

use serde_json::Value;
use threenative_loader::{EntityComponents, LoadedBundle};

use crate::systems_context::{canonical_component_value, component_value};

#[derive(Debug, Default)]
pub struct ComponentDiffCache {
    baseline: BTreeMap<String, BTreeMap<String, String>>,
    tracked_components: BTreeSet<String>,
}

impl ComponentDiffCache {
    pub fn begin_schedule_stage(&mut self, bundle: &LoadedBundle, components: &[String]) {
        self.tracked_components = components.iter().cloned().collect();
        self.baseline.clear();
        for entity in &bundle.world.entities {
            let mut row = BTreeMap::new();
            for component in &self.tracked_components {
                if let Some(value) = component_value(&entity.components, component) {
                    row.insert(component.clone(), canonical_component_value(&value));
                }
            }
            if !row.is_empty() {
                self.baseline.insert(entity.id.clone(), row);
            }
        }
    }

    pub fn runtime_changed_components(
        &self,
        entity_id: &str,
        components: &EntityComponents,
    ) -> Vec<String> {
        self.tracked_components
            .iter()
            .filter_map(|component| {
                let current = component_value(components, component)
                    .map(|value| canonical_component_value(&value));
                let previous = self
                    .baseline
                    .get(entity_id)
                    .and_then(|row| row.get(component));
                (current.as_deref() != previous.map(String::as_str)).then(|| component.clone())
            })
            .collect()
    }

    pub fn runtime_changed_map(&self, bundle: &LoadedBundle) -> BTreeMap<String, Vec<String>> {
        bundle
            .world
            .entities
            .iter()
            .filter_map(|entity| {
                let changed = self.runtime_changed_components(&entity.id, &entity.components);
                (!changed.is_empty()).then_some((entity.id.clone(), changed))
            })
            .collect()
    }
}

pub fn changed_components(
    bundle: &LoadedBundle,
    entity_id: &str,
    components: &EntityComponents,
    diff_cache: Option<&ComponentDiffCache>,
) -> Vec<String> {
    let explicit = read_changed(components.extra.get("__changed"), entity_id)
        .into_iter()
        .chain(read_changed(
            bundle.world.resources.get("__changed"),
            entity_id,
        ))
        .chain(read_changed(
            bundle.world.resources.get("Changed"),
            entity_id,
        ))
        .collect::<Vec<_>>();
    if !explicit.is_empty() {
        return explicit;
    }
    diff_cache
        .map(|cache| cache.runtime_changed_components(entity_id, components))
        .unwrap_or_default()
}

fn read_changed(value: Option<&Value>, entity_id: &str) -> Vec<String> {
    let Some(value) = value else {
        return Vec::new();
    };
    if let Some(items) = value.as_array() {
        return items
            .iter()
            .filter_map(|item| item.as_str().map(str::to_owned))
            .collect();
    }
    if let Some(items) = value.get(entity_id).and_then(Value::as_array) {
        return items
            .iter()
            .filter_map(|item| item.as_str().map(str::to_owned))
            .collect();
    }
    value
        .get("entities")
        .and_then(|entities| entities.get(entity_id))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}
