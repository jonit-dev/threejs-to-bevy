import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { buildProject, loadProjectConfig, validateBundle } from "@threenative/compiler";
import { startWebPreview, type IWebPreviewServer } from "@threenative/runtime-web-three";
import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { runBevyRuntime, type BevyRuntimeProcess, type BevyRuntimeRunner } from "../native/bevy.js";

export interface IDevResult extends ICommandResult {
  process?: BevyRuntimeProcess;
  server?: IWebPreviewServer;
}

export interface IDevCommandOptions {
  bevyRunner?: BevyRuntimeRunner;
}

export async function devCommand(
  argv: readonly string[],
  cwd = process.env.INIT_CWD ?? process.cwd(),
  options: IDevCommandOptions = {},
): Promise<IDevResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const targetFlagIndex = normalizedArgv.indexOf("--target");
  const target = targetFlagIndex === -1 ? undefined : normalizedArgv[targetFlagIndex + 1];

  if (target !== "web" && target !== "desktop") {
    return diagnosticResult(
      {
        code: "TN_DEV_TARGET_UNSUPPORTED",
        message: "V1 currently supports 'tn dev --target web' and 'tn dev --target desktop'.",
        target,
      },
      { exitCode: 1, json, stderr: true },
    );
  }

  const projectFlagIndex = normalizedArgv.indexOf("--project");
  const projectPath = projectFlagIndex === -1 ? cwd : resolve(cwd, normalizedArgv[projectFlagIndex + 1] ?? ".");

  try {
    const bundlePath = await ensureProjectBundle(projectPath);

    if (target === "desktop") {
      const process = (options.bevyRunner ?? runBevyRuntime)({ bundlePath });
      const payload = {
        bundlePath,
        code: "TN_DEV_DESKTOP_READY",
        message: "Desktop preview starting with Bevy runtime.",
      };

      return {
        exitCode: 0,
        process,
        stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`,
      };
    }

    const server = await startWebPreview({ bundlePath });
    const payload = {
      code: "TN_DEV_WEB_READY",
      message: `Web preview ready at ${server.url}`,
      url: server.url,
    };

    return {
      exitCode: 0,
      server,
      stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return diagnosticResult({ code: "TN_DEV_FAILED", message }, { exitCode: 1, json, stderr: true });
  }
}

async function ensureProjectBundle(projectPath: string): Promise<string> {
  const config = await loadProjectConfig(projectPath);
  const bundlePath = resolve(projectPath, config.outDir);
  try {
    await access(resolve(bundlePath, "manifest.json"));
  } catch {
    await buildProject(projectPath);
  }

  const report = await validateBundle(bundlePath);
  if (!report.ok) {
    throw new Error(report.diagnostics[0]?.message ?? "Bundle validation failed.");
  }

  return bundlePath;
}
