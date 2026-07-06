import type { IPlaytestReport } from "./playtest.js";
import type { IPlaytestPathAssertion, IPlaytestScenario } from "./playtestScenario.js";

type Vec3 = [number, number, number];

export interface IPlaytestDiagnostic {
  code: string;
  message: string;
  severity: "error" | "warning";
  suggestion?: string;
}

export interface IPlaytestAssertionResult {
  details?: Record<string, unknown>;
  id: string;
  pass: boolean;
}

export interface IPlaytestObservations {
  animation?: unknown;
  console: Array<{ text: string; type: string }>;
  contacts?: unknown;
  debugColliderCount?: number;
  effectLog?: unknown;
  hud: Record<string, { after?: unknown; before?: unknown }>;
  network: Array<{ method: string; url: string }>;
  resources: Record<string, { after?: unknown; before?: unknown }>;
  runtimeDiagnostics?: unknown;
  visibility?: Record<string, unknown>;
}

export function evaluateRichPlaytestAssertions(input: {
  report: IPlaytestReport;
  scenario: IPlaytestScenario;
}): { assertions: IPlaytestAssertionResult[]; diagnostics: IPlaytestDiagnostic[] } {
  const assertions: IPlaytestAssertionResult[] = [];
  const diagnostics: IPlaytestDiagnostic[] = [];
  const scenarioAssertions = input.scenario.assert;
  if (scenarioAssertions === undefined) {
    return { assertions, diagnostics };
  }
  for (const assertion of scenarioAssertions.resources ?? []) {
    const result = evaluatePathAssertion("resource", assertion, input.report.observations?.resources[assertion.id]);
    assertions.push(result.assertion);
    if (result.diagnostic !== undefined) {
      diagnostics.push({ ...result.diagnostic, code: "TN_PLAYTEST_RESOURCE_ASSERTION_FAILED" });
    }
  }
  for (const assertion of scenarioAssertions.hud ?? []) {
    const result = evaluatePathAssertion("hud", assertion, input.report.observations?.hud[assertion.id]);
    assertions.push(result.assertion);
    if (result.diagnostic !== undefined) {
      diagnostics.push({ ...result.diagnostic, code: "TN_PLAYTEST_HUD_ASSERTION_FAILED" });
    }
  }
  if (scenarioAssertions.diagnostics !== undefined) {
    diagnostics.push(...evaluateDiagnosticsPolicy(input.report, scenarioAssertions.diagnostics));
    assertions.push({
      details: {
        consoleErrors: consoleErrors(input.report.observations?.console ?? []).length,
        networkErrors: input.report.observations?.network.length ?? 0,
        runtimeDiagnostics: runtimeDiagnostics(input.report.observations?.runtimeDiagnostics).length,
      },
      id: "diagnostics",
      pass: !diagnostics.some((diagnostic) => diagnostic.code === "TN_PLAYTEST_CONSOLE_ERROR" || diagnostic.code === "TN_PLAYTEST_NETWORK_ERROR" || diagnostic.code === "TN_PLAYTEST_RUNTIME_DIAGNOSTIC"),
    });
  }
  if (scenarioAssertions.movement?.minVelocity !== undefined) {
    const velocity = input.report.frames <= 0 ? 0 : input.report.distance / input.report.frames;
    const pass = velocity >= scenarioAssertions.movement.minVelocity;
    assertions.push({ details: { minVelocity: scenarioAssertions.movement.minVelocity, velocity }, id: "movement.velocity", pass });
    if (!pass) {
      diagnostics.push({
        code: "TN_PLAYTEST_VELOCITY_ASSERTION_FAILED",
        message: `Entity '${input.report.entity}' velocity ${velocity.toFixed(6)} was below required ${scenarioAssertions.movement.minVelocity}.`,
        severity: "error",
        suggestion: "Check input force/speed tuning and whether the scenario holds input long enough.",
      });
    }
  }
  if (scenarioAssertions.movement?.rotationChanged === true) {
    const rotation = rotationDelta(input.report.effectLog, scenarioAssertions.movement.entity ?? input.report.entity);
    const pass = rotation !== undefined && rotation > 0.0001;
    assertions.push({ details: { rotationDelta: rotation ?? null }, id: "movement.rotation", pass });
    if (!pass) {
      diagnostics.push({
        code: "TN_PLAYTEST_ROTATION_ASSERTION_FAILED",
        message: `Entity '${scenarioAssertions.movement.entity ?? input.report.entity}' did not expose a changed rotation during the playtest.`,
        severity: "error",
        suggestion: "Check turn/yaw script output and ensure Transform rotation changes are emitted.",
      });
    }
  }
  for (const assertion of scenarioAssertions.visibility ?? []) {
    const entity = assertion.entity ?? input.scenario.subject ?? input.report.entity;
    const result = evaluateVisibilityAssertion(entity, assertion.minProjectedPixels, assertion.maxOffscreenRatio, input.scenario.viewport, input.report.observations?.runtimeDiagnostics);
    assertions.push(result.assertion);
    if (result.diagnostic !== undefined) {
      diagnostics.push(result.diagnostic);
    }
  }
  for (const assertion of scenarioAssertions.contacts ?? []) {
    const entity = assertion.entity ?? input.scenario.subject ?? input.report.entity;
    const count = countMatchingEntries(input.report.effectLog, [entity, assertion.with, assertion.kind].filter((item): item is string => item !== undefined));
    const minCount = assertion.minCount ?? 1;
    const pass = count >= minCount;
    assertions.push({ details: { count, entity, kind: assertion.kind, minCount, with: assertion.with }, id: `contact.${entity}`, pass });
    if (!pass) {
      diagnostics.push({
        code: "TN_PLAYTEST_CONTACT_NOT_OBSERVED",
        message: `Expected contact/trigger for '${entity}' was not observed ${minCount} time(s).`,
        severity: "error",
        suggestion: "Check collider/trigger metadata, contact filters, and whether the scenario reaches the target.",
      });
    }
  }
  for (const assertion of scenarioAssertions.animation ?? []) {
    const entity = assertion.entity ?? input.scenario.subject ?? input.report.entity;
    const tokens = [entity, assertion.clip].filter((item): item is string => item !== undefined);
    const count = countMatchingEntries(input.report.effectLog, tokens);
    const minCount = assertion.entered === true || assertion.advancedFrames !== undefined ? 1 : 0;
    const pass = count >= minCount;
    assertions.push({ details: { count, entity, clip: assertion.clip, advancedFrames: assertion.advancedFrames }, id: `animation.${entity}`, pass });
    if (!pass) {
      diagnostics.push({
        code: "TN_PLAYTEST_ANIMATION_NOT_OBSERVED",
        message: `Expected animation evidence for '${entity}'${assertion.clip === undefined ? "" : ` clip '${assertion.clip}'`} was not observed.`,
        severity: "error",
        suggestion: "Check model animation clip wiring and runtime animation playback state.",
      });
    }
  }
  return { assertions, diagnostics };
}

