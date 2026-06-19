import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import type { VerificationDiagnostic } from "./runner.js";

export interface DocsCheckResult {
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
}

export async function checkDocs(root: string): Promise<DocsCheckResult> {
  const diagnostics: VerificationDiagnostic[] = [];
  const statusPath = resolve(root, "docs/STATUS.md");
  const readmePath = resolve(root, "docs/README.md");
  const packageJsonPath = resolve(root, "package.json");

  let status = "";
  let readme = "";
  let packageJson = "";

  try {
    status = await readFile(statusPath, "utf8");
  } catch {
    diagnostics.push({
      code: "TN_DOCS_STATUS_MISSING",
      message: "docs/STATUS.md is missing.",
      path: "docs/STATUS.md",
      severity: "error",
    });
  }

  try {
    readme = await readFile(readmePath, "utf8");
  } catch {
    diagnostics.push({
      code: "TN_DOCS_README_MISSING",
      message: "docs/README.md is missing.",
      path: "docs/README.md",
      severity: "error",
    });
  }

  try {
    packageJson = await readFile(packageJsonPath, "utf8");
  } catch {
    diagnostics.push({
      code: "TN_DOCS_PACKAGE_JSON_MISSING",
      message: "package.json is missing.",
      path: "package.json",
      severity: "error",
    });
  }

  for (const [path, content, phrase, message] of [
    [readmePath, readme, "cleanup-versioned-debt.md", "docs/README.md must link the versioned-debt cleanup PRD."],
    [statusPath, status, "cleanup-versioned-debt.md", "docs/STATUS.md must link the versioned-debt cleanup PRD."],
    [statusPath, status, "legacy milestone", "docs/STATUS.md must state that version labels are legacy milestone names."],
    [statusPath, status, "verify:release", "docs/STATUS.md must name the current release gate script."],
    [readmePath, readme, "verify:release", "docs/README.md must reference the current release gate script."],
  ] as const) {
    if (content && !content.includes(phrase)) {
      diagnostics.push({
        code: "TN_DOCS_FRONT_DOOR_PHRASE_MISSING",
        message,
        path,
        severity: "error",
      });
    }
  }

  if (packageJson && !packageJson.includes('"verify:release"')) {
    diagnostics.push({
      code: "TN_DOCS_RELEASE_SCRIPT_MISSING",
      message: "package.json must define the verify:release script.",
      path: "package.json",
      severity: "error",
    });
  }

  if (packageJson && !packageJson.includes('"check:docs"')) {
    diagnostics.push({
      code: "TN_DOCS_CHECK_SCRIPT_MISSING",
      message: "package.json must define the check:docs script.",
      path: "package.json",
      severity: "error",
    });
  }

  if (packageJson && !packageJson.includes('"verify:focused"')) {
    diagnostics.push({
      code: "TN_DOCS_RELEASE_SCRIPT_MISSING",
      message: "package.json must define verify:focused for capability gate dispatch.",
      path: "package.json",
      severity: "error",
    });
  }

  diagnostics.push(...(await checkDocsLayout(root, readme, status)));

  // @ts-expect-error legacy mjs gate consumed during typed-tools migration
  const namesModule = (await import("../../../scripts/check-current-names.mjs")) as {
    checkCurrentNames: (options?: { root?: string }) => Promise<{
      diagnostics: Array<{ code: string; message: string; path?: string; severity: string }>;
      ok: boolean;
    }>;
  };
  const namesResult = await namesModule.checkCurrentNames({ root });
  for (const diagnostic of namesResult.diagnostics.filter((entry: { severity: string }) => entry.severity === "error")) {
    diagnostics.push({
      code: diagnostic.code,
      message: diagnostic.message,
      path: diagnostic.path,
      severity: "error",
    });
  }

  return { diagnostics, ok: diagnostics.length === 0 };
}

const REQUIRED_DOC_GROUPS = [
  "architecture",
  "contracts",
  "runtime",
  "workflows",
  "status",
  "PRDs",
];

