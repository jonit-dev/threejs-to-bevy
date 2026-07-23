use std::collections::BTreeSet;

use threenative_loader::load_bundle;
use threenative_runtime::physics::{
    dispose_native_physics_runtime, ensure_native_physics_runtime,
    inspect_cached_physics_destruction, queue_cached_physics_destruction_damage,
    step_bundle_physics_with_script_poses,
};
use threenative_runtime::physics_destruction::{
    CleanupPolicy, DEFAULT_SCENE_ACTIVE_PIECE_BUDGET, Destructible, DestructionCause,
    DestructionCauseKind, DestructionDamage, DestructionEvent, DestructionRuntime, FractureBond,
    FractureBudgets, FractureCleanup, FractureManifest, FracturePiece, FracturePieceCollider,
    FractureSource, ImpactFilter, OverflowPolicy, PieceLifecycle,
};

#[test]
fn activated_pieces_should_use_retained_bodies_with_conserved_mass_and_stable_handles() {
    let fixture = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/ir/fixtures/conformance/advanced-physics-destruction/game.bundle");
    let mut bundle = load_bundle(&fixture).expect("destruction fixture should load");
    let wall = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "wall")
        .expect("wall should exist");
    let body = wall
        .components
        .rigid_body
        .as_mut()
        .expect("wall body should exist");
    body.velocity = Some([2.0, 0.0, 0.0]);
    body.angular_velocity = Some([0.0, 0.5, 0.0]);
    let runtime = BTreeSet::new();
    ensure_native_physics_runtime(&bundle, &runtime);
    for bond in ["bond.east", "bond.north", "bond.south", "bond.west"] {
        assert!(queue_cached_physics_destruction_damage(
            &runtime,
            DestructionDamage {
                amount: Some(100.0),
                assembly: "wall".to_owned(),
                bond: bond.to_owned(),
                cause: DestructionCause {
                    contact: Some("impact.1".to_owned()),
                    entity: Some("projectile".to_owned()),
                    kind: DestructionCauseKind::Contact,
                },
                energy: None,
                impulse: Some(100.0),
                layer: Some("projectile".to_owned()),
                tick: 1,
            }
        ));
    }

    step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 120.0, &runtime);
    let observation = inspect_cached_physics_destruction(&runtime)
        .expect("retained destruction observation should exist");

    assert!(!observation.assemblies[0].intact_collision_active);
    assert_eq!(
        observation
            .pieces
            .iter()
            .map(|piece| piece.piece.as_str())
            .collect::<Vec<_>>(),
        [
            "piece.northeast",
            "piece.northwest",
            "piece.southeast",
            "piece.southwest",
        ]
    );
    assert!(
        observation
            .pieces
            .iter()
            .all(|piece| piece.lifecycle == PieceLifecycle::Active)
    );
    let handles = observation
        .pieces
        .iter()
        .map(|piece| piece.body_handle.expect("active piece needs a handle"))
        .collect::<BTreeSet<_>>();
    assert_eq!(handles.len(), 4);
    let total_mass = observation
        .pieces
        .iter()
        .map(|piece| piece.mass)
        .sum::<f32>();
    assert!((total_mass - 80.0).abs() < 0.001);
    let momentum_x = observation
        .pieces
        .iter()
        .map(|piece| piece.mass * piece.linear_velocity[0])
        .sum::<f32>();
    assert!((momentum_x - 160.0).abs() < 0.5);

    step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 120.0, &runtime);
    let next = inspect_cached_physics_destruction(&runtime).expect("observation should persist");
    assert_eq!(
        next.pieces
            .iter()
            .map(|piece| piece.body_handle)
            .collect::<Vec<_>>(),
        observation
            .pieces
            .iter()
            .map(|piece| piece.body_handle)
            .collect::<Vec<_>>()
    );
    dispose_native_physics_runtime(&runtime);
}

