import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function checkColorParityContract(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const diagnostics = [];

  const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  if (packageJson.scripts?.["verify:focused"] === undefined) {
    diagnostics.push({
      code: "TN_COLOR_PARITY_SCRIPT_MISSING",
      message: "Root package.json must expose verify:focused for color parity gate dispatch.",
      severity: "error",
    });
  }

  for (const relativePath of [
    "examples/v8-color-parity/src/game.ts",
    "examples/v8-color-parity/threenative.config.json",
    "examples/v8-lighting-tone/src/game.ts",
    "packages/cli/src/verify/colorParitySwatches.ts",
    "packages/cli/src/verify/colorParityVisual.ts",
    "scripts/verify-v8-color-parity.mjs",
  ]) {
    try {
      await access(resolve(root, relativePath));
    } catch {
      diagnostics.push({
        code: "TN_COLOR_PARITY_CONTRACT_FILE_MISSING",
        message: `Color parity harness file '${relativePath}' is missing.`,
        severity: "error",
      });
    }
  }

  const status = await readFile(resolve(root, "docs/STATUS.md"), "utf8");
  if (!status.includes("verify:v8:color-parity")) {
    diagnostics.push({
      code: "TN_COLOR_PARITY_STATUS_COMMAND_MISSING",
      message: "docs/STATUS.md must document verify:v8:color-parity.",
      severity: "error",
    });
  }

  const contractModule = await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/colorParityContract.js")).href);
  diagnostics.push(
    ...contractModule.validateColorParityThresholdsLocked().map((diagnostic) => ({ ...diagnostic, severity: "error" })),
    ...contractModule.validateColorParitySwatchRegions().map((diagnostic) => ({ ...diagnostic, severity: "error" })),
    ...contractModule.validateColorParityExampleSource(
      await readFile(resolve(root, "examples/v8-color-parity/src/game.ts"), "utf8"),
    ).map((diagnostic) => ({ ...diagnostic, severity: "error" })),
  );

  return {
    diagnostics,
    ok: diagnostics.length === 0,
    status: diagnostics.length === 0 ? "pass" : "fail",
  };
}

async function main() {
  const result = await checkColorParityContract();
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write("Color parity contract checks passed.\n");
  } else {
    process.stderr.write(
      `Color parity contract checks failed with ${result.diagnostics.length} issue(s).\n${result.diagnostics
        .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
        .join("\n")}\n`,
    );
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
