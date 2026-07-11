use std::collections::HashMap;

use bevy::{
    prelude::*,
    render::mesh::{Indices, VertexAttributeValues},
};
use rapier3d::{
    glamx::Vec3 as RapierVec3,
    math::Pose,
    prelude::{Ray, RayCast, TriMesh},
};
use threenative_loader::{AssetIr, AssetsManifest, LoadedBundle, TransformComponent, WorldIr};

use crate::map_world::scene_mesh_for_asset;

#[derive(Clone, Debug, PartialEq)]
pub struct NativeSceneRayHit {
    pub distance: f32,
    pub entity_id: String,
    pub normal: [f32; 3],
    pub point: [f32; 3],
}

struct NativeSceneRayInstance {
    entity_id: String,
    mesh: TriMesh,
}

/// Adapter-private ray queries over rendered mesh geometry. This deliberately
/// does not use authored Collider components, so visibility proof and bake
/// semantics do not silently collapse back to the physics surface.
#[derive(Resource)]
pub struct NativeSceneRayQuery {
    instances: Vec<NativeSceneRayInstance>,
}

impl NativeSceneRayQuery {
    pub fn from_bundle(bundle: &LoadedBundle) -> Self {
        Self::from_scene(&bundle.assets, &bundle.world)
    }

    pub fn from_scene(assets: &AssetsManifest, world: &WorldIr) -> Self {
        let assets_by_id = assets
            .assets
            .iter()
            .map(|asset| (asset.id.as_str(), asset))
            .collect::<HashMap<_, _>>();
        let instances = world
            .entities
            .iter()
            .filter_map(|entity| {
                let renderer = entity.components.mesh_renderer.as_ref()?;
                if renderer.visible == Some(false) {
                    return None;
                }
                let asset = assets_by_id.get(renderer.mesh.as_deref()?)?;
                let (vertices, indices) = mesh_triangles(asset)?;
                let matrix = transform_matrix(entity.components.transform.as_ref());
                let vertices = vertices
                    .into_iter()
                    .map(|vertex| {
                        let point = matrix.transform_point3(Vec3::from_array(vertex));
                        RapierVec3::new(point.x, point.y, point.z)
                    })
                    .collect();
                let mesh = TriMesh::new(vertices, indices).ok()?;
                Some(NativeSceneRayInstance {
                    entity_id: entity.id.clone(),
                    mesh,
                })
            })
            .collect();
        Self { instances }
    }

    pub fn raycast(
        &self,
        origin: [f32; 3],
        direction: [f32; 3],
        max_distance: f32,
    ) -> Option<NativeSceneRayHit> {
        self.raycast_excluding(origin, direction, max_distance, &[])
    }

    fn raycast_excluding(
        &self,
        origin: [f32; 3],
        direction: [f32; 3],
        max_distance: f32,
        excluded_entity_ids: &[&str],
    ) -> Option<NativeSceneRayHit> {
        let direction = RapierVec3::from_array(direction).normalize_or_zero();
        if direction.length_squared() <= f32::EPSILON || max_distance <= 0.0 {
            return None;
        }
        let origin = RapierVec3::from_array(origin);
        let ray = Ray::new(origin, direction);
        self.instances
            .iter()
            .filter(|instance| !excluded_entity_ids.contains(&instance.entity_id.as_str()))
            .filter_map(|instance| {
                let intersection = instance.mesh.cast_ray_and_get_normal(
                    &Pose::IDENTITY,
                    &ray,
                    max_distance,
                    false,
                )?;
                let point = origin + direction * intersection.time_of_impact;
                Some(NativeSceneRayHit {
                    distance: intersection.time_of_impact,
                    entity_id: instance.entity_id.clone(),
                    normal: intersection.normal.to_array(),
                    point: point.to_array(),
                })
            })
            .min_by(|left, right| left.distance.total_cmp(&right.distance))
    }

    pub fn occluded(&self, from: [f32; 3], to: [f32; 3]) -> Option<NativeSceneRayHit> {
        self.occluded_excluding(from, to, &[])
    }

    pub fn occluded_excluding(
        &self,
        from: [f32; 3],
        to: [f32; 3],
        excluded_entity_ids: &[&str],
    ) -> Option<NativeSceneRayHit> {
        let delta = RapierVec3::from_array(to) - RapierVec3::from_array(from);
        let distance = delta.length();
        if distance <= f32::EPSILON {
            return None;
        }
        self.raycast_excluding(from, delta.to_array(), distance, excluded_entity_ids)
    }
}

fn mesh_triangles(asset: &AssetIr) -> Option<(Vec<[f32; 3]>, Vec<[u32; 3]>)> {
    if asset.kind != "mesh" {
        return None;
    }
    let mesh = scene_mesh_for_asset(asset);
    let vertices = match mesh.attribute(Mesh::ATTRIBUTE_POSITION)? {
        VertexAttributeValues::Float32x3(values) => values.clone(),
        _ => return None,
    };
    let flat_indices = match mesh.indices() {
        Some(Indices::U16(values)) => values.iter().map(|value| u32::from(*value)).collect(),
        Some(Indices::U32(values)) => values.clone(),
        None => (0..vertices.len() as u32).collect(),
    };
    let indices = flat_indices
        .chunks_exact(3)
        .map(|triangle| [triangle[0], triangle[1], triangle[2]])
        .collect::<Vec<_>>();
    (!vertices.is_empty() && !indices.is_empty()).then_some((vertices, indices))
}

fn transform_matrix(transform: Option<&TransformComponent>) -> Mat4 {
    let position = transform
        .and_then(|value| value.position)
        .unwrap_or([0.0; 3]);
    let rotation = transform
        .and_then(|value| value.rotation)
        .unwrap_or([0.0, 0.0, 0.0, 1.0]);
    let scale = transform.and_then(|value| value.scale).unwrap_or([1.0; 3]);
    Mat4::from_scale_rotation_translation(
        Vec3::from_array(scale),
        Quat::from_array(rotation),
        Vec3::from_array(position),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hits_render_mesh_without_a_collider() {
        let assets = serde_json::from_value(serde_json::json!({
            "schema": "threenative.assets",
            "version": "0.1.0",
            "assets": [{ "id": "mesh.wall", "kind": "mesh", "format": "generated", "primitive": "box", "size": [1, 2, 2] }]
        }))
        .expect("assets should parse");
        let world = serde_json::from_value(serde_json::json!({
            "schema": "threenative.world",
            "version": "0.1.0",
            "entities": [{
                "id": "wall.render-only",
                "components": {
                    "MeshRenderer": { "material": "mat.wall", "mesh": "mesh.wall" },
                    "Transform": { "position": [2, 0, 0] }
                }
            }]
        }))
        .expect("world should parse");
        let query = NativeSceneRayQuery::from_scene(&assets, &world);

        let hit = query
            .raycast([0.0, 0.0, 0.0], [1.0, 0.0, 0.0], 10.0)
            .expect("render geometry should be hit without collider metadata");

        assert_eq!(hit.entity_id, "wall.render-only");
        assert!((hit.distance - 1.5).abs() < 0.0001);
    }
}
