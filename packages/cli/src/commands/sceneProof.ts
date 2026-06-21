import { execFile } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { readFile, mkdir, stat, writeFile } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { buildProject } from "@threenative/compiler";
import { inspectScene, validateScene } from "@threenative/authoring";

import { type ICommandResult } from "../diagnostics.js";
import { cargoCaptureEnv, resolveCaptureBinaryPath, resolveCargoCommand } from "../verify/captureCargo.js";
import { captureScreenshot } from "./visualProof.js";

const execFileAsync = promisify(execFile);
const nativeHeadlessDiagnosticCode = "TN_SCENE_PROOF_NATIVE_HEADLESS_XVFB_MISSING";

interface ISceneProofOptions {
  cwd?: string;
  repoRoot?: string;
}

interface IProofStep {
  command: string;
  status: "fail" | "pass" | "skipped";
  stderr?: string;
  stdout?: string;
}

interface IProofArtifact {
  captureFrame?: number;
  captureTiming?: string;
  path: string;
  runtime: "bevy" | "report" | "web";
}

interface IProofReport {
  artifacts: IProofArtifact[];
  bundlePath: string;
  caveats: string[];
  commands: IProofStep[];
  generatedAt: string;
  projectPath: string;
  provenance: {
    bundleContainsScene: boolean;
    declarationCount: number;
    sceneSourceFile: string;
    sourceConnectedToBundle: boolean;
  };
  sceneId: string;
  schema: "threenative.scene-proof-report";
  status: "fail" | "pass" | "warning";
  version: "0.1.0";
}

interface INativeCaptureInvocation {
  args: string[];
  command: string;
  cwd?: string;
  wrappedWithXvfb: boolean;
}

