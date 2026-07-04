import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveArtifactTargets } from "./artifacts.js";
import { type StepSummary, type VerificationDiagnostic } from "./runner.js";

export interface TemplateProductionGateOptions {
  reportPath?: string;
  root?: string;
  templates?: readonly string[];
}

export interface TemplateProductionGateResult {
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  reportPath: string;
  steps: StepSummary[];
}

const DEFAULT_TEMPLATE_NAMES = ["structured-source-starter", "racing-kit-rally-starter"] as const;
const REQUIRED_GAME_SCRIPTS = ["game:plan", "game:improve", "game:score", "game:qa", "game:release"] as const;

const REQUIRED_PROOF_COMMANDS = [
  { id: "authoring validate", matches: (command: string) => command.includes("tn authoring validate") },
  { id: "build", matches: (command: string) => command.includes("tn build") },
  { id: "playtest", matches: (command: string) => command.includes("tn playtest") && command.includes("--expect-moved") },
  { id: "screenshot", matches: (command: string) => command.includes("tn screenshot") },
  { id: "score", matches: (command: string) => command.includes("tn game score") },
  { id: "qa --run-proof", matches: (command: string) => command.includes("tn game qa") && command.includes("--run-proof") },
  { id: "release", matches: (command: string) => command.includes("tn game release") },
] as const;