function evaluatePathAssertion(
  kind: "hud" | "resource",
  assertion: IPlaytestPathAssertion,
  observed: { after?: unknown; before?: unknown } | undefined,
): { assertion: IPlaytestAssertionResult; diagnostic?: IPlaytestDiagnostic } {
  const before = readPath(observed?.before, assertion.path);
  const after = readPath(observed?.after, assertion.path);
  const checks: boolean[] = [];
  if (Object.hasOwn(assertion, "equals")) {
    checks.push(jsonEqual(after, assertion.equals));
  }
  if (assertion.gte !== undefined) {
    checks.push(typeof after === "number" && after >= assertion.gte);
  }
  if (assertion.textIncludes !== undefined) {
    checks.push(String(textValue(after)).includes(assertion.textIncludes));
  }
  if (assertion.changed !== undefined) {
    checks.push(assertion.changed ? !jsonEqual(before, after) : jsonEqual(before, after));
  }
  const pass = checks.length > 0 && checks.every(Boolean);
  const result = {
    details: { after, before, id: assertion.id, path: assertion.path },
    id: `${kind}.${assertion.id}${assertion.path === undefined ? "" : `.${assertion.path}`}`,
    pass,
  };
  return pass
    ? { assertion: result }
    : {
        assertion: result,
        diagnostic: {
          code: "",
          message: `${kind === "hud" ? "HUD" : "Resource"} assertion failed for '${assertion.id}'${assertion.path === undefined ? "" : ` path '${assertion.path}'`}.`,
          severity: "error",
          suggestion: kind === "hud" ? "Check UI binding IDs and whether the backing resource changes during the scenario." : "Check resource IDs, script writes, and assertion path spelling.",
        },
      };
}

