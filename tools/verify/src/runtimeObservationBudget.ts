import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { dirname, resolve } from "node:path";

import { createRuntimeWriteLedger } from "@threenative/runtime-web-three";

import type { VerificationDiagnostic } from "./runner.js";

const SCHEMA = "threenative.verify.runtime-observation-budget" as const;
const VERSION = "0.1.0" as const;
const BATTLE_SCALE = { ticks: 120, writesPerTick: 384 } as const;

export interface RuntimeObservationMetrics {
  cpuMs: number;
  diagnosticSignatures: string[];
  retainedObservations: number;
  serializedBytes: number;
  writes: number;
}

export interface RuntimeObservationBudgetEvidence {
  full: RuntimeObservationMetrics;
  normal: RuntimeObservationMetrics;
}

export function validateRuntimeObservationBudget(evidence: RuntimeObservationBudgetEvidence): VerificationDiagnostic[] {
  const diagnostics: VerificationDiagnostic[] = [];
  if (evidence.normal.retainedObservations !== 0 || evidence.normal.serializedBytes !== 0) {
    diagnostics.push(failure("TN_VERIFY_RUNTIME_OBSERVATION_NORMAL_RETAINED", "Normal mode must retain and serialize zero detailed write observations."));
  }
  if (evidence.full.retainedObservations === 0 || evidence.full.serializedBytes === 0) {
    diagnostics.push(failure("TN_VERIFY_RUNTIME_OBSERVATION_FULL_EMPTY", "Full-audit mode must retain deterministic detailed evidence."));
  }
  if (JSON.stringify(evidence.normal.diagnosticSignatures) !== JSON.stringify(evidence.full.diagnosticSignatures)) {
    diagnostics.push(failure("TN_VERIFY_RUNTIME_OBSERVATION_VERDICT_DRIFT", "Normal and full-audit modes must make identical conflict decisions."));
  }
  if (evidence.normal.cpuMs > 250 || evidence.normal.cpuMs > evidence.full.cpuMs * 0.8) {
    diagnostics.push(failure(
      "TN_VERIFY_RUNTIME_OBSERVATION_CPU_BUDGET",
      `Normal-mode write tracking took ${evidence.normal.cpuMs.toFixed(2)} ms versus ${evidence.full.cpuMs.toFixed(2)} ms full-audit; expected <=250 ms and <=80% of full-audit.`,
    ));
  }
  return diagnostics;
}

export async function runRuntimeObservationBudget(options: { reportPath?: string; root?: string } = {}): Promise<{
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  reportPath: string;
}> {
  const root = resolve(options.root ?? process.cwd());
  const reportPath = options.reportPath ?? resolve(root, "tools/verify/artifacts/runtime-observation-budget/verification-report.json");
  runWorkload(false, 10, 64);
  runWorkload(true, 10, 64);
  const normalSamples: RuntimeObservationMetrics[] = [];
  const fullSamples: RuntimeObservationMetrics[] = [];
  for (let index = 0; index < 5; index += 1) {
    normalSamples.push(runWorkload(false, BATTLE_SCALE.ticks, BATTLE_SCALE.writesPerTick));
    fullSamples.push(runWorkload(true, BATTLE_SCALE.ticks, BATTLE_SCALE.writesPerTick));
  }
  const evidence = {
    full: medianMetrics(fullSamples),
    normal: medianMetrics(normalSamples),
  };
  const diagnostics = validateRuntimeObservationBudget(evidence);
  const ok = diagnostics.length === 0;
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({
    code: ok ? "TN_VERIFY_RUNTIME_OBSERVATION_BUDGET_OK" : "TN_VERIFY_RUNTIME_OBSERVATION_BUDGET_FAILED",
    diagnostics,
    evidence,
    model: BATTLE_SCALE,
    ok,
    schema: SCHEMA,
    status: ok ? "pass" : "fail",
    version: VERSION,
  }, null, 2)}\n`, "utf8");
  return { diagnostics, ok, reportPath };
}

function runWorkload(captureObservations: boolean, ticks: number, writesPerTick: number): RuntimeObservationMetrics {
  const ledger = createRuntimeWriteLedger({ captureObservations });
  const started = performance.now();
  for (let tick = 0; tick < ticks; tick += 1) {
    ledger.beginTick(tick);
    for (let write = 0; write < writesPerTick; write += 1) {
      const targetId = `entity-${write % 96}`;
      const conflict = write % 24 === 1;
      ledger.record({
        newValue: [tick, write, 0],
        path: conflict ? "Transform/position" : `State/value-${write % 8}`,
        system: `system-${write % 32}`,
        targetId,
        targetKind: conflict ? "component" : "state",
        tick,
        writer: conflict ? "script" : "scheduler",
      });
      if (conflict) {
        ledger.record({
          newValue: [tick, write, 1],
          path: "Transform/position",
          system: "physics",
          targetId,
          targetKind: "component",
          tick,
          writer: "physics",
        });
      }
    }
  }
  const cpuMs = performance.now() - started;
  const observations = ledger.observations();
  return {
    cpuMs,
    diagnosticSignatures: ledger.diagnostics(ticks - 1).map((diagnostic) => `${diagnostic.code}:${diagnostic.path}:${diagnostic.message}`).sort(),
    retainedObservations: observations.length,
    serializedBytes: captureObservations ? Buffer.byteLength(JSON.stringify(ledger.snapshot())) : 0,
    writes: ticks * writesPerTick,
  };
}

function medianMetrics(samples: RuntimeObservationMetrics[]): RuntimeObservationMetrics {
  const ordered = [...samples].sort((left, right) => left.cpuMs - right.cpuMs);
  return ordered[Math.floor(ordered.length / 2)]!;
}

function failure(code: string, message: string): VerificationDiagnostic {
  return {
    code,
    message,
    severity: "error",
    suggestedFix: "Keep correctness state bounded in normal mode and detailed value hashing/serialization behind --audit-writes.",
  };
}

if (process.argv[1]?.endsWith("runtimeObservationBudget.js")) {
  const result = await runRuntimeObservationBudget();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
