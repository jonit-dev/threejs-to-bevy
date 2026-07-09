use std::collections::HashMap;

use serde::Serialize;
use threenative_loader::{SequenceIr, SequenceKeyframeIr, SequenceTrackIr, SequencesIr};

#[derive(Clone, Debug, Default)]
pub struct NativeSequenceTraceInput {
    pub fixed_delta: f32,
    pub play_by_tick: HashMap<u32, Vec<String>>,
    pub skip_by_tick: HashMap<u32, Vec<String>>,
    pub stop_by_tick: HashMap<u32, Vec<String>>,
    pub ticks: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSequenceTraceFrame {
    pub active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed: Option<bool>,
    pub observations: Vec<NativeSequenceTraceObservation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub restored_camera: Option<String>,
    pub sequence: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skipped: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stopped: Option<bool>,
    pub tick: u32,
    pub time: f32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSequenceTraceObservation {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
    pub kind: String,
    pub sequence: String,
    pub tick: u32,
    pub time: f32,
    pub track: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<serde_json::Value>,
}

#[derive(Clone, Debug)]
struct ActiveSequence {
    previous_time: f32,
    time: f32,
}

pub fn trace_sequences(
    sequences: &SequencesIr,
    input: NativeSequenceTraceInput,
) -> Vec<NativeSequenceTraceFrame> {
    let fixed_delta = if input.fixed_delta > 0.0 {
        input.fixed_delta
    } else {
        0.5
    };
    let by_id: HashMap<&str, &SequenceIr> = sequences
        .sequences
        .iter()
        .map(|sequence| (sequence.id.as_str(), sequence))
        .collect();
    let mut active: HashMap<String, ActiveSequence> = HashMap::new();
    let mut trace = Vec::new();

    for tick in 0..input.ticks {
        if let Some(play) = input.play_by_tick.get(&tick) {
            for sequence_id in play {
                if by_id.contains_key(sequence_id.as_str()) {
                    active.insert(
                        sequence_id.clone(),
                        ActiveSequence {
                            previous_time: 0.0,
                            time: 0.0,
                        },
                    );
                }
            }
        }

        let mut forced_ends: HashMap<String, &str> = HashMap::new();
        if let Some(skip) = input.skip_by_tick.get(&tick) {
            for sequence_id in skip {
                forced_ends.insert(sequence_id.clone(), "skipped");
            }
        }
        if let Some(stop) = input.stop_by_tick.get(&tick) {
            for sequence_id in stop {
                forced_ends.insert(sequence_id.clone(), "stopped");
            }
        }

        let mut active_ids: Vec<_> = active.keys().cloned().collect();
        active_ids.sort();
        for sequence_id in active_ids {
            let Some(sequence) = by_id.get(sequence_id.as_str()) else {
                active.remove(&sequence_id);
                continue;
            };
            let Some(runtime) = active.get_mut(&sequence_id) else {
                continue;
            };
            let forced_end = forced_ends.get(&sequence_id).copied();
            let observations = if forced_end.is_none() {
                sample_sequence(sequence, runtime.previous_time, runtime.time, tick)
            } else {
                Vec::new()
            };
            let completed = forced_end.is_none() && runtime.time >= sequence.duration;
            trace.push(NativeSequenceTraceFrame {
                active: forced_end.is_none() && !completed,
                completed: completed.then_some(true),
                observations,
                restored_camera: sequence_camera(sequence),
                sequence: sequence.id.clone(),
                skipped: (forced_end == Some("skipped")).then_some(true),
                stopped: (forced_end == Some("stopped")).then_some(true),
                tick,
                time: round_time(runtime.time),
            });
            if completed || forced_end.is_some() {
                active.remove(&sequence_id);
            } else {
                runtime.previous_time = runtime.time;
                runtime.time = sequence.duration.min(runtime.time + fixed_delta);
            }
        }
    }

    trace
}

fn sample_sequence(
    sequence: &SequenceIr,
    previous_time: f32,
    time: f32,
    tick: u32,
) -> Vec<NativeSequenceTraceObservation> {
    let mut observations = Vec::new();
    for track in &sequence.tracks {
        if matches!(track.kind.as_str(), "event" | "audio" | "ui") {
            for keyframe in track
                .keyframes
                .iter()
                .filter(|keyframe| is_triggered_key(keyframe, previous_time, time))
            {
                observations.push(observation(
                    &sequence.id,
                    track,
                    tick,
                    keyframe.time,
                    keyframe.value.clone(),
                ));
            }
        } else {
            observations.push(observation(
                &sequence.id,
                track,
                tick,
                time,
                sample_track_value(track, time),
            ));
        }
    }
    observations
}

fn sample_track_value(track: &SequenceTrackIr, time: f32) -> Option<serde_json::Value> {
    let mut keys = track.keyframes.clone();
    keys.sort_by(|left, right| left.time.total_cmp(&right.time));
    let first = keys.first()?;
    let last = keys.last()?;
    if time <= first.time {
        return first.value.clone();
    }
    if time >= last.time {
        return last.value.clone();
    }
    for window in keys.windows(2) {
        let left = &window[0];
        let right = &window[1];
        if time >= left.time && time <= right.time {
            if right.easing.as_deref() == Some("step") || left.easing.as_deref() == Some("step") {
                return left.value.clone();
            }
            let t = (time - left.time) / (right.time - left.time);
            return lerp_value(left.value.as_ref()?, right.value.as_ref()?, t);
        }
    }
    last.value.clone()
}

fn lerp_value(
    left: &serde_json::Value,
    right: &serde_json::Value,
    t: f32,
) -> Option<serde_json::Value> {
    match (left, right) {
        (serde_json::Value::Number(left), serde_json::Value::Number(right)) => {
            let left = left.as_f64()?;
            let right = right.as_f64()?;
            Some(serde_json::Value::from(round_time(
                (left + (right - left) * f64::from(t)) as f32,
            )))
        }
        (serde_json::Value::Array(left), serde_json::Value::Array(right))
            if left.len() == right.len() =>
        {
            let values: Option<Vec<_>> = left
                .iter()
                .zip(right.iter())
                .map(|(left, right)| lerp_value(left, right, t))
                .collect();
            values.map(serde_json::Value::Array)
        }
        (serde_json::Value::Object(left), serde_json::Value::Object(right)) => {
            let mut keys: Vec<_> = left.keys().collect();
            keys.sort();
            let mut value = serde_json::Map::new();
            for key in keys {
                value.insert(key.clone(), lerp_value(left.get(key)?, right.get(key)?, t)?);
            }
            Some(serde_json::Value::Object(value))
        }
        _ => Some(if t < 1.0 { left.clone() } else { right.clone() }),
    }
}

fn observation(
    sequence: &str,
    track: &SequenceTrackIr,
    tick: u32,
    time: f32,
    value: Option<serde_json::Value>,
) -> NativeSequenceTraceObservation {
    NativeSequenceTraceObservation {
        entity: track.entity.clone(),
        kind: track.kind.clone(),
        sequence: sequence.to_owned(),
        tick,
        time: round_time(time),
        track: track.id.clone(),
        value,
    }
}

fn sequence_camera(sequence: &SequenceIr) -> Option<String> {
    sequence
        .tracks
        .iter()
        .find(|track| track.kind == "cameraPose")
        .and_then(|track| track.entity.clone())
}

fn is_triggered_key(keyframe: &&SequenceKeyframeIr, previous_time: f32, time: f32) -> bool {
    (time == 0.0 && keyframe.time == 0.0)
        || (keyframe.time > previous_time && keyframe.time <= time)
}

fn round_time(value: f32) -> f32 {
    (value * 1_000_000.0).round() / 1_000_000.0
}
