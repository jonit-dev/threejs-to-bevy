import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { VerificationDiagnostic } from "./runner.js";
import { isRegisteredGate } from "./legacyAliases.js";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

export const V9_FOCUSED_SCRIPT_NAMES = [
  "verify:v9:animation-state",
  "verify:v9:animation-blending",
  "verify:v9:animation-particles",
  "verify:v9:physics-character",
  "verify:v9:assets-gltf-scene-workflow",
  "verify:v9:rendering-lights",
  "verify:v9:skeletal-animation",
];

export const V9_SAMPLE_SCENES = [
  { bundlePath: "packages/ir/fixtures/conformance/animation-state/game.bundle", domain: "animation", fixture: "animation-state", prd: "V9-01" },
  { bundlePath: "packages/ir/fixtures/conformance/physics-character/game.bundle", domain: "physics-character", fixture: "physics-character", prd: "V9-02" },
  { bundlePath: "packages/ir/fixtures/conformance/physics-character-solver/game.bundle", domain: "physics-solver", fixture: "physics-character-solver", prd: "V9-02" },
  { bundlePath: "packages/ir/fixtures/conformance/rendering-lights/game.bundle", domain: "rendering-lights", fixture: "rendering-lights", prd: "V9-04" },
];

const IMPLEMENTED_V9_PRD_FILES = new Set([
  "V9-01-animation-particles-runtime-parity.md",
  "V9-02-physics-character-runtime-parity.md",
  "V9-03-assets-gltf-scene-workflow.md",
  "V9-04-rendering-lights-post-processing-parity.md",
  "V9-07-engine-quality-control-hardening.md",
]);

export interface V9QualityGateCheckResult {
  code: "TN_CHECK_V9_QUALITY_GATES_FAILED" | "TN_CHECK_V9_QUALITY_GATES_OK";
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  status: "fail" | "pass";
}

