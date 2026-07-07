import { loadAuthoringProject, validateAuthoringProject } from "@threenative/authoring";
import { compileTypedGameSpecFile } from "@threenative/compiler";
import { resolve } from "node:path";

import { type ICommandResult } from "../diagnostics.js";

const ITERATE_NOTICE = "Standalone authoring validation is subsumed by tn iterate --project . --json for the normal agent verify loop.";
const ITERATE_NEXT = "tn iterate --project . --json";

interface IAuthoringCommandOptions {
  cwd?: string;
}

export async function authoringCommand(argv: readonly string[], options: IAuthoringCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [subcommand] = normalizedArgv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv, options.cwd);

  if (subcommand === "inspect") {
    const project = await loadAuthoringProject({ projectPath });
    const payload = {
      code: project.diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "TN_AUTHORING_INSPECT_FAILED" : "TN_AUTHORING_INSPECT_OK",
      diagnostics: project.diagnostics,
      documents: project.documents.map((document) => ({
        kind: document.kind,
        path: document.projectRelativePath,
      })),
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
    message: "Usage: tn authoring inspect|validate|compile-typed-spec [--project <path>] [--entry <src/game.spec.ts>] [--json]",
    severity: "error",
  };
  return { exitCode: 2, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n` };
}

function resolveProjectPath(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): string {
  const index = argv.indexOf("--project");
  const project = index === -1 ? "." : argv[index + 1] ?? ".";
  return resolve(cwd, project);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
