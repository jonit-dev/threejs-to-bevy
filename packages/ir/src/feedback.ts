import type { IIrDiagnostic } from "./validate.js";
import { validateFiniteRange } from "./validationPrimitives.js";

export const FEEDBACK_PRESET_IDS = ["dust", "explosion", "pickup-sparkle", "trail"] as const;
export type FeedbackPresetId = (typeof FEEDBACK_PRESET_IDS)[number];
export type FeedbackParticleCommand = "burst" | "emit" | "play";

export interface IFeedbackPresetAudio {
  pitch?: number;
  pitchVariance?: number;
  soundId: string;
  volume?: number;
}

export interface IFeedbackPresetCamera {
  amplitude: number;
  duration: number;
  frequency: number;
}

export interface IFeedbackPresetParticle {
  asset: string;
  command: FeedbackParticleCommand;
  count?: number;
  emitter: string;
  lifetime?: number;
}

export interface IFeedbackPreset {
  audio?: IFeedbackPresetAudio;
  camera?: IFeedbackPresetCamera;
  id: string;
  particles?: IFeedbackPresetParticle[];
}

/** The registry owns the stable ids; project systems documents provide bindings. */
export const DEFAULT_FEEDBACK_PRESETS: readonly IFeedbackPreset[] = FEEDBACK_PRESET_IDS.map((id) => ({ id }));

export function feedbackPresetById(
  presets: readonly IFeedbackPreset[] | undefined,
  id: string,
): IFeedbackPreset | undefined {
  return (presets ?? DEFAULT_FEEDBACK_PRESETS).find((preset) => preset.id === id);
}

export function validateFeedbackPresets(
  presets: ISystemsFeedbackPresets | undefined,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (presets === undefined) {
    return;
  }
  if (!Array.isArray(presets)) {
    diagnostics.push({ code: "TN_IR_FEEDBACK_PRESETS_INVALID", message: "Feedback presets must be an array.", path, severity: "error" });
    return;
  }
  const ids = new Set<string>();
  presets.forEach((preset, index) => {
    const presetPath = `${path}/${index}`;
    if (typeof preset.id !== "string" || preset.id.trim() === "" || preset.id.length > 64) {
      diagnostics.push({ code: "TN_IR_FEEDBACK_PRESET_ID_INVALID", message: "Feedback preset id must be a non-empty string of at most 64 characters.", path: `${presetPath}/id`, severity: "error" });
    } else if (ids.has(preset.id)) {
      diagnostics.push({ code: "TN_IR_FEEDBACK_PRESET_ID_DUPLICATE", message: `Feedback preset '${preset.id}' is duplicated.`, path: `${presetPath}/id`, severity: "error" });
    } else {
      ids.add(preset.id);
    }
    if (preset.audio !== undefined) {
      if (typeof preset.audio.soundId !== "string" || preset.audio.soundId.trim() === "") {
        diagnostics.push({ code: "TN_IR_FEEDBACK_AUDIO_SOUND_INVALID", message: "Feedback audio soundId must be a non-empty string.", path: `${presetPath}/audio/soundId`, severity: "error" });
      }
      validateFiniteRange(preset.audio.pitch, 0.25, 4, `${presetPath}/audio/pitch`, "TN_IR_FEEDBACK_AUDIO_PITCH_INVALID", diagnostics);
      validateFiniteRange(preset.audio.pitchVariance, 0, 1, `${presetPath}/audio/pitchVariance`, "TN_IR_FEEDBACK_AUDIO_PITCH_VARIANCE_INVALID", diagnostics);
      validateFiniteRange(preset.audio.volume, 0, 1, `${presetPath}/audio/volume`, "TN_IR_FEEDBACK_AUDIO_VOLUME_INVALID", diagnostics);
    }
    if (preset.camera !== undefined) {
      validateFiniteRange(preset.camera.amplitude, 0, 2, `${presetPath}/camera/amplitude`, "TN_IR_FEEDBACK_CAMERA_AMPLITUDE_INVALID", diagnostics);
      validateFiniteRange(preset.camera.duration, 0, 5, `${presetPath}/camera/duration`, "TN_IR_FEEDBACK_CAMERA_DURATION_INVALID", diagnostics);
      validateFiniteRange(preset.camera.frequency, 0, 120, `${presetPath}/camera/frequency`, "TN_IR_FEEDBACK_CAMERA_FREQUENCY_INVALID", diagnostics);
    }
    if (preset.particles !== undefined) {
      const particles = preset.particles as unknown;
      if (!Array.isArray(particles) || particles.length > 8) {
        diagnostics.push({ code: "TN_IR_FEEDBACK_PARTICLES_INVALID", message: "Feedback presets may declare at most 8 particle commands.", path: `${presetPath}/particles`, severity: "error" });
      } else {
        (particles as IFeedbackPresetParticle[]).forEach((particle, particleIndex) => {
          const particlePath = `${presetPath}/particles/${particleIndex}`;
          if (typeof particle.asset !== "string" || particle.asset.trim() === "" || typeof particle.emitter !== "string" || particle.emitter.trim() === "") {
            diagnostics.push({ code: "TN_IR_FEEDBACK_PARTICLE_REFERENCE_INVALID", message: "Feedback particle asset and emitter must be non-empty strings.", path: particlePath, severity: "error" });
          }
          if (!(["burst", "emit", "play"] as string[]).includes(particle.command)) {
            diagnostics.push({ code: "TN_IR_FEEDBACK_PARTICLE_COMMAND_INVALID", message: "Feedback particle command must be burst, emit, or play.", path: `${particlePath}/command`, severity: "error" });
          }
          validateFiniteRange(particle.count, 0, 256, `${particlePath}/count`, "TN_IR_FEEDBACK_PARTICLE_COUNT_INVALID", diagnostics);
          validateFiniteRange(particle.lifetime, 0, 30, `${particlePath}/lifetime`, "TN_IR_FEEDBACK_PARTICLE_LIFETIME_INVALID", diagnostics);
        });
      }
    }
  });
}

type ISystemsFeedbackPresets = readonly IFeedbackPreset[];
