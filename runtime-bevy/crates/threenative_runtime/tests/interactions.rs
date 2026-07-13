mod support;

use serde_json::json;
use threenative_loader::{InteractionIr, InteractionsIr};
use threenative_runtime::interactions::{NativeInteractionRuntimeState, step_bundle_interactions};

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
