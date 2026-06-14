import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const requiredV5Prds = [
  "V5-00-scope-and-contract-alignment.md",
  "V5-01-capability-derived-manifests-and-shared-fixtures.md",
  "V5-02-conformance-reports-and-native-observations.md",
  "V5-03-diagnostic-shape-normalization.md",
  "V5-04-fixture-builder-and-test-harness-refactor.md",
  "V5-05-native-runtime-regression-coverage.md",
  "V5-06-textured-standard-material-parity.md",
  "V5-07-lighting-atmosphere-shadow-and-color-parity.md",
  "V5-08-dense-content-instancing-lod-and-budgets.md",
  "V5-09-functional-visual-quality-scene.md",
  "V5-10-release-gate-and-docs-consistency.md",
  "V5-11-game-authoring-ergonomics-refactor.md",
];

const diagnosticPhrases = [
  "TN_CONFORMANCE_*",
  "TN_DOCS_V5_*",
  "TN_VERIFY_V5_*",
  "TN_BEVY_*",
  "TN_WEB_*",
  "TN_IR_DUPLICATE_ENTITY_ID",
  "suggestion",
];

const unsupportedV5Claims = [
  "V5 supports scene editor",
  "V5 supports networking",
  "V5 supports raw Three.js",
  "V5 supports public plugins",
  "V5 supports custom renderer",
];

export async function checkDocsV5(root = repoRoot) {
  const diagnostics = [];
  const indexPath = "docs/PRDs/v5/README.md";
  const diagnosticsPath = "docs/diagnostics.md";
  const statusPath = "docs/STATUS.md";
  const index = await readDoc(root, indexPath, diagnostics);
  const diagnosticsDoc = await readDoc(root, diagnosticsPath, diagnostics);
  const status = await readDoc(root, statusPath, diagnostics);
  const verifyV5 = await readDoc(root, "docs/verify-v5.md", diagnostics);

  for (const file of requiredV5Prds) {
    if (!index.includes(file)) {
      diagnostics.push({
        code: "TN_DOCS_V5_INDEX_LINK_MISSING",
        file: indexPath,
        message: `V5 PRD index must link '${file}'.`,
        severity: "error",
      });
    }
  }

  for (const phrase of diagnosticPhrases) {
    if (!diagnosticsDoc.includes(phrase)) {
      diagnostics.push({
        code: "TN_DOCS_V5_DIAGNOSTIC_RANGE_MISSING",
        file: diagnosticsPath,
        message: `V5 diagnostics documentation must include '${phrase}'.`,
        severity: "error",
      });
    }
  }

  if (!status.includes("V5-03")) {
    diagnostics.push({
      code: "TN_DOCS_V5_STATUS_DIAGNOSTICS_MISSING",
      file: statusPath,
      message: "STATUS.md must mention the V5-03 diagnostic normalization slice once implemented.",
      severity: "error",
    });
  }

  const broadScopeText = `${status}\n${verifyV5}`;
  for (const claim of unsupportedV5Claims) {
    if (broadScopeText.includes(claim)) {
      diagnostics.push({
        code: "TN_DOCS_V5_SCOPE_CLAIM_UNSUPPORTED",
        file: status.includes(claim) ? statusPath : "docs/verify-v5.md",
        message: `V5 docs must not claim unsupported scope: '${claim}'.`,
        severity: "error",
      });
    }
  }

  return { diagnostics, ok: diagnostics.length === 0 };
}

async function readDoc(root, file, diagnostics) {
  try {
    return await readFile(resolve(root, file), "utf8");
  } catch {
    diagnostics.push({
      code: "TN_DOCS_V5_FILE_MISSING",
      file,
      message: `Required V5 documentation file '${file}' is missing.`,
      severity: "error",
    });
    return "";
  }
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await checkDocsV5();
  const payload = {
    code: result.ok ? "TN_DOCS_V5_OK" : "TN_DOCS_V5_FAILED",
    diagnostics: result.diagnostics,
    status: result.ok ? "pass" : "fail",
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write("V5 docs consistency passed.\n");
  } else {
    process.stderr.write(
      `V5 docs consistency failed with ${result.diagnostics.length} issue(s).\n${result.diagnostics
        .map((diagnostic) => `${diagnostic.code} ${diagnostic.file}: ${diagnostic.message}`)
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
