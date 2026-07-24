import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export function cleanPersistedQualitySections(options: { scorecardScore?: number; uiPresent?: boolean } = {}): Record<string, unknown> {
  const scorecardIds = [
    "art-direction",
    "hero-player",
    "obstacles-enemies",
    "rewards-interactables",
    "world-environment",
    "materials-textures",
    "lighting-render",
    "vfx-motion",
    "ui-hud",
    "performance",
  ];
  const phaseIds = ["gameplay", "assets", "visuals", "ui", "debug", "qa", "release"];
  const uiStateIds = ["gameplay", "pause", "settings", "loading", "fail-retry", "win-milestone", "touch-controls"];
  const scorecardScore = options.scorecardScore ?? 3;
  const uiPresent = options.uiPresent ?? true;
  return {
    phaseLedgers: phaseIds.map((id) => ({
      diagnostics: [],
      evidence: [],
      id,
      score: 1,
      status: "pass",
      summary: `${id} summary`,
    })),
    scorecard: scorecardIds.map((id) => ({
      evidence: [],
      id,
      score: scorecardScore,
    })),
    summary: {
      averageVisualScore: scorecardScore,
      blockers: 0,
      phasesPassed: phaseIds.length,
      totalPhases: phaseIds.length,
      uiStatesCovered: uiPresent ? uiStateIds.length : uiStateIds.length - 1,
    },
    uiStates: uiStateIds.map((id, index) => ({
      evidence: [],
      id,
      present: index === 0 ? uiPresent : true,
    })),
  };
}

export function cleanProductionCommandRows(): Record<string, unknown>[] {
  return [{
    artifactPath: "content/scenes/arena.scene.json",
    command: "tn doctor --project . --json",
    description: "Inspect project setup.",
    phase: "debug",
    status: "available",
  }];
}

export function cleanAssetAudioLedgerRows(options: { artifactOnlySurface?: string } = {}): Record<string, unknown>[] {
  const surfaces = ["player-hero", "obstacle-enemy", "reward-interactable", "world-environment", "ui-hud", "audio-feedback"];
  return surfaces.map((surface) => ({
    evidence: surface === options.artifactOnlySurface
      ? [{ description: "screenshot artifact", kind: "artifact", path: "artifacts/game-production/screenshot.png" }]
      : [{ description: `${surface} structured source`, kind: "source", path: "content/scenes/arena.scene.json" }],
    sourcePath: surface === options.artifactOnlySurface ? "artifacts/game-production/screenshot.png" : "content/scenes/arena.scene.json",
    status: "procedural",
    surface,
  }));
}

export async function writeGameplaySystemSource(root: string, module: string, exportName: string): Promise<void> {
  await mkdir(join(root, "content/scenes"), { recursive: true });
  await mkdir(join(root, "content/systems"), { recursive: true });
  await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
  await writeFile(join(root, "content/systems/arena.systems.json"), `${JSON.stringify({
    schema: "threenative.systems",
    id: "arena-systems",
    systems: [{
      id: "arena-gameplay",
      reads: ["PlayerInput"],
      resourceReads: ["GameState"],
      resourceWrites: ["GameState"],
      script: {
        export: exportName,
        module,
      },
      writes: ["Transform"],
    }],
  }, null, 2)}\n`);
}

export async function writeUiSource(root: string, options: { bindings?: Record<string, unknown>[]; nodes?: Record<string, unknown>[] } = {}): Promise<void> {
  await mkdir(join(root, "content/scenes"), { recursive: true });
  await mkdir(join(root, "content/ui"), { recursive: true });
  await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
  await writeFile(join(root, "content/ui/hud.ui.json"), `${JSON.stringify({
    schema: "threenative.ui",
    id: "hud",
    bindings: options.bindings ?? [
      { node: "score", property: "text", resource: "GameState", path: "score" },
      { node: "status", property: "text", resource: "GameState", path: "status" },
      { node: "timer", property: "text", resource: "GameState", path: "timer" },
    ],
    nodes: options.nodes ?? [
      { id: "score", text: "Score 0" },
      { id: "status", text: "Ready" },
      { id: "timer", text: "60" },
      { id: "state.loading", text: "Loading" },
      { id: "state.pause", text: "Paused" },
      { id: "state.settings", text: "Settings" },
      { id: "state.fail-retry", text: "Retry after failure" },
      { id: "state.win-milestone", text: "Win milestone reached" },
      { id: "state.touch-controls", text: "Touch controls mobile-control" },
    ],
  }, null, 2)}\n`);
}

