import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { loadAuthoringProject } from "@threenative/authoring";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import type { IPlaytestScenario } from "./playtestScenario.js";

export type PlaytestScaffoldMechanic = "movement" | "pickup" | "win-state" | "retry";

interface IPlaytestScaffoldTemplate {
  aliases: readonly string[];
  description: string;
  filename: string;
  mechanic: PlaytestScaffoldMechanic;
  scenario(options: { contactWith: string; hudId: string; resourceId: string; subject: string }): IPlaytestScenario;
}

const SCAFFOLD_TEMPLATES: readonly IPlaytestScaffoldTemplate[] = [
  {
    aliases: ["keyboard-movement", "move", "navigation"],
    description: "Keyboard movement proof with held input, distance, velocity, visibility, and diagnostics assertions.",
    filename: "proof-movement.playtest.json",
    mechanic: "movement",
    scenario: ({ subject }) => ({
      assert: {
        diagnostics: { noConsoleErrors: true, noNetworkErrors: true, runtimeReady: true },
        movement: { entity: subject, minDistance: 0.5, minVelocity: 0.01 },
        visibility: [{ entity: subject, minProjectedPixels: 600 }],
      },
      artifacts: { effectLog: "focused", screenshots: "before-after" },
      name: "proof-movement",
      schemaVersion: 1,
      steps: [{ holdFrames: 45, label: "hold right", press: "KeyD", release: true }],
      subject,
      target: "web",
      viewport: { height: 720, width: 1280 },
      warmupFrames: 10,
    }),
  },
  {
    aliases: ["pickup-objective", "collect", "collector"],
    description: "Pickup objective proof with movement, contact, resource, HUD, and diagnostics assertions.",
    filename: "proof-pickup.playtest.json",
    mechanic: "pickup",
    scenario: ({ contactWith, hudId, resourceId, subject }) => ({
      assert: {
        contacts: [{ entity: subject, kind: "trigger", minCount: 1, with: contactWith }],
        diagnostics: { noConsoleErrors: true, noNetworkErrors: true, runtimeReady: true },
        hud: [{ id: hudId, textIncludes: "Score" }],
        movement: { entity: subject, minDistance: 0.5, minVelocity: 0.01 },
        resources: [{ changed: true, id: resourceId }],
      },
      artifacts: { effectLog: "focused", screenshots: "before-after" },
      name: "proof-pickup",
      schemaVersion: 1,
      steps: [
        { holdFrames: 45, label: "move to pickup", press: "KeyD", release: true },
        { holdFrames: 35, label: "continue route", press: "KeyW", release: true },
      ],
      subject,
      target: "web",
      viewport: { height: 720, width: 1280 },
      warmupFrames: 10,
    }),
  },
  {
    aliases: ["win", "complete", "objective"],
    description: "Win-state proof with objective route, resource, HUD, and clean diagnostics assertions.",
    filename: "proof-win-state.playtest.json",
    mechanic: "win-state",
    scenario: ({ hudId, resourceId, subject }) => ({
      assert: {
        diagnostics: { noConsoleErrors: true, noNetworkErrors: true, runtimeReady: true },
        hud: [{ id: hudId, textIncludes: "Win" }],
        movement: { entity: subject, minDistance: 0.5 },
        resources: [{ id: resourceId, path: "status", textIncludes: "win" }],
      },
      artifacts: { effectLog: "focused", screenshots: "before-after" },
      name: "proof-win-state",
      schemaVersion: 1,
      steps: [
        { holdFrames: 45, label: "advance objective", press: "KeyD", release: true },
        { holdFrames: 45, label: "finish objective", press: "KeyW", release: true },
      ],
      subject,
      target: "web",
      viewport: { height: 720, width: 1280 },
      warmupFrames: 10,
    }),
  },
  {
    aliases: ["retry-path", "restart", "reset"],
    description: "Retry-path proof with KeyR input, resource/HUD reset checks, and diagnostics assertions.",
    filename: "proof-retry.playtest.json",
    mechanic: "retry",
    scenario: ({ hudId, resourceId, subject }) => ({
      assert: {
        diagnostics: { noConsoleErrors: true, noNetworkErrors: true, runtimeReady: true },
        hud: [{ id: hudId, textIncludes: "Ready" }],
        resources: [{ id: resourceId, path: "status", textIncludes: "ready" }],
      },
      artifacts: { effectLog: "focused", screenshots: "before-after" },
      name: "proof-retry",
      schemaVersion: 1,
      steps: [
        { holdFrames: 1, label: "press retry", press: "KeyR", release: true },
        { label: "allow reset frame", release: true, waitFrames: 12 },
      ],
      subject,
      target: "web",
      viewport: { height: 720, width: 1280 },
      warmupFrames: 10,
    }),
  },
] as const;

