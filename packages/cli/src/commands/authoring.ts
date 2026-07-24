import {
  applyAuthoringBatch,
  type IAuthoringBatchApplyResult,
  type IAuthoringBatchDocument,
  type IAuthoringBatchPlanResult,
  loadAuthoringProject,
  planAuthoringBatch,
  validateAuthoringProject,
} from "@threenative/authoring";
import {
  compileTypedGameSpecFile,
  createCompactAuthoringProfile,
  diagnosePortableScriptPreflight,
  resolveSystemScriptSources,
  type ISystemScriptSource,
} from "@threenative/compiler";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { type ICommandResult } from "../diagnostics.js";
import { applyPlanDerivedPrototype, removePlanDerivedPrototype } from "../game/prototypeAuthoring.js";
import { listMechanicBlocks } from "../mechanicBlocks/registry.js";
import { runOwnedCommand } from "../process/runCommand.js";

const ITERATE_NOTICE = "Standalone authoring validation is subsumed by tn iterate --project . --json for the normal agent verify loop.";
const ITERATE_NEXT = "tn iterate --project . --json";
export const AUTHORING_BATCH_INPUT_MAX_BYTES = 1024 * 1024;
export const AUTHORING_BATCH_STDOUT_MAX_BYTES = 256 * 1024;
export const AUTHORING_INSPECT_STDOUT_MAX_BYTES = 16 * 1024;

interface IAuthoringCommandOptions {
  cwd?: string;
  runPrototypeProof?: (projectPath: string) => Promise<ICommandResult>;
  stdin?: AsyncIterable<string | Uint8Array>;
}

export async function authoringCommand(argv: readonly string[], options: IAuthoringCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [subcommand] = normalizedArgv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv, options.cwd);

  if (subcommand === "batch") {
    return authoringBatchCommand(normalizedArgv, projectPath, json, options);
  }

  if (subcommand === "script") {
    return authoringScriptCommand(normalizedArgv.slice(1), projectPath, json);
  }

  if (subcommand === "inspect") {
    return authoringInspectCommand(normalizedArgv, projectPath, json);
  }

  if (subcommand === "prototype") {
    const fromPlan = readFlag(normalizedArgv, "--from-plan") ?? "artifacts/game-production/plan.json";
    const planPath = resolve(projectPath, fromPlan);
    if (!isWithinProject(projectPath, planPath)) {
      return renderInspectionError("TN_AUTHORING_PROTOTYPE_PLAN_PATH_INVALID", "Prototype plan must be inside the selected project.", json);
    }
    const result = normalizedArgv.includes("--remove")
      ? await removePlanDerivedPrototype({ planPath, projectPath })
      : await applyPlanDerivedPrototype({
          planPath,
          projectPath,
          replaceTargets: readFlags(normalizedArgv, "--replace-target"),
          reviewedPlanHash: readFlag(normalizedArgv, "--reviewed-plan-hash"),
        });
    if (result.ok && normalizedArgv.includes("--run-proof")) {
      let proof: ICommandResult;
      try {
        if (options.runPrototypeProof !== undefined) {
          proof = await options.runPrototypeProof(projectPath);
        } else {
          const owned = await runOwnedCommand(
            process.execPath,
            [resolve(import.meta.dirname, "../index.js"), "iterate", "--project", projectPath, "--json"],
            { cwd: options.cwd ?? process.cwd() },
          );
          proof = {
            exitCode: owned.exitCode,
            stderr: owned.stderr,
            stdout: owned.stdout,
          };
        }
      } catch (error) {
        const rolledBack = await result.rollback?.() ?? false;
        return renderPayload({
          code: "TN_AUTHORING_PROTOTYPE_PROOF_FAILED",
          diagnostics: [{ code: "TN_AUTHORING_PROTOTYPE_PROOF_FAILED", message: error instanceof Error ? error.message : String(error), severity: "error" }],
          message: rolledBack ? "Prototype proof failed; the authoring transaction was rolled back." : "Prototype proof failed and rollback did not complete.",
          ok: false,
          rolledBack,
        }, json, "Prototype proof failed.", 1);
      }
      if (proof.exitCode !== 0) {
        const rolledBack = await result.rollback?.() ?? false;
        return renderPayload({
          code: "TN_AUTHORING_PROTOTYPE_PROOF_FAILED",
          diagnostics: [{ code: "TN_AUTHORING_PROTOTYPE_PROOF_FAILED", message: "Prototype proof returned a failing result.", severity: "error" }],
          message: rolledBack ? "Prototype proof failed; the authoring transaction was rolled back." : "Prototype proof failed and rollback did not complete.",
          ok: false,
          proof: parseJsonPayload(proof.stdout),
          rolledBack,
        }, json, "Prototype proof failed.", 1);
      }
      return proof;
    }
    return renderPayload(result, json, result.message, result.ok ? 0 : 1);
  }

  if (subcommand === "validate") {
    const result = await validateAuthoringProject({ projectPath });
    const payload = {
      code: result.ok ? "TN_AUTHORING_VALIDATE_OK" : "TN_AUTHORING_VALIDATE_FAILED",
      message: result.ok ? "Authoring source validation passed." : "Authoring source validation failed.",
      ...result,
      next: ITERATE_NEXT,
      notice: ITERATE_NOTICE,
    };
    return renderPayload(payload, json, payload.message, result.ok ? 0 : 1);
  }

  if (subcommand === "compile-typed-spec") {
    const entryFlagIndex = normalizedArgv.indexOf("--entry");
    const result = await compileTypedGameSpecFile({
      entry: entryFlagIndex === -1 ? undefined : normalizedArgv[entryFlagIndex + 1],
      projectPath,
    });
    const payload = {
      code: "TN_AUTHORING_TYPED_SPEC_COMPILED",
      message: `Compiled typed game spec '${result.entry}'.`,
      ...result,
      next: "tn build --project . --json",
      notice: "Typed spec emits canonical content JSON before the normal build path.",
    };
    return renderPayload(payload, json, payload.message);
  }

  return renderUsage(json);
}

