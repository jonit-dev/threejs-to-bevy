use bevy::{
    audio::{AudioBundle, AudioSink, AudioSinkPlayback, PlaybackSettings, Volume},
    prelude::*,
};
use std::collections::BTreeMap;
use threenative_components::ThreeNativeId;
use threenative_loader::{AudioControlIr, AudioIr, LoadedBundle};

use crate::systems_effects::NativeSystemEffectLog;

#[derive(Component, Clone, Debug, PartialEq, Eq)]
pub struct NativeAudioPlayback(pub String);

#[derive(Clone, Debug)]
struct NativeAudioSound {
    asset_path: String,
    loop_: bool,
    pitch: Option<f32>,
    volume: Option<f32>,
}

#[derive(Resource, Default)]
pub struct NativeAudioRuntime {
    controls: Vec<AudioControlIr>,
    control_cursor: usize,
    control_elapsed_seconds: f32,
    pending_controls: Vec<AudioControlIr>,
    event_commands: BTreeMap<String, Vec<NativeAudioCommand>>,
    sounds: BTreeMap<String, NativeAudioSound>,
}

#[derive(Clone, Debug, PartialEq)]
enum NativeAudioServiceCommand {
    Play {
        playback_id: String,
        sound_id: String,
        loop_: Option<bool>,
        pitch: Option<f32>,
        volume: Option<f32>,
    },
    Stop {
        playback_id: String,
    },
    Update {
        pitch: Option<f32>,
        playback_id: String,
        ramp_seconds: Option<f32>,
        volume: Option<f32>,
    },
}

#[derive(Resource, Default)]
pub struct NativeAudioServiceQueue(Vec<NativeAudioServiceCommand>);

#[derive(Resource, Default)]
pub struct NativeAudioEventQueue(Vec<String>);

#[derive(Resource, Default)]
pub struct NativeAudioEventCursors(BTreeMap<String, usize>);

pub fn queue_new_native_audio_events(
    queue: &mut NativeAudioEventQueue,
    cursors: &mut NativeAudioEventCursors,
    events: &std::collections::HashMap<String, serde_json::Value>,
) {
    for cursor in cursors
        .0
        .iter_mut()
        .filter(|(event, _)| !events.contains_key(*event))
        .map(|(_, cursor)| cursor)
    {
        *cursor = 0;
    }
    for (event, values) in events {
        let count = values.as_array().map_or(1, Vec::len);
        let cursor = cursors.0.entry(event.clone()).or_default();
        let new_count = if count >= *cursor {
            count - *cursor
        } else {
            count
        };
        queue
            .0
            .extend(std::iter::repeat_n(event.clone(), new_count));
        *cursor = count;
    }
}

#[derive(Resource, Default)]
pub struct NativeAudioPlaybackStates(pub BTreeMap<String, String>);

#[derive(Resource, Default)]
pub struct NativeAudioDiagnostics(pub Vec<NativeAudioDiagnostic>);

impl NativeAudioRuntime {
    pub fn from_bundle(bundle: &LoadedBundle) -> Self {
        let Some(audio) = bundle.audio.as_ref() else {
            return Self::default();
        };
        let asset_paths = bundle
            .assets
            .assets
            .iter()
            .filter(|asset| asset.kind == "audio")
            .filter_map(|asset| {
                asset
                    .path
                    .as_ref()
                    .map(|path| (asset.id.as_str(), path.clone()))
            })
            .collect::<BTreeMap<_, _>>();
        let mut controls = audio.controls.clone();
        controls.sort_by(|left, right| left.at.unwrap_or(0.0).total_cmp(&right.at.unwrap_or(0.0)));
        let mut runtime = Self {
            controls,
            ..Self::default()
        };
        for music in &audio.music {
            if let Some(path) = asset_paths.get(music.asset.as_str()) {
                runtime.sounds.insert(
                    music.id.clone(),
                    NativeAudioSound {
                        asset_path: path.clone(),
                        loop_: music.looped.unwrap_or(false),
                        pitch: music.pitch,
                        volume: music.volume,
                    },
                );
            }
        }
        for one_shot in &audio.one_shots {
            if let Some(path) = asset_paths.get(one_shot.asset.as_str()) {
                let sound = NativeAudioSound {
                    asset_path: path.clone(),
                    loop_: false,
                    pitch: one_shot.pitch,
                    volume: one_shot.volume,
                };
                runtime.sounds.insert(one_shot.id.clone(), sound);
            }
        }
        for event in audio
            .one_shots
            .iter()
            .map(|one_shot| one_shot.event.as_str())
        {
            runtime
                .event_commands
                .entry(event.to_owned())
                .or_insert_with(|| handle_audio_events(audio, &[event]));
        }
        runtime
    }
}

