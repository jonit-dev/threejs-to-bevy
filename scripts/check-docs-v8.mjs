import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const requiredV8Prds = [
  "V8-00-local-editor-scope-and-contract.md",
  "V8-01-editor-project-snapshot-and-structured-diffs.md",
  "V8-05-optional-react-webview-overlay.md",
  "V8-07-material-texture-shader-parity.md",
  "V8-13-advanced-renderer-feature-gate.md",
];

const requiredV8Phrases = [
  ["local editor", "V8 docs must define the local editor scope."],
  ["structured", "V8 docs must require structured project data."],
  ["SDK/ECS/IR", "V8 docs must keep editor data tied to SDK/ECS/IR contracts."],
  ["save/load", "V8 docs must include local save/load scope."],
  ["structured diffs", "V8 docs must require structured diffs."],
  ["bundle preview", "V8 docs must include bundle preview evidence."],
  ["offline", "V8 docs must preserve offline workflows."],
  ["diagnostics", "V8 docs must require stable diagnostics."],
  ["React webview overlay", "V8 docs must mention the optional React webview overlay scope."],
  ["retained UI", "V8 docs must keep retained UI as the portable default."],
  ["verify:v8:overlay", "V8 docs must link the overlay verification command."],
  ["verify:v8:material-parity", "V8 docs must link the material parity verification command."],
  ["advanced renderer", "V8 docs must mention the advanced renderer feature gate."],
  ["promotion criteria", "V8 docs must document advanced renderer promotion criteria."],
];

const requiredStatusPhrases = [
  ["V8 PRDs", "STATUS and parity docs must link the V8 PRD front door."],
  ["local editor", "STATUS and parity docs must mention local editor scope."],
  ["offline", "STATUS and parity docs must mention offline scope."],
  ["collaboration", "STATUS and parity docs must keep collaboration out of V8."],
  ["optional React", "STATUS and parity docs must mention the optional React overlay scope."],
  ["ui.ir.json", "STATUS and parity docs must keep retained UI as the portable UI contract."],
];

const unsupportedV8ClaimPatterns = [
  /\bV8\b[^\n.]{0,80}\b(?:supports?|includes?|promotes?|implements?|completes?|ships?|provides?)\b[^\n.]{0,80}\b(?:online|networking|replication|collaboration|presence|conflict resolution|hosted|(?:public )?plugins?(?: APIs?)?|raw Three\.js|direct Bevy(?: authoring)?)\b/gi,
  /\b(?:online|networking|replication|collaboration|presence|conflict resolution|hosted|(?:public )?plugins?(?: APIs?)?|raw Three\.js|direct Bevy(?: authoring)?)\b[^\n.]{0,80}\b(?:is|are)\b[^\n.]{0,80}\b(?:supported|implemented|complete|promoted|included|shipped|provided)\b[^\n.]{0,80}\b(?:in|by|for)\b[^\n.]{0,20}\bV8\b/gi,
];

const advancedRendererTerms =
  /(?:volumetrics?|volumetric fog|volumetric lighting|atmospheric scattering|atmospheric fog|deferred rendering|screen-space reflections|SSR|GI\/lightmaps?|global illumination|lightmaps?|storage buffers?|raw render phases?|render phases?)/i;

const advancedRendererPromotionPattern =
  /\b(?:supports?|includes?|implements?|completes?|ships?|provides?|complete|supported|implemented|promoted|shipped)\b/i;

const requiredAdvancedRendererDocs = [
  {
    path: "docs/STATUS.md",
    phrases: [
      ["V8-13", "STATUS must identify the V8-13 advanced renderer gate."],
      ["TN_IR_ADVANCED_RENDERER", "STATUS must name the stable advanced renderer diagnostic family."],
    ],
  },
  {
    path: "docs/bevy-feature-parity.md",
    phrases: [
      ["V8-13", "Parity docs must identify the V8-13 advanced renderer gate."],
      ["volumetrics", "Parity docs must keep volumetrics explicitly tracked."],
      ["storage buffers", "Parity docs must keep storage buffers explicitly tracked."],
      ["render phases", "Parity docs must keep raw render phases explicitly tracked."],
    ],
  },
  {
    path: "docs/advanced-features-roadmap.md",
    phrases: [
      ["V8-13", "Advanced features roadmap must identify the V8-13 feature gate."],
      ["promotion criteria", "Advanced features roadmap must document promotion criteria."],
      ["fail-loud diagnostics", "Advanced features roadmap must require fail-loud diagnostics."],
    ],
  },
];

