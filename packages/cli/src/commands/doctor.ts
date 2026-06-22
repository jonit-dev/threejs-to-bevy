import { access, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { chromium } from "playwright";

import { type ICommandResult } from "../diagnostics.js";

interface DoctorCheck {
  code: string;
  message: string;
  data?: unknown;
  nextCommand?: string;
  path?: string;
  severity: "ok" | "warning" | "error" | "unavailable";
}

interface PackageJsonShape {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

interface ThreeNativeConfigShape {
  entry?: string;
  outDir?: string;
  template?: string;
}

interface BundleManifestShape {
  entry?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

const expectedScripts = {
  build: "tn build",
  validate: "tn validate",
  "dev:web": "tn dev --target web",
} as const;

const expectedBundleFiles = [
  "manifest.json",
  "world.ir.json",
  "assets.manifest.json",
  "materials.ir.json",
  "target.profile.json",
] as const;

export async function doctorCommand(argv: readonly string[]): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const project = readFlag(normalizedArgv, "--project") ?? ".";
  const previewUrl = readFlag(normalizedArgv, "--url") ?? readFlag(normalizedArgv, "--preview-url");
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const projectPath = isAbsolute(project) ? project : resolve(cwd, project);
  const checks = await inspectProject(projectPath, previewUrl);
  const summary = summarize(checks);
  const payload = {
    checks,
    code: summary.errors > 0 ? "TN_DOCTOR_FAILED" : "TN_DOCTOR_OK",
    message: summary.errors > 0 ? "ThreeNative doctor found project issues." : "ThreeNative doctor completed.",
    projectPath,
    summary,
  };

  return {
    exitCode: summary.errors > 0 ? 1 : 0,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : renderDoctor(payload),
  };
}

async function inspectProject(projectPath: string, previewUrl?: string): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const packageJsonPath = resolve(projectPath, "package.json");
  const configPath = resolve(projectPath, "threenative.config.json");

  const packageJson = await readJson<PackageJsonShape>(packageJsonPath);
  if (packageJson === undefined) {
    checks.push({
      code: "TN_DOCTOR_PACKAGE_JSON_MISSING",
      message: "package.json was not found.",
      nextCommand: "tn init <name>",
      path: packageJsonPath,
      severity: "error",
    });
  } else {
    checks.push({ code: "TN_DOCTOR_PACKAGE_JSON_OK", message: "package.json found.", path: packageJsonPath, severity: "ok" });
    checks.push(await exists(resolve(projectPath, "pnpm-lock.yaml"))
      ? { code: "TN_DOCTOR_PACKAGE_MANAGER_OK", message: "pnpm lockfile found.", nextCommand: "pnpm install", path: resolve(projectPath, "pnpm-lock.yaml"), severity: "ok" }
      : { code: "TN_DOCTOR_PACKAGE_MANAGER_UNAVAILABLE", message: "pnpm-lock.yaml was not found; package manager state has not been installed or committed.", nextCommand: "pnpm install", path: resolve(projectPath, "pnpm-lock.yaml"), severity: "unavailable" });
    const cliDependency = packageJson.devDependencies?.["@threenative/cli"] ?? packageJson.dependencies?.["@threenative/cli"];
    if (cliDependency === undefined) {
      checks.push({
        code: "TN_DOCTOR_CLI_DEPENDENCY_MISSING",
        message: "@threenative/cli is not listed in package dependencies.",
        nextCommand: "pnpm add -D @threenative/cli",
        path: packageJsonPath,
        severity: "warning",
      });
    } else {
      checks.push({
        code: "TN_DOCTOR_CLI_DEPENDENCY_OK",
        message: `@threenative/cli dependency is '${cliDependency}'.`,
        path: packageJsonPath,
        severity: "ok",
      });
      if (cliDependency === "file:.threenative/cli") {
        const localShim = resolve(projectPath, ".threenative/cli");
        checks.push(await exists(localShim)
          ? { code: "TN_DOCTOR_LOCAL_CLI_SHIM_OK", message: "Local CLI shim found.", path: localShim, severity: "ok" }
          : { code: "TN_DOCTOR_LOCAL_CLI_SHIM_MISSING", message: "Local CLI shim dependency is declared but .threenative/cli is missing.", nextCommand: "Re-run tn create/init from the source checkout or reinstall dependencies.", path: localShim, severity: "error" });
      }
    }
    for (const [name, command] of Object.entries(expectedScripts)) {
      const actual = packageJson.scripts?.[name];
      checks.push(actual === undefined
        ? {
            code: "TN_DOCTOR_SCRIPT_MISSING",
            message: `Missing package script '${name}'.`,
            nextCommand: `Add script '${name}': '${command}'.`,
            path: packageJsonPath,
            severity: "error",
          }
        : {
            code: "TN_DOCTOR_SCRIPT_OK",
            message: `Script '${name}' is present.`,
            nextCommand: name === "dev:web" ? "pnpm run dev:web" : `pnpm run ${name}`,
            path: packageJsonPath,
            severity: "ok",
          });
    }
  }

  const config = await readJson<ThreeNativeConfigShape>(configPath);
  if (config === undefined) {
    checks.push({
      code: "TN_DOCTOR_CONFIG_MISSING",
      message: "threenative.config.json was not found.",
      nextCommand: "tn init <name>",
      path: configPath,
      severity: "error",
    });
    return checks;
  }

  checks.push({ code: "TN_DOCTOR_CONFIG_OK", message: "threenative.config.json found.", path: configPath, severity: "ok" });
  if (typeof config.template === "string" && config.template.trim() !== "") {
    checks.push({ code: "TN_DOCTOR_TEMPLATE_OK", message: `Project template is '${config.template}'.`, path: configPath, severity: "ok" });
  } else {
    checks.push({ code: "TN_DOCTOR_TEMPLATE_UNAVAILABLE", message: "Project template metadata is not declared.", nextCommand: "Keep threenative.config.json template metadata when scaffolding projects.", path: configPath, severity: "unavailable" });
  }
  const entry = config.entry ?? "src/game.ts";
  const entryPath = resolve(projectPath, entry);
  checks.push(await exists(entryPath)
    ? { code: "TN_DOCTOR_ENTRY_OK", message: `Source entry '${entry}' found.`, nextCommand: "pnpm run validate", path: entryPath, severity: "ok" }
    : { code: "TN_DOCTOR_ENTRY_MISSING", message: `Source entry '${entry}' was not found.`, nextCommand: "Create the entry file or update threenative.config.json.", path: entryPath, severity: "error" });

  const outDir = config.outDir ?? "dist/game.bundle";
  const bundlePath = resolve(projectPath, outDir);
  if (!(await exists(bundlePath))) {
    checks.push({
      code: "TN_DOCTOR_BUNDLE_MISSING",
      message: `Bundle output '${outDir}' does not exist yet.`,
      nextCommand: "pnpm run build",
      path: bundlePath,
      severity: "warning",
    });
    return checks;
  }

  const manifestPath = resolve(bundlePath, "manifest.json");
  const manifest = await readJson<BundleManifestShape>(manifestPath);
  const manifestDeclaredFiles = manifest === undefined ? [] : manifestFiles(manifest);

  for (const file of [...new Set([...expectedBundleFiles, ...manifestDeclaredFiles])].sort()) {
    const filePath = resolve(bundlePath, file);
    checks.push(await exists(filePath)
      ? { code: "TN_DOCTOR_BUNDLE_FILE_OK", message: `Bundle file '${file}' found.`, path: filePath, severity: "ok" }
      : { code: "TN_DOCTOR_BUNDLE_FILE_MISSING", message: `Bundle file '${file}' was not found.`, nextCommand: "pnpm run build", path: filePath, severity: "error" });
  }

  if (previewUrl === undefined) {
    checks.push({
      code: "TN_DOCTOR_PREVIEW_URL_UNAVAILABLE",
      message: "Runtime preview was not probed because no --url was provided.",
      nextCommand: "Start pnpm run dev:web and rerun tn doctor --url <preview-url> --json.",
      severity: "unavailable",
    });
  } else {
    checks.push(...await inspectPreview(previewUrl));
  }

  return checks;
}

async function inspectPreview(url: string): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const browserLogs: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });
    page.on("console", (message) => browserLogs.push(`${message.type()}: ${message.text()}`));
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`));
    page.on("response", (response) => {
      if (response.status() >= 400) {
        requestFailures.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
    const canvas = await page.evaluate(`(() => {
      const canvas = document.querySelector("canvas");
      if (canvas === null) return null;
      const rect = canvas.getBoundingClientRect();
      return { height: Math.round(rect.height), width: Math.round(rect.width) };
    })()`) as { height: number; width: number } | null;
    checks.push(canvas === null
      ? { code: "TN_DOCTOR_PREVIEW_CANVAS_MISSING", message: "Preview page did not contain a canvas.", nextCommand: "Check pnpm run dev:web output and runtime errors.", severity: "error" }
      : { code: "TN_DOCTOR_PREVIEW_CANVAS_OK", data: canvas, message: `Preview canvas is ${canvas.width}x${canvas.height}.`, severity: canvas.width > 0 && canvas.height > 0 ? "ok" : "error" });
    try {
      await page.waitForFunction("Boolean(globalThis.__THREENATIVE_READY__)", undefined, { timeout: 10000 });
      const runtimeReady = await page.evaluate("globalThis.__THREENATIVE_READY__") as unknown;
      checks.push(runtimeReadyCheck(runtimeReady));
    } catch (error) {
      checks.push({
        code: "TN_DOCTOR_PREVIEW_READY_MISSING",
        message: `Preview did not expose ThreeNative runtime readiness: ${error instanceof Error ? error.message : String(error)}.`,
        nextCommand: "Check browser console output and runtime bundle diagnostics.",
        severity: "error",
      });
    }
    checks.push(browserLogs.length === 0
      ? { code: "TN_DOCTOR_PREVIEW_BROWSER_LOGS_OK", message: "Preview produced no browser console logs.", severity: "ok" }
      : { code: "TN_DOCTOR_PREVIEW_BROWSER_LOGS", data: browserLogs, message: `Preview produced ${browserLogs.length} browser console log entries.`, severity: "warning" });
    checks.push(pageErrors.length === 0
      ? { code: "TN_DOCTOR_PREVIEW_PAGE_ERRORS_OK", message: "Preview produced no page errors.", severity: "ok" }
      : { code: "TN_DOCTOR_PREVIEW_PAGE_ERRORS", data: pageErrors, message: `Preview produced ${pageErrors.length} page errors.`, nextCommand: "Fix runtime page errors before visual proof.", severity: "error" });
    checks.push(requestFailures.length === 0
      ? { code: "TN_DOCTOR_PREVIEW_REQUESTS_OK", message: "Preview had no failed resource requests.", severity: "ok" }
      : { code: "TN_DOCTOR_PREVIEW_REQUEST_FAILURES", data: requestFailures, message: `Preview had ${requestFailures.length} failed resource requests.`, nextCommand: "Fix missing bundle assets or server routes.", severity: "error" });
  } catch (error) {
    checks.push({
      code: "TN_DOCTOR_PREVIEW_UNAVAILABLE",
      message: `Runtime preview probe was unavailable: ${error instanceof Error ? error.message : String(error)}.`,
      nextCommand: "Start pnpm run dev:web and rerun tn doctor --url <preview-url> --json.",
      severity: "unavailable",
    });
  } finally {
    await browser?.close();
  }
  return checks;
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function manifestFiles(manifest: BundleManifestShape): string[] {
  const values = [
    ...Object.values(manifest.entry ?? {}),
    ...Object.values(manifest.files ?? {}),
  ];
  return values.filter((value): value is string => typeof value === "string" && !value.includes("/") && value.trim() !== "");
}

function runtimeReadyCheck(value: unknown): DoctorCheck {
  const ready = isRecord(value) ? value : {};
  const diagnostics = Array.isArray(ready.diagnostics) ? ready.diagnostics : [];
  const runtimeDiagnostics = isRecord(ready.runtimeDiagnostics) ? ready.runtimeDiagnostics : undefined;
  const runtimeScene = isRecord(runtimeDiagnostics?.scene) ? runtimeDiagnostics.scene : undefined;
  const visibleMeshCount = typeof runtimeScene?.visibleMeshCount === "number" ? runtimeScene.visibleMeshCount : undefined;
  const runtimeAssets = isRecord(runtimeDiagnostics?.assets) ? runtimeDiagnostics.assets : undefined;
  const resourceFailures = Array.isArray(runtimeAssets?.resourceFailures) ? runtimeAssets.resourceFailures : [];
  const ok = ready.ok !== false && diagnostics.every((diagnostic) => !isRecord(diagnostic) || diagnostic.severity !== "error");
  if (!ok) {
    return {
      code: "TN_DOCTOR_PREVIEW_READY_FAILED",
      data: value,
      message: "Preview readiness was exposed but contains runtime errors.",
      nextCommand: "Inspect runtime diagnostics and fix errors before capturing visual proof.",
      severity: "error",
    };
  }
  if (resourceFailures.length > 0) {
    return {
      code: "TN_DOCTOR_PREVIEW_RESOURCE_FAILURES",
      data: value,
      message: `Preview readiness reports ${resourceFailures.length} failed resources.`,
      nextCommand: "Fix missing assets or bundle paths before visual proof.",
      severity: "error",
    };
  }
  if (visibleMeshCount !== undefined && visibleMeshCount <= 0) {
    return {
      code: "TN_DOCTOR_PREVIEW_VISIBLE_MESH_MISSING",
      data: value,
      message: "Preview readiness reports zero visible meshes.",
      nextCommand: "Check active camera, transforms, visibility, and model scale.",
      severity: "warning",
    };
  }
  return {
    code: "TN_DOCTOR_PREVIEW_READY_OK",
    data: value,
    message: visibleMeshCount === undefined
      ? "Preview exposes ThreeNative runtime readiness."
      : `Preview exposes ThreeNative runtime readiness with ${visibleMeshCount} visible meshes.`,
    severity: "ok",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function summarize(checks: readonly DoctorCheck[]): { errors: number; ok: number; unavailable: number; warnings: number } {
  return {
    errors: checks.filter((check) => check.severity === "error").length,
    ok: checks.filter((check) => check.severity === "ok").length,
    unavailable: checks.filter((check) => check.severity === "unavailable").length,
    warnings: checks.filter((check) => check.severity === "warning").length,
  };
}

function renderDoctor(payload: {
  checks: readonly DoctorCheck[];
  message: string;
  projectPath: string;
  summary: { errors: number; ok: number; unavailable: number; warnings: number };
}): string {
  const rows = payload.checks.map((check) => {
    const next = check.nextCommand === undefined ? "" : ` Next: ${check.nextCommand}`;
    return `  [${check.severity}] ${check.code}: ${check.message}${next}`;
  }).join("\n");
  return `${payload.message}\nProject: ${payload.projectPath}\nSummary: ${payload.summary.ok} ok, ${payload.summary.warnings} warnings, ${payload.summary.errors} errors, ${payload.summary.unavailable} unavailable\n${rows}\n`;
}
