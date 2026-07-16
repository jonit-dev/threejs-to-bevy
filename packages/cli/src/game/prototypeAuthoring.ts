import { hashAuthoringTransactionBytes, publishAuthoringTransaction } from "@threenative/authoring";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import type { GamePrototypeProofRole, IGameAcceptanceAssertion, IGamePrototypeBinding } from "../commands/gamePlanTypes.js";

interface IPrototypePlan {
  authoringMode: "bounded-match" | "custom-on-starter";
  intentContract: {
    acceptanceAssertions: IGameAcceptanceAssertion[];
    id: string;
    prototype?: IGamePrototypeBinding;
  };
  schema: "threenative.game-plan";
}

interface IPrototypeSource {
  input: Record<string, unknown>;
  scene: Record<string, unknown>;
  script: string;
  systems: Record<string, unknown>;
  ui: Record<string, unknown>;
}

export interface IPrototypeAuthoringResult {
  code: "TN_AUTHORING_PROTOTYPE_UNSUPPORTED" | "TN_AUTHORING_PROTOTYPE_WRITTEN";
  diagnostics: Array<{ code: string; message: string; severity: "error" }>;
  filesWritten: string[];
  message: string;
  nextProofCommand?: string;
  ok: boolean;
  proofEnrollment?: {
    enrolledAcceptanceIds: string[];
    missingAcceptanceIds: string[];
    requiredAcceptanceIds: string[];
  };
  prototypeId?: string;
}

const PROTOTYPES: Record<IGamePrototypeBinding["id"], () => IPrototypeSource> = {
  "alternating-grid-single-pursuit": tacticsPrototype,
  "continuous-arena-pooled-pressure": wavePrototype,
};

export async function applyPlanDerivedPrototype(options: { planPath: string; projectPath: string }): Promise<IPrototypeAuthoringResult> {
  const plan = await readPlan(options.planPath);
  const binding = plan?.intentContract.prototype;
  if (plan === undefined || plan.authoringMode !== "custom-on-starter" || binding === undefined || !(binding.id in PROTOTYPES)) {
    return unsupported("The selected plan does not expose a supported custom-on-starter prototype binding.");
  }
  const required = plan.intentContract.acceptanceAssertions.filter((assertion) => assertion.required);
  const missingRoles = required.filter((assertion) => binding.proofRoles[assertion.id] === undefined).map((assertion) => assertion.id);
  if (missingRoles.length > 0) {
    return unsupported(`Prototype proof roles are missing for acceptance IDs: ${missingRoles.join(", ")}.`);
  }
  const source = PROTOTYPES[binding.id]();
  const sourceFiles = [
    jsonFile("content/input/prototype.input.json", source.input),
    jsonFile("content/scenes/arena.scene.json", source.scene),
    jsonFile("content/systems/prototype.systems.json", source.systems),
    jsonFile("content/ui/prototype.ui.json", source.ui),
    { bytes: Buffer.from(source.script, "utf8"), path: "src/scripts/prototype.ts" },
  ];
  const proofFiles = required.map((assertion) => jsonFile(
    `playtests/acceptance-${assertion.id}.playtest.json`,
    prototypeScenario(binding.id, assertion.id, binding.proofRoles[assertion.id]!),
  ));
  const replacedStarterScenarios = [
    "playtests/camera-follow.playtest.json",
    "playtests/hud-resource.playtest.json",
    "playtests/native-smoke-movement.playtest.json",
    "playtests/smoke-movement.playtest.json",
  ].map((path) => ({ bytes: null, path }));
  const pendingFiles = await Promise.all([...sourceFiles, ...proofFiles, ...replacedStarterScenarios].map(async (file) => {
    const existing = await readFile(resolve(options.projectPath, file.path)).catch((error: unknown) => isMissing(error) ? undefined : Promise.reject(error));
    return existing === undefined && file.bytes === null
      ? undefined
      : { ...file, baseHash: existing === undefined ? null : hashAuthoringTransactionBytes(existing) };
  }));
  const files = pendingFiles.filter((file): file is Exclude<typeof file, undefined> => file !== undefined);
  const publication = await publishAuthoringTransaction({ files, projectPath: options.projectPath });
  if (!publication.ok) {
    return unsupported("Prototype source publication failed atomically.");
  }
  const requiredAcceptanceIds = required.map((assertion) => assertion.id);
  return {
    code: "TN_AUTHORING_PROTOTYPE_WRITTEN",
    diagnostics: [],
    filesWritten: publication.filesWritten.map((path) => relative(options.projectPath, resolve(options.projectPath, path)).replaceAll("\\", "/")),
    message: `Plan-derived prototype '${binding.id}' and ${proofFiles.length} proof scenarios were written.`,
    nextProofCommand: "tn iterate --project . --json",
    ok: true,
    proofEnrollment: { enrolledAcceptanceIds: requiredAcceptanceIds, missingAcceptanceIds: [], requiredAcceptanceIds },
    prototypeId: binding.id,
  };
}