async function authoringScriptCommand(argv: readonly string[], projectPath: string, json: boolean): Promise<ICommandResult> {
  const action = argv[0];
  if (action !== "scaffold" && action !== "check") {
    return renderInspectionError(
      "TN_AUTHORING_SCRIPT_ACTION_UNKNOWN",
      "Usage: tn authoring script scaffold|check [--module src/scripts/<name>.ts] [--export <name>] [--project <path>] [--json]",
      json,
    );
  }
  const modulePath = readFlag(argv, "--module") ?? "src/scripts/customBehavior.ts";
  const target = validateScriptTarget(projectPath, modulePath);
  if (!target.ok) return renderInspectionError(target.code, target.message, json);
  if (action === "scaffold") return scaffoldPortableScript(argv, projectPath, modulePath, target.absolutePath, json);
  return checkPortableScript(argv, projectPath, modulePath, target.absolutePath, json);
}

async function scaffoldPortableScript(
  argv: readonly string[],
  projectPath: string,
  modulePath: string,
  absolutePath: string,
  json: boolean,
): Promise<ICommandResult> {
  try {
    await readFile(absolutePath, "utf8");
    return renderInspectionError("TN_AUTHORING_SCRIPT_TARGET_EXISTS", `Script target '${modulePath}' already exists.`, json);
  } catch (error) {
    if (!isFileSystemError(error, "ENOENT")) {
      return renderInspectionError("TN_AUTHORING_SCRIPT_TARGET_READ_FAILED", `Could not safely inspect existing script target '${modulePath}'.`, json);
    }
  }
  const project = await loadAuthoringProject({ projectPath });
  const available = scriptSelectionIds(project.documents.map((document) => document.data));
  const entityId = readFlag(argv, "--entity") ?? available.entities.find((id) => id.toLowerCase().includes("player")) ?? available.entities[0];
  const resourceId = readFlag(argv, "--resource") ?? available.resources[0];
  const inputId = readFlag(argv, "--input") ?? available.input[0];
  const exportName = readFlag(argv, "--export") ?? "updateCustomBehavior";
  const missing = [
    ...(entityId === undefined ? ["entity"] : []),
    ...(resourceId === undefined ? ["resource"] : []),
    ...(inputId === undefined ? ["input"] : []),
  ];
  if (missing.length > 0) {
    return renderInspectionError(
      "TN_AUTHORING_SCRIPT_SELECTION_MISSING",
      `Portable behavior scaffold requires real project ${missing.join(", ")} IDs. Pass ${missing.map((id) => `--${id} <id>`).join(" ")} after adding them to structured source.`,
      json,
    );
  }
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(exportName)) {
    return renderInspectionError("TN_AUTHORING_SCRIPT_EXPORT_INVALID", `Script export '${exportName}' is not a valid JavaScript identifier.`, json);
  }
  const behaviorId = exportName.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  const source = `import { defineBehavior, type ScriptContext } from "@threenative/script-stdlib";

export const ${exportName} = defineBehavior(
  {
    id: ${JSON.stringify(behaviorId)},
    resourceReads: [${JSON.stringify(resourceId)}],
    resourceWrites: [${JSON.stringify(resourceId)}],
    schedule: "fixedUpdate",
    writes: ["Transform"],
  },
  (context: ScriptContext): void => {
    if (!context.input.pressed(${JSON.stringify(inputId)})) return;
    const entity = context.entity(${JSON.stringify(entityId)});
    if (entity === undefined) return;
    const state = context.resources.get(${JSON.stringify(resourceId)}, { activations: 0, statusText: "Ready" });
    const position = entity.transform().position;
    entity.transform().setPosition([position[0] + 1, position[1], position[2]]);
    context.resources.patch(${JSON.stringify(resourceId)}, {
      activations: state.activations + 1,
      statusText: "Activated",
    });
  },
);
`;
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, source, "utf8");
  const payload = {
    code: "TN_AUTHORING_SCRIPT_SCAFFOLDED",
    exportName,
    ids: { entityId, inputId, resourceId },
    message: `Portable behavior scaffold written to '${modulePath}'.`,
    modulePath,
    next: `tn authoring script check --module ${modulePath} --export ${exportName} --project . --json`,
  };
  return renderPayload(payload, json, payload.message);
}

