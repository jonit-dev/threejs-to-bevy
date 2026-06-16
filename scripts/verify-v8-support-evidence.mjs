import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCommand } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const v8Evidence = [
  {
    id: "V8-00",
    prdPath: "docs/PRDs/v8/V8-00-local-editor-scope-and-contract.md",
    reportPaths: [],
    screenshotPaths: [],
    remainingGaps: ["Release-wide V8 aggregate gate is not promoted."],
  },
  {
    id: "V8-01",
    prdPath: "docs/PRDs/v8/V8-01-editor-project-snapshot-and-structured-diffs.md",
    reportPaths: [],
    screenshotPaths: [],
    remainingGaps: ["Visual editor UI and inspector panels remain future work."],
  },
  {
    id: "V8-04",
    prdPath: "docs/PRDs/v8/V8-04-portable-procedural-mesh-authoring.md",
    command: ["node", ["scripts/verify-v8-procedural-mesh.mjs", "--json"]],
    reportPaths: ["artifacts/v8/procedural-mesh/verification-report.json"],
    screenshotPaths: [
      "artifacts/v8/procedural-mesh/web.png",
      "artifacts/v8/procedural-mesh/bevy.png",
      "artifacts/v8/procedural-mesh/contact-sheet.png",
    ],
    remainingGaps: ["Runtime deformation, CSG, chunk streaming, and shader/storage-buffer procedural geometry remain future work."],
  },
  {
    id: "V8-05",
    prdPath: "docs/PRDs/v8/V8-05-optional-react-webview-overlay.md",
    command: ["node", ["scripts/verify-v8-overlay-webview.mjs", "--json"]],
    reportPaths: ["artifacts/v8-overlay-webview/verification-report.json"],
    screenshotPaths: [],
    remainingGaps: ["Broad manually inspected desktop webview packaging remains incomplete."],
  },
  {
    id: "V8-06",
    prdPath: "docs/PRDs/v8/V8-06-camera-helpers-multi-view-and-render-targets.md",
    command: ["node", ["scripts/verify-v8-camera-views.mjs", "--json"]],
    reportPaths: ["artifacts/v8/camera-views/verification-report.json"],
    screenshotPaths: [
      "artifacts/v8/camera-views/web.png",
      "artifacts/v8/camera-views/bevy.png",
      "artifacts/v8/camera-views/contact-sheet.png",
    ],
    remainingGaps: ["Future camera work is residual editor/debug tooling, diagnostics, and advanced renderer integrations."],
  },
  {
    id: "V8-07",
    prdPath: "docs/PRDs/v8/V8-07-material-texture-shader-parity.md",
    command: ["node", ["scripts/verify-v8-material-parity.mjs", "--json"]],
    reportPaths: ["artifacts/v8/material-parity/verification-report.json"],
    screenshotPaths: [
      "artifacts/v8/material-parity/web.png",
      "artifacts/v8/material-parity/bevy.png",
      "artifacts/v8/material-parity/contact-sheet.png",
    ],
    remainingGaps: ["Advanced blend parity on Bevy, native specular texture rendering, custom shader surfaces, and broader extended-material catalogs remain incomplete."],
  },
  {
    id: "V8-08",
    prdPath: "docs/PRDs/v8/V8-08-animation-controls-transform-animation-and-particles.md",
    reportPaths: [],
    screenshotPaths: [],
    remainingGaps: ["Not evaluated by the V8-18 support-evidence slice; use the owning PRD verifier/evidence."],
  },
  {
    id: "V8-09",
    prdPath: "docs/PRDs/v8/V8-09-rigid-body-character-interaction-and-navigation.md",
    reportPaths: [],
    screenshotPaths: [],
    remainingGaps: ["Not evaluated by the V8-18 support-evidence slice; use the owning PRD verifier/evidence."],
  },
  {
    id: "V8-10",
    prdPath: "docs/PRDs/v8/V8-10-asset-load-sync-gltf-scene-access-and-inspection.md",
    reportPaths: [],
    screenshotPaths: [],
    remainingGaps: ["Not evaluated by the V8-18 support-evidence slice; use the owning PRD verifier/evidence."],
  },
  {
    id: "V8-11",
    prdPath: "docs/PRDs/v8/V8-11-rendering-atmosphere-post-processing-parity.md",
    reportPaths: [],
    screenshotPaths: [],
    remainingGaps: ["Not evaluated by the V8-18 support-evidence slice; use the owning PRD verifier/evidence."],
  },
  {
    id: "V8-12",
    prdPath: "docs/PRDs/v8/V8-12-lights-shadows-environment-probes.md",
    reportPaths: [],
    screenshotPaths: [],
    remainingGaps: ["Not evaluated by the V8-18 support-evidence slice; use the owning PRD verifier/evidence."],
  },
  {
    id: "V8-13",
    prdPath: "docs/PRDs/v8/V8-13-advanced-renderer-feature-gate.md",
    reportPaths: [],
    screenshotPaths: [],
    remainingGaps: ["Not evaluated by the V8-18 support-evidence slice; use the owning PRD verifier/evidence."],
  },
  {
    id: "V8-14",
    prdPath: "docs/PRDs/v8/V8-14-input-picking-controls-hardening.md",
    reportPaths: [],
    screenshotPaths: [],
    remainingGaps: ["Not evaluated by the V8-18 support-evidence slice; use the owning PRD verifier/evidence."],
  },
  {
    id: "V8-15",
    prdPath: "docs/PRDs/v8/V8-15-rich-ui-text-accessibility-residuals.md",
    reportPaths: [],
    screenshotPaths: [],
    remainingGaps: ["Not evaluated by the V8-18 support-evidence slice; use the owning PRD verifier/evidence."],
  },
  {
    id: "V8-16",
    prdPath: "docs/PRDs/v8/V8-16-spatial-audio-mixer-and-music-transitions.md",
    reportPaths: [],
    screenshotPaths: [],
    remainingGaps: ["Not evaluated by the V8-18 support-evidence slice; use the owning PRD verifier/evidence."],
  },
  {
    id: "V8-17",
    prdPath: "docs/PRDs/v8/V8-17-portable-save-slots-settings-local-data.md",
    reportPaths: [],
    screenshotPaths: [],
    remainingGaps: ["Not evaluated by the V8-18 support-evidence slice; use the owning PRD verifier/evidence."],
  },
  {
    id: "V8-18",
    prdPath: "docs/PRDs/v8/V8-18-editor-debugging-diagnostics-packaging-performance-support.md",
    reportPaths: ["artifacts/v8/support-evidence/verification-report.json"],
    screenshotPaths: [],
    remainingGaps: [
      "Scene hierarchy/property inspector panels are not proven by this support slice.",
      "Asset preview and scene viewer tools are not proven by this support slice.",
      "Debug draw, FPS overlay, and custom in-app diagnostics are not proven by this support slice.",
      "Broader package repair hints and unsupported networking/websocket/replication diagnostics remain open.",
      "Large-scene stress fixtures and profiler captures remain open.",
    ],
  },
];

