import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkArtifactLayout } from "./check-artifact-layout.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const allowlistPath = resolve(repoRoot, "scripts/version-name-allowlist.json");

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "target",
  ".git",
  ".worktrees",
  "artifacts",
  "coverage",
  ".turbo",
  ".tn",
  "tmp",
]);

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".json",
  ".mjs",
  ".ts",
  ".tsx",
  ".rs",
  ".toml",
  ".yaml",
  ".yml",
  ".sh",
  ".css",
  ".html",
  ".svg",
  ".txt",
]);

const VERSION_PATTERNS = [
  {
    id: "future-milestone-label",
    regex: /\b[Vv]1[0-9]+\b/g,
    severity: "error",
    code: "TN_NAMES_FUTURE_MILESTONE_LABEL",
  },
  {
    id: "milestone-label",
    regex: /\b[Vv][1-9]\b/g,
    severity: "info",
    code: "TN_NAMES_MILESTONE_LABEL",
  },
  {
    id: "milestone-ticket",
    regex: /\bV[1-9]-[0-9]{2}\b/g,
    severity: "info",
    code: "TN_NAMES_MILESTONE_TICKET",
  },
  {
    id: "verify-script",
    regex: /verify:v[1-9][0-9:]*/g,
    severity: "info",
    code: "TN_NAMES_VERIFY_SCRIPT",
  },
  {
    id: "check-docs-script",
    regex: /check:docs:v[1-9]/g,
    severity: "info",
    code: "TN_NAMES_CHECK_DOCS_SCRIPT",
  },
  {
    id: "check-quality-script",
    regex: /check:quality:v[1-9]/g,
    severity: "info",
    code: "TN_NAMES_CHECK_QUALITY_SCRIPT",
  },
  {
    id: "versioned-example-path",
    regex: /(?:examples|templates)\/v[1-9]-[\w-]+/g,
    severity: "info",
    code: "TN_NAMES_VERSIONED_PATH",
  },
  {
    id: "versioned-artifact-path",
    regex: /artifacts\/v[1-9][\w/-]*/g,
    severity: "info",
    code: "TN_NAMES_ARTIFACT_PATH",
  },
  {
    id: "versioned-fixture-id",
    regex: /\bv[1-9]-[\w-]+/g,
    severity: "info",
    code: "TN_NAMES_FIXTURE_ID",
  },
];

const REQUIRED_ALLOWLIST_FIELDS = [
  "classification",
  "owner",
  "rationale",
  "policy",
];

export async function loadVersionNameAllowlist(root = repoRoot) {
  const raw = await readFile(resolve(root, "scripts/version-name-allowlist.json"), "utf8");
  return JSON.parse(raw);
}

export function validateAllowlistShape(allowlist) {
  const diagnostics = [];

  if (!Array.isArray(allowlist.validClassifications) || allowlist.validClassifications.length === 0) {
    diagnostics.push({
      code: "TN_NAMES_ALLOWLIST_INVALID",
      path: "scripts/version-name-allowlist.json",
      message: "Allowlist must define validClassifications.",
      severity: "error",
    });
    return diagnostics;
  }

  for (const rule of allowlist.pathRules ?? []) {
    for (const field of ["id", "pathPattern", ...REQUIRED_ALLOWLIST_FIELDS]) {
      if (!rule[field]) {
        diagnostics.push({
          code: "TN_NAMES_ALLOWLIST_ROW_INCOMPLETE",
          path: "scripts/version-name-allowlist.json",
          message: `Path rule '${rule.id ?? "unknown"}' is missing '${field}'.`,
          severity: "error",
        });
      }
    }

    if (
      rule.classification &&
      !allowlist.validClassifications.includes(rule.classification)
    ) {
      diagnostics.push({
        code: "TN_NAMES_ALLOWLIST_CLASSIFICATION_INVALID",
        path: "scripts/version-name-allowlist.json",
        message: `Path rule '${rule.id}' uses unknown classification '${rule.classification}'.`,
        severity: "error",
      });
    }

    try {
      // eslint-disable-next-line no-new
      new RegExp(rule.pathPattern);
    } catch (error) {
      diagnostics.push({
        code: "TN_NAMES_ALLOWLIST_PATTERN_INVALID",
        path: "scripts/version-name-allowlist.json",
        message: `Path rule '${rule.id}' has invalid regex: ${error instanceof Error ? error.message : String(error)}`,
        severity: "error",
      });
    }
  }

  return diagnostics;
}