async function checkPortableScript(
  argv: readonly string[],
  projectPath: string,
  modulePath: string,
  absolutePath: string,
  json: boolean,
): Promise<ICommandResult> {
  let source: string;
  try {
    source = await readFile(absolutePath, "utf8");
  } catch {
    return renderInspectionError("TN_AUTHORING_SCRIPT_SOURCE_MISSING", `Script source '${modulePath}' does not exist.`, json);
  }
  const exportName = readFlag(argv, "--export") ?? firstExportName(source);
  if (exportName === undefined) {
    return renderInspectionError("TN_AUTHORING_SCRIPT_EXPORT_MISSING", `Script source '${modulePath}' has no exported function or behavior to check.`, json);
  }
  const preflightSystems: ISystemScriptSource[] = [{
    name: `preflight.${exportName}`,
    script: {
      exportName,
      sourceRef: { export: exportName, module: modulePath, systemId: `preflight.${exportName}` },
    },
  }];
  const resolved = resolveSystemScriptSources(preflightSystems, projectPath);
  const system = resolved.systems[0];
  const portableSource = system?.script?.source ?? source.replace(/^\s*import[^;]+;\s*$/gm, "");
  const diagnostics = diagnosePortableScriptPreflight({
    commands: system?.commands?.map((command) => command.kind),
    eventWrites: system?.eventWrites,
    exportName,
    file: modulePath,
    queries: system?.queries,
    resourceReads: system?.resourceReads,
    resourceWrites: system?.resourceWrites,
    services: system?.services,
    source: portableSource,
    systemName: system?.name ?? `preflight.${exportName}`,
    upstreamDiagnostics: resolved.diagnostics,
    writes: system?.writes,
  });
  const ok = !diagnostics.some((diagnostic) => diagnostic.severity === "error");
  const payload = {
    code: ok ? "TN_AUTHORING_SCRIPT_CHECK_OK" : "TN_AUTHORING_SCRIPT_CHECK_FAILED",
    diagnostics,
    exportName,
    message: ok ? "Portable behavior preflight passed." : "Portable behavior preflight found static portability or declaration failures.",
    modulePath,
    ok,
  };
  return renderPayload(payload, json, payload.message, ok ? 0 : 1);
}

