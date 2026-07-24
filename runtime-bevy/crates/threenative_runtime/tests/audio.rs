use bevy::{
    asset::AssetPlugin,
    audio::{AudioSource, PlaybackMode},
    prelude::*,
};
use serde_json::json;
use std::fs;
use threenative_components::ThreeNativeId;
use threenative_loader::{
    AudioAttenuationIr, AudioBusIr, AudioControlIr, AudioDuckingRuleIr, AudioEmitterIr, AudioIr,
    AudioListenerBindingIr, AudioListenerIr, AudioMusicIr, AudioMusicTransitionIr, AudioOneShotIr,
    AudioToneIr, load_bundle,
};
use threenative_runtime::audio::{
    NativeAudioCommandKind, NativeAudioDiagnostics, NativeAudioEventCursors, NativeAudioEventQueue,
    NativeAudioPlayback, NativeAudioPlaybackStates, NativeAudioRuntime, NativeAudioServiceQueue,
    ScriptAudioPlayOptions, ScriptAudioRuntimeController, ScriptAudioUpdateOptions,
    apply_native_audio_service_effects,
    handle_audio_events, observe_audio, play_new_native_audio_events,
    queue_native_audio_service_effects, queue_new_native_audio_events, start_audio,
    trace_audio_lifecycle, trace_audio_support,
};
use threenative_runtime::systems_effects::{NativeSystemEffectLog, NativeSystemEffectLogEntry};
use threenative_runtime::{
    systems_context::NativeSystemTimeSnapshot, systems_host::run_native_systems_once,
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
fn native_audio_execution_event_one_shot() {
    let fixture = load_conformance_fixture("audio-playback");
    let runtime = NativeAudioRuntime::from_bundle(&fixture.bundle);
    let mut app = App::new();
    app.add_plugins((MinimalPlugins, AssetPlugin::default()));
    app.init_asset::<AudioSource>();
    app.insert_resource(runtime);
    app.init_resource::<NativeAudioDiagnostics>();
    let mut events = NativeAudioEventQueue::default();
    let mut cursors = NativeAudioEventCursors::default();
    queue_new_native_audio_events(&mut events, &mut cursors, &fixture.bundle.world.events);
    app.insert_resource(events);
    app.insert_resource(cursors);
    app.add_systems(Update, play_new_native_audio_events);

    app.update();
    let spawned = app
        .world_mut()
        .query::<(&NativeAudioPlayback, &ThreeNativeId, &PlaybackSettings)>()
        .iter(app.world())
        .find(|(playback, _, _)| playback.0 == "sound.hit")
        .map(|(_, id, settings)| (id.0.clone(), settings.mode, settings.volume.get()))
        .expect("event should spawn the mapped native audio entity");
    assert_eq!(spawned.0, "sound.hit");
    assert!(matches!(spawned.1, PlaybackMode::Despawn));
    assert_eq!(spawned.2, 0.75);
    let first_count = 1;
    app.update();
    let second_count = app
        .world_mut()
        .query::<&NativeAudioPlayback>()
        .iter(app.world())
        .filter(|playback| playback.0 == "sound.hit")
        .count();

    assert_eq!(first_count, 1);
    assert_eq!(second_count, 1, "event cursor must prevent replay");

    let mut next_events = fixture.bundle.world.events.clone();
    next_events
        .get_mut("DamageEvent")
        .and_then(serde_json::Value::as_array_mut)
        .expect("damage events")
        .push(json!({ "amount": 1, "target": "player" }));
    app.world_mut()
        .resource_scope(|world, mut cursors: Mut<NativeAudioEventCursors>| {
            let mut queue = world.resource_mut::<NativeAudioEventQueue>();
            queue_new_native_audio_events(&mut queue, &mut cursors, &next_events);
        });
    app.update();
    let third_count = app
        .world_mut()
        .query::<&NativeAudioPlayback>()
        .iter(app.world())
        .filter(|playback| playback.0 == "sound.hit")
        .count();
    assert_eq!(third_count, 2, "only the appended event should play");
}

#[test]
#[allow(
    clippy::too_many_lines,
    reason = "the script-play, stop, and preset-play assertions form one ordered audio queue lifecycle"
)]
fn native_audio_execution_script_playback() {
    let root =
        std::env::temp_dir().join(format!("tn-native-audio-execution-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("assets")).expect("audio test bundle directory");
    fs::write(root.join("assets/hit.wav"), b"").expect("audio test asset");
    for (name, contents) in [
        (
            "manifest.json",
            r#"{"schema":"threenative.bundle","version":"0.1.0","name":"native-audio-execution","requiredCapabilities":{},"entry":{"world":"world.ir.json","systems":"systems.ir.json","scripts":"scripts.bundle.js","audio":"audio.ir.json"},"files":{"assets":"assets.manifest.json","materials":"materials.ir.json","targetProfile":"target.profile.json"}}"#,
        ),
        (
            "assets.manifest.json",
            r#"{"schema":"threenative.assets","version":"0.1.0","assets":[{"id":"hit.sound","kind":"audio","format":"wav","path":"assets/hit.wav"}]}"#,
        ),
        (
            "audio.ir.json",
            r#"{"schema":"threenative.audio","version":"0.1.0","music":[],"oneShots":[{"id":"sound.hit","asset":"hit.sound","event":"DamageEvent","volume":0.75}]}"#,
        ),
        (
            "materials.ir.json",
            r#"{"schema":"threenative.materials","version":"0.1.0","materials":[]}"#,
        ),
        (
            "target.profile.json",
            r#"{"schema":"threenative.target-profile","version":"0.1.0","targets":["desktop"]}"#,
        ),
        (
            "world.ir.json",
            r#"{"schema":"threenative.world","version":"0.1.0","entities":[],"events":{},"resources":{}}"#,
        ),
        (
            "systems.ir.json",
            r#"{"schema":"threenative.systems","version":"0.1.0","scriptAudio":[{"id":"sound.hit"}],"systems":[{"name":"audioFacade","schedule":"update","reads":[],"writes":[],"queries":[],"commands":[],"eventReads":[],"eventWrites":[],"resourceReads":[],"resourceWrites":[],"services":["audio.play"],"script":{"bundle":"scripts.bundle.js","exportName":"system_audioFacade"}}]}"#,
        ),
        (
            "scripts.bundle.js",
            r#"const system_audioFacade = (ctx) => { ctx.audio.play("sound.hit"); }; export const systems = Object.freeze({ system_audioFacade });"#,
        ),
    ] {
        fs::write(root.join(name), contents).expect("audio test bundle file");
    }
    let mut bundle = load_bundle(&root).expect("script audio bundle should load");
    let run = run_native_systems_once(
        &mut bundle,
        NativeSystemTimeSnapshot {
            delta: 0.016,
            dt: 0.016,
            elapsed: 1.0,
            fixed_delta: 0.016,
            fixed_dt: 0.016,
            paused: false,
        },
    )
    .expect("script calling context.audio.play should run");
    let mut queue = NativeAudioServiceQueue::default();
    let service_log = |service: &str, payload| NativeSystemEffectLog {
        entries: vec![NativeSystemEffectLogEntry {
            command: None,
            component: None,
            entity: None,
            event: None,
            frame: 1,
            kind: "service".to_owned(),
            payload: Some(payload),
            reconciliation: None,
            resource: None,
            schedule: "update".to_owned(),
            service: Some(service.to_owned()),
            system: "audio-test".to_owned(),
            tick: 1,
            value: None,
        }],
        schema: "threenative.web-system-effects",
        version: 1,
    };
    queue_native_audio_service_effects(&mut queue, &run.logs);
    let mut app = App::new();
    app.add_plugins((MinimalPlugins, AssetPlugin::default()));
    app.init_asset::<AudioSource>();
    app.insert_resource(NativeAudioRuntime::from_bundle(&bundle));
    app.insert_resource(queue);
    app.init_resource::<NativeAudioPlaybackStates>();
    app.init_resource::<NativeAudioDiagnostics>();
    app.add_systems(Update, apply_native_audio_service_effects);

    app.update();
    assert!(
        app.world_mut()
            .query::<&NativeAudioPlayback>()
            .iter(app.world())
            .any(|playback| playback.0 == "sound.hit#1")
    );

    let mut stop_queue = app.world_mut().resource_mut::<NativeAudioServiceQueue>();
    queue_native_audio_service_effects(
        &mut stop_queue,
        &[service_log(
            "audio.stop",
            json!({
                "request": { "playbackId": "sound.hit#1" },
                "result": {
                    "accepted": true,
                    "playbackId": "sound.hit#1",
                    "soundId": "sound.hit",
                    "status": "stopped"
                }
            }),
        )],
    );
    app.update();
    assert!(
        !app.world_mut()
            .query::<&NativeAudioPlayback>()
            .iter(app.world())
            .any(|playback| playback.0 == "sound.hit#1")
    );
    assert_eq!(
        app.world().resource::<NativeAudioPlaybackStates>().0["sound.hit#1"],
        "stopped"
    );

    let mut preset_queue = app.world_mut().resource_mut::<NativeAudioServiceQueue>();
    queue_native_audio_service_effects(
        &mut preset_queue,
        &[service_log(
            "effects.play",
            json!({
                "audio": {
                    "accepted": true,
                    "loop": false,
                    "playbackId": "sound.hit#2",
                    "soundId": "sound.hit",
                    "status": "playing"
                },
                "result": { "accepted": true, "preset": "hit", "status": "enqueued" }
            }),
        )],
    );
    app.update();
    assert!(
        app.world_mut()
            .query::<&NativeAudioPlayback>()
            .iter(app.world())
            .any(|playback| playback.0 == "sound.hit#2"),
        "effects.play preset audio should share script playback dispatch"
    );
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
    let fixture = load_conformance_fixture("audio-playback");

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
fn audio_observation_should_preserve_repeated_event_multiplicity() {
    let mut fixture = load_conformance_fixture("audio-playback");
    fixture.bundle.world.events.insert(
        "DamageEvent".to_owned(),
        json!([
            { "amount": 1, "target": "player" },
            { "amount": 2, "target": "player" },
            { "amount": 3, "target": "player" }
        ]),
    );

    let observation = observe_audio(&fixture.bundle).expect("audio observation should exist");
    let damage_commands = observation
        .commands
        .iter()
        .filter(|command| command.event.as_deref() == Some("DamageEvent"))
        .collect::<Vec<_>>();

    assert_eq!(damage_commands.len(), 3);
    assert!(
        damage_commands
            .iter()
            .all(|command| command.id == "sound.hit")
    );
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
        tones: vec![AudioToneIr {
            bus: Some("bus.sfx".to_owned()),
            duration: 0.2,
            frequency: Some(880.0),
            id: "tone.confirm".to_owned(),
            pitch: Some(1.0),
            volume: Some(0.5),
            waveform: "sine".to_owned(),
        }],
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
    let tone = trace
        .commands
        .iter()
        .find(|command| command.kind == "tone")
        .expect("generated tone command should be traced");
    assert_eq!(tone.asset, "generated:tone.confirm");
    assert_eq!(tone.pitch, Some(1.0));
    assert_eq!(
        tone.tone.as_ref().map(|tone| tone.waveform.as_str()),
        Some("sine")
    );
}

#[test]
fn audio_lifecycle_trace_should_stop_active_loops() {
    let fixture = load_conformance_fixture("spatial-audio-buses");
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

#[test]
fn should_play_and_stop_declared_logical_audio() {
    let mut audio = ScriptAudioRuntimeController::from_audio(Some(&AudioIr {
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
    }));

    let play = audio.play(
        "sound.hit",
        ScriptAudioPlayOptions {
            entity: Some("player".to_owned()),
            loop_: None,
            pitch: None,
            raw: Default::default(),
            volume: None,
        },
    );
    let update = audio.update(
        &play.playback_id,
        ScriptAudioUpdateOptions {
            pitch: Some(1.5),
            ramp_seconds: Some(0.25),
            volume: Some(0.8),
        },
    );
    let stop = audio.stop(&play.playback_id);
    let query = audio.query(&play.playback_id);

    assert_eq!(play.playback_id, "sound.hit#1");
    assert_eq!(play.status, "playing");
    assert_eq!(update.pitch, Some(1.5));
    assert_eq!(update.volume, Some(0.8));
    assert_eq!(update.ramp_seconds, Some(0.25));
    assert_eq!(stop.status, "stopped");
    assert_eq!(query.status, "stopped");
    assert_eq!(
        audio
            .update(
                &play.playback_id,
                ScriptAudioUpdateOptions {
                    pitch: Some(1.2),
                    ..Default::default()
                },
            )
            .reason
            .as_deref(),
        Some("stopped")
    );
}
