import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const requiredIndexPhrases = [
  ["V9-06-audio-persistence-tooling-support.md", "V9 PRD index must link V9-06 support PRD."],
  ["verify:v9:support", "V9 PRD index must mention the support aggregate gate."],
  ["verify:v9:audio-support", "V9 PRD index must mention the audio support gate."],
  ["verify:v9:local-data-support", "V9 PRD index must mention the local-data support gate."],
  ["verify:v9:diagnostics-support", "V9 PRD index must mention the diagnostics support gate."],
  ["verify:v9:editor-support", "V9 PRD index must mention the editor support gate."],
  ["verify:v9:stress-support", "V9 PRD index must mention the stress support gate."],
];

const requiredPrdPhrases = [
  ["packages/ir/fixtures/conformance/support-stress/game.bundle", "V9-06 PRD must name the support stress fixture."],
  ["tools/verify/artifacts/audio-support/", "V9-06 PRD must name audio support artifact path."],
  ["tools/verify/artifacts/local-data-support/", "V9-06 PRD must name local-data support artifact path."],
  ["tools/verify/artifacts/diagnostics-support/", "V9-06 PRD must name diagnostics support artifact path."],
  ["tools/verify/artifacts/editor-support/", "V9-06 PRD must name editor support artifact path."],
  ["tools/verify/artifacts/stress-support/", "V9-06 PRD must name stress support artifact path."],
  ["tools/verify/artifacts/support/verification-report.json", "V9-06 PRD must name aggregate support report path."],
];

const requiredStatusPhrases = [
  ["V9-06 Phase 1", "STATUS must record V9-06 audio support."],
  ["V9-06 local data", "STATUS must record V9-06 local data support."],
  ["V9-06 diagnostics/debug draw", "STATUS must record V9-06 diagnostics support."],
  ["V9-06 editor tooling", "STATUS must record V9-06 editor support."],
  ["V9-06 target profiles", "STATUS must record V9-06 stress/profile support."],
  ["V9-06 aggregate support gate", "STATUS must record V9-06 aggregate gate evidence."],
];

const requiredParityPhrases = [
  ["V9-06 now carries schema-backed `local-data.ir.json`", "Parity docs must record local-data support."],
  ["V9-06 Phase 1 adds bounded attenuation curves", "Parity docs must record audio support."],
  ["focused web/native/script evidence under `tools/verify/artifacts/diagnostics-support/`", "Parity docs must record diagnostics support artifacts."],
  ["focused evidence under `tools/verify/artifacts/editor-support/`", "Parity docs must record editor support artifacts."],
  ["large-scene stress artifacts under `tools/verify/artifacts/stress-support/`", "Parity docs must record stress support artifacts."],
  ["Cloud save", "Parity docs must keep cloud save deferred."],
  ["streaming/network audio", "Parity docs must keep streaming/network audio deferred."],
  ["runtime networking", "Parity docs must keep runtime networking deferred."],
];

export async function checkDocsV9(root = repoRoot) {
  const diagnostics = [];
  const indexPath = "docs/PRDs/v9/README.md";
  const prdPath = "docs/PRDs/v9/V9-06-audio-persistence-tooling-support.md";
  const statusPath = "docs/STATUS.md";
  const parityPath = "docs/bevy-feature-parity.md";

  const index = await readDoc(root, indexPath, diagnostics);
  const prd = await readDoc(root, prdPath, diagnostics);
  const status = await readDoc(root, statusPath, diagnostics);
  const parity = await readDoc(root, parityPath, diagnostics);

  requirePhrases(index, indexPath, requiredIndexPhrases, "TN_DOCS_V9_INDEX_LINK_MISSING", diagnostics);
  requirePhrases(prd, prdPath, requiredPrdPhrases, "TN_DOCS_V9_PRD_ARTIFACT_MISSING", diagnostics);
  requirePhrases(status, statusPath, requiredStatusPhrases, "TN_DOCS_V9_STATUS_SUPPORT_MISSING", diagnostics);
  requirePhrases(parity, parityPath, requiredParityPhrases, "TN_DOCS_V9_PARITY_SUPPORT_MISSING", diagnostics);

  return { diagnostics, ok: diagnostics.length === 0 };
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
      code: "TN_DOCS_V9_FILE_MISSING",
      message: `Required V9 documentation file '${file}' is missing.`,
      path: file,
      severity: "error",
    });
    return "";
  }
}

async function main() {
  const result = await checkDocsV9();
  const payload = {
    code: result.ok ? "TN_DOCS_V9_OK" : "TN_DOCS_V9_FAILED",
    diagnostics: result.diagnostics,
    status: result.ok ? "pass" : "fail",
  };
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write("V9 docs consistency passed.\n");
  } else {
    process.stderr.write(
      `V9 docs consistency failed with ${result.diagnostics.length} issue(s).\n${result.diagnostics
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
