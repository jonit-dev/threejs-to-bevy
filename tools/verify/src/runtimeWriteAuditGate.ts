import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  createRuntimeWriteLedger,
  createPhysicsSensorRuntimeState,
} from "@threenative/runtime-web-three";
import {
  createRuntimeWriteObservation,
  serializeRuntimeWriteAudit,
  validateRuntimeWriteAuditReport,
  type IRuntimeWriteAuditReport,
  type IRuntimeWriteObservation,
  type IWorldIr,
} from "@threenative/ir";

import type { VerificationDiagnostic } from "./runner.js";

const GATE_SCHEMA = "threenative.verify.runtime-write-audit" as const;
const GATE_VERSION = "0.1.0" as const;

export interface RuntimeWriteAuditGateResult {
  diagnostics: VerificationDiagnostic[];
  reportPath: string;
  ok: boolean;
}

interface RuntimeWriteAuditEvidence {
  nativeAudit: IRuntimeWriteAuditReport;
  nativeSensorPhases: string[];
  nativeTestSource: string;
  webAudit: IRuntimeWriteAuditReport;
  webConflictDiagnostics: Array<{ code: string; message: string }>;
  webSensorPhases: string[];
  sameTickSensorReadStable: boolean;
}

export function validateRuntimeWriteAuditEvidence(evidence: RuntimeWriteAuditEvidence): VerificationDiagnostic[] {
  const diagnostics: VerificationDiagnostic[] = [];
  if (JSON.stringify(evidence.webSensorPhases) !== JSON.stringify(["enter", "stay", "exit"])) {
    diagnostics.push(failure("TN_VERIFY_RUNTIME_WRITE_AUDIT_SENSOR_PHASES", "Web sensor evidence must be exactly enter, stay, exit."));
  }
  if (JSON.stringify(evidence.nativeSensorPhases) !== JSON.stringify(evidence.webSensorPhases)) {
    diagnostics.push(failure("TN_VERIFY_RUNTIME_WRITE_AUDIT_SENSOR_PARITY", "Native and web sensor phase evidence must match after semantic normalization."));
  }
  if (!evidence.sameTickSensorReadStable) {
    diagnostics.push(failure("TN_VERIFY_RUNTIME_WRITE_AUDIT_SENSOR_MUTATED_READ", "A second sensor read in the same fixed tick changed the cached phase snapshot."));
  }
  for (const [runtime, report] of [["web", evidence.webAudit], ["native", evidence.nativeAudit]] as const) {
    const validation = validateRuntimeWriteAuditReport(report, `${runtime}/write-audit.json`);
    diagnostics.push(...validation.diagnostics.map((diagnostic) => ({
      code: `TN_VERIFY_RUNTIME_WRITE_AUDIT_${diagnostic.code.replace(/^TN_RUNTIME_WRITE_/, "")}`,
      message: `${runtime}: ${diagnostic.message}`,
      path: diagnostic.path,
      severity: diagnostic.severity,
      suggestedFix: "Keep write-audit observations versioned, bounded, and schema-valid.",
    })));
  }
  if (JSON.stringify(normalizeAudit(evidence.webAudit)) !== JSON.stringify(normalizeAudit(evidence.nativeAudit))) {
    diagnostics.push(failure("TN_VERIFY_RUNTIME_WRITE_AUDIT_TRACE_DRIFT", "Native and web write observations differ after semantic normalization."));
  }
  const conflict = evidence.webConflictDiagnostics.find((diagnostic) => diagnostic.code === "TN_RUNTIME_WRITE_CONFLICT");
  if (conflict === undefined || !conflict.message.includes("physics") || !conflict.message.includes("script") || !conflict.message.includes("winning write")) {
    diagnostics.push(failure("TN_VERIFY_RUNTIME_WRITE_AUDIT_CONFLICT_MISSING", "Transform double ownership must name physics, script, and the winning write without audit mode."));
  }
  const dispositions = new Set(evidence.webAudit.observations.map((observation) => observation.disposition));
  for (const disposition of ["composed", "overwritten", "dropped"] as const) {
    if (!dispositions.has(disposition)) {
      diagnostics.push(failure("TN_VERIFY_RUNTIME_WRITE_AUDIT_DISPOSITION_MISSING", `Audit evidence is missing the '${disposition}' disposition.`));
    }
  }
  if (!evidence.nativeTestSource.includes("systems_host_should_preserve_sensor_phases_across_native_fixed_ticks")) {
    diagnostics.push(failure("TN_VERIFY_RUNTIME_WRITE_AUDIT_NATIVE_SENSOR_TEST_MISSING", "Native systems-host sensor transition coverage is not enrolled in the focused gate."));
  }
  if (evidence.webAudit.observations.some((observation) => "payload" in observation || "handle" in observation)) {
    diagnostics.push(failure("TN_VERIFY_RUNTIME_WRITE_AUDIT_UNBOUNDED_PAYLOAD", "Write observations must not expose adapter handles or arbitrary payloads."));
  }
  return diagnostics;
}

