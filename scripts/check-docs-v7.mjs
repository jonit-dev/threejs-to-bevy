import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const requiredV7Prds = [
  "V7-00-post-v6-gap-triage-and-contract-alignment.md",
  "V7-01-v7-conformance-fixtures-and-evidence-harness.md",
  "V7-02-advanced-physics-and-character-runtime-parity.md",
  "V7-03-animation-graphs-state-machines-events-and-particles.md",
  "V7-04-rich-portable-ui-navigation-and-input-parity.md",
  "V7-05-spatial-audio-buses-and-runtime-audio-hardening.md",
  "V7-06-renderer-and-dense-content-runtime-parity.md",
  "V7-07-scripting-determinism-and-runtime-lifecycle.md",
  "V7-08-packaging-target-profiles-and-platform-diagnostics.md",
  "V7-09-performance-budgets-and-profiling-evidence.md",
  "V7-10-functional-v7-scene-and-template.md",
  "V7-11-release-gate-and-docs-consistency.md",
];

const requiredV7Phrases = [
  ["post-V6 gap", "V7 docs must mention post-V6 gap triage."],
  ["promoted, deferred, or never portable", "V7 docs must classify candidates as promoted, deferred, or never portable."],
  ["examples/", "V7 docs must require examples to follow repo folder patterns."],
  ["templates/", "V7 docs must mention template evidence where promoted."],
  ["artifacts/v7", "V7 docs must require V7 artifact evidence."],
  ["rendered", "V7 docs must require rendered artifacts for visible features."],
  ["only builds", "V7 docs must reject build-only proof for visible features."],
  ["backend-specific", "V7 docs must address backend-specific feature handling."],
  ["diagnostics", "V7 docs must require stable diagnostics."],
];

const requiredMaturityPhrases = [
  ["## Post-V6 Gap Triage", "Feature maturity docs must include the post-V6 gap triage table."],
  ["V7-promoted", "Feature maturity docs must identify V7-promoted candidates."],
  ["Deferred", "Feature maturity docs must identify deferred candidates."],
  ["Never portable", "Feature maturity docs must identify never-portable candidates."],
  ["V6 baseline", "Feature maturity docs must tie V7 candidates to their V6 baseline."],
  ["artifacts/v7", "Feature maturity docs must require V7 artifact evidence."],
  ["verify:v7", "Feature maturity docs must require V7 release-gate evidence."],
];

const unsupportedV7ClaimPatterns = [
  /\bV7\b[^\n.]{0,80}\b(?:supports?|includes?|promotes?|implements?|completes?|ships?|provides?)\b[^\n.]{0,80}\b(?:scene editor|editor|online|networking|replication|collaboration|(?:public )?plugins?(?: APIs?)?|raw Three\.js|direct Bevy(?: authoring)?|broad shader(?: |-)?graphs?)\b/gi,
  /\b(?:scene editor|editor|online|networking|replication|collaboration|(?:public )?plugins?(?: APIs?)?|raw Three\.js|direct Bevy(?: authoring)?|broad shader(?: |-)?graphs?)\b[^\n.]{0,80}\b(?:is|are)\b[^\n.]{0,80}\b(?:supported|implemented|complete|promoted|included|shipped|provided)\b[^\n.]{0,80}\b(?:in|by|for)\b[^\n.]{0,20}\bV7\b/gi,
];

const statusAndParityPhrases = [
  ["V7 PRDs", "STATUS and parity docs must link the V7 PRD front door."],
  ["verify:v7", "STATUS and parity docs must mention the V7 release gate."],
  ["deferred", "STATUS and parity docs must mention deferred V7 gaps."],
  ["never portable", "STATUS and parity docs must mention never-portable V7 outcomes."],
];

export async function checkDocsV7(root = repoRoot) {
  const diagnostics = [];
  const indexPath = "docs/PRDs/v7/README.md";
  const maturityPath = "docs/feature-maturity.md";
  const parityPath = "docs/bevy-feature-parity.md";
  const statusPath = "docs/STATUS.md";
  const index = await readDoc(root, indexPath, diagnostics);
  const maturity = await readDoc(root, maturityPath, diagnostics);
  const parity = await readDoc(root, parityPath, diagnostics);
  const status = await readDoc(root, statusPath, diagnostics);
  const docsText = `${index}\n${status}\n${parity}\n${maturity}`;

  for (const file of requiredV7Prds) {
    if (!indexIncludesMarkdownLink(index, file)) {
      diagnostics.push({
        code: "TN_DOCS_V7_INDEX_LINK_MISSING",
        file: indexPath,
        message: `V7 PRD index must link '${file}'.`,
        severity: "error",
      });
    }
  }

  for (const [phrase, message] of requiredV7Phrases) {
    if (!index.includes(phrase)) {
      diagnostics.push({
        code: "TN_DOCS_V7_SCOPE_PHRASE_MISSING",
        file: indexPath,
        message,
        severity: "error",
      });
    }
  }

  for (const [phrase, message] of statusAndParityPhrases) {
    for (const [file, text] of [
      [statusPath, status],
      [parityPath, parity],
    ]) {
      if (!text.includes(phrase)) {
        diagnostics.push({
          code: "TN_DOCS_V7_STATUS_PARITY_SCOPE_MISSING",
          file,
          message,
          severity: "error",
        });
      }
    }
  }

  for (const [phrase, message] of requiredMaturityPhrases) {
    if (!maturity.includes(phrase)) {
      diagnostics.push({
        code: "TN_DOCS_V7_MATURITY_TRIAGE_MISSING",
        file: maturityPath,
        message,
        severity: "error",
      });
    }
  }

  for (const pattern of unsupportedV7ClaimPatterns) {
    for (const match of docsText.matchAll(pattern)) {
      const claim = match[0];
      if (isNegatedUnsupportedClaim(claim)) {
        continue;
      }
      diagnostics.push({
        code: "TN_DOCS_V7_SCOPE_CLAIM_UNSUPPORTED",
        file: status.includes(claim) ? statusPath : parity.includes(claim) ? parityPath : indexPath,
        message: `V7 docs must not claim unsupported scope: '${claim}'.`,
        severity: "error",
      });
    }
  }

  return { diagnostics, ok: diagnostics.length === 0 };
}

function isNegatedUnsupportedClaim(claim) {
  return /\b(?:not|no|never|cannot|can't|do not|does not|must not|should not)\b/i.test(claim);
}

function indexIncludesMarkdownLink(index, file) {
  const escapedFile = escapeRegExp(file);
  return new RegExp(String.raw`\[[^\]]+\]\(\./${escapedFile}\)`).test(index);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readDoc(root, file, diagnostics) {
  try {
    return await readFile(resolve(root, file), "utf8");
  } catch {
    diagnostics.push({
      code: "TN_DOCS_V7_FILE_MISSING",
      file,
      message: `Required V7 documentation file '${file}' is missing.`,
      severity: "error",
    });
    return "";
  }
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await checkDocsV7();
  const payload = {
    code: result.ok ? "TN_DOCS_V7_OK" : "TN_DOCS_V7_FAILED",
    diagnostics: result.diagnostics,
    status: result.ok ? "pass" : "fail",
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write("V7 docs consistency passed.\n");
  } else {
    process.stderr.write(
      `V7 docs consistency failed with ${result.diagnostics.length} issue(s).\n${result.diagnostics
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
