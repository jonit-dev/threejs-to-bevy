import { probeGameAssetProviders } from "@threenative/authoring";

import type { ICommandResult } from "../../diagnostics.js";

export async function gameProvidersCommand(argv: readonly string[]): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const payload = {
    code: "TN_GAME_PROVIDER_PROBES",
    message: "Optional game asset/audio generation providers are local tooling only; credential values are redacted.",
    providers: probeGameAssetProviders(process.env),
  };
  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`,
  };
}
