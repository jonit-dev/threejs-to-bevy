use serde::Serialize;
use serde_json::Value;
use threenative_loader::{AssetIr, LoadedBundle, MorphKeyframeIr};

use crate::{
    animation::{sample_transform_animations, TransformAnimationSample},
    character::{trace_character_controllers, CharacterTraceAxis, CharacterTraceObservation},
    navigation::{trace_navigation_paths, NavigationPathResult},
    physics::{
        trace_physics_joints, trace_rigid_body_primitives, PhysicsJointObservation,
        RigidBodyTraceObservation,
    },
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationPhysicsResidualReport {
    pub animation: AnimationResidualReport,
    pub navigation: NavigationResidualReport,
    pub physics: PhysicsResidualReport,
    pub schema: String,
    pub version: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationResidualReport {
    pub masks: Vec<AnimationMaskObservation>,
    pub morph_targets: Vec<MorphTargetObservation>,
    pub property_samples: Vec<TransformAnimationSample>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationMaskObservation {
    pub asset: String,
    pub clips: Vec<String>,
    pub id: String,
    pub joints: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MorphTargetObservation {
    pub asset: String,
    pub clip: String,
    pub target: String,
    pub time_seconds: f32,
    pub weight: f32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicsResidualReport {
    pub character_grounding: Vec<CharacterTraceObservation>,
    pub joints: Vec<PhysicsJointObservation>,
    pub solver: Vec<RigidBodyTraceObservation>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NavigationResidualReport {
    pub crowd: Vec<CrowdObservation>,
    pub off_mesh_links: Vec<OffMeshLinkObservation>,
    pub paths: Vec<NavigationPathResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rebake: Option<RebakeObservation>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OffMeshLinkObservation {
    pub from: String,
    pub id: String,
    pub status: String,
    pub to: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrowdObservation {
    pub agent: String,
    pub goal: [f32; 3],
    pub position: [f32; 3],
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RebakeObservation {
    pub interval_ms: u64,
    pub max_obstacles: u64,
    pub max_regions: u64,
    pub status: String,
}

pub fn trace_animation_physics_residuals(bundle: &LoadedBundle) -> AnimationPhysicsResidualReport {
    AnimationPhysicsResidualReport {
        animation: AnimationResidualReport {
            masks: trace_animation_masks(bundle),
            morph_targets: trace_morph_targets(bundle, 0.5),
            property_samples: sample_transform_animations(bundle, 1.0),
        },
        navigation: trace_navigation_residuals(bundle),
        physics: PhysicsResidualReport {
            character_grounding: trace_character_controllers(
                bundle,
                &[
                    CharacterTraceAxis {
                        id: "MoveX",
                        value: 1.0,
                    },
                    CharacterTraceAxis {
                        id: "MoveZ",
                        value: 0.0,
                    },
                ],
                1.0,
            ),
            joints: trace_physics_joints(bundle),
            solver: trace_rigid_body_primitives(bundle, 4, 0.25),
        },
        schema: "threenative.animation-physics-residuals".to_owned(),
        version: "0.1.0".to_owned(),
    }
}

fn trace_animation_masks(bundle: &LoadedBundle) -> Vec<AnimationMaskObservation> {
    let mut observations = bundle
        .assets
        .assets
        .iter()
        .filter(|asset| asset.kind == "model")
        .flat_map(|asset| {
            asset.masks.as_deref().unwrap_or(&[]).iter().map(|mask| {
                let mut clips = asset
                    .animations
                    .as_deref()
                    .unwrap_or(&[])
                    .iter()
                    .filter(|clip| clip.mask.as_deref() == Some(mask.id.as_str()))
                    .map(|clip| clip.id.clone())
                    .collect::<Vec<_>>();
                clips.sort();
                let mut joints = mask.joints.clone();
                joints.sort();
                AnimationMaskObservation {
                    asset: asset.id.clone(),
                    clips,
                    id: mask.id.clone(),
                    joints,
                }
            })
        })
        .collect::<Vec<_>>();
    observations.sort_by(|left, right| left.asset.cmp(&right.asset).then(left.id.cmp(&right.id)));
    observations
}

fn trace_morph_targets(bundle: &LoadedBundle, time_seconds: f32) -> Vec<MorphTargetObservation> {
    let mut observations = bundle
        .assets
        .assets
        .iter()
        .filter(|asset| asset.kind == "model")
        .flat_map(|asset| morph_observations_for_asset(asset, time_seconds))
        .collect::<Vec<_>>();
    observations.sort_by(|left, right| {
        left.asset
            .cmp(&right.asset)
            .then(left.clip.cmp(&right.clip))
            .then(left.target.cmp(&right.target))
    });
    observations
}

fn morph_observations_for_asset(asset: &AssetIr, time_seconds: f32) -> Vec<MorphTargetObservation> {
    asset
        .morph_clips
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .map(|clip| MorphTargetObservation {
            asset: asset.id.clone(),
            clip: clip.id.clone(),
            target: clip.target.clone(),
            time_seconds: round(sample_time(&clip.keyframes, time_seconds)),
            weight: sample_weight(&clip.keyframes, time_seconds),
        })
        .collect()
}

fn trace_navigation_residuals(bundle: &LoadedBundle) -> NavigationResidualReport {
    let navigation = bundle.world.resources.get("Navigation");
    NavigationResidualReport {
        crowd: trace_crowd(navigation.and_then(|value| value.get("crowd"))),
        off_mesh_links: trace_off_mesh_links(
            navigation.and_then(|value| value.get("offMeshLinks")),
        ),
        paths: trace_navigation_paths(bundle),
        rebake: navigation
            .and_then(|value| value.get("dynamicRebake"))
            .map(trace_rebake),
    }
}

fn trace_off_mesh_links(value: Option<&Value>) -> Vec<OffMeshLinkObservation> {
    let mut links = value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|link| OffMeshLinkObservation {
            from: string_field(link, "from"),
            id: string_field(link, "id"),
            status: "traversed".to_owned(),
            to: string_field(link, "to"),
        })
        .collect::<Vec<_>>();
    links.sort_by(|left, right| left.id.cmp(&right.id));
    links
}

fn trace_crowd(value: Option<&Value>) -> Vec<CrowdObservation> {
    let separation = value
        .and_then(|crowd| crowd.get("separationRadius"))
        .and_then(Value::as_f64)
        .unwrap_or(0.0) as f32;
    let mut agents = value
        .and_then(|crowd| crowd.get("agents"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .enumerate()
        .map(|(index, agent)| {
            let mut position = vec3_field(agent, "position");
            position[0] = round(position[0] + separation * index as f32);
            CrowdObservation {
                agent: string_field(agent, "id"),
                goal: vec3_field(agent, "goal"),
                position,
            }
        })
        .collect::<Vec<_>>();
    agents.sort_by(|left, right| left.agent.cmp(&right.agent));
    agents
}

fn trace_rebake(value: &Value) -> RebakeObservation {
    RebakeObservation {
        interval_ms: value.get("intervalMs").and_then(Value::as_u64).unwrap_or(0),
        max_obstacles: value
            .get("maxObstacles")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        max_regions: value.get("maxRegions").and_then(Value::as_u64).unwrap_or(0),
        status: "bounded".to_owned(),
    }
}

fn sample_time(keyframes: &[MorphKeyframeIr], time_seconds: f32) -> f32 {
    let last = keyframes
        .last()
        .map_or(0.0, |keyframe| keyframe.time_seconds);
    time_seconds.clamp(0.0, last)
}

fn sample_weight(keyframes: &[MorphKeyframeIr], time_seconds: f32) -> f32 {
    let clamped = sample_time(keyframes, time_seconds);
    let Some(first) = keyframes.first() else {
        return 0.0;
    };
    let Some(last) = keyframes.last() else {
        return 0.0;
    };
    if clamped <= first.time_seconds {
        return round(first.weight);
    }
    if clamped >= last.time_seconds {
        return round(last.weight);
    }
    let next_index = keyframes
        .iter()
        .position(|keyframe| keyframe.time_seconds >= clamped)
        .unwrap_or(keyframes.len() - 1);
    let next = &keyframes[next_index];
    let previous = &keyframes[next_index.saturating_sub(1)];
    let alpha = (clamped - previous.time_seconds) / (next.time_seconds - previous.time_seconds);
    round(previous.weight + (next.weight - previous.weight) * alpha)
}

fn string_field(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned()
}

fn vec3_field(value: &Value, key: &str) -> [f32; 3] {
    let Some(items) = value.get(key).and_then(Value::as_array) else {
        return [0.0, 0.0, 0.0];
    };
    [
        items.first().and_then(Value::as_f64).unwrap_or(0.0) as f32,
        items.get(1).and_then(Value::as_f64).unwrap_or(0.0) as f32,
        items.get(2).and_then(Value::as_f64).unwrap_or(0.0) as f32,
    ]
}

fn round(value: f32) -> f32 {
    (value * 1_000_000.0).round() / 1_000_000.0
}
