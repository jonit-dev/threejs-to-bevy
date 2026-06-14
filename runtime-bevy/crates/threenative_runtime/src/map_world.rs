use std::collections::HashMap;

use bevy::{
    core_pipeline::tonemapping::Tonemapping,
    math::primitives::{Capsule3d, Cuboid, Cylinder, Rectangle, Sphere},
    prelude::*,
    render::{camera::ScalingMode, view::ColorGrading},
};
use thiserror::Error;
use threenative_components::ThreeNativeId;
use threenative_loader::{AssetIr, ColorIr, LoadedBundle, MaterialIr, WorldEntity};

#[derive(Debug, Error)]
pub enum MapError {
    #[error("entity '{entity_id}' references missing mesh '{mesh_id}'")]
    MissingMesh { entity_id: String, mesh_id: String },
    #[error("entity '{entity_id}' references missing material '{material_id}'")]
    MissingMaterial {
        entity_id: String,
        material_id: String,
    },
}

impl MapError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::MissingMesh { .. } => "TN_BEVY_MESH_REFERENCE_MISSING",
            Self::MissingMaterial { .. } => "TN_BEVY_MATERIAL_REFERENCE_MISSING",
        }
    }

    pub fn path(&self) -> String {
        match self {
            Self::MissingMesh { entity_id, .. } => {
                format!("world.ir.json/entities/{entity_id}/components/MeshRenderer/mesh")
            }
            Self::MissingMaterial { entity_id, .. } => {
                format!("world.ir.json/entities/{entity_id}/components/MeshRenderer/material")
            }
        }
    }

    pub fn suggestion(&self) -> String {
        match self {
            Self::MissingMesh { mesh_id, .. } => {
                format!(
                    "Add mesh asset '{mesh_id}' to assets.manifest.json or update the MeshRenderer mesh reference."
                )
            }
            Self::MissingMaterial { material_id, .. } => {
                format!(
                    "Add material '{material_id}' to materials.ir.json or update the MeshRenderer material reference."
                )
            }
        }
    }
}

pub fn map_bundle_into_world(world: &mut World, bundle: &LoadedBundle) -> Result<(), MapError> {
    ensure_asset_resources(world);
    let camera_color_management = bundle
        .environment_scene
        .as_ref()
        .and_then(|scene| scene.atmosphere.as_ref())
        .filter(|profile| profile.active)
        .map(|profile| &profile.color_management);

    let assets_by_id = bundle
        .assets
        .assets
        .iter()
        .map(|asset| (asset.id.as_str(), asset))
        .collect::<HashMap<_, _>>();
    let materials_by_id = bundle
        .materials
        .materials
        .iter()
        .map(|material| (material.id.as_str(), material))
        .collect::<HashMap<_, _>>();

    let mut entities_by_id = HashMap::new();
    for entity in &bundle.world.entities {
        let bevy_entity = spawn_entity(
            world,
            entity,
            &assets_by_id,
            &materials_by_id,
            camera_color_management,
        )?;
        entities_by_id.insert(entity.id.as_str(), bevy_entity);
    }

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

    Ok(())
}

fn ensure_asset_resources(world: &mut World) {
    if !world.contains_resource::<Assets<Mesh>>() {
        world.init_resource::<Assets<Mesh>>();
    }
    if !world.contains_resource::<Assets<StandardMaterial>>() {
        world.init_resource::<Assets<StandardMaterial>>();
    }
}

fn spawn_entity(
    world: &mut World,
    entity: &WorldEntity,
    assets_by_id: &HashMap<&str, &AssetIr>,
    materials_by_id: &HashMap<&str, &MaterialIr>,
    camera_color_management: Option<&threenative_loader::AtmosphereColorManagementIr>,
) -> Result<Entity, MapError> {
    let transform = map_transform(entity);
    let name = Name::new(entity.id.clone());
    let stable_id = ThreeNativeId(entity.id.clone());

    if let Some(renderer) = &entity.components.mesh_renderer {
        let asset =
            assets_by_id
                .get(renderer.mesh.as_str())
                .ok_or_else(|| MapError::MissingMesh {
                    entity_id: entity.id.clone(),
                    mesh_id: renderer.mesh.clone(),
                })?;
        let material = materials_by_id
            .get(renderer.material.as_str())
            .ok_or_else(|| MapError::MissingMaterial {
                entity_id: entity.id.clone(),
                material_id: renderer.material.clone(),
            })?;
        let mesh = add_mesh(world, asset);
        let material = add_material(world, material);
        return Ok(world
            .spawn(PbrBundle {
                mesh,
                material,
                transform,
                visibility: map_visibility(entity),
                ..Default::default()
            })
            .insert((stable_id, name))
            .id());
    }

    if let Some(camera) = &entity.components.camera {
        let projection = if camera.kind == "orthographic" {
            Projection::Orthographic(OrthographicProjection {
                far: camera.far,
                near: camera.near,
                scaling_mode: ScalingMode::FixedVertical(camera.size.unwrap_or(1.0)),
                ..Default::default()
            })
        } else {
            Projection::Perspective(PerspectiveProjection {
                fov: camera.fov_y.unwrap_or(60.0).to_radians(),
                near: camera.near,
                far: camera.far,
                ..Default::default()
            })
        };
        return Ok(world
            .spawn(Camera3dBundle {
                color_grading: color_grading_for_profile(camera_color_management),
                projection,
                tonemapping: tonemapping_for_profile(camera_color_management),
                transform,
                ..Default::default()
            })
            .insert((stable_id, name, map_visibility(entity)))
            .id());
    }

    if let Some(light) = &entity.components.light {
        if light.kind == "directional" {
            let mut light_transform = transform;
            light_transform.look_at(Vec3::ZERO, Vec3::Y);
            return Ok(world
                .spawn(DirectionalLightBundle {
                    directional_light: DirectionalLight {
                        color: color_to_bevy(&light.color),
                        illuminance: light.intensity * 2_000.0,
                        ..Default::default()
                    },
                    transform: light_transform,
                    visibility: map_visibility(entity),
                    ..Default::default()
                })
                .insert((stable_id, name))
                .id());
        }
        if light.kind == "point" {
            return Ok(world
                .spawn(PointLightBundle {
                    point_light: PointLight {
                        color: color_to_bevy(&light.color),
                        intensity: light.intensity * 800.0,
                        ..Default::default()
                    },
                    transform,
                    visibility: map_visibility(entity),
                    ..Default::default()
                })
                .insert((stable_id, name))
                .id());
        }
        if light.kind == "spot" {
            return Ok(world
                .spawn(SpotLightBundle {
                    spot_light: SpotLight {
                        color: color_to_bevy(&light.color),
                        intensity: light.intensity * 800.0,
                        ..Default::default()
                    },
                    transform,
                    visibility: map_visibility(entity),
                    ..Default::default()
                })
                .insert((stable_id, name))
                .id());
        }
        if light.kind == "ambient" {
            world.insert_resource(AmbientLight {
                color: color_to_bevy(&light.color),
                brightness: light.intensity,
            });
        }
    }

    Ok(world
        .spawn((stable_id, name, transform, map_visibility(entity)))
        .id())
}

