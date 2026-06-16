use bevy::prelude::*;
use threenative_runtime::{conformance::report_bevy_conformance, map_world::map_bundle_into_world};

mod support;
use support::load_conformance_fixture;

#[test]
fn should_report_basic_scene_conformance_semantics() {
    let fixture = load_conformance_fixture("basic-scene");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &fixture.bundle).unwrap_or_else(|error| {
        panic!(
            "failed to map conformance fixture '{}' at '{}': {}",
            fixture.name,
            fixture.bundle_path.display(),
            error
        )
    });
    let report = report_bevy_conformance(app.world_mut(), &fixture.bundle, fixture.name);
    let report_json = serde_json::to_value(&report).expect("report should serialize");

    assert_eq!(report.fixture, "basic-scene");
    assert_eq!(report.runtime, "bevy");
    assert!(report.diagnostics.is_empty());

    let cube = report
        .entities
        .iter()
        .find(|entity| entity.id == "cube.child")
        .expect("cube entity should be reported");
    assert_eq!(
        cube.components,
        vec![
            "Hierarchy".to_owned(),
            "MeshRenderer".to_owned(),
            "Transform".to_owned()
        ]
    );
    assert_eq!(cube.parent.as_deref(), Some("scene.root"));
    assert_eq!(cube.mesh.as_deref(), Some("mesh.cube"));
    assert_eq!(cube.material.as_deref(), Some("mat.cube"));
    assert_eq!(
        cube.mesh_renderer
            .as_ref()
            .map(|renderer| renderer.mesh.as_str()),
        Some("mesh.cube")
    );
    assert_eq!(
        cube.mesh_renderer
            .as_ref()
            .map(|renderer| renderer.material.as_str()),
        Some("mat.cube")
    );
    assert_eq!(
        cube.visibility
            .as_ref()
            .and_then(|visibility| visibility.runtime_visible),
        Some(true)
    );

    let cube_material = report
        .materials
        .iter()
        .find(|material| material.id == "mat.cube")
        .expect("cube material should be reported");
    assert_eq!(cube_material.roughness, Some(0.8));
    assert!(cube_material.textures.base_color.is_none());

    let cube_mesh = report
        .assets
        .iter()
        .find(|asset| asset.id == "mesh.cube")
        .expect("cube mesh should be reported");
    assert_eq!(cube_mesh.kind, "mesh");
    assert_eq!(cube_mesh.primitive.as_deref(), Some("box"));
    assert_eq!(
        report
            .assets
            .iter()
            .find(|asset| asset.id == "mesh.capsule")
            .and_then(|asset| asset.primitive.as_deref()),
        Some("capsule")
    );
    assert_eq!(
        report
            .assets
            .iter()
            .find(|asset| asset.id == "mesh.cylinder")
            .and_then(|asset| asset.primitive.as_deref()),
        Some("cylinder")
    );
    assert_eq!(
        report
            .entities
            .iter()
            .find(|entity| entity.id == "capsule.actor")
            .and_then(|entity| entity.mesh.as_deref()),
        Some("mesh.capsule")
    );
    assert_eq!(
        report
            .entities
            .iter()
            .find(|entity| entity.id == "cylinder.actor")
            .and_then(|entity| entity.mesh.as_deref()),
        Some("mesh.cylinder")
    );

    assert!(report.entities.iter().any(|entity| {
        entity.id == "camera.main"
            && entity
                .components
                .iter()
                .any(|component| component == "Camera")
    }));
    assert!(report.entities.iter().any(|entity| {
        entity.id == "light.key"
            && entity
                .light
                .as_ref()
                .is_some_and(|light| light.kind == "directional")
    }));
    assert_eq!(report_json["runtime"], "bevy");
    assert_eq!(report_json["entities"][0]["camera"].get("fov_y"), None);
    let camera = report_json["entities"]
        .as_array()
        .and_then(|entities| entities.iter().find(|entity| entity["id"] == "camera.main"))
        .expect("camera entity should be serialized");
    assert_eq!(camera["camera"]["fovY"], 60.0);
}

