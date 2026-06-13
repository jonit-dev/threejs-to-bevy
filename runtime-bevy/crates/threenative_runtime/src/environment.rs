use std::collections::HashMap;

use bevy::{gltf::GltfAssetLabel, math::primitives::Cuboid, prelude::*};
use threenative_components::ThreeNativeId;
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
            *scatter_counts_by_tag
                .entry("untagged".to_owned())
                .or_insert(0) += 1;
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

pub fn map_environment_into_world(world: &mut World, bundle: &LoadedBundle) {
    let Some(scene) = bundle.environment_scene.as_ref() else {
        return;
    };
    ensure_asset_resources(world);
    let source_assets = scene
        .source_assets
        .iter()
        .map(|asset| {
            (
                asset.id.as_str(),
                (asset.asset.as_str(), asset.category.as_str()),
            )
        })
        .collect::<HashMap<_, _>>();
    let assets = bundle
        .assets
        .assets
        .iter()
        .map(|asset| (asset.id.as_str(), asset))
        .collect::<HashMap<_, _>>();
    let asset_server = world.get_resource::<AssetServer>().cloned();

    if let Some(terrain) = scene.terrain.as_ref() {
        let min = terrain.bounds.min;
        let max = terrain.bounds.max;
        let width = max[0] - min[0];
        let depth = max[2] - min[2];
        let material = material(world, Color::srgb(0.31, 0.39, 0.25));
        spawn_pbr(
            world,
            &format!("terrain:{}", terrain.id),
            Mesh::from(Cuboid::new(width, 0.08, depth)),
            material,
            Transform::from_xyz(
                (min[0] + max[0]) / 2.0,
                min[1] - 0.04,
                (min[2] + max[2]) / 2.0,
            ),
        );
    }

    for (index, segment) in scene.path.points.windows(2).enumerate() {
        let start = segment[0];
        let end = segment[1];
        let dx = end[0] - start[0];
        let dz = end[2] - start[2];
        let length = dx.hypot(dz);
        let mid_x = (start[0] + end[0]) / 2.0;
        let mid_z = (start[2] + end[2]) / 2.0;
        let y = terrain_height_at(bundle, mid_x, mid_z) + 0.03;
        let mut transform = Transform::from_xyz(mid_x, y, mid_z);
        transform.rotation = Quat::from_rotation_y(dx.atan2(dz));
        let material = material(world, Color::srgb(0.72, 0.49, 0.23));
        spawn_pbr(
            world,
            &format!("path:{}:{index}", scene.path.id),
            Mesh::from(Cuboid::new(
                scene.path.width,
                0.04,
                length + scene.path.width * 0.25,
            )),
            material,
            transform,
        );
    }

    for instance in &scene.instances {
        let source_asset = source_assets.get(instance.source_asset.as_str()).copied();
        let category = source_asset
            .map(|(_asset_id, category)| category)
            .unwrap_or("vegetation");
        let position = instance.position;
        let scale = instance.scale.unwrap_or([1.0, 1.0, 1.0]);
        let y = terrain_height_at(bundle, position[0], position[2]);
        let mut transform = Transform::from_xyz(position[0], y, position[2]);
        transform.scale = Vec3::new(scale[0], scale[1], scale[2]);

        if let (Some(asset_server), Some((asset_id, _category))) =
            (asset_server.as_ref(), source_asset)
        {
            if let Some(model_path) = assets.get(asset_id).and_then(|asset| {
                if asset.kind == "model" && matches!(asset.format.as_str(), "gltf" | "glb") {
                    asset.path.as_ref()
                } else {
                    None
                }
            }) {
                spawn_gltf_scene(
                    world,
                    asset_server,
                    &format!("environment:{}", instance.id),
                    model_path,
                    transform,
                );
                continue;
            }
        }

        let base_size = size_for_category(category);
        transform.translation.y = y + base_size[1] * scale[1] / 2.0;
        let material = material(world, color_for_category(category));
        spawn_pbr(
            world,
            &format!("environment:{}", instance.id),
            Mesh::from(Cuboid::new(base_size[0], base_size[1], base_size[2])),
            material,
            transform,
        );
    }
}