export async function checkDocsV8(root = repoRoot) {
  const diagnostics = [];
  const indexPath = "docs/PRDs/v8/README.md";
  const statusPath = "docs/STATUS.md";
  const parityPath = "docs/bevy-feature-parity.md";
  const roadmapPath = "docs/ROADMAP.md";
  const advancedRoadmapPath = "docs/advanced-features-roadmap.md";

  const index = await readDoc(root, indexPath, diagnostics);
  const status = await readDoc(root, statusPath, diagnostics);
  const parity = await readDoc(root, parityPath, diagnostics);
  const roadmap = await readDoc(root, roadmapPath, diagnostics);
  const advancedRoadmap = await readDoc(root, advancedRoadmapPath, diagnostics);
  const allDocs = `${index}\n${status}\n${parity}\n${roadmap}\n${advancedRoadmap}`;
  const docContents = new Map([
    [indexPath, index],
    [statusPath, status],
    [parityPath, parity],
    [roadmapPath, roadmap],
    [advancedRoadmapPath, advancedRoadmap],
  ]);

  for (const file of requiredV8Prds) {
    if (!index.includes(file)) {
      diagnostics.push({
        code: "TN_DOCS_V8_INDEX_LINK_MISSING",
        path: indexPath,
        message: `V8 PRD index must link '${file}'.`,
        severity: "error",
      });
    }
  }

  for (const [phrase, message] of requiredV8Phrases) {
    if (!index.includes(phrase)) {
      diagnostics.push({
        code: "TN_DOCS_V8_SCOPE_PHRASE_MISSING",
        path: indexPath,
        message,
        severity: "error",
      });
    }
  }

  for (const docPath of [statusPath, parityPath]) {
    const content = docPath === statusPath ? status : parity;
    for (const [phrase, message] of requiredStatusPhrases) {
      if (!content.includes(phrase)) {
        diagnostics.push({
          code: "TN_DOCS_V8_STATUS_PARITY_SCOPE_MISSING",
          path: docPath,
          message,
          severity: "error",
        });
      }
    }
  }

  for (const pattern of unsupportedV8ClaimPatterns) {
    for (const match of allDocs.matchAll(pattern)) {
      const claim = match[0].replace(/\s+/g, " ").trim();
      diagnostics.push({
        code: "TN_DOCS_V8_SCOPE_CLAIM_UNSUPPORTED",
        path: "docs",
        message: `V8 docs must not claim unsupported scope: '${claim}'.`,
        severity: "error",
      });
    }
  }

  for (const requirement of requiredAdvancedRendererDocs) {
    const content = docContents.get(requirement.path) ?? "";
    for (const [phrase, message] of requirement.phrases) {
      if (!content.includes(phrase)) {
        diagnostics.push({
          code: "TN_DOCS_V8_ADVANCED_RENDERER_ANCHOR_MISSING",
          path: requirement.path,
          message,
          severity: "error",
        });
      }
    }
  }

  for (const [docPath, content] of [
    [statusPath, status],
    [parityPath, parity],
    [advancedRoadmapPath, advancedRoadmap],
  ]) {
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!advancedRendererTerms.test(line)) {
        return;
      }
      const isCompletedChecklist = /^\s*-\s*\[x\]/i.test(line);
      const isCompletedTableRow = line.includes("| ✅ |");
      const isPromotionClaim = advancedRendererPromotionPattern.test(line);
      const hasEvidenceAnchor = /\b(?:V8-13|verify:|artifacts\/|PRDs\/v8\/V8-13-advanced-renderer-feature-gate\.md)\b/.test(line);
      if ((isCompletedChecklist || isCompletedTableRow || isPromotionClaim) && !hasEvidenceAnchor) {
        diagnostics.push({
          code: "TN_DOCS_V8_ADVANCED_RENDERER_CLAIM_UNANCHORED",
          path: `${docPath}:${index + 1}`,
          message: "Advanced renderer completion or support claims must reference V8-13 and verification/evidence anchors.",
          severity: "error",
        });
      }
    });
  }

  return { diagnostics, ok: diagnostics.length === 0 };
}

async function readDoc(root, file, diagnostics) {
  try {
    return await readFile(resolve(root, file), "utf8");
  } catch {
    diagnostics.push({
      code: "TN_DOCS_V8_FILE_MISSING",
      path: file,
      message: `Required V8 documentation file '${file}' is missing.`,
      severity: "error",
    });
    return "";
  }
}

async function main() {
  const result = await checkDocsV8();
  const payload = {
    code: result.ok ? "TN_DOCS_V8_OK" : "TN_DOCS_V8_FAILED",
    diagnostics: result.diagnostics,
    status: result.ok ? "pass" : "fail",
  };
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write("V8 docs consistency passed.\n");
  } else {
    process.stderr.write(
      `V8 docs consistency failed with ${result.diagnostics.length} issue(s).\n${result.diagnostics
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
