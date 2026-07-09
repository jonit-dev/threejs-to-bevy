use std::collections::BTreeMap;

use serde::Serialize;
use serde_json::Value;
use threenative_loader::{
    AnimationGraphIr, AnimationGraphStateIr, AnimationGraphTransitionIr, LoadedBundle,
    ParticleEmitterIr, TransformAnimationTrackIr,
};

#[derive(Clone, Debug, Default)]
pub struct AnimationTraceInput {
    pub fixed_delta: f32,
    pub parameters: BTreeMap<String, Value>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationTraceObservation {
    pub active_state: String,
    pub asset: String,
    pub clip: String,
    pub events: Vec<AnimationEventObservation>,
    pub initial_state: String,
    pub parameters: BTreeMap<String, Value>,
    pub particles: Vec<ParticleTraceObservation>,
    pub queued_events: Vec<AnimationQueuedEventObservation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transition: Option<AnimationTransitionObservation>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationTransitionObservation {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blend_seconds: Option<f32>,
    pub from: String,
    pub to: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationEventObservation {
    pub at_seconds: f32,
    pub event: String,
    pub state: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationQueuedEventObservation {
    pub event: String,
    pub payload: AnimationQueuedEventPayload,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationQueuedEventPayload {
    pub asset: String,
    pub at_seconds: f32,
    pub clip: String,
    pub state: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticleTraceObservation {
    pub id: String,
    pub lifetime_seconds: f32,
    pub max_particles: u32,
    pub shape: String,
    pub spawned: u32,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformAnimationSample {
    pub channel: String,
    pub clip: String,
    pub target: String,
    pub time_seconds: f32,
    pub value: Vec<f32>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationRuntimeState {
    pub active: bool,
    pub active_state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blend: Option<AnimationRuntimeBlendState>,
    pub clip: String,
    pub entity: String,
    pub loop_: bool,
    pub normalized_time: f32,
    pub source_clip: String,
    pub speed: f32,
    pub stopped: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_reason: Option<String>,
    pub time_seconds: f32,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationRuntimeBlendState {
    pub complete: bool,
    pub duration_seconds: f32,
    pub elapsed_seconds: f32,
    pub from_clip: String,
    pub from_weight: f32,
    pub to_clip: String,
    pub to_weight: f32,
}

#[derive(Clone, Debug, Default)]
pub struct AnimationRuntimePlayOptions {
    pub active_state: Option<String>,
    pub blend_elapsed_seconds: Option<f32>,
    pub blend_seconds: Option<f32>,
    pub duration_seconds: Option<f32>,
    pub loop_: Option<bool>,
    pub source_clip: Option<String>,
    pub speed: Option<f32>,
}

#[derive(Clone, Debug)]
struct AnimationRuntimeStateRecord {
    active: bool,
    active_state: String,
    blend: Option<AnimationRuntimeBlendState>,
    clip: String,
    duration_seconds: f32,
    entity: String,
    loop_: bool,
    source_clip: String,
    speed: f32,
    stopped: bool,
    stop_reason: Option<String>,
    time_seconds: f32,
}

#[derive(Clone, Debug, Default)]
pub struct AnimationRuntimeController {
    states: BTreeMap<String, AnimationRuntimeStateRecord>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticleRuntimeCommandResult {
    pub accepted: bool,
    pub active: bool,
    pub asset: String,
    pub command: String,
    pub count: u32,
    pub emitter: String,
    pub max_particles: u32,
    pub seed: u32,
    pub status: String,
}

#[derive(Clone, Debug)]
struct ParticleRuntimeEmitterRecord {
    lifetime_seconds: f32,
    max_particles: u32,
    rate_per_second: f32,
}

#[derive(Clone, Debug)]
struct ParticleRuntimeStateRecord {
    age_seconds: f32,
    emitter: ParticleRuntimeEmitterRecord,
    expires: bool,
    result: ParticleRuntimeCommandResult,
}

#[derive(Clone, Debug, Default)]
pub struct ParticleRuntimeController {
    active: BTreeMap<String, ParticleRuntimeStateRecord>,
    emitters: BTreeMap<String, ParticleRuntimeEmitterRecord>,
}

impl AnimationRuntimeController {
    pub fn play(
        &mut self,
        entity: impl Into<String>,
        clip: impl Into<String>,
        options: AnimationRuntimePlayOptions,
    ) -> AnimationRuntimeState {
        let entity = entity.into();
        let clip = clip.into();
        let duration_seconds = positive_number(options.duration_seconds, 1.0);
        let blend_seconds = positive_number(options.blend_seconds, 0.0);
        let blend_elapsed_seconds = non_negative_number(options.blend_elapsed_seconds, 0.0);
        let blend = self
            .states
            .get(&entity)
            .filter(|previous| previous.active && previous.clip != clip && blend_seconds > 0.0)
            .map(|previous| {
                create_blend_state(&previous.clip, &clip, blend_seconds, blend_elapsed_seconds)
            });
        let state = AnimationRuntimeStateRecord {
            active: true,
            active_state: options.active_state.unwrap_or_else(|| clip.clone()),
            blend,
            clip: clip.clone(),
            duration_seconds,
            entity: entity.clone(),
            loop_: options.loop_.unwrap_or(true),
            source_clip: options.source_clip.unwrap_or_else(|| clip.clone()),
            speed: positive_number(options.speed, 1.0),
            stopped: false,
            stop_reason: None,
            time_seconds: 0.0,
        };
        self.states.insert(entity, state.clone());
        serialize_runtime_state(&state)
    }

    pub fn query(&self, entity: &str, clip: Option<&str>) -> AnimationRuntimeState {
        let Some(state) = self.states.get(entity) else {
            return stopped_runtime_state(entity, clip, Some("not-found"));
        };
        if clip.is_some_and(|clip| state.clip != clip) {
            return stopped_runtime_state(entity, clip, Some("not-found"));
        }
        serialize_runtime_state(state)
    }

    pub fn stop(&mut self, entity: &str, clip: Option<&str>) -> AnimationRuntimeState {
        let Some(state) = self.states.get(entity) else {
            let stopped = stopped_runtime_state(entity, clip, Some("requested"));
            self.states.insert(
                entity.to_owned(),
                AnimationRuntimeStateRecord {
                    active: stopped.active,
                    active_state: stopped.active_state.clone(),
                    blend: stopped.blend.clone(),
                    clip: stopped.clip.clone(),
                    duration_seconds: 1.0,
                    entity: stopped.entity.clone(),
                    loop_: stopped.loop_,
                    source_clip: stopped.source_clip.clone(),
                    speed: stopped.speed,
                    stopped: stopped.stopped,
                    stop_reason: stopped.stop_reason.clone(),
                    time_seconds: stopped.time_seconds,
                },
            );
            return stopped;
        };
        if clip.is_some_and(|clip| state.clip != clip) {
            return stopped_runtime_state(entity, clip, Some("requested"));
        }
        let mut stopped = state.clone();
        stopped.active = false;
        stopped.blend = None;
        stopped.stopped = true;
        stopped.stop_reason = Some("requested".to_owned());
        self.states.insert(entity.to_owned(), stopped.clone());
        serialize_runtime_state(&stopped)
    }

    pub fn advance(&mut self, delta_seconds: f32) {
        if !delta_seconds.is_finite() || delta_seconds <= 0.0 {
            return;
        }
        for state in self.states.values_mut() {
            if state.active {
                state.blend = advance_blend(state.blend.as_ref(), delta_seconds);
                state.time_seconds += delta_seconds * state.speed;
            }
        }
    }
}

impl ParticleRuntimeController {
    pub fn from_bundle(bundle: &LoadedBundle) -> Self {
        let mut emitters = BTreeMap::new();
        for asset in &bundle.assets.assets {
            for emitter in asset.particle_emitters.as_deref().unwrap_or(&[]) {
                emitters.insert(
                    format!("{}/{}", asset.id, emitter.id),
                    ParticleRuntimeEmitterRecord {
                        lifetime_seconds: emitter.lifetime_seconds,
                        max_particles: emitter.max_particles,
                        rate_per_second: emitter.rate_per_second,
                    },
                );
            }
        }
        Self {
            active: BTreeMap::new(),
            emitters,
        }
    }

    pub fn execute(
        &mut self,
        command: &str,
        asset: &str,
        emitter: &str,
        count: Option<u32>,
        seed: Option<&str>,
    ) -> ParticleRuntimeCommandResult {
        let key = format!("{asset}/{emitter}");
        let seed = particle_seed(seed.unwrap_or(&format!("{key}/{command}")));
        let Some(declaration) = self.emitters.get(&key).cloned() else {
            return ParticleRuntimeCommandResult {
                accepted: false,
                active: false,
                asset: asset.to_owned(),
                command: command.to_owned(),
                count: 0,
                emitter: emitter.to_owned(),
                max_particles: 0,
                seed,
                status: "missing-emitter".to_owned(),
            };
        };
        let requested = if particle_command_clears(command) {
            0
        } else {
            count.unwrap_or_else(|| {
                (declaration.rate_per_second * declaration.lifetime_seconds)
                    .floor()
                    .max(1.0) as u32
            })
        };
        let result = ParticleRuntimeCommandResult {
            accepted: true,
            active: particle_command_activates(command),
            asset: asset.to_owned(),
            command: command.to_owned(),
            count: requested.min(declaration.max_particles),
            emitter: emitter.to_owned(),
            max_particles: declaration.max_particles,
            seed,
            status: particle_command_status(command).to_owned(),
        };
        if particle_command_clears(command) {
            self.active.remove(&key);
        } else {
            self.active.insert(
                key,
                ParticleRuntimeStateRecord {
                    age_seconds: 0.0,
                    emitter: declaration,
                    expires: command == "burst" || command == "emit",
                    result: result.clone(),
                },
            );
        }
        result
    }

    pub fn advance_fixed_ticks(
        &mut self,
        ticks: u32,
        fixed_delta: f32,
    ) -> Vec<ParticleRuntimeCommandResult> {
        if ticks == 0 || !fixed_delta.is_finite() || fixed_delta <= 0.0 {
            return self.snapshot();
        }
        for state in self.active.values_mut() {
            state.age_seconds += ticks as f32 * fixed_delta;
            if state.expires && state.age_seconds >= state.emitter.lifetime_seconds {
                state.result.active = false;
                state.result.count = 0;
            }
        }
        self.snapshot()
    }

    pub fn snapshot(&self) -> Vec<ParticleRuntimeCommandResult> {
        self.active
            .values()
            .map(|state| state.result.clone())
            .collect()
    }
}

fn particle_command_activates(command: &str) -> bool {
    matches!(command, "start" | "play" | "burst" | "emit")
}

fn particle_command_clears(command: &str) -> bool {
    matches!(command, "stop" | "reset" | "clear")
}

fn particle_command_status(command: &str) -> &str {
    match command {
        "clear" => "cleared",
        "emit" => "emitted",
        "play" => "played",
        "start" => "started",
        "stop" => "stopped",
        other => other,
    }
}

fn particle_seed(value: &str) -> u32 {
    if let Ok(number) = value.parse::<f64>() {
        if number.is_finite() {
            return number.abs().floor() as u32;
        }
    }
    let mut hash = 2166136261_u32;
    for byte in value.as_bytes() {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(16777619);
    }
    hash
}

pub fn trace_animation_graphs(
    bundle: &LoadedBundle,
    input: &AnimationTraceInput,
) -> Vec<AnimationTraceObservation> {
    let fixed_delta = if input.fixed_delta == 0.0 {
        1.0
    } else {
        input.fixed_delta
    };
    let mut observations = bundle
        .assets
        .assets
        .iter()
        .filter_map(|asset| {
            let graph = asset.animation_graph.as_ref()?;
            Some(trace_asset_animation(
                &asset.id,
                graph,
                asset.particle_emitters.as_deref().unwrap_or(&[]),
                &input.parameters,
                fixed_delta,
            ))
        })
        .collect::<Vec<_>>();
    observations.sort_by(|left, right| left.asset.cmp(&right.asset));
    observations
}

pub fn sample_transform_animations(
    bundle: &LoadedBundle,
    time_seconds: f32,
) -> Vec<TransformAnimationSample> {
    let Some(animations) = bundle.animations.as_ref() else {
        return Vec::new();
    };
    let mut samples = animations
        .transform_clips
        .iter()
        .flat_map(|clip| {
            clip.tracks.iter().map(move |track| {
                let last_time = track
                    .keyframes
                    .last()
                    .map_or(0.0, |keyframe| keyframe.time_seconds);
                let sample_time = if clip.loop_.as_deref() == Some("repeat") && last_time > 0.0 {
                    time_seconds % last_time
                } else {
                    time_seconds.min(last_time)
                };
                TransformAnimationSample {
                    channel: track.channel.clone(),
                    clip: clip.id.clone(),
                    target: track.target.clone(),
                    time_seconds: round(sample_time),
                    value: sample_track(track, sample_time),
                }
            })
        })
        .collect::<Vec<_>>();
    samples.sort_by(|left, right| {
        left.clip
            .cmp(&right.clip)
            .then(left.target.cmp(&right.target))
            .then(left.channel.cmp(&right.channel))
    });
    samples
}

fn sample_track(track: &TransformAnimationTrackIr, time_seconds: f32) -> Vec<f32> {
    let Some(first) = track.keyframes.first() else {
        return Vec::new();
    };
    let Some(last) = track.keyframes.last() else {
        return Vec::new();
    };
    if time_seconds <= first.time_seconds {
        return first.value.iter().map(|value| round(*value)).collect();
    }
    if time_seconds >= last.time_seconds {
        return last.value.iter().map(|value| round(*value)).collect();
    }
    let next_index = track
        .keyframes
        .iter()
        .position(|keyframe| keyframe.time_seconds >= time_seconds)
        .unwrap_or(track.keyframes.len() - 1);
    let next = &track.keyframes[next_index];
    let previous = &track.keyframes[next_index.saturating_sub(1)];
    if track.easing.as_deref() == Some("step") || next.time_seconds == previous.time_seconds {
        return previous.value.iter().map(|value| round(*value)).collect();
    }
    let alpha =
        (time_seconds - previous.time_seconds) / (next.time_seconds - previous.time_seconds);
    previous
        .value
        .iter()
        .enumerate()
        .map(|(index, value)| {
            let next_value = next.value.get(index).copied().unwrap_or(*value);
            round(value + (next_value - value) * alpha)
        })
        .collect()
}

fn round(value: f32) -> f32 {
    (value * 1_000_000.0).round() / 1_000_000.0
}

fn serialize_runtime_state(state: &AnimationRuntimeStateRecord) -> AnimationRuntimeState {
    AnimationRuntimeState {
        active: state.active,
        active_state: state.active_state.clone(),
        blend: state.blend.clone(),
        clip: state.clip.clone(),
        entity: state.entity.clone(),
        loop_: state.loop_,
        normalized_time: normalized_animation_time(
            state.time_seconds,
            state.duration_seconds,
            state.loop_,
        ),
        source_clip: state.source_clip.clone(),
        speed: round(state.speed),
        stopped: state.stopped,
        stop_reason: state.stop_reason.clone(),
        time_seconds: round(state.time_seconds),
    }
}

fn stopped_runtime_state(
    entity: &str,
    clip: Option<&str>,
    stop_reason: Option<&str>,
) -> AnimationRuntimeState {
    let clip = clip.unwrap_or("").to_owned();
    AnimationRuntimeState {
        active: false,
        active_state: clip.clone(),
        blend: None,
        clip: clip.clone(),
        entity: entity.to_owned(),
        loop_: false,
        normalized_time: 0.0,
        source_clip: clip,
        speed: 0.0,
        stopped: true,
        stop_reason: stop_reason.map(str::to_owned),
        time_seconds: 0.0,
    }
}

fn create_blend_state(
    from_clip: &str,
    to_clip: &str,
    duration_seconds: f32,
    elapsed_seconds: f32,
) -> AnimationRuntimeBlendState {
    let elapsed = elapsed_seconds.max(0.0).min(duration_seconds);
    let alpha = if duration_seconds <= 0.0 {
        1.0
    } else {
        elapsed / duration_seconds
    };
    AnimationRuntimeBlendState {
        complete: elapsed >= duration_seconds,
        duration_seconds: round(duration_seconds),
        elapsed_seconds: round(elapsed),
        from_clip: from_clip.to_owned(),
        from_weight: round(1.0 - alpha),
        to_clip: to_clip.to_owned(),
        to_weight: round(alpha),
    }
}

fn advance_blend(
    blend: Option<&AnimationRuntimeBlendState>,
    delta_seconds: f32,
) -> Option<AnimationRuntimeBlendState> {
    blend.map(|blend| {
        create_blend_state(
            &blend.from_clip,
            &blend.to_clip,
            blend.duration_seconds,
            blend.elapsed_seconds + delta_seconds,
        )
    })
}

fn normalized_animation_time(time_seconds: f32, duration_seconds: f32, loop_: bool) -> f32 {
    if duration_seconds <= 0.0 {
        return 0.0;
    }
    let normalized = time_seconds / duration_seconds;
    if loop_ {
        round(normalized % 1.0)
    } else {
        round(normalized.min(1.0))
    }
}

fn positive_number(value: Option<f32>, fallback: f32) -> f32 {
    value
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(fallback)
}

fn non_negative_number(value: Option<f32>, fallback: f32) -> f32 {
    value
        .filter(|value| value.is_finite() && *value >= 0.0)
        .unwrap_or(fallback)
}

fn trace_asset_animation(
    asset_id: &str,
    graph: &AnimationGraphIr,
    emitters: &[ParticleEmitterIr],
    overrides: &BTreeMap<String, Value>,
    fixed_delta: f32,
) -> AnimationTraceObservation {
    let parameters = parameter_values(graph, overrides);
    let transition = graph
        .transitions
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .find(|transition| {
            transition.from == graph.initial_state && condition_matches(transition, &parameters)
        });
    let active_state_id = transition.map_or(graph.initial_state.as_str(), |transition| {
        transition.to.as_str()
    });
    let state = graph
        .states
        .iter()
        .find(|state| state.id == active_state_id)
        .unwrap_or(&graph.states[0]);

    let mut particles = emitters
        .iter()
        .map(|emitter| trace_particle_emitter(emitter, fixed_delta))
        .collect::<Vec<_>>();
    particles.sort_by(|left, right| left.id.cmp(&right.id));
    let events = active_events(state, fixed_delta);
    let queued_events = events
        .iter()
        .map(|event| AnimationQueuedEventObservation {
            event: event.event.clone(),
            payload: AnimationQueuedEventPayload {
                asset: asset_id.to_owned(),
                at_seconds: event.at_seconds,
                clip: state.clip.clone(),
                state: event.state.clone(),
            },
        })
        .collect::<Vec<_>>();

    AnimationTraceObservation {
        active_state: state.id.clone(),
        asset: asset_id.to_owned(),
        clip: state.clip.clone(),
        events,
        initial_state: graph.initial_state.clone(),
        parameters,
        particles,
        queued_events,
        transition: transition.map(|transition| AnimationTransitionObservation {
            blend_seconds: transition.blend_seconds,
            from: transition.from.clone(),
            to: transition.to.clone(),
        }),
    }
}

fn parameter_values(
    graph: &AnimationGraphIr,
    overrides: &BTreeMap<String, Value>,
) -> BTreeMap<String, Value> {
    let mut values = BTreeMap::new();
    for parameter in graph.parameters.as_deref().unwrap_or(&[]) {
        let value = overrides
            .get(&parameter.id)
            .cloned()
            .or_else(|| parameter.default.clone())
            .unwrap_or_else(|| default_parameter_value(&parameter.kind));
        values.insert(parameter.id.clone(), value);
    }
    values
}

fn default_parameter_value(kind: &str) -> Value {
    if kind == "number" {
        Value::from(0)
    } else {
        Value::from(false)
    }
}

fn condition_matches(
    transition: &AnimationGraphTransitionIr,
    parameters: &BTreeMap<String, Value>,
) -> bool {
    let Some(value) = parameters.get(&transition.when.parameter) else {
        return false;
    };
    if transition
        .when
        .equals
        .as_ref()
        .is_some_and(|expected| expected != value)
    {
        return false;
    }
    if transition.when.greater_than.is_some_and(|threshold| {
        value
            .as_f64()
            .is_none_or(|actual| actual <= threshold as f64)
    }) {
        return false;
    }
    if transition.when.less_than.is_some_and(|threshold| {
        value
            .as_f64()
            .is_none_or(|actual| actual >= threshold as f64)
    }) {
        return false;
    }
    true
}

fn active_events(
    state: &AnimationGraphStateIr,
    fixed_delta: f32,
) -> Vec<AnimationEventObservation> {
    let mut events = state
        .events
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .filter(|event| event.at_seconds <= fixed_delta)
        .map(|event| AnimationEventObservation {
            at_seconds: event.at_seconds,
            event: event.event.clone(),
            state: state.id.clone(),
        })
        .collect::<Vec<_>>();
    events.sort_by(|left, right| {
        left.at_seconds
            .total_cmp(&right.at_seconds)
            .then(left.event.cmp(&right.event))
    });
    events
}

fn trace_particle_emitter(
    emitter: &ParticleEmitterIr,
    fixed_delta: f32,
) -> ParticleTraceObservation {
    ParticleTraceObservation {
        id: emitter.id.clone(),
        lifetime_seconds: emitter.lifetime_seconds,
        max_particles: emitter.max_particles,
        shape: emitter.shape.clone(),
        spawned: ((emitter.rate_per_second * fixed_delta).floor() as u32)
            .min(emitter.max_particles),
    }
}