pub fn apply_environment_bookmark(
    world: &mut World,
    bundle: &LoadedBundle,
    bookmark_id: &str,
) -> bool {
    let Some(scene) = bundle.environment_scene.as_ref() else {
        return false;
    };
    let Some(bookmark) = scene
        .bookmarks
        .iter()
        .find(|bookmark| bookmark.id == bookmark_id)
    else {
        return false;
    };
    let camera_id = scene
        .controller
        .as_ref()
        .map(|controller| controller.camera.as_str());

    let mut cameras = world.query::<(&mut Transform, Option<&ThreeNativeId>, &Camera)>();
    for (mut transform, stable_id, _camera) in cameras.iter_mut(world) {
        if camera_id.is_none()
            || stable_id
                .map(|id| Some(id.0.as_str()) == camera_id)
                .unwrap_or(false)
        {
            transform.translation = Vec3::new(
                bookmark.position[0],
                bookmark.position[1],
                bookmark.position[2],
            );
            let yaw = bookmark.yaw.to_radians();
            let pitch = bookmark.pitch.to_radians();
            let forward = Vec3::new(
                yaw.sin() * pitch.cos(),
                pitch.sin(),
                yaw.cos() * pitch.cos(),
            );
            transform.look_to(forward, Vec3::Y);
            return true;
        }
    }
    false
}

fn ensure_asset_resources(world: &mut World) {
    if !world.contains_resource::<Assets<Mesh>>() {
        world.init_resource::<Assets<Mesh>>();
    }
    if !world.contains_resource::<Assets<StandardMaterial>>() {
        world.init_resource::<Assets<StandardMaterial>>();
    }
}

fn spawn_gltf_scene(
    world: &mut World,
    asset_server: &AssetServer,
    id: &str,
    model_path: &str,
    transform: Transform,
) {
    let scene = asset_server.load(GltfAssetLabel::Scene(0).from_asset(model_path.to_owned()));
    world
        .spawn(SceneBundle {
            scene,
            transform,
            ..Default::default()
        })
        .insert((ThreeNativeId(id.to_owned()), Name::new(id.to_owned())));
}

fn spawn_pbr(
    world: &mut World,
    id: &str,
    mesh: Mesh,
    material: Handle<StandardMaterial>,
    transform: Transform,
) {
    let mesh = world.resource_mut::<Assets<Mesh>>().add(mesh);
    world
        .spawn(PbrBundle {
            mesh,
            material,
            transform,
            ..Default::default()
        })
        .insert((ThreeNativeId(id.to_owned()), Name::new(id.to_owned())));
}

fn material(world: &mut World, color: Color) -> Handle<StandardMaterial> {
    world
        .resource_mut::<Assets<StandardMaterial>>()
        .add(StandardMaterial {
            base_color: color,
            perceptual_roughness: 0.95,
            ..Default::default()
        })
}

fn terrain_height_at(bundle: &LoadedBundle, x: f32, z: f32) -> f32 {
    let Some(terrain) = bundle
        .environment_scene
        .as_ref()
        .and_then(|scene| scene.terrain.as_ref())
    else {
        return 0.0;
    };
    if terrain.height_mode != "controlPoints" {
        return terrain.bounds.min[1];
    }
    let mut weighted_height = 0.0;
    let mut total_weight = 0.0;
    for point in &terrain.control_points {
        let distance = (x - point[0]).hypot(z - point[2]);
        let weight = (-(distance * distance) / 18.0).exp();
        weighted_height += point[1] * weight;
        total_weight += weight;
    }
    if total_weight > 0.0 {
        weighted_height / total_weight
    } else {
        terrain.bounds.min[1]
    }
}

fn size_for_category(category: &str) -> [f32; 3] {
    match category {
        "tree" => [0.65, 4.2, 0.65],
        "rock" => [1.15, 0.75, 1.0],
        "pebble" => [0.32, 0.18, 0.28],
        "grass" => [0.18, 0.75, 0.18],
        "flower" => [0.25, 0.45, 0.25],
        "mushroom" => [0.28, 0.35, 0.28],
        _ => [0.75, 0.9, 0.75],
    }
}

fn color_for_category(category: &str) -> Color {
    match category {
        "tree" => Color::srgb(0.25, 0.45, 0.16),
        "rock" => Color::srgb(0.42, 0.45, 0.34),
        "pebble" => Color::srgb(0.62, 0.58, 0.50),
        "grass" => Color::srgb(0.54, 0.72, 0.18),
        "flower" => Color::srgb(0.83, 0.10, 0.18),
        "mushroom" => Color::srgb(0.86, 0.75, 0.58),
        _ => Color::srgb(0.28, 0.55, 0.25),
    }
}