function validateScriptTarget(projectPath: string, modulePath: string):
  | { absolutePath: string; ok: true }
  | { code: string; message: string; ok: false } {
  const normalized = modulePath.replaceAll("\\", "/");
  const absolutePath = resolve(projectPath, normalized);
  const scriptsRoot = resolve(projectPath, "src/scripts");
  if (!normalized.endsWith(".ts") || !isWithinProject(scriptsRoot, absolutePath) || normalized.includes("scripts.bundle") || normalized.includes("/dist/")) {
    return {
      code: "TN_AUTHORING_SCRIPT_TARGET_INVALID",
      message: `Script target '${modulePath}' must be a source TypeScript file under src/scripts/**/*.ts and cannot be generated output.`,
      ok: false,
    };
  }
  return { absolutePath, ok: true };
}

function scriptSelectionIds(documents: readonly unknown[]): { entities: string[]; input: string[]; resources: string[] } {
  const entities = new Set<string>();
  const actions = new Set<string>();
  const axes = new Set<string>();
  const resources = new Set<string>();
  for (const value of documents) {
    const data = isRecord(value) ? value : {};
    for (const id of idsFrom(data.entities)) entities.add(id);
    for (const id of idsFrom(data.actions)) actions.add(id);
    for (const id of idsFrom(data.axes)) axes.add(id);
    for (const id of idsFrom(data.resources)) resources.add(id);
  }
  return { entities: [...entities].sort(), input: [...actions].sort().concat([...axes].sort()), resources: [...resources].sort() };
}

function firstExportName(source: string): string | undefined {
  return /\bexport\s+(?:const|function)\s+([A-Za-z_$][A-Za-z0-9_$]*)/.exec(source)?.[1];
}

interface IInspectionPlan {
  authoringMode?: "bounded-match" | "custom-on-starter";
  coveredResponsibilityIds: string[];
  intentContract: {
    acceptanceAssertions: Array<{ description: string; id: string; kind: string; proof?: { family: string; templateId: string }; required: boolean }>;
    id: string;
    prototype?: { id: string; proofRoles?: Record<string, string> };
    requiredCapabilities: string[];
  };
  schema: "threenative.game-plan";
  uncoveredResponsibilityIds: string[];
}