export async function verifyV8SupportEvidence(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const artifactDir = options.artifactDir ?? resolve(root, "artifacts/v8/support-evidence");
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const runPrdVerifiers = options.runPrdVerifiers ?? false;
  const startedAt = new Date();
  const startedAtMs = Date.now();
  const steps = [];

  const docsResult = await run({
    args: [resolve(root, "scripts/check-docs-v8.mjs"), "--json"],
    command: process.execPath,
    cwd: root,
    name: "check v8 docs",
    timeoutMs: 60000,
  });
  steps.push({ ...summarize(docsResult), name: "check v8 docs" });

  if (runPrdVerifiers) {
    const prebuildResult = await run({
      args: ["--filter", "@threenative/cli...", "build"],
      command: "pnpm",
      cwd: root,
      name: "build verifier dependencies",
      timeoutMs: 180000,
    });
    steps.push({ ...summarize(prebuildResult), name: "build verifier dependencies" });
    if (prebuildResult.exitCode === 0) {
      for (const evidence of v8Evidence) {
        if (evidence.command === undefined) {
          continue;
        }
        const [command, args] = evidence.command;
        const result = await run({
          args,
          command: command === "node" ? process.execPath : command,
          cwd: root,
          name: `run ${evidence.id} focused verifier`,
          timeoutMs: 180000,
        });
        steps.push({ ...summarize(result), name: `run ${evidence.id} focused verifier` });
      }
    }
  }

  const artifactInventory = await inventoryEvidence(root);
  const missingArtifacts = collectMissingArtifacts(artifactInventory, reportPath);
  const inventoryStep = {
    durationMs: artifactInventory.durationMs,
    exitCode: missingArtifacts.length === 0 ? 0 : 1,
    name: "inventory v8 support evidence",
    stderr: missingArtifacts.map((artifact) => artifact.path).join("\n"),
    stdout: reportPath,
  };
  steps.push(inventoryStep);

  const ok = docsResult.exitCode === 0 && missingArtifacts.length === 0 && (!runPrdVerifiers || steps.every((step) => step.exitCode === 0));
  return writeReport({
    artifactDir,
    artifactInventory,
    missingArtifacts,
    ok,
    reportPath,
    runPrdVerifiers,
    startedAt,
    startedAtMs,
    steps,
  });
}