export function classifyPath(relativePath, allowlist) {
  for (const rule of allowlist.pathRules ?? []) {
    if (new RegExp(rule.pathPattern).test(relativePath)) {
      return {
        ruleId: rule.id,
        classification: rule.classification,
        owner: rule.owner,
        rationale: rule.rationale,
        policy: rule.policy,
      };
    }
  }
  return null;
}

function isTextFile(relativePath) {
  if (relativePath.endsWith(".snapshot.json")) {
    return false;
  }
  if (relativePath === "AGENTS.md" || relativePath === "package.json") {
    return true;
  }
  const extension = relativePath.slice(relativePath.lastIndexOf("."));
  return TEXT_EXTENSIONS.has(extension);
}

async function walkFiles(rootDir, currentDir, files = []) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".github") {
      continue;
    }
    const absolutePath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) {
        continue;
      }
      await walkFiles(rootDir, absolutePath, files);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const relativePath = relative(rootDir, absolutePath).replaceAll("\\", "/");
    if (isTextFile(relativePath)) {
      files.push(relativePath);
    }
  }
  return files;
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split("\n").length;
}

function collectMatches(content, relativePath) {
  const matches = [];
  for (const pattern of VERSION_PATTERNS) {
    pattern.regex.lastIndex = 0;
    for (const match of content.matchAll(pattern.regex)) {
      if (match.index === undefined) {
        continue;
      }
      const value = match[0];
      if (shouldIgnoreMatch(content, match.index, value, relativePath)) {
        continue;
      }
      matches.push({
        value,
        line: lineNumberAt(content, match.index),
        patternId: pattern.id,
        code: pattern.code,
        severity: pattern.severity,
        path: relativePath,
      });
    }
  }
  return matches;
}

function shouldIgnoreMatch(content, index, value, relativePath = "") {
  if (/^v[1-9]-/.test(value) && /fixtures\/conformance\//.test(content)) {
    return false;
  }

  const lineStart = content.lastIndexOf("\n", index) + 1;
  const lineEnd = content.indexOf("\n", index);
  const line = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);

  if (/^\s*"version"\s*:/.test(line) && /0\.[0-9]+\.[0-9]+/.test(line)) {
    return true;
  }

  if (relativePath === "pnpm-lock.yaml" && /^\s+resolution: \{integrity:/.test(line)) {
    return true;
  }

  if (relativePath === "package-lock.json" && /^\s+"integrity":/.test(line)) {
    return true;
  }

  if (/schemas\.threenative\.local\/v[0-9]+\//.test(line)) {
    return true;
  }

  if (/\$id/.test(line) && /\/v[0-9]+\//.test(line)) {
    return true;
  }

  if (/vite|revive|dev/i.test(value)) {
    return false;
  }

  return false;
}

function isStrictFrontDoorViolation(relativePath, match, allowlist) {
  if (!allowlist.strictFrontDoorPaths?.includes(relativePath)) {
    return false;
  }
  return match.patternId === "future-milestone-label";
}

