import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import {
  diffEditorProjectSnapshots,
  buildSceneInspectionReport,
  validateEditorProjectSnapshot,
  type IAssetsManifest,
  type IBundleManifest,
  type IEditorProjectSnapshot,
  type IGltfSceneMetadataIr,
  type IIrDiagnostic,
  type IMaterialsIr,
  type IWorldIr,
} from "@threenative/ir";
import { validateBundle } from "@threenative/compiler";

import { diagnosticResult, type ICommandResult, type IDiagnosticPayload } from "../diagnostics.js";

interface IEditorOptions {
  cwd?: string;
}

type JsonRecord = Record<string, unknown>;
type EditorDiagnostic = Omit<IIrDiagnostic, "value"> & { value?: unknown };

const usage = [
  "tn editor snapshot --bundle <path> [--out <path>] [--json]",
  "tn editor inspect --bundle <path> [--out <path>] [--json]",
  "tn editor apply --snapshot <path> --bundle <path> [--json]",
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

  if (subcommand === "inspect") {
    return inspectCommand(commandArgv, cwd, json);
  }

  if (subcommand === "apply") {
    return applyCommand(commandArgv, cwd, json);
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

async function inspectCommand(argv: readonly string[], cwd: string, json: boolean): Promise<ICommandResult> {
  const bundleArg = flagValue(argv, "--bundle");
  if (bundleArg === undefined) {
    return diagnosticResult(
      {
        code: "TN_EDITOR_INSPECT_BUNDLE_MISSING",
        message: "Editor inspect requires --bundle <path>.",
        usage,
      },
      { exitCode: 1, json, stderr: !json },
    );
  }

  const bundlePath = resolve(cwd, bundleArg);
  const validation = await validateBundle(bundlePath);
  if (!validation.ok) {
    return diagnosticsResult("TN_EDITOR_INSPECT_BUNDLE_INVALID", "Editor inspect requires a valid bundle.", validation.diagnostics, json);
  }

  const manifest = await readJsonFile<IBundleManifest>(resolve(bundlePath, "manifest.json"), "manifest.json");
  if (manifest.ok === false) {
    return diagnosticResult(editorDiagnosticPayload(manifest.diagnostic), { exitCode: 1, json, stderr: !json });
  }
  const assets = await readJsonFile<IAssetsManifest>(resolve(bundlePath, manifest.value.files.assets), manifest.value.files.assets);
  const materials = await readJsonFile<IMaterialsIr>(resolve(bundlePath, manifest.value.files.materials), manifest.value.files.materials);
  const world = await readJsonFile<IWorldIr>(resolve(bundlePath, manifest.value.entry.world), manifest.value.entry.world);
  const gltfScene =
    manifest.value.files.gltfScene === undefined
      ? undefined
      : await readJsonFile<IGltfSceneMetadataIr>(resolve(bundlePath, manifest.value.files.gltfScene), manifest.value.files.gltfScene);
  if (assets.ok === false) {
    return diagnosticResult(editorDiagnosticPayload(assets.diagnostic), { exitCode: 1, json, stderr: !json });
  }
  if (materials.ok === false) {
    return diagnosticResult(editorDiagnosticPayload(materials.diagnostic), { exitCode: 1, json, stderr: !json });
  }
  if (world.ok === false) {
    return diagnosticResult(editorDiagnosticPayload(world.diagnostic), { exitCode: 1, json, stderr: !json });
  }
  if (gltfScene?.ok === false) {
    return diagnosticResult(editorDiagnosticPayload(gltfScene.diagnostic), { exitCode: 1, json, stderr: !json });
  }

  const report = buildSceneInspectionReport({
    assets: assets.value,
    diagnostics: [],
    ...(gltfScene === undefined ? {} : { gltfScene: gltfScene.value }),
    manifest: manifest.value,
    materials: materials.value,
    world: world.value,
  });
  const outArg = flagValue(argv, "--out");
  if (outArg !== undefined) {
    const outPath = resolve(cwd, outArg);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
    const payload = {
      code: "TN_EDITOR_INSPECT_OK",
      documents: report.bundle.documents,
      message: `Editor inspect wrote ${report.bundle.documents.length} inspected document(s).`,
      path: outPath,
      schema: report.schema,
      version: report.version,
    };
    return { exitCode: 0, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n` };
  }

  if (json) {
    return { exitCode: 0, stdout: `${JSON.stringify(report, null, 2)}\n` };
  }

  return {
    exitCode: 0,
    stdout: `Scene inspection: ${report.assets.length} asset(s), ${report.entities.length} entit${report.entities.length === 1 ? "y" : "ies"}, ${report.gltfAssets.length} glTF asset(s).\n`,
  };
}

async function applyCommand(argv: readonly string[], cwd: string, json: boolean): Promise<ICommandResult> {
  const snapshotArg = flagValue(argv, "--snapshot");
  const bundleArg = flagValue(argv, "--bundle");
  if (snapshotArg === undefined || bundleArg === undefined) {
    return diagnosticResult(
      {
        code: "TN_EDITOR_APPLY_INPUT_MISSING",
        message: "Editor apply requires --snapshot <path> and --bundle <path>.",
        usage,
      },
      { exitCode: 1, json, stderr: !json },
    );
  }

  const snapshotPath = resolve(cwd, snapshotArg);
  const bundlePath = resolve(cwd, bundleArg);
  const snapshot = await readEditorSnapshot(snapshotPath);
  if (snapshot.ok === false) {
    return diagnosticsResult("TN_EDITOR_APPLY_INVALID", "Editor snapshot is invalid.", snapshot.diagnostics, json);
  }

  let tempRoot: string | undefined;
  try {
    tempRoot = await mkdtemp(resolve(tmpdir(), "tn-editor-apply-"));
    const tempBundle = resolve(tempRoot, "game.bundle");
    await cp(bundlePath, tempBundle, { recursive: true });
    await writeSnapshotDocuments(snapshot.value, tempBundle);
    const validation = await validateBundle(tempBundle);
    if (!validation.ok) {
      return diagnosticsResult("TN_EDITOR_APPLY_BUNDLE_INVALID", "Applied editor snapshot produced an invalid bundle.", validation.diagnostics, json);
    }
    await writeSnapshotDocuments(snapshot.value, bundlePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return diagnosticResult(
      {
        code: "TN_EDITOR_APPLY_FAILED",
        message,
        path: bundlePath,
        severity: "error",
        suggestion: "Check that the bundle path exists and is writable, then retry editor apply.",
      },
      { exitCode: 1, json, stderr: !json },
    );
  } finally {
    if (tempRoot !== undefined) {
      await rm(tempRoot, { force: true, recursive: true });
    }
  }

  const documentPaths = Object.keys(snapshot.value.documents).sort();
  const payload = {
    code: "TN_EDITOR_APPLY_OK",
    documents: documentPaths,
    message: `Editor snapshot applied ${documentPaths.length} document(s).`,
    path: bundlePath,
  };

  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`,
  };
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

async function writeSnapshotDocuments(snapshot: IEditorProjectSnapshot, bundlePath: string): Promise<void> {
  for (const [documentPath, document] of Object.entries(snapshot.documents)) {
    const outputPath = resolve(bundlePath, documentPath);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`);
  }
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

function diagnosticsResult(code: string, message: string, diagnostics: readonly EditorDiagnostic[], json: boolean): ICommandResult {
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

function editorDiagnosticPayload(diagnostic: EditorDiagnostic): IDiagnosticPayload {
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
