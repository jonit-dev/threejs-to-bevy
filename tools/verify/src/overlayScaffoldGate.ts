import { spawn, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { OVERLAY_SCAFFOLD_REGISTRY, type IOverlayScaffoldDescriptor } from "@threenative/cli/overlay-scaffold";

import { resolveArtifactTargets, toRepoRelative } from "./artifacts.js";
import type { StepSummary, VerificationDiagnostic } from "./runner.js";

export interface OverlayScaffoldMeasurement {
  assetBytes: number;
  assetCount: number;
  cssBytes: number;
  jsBytes: number;
  packagedAssetCount: number;
  style: string;
}

export interface OverlayScaffoldGateResult {
  diagnostics: VerificationDiagnostic[];
  measurements: OverlayScaffoldMeasurement[];
  ok: boolean;
  reportPath: string;
  steps: StepSummary[];
}

export async function runOverlayScaffoldGate(options: { keepProjects?: boolean; reportPath?: string; root?: string } = {}): Promise<OverlayScaffoldGateResult> {
  const root = resolve(options.root ?? process.cwd());
  const targets = resolveArtifactTargets({ gate: "overlay-scaffold", owner: { kind: "aggregate", name: "overlay-scaffold" }, root });
  const reportPath = options.reportPath ?? targets.reportPath;
  const workspace = await mkdtemp(resolve(tmpdir(), "tn-overlay-scaffold-"));
  const diagnostics: VerificationDiagnostic[] = [];
  const measurements: OverlayScaffoldMeasurement[] = [];
  const steps: StepSummary[] = [];
  try {
    for (const descriptor of OVERLAY_SCAFFOLD_REGISTRY) {
      const project = resolve(workspace, descriptor.style);
      await cp(resolve(root, "templates/structured-source-starter"), project, {
        recursive: true,
        filter: (source) => !/[\\/](?:artifacts|dist|node_modules)(?:[\\/]|$)/.test(source),
      });
      await makeStarterInstallable(project);
      const styleArgs = descriptor.default ? [] : ["--style", descriptor.style];
      if (!runStep(steps, `scaffold ${descriptor.style} overlay`, process.execPath, [resolve(root, "packages/cli/dist/index.js"), "overlay", "add", "proof-panel", ...styleArgs, "--project", project, "--json"], root)) continue;
      if (!runStep(steps, `resolve ${descriptor.style} overlay dependencies`, "pnpm", ["install", "--ignore-scripts", "--no-frozen-lockfile"], project)) continue;
      await rm(resolve(project, "node_modules"), { force: true, recursive: true });
      if (!runStep(steps, `install ${descriptor.style} overlay dependencies offline`, "pnpm", ["install", "--offline", "--ignore-scripts", "--no-frozen-lockfile"], project)) continue;
      if (!runStep(steps, `build ${descriptor.style} overlay`, "pnpm", ["run", "build:overlay:proof-panel"], project)) continue;
      const inspection = await inspectOverlayProject(project, descriptor, "proof-panel");
      diagnostics.push(...inspection.diagnostics);
      let packagedAssetCount = 0;
      if (descriptor.style === "tailwind") {
        const cli = resolve(root, "packages/cli/dist/index.js");
        if (runStep(steps, "build Tailwind generated game bundle", process.execPath, [cli, "build", "--project", project, "--json"], root)) {
          const packageOut = resolve(project, "artifacts/overlay-package");
          const packageStep = runStepWithOutput(steps, "package Tailwind generated webview", process.execPath, [cli, "package", "--bundle", resolve(project, "dist/structured-source-starter.bundle"), "--out", packageOut, "--runtime", "webview", "--format", "installer", "--json"], root);
          if (packageStep.ok) {
            const packaged = await inspectPackagedOverlay(resolve(packageOut, "desktop-web/app/bundle"), `${descriptor.sourceDirectory}/proof-panel/${descriptor.entry}`);
            diagnostics.push(...packaged.diagnostics);
            packagedAssetCount = packaged.assetCount;
            diagnostics.push(...await captureBrowserProof({ artifactDir: dirname(reportPath), cli, project, steps }));
          }
        }
      }
      measurements.push({ ...inspection.measurement, packagedAssetCount });
    }
  } finally {
    if (!options.keepProjects) await rm(workspace, { force: true, recursive: true });
  }
  const ok = steps.every((step) => step.exitCode === 0) && diagnostics.every((diagnostic) => diagnostic.severity !== "error") && measurements.length === OVERLAY_SCAFFOLD_REGISTRY.length;
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({
    artifacts: { projectsPreserved: options.keepProjects === true, workspace: options.keepProjects ? workspace : undefined },
    code: ok ? "TN_VERIFY_OVERLAY_SCAFFOLD_OK" : "TN_VERIFY_OVERLAY_SCAFFOLD_FAILED",
    diagnostics,
    generatedBy: "@threenative/verify-tools overlayScaffoldGate",
    measurements,
    ok,
    schema: "threenative.verify.overlay-scaffold",
    status: ok ? "pass" : "fail",
    steps,
    version: "0.1.0",
  }, null, 2)}\n`);
  return { diagnostics, measurements, ok, reportPath: toRepoRelative(root, reportPath), steps };
}

async function captureBrowserProof(options: { artifactDir: string; cli: string; project: string; steps: StepSummary[] }): Promise<VerificationDiagnostic[]> {
  const diagnostics: VerificationDiagnostic[] = [];
  const started = Date.now();
  const child = spawn(process.execPath, [options.cli, "dev", "--target", "web", "--project", options.project, "--json"], { cwd: options.project, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
  try {
    const url = await waitForPreviewUrl(() => stdout);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });
      await page.goto(url, { waitUntil: "networkidle" });
      const canvas = page.locator("canvas").first();
      const frame = page.frameLocator('iframe[data-threenative-overlay-id="proof-panel"]');
      const landmark = frame.locator("#overlay-title");
      const button = frame.locator("button");
      await canvas.waitFor({ state: "visible" });
      await landmark.waitFor({ state: "visible" });
      await button.focus();
      const focused = await button.evaluate((element) => element === (element as unknown as { ownerDocument: { activeElement: unknown } }).ownerDocument.activeElement);
      await button.click();
      const typedBridgeAccepted = await frame.locator("body").evaluate(() => {
        const bridge = (globalThis as unknown as { threenativeOverlayBridge?: { send(type: string, payload: Record<string, unknown>): boolean } }).threenativeOverlayBridge;
        return bridge?.send("overlay:action", { action: "browser-proof" }) ?? false;
      });
      const canvasBox = await canvas.boundingBox();
      const screenshotPath = resolve(options.artifactDir, "browser", "tailwind-preview.png");
      const tracePath = resolve(options.artifactDir, "browser", "bridge-trace.json");
      await mkdir(dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath });
      await writeFile(tracePath, `${JSON.stringify({ canvas: canvasBox, focused, landmark: await landmark.textContent(), pointerClicked: true, typedBridgeAccepted }, null, 2)}\n`);
      if (canvasBox === null || canvasBox.width <= 0 || canvasBox.height <= 0) diagnostics.push(diagnostic("TN_VERIFY_OVERLAY_SCAFFOLD_CANVAS_EMPTY", "Browser preview canvas is missing or empty.", screenshotPath));
      if (!focused) diagnostics.push(diagnostic("TN_VERIFY_OVERLAY_SCAFFOLD_FOCUS_MISSING", "Generated overlay button did not accept keyboard focus.", tracePath));
      if (!typedBridgeAccepted) diagnostics.push(diagnostic("TN_VERIFY_OVERLAY_SCAFFOLD_BRIDGE_REJECTED", "Generated overlay typed bridge action was rejected.", tracePath));
    } finally { await browser.close(); }
  } catch (error) {
    diagnostics.push(diagnostic("TN_VERIFY_OVERLAY_SCAFFOLD_BROWSER_FAILED", `Tailwind browser preview proof failed: ${error instanceof Error ? error.message : String(error)}`, options.project));
  } finally {
    child.kill("SIGTERM");
    options.steps.push({ durationMs: Date.now() - started, exitCode: diagnostics.length === 0 ? 0 : 1, name: "verify Tailwind browser preview and bridge", stderr: tail(stderr), stdout: tail(stdout) });
  }
  return diagnostics;
}

async function waitForPreviewUrl(read: () => string): Promise<string> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const url = /"url"\s*:\s*"(http:\/\/127\.0\.0\.1:[0-9]+[^"]*)"/.exec(read())?.[1];
    if (url !== undefined) return url;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error("tn dev did not report a preview URL within 30 seconds");
}

export async function inspectOverlayProject(project: string, descriptor: IOverlayScaffoldDescriptor, overlayId: string): Promise<{ diagnostics: VerificationDiagnostic[]; measurement: OverlayScaffoldMeasurement }> {
  const diagnostics: VerificationDiagnostic[] = [];
  const sourceRoot = resolve(project, descriptor.sourceDirectory, overlayId);
  const outputRoot = resolve(sourceRoot, descriptor.outputDirectory);
  const entryPath = resolve(sourceRoot, descriptor.entry);
  let html = "";
  try { html = await readFile(entryPath, "utf8"); } catch { diagnostics.push(diagnostic("TN_VERIFY_OVERLAY_SCAFFOLD_ENTRY_MISSING", `${descriptor.style} overlay entry is missing.`, entryPath)); }
  const outputFiles = await listFiles(outputRoot);
  const cssFiles = outputFiles.filter((path) => path.endsWith(".css"));
  const jsFiles = outputFiles.filter((path) => /\.(?:js|mjs)$/.test(path));
  if (cssFiles.length === 0) diagnostics.push(diagnostic("TN_VERIFY_OVERLAY_SCAFFOLD_CSS_MISSING", `${descriptor.style} overlay emitted no CSS asset.`, outputRoot));
  if (jsFiles.length === 0) diagnostics.push(diagnostic("TN_VERIFY_OVERLAY_SCAFFOLD_JS_MISSING", `${descriptor.style} overlay emitted no JavaScript asset.`, outputRoot));
  for (const path of [entryPath, ...outputFiles]) {
    const source = await readFile(path, "utf8").catch(() => "");
    const remote = executableRemoteReference(path, source);
    if (remote !== undefined) diagnostics.push(diagnostic("TN_VERIFY_OVERLAY_SCAFFOLD_REMOTE_ASSET", `${descriptor.style} overlay output references remote asset '${remote}'.`, path));
    if (/tailwindcss|@tailwindcss/i.test(source)) diagnostics.push(diagnostic("TN_VERIFY_OVERLAY_SCAFFOLD_TAILWIND_RUNTIME", `${descriptor.style} emitted output contains a Tailwind runtime/package reference.`, path));
  }
  const packageJson = JSON.parse(await readFile(resolve(project, "package.json"), "utf8")) as { devDependencies?: Record<string, string> };
  const sourceFiles = await listFiles(sourceRoot, new Set([descriptor.outputDirectory, "node_modules"]));
  const sourceText = (await Promise.all(sourceFiles.map((path) => readFile(path, "utf8")))).join("\n");
  const dependencyNames = [...Object.keys((packageJson as { dependencies?: Record<string, string> }).dependencies ?? {}), ...Object.keys(packageJson.devDependencies ?? {})];
  if (descriptor.style === "vanilla" && (dependencyNames.some((name) => name.includes("tailwind")) || /tailwindcss|@tailwind/i.test(sourceText))) {
    diagnostics.push(diagnostic("TN_VERIFY_OVERLAY_SCAFFOLD_PRESET_CONTAMINATION", "Vanilla overlay contains a Tailwind dependency, plugin, or directive.", sourceRoot));
  }
  if (descriptor.style === "tailwind" && !/@import\s+["']tailwindcss["']\s+source\(["']\.\/["']\)/.test(sourceText)) {
    diagnostics.push(diagnostic("TN_VERIFY_OVERLAY_SCAFFOLD_SOURCE_SCAN_INVALID", "Tailwind source scanning must be constrained to the generated overlay source tree.", sourceRoot));
  }
  if (descriptor.style === "tailwind") {
    const cssText = (await Promise.all(cssFiles.map((path) => readFile(path, "utf8")))).join("\n");
    if (!/\.max-w-sm\b/.test(cssText)) diagnostics.push(diagnostic("TN_VERIFY_OVERLAY_SCAFFOLD_TSX_SCAN_MISSING", "Compiled Tailwind CSS must contain the distinctive max-w-sm utility authored in App.tsx.", outputRoot));
  }
  const [cssBytes, jsBytes] = await Promise.all([sumBytes(cssFiles), sumBytes(jsFiles)]);
  return {
    diagnostics,
    measurement: { assetBytes: cssBytes + jsBytes, assetCount: cssFiles.length + jsFiles.length, cssBytes, jsBytes, packagedAssetCount: 0, style: descriptor.style },
  };
}

async function makeStarterInstallable(project: string): Promise<void> {
  const path = resolve(project, "package.json");
  const packageJson = JSON.parse(await readFile(path, "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  for (const record of [packageJson.dependencies, packageJson.devDependencies]) {
    for (const [name, version] of Object.entries(record ?? {})) if (version.startsWith("workspace:") || name === "@threenative/cli") delete record![name];
  }
  await writeFile(path, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function executableRemoteReference(path: string, source: string): string | undefined {
  const extension = path.split(".").at(-1)?.toLowerCase();
  const patterns = extension === "html"
    ? [/<(?:script|link)\b[^>]*(?:src|href)=["']((?:https?:)?\/\/[^"']+)/i]
    : extension === "css"
      ? [/@import\s+(?:url\()?\s*["']?((?:https?:)?\/\/[^"')\s]+)/i, /url\(\s*["']?((?:https?:)?\/\/[^"')\s]+)/i]
      : [/(?:import\s*\(|fetch\s*\(|new\s+URL\s*\()\s*["']((?:https?:)?\/\/[^"']+)/i];
  for (const pattern of patterns) {
    const match = pattern.exec(source)?.[1];
    if (match !== undefined) return match;
  }
  return undefined;
}

function runStep(steps: StepSummary[], name: string, command: string, args: string[], cwd: string): boolean {
  return runStepWithOutput(steps, name, command, args, cwd).ok;
}

function runStepWithOutput(steps: StepSummary[], name: string, command: string, args: string[], cwd: string): { ok: boolean; stdout: string } {
  const started = Date.now();
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  steps.push({ durationMs: Date.now() - started, exitCode: result.status ?? 1, name, stderr: tail(result.stderr), stdout: tail(result.stdout) });
  return { ok: result.status === 0, stdout: result.stdout };
}

async function inspectPackagedOverlay(bundlePath: string, entry: string): Promise<{ assetCount: number; diagnostics: VerificationDiagnostic[] }> {
  const diagnostics: VerificationDiagnostic[] = [];
  const entryPath = resolve(bundlePath, entry);
  let html = "";
  try { html = await readFile(entryPath, "utf8"); } catch { diagnostics.push(diagnostic("TN_VERIFY_OVERLAY_SCAFFOLD_PACKAGED_ENTRY_MISSING", `Packaged Tailwind overlay entry '${entry}' is missing.`, entryPath)); }
  const references = [...html.matchAll(/<(?:link|script)\b[^>]*(?:href|src)=["']([^"']+)["']/gi)]
    .map((match) => match[1]!)
    .filter((path) => !/^(?:[a-z]+:|\/)/i.test(path) && /\.(?:css|js|mjs)(?:[?#].*)?$/i.test(path));
  for (const extension of ["css", "js"] as const) {
    if (!references.some((path) => extension === "css" ? /\.css(?:[?#]|$)/i.test(path) : /\.(?:js|mjs)(?:[?#]|$)/i.test(path))) diagnostics.push(diagnostic("TN_VERIFY_OVERLAY_SCAFFOLD_PACKAGED_ASSET_REFERENCE_MISSING", `Packaged Tailwind entry has no local ${extension.toUpperCase()} reference.`, entryPath));
  }
  let assetCount = 0;
  for (const reference of references) {
    const path = resolve(dirname(entryPath), reference.split(/[?#]/, 1)[0]!);
    try { if ((await stat(path)).size > 0) assetCount += 1; else throw new Error("empty"); } catch { diagnostics.push(diagnostic("TN_VERIFY_OVERLAY_SCAFFOLD_PACKAGED_ASSET_MISSING", `Packaged Tailwind asset '${reference}' is missing or empty.`, path)); }
  }
  return { assetCount, diagnostics };
}


async function listFiles(root: string, excluded = new Set<string>()): Promise<string[]> {
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch { return []; }
  const files: string[] = [];
  for (const entry of entries) {
    if (excluded.has(entry.name)) continue;
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path, excluded));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

async function sumBytes(paths: string[]): Promise<number> { return (await Promise.all(paths.map(async (path) => (await stat(path)).size))).reduce((sum, value) => sum + value, 0); }
function diagnostic(code: string, message: string, path: string): VerificationDiagnostic { return { code, message, path, severity: "error", suggestedFix: "Regenerate the overlay from the owning scaffold descriptor and rebuild it locally." }; }
function tail(value: string): string { return value.length <= 4000 ? value : value.slice(-4000); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runOverlayScaffoldGate({ keepProjects: process.argv.includes("--keep-projects") });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
