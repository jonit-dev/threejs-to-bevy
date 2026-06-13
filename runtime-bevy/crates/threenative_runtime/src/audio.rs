use threenative_loader::AudioIr;

#[derive(Clone, Debug, PartialEq)]
pub struct NativeAudioCommand {
    pub asset: String,
    pub event: Option<String>,
    pub id: String,
    pub kind: NativeAudioCommandKind,
}

#[derive(Clone, Debug, PartialEq)]
pub enum NativeAudioCommandKind {
    Loop,
    OneShot,
}

pub fn start_audio(audio: &AudioIr) -> Vec<NativeAudioCommand> {
    audio
        .music
        .iter()
        .filter(|music| music.looped.unwrap_or(false) && music.autoplay.unwrap_or(true))
        .map(|music| NativeAudioCommand {
            asset: music.asset.clone(),
            event: None,
            id: music.id.clone(),
            kind: NativeAudioCommandKind::Loop,
        })
        .collect()
}

pub fn handle_audio_events(audio: &AudioIr, events: &[&str]) -> Vec<NativeAudioCommand> {
    events
        .iter()
        .flat_map(|event| {
            audio.one_shots
                .iter()
                .filter(move |one_shot| one_shot.event == **event)
                .map(move |one_shot| NativeAudioCommand {
                    asset: one_shot.asset.clone(),
                    event: Some((*event).to_owned()),
                    id: one_shot.id.clone(),
                    kind: NativeAudioCommandKind::OneShot,
                })
        })
        .collect()
}
