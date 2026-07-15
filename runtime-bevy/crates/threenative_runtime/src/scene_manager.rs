use std::collections::HashMap;

use crate::systems_effects::{NativeSystemEffects, NativeSystemServiceEffect};
use serde::Serialize;
use threenative_loader::{SceneLifecycleIr, ScenesIr};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SceneLifecycleOperation {
    Change(String),
    LoadAdditive(String),
    Pop,
    Push(String),
    Unload(String),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct SceneLifecycleTraceEvent {
    pub scene: String,
    pub phase: &'static str,
    pub reason: &'static str,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct SceneLifecycleActiveScopes {
    pub input: Vec<String>,
    pub scenes: Vec<String>,
    pub systems: Vec<String>,
    pub ui: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct SceneLifecycleRuntimeState {
    #[serde(rename = "activeScene")]
    pub active_scene: String,
    #[serde(rename = "activeScopes")]
    pub active_scopes: SceneLifecycleActiveScopes,
    #[serde(rename = "additiveScenes")]
    pub additive_scenes: Vec<String>,
    pub stack: Vec<String>,
    pub trace: Vec<SceneLifecycleTraceEvent>,
}

pub fn trace_scene_lifecycle(
    scenes: &ScenesIr,
    operations: &[SceneLifecycleOperation],
) -> SceneLifecycleRuntimeState {
    let mut manager = SceneLifecycleManager::new(scenes);
    for operation in operations {
        match operation {
            SceneLifecycleOperation::Change(scene) => manager.change(scene),
            SceneLifecycleOperation::LoadAdditive(scene) => manager.load_additive(scene),
            SceneLifecycleOperation::Pop => manager.pop(),
            SceneLifecycleOperation::Push(scene) => manager.push(scene),
            SceneLifecycleOperation::Unload(scene) => manager.unload(scene),
        }
    }
    manager.state
}

pub fn apply_scene_service_effects(
    scenes: &ScenesIr,
    effects: &NativeSystemEffects,
) -> SceneLifecycleRuntimeState {
    let mut manager = SceneLifecycleManager::new(scenes);
    for service in &effects.services {
        match service.service.as_str() {
            "scene.change" => manager.change(read_scene_service_target(service)),
            "scene.loadAdditive" => manager.load_additive(read_scene_service_target(service)),
            "scene.pop" => manager.pop(),
            "scene.push" => manager.push(read_scene_service_target(service)),
            "scene.unload" => manager.unload(read_scene_service_target(service)),
            _ => {}
        }
    }
    manager.state
}

pub struct SceneLifecycleManager<'a> {
    scenes: HashMap<&'a str, &'a SceneLifecycleIr>,
    state: SceneLifecycleRuntimeState,
}

impl<'a> SceneLifecycleManager<'a> {
    pub fn new(scenes: &'a ScenesIr) -> Self {
        let scenes_by_id: HashMap<&str, &SceneLifecycleIr> = scenes
            .scenes
            .iter()
            .map(|scene| (scene.id.as_str(), scene))
            .collect();
        let initial_scene = require_scene(&scenes_by_id, &scenes.initial_scene)
            .id
            .clone();
        let mut manager = Self {
            scenes: scenes_by_id,
            state: SceneLifecycleRuntimeState {
                active_scopes: SceneLifecycleActiveScopes::default(),
                active_scene: initial_scene.clone(),
                additive_scenes: Vec::new(),
                stack: vec![initial_scene.clone()],
                trace: Vec::new(),
            },
        };
        enter_scene(&mut manager.state.trace, &initial_scene, "initial");
        manager.refresh_active_scopes();
        manager
    }

    pub fn state(&self) -> &SceneLifecycleRuntimeState {
        &self.state
    }

    pub fn change(&mut self, scene: &str) {
        let target = require_scene(&self.scenes, scene).id.clone();
        if let Some(current) = self.state.stack.last() {
            exit_scene(&mut self.state.trace, current, "change");
        }
        self.state.stack = vec![target.clone()];
        self.state.active_scene = target.clone();
        enter_scene(&mut self.state.trace, &target, "change");
        self.refresh_active_scopes();
    }

    pub fn load_additive(&mut self, scene: &str) {
        let target = require_scene(&self.scenes, scene).id.clone();
        if !self.state.additive_scenes.contains(&target) {
            self.state.additive_scenes.push(target.clone());
            enter_scene(&mut self.state.trace, &target, "loadAdditive");
        }
        self.refresh_active_scopes();
    }

    pub fn pop(&mut self) {
        if self.state.stack.len() <= 1 {
            return;
        }
        if let Some(current) = self.state.stack.pop() {
            exit_scene(&mut self.state.trace, &current, "pop");
        }
        if let Some(resumed) = self.state.stack.last() {
            self.state.active_scene = resumed.clone();
            push_trace(&mut self.state.trace, resumed, "resume", "pop");
            push_trace(&mut self.state.trace, resumed, "active", "pop");
        }
        self.refresh_active_scopes();
    }

    pub fn push(&mut self, scene: &str) {
        let target = require_scene(&self.scenes, scene).id.clone();
        if let Some(current) = self.state.stack.last() {
            push_trace(&mut self.state.trace, current, "pause", "push");
        }
        self.state.stack.push(target.clone());
        self.state.active_scene = target.clone();
        enter_scene(&mut self.state.trace, &target, "push");
        self.refresh_active_scopes();
    }

    pub fn unload(&mut self, scene: &str) {
        let target = require_scene(&self.scenes, scene).id.clone();
        self.state
            .additive_scenes
            .retain(|scene_id| scene_id != &target);
        let initial_scene = self.state.stack.first().cloned();
        self.state
            .stack
            .retain(|scene_id| Some(scene_id) == initial_scene.as_ref() || scene_id != &target);
        if self.state.active_scene == target
            && let Some(active_scene) = self.state.stack.last()
        {
            self.state.active_scene = active_scene.clone();
        }
        exit_scene(&mut self.state.trace, &target, "unload");
        self.refresh_active_scopes();
    }

    fn refresh_active_scopes(&mut self) {
        let scene_ids = active_scene_ids(&self.state);
        let scenes = scene_ids
            .iter()
            .map(|scene| require_scene(&self.scenes, scene))
            .collect::<Vec<_>>();
        self.state.active_scopes = SceneLifecycleActiveScopes {
            input: sorted_unique(
                scenes
                    .iter()
                    .filter_map(|scene| scene.input.clone())
                    .collect::<Vec<_>>(),
            ),
            scenes: scene_ids,
            systems: sorted_unique(
                scenes
                    .iter()
                    .flat_map(|scene| scene.systems.clone())
                    .collect::<Vec<_>>(),
            ),
            ui: sorted_unique(
                scenes
                    .iter()
                    .flat_map(|scene| scene.ui.clone())
                    .collect::<Vec<_>>(),
            ),
        };
    }
}

fn active_scene_ids(state: &SceneLifecycleRuntimeState) -> Vec<String> {
    let mut scenes = vec![state.active_scene.clone()];
    scenes.extend(state.additive_scenes.clone());
    sorted_unique_preserve_first(scenes)
}

fn sorted_unique(mut values: Vec<String>) -> Vec<String> {
    values.sort();
    values.dedup();
    values
}

fn sorted_unique_preserve_first(values: Vec<String>) -> Vec<String> {
    let mut unique = Vec::new();
    for value in values {
        if !unique.contains(&value) {
            unique.push(value);
        }
    }
    unique
}

fn require_scene<'a>(
    scenes: &HashMap<&'a str, &'a SceneLifecycleIr>,
    id: &str,
) -> &'a SceneLifecycleIr {
    scenes
        .get(id)
        .copied()
        .unwrap_or_else(|| panic!("Unknown scene lifecycle id '{id}'."))
}