#[test]
fn should_report_promoted_generated_primitive_mapping_semantics() {
    let fixture = load_conformance_fixture("primitive-mapping");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &fixture.bundle).unwrap_or_else(|error| {
        panic!(
            "failed to map conformance fixture '{}' at '{}': {}",
            fixture.name,
            fixture.bundle_path.display(),
            error
        )
    });
    let report = report_bevy_conformance(app.world_mut(), &fixture.bundle, fixture.name);

    assert_eq!(report.fixture, "primitive-mapping");
    assert_eq!(report.runtime, "bevy");
    assert!(report.diagnostics.is_empty());

    let mut primitive_assets = report
        .assets
        .iter()
        .filter(|asset| asset.kind == "mesh")
        .map(|asset| {
            (
                asset.id.clone(),
                asset.primitive.as_deref().unwrap_or_default().to_owned(),
            )
        })
        .collect::<Vec<_>>();
    primitive_assets.sort_by(|left, right| left.0.cmp(&right.0));
    assert_eq!(
        primitive_assets,
        vec![
            ("mesh.annulus".to_owned(), "annulus".to_owned()),
            ("mesh.box".to_owned(), "box".to_owned()),
            ("mesh.capsule".to_owned(), "capsule".to_owned()),
            ("mesh.circle".to_owned(), "circle".to_owned()),
            ("mesh.cone".to_owned(), "cone".to_owned()),
            (
                "mesh.conical-frustum".to_owned(),
                "conicalFrustum".to_owned()
            ),
            ("mesh.cylinder".to_owned(), "cylinder".to_owned()),
            (
                "mesh.extruded-rectangle".to_owned(),
                "extrudedRectangle".to_owned()
            ),
            ("mesh.plane".to_owned(), "plane".to_owned()),
            (
                "mesh.regular-polygon".to_owned(),
                "regularPolygon".to_owned()
            ),
            ("mesh.sphere".to_owned(), "sphere".to_owned()),
            ("mesh.torus".to_owned(), "torus".to_owned()),
        ]
    );
    for (mesh, _) in primitive_assets {
        let entity = report
            .entities
            .iter()
            .find(|candidate| candidate.mesh.as_deref() == Some(mesh.as_str()))
            .unwrap_or_else(|| panic!("entity should reference {mesh}"));
        assert_eq!(entity.material.as_deref(), Some("mat.primitive"), "{mesh}");
    }
}

#[test]
fn should_report_resource_and_event_conformance_observations() {
    let fixture = load_conformance_fixture("v6-resources-events");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &fixture.bundle).unwrap_or_else(|error| {
        panic!(
            "failed to map conformance fixture '{}' at '{}': {}",
            fixture.name,
            fixture.bundle_path.display(),
            error
        )
    });
    let report = report_bevy_conformance(app.world_mut(), &fixture.bundle, fixture.name);

    assert_eq!(report.fixture, "v6-resources-events");
    assert_eq!(report.resources.len(), 1);
    assert_eq!(report.resources[0].id, "Score");
    assert_eq!(report.resources[0].value, serde_json::json!({ "value": 3 }));
    assert_eq!(report.events.len(), 1);
    assert_eq!(report.events[0].id, "DamageEvent");
    assert_eq!(
        report.events[0].values,
        vec![serde_json::json!({ "amount": 2, "target": "player" })]
    );
}

#[test]
fn should_report_physics_collision_and_trigger_conformance_observations() {
    let fixture = load_conformance_fixture("v6-physics-events");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &fixture.bundle).unwrap_or_else(|error| {
        panic!(
            "failed to map conformance fixture '{}' at '{}': {}",
            fixture.name,
            fixture.bundle_path.display(),
            error
        )
    });
    let report = report_bevy_conformance(app.world_mut(), &fixture.bundle, fixture.name);

    assert_eq!(report.fixture, "v6-physics-events");
    assert_eq!(report.events.len(), 2);
    assert_eq!(report.events[0].id, "CollisionEvent");
    assert_eq!(
        report.events[0].values,
        vec![
            serde_json::json!({ "a": "enemy", "b": "player", "phase": "enter" }),
            serde_json::json!({ "a": "crate", "b": "worker", "phase": "enter" }),
        ]
    );
    assert_eq!(report.events[1].id, "TriggerEvent");
    assert_eq!(
        report.events[1].values,
        vec![serde_json::json!({ "a": "pickup", "b": "sensor", "phase": "enter" })]
    );
}

#[test]
fn should_report_runtime_orthographic_camera_conformance_observations() {
    let fixture = load_conformance_fixture("v5-drift-surface");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &fixture.bundle).unwrap_or_else(|error| {
        panic!(
            "failed to map conformance fixture '{}' at '{}': {}",
            fixture.name,
            fixture.bundle_path.display(),
            error
        )
    });
    let report = report_bevy_conformance(app.world_mut(), &fixture.bundle, fixture.name);
    let camera = report
        .entities
        .iter()
        .find(|entity| entity.id == "camera.ortho")
        .and_then(|entity| entity.camera.as_ref())
        .expect("orthographic camera should be reported");
    let runtime = camera
        .runtime
        .as_ref()
        .expect("runtime camera projection should be reported");

    assert_eq!(camera.kind, "orthographic");
    assert_eq!(camera.size, Some(6.0));
    assert_eq!(runtime.kind, "orthographic");
    assert_eq!(runtime.near, Some(0.1));
    assert_eq!(runtime.far, Some(100.0));
    assert_eq!(runtime.size, Some(6.0));
}

