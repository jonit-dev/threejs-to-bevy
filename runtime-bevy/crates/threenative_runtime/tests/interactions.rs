mod support;

use serde_json::json;
use threenative_loader::{InteractionIr, InteractionsIr};
use threenative_runtime::interactions::{
    NativeInteractionDiagnostic, NativeInteractionRuntimeState, step_bundle_interactions,
};
use threenative_runtime::systems_effects::NativeRuntimeWriteLedger;

#[test]
fn native_interactions_should_match_pickup_dedup_and_completion_trace() {
    let mut fixture = support::load_conformance_fixture("physics-events");
    fixture
        .bundle
        .world
        .resources
        .insert("Score".into(), json!({ "value": 0 }));
    fixture.bundle.interactions = Some(InteractionsIr {
        schema: "threenative.interactions".into(),
        version: "0.1.0".into(),
        id: "fixture".into(),
        interactions: vec![InteractionIr {
            id: "pickup".into(),
            detector: json!({ "kind": "distance2d", "radius": 1, "source": { "entity": "sensor" }, "target": { "entity": "pickup" } }),
            gate: json!({ "kind": "once-per-target" }),
            when: vec![],
            effects: vec![
                json!({ "kind": "addResource", "resource": "Score", "field": "value", "value": 1 }),
                json!({ "kind": "despawn", "target": "detected" }),
            ],
            complete: Some(
                json!({ "when": { "resource": "Score", "field": "value", "gte": 1 }, "event": "match.win" }),
            ),
        }],
    });
    let mut state = NativeInteractionRuntimeState::default();
    let first = step_bundle_interactions(&mut fixture.bundle, 0, &[], &mut state, None, None);
    let second = step_bundle_interactions(&mut fixture.bundle, 0, &[], &mut state, None, None);
    assert_eq!(
        fixture.bundle.world.resources["Score"],
        json!({ "value": 1.0 })
    );
    assert!(
        !fixture
            .bundle
            .world
            .entities
            .iter()
            .any(|entity| entity.id == "pickup")
    );
    assert_eq!(fixture.bundle.world.events["match.win"], json!([{}]));
    assert_eq!(first[0].interaction, "pickup");
    assert_eq!(first[0].effects, vec!["addResource", "despawn"]);
    assert!(first[0].completion);
    assert!(second.is_empty());
}

#[test]
fn native_interactions_should_sort_checkpoint_and_projectile_event_traces() {
    let mut fixture = support::load_conformance_fixture("physics-events");
    fixture.bundle.world.events.insert(
        "hit".into(),
        json!([{ "source": "player", "target": "enemy" }]),
    );
    fixture.bundle.interactions = Some(InteractionsIr {
        schema: "threenative.interactions".into(),
        version: "0.1.0".into(),
        id: "fixture".into(),
        interactions: vec![
            InteractionIr {
                id: "projectile".into(),
                detector: json!({ "kind": "ray-hit", "event": "hit", "source": { "entity": "player" }, "target": { "entity": "enemy" } }),
                gate: json!({ "kind": "once" }),
                when: vec![],
                effects: vec![json!({ "kind": "despawn", "target": "detected" })],
                complete: None,
            },
            InteractionIr {
                id: "checkpoint".into(),
                detector: json!({ "kind": "event", "event": "hit", "source": { "entity": "player" }, "target": { "entity": "enemy" } }),
                gate: json!({ "kind": "once" }),
                when: vec![],
                effects: vec![json!({ "kind": "emitEvent", "event": "checkpoint.hit" })],
                complete: None,
            },
        ],
    });
    let traces = step_bundle_interactions(
        &mut fixture.bundle,
        4,
        &[],
        &mut NativeInteractionRuntimeState::default(),
        None,
        None,
    );
    assert_eq!(
        traces
            .iter()
            .map(|trace| trace.interaction.as_str())
            .collect::<Vec<_>>(),
        vec!["checkpoint", "projectile"]
    );
}

fn interaction(
    id: &str,
    detector: serde_json::Value,
    effects: Vec<serde_json::Value>,
) -> InteractionsIr {
    InteractionsIr {
        schema: "threenative.interactions".into(),
        version: "0.1.0".into(),
        id: "residual".into(),
        interactions: vec![InteractionIr {
            id: id.into(),
            detector,
            gate: json!({ "kind": "once" }),
            when: vec![],
            effects,
            complete: None,
        }],
    }
}