async function inventoryEvidence(root) {
  const startedAtMs = Date.now();
  const prds = [];
  for (const evidence of v8Evidence) {
    const reportPaths = await Promise.all(evidence.reportPaths.map((path) => checkPath(root, path)));
    const screenshotPaths = await Promise.all(evidence.screenshotPaths.map((path) => checkPath(root, path)));
    prds.push({
      command: evidence.command === undefined ? undefined : [evidence.command[0], ...evidence.command[1]].join(" "),
      id: evidence.id,
      prdPath: resolve(root, evidence.prdPath),
      remainingGaps: evidence.remainingGaps,
      reportPaths,
      screenshotPaths,
    });
  }
  return {
    durationMs: Date.now() - startedAtMs,
    prds,
  };
}

async function checkPath(root, path) {
  const absolutePath = resolve(root, path);
  let exists = true;
  try {
    await access(absolutePath);
  } catch {
    exists = false;
  }
  return { exists, path: absolutePath };
}

function collectMissingArtifacts(artifactInventory, reportPath) {
  const requiredArtifacts = artifactInventory.prds.flatMap((prd) =>
    [...prd.reportPaths, ...prd.screenshotPaths].map((artifact) => ({ ...artifact, prdId: prd.id })),
  );
  return requiredArtifacts.filter((artifact) => artifact.path !== reportPath && !artifact.exists);
}

async function writeReport({ artifactDir, artifactInventory, missingArtifacts, ok, reportPath, runPrdVerifiers, startedAt, startedAtMs, steps }) {
  await mkdir(artifactDir, { recursive: true });
  const failedStep = steps.find((step) => step.exitCode !== 0);
  const diagnostics = [];
  if (failedStep !== undefined) {
    diagnostics.push({
      code: "TN_VERIFY_V8_SUPPORT_EVIDENCE_STEP_FAILED",
      message: `V8 support evidence verification failed at '${failedStep.name}'.`,
      path: `steps.${steps.indexOf(failedStep)}`,
      severity: "error",
      step: failedStep.name,
    });
  }
  if (missingArtifacts.length > 0) {
    diagnostics.push({
      artifacts: missingArtifacts.map(({ exists, ...artifact }) => artifact),
      code: "TN_VERIFY_V8_SUPPORT_EVIDENCE_ARTIFACT_MISSING",
      message: `V8 support evidence is missing ${missingArtifacts.length} required artifact${missingArtifacts.length === 1 ? "" : "s"}.`,
      path: "evidence",
      severity: "error",
    });
  }
  const evidence = artifactInventory.prds.map((prd) => ({
    ...prd,
    reportPaths: prd.reportPaths.map((artifact) => (artifact.path === reportPath ? { ...artifact, exists: true } : artifact)),
  }));
  const report = {
    artifacts: {
      reportPath,
    },
    code: ok ? "TN_VERIFY_V8_SUPPORT_EVIDENCE_OK" : "TN_VERIFY_V8_SUPPORT_EVIDENCE_FAILED",
    diagnostics,
    durationMs: Date.now() - startedAtMs,
    evidence,
    mode: runPrdVerifiers ? "run-prd-verifiers" : "inventory",
    schema: "threenative.verify.v8-support-evidence",
    status: ok ? "pass" : "fail",
    startedAt: startedAt.toISOString(),
    steps,
    version: "0.1.0",
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, ok, reportPath };
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyV8SupportEvidence({
    runPrdVerifiers: process.argv.includes("--run-prd-verifiers"),
  });
  if (json) {
    process.stdout.write(`${JSON.stringify({ code: result.code, reportPath: result.reportPath, status: result.status, steps: result.steps }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`V8 support evidence inventory passed. Report: ${result.reportPath}\n`);
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(`V8 support evidence inventory failed at '${failed?.name ?? "unknown"}'. Report: ${result.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