function evaluateDiagnosticsPolicy(
  report: IPlaytestReport,
  policy: NonNullable<IPlaytestScenario["assert"]>["diagnostics"],
): IPlaytestDiagnostic[] {
  const diagnostics: IPlaytestDiagnostic[] = [];
  if (policy?.runtimeReady === true && report.diagnostics.some((diagnostic) => diagnostic.code === "TN_PLAYTEST_RUNTIME_NOT_READY")) {
    diagnostics.push({
      code: "TN_PLAYTEST_RUNTIME_DIAGNOSTIC",
      message: "Runtime did not reach ready state while diagnostics policy required it.",
      severity: "error",
      suggestion: "Inspect runtime diagnostics and bundle validation output before replaying the scenario.",
    });
  }
  const capturedConsoleErrors = consoleErrors(report.observations?.console ?? []);
  if (policy?.noConsoleErrors === true && capturedConsoleErrors.length > 0) {
    diagnostics.push({
      code: "TN_PLAYTEST_CONSOLE_ERROR",
      message: `${capturedConsoleErrors.length} browser console error(s) were captured during playtest.`,
      severity: "error",
      suggestion: "Open console.json in the playtest artifact directory and fix the first runtime error.",
    });
  }
  if (policy?.noNetworkErrors === true && (report.observations?.network.length ?? 0) > 0) {
    diagnostics.push({
      code: "TN_PLAYTEST_NETWORK_ERROR",
      message: `${report.observations?.network.length ?? 0} failed network request(s) were captured during playtest.`,
      severity: "error",
      suggestion: "Open network.json in the playtest artifact directory and fix missing asset or bundle paths.",
    });
  }
  const runtimeErrors = runtimeDiagnostics(report.observations?.runtimeDiagnostics);
  if (policy?.noRuntimeDiagnostics === true && runtimeErrors.length > 0) {
    diagnostics.push({
      code: "TN_PLAYTEST_RUNTIME_DIAGNOSTIC",
      message: `${runtimeErrors.length} runtime diagnostic error(s) were captured during playtest.`,
      severity: "error",
      suggestion: "Inspect runtime-trace.json and repair the authored source that owns the diagnostic path.",
    });
  }
  return diagnostics;
}

function evaluateVisibilityAssertion(
  entity: string,
  minProjectedPixels: number | undefined,
  maxOffscreenRatio: number | undefined,
  viewport: { height: number; width: number },
  runtimeDiagnosticsValue: unknown,
): { assertion: IPlaytestAssertionResult; diagnostic?: IPlaytestDiagnostic } {
  const rendered = renderedEntity(runtimeDiagnosticsValue, entity);
  const bounds = isRecord(rendered?.projectedBounds) ? rendered.projectedBounds : undefined;
  const min = Array.isArray(bounds?.min) ? bounds.min : undefined;
  const max = Array.isArray(bounds?.max) ? bounds.max : undefined;
  const projectedPixels = min === undefined || max === undefined
    ? undefined
    : Math.max(0, ((Number(max[0]) - Number(min[0])) / 2) * viewport.width) * Math.max(0, ((Number(max[1]) - Number(min[1])) / 2) * viewport.height);
  const offscreenRatio = min === undefined || max === undefined ? undefined : projectedOffscreenRatio([Number(min[0]), Number(min[1])], [Number(max[0]), Number(max[1])]);
  const pass = rendered !== undefined
    && bounds !== undefined
    && (minProjectedPixels === undefined || (projectedPixels ?? 0) >= minProjectedPixels)
    && (maxOffscreenRatio === undefined || (offscreenRatio ?? 1) <= maxOffscreenRatio);
  const assertion = { details: { entity, maxOffscreenRatio, minProjectedPixels, offscreenRatio, projectedPixels }, id: `visibility.${entity}`, pass };
  return pass
    ? { assertion }
    : {
        assertion,
        diagnostic: {
          code: "TN_PLAYTEST_VISIBILITY_FAILED",
          message: `Entity '${entity}' did not satisfy projected visibility assertions.`,
          severity: "error",
          suggestion: "Check camera framing, clipping range, entity scale, and viewport-specific layout.",
        },
      };
}

