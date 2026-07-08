use bevy::prelude::*;
use threenative_loader::{
    GltfSceneAssetIr, GltfSceneMetadataIr, RuntimeConfigIr, RuntimeRenderLookOverridesConfig,
    RuntimeRenderLookProfileConfig, RuntimeRendererConfig, RuntimeTimeConfig, RuntimeWindowConfig,
};
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
            .and_then(|renderer| renderer.mesh.as_deref()),
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
fn should_report_promoted_gltf_material_metadata() {
    let fixture = load_conformance_fixture("basic-scene");
    let mut bundle = fixture.bundle;
    bundle.gltf_scene = Some(GltfSceneMetadataIr {
        schema: "threenative.gltf-scene".to_owned(),
        version: "0.1.0".to_owned(),
        assets: vec![GltfSceneAssetIr {
            asset_id: "model.hero".to_owned(),
            custom_attributes: vec![],
            materials: vec![serde_json::json!({
                "material": "material:HeroVisor",
                "extensions": [{
                    "extension": "KHR_materials_clearcoat",
                    "path": "/materials/0/extensions/KHR_materials_clearcoat",
                    "properties": ["clearcoatFactor"],
                    "status": "promoted"
                }],
                "textureTransforms": []
            })],
            morph_targets: vec![serde_json::json!({
                "mesh": "mesh:Face",
                "path": "/meshes/0/extras/targetNames/0",
                "source": "mesh.extras.targetNames",
                "target": "Smile"
            })],
            nodes: vec![],
        }],
    });
    let mut app = App::new();
    map_bundle_into_world(app.world_mut(), &bundle).expect("basic fixture should map");

    let report = report_bevy_conformance(app.world_mut(), &bundle, "gltf-fidelity");
    let gltf = report.gltf_fidelity.expect("gltf fidelity report");

    assert_eq!(gltf.assets[0].asset_id, "model.hero");
    assert_eq!(
        gltf.assets[0].materials[0]["extensions"][0]["extension"],
        "KHR_materials_clearcoat"
    );
    assert_eq!(gltf.assets[0].morph_targets[0]["target"], "Smile");
}

#[test]
fn should_report_v9_environment_lighting_budgets_and_renderer_quality() {
    let fixture = load_conformance_fixture("rendering-lights");
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

    assert_eq!(report_json["environment"]["skybox"]["mode"], "cubemap");
    assert_eq!(
        report_json["environment"]["environmentMap"]["intent"],
        "reflection-and-irradiance"
    );
    assert_eq!(
        report_json["environment"]["debugGizmos"],
        serde_json::json!([
            "instance:tree.hero",
            "lightProbe:probe.center",
            "sourceAsset:env.Tree"
        ])
    );
    assert_eq!(
        report_json["environment"]["lodImpostors"],
        serde_json::json!([
            { "asset": "model.env.TreeLow", "material": "mat.ground", "mode": "cameraFacingQuad", "sourceAsset": "env.Tree" }
        ])
    );
    assert_eq!(report_json["lightBudget"]["overBudget"], true);
    assert_eq!(
        report_json["lightBudget"]["culledLights"],
        serde_json::json!(["light.spot"])
    );
    let light = report_json["entities"]
        .as_array()
        .and_then(|entities| entities.iter().find(|entity| entity["id"] == "light.point"))
        .expect("point light should be reported");
    assert_eq!(
        light["light"]["shadowFilter"],
        serde_json::json!({ "mode": "pcf", "quality": "high" })
    );
    assert_eq!(
        report_json["runtimeConfig"]["renderer"]["renderPath"],
        "forward"
    );
    assert_eq!(
        report_json["runtimeConfig"]["renderer"]["colorGrading"]["toneMapping"],
        "aces"
    );
    let depth_of_field = &report_json["runtimeConfig"]["renderer"]["depthOfField"];
    assert_eq!(depth_of_field["enabled"], true);
    assert_eq!(depth_of_field["focusDistance"], 8.0);
    assert!((depth_of_field["aperture"].as_f64().unwrap() - 0.025).abs() < 0.000001);
    assert!((depth_of_field["maxBlur"].as_f64().unwrap() - 0.012).abs() < 0.000001);
    assert_eq!(
        report_json["runtimeConfig"]["renderer"]["postProcessing"]["applied"],
        serde_json::json!(["colorGrading", "depthOfField"])
    );
    assert_eq!(
        report_json["runtimeConfig"]["renderer"]["postProcessing"]["skipped"],
        serde_json::json!([])
    );
}

#[test]
fn should_report_promoted_render_look_profile() {
    let mut fixture = load_conformance_fixture("basic-scene");
    fixture.bundle.runtime_config = Some(RuntimeConfigIr {
        schema: "threenative.runtime-config".to_owned(),
        version: "0.1.0".to_owned(),
        renderer: Some(RuntimeRendererConfig {
            antialias: "msaa4".to_owned(),
            bloom: None,
            color_grading: None,
            depth_of_field: None,
            render_look: Some(RuntimeRenderLookProfileConfig {
                version: 1,
                profile: "stylized".to_owned(),
                overrides: Some(RuntimeRenderLookOverridesConfig {
                    bloom_intensity: Some(0.4),
                    contrast: None,
                    environment_intensity: None,
                    exposure: Some(1.1),
                    saturation: Some(1.15),
                    shadow_quality: None,
                }),
            }),
            render_path: None,
        }),
        time: RuntimeTimeConfig {
            fixed_delta: 1.0 / 60.0,
            paused: false,
        },
        window: RuntimeWindowConfig {
            height: 720.0,
            title: None,
            width: 1280.0,
        },
    });
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &fixture.bundle).unwrap();
    let report = report_bevy_conformance(app.world_mut(), &fixture.bundle, fixture.name);
    let report_json = serde_json::to_value(&report).expect("report should serialize");

    let render_look = &report_json["runtimeConfig"]["renderer"]["renderLook"];
    assert_eq!(render_look["appliedProfile"], "stylized");
    assert_eq!(render_look["requestedProfile"], "stylized");
    assert_eq!(render_look["fallbacks"], serde_json::json!([]));
    assert!((render_look["overrides"]["bloomIntensity"].as_f64().unwrap() - 0.4).abs() < 0.000001);
    assert!((render_look["overrides"]["exposure"].as_f64().unwrap() - 1.1).abs() < 0.000001);
    assert!((render_look["overrides"]["saturation"].as_f64().unwrap() - 1.15).abs() < 0.000001);
    assert_eq!(
        report_json["runtimeConfig"]["renderer"]["postProcessing"]["skipped"],
        serde_json::json!([])
    );
}

