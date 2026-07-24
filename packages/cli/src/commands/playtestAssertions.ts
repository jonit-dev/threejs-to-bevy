import type { IPlaytestReport } from "./playtest.js";
import type { IPlaytestPathAssertion, IPlaytestScenario, IPlaytestStateAssertion, IPlaytestTagCountAssertion } from "./playtestScenario.js";

type Vec3 = [number, number, number];

export interface IPlaytestAssertionSchemaField {
  description: string;
  name: string;
  required?: boolean;
  type: string;
}

export interface IPlaytestAssertionSchemaEntry {
  description: string;
  example: unknown;
  fields: IPlaytestAssertionSchemaField[];
  kind: keyof NonNullable<IPlaytestScenario["assert"]>;
}

export const PLAYTEST_ASSERTION_REGISTRY: readonly IPlaytestAssertionSchemaEntry[] = [
  {
    description: "Proves aerodynamic force telemetry and signed control-surface delivery for a flight entity.",
    example: { aerodynamics: [{ controls: [{ sign: "negative", surface: "elevator" }], entity: "aircraft", minForceSamples: 4 }] },
    fields: [
      { description: "Aerodynamic entity id.", name: "entity", required: true, type: "string" },
      { description: "Minimum physics-debug samples containing finite aerodynamic force vectors.", name: "minForceSamples", type: "positive integer" },
      { description: "Signed surface values required in physics.aerodynamics.setInputs calls.", name: "controls", type: "Array<{ surface: string, sign: 'negative' | 'positive', minAbs?: number }>" },
      { description: "Signed net aerodynamic torque, optionally relative to another labeled step.", name: "torques", type: "Array<{ label: string, relativeToLabel?: string, axis: 'x' | 'y' | 'z', sign: 'negative' | 'positive', minAbs?: number }>" },
    ],
    kind: "aerodynamics",
  },
  {
    description: "Proves screenshot change, populated regions, and sustained projected entity visibility.",
    example: { visual: [{ frameDiff: { minChangedPixelRatio: 0.01 }, entityVisible: { entity: "board.e4", minProjectedPixels: 20, throughoutFrames: true } }] },
    fields: [
      { description: "Before/after changed-pixel ratio bounds.", name: "frameDiff", type: "{ minChangedPixelRatio?: number, maxChangedPixelRatio?: number }" },
      { description: "Pixel region that must remain populated.", name: "region", type: "{ x: number, y: number, width: number, height: number, minNonblankPixelRatio?: number }" },
      { description: "Entity projected-pixel floor, optionally across all captured samples.", name: "entityVisible", type: "{ entity: string, minProjectedPixels: number, throughoutFrames?: boolean }" },
    ],
    kind: "visual",
  },
  {
    description: "Proves the subject moved, reached a minimum velocity, or changed rotation during held input.",
    example: { movement: { entity: "player", minDistance: 0.5, minVelocity: 0.01, rotationChanged: true } },
    fields: [
      { description: "Entity id to measure. Defaults to scenario subject.", name: "entity", type: "string" },
      { description: "Expected movement axis: x, y, or z.", name: "axis", type: "string" },
      { description: "Minimum signed movement on a specific axis, for example { axis: '+y', min: 0.2 }.", name: "minAxisDelta", type: "{ axis: string, min: number }" },
      { description: "Minimum signed resolved character.move displacement on a specific axis, for example { axis: '+y', min: 0.2 }.", name: "minResolvedAxisDelta", type: "{ axis: string, min: number }" },
      { description: "Minimum distance moved over the scenario.", name: "minDistance", type: "number" },
      { description: "Maximum distance allowed; use for blocked-movement proof.", name: "maxDistance", type: "number" },
      { description: "Minimum distance per frame.", name: "minVelocity", type: "number" },
      { description: "Minimum accumulated path length; use with minDistance to catch movement that cancels out.", name: "pathLength", type: "number" },
      { description: "Require any observed rotation delta.", name: "rotationChanged", type: "boolean" },
    ],
    kind: "movement",
  },
  {
    description: "Proves a camera follows an entity or keeps a target in view.",
    example: { camera: { entity: "camera.main", follows: "player", within: 10, targetInViewport: true } },
    fields: [
      { description: "Camera entity id.", name: "entity", type: "string" },
      { description: "Entity the camera should follow.", name: "follows", type: "string" },
      { description: "Maximum allowed separation.", name: "within", type: "number" },
      { description: "Require the target to be visible in the viewport.", name: "targetInViewport", type: "boolean" },
    ],
    kind: "camera",
  },
  {
    description: "Proves resource state after the scenario through equals, gte, textIncludes, or changed checks.",
    example: { resources: [{ id: "GameState", path: "score", gte: 1, changed: true }] },
    fields: [
      { description: "Resource id.", name: "id", required: true, type: "string" },
      { description: "Optional dot path inside the resource snapshot.", name: "path", type: "string" },
      { description: "Exact expected value.", name: "equals", type: "json" },
      { description: "Minimum numeric value.", name: "gte", type: "number" },
      { description: "Substring expected in the observed value.", name: "textIncludes", type: "string" },
      { description: "Require before and after values to differ or remain equal.", name: "changed", type: "boolean" },
      { description: "Require the value assertion after every labeled scenario step.", name: "throughoutSteps", type: "boolean" },
      { description: "Expected values at named scenario-step samples.", name: "atSteps", type: "Array<{ label: string, equals?: json, textIncludes?: string }>" },
    ],
    kind: "resources",
  },
  {
    description: "Proves the final count of entities carrying a bounded runtime tag.",
    example: { tags: [{ tag: "coin", count: 10 }] },
    fields: [
      { description: "Entity tag to count.", name: "tag", required: true, type: "string" },
      { description: "Exact expected entity count.", name: "count", type: "non-negative integer" },
      { description: "Minimum expected entity count.", name: "gte", type: "non-negative integer" },
    ],
    kind: "tags",
  },
  {
    description: "Proves an entity's final runtime-owned state-machine state.",
    example: { states: [{ entity: "guard", equals: "chase" }] },
    fields: [
      { description: "Entity carrying the StateMachine component.", name: "entity", required: true, type: "string" },
      { description: "Expected current state name.", name: "equals", required: true, type: "string" },
    ],
    kind: "states",
  },
  {
    description: "Proves retained UI/HUD text or values after the scenario.",
    example: { hud: [{ id: "score-label", textIncludes: "Score" }] },
    fields: [
      { description: "UI node id.", name: "id", required: true, type: "string" },
      { description: "Optional dot path inside the UI snapshot.", name: "path", type: "string" },
      { description: "Exact expected value.", name: "equals", type: "json" },
      { description: "Minimum numeric value.", name: "gte", type: "number" },
      { description: "Substring expected in the observed value.", name: "textIncludes", type: "string" },
      { description: "Require before and after values to differ or remain equal.", name: "changed", type: "boolean" },
    ],
    kind: "hud",
  },
  {
    description: "Proves console, network, runtime, and readiness diagnostics stayed clean.",
    example: { diagnostics: { noConsoleErrors: true, noNetworkErrors: true, noRuntimeDiagnostics: true, runtimeReady: true } },
    fields: [
      { description: "Fail on captured console errors.", name: "noConsoleErrors", type: "boolean" },
      { description: "Fail on captured network errors.", name: "noNetworkErrors", type: "boolean" },
      { description: "Fail on runtime diagnostics.", name: "noRuntimeDiagnostics", type: "boolean" },
      { description: "Require runtime readiness.", name: "runtimeReady", type: "boolean" },
    ],
    kind: "diagnostics",
  },
  {
    description: "Proves projected entity visibility in the viewport.",
    example: { visibility: [{ entity: "player", minProjectedPixels: 1200, maxOffscreenRatio: 0.05 }] },
    fields: [
      { description: "Entity id. Defaults to scenario subject.", name: "entity", type: "string" },
      { description: "Minimum projected pixel area.", name: "minProjectedPixels", type: "number" },
      { description: "Maximum allowed offscreen ratio.", name: "maxOffscreenRatio", type: "number" },
    ],
    kind: "visibility",
  },
  {
    description: "Proves contact or trigger evidence appeared in the effect log.",
    example: { contacts: [{ entity: "player", with: "pickup", kind: "trigger", minCount: 1 }] },
    fields: [
      { description: "Entity id. Defaults to scenario subject.", name: "entity", type: "string" },
      { description: "Other entity or tag token expected in the contact evidence.", name: "with", type: "string" },
      { description: "Contact kind token, such as contact or trigger.", name: "kind", type: "string" },
      { description: "Minimum number of matching observations.", name: "minCount", type: "number" },
    ],
    kind: "contacts",
  },
  {
    description: "Proves rendered scene geometry occludes the segment between an origin entity and target.",
    example: { occluded: [{ entity: "listener", target: "emitter" }] },
    fields: [
      { description: "Optional origin/listener entity token expected in the raycast request.", name: "entity", type: "string" },
      { description: "Optional target/emitter entity token expected in the raycast request.", name: "target", type: "string" },
    ],
    kind: "occluded",
  },
  {
    description: "Proves animation evidence appeared in the effect log.",
    example: { animation: [{ entity: "player", clip: "run", entered: true, advancedFrames: 5 }] },
    fields: [
      { description: "Entity id. Defaults to scenario subject.", name: "entity", type: "string" },
      { description: "Animation clip id or name.", name: "clip", type: "string" },
      { description: "Require entering the animation state.", name: "entered", type: "boolean" },
      { description: "Require animation advancement evidence.", name: "advancedFrames", type: "number" },
    ],
    kind: "animation",
  },
] as const;

