import type { ISequenceIr, ISequenceKeyframeIr, ISequencesIr, ISequenceTrackIr } from "@threenative/ir";

export interface ISequenceTraceInput {
  fixedDelta?: number;
  playByTick?: Record<number, readonly string[]>;
  skipByTick?: Record<number, readonly string[]>;
  stopByTick?: Record<number, readonly string[]>;
  ticks: number;
}

export interface ISequenceTraceObservation {
  entity?: string;
  kind: string;
  sequence: string;
  tick: number;
  time: number;
  track: string;
  value?: unknown;
}

export interface ISequenceTraceFrame {
  active: boolean;
  completed?: boolean;
  observations: ISequenceTraceObservation[];
  restoredCamera?: string;
  sequence: string;
  skipped?: boolean;
  stopped?: boolean;
  tick: number;
  time: number;
}

interface IActiveSequence {
  previousTime: number;
  time: number;
}

export function traceSequences(sequences: ISequencesIr, input: ISequenceTraceInput): ISequenceTraceFrame[] {
  const fixedDelta = input.fixedDelta ?? 0.5;
  const byId = new Map(sequences.sequences.map((sequence) => [sequence.id, sequence]));
  const active = new Map<string, IActiveSequence>();
  const trace: ISequenceTraceFrame[] = [];

  for (let tick = 0; tick < input.ticks; tick += 1) {
    for (const sequenceId of input.playByTick?.[tick] ?? []) {
      if (byId.has(sequenceId)) {
        active.set(sequenceId, { previousTime: 0, time: 0 });
      }
    }

    const forcedEnds = new Map<string, "skipped" | "stopped">();
    for (const sequenceId of input.skipByTick?.[tick] ?? []) {
      forcedEnds.set(sequenceId, "skipped");
    }
    for (const sequenceId of input.stopByTick?.[tick] ?? []) {
      forcedEnds.set(sequenceId, "stopped");
    }

    for (const [sequenceId, runtime] of [...active.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const sequence = byId.get(sequenceId);
      if (sequence === undefined) {
        active.delete(sequenceId);
        continue;
      }
      const forcedEnd = forcedEnds.get(sequenceId);
      const observations = forcedEnd === undefined ? sampleSequence(sequence, runtime.previousTime, runtime.time, tick) : [];
      const completed = forcedEnd === undefined && runtime.time >= sequence.duration;
      trace.push({
        active: forcedEnd === undefined && !completed,
        ...(completed ? { completed: true } : {}),
        observations,
        restoredCamera: sequenceCamera(sequence),
        sequence: sequence.id,
        ...(forcedEnd === "skipped" ? { skipped: true } : {}),
        ...(forcedEnd === "stopped" ? { stopped: true } : {}),
        tick,
        time: roundTime(runtime.time),
      });
      if (completed || forcedEnd !== undefined) {
        active.delete(sequenceId);
      } else {
        runtime.previousTime = runtime.time;
        runtime.time = Math.min(sequence.duration, runtime.time + fixedDelta);
      }
    }
  }

  return trace;
}

function sampleSequence(sequence: ISequenceIr, previousTime: number, time: number, tick: number): ISequenceTraceObservation[] {
  return sequence.tracks.flatMap((track) => {
    if (track.kind === "event" || track.kind === "audio" || track.kind === "ui") {
      return track.keyframes
        .filter((keyframe) => isTriggeredKey(keyframe, previousTime, time))
        .map((keyframe) => observation(sequence.id, track, tick, keyframe.time, keyframe.value));
    }
    return [observation(sequence.id, track, tick, time, sampleTrackValue(track, time))];
  });
}

function sampleTrackValue(track: ISequenceTrackIr, time: number): unknown {
  const keys = [...track.keyframes].sort((left, right) => left.time - right.time);
  if (keys.length === 0) {
    return undefined;
  }
  const first = keys[0];
  if (first === undefined) {
    return undefined;
  }
  const last = keys[keys.length - 1];
  if (last === undefined) {
    return undefined;
  }
  if (time <= first.time) {
    return first.value;
  }
  if (time >= last.time) {
    return last.value;
  }
  for (let index = 0; index < keys.length - 1; index += 1) {
    const left = keys[index];
    const right = keys[index + 1];
    if (left === undefined || right === undefined) {
      continue;
    }
    if (time >= left.time && time <= right.time) {
      if (right.easing === "step" || left.easing === "step") {
        return left.value;
      }
      return lerpValue(left.value, right.value, (time - left.time) / (right.time - left.time));
    }
  }
  return last.value;
}

function lerpValue(left: unknown, right: unknown, t: number): unknown {
  if (typeof left === "number" && typeof right === "number") {
    return roundTime(left + (right - left) * t);
  }
  if (Array.isArray(left) && Array.isArray(right) && left.length === right.length) {
    return left.map((item, index) => lerpValue(item, right[index], t));
  }
  if (isRecord(left) && isRecord(right)) {
    return Object.fromEntries(Object.keys(left).sort().map((key) => [key, lerpValue(left[key], right[key], t)]));
  }
  return t < 1 ? left : right;
}

function observation(sequence: string, track: ISequenceTrackIr, tick: number, time: number, value: unknown): ISequenceTraceObservation {
  return {
    ...(track.entity === undefined ? {} : { entity: track.entity }),
    kind: track.kind,
    sequence,
    tick,
    time: roundTime(time),
    track: track.id,
    ...(value === undefined ? {} : { value }),
  };
}

function sequenceCamera(sequence: ISequenceIr): string | undefined {
  return sequence.tracks.find((track) => track.kind === "cameraPose")?.entity;
}

function isTriggeredKey(keyframe: ISequenceKeyframeIr, previousTime: number, time: number): boolean {
  return (time === 0 && keyframe.time === 0) || (keyframe.time > previousTime && keyframe.time <= time);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function roundTime(value: number): number {
  return Number(value.toFixed(6));
}
