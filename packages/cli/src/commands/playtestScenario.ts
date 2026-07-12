import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type PlaytestTarget = "web" | "desktop" | "bevy";

export interface IPlaytestViewport {
  height: number;
  width: number;
}

export interface IPlaytestStep {
  kind?: "input" | "wait";
  holdFrames?: number;
  holdTicks?: number;
  label?: string;
  overlayMessage?: {
    overlayId: string;
    payload: unknown;
    type: string;
  };
  press?: string;
  release: boolean;
  waitFrames?: number;
  waitTicks?: number;
}

export interface IPlaytestMovementAssertion {
  axis?: string;
  entity?: string;
  minAxisDelta?: {
    axis: string;
    min: number;
  };
  minResolvedAxisDelta?: {
    axis: string;
    min: number;
  };
  minDistance?: number;
  minVelocity?: number;
  pathLength?: number;
  rotationChanged?: boolean;
}

export interface IPlaytestCameraAssertion {
  entity?: string;
  follows?: string;
  targetInViewport?: boolean;
  within?: number;
}

export interface IPlaytestPathAssertion {
  changed?: boolean;
  equals?: unknown;
  gte?: number;
  id: string;
  path?: string;
  textIncludes?: string;
}

export interface IPlaytestContactAssertion {
  entity?: string;
  kind?: string;
  minCount?: number;
  with?: string;
}

export interface IPlaytestOccludedAssertion {
  entity?: string;
  target?: string;
}

export interface IPlaytestAnimationAssertion {
  advancedFrames?: number;
  clip?: string;
  entered?: boolean;
  entity?: string;
}

export interface IPlaytestTagCountAssertion {
  count?: number;
  gte?: number;
  tag: string;
}

export interface IPlaytestStateAssertion {
  entity: string;
  equals: string;
}

export interface IPlaytestVisibilityAssertion {
  entity?: string;
  maxOffscreenRatio?: number;
  minProjectedPixels?: number;
}

export interface IPlaytestDiagnosticsAssertion {
  noConsoleErrors?: boolean;
  noNetworkErrors?: boolean;
  noRuntimeDiagnostics?: boolean;
  runtimeReady?: boolean;
}

export interface IPlaytestScenarioAssertions {
  animation?: IPlaytestAnimationAssertion[];
  camera?: IPlaytestCameraAssertion;
  contacts?: IPlaytestContactAssertion[];
  diagnostics?: IPlaytestDiagnosticsAssertion;
  hud?: IPlaytestPathAssertion[];
  movement?: IPlaytestMovementAssertion;
  occluded?: IPlaytestOccludedAssertion[];
  resources?: IPlaytestPathAssertion[];
  states?: IPlaytestStateAssertion[];
  tags?: IPlaytestTagCountAssertion[];
  visibility?: IPlaytestVisibilityAssertion[];
}

export interface IPlaytestParityConfig {
  animation?: Array<{ clip?: string; entity: string; requiredOn?: PlaytestTarget[] }>;
  axisDelta?: Partial<Record<"x" | "y" | "z", number>>;
  contacts?: { minSharedCount?: number };
  movementDistance?: { maxDelta: number };
  resources?: string[];
  targets?: PlaytestTarget[];
}

export interface IPlaytestArtifactRequest {
  console?: boolean;
  contactSheet?: boolean;
  effectLog?: "focused" | boolean;
  network?: boolean;
  runtimeTrace?: boolean;
  screenshots?: "before-after" | "after" | false;
}

export interface IPlaytestSetupEntityTransform {
  entity: string;
  position?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}

export interface IPlaytestScenarioSetup {
  entities?: IPlaytestSetupEntityTransform[];
}

export interface IPlaytestScenario {
  artifacts?: IPlaytestArtifactRequest;
  assert?: IPlaytestScenarioAssertions;
  name: string;
  parity?: IPlaytestParityConfig;
  schemaVersion: 1;
  setup?: IPlaytestScenarioSetup;
  sourcePath?: string;
  steps: IPlaytestStep[];
  subject?: string;
  target: PlaytestTarget;
  viewport: IPlaytestViewport;
  warmupFrames: number;
}

