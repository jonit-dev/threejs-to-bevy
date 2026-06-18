use serde::Serialize;
use threenative_loader::{SceneLifecycleIr, SceneTransitionIr, ScenesIr};

#[derive(Clone, Debug)]
pub struct NativeRenderTransitionInput<'a> {
    pub elapsed_ms: u32,
    pub from: &'a str,
    pub ready_asset_groups: Vec<String>,
    pub scenes: &'a ScenesIr,
    pub timeout_ms: Option<u32>,
    pub to: &'a str,
    pub transition: Option<SceneTransitionIr>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRenderTransitionTrace {
    pub active_scene: String,
    pub diagnostics: Vec<NativeRenderTransitionDiagnostic>,
    pub frames: Vec<NativeRenderTransitionFrame>,
    pub status: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRenderTransitionFrame {
    pub alpha: f32,
    pub phase: String,
    pub scene: String,
    pub time_ms: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct NativeRenderTransitionDiagnostic {
    pub code: &'static str,
    pub message: String,
    pub path: String,
    pub severity: &'static str,
}

pub fn trace_render_transition(input: NativeRenderTransitionInput) -> NativeRenderTransitionTrace {
    let target = require_scene(input.scenes, input.to);
    let transition = input
        .transition
        .clone()
        .or_else(|| {
            target
                .transitions
                .as_ref()
                .and_then(|transitions| transitions.enter.clone())
        })
        .unwrap_or_else(|| SceneTransitionIr {
            color: None,
            duration_ms: 0,
            kind: "instant".to_owned(),
            loading_scene: None,
        });
    let mut diagnostics = validate_loading_transition(input.scenes, &transition);
    let missing_group = target
        .asset_groups
        .iter()
        .find(|group| !input.ready_asset_groups.contains(group));
    if let Some(group) = missing_group {
        diagnostics.push(NativeRenderTransitionDiagnostic {
            code: "TN_SCENE_LOADING_NOT_READY",
            message: format!(
                "Scene '{}' is waiting for asset group '{}'.",
                target.id, group
            ),
            path: format!("scenes.ir.json/scenes/{}/assetGroups", target.id),
            severity: "warning",
        });
        if input
            .timeout_ms
            .is_some_and(|timeout| input.elapsed_ms >= timeout)
        {
            diagnostics.push(NativeRenderTransitionDiagnostic {
                code: "TN_SCENE_LOADING_TIMEOUT",
                message: format!(
                    "Scene '{}' asset readiness timed out after {}ms.",
                    target.id, input.elapsed_ms
                ),
                path: format!("scenes.ir.json/scenes/{}/assetGroups", target.id),
                severity: "error",
            });
        }
        let active_scene = loading_scene(&transition).unwrap_or(input.from).to_owned();
        return NativeRenderTransitionTrace {
            active_scene: active_scene.clone(),
            diagnostics,
            frames: vec![NativeRenderTransitionFrame {
                alpha: 1.0,
                phase: "loading".to_owned(),
                scene: active_scene,
                time_ms: input.elapsed_ms,
            }],
            status: "loading".to_owned(),
        };
    }

    if transition.kind == "instant"
        || transition.duration_ms == 0
        || input.elapsed_ms >= transition.duration_ms
    {
        return NativeRenderTransitionTrace {
            active_scene: target.id.clone(),
            diagnostics,
            frames: vec![NativeRenderTransitionFrame {
                alpha: 1.0,
                phase: "complete".to_owned(),
                scene: target.id.clone(),
                time_ms: input.elapsed_ms,
            }],
            status: "complete".to_owned(),
        };
    }

    let progress = (input.elapsed_ms as f32 / transition.duration_ms as f32).clamp(0.0, 1.0);
    NativeRenderTransitionTrace {
        active_scene: input.from.to_owned(),
        diagnostics,
        frames: vec![NativeRenderTransitionFrame {
            alpha: progress,
            phase: "transitioning".to_owned(),
            scene: input.from.to_owned(),
            time_ms: input.elapsed_ms,
        }],
        status: "transitioning".to_owned(),
    }
}

fn validate_loading_transition(
    scenes: &ScenesIr,
    transition: &SceneTransitionIr,
) -> Vec<NativeRenderTransitionDiagnostic> {
    if transition.kind != "loadingScreen" {
        return Vec::new();
    }
    let Some(loading_scene) = transition.loading_scene.as_ref() else {
        return Vec::new();
    };
    if scenes.scenes.iter().any(|scene| scene.id == *loading_scene) {
        return Vec::new();
    }
    vec![NativeRenderTransitionDiagnostic {
        code: "TN_SCENE_LOADING_SCENE_MISSING",
        message: format!(
            "Loading transition references unknown scene '{}'.",
            loading_scene
        ),
        path: "scenes.ir.json/transitions/loadingScene".to_owned(),
        severity: "error",
    }]
}

fn loading_scene(transition: &SceneTransitionIr) -> Option<&str> {
    if transition.kind == "loadingScreen" {
        return transition.loading_scene.as_deref();
    }
    None
}

fn require_scene<'a>(scenes: &'a ScenesIr, id: &str) -> &'a SceneLifecycleIr {
    scenes
        .scenes
        .iter()
        .find(|scene| scene.id == id)
        .unwrap_or_else(|| panic!("Unknown scene lifecycle id '{id}'."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn completes_fade_transition_after_duration() {
        let scenes = make_scenes();
        let trace = trace_render_transition(NativeRenderTransitionInput {
            elapsed_ms: 250,
            from: "menu",
            ready_asset_groups: vec!["level.assets".to_owned()],
            scenes: &scenes,
            timeout_ms: None,
            to: "level",
            transition: None,
        });

        assert_eq!(trace.status, "complete");
        assert_eq!(trace.active_scene, "level");
    }

    #[test]
    fn blocks_level_entry_until_asset_group_ready() {
        let scenes = make_scenes();
        let trace = trace_render_transition(NativeRenderTransitionInput {
            elapsed_ms: 100,
            from: "menu",
            ready_asset_groups: Vec::new(),
            scenes: &scenes,
            timeout_ms: None,
            to: "level",
            transition: Some(SceneTransitionIr {
                color: None,
                duration_ms: 0,
                kind: "loadingScreen".to_owned(),
                loading_scene: Some("loading".to_owned()),
            }),
        });

        assert_eq!(trace.status, "loading");
        assert_eq!(trace.active_scene, "loading");
        assert_eq!(trace.diagnostics[0].code, "TN_SCENE_LOADING_NOT_READY");
    }

    fn make_scenes() -> ScenesIr {
        serde_json::from_str(
            r##"{
              "schema": "threenative.scenes",
              "version": "0.1.0",
              "initialScene": "menu",
              "scenes": [
                { "id": "menu", "kind": "menu", "activation": "exclusive" },
                { "id": "loading", "kind": "loading", "activation": "loading" },
                {
                  "id": "level",
                  "kind": "level",
                  "activation": "exclusive",
                  "assetGroups": ["level.assets"],
                  "transitions": {
                    "enter": { "kind": "fade", "durationMs": 200, "color": "#000000" }
                  }
                }
              ]
            }"##,
        )
        .expect("scene fixture should parse")
    }
}
