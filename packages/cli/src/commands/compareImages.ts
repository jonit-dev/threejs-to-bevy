import { resolve } from "node:path";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { compareImageFiles } from "../verify/compareImages.js";

export async function compareImagesCommand(
  argv: readonly string[],
  cwd = process.env.INIT_CWD ?? process.cwd(),
): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const paths = normalizedArgv.filter((arg) => !arg.startsWith("--"));
  const [first, second] = paths;

  if (first === undefined || second === undefined) {
    return diagnosticResult(
      {
        code: "TN_COMPARE_IMAGES_USAGE",
        message: "Usage: tn compare-images <first.png> <second.png> [--json]",
      },
      { exitCode: 1, json, stderr: true },
    );
  }

  try {
    const report = await compareImageFiles(resolve(cwd, first), resolve(cwd, second));
    const payload = {
      code: "TN_COMPARE_IMAGES_OK",
      ...report,
    };

    return {
      exitCode: 0,
      stdout: json
        ? `${JSON.stringify(payload, null, 2)}\n`
        : `Changed pixels: ${formatPercent(report.changedPixelRatio)}\nAverage brightness delta: ${formatPercent(report.averageBrightnessDelta)}\n`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return diagnosticResult({ code: "TN_COMPARE_IMAGES_FAILED", message }, { exitCode: 1, json, stderr: true });
  }
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(3)}%`;
}