#[test]
fn regional_activation_should_keep_unrelated_bound_pieces_in_the_retained_world() {
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
    let observation = inspect_cached_physics_destruction(&runtime)
        .expect("retained destruction observation should exist");

    assert!(!observation.assemblies[0].intact_collision_active);
    assert_eq!(
        observation
            .pieces
            .iter()
            .filter(|piece| piece.lifecycle == PieceLifecycle::Active)
            .map(|piece| piece.piece.as_str())
            .collect::<Vec<_>>(),
        ["piece.northeast", "piece.northwest"]
    );
    assert_eq!(
        observation
            .pieces
            .iter()
            .filter(|piece| piece.lifecycle == PieceLifecycle::Bound)
            .map(|piece| piece.piece.as_str())
            .collect::<Vec<_>>(),
        ["piece.southeast", "piece.southwest"]
    );
    assert!(
        observation
            .pieces
            .iter()
            .all(|piece| piece.body_handle.is_some())
    );
    assert!(
        (observation
            .pieces
            .iter()
            .map(|piece| piece.mass)
            .sum::<f32>()
            - 80.0)
            .abs()
            < 0.001
    );
    dispose_native_physics_runtime(&runtime);
}

#[test]
fn retained_contact_impulse_should_queue_normalized_damage_for_the_next_tick() {
    let fixture = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/ir/fixtures/conformance/advanced-physics-destruction/game.bundle");
    let mut bundle = load_bundle(&fixture).expect("destruction fixture should load");
    let runtime = BTreeSet::new();
    let mut damaged = false;

    for _ in 0..90 {
        step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 120.0, &runtime);
        damaged |= bundle
            .world
            .events
            .get("DestructionEvent")
            .and_then(serde_json::Value::as_array)
            .is_some_and(|events| {
                events.iter().any(|event| {
                    event.get("type").and_then(serde_json::Value::as_str) == Some("damaged")
                        && event
                            .get("cause")
                            .and_then(|cause| cause.get("kind"))
                            .and_then(serde_json::Value::as_str)
                            == Some("contact")
                })
            });
        if damaged {
            break;
        }
    }

    assert!(
        damaged,
        "retained solver contact should route into bond damage"
    );
    dispose_native_physics_runtime(&runtime);
}

#[test]
fn damage_should_resolve_once_per_tick_with_stable_bond_and_piece_events() {
    let mut runtime = DestructionRuntime::new();
    runtime
        .register(
            "wall",
            manifest(OverflowPolicy::RejectNew, 3, None),
            component(),
        )
        .expect("manifest should register");
    assert!(runtime.queue_damage(script_damage(1, "bond.ab", 20.0)));
    assert!(runtime.queue_damage(script_damage(1, "bond.ab", 35.0)));

    let events = runtime.step(1, 1.0 / 60.0);

    assert_eq!(
        event_names(&events),
        ["damaged", "bondBroken", "pieceActivated", "pieceActivated"]
    );
    assert_eq!(event_bonds(&events), ["bond.ab", "bond.ab"]);
    assert_eq!(event_pieces(&events), ["piece.a", "piece.b"]);
    assert!(matches!(
        &events[0],
        DestructionEvent::Damaged {
            amount: 50.0,
            remaining_health: 0.0,
            ..
        }
    ));
    assert!(runtime.step(1, 1.0 / 60.0).is_empty());

    assert!(runtime.queue_damage(script_damage(2, "bond.bc", 50.0)));
    let events = runtime.step(2, 1.0 / 60.0);
    assert_eq!(
        event_names(&events),
        ["damaged", "bondBroken", "pieceActivated", "assemblyBroken"]
    );
    assert_eq!(event_pieces(&events), ["piece.c"]);
    assert!(runtime.observe().assemblies[0].broken);
}

#[test]
fn contact_damage_should_honor_filters_thresholds_and_material_response() {
    let mut runtime = DestructionRuntime::new();
    let mut destructible = component();
    destructible.impact_filter = Some(ImpactFilter {
        layers: vec!["projectile".to_owned()],
        min_impulse: Some(20.0),
    });
    let mut fixture = manifest(OverflowPolicy::RejectNew, 3, None);
    fixture.bonds[0].material_response = Some(0.5);
    runtime
        .register("wall", fixture, destructible)
        .expect("manifest should register");

    assert!(runtime.queue_damage(contact_damage(1, "bond.ab", 19.0, "projectile")));
    assert!(runtime.step(1, 1.0 / 60.0).is_empty());
    assert!(runtime.queue_damage(contact_damage(2, "bond.ab", 100.0, "vehicle")));
    assert!(runtime.step(2, 1.0 / 60.0).is_empty());
    assert!(runtime.queue_damage(contact_damage(3, "bond.ab", 100.0, "projectile")));

    let events = runtime.step(3, 1.0 / 60.0);

    assert_eq!(
        event_names(&events),
        ["damaged", "bondBroken", "pieceActivated", "pieceActivated"]
    );
}

