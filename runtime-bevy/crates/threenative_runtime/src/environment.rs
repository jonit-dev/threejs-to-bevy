use std::collections::HashMap;

use bevy::{
    gltf::GltfAssetLabel,
    math::primitives::Cuboid,
    prelude::*,
    render::{
        mesh::{Indices, PrimitiveTopology},
        render_asset::RenderAssetUsages,
    },
};
use serde::Serialize;
use threenative_components::ThreeNativeId;
use threenative_loader::{AssetIr, LoadedBundle};

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentObservation {
    #[serde(rename = "bookmarks")]
    pub bookmark_ids: Vec<String>,
    pub hero_placement_ids: Vec<String>,
    #[serde(rename = "instancingGroups")]
    pub repeated_asset_groups: Vec<EnvironmentRepeatedAssetGroup>,
    pub lod_selections: HashMap<String, String>,
    pub lod_source_asset_count: usize,
    pub path_point_count: usize,
    pub scatter_counts_by_tag: HashMap<String, usize>,
    pub scatter_instance_count: usize,
    pub source_asset_count: usize,
    pub terrain: Option<EnvironmentTerrainObservation>,
    pub total_instance_count: usize,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentTerrainObservation {
    pub id: String,
    pub max: [f32; 3],
    pub min: [f32; 3],
}

#[derive(Debug, PartialEq)]
struct NativeEnvironmentObservation {
    pub terrain_id: Option<String>,
    pub path_point_count: usize,
    pub hero_placement_ids: Vec<String>,
    pub scatter_counts_by_tag: HashMap<String, usize>,
    pub scatter_instance_count: usize,
    pub bookmark_ids: Vec<String>,
    pub source_asset_count: usize,
    pub total_instance_count: usize,
    pub lod_source_asset_count: usize,
    pub lod_selections: HashMap<String, String>,
    pub repeated_asset_groups: Vec<EnvironmentRepeatedAssetGroup>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentRepeatedAssetGroup {
    pub source_asset: String,
    pub count: usize,
    pub evidence: String,
}

pub fn observe_environment(bundle: &LoadedBundle) -> Option<EnvironmentObservation> {
    let scene = bundle.environment_scene.as_ref()?;
    let native = observe_native_environment(bundle)?;
    Some(EnvironmentObservation {
        bookmark_ids: native.bookmark_ids,
        hero_placement_ids: native.hero_placement_ids,
        repeated_asset_groups: native.repeated_asset_groups,
        lod_selections: native.lod_selections,
        lod_source_asset_count: native.lod_source_asset_count,
        path_point_count: native.path_point_count,
        scatter_counts_by_tag: native.scatter_counts_by_tag,
        scatter_instance_count: native.scatter_instance_count,
        source_asset_count: native.source_asset_count,
        terrain: scene
            .terrain
            .as_ref()
            .map(|terrain| EnvironmentTerrainObservation {
                id: terrain.id.clone(),
                max: terrain.bounds.max,
                min: terrain.bounds.min,
            }),
        total_instance_count: native.total_instance_count,
    })
}

fn observe_native_environment(bundle: &LoadedBundle) -> Option<NativeEnvironmentObservation> {
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

    Some(NativeEnvironmentObservation {
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
        source_asset_count: scene.source_assets.len(),
        total_instance_count: scene.instances.len(),
        lod_source_asset_count: scene
            .source_assets
            .iter()
            .filter(|asset| !asset.lod.is_empty())
            .count(),
        lod_selections: lod_selections(scene, 32.0),
        repeated_asset_groups: repeated_asset_groups(scene, bundle),
    })
}

fn lod_selections(
    scene: &threenative_loader::EnvironmentSceneIr,
    distance: f32,
) -> HashMap<String, String> {
    let mut selections = HashMap::new();
    for source_asset in &scene.source_assets {
        let selected = source_asset
            .lod
            .iter()
            .find(|level| distance >= level.min_distance && distance < level.max_distance)
            .map(|level| level.asset.clone())
            .unwrap_or_else(|| source_asset.asset.clone());
        selections.insert(source_asset.id.clone(), selected);
    }
    selections
}

fn repeated_asset_groups(
    scene: &threenative_loader::EnvironmentSceneIr,
    bundle: &LoadedBundle,
) -> Vec<EnvironmentRepeatedAssetGroup> {
    let mut counts = HashMap::<String, usize>::new();
    for instance in &scene.instances {
        if instance.kind.as_deref() != Some("scatter") {
            continue;
        }
        if instance
            .tags
            .iter()
            .any(|tag| matches!(tag.as_str(), "hero" | "unique" | "foreground"))
        {
            continue;
        }
        *counts.entry(instance.source_asset.clone()).or_insert(0) += 1;
    }
    let source_assets = scene
        .source_assets
        .iter()
        .map(|asset| (asset.id.as_str(), asset.asset.as_str()))
        .collect::<HashMap<_, _>>();
    let assets = bundle
        .assets
        .assets
        .iter()
        .map(|asset| (asset.id.as_str(), asset))
        .collect::<HashMap<_, _>>();
    let mut groups = counts
        .into_iter()
        .filter(|(_source_asset, count)| *count >= 2)
        .map(|(source_asset, count)| {
            let evidence = source_assets
                .get(source_asset.as_str())
                .and_then(|asset_id| assets.get(asset_id))
                .filter(|asset| {
                    asset.kind == "model"
                        && matches!(asset.format.as_str(), "gltf" | "glb")
                        && asset.path.is_some()
                })
                .map(|_| "model-asset-backed")
                .unwrap_or("placeholder");
            EnvironmentRepeatedAssetGroup {
                source_asset,
                count,
                evidence: evidence.to_owned(),
            }
        })
        .collect::<Vec<_>>();
    groups.sort_by(|left, right| left.source_asset.cmp(&right.source_asset));
    groups
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
        let material = material(world, Color::WHITE);
        spawn_pbr(
            world,
            &format!("terrain:{}", terrain.id),
            terrain_mesh(bundle),
            material,
            Transform::default(),
        );
    }

    if scene.path.points.len() >= 2 {
        let material = material(world, Color::srgb(0.96, 0.73, 0.40));
        spawn_pbr(
            world,
            &format!("path:{}:0", scene.path.id),
            path_surface_mesh(bundle, &scene.path.points, scene.path.width),
            material,
            Transform::default(),
        );
    }

    for instance in &scene.instances {
        let source_asset = source_assets.get(instance.source_asset.as_str()).copied();
        let category = source_asset
            .map(|(_asset_id, category)| category)
            .unwrap_or("vegetation");
        let position = instance.position;
        let scale = instance.scale.unwrap_or([1.0, 1.0, 1.0]);
        let y = position[1] + terrain_height_at(bundle, position[0], position[2]);
        let mut transform = Transform::from_xyz(position[0], y, position[2]);
        if let Some(rotation) = instance.rotation {
            transform.rotation =
                Quat::from_xyzw(rotation[0], rotation[1], rotation[2], rotation[3]);
        }
        transform.scale = Vec3::new(scale[0], scale[1], scale[2]);

        if let (Some(asset_server), Some((asset_id, category))) =
            (asset_server.as_ref(), source_asset)
        {
            if let Some(asset) = assets.get(asset_id).filter(|asset| {
                if asset.kind == "model" && matches!(asset.format.as_str(), "gltf" | "glb") {
                    asset.path.is_some()
                } else {
                    false
                }
            }) {
                apply_gltf_normalization(&mut transform, category, asset);
                spawn_gltf_scene(
                    world,
                    asset_server,
                    &format!("environment:{}", instance.id),
                    asset.path.as_deref().unwrap_or_default(),
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
            unlit: false,
            ..Default::default()
        })
}

fn terrain_mesh(bundle: &LoadedBundle) -> Mesh {
    let terrain = bundle
        .environment_scene
        .as_ref()
        .and_then(|scene| scene.terrain.as_ref())
        .expect("terrain mesh requires environment terrain");
    let min = terrain.bounds.min;
    let max = terrain.bounds.max;
    let subdivisions = if terrain.height_mode == "controlPoints" {
        48
    } else {
        1
    };
    let vertex_count = subdivisions + 1;
    let mut positions = Vec::with_capacity(vertex_count * vertex_count);
    let mut normals = Vec::with_capacity(vertex_count * vertex_count);
    let mut uvs = Vec::with_capacity(vertex_count * vertex_count);
    let mut colors = Vec::with_capacity(vertex_count * vertex_count);

    for z_index in 0..=subdivisions {
        let z_t = z_index as f32 / subdivisions as f32;
        let z = min[2] + (max[2] - min[2]) * z_t;
        for x_index in 0..=subdivisions {
            let x_t = x_index as f32 / subdivisions as f32;
            let x = min[0] + (max[0] - min[0]) * x_t;
            let y = if terrain.height_mode == "controlPoints" {
                terrain_height_at(bundle, x, z)
            } else {
                min[1]
            };
            positions.push([x, y, z]);
            normals.push([0.0, 1.0, 0.0]);
            uvs.push([x_t, z_t]);
            colors.push(terrain_vertex_color(
                x,
                y,
                z,
                min[1],
                max_terrain_height(bundle),
            ));
        }
    }

    let mut indices = Vec::with_capacity(subdivisions * subdivisions * 6);
    for z_index in 0..subdivisions {
        for x_index in 0..subdivisions {
            let top_left = (z_index * vertex_count + x_index) as u32;
            let top_right = top_left + 1;
            let bottom_left = top_left + vertex_count as u32;
            let bottom_right = bottom_left + 1;
            indices.extend_from_slice(&[
                top_left,
                bottom_left,
                top_right,
                top_right,
                bottom_left,
                bottom_right,
            ]);
        }
    }

    let mut mesh = Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::RENDER_WORLD | RenderAssetUsages::MAIN_WORLD,
    );
    mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, positions);
    mesh.insert_attribute(Mesh::ATTRIBUTE_NORMAL, normals);
    mesh.insert_attribute(Mesh::ATTRIBUTE_UV_0, uvs);
    mesh.insert_attribute(Mesh::ATTRIBUTE_COLOR, colors);
    mesh.insert_indices(Indices::U32(indices));
    mesh
}

fn path_surface_mesh(bundle: &LoadedBundle, points: &[[f32; 3]], width: f32) -> Mesh {
    let half_width = width / 2.0;
    let mut positions = Vec::with_capacity(points.len() * 2);
    let mut normals = Vec::with_capacity(points.len() * 2);
    let mut uvs = Vec::with_capacity(points.len() * 2);
    let mut indices = Vec::with_capacity((points.len() - 1) * 6);
    let mut distance = 0.0;

    for (index, point) in points.iter().enumerate() {
        if index > 0 {
            let previous = points[index - 1];
            distance += (point[0] - previous[0]).hypot(point[2] - previous[2]);
        }
        let normal = path_point_normal(points, index);
        let y = terrain_height_at(bundle, point[0], point[2]) + 0.08;
        positions.push([
            point[0] + normal.x * half_width,
            y,
            point[2] + normal.z * half_width,
        ]);
        positions.push([
            point[0] - normal.x * half_width,
            y,
            point[2] - normal.z * half_width,
        ]);
        normals.push([0.0, 1.0, 0.0]);
        normals.push([0.0, 1.0, 0.0]);
        uvs.push([0.0, distance]);
        uvs.push([1.0, distance]);
        if index < points.len() - 1 {
            let left = (index * 2) as u32;
            indices.extend_from_slice(&[left, left + 1, left + 2, left + 1, left + 3, left + 2]);
        }
    }

    let mut mesh = Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::RENDER_WORLD | RenderAssetUsages::MAIN_WORLD,
    );
    mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, positions);
    mesh.insert_attribute(Mesh::ATTRIBUTE_NORMAL, normals);
    mesh.insert_attribute(Mesh::ATTRIBUTE_UV_0, uvs);
    mesh.insert_indices(Indices::U32(indices));
    mesh
}

