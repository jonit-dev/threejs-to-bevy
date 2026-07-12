import {
  createRuntimeWriteObservation,
  serializeRuntimeWriteAudit,
} from "@threenative/ir/runtimeDiagnostics";
import type {
  IRuntimeDiagnostic,
  IRuntimeWriteObservation,
  RuntimeWriteDisposition,
  RuntimeWriteTargetKind,
  RuntimeWriteWriter,
} from "@threenative/ir";

export interface IRuntimeWriteRecordInput {
  disposition?: RuntimeWriteDisposition;
  newValue?: unknown;
  oldValue?: unknown;
  path: string;
  schedule?: string;
  system?: string;
  targetId: string;
  targetKind: RuntimeWriteTargetKind;
  tick: number;
  writer: RuntimeWriteWriter;
}

export interface IRuntimeWriteLedger {
  beginTick(tick: number): void;
  diagnostics(tick?: number): IRuntimeDiagnostic[];
  observations(): IRuntimeWriteObservation[];
  observationsSince(index: number): IRuntimeWriteObservation[];
  record(input: IRuntimeWriteRecordInput): IRuntimeWriteObservation;
  reset(): void;
}

interface IActiveWrite {
  observation: IRuntimeWriteObservation;
}

export function createRuntimeWriteLedger(): IRuntimeWriteLedger {
  const observations: IRuntimeWriteObservation[] = [];
  const active = new Map<string, IActiveWrite>();
  let currentTick: number | undefined;

  return {
    beginTick(tick) {
      const normalized = normalizeTick(tick);
      if (currentTick !== normalized) {
        currentTick = normalized;
        active.clear();
      }
    },
    diagnostics(tick) {
      return observations
        .filter((observation) => observation.disposition === "conflict" && (tick === undefined || observation.tick === normalizeTick(tick)))
        .map((observation) => conflictDiagnostic(observation, observations))
        .filter((diagnostic, index, all) => all.findIndex((candidate) => candidate.path === diagnostic.path && candidate.message === diagnostic.message) === index);
    },
    observations() {
      return serializeRuntimeWriteAudit(observations).observations;
    },
    observationsSince(index) {
      return serializeRuntimeWriteAudit(observations.slice(Math.max(0, index))).observations;
    },
    record(input) {
      const tick = normalizeTick(input.tick);
      if (currentTick !== tick) {
        currentTick = tick;
        active.clear();
      }
      const key = `${input.targetKind}:${input.targetId}:${input.path}`;
      const previous = active.get(key);
      const previousTarget = [...active.values()].find((candidate) => candidate.observation.targetKind === input.targetKind && candidate.observation.targetId === input.targetId);
      const disposition = input.disposition ?? classifyDisposition(previous, previousTarget, input);
      const observation = createRuntimeWriteObservation({ ...input, disposition, tick });
      observations.push(observation);
      active.set(key, { observation });
      if (observations.length > 2000) {
        observations.splice(0, observations.length - 2000);
      }
      return observation;
    },
    reset() {
      observations.length = 0;
      active.clear();
      currentTick = undefined;
    },
  };
}

function classifyDisposition(previous: IActiveWrite | undefined, previousTarget: IActiveWrite | undefined, input: IRuntimeWriteRecordInput): RuntimeWriteDisposition {
  if (previous === undefined) {
    if (input.targetKind === "resource" && previousTarget !== undefined && previousTarget.observation.path !== input.path) {
      return "composed";
    }
    return "accepted";
  }
  if (input.targetKind === "resource" && previous.observation.targetId === input.targetId && previous.observation.path !== input.path) {
    return "composed";
  }
  if (isTransformPath(input.path) && previous.observation.writer !== input.writer && isTransformWriterPair(previous.observation.writer, input.writer)) {
    return "conflict";
  }
  return "overwritten";
}

function conflictDiagnostic(observation: IRuntimeWriteObservation, observations: readonly IRuntimeWriteObservation[]): IRuntimeDiagnostic {
  const writes = observations
    .filter((candidate) => candidate.tick === observation.tick && candidate.targetKind === observation.targetKind && candidate.targetId === observation.targetId && candidate.path === observation.path)
    .map((candidate) => `${candidate.writer}${candidate.system === undefined ? "" : ` (${candidate.system})`}`);
  const writers = [...new Set(writes)].sort();
  const writerText = writers.length > 0 ? writers.join(" and ") : observation.writer;
  const winning = writes.at(-1) ?? observation.writer;
  return {
    code: "TN_RUNTIME_WRITE_CONFLICT",
    message: `Runtime write conflict: ${observation.targetKind} '${observation.targetId}' field '${observation.path}' was written by ${writerText} in fixed tick ${observation.tick}; winning write: ${winning}.`,
    path: `${observation.targetKind}/${observation.targetId}/${observation.path}`,
    severity: "warning",
    suggestion: "Choose one authoritative owner for this transform field, or move the write into an explicit ordered composition step; the later write currently wins.",
  };
}

function isTransformPath(path: string): boolean {
  return path === "Transform" || path.startsWith("Transform/");
}

function isTransformWriterPair(left: RuntimeWriteWriter, right: RuntimeWriteWriter): boolean {
  return (left === "physics" && right === "script") || (left === "script" && right === "physics");
}

function normalizeTick(value: number): number {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}
