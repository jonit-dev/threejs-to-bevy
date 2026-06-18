import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const requiredV6Prds = [
  "V6-00-scope-and-contract-alignment.md",
  "V6-01-gameplay-resources-and-event-contracts.md",
  "V6-02-gameplay-system-scheduling-and-state.md",
  "V6-03-physics-colliders-and-collision-events.md",
  "V6-04-character-interaction-slice.md",
  "V6-05-animation-playback-contracts.md",
  "V6-06-retained-ui-runtime.md",
  "V6-07-audio-playback-runtime.md",
  "V6-08-asset-and-diagnostic-hardening.md",
  "V6-09-functional-v6-game-scene.md",
  "V6-10-release-gate-and-docs-consistency.md",
];

const requiredV6Phrases = [
  ["gameplay", "V6 docs must mention gameplay scope."],
  ["physics", "V6 docs must mention physics scope."],
  ["animation", "V6 docs must mention animation scope."],
  ["UI", "V6 docs must mention UI scope."],
  ["audio", "V6 docs must mention audio scope."],
  ["conformance", "V6 docs must mention conformance evidence."],
  ["Rust", "V6 docs must mention Rust evidence."],
  ["functional V6 scene", "V6 docs must mention functional scene evidence."],
  ["examples/", "V6 docs must require examples to follow repo folder patterns."],
  ["tools/verify/artifacts/milestones/v6", "V6 docs must require V6 artifact evidence."],
  ["rendered", "V6 docs must require rendered artifacts for visible features."],
  ["only builds", "V6 docs must reject build-only proof for visible features."],
];

const requiredDeferrals = [
  "deeper physics",
  "animation graphs",
  "rich UI/audio",
  "richer UI/audio",
  "packaging",
  "performance",
];

const unsupportedV6ClaimPatterns = [
  /\bV6\b[^\n.]{0,80}\b(?:supports?|includes?|promotes?|implements?|completes?|ships?|provides?)\b[^\n.]{0,80}\b(?:scene editor|editor|online|networking|replication|collaboration|public plugins?|custom renderer(?: replacement)?|raw Three\.js|direct Bevy(?: authoring)?)\b/gi,
  /\b(?:scene editor|editor|online|networking|replication|collaboration|public plugins?|custom renderer(?: replacement)?|raw Three\.js|direct Bevy(?: authoring)?)\b[^\n.]{0,80}\b(?:is|are)\b[^\n.]{0,80}\b(?:supported|implemented|complete|promoted|included|shipped|provided)\b[^\n.]{0,80}\b(?:in|by|for)\b[^\n.]{0,20}\bV6\b/gi,
];

const statusAndParityPhrases = [
  ["V6 PRDs", "STATUS and parity docs must link the V6 PRD front door."],
  ["verify:v6", "STATUS and parity docs must mention the V6 release gate."],
  ["V7", "STATUS and parity docs must mention V7 deferrals."],
];

export async function checkDocsV6(root = repoRoot) {
  const diagnostics = [];
  const indexPath = "docs/PRDs/v6/README.md";
  const parityPath = "docs/bevy-feature-parity.md";
  const statusPath = "docs/STATUS.md";
  const index = await readDoc(root, indexPath, diagnostics);
  const parity = await readDoc(root, parityPath, diagnostics);
  const status = await readDoc(root, statusPath, diagnostics);
  const docsText = `${index}\n${status}\n${parity}`;

  for (const file of requiredV6Prds) {
    if (!index.includes(file)) {
      diagnostics.push({
        code: "TN_DOCS_V6_INDEX_LINK_MISSING",
        file: indexPath,
        message: `V6 PRD index must link '${file}'.`,
        severity: "error",
      });
    }
  }

  for (const [phrase, message] of requiredV6Phrases) {
    if (!index.includes(phrase)) {
      diagnostics.push({
        code: "TN_DOCS_V6_SCOPE_PHRASE_MISSING",
        file: indexPath,
        message,
        severity: "error",
      });
    }
  }

  for (const phrase of requiredDeferrals) {
    if (!docsText.includes(phrase)) {
      diagnostics.push({
        code: "TN_DOCS_V6_DEFERRAL_MISSING",
        file: indexPath,
        message: `V6 docs must explicitly defer '${phrase}' where it is out of the common feature slice.`,
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
          code: "TN_DOCS_V6_STATUS_PARITY_SCOPE_MISSING",
          file,
          message,
          severity: "error",
        });
      }
    }
  }

  for (const pattern of unsupportedV6ClaimPatterns) {
    for (const match of docsText.matchAll(pattern)) {
      const claim = match[0];
      if (isNegatedUnsupportedClaim(claim)) {
        continue;
      }
      diagnostics.push({
        code: "TN_DOCS_V6_SCOPE_CLAIM_UNSUPPORTED",
        file: status.includes(claim) ? statusPath : parity.includes(claim) ? parityPath : indexPath,
        message: `V6 docs must not claim unsupported scope: '${claim}'.`,
        severity: "error",
      });
    }
  }

  return { diagnostics, ok: diagnostics.length === 0 };
}

function isNegatedUnsupportedClaim(claim) {
  return /\b(?:not|no|never|cannot|can't|do not|does not|must not|should not)\b/i.test(claim);
}

async function readDoc(root, file, diagnostics) {
  try {
    return await readFile(resolve(root, file), "utf8");
  } catch {
    diagnostics.push({
      code: "TN_DOCS_V6_FILE_MISSING",
      file,
      message: `Required V6 documentation file '${file}' is missing.`,
      severity: "error",
    });
    return "";
  }
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await checkDocsV6();
  const payload = {
    code: result.ok ? "TN_DOCS_V6_OK" : "TN_DOCS_V6_FAILED",
    diagnostics: result.diagnostics,
    status: result.ok ? "pass" : "fail",
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write("V6 docs consistency passed.\n");
  } else {
    process.stderr.write(
      `V6 docs consistency failed with ${result.diagnostics.length} issue(s).\n${result.diagnostics
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
