import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyInputUiAccessibility(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const artifactDir = options.artifactDir ?? resolve(root, "artifacts/v9/input-ui-accessibility");
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const pickingOverlayDir = options.pickingOverlayDir ?? resolve(artifactDir, "picking-debug");
  const diagnostics = [];

  const overlayReportPath = resolve(pickingOverlayDir, "overlay-report.json");
  const dragLogPath = resolve(pickingOverlayDir, "drag-log.json");
  const overlayReport = await readJsonIfPresent(overlayReportPath);
  const dragLog = await readJsonIfPresent(dragLogPath);

  if (overlayReport === undefined) {
    diagnostics.push({
      code: "TN_VERIFY_V9_PICKING_OVERLAY_MISSING",
      message: "V9 picking debug overlay report is missing.",
      path: overlayReportPath,
      repairHint: "Write artifacts/v9/input-ui-accessibility/picking-debug/overlay-report.json from web and native overlay observations.",
      severity: "error",
    });
  } else {
    requireArray(overlayReport, "pointerRays", overlayReportPath, diagnostics);
    requireArray(overlayReport, "eventLog", overlayReportPath, diagnostics);
    requireArray(overlayReport, "uiBounds", overlayReportPath, diagnostics);
    requireArray(overlayReport, "meshBounds", overlayReportPath, diagnostics);
  }

  if (dragLog === undefined) {
    diagnostics.push({
      code: "TN_VERIFY_V9_PICKING_DRAG_LOG_MISSING",
      message: "V9 drag picking event log is missing.",
      path: dragLogPath,
      repairHint: "Write artifacts/v9/input-ui-accessibility/picking-debug/drag-log.json with shared web/native drag phase order.",
      severity: "error",
    });
  } else if (!hasRequiredDragPhases(dragLog)) {
    diagnostics.push({
      code: "TN_VERIFY_V9_PICKING_DRAG_PHASES_MISSING",
      message: "V9 drag picking log must include dragStart, dragMove, drop, and dragEnd.",
      path: dragLogPath,
      repairHint: "Capture a retained UI to mesh drop interaction and persist the ordered phase log.",
      severity: "error",
    });
  }

  const ok = diagnostics.length === 0;
  const report = {
    artifacts: {
      dragLogPath,
      pickingOverlayDir,
      reportPath,
    },
    code: ok ? "TN_VERIFY_V9_INPUT_UI_ACCESSIBILITY_OK" : "TN_VERIFY_V9_INPUT_UI_ACCESSIBILITY_FAILED",
    diagnostics,
    promotedChecklist: [
      "P1 controls settings persistence",
      "P2 drag-and-drop picking events",
      "P2 picking debug overlay",
      "P2 device diagnostics overlay observations",
    ],
    status: ok ? "pass" : "fail",
  };
  await mkdir(artifactDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, ok };
}

async function readJsonIfPresent(path) {
  try {
    await access(path);
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

function requireArray(value, field, path, diagnostics) {
  if (!Array.isArray(value?.[field]) || value[field].length === 0) {
    diagnostics.push({
      code: "TN_VERIFY_V9_PICKING_OVERLAY_FIELD_MISSING",
      message: `V9 picking overlay report must include non-empty '${field}'.`,
      path: `${path}/${field}`,
      repairHint: `Record '${field}' in the picking debug overlay evidence artifact.`,
      severity: "error",
    });
  }
}

function hasRequiredDragPhases(log) {
  const events = Array.isArray(log) ? log : Array.isArray(log?.events) ? log.events : [];
  const phases = new Set(events.map((event) => event?.kind).filter((kind) => typeof kind === "string"));
  return ["dragStart", "dragMove", "drop", "dragEnd"].every((phase) => phases.has(phase));
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyInputUiAccessibility();
  if (json) {
    process.stdout.write(`${JSON.stringify({ code: result.code, diagnostics: result.diagnostics, status: result.status }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`V9 input UI accessibility gate passed. Report: ${result.artifacts.reportPath}\n`);
  } else {
    process.stderr.write(`V9 input UI accessibility gate failed. Report: ${result.artifacts.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
