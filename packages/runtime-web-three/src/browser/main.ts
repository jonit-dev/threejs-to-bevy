import { stableSystemEffectLog, type ISystemEffectLog } from "../systems/log.js";
import { loadBundleUrl } from "../loadBundleUrl.js";
import { renderLoadedBundle } from "../render.js";
import { renderDebugOverlay } from "../debugOverlay.js";
import type { IAerodynamicObservation, IVehicleControllerInput, IVehicleControllerObservation } from "@threenative/ir";
import type { IAerodynamicInputs } from "../physicsAerodynamics.js";

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
      aerodynamicSnapshot?(id?: string): IAerodynamicObservation[];
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
      setAerodynamicInputs?(id: string, inputs: IAerodynamicInputs): boolean;
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
const debugAerodynamics = params.get("debugAerodynamics");
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
  aerodynamicSnapshot: result.aerodynamicSnapshot,
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
  setAerodynamicInputs: result.setAerodynamicInputs,
  setVehicleControllerInputs: result.setVehicleControllerInputs,
  uiNodeSnapshot: result.uiNodeSnapshot,
  vehicleControllerSnapshot: result.vehicleControllerSnapshot,
  vehicleWheelSnapshot: result.vehicleWheelSnapshot,
};

if (debugVehicle !== null) mountVehicleDebugHud(debugVehicle, result);
if (debugAerodynamics !== null) mountAerodynamicDebugHud(debugAerodynamics, result);

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

function mountAerodynamicDebugHud(entity: string, runtime: Pick<typeof result, "aerodynamicSnapshot" | "entityWorldPosition">): void {
  const root = document.createElement("section");
  root.dataset.threenativeAerodynamicDebug = entity;
  Object.assign(root.style, { background: "rgba(2,6,23,.92)", bottom: "12px", boxSizing: "border-box", color: "#e2e8f0", font: "12px monospace", left: "12px", maxWidth: "760px", padding: "10px", position: "fixed", width: "calc(100vw - 24px)", zIndex: "2147483647" });
  const controls = document.createElement("div");
  const history: string[] = JSON.parse(sessionStorage.getItem(`threenative.aerodynamics.history.${entity}`) ?? "[]") as string[];
  const controlledKeys = ["KeyW", "ArrowUp", "ArrowDown"];
  const apply = (label: string, key?: string) => {
    for (const code of controlledKeys) window.dispatchEvent(new KeyboardEvent("keyup", { code }));
    if (key !== undefined) window.dispatchEvent(new KeyboardEvent("keydown", { code: key }));
    history.push(label);
    sessionStorage.setItem(`threenative.aerodynamics.history.${entity}`, JSON.stringify(history.slice(-20)));
  };
  for (const [label, key] of [
    ["Launch", "KeyW"],
    ["Pitch / stall", "ArrowUp"],
    ["Recover", "ArrowDown"],
    ["Release", undefined],
  ] as const) {
    const button = document.createElement("button");
    button.textContent = label;
    button.dataset.aerodynamicControl = label.toLowerCase().replaceAll(" ", "-");
    Object.assign(button.style, { margin: "2px", padding: "5px 8px" });
    button.addEventListener("click", () => apply(label, key));
    controls.append(button);
  }
  const retry = document.createElement("button");
  retry.textContent = "Retry fresh runtime";
  retry.dataset.aerodynamicControl = "retry";
  retry.addEventListener("click", () => { history.push("Retry fresh runtime"); sessionStorage.setItem(`threenative.aerodynamics.history.${entity}`, JSON.stringify(history.slice(-20))); location.reload(); });
  controls.append(retry);
  const vectors = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  vectors.setAttribute("viewBox", "0 0 420 120");
  vectors.setAttribute("aria-label", "Aerodynamic force vectors");
  Object.assign(vectors.style, { background: "rgba(15,23,42,.85)", display: "block", height: "120px", marginTop: "8px", width: "420px" });
  const telemetry = document.createElement("pre");
  Object.assign(telemetry.style, { margin: "8px 0 0", whiteSpace: "pre-wrap" });
  root.append(controls, vectors, telemetry);
  document.body.append(root);
  const update = () => {
    const observation = runtime.aerodynamicSnapshot(entity)[0];
    if (observation === undefined) { telemetry.textContent = `Aerodynamics ${entity}: awaiting first fixed tick`; return; }
    const lift = observation.surfaces.reduce((sum, surface) => sum + surface.lift[1], 0);
    const drag = observation.surfaces.reduce((sum, surface) => sum + Math.hypot(...surface.drag), 0);
    const thrust = observation.thrusters.reduce((sum, item) => sum + Math.hypot(...item.force), 0);
    const wind = Math.hypot(...observation.windVelocity);
    const lines = [
      ["LIFT", "#4ade80", 20, 100, 20, 100 - Math.min(80, Math.abs(lift) / 20)],
      ["DRAG", "#fb923c", 120, 30, 120 + Math.min(80, drag / 5), 30],
      ["THRUST", "#f43f5e", 120, 65, 120 + Math.min(80, thrust / 20), 65],
      ["WIND", "#22d3ee", 120, 100, 120 + Math.min(80, wind * 12), 100],
    ] as const;
    vectors.replaceChildren(...lines.flatMap(([label, color, x1, y1, x2, y2]) => {
      const line = document.createElementNS(vectors.namespaceURI, "line");
      line.setAttribute("x1", String(x1)); line.setAttribute("y1", String(y1)); line.setAttribute("x2", String(x2)); line.setAttribute("y2", String(y2)); line.setAttribute("stroke", color); line.setAttribute("stroke-width", "5"); line.setAttribute("stroke-linecap", "round");
      const text = document.createElementNS(vectors.namespaceURI, "text");
      text.setAttribute("x", String(x1 + 4)); text.setAttribute("y", String(Math.max(12, y1 - 6))); text.setAttribute("fill", color); text.textContent = label;
      return [line, text];
    }));
    const elevator = observation.surfaces.find((surface) => surface.id === "elevator");
    const position = runtime.entityWorldPosition(entity);
    telemetry.textContent = [
      `Craft ${entity} | air ${Math.hypot(...observation.relativeAirVelocity).toFixed(2)} m/s | AoA ${(elevator?.angleOfAttack ?? 0).toFixed(3)} rad | sideslip ${observation.sideslip.toFixed(3)} rad`,
      `lift ${lift.toFixed(1)} N | drag ${drag.toFixed(1)} N | thrust ${thrust.toFixed(1)} N | wind ${observation.windVelocity.map((value) => value.toFixed(2)).join(",")}`,
      `elevator ${(elevator?.controlDeflection ?? 0).toFixed(3)} rad | stall ${observation.surfaces.some((surface) => surface.stalled) ? "ACTIVE" : "clear"} | diagnostics ${observation.diagnostics.length}`,
      `pose ${position?.map((value) => value.toFixed(2)).join(",") ?? "missing"} | History: ${history.join(" -> ") || "none"}`,
    ].join("\n");
  };
  update();
  setInterval(update, 100);
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