export async function sceneProofCommand(argv: readonly string[], options: ISceneProofOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const sceneId = readPositional(normalizedArgv, 0);
  if (sceneId === undefined) {
    return usage(json);
  }

  const cwd = options.cwd ?? process.env.INIT_CWD ?? process.cwd();
  const projectPath = resolvePath(cwd, readFlag(normalizedArgv, "--project") ?? ".");
  const outDir = resolvePath(projectPath, readFlag(normalizedArgv, "--out") ?? "artifacts/scene-proof");
  const webUrl = readFlag(normalizedArgv, "--web-url");
  const native = normalizedArgv.includes("--native");
  const nativeFrame = readNumberFlag(normalizedArgv, "--native-frame", 120);
  const cameraId = readFlag(normalizedArgv, "--camera");
  const commands: IProofStep[] = [];
  const artifacts: IProofArtifact[] = [];
  const caveats = [
    "This proof records same-source and same-bundle runtime evidence. It does not claim same-tick pixel parity.",
    "The web screenshot is captured after web readiness plus the screenshot command's settling delay; the Bevy screenshot records the requested native frame.",
  ];

  await mkdir(outDir, { recursive: true });

  const validateCommand = `tn scene validate ${sceneId} --project ${projectPath} --json`;
  const sceneValidation = await validateScene({ projectPath, sceneId });
  commands.push({ command: validateCommand, status: sceneValidation.ok ? "pass" : "fail" });
  if (!sceneValidation.ok) {
    return await writeFailedReport({
      artifacts,
      bundlePath: "",
      caveats,
      commands,
      json,
      outDir,
      projectPath,
      provenance: emptyProvenance(sceneId),
      sceneId,
    });
  }

  const inspect = await inspectScene({ projectPath, sceneId });
  const sceneSourceFile = inspect.ok && inspect.scene !== undefined ? inspect.scene.file : "";
  const buildCommand = `tn build --project ${projectPath} --json`;
  let bundlePath = "";
  try {
    const build = await buildProject(projectPath);
    bundlePath = build.bundlePath;
    commands.push({ command: buildCommand, status: "pass" });
  } catch (error) {
    commands.push({ command: buildCommand, status: "fail", stderr: errorMessage(error) });
    return await writeFailedReport({
      artifacts,
      bundlePath,
      caveats,
      commands,
      json,
      outDir,
      projectPath,
      provenance: emptyProvenance(sceneId, sceneSourceFile),
      sceneId,
    });
  }

  let provenance: IProofReport["provenance"];
  try {
    provenance = await readProvenance(projectPath, bundlePath, sceneId, sceneSourceFile);
    commands.push({
      command: `verify ${relativePath(projectPath, bundlePath)}/authoring.provenance.json contains scene '${sceneId}' from '${sceneSourceFile}'`,
      status: provenance.sourceConnectedToBundle && provenance.bundleContainsScene ? "pass" : "fail",
    });
  } catch (error) {
    provenance = emptyProvenance(sceneId, sceneSourceFile);
    commands.push({
      command: `verify ${relativePath(projectPath, bundlePath)}/authoring.provenance.json contains scene '${sceneId}' from '${sceneSourceFile}'`,
      status: "fail",
      stderr: errorMessage(error),
    });
  }

  if (webUrl !== undefined) {
    const webPath = resolve(outDir, "web.png");
    const command = `tn screenshot --url ${webUrl} --out ${webPath} --json`;
    try {
      await captureScreenshot({ outPath: webPath, url: webUrl });
      commands.push({ command, status: "pass" });
      artifacts.push({ captureTiming: "after web readiness plus 250ms settling delay", path: webPath, runtime: "web" });
    } catch (error) {
      commands.push({ command, status: "fail", stderr: errorMessage(error) });
    }
  } else {
    commands.push({ command: "tn screenshot --url <preview-url> --out <proof-dir>/web.png --json", status: "skipped" });
  }

  if (native) {
    const bevyPath = resolve(outDir, "bevy.png");
    const resolvedCameraId = cameraId ?? await readActiveCameraId(bundlePath) ?? "camera.main";
    const repoRoot = options.repoRoot ?? resolveDefaultNativeRepoRoot();
    const nativeCommand = formatNativeCaptureCommand({
      bundlePath,
      cameraId: resolvedCameraId,
      env: process.env,
      frame: nativeFrame,
      outPath: bevyPath,
    });
    try {
      await captureNativeScreenshot({
        bundlePath,
        cameraId: resolvedCameraId,
        frame: nativeFrame,
        outPath: bevyPath,
        repoRoot,
      });
      commands.push({ command: nativeCommand, status: "pass" });
      artifacts.push({ captureFrame: nativeFrame, path: bevyPath, runtime: "bevy" });
    } catch (error) {
      commands.push({ command: nativeCommand, status: "fail", stderr: errorMessage(error) });
    }
  } else {
    commands.push({ command: "threenative_capture <bundle> <camera> <proof-dir>/bevy.png <frame>", status: "skipped" });
  }

  const status = commands.some((command) => command.status === "fail")
    ? "fail"
    : commands.some((command) => command.status === "skipped")
      ? "warning"
      : "pass";
  const report = await writeReports({
    artifacts,
    bundlePath,
    caveats,
    commands,
    outDir,
    projectPath,
    provenance,
    sceneId,
    status,
  });

  if (json) {
    return { exitCode: status === "fail" ? 1 : 0, stdout: `${JSON.stringify({ code: "TN_SCENE_PROOF", ...report }, null, 2)}\n` };
  }

  return {
    exitCode: status === "fail" ? 1 : 0,
    stdout: `Scene proof ${status}.\nReport: ${resolve(outDir, "proof-report.json")}\nSummary: ${resolve(outDir, "proof.md")}\n`,
  };
}

async function captureNativeScreenshot(options: { bundlePath: string; cameraId: string; frame: number; outPath: string; repoRoot: string }): Promise<void> {
  await mkdir(dirname(options.outPath), { recursive: true });
  const env = cargoCaptureEnv();
  const invocation = resolveNativeCaptureInvocation({
    bundlePath: options.bundlePath,
    cameraId: options.cameraId,
    captureBinaryPath: resolveCaptureBinaryPath(options.repoRoot),
    cargoCommand: resolveCargoCommand(),
    env,
    frame: options.frame,
    outPath: options.outPath,
    repoRoot: options.repoRoot,
  });
  await execFileAsync(invocation.command, invocation.args, { cwd: invocation.cwd, env, timeout: nativeCaptureTimeout(invocation) });
  const info = await stat(options.outPath);
  if (info.size === 0) {
    throw new Error(`Native capture wrote an empty PNG: ${options.outPath}`);
  }
}