function countMatchingEntries(effectLog: unknown, tokens: readonly string[]): number {
  if (tokens.length === 0 || !isRecord(effectLog) || !Array.isArray(effectLog.entries)) {
    return 0;
  }
  return effectLog.entries.filter((entry) => {
    const text = JSON.stringify(entry);
    return tokens.every((token) => text.includes(token));
  }).length;
}

function rotationDelta(effectLog: unknown, entityId: string): number | undefined {
  if (!isRecord(effectLog) || !Array.isArray(effectLog.entries)) {
    return undefined;
  }
  const rotations = effectLog.entries
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .filter((entry) => entry.kind === "patch" && entry.command === "setComponent" && entry.component === "Transform" && entry.entity === entityId)
    .map((entry) => readRotation(entry.value))
    .filter((item): item is Vec3 => item !== undefined);
  const first = rotations[0];
  const last = rotations[rotations.length - 1];
  return first === undefined || last === undefined ? undefined : vectorDistance(first, last);
}

function renderedEntity(runtimeDiagnosticsValue: unknown, entity: string): Record<string, unknown> | undefined {
  if (!isRecord(runtimeDiagnosticsValue) || !isRecord(runtimeDiagnosticsValue.scene) || !Array.isArray(runtimeDiagnosticsValue.scene.renderedEntities)) {
    return undefined;
  }
  return runtimeDiagnosticsValue.scene.renderedEntities.find((item): item is Record<string, unknown> => isRecord(item) && item.id === entity);
}

function projectedOffscreenRatio(min: [number, number], max: [number, number]): number {
  const width = Math.max(0, max[0] - min[0]);
  const height = Math.max(0, max[1] - min[1]);
  const area = width * height;
  if (area === 0) {
    return 1;
  }
  const visibleWidth = Math.max(0, Math.min(max[0], 1) - Math.max(min[0], -1));
  const visibleHeight = Math.max(0, Math.min(max[1], 1) - Math.max(min[1], -1));
  return 1 - Math.max(0, visibleWidth * visibleHeight) / area;
}

function runtimeDiagnostics(value: unknown): unknown[] {
  if (!isRecord(value)) {
    return [];
  }
  const recentRuntimeErrors = Array.isArray(value.recentRuntimeErrors) ? value.recentRuntimeErrors : [];
  const resourceFailures = isRecord(value.assets) && Array.isArray(value.assets.resourceFailures) ? value.assets.resourceFailures : [];
  return [...recentRuntimeErrors, ...resourceFailures];
}

function consoleErrors(entries: Array<{ type: string }>): Array<{ type: string }> {
  return entries.filter((entry) => entry.type === "error" || entry.type === "assert");
}

function readPath(value: unknown, path: string | undefined): unknown {
  if (path === undefined || path.length === 0) {
    return value;
  }
  return path.split(".").reduce<unknown>((current, part) => {
    if (!isRecord(current)) {
      return undefined;
    }
    return current[part];
  }, value);
}

function textValue(value: unknown): unknown {
  if (isRecord(value)) {
    return value.text ?? value.label ?? value.valueText ?? value.value;
  }
  return value;
}

function readRotation(value: unknown): Vec3 | undefined {
  if (!isRecord(value) || !Array.isArray(value.rotation) || value.rotation.length < 3) {
    return undefined;
  }
  const rotation = value.rotation.slice(0, 3).map((item) => typeof item === "number" && Number.isFinite(item) ? item : Number.NaN);
  return rotation.every(Number.isFinite) ? rotation as Vec3 : undefined;
}

function vectorDistance(left: Vec3, right: Vec3): number {
  const dx = right[0] - left[0];
  const dy = right[1] - left[1];
  const dz = right[2] - left[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
