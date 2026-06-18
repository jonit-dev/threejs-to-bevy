import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkDocsV10 } from "./check-docs-v10.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const V10_REQUIRED_SCRIPTS = {
  "check:docs": "tools/verify/dist/cli/check-docs.js",
  "verify:v10": "node scripts/verify-v10.mjs",
};

export async function checkQualityV10(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const diagnostics = [];
  const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const scripts = packageJson.scripts ?? {};

  for (const [name, command] of Object.entries(V10_REQUIRED_SCRIPTS)) {
    if (!scripts[name]?.includes(command.replace("node ", ""))) {
      diagnostics.push({
        code: "TN_CHECK_V10_SCRIPT_UNREGISTERED",
        message: `Root package.json must register pnpm ${name} against ${command}.`,
        path: `package.json#scripts.${name}`,
        severity: "error",
      });
    }
  }

  const docs = await checkDocsV10(root);
  diagnostics.push(...docs.diagnostics);

  const parity = await readFile(resolve(root, "docs/bevy-feature-parity.md"), "utf8");
  for (const [index, line] of parity.split(/\r?\n/).entries()) {
    if (/^- \[x\].*V10-0[1-4]/.test(line) && !/(?:artifacts\/v10\/|pnpm verify:v10:|pnpm verify:v10\b)/.test(line)) {
      diagnostics.push({
        code: "TN_CHECK_V10_COMPLETION_EVIDENCE_MISSING",
        line: index + 1,
        message: "Parity docs claim checked V10 completion without focused gate or artifact evidence.",
        path: `docs/bevy-feature-parity.md:${index + 1}`,
        severity: "error",
        value: line,
      });
    }
  }

  const catalogPath = "packages/ir/fixtures/rejected/v10-boundaries/catalog.json";
  const catalog = JSON.parse(await readFile(resolve(root, catalogPath), "utf8"));
  const expectedCodes = new Set([
    "TN_IR_NATIVE_AUTHORING_UNSUPPORTED",
    "TN_IR_RAW_THREE_SOURCE_UNSUPPORTED",
    "TN_IR_RENDERER_PLUGIN_UNSUPPORTED",
    "TN_IR_NETWORKING_UNSUPPORTED",
    "TN_IR_2D_WORKFLOW_UNSUPPORTED",
    "TN_IR_PLATFORM_API_UNSUPPORTED",
  ]);
  for (const fixture of catalog.fixtures ?? []) {
    if (!fixture.ownerPrd) {
      diagnostics.push({
        code: "TN_CHECK_V10_BOUNDARY_OWNER_MISSING",
        fixture: fixture.id,
        message: `V10 boundary fixture '${fixture.id}' is missing ownerPrd.`,
        path: `${catalogPath}#${fixture.id}`,
        severity: "error",
      });
    }
    if (!expectedCodes.has(fixture.expectedDiagnostic)) {
      diagnostics.push({
        code: "TN_CHECK_V10_BOUNDARY_DIAGNOSTIC_MISSING",
        fixture: fixture.id,
        message: `V10 boundary fixture '${fixture.id}' must name a stable expected diagnostic.`,
        path: `${catalogPath}#${fixture.id}`,
        severity: "error",
      });
    }
  }

  for (const prdPath of [
    "docs/PRDs/v10/V10-01-scope-triage-and-release-gate.md",
    "docs/PRDs/v10/V10-02-advanced-renderer-materials-and-physics.md",
    "docs/PRDs/v10/V10-03-cross-runtime-visual-calibration.md",
    "docs/PRDs/v10/V10-04-production-platform-audio-assets-and-release.md",
  ]) {
    try {
      await access(resolve(root, prdPath));
    } catch {
      diagnostics.push({
        code: "TN_CHECK_V10_PRD_MISSING",
        message: `Required V10 PRD is missing: ${prdPath}`,
        path: prdPath,
        severity: "error",
      });
    }
  }

  return {
    code: diagnostics.length === 0 ? "TN_CHECK_V10_QUALITY_OK" : "TN_CHECK_V10_QUALITY_FAILED",
    diagnostics,
    ok: diagnostics.length === 0,
    status: diagnostics.length === 0 ? "pass" : "fail",
  };
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await checkQualityV10();
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write("V10 quality gate wiring check passed.\n");
  } else {
    process.stderr.write(`${result.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join("\n")}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
