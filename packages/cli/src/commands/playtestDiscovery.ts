import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import type { IPlaytestScenario } from "./playtestScenario.js";

export interface IDiscoveryCandidate {
  id: string;
  reasons: string[];
  score: number;
  source?: string;
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

export async function discoverPlaytestTargets(projectPath: string): Promise<IPlaytestDiscoveryReport> {
  const documents = await readContentDocuments(projectPath);
  const entityScores = new Map<string, IDiscoveryCandidate>();
  const cameras = new Map<string, IDiscoveryCandidate>();
  const resources = new Map<string, IDiscoveryCandidate>();
  const hud = new Map<string, IDiscoveryCandidate>();
  const inputs = new Map<string, IDiscoveryCandidate>();
  for (const document of documents) {
    collectFromValue(document.value, document.path, { cameras, entityScores, hud, inputs, resources });
  }
  const controllableEntities = rank([...entityScores.values()]);
  const inputCandidates = rank([...inputs.values()]);
  const cameraCandidates = rank([...cameras.values()]);
  const resourceCandidates = rank([...resources.values()]);
  const hudCandidates = rank([...hud.values()]);
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

export async function suggestPlaytestScenario(projectPath: string, preset: string): Promise<IPlaytestScenario> {
  const discovery = await discoverPlaytestTargets(projectPath);
  const subject = discovery.controllableEntities[0]?.id ?? "player";
  const press = discovery.inputs[0]?.id ?? "KeyD";
  const camera = discovery.cameras[0]?.id;
  const resource = discovery.resources[0]?.id;
  const hud = discovery.hud[0]?.id;
  if (preset === "camera-follow") {
    return {
      assert: { camera: { entity: camera ?? "camera.main", follows: subject, within: 10 }, movement: { entity: subject, minDistance: 0.01 } },
      name: "camera-follow",
      schemaVersion: 1,
      steps: [{ holdFrames: 30, press, release: true }],
      subject,
      target: "web",
      viewport: { height: 720, width: 1280 },
      warmupFrames: 5,
    };
  }
  if (preset === "hud-resource") {
    return {
      assert: {
        hud: hud === undefined ? [] : [{ changed: true, id: hud }],
        resources: resource === undefined ? [] : [{ changed: true, id: resource }],
      },
      name: "hud-resource",
      schemaVersion: 1,
      steps: [{ holdFrames: 30, press, release: true }],
      subject,
      target: "web",
      viewport: { height: 720, width: 1280 },
      warmupFrames: 5,
    };
  }
  return {
    assert: { movement: { entity: subject, minDistance: 0.01 } },
    name: "smoke-movement",
    schemaVersion: 1,
    steps: [{ holdFrames: 30, press, release: true }],
    subject,
    target: "web",
    viewport: { height: 720, width: 1280 },
    warmupFrames: 5,
  };
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
  if (input.resourceCandidates.length > 0 || input.hudCandidates.length > 0) {
    presets.push({ id: "hud-resource", reasons: ["resource or HUD candidate"], score: 60 });
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
