import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import {
  diffEditorProjectSnapshots,
  validateEditorProjectSnapshot,
  type IBundleManifest,
  type IEditorProjectSnapshot,
  type IIrDiagnostic,
} from "@threenative/ir";

import { diagnosticResult, type ICommandResult, type IDiagnosticPayload } from "../diagnostics.js";

interface IEditorOptions {
  cwd?: string;
}

type JsonRecord = Record<string, unknown>;

const usage = [
  "tn editor snapshot --bundle <path> [--out <path>] [--json]",
  "tn editor diff --before <path> --after <path> [--json]",
].join("\n");

export async function editorCommand(argv: readonly string[], options: IEditorOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [subcommand] = normalizedArgv;
  const commandArgv = normalizedArgv.slice(1);
  const json = normalizedArgv.includes("--json");
  const cwd = options.cwd ?? process.env.INIT_CWD ?? process.cwd();

  if (subcommand === "snapshot") {
    return snapshotCommand(commandArgv, cwd, json);
  }

  if (subcommand === "diff") {
    return diffCommand(commandArgv, cwd, json);
  }

  return diagnosticResult(
    {
      code: "TN_EDITOR_COMMAND_UNSUPPORTED",
      message: `Unsupported editor command '${subcommand ?? ""}'.`,
      usage,
    },
    { exitCode: 1, json, stderr: !json },
  );
}

async function snapshotCommand(argv: readonly string[], cwd: string, json: boolean): Promise<ICommandResult> {
  const bundleArg = flagValue(argv, "--bundle");
  if (bundleArg === undefined) {
    return diagnosticResult(
      {
        code: "TN_EDITOR_SNAPSHOT_BUNDLE_MISSING",
        message: "Editor snapshot requires --bundle <path>.",
        usage,
      },
      { exitCode: 1, json, stderr: !json },
    );
  }

  const bundlePath = resolve(cwd, bundleArg);
  const outPath = resolve(cwd, flagValue(argv, "--out") ?? "editor.project.json");
  const manifest = await readJsonFile<IBundleManifest>(resolve(bundlePath, "manifest.json"));
  if (manifest.ok === false) {
    return diagnosticResult(editorDiagnosticPayload(manifest.diagnostic), { exitCode: 1, json, stderr: !json });
  }

  const documentPaths = collectJsonDocuments(manifest.value);
  const documents: Record<string, unknown> = {};
  for (const documentPath of documentPaths) {
    const document = await readJsonFile<unknown>(resolve(bundlePath, documentPath), documentPath);
    if (document.ok === false) {
      return diagnosticResult(editorDiagnosticPayload(document.diagnostic), { exitCode: 1, json, stderr: !json });
    }
    documents[documentPath] = document.value;
  }

  const snapshot: IEditorProjectSnapshot = {
    documents,
    metadata: {
      bundlePath,
      source: "bundle",
    },
    name: manifest.value.name || basename(bundlePath),
    schema: "threenative.editor-project",
    version: "0.1.0",
  };
  const diagnostics = validateEditorProjectSnapshot(snapshot, outPath);
  if (diagnostics.length > 0) {
    return diagnosticsResult("TN_EDITOR_SNAPSHOT_INVALID", "Editor snapshot validation failed.", diagnostics, json);
  }

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(snapshot, null, 2)}\n`);

  const payload = {
    code: "TN_EDITOR_SNAPSHOT_OK",
    documents: documentPaths,
    message: `Editor snapshot wrote ${documentPaths.length} document(s).`,
    path: outPath,
  };

  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`,
  };
}

