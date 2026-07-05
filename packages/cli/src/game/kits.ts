export interface IGameKitDiagnostic {
  code: "TN_GAME_KIT_BLOCK_INVALID" | "TN_GAME_KIT_MANIFEST_INVALID" | "TN_GAME_KIT_UNSUPPORTED_CAPABILITY";
  kitId?: string;
  message: string;
  path: string;
  severity: "error" | "warning";
  suggestion?: string;
}

export interface IGameKitBlock {
  acceptanceCriteria: string[];
  assetRoles: string[];
  id: string;
  input: string[];
  parameters: string[];
  prefabRoles: string[];
  proofCommands: string[];
  scriptRefs: string[];
  sourceOwners: Record<string, string[]>;
  summary: string;
  ui: string[];
  unsupportedCapabilities?: string[];
}

export interface IGameKitManifest {
  blocks: IGameKitBlock[];
  diagnostics: Array<{ code: string; message: string; severity: "warning" }>;
  id: string;
  keywords: string[];
  recipeId: string;
  schema: "threenative.game-kit-manifest";
  summary: string;
  version: 1;
}

export interface IGameKitCandidate {
  acceptanceCriteria: string[];
  assetRoles: string[];
  blocks: Array<{
    id: string;
    proofCommands: string[];
    sourceOwners: Record<string, string[]>;
    summary: string;
  }>;
  diagnostics: IGameKitDiagnostic[];
  kitId: string;
  mutate: false;
  recipeId: string;
  score: number;
  summary: string;
  toolingOnly: true;
  version: 1;
}

const GAME_KIT_MANIFESTS: IGameKitManifest[] = [
  {
    blocks: [
      {
        acceptanceCriteria: [
          "Player moves in a bounded top-down play space using declared input.",
          "Collecting all rewards updates retained UI state and reaches a win state.",
          "Hazards or fail triggers produce a retry path.",
        ],
        assetRoles: ["player-hero", "reward-interactable", "obstacle-enemy", "world-environment", "ui-hud"],
        id: "controller.top-down",
        input: ["keyboard.KeyW", "keyboard.KeyA", "keyboard.KeyS", "keyboard.KeyD", "keyboard.Space"],
        parameters: ["sceneId", "playerId", "cameraId", "inputDocId"],
        prefabRoles: ["player", "reward", "hazard", "camera-rig", "arena-bounds"],
        proofCommands: [
          "tn authoring validate --project . --json",
          "tn playtest --project . --entity <player-id> --press KeyW --frames 30 --expect-moved --json",
          "tn screenshot --project . --url <preview-url> --wait-ready --json",
        ],
        scriptRefs: ["src/scripts/player.ts#updatePlayer", "src/scripts/collectibles.ts#collectAll"],
        sourceOwners: {
          input: ["content/input/**/*.json"],
          scene: ["content/scenes/**/*.json"],
          scripts: ["src/scripts/player.ts", "src/scripts/collectibles.ts"],
          ui: ["content/ui/**/*.json"],
        },
        summary: "Move a hero, collect rewards, avoid hazards, update score/lives, and win when all rewards are collected.",
        ui: ["score", "lives", "win", "retry", "pause", "touch-controls"],
      },
    ],
    diagnostics: [],
    id: "top-down-collector",
    keywords: ["arcade", "collect", "collector", "coin", "forage", "rescue", "salvage", "top-down"],
    recipeId: "top-down-collector",
    schema: "threenative.game-kit-manifest",
    summary: "Compact top-down collection loop with score, hazards, win, and retry states.",
    version: 1,
  },
  {
    blocks: [
      {
        acceptanceCriteria: [
          "Player changes lanes through declared input and lane bounds clamp illegal movement.",
          "Forward speed or obstacle density escalates over time.",
          "Obstacle contact or missed timing reaches a fail/retry state.",
        ],
        assetRoles: ["player-hero", "obstacle-enemy", "reward-interactable", "world-environment", "ui-hud"],
        id: "controller.lane-runner",
        input: ["keyboard.ArrowLeft", "keyboard.ArrowRight", "keyboard.Space"],
        parameters: ["sceneId", "playerId", "cameraId"],
        prefabRoles: ["player", "lane-marker", "obstacle", "bonus", "camera-rig"],
        proofCommands: [
          "tn authoring validate --project . --json",
          "tn playtest --project . --entity <player-id> --press ArrowRight --frames 20 --expect-moved --json",
          "tn game qa --project . --run-proof --json",
        ],
        scriptRefs: ["src/scripts/laneRunner.ts#laneRunnerSystem"],
        sourceOwners: {
          input: ["content/input/**/*.json"],
          scene: ["content/scenes/**/*.json"],
          scripts: ["src/scripts/laneRunner.ts"],
          ui: ["content/ui/**/*.json"],
        },
        summary: "Steer between lanes, dodge obstacles, collect bonuses, and track distance/score.",
        ui: ["distance", "score", "speed", "fail", "retry", "touch-controls"],
      },
    ],
    diagnostics: [],
    id: "lane-runner",
    keywords: ["avoid", "dash", "dodge", "lane", "runner", "run", "traffic"],
    recipeId: "lane-runner",
    schema: "threenative.game-kit-manifest",
    summary: "Lane-based runner loop with hazards, bonuses, escalation, and fail/retry.",
    version: 1,
  },
  {
    blocks: [
      {
        acceptanceCriteria: [
          "Player reaches checkpoints in order and receives feedback for missed or out-of-order gates.",
          "HUD shows checkpoint/lap/time progress.",
          "Scale and camera proof show the vehicle and route are readable.",
        ],
        assetRoles: ["player-hero", "checkpoint-goal", "world-environment", "obstacle-enemy", "ui-hud"],
        id: "objective.checkpoint-race",
        input: ["keyboard.KeyW", "keyboard.KeyA", "keyboard.KeyD", "keyboard.Space"],
        parameters: ["sceneId", "vehicleId", "cameraId"],
        prefabRoles: ["vehicle", "checkpoint", "track", "camera-rig", "route-marker"],
        proofCommands: [
          "tn scene proof-camera <scene-id> --camera <camera-id> --target <vehicle-id> --json",
          "tn game scale --project . --json",
          "tn playtest --project . --entity <vehicle-id> --press KeyW --frames 60 --expect-moved --json",
        ],
        scriptRefs: ["src/scripts/checkpointRace.ts#checkpointRaceSystem"],
        sourceOwners: {
          scene: ["content/scenes/**/*.json"],
          scripts: ["src/scripts/checkpointRace.ts"],
          ui: ["content/ui/**/*.json"],
        },
        summary: "Drive or pilot through ordered checkpoints with lap/time progress and missed-checkpoint feedback.",
        ui: ["checkpoint-progress", "lap", "timer", "missed-checkpoint", "retry"],
      },
    ],
    diagnostics: [],
    id: "checkpoint-race",
    keywords: ["checkpoint", "drive", "kart", "lap", "race", "racing", "rally", "vehicle"],
    recipeId: "vehicle-checkpoint",
    schema: "threenative.game-kit-manifest",
    summary: "Checkpoint race loop with ordered goals, readable vehicle scale, camera proof, and HUD progress.",
    version: 1,
  },
];