export async function writeMaterialSource(root: string, materials: Record<string, unknown>[] = [
  { id: "mat.ground", color: "#243b2d", roughness: 0.92 },
  { id: "mat.hero", color: "#6cc6ff", roughness: 0.46 },
  { id: "mat.reward", color: "#ffd166", roughness: 0.38 },
  { id: "mat.hazard", color: "#e84855", roughness: 0.64 },
  { id: "mat.world", color: "#775a3a", roughness: 0.86 },
]): Promise<void> {
  await mkdir(join(root, "content/scenes"), { recursive: true });
  await mkdir(join(root, "content/materials"), { recursive: true });
  await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
  await writeFile(join(root, "content/materials/arena.materials.json"), `${JSON.stringify({
    schema: "threenative.materials",
    id: "arena-materials",
    materials,
  }, null, 2)}\n`);
}

export async function currentTestSourceHash(projectPath: string): Promise<string> {
  const rows = [
    ...await testSourceHashRows(resolve(projectPath, "content"), "content"),
    ...await testSourceHashRows(resolve(projectPath, "src", "scripts"), join("src", "scripts")),
    ...await testSourceHashRows(resolve(projectPath, "playtests"), "playtests"),
    ...await testSourceHashFile(resolve(projectPath, "threenative.config.json"), "threenative.config.json"),
  ].sort((left, right) => left.path.localeCompare(right.path));
  const hash = createHash("sha256");
  for (const row of rows) {
    hash.update(row.path);
    hash.update(row.hash);
  }
  return hash.digest("hex");
}

async function testSourceHashFile(path: string, relativePath: string): Promise<Array<{ hash: string; path: string }>> {
  try {
    const info = await stat(path);
    return info.isFile()
      ? [{ hash: createHash("sha256").update(await readFile(path)).digest("hex"), path: relativePath }]
      : [];
  } catch {
    return [];
  }
}

