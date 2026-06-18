import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { VerificationDiagnostic } from "./runner.js";

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
  { domain: "animation", example: "examples/v9-skeletal-animation", prd: "V9-01" },
  { domain: "physics-character", example: "examples/physics-character", prd: "V9-02" },
  { domain: "assets-gltf-workflow", example: "examples/assets-gltf-scene-workflow", prd: "V9-03" },
  { domain: "rendering-lights", example: "examples/rendering-lights", prd: "V9-04" },
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
  const verifyV9Script = scripts["verify:v9"] ?? "";
  const catalog = JSON.parse(await readFile(resolve(root, "packages/ir/fixtures/conformance/v9-fixture-catalog.json"), "utf8")) as {
    fixtures?: Array<{ bundlePath: string; id: string; ownerPrd?: string }>;
  };

  const verifyV9Registered = verifyV9Script.includes("verify-v9.mjs") || verifyV9Script.includes("legacy-script-alias.mjs verify:v9");

  if (!verifyV9Registered) {
    diagnostics.push({
      code: "TN_DOCS_V9_VERIFIER_UNREGISTERED",
      message: "Root package.json must register pnpm verify:v9 as a direct gate or legacy compatibility alias.",
      path: "package.json",
      severity: "error",
    });
  }

  if (!scripts["check:quality:v9"]?.includes("check-v9-quality-gates.mjs")) {
    diagnostics.push({
      code: "TN_DOCS_V9_VERIFIER_UNREGISTERED",
      message: "Root package.json must register pnpm check:quality:v9.",
      path: "package.json",
      severity: "error",
    });
  }

  for (const scriptName of V9_FOCUSED_SCRIPT_NAMES) {
    if (scripts[scriptName] === undefined) {
      diagnostics.push({
        code: "TN_DOCS_V9_VERIFIER_UNREGISTERED",
        message: `Focused V9 verifier '${scriptName}' is missing from package.json scripts.`,
        path: `package.json#scripts.${scriptName}`,
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
    const manifestPath = resolve(root, sample.example, "verification.manifest.json");
    try {
      await access(manifestPath);
    } catch {
      diagnostics.push({
        code: "TN_DOCS_V9_SAMPLE_EVIDENCE_MISSING",
        message: `V9 sample scene '${sample.example}' is missing verification.manifest.json.`,
        path: `${sample.example}/verification.manifest.json`,
        severity: "error",
      });
    }
    const packagePath = resolve(root, sample.example, "package.json");
    try {
      await access(packagePath);
    } catch {
      diagnostics.push({
        code: "TN_DOCS_V9_SAMPLE_EVIDENCE_MISSING",
        message: `V9 sample scene '${sample.example}' is missing package.json.`,
        path: `${sample.example}/package.json`,
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
      if (scripts[scriptName] === undefined) {
        diagnostics.push({
          code: "TN_DOCS_V9_VERIFIER_UNREGISTERED",
          message: `PRD '${prdPath.replace(`${root}/`, "")}' names '${scriptName}' but package.json does not register it.`,
          path: prdPath.replace(`${root}/`, ""),
          severity: "error",
        });
      }
    }
  }

  let readme = "";
  try {
    readme = await readFile(resolve(root, "examples/v9-skeletal-animation/README.md"), "utf8");
  } catch {
    diagnostics.push({
      code: "TN_DOCS_V9_SAMPLE_EVIDENCE_MISSING",
      message: "examples/v9-skeletal-animation/README.md must document GLB provenance.",
      path: "examples/v9-skeletal-animation/README.md",
      severity: "error",
    });
  }
  for (const phrase of ["source", "license", "sha256", "clip"]) {
    if (readme && !readme.toLowerCase().includes(phrase)) {
      diagnostics.push({
        code: "TN_DOCS_V9_SAMPLE_EVIDENCE_MISSING",
        message: `examples/v9-skeletal-animation/README.md must document GLB provenance including '${phrase}'.`,
        path: "examples/v9-skeletal-animation/README.md",
        severity: "error",
      });
      break;
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