fn color_grading_for_profile(
    color_management: Option<&threenative_loader::AtmosphereColorManagementIr>,
) -> ColorGrading {
    let mut color_grading = ColorGrading::default();
    if let Some(color_management) = color_management {
        color_grading.global.exposure = color_management.exposure.max(0.001).log2();
    }
    color_grading
}

fn tonemapping_for_profile(
    color_management: Option<&threenative_loader::AtmosphereColorManagementIr>,
) -> Tonemapping {
    match color_management.map(|profile| profile.tone_mapping.as_str()) {
        Some("aces") => Tonemapping::AcesFitted,
        Some("none") => Tonemapping::None,
        _ => Tonemapping::default(),
    }
}

fn add_mesh(world: &mut World, asset: &AssetIr) -> Handle<Mesh> {
    let mesh = match asset.primitive.as_deref() {
        Some("sphere") => Mesh::from(Sphere {
            radius: asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(0.5),
        }),
        Some("cylinder") => Mesh::from(Cylinder::new(
            asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(0.5),
            asset
                .size
                .as_ref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(1.0),
        )),
        Some("capsule") => Mesh::from(Capsule3d::new(
            asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(0.5),
            asset
                .size
                .as_ref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(1.0),
        )),
        Some("plane") => {
            let width = asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(1.0);
            let height = asset
                .size
                .as_ref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(1.0);
            Mesh::from(Rectangle::new(width, height))
        }
        _ => {
            let size = asset.size.as_deref().unwrap_or(&[1.0, 1.0, 1.0]);
            Mesh::from(Cuboid::new(
                size.first().copied().unwrap_or(1.0),
                size.get(1).copied().unwrap_or(1.0),
                size.get(2).copied().unwrap_or(1.0),
            ))
        }
    };
    world.resource_mut::<Assets<Mesh>>().add(mesh)
}

fn map_visibility(entity: &WorldEntity) -> Visibility {
    if entity
        .components
        .visibility
        .as_ref()
        .is_some_and(|visibility| !visibility.visible)
        || entity
            .components
            .mesh_renderer
            .as_ref()
            .and_then(|renderer| renderer.visible)
            .is_some_and(|visible| !visible)
    {
        Visibility::Hidden
    } else {
        Visibility::Inherited
    }
}

fn add_material(world: &mut World, material: &MaterialIr) -> Handle<StandardMaterial> {
    world
        .resource_mut::<Assets<StandardMaterial>>()
        .add(StandardMaterial {
            base_color: color_to_bevy(&material.color),
            metallic: material.metalness.unwrap_or(0.0),
            perceptual_roughness: material.roughness.unwrap_or(1.0),
            ..Default::default()
        })
}

fn map_transform(entity: &WorldEntity) -> Transform {
    let mut transform = Transform::default();
    if let Some(source) = &entity.components.transform {
        if let Some(position) = source.position {
            transform.translation = Vec3::new(position[0], position[1], position[2]);
        }
        if let Some(rotation) = source.rotation {
            transform.rotation =
                Quat::from_xyzw(rotation[0], rotation[1], rotation[2], rotation[3]);
        }
        if let Some(scale) = source.scale {
            transform.scale = Vec3::new(scale[0], scale[1], scale[2]);
        }
    }
    transform
}

fn color_to_bevy(color: &ColorIr) -> Color {
    match color {
        ColorIr::Hex(hex) => {
            let trimmed = hex.trim_start_matches('#');
            if trimmed.len() != 6 {
                return Color::WHITE;
            }
            let Ok(value) = u32::from_str_radix(trimmed, 16) else {
                return Color::WHITE;
            };
            let red = ((value >> 16) & 0xff) as f32 / 255.0;
            let green = ((value >> 8) & 0xff) as f32 / 255.0;
            let blue = (value & 0xff) as f32 / 255.0;
            Color::srgb(red, green, blue)
        }
        ColorIr::Rgb(rgb) => Color::srgb(rgb[0], rgb[1], rgb[2]),
    }
}