export function listGameKitManifests(): IGameKitManifest[] {
  return GAME_KIT_MANIFESTS.map((manifest) => cloneManifest(manifest));
}

export function validateGameKitManifest(manifest: IGameKitManifest): IGameKitDiagnostic[] {
  const diagnostics: IGameKitDiagnostic[] = [];
  if (manifest.schema !== "threenative.game-kit-manifest") {
    diagnostics.push({
      code: "TN_GAME_KIT_MANIFEST_INVALID",
      kitId: manifest.id,
      message: "Game kit manifest must use schema 'threenative.game-kit-manifest'.",
      path: "/schema",
      severity: "error",
      suggestion: "Regenerate the manifest from the maintained game kit registry.",
    });
  }
  if (manifest.id.trim() === "") {
    diagnostics.push({
      code: "TN_GAME_KIT_MANIFEST_INVALID",
      message: "Game kit manifest id is required.",
      path: "/id",
      severity: "error",
    });
  }
  if (manifest.version !== 1) {
    diagnostics.push({
      code: "TN_GAME_KIT_MANIFEST_INVALID",
      kitId: manifest.id,
      message: "Game kit manifest version must be 1.",
      path: "/version",
      severity: "error",
    });
  }
  manifest.blocks.forEach((block, blockIndex) => {
    const blockPath = `/blocks/${blockIndex}`;
    if (block.id.trim() === "") {
      diagnostics.push({
        code: "TN_GAME_KIT_BLOCK_INVALID",
        kitId: manifest.id,
        message: "Game kit block id is required.",
        path: `${blockPath}/id`,
        severity: "error",
      });
    }
    if (Object.keys(block.sourceOwners).length === 0) {
      diagnostics.push({
        code: "TN_GAME_KIT_BLOCK_INVALID",
        kitId: manifest.id,
        message: `Game kit block '${block.id}' must declare source owners.`,
        path: `${blockPath}/sourceOwners`,
        severity: "error",
        suggestion: "Declare the content/**/*.json and src/scripts/**/*.ts paths owned by the block.",
      });
    }
    if (block.proofCommands.length === 0) {
      diagnostics.push({
        code: "TN_GAME_KIT_BLOCK_INVALID",
        kitId: manifest.id,
        message: `Game kit block '${block.id}' must declare proof commands.`,
        path: `${blockPath}/proofCommands`,
        severity: "error",
        suggestion: "Add authoring validation and at least one gameplay or visual proof command.",
      });
    }
    for (const capability of block.unsupportedCapabilities ?? []) {
      diagnostics.push({
        code: "TN_GAME_KIT_UNSUPPORTED_CAPABILITY",
        kitId: manifest.id,
        message: `Game kit block '${block.id}' references unsupported capability '${capability}'.`,
        path: `${blockPath}/unsupportedCapabilities`,
        severity: "warning",
        suggestion: "Keep the block as guidance only until the capability has a supported ThreeNative contract.",
      });
    }
  });
  return diagnostics;
}

export function matchGameKitCandidates(goal: string): IGameKitCandidate[] {
  const normalizedGoal = goal.toLowerCase();
  return GAME_KIT_MANIFESTS.map((manifest) => {
    const diagnostics = validateGameKitManifest(manifest);
    const score = manifest.keywords.reduce((sum, keyword) => sum + (normalizedGoal.includes(keyword) ? 1 : 0), 0);
    return {
      acceptanceCriteria: manifest.blocks.flatMap((block) => block.acceptanceCriteria),
      assetRoles: Array.from(new Set(manifest.blocks.flatMap((block) => block.assetRoles))).sort(),
      blocks: manifest.blocks.map((block) => ({
        id: block.id,
        proofCommands: block.proofCommands,
        sourceOwners: block.sourceOwners,
        summary: block.summary,
      })),
      diagnostics,
      kitId: manifest.id,
      mutate: false as const,
      recipeId: manifest.recipeId,
      score,
      summary: manifest.summary,
      toolingOnly: true as const,
      version: manifest.version,
    };
  }).sort((left, right) => right.score - left.score || left.kitId.localeCompare(right.kitId));
}

function cloneManifest(manifest: IGameKitManifest): IGameKitManifest {
  return JSON.parse(JSON.stringify(manifest)) as IGameKitManifest;
}