fn path_point_normal(points: &[[f32; 3]], index: usize) -> Vec3 {
    let previous = points[index.saturating_sub(1)];
    let next = points[(index + 1).min(points.len() - 1)];
    let dx = next[0] - previous[0];
    let dz = next[2] - previous[2];
    let length = dx.hypot(dz).max(0.001);
    Vec3::new(dz / length, 0.0, -dx / length)
}

fn max_terrain_height(bundle: &LoadedBundle) -> f32 {
    let Some(terrain) = bundle
        .environment_scene
        .as_ref()
        .and_then(|scene| scene.terrain.as_ref())
    else {
        return 0.0;
    };
    terrain
        .control_points
        .iter()
        .map(|point| point[1])
        .fold(terrain.bounds.min[1], f32::max)
}

fn terrain_vertex_color(x: f32, y: f32, z: f32, min_y: f32, max_y: f32) -> [f32; 4] {
    let range = (max_y - min_y).max(0.001);
    let height = (y - min_y) / range;
    let noise = (x.mul_add(1.7, z * 0.9).sin() + 1.0) * 0.04;
    let t = height + noise;
    if t < 0.5 {
        lerp_color([0.20, 0.34, 0.17], [0.34, 0.48, 0.20], t * 2.0)
    } else {
        lerp_color([0.34, 0.48, 0.20], [0.42, 0.55, 0.26], (t - 0.5) * 2.0)
    }
}

