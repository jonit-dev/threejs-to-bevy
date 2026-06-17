import { readFile } from "node:fs/promises";
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

export function formatDocsReport(result: DocsCheckResult): string {
  if (result.ok) {
    return "Docs consistency passed.\n";
  }
  return `Docs consistency failed with ${result.diagnostics.length} issue(s).\n${result.diagnostics
    .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
    .join("\n")}\n`;
}