fn playback_settings(loop_: bool, volume: Option<f32>, pitch: Option<f32>) -> PlaybackSettings {
    let mut settings = if loop_ {
        PlaybackSettings::LOOP
    } else {
        PlaybackSettings::DESPAWN
    };
    if let Some(volume) = volume {
        settings = settings.with_volume(Volume::new(volume));
    }
    if let Some(pitch) = pitch {
        settings = settings.with_speed(pitch);
    }
    settings
}

fn spawn_audio(
    commands: &mut Commands,
    asset_server: &AssetServer,
    playback_id: String,
    sound: &NativeAudioSound,
    loop_: Option<bool>,
    pitch: Option<f32>,
    volume: Option<f32>,
) {
    commands.spawn((
        AudioBundle {
            source: asset_server.load(sound.asset_path.clone()),
            settings: playback_settings(
                loop_.unwrap_or(sound.loop_),
                volume.or(sound.volume),
                pitch.or(sound.pitch),
            ),
        },
        Name::new(playback_id.clone()),
        NativeAudioPlayback(playback_id.clone()),
        ThreeNativeId(playback_id),
    ));
}

pub fn play_new_native_audio_events(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    runtime: Res<NativeAudioRuntime>,
    mut queued_events: ResMut<NativeAudioEventQueue>,
    mut diagnostics: ResMut<NativeAudioDiagnostics>,
) {
    let events = std::mem::take(&mut queued_events.0);
    for event in events {
        for command in runtime.event_commands.get(&event).into_iter().flatten() {
            if let Some(sound) = runtime.sounds.get(&command.id) {
                spawn_audio(
                    &mut commands,
                    &asset_server,
                    command.id.clone(),
                    sound,
                    None,
                    None,
                    None,
                );
            } else {
                let diagnostic = NativeAudioDiagnostic {
                    code: "TN_AUDIO_ASSET_MISSING".to_owned(),
                    message: format!(
                        "Audio playback '{}' references missing or non-audio asset '{}'.",
                        command.id, command.asset
                    ),
                    path: format!("audio/oneShots/{}", command.id),
                    severity: "error".to_owned(),
                };
                warn!(
                    "{}: {} ({})",
                    diagnostic.code, diagnostic.message, diagnostic.path
                );
                diagnostics.0.push(diagnostic);
            }
        }
    }
}

fn queue_audio_play(queue: &mut NativeAudioServiceQueue, result: &serde_json::Value) {
    if result["accepted"].as_bool() != Some(true) {
        return;
    }
    let (Some(playback_id), Some(sound_id)) =
        (result["playbackId"].as_str(), result["soundId"].as_str())
    else {
        return;
    };
    queue.0.push(NativeAudioServiceCommand::Play {
        playback_id: playback_id.to_owned(),
        sound_id: sound_id.to_owned(),
        loop_: result["loop"].as_bool(),
        pitch: result["pitch"].as_f64().map(|value| value as f32),
        volume: result["volume"].as_f64().map(|value| value as f32),
    });
}

pub fn queue_native_audio_service_effects(
    queue: &mut NativeAudioServiceQueue,
    logs: &[NativeSystemEffectLog],
) {
    for entry in logs.iter().flat_map(|log| &log.entries) {
        let Some(service) = entry.service.as_deref() else {
            continue;
        };
        let Some(payload) = entry.payload.as_ref() else {
            continue;
        };
        match service {
            "audio.play" => queue_audio_play(queue, &payload["result"]),
            "effects.play" => queue_audio_play(queue, &payload["audio"]),
            "audio.stop" => {
                if let Some(playback_id) = payload["result"]["playbackId"].as_str() {
                    queue.0.push(NativeAudioServiceCommand::Stop {
                        playback_id: playback_id.to_owned(),
                    });
                }
            }
            "audio.update" if payload["result"]["accepted"].as_bool() == Some(true) => {
                if let Some(playback_id) = payload["result"]["playbackId"].as_str() {
                    queue.0.push(NativeAudioServiceCommand::Update {
                        pitch: payload["result"]["pitch"].as_f64().map(|value| value as f32),
                        playback_id: playback_id.to_owned(),
                        ramp_seconds: payload["result"]["rampSeconds"].as_f64().map(|value| value as f32),
                        volume: payload["result"]["volume"].as_f64().map(|value| value as f32),
                    });
                }
            }
            _ => {}
        }
    }
}