#[test]
fn should_use_collider_extents_for_overlap_boundaries() {
    let mut fixture = support::load_conformance_fixture("physics-events");
    let player = fixture
        .bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "player")
        .unwrap();
    player.components.collider.as_mut().unwrap().size = Some([4.0, 2.0, 2.0]);
    let enemy = fixture
        .bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "enemy")
        .unwrap();
    enemy.components.collider.as_mut().unwrap().size = Some([2.0, 2.0, 2.0]);
    enemy.components.transform.as_mut().unwrap().position = Some([3.5, 0.0, 0.0]);
    fixture.bundle.interactions = Some(interaction(
        "boundary",
        json!({ "kind": "overlap", "source": { "entity": "player" }, "target": { "entity": "enemy" } }),
        vec![json!({ "kind": "setResource", "resource": "Score", "field": "value", "value": 1 })],
    ));
    assert_eq!(
        step_bundle_interactions(
            &mut fixture.bundle,
            0,
            &[],
            &mut Default::default(),
            None,
            None
        )
        .len(),
        1
    );
    fixture
        .bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "enemy")
        .unwrap()
        .components
        .transform
        .as_mut()
        .unwrap()
        .position = Some([3.51, 0.0, 0.0]);
    assert!(
        step_bundle_interactions(
            &mut fixture.bundle,
            0,
            &[],
            &mut Default::default(),
            None,
            None
        )
        .is_empty()
    );
}

#[test]
fn should_evaluate_a_predicate_against_a_typed_component() {
    let mut fixture = support::load_conformance_fixture("physics-events");
    let mut interactions = interaction(
        "typed-predicate",
        json!({ "kind": "distance3d", "radius": 2, "source": { "entity": "player" }, "target": { "entity": "enemy" } }),
        vec![json!({ "kind": "setResource", "resource": "Score", "field": "value", "value": 7 })],
    );
    interactions.interactions[0].when = vec![
        json!({ "target": "source", "component": "Collider", "field": "kind", "equals": "box" }),
    ];
    fixture.bundle.interactions = Some(interactions);
    step_bundle_interactions(
        &mut fixture.bundle,
        0,
        &[],
        &mut Default::default(),
        None,
        None,
    );
    assert_eq!(
        fixture.bundle.world.resources["Score"],
        json!({ "value": 7.0 })
    );
}

#[test]
fn should_patch_a_typed_component_without_creating_a_shadow_extra_component() {
    let mut fixture = support::load_conformance_fixture("physics-events");
    fixture.bundle.interactions = Some(interaction(
        "typed-patch",
        json!({ "kind": "distance3d", "radius": 2, "source": { "entity": "player" }, "target": { "entity": "enemy" } }),
        vec![
            json!({ "kind": "patchComponent", "target": "source", "component": "Transform", "patch": { "position": [5, 6, 7] } }),
        ],
    ));
    step_bundle_interactions(
        &mut fixture.bundle,
        0,
        &[],
        &mut Default::default(),
        None,
        None,
    );
    let components = &fixture
        .bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == "player")
        .unwrap()
        .components;
    assert_eq!(
        components.transform.as_ref().unwrap().position,
        Some([5.0, 6.0, 7.0])
    );
    assert!(!components.extra.contains_key("Transform"));
}

#[test]
fn should_preserve_quaternion_rotation_in_set_transform() {
    let mut fixture = support::load_conformance_fixture("physics-events");
    fixture.bundle.interactions = Some(interaction(
        "rotation",
        json!({ "kind": "distance3d", "radius": 2, "source": { "entity": "player" }, "target": { "entity": "enemy" } }),
        vec![
            json!({ "kind": "setTransform", "target": "source", "rotation": [0, 0.70710677, 0, 0.70710677] }),
        ],
    ));
    step_bundle_interactions(
        &mut fixture.bundle,
        0,
        &[],
        &mut Default::default(),
        None,
        None,
    );
    let rotation = fixture
        .bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == "player")
        .unwrap()
        .components
        .transform
        .as_ref()
        .unwrap()
        .rotation;
    assert_eq!(rotation, Some([0.0, 0.70710677, 0.0, 0.70710677]));
}