async function authoringInspectCommand(argv: readonly string[], projectPath: string, json: boolean): Promise<ICommandResult> {
  const planFlag = readFlag(argv, "--plan");
  let plan: IInspectionPlan | undefined;
  let planPath: string | undefined;
  if (planFlag !== undefined) {
    planPath = resolve(projectPath, planFlag);
    if (!isWithinProject(projectPath, planPath)) {
      return renderInspectionError("TN_AUTHORING_INSPECT_PLAN_PATH_INVALID", "Inspection plan must be inside the selected project.", json);
    }
    try {
      const parsed = JSON.parse(await readFile(planPath, "utf8")) as unknown;
      if (!isInspectionPlan(parsed)) throw new Error("invalid plan contract");
      plan = parsed;
    } catch {
      return renderInspectionError(
        "TN_AUTHORING_INSPECT_PLAN_INVALID",
        `Could not read a versioned game plan from '${relative(projectPath, planPath).replaceAll("\\", "/")}'.`,
        json,
      );
    }
  }

  if (plan?.authoringMode === "custom-on-starter" && plan.intentContract.prototype !== undefined) {
    const nextAuthoringCommand = "tn authoring prototype --from-plan artifacts/game-production/plan.json --project . --run-proof --json";
    const payload = {
      authoringMode: plan.authoringMode,
      code: "TN_AUTHORING_INSPECT_PROTOTYPE_READY",
      message: "A capability-selected custom prototype is ready; run nextAuthoringCommand exactly. It includes the first iterate proof, so do not inspect source or load another skill first.",
      nextAuthoringCommand,
      planPath: relative(projectPath, planPath!).replaceAll("\\", "/"),
      proofIncluded: true,
      prototypeCandidate: plan.intentContract.prototype.id,
      requiredAcceptanceIds: plan.intentContract.acceptanceAssertions.filter((item) => item.required).map((item) => item.id),
    };
    return renderPayload(payload, json, payload.message);
  }

  const project = await loadAuthoringProject({ projectPath });
  const relevantKinds = plan === undefined ? undefined : relevantDocumentKinds(plan.intentContract.requiredCapabilities);
  const documents = project.documents.filter((document) => relevantKinds === undefined || relevantKinds.has(document.kind));
  const projectDocuments = documents.map((document) => projectMapDocument(document.kind, document.projectRelativePath, document.data));
  const availableMechanicIds = new Set<string>(listMechanicBlocks().map((block) => block.id));
  const requiredAssertions = plan?.intentContract.acceptanceAssertions.filter((item) => item.required) ?? [];
  const enrolledAcceptanceIds = plan === undefined ? [] : await projectAcceptanceIds(projectPath);
  const requiredAcceptanceIds = requiredAssertions.map((item) => item.id);
  const missingAcceptanceIds = requiredAcceptanceIds.filter((id) => !enrolledAcceptanceIds.includes(id));
  const payload = {
    behaviorOwner: "src/scripts/**/*.ts",
    code: project.diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "TN_AUTHORING_INSPECT_FAILED" : "TN_AUTHORING_INSPECT_OK",
    diagnostics: project.diagnostics,
    documents: documents.map((document) => ({ kind: document.kind, path: document.projectRelativePath })),
    ...(plan === undefined ? {} : {
      intent: {
        acceptanceAssertions: requiredAssertions.map((item) => ({ description: item.description, id: item.id, kind: item.kind, proof: item.proof })),
        acceptanceIds: requiredAcceptanceIds,
        coveredResponsibilityIds: plan.coveredResponsibilityIds,
        id: plan.intentContract.id,
        uncoveredResponsibilityIds: plan.uncoveredResponsibilityIds,
      },
      mechanicCandidates: plan.intentContract.requiredCapabilities.filter((id) => availableMechanicIds.has(id)),
      ...(plan.authoringMode === "custom-on-starter" && plan.intentContract.prototype !== undefined
        ? { nextAuthoringCommand: "tn authoring prototype --from-plan artifacts/game-production/plan.json --project . --run-proof --json" }
        : {}),
      nextProofCommand: "tn playtest scaffold --from-plan artifacts/game-production/plan.json --project . --json",
      planPath: relative(projectPath, planPath!).replaceAll("\\", "/"),
      proofEnrollment: {
        enrolledAcceptanceIds: requiredAcceptanceIds.filter((id) => enrolledAcceptanceIds.includes(id)),
        missingAcceptanceIds,
        unrelatedAcceptanceIds: enrolledAcceptanceIds.filter((id) => !requiredAcceptanceIds.includes(id)),
      },
      proofGaps: requiredAssertions.filter((item) => missingAcceptanceIds.includes(item.id)).map((item) => ({ description: item.description, id: item.id, kind: item.kind, proof: item.proof })),
    }),
    operations: [
      "tn authoring batch plan --file <batch.json> --project . --json",
      "tn authoring batch apply --file <batch.json> --project . --json",
      "tn authoring script scaffold --project . --json",
      "tn authoring script check --project . --json",
      "tn playtest scaffold --from-plan artifacts/game-production/plan.json --project . --json",
    ],
    portableBehavior: createCompactAuthoringProfile(),
    projectMap: {
      documents: projectDocuments,
      schema: "threenative.project-map",
      version: "0.2.0",
    },
    proofOwner: "playtests/**/*.playtest.json",
    path: project.projectPath,
  };
  return renderInspectionPayload(payload, projectPath, json);
}

