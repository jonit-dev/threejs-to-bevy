import { stableSystemEffectLog, type ISystemEffectLog } from "../systems/log.js";
import { loadBundleUrl } from "../loadBundleUrl.js";
import { renderLoadedBundle } from "../render.js";
import { renderDebugOverlay } from "../debugOverlay.js";
import type { IVehicleControllerInput, IVehicleControllerObservation } from "@threenative/ir";

declare global {
  interface Window {
    __THREENATIVE_READY__?: {
      canvas: { height: number; width: number };
      captureTransformTrace?: unknown;
      contactShadows?: unknown;
      diagnostics: unknown[];
      ok: boolean;
      runtimeDiagnostics: unknown;
    };
    __THREENATIVE_DEBUG_OVERLAY__?: unknown;
    __THREENATIVE_EFFECT_LOG__?: ISystemEffectLog;
    __THREENATIVE_RUNTIME__?: {
      debugColliderCount?: number;
      contactShadowsSnapshot?(): unknown;
      entityWorldPosition(id: string): [number, number, number] | undefined;
      entityWorldRotation?(id: string): [number, number, number, number] | undefined;
      meshLodSnapshot?(): unknown;
      performanceSnapshot?(): unknown;
      resourceSnapshot?(id: string): unknown;
      resetPerformanceTrace?(): void;
      runtimeObservationSnapshot?(): unknown;
      runtimeDiagnosticsSnapshot?(): unknown;
      setPaused?(paused: boolean): void;
      stepFixedTicks?(ticks: number): Promise<{ endTick: number; startTick: number; ticks: number }>;
      writeAuditSnapshot?(): unknown;
      setEntityTransform?(id: string, transform: { position?: [number, number, number]; rotation?: [number, number, number, number]; scale?: [number, number, number] }): boolean;
      setVehicleControllerInputs?(id: string, inputs?: IVehicleControllerInput): boolean;
      uiNodeSnapshot?(id: string): unknown;
      vehicleControllerSnapshot?(id?: string): IVehicleControllerObservation[];
      vehicleWheelSnapshot?(id?: string): unknown;
    };
  }
}

const container = document.getElementById("app");
if (container === null) {
  throw new Error("Missing #app container.");
}

const params = new URLSearchParams(window.location.search);
const bundleUrl = params.get("bundle") ?? "./bundle";
const resolvedBundleUrl = new URL(bundleUrl, window.location.href).href;
const debugColliders = ["1", "true", "on"].includes(params.get("debugColliders") ?? "");
const captureDrawingBuffer = ["1", "true", "on"].includes(params.get("capture") ?? "");
const captureFramesRaw = params.get("captureFrames");
const captureFrames = captureFramesRaw === null ? undefined : Number.parseInt(captureFramesRaw, 10);
const captureTraceEntityId = params.get("captureTraceEntity") ?? undefined;
const targetProfile = params.get("targetProfile") === "mobile-web" ? "mobile-web" : "desktop-web";
const debugVehicle = params.get("debugVehicle");
const loadedBundle = await loadBundleUrl(resolvedBundleUrl);
const debugVehiclePosition = params.get("debugVehiclePosition")?.split(",").map(Number);
if (debugVehicle !== null && debugVehiclePosition?.length === 3 && debugVehiclePosition.every(Number.isFinite)) {
  const entity = loadedBundle.world.entities.find((candidate) => candidate.id === debugVehicle);
  if (entity !== undefined) entity.components.Transform = { ...(entity.components.Transform ?? {}), position: debugVehiclePosition as [number, number, number] };
}
const result = await renderLoadedBundle(loadedBundle, container, {
  bookmarkId: params.get("bookmark") ?? undefined,
  captureDrawingBuffer,
  captureFrames: captureFrames !== undefined && Number.isFinite(captureFrames) && captureFrames > 0 ? captureFrames : undefined,
  captureTraceEntityId,
  debugColliders,
  targetProfile,
});
window.__THREENATIVE_RUNTIME__ = {
  contactShadowsSnapshot: result.contactShadowsSnapshot,
  debugColliderCount: result.debugColliderCount,
  entityWorldPosition: result.entityWorldPosition,
  entityWorldRotation: result.entityWorldRotation,
  meshLodSnapshot: result.meshLodSnapshot,
  performanceSnapshot: result.performanceSnapshot,
  resourceSnapshot: result.resourceSnapshot,
  resetPerformanceTrace: result.resetPerformanceTrace,
  runtimeObservationSnapshot: result.runtimeObservationSnapshot,
  runtimeDiagnosticsSnapshot: result.runtimeDiagnosticsSnapshot,
  setPaused: result.setPaused,
  stepFixedTicks: result.stepFixedTicks,
  writeAuditSnapshot: result.writeAuditSnapshot,
  setEntityTransform: result.setEntityTransform,
  setVehicleControllerInputs: result.setVehicleControllerInputs,
  uiNodeSnapshot: result.uiNodeSnapshot,
  vehicleControllerSnapshot: result.vehicleControllerSnapshot,
  vehicleWheelSnapshot: result.vehicleWheelSnapshot,
};

if (debugVehicle !== null) mountVehicleDebugHud(debugVehicle, result);

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
    contactShadows: result.contactShadowsSnapshot(),
    ...(result.captureTransformTrace === undefined ? {} : { captureTransformTrace: result.captureTransformTrace }),
    ok: result.diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    runtimeDiagnostics,
  };
}

