import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type PlaytestTarget = "web" | "desktop" | "bevy";

export interface IPlaytestViewport {
  height: number;
  width: number;
}

export interface IPlaytestStep {
  holdFrames?: number;
  label?: string;
  press?: string;
  release: boolean;
  waitFrames?: number;
}

export interface IPlaytestMovementAssertion {
  axis?: string;
  entity?: string;
  minAxisDelta?: {
    axis: string;
    min: number;
  };
  minDistance?: number;
  minVelocity?: number;
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

export interface IPlaytestAnimationAssertion {
  advancedFrames?: number;
  clip?: string;
  entered?: boolean;
  entity?: string;
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
  resources?: IPlaytestPathAssertion[];
  visibility?: IPlaytestVisibilityAssertion[];
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
  const holdFrames = positiveInteger(value.holdFrames);
  const waitFrames = positiveInteger(value.waitFrames);
  if (press === undefined && waitFrames === undefined) {
    throw invalidStep(scenarioPath, `Scenario step ${index} must define press or waitFrames.`);
  }
  if (value.holdFrames !== undefined && holdFrames === undefined) {
    throw invalidStep(scenarioPath, `Scenario step ${index} holdFrames must be a positive integer.`);
  }
  if (value.waitFrames !== undefined && waitFrames === undefined) {
    throw invalidStep(scenarioPath, `Scenario step ${index} waitFrames must be a positive integer.`);
  }
  return {
    ...(holdFrames === undefined ? {} : { holdFrames }),
    ...(typeof value.label === "string" ? { label: value.label } : {}),
    ...(press === undefined ? {} : { press }),
    release: typeof value.release === "boolean" ? value.release : true,
    ...(waitFrames === undefined ? {} : { waitFrames }),
  };
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
            ...(typeof movement.minDistance === "number" && Number.isFinite(movement.minDistance) ? { minDistance: movement.minDistance } : {}),
            ...(typeof movement.minVelocity === "number" && Number.isFinite(movement.minVelocity) ? { minVelocity: movement.minVelocity } : {}),
            ...(typeof movement.rotationChanged === "boolean" ? { rotationChanged: movement.rotationChanged } : {}),
          },
    }),
    ...(Array.isArray(value.resources) ? { resources: value.resources.map(validatePathAssertion).filter((item): item is IPlaytestPathAssertion => item !== undefined) } : {}),
    ...(Array.isArray(value.visibility) ? { visibility: value.visibility.map(validateVisibilityAssertion).filter((item): item is IPlaytestVisibilityAssertion => item !== undefined) } : {}),
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
      docs: "docs/workflows/playtesting.md",
      instruction: "Use playtest schemaVersion 1 with a file-safe name, target, viewport, warmupFrames, and non-empty steps.",
      snippet: '{ "schemaVersion": 1, "name": "forward-smoke", "target": "web", "viewport": { "width": 1280, "height": 720 }, "warmupFrames": 10, "steps": [{ "press": "KeyW", "holdFrames": 30, "release": true }] }',
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
      docs: "docs/workflows/playtesting.md",
      instruction: "Give each step either a press with positive holdFrames or a positive waitFrames value.",
      snippet: '{ "press": "KeyW", "holdFrames": 30, "release": true }',
    },
    message: `Playtest scenario '${scenarioPath}' has an invalid step: ${message}`,
    severity: "error",
    suggestion: "Each step must define press or waitFrames; holdFrames and waitFrames must be positive integers.",
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