async function renderInspectionPayload(payload: Record<string, unknown>, projectPath: string, json: boolean): Promise<ICommandResult> {
  if (!json) return { exitCode: 0, stdout: "Authoring source inspection completed.\n" };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") <= AUTHORING_INSPECT_STDOUT_MAX_BYTES) {
    return { exitCode: 0, stdout: serialized };
  }
  const artifactPath = "artifacts/authoring/inspection-details.json";
  await mkdir(dirname(resolve(projectPath, artifactPath)), { recursive: true });
  await writeFile(resolve(projectPath, artifactPath), serialized, "utf8");
  const projectMap = compactProjectMap(payload.projectMap, 12, 8);
  const bounded = {
    ...payload,
    diagnostics: Array.isArray(payload.diagnostics) ? payload.diagnostics.slice(0, 20) : payload.diagnostics,
    detailsArtifactPath: artifactPath,
    documents: Array.isArray(payload.documents) ? payload.documents.slice(0, 12) : payload.documents,
    outputTruncated: true,
    projectMap,
  };
  const boundedSerialized = `${JSON.stringify(bounded, null, 2)}\n`;
  if (Buffer.byteLength(boundedSerialized, "utf8") <= AUTHORING_INSPECT_STDOUT_MAX_BYTES) {
    return { exitCode: 0, stdout: boundedSerialized };
  }
  const minimal = {
    behaviorOwner: payload.behaviorOwner,
    code: payload.code,
    detailsArtifactPath: artifactPath,
    intent: payload.intent,
    mechanicCandidates: payload.mechanicCandidates,
    nextProofCommand: payload.nextProofCommand,
    nextAuthoringCommand: payload.nextAuthoringCommand,
    operations: payload.operations,
    outputTruncated: true,
    planPath: payload.planPath,
    portableBehavior: payload.portableBehavior,
    projectMap: compactProjectMap(payload.projectMap, 8, 4),
    proofGaps: payload.proofGaps,
    proofEnrollment: payload.proofEnrollment,
    proofOwner: payload.proofOwner,
  };
  return { exitCode: 0, stdout: `${JSON.stringify(minimal, null, 2)}\n` };
}

async function projectAcceptanceIds(projectPath: string): Promise<string[]> {
  const playtestsPath = resolve(projectPath, "playtests");
  const entries = await readdir(playtestsPath, { withFileTypes: true }).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  });
  const ids = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".playtest.json"))
    .map(async (entry) => {
      try {
        const value = JSON.parse(await readFile(resolve(playtestsPath, entry.name), "utf8")) as unknown;
        return isRecord(value) && typeof value.acceptanceId === "string" ? value.acceptanceId : undefined;
      } catch {
        return undefined;
      }
    }));
  return [...new Set(ids.filter((id): id is string => id !== undefined))].sort();
}

function compactProjectMap(value: unknown, documentLimit: number, idLimit: number): unknown {
  if (!isRecord(value) || !Array.isArray(value.documents)) return value;
  return {
    ...value,
    documents: value.documents.slice(0, documentLimit).map((document) => {
      if (!isRecord(document) || !isRecord(document.ids)) return document;
      return {
        ...document,
        ids: Object.fromEntries(Object.entries(document.ids).map(([kind, ids]) => [kind, Array.isArray(ids) ? ids.slice(0, idLimit) : ids])),
      };
    }),
  };
}

