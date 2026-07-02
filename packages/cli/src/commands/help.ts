import { diagnosticResult, type ICommandResult } from "../diagnostics.js";

export interface HelpTopic {
  aliases?: readonly string[];
  commands: readonly string[];
  docs: readonly string[];
  examples: readonly string[];
  failureSymptoms?: readonly string[];
  summary: string;
  title: string;
}

export const HELP_TOPICS: Record<string, HelpTopic> = {
  scaffold: {
    aliases: ["create", "init", "setup"],
    commands: [
      "tn init <name> [--template <template>]",
      "tn create <name> [--template <template>]",
      "cd <name> && pnpm install",
      "pnpm run validate && pnpm run build && pnpm run dev:web",
    ],
    docs: ["docs/workflows/developer-workflow.md", "docs/workflows/ai-workflows.md"],
    examples: [
      "tn init arena-prototype --template structured-source-starter --json",
      "tn init rally --template racing-kit-rally-starter --json",
    ],
    summary: "Create a new ThreeNative project and run the first validation/build loop.",
    title: "Scaffold a first project",
  },
  assets: {
    aliases: ["asset", "model", "glb", "gltf"],
    commands: ["tn asset inspect <path-or-directory> [--recursive] [--json]", "tn model-test <asset-path> [--out <dir>] [--verify] [--screenshot] [--url <preview-url>]", "tn validate", "tn build", "tn help visual-qa"],
    docs: ["docs/workflows/asset-pipeline.md", "docs/workflows/ai-workflows.md", "docs/runtime/README.md"],
    examples: ["tn asset inspect assets/kart.glb --json", "tn asset inspect assets --recursive --json", "tn model-test assets/kart.glb --out artifacts/model-test --verify --screenshot --url http://127.0.0.1:5173 --json", "Keep glTF/GLB files and external textures inside the project assets directory before building."],
    failureSymptoms: ["model loaded but invisible", "missing external texture", "asset path outside project root"],
    summary: "Debug asset paths, texture dependencies, and model visibility before runtime capture.",
    title: "Asset and model triage",
  },
  scene: {
    aliases: ["authoring", "scene-authoring"],
    commands: [
      "tn scene create <scene-id> [--file <path>] --json",
      "tn scene import-world <scene-id> --world <path/to/world.ir.json> [--file <path>] [--replace] --json",
      "tn scene add-prefab <scene-id> <prefab-id> [--primitive <primitive>] [--color <css-color>] --json",
      "tn scene set-prefab <scene-id> <prefab-id> [--primitive <primitive>] [--color <css-color>] [--asset <path.glb>] --json",
      "tn scene add-resource <scene-id> <resource-id> [--path <resource.path>] --json",
      "tn scene set-resource <scene-id> <resource-id> [--path <resource.path>] [--value <json>] --json",
      "tn resources add <resources-doc-id> <resource-id> [--path <resource.path>] [--value <json>] --json",
      "tn scene add-ui-node <scene-id> <ui-node-id> --json",
      "tn scene add-entity <scene-id> <entity-id> [--prefab <prefab-id>] --json",
      "tn scene add-tag <scene-id> <entity-id> <tag> --json",
      "tn scene add-group <scene-id> <group-id> [--name <label>] [--position x,y,z] --json",
      "tn scene set-camera-look-at <scene-id> <camera-id> --position x,y,z --target x,y,z --json",
      "tn scene generate-modular-track <scene-id> --asset-dir <path> [--shape oval] [--size small|medium|large] [--prefix <id-prefix>] --json",
      "tn scene add-modular-track <scene-id> --asset-dir <path> --layout <json-array> [--prefix <id-prefix>] --json",
      "tn scene proof-modular-track <scene-id> --asset-dir <path> [--prefix <id-prefix>] [--actors <entity-id,...>] --json",
      "tn scene set-component <scene-id> <entity-id> <component-kind> --value <json-object> --json",
      "tn scene remove-component <scene-id> <entity-id> <component-kind> --json",
      "tn scene set-prefab-color <scene-id> <prefab-id> --color <css-color> --json",
      "tn scene set-transform <scene-id> <entity-id> --position x,y,z --rotation x,y,z --scale x,y,z --json",
      "tn scene attach-script <scene-id> <system-id> --module <path> --export <name> --json",
      "tn scene validate <scene-id> --json",
      "tn build --json",
      "tn scene proof <scene-id> --project <path> --web-url <preview-url> --out artifacts/proof --native --json",
      "tn verify --frames 3 --json",
    ],
    docs: ["docs/workflows/developer-workflow.md", "docs/workflows/ai-workflows.md"],
    examples: [
      "tn scene create scene.arena --json",
      "tn scene import-world scene.arena --world dist/game.bundle/world.ir.json --replace --json",
      "tn scene add-prefab scene.arena kart --primitive box --color '#ff2200' --json",
      "tn scene add-resource scene.arena hud.score --path hud.score.value --json",
      "tn resources add gameplay RaceState --path race.state --value '{\"lap\":1,\"status\":\"READY\"}' --json",
      "tn scene set-resource scene.arena race-state --value '{\"speed\":0,\"lap\":1}' --json",
      "tn scene add-ui-node scene.arena score-label --json",
      "tn scene add-entity scene.arena player-kart --prefab kart --json",
      "tn scene add-tag scene.arena player-kart PlayerControlled --json",
      "tn scene add-group scene.arena group.lane.red --name 'Red Lane' --position -2.5,0,0 --json",
      "tn scene set-camera-look-at scene.arena camera.main --position -5,1.6,10 --target 0,0.4,10 --json",
      "tn scene generate-modular-track scene.arena --asset-dir assets --shape oval --size medium --prefix road.tile --json",
      "tn scene proof-modular-track scene.arena --asset-dir assets --prefix road.tile --actors player-kart,rival-kart --json",
      "tn scene set-component scene.arena player-kart VehiclePhysics --value '{\"speed\":42,\"boost\":0.65}' --json",
      "tn scene set-prefab-color scene.arena kart --color '#00aaff' --json",
      "tn scene set-transform scene.arena player-kart --position 0,0,0 --rotation 0,0,0 --scale 1,1,1 --json",
      "tn scene attach-script scene.arena race-controller --module src/scripts/race.ts --export raceController --json",
      "tn scene proof scene.arena --project . --web-url http://127.0.0.1:5173 --out artifacts/proof --native --json",
      "The CLI is the canonical automation surface; MCP tools wrap tn commands instead of duplicating scene mutation logic.",
    ],
    failureSymptoms: ["missing first .scene.json seed file", "generated bundle path used as source", "duplicate scene id", "manual proof commands scattered across artifacts"],
    summary: "Create and mutate structured source scenes with stable JSON diagnostics and proof steps.",
    title: "Scene authoring loop",
  },
  camera: {
    commands: ["tn dev --target web", "tn verify --frames 2 --json", "tn help visual-qa"],
    docs: ["docs/runtime/README.md", "docs/contracts/scripting-api.md"],
    examples: ["Frame the primary actor, keep near/far planes broad enough, and avoid per-frame camera mutations that validation cannot inspect."],
    failureSymptoms: ["black canvas", "HUD-only frame", "camera clipping", "player behind camera"],
    summary: "Find safe camera framing patterns and visual checks for runtime previews.",
    title: "Camera framing",
  },
  transform: {
    commands: ["tn validate", "tn help camera", "tn help visual-qa"],
    docs: ["docs/contracts/scripting-api.md", "docs/runtime/README.md"],
    examples: ["Patch position, rotation, and scale intentionally; verify scale remains visible after gameplay updates."],
    failureSymptoms: ["scale wiped by partial transform update", "pivot/origin makes model appear offset", "runtime patch changes only one transform field"],
    summary: "Avoid transform patch footguns that make otherwise valid models disappear.",
    title: "Transform semantics",
  },
  "visual-qa": {
    aliases: ["visual", "qa", "proof"],
    commands: ["tn dev --target web", "tn verify [--project <path>] [--frames <count>] [--json]", "tn screenshot [--project <path>] --url <preview-url> --out <file.png> [--wait-ready] [--json]", "tn record [--project <path>] --url <preview-url> --out <file.webm|file.mp4> [--duration <seconds>] [--input-script <path|default|none>] [--json]", "tn help screenshot", "tn help record"],
    docs: ["docs/workflows/developer-workflow.md", "docs/workflows/ai-workflows.md"],
    examples: ["Run focused validation/build first, then capture visual proof and report exact artifact paths.", "tn screenshot --url http://127.0.0.1:5173 --out artifacts/proof/frame.png", "tn record --url http://127.0.0.1:5173 --out artifacts/proof/clip.webm --duration 5"],
    failureSymptoms: ["ready flag true but frame is black", "HUD visible but world missing", "low visible mesh count", "resource load failure"],
    summary: "Collect visual proof that the scene is actually visible, not just technically ready.",
    title: "Visual QA and proof",
  },
  screenshot: {
    commands: ["tn screenshot [--project <path>] --url <preview-url> --out <file.png> [--wait-ready] [--json]", "tn verify --frames 1 --json", "tn compare-images <first.png> <second.png> [--json]"],
    docs: ["docs/workflows/developer-workflow.md", "docs/runtime/README.md"],
    examples: ["tn screenshot --url http://127.0.0.1:5173 --out artifacts/proof/frame.png --json"],
    failureSymptoms: ["no canvas", "runtime readiness timeout", "black frame"],
    summary: "Capture or compare still-frame proof from the web preview workflow.",
    title: "Screenshot proof",
  },
  record: {
    commands: ["tn record [--project <path>] --url <preview-url> --out <file.webm|file.mp4> [--duration <seconds>|--seconds <seconds>] [--input-script <path|default|none>] [--json]", "tn dev --target web", "tn verify --frames <count> --expect-motion --json"],
    docs: ["docs/workflows/developer-workflow.md", "docs/runtime/README.md"],
    examples: ["tn record --url http://127.0.0.1:5173 --out artifacts/proof/clip.webm --duration 5 --json", "Use .mp4 only when ffmpeg is installed; .webm is captured directly from Chromium."],
    failureSymptoms: ["browser/video codec unavailable", "no visible motion", "runtime readiness timeout"],
    summary: "Collect short motion proof or an explicit unavailable state for video workflows.",
    title: "Recording proof",
  },
  examples: {
    aliases: ["templates", "gallery"],
    commands: ["tn create prototype --template structured-source-starter --json", "tn create rally --template racing-kit-rally-starter --json", "tn help scaffold"],
    docs: ["docs/workflows/developer-workflow.md", "templates/structured-source-starter/README.md", "templates/racing-kit-rally-starter/README.md"],
    examples: [
      "structured-source-starter: JSON source documents under content/** with behavior modules under src/scripts/**.",
      "racing-kit-rally-starter: Kenney Racing Kit scene with modular track, start grid, chase camera, and kart controls.",
    ],
    summary: "Choose a structured-source starter for CLI/editor authoring or an asset-backed starter.",
    title: "Templates and examples",
  },
};

