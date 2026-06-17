use threenative_loader::{
    AudioAttenuationIr, AudioBusIr, AudioControlIr, AudioDuckingRuleIr, AudioEmitterIr, AudioIr,
    AudioListenerBindingIr, AudioListenerIr, AudioMusicIr, AudioMusicTransitionIr, AudioOneShotIr,
    AudioToneIr,
};
use threenative_runtime::audio::{
    NativeAudioCommandKind, handle_audio_events, observe_audio, start_audio, trace_audio_lifecycle,
    trace_audio_support,
};

mod support;
use support::load_conformance_fixture;

#[test]
fn audio_should_start_looping_music_from_audio_ir() {
    let audio = AudioIr {
        schema: "threenative.audio".to_owned(),
        version: "0.1.0".to_owned(),
        buses: vec![],
        controls: vec![],
        ducking_rules: vec![],
        emitters: vec![],
        listeners: vec![],
        music: vec![AudioMusicIr {
            id: "music.arena".to_owned(),
            asset: "arena.music".to_owned(),
            autoplay: Some(true),
            bus: None,
            looped: Some(true),
            pitch: None,
            volume: Some(0.4),
        }],
        music_transitions: vec![],
        one_shots: vec![],
        tones: vec![],
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
        buses: vec![],
        controls: vec![],
        ducking_rules: vec![],
        emitters: vec![],
        listeners: vec![],
        music: vec![],
        music_transitions: vec![],
        one_shots: vec![AudioOneShotIr {
            id: "sound.hit".to_owned(),
            asset: "hit.sound".to_owned(),
            bus: None,
            emitter: None,
            event: "DamageEvent".to_owned(),
            pitch: None,
            volume: Some(0.75),
        }],
        tones: vec![],
    };

    let commands = handle_audio_events(&audio, &["DamageEvent"]);

    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0].asset, "hit.sound");
    assert_eq!(commands[0].event.as_deref(), Some("DamageEvent"));
    assert_eq!(commands[0].kind, NativeAudioCommandKind::OneShot);
    assert_eq!(commands[0].volume, Some(0.75));
}

#[test]
fn audio_should_preserve_bus_and_spatial_emitter_observations() {
    let audio = AudioIr {
        schema: "threenative.audio".to_owned(),
        version: "0.1.0".to_owned(),
        buses: vec![AudioBusIr {
            gain: None,
            id: "bus.sfx".to_owned(),
            mute: None,
            parent: None,
            solo: None,
            volume: Some(0.8),
        }],
        controls: vec![],
        ducking_rules: vec![],
        emitters: vec![AudioEmitterIr {
            attenuation: None,
            id: "emitter.player".to_owned(),
            position: [1.0, 2.0, 3.0],
            radius: Some(12.0),
        }],
        listeners: vec![AudioListenerIr {
            binding: None,
            id: "listener.main".to_owned(),
            position: [0.0, 1.0, 5.0],
        }],
        music: vec![AudioMusicIr {
            id: "music.arena".to_owned(),
            asset: "arena.music".to_owned(),
            autoplay: Some(true),
            bus: Some("bus.sfx".to_owned()),
            looped: Some(true),
            pitch: None,
            volume: None,
        }],
        music_transitions: vec![],
        one_shots: vec![AudioOneShotIr {
            id: "sound.hit".to_owned(),
            asset: "hit.sound".to_owned(),
            bus: Some("bus.sfx".to_owned()),
            emitter: Some("emitter.player".to_owned()),
            event: "DamageEvent".to_owned(),
            pitch: None,
            volume: None,
        }],
        tones: vec![],
    };

    let mut commands = start_audio(&audio);
    commands.extend(handle_audio_events(&audio, &["DamageEvent"]));

    assert_eq!(commands[0].bus.as_deref(), Some("bus.sfx"));
    assert_eq!(commands[0].emitter, None);
    assert_eq!(commands[1].bus.as_deref(), Some("bus.sfx"));
    assert_eq!(commands[1].emitter.as_deref(), Some("emitter.player"));
}

