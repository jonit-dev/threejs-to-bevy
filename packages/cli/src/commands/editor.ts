import { spawn, type ChildProcess } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSceneInspectionReport,
  buildEditorInspectorSnapshot,
  buildEditorToolSnapshot,
  buildEditorVisualPanelSnapshot,
  diffEditorProjectSnapshots,
  validateEditorPropertyEdit,
  validateEditorProjectSnapshot,
  type IAssetsManifest,
  type IBundleManifest,
  type IEditorProjectSnapshot,
  type IGltfSceneMetadataIr,
  type IIrDiagnostic,
  type IMaterialsIr,
  type IWorldIr,
  validateBundleRelativePath,
} from "@threenative/ir";
import { validateBundle } from "@threenative/compiler";

import { diagnosticResult, type ICommandResult, type IDiagnosticPayload } from "../diagnostics.js";

interface IEditorOptions {
  cwd?: string;
  launchProcess?: (command: string, args: string[], options: IEditorLaunchProcessOptions) => IEditorLaunchProcess;
}

type JsonRecord = Record<string, unknown>;
type EditorDiagnostic = Omit<IIrDiagnostic, "value"> & { value?: unknown };

interface IEditorLaunchProcess {
  pid?: number;
  unref?: () => void;
}

interface IEditorLaunchProcessOptions {
  cwd: string;
  detached: boolean;
  env: NodeJS.ProcessEnv;
  stdio: "ignore" | "inherit";
}

const usage = [
  "tn editor dev --project <path> [--port <n>] [--json]",
  "tn editor open --project <path> [--bundle <path>] [--port <n>] [--json]",
  "tn editor snapshot --bundle <path> [--out <path>] [--json]",
  "tn editor inspect --bundle <path> [--out <path>] [--json]",
  "tn editor set --bundle <path> --path <json-pointer> --value <json> [--json]",
  "tn editor apply --snapshot <path> --bundle <path> [--json]",
  "tn editor diff --before <path> --after <path> [--json]",
].join("\n");