export async function checkCurrentNames(options = {}) {
  const root = options.root ?? repoRoot;
  const allowlist = options.allowlist ?? (await loadVersionNameAllowlist(root));
  const diagnostics = validateAllowlistShape(allowlist);
  const inventory = [];
  const files = await walkFiles(root, root);
  diagnostics.push(...(await checkArtifactLayout({ root })).diagnostics);
  diagnostics.push(...(await collectGameTsScaffoldDiagnostics(root)));

  for (const relativePath of files) {
    const content = await readFile(join(root, relativePath), "utf8");
    const pathClassification = classifyPath(relativePath, allowlist);
    const matches = collectMatches(content, relativePath);

    for (const match of matches) {
      const classified = pathClassification
        ? {
            ...pathClassification,
            source: "path-rule",
          }
        : null;

      inventory.push({
        ...match,
        classification: classified?.classification ?? "unclassified",
        ruleId: classified?.ruleId ?? null,
        owner: classified?.owner ?? null,
        policy: classified?.policy ?? null,
      });

      if (isStrictFrontDoorViolation(relativePath, match, allowlist)) {
        diagnostics.push({
          code: "TN_NAMES_STRICT_FRONT_DOOR_VIOLATION",
          path: relativePath,
          line: match.line,
          message: `Current docs front door '${relativePath}' must not introduce milestone label '${match.value}'.`,
          severity: "error",
        });
        continue;
      }

      if (match.patternId === "future-milestone-label" && !pathClassification) {
        diagnostics.push({
          code: match.code,
          path: relativePath,
          line: match.line,
          message: `Future milestone label '${match.value}' is not allowlisted.`,
          severity: "error",
        });
        continue;
      }

      if (!pathClassification) {
        diagnostics.push({
          code: "TN_NAMES_UNCLASSIFIED_VERSION_REF",
          path: relativePath,
          line: match.line,
          message: `Version label '${match.value}' is not covered by the naming allowlist.`,
          severity: "error",
        });
      }
    }
  }

  for (const requirement of allowlist.requiredFrontDoorPhrases ?? []) {
    const docPath = requirement.path;
    const absolutePath = join(root, docPath);
    let content = "";
    try {
      content = await readFile(absolutePath, "utf8");
    } catch {
      diagnostics.push({
        code: "TN_NAMES_FRONT_DOOR_MISSING",
        path: docPath,
        message: `Required front-door doc '${docPath}' is missing.`,
        severity: "error",
      });
      continue;
    }
    if (!content.includes(requirement.phrase)) {
      diagnostics.push({
        code: "TN_NAMES_FRONT_DOOR_PHRASE_MISSING",
        path: docPath,
        message: requirement.message,
        severity: "error",
      });
    }
  }

  const summary = summarizeInventory(inventory, allowlist);
  const ok = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length === 0;

  return {
    ok,
    diagnostics,
    inventory,
    summary,
    allowlist,
  };
}

