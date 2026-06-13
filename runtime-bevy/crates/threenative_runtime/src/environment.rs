use std::collections::HashMap;

use threenative_loader::LoadedBundle;

#[derive(Debug, PartialEq)]
pub struct EnvironmentObservation {
    pub terrain_id: Option<String>,
    pub path_point_count: usize,
    pub hero_placement_ids: Vec<String>,
    pub scatter_counts_by_tag: HashMap<String, usize>,
    pub scatter_instance_count: usize,
    pub bookmark_ids: Vec<String>,
}

pub fn observe_environment(bundle: &LoadedBundle) -> Option<EnvironmentObservation> {
    let scene = bundle.environment_scene.as_ref()?;
    let mut scatter_counts_by_tag = HashMap::new();
    for instance in scene
        .instances
        .iter()
        .filter(|instance| instance.kind.as_deref() == Some("scatter"))
    {
        if instance.tags.is_empty() {
            *scatter_counts_by_tag.entry("untagged".to_owned()).or_insert(0) += 1;
            continue;
        }
        for tag in &instance.tags {
            *scatter_counts_by_tag.entry(tag.clone()).or_insert(0) += 1;
        }
    }
    let mut hero_placement_ids = scene
        .instances
        .iter()
        .filter(|instance| instance.kind.as_deref() == Some("hero"))
        .map(|instance| instance.id.clone())
        .collect::<Vec<_>>();
    hero_placement_ids.sort();
    let mut bookmark_ids = scene
        .bookmarks
        .iter()
        .map(|bookmark| bookmark.id.clone())
        .collect::<Vec<_>>();
    bookmark_ids.sort();

    Some(EnvironmentObservation {
        terrain_id: scene.terrain.as_ref().map(|terrain| terrain.id.clone()),
        path_point_count: scene.path.points.len(),
        hero_placement_ids,
        scatter_counts_by_tag,
        scatter_instance_count: scene
            .instances
            .iter()
            .filter(|instance| instance.kind.as_deref() == Some("scatter"))
            .count(),
        bookmark_ids,
    })
}