pub fn apply_native_audio_service_effects(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    runtime: Res<NativeAudioRuntime>,
    mut queue: ResMut<NativeAudioServiceQueue>,
    playbacks: Query<(Entity, &NativeAudioPlayback, Option<&AudioSink>)>,
    mut states: ResMut<NativeAudioPlaybackStates>,
    mut diagnostics: ResMut<NativeAudioDiagnostics>,
) {
    for effect in std::mem::take(&mut queue.0) {
        match effect {
            NativeAudioServiceCommand::Play {
                playback_id,
                sound_id,
                loop_,
                pitch,
                volume,
            } => {
                if let Some(sound) = runtime.sounds.get(&sound_id) {
                    spawn_audio(
                        &mut commands,
                        &asset_server,
                        playback_id.clone(),
                        sound,
                        loop_,
                        pitch,
                        volume,
                    );
                    states.0.insert(playback_id, "playing".to_owned());
                } else {
                    let diagnostic = NativeAudioDiagnostic {
                        code: "TN_AUDIO_SOUND_UNRESOLVED".to_owned(),
                        message: format!(
                            "Script audio playback '{}' references unresolved sound '{}'.",
                            playback_id, sound_id
                        ),
                        path: format!("audio/sounds/{sound_id}"),
                        severity: "error".to_owned(),
                    };
                    warn!(
                        "{}: {} ({})",
                        diagnostic.code, diagnostic.message, diagnostic.path
                    );
                    diagnostics.0.push(diagnostic);
                    states.0.insert(playback_id, "stopped".to_owned());
                }
            }
            NativeAudioServiceCommand::Stop { playback_id } => {
                for (entity, _, sink) in playbacks
                    .iter()
                    .filter(|(_, playback, _)| playback.0 == playback_id)
                {
                    if let Some(sink) = sink {
                        sink.stop();
                    }
                    commands.entity(entity).despawn();
                }
                states.0.insert(playback_id, "stopped".to_owned());
            }
            NativeAudioServiceCommand::Update {
                pitch,
                playback_id,
                ramp_seconds: _,
                volume,
            } => {
                let mut applied = false;
                for (_, _, sink) in playbacks
                    .iter()
                    .filter(|(_, playback, _)| playback.0 == playback_id)
                {
                    let Some(sink) = sink else { continue };
                    if let Some(volume) = volume {
                        sink.set_volume(volume);
                    }
                    if let Some(pitch) = pitch {
                        sink.set_speed(pitch);
                    }
                    applied = true;
                }
                if !applied {
                    diagnostics.0.push(NativeAudioDiagnostic {
                        code: "TN_AUDIO_PLAYBACK_NOT_FOUND".to_owned(),
                        message: format!("Audio playback '{playback_id}' cannot be updated because it is no longer active."),
                        path: format!("audio/{playback_id}"),
                        severity: "warning".to_owned(),
                    });
                }
            }
        }
    }
}

pub fn apply_native_audio_controls(
    mut commands: Commands,
    mut runtime: ResMut<NativeAudioRuntime>,
    playbacks: Query<(Entity, &NativeAudioPlayback, Option<&AudioSink>)>,
    mut states: ResMut<NativeAudioPlaybackStates>,
    mut diagnostics: ResMut<NativeAudioDiagnostics>,
    time: Res<Time>,
) {
    runtime.control_elapsed_seconds += time.delta_seconds();
    let ready_end = runtime.controls[runtime.control_cursor..]
        .iter()
        .take_while(|control| control.at.unwrap_or(0.0) <= runtime.control_elapsed_seconds)
        .count()
        + runtime.control_cursor;
    let mut controls = std::mem::take(&mut runtime.pending_controls);
    controls.extend_from_slice(&runtime.controls[runtime.control_cursor..ready_end]);
    runtime.control_cursor = ready_end;
    let mut deferred = Vec::new();
    for control in controls {
        let matches = playbacks
            .iter()
            .filter(|(_, playback, _)| playback.0 == control.target)
            .collect::<Vec<_>>();
        match control.kind.as_str() {
            "pause" => {
                if !matches.iter().any(|(_, _, sink)| sink.is_some()) {
                    deferred.push(control);
                    continue;
                }
                for (_, _, sink) in &matches {
                    if let Some(sink) = sink {
                        sink.pause();
                    }
                }
                states.0.insert(control.target, "paused".to_owned());
            }
            "resume" => {
                if !matches.iter().any(|(_, _, sink)| sink.is_some()) {
                    deferred.push(control);
                    continue;
                }
                for (_, _, sink) in &matches {
                    if let Some(sink) = sink {
                        sink.play();
                    }
                }
                states.0.insert(control.target, "playing".to_owned());
            }
            "stop" => {
                for (entity, _, sink) in matches {
                    if let Some(sink) = sink {
                        sink.stop();
                    }
                    commands.entity(entity).despawn();
                }
                states.0.insert(control.target, "stopped".to_owned());
            }
            "query" => {
                if !matches.iter().any(|(_, _, sink)| sink.is_some()) {
                    deferred.push(control);
                    continue;
                }
                let sink_status = matches
                    .iter()
                    .find_map(|(_, _, sink)| sink.map(audio_sink_status))
                    .map(str::to_owned);
                let status = sink_status
                    .or_else(|| states.0.get(&control.target).cloned())
                    .unwrap_or_else(|| "stopped".to_owned());
                states.0.insert(control.target, status);
            }
            "seek" => {
                let diagnostic = NativeAudioDiagnostic {
                    code: "TN_AUDIO_NATIVE_SEEK_UNSUPPORTED".to_owned(),
                    message: format!(
                        "Native audio playback '{}' cannot seek because Bevy's AudioSink has no seek operation.",
                        control.target
                    ),
                    path: format!("audio/controls/{}", control.id),
                    severity: "warning".to_owned(),
                };
                warn!(
                    "{}: {} ({})",
                    diagnostic.code, diagnostic.message, diagnostic.path
                );
                diagnostics.0.push(diagnostic);
            }
            _ => {}
        }
    }
    runtime.pending_controls = deferred;
}

