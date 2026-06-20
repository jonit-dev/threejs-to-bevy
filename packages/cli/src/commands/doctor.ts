import { access, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { type ICommandResult } from "../diagnostics.js";

interface DoctorCheck {
  code: string;
  message: string;
  nextCommand?: string;
  path?: string;
  severity: "ok" | "warning" | "error" | "unavailable";
}

interface PackageJsonShape {
  scripts?: Record<string, string>;
}

interface ThreeNativeConfigShape {
  entry?: string;
  outDir?: string;
  template?: string;
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
  "target.profile.json",
] as const;

export async function doctorCommand(argv: readonly string[]): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const project = readFlag(normalizedArgv, "--project") ?? ".";
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const projectPath = isAbsolute(project) ? project : resolve(cwd, project);
  const checks = await inspectProject(projectPath);
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

async function inspectProject(projectPath: string): Promise<DoctorCheck[]> {
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

  for (const file of expectedBundleFiles) {
    const filePath = resolve(bundlePath, file);
    checks.push(await exists(filePath)
      ? { code: "TN_DOCTOR_BUNDLE_FILE_OK", message: `Bundle file '${file}' found.`, path: filePath, severity: "ok" }
      : { code: "TN_DOCTOR_BUNDLE_FILE_MISSING", message: `Bundle file '${file}' was not found.`, nextCommand: "pnpm run build", path: filePath, severity: "error" });
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
