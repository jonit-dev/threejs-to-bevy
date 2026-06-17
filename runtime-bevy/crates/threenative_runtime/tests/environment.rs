use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use bevy::prelude::*;
use threenative_components::ThreeNativeId;
use threenative_loader::load_bundle;
use threenative_runtime::environment::{
    NativeInstancedMember, map_environment_into_world, observe_environment,
    trace_native_environment_instancing,
};

mod support;
use support::load_conformance_fixture;

#[test]
fn environment_should_map_scene_to_terrain_path_and_instances() {
    let root = temp_bundle_dir();
    write_json(
        &root,
        "manifest.json",
        r#"{
          "schema": "threenative.bundle",
          "version": "0.1.0",
          "name": "environment",
          "entry": { "world": "world.ir.json", "environmentScene": "environment.scene.json" },
          "files": {
            "assets": "assets.manifest.json",
            "materials": "materials.ir.json",
            "targetProfile": "target.profile.json"
          }
        }"#,
    );
    write_json(
        &root,
        "world.ir.json",
        r#"{ "schema": "threenative.world", "version": "0.1.0", "entities": [] }"#,
    );
    write_json(
        &root,
        "assets.manifest.json",
        r#"{
          "schema": "threenative.assets",
          "version": "0.1.0",
          "assets": [
            { "id": "model.env.Rock", "kind": "model", "format": "gltf", "path": "assets/environment/Rock.gltf" },
            { "id": "model.env.RockLow", "kind": "model", "format": "gltf", "path": "assets/environment/RockLow.gltf" }
          ]
        }"#,
    );
    write_json(
        &root,
        "materials.ir.json",
        r#"{ "schema": "threenative.materials", "version": "0.1.0", "materials": [] }"#,
    );
    write_json(
        &root,
        "target.profile.json",
        r#"{ "schema": "threenative.target-profile", "version": "0.1.0", "targets": ["desktop"] }"#,
    );
    write_json(
        &root,
        "environment.scene.json",
        r#"{
          "schema": "threenative.environment-scene",
          "version": "0.1.0",
          "terrain": { "id": "terrain.forest", "heightMode": "flat", "bounds": { "min": [-5, 0, -5], "max": [5, 0, 5] } },
          "path": { "id": "path.main", "points": [[0, 0, 3], [0, 0, -3]], "width": 2 },
          "sourceAssets": [{
            "id": "env.Rock",
            "asset": "model.env.Rock",
            "category": "rock",
            "lod": [{ "asset": "model.env.RockLow", "minDistance": 20, "maxDistance": 80 }]
          }],
          "instances": [
            { "id": "rock.hero", "kind": "hero", "sourceAsset": "env.Rock", "position": [2, 0, 0], "tags": ["rock"] },
            { "id": "rock.scatter.1", "kind": "scatter", "sourceAsset": "env.Rock", "position": [-2, 0, 0], "tags": ["rock"] },
            { "id": "rock.scatter.2", "kind": "scatter", "sourceAsset": "env.Rock", "position": [-1, 0, 0], "tags": ["rock"] }
          ],
          "bookmarks": [{ "id": "bookmark.start", "position": [0, 1.7, 4], "yaw": 180, "pitch": -5, "expectedTags": ["rock"] }]
        }"#,
    );

    let bundle = load_bundle(&root).expect("environment bundle should load");
    let observation = observe_environment(&bundle).expect("environment observation should exist");

    assert_eq!(
        observation
            .terrain
            .as_ref()
            .map(|terrain| terrain.id.as_str()),
        Some("terrain.forest")
    );
    assert_eq!(observation.path_point_count, 2);
    assert_eq!(observation.hero_placement_ids, vec!["rock.hero"]);
    assert_eq!(observation.scatter_instance_count, 2);
    assert_eq!(observation.scatter_counts_by_tag.get("rock"), Some(&2));
    assert_eq!(observation.bookmark_ids, vec!["bookmark.start"]);
    assert_eq!(observation.source_asset_count, 1);
    assert_eq!(observation.total_instance_count, 3);
    assert_eq!(observation.lod_source_asset_count, 1);
    assert_eq!(
        observation
            .lod_selections
            .get("env.Rock")
            .map(String::as_str),
        Some("model.env.RockLow")
    );
    assert_eq!(observation.repeated_asset_groups.len(), 1);
    assert_eq!(
        observation.repeated_asset_groups[0].source_asset,
        "env.Rock"
    );
    assert_eq!(observation.repeated_asset_groups[0].count, 2);
    assert_eq!(
        observation.repeated_asset_groups[0].evidence,
        "model-asset-backed"
    );

    let mut app = App::new();
    map_environment_into_world(app.world_mut(), &bundle);
    assert_instance_transform(app.world_mut(), "environment:rock.hero", [2.0, 0.375, 0.0]);
    assert_instance_transform(
        app.world_mut(),
        "environment:rock.scatter.1",
        [-2.0, 0.375, 0.0],
    );
    assert_instance_transform(
        app.world_mut(),
        "environment:rock.scatter.2",
        [-1.0, 0.375, 0.0],
    );
    assert_native_instancing(app.world_mut());

    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn environment_content_trace_should_report_v7_lod_and_instancing_evidence() {
    let fixture = load_conformance_fixture("v7-renderer-dense-content");
    let observation = observe_environment(&fixture.bundle)
        .expect("v7 renderer dense content observation should exist");

    assert_eq!(observation.bookmark_ids, vec!["bookmark.content"]);
    assert_eq!(observation.hero_placement_ids, vec!["tree.hero"]);
    assert_eq!(
        observation
            .lod_selections
            .get("env.Rock")
            .map(String::as_str),
        Some("model.env.RockLow")
    );
    assert_eq!(
        observation
            .lod_selections
            .get("env.Tree")
            .map(String::as_str),
        Some("model.env.Tree")
    );
    assert_eq!(observation.repeated_asset_groups.len(), 1);
    assert_eq!(
        observation.repeated_asset_groups[0].source_asset,
        "env.Rock"
    );
    assert_eq!(observation.repeated_asset_groups[0].count, 2);
    assert_eq!(
        observation.repeated_asset_groups[0].evidence,
        "model-asset-backed"
    );
    assert_eq!(observation.total_instance_count, 3);
}