async function diffCommand(argv: readonly string[], cwd: string, json: boolean): Promise<ICommandResult> {
  const beforeArg = flagValue(argv, "--before");
  const afterArg = flagValue(argv, "--after");
  if (beforeArg === undefined || afterArg === undefined) {
    return diagnosticResult(
      {
        code: "TN_EDITOR_DIFF_INPUT_MISSING",
        message: "Editor diff requires --before <path> and --after <path>.",
        usage,
      },
      { exitCode: 1, json, stderr: !json },
    );
  }

  const beforePath = resolve(cwd, beforeArg);
  const afterPath = resolve(cwd, afterArg);
  const before = await readEditorSnapshot(beforePath);
  if (before.ok === false) {
    return diagnosticsResult("TN_EDITOR_DIFF_INVALID", "Before editor snapshot is invalid.", before.diagnostics, json);
  }
  const after = await readEditorSnapshot(afterPath);
  if (after.ok === false) {
    return diagnosticsResult("TN_EDITOR_DIFF_INVALID", "After editor snapshot is invalid.", after.diagnostics, json);
  }

  const operations = diffEditorProjectSnapshots(before.value, after.value);
  const payload = {
    changed: operations.length > 0,
    code: "TN_EDITOR_DIFF_OK",
    message:
      operations.length === 0
        ? "Editor snapshots are equivalent."
        : `Editor snapshots differ by ${operations.length} operation(s).`,
    operations,
  };

  return {
    exitCode: operations.length === 0 ? 0 : 1,
    stdout: json
      ? `${JSON.stringify(payload, null, 2)}\n`
      : `${payload.message}\n${operations.map((operation) => `${operation.op} ${operation.path}`).join("\n")}${
          operations.length > 0 ? "\n" : ""
        }`,
  };
}

async function readEditorSnapshot(
  path: string,
): Promise<{ ok: true; value: IEditorProjectSnapshot } | { diagnostics: IIrDiagnostic[]; ok: false }> {
  const snapshot = await readJsonFile<unknown>(path, path);
  if (snapshot.ok === false) {
    return { diagnostics: [snapshot.diagnostic], ok: false };
  }
  const diagnostics = validateEditorProjectSnapshot(snapshot.value, path);
  if (diagnostics.length > 0) {
    return { diagnostics, ok: false };
  }
  return { ok: true, value: snapshot.value as IEditorProjectSnapshot };
}

async function readJsonFile<T>(
  path: string,
  diagnosticPath = path,
): Promise<{ ok: true; value: T } | { diagnostic: IIrDiagnostic; ok: false }> {
  try {
    return { ok: true, value: JSON.parse(await readFile(path, "utf8")) as T };
  } catch (error) {
    return {
      diagnostic: {
        code: "TN_EDITOR_JSON_INVALID",
        message: `Missing or invalid JSON at '${diagnosticPath}'.`,
        path: diagnosticPath,
        severity: "error",
        suggestion: error instanceof Error ? error.message : undefined,
      },
      ok: false,
    };
  }
}

function diagnosticsResult(code: string, message: string, diagnostics: IIrDiagnostic[], json: boolean): ICommandResult {
  const payload: IDiagnosticPayload = {
    code,
    diagnostics: diagnostics.map(editorDiagnosticPayload),
    message,
  };

  if (json) {
    return {
      exitCode: 1,
      stdout: `${JSON.stringify(payload, null, 2)}\n`,
    };
  }

  return {
    exitCode: 1,
    stderr: `${message}\n${diagnostics.map((diagnostic) => `${diagnostic.code} ${diagnostic.path}: ${diagnostic.message}`).join("\n")}\n`,
    stdout: "",
  };
}

function editorDiagnosticPayload(diagnostic: IIrDiagnostic): IDiagnosticPayload {
  return {
    code: diagnostic.code,
    message: diagnostic.message,
    path: diagnostic.path,
    ...(diagnostic.severity === undefined ? {} : { severity: diagnostic.severity }),
    ...(diagnostic.suggestion === undefined ? {} : { suggestion: diagnostic.suggestion }),
    ...(diagnostic.limit === undefined ? {} : { limit: diagnostic.limit }),
    ...(diagnostic.value === undefined ? {} : { value: diagnostic.value }),
  };
}

function collectJsonDocuments(manifest: IBundleManifest): string[] {
  const candidates = new Set<string>(["manifest.json"]);
  collectManifestPaths(candidates, manifest.entry as JsonRecord);
  collectManifestPaths(candidates, manifest.files as JsonRecord);
  return [...candidates].filter((path) => path.endsWith(".json")).sort();
}

function collectManifestPaths(paths: Set<string>, record: JsonRecord): void {
  for (const value of Object.values(record)) {
    if (typeof value === "string") {
      paths.add(value);
    }
  }
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}
