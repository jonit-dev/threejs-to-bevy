use threenative_loader::{AudioIr, AudioMusicIr, AudioOneShotIr};
use threenative_runtime::audio::{
    NativeAudioCommandKind, handle_audio_events, observe_audio, start_audio,
};

mod support;
use support::load_conformance_fixture;

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
            volume: Some(0.4),
        }],
        one_shots: vec![],
    };

    let commands = start_audio(&audio);

    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0].asset, "arena.music");
    assert_eq!(commands[0].kind, NativeAudioCommandKind::Loop);
    assert_eq!(commands[0].volume, Some(0.4));
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
            volume: Some(0.75),
        }],
    };

    let commands = handle_audio_events(&audio, &["DamageEvent"]);

    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0].asset, "hit.sound");
    assert_eq!(commands[0].event.as_deref(), Some("DamageEvent"));
    assert_eq!(commands[0].kind, NativeAudioCommandKind::OneShot);
    assert_eq!(commands[0].volume, Some(0.75));
}

#[test]
fn audio_should_report_fixture_playback_observations() {
    let fixture = load_conformance_fixture("v6-audio-playback");

    let observation = observe_audio(&fixture.bundle).expect("audio observation should exist");

    assert!(observation.diagnostics.is_empty());
    assert_eq!(observation.commands.len(), 2);
    assert_eq!(observation.commands[0].id, "music.arena");
    assert_eq!(observation.commands[0].asset, "arena.music");
    assert_eq!(observation.commands[0].kind, NativeAudioCommandKind::Loop);
    assert_eq!(observation.commands[0].volume, Some(0.4));
    assert_eq!(observation.commands[1].id, "sound.hit");
    assert_eq!(observation.commands[1].asset, "hit.sound");
    assert_eq!(
        observation.commands[1].event.as_deref(),
        Some("DamageEvent")
    );
    assert_eq!(
        observation.commands[1].kind,
        NativeAudioCommandKind::OneShot
    );
    assert_eq!(observation.commands[1].volume, Some(0.75));
}