function renderInspectionError(code: string, message: string, json: boolean): ICommandResult {
  const payload = { code, diagnostics: [{ code, message, severity: "error" }], message };
  return { exitCode: 1, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${message}\n` };
}

function isInspectionPlan(value: unknown): value is IInspectionPlan {
  if (!isRecord(value) || value.schema !== "threenative.game-plan" || !isRecord(value.intentContract)) return false;
  return typeof value.intentContract.id === "string"
    && Array.isArray(value.intentContract.requiredCapabilities)
    && Array.isArray(value.intentContract.acceptanceAssertions)
    && Array.isArray(value.coveredResponsibilityIds)
    && Array.isArray(value.uncoveredResponsibilityIds);
}

function relevantDocumentKinds(capabilities: readonly string[]): Set<string> {
  const kinds = new Set(["input", "prefab", "resources", "scene", "systems", "ui"]);
  if (capabilities.some((id) => id.includes("flow") || id.includes("retry"))) kinds.add("flow");
  return kinds;
}

function isWithinProject(projectPath: string, candidate: string): boolean {
  const path = relative(projectPath, candidate);
  return path === "" || (!path.startsWith("..") && !path.includes(":") && !path.startsWith("/"));
}

function renderPayload(payload: unknown, json: boolean, message: string, exitCode = 0): ICommandResult {
  if (json) {
    return { exitCode, stdout: `${JSON.stringify(payload, null, 2)}\n` };
  }
  if (isRecord(payload) && typeof payload.next === "string" && typeof payload.notice === "string") {
    return { exitCode, stdout: `${message}\nNext: ${payload.next}\nNotice: ${payload.notice}\n` };
  }
  return { exitCode, stdout: `${message}\n` };
}

function renderUsage(json: boolean): ICommandResult {
  const payload = {
    code: "TN_AUTHORING_COMMAND_UNKNOWN",
    message: "Usage: tn authoring inspect|validate|compile-typed-spec [--project <path>] [--entry <src/game.spec.ts>] [--json]\n       tn authoring prototype --from-plan <plan.json> [--project <path>] [--run-proof] [--json]\n       tn authoring batch plan|apply --file <path|-> [--project <path>] [--json]\n       tn authoring script scaffold|check [--module src/scripts/<name>.ts] [--export <name>] [--project <path>] [--json]",
    severity: "error",
  };
  return { exitCode: 2, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n` };
}

async function authoringBatchCommand(
  argv: readonly string[],
  projectPath: string,
  json: boolean,
  options: IAuthoringCommandOptions,
): Promise<ICommandResult> {
  const action = argv[1];
  const file = readFlag(argv, "--file");
  if ((action !== "plan" && action !== "apply") || file === undefined) {
    return renderBatchError(
      "TN_AUTHORING_BATCH_ARGS_MISSING",
      "Usage: tn authoring batch plan|apply --file <path|-> [--project <path>] [--json]",
      json,
      2,
    );
  }

  let batch: unknown;
  try {
    const input = file === "-"
      ? await readBoundedInput(options.stdin ?? process.stdin, AUTHORING_BATCH_INPUT_MAX_BYTES)
      : await readBoundedInput(
          createReadStream(resolve(options.cwd ?? process.env.INIT_CWD ?? process.cwd(), file)),
          AUTHORING_BATCH_INPUT_MAX_BYTES,
        );
    batch = JSON.parse(input) as unknown;
  } catch (error) {
    const oversized = error instanceof AuthoringBatchInputTooLargeError;
    return renderBatchError(
      oversized ? "TN_AUTHORING_BATCH_INPUT_TOO_LARGE" : "TN_AUTHORING_BATCH_INPUT_INVALID",
      oversized
        ? `Authoring batch input exceeds the ${AUTHORING_BATCH_INPUT_MAX_BYTES}-byte budget.`
        : `Could not read one authoring batch JSON document from '${file}'.`,
      json,
      1,
      oversized ? "Reduce the operation manifest size and retry." : "Provide a readable file containing exactly one valid JSON document.",
    );
  }

  const result = action === "plan"
    ? await planAuthoringBatch({ batch: batch as IAuthoringBatchDocument, projectPath })
    : await applyAuthoringBatch({ batch: batch as IAuthoringBatchDocument, projectPath });
  return renderBatchPayload(result, projectPath, json, action);
}

async function readBoundedInput(input: AsyncIterable<string | Uint8Array>, maximumBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of input) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > maximumBytes) throw new AuthoringBatchInputTooLargeError();
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

class AuthoringBatchInputTooLargeError extends Error {}

