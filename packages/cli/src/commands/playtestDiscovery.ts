import { buildProject } from "@threenative/compiler";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import type { IPlaytestScenario } from "./playtestScenario.js";

export interface IDiscoveryCandidate {
  id: string;
  reasons: string[];
  score: number;
  source?: string;
  unverified?: boolean;
}

export interface IPlaytestDiscoveryReport {
  cameras: IDiscoveryCandidate[];
  code: "TN_PLAYTEST_DISCOVERY_EMPTY" | "TN_PLAYTEST_DISCOVERY_OK";
  controllableEntities: IDiscoveryCandidate[];
  hud: IDiscoveryCandidate[];
  inputs: IDiscoveryCandidate[];
  resources: IDiscoveryCandidate[];
  scenarioPresets: IDiscoveryCandidate[];
}

interface ISourceDocument {
  path: string;
  value: unknown;
}

export interface IBundleGrounding {
  cameraIds?: Set<string>;
  entityIds?: Set<string>;
  hudIds?: Set<string>;
  ids?: Set<string>;
  resourceIds?: Set<string>;
  text: string;
}

export interface IPlaytestSuggestionDiagnostic {
  code: "TN_PLAYTEST_SUGGEST_INSUFFICIENT";
  message: string;
  missing: string[];
  severity: "warning";
  suggestion: string;
}

export interface IDiscoveryDependencies {
  loadBundleGrounding?: (projectPath: string) => Promise<IBundleGrounding>;
}

export async function discoverPlaytestTargets(projectPath: string, dependencies: IDiscoveryDependencies = {}): Promise<IPlaytestDiscoveryReport> {
  const documents = await readContentDocuments(projectPath);
  const entityScores = new Map<string, IDiscoveryCandidate>();
  const cameras = new Map<string, IDiscoveryCandidate>();
  const resources = new Map<string, IDiscoveryCandidate>();
  const hud = new Map<string, IDiscoveryCandidate>();
  const inputs = new Map<string, IDiscoveryCandidate>();
  for (const document of documents) {
    collectFromValue(document.value, document.path, { cameras, entityScores, hud, inputs, resources });
  }
  await applyCommittedScenarioHints(projectPath, entityScores, inputs);
  let grounding: IBundleGrounding | undefined;
  try {
    grounding = await (dependencies.loadBundleGrounding ?? loadCompiledBundleGrounding)(projectPath);
  } catch {
    // Discovery remains useful when compilation is unavailable, but labels every result honestly.
  }
  const controllableEntities = groundedCandidates(entityScores, grounding, "entity");
  const inputCandidates = groundedCandidates(inputs, grounding, "input");
  const cameraCandidates = groundedCandidates(cameras, grounding, "camera");
  const resourceCandidates = groundedCandidates(resources, grounding, "resource");
  const hudCandidates = groundedCandidates(hud, grounding, "hud");
  const scenarioPresets = buildScenarioPresetCandidates({ cameraCandidates, controllableEntities, hudCandidates, inputCandidates, resourceCandidates });
  const empty = controllableEntities.length === 0 && inputCandidates.length === 0 && cameraCandidates.length === 0 && resourceCandidates.length === 0 && hudCandidates.length === 0;
  return {
    cameras: cameraCandidates,
    code: empty ? "TN_PLAYTEST_DISCOVERY_EMPTY" : "TN_PLAYTEST_DISCOVERY_OK",
    controllableEntities,
    hud: hudCandidates,
    inputs: inputCandidates,
    resources: resourceCandidates,
    scenarioPresets,
  };
}

async function applyCommittedScenarioHints(
  projectPath: string,
  entities: Map<string, IDiscoveryCandidate>,
  inputs: Map<string, IDiscoveryCandidate>,
): Promise<void> {
  for (const file of await listJsonFiles(resolve(projectPath, "playtests"))) {
    try {
      const scenario = JSON.parse(await readFile(file, "utf8")) as IPlaytestScenario;
      const subject = scenario.subject ?? scenario.assert?.movement?.entity;
      const subjectCandidate = subject === undefined ? undefined : entities.get(subject);
      if (subjectCandidate !== undefined) {
        subjectCandidate.score = Math.max(subjectCandidate.score, 150);
        subjectCandidate.reasons = [...new Set([...subjectCandidate.reasons, "committed playtest subject"])];
      }
      const firstPress = scenario.steps.find((step) => typeof step.press === "string")?.press;
      const inputCandidate = firstPress === undefined ? undefined : inputs.get(firstPress);
      if (inputCandidate !== undefined) {
        inputCandidate.score = Math.max(inputCandidate.score, 140);
        inputCandidate.reasons = [...new Set([...inputCandidate.reasons, "committed playtest input"])];
      }
    } catch {
      // Invalid committed scenarios are left to the schema validator.
    }
  }
}

