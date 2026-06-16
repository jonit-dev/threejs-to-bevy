import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { validateBundle } from "@threenative/compiler";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";

export interface IPackageReport {
  artifactDir: string;
  artifacts: {
    manifestPath: string;
    packageReportPath: string;
    packagedBundlePath: string;
    runtimeArgsPath: string;
  };
  bundlePath: string;
  code: "TN_PACKAGE_OK";
  files: string[];
  manifestPath: string;
  runtimeArgsPath: string;
  schema: "threenative.package-report";
  sourceBundlePath: string;
  target: "desktop";
  version: "0.1.0";
}

export async function packageCommand(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const target = flagValue(normalizedArgv, "--target") ?? "desktop";
  const bundle = flagValue(normalizedArgv, "--bundle");
  const outDir = flagValue(normalizedArgv, "--out") ?? flagValue(normalizedArgv, "--outDir") ?? "dist/package";

  if (bundle === undefined) {
    return diagnosticResult(
      { code: "TN_PACKAGE_USAGE", message: "Usage: tn package --bundle <game.bundle> [--target desktop] [--out <path>] [--json]" },
      { exitCode: 1, json, stderr: true },
    );
  }

  if (target !== "desktop") {
    return diagnosticResult(
      {
        code: "TN_PACKAGE_TARGET_UNSUPPORTED",
        message: `Target '${target}' is not supported by V7 desktop packaging.`,
        severity: "error",
        suggestion: "Use '--target desktop'. Mobile stores, online publishing, and service deployment are outside V7 scope.",
      },
      { exitCode: 1, json, stderr: true },
    );
  }

  try {
    const bundlePath = resolve(cwd, bundle);
    const validation = await validateBundle(bundlePath);
    if (!validation.ok) {
      return diagnosticResult(
        {
          code: "TN_PACKAGE_BUNDLE_INVALID",
          diagnostics: validation.diagnostics,
          message: `Bundle validation failed with ${validation.diagnostics.length} error(s).`,
          path: bundlePath,
          severity: "error",
        },
        { exitCode: 1, json, stderr: true },
      );
    }
    await assertDesktopTarget(bundlePath);
    const packageRoot = resolve(cwd, outDir, "desktop");
    const packagedBundlePath = resolve(packageRoot, basename(bundlePath));
    await mkdir(packageRoot, { recursive: true });
    await cp(bundlePath, packagedBundlePath, { force: true, recursive: true });
    const files = await listRelativeFiles(packagedBundlePath);
    const manifestPath = resolve(packageRoot, "package.manifest.json");
    const runtimeArgsPath = resolve(packageRoot, "runtime.args.json");
    const packageReportPath = resolve(packageRoot, "package.report.json");
    await writeFile(
      manifestPath,
      `${JSON.stringify(
        {
          artifacts: {
            packagedBundlePath,
            runtimeArgsPath,
          },
          bundle: basename(packagedBundlePath),
          code: "TN_PACKAGE_MANIFEST_OK",
          schema: "threenative.package",
          sourceBundlePath: bundlePath,
          target,
          version: "0.1.0",
        },
        null,
        2,
      )}\n`,
    );
    await writeFile(
      runtimeArgsPath,
      `${JSON.stringify(
        {
          args: [basename(packagedBundlePath)],
          command: "threenative_runtime",
          schema: "threenative.runtime-args",
          target,
          version: "0.1.0",
        },
        null,
        2,
      )}\n`,
    );
    const report: IPackageReport = {
      artifactDir: packageRoot,
      artifacts: { manifestPath, packageReportPath, packagedBundlePath, runtimeArgsPath },
      bundlePath: packagedBundlePath,
      code: "TN_PACKAGE_OK",
      files,
      manifestPath,
      runtimeArgsPath,
      schema: "threenative.package-report",
      sourceBundlePath: bundlePath,
      target,
      version: "0.1.0",
    };
    await writeFile(packageReportPath, `${JSON.stringify(report, null, 2)}\n`);
    return {
      exitCode: 0,
      stdout: json ? `${JSON.stringify(report, null, 2)}\n` : `Packaged desktop bundle at '${packagedBundlePath}'.\n`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return diagnosticResult({ code: "TN_PACKAGE_FAILED", message, severity: "error" }, { exitCode: 1, json, stderr: true });
  }
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

async function assertDesktopTarget(bundlePath: string): Promise<void> {
  const manifest = JSON.parse(await readFile(resolve(bundlePath, "manifest.json"), "utf8")) as {
    files?: { targetProfile?: string };
  };
  const targetProfilePath = manifest.files?.targetProfile;
  if (targetProfilePath === undefined) {
    throw new Error("Bundle manifest does not reference target.profile.json.");
  }
  const profile = JSON.parse(await readFile(resolve(bundlePath, targetProfilePath), "utf8")) as { targets?: unknown };
  const targets = Array.isArray(profile.targets) ? profile.targets : [];
  if (!targets.includes("desktop")) {
    throw new Error("Bundle target profile must include 'desktop' for V7 desktop packaging.");
  }
  if (targets.some((target) => target === "mobile" || target === "ios" || target === "android" || target === "online")) {
    throw new Error("Mobile and online publishing targets are outside V7 desktop packaging scope.");
  }
}

async function listRelativeFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(resolve(root, prefix), { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      return entry.isDirectory() ? listRelativeFiles(root, path) : [path];
    }),
  );
  return files.flat().sort();
}