#[test]
fn reject_new_budget_should_stay_bounded_and_report_every_overflow() {
    let mut runtime = DestructionRuntime::with_scene_budget(2);
    runtime
        .register(
            "wall",
            manifest(OverflowPolicy::RejectNew, 3, None),
            component(),
        )
        .expect("manifest should register");
    runtime.queue_damage(script_damage(1, "bond.ab", 50.0));
    runtime.queue_damage(script_damage(1, "bond.bc", 50.0));

    let events = runtime.step(1, 1.0 / 60.0);
    let observation = runtime.observe();

    assert_eq!(runtime.active_piece_count(), 2);
    assert_eq!(
        observation
            .pieces
            .iter()
            .map(|piece| (&piece.id, piece.lifecycle))
            .collect::<Vec<_>>(),
        [
            (&"piece.a".to_owned(), PieceLifecycle::Active),
            (&"piece.b".to_owned(), PieceLifecycle::Active),
            (&"piece.c".to_owned(), PieceLifecycle::Bound),
        ]
    );
    assert_eq!(budget_pieces(&events), ["piece.c"]);
}

#[test]
fn overflow_eviction_should_replace_the_stable_oldest_piece_with_declared_lifecycle() {
    for (policy, expected) in [
        (OverflowPolicy::SleepOldest, PieceLifecycle::Sleeping),
        (OverflowPolicy::DespawnOldest, PieceLifecycle::Despawned),
    ] {
        let mut runtime = DestructionRuntime::new();
        runtime
            .register("wall", manifest(policy, 1, None), component())
            .expect("manifest should register");
        runtime.queue_damage(script_damage(1, "bond.ab", 50.0));

        let events = runtime.step(1, 1.0 / 60.0);
        let observation = runtime.observe();

        assert_eq!(runtime.active_piece_count(), 1);
        assert_eq!(observation.pieces[0].lifecycle, expected);
        assert_eq!(observation.pieces[1].lifecycle, PieceLifecycle::Active);
        assert_eq!(budget_pieces(&events), ["piece.b"]);
    }
}

#[test]
fn cleanup_policy_should_use_manifest_timing_and_bound_the_pool() {
    let cleanup = FractureCleanup {
        despawn_after_seconds: Some(0.3),
        pool_capacity: Some(1),
        sleep_after_seconds: Some(0.2),
    };
    let mut destructible = component();
    destructible.cleanup_policy = Some(CleanupPolicy::Pool);
    let mut runtime = DestructionRuntime::new();
    runtime
        .register(
            "wall",
            manifest(OverflowPolicy::RejectNew, 3, Some(cleanup)),
            destructible,
        )
        .expect("manifest should register");
    runtime.queue_damage(script_damage(1, "bond.ab", 50.0));
    runtime.queue_damage(script_damage(1, "bond.bc", 50.0));
    runtime.step(1, 0.0);

    runtime.step(2, 0.2);
    assert!(
        runtime
            .observe()
            .pieces
            .iter()
            .all(|piece| piece.lifecycle == PieceLifecycle::Sleeping)
    );

    runtime.step(3, 0.1);
    let observation = runtime.observe();
    assert_eq!(
        observation
            .pieces
            .iter()
            .map(|piece| piece.lifecycle)
            .collect::<Vec<_>>(),
        [
            PieceLifecycle::Pooled,
            PieceLifecycle::Despawned,
            PieceLifecycle::Despawned,
        ]
    );
    assert_eq!(runtime.active_piece_count(), 0);
}

#[test]
fn portable_dtos_should_serialize_with_ir_field_and_enum_names() {
    let mut destructible = component();
    destructible.cleanup_policy = Some(CleanupPolicy::Pool);

    assert_eq!(
        serde_json::to_value(&destructible).expect("component should serialize")["cleanupPolicy"],
        "pool"
    );
    let source = serde_json::to_value(FractureSource::Primitive {
        asset: None,
        seed: 7,
        source_hash: "sha256-test".to_owned(),
    })
    .expect("source should serialize");
    assert_eq!(source["kind"], "primitive");
    assert_eq!(source["sourceHash"], "sha256-test");
    assert_eq!(DEFAULT_SCENE_ACTIVE_PIECE_BUDGET, 1024);
}