export async function suggestPlaytestScenario(
  projectPath: string,
  preset: string,
  dependencies: IDiscoveryDependencies = {},
): Promise<IPlaytestScenario | IPlaytestSuggestionDiagnostic> {
  const discovery = await discoverPlaytestTargets(projectPath, dependencies);
  const subject = discovery.controllableEntities.find((candidate) => candidate.unverified !== true)?.id;
  const press = discovery.inputs.find((candidate) => candidate.unverified !== true)?.id;
  const camera = discovery.cameras[0]?.id;
  const resource = discovery.resources[0]?.id;
  const hud = discovery.hud[0]?.id;
  const missing = [subject === undefined ? "verified controllable entity" : undefined, press === undefined ? "verified input" : undefined].filter((value): value is string => value !== undefined);
  if (preset === "camera-follow" && camera === undefined) missing.push("camera");
  if (preset === "hud-resource" && resource === undefined) missing.push("changing resource");
  if (missing.length > 0) {
    return insufficientSuggestion(missing);
  }
  const previous = await previousScenarioShape(projectPath, subject!, press!);
  const movement = { ...(previous?.assert?.movement ?? {}), entity: subject!, minDistance: previous?.assert?.movement?.minDistance ?? 0.01 };
  const steps = previous?.steps ?? [{ holdFrames: 30, press: press!, release: true }];
  if (preset === "camera-follow") {
    return {
      assert: { camera: { ...(previous?.assert?.camera ?? {}), entity: camera!, follows: subject!, within: previous?.assert?.camera?.within ?? 10 }, movement },
      name: "camera-follow",
      schemaVersion: 1,
      steps,
      subject: subject!,
      target: "web",
      viewport: { height: 720, width: 1280 },
      warmupFrames: 5,
    };
  }
  if (preset === "hud-resource") {
    return {
      assert: {
        hud: previous?.assert?.hud ?? (hud === undefined ? [] : [{ changed: true, id: hud }]),
        resources: previous?.assert?.resources ?? [{ changed: true, id: resource! }],
      },
      name: "hud-resource",
      schemaVersion: 1,
      steps,
      subject: subject!,
      target: "web",
      viewport: { height: 720, width: 1280 },
      warmupFrames: 5,
    };
  }
  return {
    assert: { movement },
    name: preset,
    schemaVersion: 1,
    steps,
    subject: subject!,
    target: "web",
    viewport: { height: 720, width: 1280 },
    warmupFrames: 5,
  };
}

function insufficientSuggestion(missing: string[]): IPlaytestSuggestionDiagnostic {
  return {
    code: "TN_PLAYTEST_SUGGEST_INSUFFICIENT",
    message: `Cannot suggest a grounded playtest scenario; missing ${missing.join(", ")}.`,
    missing,
    severity: "warning",
    suggestion: "Build the project and author the missing gameplay surfaces, then rerun playtest discovery.",
  };
}

async function previousScenarioShape(projectPath: string, subject: string, input: string): Promise<Pick<IPlaytestScenario, "assert" | "steps"> | undefined> {
  for (const file of await listJsonFiles(resolve(projectPath, "playtests"))) {
    try {
      const scenario = JSON.parse(await readFile(file, "utf8")) as IPlaytestScenario;
      const sameSubject = scenario.subject === subject || scenario.assert?.movement?.entity === subject;
      const sameInput = scenario.steps.some((step) => step.press === input);
      if (sameSubject || sameInput) return { assert: scenario.assert, steps: scenario.steps };
    } catch {
      // Invalid scenarios are diagnosed by the playtest schema, not suggestion mining.
    }
  }
  return undefined;
}

function groundedCandidates(
  candidates: Map<string, IDiscoveryCandidate>,
  grounding: IBundleGrounding | undefined,
  kind: "camera" | "entity" | "hud" | "input" | "resource",
): IDiscoveryCandidate[] {
  if (grounding === undefined) {
    return rank([...candidates.values()].map((candidate) => ({ ...candidate, unverified: true })));
  }
  const ids = kind === "entity" ? grounding.entityIds
    : kind === "camera" ? grounding.cameraIds
    : kind === "resource" ? grounding.resourceIds
    : kind === "hud" ? grounding.hudIds
    : undefined;
  return rank([...candidates.values()].filter((candidate) => kind === "input"
    ? grounding.text.includes(`keyboard.${candidate.id}`) || grounding.text.includes(`\"${candidate.id}\"`)
    : (ids ?? grounding.ids ?? new Set()).has(candidate.id)));
}

