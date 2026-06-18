import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveArtifactTargets } from "./artifact-paths.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyInputUiAccessibility(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const targets = resolveArtifactTargets({ gate: "input-ui-accessibility", owner: { kind: "aggregate", name: "input-ui-accessibility" }, root });

  const artifactDir = options.artifactDir ?? targets.absoluteDir;
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const accessibilityReportPath = options.accessibilityReportPath ?? resolve(artifactDir, "accessibility-report.json");
  const pickingOverlayDir = options.pickingOverlayDir ?? resolve(artifactDir, "picking-debug");
  const uiDebugReportPath = options.uiDebugReportPath ?? resolve(artifactDir, "ui-debug-report.json");
  const diagnostics = [];

  if (options.writeArtifacts !== false) {
    await writePickingArtifacts(root, pickingOverlayDir, options);
    await writeAccessibilityArtifacts(root, artifactDir, options);
  }

  const overlayReportPath = resolve(pickingOverlayDir, "overlay-report.json");
  const dragLogPath = resolve(pickingOverlayDir, "drag-log.json");
  const accessibilityReport = await readJsonIfPresent(accessibilityReportPath);
  const overlayReport = await readJsonIfPresent(overlayReportPath);
  const dragLog = await readJsonIfPresent(dragLogPath);
  const uiDebugReport = await readJsonIfPresent(uiDebugReportPath);

  if (overlayReport === undefined) {
    diagnostics.push({
      code: "TN_VERIFY_V9_PICKING_OVERLAY_MISSING",
      message: "V9 picking debug overlay report is missing.",
      path: overlayReportPath,
      repairHint: "Write tools/verify/artifacts/input-ui-accessibility/picking-debug/overlay-report.json from web and native overlay observations.",
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
      repairHint: "Write tools/verify/artifacts/input-ui-accessibility/picking-debug/drag-log.json with shared web/native drag phase order.",
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

  if (accessibilityReport === undefined) {
    diagnostics.push({
      code: "TN_VERIFY_V9_ACCESSIBILITY_REPORT_MISSING",
      message: "V9 accessibility report is missing.",
      path: accessibilityReportPath,
      repairHint: "Write tools/verify/artifacts/input-ui-accessibility/accessibility-report.json with target diagnostics and repair hints.",
      severity: "error",
    });
  } else {
    requireAccessibilityDiagnostics(accessibilityReport, accessibilityReportPath, diagnostics);
  }

  if (uiDebugReport === undefined) {
    diagnostics.push({
      code: "TN_VERIFY_V9_UI_DEBUG_REPORT_MISSING",
      message: "V9 retained UI debug report is missing.",
      path: uiDebugReportPath,
      repairHint: "Write tools/verify/artifacts/input-ui-accessibility/ui-debug-report.json with node bounds, focus, widget, image, and accessibility metadata.",
      severity: "error",
    });
  } else {
    requireArray(uiDebugReport, "nodes", uiDebugReportPath, diagnostics);
    requireArray(uiDebugReport, "gizmos", uiDebugReportPath, diagnostics);
  }

  const ok = diagnostics.length === 0;
  const report = {
    artifacts: {
      accessibilityReportPath,
      dragLogPath,
      pickingOverlayDir,
      reportPath,
      uiDebugReportPath,
    },
    code: ok ? "TN_VERIFY_V9_INPUT_UI_ACCESSIBILITY_OK" : "TN_VERIFY_V9_INPUT_UI_ACCESSIBILITY_FAILED",
    diagnostics,
    promotedChecklist: [
      "P1 controls settings persistence",
      "P2 drag-and-drop picking events",
      "P2 picking debug overlay",
      "P2 device diagnostics overlay observations",
      "P1 rich text/font diagnostics",
      "P1 UI atlas/9-slice metadata observations",
      "P2 slider/scrollbar/context menu widgets",
      "P1 retained UI accessibility repair hints",
      "P2 UI debug overlay observations",
    ],
    deferrals: [
      "native-rendered 9-slice/tiled image slicing",
      "virtual keyboard platform behavior",
      "broad retained UI transforms",
      "render-to-texture UI",
      "3D-world UI",
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

function requireAccessibilityDiagnostics(value, path, diagnostics) {
  if (!Array.isArray(value?.diagnostics) || value.diagnostics.length === 0) {
    diagnostics.push({
      code: "TN_VERIFY_V9_ACCESSIBILITY_DIAGNOSTICS_MISSING",
      message: "V9 accessibility report must include at least one diagnostic evidence entry.",
      path: `${path}/diagnostics`,
      repairHint: "Run the target-specific accessibility audit fixture and persist diagnostics with repair hints.",
      severity: "error",
    });
    return;
  }
  for (const [index, diagnostic] of value.diagnostics.entries()) {
    if (typeof diagnostic?.repairHint !== "string" || diagnostic.repairHint.length === 0) {
      diagnostics.push({
        code: "TN_VERIFY_V9_ACCESSIBILITY_REPAIR_HINT_MISSING",
        message: "V9 accessibility diagnostics must include repair hints.",
        path: `${path}/diagnostics/${index}/repairHint`,
        repairHint: "Include exact bundle paths such as ui.nodes[id].accessibilityLabel on every accessibility diagnostic.",
        severity: "error",
      });
    }
  }
}

function hasRequiredDragPhases(log) {
  const events = Array.isArray(log) ? log : Array.isArray(log?.events) ? log.events : [];
  const phases = new Set(events.map((event) => event?.kind).filter((kind) => typeof kind === "string"));
  return ["dragStart", "dragMove", "drop", "dragEnd"].every((phase) => phases.has(phase));
}

async function writePickingArtifacts(root, pickingOverlayDir, options) {
  if (options.writePickingArtifacts !== undefined) {
    await options.writePickingArtifacts({ pickingOverlayDir, root });
    return;
  }
  const runtime = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/picking/drag.js")).href);
  const overlappingTargets = [
    { dropZone: true, id: "mesh.chest", targetKind: "mesh", zIndex: 100 },
    { draggable: true, id: "ui.inventory.item", targetKind: "ui", zIndex: 10 },
  ];
  const recognizer = runtime.createWebDragPickingRecognizer({ moveThreshold: 0.01 });
  recognizer.update({ buttonDown: true, candidates: overlappingTargets, pointerId: 1, screen: { x: 0.1, y: 0.1 }, timeMs: 0 });
  recognizer.update({
    buttonDown: true,
    candidates: overlappingTargets,
    modifiers: ["Shift"],
    pointerId: 1,
    screen: { x: 0.15, y: 0.15 },
    timeMs: 16,
    worldRay: { direction: { x: 0, y: 0, z: -1 }, origin: { x: 0, y: 0, z: 5 } },
  });
  recognizer.update({
    buttonDown: false,
    candidates: [{ dropZone: true, id: "mesh.chest", targetKind: "mesh" }],
    pointerId: 1,
    screen: { x: 0.4, y: 0.4 },
    timeMs: 32,
    worldHit: { x: 1, y: 2, z: 3 },
  });
  const report = recognizer.debugReport();
  const dragLog = report.eventLog.map((event) => ({
    currentTargetId: event.currentTargetId,
    kind: event.kind,
    pointerId: event.pointerId,
    screen: event.screen,
    sourceTargetId: event.sourceTargetId,
  }));
  const overlayReport = {
    captureOwner: report.captureOwner,
    connectedDevices: [{ id: "pointer", kind: "pointer", status: "observed" }],
    deviceDiagnostics: report.deviceDiagnostics,
    eventLog: report.eventLog.map((event) => event.kind),
    meshBounds: report.meshBounds,
    pointerRays: report.pointerRays,
    uiBounds: report.uiBounds,
  };
  await mkdir(pickingOverlayDir, { recursive: true });
  await writeFile(resolve(pickingOverlayDir, "overlay-report.json"), `${JSON.stringify(overlayReport, null, 2)}\n`);
  await writeFile(resolve(pickingOverlayDir, "drag-log.json"), `${JSON.stringify({ events: dragLog }, null, 2)}\n`);
}

async function writeAccessibilityArtifacts(root, artifactDir, options) {
  if (options.writeAccessibilityArtifacts !== undefined) {
    await options.writeAccessibilityArtifacts({ artifactDir, root });
    return;
  }
  const ir = await import(pathToFileURL(resolve(root, "packages/ir/dist/index.js")).href);
  const runtime = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/ui/debugOverlay.js")).href);
  const renderer = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/ui/renderUi.js")).href);
  const accessibilityReport = ir.auditUiAccessibility({
    schema: "threenative.ui",
    version: "0.1.0",
    root: {
      action: "SetVolume",
      focusable: true,
      id: "broken-volume",
      kind: "slider",
      value: 0.5,
    },
  });
  const ui = {
    schema: "threenative.ui",
    version: "0.1.0",
    root: {
      id: "settings",
      kind: "column",
      children: [
        {
          accessibilityLabel: "Volume",
          action: "SetVolume",
          id: "volume",
          kind: "slider",
          layout: { height: 24, inset: { left: 12, top: 8 }, width: 160, zIndex: 2 },
          max: 1,
          min: 0,
          value: 0.5,
          valueText: "50 percent",
        },
        {
          accessibilityLabel: "Inventory frame",
          id: "frame",
          image: { nineSlice: { bottom: 4, left: 4, right: 4, top: 4 }, sourceSize: { height: 32, width: 64 } },
          kind: "image",
          src: "assets/ui/frame.png",
        },
      ],
    },
  };
  const uiDebugReport = runtime.createUiDebugOverlayReport(
    renderer.renderUi(ui, { entities: [], resources: {}, schema: "threenative.world", version: "0.1.0" }),
  );
  await mkdir(artifactDir, { recursive: true });
  await writeFile(resolve(artifactDir, "accessibility-report.json"), `${JSON.stringify(accessibilityReport, null, 2)}\n`);
  await writeFile(resolve(artifactDir, "ui-debug-report.json"), `${JSON.stringify(uiDebugReport, null, 2)}\n`);
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