async function testSourceHashRows(directory: string, relativeRoot: string): Promise<Array<{ hash: string; path: string }>> {
  try {
    const info = await stat(directory);
    if (!info.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }
  const entries = await readdir(directory, { withFileTypes: true });
  const rows: Array<{ hash: string; path: string }> = [];
  for (const entry of entries) {
    const childPath = resolve(directory, entry.name);
    const childRelative = join(relativeRoot, entry.name);
    if (entry.isDirectory()) {
      rows.push(...await testSourceHashRows(childPath, childRelative));
      continue;
    }
    if (entry.isFile()) {
      rows.push({
        hash: createHash("sha256").update(await readFile(childPath)).digest("hex"),
        path: childRelative.replace(/\\/g, "/"),
      });
    }
  }
  return rows;
}

export function validGamePlan(): Record<string, unknown> {
  return {
    schema: "threenative.game-plan",
    mutate: false,
    acceptanceCriteria: [
      "A player can understand the objective from the first screen and complete or fail the loop with real input.",
      "Every high-value visual surface has an asset, authored mesh, or documented fallback with provenance.",
      "Gameplay behavior lives in src/scripts/**/*.ts and every exported system is referenced from structured source.",
      "The scene has authored materials, lighting, camera framing, environment context, and set dressing instead of a placeholder floor and loose primitives.",
      "Proof includes authoring validation, build, playtest motion, screenshot, game score, QA, and release checks.",
    ],
    design: {
      controls: ["Keyboard movement with Space interaction."],
      failRetry: "Timer failure resets the arena.",
      feedback: ["movement response", "objective progress cue", "success/fail cue"],
      loop: "Move, collect rewards, avoid hazards, deliver to the goal, then retry.",
      objective: "Collect three rewards before the timer expires.",
      progression: "Rewards get farther from the goal after each collection.",
    },
    assetPlan: [
      {
        fallback: "custom-authored hero mesh from structured source primitives",
        searchCommand: "tn asset source search --game-category arcade --format glb --direct-only --json",
        sourcePreference: "direct GLB catalog asset or cohesive authored fallback",
        surface: "player-hero",
      },
      {
        fallback: "custom-authored hazard mesh from structured source primitives",
        searchCommand: "tn asset source search --game-category arcade --format glb --direct-only --json",
        sourcePreference: "direct GLB catalog asset or cohesive authored fallback",
        surface: "obstacle-enemy",
      },
      {
        fallback: "custom-authored reward mesh from structured source primitives",
        searchCommand: "tn asset source search --game-category arcade --format glb --direct-only --json",
        sourcePreference: "direct GLB catalog asset or cohesive authored fallback",
        surface: "reward-interactable",
      },
      {
        fallback: "custom-authored arena set dressing from structured source primitives",
        searchCommand: "tn asset source search --game-category arcade --format glb --direct-only --json",
        sourcePreference: "direct GLB catalog asset or cohesive authored fallback",
        surface: "world-environment",
      },
      {
        fallback: "structured UI HUD text and status bindings",
        searchCommand: "tn asset source search --file-role ui --format glb --direct-only --json",
        sourcePreference: "source-backed UI",
        surface: "ui-hud",
      },
      {
        fallback: "documented silent fallback with gameplay visual feedback",
        searchCommand: "tn asset source search --file-role audio --format glb --direct-only --json",
        sourcePreference: "compatible open-source audio or generated local cue",
        surface: "audio-feedback",
      },
    ],
    sourcePlan: [
      { document: "scene", path: "content/scenes/arena.scene.json", supportedShape: ["entities, prefabs, resources, systems"] },
      { document: "input", path: "content/input/arena.input.json", supportedShape: ["keyboard.KeyW and action bindings"] },
      { document: "systems", path: "content/systems/arena.systems.json", supportedShape: ["Declare every component/resource read and write"] },
      { document: "ui", path: "content/ui/hud.ui.json", supportedShape: ["HUD text nodes, retained UI states, and GameState bindings"] },
      { document: "materials", path: "content/materials/arena.materials.json", supportedShape: ["Material color, roughness, metalness, and authored style rows"] },
      { document: "assets", path: "content/assets/arena.assets.json", supportedShape: ["asset uri/kind/provenance records"] },
    ],
    scriptPlan: [
      {
        exportName: "arenaGameSystem",
        module: "src/scripts/player.ts",
        responsibility: "Move the hero, update score, and resolve fail/retry state.",
        state: ["player position", "score", "timer", "status"],
      },
    ],
    polishPlan: [
      { acceptance: "Hero and hazards are readable from the gameplay camera.", category: "silhouette", treatment: "Distinct shapes and scale." },
      { acceptance: "Materials communicate surface roles.", category: "materials", treatment: "Contrasting colors and roughness." },
      { acceptance: "Arena is framed without empty horizons.", category: "composition", treatment: "Angled camera with bounds." },
      { acceptance: "World has landmarks and boundary cues.", category: "lighting-environment", treatment: "Set dressing and rails." },
      { acceptance: "Input produces visible movement and feedback.", category: "motion-feedback", treatment: "Eased movement and status changes." },
    ],
    proofCommands: [
      "tn authoring validate --project . --json",
      "tn build --project . --json",
      "tn playtest --project . --entity <player-id> --press KeyboardEvent.code --frames 30 --expect-moved --json",
      "tn screenshot --project . --url <preview-url> --out artifacts/game-production/screenshot.png --wait-ready --json",
      "tn game score --project . --json",
      "tn game qa --project . --run-proof --json",
      "tn game release --project . --json",
    ],
  };
}

export function validGameplayBlock(id: string, kind: string): Record<string, unknown> {
  return {
    appliesWhen: ["generated-game goals"],
    cautions: ["Keep helper use plain-data and host-free."],
    helperImports: ["BasisEx", "ControllerEx"],
    id,
    kind,
    proof: ["tn playtest --project . --entity <player-id> --press KeyD --frames 30 --expect-moved --json"],
    recipeIds: ["third-person-controller"],
    scriptResponsibilities: ["owns movement intent"],
    source: "gameblocks-inspired",
  };
}

export function minimalPngHeader(width: number, height: number): Buffer {
  const header = Buffer.alloc(24);
  header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}
