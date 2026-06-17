import { SdkError } from "./errors.js";

export type DebugPrimitiveKind = "bounds" | "box" | "cameraFrustum" | "lightVolume" | "line" | "ray" | "sphere" | "textLabel" | "transformAxes" | "uiNodeRect";
export type DebugSeverity = "error" | "info" | "warning";
export type DebugCounterAggregation = "frame" | "window";

export interface IDebugDrawDeclaration {
  color?: string;
  id: string;
  kind: DebugPrimitiveKind;
  label?: string;
  lifetimeSeconds?: number;
  target?: string;
  value: Record<string, unknown>;
}

export interface IDebugFpsOverlayDeclaration {
  enabled: boolean;
  sampleWindowFrames: number;
}

export interface IDebugCounterDeclaration {
  aggregation: DebugCounterAggregation;
  category: string;
  id: string;
  label: string;
  sourcePath: string;
  value: number;
  severity: DebugSeverity;
}

export interface IDebugPlatformDiagnosticDeclaration {
  category: "audio" | "feature" | "networking";
  code: string;
  message: string;
  path: string;
  severity: Exclude<DebugSeverity, "info">;
  suggestion: string;
}

export interface IDebugDiagnosticsDeclaration {
  counters: IDebugCounterDeclaration[];
  draw: IDebugDrawDeclaration[];
  fpsOverlay?: IDebugFpsOverlayDeclaration;
  kind: "DebugDiagnostics";
  platformDiagnostics: IDebugPlatformDiagnosticDeclaration[];
}

export function debugLine(id: string, options: { color?: string; from: readonly [number, number, number]; label?: string; lifetimeSeconds?: number; to: readonly [number, number, number] }): IDebugDrawDeclaration {
  return debugDraw(id, "line", options, { from: tuple(options.from, 3), to: tuple(options.to, 3) });
}

export function debugRay(id: string, options: { color?: string; direction: readonly [number, number, number]; label?: string; lifetimeSeconds?: number; origin: readonly [number, number, number] }): IDebugDrawDeclaration {
  return debugDraw(id, "ray", options, { direction: tuple(options.direction, 3), origin: tuple(options.origin, 3) });
}

export function debugBounds(id: string, options: { color?: string; label?: string; lifetimeSeconds?: number; max: readonly [number, number, number]; min: readonly [number, number, number] }): IDebugDrawDeclaration {
  return debugDraw(id, "bounds", options, { max: tuple(options.max, 3), min: tuple(options.min, 3) });
}

export function debugSphere(id: string, options: { center: readonly [number, number, number]; color?: string; label?: string; lifetimeSeconds?: number; radius: number }): IDebugDrawDeclaration {
  assertPositive(options.radius, "TN_SDK_DEBUG_RADIUS_INVALID", `Debug sphere '${id}' radius must be positive.`);
  return debugDraw(id, "sphere", options, { center: tuple(options.center, 3), radius: options.radius });
}

export function debugBox(id: string, options: { center: readonly [number, number, number]; color?: string; label?: string; lifetimeSeconds?: number; size: readonly [number, number, number] }): IDebugDrawDeclaration {
  return debugDraw(id, "box", options, { center: tuple(options.center, 3), size: tuple(options.size, 3) });
}

export function debugTextLabel(id: string, options: { color?: string; label: string; lifetimeSeconds?: number; position: readonly [number, number, number] }): IDebugDrawDeclaration {
  assertText(options.label, "TN_SDK_DEBUG_LABEL_INVALID", `Debug label '${id}' must not be empty.`);
  return debugDraw(id, "textLabel", options, { position: tuple(options.position, 3), text: options.label });
}

export function debugTransformAxes(id: string, options: { color?: string; label?: string; lifetimeSeconds?: number; length: number; target: string }): IDebugDrawDeclaration {
  assertPositive(options.length, "TN_SDK_DEBUG_AXES_LENGTH_INVALID", `Debug transform axes '${id}' length must be positive.`);
  assertText(options.target, "TN_SDK_DEBUG_TARGET_INVALID", `Debug transform axes '${id}' target must not be empty.`);
  return debugDraw(id, "transformAxes", options, { length: options.length });
}

export function debugCameraFrustum(id: string, options: { color?: string; label?: string; lifetimeSeconds?: number; target: string }): IDebugDrawDeclaration {
  assertText(options.target, "TN_SDK_DEBUG_TARGET_INVALID", `Debug camera frustum '${id}' target must not be empty.`);
  return debugDraw(id, "cameraFrustum", options, {});
}

export function debugLightVolume(id: string, options: { color?: string; label?: string; lifetimeSeconds?: number; target: string }): IDebugDrawDeclaration {
  assertText(options.target, "TN_SDK_DEBUG_TARGET_INVALID", `Debug light volume '${id}' target must not be empty.`);
  return debugDraw(id, "lightVolume", options, {});
}

export function debugUiNodeRect(id: string, options: { color?: string; label?: string; lifetimeSeconds?: number; target: string }): IDebugDrawDeclaration {
  assertText(options.target, "TN_SDK_DEBUG_TARGET_INVALID", `Debug UI node rect '${id}' target must not be empty.`);
  return debugDraw(id, "uiNodeRect", options, {});
}

export function fpsOverlay(options: { enabled?: boolean; sampleWindowFrames?: number } = {}): IDebugFpsOverlayDeclaration {
  const sampleWindowFrames = options.sampleWindowFrames ?? 60;
  if (!Number.isInteger(sampleWindowFrames) || sampleWindowFrames <= 0) {
    throw new SdkError("TN_SDK_DEBUG_FPS_WINDOW_INVALID", "FPS overlay sample window must be a positive integer.");
  }
  return { enabled: options.enabled ?? true, sampleWindowFrames };
}

