use std::collections::BTreeSet;

use threenative_loader::load_bundle;
use threenative_runtime::{
    physics::{
        dispose_native_physics_runtime, ensure_native_physics_runtime,
        inspect_cached_physics_debug, queue_cached_physics_destruction_damage,
        step_bundle_physics_with_script_poses,
    },
    physics_debug::{
        MAX_PHYSICS_DEBUG_ARTIFACT_PRIMITIVES, MAX_PHYSICS_DEBUG_SUMMARY_PRIMITIVES,
        MAX_PHYSICS_DEBUG_TIMINGS, PHYSICS_DEBUG_CATEGORIES, PHYSICS_DEBUG_PRIMITIVE_KINDS,
        PHYSICS_DEBUG_SCHEMA, PHYSICS_DEBUG_VERSION, PhysicsDebugBodies, PhysicsDebugPrimitive,
        PhysicsDebugSnapshot, PhysicsDebugTelemetry, PhysicsDebugTiming,
    },
    physics_destruction::{DestructionCause, DestructionCauseKind, DestructionDamage},
};

#[test]
fn retained_debug_should_expose_stable_normalized_destruction_categories_without_handles() {
    let fixture = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/ir/fixtures/conformance/advanced-physics-destruction/game.bundle");
    let mut bundle = load_bundle(&fixture).expect("destruction fixture should load");
    let runtime = BTreeSet::new();
    ensure_native_physics_runtime(&bundle, &runtime);
    assert!(queue_cached_physics_destruction_damage(
        &runtime,
        DestructionDamage {
            amount: Some(100.0),
            assembly: "wall".to_owned(),
            bond: "bond.north".to_owned(),
            cause: DestructionCause {
                contact: Some("impact.north".to_owned()),
                entity: Some("projectile".to_owned()),
                kind: DestructionCauseKind::Contact,
            },
            energy: None,
            impulse: Some(100.0),
            layer: Some("projectile".to_owned()),
            tick: 1,
        }
    ));
    step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 120.0, &runtime);

    let debug = inspect_cached_physics_debug(&bundle, &runtime)
        .expect("retained debug snapshot should exist");
    let categories = debug
        .summary
        .primitives
        .iter()
        .map(|primitive| primitive.category.as_str())
        .collect::<BTreeSet<_>>();

    assert!(categories.contains("collider"));
    assert!(categories.contains("center-of-mass"));
    assert!(categories.contains("bond"));
    assert!(categories.contains("sleep"));
    assert!(categories.contains("budget"));
    assert!(categories.contains("piece"));
    assert!(
        debug
            .summary
            .primitives
            .windows(2)
            .all(|pair| pair[0].id <= pair[1].id)
    );
    let encoded = serde_json::to_value(&debug).expect("debug snapshot should serialize");
    assert!(!encoded.to_string().contains("bodyHandle"));
    assert!(
        debug
            .summary
            .primitives
            .iter()
            .any(|primitive| primitive.id.starts_with("piece:wall:"))
    );
    assert_eq!(debug.summary.telemetry.allocated_pieces, 2);
    assert_eq!(debug.summary.telemetry.tick, 1);
    assert!(debug.summary.telemetry.bodies.active > 0);
    dispose_native_physics_runtime(&runtime);
}

#[test]
fn center_of_mass_debug_should_use_the_portable_body_origin_for_offset_compound_colliders() {
    let fixture = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/ir/fixtures/conformance/advanced-physics-foundation/game.bundle");
    let mut bundle = load_bundle(&fixture).expect("foundation fixture should load");
    let body = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.components.rigid_body.is_some())
        .expect("fixture should contain a rigid body");
    let expected = body
        .components
        .transform
        .as_ref()
        .and_then(|transform| transform.position)
        .expect("rigid body should have a position");
    body.components.collider = None;
    body.components.compound_collider = Some(
        serde_json::from_value(serde_json::json!({
            "children": [{
                "id": "offset",
                "localPose": { "position": [2, 0, 0] },
                "shape": { "kind": "box", "size": [1, 1, 1] }
            }]
        }))
        .expect("offset compound collider should deserialize"),
    );
    let entity = body.id.clone();
    let runtime = BTreeSet::new();
    ensure_native_physics_runtime(&bundle, &runtime);

    let debug = inspect_cached_physics_debug(&bundle, &runtime)
        .expect("retained debug snapshot should exist");
    let center = debug
        .summary
        .primitives
        .iter()
        .find(|primitive| primitive.id == format!("center-of-mass:{entity}"))
        .expect("center-of-mass primitive should exist");

    assert_eq!(center.position, Some(expected));
    dispose_native_physics_runtime(&runtime);
}

