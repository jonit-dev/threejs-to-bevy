import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveArtifactTargets } from "./artifact-paths.mjs";

import { runCommand } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";
import { V9_SAMPLE_SCENES } from "./check-v9-quality-gates.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const V9_SAMPLE_MATRIX = V9_SAMPLE_SCENES.map((sample) => ({
  bundlePath: `${sample.example}/dist/${sample.example.split("/").at(-1)}.bundle`,
  domain: sample.domain,
  example: sample.example,
  manifestPath: `${sample.example}/verification.manifest.json`,
  prd: sample.prd,
}));

export async function verifyV9SampleScenes(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const targets = resolveArtifactTargets({ gate: "sample-scenes", owner: { kind: "aggregate", name: "sample-scenes" }, root });

  const artifactDir = options.artifactDir ?? targets.absoluteDir;
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const steps = [];
  const diagnostics = [];
  const scenes = [];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    return result.exitCode === 0;
  }

  if (!(await step("build cli for sample scenes", "pnpm", ["--filter", "@threenative/cli", "build"], { timeoutMs: 120000 }))) {
    return writeSampleReport({ artifactDir, diagnostics: stepFailure(steps), ok: false, reportPath, scenes, steps });
  }

  for (const sample of V9_SAMPLE_MATRIX) {
    const projectPath = resolve(root, sample.example);
    const bundlePath = resolve(root, sample.bundlePath);
    const manifestPath = resolve(root, sample.manifestPath);
    if (!(await step(`build ${sample.domain} sample`, process.execPath, [resolve(root, "packages/cli/dist/index.js"), "build", "--project", projectPath, "--json"], { timeoutMs: 120000 }))) {
      return writeSampleReport({ artifactDir, diagnostics: stepFailure(steps), ok: false, reportPath, scenes, steps });
    }
    if (!(await step(`validate ${sample.domain} sample`, process.execPath, [resolve(root, "packages/cli/dist/index.js"), "validate", "--project", projectPath, "--json"], { timeoutMs: 120000 }))) {
      return writeSampleReport({ artifactDir, diagnostics: stepFailure(steps), ok: false, reportPath, scenes, steps });
    }

    try {
      await access(bundlePath);
    } catch {
      diagnostics.push({
        code: "TN_VERIFY_V9_SAMPLE_ARTIFACT_MISSING",
        domain: sample.domain,
        message: `Sample scene bundle is missing for '${sample.example}': ${sample.bundlePath}`,
        path: sample.bundlePath,
        severity: "error",
      });
      return writeSampleReport({ artifactDir, diagnostics, ok: false, reportPath, scenes, steps });
    }

    try {
      await access(manifestPath);
    } catch {
      diagnostics.push({
        code: "TN_VERIFY_V9_SAMPLE_ARTIFACT_MISSING",
        domain: sample.domain,
        message: `Sample scene verification manifest is missing: ${sample.manifestPath}`,
        path: sample.manifestPath,
        severity: "error",
      });
      return writeSampleReport({ artifactDir, diagnostics, ok: false, reportPath, scenes, steps });
    }

    const manifest = JSON.parse(await (await import("node:fs/promises")).readFile(manifestPath, "utf8"));
    const validateBundle = (await import(pathToFileURL(resolve(root, "packages/ir/dist/validate.js")).href)).validateBundle;
    const validation = await validateBundle(bundlePath);
    if (!validation.ok) {
      diagnostics.push({
        code: "TN_VERIFY_V9_SAMPLE_BUNDLE_INVALID",
        domain: sample.domain,
        message: `Sample scene bundle failed validation for '${sample.example}'.`,
        path: sample.bundlePath,
        severity: "error",
      });
      return writeSampleReport({ artifactDir, diagnostics, ok: false, reportPath, scenes, steps });
    }

    scenes.push({
      bundlePath: sample.bundlePath,
      deferred: manifest.deferred ?? [],
      domain: sample.domain,
      example: sample.example,
      promoted: manifest.promoted ?? [],
      status: "pass",
    });
  }

  return writeSampleReport({ artifactDir, diagnostics, ok: diagnostics.length === 0, reportPath, scenes, steps });
}

function stepFailure(steps) {
  const failed = steps.find((step) => step.exitCode !== 0);
  return failed === undefined
    ? []
    : [
        {
          code: "TN_VERIFY_V9_SAMPLE_STEP_FAILED",
          message: `V9 sample scene verification failed at '${failed.name}'.`,
          severity: "error",
          step: failed.name,
        },
      ];
}

async function writeSampleReport({ artifactDir, diagnostics, ok, reportPath, scenes, steps }) {
  await mkdir(artifactDir, { recursive: true });
  const report = {
    code: ok ? "TN_VERIFY_V9_SAMPLE_SCENES_OK" : "TN_VERIFY_V9_SAMPLE_SCENES_FAILED",
    diagnostics,
    generatedBy: "scripts/verify-v9-sample-scenes.mjs",
    ok,
    scenes,
    status: ok ? "pass" : "fail",
    steps,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, ok, reportPath };
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyV9SampleScenes();
  if (json) {
    process.stdout.write(`${JSON.stringify({ ok: result.ok, reportPath: result.reportPath, status: result.status }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`V9 sample scenes passed. Report: ${result.reportPath}\n`);
  } else {
    process.stderr.write(`V9 sample scenes failed. Report: ${result.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
