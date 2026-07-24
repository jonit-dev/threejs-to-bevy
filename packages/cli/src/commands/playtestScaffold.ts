import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { hashAuthoringTransactionBytes, loadAuthoringProject, publishAuthoringTransaction } from "@threenative/authoring";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { spatialCrateSolutionSteps } from "../mechanicBlocks/spatial.js";
import type { IPlaytestScenario } from "./playtestScenario.js";
import type { GameProofAssertionFamily, IGameAcceptanceAssertion, IGamePlan } from "./gamePlanTypes.js";

export type PlaytestScaffoldMechanic = "movement" | "pickup" | "win-state" | "retry";

interface IPlaytestScaffoldTemplate {
  aliases: readonly string[];
  description: string;
  filename: string;
  mechanic: PlaytestScaffoldMechanic;
  scenario(options: { contactWith: string; hudId: string; resourceId: string; subject: string; subjectStart?: [number, number, number] }): IPlaytestScenario;
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
    description: "Pickup objective proof with movement, resource, HUD, and diagnostics assertions.",
    filename: "proof-pickup.playtest.json",
    mechanic: "pickup",
    scenario: ({ hudId, resourceId, subject, subjectStart }) => ({
      assert: {
        diagnostics: { noConsoleErrors: true, noNetworkErrors: true, runtimeReady: true },
        hud: [{ id: hudId, textIncludes: "Score" }],
        movement: { entity: subject, minDistance: 0.5, minVelocity: 0.01 },
        resources: [{ changed: true, id: resourceId }],
      },
      artifacts: { effectLog: "focused", screenshots: "before-after" },
      name: "proof-pickup",
      schemaVersion: 1,
      ...(subjectStart === undefined ? {} : { setup: { entities: [{ entity: subject, position: subjectStart }] } }),
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
  const fromPlan = readFlag(normalizedArgv, "--from-plan");
  if (fromPlan !== undefined) {
    return scaffoldFromPlan(projectPath, resolve(projectPath, fromPlan), json);
  }
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
    subjectStart: discovered.subjectStart,
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

interface IPlanProofIds {
  actor: string;
  actorStart: [number, number, number];
  blockedBoundaryX?: number;
  crate?: string;
  crates: Array<{ id: string; start: [number, number, number] }>;
  gridStep?: number;
  hud?: string;
  objective?: string;
  objectiveHasProgress: boolean;
  flightEntity?: string;
  flightResource?: string;
  flightRetryPath?: string;
  flightRetryProof?: {
    failedPhase: string;
    failurePosition: [number, number, number];
    restoredPhase: string;
  };
  flightStallPath?: string;
  pitchSurfaces: string[];
  pitchNegativeKey?: string;
  pitchPositiveKey?: string;
  rightKey?: string;
  rollNegativeKey?: string;
  rollPositiveKey?: string;
  rollSurfaces: string[];
  retryKey?: string;
  targetCount?: number;
}

async function scaffoldFromPlan(projectPath: string, planPath: string, json: boolean): Promise<ICommandResult> {
  let plan: IGamePlan;
  try {
    plan = JSON.parse(await readFile(planPath, "utf8")) as IGamePlan;
  } catch (error) {
    return diagnosticResult({ code: "TN_PLAYTEST_PLAN_READ_FAILED", message: `Unable to read game plan: ${error instanceof Error ? error.message : String(error)}.`, severity: "error" }, { exitCode: 1, json, stderr: !json });
  }
  const ids = await discoverPlanProofIds(projectPath);
  const required = plan.intentContract?.acceptanceAssertions?.filter((assertion) => assertion.required) ?? [];
  const planned = required.map((acceptance) => planScenario(acceptance, ids, plan.intentContract?.objectiveDurationTicks));
  const unsupported = planned.filter((entry) => "missing" in entry);
  if (unsupported.length > 0) {
    const payload = {
      code: "TN_PLAYTEST_PLAN_ASSERTION_UNSUPPORTED",
      diagnostics: unsupported.map((entry) => ({
        acceptanceId: entry.acceptance.id,
        code: "TN_PLAYTEST_PLAN_ASSERTION_UNSUPPORTED",
        message: `Acceptance '${entry.acceptance.id}' cannot be scaffolded: ${entry.missing}.`,
        missingCapability: entry.missing,
        severity: "error",
        suggestedFix: `Author a bounded manual scenario named acceptance-${entry.acceptance.id} with real input, before/after observations, and an assertion for '${entry.acceptance.description}'.`,
      })),
      filesWritten: [],
      message: "No playtests were written because every required acceptance assertion must have a supported proof family.",
      ok: false,
      proofEnrollment: {
        enrolledAcceptanceIds: [],
        missingAcceptanceIds: required.map((acceptance) => acceptance.id),
        requiredAcceptanceIds: required.map((acceptance) => acceptance.id),
      },
    };
    return { exitCode: 1, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n` };
  }
  const scenarios = planned.map((entry) => (entry as { acceptance: IGameAcceptanceAssertion; scenario: IPlaytestScenario }).scenario);
  const files = await Promise.all(scenarios.map(async (scenario) => {
    const path = `playtests/${scenario.name}.playtest.json`;
    const existing = await readFile(resolve(projectPath, path)).catch((error: unknown) => isMissingPathError(error) ? undefined : Promise.reject(error));
    return { baseHash: existing === undefined ? null : hashAuthoringTransactionBytes(existing), bytes: Buffer.from(`${JSON.stringify(scenario, null, 2)}\n`), path };
  }));
  const publication = await publishAuthoringTransaction({ files, projectPath });
  const payload = {
    acceptanceIds: required.map((acceptance) => acceptance.id),
    code: publication.ok ? "TN_PLAYTEST_PLAN_SCAFFOLD_WRITTEN" : "TN_PLAYTEST_PLAN_SCAFFOLD_FAILED",
    filesWritten: publication.filesWritten,
    message: publication.ok ? `Wrote ${scenarios.length} plan-derived playtest scenarios.` : "Plan-derived playtest publication failed.",
    next: "tn iterate --project . --json",
    nextIterateCommand: "tn iterate --project . --json",
    ok: publication.ok,
    proofEnrollment: {
      enrolledAcceptanceIds: publication.ok ? required.map((acceptance) => acceptance.id) : [],
      missingAcceptanceIds: publication.ok ? [] : required.map((acceptance) => acceptance.id),
      requiredAcceptanceIds: required.map((acceptance) => acceptance.id),
    },
    scenarios: scenarios.map((scenario) => ({ acceptanceId: scenario.acceptanceId, name: scenario.name, path: `playtests/${scenario.name}.playtest.json` })),
  };
  return { exitCode: publication.ok ? 0 : 1, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n` };
}

function planScenario(acceptance: IGameAcceptanceAssertion, ids: IPlanProofIds, objectiveDurationTicks?: number): { acceptance: IGameAcceptanceAssertion; missing: string } | { acceptance: IGameAcceptanceAssertion; scenario: IPlaytestScenario } {
  const family = acceptance.proof?.family;
  if (family === undefined) return { acceptance, missing: "proof-template-binding" };
  const missing = missingPlanCapability(family, ids, objectiveDurationTicks);
  if (missing !== undefined) return { acceptance, missing };
  const rightKey = ids.rightKey!;
  const retryKey = ids.retryKey!;
  const spatialSolution = ids.gridStep === undefined || ids.crates.length === 0
    ? undefined
    : spatialCrateSolutionSteps(ids.crates, ids.actorStart, ids.gridStep);
  const common = {
    acceptanceId: acceptance.id,
    artifacts: { effectLog: "focused" as const, screenshots: "before-after" as const },
    name: acceptance.proof!.templateId,
    schemaVersion: 1 as const,
    target: "web" as const,
    viewport: { height: 720, width: 1280 },
    warmupFrames: 5,
  };
  const scenario: IPlaytestScenario = family === "canvas-render"
    ? { ...common, assert: { diagnostics: cleanDiagnostics(), visual: [{ region: { height: 720, minNonblankPixelRatio: 0.01, width: 1280, x: 0, y: 0 } }] }, steps: [{ label: "observe active canvas", release: false, waitFrames: 2 }], subject: ids.actor }
    : family === "flight-cruise-duration"
      ? { ...common, assert: { diagnostics: cleanDiagnostics(), movement: { entity: ids.flightEntity!, minDistance: 1, maxDistance: 1_000_000 }, resources: [{ equals: false, id: ids.flightResource!, path: ids.flightStallPath! }] }, steps: [{ label: "hands-off objective-duration cruise", release: false, waitTicks: objectiveDurationTicks! }], subject: ids.flightEntity }
    : family === "flight-pitch-sign"
      ? { ...common, artifacts: { effectLog: true, screenshots: "before-after" }, assert: { aerodynamics: [{ controls: ids.pitchSurfaces.flatMap((surface) => [{ sign: "negative" as const, surface }, { sign: "positive" as const, surface }]), entity: ids.flightEntity!, minForceSamples: 4, torques: [{ axis: "x", label: "positive pitch sign", relativeToLabel: "neutral before positive pitch", sign: "positive" }, { axis: "x", label: "negative pitch sign", relativeToLabel: "neutral before negative pitch", sign: "negative" }] }], diagnostics: cleanDiagnostics(), movement: { entity: ids.flightEntity!, minDistance: 0.1 }, resources: [{ equals: false, id: ids.flightResource!, path: ids.flightStallPath!, throughoutSteps: true }] }, steps: [{ label: "neutral before positive pitch", release: false, waitTicks: 1 }, { holdTicks: 30, label: "positive pitch sign", press: ids.pitchPositiveKey!, release: true }, { label: "neutral before negative pitch", release: false, waitTicks: 1 }, { holdTicks: 30, label: "negative pitch sign", press: ids.pitchNegativeKey!, release: true }], subject: ids.flightEntity }
    : family === "flight-roll-sign"
      ? { ...common, artifacts: { effectLog: true, screenshots: "before-after" }, assert: { aerodynamics: [{ controls: ids.rollSurfaces.flatMap((surface) => [{ sign: "negative" as const, surface }, { sign: "positive" as const, surface }]), entity: ids.flightEntity!, minForceSamples: 4, torques: [{ axis: "z", label: "positive roll sign", relativeToLabel: "neutral before positive roll", sign: "negative" }, { axis: "z", label: "negative roll sign", relativeToLabel: "neutral before negative roll", sign: "positive" }] }], diagnostics: cleanDiagnostics(), movement: { entity: ids.flightEntity!, minDistance: 0.1 }, resources: [{ equals: false, id: ids.flightResource!, path: ids.flightStallPath!, throughoutSteps: true }] }, steps: [{ label: "neutral before positive roll", release: false, waitTicks: 1 }, { holdTicks: 30, label: "positive roll sign", press: ids.rollPositiveKey!, release: true }, { label: "neutral before negative roll", release: false, waitTicks: 1 }, { holdTicks: 30, label: "negative roll sign", press: ids.rollNegativeKey!, release: true }], subject: ids.flightEntity }
    : family === "flight-force-trace"
      ? { ...common, assert: { aerodynamics: [{ entity: ids.flightEntity!, minForceSamples: 4 }], diagnostics: cleanDiagnostics(), movement: { entity: ids.flightEntity!, minDistance: 0.1 }, resources: [{ equals: false, id: ids.flightResource!, path: ids.flightStallPath! }] }, artifacts: { effectLog: "focused", runtimeTrace: true, screenshots: false }, steps: [{ waitTicks: 30, label: "baseline force trace", release: false }, { holdTicks: 30, label: "positive pitch force trace", press: ids.pitchPositiveKey!, release: true }, { holdTicks: 30, label: "positive roll force trace", press: ids.rollPositiveKey!, release: true }, { waitTicks: 30, label: "restored force trace", release: false }], subject: ids.flightEntity }
    : family === "blocked-movement"
    ? ids.gridStep === undefined
      ? { ...common, assert: { diagnostics: cleanDiagnostics(), movement: { entity: ids.actor, maxDistance: 0.05 } }, setup: { entities: [{ entity: ids.actor, position: [ids.blockedBoundaryX!, ids.actorStart[1], ids.actorStart[2]] }] }, steps: [{ holdFrames: 2, label: "attempt blocked step", press: rightKey, release: true }], subject: ids.actor }
      : { ...common, assert: { diagnostics: cleanDiagnostics(), movement: { entity: ids.actor, minDistance: ids.gridStep * 0.9, maxDistance: ids.gridStep * 1.1 } }, setup: { entities: [{ entity: ids.actor, position: [ids.blockedBoundaryX! - ids.gridStep, ids.actorStart[1], ids.actorStart[2]] }] }, steps: [{ holdFrames: 2, label: "move one grid cell", press: rightKey, release: true }, { holdFrames: 2, label: "reject outside bounds", press: rightKey, release: true }], subject: ids.actor }
    : family === "push-only"
      ? { ...common, assert: { diagnostics: cleanDiagnostics(), movement: { entity: ids.crate, minDistance: 0.5 }, tags: acceptance.id === "crate-push" ? [{ gte: 2, tag: "pushable" }] : [{ gte: 1, tag: "pushable" }] }, steps: spatialSolution === undefined ? [{ holdFrames: 2, label: "push adjacent object", press: rightKey, release: true }, { holdFrames: 2, label: "move away without pulling", press: "ArrowLeft", release: true }] : [...spatialSolution, { holdFrames: 2, label: "move away without pulling", press: "ArrowLeft", release: true }], subject: ids.crate }
      : family === "objective-progress" || family === "win-state"
        ? { ...common, assert: { diagnostics: cleanDiagnostics(), hud: [{ changed: true, id: ids.hud!, ...(spatialSolution === undefined ? {} : { textIncludes: "ALL TARGETS" }) }], resources: [{ changed: true, gte: ids.targetCount ?? 1, id: ids.objective!, path: "progress" }, ...(spatialSolution === undefined ? [] : [{ equals: true, id: ids.objective!, path: "won" }])] }, steps: spatialSolution ?? [{ holdFrames: 2, label: "advance objective", press: rightKey, release: true }], subject: ids.actor }
        : family === "state-change"
          ? { ...common, assert: { diagnostics: cleanDiagnostics(), hud: [{ changed: true, id: ids.hud! }], resources: [{ changed: true, id: ids.objective! }] }, steps: [{ label: "observe gameplay state change", release: false, waitFrames: 90 }], subject: ids.actor }
        : family === "retry" && ids.flightEntity !== undefined
          ? { ...common, assert: { diagnostics: cleanDiagnostics(), resources: [{ atSteps: [{ label: "observe flight failure", textIncludes: ids.flightRetryProof!.failedPhase }, { label: "observe restored flight", textIncludes: ids.flightRetryProof!.restoredPhase }], id: ids.flightResource!, path: "phase" }, { changed: true, gte: 1, id: ids.flightResource!, path: ids.flightRetryPath! }, { equals: false, id: ids.flightResource!, path: ids.flightStallPath! }] }, setup: { entities: [{ entity: ids.flightEntity!, position: ids.flightRetryProof!.failurePosition }] }, steps: [{ label: "observe flight failure", release: false, waitTicks: 2 }, { holdTicks: 1, label: "request flight retry", press: retryKey, release: true }, { label: "observe restored flight", release: false, waitTicks: 12 }], subject: ids.flightEntity }
        : family === "retry"
          ? spatialSolution === undefined
            ? { ...common, assert: { diagnostics: cleanDiagnostics(), movement: { entity: ids.actor, minDistance: 0.5 }, resources: [{ equals: 0, id: ids.objective!, path: "progress" }] }, setup: { entities: [{ entity: ids.actor, position: [ids.actorStart[0] + 1, ids.actorStart[1], ids.actorStart[2]] }] }, steps: [{ holdFrames: 1, label: "reset changed state", press: retryKey, release: true }], subject: ids.actor }
            : { ...common, assert: { diagnostics: cleanDiagnostics(), hud: [{ id: ids.hud!, textIncludes: "Targets 0" }], resources: [{ equals: 0, id: ids.objective!, path: "progress" }, { equals: false, id: ids.objective!, path: "won" }] }, steps: [...spatialSolution, { holdFrames: 1, label: "reset completed objective", press: retryKey, release: true }], subject: ids.actor }
          : { ...common, assert: { diagnostics: cleanDiagnostics(), movement: { entity: ids.actor, minDistance: 0.5 } }, steps: [{ holdFrames: 2, label: "move", press: rightKey, release: true }], subject: ids.actor };
  return { acceptance, scenario };
}

function missingPlanCapability(family: GameProofAssertionFamily, ids: IPlanProofIds, objectiveDurationTicks?: number): string | undefined {
  if (family.startsWith("flight-") && ids.flightEntity === undefined) return "aerodynamic-flight-entity";
  if (family.startsWith("flight-") && ids.flightResource === undefined) return "flight-observation-resource";
  if (family.startsWith("flight-") && ids.flightStallPath === undefined) return "flight-safety-observation";
  if (family === "retry" && ids.flightEntity !== undefined && ids.flightRetryPath === undefined) return "flight-retry-observation";
  if (family === "retry" && ids.flightEntity !== undefined && ids.flightRetryProof === undefined) return "flight-retry-proof-metadata";
  if (family === "flight-cruise-duration" && objectiveDurationTicks === undefined) return "objective-duration";
  if ((family === "flight-pitch-sign" || family === "flight-force-trace") && (ids.pitchPositiveKey === undefined || ids.pitchNegativeKey === undefined)) return "pitch-axis-input";
  if ((family === "flight-roll-sign" || family === "flight-force-trace") && (ids.rollPositiveKey === undefined || ids.rollNegativeKey === undefined)) return "roll-axis-input";
  if (family === "flight-pitch-sign" && ids.pitchSurfaces.length === 0) return "pitch-control-surface";
  if (family === "flight-roll-sign" && ids.rollSurfaces.length < 2) return "roll-control-surfaces";
  if (family.startsWith("flight-")) return undefined;
  if (ids.actor === "") return "actor-entity";
  if (family === "blocked-movement" && ids.blockedBoundaryX === undefined) return "grid-bounds";
  if ((family === "movement" || family === "blocked-movement" || family === "push-only" || family === "objective-progress") && ids.rightKey === undefined) return "movement-input";
  if (family === "push-only" && ids.crate === undefined) return "pushable-entity";
  if ((family === "objective-progress" || family === "win-state" || (family === "retry" && ids.flightEntity === undefined)) && ids.objective === undefined) return "objective-resource";
  if ((family === "objective-progress" || family === "win-state" || (family === "retry" && ids.flightEntity === undefined)) && !ids.objectiveHasProgress) return "objective-progress-field";
  if ((family === "objective-progress" || family === "win-state") && ids.hud === undefined) return "objective-hud";
  if (family === "state-change" && ids.objective === undefined) return "state-resource";
  if (family === "state-change" && ids.hud === undefined) return "state-hud";
  if (family === "retry" && ids.retryKey === undefined) return "retry-input";
  return undefined;
}

async function discoverPlanProofIds(projectPath: string): Promise<IPlanProofIds> {
  const project = await loadAuthoringProject({ projectPath });
  const entities = documentRecords(project, "scene", "entities");
  const resources = documentRecords(project, "scene", "resources");
  const grid = recordValue(resources.find((resource) => resource.id === "SpatialGrid")?.value);
  const actor = stringId(grid.actor)
    ?? stringId(entities.find((entity) => /player|hero/iu.test(String(entity.id)))?.id)
    ?? stringId(entities.find((entity) => recordValue(entity.components).AerodynamicBody !== undefined)?.id)
    ?? "";
  const actorEntity = entities.find((entity) => entity.id === actor);
  const actorStart = vector3(grid.actorStart) ?? vector3(recordValue(actorEntity?.transform).position) ?? [0, 0.35, 0];
  const crates = entities.flatMap((entity) => {
    const id = stringId(entity.id);
    const start = vector3(recordValue(entity.transform).position);
    return strings(entity.tags).includes("pushable") && id !== undefined && start !== undefined ? [{ id, start }] : [];
  });
  const objectiveResource = resources.find((resource) => resource.id === "SpatialObjective")
    ?? resources.find((resource) => /objective|progress|score|state|health|turn/iu.test(String(resource.id)))
    ?? resources[0];
  const objectiveValue = recordValue(objectiveResource?.value);
  const actions = documentRecords(project, "input", "actions");
  const axes = documentRecords(project, "input", "axes");
  const nodes = documentRecords(project, "ui", "nodes");
  const flightEntity = entities.find((entity) => recordValue(entity.components).AerodynamicBody !== undefined);
  const aerodynamicBody = recordValue(recordValue(flightEntity?.components).AerodynamicBody);
  const aerodynamicSurfaces = records(aerodynamicBody.surfaces);
  const pitchSurfaces = aerodynamicSurfaces.flatMap((surface) => /pitch/iu.test(String(recordValue(surface.control).binding)) && stringId(surface.id) !== undefined ? [stringId(surface.id)!] : []);
  const rollSurfaces = aerodynamicSurfaces.flatMap((surface) => /roll/iu.test(String(recordValue(surface.control).binding)) && stringId(surface.id) !== undefined ? [stringId(surface.id)!] : []);
  const flightResource = resources.find((resource) => {
    const value = recordValue(resource.value);
    return typeof value.stall === "boolean" && typeof value.phase === "string" && (
      typeof value.altitude === "number"
      || typeof value.altitudeFeet === "number"
      || typeof value.speed === "number"
      || typeof value.airspeedKnots === "number"
    );
  });
  const retryProof = recordValue(recordValue(flightResource?.value).retryProof);
  return {
    actor,
    actorStart,
    blockedBoundaryX: numberValue(grid.boundsMaxX),
    crate: crates[0]?.id,
    crates,
    flightEntity: stringId(flightEntity?.id),
    flightResource: stringId(flightResource?.id),
    flightRetryPath: typeof recordValue(flightResource?.value).retryCount === "number" ? "retryCount" : undefined,
    flightRetryProof: vector3(retryProof.failurePosition) !== undefined
      && stringId(retryProof.failedPhase) !== undefined
      && stringId(retryProof.restoredPhase) !== undefined
      ? { failedPhase: stringId(retryProof.failedPhase)!, failurePosition: vector3(retryProof.failurePosition)!, restoredPhase: stringId(retryProof.restoredPhase)! }
      : undefined,
    flightStallPath: flightResource === undefined ? undefined : "stall",
    gridStep: numberValue(grid.step),
    hud: stringId(nodes.find((node) => /spatial|progress|target|status|health|turn/iu.test(String(node.id)))?.id) ?? stringId(nodes[0]?.id),
    objective: stringId(objectiveResource?.id),
    objectiveHasProgress: numberValue(objectiveValue.progress) !== undefined,
    pitchNegativeKey: axisKey(axes, "pitch", "negative"),
    pitchPositiveKey: axisKey(axes, "pitch", "positive"),
    pitchSurfaces,
    rightKey: actionKey(actions, "grid-right") ?? actionKey(actions, "move-right"),
    rollNegativeKey: axisKey(axes, "roll", "negative"),
    rollPositiveKey: axisKey(axes, "roll", "positive"),
    rollSurfaces,
    retryKey: actionKey(actions, "retry"),
    targetCount: numberValue(objectiveValue.targetCount),
  };
}

function documentRecords(project: Awaited<ReturnType<typeof loadAuthoringProject>>, kind: string, field: string): Record<string, unknown>[] {
  return project.documents.flatMap((document) => document.kind === kind && isRecord(document.data) ? records(document.data[field]) : []);
}
function records(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function recordValue(value: unknown): Record<string, unknown> { return isRecord(value) ? value : {}; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function vector3(value: unknown): [number, number, number] | undefined { return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number" && Number.isFinite(item)) ? value as [number, number, number] : undefined; }
function numberValue(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function actionKey(actions: Record<string, unknown>[], id: string): string | undefined { const binding = strings(actions.find((action) => action.id === id)?.bindings)[0]; return binding?.replace(/^keyboard\./u, ""); }
function axisKey(axes: Record<string, unknown>[], id: string, direction: "negative" | "positive"): string | undefined { const binding = strings(axes.find((axis) => axis.id === id)?.[direction])[0]; return binding?.replace(/^keyboard\./u, ""); }
function cleanDiagnostics() { return { noConsoleErrors: true, noNetworkErrors: true, noRuntimeDiagnostics: true, runtimeReady: true }; }
function isMissingPathError(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT"; }

async function discoverScaffoldIds(projectPath: string, mechanic: PlaytestScaffoldMechanic): Promise<{ contactWith: string; hudId: string; resourceId: string; subject: string; subjectStart?: [number, number, number] }> {
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
    const subject = stringId(entityCandidates.find((entity) => entity.id === "player")?.id)
      ?? stringId(entityCandidates.find((entity) => /^player(?:$|[._-])/iu.test(String(entity.id)))?.id)
      ?? stringId(entityCandidates.find((entity) => /(?:^|[._-])(player|hero|car|kart|vehicle)(?:$|[._-])/iu.test(String(entity.id)))?.id)
      ?? stringId(entityCandidates.find((entity) => isRecord(entity.components) && (entity.components.CharacterController !== undefined || entity.components.RigidBody !== undefined))?.id)
      ?? stringId(entityCandidates[0]?.id)
      ?? "entity";
    const resourceCandidates = [...resources, ...reusableResources];
    const resourceId = stringId(preferredResource(resourceCandidates, mechanic)?.id) ?? stringId(resourceCandidates[0]?.id) ?? "resource";
    const sceneUiNodes = isRecord(sceneData.ui) && Array.isArray(sceneData.ui.nodes) ? sceneData.ui.nodes.filter(isRecord) : [];
    const hudId = stringId(preferredHudNode([...uiNodes, ...sceneUiNodes], mechanic)?.id) ?? stringId(uiNodes[0]?.id) ?? stringId(sceneUiNodes[0]?.id) ?? "hud";
    const contactEntity = entityCandidates.find((entity) => Array.isArray(entity.tags) && entity.tags.some((tag) => /pickup|orb|collect/iu.test(String(tag))))
      ?? entityCandidates.find((entity) => isRecord(entity.components) && entity.components.Collider !== undefined && entity.id !== subject);
    const contactWith = stringId(contactEntity?.id)
      ?? "pickup";
    const targetPosition = vector3(recordValue(contactEntity?.transform).position);
    const subjectEntity = entityCandidates.find((entity) => entity.id === subject);
    const subjectPosition = vector3(recordValue(subjectEntity?.transform).position);
    const subjectStart = mechanic === "pickup" && targetPosition !== undefined
      ? [targetPosition[0] - 2, subjectPosition?.[1] ?? targetPosition[1], targetPosition[2]] as [number, number, number]
      : undefined;
    return { contactWith, hudId, resourceId, subject, ...(subjectStart === undefined ? {} : { subjectStart }) };
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
  options: { contactWith?: string; hudId?: string; resourceId?: string; subject?: string; subjectStart?: [number, number, number] } = {},
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
    subjectStart: options.subjectStart,
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