export function listHelpTopics(): string[] {
  return Object.keys(HELP_TOPICS).sort();
}

export async function helpCommand(argv: readonly string[]): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const topicArg = normalizedArgv.find((arg) => !arg.startsWith("-"));

  if (topicArg === undefined) {
    const payload = {
      code: "TN_HELP_TOPICS",
      message: "Available ThreeNative help topics.",
      topics: listHelpTopics().map((name) => ({ name, summary: HELP_TOPICS[name]?.summary })),
    };
    return {
      exitCode: 0,
      stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : renderTopicList(),
    };
  }

  const resolved = resolveHelpTopic(topicArg);
  if (resolved === undefined) {
    return diagnosticResult(
      {
        code: "TN_HELP_TOPIC_UNKNOWN",
        message: `Unknown help topic '${topicArg}'. Available topics: ${listHelpTopics().join(", ")}.`,
        topic: topicArg,
        topics: listHelpTopics(),
      },
      { exitCode: 1, json, stderr: true },
    );
  }

  const payload = {
    code: "TN_HELP_TOPIC",
    name: resolved.name,
    ...resolved.topic,
  };

  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : renderTopic(resolved.name, resolved.topic),
  };
}

function resolveHelpTopic(name: string): { name: string; topic: HelpTopic } | undefined {
  const direct = HELP_TOPICS[name];
  if (direct !== undefined) {
    return { name, topic: direct };
  }

  const alias = Object.entries(HELP_TOPICS).find(([, topic]) => topic.aliases?.includes(name) === true);
  return alias === undefined ? undefined : { name: alias[0], topic: alias[1] };
}

function renderTopicList(): string {
  const rows = listHelpTopics()
    .map((name) => `  ${name.padEnd(10)} ${HELP_TOPICS[name]?.summary ?? ""}`)
    .join("\n");
  return `ThreeNative task help\n\nUsage:\n  tn help [topic] [--json]\n\nTopics:\n${rows}\n`;
}

function renderTopic(name: string, topic: HelpTopic): string {
  const commands = topic.commands.map((command) => `  - ${command}`).join("\n");
  const docs = topic.docs.map((doc) => `  - ${doc}`).join("\n");
  const examples = topic.examples.map((example) => `  - ${example}`).join("\n");
  const symptoms = topic.failureSymptoms === undefined ? "" : `\nCommon failure symptoms:\n${topic.failureSymptoms.map((symptom) => `  - ${symptom}`).join("\n")}\n`;

  return `${topic.title} (${name})\n\n${topic.summary}\n\nCommands:\n${commands}\n\nExamples:\n${examples}\n\nDocs:\n${docs}\n${symptoms}`;
}
