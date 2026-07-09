import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { buildProofManifest, diffProofManifests, evaluateProofFreshness, type IProofRecommendation } from "../game/proofManifest.js";
import { authoringCommand } from "./authoring.js";
import { buildCommand } from "./build.js";
import { normalizeArgv, readFlag } from "./sourceCommandUtils.js";

interface IProofRunStep {
  code: string;
  command: string;
  diagnostics: Array<{ code: string; message: string; severity: "warning" }>;
  exitCode: number;
  id: string;
  ran: boolean;
  stdout: string;
}

export async function proveCommand(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): Promise<ICommandResult> {
  const normalizedArgv = normalizeArgv(argv);
  const [subcommand] = normalizedArgv;
  const json = normalizedArgv.includes("--json");
  if (subcommand !== "changed") {
    return diagnosticResult(
      {
        code: "TN_PROVE_SUBCOMMAND_UNKNOWN",
        message: "Usage: tn prove changed [--project <path>] [--previous <manifest>] [--write-manifest] [--run] [--json]",
      },
      { exitCode: 2, json, stderr: !json },
    );
  }
  const projectPath = resolvePath(cwd, readFlag(normalizedArgv, "--project") ?? ".");
  const previousArg = readFlag(normalizedArgv, "--previous");
  const previousPath = previousArg === undefined ? undefined : resolvePath(projectPath, previousArg);
  const report = await evaluateProofFreshness({ ...(previousPath === undefined ? {} : { previousPath }), projectPath });
  const writeManifest = normalizedArgv.includes("--write-manifest");
  const run = normalizedArgv.includes("--run");
  const runSteps = run ? await runProofRecommendations(report.recommendations, projectPath) : [];
  const manifestPath = resolve(projectPath, "artifacts/game-production/proof-manifest.json");
  if (writeManifest) {
    await writeProofManifest(projectPath, manifestPath);
  }
  const payload = {
    ...report,
    manifestPath,
    mutate: writeManifest || runSteps.some((step) => step.ran),
    runSteps,
  };
  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : renderProveChanged(payload),
  };
}

async function runProofRecommendations(recommendations: IProofRecommendation[], projectPath: string): Promise<IProofRunStep[]> {
  const steps: IProofRunStep[] = [];
  for (const recommendation of recommendations) {
    if (recommendation.command.includes("<")) {
      steps.push(skippedRunStep(recommendation, "TN_PROVE_RUN_PLACEHOLDER", "Recommendation contains placeholder arguments and must be completed before it can run."));
      continue;
    }
    const tokens = shellWords(recommendation.command);
    const command = tokens.slice(0, 2).join(" ");
    const args = tokens.slice(2);
    const result = command === "tn authoring"
      ? await authoringCommand(rewriteProjectArg(args, projectPath), { cwd: projectPath })
      : command === "tn build"
        ? await buildCommand(rewriteProjectArg(args, projectPath), projectPath)
        : undefined;
    if (result === undefined) {
      steps.push(skippedRunStep(recommendation, "TN_PROVE_RUN_UNSUPPORTED", "This proof recommendation is deterministic, but tn prove changed does not own a runner for it yet."));
      continue;
    }
    steps.push({
      code: readResultCode(result) ?? (result.exitCode === 0 ? "TN_PROVE_RUN_STEP_OK" : "TN_PROVE_RUN_STEP_FAILED"),
      command: recommendation.command,
      diagnostics: [],
      exitCode: result.exitCode,
      id: recommendation.id,
      ran: true,
      stdout: result.stdout,
    });
  }
  return steps;
}

function skippedRunStep(recommendation: IProofRecommendation, code: "TN_PROVE_RUN_PLACEHOLDER" | "TN_PROVE_RUN_UNSUPPORTED", message: string): IProofRunStep {
  return {
    code,
    command: recommendation.command,
    diagnostics: [{ code, message, severity: "warning" }],
    exitCode: 0,
    id: recommendation.id,
    ran: false,
    stdout: "",
  };
}

function rewriteProjectArg(args: readonly string[], projectPath: string): string[] {
  const rewritten = [...args];
  const index = rewritten.indexOf("--project");
  if (index === -1) {
    return ["--project", projectPath, ...rewritten];
  }
  rewritten[index + 1] = projectPath;
  return rewritten;
}

function readResultCode(result: ICommandResult): string | undefined {
  try {
    const parsed = JSON.parse(result.stdout) as unknown;
    return isRecord(parsed) && typeof parsed.code === "string" ? parsed.code : undefined;
  } catch {
    return undefined;
  }
}

function shellWords(command: string): string[] {
  return command.split(/\s+/).filter((word) => word.length > 0);
}

export async function proofCommand(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): Promise<ICommandResult> {
  const normalizedArgv = normalizeArgv(argv);
  const [subcommand] = normalizedArgv;
  const json = normalizedArgv.includes("--json");
  if (subcommand !== "diff") {
    return diagnosticResult(
      { code: "TN_PROOF_SUBCOMMAND_UNKNOWN", message: "Usage: tn proof diff --from <manifest> --to <manifest> [--json]" },
      { exitCode: 2, json, stderr: !json },
    );
  }
  const from = readFlag(normalizedArgv, "--from");
  const to = readFlag(normalizedArgv, "--to");
  if (from === undefined || to === undefined) {
    return diagnosticResult(
      { code: "TN_PROOF_DIFF_ARGS_MISSING", message: "Usage: tn proof diff --from <manifest> --to <manifest> [--json]" },
      { exitCode: 2, json, stderr: !json },
    );
  }
  const report = await diffProofManifests({ fromPath: resolvePath(cwd, from), toPath: resolvePath(cwd, to) });
  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(report, null, 2)}\n` : `Proof diff: ${report.changed.length} changed, ${report.added.length} added, ${report.removed.length} removed.\n`,
  };
}

async function writeProofManifest(projectPath: string, manifestPath: string): Promise<void> {
  const manifest = await buildProofManifest({ commandParameters: { source: "tn prove changed --write-manifest" }, projectPath });
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function renderProveChanged(report: Awaited<ReturnType<typeof evaluateProofFreshness>> & { manifestPath: string; mutate: boolean; runSteps: IProofRunStep[] }): string {
  const rows = report.recommendations.map((recommendation) => `  ${recommendation.id}: ${recommendation.command}`).join("\n");
  const runRows = report.runSteps.length === 0 ? "" : `\nRun steps:\n${report.runSteps.map((step) => `  ${step.id}: ${step.code}`).join("\n")}\n`;
  return `Proof freshness: ${report.fresh ? "fresh" : "stale-or-unrecorded"}\nManifest: ${report.manifestPath}${report.mutate ? " (written or proof-run)" : ""}\nDiagnostics: ${report.diagnostics.length}\nRecommendations:\n${rows}\n${runRows}`;
}

function resolvePath(cwd: string, value: string): string {
  return isAbsolute(value) ? value : resolve(cwd, value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