#[test]
fn should_report_animation_clip_conformance_observations() {
    let fixture = load_conformance_fixture("v6-animation-clips");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &fixture.bundle).unwrap_or_else(|error| {
        panic!(
            "failed to map conformance fixture '{}' at '{}': {}",
            fixture.name,
            fixture.bundle_path.display(),
            error
        )
    });
    let report = report_bevy_conformance(app.world_mut(), &fixture.bundle, fixture.name);
    let model = report
        .assets
        .iter()
        .find(|asset| asset.id == "model.hero")
        .expect("model asset should be reported");
    let animations = model
        .animations
        .as_ref()
        .expect("model animation clips should be reported");

    assert_eq!(animations.len(), 2);
    assert_eq!(animations[0].id, "idle");
    assert_eq!(animations[0].loop_, Some(true));
    assert_eq!(animations[0].speed, Some(1.0));
    assert_eq!(animations[1].id, "run");
    assert_eq!(animations[1].loop_, Some(true));
    assert_eq!(animations[1].source_clip.as_deref(), Some("Armature|Run"));
    assert_eq!(animations[1].speed, Some(1.25));
}

#[test]
fn should_report_retained_ui_conformance_observations() {
    let fixture = load_conformance_fixture("v6-retained-ui");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &fixture.bundle).unwrap_or_else(|error| {
        panic!(
            "failed to map conformance fixture '{}' at '{}': {}",
            fixture.name,
            fixture.bundle_path.display(),
            error
        )
    });
    let report = report_bevy_conformance(app.world_mut(), &fixture.bundle, fixture.name);
    let ui = report.ui.expect("ui report should be present");

    assert_eq!(ui.root.id, "hud");
    assert_eq!(ui.root.kind, "stack");
    assert_eq!(ui.root.children[0].id, "hud.stack");
    assert_eq!(
        ui.root.children[0]
            .children
            .iter()
            .map(|node| node.kind.as_str())
            .collect::<Vec<_>>(),
        vec!["text", "bar", "button"]
    );
    assert_eq!(ui.root.children[0].children[1].value, Some(7.0));
    assert_eq!(ui.root.children[0].children[1].max, Some(10.0));
    assert_eq!(
        ui.root.children[0].children[2].action.as_deref(),
        Some("Pause")
    );
    assert_eq!(ui.root.children[0].children[2].focusable, Some(true));
}

#[test]
fn should_report_audio_playback_conformance_observations() {
    let fixture = load_conformance_fixture("v6-audio-playback");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &fixture.bundle).unwrap_or_else(|error| {
        panic!(
            "failed to map conformance fixture '{}' at '{}': {}",
            fixture.name,
            fixture.bundle_path.display(),
            error
        )
    });
    let report = report_bevy_conformance(app.world_mut(), &fixture.bundle, fixture.name);
    let audio = report.audio.expect("audio report should be present");

    assert_eq!(audio.commands.len(), 2);
    assert_eq!(audio.commands[0].id, "music.arena");
    assert_eq!(audio.commands[0].asset, "arena.music");
    assert_eq!(audio.commands[0].kind, "loop");
    assert_eq!(audio.commands[0].volume, Some(0.4));
    assert_eq!(audio.commands[1].id, "sound.hit");
    assert_eq!(audio.commands[1].asset, "hit.sound");
    assert_eq!(audio.commands[1].event.as_deref(), Some("DamageEvent"));
    assert_eq!(audio.commands[1].kind, "oneShot");
    assert_eq!(audio.commands[1].volume, Some(0.75));
}

#[test]
fn should_report_audio_diagnostics_in_conformance_observations() {
    let mut fixture = load_conformance_fixture("v6-audio-playback");
    fixture.bundle.assets.assets.clear();
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &fixture.bundle).unwrap_or_else(|error| {
        panic!(
            "failed to map conformance fixture '{}' at '{}': {}",
            fixture.name,
            fixture.bundle_path.display(),
            error
        )
    });
    let report = report_bevy_conformance(app.world_mut(), &fixture.bundle, fixture.name);

    assert_eq!(report.diagnostics.len(), 2);
    assert_eq!(report.diagnostics[0].code, "TN_AUDIO_ASSET_MISSING");
    assert_eq!(report.diagnostics[0].severity, "error");
    assert_eq!(report.diagnostics[0].path, "assets/arena.music");
    assert_eq!(report.diagnostics[1].path, "assets/hit.sound");
}

#[test]
fn should_report_ui_diagnostics_in_conformance_observations() {
    let mut fixture = load_conformance_fixture("v6-retained-ui");
    fixture
        .bundle
        .ui
        .as_mut()
        .expect("ui fixture should include ui")
        .root
        .kind = "html".to_owned();
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &fixture.bundle).unwrap_or_else(|error| {
        panic!(
            "failed to map conformance fixture '{}' at '{}': {}",
            fixture.name,
            fixture.bundle_path.display(),
            error
        )
    });
    let report = report_bevy_conformance(app.world_mut(), &fixture.bundle, fixture.name);

    assert!(report.ui.is_none());
    assert_eq!(report.diagnostics.len(), 1);
    assert_eq!(report.diagnostics[0].code, "TN_BEVY_UI_NODE_UNSUPPORTED");
    assert_eq!(report.diagnostics[0].severity, "error");
    assert_eq!(report.diagnostics[0].path, "ui.ir.json/root/kind");
}
