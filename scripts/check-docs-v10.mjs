import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const requiredIndexPhrases = [
  ["V10-01-scope-triage-and-release-gate.md", "V10 PRD index must link V10-01."],
  ["V10-02-advanced-renderer-materials-and-physics.md", "V10 PRD index must link V10-02."],
  ["V10-03-cross-runtime-visual-calibration.md", "V10 PRD index must link V10-03."],
  ["V10-04-production-platform-audio-assets-and-release.md", "V10 PRD index must link V10-04."],
  ["pnpm verify:v10", "V10 PRD index must document the temporary aggregate verifier."],
];

const requiredPrdPhrases = [
  ["scripts/check-docs-v10.mjs", "V10-01 PRD must name the docs ownership guard."],
  ["scripts/verify-v10.mjs", "V10-01 PRD must name the aggregate verifier."],
  ["tools/verify/artifacts/final-gap-planning/verification-report.json", "V10-01 PRD must name the aggregate report artifact."],
];

const requiredStatusPhrases = [
  ["pnpm check:docs", "STATUS must document the canonical docs gate."],
  ["pnpm verify:v10", "STATUS must document the V10 aggregate verifier."],
];

const requiredParityPhrases = [
  ["V10 Residual Ownership Map", "Parity docs must include the V10 ownership map."],
  ["V10-01", "Parity docs must name V10-01."],
  ["V10-02", "Parity docs must name V10-02."],
  ["V10-03", "Parity docs must name V10-03."],
  ["V10-04", "Parity docs must name V10-04."],
  ["V10-01 boundary", "Parity docs must mark intentionally non-portable rows with a V10 boundary."],
];

const ownerPattern = /\(.*V10-0[1-4].*\)/;
const completionEvidencePattern = /(?:artifacts\/final-gap-planning\/|pnpm verify:v10:|pnpm verify:v10\b|pnpm check:docs\b)/;

export async function checkDocsV10(root = repoRoot) {
  const diagnostics = [];
  const indexPath = "docs/PRDs/v10/README.md";
  const prdPath = "docs/PRDs/v10/V10-01-scope-triage-and-release-gate.md";
  const statusPath = "docs/STATUS.md";
  const parityPath = "docs/bevy-feature-parity.md";

  const index = await readDoc(root, indexPath, diagnostics);
  const prd = await readDoc(root, prdPath, diagnostics);
  const status = await readDoc(root, statusPath, diagnostics);
  const parity = await readDoc(root, parityPath, diagnostics);

  requirePhrases(index, indexPath, requiredIndexPhrases, "TN_DOCS_V10_INDEX_LINK_MISSING", diagnostics);
  requirePhrases(prd, prdPath, requiredPrdPhrases, "TN_DOCS_V10_PRD_ARTIFACT_MISSING", diagnostics);
  requirePhrases(status, statusPath, requiredStatusPhrases, "TN_DOCS_V10_STATUS_GATE_MISSING", diagnostics);
  requirePhrases(parity, parityPath, requiredParityPhrases, "TN_DOCS_V10_PARITY_OWNER_MISSING", diagnostics);
  validateParityOwnership(parity, parityPath, diagnostics);

  return { diagnostics, ok: diagnostics.length === 0 };
}

function validateParityOwnership(content, path, diagnostics) {
  let section = "";
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    const heading = line.match(/^###\s+(.+)$/);
    if (heading !== null) {
      section = heading[1] ?? "";
      continue;
    }
    if (!line.startsWith("- [")) {
      continue;
    }
    const isEditorOutsideBatch = /Editor, Debugging, and Developer Tools/.test(section);
    if (isEditorOutsideBatch) {
      continue;
    }
    if (/^- \[ \] `P[0-3]`/.test(line) && !ownerPattern.test(line)) {
      diagnostics.push({
        code: "TN_DOCS_V10_OWNER_MISSING",
        line: index + 1,
        message: "Unchecked current-batch parity item must include a V10 owner or boundary.",
        path: `${path}:${index + 1}`,
        severity: "error",
        value: line,
      });
    }
    if (/^- \[ \] `D`/.test(line) && !line.includes("V10-01 boundary")) {
      diagnostics.push({
        code: "TN_DOCS_V10_BOUNDARY_MISSING",
        line: index + 1,
        message: "Deferred or non-portable parity item must include the V10-01 boundary marker.",
        path: `${path}:${index + 1}`,
        severity: "error",
        value: line,
      });
    }
    if (/^- \[x\].*V10-0[1-4]/.test(line) && !completionEvidencePattern.test(line)) {
      diagnostics.push({
        code: "TN_DOCS_V10_COMPLETION_EVIDENCE_MISSING",
        line: index + 1,
        message: "Checked V10 parity completion claims must include focused gate or artifact evidence.",
        path: `${path}:${index + 1}`,
        severity: "error",
        value: line,
      });
    }
  }
}

function requirePhrases(content, path, requirements, code, diagnostics) {
  for (const [phrase, message] of requirements) {
    if (!content.includes(phrase)) {
      diagnostics.push({ code, message, path, severity: "error", value: phrase });
    }
  }
}

async function readDoc(root, file, diagnostics) {
  try {
    return await readFile(resolve(root, file), "utf8");
  } catch {
    diagnostics.push({
      code: "TN_DOCS_V10_FILE_MISSING",
      message: `Required V10 documentation file '${file}' is missing.`,
      path: file,
      severity: "error",
    });
    return "";
  }
}

async function main() {
  const result = await checkDocsV10();
  const payload = {
    code: result.ok ? "TN_DOCS_V10_OK" : "TN_DOCS_V10_FAILED",
    diagnostics: result.diagnostics,
    status: result.ok ? "pass" : "fail",
  };
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write("V10 docs consistency passed.\n");
  } else {
    process.stderr.write(
      `V10 docs consistency failed with ${result.diagnostics.length} issue(s).\n${result.diagnostics
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