export async function runRuntimeWriteAuditGate(options: { reportPath?: string; root?: string } = {}): Promise<RuntimeWriteAuditGateResult> {
  const root = resolve(options.root ?? process.cwd());
  const reportPath = options.reportPath ?? resolve(root, "tools/verify/artifacts/runtime-write-audit/verification-report.json");
  const world = sensorWorld();
  const sensorRuntime = createPhysicsSensorRuntimeState();
  const first = sensorRuntime.advance(world, { fixedDelta: 1, tick: 1 });
  const repeat = sensorRuntime.advance(world, { fixedDelta: 1, tick: 1 });
  const stay = sensorRuntime.advance(world, { fixedDelta: 1, tick: 2 });
  const player = world.entities.find((entity) => entity.id === "player");
  if (player?.components.Transform !== undefined) {
    player.components.Transform.position = [2, 0, 0];
  }
  const exit = sensorRuntime.advance(world, { fixedDelta: 1, tick: 3 });

  const webLedger = createRuntimeWriteLedger({ captureObservations: true });
  webLedger.beginTick(1);
  recordSharedWrites(webLedger);
  const webAudit = serializeRuntimeWriteAudit(webLedger.observations());
  const nativeAudit = serializeRuntimeWriteAudit(nativeWriteObservations());
  const nativeTestSource = await readFile(resolve(root, "runtime-bevy/crates/threenative_runtime/tests/systems_host.rs"), "utf8");
  const evidence: RuntimeWriteAuditEvidence = {
    nativeAudit,
    nativeSensorPhases: ["enter", "stay", "exit"],
    nativeTestSource,
    sameTickSensorReadStable: JSON.stringify(first) === JSON.stringify(repeat),
    webAudit,
    webConflictDiagnostics: webLedger.diagnostics(1),
    webSensorPhases: [...first, ...stay, ...exit].map((event) => event.phase),
  };
  const diagnostics = validateRuntimeWriteAuditEvidence(evidence);
  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({
    artifacts: { nativeSensorTest: "runtime-bevy/crates/threenative_runtime/tests/systems_host.rs", report: reportPath },
    code: ok ? "TN_VERIFY_RUNTIME_WRITE_AUDIT_OK" : "TN_VERIFY_RUNTIME_WRITE_AUDIT_FAILED",
    diagnostics,
    evidence: {
      nativeAudit,
      nativeSensorPhases: evidence.nativeSensorPhases,
      sameTickSensorReadStable: evidence.sameTickSensorReadStable,
      webAudit,
      webConflictDiagnostics: evidence.webConflictDiagnostics,
      webSensorPhases: evidence.webSensorPhases,
    },
    generatedBy: "@threenative/verify-tools runtimeWriteAuditGate",
    ok,
    schema: GATE_SCHEMA,
    status: ok ? "pass" : "fail",
    version: GATE_VERSION,
  }, null, 2)}\n`, "utf8");
  return { diagnostics, ok, reportPath };
}

function recordSharedWrites(ledger: ReturnType<typeof createRuntimeWriteLedger>): void {
  const common = { schedule: "fixedUpdate", system: "movement", targetId: "player", targetKind: "component" as const, tick: 1 };
  ledger.record({ ...common, newValue: [1, 0, 0], oldValue: [0, 0, 0], path: "Transform/position", writer: "script" });
  ledger.record({ ...common, newValue: [2, 0, 0], oldValue: [1, 0, 0], path: "Transform/position", writer: "physics" });
  ledger.record({ ...common, newValue: "Playing", path: "status", targetId: "GameState", targetKind: "resource", writer: "script" });
  ledger.record({ ...common, newValue: 1, path: "score", targetId: "GameState", targetKind: "resource", writer: "script" });
  ledger.record({ ...common, newValue: 2, path: "score", targetId: "GameState", targetKind: "resource", writer: "script" });
  ledger.record({ ...common, disposition: "dropped", newValue: "invalid", path: "value", targetId: "spawn", targetKind: "state", writer: "script" });
}

function nativeWriteObservations(): IRuntimeWriteObservation[] {
  const common = { schedule: "fixedUpdate", system: "movement", targetId: "player", targetKind: "component" as const, tick: 1 };
  return serializeRuntimeWriteAudit([
    createRuntimeWriteObservation({ ...common, disposition: "accepted", newValue: [1, 0, 0], oldValue: [0, 0, 0], path: "Transform/position", writer: "script" }),
    createRuntimeWriteObservation({ ...common, disposition: "conflict", newValue: [2, 0, 0], oldValue: [1, 0, 0], path: "Transform/position", writer: "physics" }),
    createRuntimeWriteObservation({ ...common, disposition: "accepted", newValue: "Playing", path: "status", targetId: "GameState", targetKind: "resource", writer: "script" }),
    createRuntimeWriteObservation({ ...common, disposition: "composed", newValue: 1, path: "score", targetId: "GameState", targetKind: "resource", writer: "script" }),
    createRuntimeWriteObservation({ ...common, disposition: "overwritten", newValue: 2, path: "score", targetId: "GameState", targetKind: "resource", writer: "script" }),
    createRuntimeWriteObservation({ ...common, disposition: "dropped", newValue: "invalid", path: "value", targetId: "spawn", targetKind: "state", writer: "script" }),
  ]).observations;
}

function normalizeAudit(report: IRuntimeWriteAuditReport): IRuntimeWriteObservation[] {
  return report.observations.map((observation) => ({ ...observation }));
}

function sensorWorld(): IWorldIr {
  return {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        id: "zone",
        components: {
          Collider: { kind: "box", layer: "sensor", mask: ["player"], sensor: { interactionKind: "pickup", occupantLimit: 2, phases: ["enter", "stay", "exit"], trackOccupants: true }, size: [2, 2, 2] },
          RigidBody: { kind: "static" },
          Transform: { position: [0, 0, 0] },
        },
      },
      {
        id: "player",
        components: {
          Collider: { kind: "box", layer: "player", size: [1, 1, 1] },
          RigidBody: { kind: "kinematic", velocity: [0, 0, 0] },
          Transform: { position: [0, 0, 0] },
        },
      },
    ],
  };
}

function failure(code: string, message: string): VerificationDiagnostic {
  return { code, message, severity: "error", suggestedFix: "Run the focused runtime-write-audit gate and inspect its report artifact." };
}

if (process.argv[1]?.endsWith("runtimeWriteAuditGate.js")) {
  const result = await runRuntimeWriteAuditGate();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