async function readPlan(path: string): Promise<IPrototypePlan | undefined> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as IPrototypePlan;
    return value.schema === "threenative.game-plan" && value.intentContract !== undefined ? value : undefined;
  } catch {
    return undefined;
  }
}

function unsupported(message: string): IPrototypeAuthoringResult {
  return {
    code: "TN_AUTHORING_PROTOTYPE_UNSUPPORTED",
    diagnostics: [{ code: "TN_AUTHORING_PROTOTYPE_UNSUPPORTED", message, severity: "error" }],
    filesWritten: [],
    message,
    ok: false,
  };
}

function jsonFile(path: string, value: unknown): { bytes: Buffer; path: string } {
  return { bytes: Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"), path };
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function commonScenario(acceptanceId: string, subject: string): Record<string, unknown> {
  return {
    acceptanceId,
    artifacts: { effectLog: "focused", screenshots: "before-after" },
    name: `acceptance-${acceptanceId}`,
    schemaVersion: 1,
    subject,
    target: "web",
    viewport: { height: 720, width: 1280 },
    warmupFrames: 5,
  };
}

function cleanDiagnostics(): Record<string, boolean> {
  return { noConsoleErrors: true, noNetworkErrors: true, runtimeReady: true };
}

function prototypeScenario(prototypeId: IGamePrototypeBinding["id"], acceptanceId: string, role: GamePrototypeProofRole): Record<string, unknown> {
  const wave = prototypeId === "continuous-arena-pooled-pressure";
  const actor = wave ? "defender" : "player.unit";
  const common = commonScenario(acceptanceId, actor);
  if (role === "canvas") {
    return { ...common, assert: { diagnostics: cleanDiagnostics(), visual: [{ region: { height: 720, minNonblankPixelRatio: 0.01, width: 1280, x: 0, y: 0 } }] }, steps: [{ label: "observe active canvas", waitFrames: 2 }] };
  }
  if (role === "primary-input") {
    return {
      ...common,
      assert: {
        diagnostics: cleanDiagnostics(),
        movement: { entity: actor, minDistance: 0.5 },
        resources: wave
          ? [{ gte: 1, id: "PrototypeState", path: "attackCount" }]
          : [{ changed: true, id: "PrototypeState" }],
      },
      steps: wave
        ? [{ holdFrames: 4, label: "move defender", press: "KeyD", release: true }, { holdFrames: 1, label: "attack target", press: "Space", release: true }]
        : [{ holdFrames: 1, label: "select unit", press: "Enter", release: true }, { holdFrames: 1, label: "move selected unit", press: "KeyW", release: true }],
    };
  }
  if (role === "progression") {
    return {
      ...common,
      assert: {
        diagnostics: cleanDiagnostics(),
        hud: [{ id: "hud.wave", textIncludes: "Wave 2" }, { id: "hud.threat", textIncludes: "Threat 2" }],
        resources: [
          { gte: 2, id: "PrototypeState", path: "wave" },
          { gte: 2, id: "PrototypeState", path: "difficulty" },
          { gte: 3, id: "PrototypeState", path: "targetsRequired" },
        ],
      },
      steps: [{ holdFrames: 1, label: "attack first target", press: "Space", release: true }, { waitFrames: 2 }, { holdFrames: 1, label: "clear wave", press: "Space", release: true }],
    };
  }
  if (role === "failure") {
    return {
      ...common,
      assert: { diagnostics: cleanDiagnostics(), hud: [{ id: "hud.status", textIncludes: "failed" }], resources: [{ equals: 0, id: "PrototypeState", path: "baseHealth" }] },
      steps: [{ label: "allow pooled pressure to reach base", waitFrames: 12 }],
    };
  }
  if (role === "opponent-turn") {
    return {
      ...common,
      assert: { diagnostics: cleanDiagnostics(), movement: { entity: "enemy.unit", minDistance: 0.5 }, resources: [{ gte: 2, id: "PrototypeState", path: "turn" }] },
      steps: [{ holdFrames: 1, label: "select unit", press: "Enter", release: true }, { holdFrames: 1, label: "commit move and enemy turn", press: "KeyW", release: true }],
      subject: "enemy.unit",
    };
  }
  if (role === "objective-outcomes") {
    return {
      ...common,
      assert: { diagnostics: cleanDiagnostics(), hud: [{ id: "hud.status", textIncludes: "Victory" }], resources: [{ equals: 1, id: "PrototypeState", path: "failureCount" }, { equals: 1, id: "PrototypeState", path: "victoryCount" }] },
      steps: [
        { holdFrames: 1, label: "select for failure route", press: "Enter", release: true },
        { holdFrames: 1, label: "enter enemy threat", press: "KeyD", release: true },
        { holdFrames: 1, label: "retry encounter", press: "KeyR", release: true },
        { holdFrames: 1, label: "select for objective route", press: "Enter", release: true },
        { holdFrames: 1, label: "advance objective", press: "KeyW", release: true },
        { holdFrames: 1, label: "reach objective", press: "KeyW", release: true },
      ],
    };
  }
  return {
    ...common,
    assert: {
      diagnostics: cleanDiagnostics(),
      movement: { entity: actor, minDistance: 0.5 },
      resources: wave
        ? [{ equals: 100, id: "PrototypeState", path: "baseHealth" }, { equals: 0, id: "PrototypeState", path: "progress" }]
        : [{ equals: "playing", id: "PrototypeState", path: "outcome" }, { equals: 0, id: "PrototypeState", path: "progress" }],
    },
    setup: { entities: [{ entity: actor, position: [1, 0.65, wave ? 2.8 : 2] }] },
    steps: wave
      ? [{ holdFrames: 1, label: "reset defense", press: "KeyR", release: true }]
      : [{ holdFrames: 1, label: "select unit", press: "Enter", release: true }, { holdFrames: 1, label: "reach failure", press: "KeyD", release: true }, { holdFrames: 1, label: "reset encounter", press: "KeyR", release: true }],
  };
}

function wavePrototype(): IPrototypeSource {
  return {
    input: inputDocument([
      { bindings: ["keyboard.KeyA", "keyboard.ArrowLeft"], id: "move-left" },
      { bindings: ["keyboard.KeyD", "keyboard.ArrowRight"], id: "move-right" },
      { bindings: ["keyboard.Space"], id: "attack-keyboard" },
      { bindings: ["pointer.0"], id: "attack-pointer" },
      { bindings: ["keyboard.KeyR", "pointer.0"], id: "retry" },
    ], [{ id: "MoveX", negative: ["keyboard.KeyA", "keyboard.ArrowLeft"], positive: ["keyboard.KeyD", "keyboard.ArrowRight"] }]),
    scene: sceneDocument(
      [
        entity("arena.floor", "prefab.floor", [0, -0.15, 0], [8, 0.25, 10]),
        entity("defender", "prefab.defender", [0, 0.65, 2.8], [0.75, 0.75, 0.75]),
        entity("base.core", "prefab.base", [0, 0.75, 4], [1.4, 1.4, 1.4]),
        entity("enemy.01", "prefab.enemy", [0, 0.65, -2], [0.7, 0.7, 0.7]),
        camera([0, 9, 11], [-0.68, 0, 0]),
      ],
      [prefab("prefab.floor", "box", "#132238"), prefab("prefab.defender", "capsule", "#39d9ff"), prefab("prefab.base", "cylinder", "#ffd166"), prefab("prefab.enemy", "cone", "#ff5263")],
      { attackCount: 0, baseHealth: 100, difficulty: 1, elapsed: 0, healthText: "Base 100", pointerAttackCount: 0, progress: 0, statusText: "Defend the core", targetsRequired: 2, threatText: "Threat 1", wave: 1, waveText: "Wave 1" },
    ),
    script: waveScript(),
    systems: systemsDocument("updatePrototype"),
    ui: uiDocument([
      uiNode("hud.title", "POOLED PRESSURE DEFENSE", 22),
      uiNode("hud.wave", "Wave 1", 62),
      uiNode("hud.threat", "Threat 1", 102),
      uiNode("hud.health", "Base 100", 142),
      uiNode("hud.status", "Defend the core", 182),
    ], [binding("hud.wave", "PrototypeState.waveText"), binding("hud.threat", "PrototypeState.threatText"), binding("hud.health", "PrototypeState.healthText"), binding("hud.status", "PrototypeState.statusText")]),
  };
}

function tacticsPrototype(): IPrototypeSource {
  const cells = Array.from({ length: 15 }, (_, index) => entity(`grid.${index}`, index % 2 === 0 ? "prefab.cell.a" : "prefab.cell.b", [(index % 5) - 2, 0, Math.floor(index / 5)], [0.92, 0.12, 0.92]));
  return {
    input: inputDocument([
      { bindings: ["keyboard.Enter", "keyboard.Space", "pointer.0"], id: "select-unit" },
      { bindings: ["keyboard.KeyW", "keyboard.ArrowUp"], id: "move-up" },
      { bindings: ["keyboard.KeyD", "keyboard.ArrowRight"], id: "move-right" },
      { bindings: ["keyboard.KeyR", "pointer.0"], id: "retry" },
    ], []),
    scene: sceneDocument(
      [...cells, entity("objective", "prefab.objective", [0, 0.35, 0], [0.55, 0.55, 0.55]), entity("player.unit", "prefab.player", [0, 0.65, 2], [0.7, 0.9, 0.7]), entity("enemy.unit", "prefab.enemy", [2, 0.65, 2], [0.7, 0.9, 0.7]), camera([0, 7.5, 7.5], [-0.72, 0, 0])],
      [prefab("prefab.cell.a", "box", "#233852"), prefab("prefab.cell.b", "box", "#17263b"), prefab("prefab.objective", "cylinder", "#ffd166"), prefab("prefab.player", "capsule", "#32d7ff"), prefab("prefab.enemy", "cone", "#ff4f66")],
      { failureCount: 0, outcome: "playing", progress: 0, selected: false, statusText: "Select the blue unit", turn: 1, turnText: "Player turn 1", victoryCount: 0 },
    ),
    script: tacticsScript(),
    systems: systemsDocument("updatePrototype"),
    ui: uiDocument([uiNode("hud.title", "ALTERNATING GRID PURSUIT", 22), uiNode("hud.turn", "Player turn 1", 62), uiNode("hud.status", "Select the blue unit", 102)], [binding("hud.turn", "PrototypeState.turnText"), binding("hud.status", "PrototypeState.statusText")]),
  };
}

function inputDocument(actions: unknown[], axes: unknown[]): Record<string, unknown> { return { actions, axes, id: "prototype-input", schema: "threenative.input", version: "0.1.0" }; }
function systemsDocument(exportName: string): Record<string, unknown> { return { id: "prototype-systems", schema: "threenative.systems", systems: [{ id: "prototype-loop", script: { export: exportName, module: "src/scripts/prototype.ts" }, source: "behavior-metadata" }], version: "0.1.0" }; }
function sceneDocument(entities: unknown[], prefabs: unknown[], state: Record<string, unknown>): Record<string, unknown> { return { entities, id: "arena", prefabs, resources: [{ id: "PrototypeState", value: state }], schema: "threenative.scene", systems: [], ui: { bindings: [], nodes: [] }, version: "0.1.0" }; }
function uiDocument(nodes: unknown[], bindings: unknown[]): Record<string, unknown> { return { bindings, id: "prototype-ui", nodes, schema: "threenative.ui", version: "0.1.0" }; }
function entity(id: string, prefabId: string, position: number[], scale: number[]): Record<string, unknown> { return { id, prefab: prefabId, transform: { position, scale } }; }
function prefab(id: string, primitive: string, color: string): Record<string, unknown> { return { color, id, primitive }; }
function camera(position: number[], rotation: number[]): Record<string, unknown> { return { components: { camera: { mode: "perspective" } }, id: "camera.main", transform: { position, rotation } }; }
function uiNode(id: string, text: string, top: number): Record<string, unknown> { return { id, layout: { align: "start", justify: "start", left: 24, top, width: 700 }, text, type: "text" }; }
function binding(node: string, resource: string): Record<string, unknown> { return { node, resource }; }

function waveScript(): string {
  return `import { defineBehavior, type ScriptContext } from "@threenative/script-stdlib";

export const updatePrototype = defineBehavior(
  { id: "prototype-loop", reads: ["Transform"], resourceReads: ["PrototypeState"], resourceWrites: ["PrototypeState"], schedule: "fixedUpdate", writes: ["Transform"] },
  (context: ScriptContext): void => {
    const state = context.resources.get("PrototypeState", { attackCount: 0, baseHealth: 100, difficulty: 1, elapsed: 0, healthText: "Base 100", pointerAttackCount: 0, progress: 0, statusText: "Defend the core", targetsRequired: 2, threatText: "Threat 1", wave: 1, waveText: "Wave 1" });
    const defender = context.entity("defender");
    const enemy = context.entity("enemy.01");
    if (defender === undefined || enemy === undefined) return;
    if (context.input.pressed("retry")) {
      defender.transform().setPosition([0, 0.65, 2.8]);
      enemy.transform().setPosition([0, 0.65, -2]);
      context.resources.patch("PrototypeState", { attackCount: 0, baseHealth: 100, difficulty: 1, elapsed: 0, healthText: "Base 100", pointerAttackCount: 0, progress: 0, statusText: "Defend the core", targetsRequired: 2, threatText: "Threat 1", wave: 1, waveText: "Wave 1" });
      return;
    }
    const defenderPosition = defender.transform().position;
    const moveX = context.input.getAxis("MoveX");
    defender.transform().setPosition([Math.max(-3.5, Math.min(3.5, defenderPosition[0] + moveX * context.time.fixedDelta * 6)), 0.65, 2.8]);
    let progress = state.progress;
    let wave = state.wave;
    let statusText = state.statusText;
    const keyboardAttack = context.input.pressed("attack-keyboard");
    const pointerAttack = context.input.pressed("attack-pointer");
    let attackCount = state.attackCount;
    let pointerAttackCount = state.pointerAttackCount;
    if (keyboardAttack || pointerAttack) {
      attackCount += 1;
      if (pointerAttack) pointerAttackCount += 1;
      progress += 1;
      statusText = "Target cleared";
      if (progress >= state.targetsRequired) { progress = 0; wave += 1; statusText = "Wave cleared - threat increased"; }
    }
    let baseHealth = state.baseHealth;
    let enemyPosition = enemy.transform().position;
    const difficulty = wave;
    const targetsRequired = wave + 1;
    if (baseHealth > 0) enemyPosition = [enemyPosition[0], 0.65, enemyPosition[2] + context.time.fixedDelta * (3.2 + (difficulty - 1) * 0.8)];
    if (enemyPosition[2] >= 3.5) {
      baseHealth = Math.max(0, baseHealth - 50);
      enemyPosition = [0, 0.65, -2];
      statusText = baseHealth <= 0 ? "Base failed - press R" : "Base hit";
    }
    enemy.transform().setPosition(enemyPosition);
    context.resources.patch("PrototypeState", { attackCount, baseHealth, difficulty, elapsed: state.elapsed + context.time.fixedDelta, healthText: "Base " + String(baseHealth), pointerAttackCount, progress, statusText, targetsRequired, threatText: "Threat " + String(difficulty), wave, waveText: "Wave " + String(wave) });
  },
);
`;
}

function tacticsScript(): string {
  return `import { defineBehavior, type ScriptContext } from "@threenative/script-stdlib";

export const updatePrototype = defineBehavior(
  { id: "prototype-loop", reads: ["Transform"], resourceReads: ["PrototypeState"], resourceWrites: ["PrototypeState"], schedule: "fixedUpdate", writes: ["Transform"] },
  (context: ScriptContext): void => {
    const state = context.resources.get("PrototypeState", { failureCount: 0, outcome: "playing", progress: 0, selected: false, statusText: "Select the blue unit", turn: 1, turnText: "Player turn 1", victoryCount: 0 });
    const player = context.entity("player.unit");
    const enemy = context.entity("enemy.unit");
    if (player === undefined || enemy === undefined) return;
    if (context.input.pressed("retry")) {
      player.transform().setPosition([0, 0.65, 2]);
      enemy.transform().setPosition([2, 0.65, 2]);
      context.resources.patch("PrototypeState", { failureCount: state.failureCount, outcome: "playing", progress: 0, selected: false, statusText: "Select the blue unit", turn: 1, turnText: "Player turn 1", victoryCount: state.victoryCount });
      return;
    }
    if (state.outcome !== "playing") return;
    if (context.input.pressed("select-unit")) {
      context.resources.patch("PrototypeState", { selected: true, statusText: "Unit selected - choose a cell" });
      return;
    }
    if (!state.selected) return;
    const moveUp = context.input.pressed("move-up");
    const moveRight = context.input.pressed("move-right");
    if (!moveUp && !moveRight) return;
    const playerPosition = player.transform().position;
    const nextPlayer = [Math.min(2, playerPosition[0] + (moveRight ? 1 : 0)), 0.65, Math.max(0, playerPosition[2] - (moveUp ? 1 : 0))];
    player.transform().setPosition(nextPlayer);
    const progress = state.progress + 1;
    if (nextPlayer[2] <= 0) {
      context.resources.patch("PrototypeState", { outcome: "victory", progress, statusText: "Victory - objective reached", turn: state.turn + 1, turnText: "Victory", victoryCount: state.victoryCount + 1 });
      return;
    }
    const enemyPosition = enemy.transform().position;
    const nextEnemyX = enemyPosition[0] === nextPlayer[0] ? enemyPosition[0] : enemyPosition[0] + (enemyPosition[0] > nextPlayer[0] ? -1 : 1);
    const nextEnemyZ = nextEnemyX === nextPlayer[0] && enemyPosition[2] !== nextPlayer[2] ? enemyPosition[2] + (enemyPosition[2] > nextPlayer[2] ? -1 : 1) : enemyPosition[2];
    enemy.transform().setPosition([nextEnemyX, 0.65, nextEnemyZ]);
    const captured = nextEnemyX === nextPlayer[0] && nextEnemyZ === nextPlayer[2];
    context.resources.patch("PrototypeState", captured
      ? { failureCount: state.failureCount + 1, outcome: "failure", progress, statusText: "Defeat - enemy captured unit", turn: state.turn + 1, turnText: "Enemy victory" }
      : { progress, statusText: "Enemy turn moved the threat", turn: state.turn + 1, turnText: "Player turn " + String(state.turn + 1) });
  },
);
`;
}
