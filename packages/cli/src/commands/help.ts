import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { defaultOverlayStyle, formatOverlayAddUsage, listOverlayStyles } from "../overlays/scaffoldRegistry.js";

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
  overlay: {
    aliases: ["overlays", "webview-overlay"],
    commands: [formatOverlayAddUsage()],
    docs: ["docs/contracts/ui.md", "docs/runtime/desktop-packaging.md"],
    examples: [
      `tn overlay add inventory --style ${defaultOverlayStyle()} --json`,
      "tn overlay add inventory --style vanilla --json",
      `Available styles: ${listOverlayStyles().join(", ")}; default: ${defaultOverlayStyle()}.`,
    ],
    failureSymptoms: ["overlay source path already exists", "overlay ID is already declared", "compiled overlay entry is missing"],
    summary: "Scaffold an optional React webview overlay with Tailwind by default or plain CSS.",
    title: "React webview overlay scaffold",
  },
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
    commands: ["tn asset source search --query <text> [--json]", "tn asset source search --game-category <category> --format glb --direct-only [--json]", "tn asset source search --file-role <pack-page|material-index|texture-index|hdri-index> [--json]", "tn asset source get <asset-source-id> [--json]", "tn asset inspect <path-or-directory> [--recursive] [--json]", "tn model-test <asset-path> --view [--angle <degrees>] [--out <dir>] [--json]", "tn model-test <asset-path> --screenshot [--angle <degrees>] [--url <preview-url>] [--screenshot-out <file.png>] [--out <dir>] [--json]", "tn model-test <asset-path> --angles <degrees,...> [--out <dir>] [--json]", "tn validate", "tn build", "tn help visual-qa"],
    docs: ["docs/workflows/asset-pipeline.md", "docs/workflows/ai-workflows.md", "docs/runtime/README.md"],
    examples: ["tn asset source search --query \"bowling pins\" --json", "tn asset source search --game-category underwater --format glb --direct-only --json", "tn asset source get babylon-grey-snapper-vert-color --json", "tn asset inspect assets/kart.glb --json", "tn asset inspect assets --recursive --json", "tn model-test assets/kart.glb --view --json", "tn model-test assets/kart.glb --screenshot --angle 45 --json", "tn model-test assets/kart.glb --angles 0,90,180,270 --json", "tn model-test assets/kart.glb --screenshot --url http://127.0.0.1:5173 --screenshot-out hero.png --json", "Keep glTF/GLB files and external textures inside the project assets directory before building."],
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
      "tn scene add-prefab-instances <scene-id> --prefab <prefab-id> --positions x,y,z;x,y,z [--prefix <id-prefix>] [--components <json-object>] --json",
      "tn scene add-group <scene-id> <group-id> [--name <label>] [--position x,y,z] --json",
      "tn scene set-camera-look-at <scene-id> <camera-id> --position x,y,z --target x,y,z --json",
      "tn scene proof-camera <scene-id> --camera <camera-id> --target <entity-id> [--min-occupancy <n>] [--max-roll <radians>] --json",
      "tn scene generate-modular-track <scene-id> --asset-dir <path> [--shape oval] [--size small|medium|large] [--prefix <id-prefix>] --json",
      "tn scene add-modular-track <scene-id> --asset-dir <path> --layout <json-array> [--prefix <id-prefix>] --json",
      "tn scene proof-modular-track <scene-id> --asset-dir <path> [--prefix <id-prefix>] [--actors <entity-id,...>] --json",
      "tn scene set-component <scene-id> <entity-id> <component-kind> --value <json-object> --json",
      "tn scene remove-component <scene-id> <entity-id> <component-kind> --json",
      "tn scene set-prefab-color <scene-id> <prefab-id> --color <css-color> --json",
      "tn scene set-transform <scene-id> <entity-id> --position x,y,z --rotation-deg x,y,z --scale x,y,z --json",
      "tn scene attach-script <scene-id> <system-id> --module <path> --export <name> --json",
      "tn scene remove-entity <scene-id> <entity-id> --json",
      "tn scene remove-ui-node <scene-id> <ui-node-id> --json",
      "tn scene remove-resource <scene-id> <resource-id> --json",
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
      "tn scene add-prefab-instances scene.arena --prefab prefab.orb --positions '0,0,0;1,0,0;2,0,0' --prefix orb --json",
      "tn scene remove-entity scene.arena player-kart --json",
      "tn scene add-group scene.arena group.lane.red --name 'Red Lane' --position -2.5,0,0 --json",
      "tn scene set-camera-look-at scene.arena camera.main --position -5,1.6,10 --target 0,0.4,10 --json",
      "tn scene proof-camera scene.arena --camera camera.main --target player-kart --min-occupancy 0.04 --json",
      "tn scene generate-modular-track scene.arena --asset-dir assets --shape oval --size medium --prefix road.tile --json",
      "tn scene proof-modular-track scene.arena --asset-dir assets --prefix road.tile --actors player-kart,rival-kart --json",
      "tn scene set-component scene.arena player-kart VehiclePhysics --value '{\"speed\":42,\"boost\":0.65}' --json",
      "tn scene set-prefab-color scene.arena kart --color '#00aaff' --json",
      "tn scene set-transform scene.arena player-kart --position 0,0,0 --rotation-deg 0,90,0 --scale 1,1,1 --json",
      "tn scene attach-script scene.arena race-controller --module src/scripts/race.ts --export raceController --json",
      "tn scene proof scene.arena --project . --web-url http://127.0.0.1:5173 --out artifacts/proof --native --json",
      "The CLI is the canonical automation surface; MCP tools wrap tn commands instead of duplicating scene mutation logic.",
    ],
    failureSymptoms: ["missing first .scene.json seed file", "generated bundle path used as source", "duplicate scene id", "manual proof commands scattered across artifacts"],
    summary: "Create and mutate structured source scenes with stable JSON diagnostics and proof steps.",
    title: "Scene authoring loop",
  },
  commands: {
    aliases: ["command-declarations", "ecs-commands"],
    commands: [
      "tn scene add-tag <scene-id> <entity-id> <tag> --json",
      "tn scene remove-entity <scene-id> <entity-id> --json",
      "tn scene add-prefab-instances <scene-id> --prefab <prefab-id> --positions x,y,z;x,y,z --json",
      "tn add <block> --project <path> --json",
      "tn remove <block> --project <path> --json",
      "tn authoring validate --project <path> --json",
    ],
    docs: ["docs/contracts/ir.md", "docs/workflows/developer-workflow.md"],
    examples: [
      "Use { kind: \"despawn\", tag: \"orb\" } for all authored entities carrying the orb tag.",
      "Use entity: \"orb.*\" for a bounded id pattern; build validation reports an empty match.",
      "Use tn scene remove-entity when deleting a source entity so inline bindings and command references are cleaned up.",
    ],
    failureSymptoms: ["despawn declaration does not match an authored entity", "manual JSON cleanup after removing an entity", "duplicate inline systems or UI ownership"],
    summary: "Declare portable ECS commands, scoped selectors, batch placement, and inverse cleanup operations.",
    title: "Command declarations and cleanup",
  },
  schemas: {
    aliases: ["schema", "events", "resources"],
    commands: [
      "tn schema create <schema-doc-id> --kind component|event|resource --json",
      "tn scene add-resource <scene-id> <resource-id> [--path <resource.path>] --json",
      "tn types generate --project <path> --json",
      "tn authoring validate --project <path> --json",
    ],
    docs: ["docs/contracts/ir.md", "docs/contracts/scripting-api.md"],
    examples: [
      "Event schemas may be authored as kind: \"event\" or inferred from context.events.emit(\"match.win\", { collected: 0 }).",
      "Resource reads and writes are inferred from literal context.resources.get/patch/set calls.",
      "Run tn types generate --project . --json after changing schema source.",
    ],
    failureSymptoms: ["missing event schema", "unknown schema document kind", "generated ProjectEventMap is stale"],
    summary: "Discover component, event, and resource schema channels and their type-generation behavior.",
    title: "Schema channels",
  },
  flow: {
    aliases: ["game-flow", "triggers"],
    commands: [
      "tn help schemas --json",
      "tn build --project <path> --json",
      "tn playtest schema --json",
      "tn validate --project <path> --json",
    ],
    docs: ["docs/contracts/ir.md", "docs/workflows/playtest-proof.md"],
    examples: [
      "Use trigger.kind: \"event\" with trigger.event for event-driven transitions.",
      "Use resourceEquals with resource and field to read a declared resource field.",
      "Use timer or allCollected for the other bounded flow trigger kinds.",
    ],
    failureSymptoms: ["flow trigger never fires", "resource lookup field is missing", "event transition uses an undeclared event"],
    summary: "Resolve flow trigger kinds, event routing, and resource lookup semantics from portable contracts.",
    title: "Flow triggers",
  },
  camera: {
    commands: ["tn scene set-camera-look-at <scene-id> <camera-id> --position x,y,z --target x,y,z --json", "tn scene proof-camera <scene-id> --camera <camera-id> --target <entity-id> --json", "tn dev --target web", "tn verify --frames 2 --json", "tn help visual-qa"],
    docs: ["docs/workflows/visual-qa.md", "docs/runtime/README.md", "docs/contracts/scripting-api.md"],
    examples: ["tn scene proof-camera racing-kit-rally --camera camera.main --target player.car --min-occupancy 0.04 --json", "Frame the primary actor, keep near/far planes broad enough, and avoid per-frame camera mutations that validation cannot inspect."],
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
    commands: ["tn dev --target web", "tn verify [--project <path>] [--frames <count>] [--json]", "tn parity visual --project <path> --url <preview-url> --reference <png> [--json]", "tn performance trace --project <path> --url <preview-url> [--seconds <1..30>] [--out <file.json.gz>] [--json]", "tn screenshot [--project <path>] --url <preview-url> --out <file.png> [--wait-ready] [--viewport desktop|mobile|<width>x<height>] [--json]", "tn record [--project <path>] --url <preview-url> --out <file.webm|file.mp4> [--duration <seconds>] [--input-script <path|default|none>] [--json]", "tn help screenshot", "tn help record"],
    docs: ["docs/workflows/developer-workflow.md", "docs/workflows/ai-workflows.md"],
    examples: ["Run focused validation/build first, then capture visual proof and report exact artifact paths.", "Use tn parity visual for repeatable reference-image scoring with stale-preview protection.", "Use tn performance trace before rendering A/B changes when measured browser FPS is low.", "tn screenshot --url http://127.0.0.1:5173 --out artifacts/proof/frame.png", "tn record --url http://127.0.0.1:5173 --out artifacts/proof/motion.webm --duration 5"],
    failureSymptoms: ["ready flag true but frame is black", "HUD visible but world missing", "low visible mesh count", "resource load failure", "interactive browser frame rate is below budget"],
    summary: "Collect visual and browser performance proof that the scene is actually healthy, not just technically ready.",
    title: "Visual QA and proof",
  },
  playtest: {
    aliases: ["playtests", "assertions", "proof-bar"],
    commands: [
      "tn playtest schema --json",
      "tn playtest scaffold --assert <movement|pickup|win-state|retry> --json",
      "tn playtest scaffold --from-plan artifacts/game-production/plan.json --json",
      "tn playtest --project <path> --scenario playtests/<name>.playtest.json --json",
      "tn iterate --project . --json",
    ],
    docs: ["docs/workflows/playtest-proof.md", "docs/workflows/ai-workflows.md"],
    examples: [
      "tn playtest scaffold --assert pickup --json",
      "Use tn playtest schema --json for step fields, holdTicks, wait steps, pathLength, textIncludes, resource assertions, and KeyR retry examples.",
      "For the normal agent proof loop, run tn iterate --project . --json instead of standalone validate/build/playtest commands.",
    ],
    failureSymptoms: ["unknown playtest assertion field", "need KeyR retry syntax", "manual artifact jq after assertion failure"],
    summary: "Discover assertion DSL fields and scaffold proof-bar playtests without reading engine sources.",
    title: "Playtest scenarios and assertions",
  },
  screenshot: {
    commands: ["tn parity visual --project <path> --url <preview-url> --reference <png> [--out <png>] [--history <json>] [--viewport reference|desktop|mobile|<width>x<height>] [--json]", "tn screenshot [--project <path>] --url <preview-url> --out <file.png> [--wait-ready] [--viewport desktop|mobile|<width>x<height>] [--json]", "tn verify --frames 1 --json", "tn compare-images <first.png> <second.png> [--json]"],
    docs: ["docs/workflows/developer-workflow.md", "docs/runtime/README.md"],
    examples: ["tn parity visual --url http://127.0.0.1:5173 --reference docs/reference/target.png --json", "tn screenshot --url http://127.0.0.1:5173 --out artifacts/proof/frame.png --json", "tn screenshot --url http://127.0.0.1:5173 --out artifacts/game-production/mobile-viewport.png --viewport mobile --json"],
    failureSymptoms: ["no canvas", "runtime readiness timeout", "black frame"],
    summary: "Capture or compare still-frame proof from the web preview workflow.",
    title: "Screenshot proof",
  },
  record: {
    commands: ["tn record [--project <path>] --url <preview-url> --out <file.webm|file.mp4> [--duration <seconds>|--seconds <seconds>] [--input-script <path|default|none>] [--json]", "tn dev --target web", "tn verify --frames <count> --expect-motion --json"],
    docs: ["docs/workflows/developer-workflow.md", "docs/runtime/README.md"],
    examples: ["tn record --url http://127.0.0.1:5173 --out artifacts/proof/motion.webm --duration 5 --json", "Use .mp4 only when ffmpeg is installed; .webm is captured directly from Chromium."],
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
