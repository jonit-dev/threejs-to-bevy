import type { ISequencesIr } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";
import { IR_SCHEMA_IDS, IR_VERSION } from "./documents.js";
import { isRecord, validateUniqueIds } from "./validationPrimitives.js";

const trackKinds = new Set(["audio", "cameraPose", "event", "timeScale", "transform", "ui"]);
const easings = new Set(["linear", "step"]);

export function validateSequences(sequences: ISequencesIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (sequences.schema !== IR_SCHEMA_IDS.sequences || sequences.version !== IR_VERSION) {
    diagnostics.push({
      code: "TN_SEQUENCE_SCHEMA_INVALID",
      message: `Sequences document must use ${IR_SCHEMA_IDS.sequences} version ${IR_VERSION}.`,
      path,
      severity: "error",
      suggestion: "Regenerate the sequences document from structured source.",
    });
  }
  if (!Array.isArray(sequences.sequences)) {
    diagnostics.push(shapeDiagnostic(`${path}/sequences`, "Sequences document must contain a sequences array."));
    return;
  }
  validateUniqueIds(sequences.sequences, `${path}/sequences`, "TN_SEQUENCE_DUPLICATE_ID", diagnostics);
  for (const [sequenceIndex, sequence] of sequences.sequences.entries()) {
    const sequencePath = `${path}/sequences/${sequenceIndex}`;
    if (!isRecord(sequence)) {
      diagnostics.push(shapeDiagnostic(sequencePath, "Sequence entries must be objects."));
      continue;
    }
    if (typeof sequence.id !== "string" || sequence.id.trim() === "") {
      diagnostics.push(shapeDiagnostic(`${sequencePath}/id`, "Sequence id must be a non-empty string."));
    }
    if (typeof sequence.duration !== "number" || !Number.isFinite(sequence.duration) || sequence.duration < 0) {
      diagnostics.push(shapeDiagnostic(`${sequencePath}/duration`, "Sequence duration must be a non-negative finite number."));
    }
    if (!Array.isArray(sequence.tracks)) {
      diagnostics.push(shapeDiagnostic(`${sequencePath}/tracks`, "Sequence tracks must be an array."));
      continue;
    }
    validateUniqueIds(sequence.tracks, `${sequencePath}/tracks`, "TN_SEQUENCE_DUPLICATE_TRACK", diagnostics);
    for (const [trackIndex, track] of sequence.tracks.entries()) {
      const trackPath = `${sequencePath}/tracks/${trackIndex}`;
      if (!isRecord(track)) {
        diagnostics.push(shapeDiagnostic(trackPath, "Sequence track entries must be objects."));
        continue;
      }
      if (!trackKinds.has(String(track.kind))) {
        diagnostics.push({
          code: "TN_SEQUENCE_TRACK_UNSUPPORTED",
          message: `Unsupported Sequence track kind '${String(track.kind)}'.`,
          path: `${trackPath}/kind`,
          severity: "error",
          suggestion: "Use cameraPose, transform, event, ui, audio, or timeScale.",
          value: String(track.kind),
        });
      }
      if (!Array.isArray(track.keyframes)) {
        diagnostics.push(shapeDiagnostic(`${trackPath}/keyframes`, "Sequence track keyframes must be an array."));
        continue;
      }
      let previousTime = -Infinity;
      for (const [keyIndex, keyframe] of track.keyframes.entries()) {
        const keyPath = `${trackPath}/keyframes/${keyIndex}`;
        if (!isRecord(keyframe)) {
          diagnostics.push(shapeDiagnostic(keyPath, "Sequence keyframes must be objects."));
          continue;
        }
        if (typeof keyframe.time !== "number" || !Number.isFinite(keyframe.time) || keyframe.time < 0) {
          diagnostics.push(shapeDiagnostic(`${keyPath}/time`, "Sequence keyframe time must be a non-negative finite number."));
          continue;
        }
        if (keyframe.time < previousTime) {
          diagnostics.push({
            code: "TN_SEQUENCE_KEYFRAMES_NOT_MONOTONIC",
            message: "Sequence keyframe times must be monotonic per track.",
            path: `${keyPath}/time`,
            severity: "error",
            suggestion: "Sort keyframes by ascending time or move the key to a later timestamp.",
            value: keyframe.time,
          });
        }
        previousTime = keyframe.time;
        if (keyframe.easing !== undefined && !easings.has(String(keyframe.easing))) {
          diagnostics.push(shapeDiagnostic(`${keyPath}/easing`, "Sequence keyframe easing must be linear or step."));
        }
      }
    }
  }
}

function shapeDiagnostic(path: string, message: string): IIrDiagnostic {
  return {
    code: "TN_SEQUENCE_SHAPE_INVALID",
    message,
    path,
    severity: "error",
    suggestion: "Regenerate the sequences document with bounded sequence authoring commands.",
  };
}
