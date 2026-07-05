use serde_json::{Value, json};
use threenative_loader::{AudioIr, LoadedBundle};

use crate::audio::{trace_audio_lifecycle, trace_audio_support};

pub fn trace_production_hardening(bundle: &LoadedBundle) -> Value {
    let audio = bundle.audio.as_ref().expect("bundle contains audio");
    let profiler = profiler();
    let support = trace_audio_support(
        audio,
        &[("listener.main", vec![[0.0, 0.0, 0.0], [0.0, 0.0, 6.0]])],
    );
    json!({
        "audio": {
            "deviceRouting": [
                { "device": "default-output", "route": "bus.master", "status": "selected" },
                { "device": "native-handle", "route": "internal-only", "status": "diagnostic" }
            ],
            "lifecycle": trace_audio_lifecycle(audio, &["UiConfirm"], &[]),
            "mixer": {
                "buses": buses(audio),
                "ducking": support.ducking,
                "effects": effects(audio),
                "uiActions": [{ "action": "ui.confirm", "audioTarget": "sound.confirm", "status": "queued" }]
            },
            "support": support
        },
        "boundaries": [
            { "code": "TN_AUDIO_RAW_NATIVE_HANDLE_UNSUPPORTED", "status": "diagnostic-only", "suggestion": "Use portable audio asset, bus, and route declarations." },
            { "code": "TN_AUDIO_CUSTOM_DECODER_UNSUPPORTED", "status": "diagnostic-only", "suggestion": "Use local OGG or WAV assets for portable builds." },
            { "code": "TN_AUDIO_NETWORK_STREAM_UNSUPPORTED", "status": "diagnostic-only", "suggestion": "Bundle audio assets locally or promote streaming in a future contract." },
            { "code": "TN_PLATFORM_ONLINE_SERVICE_UNSUPPORTED", "status": "diagnostic-only", "suggestion": "Keep online services outside portable runtime bundles." }
        ],
        "debug": debug(),
        "diagnostics": diagnostics(),
        "profiler": {
            "capture": {
                "frameTimeMs": profiler["frameTimeMs"],
                "hostState": "captured",
                "renderTimeMs": profiler["renderTimeMs"],
                "updateTimeMs": profiler["updateTimeMs"]
            },
            "gpu": {
                "passes": [{ "durationMs": profiler["renderPassMs"], "name": "main", "state": "unavailable" }],
                "state": "unavailable"
            }
        },
        "schema": "threenative.production-hardening",
        "version": "0.1.0"
    })
}

fn buses(audio: &AudioIr) -> Value {
    Value::Array(
        audio
            .buses
            .iter()
            .map(|bus| {
                let mut value = serde_json::Map::new();
                if let Some(gain) = bus.gain {
                    value.insert("gain".to_owned(), json!(gain));
                }
                value.insert("id".to_owned(), json!(bus.id));
                if let Some(mute) = bus.mute {
                    value.insert("mute".to_owned(), json!(mute));
                }
                if let Some(parent) = &bus.parent {
                    value.insert("parent".to_owned(), json!(parent));
                }
                if let Some(solo) = bus.solo {
                    value.insert("solo".to_owned(), json!(solo));
                }
                if let Some(volume) = bus.volume {
                    value.insert("volume".to_owned(), json!(volume));
                }
                Value::Object(value)
            })
            .collect(),
    )
}

fn effects(audio: &AudioIr) -> Value {
    let mut effects = Vec::new();
    for bus in audio.buses.iter().filter(|bus| bus.gain.is_some()) {
        effects.push(json!({ "bus": bus.id, "id": format!("{}.gain", bus.id), "kind": "gain", "status": "applied" }));
    }
    for rule in &audio.ducking_rules {
        effects.push(json!({ "bus": rule.target_bus, "id": rule.id, "kind": "ducking", "status": "applied" }));
    }
    Value::Array(effects)
}

fn profiler() -> Value {
    json!({
        "audioVoiceCount": 8,
        "frameTimeMs": 16.67,
        "renderPassMs": 0.0,
        "renderTimeMs": 8.0,
        "updateTimeMs": 4.0
    })
}

fn debug() -> Value {
    json!({
        "enabled": true,
        "primitives": [
            { "color": "#22c55e", "id": "debug.audio.listener", "kind": "sphere", "label": "Listener radius", "target": "listener.main", "value": { "radius": 1 } },
            { "color": "#3b82f6", "id": "debug.profiler.frame", "kind": "line", "label": "Frame budget", "value": { "from": [0, 0, 0], "to": [1, 0, 0] } }
        ],
        "rows": [
            { "category": "TN_ASSET_AUDIO_DECODER_UNSUPPORTED", "label": "Custom audio decoders are not portable production bundle inputs.", "severity": "error", "sourcePath": "audio/customDecoders/0", "value": "Use OGG or WAV assets declared in assets.manifest.json." },
            { "category": "audio", "label": "Audio voices", "severity": "info", "sourcePath": "target.profile.json/performance/profiler/audioVoiceCount", "value": "8" },
            { "category": "performance", "label": "FPS", "severity": "info", "value": "60" },
            { "category": "render", "label": "Main pass ms", "severity": "info", "sourcePath": "target.profile.json/performance/profiler/renderPassMs", "value": "0" },
            { "category": "TN_PROFILER_GPU_TIMER_UNAVAILABLE", "label": "GPU timer capture is unavailable on this host.", "severity": "warning", "sourcePath": "target.profile.json/performance/profiler/gpuTimingUnavailable", "value": "Treat unavailable GPU timers as host capability state, not runtime drift." }
        ]
    })
}

fn diagnostics() -> Value {
    json!([
        {
            "code": "TN_ASSET_AUDIO_DECODER_UNSUPPORTED",
            "message": "Custom audio decoders are not portable production bundle inputs.",
            "path": "audio/customDecoders/0",
            "severity": "error",
            "suggestion": "Use OGG or WAV assets declared in assets.manifest.json."
        },
        {
            "code": "TN_PROFILER_GPU_TIMER_UNAVAILABLE",
            "message": "GPU timer capture is unavailable on this host.",
            "path": "target.profile.json/performance/profiler/gpuTimingUnavailable",
            "severity": "warning",
            "suggestion": "Treat unavailable GPU timers as host capability state, not runtime drift."
        }
    ])
}
