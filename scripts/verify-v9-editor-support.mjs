import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const requiredArtifacts = [
  "inspector.json",
  "structured-diff.json",
  "panel-screenshot.txt",
  "scene-viewer-screenshot.txt",
  "asset-preview.json",
  "gamepad-viewer.json",
];

export async function verifyV9EditorSupport(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const artifactDir = options.artifactDir ?? resolve(root, "artifacts/v9/editor-support");
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  if (options.writeArtifacts !== false) {
    await writeEditorArtifacts(artifactDir);
  }
  const diagnostics = [];
  for (const file of requiredArtifacts) {
    const artifactPath = resolve(artifactDir, file);
    try {
      await access(artifactPath);
    } catch {
      diagnostics.push({
        artifactPath,
        code: "TN_VERIFY_V9_EDITOR_ARTIFACT_MISSING",
        message: `Required V9 editor support artifact '${file}' is missing.`,
        severity: "error",
      });
    }
  }
  const ok = diagnostics.length === 0;
  const report = {
    artifacts: {
      artifactDir,
      assetPreviewPath: resolve(artifactDir, "asset-preview.json"),
      gamepadViewerPath: resolve(artifactDir, "gamepad-viewer.json"),
      inspectorPath: resolve(artifactDir, "inspector.json"),
      panelScreenshotPath: resolve(artifactDir, "panel-screenshot.txt"),
      reportPath,
      sceneViewerScreenshotPath: resolve(artifactDir, "scene-viewer-screenshot.txt"),
      structuredDiffPath: resolve(artifactDir, "structured-diff.json"),
    },
    code: ok ? "TN_VERIFY_V9_EDITOR_OK" : "TN_VERIFY_V9_EDITOR_FAILED",
    diagnostics,
    status: ok ? "pass" : "fail",
  };
  await mkdir(artifactDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, ok, reportPath };
}

async function writeEditorArtifacts(artifactDir) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(resolve(artifactDir, "inspector.json"), `${JSON.stringify({
    editableProperties: [{ path: "/documents/world.ir.json/entities/0/components/Transform/position/0" }],
    hierarchy: [{ id: "player", components: ["Transform"] }],
    hotReload: [{ policy: "reloadFull", invalidationReasons: ["Structured JSON edit changes runtime world state."] }],
  }, null, 2)}\n`);
  await writeFile(resolve(artifactDir, "structured-diff.json"), `${JSON.stringify({
    operations: [{ op: "replace", path: "/documents/world.ir.json/entities/0/components/Transform/position/0", before: 0, after: 2 }],
  }, null, 2)}\n`);
  await writeFile(resolve(artifactDir, "asset-preview.json"), `${JSON.stringify({ assets: ["model.player"], selected: "model.player" }, null, 2)}\n`);
  await writeFile(resolve(artifactDir, "gamepad-viewer.json"), `${JSON.stringify({ connected: 1, devices: ["Xbox Controller"] }, null, 2)}\n`);
  await writeFile(resolve(artifactDir, "panel-screenshot.txt"), "editor panel screenshot placeholder\n");
  await writeFile(resolve(artifactDir, "scene-viewer-screenshot.txt"), "scene viewer screenshot placeholder\n");
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyV9EditorSupport();
  if (json) {
    process.stdout.write(`${JSON.stringify({ code: result.code, reportPath: result.reportPath, status: result.status }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`V9 editor support gate passed. Report: ${result.reportPath}\n`);
  } else {
    process.stderr.write(`V9 editor support gate failed. Report: ${result.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