fn manifest(
    overflow_policy: OverflowPolicy,
    max_active_pieces: usize,
    cleanup: Option<FractureCleanup>,
) -> FractureManifest {
    FractureManifest {
        schema: "threenative.fracture-manifest".to_owned(),
        version: "0.1.0".to_owned(),
        id: "wall.fracture".to_owned(),
        source: FractureSource::Primitive {
            asset: None,
            seed: 42,
            source_hash: "sha256-test".to_owned(),
        },
        pieces: [
            ("piece.a", 0.2, 0),
            ("piece.b", 0.3, 0),
            ("piece.c", 0.5, 1),
        ]
        .into_iter()
        .map(|(id, mass_fraction, activation_depth)| FracturePiece {
            activation_depth,
            collider: FracturePieceCollider::Box {
                half_extents: [1.0, 1.0, 1.0],
            },
            id: id.to_owned(),
            local_position: [0.0, 0.0, 0.0],
            local_rotation: None,
            mass_fraction,
            source_node: None,
        })
        .collect(),
        bonds: [
            ("bond.ab", "piece.a", "piece.b"),
            ("bond.bc", "piece.b", "piece.c"),
        ]
        .into_iter()
        .map(|(id, a, b)| FractureBond {
            energy_threshold: Some(10.0),
            health: 50.0,
            id: id.to_owned(),
            impulse_threshold: 50.0,
            material_response: None,
            pieces: [a.to_owned(), b.to_owned()],
        })
        .collect(),
        budgets: FractureBudgets {
            max_active_pieces,
            max_depth: 2,
            overflow_policy,
        },
        cleanup,
    }
}

fn component() -> Destructible {
    Destructible {
        activation_budget: None,
        bond_strength: None,
        cleanup_policy: None,
        fracture_manifest: "wall.fracture".to_owned(),
        impact_filter: None,
        max_depth: None,
    }
}

fn script_damage(tick: u64, bond: &str, amount: f32) -> DestructionDamage {
    DestructionDamage {
        amount: Some(amount),
        assembly: "wall".to_owned(),
        bond: bond.to_owned(),
        cause: DestructionCause {
            contact: None,
            entity: Some("projectile".to_owned()),
            kind: DestructionCauseKind::Script,
        },
        energy: None,
        impulse: None,
        layer: None,
        tick,
    }
}

fn contact_damage(tick: u64, bond: &str, impulse: f32, layer: &str) -> DestructionDamage {
    DestructionDamage {
        amount: None,
        assembly: "wall".to_owned(),
        bond: bond.to_owned(),
        cause: DestructionCause {
            contact: Some(format!("contact.{tick}")),
            entity: Some("projectile".to_owned()),
            kind: DestructionCauseKind::Contact,
        },
        energy: None,
        impulse: Some(impulse),
        layer: Some(layer.to_owned()),
        tick,
    }
}

fn event_names(events: &[DestructionEvent]) -> Vec<&'static str> {
    events.iter().map(DestructionEvent::name).collect()
}

fn event_bonds(events: &[DestructionEvent]) -> Vec<&str> {
    events
        .iter()
        .filter_map(|event| match event {
            DestructionEvent::Damaged { bond, .. } | DestructionEvent::BondBroken { bond, .. } => {
                Some(bond.as_str())
            }
            _ => None,
        })
        .collect()
}

fn event_pieces(events: &[DestructionEvent]) -> Vec<&str> {
    events
        .iter()
        .filter_map(|event| match event {
            DestructionEvent::PieceActivated { piece, .. } => Some(piece.as_str()),
            _ => None,
        })
        .collect()
}

fn budget_pieces(events: &[DestructionEvent]) -> Vec<&str> {
    events
        .iter()
        .filter_map(|event| match event {
            DestructionEvent::BudgetExceeded { piece, .. } => Some(piece.as_str()),
            _ => None,
        })
        .collect()
}
