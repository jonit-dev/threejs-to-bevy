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
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct NativeAudioLifecycleEvent {
    pub id: String,
    pub kind: String,
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
            id: id.clone(),
            kind: "start".to_owned(),
        })
        .collect::<Vec<_>>();

    commands.extend(handle_audio_events(audio, events));
    for id in stop_loops {
        if let Some(index) = active_loops.iter().position(|active| active == id) {
            active_loops.remove(index);
            lifecycle.push(NativeAudioLifecycleEvent {
                id: (*id).to_owned(),
                kind: "stop".to_owned(),
            });
        }
    }
    commands.sort_by(|left, right| left.id.cmp(&right.id));

    NativeAudioLifecycleTrace {
        active_loops,
        commands: commands.iter().map(audio_command_report).collect(),
        lifecycle,
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