async function collectGameTsScaffoldDiagnostics(root) {
  const diagnostics = [];
  const templateConfigs = (await walkFiles(root, resolve(root, "templates")).catch(() => []))
    .filter((relativePath) => /^templates\/[^/]+\/threenative\.config\.json$/.test(relativePath));

  for (const relativePath of templateConfigs) {
    const config = JSON.parse(await readFile(join(root, relativePath), "utf8"));
    if (config.entry === "src/game.ts" || config.entry === "src/game.tsx") {
      diagnostics.push({
        code: "TN_NAMES_GAME_TS_TEMPLATE_ENTRY",
        path: relativePath,
        message: `Template '${relativePath}' must not use '${config.entry}' as its source entry. Use structured source under content/**/*.json.`,
        severity: "error",
      });
    }
  }

  const templateGameFiles = (await walkFiles(root, resolve(root, "templates")).catch(() => []))
    .filter((relativePath) => /^templates\/[^/]+\/src\/game\.tsx?$/.test(relativePath));
  for (const relativePath of templateGameFiles) {
    diagnostics.push({
      code: "TN_NAMES_GAME_TS_TEMPLATE_FILE",
      path: relativePath,
      message: "Templates must not contain src/game.ts or src/game.tsx; scaffold source starts from content/**/*.json.",
      severity: "error",
    });
  }

  const exampleConfigs = (await walkFiles(root, resolve(root, "examples")).catch(() => []))
    .filter((relativePath) => /^examples\/[^/]+\/threenative\.config\.json$/.test(relativePath));
  for (const relativePath of exampleConfigs) {
    const config = JSON.parse(await readFile(join(root, relativePath), "utf8"));
    if (config.entry === "src/game.ts" || config.entry === "src/game.tsx") {
      diagnostics.push({
        code: "TN_NAMES_GAME_TS_EXAMPLE_ENTRY",
        path: relativePath,
        message: `Example '${relativePath}' must not use '${config.entry}' as its source entry. Use structured source under content/**/*.json or a shared fixture bundle.`,
        severity: "error",
      });
    }
  }

  const exampleGameFiles = (await walkFiles(root, resolve(root, "examples")).catch(() => []))
    .filter((relativePath) => /^examples\/[^/]+\/src\/game\.tsx?$/.test(relativePath));
  for (const relativePath of exampleGameFiles) {
    diagnostics.push({
      code: "TN_NAMES_GAME_TS_EXAMPLE_FILE",
      path: relativePath,
      message: "Examples must not contain src/game.ts or src/game.tsx; use structured source or shared conformance fixtures.",
      severity: "error",
    });
  }

  const activeScaffoldDocs = [
    "docs/workflows/ai-distribution.md",
    "docs/workflows/ai-workflows.md",
    "docs/workflows/developer-workflow.md",
    "packages/cli/src/commands/create.test.ts",
    "packages/cli/src/commands/help.ts",
    "packages/cli/src/commands/help.test.ts",
  ];
  const forbiddenPatterns = [
    /--template (?:starter|game-starter|racing-kart|v[1-9](?:-[\w-]+)?|starter-functional)\b/u,
    /default scaffold[^.\n]*src\/game\.tsx?/iu,
    /creates?[^.\n]*src\/game\.tsx?/iu,
  ];

  for (const relativePath of activeScaffoldDocs) {
    let content = "";
    try {
      content = await readFile(join(root, relativePath), "utf8");
    } catch {
      continue;
    }
    for (const pattern of forbiddenPatterns) {
      const match = pattern.exec(content);
      if (match) {
        diagnostics.push({
          code: "TN_NAMES_GAME_TS_SCAFFOLD_GUIDANCE",
          path: relativePath,
          line: lineNumberAt(content, match.index),
          message: `Active scaffold guidance must use structured-source-starter, not '${match[0]}'.`,
          severity: "error",
        });
      }
    }
  }

  return diagnostics;
}

async function collectArtifactLayoutDiagnostics(root, allowlist) {
  const diagnostics = [];
  const files = await walkAllFiles(root, root);
  for (const relativePath of files) {
    if (relativePath.startsWith("artifacts/")) {
      diagnostics.push(...diagnoseRootArtifactPath(relativePath));
      continue;
    }

    if (/^tmp\/.*\/artifacts\//.test(relativePath)) {
      diagnostics.push({
        code: "TN_ARTIFACT_LAYOUT_TMP_ARTIFACT",
        path: relativePath,
        message: `Temporary artifact '${relativePath}' must stay ignored and must not be referenced by release gates.`,
        severity: "error",
      });
      continue;
    }

    if (/^templates\/[^/]+\/artifacts\//.test(relativePath)) {
      diagnostics.push({
        code: "TN_ARTIFACT_LAYOUT_TEMPLATE_GENERATED_ARTIFACT",
        path: relativePath,
        message: `Generated template artifact '${relativePath}' must move to templates/<name>/fixtures/* if it is an intentional checked-in input.`,
        severity: "error",
      });
    }
  }

  diagnostics.push(...(await collectAgentGuidanceDiagnostics(root)));
  return diagnostics;
}

