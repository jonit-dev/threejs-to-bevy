import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { type VerificationDiagnostic } from "./runner.js";

export type ExampleClassification =
  | "archived"
  | "benchmark-only"
  | "build-only"
  | "experimental"
  | "fixture-only"
  | "release-enrolled";

export interface ExampleManifestEntry {
  classification: ExampleClassification;
  path: string;
  reason: string;
}

export interface ExampleManifest {
  entries: ExampleManifestEntry[];
  path: string;
}

const EXAMPLE_CLASSIFICATIONS = new Set<string>([
  "archived",
  "benchmark-only",
  "build-only",
  "experimental",
  "fixture-only",
  "release-enrolled",
]);

export async function readExampleManifest(root: string): Promise<ExampleManifest | undefined> {
  const manifestPath = resolve(root, "examples/manifest.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  } catch {
    return undefined;
  }
  const entries = isRecord(parsed) && Array.isArray(parsed.examples)
    ? parsed.examples.flatMap((entry): ExampleManifestEntry[] => {
      if (!isRecord(entry) || typeof entry.path !== "string" || typeof entry.classification !== "string" || typeof entry.reason !== "string") {
        return [];
      }
      if (!EXAMPLE_CLASSIFICATIONS.has(entry.classification)) {
        return [];
      }
      return [{
        classification: entry.classification as ExampleClassification,
        path: entry.path,
        reason: entry.reason,
      }];
    })
    : [];
  return { entries, path: manifestPath };
}

export async function examplePathsByClassification(root: string, classification: ExampleClassification): Promise<string[]> {
  const manifest = await readExampleManifest(root);
  return manifest?.entries
    .filter((entry) => entry.classification === classification)
    .map((entry) => entry.path)
    .sort() ?? [];
}

export async function exampleManifestDiagnostics(root: string): Promise<VerificationDiagnostic[]> {
  const manifestPath = resolve(root, "examples/manifest.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  } catch (error) {
    return [{
      code: "TN_VERIFY_EXAMPLE_MANIFEST_MISSING",
      message: `examples/manifest.json must classify every example: ${error instanceof Error ? error.message : String(error)}.`,
      path: "examples/manifest.json",
      severity: "error",
      suggestedFix: "Add examples/manifest.json with one entry for every examples/* project.",
    }];
  }

  const diagnostics: VerificationDiagnostic[] = [];
  const entries = isRecord(parsed) && Array.isArray(parsed.examples) ? parsed.examples : undefined;
  if (entries === undefined) {
    diagnostics.push({
      code: "TN_VERIFY_EXAMPLE_MANIFEST_SHAPE",
      message: "examples/manifest.json must contain an examples array.",
      path: "examples/manifest.json#/examples",
      severity: "error",
      suggestedFix: "Set examples to an array of { path, classification, reason } entries.",
    });
    return diagnostics;
  }

  const manifestPaths = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const path = isRecord(entry) && typeof entry.path === "string" ? entry.path : undefined;
    const classification = isRecord(entry) && typeof entry.classification === "string" ? entry.classification : undefined;
    const reason = isRecord(entry) && typeof entry.reason === "string" ? entry.reason : undefined;
    const entryPath = `examples/manifest.json#/examples/${index}`;
    if (path === undefined || !path.startsWith("examples/")) {
      diagnostics.push({
        code: "TN_VERIFY_EXAMPLE_MANIFEST_PATH",
        message: `${entryPath}: example manifest entry must use an examples/<name> path.`,
        path: `${entryPath}/path`,
        severity: "error",
        suggestedFix: "Set path to the repo-relative examples/<name> directory.",
      });
      continue;
    }
    if (manifestPaths.has(path)) {
      diagnostics.push({
        code: "TN_VERIFY_EXAMPLE_MANIFEST_DUPLICATE",
        message: `${path}: example manifest entry is duplicated.`,
        path: `${entryPath}/path`,
        severity: "error",
        suggestedFix: "Keep exactly one manifest entry per example path.",
      });
    }
    manifestPaths.add(path);
    if (classification === undefined || !EXAMPLE_CLASSIFICATIONS.has(classification)) {
      diagnostics.push({
        code: "TN_VERIFY_EXAMPLE_MANIFEST_CLASSIFICATION",
        message: `${path}: example manifest classification is missing or unknown.`,
        path: `${entryPath}/classification`,
        severity: "error",
        suggestedFix: `Use one of: ${[...EXAMPLE_CLASSIFICATIONS].sort().join(", ")}.`,
      });
    }
    if (reason === undefined || reason.trim().length === 0) {
      diagnostics.push({
        code: "TN_VERIFY_EXAMPLE_MANIFEST_REASON",
        message: `${path}: example manifest reason must explain the classification.`,
        path: `${entryPath}/reason`,
        severity: "error",
        suggestedFix: "Add a short reason naming the owning gate or lifecycle policy.",
      });
    }
  }

  for (const projectPath of await exampleProjectPaths(root)) {
    if (!manifestPaths.has(projectPath)) {
      diagnostics.push({
        code: "TN_VERIFY_EXAMPLE_MANIFEST_UNCLASSIFIED",
        message: `${projectPath}: example is not classified in examples/manifest.json.`,
        path: "examples/manifest.json#/examples",
        severity: "error",
        suggestedFix: `Add an examples manifest entry for ${projectPath}.`,
      });
    }
  }
  for (const path of manifestPaths) {
    if (!(await pathExists(resolve(root, path)))) {
      diagnostics.push({
        code: "TN_VERIFY_EXAMPLE_MANIFEST_UNKNOWN_PATH",
        message: `${path}: example manifest entry points to a missing directory.`,
        path: "examples/manifest.json#/examples",
        severity: "error",
        suggestedFix: "Remove stale manifest entries or restore the example directory.",
      });
    }
  }
  return diagnostics;
}

async function exampleProjectPaths(root: string): Promise<string[]> {
  try {
    const entries = await readdir(resolve(root, "examples"), { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => `examples/${entry.name}`).sort();
  } catch {
    return [];
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