export interface IPlaytestScenarioDiagnostic {
  code: "TN_PLAYTEST_SCENARIO_INVALID" | "TN_PLAYTEST_SCENARIO_NOT_FOUND" | "TN_PLAYTEST_SCENARIO_STEP_INVALID";
  fix?: {
    docs?: string;
    instruction: string;
    snippet?: string;
  };
  message: string;
  severity: "error";
  suggestion?: string;
}

export class PlaytestScenarioError extends Error {
  constructor(readonly diagnostic: IPlaytestScenarioDiagnostic) {
    super(diagnostic.message);
  }
}

export async function loadPlaytestScenario(projectPath: string, scenarioPath: string): Promise<IPlaytestScenario> {
  const absolutePath = resolve(projectPath, scenarioPath);
  let raw: string;
  try {
    raw = await readFile(absolutePath, "utf8");
  } catch {
    throw new PlaytestScenarioError({
      code: "TN_PLAYTEST_SCENARIO_NOT_FOUND",
      message: `Playtest scenario '${scenarioPath}' could not be read.`,
      severity: "error",
      suggestion: "Check the --scenario path. Committed playtest scenarios normally live under playtests/*.playtest.json.",
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new PlaytestScenarioError({
      code: "TN_PLAYTEST_SCENARIO_INVALID",
      message: `Playtest scenario '${scenarioPath}' is not valid JSON: ${error instanceof Error ? error.message : String(error)}.`,
      severity: "error",
      suggestion: "Fix the scenario JSON syntax and rerun tn playtest.",
    });
  }
  return validatePlaytestScenario(parsed, scenarioPath, absolutePath);
}

export function oneShotScenario(options: {
  expectAxis?: string;
  expectMoved: boolean;
  follow?: { entityId: string; within: number };
  frames: number;
  movementThreshold: number;
  press: string;
  subject: string;
  target?: PlaytestTarget;
  viewport?: IPlaytestViewport;
}): IPlaytestScenario {
  return {
    assert: {
      ...(options.expectMoved || options.expectAxis !== undefined
        ? { movement: { axis: options.expectAxis, entity: options.subject, minDistance: options.expectMoved ? options.movementThreshold : undefined } }
        : {}),
      ...(options.follow === undefined ? {} : { camera: { entity: options.follow.entityId, follows: options.subject, within: options.follow.within } }),
    },
    name: `${safeFilePart(options.subject)}-${safeFilePart(options.press)}`,
    schemaVersion: 1,
    steps: [{ holdFrames: options.frames, press: options.press, release: true }],
    subject: options.subject,
    target: options.target ?? "web",
    viewport: options.viewport ?? { height: 720, width: 1280 },
    warmupFrames: 0,
  };
}

export function applyScenarioOverrides(
  scenario: IPlaytestScenario,
  overrides: { target?: PlaytestTarget; viewport?: IPlaytestViewport },
): IPlaytestScenario {
  return {
    ...scenario,
    ...(overrides.target === undefined ? {} : { target: overrides.target }),
    ...(overrides.viewport === undefined ? {} : { viewport: overrides.viewport }),
  };
}

export function parsePlaytestTarget(value: string | undefined): PlaytestTarget | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value === "web" || value === "desktop" || value === "bevy" ? value : undefined;
}

export function parseViewport(value: string | undefined): IPlaytestViewport | undefined {
  if (value === undefined) {
    return undefined;
  }
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (match === null) {
    return undefined;
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  return Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0 ? { height, width } : undefined;
}

function validatePlaytestScenario(value: unknown, scenarioPath: string, absolutePath?: string): IPlaytestScenario {
  if (!isRecord(value)) {
    throw invalidScenario(scenarioPath, "Scenario root must be a JSON object.");
  }
  if (value.schemaVersion !== 1) {
    throw invalidScenario(scenarioPath, "Scenario schemaVersion must be 1.");
  }
  const name = typeof value.name === "string" ? value.name : undefined;
  if (name === undefined || !/^[A-Za-z0-9._-]+$/.test(name)) {
    throw invalidScenario(scenarioPath, "Scenario name must be a stable file-safe identifier.");
  }
  const target = value.target === undefined ? "web" : value.target;
  if (target !== "web" && target !== "desktop" && target !== "bevy") {
    throw invalidScenario(scenarioPath, "Scenario target must be one of: web, desktop, bevy.");
  }
  if (!Array.isArray(value.steps) || value.steps.length === 0) {
    throw invalidStep(scenarioPath, "Scenario steps[] must contain at least one step.");
  }
  const steps = value.steps.map((step, index) => validateStep(step, scenarioPath, index));
  return {
    ...(isRecord(value.artifacts) ? { artifacts: value.artifacts as IPlaytestArtifactRequest } : {}),
    ...(isRecord(value.assert) ? { assert: validateAssertions(value.assert) } : {}),
    name,
    ...(isRecord(value.parity) ? { parity: validateParityConfig(value.parity) } : {}),
    schemaVersion: 1,
    ...(isRecord(value.setup) ? { setup: validateSetup(value.setup, scenarioPath) } : {}),
    ...(absolutePath === undefined ? {} : { sourcePath: absolutePath }),
    steps,
    ...(typeof value.subject === "string" ? { subject: value.subject } : {}),
    target,
    viewport: validateViewport(value.viewport),
    warmupFrames: positiveInteger(value.warmupFrames) ?? 0,
  };
}

function validateParityConfig(value: Record<string, unknown>): IPlaytestParityConfig {
  return {
    ...(Array.isArray(value.animation) ? { animation: value.animation.map(validateParityAnimation).filter((item): item is NonNullable<IPlaytestParityConfig["animation"]>[number] => item !== undefined) } : {}),
    ...(isRecord(value.compare) ? validateParityCompare(value.compare) : validateParityCompare(value)),
    ...(Array.isArray(value.resources) ? { resources: value.resources.filter((item): item is string => typeof item === "string") } : {}),
    ...(Array.isArray(value.targets) ? { targets: value.targets.filter((item): item is PlaytestTarget => item === "web" || item === "desktop" || item === "bevy") } : {}),
  };
}

function validateParityCompare(value: Record<string, unknown>): Omit<IPlaytestParityConfig, "targets"> {
  const movementDistance = isRecord(value.movementDistance) && typeof value.movementDistance.maxDelta === "number" && Number.isFinite(value.movementDistance.maxDelta)
    ? { maxDelta: value.movementDistance.maxDelta }
    : undefined;
  const axisDelta = isRecord(value.axisDelta)
    ? Object.fromEntries(Object.entries(value.axisDelta).filter((entry): entry is ["x" | "y" | "z", number] =>
        (entry[0] === "x" || entry[0] === "y" || entry[0] === "z") && typeof entry[1] === "number" && Number.isFinite(entry[1]),
      ))
    : undefined;
  const contacts = isRecord(value.contacts) && typeof value.contacts.minSharedCount === "number" && Number.isFinite(value.contacts.minSharedCount)
    ? { minSharedCount: value.contacts.minSharedCount }
    : undefined;
  return {
    ...(axisDelta !== undefined && Object.keys(axisDelta).length > 0 ? { axisDelta } : {}),
    ...(Array.isArray(value.animation) ? { animation: value.animation.map(validateParityAnimation).filter((item): item is NonNullable<IPlaytestParityConfig["animation"]>[number] => item !== undefined) } : {}),
    ...(contacts === undefined ? {} : { contacts }),
    ...(movementDistance === undefined ? {} : { movementDistance }),
    ...(Array.isArray(value.resources) ? { resources: value.resources.filter((item): item is string => typeof item === "string") } : {}),
  };
}

function validateParityAnimation(value: unknown): NonNullable<IPlaytestParityConfig["animation"]>[number] | undefined {
  if (!isRecord(value) || typeof value.entity !== "string") {
    return undefined;
  }
  return {
    ...(typeof value.clip === "string" ? { clip: value.clip } : {}),
    entity: value.entity,
    ...(Array.isArray(value.requiredOn) ? { requiredOn: value.requiredOn.filter((item): item is PlaytestTarget => item === "web" || item === "desktop" || item === "bevy") } : {}),
  };
}

function validateSetup(value: Record<string, unknown>, scenarioPath: string): IPlaytestScenarioSetup {
  return {
    ...(Array.isArray(value.entities) ? { entities: value.entities.map((entity, index) => validateSetupEntity(entity, scenarioPath, index)) } : {}),
  };
}

function validateSetupEntity(value: unknown, scenarioPath: string, index: number): IPlaytestSetupEntityTransform {
  if (!isRecord(value) || typeof value.entity !== "string" || value.entity.length === 0) {
    throw invalidScenario(scenarioPath, `Scenario setup.entities[${index}] must name an entity.`);
  }
  const position = validateOptionalNumberTuple(value, "position", 3, scenarioPath, index);
  const rotation = validateOptionalNumberTuple(value, "rotation", 4, scenarioPath, index);
  const scale = validateOptionalNumberTuple(value, "scale", 3, scenarioPath, index);
  if (position === undefined && rotation === undefined && scale === undefined) {
    throw invalidScenario(scenarioPath, `Scenario setup.entities[${index}] must define position, rotation, or scale.`);
  }
  return {
    entity: value.entity,
    ...(position === undefined ? {} : { position }),
    ...(rotation === undefined ? {} : { rotation }),
    ...(scale === undefined ? {} : { scale }),
  };
}

function validateStep(value: unknown, scenarioPath: string, index: number): IPlaytestStep {
  if (!isRecord(value)) {
    throw invalidStep(scenarioPath, `Scenario step ${index} must be a JSON object.`);
  }
  const press = typeof value.press === "string" && value.press.length > 0 ? value.press : undefined;
  const overlayMessage = isRecord(value.overlayMessage)
    && typeof value.overlayMessage.overlayId === "string"
    && value.overlayMessage.overlayId.length > 0
    && typeof value.overlayMessage.type === "string"
    && value.overlayMessage.type.length > 0
    ? {
        overlayId: value.overlayMessage.overlayId,
        payload: value.overlayMessage.payload ?? {},
        type: value.overlayMessage.type,
      }
    : undefined;
  const holdFrames = positiveInteger(value.holdFrames);
  const holdTicks = positiveInteger(value.holdTicks);
  const waitFrames = positiveInteger(value.waitFrames);
  const waitTicks = positiveInteger(value.waitTicks);
  const kind = value.kind === "wait" ? "wait" : value.kind === "input" ? "input" : undefined;
  if (kind === "wait" && press !== undefined) {
    throw invalidStep(scenarioPath, `Scenario step ${index} kind wait cannot define press.`);
  }
  if (value.overlayMessage !== undefined && overlayMessage === undefined) {
    throw invalidStep(scenarioPath, `Scenario step ${index} overlayMessage must define non-empty overlayId and type fields.`);
  }
  if (press === undefined && overlayMessage === undefined && waitFrames === undefined && waitTicks === undefined) {
    throw invalidStep(scenarioPath, `Scenario step ${index} must define press, overlayMessage, or waitFrames/waitTicks.`);
  }
  if (value.holdFrames !== undefined && holdFrames === undefined) {
    throw invalidStep(scenarioPath, `Scenario step ${index} holdFrames must be a positive integer.`);
  }
  if (value.waitFrames !== undefined && waitFrames === undefined) {
    throw invalidStep(scenarioPath, `Scenario step ${index} waitFrames must be a positive integer.`);
  }
  if (value.holdTicks !== undefined && holdTicks === undefined) {
    throw invalidStep(scenarioPath, `Scenario step ${index} holdTicks must be a positive integer.`);
  }
  if (value.waitTicks !== undefined && waitTicks === undefined) {
    throw invalidStep(scenarioPath, `Scenario step ${index} waitTicks must be a positive integer.`);
  }
  if (holdTicks !== undefined && holdFrames !== undefined) {
    throw invalidStep(scenarioPath, `Scenario step ${index} must choose holdTicks or holdFrames, not both.`);
  }
  if (waitTicks !== undefined && waitFrames !== undefined) {
    throw invalidStep(scenarioPath, `Scenario step ${index} must choose waitTicks or waitFrames, not both.`);
  }
  return {
    ...(kind === undefined ? {} : { kind }),
    ...(holdFrames === undefined ? {} : { holdFrames }),
    ...(holdTicks === undefined ? {} : { holdTicks }),
    ...(typeof value.label === "string" ? { label: value.label } : {}),
    ...(overlayMessage === undefined ? {} : { overlayMessage }),
    ...(press === undefined ? {} : { press }),
    release: typeof value.release === "boolean" ? value.release : true,
    ...(waitFrames === undefined ? {} : { waitFrames }),
    ...(waitTicks === undefined ? {} : { waitTicks }),
  };
}

export function playtestStepHoldTicks(step: IPlaytestStep, fallback = 1): number {
  return step.press === undefined ? 0 : Math.max(1, step.holdTicks ?? step.holdFrames ?? fallback);
}

export function playtestStepWaitTicks(step: IPlaytestStep): number {
  return Math.max(0, step.waitTicks ?? step.waitFrames ?? 0);
}

function validateAssertions(value: Record<string, unknown>): IPlaytestScenarioAssertions {
  const movement = isRecord(value.movement) ? value.movement : undefined;
  const camera = isRecord(value.camera) ? value.camera : undefined;
  const diagnostics = isRecord(value.diagnostics) ? value.diagnostics : undefined;
  return {
    ...(Array.isArray(value.animation) ? { animation: value.animation.map(validateAnimationAssertion).filter((item): item is IPlaytestAnimationAssertion => item !== undefined) } : {}),
    ...(camera === undefined
      ? {}
      : {
          camera: {
            ...(typeof camera.entity === "string" ? { entity: camera.entity } : {}),
            ...(typeof camera.follows === "string" ? { follows: camera.follows } : {}),
            ...(typeof camera.targetInViewport === "boolean" ? { targetInViewport: camera.targetInViewport } : {}),
            ...(typeof camera.within === "number" && Number.isFinite(camera.within) ? { within: camera.within } : {}),
          },
        }),
    ...(Array.isArray(value.contacts) ? { contacts: value.contacts.map(validateContactAssertion).filter((item): item is IPlaytestContactAssertion => item !== undefined) } : {}),
    ...(diagnostics === undefined
      ? {}
      : {
          diagnostics: {
            ...(typeof diagnostics.noConsoleErrors === "boolean" ? { noConsoleErrors: diagnostics.noConsoleErrors } : {}),
            ...(typeof diagnostics.noNetworkErrors === "boolean" ? { noNetworkErrors: diagnostics.noNetworkErrors } : {}),
            ...(typeof diagnostics.noRuntimeDiagnostics === "boolean" ? { noRuntimeDiagnostics: diagnostics.noRuntimeDiagnostics } : {}),
            ...(typeof diagnostics.runtimeReady === "boolean" ? { runtimeReady: diagnostics.runtimeReady } : {}),
          },
        }),
    ...(Array.isArray(value.hud) ? { hud: value.hud.map(validatePathAssertion).filter((item): item is IPlaytestPathAssertion => item !== undefined) } : {}),
    ...(movement === undefined
      ? {}
      : {
          movement: {
            ...(typeof movement.axis === "string" ? { axis: movement.axis } : {}),
            ...(typeof movement.entity === "string" ? { entity: movement.entity } : {}),
            ...(isRecord(movement.minAxisDelta) && typeof movement.minAxisDelta.axis === "string" && typeof movement.minAxisDelta.min === "number" && Number.isFinite(movement.minAxisDelta.min)
              ? { minAxisDelta: { axis: movement.minAxisDelta.axis, min: movement.minAxisDelta.min } }
              : {}),
            ...(isRecord(movement.minResolvedAxisDelta) && typeof movement.minResolvedAxisDelta.axis === "string" && typeof movement.minResolvedAxisDelta.min === "number" && Number.isFinite(movement.minResolvedAxisDelta.min)
              ? { minResolvedAxisDelta: { axis: movement.minResolvedAxisDelta.axis, min: movement.minResolvedAxisDelta.min } }
              : {}),
            ...(typeof movement.minDistance === "number" && Number.isFinite(movement.minDistance) ? { minDistance: movement.minDistance } : {}),
            ...(typeof movement.minVelocity === "number" && Number.isFinite(movement.minVelocity) ? { minVelocity: movement.minVelocity } : {}),
            ...(typeof movement.pathLength === "number" && Number.isFinite(movement.pathLength) && movement.pathLength >= 0 ? { pathLength: movement.pathLength } : {}),
            ...(typeof movement.rotationChanged === "boolean" ? { rotationChanged: movement.rotationChanged } : {}),
          },
    }),
    ...(Array.isArray(value.resources) ? { resources: value.resources.map(validatePathAssertion).filter((item): item is IPlaytestPathAssertion => item !== undefined) } : {}),
    ...(Array.isArray(value.states) ? { states: value.states.map(validateStateAssertion).filter((item): item is IPlaytestStateAssertion => item !== undefined) } : {}),
    ...(Array.isArray(value.tags) ? { tags: value.tags.map(validateTagCountAssertion).filter((item): item is IPlaytestTagCountAssertion => item !== undefined) } : {}),
    ...(Array.isArray(value.visibility) ? { visibility: value.visibility.map(validateVisibilityAssertion).filter((item): item is IPlaytestVisibilityAssertion => item !== undefined) } : {}),
  };
}

function validateStateAssertion(value: unknown): IPlaytestStateAssertion | undefined {
  if (!isRecord(value) || typeof value.entity !== "string" || typeof value.equals !== "string") {
    return undefined;
  }
  return { entity: value.entity, equals: value.equals };
}

function validateTagCountAssertion(value: unknown): IPlaytestTagCountAssertion | undefined {
  if (!isRecord(value) || typeof value.tag !== "string") {
    return undefined;
  }
  return {
    ...(typeof value.count === "number" && Number.isInteger(value.count) && value.count >= 0 ? { count: value.count } : {}),
    ...(typeof value.gte === "number" && Number.isInteger(value.gte) && value.gte >= 0 ? { gte: value.gte } : {}),
    tag: value.tag,
  };
}

function validateContactAssertion(value: unknown): IPlaytestContactAssertion | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    ...(typeof value.entity === "string" ? { entity: value.entity } : {}),
    ...(typeof value.kind === "string" ? { kind: value.kind } : {}),
    ...(typeof value.minCount === "number" && Number.isFinite(value.minCount) ? { minCount: value.minCount } : {}),
    ...(typeof value.with === "string" ? { with: value.with } : {}),
  };
}

