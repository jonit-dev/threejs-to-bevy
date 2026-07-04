import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveArtifactTargets } from "./artifacts.js";
import { runCommand, summarize, type CommandResult, type StepSummary, type VerificationDiagnostic } from "./runner.js";

export interface TemplatePlayabilityOptions {
  reportPath?: string;
  root?: string;
  run?: typeof runCommand;
  keepProject?: boolean;
}

export interface TemplatePlayabilityResult {
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  reportPath: string;
  steps: StepSummary[];
}

const TEMPLATE_NAME = "racing-kit-rally-starter";
const PROJECT_NAME = "scratch-racer";
const INPUT_PATH = "content/input/rally.input.json";

export async function runTemplatePlayabilityGate(options: TemplatePlayabilityOptions = {}): Promise<TemplatePlayabilityResult> {
  const root = resolve(options.root ?? process.cwd());
  const run = options.run ?? runCommand;
  const targets = resolveArtifactTargets({ gate: "template-playability", owner: { kind: "aggregate", name: "template-playability" }, root });
  const reportPath = options.reportPath ?? targets.reportPath;
  const tempRoot = await mkdtemp(resolve(tmpdir(), "tn-template-playability-"));
  const projectPath = resolve(tempRoot, PROJECT_NAME);
  const steps: StepSummary[] = [];
  const diagnostics: VerificationDiagnostic[] = [];

  async function step(name: string, args: readonly string[], expectedExit: "nonzero" | "zero" = "zero", cwd = root): Promise<CommandResult> {
    const result = await run({ args, command: process.execPath, cwd, name, timeoutMs: name.includes("playtest") ? 120_000 : 60_000 });
    const summary = { ...summarize(result), name };
    steps.push(summary);
    const ok = expectedExit === "zero" ? result.exitCode === 0 : result.exitCode !== 0;
    if (!ok) {
      diagnostics.push({
        code: `TN_VERIFY_TEMPLATE_PLAYABILITY_${stableStepId(name)}_${expectedExit === "zero" ? "FAILED" : "UNEXPECTED_PASS"}`,
        message: expectedExit === "zero"
          ? `Template playability step '${name}' failed with exit code ${result.exitCode}.`
          : `Template playability step '${name}' was expected to fail but passed.`,
        severity: "error",
        step: name,
        suggestedFix: summary.stderr.trim() || summary.stdout.trim() || "Inspect the template source and rerun the playability gate.",
      });
    }
    return result;
  }

  try {
    await step("create racing starter", cli(root, "create", projectPath, "--template", TEMPLATE_NAME, "--json"), "zero", tempRoot);
    await step("authoring validate starter", cli(root, "authoring", "validate", "--project", projectPath, "--json"));
    await step("build starter", cli(root, "build", "--project", projectPath, "--json"));
    await step("proof starter camera", cli(root, "scene", "proof-camera", "racing-kit-rally", "--project", projectPath, "--camera", "camera.main", "--target", "player.car", "--min-occupancy", "0.04", "--json"));
    await step("proof starter modular track", cli(root, "scene", "proof-modular-track", "racing-kit-rally", "--project", projectPath, "--asset-dir", "assets", "--prefix", "road.modular", "--actors", "player.car,rival.car", "--json"));
    if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      return await writeReport({ diagnostics, keepProject: options.keepProject, projectPath, reportPath, steps });
    }
    const playtest = await step("playtest starter throttle", cli(root, "playtest", "--project", projectPath, "--entity", "player.car", "--press", "KeyW", "--frames", "60", "--expect-moved", "--json"));
    validatePlaytestReport(playtest, diagnostics);

    if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      return await writeReport({ diagnostics, keepProject: options.keepProject, projectPath, reportPath, steps });
    }
    await corruptStarterInput(projectPath);
    const malformed = await step("authoring validate malformed starter input", cli(root, "authoring", "validate", "--project", projectPath, "--json"), "nonzero");
    validateMalformedInputReport(malformed, diagnostics);
  } finally {
    if (options.keepProject !== true) {
      await rm(tempRoot, { force: true, recursive: true });
    }
  }

  return await writeReport({ diagnostics, keepProject: options.keepProject, projectPath, reportPath, steps });
}

