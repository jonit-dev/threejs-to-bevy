import {
  applyAuthoringBatch,
  type IAuthoringBatchApplyResult,
  type IAuthoringBatchDocument,
  type IAuthoringBatchPlanResult,
  loadAuthoringProject,
  planAuthoringBatch,
  validateAuthoringProject,
} from "@threenative/authoring";
import { compileTypedGameSpecFile } from "@threenative/compiler";
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { type ICommandResult } from "../diagnostics.js";

const ITERATE_NOTICE = "Standalone authoring validation is subsumed by tn iterate --project . --json for the normal agent verify loop.";
const ITERATE_NEXT = "tn iterate --project . --json";
export const AUTHORING_BATCH_INPUT_MAX_BYTES = 1024 * 1024;
export const AUTHORING_BATCH_STDOUT_MAX_BYTES = 256 * 1024;

interface IAuthoringCommandOptions {
  cwd?: string;
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

  if (subcommand === "inspect") {
    const project = await loadAuthoringProject({ projectPath });
    const payload = {
      code: project.diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "TN_AUTHORING_INSPECT_FAILED" : "TN_AUTHORING_INSPECT_OK",
      diagnostics: project.diagnostics,
      documents: project.documents.map((document) => ({
        kind: document.kind,
        path: document.projectRelativePath,
      })),
      projectMap: {
        documents: project.documents.map((document) => projectMapDocument(document.kind, document.projectRelativePath, document.data)),
        schema: "threenative.project-map",
        version: "0.1.0",
      },
      path: project.projectPath,
    };
    return renderPayload(payload, json, "Authoring source inspection completed.");
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
    message: "Usage: tn authoring inspect|validate|compile-typed-spec [--project <path>] [--entry <src/game.spec.ts>] [--json]\n       tn authoring batch plan|apply --file <path|-> [--project <path>] [--json]",
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

function resolveProjectPath(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): string {
  const index = argv.indexOf("--project");
  const project = index === -1 ? "." : argv[index + 1] ?? ".";
  return resolve(cwd, project);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