export async function editorCommand(argv: readonly string[], options: IEditorOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [subcommand] = normalizedArgv;
  const commandArgv = normalizedArgv.slice(1);
  const json = normalizedArgv.includes("--json");
  const cwd = options.cwd ?? process.env.INIT_CWD ?? process.cwd();

  if (subcommand === "dev" || subcommand === "open") {
    return launchEditorCommand(subcommand, commandArgv, cwd, json, options.launchProcess);
  }

  if (subcommand === "snapshot") {
    return snapshotCommand(commandArgv, cwd, json);
  }

  if (subcommand === "inspect") {
    return inspectCommand(commandArgv, cwd, json);
  }

  if (subcommand === "set") {
    return setCommand(commandArgv, cwd, json);
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

async function launchEditorCommand(
  subcommand: string,
  argv: readonly string[],
  cwd: string,
  json: boolean,
  launchProcess: IEditorOptions["launchProcess"],
): Promise<ICommandResult> {
  const projectArg = flagValue(argv, "--project");
  const portArg = flagValue(argv, "--port");
  const bundleArg = flagValue(argv, "--bundle");
  const validation = validateEditorLaunchConfig({ bundlePath: bundleArg, cwd, projectPath: projectArg });
  if (validation.diagnostics.length > 0 || validation.config === undefined) {
    return diagnosticResult(
      {
        code: validation.diagnostics[0]?.code ?? "TN_EDITOR_LAUNCH_INVALID",
        diagnostics: validation.diagnostics,
        message: validation.diagnostics[0]?.message ?? "Editor launch config is invalid.",
        path: validation.diagnostics[0]?.path,
      },
      { exitCode: 1, json, stderr: !json },
    );
  }

  const port = parsePort(portArg);
  if (port.ok === false) {
    return diagnosticResult(
      {
        code: "TN_EDITOR_LAUNCH_PORT_INVALID",
        message: "Editor launch --port must be an integer between 1024 and 65535.",
        path: portArg,
      },
      { exitCode: 1, json, stderr: !json },
    );
  }

  const editorPackagePath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../editor");
  const bootConfigPath = resolve(validation.config.projectPath, ".threenative/editor-boot.json");
  await mkdir(dirname(bootConfigPath), { recursive: true });
  await writeFile(
    bootConfigPath,
    `${JSON.stringify(
      {
        bundlePath: validation.config.bundlePath,
        projectPath: validation.config.projectPath,
        schema: "threenative.editor-boot",
        version: "0.1.0",
      },
      null,
      2,
    )}\n`,
  );

  const args = ["--dir", editorPackagePath, "exec", "vite", "--host", "127.0.0.1", "--port", String(port.value)];
  const env = { ...process.env, THREENATIVE_EDITOR_BOOT: bootConfigPath };
  const launched = (launchProcess ?? defaultLaunchProcess)("pnpm", args, {
    cwd: editorPackagePath,
    detached: true,
    env,
    stdio: json ? "ignore" : "inherit",
  });
  launched.unref?.();

  const payload = {
    bootConfigPath,
    code: "TN_EDITOR_LAUNCH_OK",
    command: subcommand,
    message: `Editor ${subcommand} launch configured at http://127.0.0.1:${port.value}/.`,
    pid: launched.pid,
    projectPath: validation.config.projectPath,
    url: `http://127.0.0.1:${port.value}/`,
    ...(validation.config.bundlePath === undefined ? {} : { bundlePath: validation.config.bundlePath }),
  };
  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`,
  };
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

  const documents = await readBundleDocuments(bundlePath);
  if (documents.ok === false) {
    return diagnosticResult(editorDiagnosticPayload(documents.diagnostic), { exitCode: 1, json, stderr: !json });
  }
  const manifest = documents.manifest;
  const assets = await readJsonFile<IAssetsManifest>(resolve(bundlePath, manifest.files.assets), manifest.files.assets);
  const materials = await readJsonFile<IMaterialsIr>(resolve(bundlePath, manifest.files.materials), manifest.files.materials);
  const world = await readJsonFile<IWorldIr>(resolve(bundlePath, manifest.entry.world), manifest.entry.world);
  const gltfScene =
    manifest.files.gltfScene === undefined
      ? undefined
      : await readJsonFile<IGltfSceneMetadataIr>(resolve(bundlePath, manifest.files.gltfScene), manifest.files.gltfScene);
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
    manifest,
    materials: materials.value,
    world: world.value,
  });
  const inspector = buildEditorInspectorSnapshot(documents.documents);
  const visualPanels = buildEditorVisualPanelSnapshot(inspector);
  const editorTools = buildEditorToolSnapshot(documents.documents);
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

  const payload = {
    assetRefs: inspector.assetRefs,
    code: "TN_EDITOR_INSPECT_OK",
    diagnostics: inspector.diagnostics,
    editableProperties: inspector.editableProperties,
    hierarchy: inspector.hierarchy,
    hotReload: inspector.hotReload,
    message: `Editor inspect found ${inspector.hierarchy.length} root node(s), ${inspector.editableProperties.length} editable path(s), and ${report.assets.length} inspected asset(s).`,
    path: bundlePath,
    sceneInspection: {
      assets: report.assets.length,
      documents: report.bundle.documents,
      entities: report.entities.length,
      gltfAssets: report.gltfAssets.length,
      schema: report.schema,
      version: report.version,
    },
    editorTools,
    visualPanels,
  };
  if (json) {
    return { exitCode: 0, stdout: `${JSON.stringify(payload, null, 2)}\n` };
  }

  return {
    exitCode: 0,
    stdout: `${payload.message}\n`,
  };
}

async function setCommand(argv: readonly string[], cwd: string, json: boolean): Promise<ICommandResult> {
  const bundleArg = flagValue(argv, "--bundle");
  const pathArg = flagValue(argv, "--path");
  const valueArg = flagValue(argv, "--value");
  if (bundleArg === undefined || pathArg === undefined || valueArg === undefined) {
    return diagnosticResult(
      {
        code: "TN_EDITOR_SET_INPUT_MISSING",
        message: "Editor set requires --bundle <path> --path <json-pointer> --value <json>.",
        usage,
      },
      { exitCode: 1, json, stderr: !json },
    );
  }
  const pathDiagnostics = validateEditorPropertyEdit(pathArg);
  if (pathDiagnostics.length > 0) {
    return diagnosticsResult("TN_EDITOR_SET_PATH_INVALID", "Editor set path is invalid.", pathDiagnostics, json);
  }
  let value: unknown;
  try {
    value = JSON.parse(valueArg);
  } catch {
    value = valueArg;
  }
  const bundlePath = resolve(cwd, bundleArg);
  const documents = await readBundleDocuments(bundlePath);
  if (documents.ok === false) {
    return diagnosticResult(editorDiagnosticPayload(documents.diagnostic), { exitCode: 1, json, stderr: !json });
  }
  const edit = applyDocumentEdit(documents.documents, pathArg, value);
  if (edit.ok === false) {
    return diagnosticsResult("TN_EDITOR_SET_PATH_INVALID", "Editor set path is invalid.", [edit.diagnostic], json);
  }
  let tempRoot: string | undefined;
  try {
    tempRoot = await mkdtemp(resolve(tmpdir(), "tn-editor-set-"));
    const tempBundle = resolve(tempRoot, "game.bundle");
    await cp(bundlePath, tempBundle, { recursive: true });
    await writeFile(resolve(tempBundle, edit.document), `${JSON.stringify(documents.documents[edit.document], null, 2)}\n`);
    const validation = await validateBundle(tempBundle);
    if (!validation.ok) {
      return diagnosticsResult("TN_EDITOR_SET_BUNDLE_INVALID", "Editor set produced an invalid bundle.", validation.diagnostics, json);
    }
    await writeFile(resolve(bundlePath, edit.document), `${JSON.stringify(documents.documents[edit.document], null, 2)}\n`);
  } finally {
    if (tempRoot !== undefined) {
      await rm(tempRoot, { force: true, recursive: true });
    }
  }
  const payload = {
    code: "TN_EDITOR_SET_OK",
    document: edit.document,
    message: `Editor set updated ${pathArg}.`,
    path: pathArg,
  };
  return { exitCode: 0, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n` };
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
    const tempWrite = await writeSnapshotDocuments(snapshot.value, tempBundle);
    if (tempWrite.ok === false) {
      return diagnosticResult(editorDiagnosticPayload(tempWrite.diagnostic), { exitCode: 1, json, stderr: !json });
    }
    const validation = await validateBundle(tempBundle);
    if (!validation.ok) {
      return diagnosticsResult("TN_EDITOR_APPLY_BUNDLE_INVALID", "Applied editor snapshot produced an invalid bundle.", validation.diagnostics, json);
    }
    const bundleWrite = await writeSnapshotDocuments(snapshot.value, bundlePath);
    if (bundleWrite.ok === false) {
      return diagnosticResult(editorDiagnosticPayload(bundleWrite.diagnostic), { exitCode: 1, json, stderr: !json });
    }
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
  const bundleDocuments = await readBundleDocuments(bundlePath);
  if (bundleDocuments.ok === false) {
    return diagnosticResult(editorDiagnosticPayload(bundleDocuments.diagnostic), { exitCode: 1, json, stderr: !json });
  }

  const snapshot: IEditorProjectSnapshot = {
    documents: bundleDocuments.documents,
    inspector: buildEditorInspectorSnapshot(bundleDocuments.documents),
    metadata: {
      bundlePath,
      source: "bundle",
    },
    name: bundleDocuments.manifest.name || basename(bundlePath),
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
    documents: bundleDocuments.documentPaths,
    message: `Editor snapshot wrote ${bundleDocuments.documentPaths.length} document(s).`,
    path: outPath,
  };

  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`,
  };
}

async function readBundleDocuments(bundlePath: string): Promise<
  { documentPaths: string[]; documents: Record<string, unknown>; manifest: IBundleManifest; ok: true } | { diagnostic: IIrDiagnostic; ok: false }
> {
  const manifest = await readJsonFile<IBundleManifest>(resolve(bundlePath, "manifest.json"));
  if (manifest.ok === false) {
    return { diagnostic: manifest.diagnostic, ok: false };
  }
  const documentPaths = collectJsonDocuments(manifest.value);
  const documents: Record<string, unknown> = {};
  for (const documentPath of documentPaths) {
    const resolved = resolveBundleDocumentPath(bundlePath, documentPath);
    if (resolved.ok === false) {
      return { diagnostic: resolved.diagnostic, ok: false };
    }
    const document = await readJsonFile<unknown>(resolved.path, documentPath);
    if (document.ok === false) {
      return { diagnostic: document.diagnostic, ok: false };
    }
    documents[documentPath] = document.value;
  }
  return { documentPaths, documents, manifest: manifest.value, ok: true };
}

function applyDocumentEdit(documents: Record<string, unknown>, path: string, value: unknown): { document: string; ok: true } | { diagnostic: IIrDiagnostic; ok: false } {
  const segments = path.split("/").slice(1).map(unescapePointer);
  if (segments[0] !== "documents" || segments[1] === undefined) {
    return { diagnostic: { code: "TN_EDITOR_SET_DOCUMENT_MISSING", message: "Editor set path must target a document.", path, severity: "error" }, ok: false };
  }
  const document = segments[1];
  const root = documents[document];
  if (root === undefined) {
    return { diagnostic: { code: "TN_EDITOR_SET_DOCUMENT_MISSING", message: `Editor document '${document}' does not exist.`, path, severity: "error" }, ok: false };
  }
  if (segments.length === 2) {
    documents[document] = value;
    return { document, ok: true };
  }
  let parent: unknown = root;
  for (const segment of segments.slice(2, -1)) {
    parent = Array.isArray(parent) ? parent[Number(segment)] : isRecord(parent) ? parent[segment] : undefined;
    if (parent === undefined) {
      return { diagnostic: { code: "TN_EDITOR_SET_PATH_MISSING", message: `Editor set path '${path}' does not exist.`, path, severity: "error" }, ok: false };
    }
  }
  const leaf = segments.at(-1)!;
  if (Array.isArray(parent)) {
    const index = Number(leaf);
    if (!Number.isInteger(index) || index < 0 || index >= parent.length) {
      return { diagnostic: { code: "TN_EDITOR_SET_PATH_MISSING", message: `Editor set array index '${leaf}' does not exist.`, path, severity: "error" }, ok: false };
    }
    parent[index] = value;
    return { document, ok: true };
  }
  if (isRecord(parent) && leaf in parent) {
    parent[leaf] = value;
    return { document, ok: true };
  }
  return { diagnostic: { code: "TN_EDITOR_SET_PATH_MISSING", message: `Editor set path '${path}' does not exist.`, path, severity: "error" }, ok: false };
}

async function writeSnapshotDocuments(snapshot: IEditorProjectSnapshot, bundlePath: string): Promise<{ ok: true } | { diagnostic: IIrDiagnostic; ok: false }> {
  for (const [documentPath, document] of Object.entries(snapshot.documents)) {
    const resolved = resolveBundleDocumentPath(bundlePath, documentPath);
    if (resolved.ok === false) {
      return { diagnostic: resolved.diagnostic, ok: false };
    }
    const outputPath = resolved.path;
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`);
  }
  return { ok: true };
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