#[test]
fn should_preserve_support_profiler_fields_in_native_conformance_report() {
    let fixture = load_conformance_fixture("basic-scene");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &fixture.bundle).unwrap();
    let report = report_bevy_conformance(app.world_mut(), &fixture.bundle, fixture.name);
    let profiler = report.profiler.expect("profiler report should be present");

    assert!(profiler.entity_count > 0);
    assert!(profiler.draw_count > 0);
    assert_eq!(profiler.gpu_timing_available, false);
    assert_eq!(
        profiler
            .gpu_timing_warning
            .as_ref()
            .map(|diagnostic| diagnostic.code.as_str()),
        Some("TN_PROFILER_GPU_TIMING_UNAVAILABLE")
    );
}

#[test]
fn should_report_v10_ecs_tags_and_scene_groups_conformance_observations() {
    let fixture = load_conformance_fixture("v10-ecs-tags-groups");
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

    assert_eq!(report.fixture, "v10-ecs-tags-groups");
    assert_eq!(report.runtime, "bevy");
    assert!(report.diagnostics.is_empty());
    assert_eq!(
        report_json["systems"],
        serde_json::json!([
            {
                "name": "laneTagProbe",
                "queries": [
                    {
                        "matchedEntities": ["cube.gold.0", "cube.gold.1", "cube.gold.2", "cube.red.0", "cube.red.1", "cube.red.2", "cube.teal.0", "cube.teal.1", "cube.teal.2"],
                        "with": ["ParallelMover", "Transform", "MotionLane"],
                        "without": []
                    },
                    { "matchedEntities": ["cube.red.0", "cube.red.2"], "with": ["LaneRed", "ParallelMover"], "without": ["PhaseCooldown"] },
                    { "matchedEntities": ["cube.teal.0", "cube.teal.2"], "with": ["LaneTeal", "ParallelMover", "PhaseCooldown"], "without": [] },
                    { "matchedEntities": ["cube.gold.0", "cube.gold.2", "cube.red.0", "cube.red.2"], "with": ["PhaseActive", "ColorPhase"], "without": ["LaneTeal"] },
                    { "matchedEntities": ["group.lane.gold", "group.lane.red", "group.lane.teal"], "with": ["SceneContainer", "Transform"], "without": ["ParallelMover"] }
                ]
            }
        ])
    );

    let group = report
        .entities
        .iter()
        .find(|entity| entity.id == "group.lane.red")
        .expect("group entity should be reported");
    assert_eq!(
        group.components,
        vec!["SceneContainer".to_owned(), "Transform".to_owned()]
    );
    assert!(group.mesh_renderer.is_none());
    assert!(group.camera.is_none());
    assert!(group.light.is_none());

    let red_active = report
        .entities
        .iter()
        .find(|entity| entity.id == "cube.red.0")
        .expect("red active cube entity should be reported");
    assert_eq!(red_active.parent.as_deref(), Some("group.lane.red"));
    assert_eq!(
        red_active.components,
        vec![
            "ColorPhase".to_owned(),
            "Hierarchy".to_owned(),
            "LaneRed".to_owned(),
            "MeshRenderer".to_owned(),
            "MotionLane".to_owned(),
            "ParallelMover".to_owned(),
            "PhaseActive".to_owned(),
            "Transform".to_owned()
        ]
    );

    let teal_cooldown = report
        .entities
        .iter()
        .find(|entity| entity.id == "cube.teal.0")
        .expect("teal cooldown cube entity should be reported");
    assert_eq!(teal_cooldown.parent.as_deref(), Some("group.lane.teal"));
    assert_eq!(
        teal_cooldown.components,
        vec![
            "ColorPhase".to_owned(),
            "Hierarchy".to_owned(),
            "LaneTeal".to_owned(),
            "MeshRenderer".to_owned(),
            "MotionLane".to_owned(),
            "ParallelMover".to_owned(),
            "PhaseCooldown".to_owned(),
            "Transform".to_owned()
        ]
    );
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
    let fixture = load_conformance_fixture("resources-events");
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

    assert_eq!(report.fixture, "resources-events");
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
    let fixture = load_conformance_fixture("physics-events");
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

    assert_eq!(report.fixture, "physics-events");
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
    let fixture = load_conformance_fixture("animation-clips");
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
    let fixture = load_conformance_fixture("retained-ui");
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
    let fixture = load_conformance_fixture("audio-playback");
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
    let mut fixture = load_conformance_fixture("audio-playback");
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
    let mut fixture = load_conformance_fixture("retained-ui");
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
