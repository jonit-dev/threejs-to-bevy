import { probeGameAssetProviders } from "@threenative/authoring";

import { loadProjectEnvironment, ProjectEnvironmentError } from "../../config/projectEnvironment.js";
import { diagnosticResult, type ICommandResult } from "../../diagnostics.js";
import { readFlag, resolveProjectPath } from "../gameShared.js";

export async function gameProvidersCommand(argv: readonly string[]): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv);
  let projectEnvironment;
  try {
    projectEnvironment = await loadProjectEnvironment({
      envFile: readFlag(normalizedArgv, "--env-file"),
      projectPath,
    });
  } catch (error) {
    if (!(error instanceof ProjectEnvironmentError)) throw error;
    return diagnosticResult(
      {
        code: error.code,
        envFilePath: error.envFilePath,
        message: error.message,
        fix: { instruction: "Provide a readable dotenv file and keep relative --env-file paths inside the selected project." },
      },
      { exitCode: 1, json, stderr: !json },
    );
  }
  const payload = {
    code: "TN_GAME_PROVIDER_PROBES",
    message: "Optional game asset/audio generation providers are local tooling only; credential values are redacted.",
    providers: probeGameAssetProviders(projectEnvironment.environment),
  };
  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`,
  };
}
