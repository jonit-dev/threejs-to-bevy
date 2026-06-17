import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const V9_VISUAL_SCENES = [
  {
    bundlePath: "examples/v9-skeletal-animation/dist/v9-skeletal-animation.bundle",
    fallbackBundlePath: "packages/ir/fixtures/conformance/v9-animation-blending/game.bundle",
    id: "skeletal-animation",
    mode: "motion-smoke",
  },
  {
    bundlePath: "packages/ir/fixtures/conformance/basic-scene/game.bundle",
    id: "animation-particles",
    mode: "smoke-only",
  },
  {
    bundlePath: "examples/physics-character/dist/physics-character.bundle",
    fallbackBundlePath: "packages/ir/fixtures/conformance/v9-physics-character/game.bundle",
    id: "physics-character",
    mode: "smoke-only",
  },
  {
    bundlePath: "examples/assets-gltf-scene-workflow/dist/assets-gltf-scene-workflow.bundle",
    fallbackBundlePath: "packages/ir/fixtures/conformance/v5-drift-surface/game.bundle",
    id: "assets-gltf-workflow",
    mode: "smoke-only",
  },
  {
    bundlePath: "packages/ir/fixtures/conformance/v9-skybox-environment/game.bundle",
    id: "rendering-lights",
    mode: "region-parity",
    regions: [
      { height: 0.18, width: 0.64, x: 0.18, y: 0.03 },
      { height: 0.24, width: 0.2, x: 0.4, y: 0.36 },
    ],
  },
];

export async function resolveSceneBundle(root, scene) {
  const primary = resolve(root, scene.bundlePath);
  try {
    await access(primary);
    return primary;
  } catch {
    if (scene.fallbackBundlePath === undefined) {
      throw new Error(`Visual matrix bundle missing for '${scene.id}': ${scene.bundlePath}`);
    }
    return resolve(root, scene.fallbackBundlePath);
  }
}

export async function verifyV9VisualMatrixGate(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const artifactDir = options.artifactDir ?? resolve(root, "artifacts/v9/visual-matrix");
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const { verifyV9VisualMatrix } = await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/v9VisualMatrix.js")).href);
  const scenes = [];
  for (const scene of V9_VISUAL_SCENES) {
    scenes.push({
      artifactDir: resolve(artifactDir, scene.id),
      bundlePath: await resolveSceneBundle(root, scene),
      id: scene.id,
      mode: scene.mode,
      ...(scene.regions === undefined ? {} : { regions: scene.regions }),
    });
  }
  const matrix = await verifyV9VisualMatrix(scenes);
  const artifactDiagnostics = await validateVisualArtifacts(artifactDir, scenes);
  const diagnostics = [...matrix.diagnostics, ...artifactDiagnostics];
  const ok = diagnostics.length === 0 && matrix.status === "pass";
  const report = {
    artifacts: {
      contactSheetPath: resolve(artifactDir, "contact-sheet.png"),
      reportPath,
      scenes: Object.fromEntries(
        scenes.map((scene) => [
          scene.id,
          {
            bevyScreenshotPath: resolve(artifactDir, scene.id, "bevy.png"),
            contactSheetPath: resolve(artifactDir, scene.id, "contact-sheet.png"),
            diffPath: resolve(artifactDir, scene.id, "diff.png"),
            reportPath: resolve(artifactDir, scene.id, "scene-report.json"),
            webScreenshotPath: resolve(artifactDir, scene.id, "web.png"),
          },
        ]),
      ),
    },
    code: ok ? "TN_VERIFY_V9_VISUAL_MATRIX_OK" : "TN_VERIFY_V9_VISUAL_MATRIX_FAILED",
    diagnostics,
    generatedBy: "scripts/verify-v9-visual-matrix.mjs",
    matrix,
    ok,
    status: ok ? "pass" : "fail",
  };
  await mkdir(artifactDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, reportPath };
}

export async function validateVisualArtifacts(artifactDir, scenes) {
  const diagnostics = [];
  for (const scene of scenes) {
    const required =
      scene.mode === "motion-smoke"
        ? [
            ["contactSheetPath", resolve(artifactDir, scene.id, "contact-sheet.png")],
            ["reportPath", resolve(artifactDir, scene.id, "skeletal-animation-report.json")],
          ]
        : [
            ["webScreenshotPath", resolve(artifactDir, scene.id, "web.png")],
            ["bevyScreenshotPath", resolve(artifactDir, scene.id, "bevy.png")],
            ["diffPath", resolve(artifactDir, scene.id, "diff.png")],
            ["contactSheetPath", resolve(artifactDir, scene.id, "contact-sheet.png")],
            ["reportPath", resolve(artifactDir, scene.id, "scene-report.json")],
          ];
    for (const [key, path] of required) {
      const exists = await artifactExists(path);
      if (!exists) {
        diagnostics.push({
          artifactPath: path.replace(`${artifactDir}/`, ""),
          code: "TN_VERIFY_V9_ARTIFACT_MISSING",
          message: `Required V9 visual matrix artifact '${key}' is missing for scene '${scene.id}': ${path}`,
          path,
          severity: "error",
        });
      }
    }
  }
  return diagnostics;
}

async function artifactExists(path) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await access(path);
      return true;
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
  }
  return false;
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyV9VisualMatrixGate();
  if (json) {
    process.stdout.write(`${JSON.stringify({ ok: result.ok, reportPath: result.reportPath, status: result.status }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`V9 visual matrix passed. Report: ${result.reportPath}\n`);
  } else {
    process.stderr.write(`V9 visual matrix failed. Report: ${result.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