export interface IPlaytestDiagnostic {
  artifactPath?: string;
  code: string;
  exportName?: string;
  gate?: "waived-headless";
  message: string;
  modulePath?: string;
  observedRuntimePath?: string;
  path?: string;
  resourceId?: string;
  severity: "error" | "warning";
  sourcePath?: string;
  suggestion?: string;
  systemId?: string;
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
  effectLogSeries?: Array<{ label: string; snapshot: unknown; tick: number }>;
  hud: Record<string, { after?: unknown; before?: unknown }>;
  network: Array<{ method: string; url: string }>;
  physicsDebug?: unknown;
  physicsDebugSeries?: Array<{ label: string; snapshot: unknown; tick: number }>;
  resources: Record<string, { after?: unknown; before?: unknown }>;
  resourceSeries?: Array<{ label: string; snapshots: Record<string, unknown>; tick: number }>;
  runtimeObservations?: unknown;
  runtimeDiagnostics?: unknown;
  visibility?: Record<string, unknown>;
  visual?: {
    changedPixelRatio?: number;
    nonblankRegions?: Array<{ height: number; nonblankPixelRatio: number; width: number; x: number; y: number }>;
    runtimeDiagnosticsSeries?: unknown[];
  };
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
  if ((scenarioAssertions.visual?.length ?? 0) > 0 && input.scenario.target !== "web") {
    diagnostics.push({ code: "TN_PLAYTEST_VISUAL_ASSERTION_UNSUPPORTED", message: `Visual assertion sampling is not supported for target '${input.scenario.target}'.`, severity: "warning", suggestion: "Run the scenario with target web until native screenshot-series support lands." });
    assertions.push(...scenarioAssertions.visual!.map((_, index) => ({ id: `visual.${index}`, pass: true, details: { skipped: true, target: input.scenario.target } })));
  }
  for (const [index, visual] of (input.scenario.target === "web" ? scenarioAssertions.visual ?? [] : []).entries()) {
    if (visual.frameDiff !== undefined) {
      const ratio = input.report.observations?.visual?.changedPixelRatio;
      const pass = ratio !== undefined
        && (visual.frameDiff.minChangedPixelRatio === undefined || ratio >= visual.frameDiff.minChangedPixelRatio)
        && (visual.frameDiff.maxChangedPixelRatio === undefined || ratio <= visual.frameDiff.maxChangedPixelRatio);
      assertions.push({ id: `visual.${index}.frameDiff`, pass, details: { changedPixelRatio: ratio, ...visual.frameDiff } });
      if (!pass) diagnostics.push({ code: "TN_PLAYTEST_FRAME_DIFF_FAILED", message: `Screenshot changed-pixel ratio ${ratio ?? "unavailable"} was outside the asserted range.`, severity: "error", suggestion: "Check whether the expected visual change rendered and whether the thresholds match the scenario." });
    }
    if (visual.region !== undefined) {
      const observed = input.report.observations?.visual?.nonblankRegions?.find((region) => region.x === visual.region?.x && region.y === visual.region.y && region.width === visual.region.width && region.height === visual.region.height);
      const minimum = visual.region.minNonblankPixelRatio ?? 0.002;
      const pass = observed !== undefined && observed.nonblankPixelRatio >= minimum;
      assertions.push({ id: `visual.${index}.region`, pass, details: { minimum, observed: observed?.nonblankPixelRatio } });
      if (!pass) diagnostics.push({ code: "TN_PLAYTEST_REGION_BLANK", message: `Screenshot region at (${visual.region.x}, ${visual.region.y}) did not meet nonblank ratio ${minimum}.`, severity: "error", suggestion: "Check camera framing and whether expected geometry renders in the asserted region." });
    }
    if (visual.entityVisible !== undefined) {
      const samples = input.report.observations?.visual?.runtimeDiagnosticsSeries ?? [input.report.observations?.runtimeDiagnostics];
      const selected = visual.entityVisible.throughoutFrames === true ? samples : samples.slice(-1);
      const projected = selected.map((sample) => projectedPixelsForEntity(runtimeDiagnosticsSnapshot(sample), visual.entityVisible!.entity, input.scenario.viewport));
      const pass = projected.length > 0 && projected.every((pixels) => pixels !== undefined && pixels >= visual.entityVisible!.minProjectedPixels);
      assertions.push({ id: `visual.${index}.entityVisible`, pass, details: { entity: visual.entityVisible.entity, projectedPixels: projected } });
      if (!pass) diagnostics.push({ code: "TN_PLAYTEST_ENTITY_VISIBILITY_DROPPED", message: `Entity '${visual.entityVisible.entity}' dropped below ${visual.entityVisible.minProjectedPixels} projected pixels.`, severity: "error", suggestion: "Check per-frame visibility, camera clipping, scale, and renderer state." });
    }
  }
  for (const assertion of scenarioAssertions.resources ?? []) {
    if (hasFinalPathExpectation(assertion)) {
      const result = evaluatePathAssertion("resource", assertion, input.report.observations?.resources[assertion.id], {
        effectLog: input.report.effectLog ?? input.report.observations?.effectLog,
        movedDistance: input.report.distance,
        scenarioSourcePath: input.scenario.sourcePath,
      });
      assertions.push(result.assertion);
      if (result.diagnostic !== undefined) {
        diagnostics.push({ ...result.diagnostic, code: result.diagnostic.code || "TN_PLAYTEST_RESOURCE_ASSERTION_FAILED" });
      }
    }
    if (assertion.throughoutSteps === true) {
      const samples = (input.report.observations?.resourceSeries ?? []).map((sample) => ({
        label: sample.label,
        value: readPath(sample.snapshots[assertion.id], assertion.path),
      }));
      const pass = samples.length === input.scenario.steps.length && samples.every((sample) => pathValuePass(assertion, sample.value));
      assertions.push({ details: { samples }, id: `resource.${assertion.id}.${assertion.path ?? "value"}.throughoutSteps`, pass });
      if (!pass) diagnostics.push({
        code: "TN_PLAYTEST_RESOURCE_TRANSITION_ASSERTION_FAILED",
        message: `Resource '${assertion.id}'${assertion.path === undefined ? "" : ` path '${assertion.path}'`} did not satisfy the assertion after every scenario step.`,
        observedRuntimePath: "observations.json/resourceSeries",
        severity: "error",
        suggestion: "Inspect the labeled resource samples and fix the transient gameplay-state transition.",
      });
    }
    if ((assertion.atSteps?.length ?? 0) > 0) {
      const samples = assertion.atSteps!.map((expected) => {
        const sample = (input.report.observations?.resourceSeries ?? []).find((candidate) => candidate.label === expected.label);
        const value = readPath(sample?.snapshots[assertion.id], assertion.path);
        const pass = sample !== undefined
          && (!Object.hasOwn(expected, "equals") || jsonEqual(value, expected.equals))
          && (expected.textIncludes === undefined || String(textValue(value)).includes(expected.textIncludes));
        return { expected, pass, value };
      });
      const pass = samples.every((sample) => sample.pass);
      assertions.push({ details: { samples }, id: `resource.${assertion.id}.${assertion.path ?? "value"}.atSteps`, pass });
      if (!pass) diagnostics.push({
        code: "TN_PLAYTEST_RESOURCE_TRANSITION_ASSERTION_FAILED",
        message: `Resource '${assertion.id}'${assertion.path === undefined ? "" : ` path '${assertion.path}'`} did not match the expected labeled-step transition.`,
        observedRuntimePath: "observations.json/resourceSeries",
        severity: "error",
        suggestion: "Inspect the failed and restored labeled samples and fix the retry transition.",
      });
    }
  }
  for (const [index, assertion] of (scenarioAssertions.aerodynamics ?? []).entries()) {
    const forceSamples = aerodynamicForceSampleCount(input.report.observations?.physicsDebugSeries, assertion.entity);
    const controlsSupported = input.scenario.target === "web";
    const controls = (assertion.controls ?? []).map((control) => ({
      ...control,
      observed: aerodynamicControlValues(
        input.report.effectLog ?? input.report.observations?.effectLog,
        input.report.observations?.effectLogSeries,
        assertion.entity,
        control.surface,
      ),
      ...(controlsSupported ? {} : { skipped: true, reason: "native-service-log-unavailable" }),
    }));
    const torques = (assertion.torques ?? []).map((torque) => {
      const value = aerodynamicTorqueAtLabel(input.report.observations?.physicsDebugSeries, assertion.entity, torque.label)?.[axisIndex(torque.axis)];
      const relative = torque.relativeToLabel === undefined
        ? undefined
        : aerodynamicTorqueAtLabel(input.report.observations?.physicsDebugSeries, assertion.entity, torque.relativeToLabel)?.[axisIndex(torque.axis)];
      return { ...torque, observed: value === undefined || (torque.relativeToLabel !== undefined && relative === undefined) ? undefined : value - (relative ?? 0) };
    });
    const forcePass = assertion.minForceSamples === undefined || forceSamples >= assertion.minForceSamples;
    const controlsPass = controlsSupported
      ? controls.every((control) => control.observed.some((value) => Math.abs(value) >= (control.minAbs ?? 0.01) && (control.sign === "positive" ? value > 0 : value < 0)))
      : torques.length > 0;
    const torquesPass = torques.every((torque) => torque.observed !== undefined
      && Math.abs(torque.observed) >= (torque.minAbs ?? 0.01)
      && (torque.sign === "positive" ? torque.observed > 0 : torque.observed < 0));
    const pass = forcePass && controlsPass && torquesPass && (assertion.minForceSamples !== undefined || controls.length > 0 || torques.length > 0);
    assertions.push({ details: { controls, forceSamples, minimumForceSamples: assertion.minForceSamples, torques }, id: `aerodynamics.${index}`, pass });
    if (!pass) {
      diagnostics.push({
        artifactPath: assertion.minForceSamples !== undefined ? "observations.json" : "effect-log.json",
        code: "TN_PLAYTEST_AERODYNAMICS_ASSERTION_FAILED",
        message: `Aerodynamic proof for '${assertion.entity}' did not observe the required finite force samples and signed control values.`,
        observedRuntimePath: "observations.json/physicsDebugSeries/artifact/primitives[category=aero] | effect-log.json/entries[service=physics.aerodynamics.setInputs]",
        severity: "error",
        suggestion: "Check AerodynamicBody metadata, physics debug capture, input-axis bindings, and surface sign mapping.",
      });
    }
  }
  for (const assertion of scenarioAssertions.hud ?? []) {
    const result = evaluatePathAssertion("hud", assertion, input.report.observations?.hud[assertion.id], {});
    assertions.push(result.assertion);
    if (result.diagnostic !== undefined) {
      diagnostics.push({ ...result.diagnostic, code: result.diagnostic.code || "TN_PLAYTEST_HUD_ASSERTION_FAILED" });
    }
  }
  for (const assertion of scenarioAssertions.tags ?? []) {
    const result = evaluateTagCountAssertion(assertion, input.report.observations?.runtimeObservations);
    assertions.push(result.assertion);
    if (result.diagnostic !== undefined) {
      diagnostics.push(result.diagnostic);
    }
  }
  for (const assertion of scenarioAssertions.states ?? []) {
    const result = evaluateStateAssertion(assertion, input.report.observations?.runtimeObservations);
    assertions.push(result.assertion);
    if (result.diagnostic !== undefined) {
      diagnostics.push(result.diagnostic);
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
  if (scenarioAssertions.movement?.maxDistance !== undefined) {
    const pass = input.report.distance <= scenarioAssertions.movement.maxDistance;
    assertions.push({ details: { distance: input.report.distance, maximum: scenarioAssertions.movement.maxDistance }, id: "movement.maxDistance", pass });
    if (!pass) {
      diagnostics.push({
        code: "TN_PLAYTEST_MOVEMENT_ASSERTION_FAILED",
        message: `Entity '${input.report.entity}' moved ${input.report.distance.toFixed(6)}, above allowed ${scenarioAssertions.movement.maxDistance}.`,
        severity: "error",
        suggestion: "Check bounds/blocked-cell handling and ensure the scenario drives the intended blocked direction.",
      });
    }
  }
  if (scenarioAssertions.movement?.pathLength !== undefined) {
    const pathLength = input.report.pathLength ?? input.report.distance;
    const pass = pathLength >= scenarioAssertions.movement.pathLength;
    assertions.push({ details: { minimum: scenarioAssertions.movement.pathLength, pathLength }, id: "movement.pathLength", pass });
    if (!pass) {
      diagnostics.push({
        code: "TN_PLAYTEST_PATH_LENGTH_ASSERTION_FAILED",
        message: `Entity '${input.report.entity}' accumulated path length ${pathLength.toFixed(6)}, below required ${scenarioAssertions.movement.pathLength}.`,
        severity: "error",
        suggestion: "Use pathLength with minDistance to distinguish actual traversal from a route that returns to its starting point.",
      });
    }
  }
  if (scenarioAssertions.movement?.minAxisDelta !== undefined) {
    const expectation = parseMovementAxisExpectation(scenarioAssertions.movement.minAxisDelta.axis);
    let rawDelta: number | undefined;
    if (expectation !== undefined && input.report.movementDelta !== undefined) {
      rawDelta = input.report.movementDelta[axisIndex(expectation.axis)];
    }
    const signedDelta = rawDelta === undefined || expectation === undefined ? undefined : rawDelta * (expectation.sign ?? 1);
    const pass = signedDelta !== undefined && signedDelta >= scenarioAssertions.movement.minAxisDelta.min;
    assertions.push({
      details: {
        axis: scenarioAssertions.movement.minAxisDelta.axis,
        min: scenarioAssertions.movement.minAxisDelta.min,
        rawDelta: rawDelta ?? null,
        signedDelta: signedDelta ?? null,
      },
      id: "movement.axisDelta",
      pass,
    });
    if (!pass) {
      diagnostics.push({
        code: "TN_PLAYTEST_AXIS_DELTA_ASSERTION_FAILED",
        message: `Entity '${scenarioAssertions.movement.entity ?? input.report.entity}' did not move ${scenarioAssertions.movement.minAxisDelta.min} units on ${scenarioAssertions.movement.minAxisDelta.axis}.`,
        severity: "error",
        suggestion: "Check route setup, collision response, and whether the scenario ends on the expected vertical surface.",
      });
    }
  }
  if (scenarioAssertions.movement?.minResolvedAxisDelta !== undefined) {
    const entity = scenarioAssertions.movement.entity ?? input.scenario.subject ?? input.report.entity;
    const expectation = parseMovementAxisExpectation(scenarioAssertions.movement.minResolvedAxisDelta.axis);
    const resolved = expectation === undefined ? undefined : maxResolvedAxisDelta(input.report.effectLog, entity, expectation, input.report.before?.position);
    const pass = resolved !== undefined && resolved >= scenarioAssertions.movement.minResolvedAxisDelta.min;
    assertions.push({
      details: {
        axis: scenarioAssertions.movement.minResolvedAxisDelta.axis,
        entity,
        min: scenarioAssertions.movement.minResolvedAxisDelta.min,
        signedDelta: resolved ?? null,
      },
      id: "movement.resolvedAxisDelta",
      pass,
    });
    if (!pass) {
      diagnostics.push({
        code: "TN_PLAYTEST_RESOLVED_AXIS_DELTA_ASSERTION_FAILED",
        message: `Entity '${entity}' did not resolve ${scenarioAssertions.movement.minResolvedAxisDelta.min} units on ${scenarioAssertions.movement.minResolvedAxisDelta.axis}.`,
        severity: "error",
        suggestion: "Check character.move effect-log entries, route setup, collision response, and whether the scenario reaches the expected slope or step surface.",
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
    if (assertion.requiredOn !== undefined && !assertion.requiredOn.includes(input.scenario.target)) {
      assertions.push({
        details: { entity, requiredOn: assertion.requiredOn, skipped: true, target: input.scenario.target },
        id: `contact.${entity}`,
        pass: true,
      });
      continue;
    }
    const tokens = [entity, assertion.with, assertion.kind].filter((item): item is string => item !== undefined);
    const effectEvidence = mergeEffectLogs(input.report.effectLog, input.report.observations?.effectLogSeries);
    const count = countMatchingEntries(effectEvidence, tokens);
    const minCount = assertion.minCount ?? 1;
    const pass = count >= minCount;
    assertions.push({ details: { count, entity, kind: assertion.kind, minCount, with: assertion.with }, id: `contact.${entity}`, pass });
    if (!pass) {
      const partial = summarizeMatchingEntries(effectEvidence, [entity, assertion.with].filter((item): item is string => item !== undefined));
      diagnostics.push({
        artifactPath: "effect-log.json",
        code: "TN_PLAYTEST_CONTACT_NOT_OBSERVED",
        message: `Expected contact/trigger for '${entity}' was not observed ${minCount} time(s).`,
        observedRuntimePath: `effect-log.json/entries[kind=service|event,entity=${entity}]`,
        path: `${input.scenario.sourcePath ?? "playtest"}/assert/contacts/${entity}`,
        severity: "error",
        ...(input.scenario.sourcePath === undefined ? {} : { sourcePath: input.scenario.sourcePath }),
        ...(partial?.systemId === undefined ? {} : { systemId: partial.systemId, sourcePath: partial.sourcePath }),
        suggestion: partial === undefined
          ? "Check collider/trigger metadata, contact filters, and whether the scenario reaches the target. Inspect effect-log.json for physics service calls and contact events."
          : `effect-log.json contains ${partial.entryCount} related runtime entr${partial.entryCount === 1 ? "y" : "ies"} from ${partial.systems}, but none satisfied the contact assertion. Check collider/trigger metadata, contact filters, and route timing in the listed system(s).`,
      });
    }
  }
  for (const assertion of scenarioAssertions.occluded ?? []) {
    const matches = matchingOccludedRaycasts(input.report.effectLog, assertion.entity, assertion.target);
    const pass = matches > 0;
    assertions.push({ details: { count: matches, entity: assertion.entity, target: assertion.target }, id: `occluded.${assertion.entity ?? "ray"}`, pass });
    if (!pass) diagnostics.push({
      artifactPath: "effect-log.json",
      code: "TN_PLAYTEST_OCCLUSION_NOT_OBSERVED",
      message: "Expected a render scene-ray query or physics raycast result with hit=true, but no matching occlusion evidence was observed.",
      observedRuntimePath: "effect-log.json/entries[service=render.sceneRayQuery|physics.raycast]/payload/result/hit",
      severity: "error",
      suggestion: "Check the listener/emitter entity ids and rendered occluder geometry, then inspect effect-log.json for the scene-query request and hit result.",
    });
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

function evaluateTagCountAssertion(
  assertion: IPlaytestTagCountAssertion,
  observations: unknown,
): { assertion: IPlaytestAssertionResult; diagnostic?: IPlaytestDiagnostic } {
  const gameplay = gameplayObservations(observations);
  const tags = isRecord(gameplay?.tags) ? gameplay.tags : undefined;
  const candidate = tags?.[assertion.tag];
  const summary = isRecord(candidate) ? candidate : undefined;
  const count = typeof summary?.count === "number" ? summary.count : undefined;
  const pass = count !== undefined
    && (assertion.count === undefined || count === assertion.count)
    && (assertion.gte === undefined || count >= assertion.gte);
  const result = { details: { count: count ?? null, expected: assertion, tag: assertion.tag }, id: `tags.${assertion.tag}`, pass };
  return pass
    ? { assertion: result }
    : {
        assertion: result,
        diagnostic: {
          code: "TN_PLAYTEST_TAG_COUNT_ASSERTION_FAILED",
          message: `Tag '${assertion.tag}' count ${count === undefined ? "was unavailable" : count} did not satisfy the expected count.`,
          severity: "error",
          suggestion: "Ensure the runtime entity tags are authored and inspect runtimeObservations.gameplay.tags in the playtest artifact.",
        },
      };
}

function evaluateStateAssertion(
  assertion: IPlaytestStateAssertion,
  observations: unknown,
): { assertion: IPlaytestAssertionResult; diagnostic?: IPlaytestDiagnostic } {
  const gameplay = gameplayObservations(observations);
  const states = isRecord(gameplay?.states) ? gameplay.states : undefined;
  const observed = typeof states?.[assertion.entity] === "string" ? states[assertion.entity] : undefined;
  const pass = observed === assertion.equals;
  const result = { details: { entity: assertion.entity, expected: assertion.equals, observed: observed ?? null }, id: `states.${assertion.entity}`, pass };
  return pass
    ? { assertion: result }
    : {
        assertion: result,
        diagnostic: {
          code: "TN_PLAYTEST_STATE_ASSERTION_FAILED",
          message: `Entity '${assertion.entity}' state ${observed === undefined ? "was unavailable" : `'${observed}'`} did not equal '${assertion.equals}'.`,
          severity: "error",
          suggestion: "Ensure the entity has a StateMachine component and inspect runtimeObservations.gameplay.states in the playtest artifact.",
        },
      };
}

function gameplayObservations(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const gameplay = value.gameplay;
  return isRecord(gameplay) ? gameplay : undefined;
}

function evaluatePathAssertion(
  kind: "hud" | "resource",
  assertion: IPlaytestPathAssertion,
  observed: { after?: unknown; before?: unknown } | undefined,
  context: { effectLog?: unknown; movedDistance?: number; scenarioSourcePath?: string },
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
    details: { after, before, expected: expectedPathAssertion(assertion), id: assertion.id, path: assertion.path },
    id: `${kind}.${assertion.id}${assertion.path === undefined ? "" : `.${assertion.path}`}`,
    pass,
  };
  return pass
    ? { assertion: result }
    : {
        assertion: result,
        diagnostic: pathAssertionDiagnostic(kind, assertion, before, after, context),
      };
}

function hasFinalPathExpectation(assertion: IPlaytestPathAssertion): boolean {
  return Object.hasOwn(assertion, "equals")
    || assertion.gte !== undefined
    || assertion.textIncludes !== undefined
    || assertion.changed !== undefined;
}

function pathValuePass(assertion: IPlaytestPathAssertion, value: unknown): boolean {
  const checks: boolean[] = [];
  if (Object.hasOwn(assertion, "equals")) checks.push(jsonEqual(value, assertion.equals));
  if (assertion.gte !== undefined) checks.push(typeof value === "number" && value >= assertion.gte);
  if (assertion.textIncludes !== undefined) checks.push(String(textValue(value)).includes(assertion.textIncludes));
  return checks.length > 0 && checks.every(Boolean);
}

function aerodynamicForceSampleCount(series: IPlaytestObservations["physicsDebugSeries"], entity: string): number {
  return (series ?? []).filter(({ snapshot }) => {
    if (!isRecord(snapshot) || !isRecord(snapshot.artifact) || !Array.isArray(snapshot.artifact.primitives)) return false;
    return snapshot.artifact.primitives.some((primitive) => isRecord(primitive)
      && primitive.category === "aero"
      && primitive.entity === entity
      && typeof primitive.value === "number"
      && Number.isFinite(primitive.value)
      && finiteVector(primitive.from)
      && finiteVector(primitive.to));
  }).length;
}

function aerodynamicControlValues(
  effectLog: unknown,
  series: IPlaytestObservations["effectLogSeries"],
  entity: string,
  surface: string,
): number[] {
  const logs = [effectLog, ...(series ?? []).map((sample) => sample.snapshot)];
  return logs.flatMap((log) => !isRecord(log) || !Array.isArray(log.entries) ? [] : log.entries.flatMap((entry) => {
    if (!isRecord(entry) || entry.service !== "physics.aerodynamics.setInputs" || !isRecord(entry.payload)) return [];
    const request = record(entry.payload.request);
    const inputs = record(request?.inputs);
    const surfaces = record(inputs?.surfaces);
    const value = surfaces?.[surface];
    return request?.entity === entity && typeof value === "number" && Number.isFinite(value) ? [value] : [];
  }));
}

function aerodynamicTorqueAtLabel(series: IPlaytestObservations["physicsDebugSeries"], entity: string, label: string): Vec3 | undefined {
  const snapshot = (series ?? []).find((sample) => sample.label === label)?.snapshot;
  if (!isRecord(snapshot) || !isRecord(snapshot.artifact) || !Array.isArray(snapshot.artifact.primitives)) return undefined;
  const primitives = snapshot.artifact.primitives.filter(isRecord);
  const bodyPosition = primitives.find((primitive) => primitive.id === `sleep:${entity}`)?.position;
  if (!finiteVector(bodyPosition)) return undefined;
  const origin = bodyPosition as Vec3;
  const torque: Vec3 = [0, 0, 0];
  let samples = 0;
  for (const primitive of primitives) {
    if (primitive.category !== "aero" || primitive.entity !== entity || !finiteVector(primitive.from) || !finiteVector(primitive.to)) continue;
    const from = primitive.from as Vec3;
    const to = primitive.to as Vec3;
    const momentArm: Vec3 = [from[0] - origin[0], from[1] - origin[1], from[2] - origin[2]];
    const force: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const cross: Vec3 = [
      momentArm[1] * force[2] - momentArm[2] * force[1],
      momentArm[2] * force[0] - momentArm[0] * force[2],
      momentArm[0] * force[1] - momentArm[1] * force[0],
    ];
    torque[0] += cross[0];
    torque[1] += cross[1];
    torque[2] += cross[2];
    samples += 1;
  }
  return samples === 0 || !torque.every(Number.isFinite) ? undefined : torque;
}

function finiteVector(value: unknown): boolean {
  return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function record(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function expectedPathAssertion(assertion: IPlaytestPathAssertion): Record<string, unknown> {
  return {
    ...(assertion.atSteps === undefined ? {} : { atSteps: assertion.atSteps }),
    ...(Object.hasOwn(assertion, "equals") ? { equals: assertion.equals } : {}),
    ...(assertion.gte === undefined ? {} : { gte: assertion.gte }),
    ...(assertion.textIncludes === undefined ? {} : { textIncludes: assertion.textIncludes }),
    ...(assertion.throughoutSteps === undefined ? {} : { throughoutSteps: assertion.throughoutSteps }),
    ...(assertion.changed === undefined ? {} : { changed: assertion.changed }),
  };
}

function unchangedPathValue(before: unknown, after: unknown): boolean {
  return before !== undefined && after !== undefined && jsonEqual(before, after);
}

function pathAssertionDiagnostic(
  kind: "hud" | "resource",
  assertion: IPlaytestPathAssertion,
  before: unknown,
  after: unknown,
  context: { effectLog?: unknown; movedDistance?: number; scenarioSourcePath?: string },
): IPlaytestDiagnostic {
  const unchanged = unchangedPathValue(before, after);
  if (kind === "resource" && unchanged && (context.movedDistance ?? 0) > 0.01) {
    const summary = summarizeResourceEffectLog(context.effectLog, assertion.id, assertion.path);
    return {
      code: "TN_PLAYTEST_RESOURCE_STATE_STAGNATED",
      message: `Resource '${assertion.id}'${assertion.path === undefined ? "" : ` path '${assertion.path}'`} did not change after the scenario moved the subject ${formatNumber(context.movedDistance ?? 0)} units.`,
      artifactPath: "effect-log.json",
      observedRuntimePath: `effect-log.json/entries[kind=resource,resource=${assertion.id}]`,
      path: assertion.path === undefined ? `${context.scenarioSourcePath ?? "playtest"}/assert/resources/${assertion.id}` : `${context.scenarioSourcePath ?? "playtest"}/assert/resources/${assertion.id}/${assertion.path}`,
      resourceId: assertion.id,
      severity: "error",
      ...(context.scenarioSourcePath === undefined ? {} : { sourcePath: context.scenarioSourcePath }),
      ...(summary?.systemId === undefined ? {} : { systemId: summary.systemId, sourcePath: summary.sourcePath }),
      suggestion: summary === undefined
        ? "The scenario movement path executed but the asserted resource never changed. Capture effect-log.json, then check pickup/contact predicates, route coordinates, resource write declarations, and stale duplicate systems before rerunning."
        : `The scenario movement path executed and effect-log.json shows ${summary.entryCount} '${assertion.id}' resource snapshot(s) from ${summary.systems}; observed values stayed ${summary.distinctValues}. Check pickup/contact predicates, route coordinates, resource write declarations, and stale duplicate systems in the listed system(s).`,
    };
  }
  return {
    code: "",
    message: `${kind === "hud" ? "HUD" : "Resource"} assertion failed for '${assertion.id}'${assertion.path === undefined ? "" : ` path '${assertion.path}'`}.`,
    severity: "error",
    suggestion: unchanged
      ? `${kind === "hud" ? "Observed HUD value" : "Observed resource value"} did not change during the scenario. Inspect effect-log.json for the owning system's resource writes, run tn build --project . --json for undeclared writes, and check whether duplicate/stale systems or route/collision setup prevented the state transition.`
      : kind === "hud" ? "Check UI binding IDs and whether the backing resource changes during the scenario." : "Check resource IDs, script writes, and assertion path spelling.",
  };
}

function summarizeResourceEffectLog(effectLog: unknown, resourceId: string, path: string | undefined): { distinctValues: string; entryCount: number; sourcePath?: string; systemId?: string; systems: string } | undefined {
  if (!isRecord(effectLog) || !Array.isArray(effectLog.entries)) {
    return undefined;
  }
  const entries = effectLog.entries
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .filter((entry) => entry.kind === "resource" && entry.resource === resourceId);
  if (entries.length === 0) {
    return undefined;
  }
  const systems = new Set<string>();
  const values = new Set<string>();
  for (const entry of entries) {
    if (typeof entry.system === "string") {
      systems.add(entry.system);
    }
    values.add(shortJson(readPath(entry.value, path)));
  }
  return {
    distinctValues: Array.from(values).slice(0, 3).join(", "),
    entryCount: entries.length,
    ...([...(systems)].at(0) === undefined ? {} : { sourcePath: sourcePathForSystem([...(systems)][0] as string), systemId: [...(systems)][0] as string }),
    systems: systems.size === 0 ? "unknown systems" : Array.from(systems).slice(0, 5).join(", "),
  };
}

function sourcePathForSystem(systemId: string): string {
  return `content/systems/${systemId}.systems.json`;
}

function shortJson(value: unknown): string {
  const text = JSON.stringify(value);
  if (text === undefined) {
    return "undefined";
  }
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
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
  const diagnosticsSnapshot = runtimeDiagnosticsSnapshot(runtimeDiagnosticsValue);
  const rendered = renderedEntity(diagnosticsSnapshot, entity);
  const supportsProjectedBounds = renderedEntitiesAreReported(diagnosticsSnapshot);
  if (!supportsProjectedBounds && hasNativeReadinessSamples(diagnosticsSnapshot)) {
    return {
      assertion: {
        details: {
          entity,
          maxOffscreenRatio,
          minProjectedPixels,
          reason: "native-projected-bounds-unavailable",
          skipped: true,
        },
        id: `visibility.${entity}`,
        pass: true,
      },
    };
  }
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

function projectedPixelsForEntity(snapshot: unknown, entity: string, viewport: { height: number; width: number }): number | undefined {
  const rendered = renderedEntity(snapshot, entity);
  const bounds = isRecord(rendered?.projectedBounds) ? rendered.projectedBounds : undefined;
  const min = Array.isArray(bounds?.min) ? bounds.min : undefined;
  const max = Array.isArray(bounds?.max) ? bounds.max : undefined;
  return min === undefined || max === undefined
    ? undefined
    : Math.max(0, ((Number(max[0]) - Number(min[0])) / 2) * viewport.width) * Math.max(0, ((Number(max[1]) - Number(min[1])) / 2) * viewport.height);
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

function mergeEffectLogs(effectLog: unknown, series: IPlaytestObservations["effectLogSeries"]): { entries: unknown[] } {
  return {
    entries: [effectLog, ...(series ?? []).map((sample) => sample.snapshot)]
      .flatMap((log) => isRecord(log) && Array.isArray(log.entries) ? log.entries : []),
  };
}

function matchingOccludedRaycasts(effectLog: unknown, entity: string | undefined, target: string | undefined): number {
  if (!isRecord(effectLog) || !Array.isArray(effectLog.entries)) return 0;
  return effectLog.entries.filter((entry) => {
    if (!isRecord(entry) || (entry.service !== "render.sceneRayQuery" && entry.service !== "physics.raycast") || !isRecord(entry.payload) || !isRecord(entry.payload.result) || entry.payload.result.hit !== true) return false;
    const request = JSON.stringify(entry.payload.request ?? null);
    return (entity === undefined || request.includes(entity)) && (target === undefined || request.includes(target));
  }).length;
}

function summarizeMatchingEntries(effectLog: unknown, tokens: readonly string[]): { entryCount: number; sourcePath?: string; systemId?: string; systems: string } | undefined {
  if (tokens.length === 0 || !isRecord(effectLog) || !Array.isArray(effectLog.entries)) {
    return undefined;
  }
  const entries = effectLog.entries
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .filter((entry) => {
      const text = JSON.stringify(entry);
      return tokens.every((token) => text.includes(token));
    });
  if (entries.length === 0) {
    return undefined;
  }
  const systems = new Set(entries.map((entry) => typeof entry.system === "string" ? entry.system : undefined).filter((item): item is string => item !== undefined));
  const firstSystem = [...systems][0];
  return {
    entryCount: entries.length,
    ...(firstSystem === undefined ? {} : { sourcePath: sourcePathForSystem(firstSystem), systemId: firstSystem }),
    systems: systems.size === 0 ? "unknown systems" : [...systems].slice(0, 5).join(", "),
  };
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

function maxResolvedAxisDelta(
  effectLog: unknown,
  entityId: string,
  expectation: { axis: MovementAxis; sign?: 1 | -1 },
  baseline: Vec3 | undefined,
): number | undefined {
  if (!isRecord(effectLog) || !Array.isArray(effectLog.entries)) {
    return undefined;
  }
  const index = axisIndex(expectation.axis);
  const resolvedValues = effectLog.entries
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .filter((entry) => entry.kind === "service" && entry.service === "character.move")
    .map((entry) => {
      const payload = isRecord(entry.payload) ? entry.payload : undefined;
      const result = isRecord(payload?.result) ? payload.result : undefined;
      return result?.entity === entityId ? readVec3(result.resolved) : undefined;
    })
    .filter((item): item is Vec3 => item !== undefined);
  const first = baseline ?? resolvedValues[0];
  if (first === undefined || resolvedValues.length === 0) {
    return undefined;
  }
  const sign = expectation.sign ?? 1;
  return Math.max(...resolvedValues.map((value) => (value[index] - first[index]) * sign));
}

function renderedEntity(runtimeDiagnosticsValue: unknown, entity: string): Record<string, unknown> | undefined {
  if (!renderedEntitiesAreReported(runtimeDiagnosticsValue)) {
    return undefined;
  }
  return runtimeDiagnosticsValue.scene.renderedEntities.find((item): item is Record<string, unknown> => isRecord(item) && item.id === entity);
}

function renderedEntitiesAreReported(runtimeDiagnosticsValue: unknown): runtimeDiagnosticsValue is { scene: { renderedEntities: unknown[] } } {
  return isRecord(runtimeDiagnosticsValue) && isRecord(runtimeDiagnosticsValue.scene) && Array.isArray(runtimeDiagnosticsValue.scene.renderedEntities);
}

function hasNativeReadinessSamples(runtimeDiagnosticsValue: unknown): boolean {
  return isRecord(runtimeDiagnosticsValue) && Array.isArray(runtimeDiagnosticsValue.readiness);
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
  const snapshot = runtimeDiagnosticsSnapshot(value);
  if (snapshot !== value) {
    return runtimeDiagnostics(snapshot);
  }
  if (!isRecord(snapshot)) {
    return [];
  }
  const recentRuntimeErrors = Array.isArray(snapshot.recentRuntimeErrors) ? snapshot.recentRuntimeErrors : [];
  const resourceFailures = isRecord(snapshot.assets) && Array.isArray(snapshot.assets.resourceFailures) ? snapshot.assets.resourceFailures : [];
  return [...recentRuntimeErrors, ...resourceFailures];
}

function runtimeDiagnosticsSnapshot(value: unknown): unknown {
  if (isRecord(value) && isRecord(value.diagnostics)) {
    return value.diagnostics;
  }
  return value;
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

type MovementAxis = "x" | "y" | "z";

function parseMovementAxisExpectation(value: string): { axis: MovementAxis; sign?: 1 | -1 } | undefined {
  if (value === "x" || value === "y" || value === "z") {
    return { axis: value };
  }
  const match = /^([+-])([xyz])$/.exec(value);
  if (match === null) {
    return undefined;
  }
  return { axis: match[2] as MovementAxis, sign: match[1] === "-" ? -1 : 1 };
}

function axisIndex(axis: MovementAxis): 0 | 1 | 2 {
  return axis === "x" ? 0 : axis === "y" ? 1 : 2;
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

function readVec3(value: unknown): Vec3 | undefined {
  if (!Array.isArray(value) || value.length < 3) {
    return undefined;
  }
  const vector = value.slice(0, 3).map((item) => typeof item === "number" && Number.isFinite(item) ? item : Number.NaN);
  return vector.every(Number.isFinite) ? vector as Vec3 : undefined;
}

function vectorDistance(left: Vec3, right: Vec3): number {
  const dx = right[0] - left[0];
  const dy = right[1] - left[1];
  const dz = right[2] - left[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