export function resolveNativeCaptureInvocation(options: {
  bundlePath: string;
  cameraId: string;
  captureBinaryPath?: string;
  cargoCommand: string;
  commandExists?: (command: string, env: NodeJS.ProcessEnv) => boolean;
  env: NodeJS.ProcessEnv;
  frame: number;
  outPath: string;
  repoRoot: string;
}): INativeCaptureInvocation {
  const captureArgs = [options.bundlePath, options.cameraId, options.outPath, String(options.frame)];
  const baseInvocation = options.captureBinaryPath !== undefined
    ? { args: captureArgs, command: options.captureBinaryPath }
    : {
        args: ["run", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_capture", "--", ...captureArgs],
        command: options.cargoCommand,
        cwd: resolve(options.repoRoot, "runtime-bevy"),
      };

  if (hasGraphicalDisplay(options.env)) {
    return { ...baseInvocation, wrappedWithXvfb: false };
  }

  const commandExists = options.commandExists ?? isCommandOnPath;
  if (commandExists("xvfb-run", options.env)) {
    const xvfbRun = options.commandExists === undefined ? resolveCommandOnPath("xvfb-run", options.env) ?? "xvfb-run" : "xvfb-run";
    if (xvfbRun.startsWith("/")) {
      return {
        ...baseInvocation,
        args: [xvfbRun, "-a", baseInvocation.command, ...baseInvocation.args],
        command: "/bin/sh",
        wrappedWithXvfb: true,
      };
    }
    return {
      ...baseInvocation,
      args: ["-a", baseInvocation.command, ...baseInvocation.args],
      command: xvfbRun,
      wrappedWithXvfb: true,
    };
  }

  throw new Error(`${nativeHeadlessDiagnosticCode}: Native Bevy capture needs a graphical display. No DISPLAY, WAYLAND_DISPLAY, or WAYLAND_SOCKET is set, and xvfb-run was not found on PATH. Install Xvfb/xvfb-run or run tn scene proof --native in a graphical session.`);
}

function formatNativeCaptureCommand(options: { bundlePath: string; cameraId: string; env: NodeJS.ProcessEnv; frame: number; outPath: string }): string {
  const captureArgs = [options.bundlePath, options.cameraId, options.outPath, String(options.frame)];
  const baseCommand = `threenative_capture ${captureArgs.join(" ")}`;
  if (hasGraphicalDisplay(options.env)) {
    return baseCommand;
  }
  if (isCommandOnPath("xvfb-run", options.env)) {
    return `xvfb-run -a ${baseCommand}`;
  }
  return baseCommand;
}

function nativeCaptureTimeout(invocation: INativeCaptureInvocation): number {
  return invocation.cwd === undefined ? 120_000 : 180_000;
}

function resolveDefaultNativeRepoRoot(): string {
  const packagedDistRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  if (existsSync(resolve(packagedDistRoot, "runtime-bevy", "Cargo.toml"))) {
    return packagedDistRoot;
  }
  return resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
}

function hasGraphicalDisplay(env: NodeJS.ProcessEnv): boolean {
  return [env.DISPLAY, env.WAYLAND_DISPLAY, env.WAYLAND_SOCKET].some((value) => value !== undefined && value.length > 0);
}

function isCommandOnPath(command: string, env: NodeJS.ProcessEnv): boolean {
  return resolveCommandOnPath(command, env) !== undefined;
}

function resolveCommandOnPath(command: string, env: NodeJS.ProcessEnv): string | undefined {
  const path = env.PATH ?? "";
  if (path.length === 0) {
    return undefined;
  }
  for (const pathEntry of path.split(delimiter)) {
    if (pathEntry.length === 0) {
      continue;
    }
    const candidate = join(pathEntry, command);
    if (!existsSync(candidate)) {
      continue;
    }
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Keep searching PATH entries.
    }
  }
  return undefined;
}

async function readProvenance(projectPath: string, bundlePath: string, sceneId: string, sceneSourceFile: string): Promise<IProofReport["provenance"]> {
  const provenance = await readJson<{ declarations?: Array<{ id?: string; kind?: string; ownerScene?: string; provenance?: { source?: { modulePath?: string } } }> }>(resolve(bundlePath, "authoring.provenance.json"));
  const scenes = await readJson<{ initialScene?: string; scenes?: Array<{ id?: string }> }>(resolve(bundlePath, "scenes.ir.json"));
  const normalizedSource = normalizePath(sceneSourceFile);
  const sceneDeclarations = (provenance.declarations ?? []).filter((declaration) =>
    (declaration.id === sceneId && declaration.kind === "scene")
    || declaration.ownerScene === sceneId
  );
  const sourceConnectedToBundle = sceneDeclarations.some((declaration) => declaration.provenance?.source?.modulePath === normalizedSource);
  const bundleContainsScene = scenes.initialScene === sceneId || (scenes.scenes ?? []).some((scene) => scene.id === sceneId);

  return {
    bundleContainsScene,
    declarationCount: sceneDeclarations.length,
    sceneSourceFile: relativePath(projectPath, resolve(projectPath, sceneSourceFile)),
    sourceConnectedToBundle,
  };
}