async function loadCompiledBundleGrounding(projectPath: string): Promise<IBundleGrounding> {
  const { bundlePath } = await buildProject(projectPath);
  const entityIds = new Set<string>();
  const cameraIds = new Set<string>();
  const resourceIds = new Set<string>();
  const hudIds = new Set<string>();
  const chunks: string[] = [];
  for (const file of await listBundleFiles(bundlePath)) {
    const text = await readFile(file, "utf8");
    chunks.push(text);
    if (file.endsWith("world.ir.json")) collectWorldGrounding(JSON.parse(text), entityIds, cameraIds, resourceIds);
    else if (file.endsWith("ui.ir.json")) collectIds(JSON.parse(text), hudIds);
    else if (file.endsWith("systems.ir.json") || file.endsWith("scripts.manifest.json")) collectResourceIds(JSON.parse(text), resourceIds);
  }
  return { cameraIds, entityIds, hudIds, resourceIds, text: chunks.join("\n") };
}

async function listBundleFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await listBundleFiles(path));
    else if (entry.name.endsWith(".json") || entry.name.endsWith(".js")) files.push(path);
  }
  return files;
}

function collectIds(value: unknown, ids: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectIds(item, ids));
  } else if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (key === "id" && typeof child === "string") ids.add(child);
      collectIds(child, ids);
    }
  }
}

export function collectWorldGrounding(value: unknown, entities: Set<string>, cameras: Set<string>, resources: Set<string>): void {
  if (!isRecord(value) || !Array.isArray(value.entities)) return;
  for (const entity of value.entities) {
    if (!isRecord(entity) || typeof entity.id !== "string") continue;
    entities.add(entity.id);
    if (isRecord(entity.components) && (hasKey(entity.components, "Camera") || hasKey(entity.components, "camera"))) cameras.add(entity.id);
  }
  if (isRecord(value.resources)) Object.keys(value.resources).forEach((id) => resources.add(id));
}

function collectResourceIds(value: unknown, resources: Set<string>): void {
  if (Array.isArray(value)) return value.forEach((item) => collectResourceIds(item, resources));
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if ((key === "resourceReads" || key === "resourceWrites") && Array.isArray(child)) {
      child.filter((item): item is string => typeof item === "string").forEach((id) => resources.add(id));
    }
    if ((key === "resource" || key === "resourceId" || key === "id") && typeof child === "string" && /resource/i.test(JSON.stringify(value))) resources.add(child);
    collectResourceIds(child, resources);
  }
}

async function readContentDocuments(projectPath: string): Promise<ISourceDocument[]> {
  const contentPath = resolve(projectPath, "content");
  const files = await listJsonFiles(contentPath);
  const documents: ISourceDocument[] = [];
  for (const file of files) {
    try {
      documents.push({ path: relative(projectPath, file), value: JSON.parse(await readFile(file, "utf8")) });
    } catch {
      // Authoring validation owns malformed source diagnostics. Discovery skips unreadable docs.
    }
  }
  return documents;
}

async function listJsonFiles(root: string): Promise<string[]> {
  let entries: Array<{ name: string; path: string; type: "directory" | "file" }> = [];
  try {
    entries = (await readdir(root, { withFileTypes: true })).map((entry) => ({
      name: entry.name,
      path: join(root, entry.name),
      type: entry.isDirectory() ? "directory" : "file",
    }));
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.type === "directory") {
      files.push(...await listJsonFiles(entry.path));
    } else if (entry.name.endsWith(".json")) {
      files.push(entry.path);
    }
  }
  return files;
}

function collectFromValue(
  value: unknown,
  source: string,
  output: {
    cameras: Map<string, IDiscoveryCandidate>;
    entityScores: Map<string, IDiscoveryCandidate>;
    hud: Map<string, IDiscoveryCandidate>;
    inputs: Map<string, IDiscoveryCandidate>;
    resources: Map<string, IDiscoveryCandidate>;
  },
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectFromValue(item, source, output);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  if (typeof value.id === "string") {
    if (isEntityLike(value)) {
      addCandidate(output.entityScores, value.id, source, entityReasons(value), entityScore(value));
    }
    if (isCameraLike(value)) {
      addCandidate(output.cameras, value.id, source, ["camera"], 80);
    }
    if (isResourceLike(value)) {
      addCandidate(output.resources, value.id, source, ["resource"], 50);
    }
    if (isHudLike(value)) {
      addCandidate(output.hud, value.id, source, ["HUD text node"], 50);
    }
  }
  collectKeyboardInputs(value, source, output.inputs);
  for (const child of Object.values(value)) {
    collectFromValue(child, source, output);
  }
}

