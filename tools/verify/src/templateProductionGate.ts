import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveArtifactTargets } from "./artifacts.js";
import { API_CARD_BUDGET_BYTES, renderScriptApiCard, validateApiCard } from "./apiCard.js";
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

const REQUIRED_GAME_SCRIPTS = ["iterate", "game:plan", "game:improve", "game:score", "game:qa", "game:release"] as const;

const REQUIRED_PROOF_COMMANDS = [
  { id: "authoring validate", matches: (command: string) => command.includes("tn authoring validate") },
  { id: "build", matches: (command: string) => command.includes("tn build") },
  { id: "playtest scenario", matches: (command: string) => command.includes("tn playtest") && command.includes("--scenario") && command.includes("playtests/") },
  { id: "screenshot", matches: (command: string) => command.includes("tn screenshot") },
  { id: "score", matches: (command: string) => command.includes("tn game score") },
  { id: "qa --run-proof", matches: (command: string) => command.includes("tn game qa") && command.includes("--run-proof") },
  { id: "release", matches: (command: string) => command.includes("tn game release") },
] as const;

interface TemplateManifest {
  baseline: "minimal" | "production";
  directoryName: string;
  generatedFiles: string[];
  instructionFiles: string[];
  maintained: boolean;
  name: string;
  packageScripts: string[];
  path: string;
  proofCommandIds: string[];
}

