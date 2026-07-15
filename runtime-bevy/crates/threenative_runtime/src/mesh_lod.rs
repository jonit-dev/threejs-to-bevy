use bevy::prelude::*;
use serde::Serialize;
use threenative_components::ThreeNativeId;

#[derive(Clone, Debug, PartialEq)]
pub struct NativeMeshLodLevel {
    pub mesh: String,
    pub min_distance: f64,
    pub handle: Handle<Mesh>,
}

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeMeshLod {
    pub base_mesh: String,
    pub base_handle: Handle<Mesh>,
    pub levels: Vec<NativeMeshLodLevel>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeMeshLodTrace {
    pub entity: String,
    pub distance: Option<f64>,
    pub selected_mesh: String,
    pub threshold: f64,
}

fn selected_level(lod: &NativeMeshLod, distance: f32) -> (&str, f64, &Handle<Mesh>) {
    let distance = f64::from(distance);
    lod.levels
        .iter()
        .rev()
        .find(|level| level.min_distance <= distance)
        .map(|level| (level.mesh.as_str(), level.min_distance, &level.handle))
        .unwrap_or((lod.base_mesh.as_str(), 0.0, &lod.base_handle))
}

fn closest_active_camera_distance(
    entity_position: Vec3,
    cameras: &Query<(&Camera, &GlobalTransform), With<ThreeNativeId>>,
) -> Option<f32> {
    cameras
        .iter()
        .filter(|(camera, _)| camera.is_active)
        .map(|(_, transform)| entity_position.distance(transform.translation()))
        .reduce(f32::min)
}

pub fn select_native_mesh_lod(
    cameras: Query<(&Camera, &GlobalTransform), With<ThreeNativeId>>,
    mut renderers: Query<(&GlobalTransform, &mut Handle<Mesh>, &NativeMeshLod), Without<Camera>>,
) {
    for (transform, mut rendered_handle, lod) in &mut renderers {
        let selected_handle = closest_active_camera_distance(transform.translation(), &cameras)
            .map(|distance| selected_level(lod, distance).2)
            .unwrap_or(&lod.base_handle);
        if rendered_handle.id() != selected_handle.id() {
            *rendered_handle = selected_handle.clone();
        }
    }
}

pub fn trace_native_mesh_lod(world: &mut World) -> Vec<NativeMeshLodTrace> {
    let camera_positions = {
        let mut cameras =
            world.query_filtered::<(&Camera, &GlobalTransform), With<ThreeNativeId>>();
        cameras
            .iter(world)
            .filter(|(camera, _)| camera.is_active)
            .map(|(_, transform)| transform.translation())
            .collect::<Vec<_>>()
    };
    let mut renderers = world.query_filtered::<(
        &ThreeNativeId,
        &GlobalTransform,
        &Handle<Mesh>,
        &NativeMeshLod,
    ), Without<Camera>>();
    let mut traces = renderers
        .iter(world)
        .filter_map(|(entity, transform, rendered_handle, lod)| {
            let distance = camera_positions
                .iter()
                .map(|camera| transform.translation().distance(*camera))
                .reduce(f32::min)
                .map(f64::from);
            let (selected_mesh, threshold) = if rendered_handle.id() == lod.base_handle.id() {
                (lod.base_mesh.as_str(), 0.0)
            } else {
                let level = lod
                    .levels
                    .iter()
                    .find(|level| level.handle.id() == rendered_handle.id())?;
                (level.mesh.as_str(), level.min_distance)
            };
            Some(NativeMeshLodTrace {
                entity: entity.0.clone(),
                distance,
                selected_mesh: selected_mesh.to_owned(),
                threshold,
            })
        })
        .collect::<Vec<_>>();
    traces.sort_by(|left, right| left.entity.cmp(&right.entity));
    traces
}

#[cfg(test)]
mod tests {
    use super::*;
    use bevy::transform::{TransformPlugin, TransformSystem};

    fn mesh_handle(value: u128) -> Handle<Mesh> {
        Handle::weak_from_u128(value)
    }

    fn lod() -> NativeMeshLod {
        NativeMeshLod {
            base_mesh: "mesh.hero".to_owned(),
            base_handle: mesh_handle(1),
            levels: vec![
                NativeMeshLodLevel {
                    mesh: "mesh.hero.lod.1".to_owned(),
                    min_distance: 10.0,
                    handle: mesh_handle(2),
                },
                NativeMeshLodLevel {
                    mesh: "mesh.hero.lod.2".to_owned(),
                    min_distance: 20.0,
                    handle: mesh_handle(3),
                },
            ],
        }
    }

    fn app_with_selector() -> App {
        let mut app = App::new();
        app.add_plugins(TransformPlugin).add_systems(
            PostUpdate,
            select_native_mesh_lod.after(TransformSystem::TransformPropagate),
        );
        app
    }

    fn spawn_camera(app: &mut App, id: &str, position: Vec3, active: bool) -> Entity {
        app.world_mut()
            .spawn((
                Camera {
                    is_active: active,
                    ..Default::default()
                },
                Transform::from_translation(position),
                GlobalTransform::default(),
                ThreeNativeId(id.to_owned()),
            ))
            .id()
    }

    fn spawn_renderer(app: &mut App, id: &str, transform: Transform) -> Entity {
        let lod = lod();
        app.world_mut()
            .spawn((
                lod.base_handle.clone(),
                lod,
                transform,
                GlobalTransform::default(),
                ThreeNativeId(id.to_owned()),
            ))
            .id()
    }

    fn rendered_handle(app: &App, entity: Entity) -> Handle<Mesh> {
        app.world()
            .entity(entity)
            .get::<Handle<Mesh>>()
            .expect("renderer should have a mesh handle")
            .clone()
    }

    #[test]
    fn should_select_base_and_last_reached_threshold() {
        let lod = lod();

        assert_eq!(selected_level(&lod, 9.999).0, "mesh.hero");
        assert_eq!(selected_level(&lod, 10.0).0, "mesh.hero.lod.1");
        assert_eq!(selected_level(&lod, 19.999).0, "mesh.hero.lod.1");
        assert_eq!(selected_level(&lod, 20.0).0, "mesh.hero.lod.2");
    }

    #[test]
    fn should_mutate_actual_handle_using_closest_active_camera() {
        let mut app = app_with_selector();
        spawn_camera(&mut app, "camera.far", Vec3::new(0.0, 0.0, 30.0), true);
        spawn_camera(&mut app, "camera.near", Vec3::new(0.0, 0.0, 5.0), true);
        let renderer = spawn_renderer(&mut app, "hero", Transform::default());

        app.update();
        assert_eq!(rendered_handle(&app, renderer).id(), mesh_handle(1).id());

        app.world_mut().entity_mut(renderer).insert(mesh_handle(3));
        app.world_mut()
            .query_filtered::<&mut Camera, With<ThreeNativeId>>()
            .iter_mut(app.world_mut())
            .for_each(|mut camera| camera.is_active = false);
        app.update();
        assert_eq!(rendered_handle(&app, renderer).id(), mesh_handle(1).id());
    }

    #[test]
    fn should_use_parented_global_transform_and_trace_actual_handle() {
        let mut app = app_with_selector();
        spawn_camera(&mut app, "camera.main", Vec3::ZERO, true);
        let parent = app
            .world_mut()
            .spawn((
                Transform::from_xyz(0.0, 0.0, 12.0),
                GlobalTransform::default(),
            ))
            .id();
        let renderer = spawn_renderer(&mut app, "hero", Transform::from_xyz(0.0, 0.0, 10.0));
        app.world_mut()
            .entity_mut(parent)
            .push_children(&[renderer]);

        app.update();

        assert_eq!(rendered_handle(&app, renderer).id(), mesh_handle(3).id());
        assert_eq!(
            trace_native_mesh_lod(app.world_mut()),
            vec![NativeMeshLodTrace {
                entity: "hero".to_owned(),
                distance: Some(22.0),
                selected_mesh: "mesh.hero.lod.2".to_owned(),
                threshold: 20.0,
            }]
        );
    }

    #[test]
    fn should_report_null_distance_and_base_without_a_valid_camera() {
        let mut app = app_with_selector();
        spawn_camera(&mut app, "camera.disabled", Vec3::ZERO, false);
        let renderer = spawn_renderer(&mut app, "hero", Transform::default());
        app.world_mut().entity_mut(renderer).insert(mesh_handle(2));

        app.update();

        assert_eq!(rendered_handle(&app, renderer).id(), mesh_handle(1).id());
        assert_eq!(trace_native_mesh_lod(app.world_mut())[0].distance, None);
        assert_eq!(
            trace_native_mesh_lod(app.world_mut())[0].selected_mesh,
            "mesh.hero"
        );
        assert_eq!(
            serde_json::to_value(trace_native_mesh_lod(app.world_mut()))
                .expect("trace should serialize")[0]["distance"],
            serde_json::Value::Null
        );
    }

    #[test]
    fn should_ignore_entities_without_lod_and_update_an_emissive_proxy() {
        let mut app = app_with_selector();
        spawn_camera(&mut app, "camera.main", Vec3::ZERO, true);
        let plain = app
            .world_mut()
            .spawn((
                mesh_handle(9),
                Transform::default(),
                GlobalTransform::default(),
                ThreeNativeId("plain".to_owned()),
            ))
            .id();
        let parent = spawn_renderer(&mut app, "hero", Transform::from_xyz(0.0, 0.0, 15.0));
        let proxy_lod = lod();
        let proxy = app
            .world_mut()
            .spawn((
                proxy_lod.base_handle.clone(),
                proxy_lod,
                Transform::default(),
                GlobalTransform::default(),
            ))
            .id();
        app.world_mut().entity_mut(parent).push_children(&[proxy]);

        app.update();

        assert_eq!(rendered_handle(&app, plain).id(), mesh_handle(9).id());
        assert_eq!(rendered_handle(&app, parent).id(), mesh_handle(2).id());
        assert_eq!(rendered_handle(&app, proxy).id(), mesh_handle(2).id());
    }

    #[test]
    fn trace_should_not_claim_an_unrecognized_rendered_handle() {
        let mut app = app_with_selector();
        let renderer = spawn_renderer(&mut app, "hero", Transform::default());
        app.world_mut().entity_mut(renderer).insert(mesh_handle(99));

        assert!(trace_native_mesh_lod(app.world_mut()).is_empty());
    }

    #[test]
    fn trace_should_sort_entries_by_entity_id() {
        let mut app = app_with_selector();
        spawn_renderer(&mut app, "zeta", Transform::default());
        spawn_renderer(&mut app, "alpha", Transform::default());

        let traces = trace_native_mesh_lod(app.world_mut());

        assert_eq!(
            traces
                .iter()
                .map(|trace| trace.entity.as_str())
                .collect::<Vec<_>>(),
            vec!["alpha", "zeta"]
        );
    }
}