function validateAnimationAssertion(value: unknown): IPlaytestAnimationAssertion | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    ...(typeof value.advancedFrames === "number" && Number.isFinite(value.advancedFrames) ? { advancedFrames: value.advancedFrames } : {}),
    ...(typeof value.clip === "string" ? { clip: value.clip } : {}),
    ...(typeof value.entered === "boolean" ? { entered: value.entered } : {}),
    ...(typeof value.entity === "string" ? { entity: value.entity } : {}),
  };
}

function validateVisibilityAssertion(value: unknown): IPlaytestVisibilityAssertion | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    ...(typeof value.entity === "string" ? { entity: value.entity } : {}),
    ...(typeof value.maxOffscreenRatio === "number" && Number.isFinite(value.maxOffscreenRatio) ? { maxOffscreenRatio: value.maxOffscreenRatio } : {}),
    ...(typeof value.minProjectedPixels === "number" && Number.isFinite(value.minProjectedPixels) ? { minProjectedPixels: value.minProjectedPixels } : {}),
  };
}

function validatePathAssertion(value: unknown): IPlaytestPathAssertion | undefined {
  if (!isRecord(value) || typeof value.id !== "string") {
    return undefined;
  }
  return {
    ...(typeof value.changed === "boolean" ? { changed: value.changed } : {}),
    ...(hasKey(value, "equals") ? { equals: value.equals } : {}),
    ...(typeof value.gte === "number" && Number.isFinite(value.gte) ? { gte: value.gte } : {}),
    id: value.id,
    ...(typeof value.path === "string" ? { path: value.path } : {}),
    ...(typeof value.textIncludes === "string" ? { textIncludes: value.textIncludes } : {}),
  };
}

