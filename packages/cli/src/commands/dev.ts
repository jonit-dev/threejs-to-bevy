import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { buildProject, loadProjectConfig } from "@threenative/compiler";
import { startWebPreview, type IWebPreviewServer } from "@threenative/runtime-web-three";
import { diagnosticResult, type ICommandResult } from "../diagnostics.js";

export interface IDevResult extends ICommandResult {
  server?: IWebPreviewServer;
}

export async function devCommand(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): Promise<IDevResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const targetFlagIndex = normalizedArgv.indexOf("--target");
  const target = targetFlagIndex === -1 ? undefined : normalizedArgv[targetFlagIndex + 1];

  if (target !== "web") {
    return diagnosticResult(
      {
        code: "TN_DEV_TARGET_UNSUPPORTED",
        message: "V1 currently supports 'tn dev --target web'.",
        target,
      },
      { exitCode: 1, json, stderr: true },
    );
  }

  const projectFlagIndex = normalizedArgv.indexOf("--project");
  const projectPath = projectFlagIndex === -1 ? cwd : resolve(cwd, normalizedArgv[projectFlagIndex + 1] ?? ".");

  try {
    const config = await loadProjectConfig(projectPath);
    const bundlePath = resolve(projectPath, config.outDir);
    try {
      await access(resolve(bundlePath, "manifest.json"));
    } catch {
      await buildProject(projectPath);
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
    return diagnosticResult({ code: "TN_DEV_WEB_FAILED", message }, { exitCode: 1, json, stderr: true });
  }
}
