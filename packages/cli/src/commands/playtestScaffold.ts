import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import type { IPlaytestScenario } from "./playtestScenario.js";

export type PlaytestScaffoldMechanic = "movement" | "pickup" | "win-state" | "retry";

interface IPlaytestScaffoldTemplate {
  aliases: readonly string[];
  description: string;
  filename: string;
  mechanic: PlaytestScaffoldMechanic;
  scenario(options: { hudId: string; resourceId: string; subject: string }): IPlaytestScenario;
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
    scenario: ({ hudId, resourceId, subject }) => ({
      assert: {
        contacts: [{ entity: subject, kind: "trigger", minCount: 1, with: "pickup" }],
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

  const scenario = buildPlaytestScaffoldScenario(template.mechanic, {
    hudId: readFlag(normalizedArgv, "--hud") ?? "score-label",
    resourceId: readFlag(normalizedArgv, "--resource") ?? "GameState",
    subject: readFlag(normalizedArgv, "--subject") ?? readFlag(normalizedArgv, "--entity") ?? "player",
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

export function playtestScaffoldMechanics(): string[] {
  return supportedMechanics();
}

export function buildPlaytestScaffoldScenario(
  mechanic: PlaytestScaffoldMechanic,
  options: { hudId?: string; resourceId?: string; subject?: string } = {},
): IPlaytestScenario {
  const template = SCAFFOLD_TEMPLATES.find((candidate) => candidate.mechanic === mechanic);
  if (template === undefined) {
    throw new Error(`Unsupported playtest scaffold mechanic '${mechanic}'.`);
  }
  return template.scenario({
    hudId: options.hudId ?? "score-label",
    resourceId: options.resourceId ?? "GameState",
    subject: options.subject ?? "player",
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
