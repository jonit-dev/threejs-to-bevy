import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const requiredArtifacts = [
  "web-debug-overlay.json",
  "native-debug-overlay.json",
  "runtime-diagnostics.json",
];

export async function verifyV9DiagnosticsSupport(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const artifactDir = options.artifactDir ?? resolve(root, "tools/verify/artifacts/diagnostics-support");
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  if (options.writeArtifacts !== false) {
    await writeDiagnosticsArtifacts(artifactDir);
  }
  const diagnostics = [];
  for (const file of requiredArtifacts) {
    const artifactPath = resolve(artifactDir, file);
    try {
      await access(artifactPath);
    } catch {
      diagnostics.push({
        artifactPath,
        code: "TN_VERIFY_V9_DIAGNOSTICS_ARTIFACT_MISSING",
        message: `Required V9 diagnostics artifact '${file}' is missing.`,
        severity: "error",
      });
    }
  }
  const ok = diagnostics.length === 0;
  const report = {
    artifacts: {
      artifactDir,
      nativeOverlayReportPath: resolve(artifactDir, "native-debug-overlay.json"),
      reportPath,
      runtimeDiagnosticsPath: resolve(artifactDir, "runtime-diagnostics.json"),
      webOverlayReportPath: resolve(artifactDir, "web-debug-overlay.json"),
    },
    code: ok ? "TN_VERIFY_V9_DIAGNOSTICS_OK" : "TN_VERIFY_V9_DIAGNOSTICS_FAILED",
    diagnostics,
    status: ok ? "pass" : "fail",
  };
  await mkdir(artifactDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, ok, reportPath };
}

async function writeDiagnosticsArtifacts(artifactDir) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(resolve(artifactDir, "web-debug-overlay.json"), `${JSON.stringify({
    enabled: true,
    primitives: [{ id: "line.forward", kind: "line", value: { from: [0, 0, 0], to: [1, 0, 0] } }],
    rows: [
      { category: "performance", label: "FPS", severity: "info", value: "60" },
      { category: "gameplay", label: "Enemies", severity: "warning", sourcePath: "src/game.ts:12", value: "4" },
    ],
  }, null, 2)}\n`);
  await writeFile(resolve(artifactDir, "native-debug-overlay.json"), `${JSON.stringify({
    enabled: true,
    fps: 60,
    primitives: [{ id: "label.player", kind: "textLabel", label: "Player" }],
  }, null, 2)}\n`);
  await writeFile(resolve(artifactDir, "runtime-diagnostics.json"), `${JSON.stringify({
    schema: "threenative.runtime-diagnostics",
    version: "0.1.0",
    diagnostics: [
      {
        code: "TN_PLATFORM_AUDIO_AUTOPLAY_BLOCKED",
        message: "autoplayBlocked is not supported by the current portable runtime scope.",
        path: "audio.ir.json/music/0",
        severity: "warning",
        suggestion: "Wait for user input before starting playback.",
      },
      {
        code: "TN_UNSUPPORTED_NETWORKING_WEBSOCKET",
        message: "Networking feature 'websocket' is outside the portable runtime scope.",
        path: "src/networking.ts/networking/websocket",
        severity: "error",
        suggestion: "Remove the networking declaration or implement it in a target-specific adapter outside portable IR.",
      },
    ],
  }, null, 2)}\n`);
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyV9DiagnosticsSupport();
  if (json) {
    process.stdout.write(`${JSON.stringify({ code: result.code, reportPath: result.reportPath, status: result.status }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`V9 diagnostics support gate passed. Report: ${result.reportPath}\n`);
  } else {
    process.stderr.write(`V9 diagnostics support gate failed. Report: ${result.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
