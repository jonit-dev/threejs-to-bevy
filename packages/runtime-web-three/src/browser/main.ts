import { stableSystemEffectLog, type ISystemEffectLog } from "../systems/log.js";
import { loadBundleUrl } from "../loadBundleUrl.js";
import { renderLoadedBundle } from "../render.js";
import { renderDebugOverlay } from "../debugOverlay.js";

declare global {
  interface Window {
    __THREENATIVE_READY__?: {
      canvas: { height: number; width: number };
      diagnostics: unknown[];
      ok: boolean;
      runtimeDiagnostics: unknown;
    };
    __THREENATIVE_DEBUG_OVERLAY__?: unknown;
    __THREENATIVE_EFFECT_LOG__?: ISystemEffectLog;
    __THREENATIVE_RUNTIME__?: {
      debugColliderCount?: number;
      entityWorldPosition(id: string): [number, number, number] | undefined;
      performanceSnapshot?(): unknown;
      resourceSnapshot?(id: string): unknown;
      resetPerformanceTrace?(): void;
      runtimeDiagnosticsSnapshot?(): unknown;
      setEntityTransform?(id: string, transform: { position?: [number, number, number]; rotation?: [number, number, number, number]; scale?: [number, number, number] }): boolean;
      uiNodeSnapshot?(id: string): unknown;
    };
  }
}

const container = document.getElementById("app");
if (container === null) {
  throw new Error("Missing #app container.");
}

const params = new URLSearchParams(window.location.search);
const bundleUrl = params.get("bundle") ?? "/bundle";
const resolvedBundleUrl = new URL(bundleUrl, window.location.href).href;
const debugColliders = ["1", "true", "on"].includes(params.get("debugColliders") ?? "");
const result = await renderLoadedBundle(await loadBundleUrl(resolvedBundleUrl), container, {
  bookmarkId: params.get("bookmark") ?? undefined,
  debugColliders,
});
window.__THREENATIVE_RUNTIME__ = {
  debugColliderCount: result.debugColliderCount,
  entityWorldPosition: result.entityWorldPosition,
  performanceSnapshot: result.performanceSnapshot,
  resourceSnapshot: result.resourceSnapshot,
  resetPerformanceTrace: result.resetPerformanceTrace,
  runtimeDiagnosticsSnapshot: result.runtimeDiagnosticsSnapshot,
  setEntityTransform: result.setEntityTransform,
  uiNodeSnapshot: result.uiNodeSnapshot,
};

updateReadyState();
window.__THREENATIVE_EFFECT_LOG__ = stableSystemEffectLog(result.effectLog);

if (["1", "true", "on"].includes(params.get("debugOverlay") ?? "")) {
  const overlay = renderDebugOverlay({
    counters: [
      {
        aggregation: "frame",
        category: "scene",
        id: "visible-mesh-count",
        label: "Visible Meshes",
        severity: "info",
        sourcePath: "runtimeDiagnostics.scene.visibleMeshCount",
        value: result.runtimeDiagnostics.scene.visibleMeshCount,
      },
    ],
    diagnostics: result.diagnostics,
    fpsOverlay: { enabled: true, sampleWindowFrames: 60 },
  });
  window.__THREENATIVE_DEBUG_OVERLAY__ = overlay;
  const element = document.createElement("pre");
  element.setAttribute("data-threenative-debug-overlay", "true");
  element.textContent = JSON.stringify(overlay, null, 2);
  Object.assign(element.style, {
    background: "rgba(0, 0, 0, 0.78)",
    color: "#f8fafc",
    font: "12px monospace",
    left: "8px",
    maxHeight: "45vh",
    maxWidth: "50vw",
    overflow: "auto",
    padding: "8px",
    position: "fixed",
    top: "8px",
    zIndex: "2147483647",
  });
  document.body.appendChild(element);
}

setInterval(() => {
  updateReadyState();
  window.__THREENATIVE_EFFECT_LOG__ = stableSystemEffectLog(result.effectLog);
}, 1000);

function updateReadyState(): void {
  const runtimeDiagnostics = result.runtimeDiagnosticsSnapshot();
  runtimeDiagnostics.recentRuntimeErrors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error").slice(-10);
  window.__THREENATIVE_READY__ = {
    canvas: {
      height: result.canvas.height,
      width: result.canvas.width,
    },
    diagnostics: result.diagnostics,
    ok: result.diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    runtimeDiagnostics,
  };
}