async function renderBatchPayload(
  payload: IAuthoringBatchApplyResult | IAuthoringBatchPlanResult,
  projectPath: string,
  json: boolean,
  action: "apply" | "plan",
): Promise<ICommandResult> {
  const ok = payload.ok;
  const message = ok
    ? `Authoring batch ${action === "plan" ? "plan completed" : "applied"}.`
    : `Authoring batch ${action} failed.`;
  if (!json) return { exitCode: ok ? 0 : 1, stdout: `${message}\n` };

  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") <= AUTHORING_BATCH_STDOUT_MAX_BYTES) {
    return { exitCode: ok ? 0 : 1, stdout: serialized };
  }

  const transactionId = payload.transactionId;
  const artifactAbsolutePath = resolve(projectPath, ".tn/authoring-results", `${transactionId}.json`);
  await mkdir(dirname(artifactAbsolutePath), { recursive: true });
  await writeFile(artifactAbsolutePath, serialized, "utf8");
  const artifactPath = relative(projectPath, artifactAbsolutePath).replaceAll("\\", "/");
  const bounded = {
    changed: payload.changed,
    ...(action === "apply" ? { committed: "committed" in payload && payload.committed } : {}),
    diagnostics: payload.diagnostics.slice(0, 20),
    filesCreated: payload.filesCreated,
    filesDeleted: payload.filesDeleted,
    filesModified: payload.filesModified,
    ok,
    outputArtifactPath: artifactPath,
    outputTruncated: true,
    planHash: payload.planHash,
    touchedPaths: payload.touchedPaths,
    transactionId: payload.transactionId,
  };
  const boundedSerialized = `${JSON.stringify(bounded, null, 2)}\n`;
  if (Buffer.byteLength(boundedSerialized, "utf8") <= AUTHORING_BATCH_STDOUT_MAX_BYTES) {
    return { exitCode: ok ? 0 : 1, stdout: boundedSerialized };
  }
  return {
    exitCode: ok ? 0 : 1,
    stdout: `${JSON.stringify({ ok, outputArtifactPath: artifactPath, outputTruncated: true, transactionId: payload.transactionId })}\n`,
  };
}

function renderBatchError(code: string, message: string, json: boolean, exitCode: number, suggestion?: string): ICommandResult {
  const diagnostic = { code, message, severity: "error", ...(suggestion === undefined ? {} : { suggestion }) };
  const payload = { changed: false, diagnostics: [diagnostic], ok: false };
  return { exitCode, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${message}\n` };
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function readFlags(argv: readonly string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag && argv[index + 1] !== undefined) values.push(argv[index + 1]!);
  }
  return values;
}

function parseJsonPayload(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return { output: value };
  }
}

function resolveProjectPath(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): string {
  const index = argv.indexOf("--project");
  const project = index === -1 ? "." : argv[index + 1] ?? ".";
  return resolve(cwd, project);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFileSystemError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}

function projectMapDocument(kind: string, path: string, value: unknown): {
  id?: string;
  ids: Record<string, string[]>;
  kind: string;
  path: string;
  responsibility: string;
} {
  const data = isRecord(value) ? value : {};
  const ui = isRecord(data.ui) ? data.ui : {};
  return {
    ...(typeof data.id === "string" ? { id: data.id } : {}),
    ids: {
      entities: idsFrom(data.entities),
      input: [...new Set([...idsFrom(data.actions), ...idsFrom(data.axes)])].sort(),
      prefabs: idsFrom(data.prefabs),
      resources: idsFrom(data.resources),
      systems: idsFrom(data.systems),
      ui: idsFrom(Array.isArray(data.nodes) ? data.nodes : ui.nodes),
    },
    kind,
    path,
    responsibility: responsibilityForDocumentKind(kind),
  };
}

function idsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => typeof entry === "string"
    ? [entry]
    : isRecord(entry) && typeof entry.id === "string"
      ? [entry.id]
      : []).sort();
}

function responsibilityForDocumentKind(kind: string): string {
  const responsibilities: Record<string, string> = {
    input: "Owns canonical action and axis bindings.",
    prefab: "Owns reusable entity and component source.",
    resources: "Owns durable project resource values.",
    scene: "Owns scene entities, prefabs, resources, systems, cameras, and UI bindings.",
    systems: "Owns portable script module/export references and access declarations.",
    ui: "Owns retained UI nodes, layout, and bindings.",
  };
  return responsibilities[kind] ?? "Owns structured authoring source for this document family.";
}