async function writeReport(options: {
  diagnostics: VerificationDiagnostic[];
  keepProject: boolean | undefined;
  projectPath: string;
  reportPath: string;
  steps: StepSummary[];
}): Promise<TemplatePlayabilityResult> {
  const ok = options.diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  const payload = {
    artifacts: {
      projectName: PROJECT_NAME,
      templateName: TEMPLATE_NAME,
      ...(options.keepProject === true ? { projectPath: options.projectPath } : {}),
    },
    code: ok ? "TN_VERIFY_TEMPLATE_PLAYABILITY_OK" : "TN_VERIFY_TEMPLATE_PLAYABILITY_FAILED",
    diagnostics: options.diagnostics,
    generatedBy: "@threenative/verify-tools templatePlayability",
    ok,
    schema: "threenative.verify.template-playability",
    startedAt: new Date().toISOString(),
    status: ok ? "pass" : "fail",
    steps: options.steps,
    version: "0.1.0",
  };
  await mkdir(dirname(options.reportPath), { recursive: true });
  await writeFile(options.reportPath, `${JSON.stringify(payload, null, 2)}\n`);
  return {
    diagnostics: options.diagnostics,
    ok,
    reportPath: options.reportPath,
    steps: options.steps,
  };
}

function cli(root: string, ...args: string[]): string[] {
  return [resolve(root, "packages/cli/dist/index.js"), ...args];
}

function validatePlaytestReport(result: CommandResult, diagnostics: VerificationDiagnostic[]): void {
  if (result.exitCode !== 0) {
    return;
  }
  const report = parseJson(result.stdout);
  const distance = typeof report?.distance === "number" ? report.distance : 0;
  if (report?.code !== "TN_PLAYTEST_OK" || distance <= 0.01) {
    diagnostics.push({
      code: "TN_VERIFY_TEMPLATE_PLAYABILITY_THROTTLE_NO_MOVEMENT",
      message: `Starter playtest must prove throttle movement above 0.01 units; observed ${distance}.`,
      severity: "error",
      step: "playtest starter throttle",
      suggestedFix: "Fix starter controls, input bindings, or racing script movement before shipping the template.",
    });
  }
}

function validateMalformedInputReport(result: CommandResult, diagnostics: VerificationDiagnostic[]): void {
  if (result.exitCode === 0) {
    diagnostics.push({
      code: "TN_VERIFY_TEMPLATE_PLAYABILITY_MALFORMED_INPUT_ACCEPTED",
      message: "Starter authoring validation accepted malformed keyboard input binding 'keyboard.not-a-key'.",
      severity: "error",
      step: "authoring validate malformed starter input",
      suggestedFix: "Ensure malformed keyboard bindings fail authoring validation before runtime.",
    });
    return;
  }
  const report = parseJson(result.stdout);
  const foundInputDiagnostic = Array.isArray(report?.diagnostics)
    && report.diagnostics.some((diagnostic: unknown) => isRecord(diagnostic) && typeof diagnostic.code === "string" && diagnostic.code.startsWith("TN_INPUT_"));
  if (!foundInputDiagnostic) {
    diagnostics.push({
      code: "TN_VERIFY_TEMPLATE_PLAYABILITY_MALFORMED_INPUT_DIAGNOSTIC_MISSING",
      message: "Malformed starter input validation failed without a stable TN_INPUT diagnostic.",
      severity: "error",
      step: "authoring validate malformed starter input",
      suggestedFix: "Return a stable input diagnostic such as TN_INPUT_KEYBOARD_CODE_INVALID.",
    });
  }
}

async function corruptStarterInput(projectPath: string): Promise<void> {
  const path = resolve(projectPath, INPUT_PATH);
  const source = await readFile(path, "utf8");
  if (source.includes("keyboard.KeyW")) {
    await writeFile(path, source.replace("keyboard.KeyW", "keyboard.not-a-key"));
    return;
  }
  await writeFile(path, source.replace("KeyW", "not-a-key"));
}

function parseJson(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stableStepId(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runTemplatePlayabilityGate({ keepProject: process.argv.includes("--keep-project") });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