export async function runTemplateProductionGate(options: TemplateProductionGateOptions = {}): Promise<TemplateProductionGateResult> {
  const root = resolve(options.root ?? process.cwd());
  const targets = resolveArtifactTargets({ gate: "template-production", owner: { kind: "aggregate", name: "template-production" }, root });
  const reportPath = options.reportPath ?? targets.reportPath;
  const templateNames = options.templates ?? DEFAULT_TEMPLATE_NAMES;
  const diagnostics: VerificationDiagnostic[] = [];
  const steps: StepSummary[] = [];

  for (const templateName of templateNames) {
    const startedAtMs = Date.now();
    const templatePath = resolve(root, "templates", templateName);
    const templateDiagnostics = await templateDiagnosticsFor(templateName, templatePath);
    diagnostics.push(...templateDiagnostics);
    const ok = templateDiagnostics.every((diagnostic) => diagnostic.severity !== "error");
    steps.push({
      durationMs: Date.now() - startedAtMs,
      exitCode: ok ? 0 : 1,
      name: `template production scaffold validation: ${templateName}`,
      stderr: "",
      stdout: JSON.stringify({
        diagnostics: templateDiagnostics.length,
        templateName,
        templatePath,
      }),
    });
  }

  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  const payload = {
    artifacts: {
      templateNames,
    },
    code: ok ? "TN_VERIFY_TEMPLATE_PRODUCTION_OK" : "TN_VERIFY_TEMPLATE_PRODUCTION_FAILED",
    diagnostics,
    generatedBy: "@threenative/verify-tools templateProductionGate",
    ok,
    schema: "threenative.verify.template-production",
    startedAt: new Date().toISOString(),
    status: ok ? "pass" : "fail",
    steps,
    version: "0.1.0",
  };

  await mkdir(resolve(reportPath, ".."), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return {
    diagnostics,
    ok,
    reportPath,
    steps,
  };
}

async function templateDiagnosticsFor(templateName: string, templatePath: string): Promise<VerificationDiagnostic[]> {
  const diagnostics: VerificationDiagnostic[] = [];
  const packagePath = resolve(templatePath, "package.json");
  const configPath = resolve(templatePath, "threenative.config.json");
  const readmePath = resolve(templatePath, "README.md");
  const agentsPath = resolve(templatePath, "AGENTS.md");

  const packageJson = await readJson(packagePath);
  const scripts = isRecord(packageJson?.scripts) ? packageJson.scripts : {};
  for (const script of REQUIRED_GAME_SCRIPTS) {
    if (!hasNonEmptyString(scripts[script])) {
      diagnostics.push({
        code: "TN_TEMPLATE_PRODUCTION_SCRIPT_MISSING",
        message: `${templateName}: maintained game starter must define package script '${script}'.`,
        path: packagePath,
        severity: "error",
        suggestedFix: "Add game:plan, game:improve, game:score, proof-running game:qa, and game:release scripts to the template package.json.",
      });
    }
  }
  if (hasNonEmptyString(scripts["game:qa"]) && !scripts["game:qa"].includes("--run-proof")) {
    diagnostics.push({
      code: "TN_TEMPLATE_PRODUCTION_QA_PROOF_MISSING",
      message: `${templateName}: package script 'game:qa' must run tn game qa with --run-proof.`,
      path: packagePath,
      severity: "error",
      suggestedFix: "Change game:qa to 'tn game qa --project . --run-proof --json'.",
    });
  }
  if (hasNonEmptyString(scripts["game:plan"]) && !scripts["game:plan"].includes("artifacts/game-production/plan.json")) {
    diagnostics.push({
      code: "TN_TEMPLATE_PRODUCTION_PLAN_ARTIFACT_MISSING",
      message: `${templateName}: package script 'game:plan' must persist artifacts/game-production/plan.json.`,
      path: packagePath,
      severity: "error",
      suggestedFix: "Pipe tn game plan --json output to artifacts/game-production/plan.json.",
    });
  }
  if (hasNonEmptyString(scripts["game:improve"]) && !scripts["game:improve"].includes("artifacts/game-production/plan.json")) {
    diagnostics.push({
      code: "TN_TEMPLATE_PRODUCTION_IMPROVE_PLAN_MISSING",
      message: `${templateName}: package script 'game:improve' must apply artifacts/game-production/plan.json.`,
      path: packagePath,
      severity: "error",
      suggestedFix: "Run tn game improve --apply-plan artifacts/game-production/plan.json --project . --json.",
    });
  }

  const config = await readJson(configPath);
  const production = isRecord(config?.production) ? config.production : undefined;
  const agent = isRecord(production?.agent) ? production.agent : undefined;
  const proofCommands = hasStringArray(production?.proofCommands) ? production.proofCommands : [];
  const missingProofCommands = REQUIRED_PROOF_COMMANDS.filter((proof) => !proofCommands.some(proof.matches)).map((proof) => proof.id);
  if (!isRecord(production)
    || !hasNonEmptyString(production.playableLoop)
    || !hasStringArray(production.controls)
    || !hasNonEmptyString(production.objective)
    || !hasNonEmptyString(production.failRetry)
    || missingProofCommands.length > 0
  ) {
    diagnostics.push({
      code: "TN_TEMPLATE_PRODUCTION_METADATA_INCOMPLETE",
      message: `${templateName}: threenative.config.json must define production loop, controls, objective, retry path, and proof commands${missingProofCommands.length > 0 ? `; missing ${missingProofCommands.join(", ")}` : ""}.`,
      path: configPath,
      severity: "error",
      suggestedFix: "Add a production block with playableLoop, controls, objective, failRetry, and authoring/build/playtest/screenshot/score/QA/release proofCommands.",
    });
  }
  if (!isRecord(agent)
    || !isRecord(agent.sourceShape)
    || !hasNonEmptyArray(agent.highValueSurfaces)
    || !hasNonEmptyArray(agent.scriptModules)
    || !hasNonEmptyArray(agent.uiStates)
    || !hasStringArray(agent.proofCommands)
  ) {
    diagnostics.push({
      code: "TN_TEMPLATE_PRODUCTION_AGENT_METADATA_INCOMPLETE",
      message: `${templateName}: threenative.config.json production.agent must define sourceShape, highValueSurfaces, scriptModules, uiStates, and proofCommands.`,
      path: configPath,
      severity: "error",
      suggestedFix: "Add normalized production.agent metadata so tn game inspect can identify source owners, script owners, UI states, high-value surfaces, and proof commands.",
    });
  }

  for (const path of [readmePath, agentsPath]) {
    const text = await readText(path);
    const missingTerms = ["game:plan", "game:improve", "game:qa", "game:release"].filter((term) => !text.includes(term));
    if (missingTerms.length > 0) {
      diagnostics.push({
        code: "TN_TEMPLATE_PRODUCTION_DOCS_INCOMPLETE",
        message: `${templateName}: ${path.endsWith("AGENTS.md") ? "AGENTS.md" : "README.md"} must document the production loop scripts; missing ${missingTerms.join(", ")}.`,
        path,
        severity: "error",
        suggestedFix: "Document the plan/improve/QA/release workflow in maintained starter instructions.",
      });
    }
  }

  return diagnostics;
}

async function readJson(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function hasStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(hasNonEmptyString);
}

function hasNonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runTemplateProductionGate();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