async function readActiveCameraId(bundlePath: string): Promise<string | undefined> {
  try {
    const world = await readJson<{ resources?: { ActiveCamera?: { entity?: string } } }>(resolve(bundlePath, "world.ir.json"));
    return world.resources?.ActiveCamera?.entity;
  } catch {
    return undefined;
  }
}

async function writeFailedReport(options: {
  artifacts: IProofArtifact[];
  bundlePath: string;
  caveats: string[];
  commands: IProofStep[];
  json: boolean;
  outDir: string;
  projectPath: string;
  provenance: IProofReport["provenance"];
  sceneId: string;
}): Promise<ICommandResult> {
  const report = await writeReports({ ...options, status: "fail" });
  if (options.json) {
    return { exitCode: 1, stdout: `${JSON.stringify({ code: "TN_SCENE_PROOF_FAILED", ...report }, null, 2)}\n` };
  }
  return { exitCode: 1, stderr: `Scene proof failed.\nReport: ${resolve(options.outDir, "proof-report.json")}\n`, stdout: "" };
}

async function writeReports(options: Omit<IProofReport, "generatedAt" | "schema" | "version"> & { outDir: string }): Promise<IProofReport> {
  const reportPath = resolve(options.outDir, "proof-report.json");
  const markdownPath = resolve(options.outDir, "proof.md");
  const report: IProofReport = {
    artifacts: [...options.artifacts, { path: reportPath, runtime: "report" }, { path: markdownPath, runtime: "report" }],
    bundlePath: options.bundlePath,
    caveats: options.caveats,
    commands: options.commands,
    generatedAt: new Date().toISOString(),
    projectPath: options.projectPath,
    provenance: options.provenance,
    sceneId: options.sceneId,
    schema: "threenative.scene-proof-report",
    status: options.status,
    version: "0.1.0",
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, renderMarkdown(report), "utf8");
  return report;
}

function renderMarkdown(report: IProofReport): string {
  const commands = report.commands.map((step) => `- ${step.status}: \`${step.command}\`${step.stderr === undefined ? "" : `\n  stderr: ${step.stderr}`}`).join("\n");
  const artifacts = report.artifacts.map((artifact) => {
    const detail = artifact.captureFrame !== undefined
      ? `, frame ${artifact.captureFrame}`
      : artifact.captureTiming !== undefined
        ? `, ${artifact.captureTiming}`
        : "";
    return `- ${artifact.runtime}${detail}: ${artifact.path}`;
  }).join("\n");
  return `# Scene Proof: ${report.sceneId}

Status: ${report.status}

This report proves that the CLI-authored source scene is connected to the emitted bundle and records web/native runtime screenshots when requested. It is not a same-tick pixel parity report.

## Provenance

- Source scene: ${report.provenance.sceneSourceFile}
- Bundle: ${report.bundlePath}
- Source connected to bundle: ${report.provenance.sourceConnectedToBundle}
- Bundle contains scene: ${report.provenance.bundleContainsScene}
- Matching declarations: ${report.provenance.declarationCount}

## Commands

${commands}

## Artifacts

${artifacts}

## Caveats

${report.caveats.map((caveat) => `- ${caveat}`).join("\n")}
`;
}

function emptyProvenance(sceneId: string, sceneSourceFile = ""): IProofReport["provenance"] {
  return {
    bundleContainsScene: false,
    declarationCount: 0,
    sceneSourceFile: sceneSourceFile === "" ? sceneId : sceneSourceFile,
    sourceConnectedToBundle: false,
  };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function usage(json: boolean): ICommandResult {
  const message = "Usage: tn scene proof <scene-id> --project <path> --out <dir> [--web-url <url>] [--native] [--camera <id>] [--native-frame <n>] [--json]";
  const payload = { code: "TN_SCENE_PROOF_USAGE", message, severity: "error" };
  return { exitCode: 2, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${message}\n` };
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function readNumberFlag(argv: readonly string[], flag: string, fallback: number): number {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readPositional(argv: readonly string[], index: number): string | undefined {
  const positionals = argv.filter((arg, argIndex) => {
    if (arg.startsWith("--")) {
      return false;
    }
    return !flagsWithValues.has(argv[argIndex - 1] ?? "");
  });
  return positionals[index];
}

const flagsWithValues = new Set(["--project", "--out", "--web-url", "--camera", "--native-frame"]);

function resolvePath(cwd: string, path: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path);
}

function relativePath(from: string, to: string): string {
  return normalizePath(relative(from, to));
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