#[test]
fn should_report_attenuation_and_ducking_observations_when_listener_moves() {
    let audio = AudioIr {
        schema: "threenative.audio".to_owned(),
        version: "0.1.0".to_owned(),
        buses: vec![
            AudioBusIr {
                gain: Some(1.0),
                id: "bus.master".to_owned(),
                mute: None,
                parent: None,
                solo: None,
                volume: None,
            },
            AudioBusIr {
                gain: Some(0.8),
                id: "bus.music".to_owned(),
                mute: None,
                parent: Some("bus.master".to_owned()),
                solo: None,
                volume: None,
            },
            AudioBusIr {
                gain: None,
                id: "bus.sfx".to_owned(),
                mute: None,
                parent: None,
                solo: None,
                volume: Some(0.9),
            },
        ],
        controls: vec![],
        ducking_rules: vec![AudioDuckingRuleIr {
            attack: 0.05,
            gain: 0.35,
            id: "duck.music".to_owned(),
            release: 0.2,
            source_bus: "bus.sfx".to_owned(),
            target_bus: "bus.music".to_owned(),
        }],
        emitters: vec![AudioEmitterIr {
            attenuation: Some(AudioAttenuationIr {
                curve: "linear".to_owned(),
                max_distance: 10.0,
                min_distance: 1.0,
                rolloff_factor: 1.0,
            }),
            id: "emitter.alarm".to_owned(),
            position: [0.0, 0.0, 0.0],
            radius: None,
        }],
        listeners: vec![AudioListenerIr {
            binding: Some(AudioListenerBindingIr {
                entity: None,
                kind: "activeCamera".to_owned(),
            }),
            id: "listener.main".to_owned(),
            position: [1.0, 0.0, 0.0],
        }],
        music: vec![
            AudioMusicIr {
                id: "music.intro".to_owned(),
                asset: "intro.music".to_owned(),
                autoplay: Some(true),
                bus: Some("bus.music".to_owned()),
                looped: Some(true),
                pitch: None,
                volume: None,
            },
            AudioMusicIr {
                id: "music.loop".to_owned(),
                asset: "loop.music".to_owned(),
                autoplay: Some(false),
                bus: Some("bus.music".to_owned()),
                looped: Some(true),
                pitch: None,
                volume: None,
            },
        ],
        music_transitions: vec![AudioMusicTransitionIr {
            duration: Some(2.0),
            from: Some("music.intro".to_owned()),
            id: "transition.loop".to_owned(),
            kind: "crossfade".to_owned(),
            playback_id: "music.state.loop".to_owned(),
            state: "playing".to_owned(),
            to: "music.loop".to_owned(),
        }],
        one_shots: vec![],
        tones: vec![AudioToneIr {
            bus: Some("bus.sfx".to_owned()),
            duration: 0.25,
            frequency: Some(880.0),
            id: "tone.confirm".to_owned(),
            pitch: None,
            volume: None,
            waveform: "sine".to_owned(),
        }],
    };

    let trace = trace_audio_support(
        &audio,
        &[("listener.main", vec![[1.0, 0.0, 0.0], [10.0, 0.0, 0.0]])],
    );

    assert_eq!(trace.attenuation[0].gain, 1.0);
    assert_eq!(trace.attenuation[1].gain, 0.0);
    assert_eq!(trace.ducking[0].target_bus, "bus.music");
    assert_eq!(trace.listener_bindings[0].kind, "activeCamera");
    assert_eq!(trace.music_transitions[0].playback_id, "music.state.loop");
    assert_eq!(trace.tones[0].waveform, "sine");
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

#[test]
fn audio_lifecycle_trace_should_apply_playback_controls() {
    let audio = AudioIr {
        schema: "threenative.audio".to_owned(),
        version: "0.1.0".to_owned(),
        buses: vec![],
        controls: vec![
            AudioControlIr {
                at: None,
                id: "music.pause".to_owned(),
                kind: "pause".to_owned(),
                target: "music.arena".to_owned(),
            },
            AudioControlIr {
                at: None,
                id: "music.queryPaused".to_owned(),
                kind: "query".to_owned(),
                target: "music.arena".to_owned(),
            },
            AudioControlIr {
                at: Some(8.5),
                id: "music.seek".to_owned(),
                kind: "seek".to_owned(),
                target: "music.arena".to_owned(),
            },
            AudioControlIr {
                at: None,
                id: "music.resume".to_owned(),
                kind: "resume".to_owned(),
                target: "music.arena".to_owned(),
            },
            AudioControlIr {
                at: None,
                id: "music.stop".to_owned(),
                kind: "stop".to_owned(),
                target: "music.arena".to_owned(),
            },
            AudioControlIr {
                at: None,
                id: "music.queryStopped".to_owned(),
                kind: "query".to_owned(),
                target: "music.arena".to_owned(),
            },
        ],
        ducking_rules: vec![],
        emitters: vec![],
        listeners: vec![],
        music: vec![AudioMusicIr {
            id: "music.arena".to_owned(),
            asset: "arena.music".to_owned(),
            autoplay: Some(true),
            bus: None,
            looped: Some(true),
            pitch: None,
            volume: None,
        }],
        music_transitions: vec![],
        one_shots: vec![],
        tones: vec![],
    };

    let trace = trace_audio_lifecycle(&audio, &[], &[]);

    assert!(trace.active_loops.is_empty());
    assert!(trace.paused_loops.is_empty());
    assert_eq!(trace.lifecycle.len(), 7);
    assert_eq!(trace.lifecycle[1].kind, "pause");
    assert_eq!(trace.lifecycle[2].state.as_deref(), Some("paused"));
    assert_eq!(trace.lifecycle[3].kind, "seek");
    assert_eq!(trace.lifecycle[3].at, Some(8.5));
    assert_eq!(trace.lifecycle[4].kind, "resume");
    assert_eq!(trace.lifecycle[5].kind, "stop");
    assert_eq!(trace.lifecycle[6].state.as_deref(), Some("stopped"));
}

#[test]
fn audio_lifecycle_trace_should_stop_active_loops() {
    let fixture = load_conformance_fixture("v7-spatial-audio-buses");
    let audio = fixture
        .bundle
        .audio
        .as_ref()
        .expect("audio fixture should load");

    let trace = trace_audio_lifecycle(audio, &["DamageEvent"], &["music.arena"]);

    assert!(trace.active_loops.is_empty());
    assert_eq!(trace.lifecycle.len(), 2);
    assert_eq!(trace.lifecycle[0].kind, "start");
    assert_eq!(trace.lifecycle[1].kind, "stop");
    assert_eq!(trace.commands.len(), 2);
    assert_eq!(trace.commands[0].bus.as_deref(), Some("bus.music"));
    assert_eq!(trace.commands[1].emitter.as_deref(), Some("emitter.player"));
}
