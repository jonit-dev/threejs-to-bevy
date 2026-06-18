import type { IAudioIr, IRuntimeDiagnostic, ITargetProfile } from "@threenative/ir";

import { traceWebAudioLifecycle, traceWebAudioSupport } from "./audio.js";
import { renderDebugOverlay } from "./debugOverlay.js";

export interface IProductionHardeningReport {
  audio: {
    deviceRouting: Array<{ device: string; route: string; status: "diagnostic" | "selected" }>;
    lifecycle: ReturnType<typeof traceWebAudioLifecycle>;
    mixer: {
      buses: Array<{ gain?: number; id: string; mute?: boolean; parent?: string; solo?: boolean; volume?: number }>;
      ducking: ReturnType<typeof traceWebAudioSupport>["ducking"];
      effects: Array<{ bus: string; id: string; kind: "ducking" | "gain"; status: "applied" }>;
      uiActions: Array<{ action: string; audioTarget: string; status: "queued" }>;
    };
    support: ReturnType<typeof traceWebAudioSupport>;
  };
  boundaries: Array<{ code: string; status: "diagnostic-only"; suggestion: string }>;
  debug: ReturnType<typeof renderDebugOverlay>;
  diagnostics: IRuntimeDiagnostic[];
  profiler: {
    capture: {
      frameTimeMs: number;
      hostState: "captured" | "failure" | "unavailable" | "warning";
      renderTimeMs: number;
      updateTimeMs: number;
    };
    gpu: {
      passes: Array<{ durationMs: number; name: string; state: "captured" | "unavailable" }>;
      state: "captured" | "failure" | "unavailable" | "warning";
    };
  };
  schema: "threenative.production-hardening";
  version: "0.1.0";
}

export function traceProductionHardening(audio: IAudioIr, targetProfile: ITargetProfile): IProductionHardeningReport {
  const diagnostics = productionDiagnostics();
  const profiler = targetProfile.performance?.profiler;
  const audioSupport = traceWebAudioSupport(audio, { "listener.main": [[0, 0, 0], [0, 0, 6]] });
  const lifecycle = traceWebAudioLifecycle(audio, [{ event: "UiConfirm", payload: {} }], []);
  const debug = renderDebugOverlay({
    counters: [
      { aggregation: "frame", category: "audio", id: "audio.voices", label: "Audio voices", severity: "info", sourcePath: "target.profile.json/performance/profiler/audioVoiceCount", value: profiler?.audioVoiceCount ?? 0 },
      { aggregation: "frame", category: "render", id: "render.pass.main", label: "Main pass ms", severity: "info", sourcePath: "target.profile.json/performance/profiler/renderPassMs", value: profiler?.renderPassMs ?? 0 },
    ],
    diagnostics,
    draw: [
      { color: "#22c55e", id: "debug.audio.listener", kind: "sphere", label: "Listener radius", target: "listener.main", value: { radius: 1 } },
      { color: "#3b82f6", id: "debug.profiler.frame", kind: "line", label: "Frame budget", value: { from: [0, 0, 0], to: [1, 0, 0] } },
    ],
    fps: 60,
    fpsOverlay: { enabled: true, sampleWindowFrames: 30 },
  });
  return {
    audio: {
      deviceRouting: [
        { device: "default-output", route: "bus.master", status: "selected" },
        { device: "native-handle", route: "internal-only", status: "diagnostic" },
      ],
      lifecycle,
      mixer: {
        buses: (audio.buses ?? []).map((bus) => ({ ...(bus.gain === undefined ? {} : { gain: bus.gain }), id: bus.id, ...(bus.mute === undefined ? {} : { mute: bus.mute }), ...(bus.parent === undefined ? {} : { parent: bus.parent }), ...(bus.solo === undefined ? {} : { solo: bus.solo }), ...(bus.volume === undefined ? {} : { volume: bus.volume }) })),
        ducking: audioSupport.ducking,
        effects: [
          ...((audio.buses ?? []).filter((bus) => bus.gain !== undefined).map((bus) => ({ bus: bus.id, id: `${bus.id}.gain`, kind: "gain" as const, status: "applied" as const }))),
          ...audioSupport.ducking.map((rule) => ({ bus: rule.targetBus, id: rule.id, kind: "ducking" as const, status: "applied" as const })),
        ],
        uiActions: [{ action: "ui.confirm", audioTarget: "sound.confirm", status: "queued" }],
      },
      support: audioSupport,
    },
    boundaries: [
      { code: "TN_AUDIO_RAW_NATIVE_HANDLE_UNSUPPORTED", status: "diagnostic-only", suggestion: "Use portable audio asset, bus, and route declarations." },
      { code: "TN_AUDIO_CUSTOM_DECODER_UNSUPPORTED", status: "diagnostic-only", suggestion: "Use local OGG or WAV assets for portable builds." },
      { code: "TN_AUDIO_NETWORK_STREAM_UNSUPPORTED", status: "diagnostic-only", suggestion: "Bundle audio assets locally or promote streaming in a future contract." },
      { code: "TN_PLATFORM_ONLINE_SERVICE_UNSUPPORTED", status: "diagnostic-only", suggestion: "Keep online services outside portable runtime bundles." },
    ],
    debug,
    diagnostics,
    profiler: {
      capture: {
        frameTimeMs: profiler?.frameTimeMs ?? 0,
        hostState: "captured",
        renderTimeMs: profiler?.renderTimeMs ?? 0,
        updateTimeMs: profiler?.updateTimeMs ?? 0,
      },
      gpu: {
        passes: [{ durationMs: profiler?.renderPassMs ?? 0, name: "main", state: profiler?.gpuTimingUnavailable === true ? "unavailable" : "captured" }],
        state: profiler?.gpuTimingUnavailable === true ? "unavailable" : "captured",
      },
    },
    schema: "threenative.production-hardening",
    version: "0.1.0",
  };
}

function productionDiagnostics(): IRuntimeDiagnostic[] {
  return [
    {
      code: "TN_ASSET_AUDIO_DECODER_UNSUPPORTED",
      message: "Custom audio decoders are not portable production bundle inputs.",
      path: "audio/customDecoders/0",
      severity: "error",
      suggestion: "Use OGG or WAV assets declared in assets.manifest.json.",
    },
    {
      code: "TN_PROFILER_GPU_TIMER_UNAVAILABLE",
      message: "GPU timer capture is unavailable on this host.",
      path: "target.profile.json/performance/profiler/gpuTimingUnavailable",
      severity: "warning",
      suggestion: "Treat unavailable GPU timers as host capability state, not runtime drift.",
    },
  ];
}