export async function checkV9QualityGates(options: { repoRoot?: string } = {}): Promise<V9QualityGateCheckResult> {
  const root = options.repoRoot ?? repoRoot;
  const diagnostics: VerificationDiagnostic[] = [];
  const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as { scripts?: Record<string, string> };
  const scripts = packageJson.scripts ?? {};
  const hasGateDispatcher = scripts["verify:focused"] !== undefined || scripts["verify:alias"] !== undefined;
  const catalog = JSON.parse(await readFile(resolve(root, "packages/ir/fixtures/conformance/v9-fixture-catalog.json"), "utf8")) as {
    fixtures?: Array<{ bundlePath: string; id: string; ownerPrd?: string }>;
  };

  if (!hasGateDispatcher) {
    diagnostics.push({
      code: "TN_DOCS_V9_VERIFIER_UNREGISTERED",
      message: "Root package.json must define pnpm verify:focused or pnpm verify:alias for focused gate dispatch.",
      path: "package.json",
      severity: "error",
    });
  }

  if (!isRegisteredGate("check:quality:v9") && scripts["check:quality:v9"] === undefined) {
    diagnostics.push({
      code: "TN_DOCS_V9_VERIFIER_UNREGISTERED",
      message: "Root package.json must register check:quality:v9 through the focused gate dispatcher.",
      path: "package.json",
      severity: "error",
    });
  }

  for (const scriptName of V9_FOCUSED_SCRIPT_NAMES) {
    if (!isRegisteredGate(scriptName) && scripts[scriptName] === undefined) {
      diagnostics.push({
        code: "TN_DOCS_V9_VERIFIER_UNREGISTERED",
        message: `Focused V9 verifier '${scriptName}' is missing from the focused gate registry.`,
        path: `tools/verify/src/cli/run.ts#${scriptName}`,
        severity: "error",
      });
    }
  }

  for (const fixture of catalog.fixtures ?? []) {
    if (!fixture.ownerPrd) {
      diagnostics.push({
        code: "TN_DOCS_V9_FIXTURE_OWNER_MISSING",
        message: `V9 fixture '${fixture.id}' is missing ownerPrd in v9-fixture-catalog.json.`,
        path: `packages/ir/fixtures/conformance/v9-fixture-catalog.json#${fixture.id}`,
        severity: "error",
      });
    }
    const bundlePath = resolve(root, fixture.bundlePath);
    try {
      await access(bundlePath);
    } catch {
      diagnostics.push({
        code: "TN_DOCS_V9_FIXTURE_OWNER_MISSING",
        message: `V9 fixture bundle is missing for '${fixture.id}': ${fixture.bundlePath}`,
        path: fixture.bundlePath,
        severity: "error",
      });
    }
  }

  for (const sample of V9_SAMPLE_SCENES) {
    const bundlePath = resolve(root, sample.bundlePath);
    try {
      await access(bundlePath);
    } catch {
      diagnostics.push({
        code: "TN_DOCS_V9_SAMPLE_EVIDENCE_MISSING",
        message: `V9 sample fixture '${sample.fixture}' is missing bundle evidence: ${sample.bundlePath}`,
        path: sample.bundlePath,
        severity: "error",
      });
    }
  }

  const status = await readFile(resolve(root, "docs/STATUS.md"), "utf8");
  const parity = await readFile(resolve(root, "docs/bevy-feature-parity.md"), "utf8");
  const developerWorkflowPath = await firstExistingPath(root, [
    "docs/workflows/developer-workflow.md",
    "docs/developer-workflow.md",
  ]);
  const developerWorkflow = await readFile(resolve(root, developerWorkflowPath), "utf8");
  if (!status.includes("pnpm verify:release")) {
    diagnostics.push({
      code: "TN_DOCS_V9_RELEASE_COVERAGE_MISSING",
      message: "docs/STATUS.md must document pnpm verify:release as the current release gate.",
      path: "docs/STATUS.md",
      severity: "error",
    });
  }
  if (!parity.includes("pnpm verify:release")) {
    diagnostics.push({
      code: "TN_DOCS_V9_RELEASE_COVERAGE_MISSING",
      message: "docs/bevy-feature-parity.md must reference pnpm verify:release.",
      path: "docs/bevy-feature-parity.md",
      severity: "error",
    });
  }
  if (!developerWorkflow.includes("pnpm verify:release")) {
    diagnostics.push({
      code: "TN_DOCS_V9_RELEASE_COVERAGE_MISSING",
      message: "docs/developer-workflow.md must document pnpm verify:release command order.",
      path: developerWorkflowPath,
      severity: "error",
    });
  }

  for (const prdPath of await listV9Prds(root)) {
    const prdFile = prdPath.split("/").at(-1) ?? "";
    if (!IMPLEMENTED_V9_PRD_FILES.has(prdFile)) {
      continue;
    }
    const content = await readFile(prdPath, "utf8");
    const verifierMatches = [...content.matchAll(/pnpm verify:v9:[a-z0-9-]+/g)].map((match) => (match[0] ?? "").replace("pnpm ", ""));
    for (const scriptName of verifierMatches) {
      if (!isRegisteredGate(scriptName) && scripts[scriptName] === undefined) {
        diagnostics.push({
          code: "TN_DOCS_V9_VERIFIER_UNREGISTERED",
          message: `PRD '${prdPath.replace(`${root}/`, "")}' names '${scriptName}' but the focused gate registry does not register it.`,
          path: prdPath.replace(`${root}/`, ""),
          severity: "error",
        });
      }
    }
  }

  return {
    code: diagnostics.length === 0 ? "TN_CHECK_V9_QUALITY_GATES_OK" : "TN_CHECK_V9_QUALITY_GATES_FAILED",
    diagnostics,
    ok: diagnostics.length === 0,
    status: diagnostics.length === 0 ? "pass" : "fail",
  };
}

async function firstExistingPath(root: string, paths: readonly string[]): Promise<string> {
  for (const path of paths) {
    try {
      await readFile(resolve(root, path), "utf8");
      return path;
    } catch {
      // Try the next compatibility path.
    }
  }
  return paths[0] ?? "";
}

async function listV9Prds(root: string): Promise<string[]> {
  for (const dir of ["docs/PRDs/done/v9", "docs/PRDs/v9"]) {
    const absoluteDir = resolve(root, dir);
    try {
      const entries = await readdir(absoluteDir);
      return entries.filter((entry) => entry.endsWith(".md") && entry !== "README.md").map((entry) => resolve(absoluteDir, entry));
    } catch {
      // Try the next compatibility location.
    }
  }
  return [];
}