#[test]
fn should_reject_an_invalid_typed_component_patch_without_consuming_the_gate() {
    let mut fixture = support::load_conformance_fixture("physics-events");
    fixture.bundle.interactions = Some(interaction(
        "invalid-patch",
        json!({ "kind": "distance3d", "radius": 2, "source": { "entity": "player" }, "target": { "entity": "enemy" } }),
        vec![
            json!({ "kind": "patchComponent", "target": "source", "component": "Collider", "patch": { "size": "invalid" } }),
        ],
    ));
    fixture.bundle.interactions.as_mut().unwrap().interactions[0].complete = Some(
        json!({ "when": { "resource": "Score", "field": "value", "gte": 0 }, "event": "invalid.completed" }),
    );
    let mut state = NativeInteractionRuntimeState::default();
    let rejected = step_bundle_interactions(&mut fixture.bundle, 0, &[], &mut state, None, None);
    assert!(rejected[0].effects.is_empty());
    assert!(!rejected[0].completion);
    assert!(
        !fixture
            .bundle
            .world
            .events
            .contains_key("invalid.completed")
    );
    assert_eq!(
        state.diagnostics,
        vec![NativeInteractionDiagnostic {
            code: "TN_INTERACTION_COMPONENT_PATCH_INVALID",
            message: "Interaction 'invalid-patch' could not patch component 'Collider' on entity 'player': typed component 'Collider' patch is invalid: invalid type: string \"invalid\", expected an array of length 3.".into(),
            path: "interactions/invalid-patch/effects/0".into(),
            severity: "error",
            suggestion: "Patch only declared fields with values matching the 'Collider' component shape.".into(),
        }]
    );
    assert_eq!(
        fixture
            .bundle
            .world
            .entities
            .iter()
            .find(|entity| entity.id == "player")
            .unwrap()
            .components
            .collider
            .as_ref()
            .unwrap()
            .size,
        Some([1.0; 3])
    );

    fixture.bundle.interactions.as_mut().unwrap().interactions[0].effects = vec![
        json!({ "kind": "patchComponent", "target": "source", "component": "Collider", "patch": { "size": [2, 2, 2] } }),
    ];
    let retried = step_bundle_interactions(&mut fixture.bundle, 1, &[], &mut state, None, None);
    assert_eq!(retried[0].effects, vec!["patchComponent"]);
    assert!(retried[0].completion);
}

#[test]
fn should_read_and_patch_a_custom_component_through_the_shared_seam() {
    let mut fixture = support::load_conformance_fixture("physics-events");
    fixture
        .bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "player")
        .unwrap()
        .components
        .extra
        .insert("Health".into(), json!({ "value": 3 }));
    let mut interactions = interaction(
        "custom-component",
        json!({ "kind": "distance3d", "radius": 2, "source": { "entity": "player" }, "target": { "entity": "enemy" } }),
        vec![
            json!({ "kind": "patchComponent", "target": "source", "component": "Health", "patch": { "value": 2 } }),
        ],
    );
    interactions.interactions[0].when =
        vec![json!({ "target": "source", "component": "Health", "field": "value", "equals": 3 })];
    fixture.bundle.interactions = Some(interactions);
    let traces = step_bundle_interactions(
        &mut fixture.bundle,
        0,
        &[],
        &mut Default::default(),
        None,
        None,
    );
    assert_eq!(traces[0].effects, vec!["patchComponent"]);
    assert_eq!(
        fixture
            .bundle
            .world
            .entities
            .iter()
            .find(|entity| entity.id == "player")
            .unwrap()
            .components
            .extra["Health"],
        json!({ "value": 2 })
    );
}

#[test]
fn should_record_typed_transform_writes_in_the_interaction_ledger() {
    let mut fixture = support::load_conformance_fixture("physics-events");
    fixture.bundle.interactions = Some(interaction(
        "ledger",
        json!({ "kind": "distance3d", "radius": 2, "source": { "entity": "player" }, "target": { "entity": "enemy" } }),
        vec![
            json!({ "kind": "setTransform", "target": "source", "position": [2, 3, 4], "rotation": [0, 0, 0, 1], "scale": [2, 2, 2] }),
        ],
    ));
    let mut ledger = NativeRuntimeWriteLedger::default();
    step_bundle_interactions(
        &mut fixture.bundle,
        3,
        &[],
        &mut Default::default(),
        None,
        Some(&mut ledger),
    );
    assert_eq!(
        ledger
            .observations()
            .iter()
            .map(|item| item.path.as_str())
            .collect::<Vec<_>>(),
        vec![
            "Transform/position",
            "Transform/rotation",
            "Transform/scale"
        ]
    );
}