fn read_scene_service_target(service: &NativeSystemServiceEffect) -> &str {
    service
        .payload
        .get("request")
        .and_then(|request| request.get("scene"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or_else(|| panic!("Scene service '{}' requires a scene id.", service.service))
}

fn enter_scene(trace: &mut Vec<SceneLifecycleTraceEvent>, scene: &str, reason: &'static str) {
    push_trace(trace, scene, "preload", reason);
    push_trace(trace, scene, "enter", reason);
    push_trace(trace, scene, "active", reason);
}

fn exit_scene(trace: &mut Vec<SceneLifecycleTraceEvent>, scene: &str, reason: &'static str) {
    push_trace(trace, scene, "exit", reason);
    push_trace(trace, scene, "unload", reason);
}

fn push_trace(
    trace: &mut Vec<SceneLifecycleTraceEvent>,
    scene: &str,
    phase: &'static str,
    reason: &'static str,
) {
    trace.push(SceneLifecycleTraceEvent {
        scene: scene.to_owned(),
        phase,
        reason,
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn maps_scene_lifecycle_fixture() {
        let fixture = include_str!(
            "../../../../packages/ir/fixtures/conformance/scene-lifecycle/game.bundle/scenes.ir.json"
        );
        let scenes: ScenesIr = serde_json::from_str(fixture).expect("scene fixture should parse");
        let state = trace_scene_lifecycle(
            &scenes,
            &[
                SceneLifecycleOperation::Change("level".to_owned()),
                SceneLifecycleOperation::Push("pause".to_owned()),
                SceneLifecycleOperation::Pop,
            ],
        );

        assert_eq!(state.active_scene, "level");
        assert_eq!(
            state
                .trace
                .iter()
                .map(|event| format!("{}:{}:{}", event.scene, event.phase, event.reason))
                .collect::<Vec<_>>(),
            vec![
                "menu:preload:initial",
                "menu:enter:initial",
                "menu:active:initial",
                "menu:exit:change",
                "menu:unload:change",
                "level:preload:change",
                "level:enter:change",
                "level:active:change",
                "level:pause:push",
                "pause:preload:push",
                "pause:enter:push",
                "pause:active:push",
                "pause:exit:pop",
                "pause:unload:pop",
                "level:resume:pop",
                "level:active:pop",
            ]
        );
    }

    #[test]
    fn reports_active_scene_scopes() {
        let scenes: ScenesIr = serde_json::from_value(json!({
            "schema": "threenative.scenes",
            "version": "0.1.0",
            "initialScene": "menu",
            "scenes": [
                {
                    "activation": "exclusive",
                    "id": "menu",
                    "input": "Start",
                    "kind": "menu",
                    "systems": ["menuLoop"],
                    "ui": ["ui.menu"]
                },
                {
                    "activation": "exclusive",
                    "id": "level",
                    "input": "Move",
                    "kind": "level",
                    "systems": ["levelLoop"],
                    "ui": ["ui.level"]
                },
                {
                    "activation": "overlay",
                    "id": "pause",
                    "input": "Pause",
                    "kind": "overlay",
                    "systems": ["pauseLoop"],
                    "ui": ["ui.pause"]
                }
            ]
        }))
        .expect("scene scopes should parse");
        let state = trace_scene_lifecycle(
            &scenes,
            &[
                SceneLifecycleOperation::Change("level".to_owned()),
                SceneLifecycleOperation::LoadAdditive("pause".to_owned()),
            ],
        );

        assert_eq!(state.active_scopes.scenes, vec!["level", "pause"]);
        assert_eq!(state.active_scopes.input, vec!["Move", "Pause"]);
        assert_eq!(state.active_scopes.systems, vec!["levelLoop", "pauseLoop"]);
        assert_eq!(state.active_scopes.ui, vec!["ui.level", "ui.pause"]);
    }
}