function collectKeyboardInputs(value: Record<string, unknown>, source: string, inputs: Map<string, IDiscoveryCandidate>): void {
  const bindings = value.bindings;
  if (!Array.isArray(bindings)) {
    return;
  }
  for (const binding of bindings) {
    if (typeof binding !== "string" || !binding.startsWith("keyboard.")) {
      continue;
    }
    addCandidate(inputs, binding.slice("keyboard.".length), source, [`input binding${typeof value.id === "string" ? `:${value.id}` : ""}`], 70);
  }
}

function buildScenarioPresetCandidates(input: {
  cameraCandidates: IDiscoveryCandidate[];
  controllableEntities: IDiscoveryCandidate[];
  hudCandidates: IDiscoveryCandidate[];
  inputCandidates: IDiscoveryCandidate[];
  resourceCandidates: IDiscoveryCandidate[];
}): IDiscoveryCandidate[] {
  const presets: IDiscoveryCandidate[] = [];
  if (input.controllableEntities.length > 0 && input.inputCandidates.length > 0) {
    presets.push({ id: "smoke-movement", reasons: ["controllable entity", "keyboard input"], score: 100 });
  }
  if (input.controllableEntities.length > 0 && input.cameraCandidates.length > 0) {
    presets.push({ id: "camera-follow", reasons: ["controllable entity", "camera"], score: 80 });
  }
  if (input.resourceCandidates.length > 0 && input.hudCandidates.length > 0) {
    presets.push({ id: "hud-resource", reasons: ["resource and HUD candidates"], score: 60 });
  }
  return presets;
}

function addCandidate(candidates: Map<string, IDiscoveryCandidate>, id: string, source: string, reasons: string[], score: number): void {
  const existing = candidates.get(id);
  if (existing === undefined) {
    candidates.set(id, { id, reasons: [...new Set(reasons)], score, source });
    return;
  }
  existing.score = Math.max(existing.score, score);
  existing.reasons = [...new Set([...existing.reasons, ...reasons])];
}

function rank(candidates: IDiscoveryCandidate[]): IDiscoveryCandidate[] {
  return candidates.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

function entityReasons(value: Record<string, unknown>): string[] {
  const reasons = ["Transform"];
  const components = isRecord(value.components) ? value.components : {};
  if (hasKey(components, "characterController") || hasKey(components, "CharacterController")) {
    reasons.push("CharacterController");
  }
  if (hasKey(components, "rigidBody") || hasKey(components, "RigidBody")) {
    reasons.push("RigidBody");
  }
  if (typeof value.prefab === "string") {
    reasons.push("prefab");
  }
  return reasons;
}

function entityScore(value: Record<string, unknown>): number {
  const id = typeof value.id === "string" ? value.id.toLowerCase() : "";
  const components = isRecord(value.components) ? value.components : {};
  let score = 25;
  if (id.includes("player") || id.includes("hero") || id.includes("vehicle") || id.includes("car")) {
    score += 50;
  }
  if (hasKey(components, "characterController") || hasKey(components, "CharacterController")) {
    score += 30;
  }
  if (hasKey(components, "rigidBody") || hasKey(components, "RigidBody")) {
    score += 20;
  }
  if (typeof value.prefab === "string") {
    score += 10;
  }
  return score;
}

function isEntityLike(value: Record<string, unknown>): boolean {
  return typeof value.id === "string" && (isRecord(value.components) || isRecord(value.transform) || Array.isArray(value.transform) || typeof value.prefab === "string");
}

function isCameraLike(value: Record<string, unknown>): boolean {
  const components = isRecord(value.components) ? value.components : {};
  return typeof value.id === "string" && (value.id.includes("camera") || hasKey(components, "camera") || hasKey(components, "Camera"));
}

function isResourceLike(value: Record<string, unknown>): boolean {
  return typeof value.id === "string" && hasKey(value, "value");
}

function isHudLike(value: Record<string, unknown>): boolean {
  return typeof value.id === "string" && (value.type === "text" || typeof value.text === "string");
}

function hasKey(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