export async function playtestScaffoldCommand(
  argv: readonly string[],
  cwd = process.env.INIT_CWD ?? process.cwd(),
): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolve(cwd, readFlag(normalizedArgv, "--project") ?? ".");
  const mechanic = readFlag(normalizedArgv, "--assert");
  const template = mechanic === undefined ? undefined : resolveTemplate(mechanic);

  if (template === undefined) {
    return diagnosticResult(
      {
        code: "TN_PLAYTEST_SCAFFOLD_ASSERTION_UNKNOWN",
        fix: {
          instruction: `Use one of: ${supportedMechanics().join(", ")}.`,
        },
        message: mechanic === undefined ? "--assert is required for tn playtest scaffold." : `Unknown playtest scaffold assertion '${mechanic}'.`,
        severity: "error",
        supportedMechanics: supportedMechanics(),
      },
      { exitCode: 2, json, stderr: !json },
    );
  }

  const discovered = await discoverScaffoldIds(projectPath, template.mechanic);
  const scenario = buildPlaytestScaffoldScenario(template.mechanic, {
    contactWith: readFlag(normalizedArgv, "--contact-with") ?? discovered.contactWith,
    hudId: readFlag(normalizedArgv, "--hud") ?? discovered.hudId,
    resourceId: readFlag(normalizedArgv, "--resource") ?? discovered.resourceId,
    subject: readFlag(normalizedArgv, "--subject") ?? readFlag(normalizedArgv, "--entity") ?? discovered.subject,
  });
  const scenarioPath = readFlag(normalizedArgv, "--out") ?? join("playtests", template.filename);
  const absolutePath = resolve(projectPath, scenarioPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(scenario, null, 2)}\n`, "utf8");

  const relativePath = relative(projectPath, absolutePath);
  const payload = {
    code: "TN_PLAYTEST_SCAFFOLD_WRITTEN",
    mechanic: template.mechanic,
    message: `Wrote ${template.description}`,
    next: `tn playtest --project . --scenario ${relativePath} --json`,
    scenario,
    scenarioPath: relativePath,
    supportedMechanics: supportedMechanics(),
  };

  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n${payload.next}\n`,
  };
}