fn audio_sink_status(sink: &AudioSink) -> &'static str {
    if sink.is_paused() {
        "paused"
    } else {
        "playing"
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeAudioCommand {
    pub asset: String,
    pub bus: Option<String>,
    pub emitter: Option<String>,
    pub event: Option<String>,
    pub id: String,
    pub kind: NativeAudioCommandKind,
    pub pitch: Option<f32>,
    pub tone: Option<NativeAudioToneCommand>,
    pub volume: Option<f32>,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct NativeAudioToneCommand {
    pub duration: f32,
    pub frequency: Option<f32>,
    pub waveform: String,
}

#[derive(Clone, Debug, PartialEq)]
pub enum NativeAudioCommandKind {
    Loop,
    OneShot,
    Tone,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeAudioDiagnostic {
    pub code: String,
    pub message: String,
    pub path: String,
    pub severity: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeAudioObservation {
    pub commands: Vec<NativeAudioCommand>,
    pub diagnostics: Vec<NativeAudioDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAudioLifecycleTrace {
    pub active_loops: Vec<String>,
    pub commands: Vec<NativeAudioCommandReport>,
    pub lifecycle: Vec<NativeAudioLifecycleEvent>,
    pub paused_loops: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAudioSupportTrace {
    pub attenuation: Vec<NativeAudioAttenuationObservation>,
    pub ducking: Vec<NativeAudioDuckingObservation>,
    pub listener_bindings: Vec<NativeAudioListenerBindingObservation>,
    pub music_transitions: Vec<NativeAudioTransitionObservation>,
    pub tones: Vec<NativeAudioToneObservation>,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAudioAttenuationObservation {
    pub emitter: String,
    pub gain: f32,
    pub listener: String,
    pub listener_position: [f32; 3],
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAudioDuckingObservation {
    pub gain: f32,
    pub id: String,
    pub source_bus: String,
    pub target_bus: String,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAudioListenerBindingObservation {
    pub entity: Option<String>,
    pub id: String,
    pub kind: String,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAudioTransitionObservation {
    pub duration: Option<f32>,
    pub from: Option<String>,
    pub id: String,
    pub kind: String,
    pub playback_id: String,
    pub state: String,
    pub to: String,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAudioToneObservation {
    pub bus: Option<String>,
    pub duration: f32,
    pub frequency: Option<f32>,
    pub id: String,
    pub pitch: Option<f32>,
    pub volume: Option<f32>,
    pub waveform: String,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct NativeAudioLifecycleEvent {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub at: Option<f32>,
    pub id: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAudioCommandReport {
    pub asset: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bus: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub emitter: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event: Option<String>,
    pub id: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pitch: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tone: Option<NativeAudioToneCommand>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub volume: Option<f32>,
}

pub fn start_audio(audio: &AudioIr) -> Vec<NativeAudioCommand> {
    audio
        .music
        .iter()
        .filter(|music| music.looped.unwrap_or(false) && music.autoplay.unwrap_or(true))
        .map(|music| NativeAudioCommand {
            asset: music.asset.clone(),
            bus: music.bus.clone(),
            emitter: None,
            event: None,
            id: music.id.clone(),
            kind: NativeAudioCommandKind::Loop,
            pitch: music.pitch,
            tone: None,
            volume: music.volume,
        })
        .collect()
}

pub fn handle_audio_events(audio: &AudioIr, events: &[&str]) -> Vec<NativeAudioCommand> {
    events
        .iter()
        .flat_map(|event| {
            audio
                .one_shots
                .iter()
                .filter(move |one_shot| one_shot.event == **event)
                .map(move |one_shot| NativeAudioCommand {
                    asset: one_shot.asset.clone(),
                    bus: one_shot.bus.clone(),
                    emitter: one_shot.emitter.clone(),
                    event: Some((*event).to_owned()),
                    id: one_shot.id.clone(),
                    kind: NativeAudioCommandKind::OneShot,
                    pitch: one_shot.pitch,
                    tone: None,
                    volume: one_shot.volume,
                })
        })
        .collect()
}

pub fn trace_audio_support(
    audio: &AudioIr,
    listener_positions: &[(&str, Vec<[f32; 3]>)],
) -> NativeAudioSupportTrace {
    let mut attenuation = Vec::new();
    for listener in &audio.listeners {
        let positions = listener_positions
            .iter()
            .find(|(id, _)| *id == listener.id)
            .map(|(_, positions)| positions.as_slice())
            .unwrap_or(std::slice::from_ref(&listener.position));
        for position in positions {
            for emitter in &audio.emitters {
                attenuation.push(NativeAudioAttenuationObservation {
                    emitter: emitter.id.clone(),
                    gain: attenuation_gain(
                        distance(*position, emitter.position),
                        emitter
                            .attenuation
                            .as_ref()
                            .map(|attenuation| {
                                (
                                    attenuation.curve.as_str(),
                                    attenuation.min_distance,
                                    attenuation.max_distance,
                                    attenuation.rolloff_factor,
                                )
                            })
                            .or_else(|| emitter.radius.map(|radius| ("linear", 1.0, radius, 1.0))),
                    ),
                    listener: listener.id.clone(),
                    listener_position: *position,
                });
            }
        }
    }
    NativeAudioSupportTrace {
        attenuation,
        ducking: audio
            .ducking_rules
            .iter()
            .map(|rule| NativeAudioDuckingObservation {
                gain: rule.gain,
                id: rule.id.clone(),
                source_bus: rule.source_bus.clone(),
                target_bus: rule.target_bus.clone(),
            })
            .collect(),
        listener_bindings: audio
            .listeners
            .iter()
            .map(|listener| NativeAudioListenerBindingObservation {
                entity: listener
                    .binding
                    .as_ref()
                    .and_then(|binding| binding.entity.clone()),
                id: listener.id.clone(),
                kind: listener
                    .binding
                    .as_ref()
                    .map_or_else(|| "fixed".to_owned(), |binding| binding.kind.clone()),
            })
            .collect(),
        music_transitions: audio
            .music_transitions
            .iter()
            .map(|transition| NativeAudioTransitionObservation {
                duration: transition.duration,
                from: transition.from.clone(),
                id: transition.id.clone(),
                kind: transition.kind.clone(),
                playback_id: transition.playback_id.clone(),
                state: transition.state.clone(),
                to: transition.to.clone(),
            })
            .collect(),
        tones: audio
            .tones
            .iter()
            .map(|tone| NativeAudioToneObservation {
                bus: tone.bus.clone(),
                duration: tone.duration,
                frequency: tone.frequency,
                id: tone.id.clone(),
                pitch: tone.pitch,
                volume: tone.volume,
                waveform: tone.waveform.clone(),
            })
            .collect(),
    }
}

fn distance(left: [f32; 3], right: [f32; 3]) -> f32 {
    ((left[0] - right[0]).powi(2) + (left[1] - right[1]).powi(2) + (left[2] - right[2]).powi(2))
        .sqrt()
}

fn attenuation_gain(distance: f32, attenuation: Option<(&str, f32, f32, f32)>) -> f32 {
    let Some((curve, min_distance, max_distance, rolloff_factor)) = attenuation else {
        return 1.0;
    };
    if distance <= min_distance {
        return 1.0;
    }
    if distance >= max_distance {
        return 0.0;
    }
    let normalized = (distance - min_distance) / (max_distance - min_distance);
    let value = match curve {
        "exponential" => (distance / min_distance).powf(-rolloff_factor),
        "inverse" => min_distance / (min_distance + rolloff_factor * (distance - min_distance)),
        _ => 1.0 - normalized * rolloff_factor,
    };
    (value.clamp(0.0, 1.0) * 1_000_000.0).round() / 1_000_000.0
}

pub fn observe_audio(bundle: &LoadedBundle) -> Option<NativeAudioObservation> {
    let audio = bundle.audio.as_ref()?;
    let mut commands = start_audio(audio);
    let event_names = bundle
        .world
        .events
        .iter()
        .flat_map(|(event, values)| {
            let count = values.as_array().map_or(1, |items| items.len());
            std::iter::repeat_n(event.as_str(), count)
        })
        .collect::<Vec<_>>();
    commands.extend(handle_audio_events(audio, &event_names));
    commands.sort_by(|left, right| left.id.cmp(&right.id));
    let diagnostics = commands
        .iter()
        .filter_map(|command| resolve_audio_asset_path(bundle, &command.asset).err())
        .collect::<Vec<_>>();
    Some(NativeAudioObservation {
        commands,
        diagnostics,
    })
}

pub fn trace_audio_lifecycle(
    audio: &AudioIr,
    events: &[&str],
    stop_loops: &[&str],
) -> NativeAudioLifecycleTrace {
    let mut commands = start_audio(audio);
    let mut active_loops = commands
        .iter()
        .filter(|command| matches!(command.kind, NativeAudioCommandKind::Loop))
        .map(|command| command.id.clone())
        .collect::<Vec<_>>();
    active_loops.sort();
    let mut lifecycle = active_loops
        .iter()
        .map(|id| NativeAudioLifecycleEvent {
            at: None,
            id: id.clone(),
            kind: "start".to_owned(),
            state: None,
        })
        .collect::<Vec<_>>();
    let mut paused_loops = Vec::new();

    commands.extend(handle_audio_events(audio, events));
    commands.extend(audio.tones.iter().map(|tone| NativeAudioCommand {
        asset: format!("generated:{}", tone.id),
        bus: tone.bus.clone(),
        emitter: None,
        event: None,
        id: tone.id.clone(),
        kind: NativeAudioCommandKind::Tone,
        pitch: tone.pitch,
        tone: Some(NativeAudioToneCommand {
            duration: tone.duration,
            frequency: tone.frequency,
            waveform: tone.waveform.clone(),
        }),
        volume: tone.volume,
    }));
    for id in stop_loops {
        if let Some(index) = active_loops.iter().position(|active| active == id) {
            active_loops.remove(index);
            lifecycle.push(NativeAudioLifecycleEvent {
                at: None,
                id: (*id).to_owned(),
                kind: "stop".to_owned(),
                state: None,
            });
        }
    }
    for control in &audio.controls {
        match control.kind.as_str() {
            "pause" => {
                if let Some(index) = active_loops
                    .iter()
                    .position(|active| active == &control.target)
                {
                    active_loops.remove(index);
                    paused_loops.push(control.target.clone());
                    lifecycle.push(control_event(&control.target, "pause", None, None));
                }
            }
            "resume" => {
                if let Some(index) = paused_loops
                    .iter()
                    .position(|paused| paused == &control.target)
                {
                    paused_loops.remove(index);
                    active_loops.push(control.target.clone());
                    active_loops.sort();
                    lifecycle.push(control_event(&control.target, "resume", None, None));
                }
            }
            "stop" => {
                let active = remove_loop(&mut active_loops, &control.target);
                let paused = remove_loop(&mut paused_loops, &control.target);
                if active || paused {
                    lifecycle.push(control_event(&control.target, "stop", None, None));
                }
            }
            "seek" => lifecycle.push(control_event(
                &control.target,
                "seek",
                Some(control.at.unwrap_or(0.0)),
                None,
            )),
            "query" => lifecycle.push(control_event(
                &control.target,
                "query",
                None,
                Some(if active_loops.iter().any(|id| id == &control.target) {
                    "playing"
                } else if paused_loops.iter().any(|id| id == &control.target) {
                    "paused"
                } else {
                    "stopped"
                }),
            )),
            _ => {}
        }
    }
    paused_loops.sort();
    commands.sort_by(|left, right| left.id.cmp(&right.id));

    NativeAudioLifecycleTrace {
        active_loops,
        commands: commands.iter().map(audio_command_report).collect(),
        lifecycle,
        paused_loops,
    }
}

fn remove_loop(values: &mut Vec<String>, target: &str) -> bool {
    let Some(index) = values.iter().position(|value| value == target) else {
        return false;
    };
    values.remove(index);
    true
}

fn control_event(
    id: &str,
    kind: &str,
    at: Option<f32>,
    state: Option<&str>,
) -> NativeAudioLifecycleEvent {
    NativeAudioLifecycleEvent {
        at,
        id: id.to_owned(),
        kind: kind.to_owned(),
        state: state.map(str::to_owned),
    }
}

fn audio_command_report(command: &NativeAudioCommand) -> NativeAudioCommandReport {
    NativeAudioCommandReport {
        asset: command.asset.clone(),
        bus: command.bus.clone(),
        emitter: command.emitter.clone(),
        event: command.event.clone(),
        id: command.id.clone(),
        kind: match command.kind {
            NativeAudioCommandKind::Loop => "loop",
            NativeAudioCommandKind::OneShot => "oneShot",
            NativeAudioCommandKind::Tone => "tone",
        }
        .to_owned(),
        pitch: command.pitch,
        tone: command.tone.clone(),
        volume: command.volume,
    }
}

pub fn spawn_startup_audio(world: &mut World, bundle: &LoadedBundle) -> Vec<NativeAudioDiagnostic> {
    let Some(audio) = bundle.audio.as_ref() else {
        return Vec::new();
    };

    let asset_server = world.resource::<AssetServer>().clone();
    let mut diagnostics = Vec::new();
    for command in start_audio(audio) {
        match resolve_audio_asset_path(bundle, &command.asset) {
            Ok(path) => {
                world.spawn((
                    AudioBundle {
                        source: asset_server.load(path),
                        settings: playback_settings(true, command.volume, command.pitch),
                    },
                    Name::new(command.id.clone()),
                    NativeAudioPlayback(command.id.clone()),
                    ThreeNativeId(command.id),
                ));
            }
            Err(diagnostic) => diagnostics.push(diagnostic),
        }
    }
    diagnostics
}

fn resolve_audio_asset_path(
    bundle: &LoadedBundle,
    asset_id: &str,
) -> Result<String, NativeAudioDiagnostic> {
    bundle
        .assets
        .assets
        .iter()
        .find(|asset| asset.id == asset_id && asset.kind == "audio")
        .and_then(|asset| asset.path.clone())
        .ok_or_else(|| NativeAudioDiagnostic {
            code: "TN_AUDIO_ASSET_MISSING".to_owned(),
            message: format!("Audio playback references missing or non-audio asset '{asset_id}'."),
            path: format!("assets/{asset_id}"),
            severity: "error".to_owned(),
        })
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptAudioRuntimeState {
    pub accepted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(rename = "loop", skip_serializing_if = "Option::is_none")]
    pub loop_: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pitch: Option<f32>,
    pub playback_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ramp_seconds: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    pub sound_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub volume: Option<f32>,
}

#[derive(Clone, Debug)]
struct ScriptAudioCatalogEntry {
    kind: String,
    pitch: Option<f32>,
    volume: Option<f32>,
}

#[derive(Clone, Debug)]
struct ScriptAudioPlaybackRecord {
    entity: Option<String>,
    kind: String,
    loop_: bool,
    pitch: Option<f32>,
    playback_id: String,
    ramp_seconds: Option<f32>,
    sound_id: String,
    status: String,
    volume: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct ScriptAudioRuntimeController {
    catalog: std::collections::BTreeMap<String, ScriptAudioCatalogEntry>,
    playbacks: std::collections::BTreeMap<String, ScriptAudioPlaybackRecord>,
    sequence: u32,
}

impl ScriptAudioRuntimeController {
    pub fn from_audio(audio: Option<&AudioIr>) -> Self {
        let mut controller = Self::default();
        if let Some(audio) = audio {
            controller.catalog = build_script_audio_catalog(audio);
        }
        controller
    }

    pub fn play(
        &mut self,
        sound_id: impl Into<String>,
        options: ScriptAudioPlayOptions,
    ) -> ScriptAudioRuntimeState {
        let sound_id = sound_id.into();
        if let Some(key) = find_unsupported_script_audio_option(&options.raw) {
            return reject_script_audio_play(&sound_id, "unsupported-option", Some(key));
        }
        let Some(declared) = self.catalog.get(&sound_id) else {
            return reject_script_audio_play(&sound_id, "undeclared-sound", None);
        };
        self.sequence += 1;
        let playback_id = format!("{sound_id}#{}", self.sequence);
        let volume = options.volume.or(declared.volume);
        let pitch = options.pitch.or(declared.pitch);
        let loop_ = options.loop_.unwrap_or(declared.kind == "loop");
        let record = ScriptAudioPlaybackRecord {
            entity: options.entity,
            kind: declared.kind.clone(),
            loop_,
            pitch,
            playback_id: playback_id.clone(),
            ramp_seconds: None,
            sound_id: sound_id.clone(),
            status: "playing".to_owned(),
            volume,
        };
        self.playbacks.insert(playback_id.clone(), record.clone());
        serialize_script_audio_playback(&record, true)
    }

    pub fn query(&self, playback_id: &str) -> ScriptAudioRuntimeState {
        let Some(record) = self.playbacks.get(playback_id) else {
            return ScriptAudioRuntimeState {
                accepted: false,
                entity: None,
                kind: None,
                loop_: None,
                pitch: None,
                playback_id: playback_id.to_owned(),
                ramp_seconds: None,
                reason: Some("not-found".to_owned()),
                sound_id: String::new(),
                status: "stopped".to_owned(),
                volume: None,
            };
        };
        serialize_script_audio_playback(record, true)
    }

    pub fn stop(&mut self, playback_id: &str) -> ScriptAudioRuntimeState {
        let Some(record) = self.playbacks.get(playback_id) else {
            return ScriptAudioRuntimeState {
                accepted: true,
                entity: None,
                kind: None,
                loop_: None,
                pitch: None,
                playback_id: playback_id.to_owned(),
                ramp_seconds: None,
                reason: Some("not-found".to_owned()),
                sound_id: String::new(),
                status: "stopped".to_owned(),
                volume: None,
            };
        };
        let mut stopped = record.clone();
        stopped.status = "stopped".to_owned();
        self.playbacks
            .insert(playback_id.to_owned(), stopped.clone());
        serialize_script_audio_playback(&stopped, true)
    }

    pub fn update(
        &mut self,
        playback_id: &str,
        options: ScriptAudioUpdateOptions,
    ) -> ScriptAudioRuntimeState {
        let Some(record) = self.playbacks.get(playback_id) else {
            return missing_script_audio_playback(playback_id, false);
        };
        if record.status != "playing" {
            let mut state = serialize_script_audio_playback(record, false);
            state.reason = Some("stopped".to_owned());
            return state;
        }
        let reason = if options.volume.is_none() && options.pitch.is_none() {
            Some("empty-update")
        } else if options.volume.is_some_and(|value| !value.is_finite() || !(0.0..=4.0).contains(&value)) {
            Some("invalid-volume")
        } else if options.pitch.is_some_and(|value| !value.is_finite() || !(0.25..=4.0).contains(&value)) {
            Some("invalid-pitch")
        } else if options.ramp_seconds.is_some_and(|value| !value.is_finite() || !(0.0..=10.0).contains(&value)) {
            Some("invalid-ramp-seconds")
        } else {
            None
        };
        if let Some(reason) = reason {
            let mut state = serialize_script_audio_playback(record, false);
            state.reason = Some(reason.to_owned());
            return state;
        }
        let mut updated = record.clone();
        if options.volume.is_some() {
            updated.volume = options.volume;
        }
        if options.pitch.is_some() {
            updated.pitch = options.pitch;
        }
        updated.ramp_seconds = options.ramp_seconds;
        self.playbacks.insert(playback_id.to_owned(), updated.clone());
        serialize_script_audio_playback(&updated, true)
    }
}

#[derive(Clone, Debug, Default)]
pub struct ScriptAudioPlayOptions {
    pub entity: Option<String>,
    pub loop_: Option<bool>,
    pub pitch: Option<f32>,
    pub raw: std::collections::BTreeMap<String, serde_json::Value>,
    pub volume: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct ScriptAudioUpdateOptions {
    pub pitch: Option<f32>,
    pub ramp_seconds: Option<f32>,
    pub volume: Option<f32>,
}

fn build_script_audio_catalog(
    audio: &AudioIr,
) -> std::collections::BTreeMap<String, ScriptAudioCatalogEntry> {
    let mut catalog = std::collections::BTreeMap::new();
    for music in &audio.music {
        catalog.insert(
            music.id.clone(),
            ScriptAudioCatalogEntry {
                kind: "loop".to_owned(),
                pitch: music.pitch,
                volume: music.volume,
            },
        );
    }
    for one_shot in &audio.one_shots {
        catalog.insert(
            one_shot.id.clone(),
            ScriptAudioCatalogEntry {
                kind: "oneShot".to_owned(),
                pitch: one_shot.pitch,
                volume: one_shot.volume,
            },
        );
    }
    for tone in &audio.tones {
        catalog.insert(
            tone.id.clone(),
            ScriptAudioCatalogEntry {
                kind: "tone".to_owned(),
                pitch: tone.pitch,
                volume: tone.volume,
            },
        );
    }
    catalog
}

fn find_unsupported_script_audio_option(
    options: &std::collections::BTreeMap<String, serde_json::Value>,
) -> Option<String> {
    const EXTERNAL_KEYS: &[&str] = &[
        "codec",
        "decoderPlugin",
        "device",
        "deviceId",
        "nativeHandle",
        "networkStream",
        "networkUrl",
        "platformHandle",
        "src",
        "stream",
        "streaming",
        "streamingUrl",
        "url",
    ];
    options
        .keys()
        .find(|key| EXTERNAL_KEYS.contains(&key.as_str()))
        .cloned()
}

fn reject_script_audio_play(
    sound_id: &str,
    reason: &str,
    _field: Option<String>,
) -> ScriptAudioRuntimeState {
    ScriptAudioRuntimeState {
        accepted: false,
        entity: None,
        kind: None,
        loop_: None,
        pitch: None,
        playback_id: String::new(),
        ramp_seconds: None,
        reason: Some(reason.to_owned()),
        sound_id: sound_id.to_owned(),
        status: "rejected".to_owned(),
        volume: None,
    }
}

fn serialize_script_audio_playback(
    record: &ScriptAudioPlaybackRecord,
    accepted: bool,
) -> ScriptAudioRuntimeState {
    ScriptAudioRuntimeState {
        accepted,
        entity: record.entity.clone(),
        kind: Some(record.kind.clone()),
        loop_: Some(record.loop_),
        pitch: record.pitch,
        playback_id: record.playback_id.clone(),
        ramp_seconds: record.ramp_seconds,
        reason: None,
        sound_id: record.sound_id.clone(),
        status: record.status.clone(),
        volume: record.volume,
    }
}

fn missing_script_audio_playback(playback_id: &str, accepted: bool) -> ScriptAudioRuntimeState {
    ScriptAudioRuntimeState {
        accepted,
        entity: None,
        kind: None,
        loop_: None,
        pitch: None,
        playback_id: playback_id.to_owned(),
        ramp_seconds: None,
        reason: Some("not-found".to_owned()),
        sound_id: String::new(),
        status: "stopped".to_owned(),
        volume: None,
    }
}