#[test]
fn contact_debug_should_report_only_solver_contacts_with_real_impulses() {
    let fixture = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/ir/fixtures/conformance/advanced-physics-destruction/game.bundle");
    let mut bundle = load_bundle(&fixture).expect("destruction fixture should load");
    let runtime = BTreeSet::new();
    let debug = (0..90)
        .find_map(|_| {
            step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 120.0, &runtime);
            inspect_cached_physics_debug(&bundle, &runtime).filter(|snapshot| {
                snapshot
                    .summary
                    .primitives
                    .iter()
                    .any(|primitive| primitive.category == "contact")
            })
        })
        .expect("fixture should produce a solver contact");
    let contacts = debug
        .summary
        .primitives
        .iter()
        .filter(|primitive| primitive.category == "contact")
        .collect::<Vec<_>>();

    assert_eq!(debug.summary.telemetry.contacts, contacts.len());
    assert!(contacts.iter().all(|contact| {
        contact.id.starts_with("contact:") && contact.value.is_some_and(|impulse| impulse > 0.0)
    }));
    dispose_native_physics_runtime(&runtime);
}

#[test]
fn debug_serialization_should_cap_primitives_timings_and_bytes_deterministically() {
    let primitives: Vec<PhysicsDebugPrimitive> = (0..700)
        .map(|index| PhysicsDebugPrimitive {
            category: "force".to_owned(),
            entity: Some("body".to_owned()),
            from: Some([0.0, 0.0, 0.0]),
            id: format!("force/{index:04}"),
            kind: "vector".to_owned(),
            position: None,
            size: None,
            to: Some([1.0, 0.0, 0.0]),
            value: Some(index as f32),
        })
        .collect();
    let timings = (0..80)
        .map(|index| PhysicsDebugTiming {
            milliseconds: index as f32,
            system: format!("system-{index:03}"),
        })
        .collect();
    let telemetry = PhysicsDebugTelemetry {
        allocated_pieces: 0,
        bodies: PhysicsDebugBodies {
            active: 1,
            sleeping: 0,
        },
        contacts: 0,
        fixed_dt: 1.0 / 60.0,
        queries: 0,
        rebuilds: 1,
        solver_iterations: 12,
        tick: 1,
        timings,
    };
    let deep = PhysicsDebugSnapshot::bounded_with_limits(
        primitives.clone(),
        telemetry.clone(),
        512,
        16_384,
        256,
    );
    let snapshot = PhysicsDebugSnapshot::bounded(primitives, telemetry);

    assert_eq!(snapshot.artifact.primitives.len(), 700);
    assert_eq!(snapshot.summary.primitives.len(), 128);
    assert_eq!(snapshot.summary.telemetry.timings.len(), 64);
    assert_eq!(snapshot.summary.omitted_primitives, 572);
    assert!(snapshot.summary.truncated);
    assert!(!snapshot.artifact.truncated);
    assert_eq!(deep.summary.primitives.len(), 512);
    assert_eq!(deep.artifact.telemetry.timings.len(), 80);
    let first = snapshot
        .bounded_json(2048)
        .expect("bounded JSON should serialize");
    let second = snapshot
        .bounded_json(2048)
        .expect("bounded JSON should serialize");
    assert_eq!(first, second);
    assert!(first.len() <= 2048);
}

#[test]
fn native_debug_contract_should_track_the_shared_ir_owner() {
    let owner: serde_json::Value = serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../packages/ir/src/physicsDebugRegistry.json"
    )))
    .expect("shared physics debug registry should be valid JSON");

    assert_eq!(owner["schema"], PHYSICS_DEBUG_SCHEMA);
    assert_eq!(owner["version"], PHYSICS_DEBUG_VERSION);
    assert_eq!(
        owner["categories"],
        serde_json::json!(PHYSICS_DEBUG_CATEGORIES)
    );
    assert_eq!(
        owner["primitiveKinds"],
        serde_json::json!(PHYSICS_DEBUG_PRIMITIVE_KINDS)
    );
    assert_eq!(
        owner["limits"]["artifactPrimitives"],
        MAX_PHYSICS_DEBUG_ARTIFACT_PRIMITIVES
    );
    assert_eq!(
        owner["limits"]["summaryPrimitives"],
        MAX_PHYSICS_DEBUG_SUMMARY_PRIMITIVES
    );
    assert_eq!(owner["limits"]["timings"], MAX_PHYSICS_DEBUG_TIMINGS);
    assert_eq!(owner["defaults"]["artifactPrimitives"], 4096);
    assert_eq!(owner["defaults"]["summaryPrimitives"], 128);
    assert_eq!(owner["defaults"]["timings"], 64);
}