async function discoverScaffoldIds(projectPath: string, mechanic: PlaytestScaffoldMechanic): Promise<{ contactWith: string; hudId: string; resourceId: string; subject: string }> {
  try {
    const project = await loadAuthoringProject({ projectPath });
    const scene = project.documents.find((document) => document.kind === "scene");
    const sceneData = isRecord(scene?.data) ? scene.data : {};
    const entities = Array.isArray(sceneData.entities) ? sceneData.entities.filter(isRecord) : [];
    const instances = Array.isArray(sceneData.instances) ? sceneData.instances.filter(isRecord) : [];
    const entityCandidates = [...entities, ...instances];
    const resources = Array.isArray(sceneData.resources) ? sceneData.resources.filter(isRecord) : [];
    const uiDocument = project.documents.find((document) => document.kind === "ui");
    const uiData = isRecord(uiDocument?.data) ? uiDocument.data : {};
    const uiNodes = Array.isArray(uiData.nodes) ? uiData.nodes.filter(isRecord) : [];
    const resourceDocument = project.documents.find((document) => document.kind === "resources");
    const resourceData = isRecord(resourceDocument?.data) ? resourceDocument.data : {};
    const reusableResources = Array.isArray(resourceData.resources) ? resourceData.resources.filter(isRecord) : [];
    const subject = stringId(entityCandidates.find((entity) => isRecord(entity.components) && (entity.components.CharacterController !== undefined || entity.components.RigidBody !== undefined))?.id)
      ?? stringId(entityCandidates.find((entity) => /(?:^|[._-])(player|hero|car|kart|vehicle)(?:$|[._-])/iu.test(String(entity.id)))?.id)
      ?? stringId(entityCandidates[0]?.id)
      ?? "entity";
    const resourceCandidates = [...resources, ...reusableResources];
    const resourceId = stringId(preferredResource(resourceCandidates, mechanic)?.id) ?? stringId(resourceCandidates[0]?.id) ?? "resource";
    const sceneUiNodes = isRecord(sceneData.ui) && Array.isArray(sceneData.ui.nodes) ? sceneData.ui.nodes.filter(isRecord) : [];
    const hudId = stringId(preferredHudNode([...uiNodes, ...sceneUiNodes], mechanic)?.id) ?? stringId(uiNodes[0]?.id) ?? stringId(sceneUiNodes[0]?.id) ?? "hud";
    const contactWith = stringId(entityCandidates.find((entity) => Array.isArray(entity.tags) && entity.tags.some((tag) => /pickup|orb|collect/iu.test(String(tag))))?.id)
      ?? stringId(entityCandidates.find((entity) => isRecord(entity.components) && entity.components.Collider !== undefined && entity.id !== subject)?.id)
      ?? "pickup";
    return { contactWith, hudId, resourceId, subject };
  } catch {
    return { contactWith: "pickup", hudId: "hud", resourceId: "resource", subject: "entity" };
  }
}

function preferredResource(resources: Record<string, unknown>[], mechanic: PlaytestScaffoldMechanic): Record<string, unknown> | undefined {
  const pattern = mechanic === "pickup" ? /collect|orb|score|count/iu : mechanic === "win-state" ? /match|win|status|outcome/iu : mechanic === "retry" ? /game|match|state|status/iu : /player|move|state/iu;
  return resources.find((resource) => pattern.test(String(resource.id)) || pattern.test(JSON.stringify(resource.value ?? resource) ?? ""));
}

function preferredHudNode(nodes: Record<string, unknown>[], mechanic: PlaytestScaffoldMechanic): Record<string, unknown> | undefined {
  const pattern = mechanic === "pickup" ? /orb|score|collect/iu : mechanic === "win-state" ? /status|win|outcome/iu : mechanic === "retry" ? /ready|countdown|retry/iu : /hud|status|score/iu;
  return nodes.find((node) => pattern.test(String(node.id)) || pattern.test(String(node.text)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export function playtestScaffoldMechanics(): string[] {
  return supportedMechanics();
}

export function buildPlaytestScaffoldScenario(
  mechanic: PlaytestScaffoldMechanic,
  options: { contactWith?: string; hudId?: string; resourceId?: string; subject?: string } = {},
): IPlaytestScenario {
  const template = SCAFFOLD_TEMPLATES.find((candidate) => candidate.mechanic === mechanic);
  if (template === undefined) {
    throw new Error(`Unsupported playtest scaffold mechanic '${mechanic}'.`);
  }
  return template.scenario({
    contactWith: options.contactWith ?? "pickup",
    hudId: options.hudId ?? "hud",
    resourceId: options.resourceId ?? "resource",
    subject: options.subject ?? "entity",
  });
}

function resolveTemplate(mechanic: string): IPlaytestScaffoldTemplate | undefined {
  return SCAFFOLD_TEMPLATES.find((template) => template.mechanic === mechanic || template.aliases.includes(mechanic));
}

function supportedMechanics(): string[] {
  return SCAFFOLD_TEMPLATES.map((template) => template.mechanic);
}

function readFlag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}