fn lerp_color(left: [f32; 3], right: [f32; 3], t: f32) -> [f32; 4] {
    let t = t.clamp(0.0, 1.0);
    [
        left[0] + (right[0] - left[0]) * t,
        left[1] + (right[1] - left[1]) * t,
        left[2] + (right[2] - left[2]) * t,
        1.0,
    ]
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
        weighted_height / total_weight + terrain_detail_height(terrain, x, z)
    } else {
        terrain.bounds.min[1] + terrain_detail_height(terrain, x, z)
    }
}

fn terrain_detail_height(
    terrain: &threenative_loader::EnvironmentTerrainIr,
    x: f32,
    z: f32,
) -> f32 {
    let width = (terrain.bounds.max[0] - terrain.bounds.min[0]).max(0.001);
    let depth = (terrain.bounds.max[2] - terrain.bounds.min[2]).max(0.001);
    let scale = width.min(depth);
    let amplitude = 0.24_f32.min(scale * 0.012);
    let broad = (x.mul_add(0.72, z * 0.38)).sin() * 0.55;
    let cross = (x.mul_add(0.31, -z * 0.86)).cos() * 0.32;
    let detail = ((x + z) * 1.18).sin() * 0.13;
    (broad + cross + detail) * amplitude
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

fn apply_gltf_normalization(transform: &mut Transform, category: &str, asset: &AssetIr) {
    let Some(bounds) = asset.bounds.as_ref() else {
        return;
    };
    let size = Vec3::new(
        bounds.max[0] - bounds.min[0],
        bounds.max[1] - bounds.min[1],
        bounds.max[2] - bounds.min[2],
    );
    let raw_max_axis = size.x.max(size.y).max(size.z);
    if raw_max_axis <= f32::EPSILON {
        return;
    }
    let normalization = gltf_target_size_for_category(category) / raw_max_axis;
    let offset = Vec3::new(
        -((bounds.min[0] + bounds.max[0]) * normalization) / 2.0,
        -(bounds.min[1] * normalization),
        -((bounds.min[2] + bounds.max[2]) * normalization) / 2.0,
    );
    let instance_scale = transform.scale;
    transform.translation += transform.rotation * (offset * instance_scale);
    transform.scale = instance_scale * normalization;
}

fn gltf_target_size_for_category(category: &str) -> f32 {
    match category {
        "tree" => 4.2,
        "terrain" => 1.0,
        "rock" => 0.9,
        "vegetation" => 1.2,
        "grass" => 1.0,
        "flower" => 0.3,
        "mushroom" => 0.36,
        "pebble" => 0.35,
        _ => 1.0,
    }
}

fn color_for_category(category: &str) -> Color {
    match category {
        "tree" => Color::srgb(0.22, 0.43, 0.14),
        "rock" => Color::srgb(0.42, 0.45, 0.34),
        "pebble" => Color::srgb(0.62, 0.58, 0.50),
        "grass" => Color::srgb(0.24, 0.58, 0.14),
        "flower" => Color::srgb(0.83, 0.10, 0.18),
        "mushroom" => Color::srgb(0.86, 0.75, 0.58),
        _ => Color::srgb(0.28, 0.55, 0.25),
    }
}
