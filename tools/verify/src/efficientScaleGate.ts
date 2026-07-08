import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { resolveArtifactTargets } from "./artifacts.js";
import { validatePerformanceProofSidecar } from "./performanceProof.js";
import { runCommand, summarize, type StepSummary, type VerificationDiagnostic } from "./runner.js";

export interface EfficientScaleGateOptions {
  reportPath?: string;
  root?: string;
  run?: typeof runCommand;
}

export interface EfficientScaleGateResult {
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  reportPath: string;
  steps: StepSummary[];
}

const PROJECT_PATH = "examples/dense-world-benchmark";
const PROOF_PATH = "artifacts/efficient-scale/performance-proof.json";
const MIN_ENTITY_COUNT = 180;
const MIN_VISIBLE_INSTANCES = 120;

export async function runEfficientScaleGate(options: EfficientScaleGateOptions = {}): Promise<EfficientScaleGateResult> {
  const root = resolve(options.root ?? process.cwd());
  const run = options.run ?? runCommand;
  const targets = resolveArtifactTargets({ gate: "efficient-scale", owner: { kind: "aggregate", name: "efficient-scale" }, root });
  const reportPath = options.reportPath ?? targets.reportPath;
  const steps: StepSummary[] = [];
  const diagnostics: VerificationDiagnostic[] = [];

  const build = await step(run, root, "build dense-world benchmark", [process.execPath, "packages/cli/dist/index.js", "build", "--project", PROJECT_PATH, "--json"]);
  steps.push(build.summary);
  if (!build.ok) {
    diagnostics.push(stepDiagnostic(build.summary, "TN_VERIFY_EFFICIENT_SCALE_BUILD_FAILED"));
  }

  const proof = await step(run, root, "performance proof dense-world benchmark", [
    process.execPath,
    "packages/cli/dist/index.js",
    "performance",
    "proof",
    "--project",
    PROJECT_PATH,
    "--frames",
    "30",
    "--out",
    PROOF_PATH,
    "--json",
  ]);
  steps.push(proof.summary);
  if (!proof.ok) {
    diagnostics.push(stepDiagnostic(proof.summary, "TN_VERIFY_EFFICIENT_SCALE_PROOF_FAILED"));
  }

  const sidecarPath = resolve(root, PROJECT_PATH, PROOF_PATH);
  const sidecar = await readSidecar(sidecarPath, diagnostics);
  if (sidecar !== undefined) {
    diagnostics.push(...validatePerformanceProofSidecar(sidecar, { path: sidecarPath }));
    diagnostics.push(...denseBenchmarkDiagnostics(sidecar, sidecarPath));
  }

  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  const payload = {
    artifacts: {
      performanceProof: sidecarPath,
      projectPath: PROJECT_PATH,
      reportPath,
    },
    code: ok ? "TN_VERIFY_EFFICIENT_SCALE_OK" : "TN_VERIFY_EFFICIENT_SCALE_FAILED",
    diagnostics,
    generatedBy: "@threenative/verify-tools efficientScaleGate",
    ok,
    schema: "threenative.verify.efficient-scale",
    startedAt: new Date().toISOString(),
    status: ok ? "pass" : "fail",
    steps,
    thresholds: {
      minEntityCount: MIN_ENTITY_COUNT,
      minVisibleInstances: MIN_VISIBLE_INSTANCES,
    },
    version: "0.1.0",
  };
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { diagnostics, ok, reportPath, steps };
}

async function step(run: typeof runCommand, cwd: string, name: string, commandSpec: readonly [string, ...string[]]): Promise<{ ok: boolean; summary: StepSummary }> {
  const [command, ...args] = commandSpec;
  const result = await run({ args, command, cwd, name, timeoutMs: 180_000 });
  return {
    ok: result.exitCode === 0,
    summary: { ...summarize(result), name },
  };
}

function stepDiagnostic(step: StepSummary, code: string): VerificationDiagnostic {
  return {
    code,
    message: `Efficient-scale step '${step.name}' failed with exit code ${step.exitCode}.`,
    severity: "error",
    step: step.name,
    suggestedFix: step.stderr.trim() || step.stdout.trim() || "Inspect the dense-world benchmark proof output and rerun pnpm verify:efficient-scale.",
  };
}

async function readSidecar(path: string, diagnostics: VerificationDiagnostic[]): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    diagnostics.push({
      code: "TN_VERIFY_EFFICIENT_SCALE_PROOF_MISSING",
      message: `Unable to read efficient-scale performance proof: ${error instanceof Error ? error.message : String(error)}.`,
      path,
      severity: "error",
      suggestedFix: "Run pnpm verify:efficient-scale so the dense-world benchmark writes artifacts/efficient-scale/performance-proof.json.",
    });
    return undefined;
  }
}

function denseBenchmarkDiagnostics(sidecar: unknown, path: string): VerificationDiagnostic[] {
  if (!isRecord(sidecar) || !isRecord(sidecar.metrics)) {
    return [];
  }
  const diagnostics: VerificationDiagnostic[] = [];
  const entityCount = measuredNumber(sidecar.metrics.entityCount);
  const visibleInstances = measuredNumber(sidecar.metrics.visibleInstances);
  if (entityCount !== undefined && entityCount < MIN_ENTITY_COUNT) {
    diagnostics.push({
      code: "TN_VERIFY_EFFICIENT_SCALE_ENTITY_DENSITY_LOW",
      message: `Dense-world benchmark must keep at least ${MIN_ENTITY_COUNT} runtime entities; observed ${entityCount}.`,
      path: `${path}/metrics/entityCount`,
      severity: "error",
      suggestedFix: "Restore the dense-world benchmark entity grid or update the gate only with a replacement dense fixture.",
    });
  }
  if (visibleInstances !== undefined && visibleInstances < MIN_VISIBLE_INSTANCES) {
    diagnostics.push({
      code: "TN_VERIFY_EFFICIENT_SCALE_VISIBLE_DENSITY_LOW",
      message: `Dense-world benchmark must keep at least ${MIN_VISIBLE_INSTANCES} visible instances; observed ${visibleInstances}.`,
      path: `${path}/metrics/visibleInstances`,
      severity: "error",
      suggestedFix: "Restore visible benchmark scenery or update the gate only with a replacement dense fixture.",
    });
  }
  return diagnostics;
}

function measuredNumber(value: unknown): number | undefined {
  if (!isRecord(value) || value.status !== "measured" || typeof value.value !== "number" || !Number.isFinite(value.value)) {
    return undefined;
  }
  return value.value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runEfficientScaleGate();
  process.stdout.write(`${JSON.stringify({ diagnostics: result.diagnostics, ok: result.ok, reportPath: result.reportPath }, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
