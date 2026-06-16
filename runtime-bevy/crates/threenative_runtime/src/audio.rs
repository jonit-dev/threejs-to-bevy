use bevy::{
    audio::{AudioBundle, PlaybackSettings, Volume},
    prelude::*,
};
use threenative_components::ThreeNativeId;
use threenative_loader::{AudioIr, LoadedBundle};

#[derive(Clone, Debug, PartialEq)]
pub struct NativeAudioCommand {
    pub asset: String,
    pub bus: Option<String>,
    pub emitter: Option<String>,
    pub event: Option<String>,
    pub id: String,
    pub kind: NativeAudioCommandKind,
    pub volume: Option<f32>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum NativeAudioCommandKind {
    Loop,
    OneShot,
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
pub struct NativeAudioSpatialTrace {
    pub observations: Vec<NativeAudioSpatialObservation>,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAudioSpatialObservation {
    pub attenuation: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bus: Option<String>,
    pub bus_gain: f32,
    pub distance: f32,
    pub effective_volume: f32,
    pub emitter: String,
    pub emitter_position: [f32; 3],
    pub event: String,
    pub id: String,
    pub listener: String,
    pub listener_position: [f32; 3],
    pub radius: f32,
    pub source_volume: f32,
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
                    volume: one_shot.volume,
                })
        })
        .collect()
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
            std::iter::repeat(event.as_str()).take(count)
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

pub fn trace_audio_spatial_attenuation(
    audio: &AudioIr,
    events: &[&str],
) -> NativeAudioSpatialTrace {
    let Some(listener) = audio
        .listeners
        .iter()
        .min_by(|left, right| left.id.cmp(&right.id))
    else {
        return NativeAudioSpatialTrace {
            observations: Vec::new(),
        };
    };
    let mut observations = Vec::new();

    for event in events {
        for one_shot in audio
            .one_shots
            .iter()
            .filter(|one_shot| one_shot.event == *event && one_shot.emitter.is_some())
        {
            let Some(emitter_id) = &one_shot.emitter else {
                continue;
            };
            let Some(emitter) = audio
                .emitters
                .iter()
                .find(|emitter| &emitter.id == emitter_id)
            else {
                continue;
            };
            let distance = vec3_distance(listener.position, emitter.position);
            let radius = emitter.radius.unwrap_or(1.0);
            let attenuation = (1.0 - distance / radius).clamp(0.0, 1.0);
            let source_volume = one_shot.volume.unwrap_or(1.0);
            let bus_gain = one_shot
                .bus
                .as_ref()
                .and_then(|bus_id| audio.buses.iter().find(|bus| &bus.id == bus_id))
                .and_then(|bus| bus.volume)
                .unwrap_or(1.0);
            observations.push(NativeAudioSpatialObservation {
                attenuation,
                bus: one_shot.bus.clone(),
                bus_gain,
                distance,
                effective_volume: source_volume * bus_gain * attenuation,
                emitter: emitter.id.clone(),
                emitter_position: emitter.position,
                event: (*event).to_owned(),
                id: one_shot.id.clone(),
                listener: listener.id.clone(),
                listener_position: listener.position,
                radius,
                source_volume,
            });
        }
    }
    observations.sort_by(|left, right| left.id.cmp(&right.id));
    NativeAudioSpatialTrace { observations }
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

fn vec3_distance(left: [f32; 3], right: [f32; 3]) -> f32 {
    let dx = left[0] - right[0];
    let dy = left[1] - right[1];
    let dz = left[2] - right[2];
    (dx * dx + dy * dy + dz * dz).sqrt()
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
        }
        .to_owned(),
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
                        settings: command.volume.map_or(PlaybackSettings::LOOP, |volume| {
                            PlaybackSettings::LOOP.with_volume(Volume::new(volume))
                        }),
                    },
                    Name::new(command.id.clone()),
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