function resolveBundleDocumentPath(bundlePath: string, documentPath: string): { ok: true; path: string } | { diagnostic: IIrDiagnostic; ok: false } {
  const validation = validateBundleRelativePath(documentPath);
  if (!validation.ok) {
    return {
      diagnostic: {
        code: "TN_EDITOR_BUNDLE_PATH_INVALID",
        message: validation.message ?? `Bundle document path '${documentPath}' is invalid.`,
        path: documentPath,
        severity: "error",
        suggestion: "Use a POSIX-style path inside the bundle without absolute, URL, or parent segments.",
      },
      ok: false,
    };
  }
  return { ok: true, path: resolve(bundlePath, documentPath) };
}

function unescapePointer(value: string): string {
  return value.replace(/~1/g, "/").replace(/~0/g, "~");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}

function defaultLaunchProcess(command: string, args: string[], options: IEditorLaunchProcessOptions): ChildProcess {
  return spawn(command, args, options);
}

function parsePort(value: string | undefined): { ok: true; value: number } | { ok: false } {
  if (value === undefined) {
    return { ok: true, value: 5173 };
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
    return { ok: false };
  }
  return { ok: true, value: parsed };
}

function validateEditorLaunchConfig(input: { bundlePath?: string; cwd: string; projectPath?: string }): {
  config?: { bundlePath?: string; projectPath: string };
  diagnostics: Array<{ code: string; message: string; path?: string; severity: "error"; suggestion?: string }>;
} {
  if (input.projectPath === undefined || input.projectPath.trim() === "") {
    return {
      diagnostics: [
        {
          code: "TN_EDITOR_BOOT_PROJECT_MISSING",
          message: "Editor launch requires --project <path>.",
          severity: "error",
        },
      ],
    };
  }
  const projectPath = resolve(input.cwd, input.projectPath);
  const projectRelative = normalizeCliRelativePath(relative(input.cwd, projectPath));
  if (isUnsafeEditorProjectPath(projectRelative)) {
    return {
      diagnostics: [
        {
          code: "TN_EDITOR_BOOT_PROJECT_UNSAFE",
          message: "Editor project path must stay in a durable source project, not generated artifacts or caches.",
          path: input.projectPath,
          severity: "error",
          suggestion: "Pass the project root that contains threenative.authoring.json or content/.",
        },
      ],
    };
  }
  if (input.bundlePath === undefined) {
    return { config: { projectPath }, diagnostics: [] };
  }
  const bundlePath = resolve(projectPath, input.bundlePath);
  const bundleRelative = normalizeCliRelativePath(relative(projectPath, bundlePath));
  if (bundleRelative === ".." || bundleRelative.startsWith("../") || !bundleRelative.includes("game.bundle")) {
    return {
      diagnostics: [
        {
          code: "TN_EDITOR_BOOT_BUNDLE_UNSAFE",
          message: "Editor bundle path must stay inside the selected project and point at a generated game.bundle directory.",
          path: input.bundlePath,
          severity: "error",
        },
      ],
    };
  }
  return { config: { bundlePath, projectPath }, diagnostics: [] };
}

function isUnsafeEditorProjectPath(projectRelative: string): boolean {
  return (
    projectRelative === ".." ||
    projectRelative.startsWith("../") ||
    projectRelative.split("/").some((segment) => segment === "dist" || segment === "game.bundle" || segment === ".tn-capture" || segment === "node_modules")
  );
}

function normalizeCliRelativePath(path: string): string {
  return path.split("\\").join("/");
}