export async function runTemplateProductionGate(options: TemplateProductionGateOptions = {}): Promise<TemplateProductionGateResult> {
  const root = resolve(options.root ?? process.cwd());
  const targets = resolveArtifactTargets({ gate: "template-production", owner: { kind: "aggregate", name: "template-production" }, root });
  const reportPath = options.reportPath ?? targets.reportPath;
  const discoveredManifests = await discoverTemplateManifests(root);
  const templateNames = options.templates ?? discoveredManifests.filter((manifest) => manifest.maintained).map((manifest) => manifest.directoryName);
  const manifestsByTemplate = new Map(discoveredManifests.map((manifest) => [manifest.directoryName, manifest]));
  const diagnostics: VerificationDiagnostic[] = [];
  const steps: StepSummary[] = [];

  for (const templateName of templateNames) {
    const startedAtMs = Date.now();
    const templatePath = resolve(root, "templates", templateName);
    const templateDiagnostics = await templateDiagnosticsFor(templateName, templatePath, manifestsByTemplate.get(templateName));
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

async function templateDiagnosticsFor(
  templateName: string,
  templatePath: string,
  manifest: TemplateManifest | undefined,
): Promise<VerificationDiagnostic[]> {
  const diagnostics: VerificationDiagnostic[] = [];
  const packagePath = resolve(templatePath, "package.json");
  const configPath = resolve(templatePath, "threenative.config.json");
  const readmePath = resolve(templatePath, "README.md");
  const agentsPath = resolve(templatePath, "AGENTS.md");
  const apiCardPath = resolve(templatePath, "docs", "API-CARD.md");
  const templatePlanPath = resolve(templatePath, "AGENT_GAME_PLAN.md");
  const sharedPlanPath = resolve(templatePath, "..", "_shared", "AGENT_GAME_PLAN.md");
  const sharedEnvExamplePath = resolve(templatePath, "..", "_shared", ".env.example");
  const gitignorePath = resolve(templatePath, ".gitignore");

  const envExampleText = await readText(sharedEnvExamplePath);
  if (!/^ELEVENLABS_API_KEY=$/m.test(envExampleText)) {
    diagnostics.push({
      code: "TN_TEMPLATE_ENV_EXAMPLE_MISSING",
      message: `${templateName}: the shared .env.example must declare an empty ELEVENLABS_API_KEY.`,
      path: sharedEnvExamplePath,
      severity: "error",
      suggestedFix: "Restore templates/_shared/.env.example with the optional local-tooling credential placeholder.",
    });
  }
  const gitignoreText = await readText(gitignorePath);
  const requiredEnvIgnoreLines = [".env", ".env.local", ".env.*.local", "!.env.example"];
  const gitignoreLines = new Set(gitignoreText.split(/\r?\n/).map((line) => line.trim()));
  const missingEnvIgnoreLines = requiredEnvIgnoreLines.filter((line) => !gitignoreLines.has(line));
  if (missingEnvIgnoreLines.length > 0) {
    diagnostics.push({
      code: "TN_TEMPLATE_ENV_IGNORE_INCOMPLETE",
      message: `${templateName}: .gitignore is missing the project-local env convention: ${missingEnvIgnoreLines.join(", ")}.`,
      path: gitignorePath,
      severity: "error",
      suggestedFix: "Ignore local env files and explicitly retain .env.example.",
    });
  }

  if (manifest === undefined) {
    diagnostics.push({
      code: "TN_TEMPLATE_MANIFEST_MISSING",
      message: `${templateName}: maintained templates must define threenative.template.json.`,
      path: resolve(templatePath, "threenative.template.json"),
      severity: "error",
      suggestedFix: "Add a template manifest with generatedFiles, packageScripts, proofCommandIds, and instructionFiles.",
    });
  } else {
    diagnostics.push(...templateManifestDiagnostics(templateName, templatePath, manifest));
  }

  const packageJson = await readJson(packagePath);
  const scripts = isRecord(packageJson?.scripts) ? packageJson.scripts : {};
  const requiredGameScripts = manifest?.packageScripts ?? [...REQUIRED_GAME_SCRIPTS];
  for (const script of requiredGameScripts) {
    if (!hasNonEmptyString(scripts[script])) {
      diagnostics.push({
        code: "TN_TEMPLATE_PRODUCTION_SCRIPT_MISSING",
        message: `${templateName}: maintained game starter must define package script '${script}'.`,
        path: packagePath,
        severity: "error",
        suggestedFix: "Add iterate, game:plan, game:improve, game:score, proof-running game:qa, and game:release scripts to the template package.json.",
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
  if (hasNonEmptyString(scripts["game:plan"]) && (scripts["game:plan"].includes(">") || !scripts["game:plan"].includes("tn game plan") || !scripts["game:plan"].includes("--json"))) {
    diagnostics.push({
      code: "TN_TEMPLATE_PRODUCTION_PLAN_ARTIFACT_MISSING",
      message: `${templateName}: package script 'game:plan' must let tn game plan persist artifacts/game-production/plan.json without redirecting compact stdout.`,
      path: packagePath,
      severity: "error",
      suggestedFix: "Run 'tn game plan --goal <goal> --project . --json'; the CLI writes artifacts/game-production/plan.json.",
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
  const requiredProofCommands = REQUIRED_PROOF_COMMANDS.filter((proof) => manifest?.proofCommandIds.includes(proof.id) ?? true);
  const missingProofCommands = requiredProofCommands.filter((proof) => !proofCommands.some(proof.matches)).map((proof) => proof.id);
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
      suggestedFix: "Add a production block with playableLoop, controls, objective, failRetry, and authoring/build/scenario-playtest/screenshot/score/QA/release proofCommands.",
    });
  }
  if (!isRecord(agent)
    || !isRecord(agent.sourceShape)
    || !hasNonEmptyArray(agent.highValueSurfaces)
    || (manifest?.baseline !== "minimal" && !hasNonEmptyArray(agent.scriptModules))
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
    const missingTerms = ["iterate", "game:plan", "game:improve", "game:qa", "game:release"].filter((term) => !text.includes(term));
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

  const agentsDocText = await readText(agentsPath);
  if (!agentsDocText.includes("tn game providers") || !agentsDocText.includes("tn audio generate-sfx") || !/offline fallback/i.test(agentsDocText)) {
    diagnostics.push({
      code: "TN_TEMPLATE_LOCAL_SFX_GUIDANCE_MISSING",
      message: `${templateName}: AGENTS.md must prefer bounded SFX generation when the provider is available and name an offline fallback.`,
      path: agentsPath,
      severity: "error",
      suggestedFix: "Document tn game providers, tn audio generate-sfx, project-local .env, and local/catalog/procedural offline fallback audio.",
    });
  }
  if (!/pnpm run iterate[\s\S]{0,120}default repair loop/i.test(agentsDocText)) {
    diagnostics.push({
      code: "TN_TEMPLATE_ITERATE_FIRST_MISSING",
      message: `${templateName}: AGENTS.md must make pnpm run iterate the default repair loop after source/script/gameplay changes.`,
      path: agentsPath,
      severity: "error",
      suggestedFix: "Move validate/build/playtest commands under focused fallback guidance and make pnpm run iterate the first post-edit loop.",
    });
  }
  if (!/compact\s+(?:playtest|stdout)/i.test(agentsDocText) || !/deep\s+logs/i.test(agentsDocText)) {
    diagnostics.push({
      code: "TN_TEMPLATE_COMPACT_REPORT_GUIDANCE_MISSING",
      message: `${templateName}: AGENTS.md must direct agents to compact reports before deep frame/effect logs.`,
      path: agentsPath,
      severity: "error",
      suggestedFix: "Tell agents to use compact stdout or tn playtest report first, and open deep logs only when diagnostics point to them.",
    });
  }
  if (!agentsDocText.includes("docs/API-CARD.md")) {
    diagnostics.push({
      code: "TN_TEMPLATE_API_CARD_REFERENCE_MISSING",
      message: `${templateName}: AGENTS.md must point agents at docs/API-CARD.md before repo source spelunking.`,
      path: agentsPath,
      severity: "error",
      suggestedFix: "Mention docs/API-CARD.md as the local ScriptContext/source contract in AGENTS.md.",
    });
  }
  const cardText = await readText(apiCardPath);
  const root = resolve(templatePath, "..", "..");
  const sourceText = await readText(resolve(root, "packages/script-stdlib/src/script-context.ts"));
  const expectedCard = sourceText === "" ? cardText : await renderScriptApiCard({ root });
  const validation = sourceText === ""
    ? { missingMembers: [], ok: cardText.trim() !== "", tooLarge: Buffer.byteLength(cardText, "utf8") > API_CARD_BUDGET_BYTES }
    : validateApiCard({ card: cardText, source: sourceText });
  if (cardText.trim() === "" || cardText.trim() !== expectedCard.trim() || !validation.ok) {
    diagnostics.push({
      code: validation.tooLarge ? "TN_TEMPLATE_API_CARD_BUDGET_EXCEEDED" : "TN_TEMPLATE_API_CARD_DRIFT",
      message: validation.tooLarge
        ? `${templateName}: docs/API-CARD.md exceeds ${API_CARD_BUDGET_BYTES} bytes.`
        : `${templateName}: docs/API-CARD.md must match the generated ScriptContext API card; missing ${validation.missingMembers.join(", ") || "generated content parity"}.`,
      path: apiCardPath,
      severity: "error",
      suggestedFix: "Regenerate docs/API-CARD.md from packages/script-stdlib/src/script-context.ts.",
    });
  }

  const templatePlanText = await readText(templatePlanPath);
  const sharedPlanText = await readText(sharedPlanPath);
  const planPath = templatePlanText.trim() === "" ? sharedPlanPath : templatePlanPath;
  const planText = templatePlanText.trim() === "" ? sharedPlanText : templatePlanText;
  if (planText.trim() === "") {
    diagnostics.push({
      code: "TN_TEMPLATE_AGENT_PLAN_MISSING",
      message: `${templateName}: maintained game starter must scaffold AGENT_GAME_PLAN.md from templates/_shared or a template-owned file.`,
      path: planPath,
      severity: "error",
      suggestedFix: "Copy templates/_shared/AGENT_GAME_PLAN.md into created projects and include it in maintained starter checks.",
    });
  } else {
    const missingPlanTerms = [
      "Playable Loop",
      "Player/hero",
      "Obstacle/enemy/vehicle",
      "Reward/interactable",
      "World/environment",
      "UI/HUD",
      "Audio feedback",
      "tn asset source get <asset-source-id> --json",
      "native ThreeNative UI",
      "React webview UI",
      "inventories",
      "cannot attach to a 3D element",
    ].filter((term) => !planText.includes(term));
    const hasCatalogSearch = planText.includes("tn asset source search --game-category <category>")
      && planText.includes("--format glb")
      && planText.includes("--direct-only")
      && planText.includes("--json");

    if (missingPlanTerms.length > 0 || !hasCatalogSearch) {
      diagnostics.push({
        code: "TN_TEMPLATE_AGENT_PLAN_ASSET_CATALOG_MISSING",
        message: `${templateName}: AGENT_GAME_PLAN.md must require high-value surface planning, catalog-first asset sourcing, provenance, native UI, and React webview UI limits${missingPlanTerms.length > 0 ? `; missing ${missingPlanTerms.join(", ")}` : ""}.`,
        path: planPath,
        severity: "error",
        suggestedFix: "Restore the shared game planning worksheet with catalog search/get commands, UI approach guidance, and all high-value surface rows.",
      });
    }
  }

  const readmeText = await readText(readmePath);
  const agentsText = await readText(agentsPath);
  const missingReferences: string[] = [];
  if (!readmeText.includes("AGENT_GAME_PLAN.md")) {
    missingReferences.push("README.md");
  }
  const startsWithCompactPlan = /before creating or substantially changing the game[\s\S]{0,160}(?:tn|pnpm\s+tn\s+--)\s+game\s+plan/i.test(agentsText);
  if (!agentsText.includes("AGENT_GAME_PLAN.md") || (!/first game-creation action/i.test(agentsText) && !startsWithCompactPlan)) {
    missingReferences.push("AGENTS.md");
  }
  if (missingReferences.length > 0) {
    diagnostics.push({
      code: "TN_TEMPLATE_AGENT_PLAN_REFERENCE_MISSING",
      message: `${templateName}: ${missingReferences.join(" and ")} must make the compact game plan the first game-creation action and retain AGENT_GAME_PLAN.md as the detailed fallback.`,
      path: missingReferences.includes("AGENTS.md") ? agentsPath : readmePath,
      severity: "error",
      suggestedFix: "Run tn game plan before source mutation and reference AGENT_GAME_PLAN.md from starter README and AGENTS.md as the detailed fallback.",
    });
  }

  return diagnostics;
}

async function discoverTemplateManifests(root: string): Promise<TemplateManifest[]> {
  let entries: { isDirectory(): boolean; name: string }[];
  try {
    entries = await readdir(resolve(root, "templates"), { withFileTypes: true });
  } catch {
    return [];
  }
  const manifests = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => readTemplateManifest(entry.name, resolve(root, "templates", entry.name, "threenative.template.json"))));
  return manifests.filter((manifest): manifest is TemplateManifest => manifest !== undefined).sort((a, b) => a.directoryName.localeCompare(b.directoryName));
}

async function readTemplateManifest(directoryName: string, path: string): Promise<TemplateManifest | undefined> {
  const parsed = await readJson(path);
  if (parsed === undefined || parsed.schema !== "threenative.template.manifest") {
    return undefined;
  }
  const name = hasNonEmptyString(parsed.name) ? parsed.name : undefined;
  if (name === undefined) {
    return undefined;
  }
  return {
    baseline: parsed.baseline === "minimal" ? "minimal" : "production",
    directoryName,
    generatedFiles: stringArrayOrEmpty(parsed.generatedFiles),
    instructionFiles: stringArrayOrEmpty(parsed.instructionFiles),
    maintained: parsed.maintained === true,
    name,
    packageScripts: stringArrayOrEmpty(parsed.packageScripts),
    path,
    proofCommandIds: stringArrayOrEmpty(parsed.proofCommandIds),
  };
}

function templateManifestDiagnostics(templateName: string, templatePath: string, manifest: TemplateManifest): VerificationDiagnostic[] {
  const diagnostics: VerificationDiagnostic[] = [];
  if (manifest.name !== templateName) {
    diagnostics.push({
      code: "TN_TEMPLATE_MANIFEST_NAME_DRIFT",
      message: `${templateName}: threenative.template.json name must match the template directory.`,
      path: `${manifest.path}#/name`,
      severity: "error",
      suggestedFix: `Set name to '${templateName}'.`,
    });
  }
  for (const [field, values] of [
    ["generatedFiles", manifest.generatedFiles],
    ["instructionFiles", manifest.instructionFiles],
    ["packageScripts", manifest.packageScripts],
    ["proofCommandIds", manifest.proofCommandIds],
  ] as const) {
    if (values.length === 0) {
      diagnostics.push({
        code: "TN_TEMPLATE_MANIFEST_FIELD_MISSING",
        message: `${templateName}: threenative.template.json must define ${field}.`,
        path: `${manifest.path}#/${field}`,
        severity: "error",
        suggestedFix: `Add ${field} entries to the template manifest.`,
      });
    }
  }
  const knownProofIds = new Set<string>(REQUIRED_PROOF_COMMANDS.map((proof) => proof.id));
  for (const proofId of manifest.proofCommandIds) {
    if (!knownProofIds.has(proofId)) {
      diagnostics.push({
        code: "TN_TEMPLATE_MANIFEST_PROOF_UNKNOWN",
        message: `${templateName}: threenative.template.json declares unknown proof command id '${proofId}'.`,
        path: `${manifest.path}#/proofCommandIds`,
        severity: "error",
        suggestedFix: `Use one of: ${[...knownProofIds].join(", ")}.`,
      });
    }
  }
  for (const script of REQUIRED_GAME_SCRIPTS) {
    if (!manifest.packageScripts.includes(script)) {
      diagnostics.push({
        code: "TN_TEMPLATE_MANIFEST_SCRIPT_MISSING",
        message: `${templateName}: threenative.template.json packageScripts must include '${script}'.`,
        path: `${manifest.path}#/packageScripts`,
        severity: "error",
        suggestedFix: "Keep required starter package scripts owned by threenative.template.json.",
      });
    }
  }
  for (const generatedFile of manifest.generatedFiles) {
    if (!fileExistsSyncSafe(resolve(templatePath, generatedFile)) && !fileExistsSyncSafe(resolve(templatePath, "..", "_shared", generatedFile))) {
      diagnostics.push({
        code: "TN_TEMPLATE_MANIFEST_GENERATED_FILE_MISSING",
        message: `${templateName}: manifest generated file '${generatedFile}' does not exist in the template.`,
        path: `${manifest.path}#/generatedFiles`,
        severity: "error",
        suggestedFix: "Restore the generated template file or remove stale manifest metadata.",
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

function stringArrayOrEmpty(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(hasNonEmptyString) : [];
}

function fileExistsSyncSafe(path: string): boolean {
  return existsSync(path);
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