function validateViewport(value: unknown): IPlaytestViewport {
  if (!isRecord(value)) {
    return { height: 720, width: 1280 };
  }
  const width = positiveInteger(value.width);
  const height = positiveInteger(value.height);
  return width === undefined || height === undefined ? { height: 720, width: 1280 } : { height, width };
}

function invalidScenario(scenarioPath: string, message: string): PlaytestScenarioError {
  return new PlaytestScenarioError({
    code: "TN_PLAYTEST_SCENARIO_INVALID",
    fix: {
      docs: "docs/workflows/playtest-proof.md",
      instruction: "Use playtest schemaVersion 1 with a file-safe name, target, viewport, warmupFrames, and non-empty steps.",
      snippet: '{ "schemaVersion": 1, "name": "forward-smoke", "target": "web", "viewport": { "width": 1280, "height": 720 }, "warmupFrames": 10, "steps": [{ "kind": "input", "press": "KeyW", "holdTicks": 30, "release": true }] }',
    },
    message: `Playtest scenario '${scenarioPath}' is invalid: ${message}`,
    severity: "error",
    suggestion: "Use schemaVersion 1 with a file-safe name, a supported target, and non-empty steps.",
  });
}

function invalidStep(scenarioPath: string, message: string): PlaytestScenarioError {
  return new PlaytestScenarioError({
    code: "TN_PLAYTEST_SCENARIO_STEP_INVALID",
    fix: {
      docs: "docs/workflows/playtest-proof.md",
      instruction: "Give each step either a press with positive holdTicks/holdFrames or a positive waitTicks/waitFrames value; use kind: wait for an explicit no-input interval.",
      snippet: '{ "kind": "input", "press": "KeyW", "holdTicks": 30, "release": true }',
    },
    message: `Playtest scenario '${scenarioPath}' has an invalid step: ${message}`,
    severity: "error",
    suggestion: "Each step must define press or waitTicks/waitFrames; holdTicks/holdFrames and waitTicks/waitFrames must be positive integers.",
  });
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function validateOptionalNumberTuple(value: Record<string, unknown>, key: "position" | "scale", length: 3, scenarioPath: string, index: number): [number, number, number] | undefined;
function validateOptionalNumberTuple(value: Record<string, unknown>, key: "rotation", length: 4, scenarioPath: string, index: number): [number, number, number, number] | undefined;
function validateOptionalNumberTuple(
  value: Record<string, unknown>,
  key: "position" | "rotation" | "scale",
  length: 3 | 4,
  scenarioPath: string,
  index: number,
): [number, number, number] | [number, number, number, number] | undefined {
  if (!hasKey(value, key)) {
    return undefined;
  }
  const tuple = length === 3 ? validateNumberTuple(value[key], 3) : validateNumberTuple(value[key], 4);
  if (tuple === undefined) {
    throw invalidScenario(scenarioPath, `Scenario setup.entities[${index}].${key} must be a ${length}-number tuple.`);
  }
  return tuple;
}

function validateNumberTuple(value: unknown, length: 3): [number, number, number] | undefined;
function validateNumberTuple(value: unknown, length: 4): [number, number, number, number] | undefined;
function validateNumberTuple(value: unknown, length: 3 | 4): [number, number, number] | [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== length || !value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    return undefined;
  }
  return value as [number, number, number] | [number, number, number, number];
}

function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasKey(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