function diagnoseRootArtifactPath(relativePath) {
  return [
    {
      code: /^artifacts\/v[0-9]/.test(relativePath) || /^artifacts\/[^/]*v[0-9]/.test(relativePath)
        ? "TN_ARTIFACT_LAYOUT_VERSIONED_ROOT_ARTIFACT"
        : "TN_ARTIFACT_LAYOUT_ROOT_ARTIFACT",
      path: relativePath,
      message: `Root artifact '${relativePath}' is not allowed. Use examples/<name>/artifacts/<gate>/ for example evidence, packages/ir/artifacts/conformance/ for IR conformance, tools/verify/artifacts/<gate>/ for verifier-owned reports, or runtime-bevy/artifacts/<gate>/ for Bevy-only evidence.`,
      severity: "error",
    },
  ];
}

async function collectAgentGuidanceDiagnostics(root) {
  const diagnostics = [];
  for (const relativePath of ["AGENTS.md", "examples/AGENTS.md", "packages/AGENTS.md", "runtime-bevy/AGENTS.md"]) {
    const absolutePath = join(root, relativePath);
    let content = "";
    try {
      content = await readFile(absolutePath, "utf8");
    } catch {
      continue;
    }
    if (content.length > 12000 || content.includes("## 1. Context") || content.includes("Surface Area Inventory")) {
      diagnostics.push({
        code: "TN_ARTIFACT_LAYOUT_AGENTS_POLICY_DUPLICATED",
        path: relativePath,
        message: `${relativePath} should contain concise local layout guidance and link to docs instead of duplicating the layout PRD.`,
        severity: "error",
      });
    }
  }
  return diagnostics;
}

async function walkAllFiles(rootDir, currentDir, files = []) {
  const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "target" || entry.name === "dist") {
      continue;
    }
    const absolutePath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await walkAllFiles(rootDir, absolutePath, files);
      continue;
    }
    if (entry.isFile()) {
      files.push(relative(rootDir, absolutePath).replaceAll("\\", "/"));
    }
  }
  return files;
}

function summarizeInventory(inventory, allowlist) {
  const byClassification = new Map();
  for (const item of inventory) {
    byClassification.set(item.classification, (byClassification.get(item.classification) ?? 0) + 1);
  }

  return {
    totalOccurrences: inventory.length,
    byClassification: Object.fromEntries(byClassification.entries()),
    targetNamingMap: allowlist.targetNamingMap ?? {},
    unclassifiedCount: inventory.filter((item) => item.classification === "unclassified").length,
    strictFrontDoorPaths: allowlist.strictFrontDoorPaths ?? [],
  };
}

export function formatNamesReport(result) {
  const lines = [
    "ThreeNative version-name inventory",
    `Total occurrences: ${result.summary.totalOccurrences}`,
    `Unclassified: ${result.summary.unclassifiedCount}`,
    "",
    "By classification:",
  ];

  for (const [classification, count] of Object.entries(result.summary.byClassification).sort()) {
    lines.push(`  ${classification}: ${count}`);
  }

  if (result.summary.targetNamingMap && Object.keys(result.summary.targetNamingMap).length > 0) {
    lines.push("", "Target naming map (legacy -> canonical):");
    for (const [legacy, canonical] of Object.entries(result.summary.targetNamingMap)) {
      lines.push(`  ${legacy} -> ${canonical}`);
    }
  }

  const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (errors.length > 0) {
    lines.push("", `Errors (${errors.length}):`);
    for (const diagnostic of errors.slice(0, 50)) {
      const location = diagnostic.line ? `${diagnostic.path}:${diagnostic.line}` : diagnostic.path;
      lines.push(`  ${diagnostic.code} ${location} ${diagnostic.message}`);
    }
    if (errors.length > 50) {
      lines.push(`  ... and ${errors.length - 50} more`);
    }
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const result = await checkCurrentNames();
  process.stdout.write(formatNamesReport(result));
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}