fn assert_instance_transform(world: &mut World, id: &str, expected_translation: [f32; 3]) {
    let mut query = world.query::<(&ThreeNativeId, &Transform)>();
    let transform = query
        .iter(world)
        .find_map(|(stable_id, transform)| (stable_id.0 == id).then_some(transform))
        .expect("environment instance should be spawned");

    assert_eq!(
        transform.translation,
        Vec3::from_array(expected_translation),
        "environment instance transform should preserve authored x/z and category height placement"
    );
}

fn assert_native_instancing(world: &mut World) {
    let report = trace_native_environment_instancing(world)
        .expect("native environment instancing report should exist");
    assert_eq!(report.groups.len(), 1);
    assert_eq!(report.groups[0].source_asset, "env.Rock");
    assert_eq!(report.groups[0].count, 2);
    assert_eq!(
        report.groups[0].instance_ids,
        vec!["rock.scatter.1", "rock.scatter.2"]
    );
    assert_eq!(report.groups[0].evidence, "model-scene-handle-batched");
    assert_eq!(report.total_instanced_instances, 2);

    let mut query = world.query::<(&ThreeNativeId, &NativeInstancedMember)>();
    let mut ids = query
        .iter(world)
        .map(|(id, member)| {
            assert_eq!(member.source_asset, "env.Rock");
            assert_eq!(member.group_id, "instanced:env.Rock");
            id.0.clone()
        })
        .collect::<Vec<_>>();
    ids.sort();
    assert_eq!(
        ids,
        vec![
            "environment:rock.scatter.1".to_owned(),
            "environment:rock.scatter.2".to_owned(),
        ]
    );
    let handles = instanced_pbr_handles(world);
    assert_eq!(handles.len(), 2);
    assert_eq!(handles[0].1, handles[1].1);
    assert_eq!(handles[0].2, handles[1].2);
}

fn instanced_pbr_handles(
    world: &mut World,
) -> Vec<(String, Handle<Mesh>, Handle<StandardMaterial>)> {
    let mut query = world.query::<(
        &ThreeNativeId,
        &NativeInstancedMember,
        &Handle<Mesh>,
        &Handle<StandardMaterial>,
    )>();
    let mut rows = query
        .iter(world)
        .map(|(id, _member, mesh, material)| (id.0.clone(), mesh.clone(), material.clone()))
        .collect::<Vec<_>>();
    rows.sort_by(|left, right| left.0.cmp(&right.0));
    rows
}

fn temp_bundle_dir() -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock should be after epoch")
        .as_nanos();
    let path = std::env::temp_dir().join(format!("tn-environment-loader-{stamp}"));
    fs::create_dir_all(&path).expect("temp bundle dir should be created");
    path
}

fn write_json(root: &Path, file: &str, contents: &str) {
    fs::write(root.join(file), contents).expect("bundle json should be written");
}
