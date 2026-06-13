use threenative_loader::{AudioIr, AudioMusicIr, AudioOneShotIr};
use threenative_runtime::audio::{NativeAudioCommandKind, handle_audio_events, start_audio};

#[test]
fn audio_should_start_looping_music_from_audio_ir() {
    let audio = AudioIr {
        schema: "threenative.audio".to_owned(),
        version: "0.1.0".to_owned(),
        music: vec![AudioMusicIr {
            id: "music.arena".to_owned(),
            asset: "arena.music".to_owned(),
            autoplay: Some(true),
            looped: Some(true),
        }],
        one_shots: vec![],
    };

    let commands = start_audio(&audio);

    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0].asset, "arena.music");
    assert_eq!(commands[0].kind, NativeAudioCommandKind::Loop);
}

#[test]
fn audio_should_play_one_shot_for_matching_event() {
    let audio = AudioIr {
        schema: "threenative.audio".to_owned(),
        version: "0.1.0".to_owned(),
        music: vec![],
        one_shots: vec![AudioOneShotIr {
            id: "sound.hit".to_owned(),
            asset: "hit.sound".to_owned(),
            event: "DamageEvent".to_owned(),
        }],
    };

    let commands = handle_audio_events(&audio, &["DamageEvent"]);

    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0].asset, "hit.sound");
    assert_eq!(commands[0].event.as_deref(), Some("DamageEvent"));
    assert_eq!(commands[0].kind, NativeAudioCommandKind::OneShot);
}