const APPROVED_ROOT_DOCS = new Set([
  "README.md",
  "STATUS.md",
  "bevy-feature-parity.md",
  "verify-v3.md",
  "verify-v4.md",
  "verify-v5.md",
  "verify-v6.md",
  "verify-v7.md",
  "verify-v8-procedural-mesh.md",
  "visual-parity-policy.md",
]);

async function checkDocsLayout(root: string, readme: string, status: string): Promise<VerificationDiagnostic[]> {
  const diagnostics: VerificationDiagnostic[] = [];

  for (const group of REQUIRED_DOC_GROUPS) {
    const groupReadme = `docs/${group}/README.md`;
    if (!(await exists(resolve(root, groupReadme)))) {
      diagnostics.push({
        code: "TN_DOCS_GROUP_INDEX_MISSING",
        message: `Required docs group index '${groupReadme}' is missing.`,
        path: groupReadme,
        severity: "error",
      });
    }
    if (readme && !readme.includes(`${group}/README.md`)) {
      diagnostics.push({
        code: "TN_DOCS_GROUP_INDEX_UNLINKED",
        message: `docs/README.md must link '${groupReadme}'.`,
        path: "docs/README.md",
        severity: "error",
      });
    }
  }

  const workflow = await readOptional(resolve(root, "docs/workflows/developer-workflow.md"));
  for (const phrase of [
    "examples/<name>/artifacts/<gate>/",
    "examples/<name>/dist/*",
    "tools/verify/artifacts/<gate>/",
    "packages/ir/artifacts/conformance/",
    "packages/ir/fixtures/*",
    "runtime-bevy/artifacts/<gate>/",
    "Fixtures are stable inputs",
    "Generated artifacts are outputs",
    "tools/verify/src",
    "tools/verify/src/cli/run.ts",
    "scripts/` is wrapper-only",
  ]) {
    if (!workflow.includes(phrase)) {
      diagnostics.push({
        code: "TN_DOCS_ARTIFACT_POLICY_MISSING",
        message: `docs/workflows/developer-workflow.md must document '${phrase}'.`,
        path: "docs/workflows/developer-workflow.md",
        severity: "error",
      });
    }
  }

  const rootDocEntries = await readdir(resolve(root, "docs"), { withFileTypes: true }).catch(() => []);
  for (const entry of rootDocEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }
    if (!APPROVED_ROOT_DOCS.has(entry.name)) {
      diagnostics.push({
        code: "TN_DOCS_FLAT_PAGE_UNCLASSIFIED",
        message: `Root docs page 'docs/${entry.name}' must move into a contextual docs group or be added as an approved compatibility page.`,
        path: `docs/${entry.name}`,
        severity: "error",
      });
    }
  }

  const prdReadme = await readOptional(resolve(root, "docs/PRDs/README.md"));
  for (const link of markdownLinks(prdReadme)) {
    if (link.startsWith("http") || link.startsWith("#")) {
      continue;
    }
    const target = resolve(root, "docs/PRDs", link.split("#")[0] ?? "");
    if (!(await exists(target))) {
      diagnostics.push({
        code: "TN_DOCS_PRD_LINK_BROKEN",
        message: `docs/PRDs/README.md links to missing '${link}'.`,
        path: "docs/PRDs/README.md",
        severity: "error",
      });
    }
  }

  if (status && /artifacts\/v(?:8|9|10)\/(?:camera-views|rendering-lights|assets-gltf-scene-workflow|visual-calibration)/.test(status)) {
    diagnostics.push({
      code: "TN_DOCS_ROOT_EXAMPLE_ARTIFACT_REFERENCE",
      message: "docs/STATUS.md must use example-local paths for focused example evidence and root artifacts only for aggregate or legacy/archive evidence.",
      path: "docs/STATUS.md",
      severity: "error",
    });
  }

  return diagnostics;
}

function markdownLinks(content: string): string[] {
  return [...content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1] ?? "");
}

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    const result = await stat(path);
    return result.isFile() || result.isDirectory();
  } catch {
    return false;
  }
}

export function formatDocsReport(result: DocsCheckResult): string {
  if (result.ok) {
    return "Docs consistency passed.\n";
  }
  return `Docs consistency failed with ${result.diagnostics.length} issue(s).\n${result.diagnostics
    .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
    .join("\n")}\n`;
}