export function diagnosticCounter(id: string, options: { aggregation?: DebugCounterAggregation; category: string; label: string; sourcePath: string; value: number; severity?: DebugSeverity }): IDebugCounterDeclaration {
  assertText(id, "TN_SDK_DEBUG_COUNTER_ID_INVALID", "Diagnostic counter id must not be empty.");
  assertText(options.category, "TN_SDK_DEBUG_COUNTER_CATEGORY_INVALID", `Diagnostic counter '${id}' category must not be empty.`);
  assertText(options.label, "TN_SDK_DEBUG_COUNTER_LABEL_INVALID", `Diagnostic counter '${id}' label must not be empty.`);
  assertText(options.sourcePath, "TN_SDK_DEBUG_COUNTER_SOURCE_INVALID", `Diagnostic counter '${id}' source path must not be empty.`);
  if (!Number.isFinite(options.value)) {
    throw new SdkError("TN_SDK_DEBUG_COUNTER_VALUE_INVALID", `Diagnostic counter '${id}' value must be finite.`);
  }
  return {
    aggregation: options.aggregation ?? "frame",
    category: options.category,
    id,
    label: options.label,
    severity: options.severity ?? "info",
    sourcePath: options.sourcePath,
    value: options.value,
  };
}

export function platformAudioDiagnostic(kind: "autoplayBlocked" | "effectFallback" | "missingAudioDevice" | "spatialBackendUnavailable" | "unsupportedDecoder", path: string): IDebugPlatformDiagnosticDeclaration {
  return platformDiagnostic("audio", `TN_PLATFORM_AUDIO_${kind.replace(/[A-Z]/g, (part) => `_${part}`).toUpperCase()}`, kind, path);
}

export function unsupportedFeatureDiagnostic(kind: "advancedRenderer" | "customLoader" | "dom" | "filesystem" | "material" | "rawPlatformApi" | "runtimeDeclaration", path: string): IDebugPlatformDiagnosticDeclaration {
  return platformDiagnostic("feature", `TN_UNSUPPORTED_FEATURE_${kind.replace(/[A-Z]/g, (part) => `_${part}`).toUpperCase()}`, kind, path);
}

export function unsupportedNetworkingDiagnostic(kind: "multiplayer" | "onlinePresence" | "prediction" | "replication" | "serverAuthority" | "websocket", path: string): IDebugPlatformDiagnosticDeclaration {
  return platformDiagnostic("networking", `TN_UNSUPPORTED_NETWORKING_${kind.replace(/[A-Z]/g, (part) => `_${part}`).toUpperCase()}`, kind, path);
}

export function defineDebugDiagnostics(options: { counters?: IDebugCounterDeclaration[]; draw?: IDebugDrawDeclaration[]; fpsOverlay?: IDebugFpsOverlayDeclaration; platformDiagnostics?: IDebugPlatformDiagnosticDeclaration[] }): IDebugDiagnosticsDeclaration {
  return {
    counters: [...(options.counters ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    draw: [...(options.draw ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    ...(options.fpsOverlay === undefined ? {} : { fpsOverlay: options.fpsOverlay }),
    kind: "DebugDiagnostics",
    platformDiagnostics: [...(options.platformDiagnostics ?? [])].sort((left, right) => left.code.localeCompare(right.code)),
  };
}

function debugDraw(id: string, kind: DebugPrimitiveKind, options: { color?: string; label?: string; lifetimeSeconds?: number; target?: string }, value: Record<string, unknown>): IDebugDrawDeclaration {
  assertText(id, "TN_SDK_DEBUG_DRAW_ID_INVALID", "Debug draw id must not be empty.");
  if (options.lifetimeSeconds !== undefined && (!Number.isFinite(options.lifetimeSeconds) || options.lifetimeSeconds < 0)) {
    throw new SdkError("TN_SDK_DEBUG_LIFETIME_INVALID", `Debug draw '${id}' lifetime must be non-negative.`);
  }
  return {
    ...(options.color === undefined ? {} : { color: options.color }),
    id,
    kind,
    ...(options.label === undefined ? {} : { label: options.label }),
    ...(options.lifetimeSeconds === undefined ? {} : { lifetimeSeconds: options.lifetimeSeconds }),
    ...(options.target === undefined ? {} : { target: options.target }),
    value,
  };
}

function platformDiagnostic(category: IDebugPlatformDiagnosticDeclaration["category"], code: string, kind: string, path: string): IDebugPlatformDiagnosticDeclaration {
  assertText(path, "TN_SDK_DEBUG_DIAGNOSTIC_PATH_INVALID", `Diagnostic '${code}' path must not be empty.`);
  return {
    category,
    code,
    message: `${kind} is not supported by the current portable runtime scope.`,
    path,
    severity: "warning",
    suggestion: "Remove the unsupported declaration or gate it behind a target-specific adapter.",
  };
}

function tuple(value: readonly number[], length: number): number[] {
  if (value.length !== length || value.some((item) => !Number.isFinite(item))) {
    throw new SdkError("TN_SDK_DEBUG_VEC_INVALID", `Debug vector values must be finite vec${length} tuples.`);
  }
  return [...value];
}

function assertPositive(value: number, code: string, message: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new SdkError(code, message);
  }
}

function assertText(value: string, code: string, message: string): void {
  if (value.trim() === "") {
    throw new SdkError(code, message);
  }
}