function mountVehicleDebugHud(entity: string, runtime: Pick<typeof result, "entityWorldPosition" | "entityWorldRotation" | "setVehicleControllerInputs" | "vehicleControllerSnapshot" | "vehicleWheelSnapshot">): void {
  const zero = (): IVehicleControllerInput => ({ brake: 0, clutch: 0, handbrake: 0, steer: 0, throttle: 0 });
  const root = document.createElement("section");
  root.dataset.threenativeVehicleDebug = entity;
  Object.assign(root.style, { background: "rgba(2,6,23,.9)", bottom: "12px", boxSizing: "border-box", color: "#e2e8f0", font: "12px monospace", left: "12px", maxWidth: "756px", padding: "10px", position: "fixed", width: "calc(100vw - 24px)", zIndex: "2147483647" });
  const controls = document.createElement("div");
  const telemetry = document.createElement("pre");
  Object.assign(telemetry.style, { margin: "8px 0 0", maxWidth: "100%", overflowWrap: "anywhere", whiteSpace: "pre-wrap", wordBreak: "break-word" });
  const history: string[] = JSON.parse(sessionStorage.getItem(`threenative.vehicle.history.${entity}`) ?? "[]") as string[];
  const remember = (value: string) => {
    history.push(value);
    sessionStorage.setItem(`threenative.vehicle.history.${entity}`, JSON.stringify(history.slice(-20)));
  };
  const apply = (label: string, input: IVehicleControllerInput, durationMs?: number) => {
    runtime.setVehicleControllerInputs(entity, input);
    remember(label);
    if (durationMs !== undefined) setTimeout(() => {
      runtime.setVehicleControllerInputs(entity, zero());
      const position = runtime.entityWorldPosition(entity);
      const rotation = runtime.entityWorldRotation(entity);
      const yaw = rotation === undefined ? 0 : 2 * Math.atan2(rotation[1], rotation[3]);
      remember(`${label} complete x=${position?.[0].toFixed(2) ?? "?"} z=${position?.[2].toFixed(2) ?? "?"} yaw=${yaw.toFixed(3)}`);
    }, durationMs);
  };
  for (const [label, input, durationMs] of [
    ["Launch", { ...zero(), gear: 1, throttle: 1 }, 1_200],
    ["Slalom left", { ...zero(), steer: -0.55, throttle: 0.7 }, 600],
    ["Slalom right", { ...zero(), steer: 0.55, throttle: 0.7 }, 600],
    ["Brake", { ...zero(), brake: 1 }, 1_000],
    ["Reverse", { ...zero(), gear: -1, throttle: 0.65 }, 1_500],
    ["Release", zero(), undefined],
  ] as const) {
    const button = document.createElement("button");
    button.textContent = label;
    button.dataset.vehicleControl = label.toLowerCase().replaceAll(" ", "-");
    Object.assign(button.style, { margin: "2px", padding: "5px 8px" });
    button.addEventListener("click", () => apply(label, input, durationMs));
    controls.append(button);
  }
  const retry = document.createElement("button");
  retry.textContent = "Retry fresh runtime";
  retry.dataset.vehicleControl = "retry";
  retry.addEventListener("click", () => { history.push("Retry fresh runtime"); sessionStorage.setItem(`threenative.vehicle.history.${entity}`, JSON.stringify(history.slice(-20))); location.reload(); });
  controls.append(retry);
  root.append(controls, telemetry);
  document.body.append(root);
  let sawAbs = false;
  let sawTcs = false;
  const update = () => {
    const observation = runtime.vehicleControllerSnapshot(entity)[0];
    const wheels = runtime.vehicleWheelSnapshot(entity)[0]?.wheels ?? [];
    const position = runtime.entityWorldPosition(entity);
    const rotation = runtime.entityWorldRotation(entity);
    const yaw = rotation === undefined ? undefined : 2 * Math.atan2(rotation[1], rotation[3]);
    if (observation?.absActive === true && !sawAbs) { sawAbs = true; remember("ABS ACTIVE observed"); }
    if (observation?.tcsActive === true && !sawTcs) { sawTcs = true; remember("TCS ACTIVE observed"); }
    telemetry.textContent = observation === undefined
      ? `Vehicle ${entity}: awaiting first fixed tick\nHistory: ${history.join(" -> ")}`
      : [
          `Vehicle ${entity} | speed ${observation.speed.toFixed(2)} m/s | RPM ${observation.engineRpm.toFixed(0)} | gear ${observation.gear} | clutch ${observation.clutch.toFixed(2)}`,
          `shift ${observation.shiftState} | ABS ${observation.absActive ? "ACTIVE" : "off"} | TCS ${observation.tcsActive ? "ACTIVE" : "off"} | drive ${observation.driveTorque.toFixed(1)} Nm`,
          `torque ${observation.torquePath.wheels.map((wheel) => `${wheel.wheelId}:${wheel.torque.toFixed(1)}`).join(" ")}`,
          `input throttle=${observation.inputs.throttle.toFixed(2)} brake=${observation.inputs.brake.toFixed(2)} steer=${observation.inputs.steer.toFixed(2)} handbrake=${observation.inputs.handbrake.toFixed(2)}`,
          `pose x=${position?.[0].toFixed(2) ?? "?"} y=${position?.[1].toFixed(2) ?? "?"} z=${position?.[2].toFixed(2) ?? "?"} yaw=${yaw?.toFixed(3) ?? "?"}`,
          `slip ${wheels.map((wheel) => `${wheel.wheelId}:${wheel.longitudinalSlip.toFixed(3)}${wheel.grounded ? "" : "(air)"}`).join(" ")}`,
          `History: ${history.join(" -> ") || "none"}`,
        ].join("\n");
  };
  update();
  setInterval(update, 100);
}
