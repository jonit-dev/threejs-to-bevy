#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { addCommand } from "./commands/add.js";
import { ASSET_POLY_HAVEN_MCP_DESCRIPTORS, ASSET_PROVIDER_MCP_DESCRIPTORS, ASSET_PROVIDER_STATUS_MCP_DESCRIPTORS, ASSET_SKETCHFAB_MCP_DESCRIPTORS } from "./assetProviders/registry.js";
import { assetGenerationMcpAdapters, assetGenerationProviderRegistry, renderAssetGenerationProviderHelp } from "./assetGenerationProviders/registry.js";
import { actorCommand } from "./commands/actor.js";
import { ASSET_GENERATE_BLENDER_DESCRIPTOR, ASSET_INSPECT_MCP_DESCRIPTOR, assetCommand } from "./commands/asset.js";
import { authoringCommand } from "./commands/authoring.js";
import { buildCommand } from "./commands/build.js";
import { bakeGiCommand } from "./commands/bakeGi.js";
import { bundleCommand } from "./commands/bundle.js";
import { cookbookCommand } from "./commands/cookbook.js";
import { compareImagesCommand } from "./commands/compareImages.js";
import { createProject, initProject } from "./commands/create.js";
import { devCommand } from "./commands/dev.js";
import { doctorCommand } from "./commands/doctor.js";
import { editorCommand } from "./commands/editor.js";
import { gameCommand } from "./commands/game.js";
import { helpCommand } from "./commands/help.js";
import { iterateCommand } from "./commands/iterate.js";
import { lookCommand } from "./commands/look.js";
import { MODEL_TEST_MCP_DESCRIPTOR, modelTestCommand } from "./commands/modelTest.js";
export { materialEvidence, modelTestCommand, type ModelTestMaterialEvidence, type ModelTestMaterialObservation } from "./commands/modelTest.js";
import { overlayCommand } from "./commands/overlayAdd.js";
import { packageCommand, packageCommandUsage } from "./commands/package.js";
import { parityPlaytestCommand } from "./commands/parityPlaytest.js";
import { performanceProofCommand } from "./commands/performanceProof.js";
import { playtestCommand } from "./commands/playtest.js";
import { navCommand, physicsCommand } from "./commands/physicsNav.js";
import { proofCommand, proveCommand } from "./commands/proof.js";
import { recipeCommand } from "./commands/recipe.js";
import { removeCommand } from "./commands/remove.js";
import { sceneCommand } from "./commands/scene.js";
import { animationCommand, audioCommand, distributionCommand, environmentCommand, flowCommand, generatorCommand, inputCommand, materialCommand, meshCommand, particleCommand, prefabCommand, projectCommand, resourcesCommand, runtimeCommand, schemaCommand, sequenceCommand, systemCommand, targetCommand, uiCommand } from "./commands/sourceDocuments.js";
import { validateProject } from "./commands/validate.js";
import { recordCommand, screenshotCommand } from "./commands/visualProof.js";
import { verifyCommand } from "./commands/verify.js";
import { typesCommand } from "./commands/types.js";
import { toolCommand } from "./commands/tool.js";
import { worldCommand } from "./commands/world.js";
import { type ICommandResult } from "./diagnostics.js";
import { ASSET_CREATION_STRATEGY_MCP_DESCRIPTOR, MODEL_PROVIDER_MCP_DESCRIPTORS, assetCreationStrategy, blenderMcpOutcomeCoverage, modelProviderRegistry } from "./modelProviders/registry.js";
import { defineCommandRegistry, findCommand, renderCommandHelp, unmigratedCommandNames, type ICommandDefinition } from "./commands/registry.js";
export type { CommandMcpToolName, ICommandMcpAdapterDefinition } from "./commands/registry.js";
export type { IAssetCommandOptions } from "./commands/asset.js";
export { ASSET_CREATION_STRATEGY_MCP_DESCRIPTOR, ASSET_GENERATE_BLENDER_DESCRIPTOR, ASSET_INSPECT_MCP_DESCRIPTOR, ASSET_POLY_HAVEN_MCP_DESCRIPTORS, ASSET_PROVIDER_STATUS_MCP_DESCRIPTORS, ASSET_SKETCHFAB_MCP_DESCRIPTORS, MODEL_PROVIDER_MCP_DESCRIPTORS, MODEL_TEST_MCP_DESCRIPTOR, assetCommand, assetCreationStrategy, assetGenerationMcpAdapters, assetGenerationProviderRegistry, blenderMcpOutcomeCoverage, modelProviderRegistry };
export { authoringCommand } from "./commands/authoring.js";
export { buildCommand } from "./commands/build.js";
export { toolCommand } from "./commands/tool.js";
import { formatOverlayAddUsage } from "./overlays/scaffoldRegistry.js";
export { EXTERNAL_TOOL_REGISTRY, externalToolHost, getExternalToolDefinition } from "./externalTools/registry.js";

export const CLI_COMMAND_REGISTRY = defineCommandRegistry({
  add: {
    description: "Compose bounded gameplay mechanic blocks into structured source.",
    implemented: true,
    usage: "tn add <spawner|timer|trigger-sequence|score|projectile|follow-camera> [block flags] [--project <path>] [--json]",
  },
  remove: {
    description: "Remove a registered mechanic block and its generated proof artifacts.",
    implemented: true,
    usage: "tn remove <spawner|timer|trigger-sequence|score|projectile|follow-camera> [--project <path>] [--json]",
  },
  asset: {
    adapters: {
      mcp: [...assetGenerationMcpAdapters, ASSET_INSPECT_MCP_DESCRIPTOR, ...ASSET_PROVIDER_MCP_DESCRIPTORS, ...MODEL_PROVIDER_MCP_DESCRIPTORS, ASSET_CREATION_STRATEGY_MCP_DESCRIPTOR],
    },
    description: "Inspect GLB/glTF assets, query source catalog records, and mutate structured asset source documents.",
    implemented: true,
    subcommands: ["add", "generate", "import", "inspect", "model-provider", "provider", "repair", "source", "strategy"],
    usage: `${renderAssetGenerationProviderHelp()}\n              ${modelProviderRegistry.flatMap((provider) => provider.features.map((feature) => feature.usage)).join("\n              ")}\n              tn asset model-provider status hunyuan [--json]\n              tn asset inspect <path-or-directory> [--recursive] [--json]\n              tn asset import <source-path-or-url> --id <asset-id> [--license <id>] [--attribution <text>] [--variant name=#rrggbb] [--project <path>] [--json]\n              tn asset repair <path.glb|path.gltf> --strip-extensions [--no-backup] [--json]\n              tn asset source search [--query <text>] [--game-category <category>] [--file-role <role>] [--format glb] [--direct-only] [--full] [--json]\n              tn asset source get <asset-source-id> [--json]\n              tn asset add <asset-id> --type <audio|buffer|model|texture> --path <source-path> [--project <path>] [--json]\n              tn asset add <asset-id> --type render-target --width <n> --height <n> [--usage color|depth] [--format rgba8|rgba16f|depth24plus] [--sample-count <n>] [--project <path>] [--json]`,
  },
  actor: {
    description: "Apply reusable actor archetypes to structured source.",
    handler: actorCommand,
    implemented: true,
    subcommands: ["list", "add", "update"],
    usage: "tn actor list [--json]\n              tn actor add character --id <actor-id> [--asset <asset-id-or-path>] [--scene <scene-id>] [--speed <n>] [--sprint-speed <n>] [--shared] [--project <path>] [--json]\n              tn actor update <actor-id> --set speed=4 [--set sprintSpeed=6] [--project <path>] [--json]",
  },
  audio: {
    description: "Create, generate, and mutate structured audio source documents.",
    implemented: true,
    subcommands: ["add-sound", "create", "generate-sfx"],
    usage: "tn audio create <audio-doc-id> [--project <path>] [--json]\n              tn audio add-sound <audio-doc-id> <sound-id> --asset <asset-id-or-path> [--project <path>] [--json]\n              tn audio generate-sfx <asset-id> --prompt <text> [--audio-doc <id>] [--sound-id <id>] [--duration <seconds>] [--loop] [--prompt-influence <0..1>] [--model <id>] [--output-format <format>] [--out <path>] [--force] [--env-file <path>] [--project <path>] [--json]",
  },
  distribution: {
    description: "Create and mutate durable distribution app and target source metadata.",
    handler: distributionCommand,
    implemented: true,
    subcommands: ["set-app", "set-target"],
    usage: "tn distribution set-app --app-id <reverse-dns-id> --display-name <name> [--version <semver>] [--build-number <n>] [--icons <path>] [--splash <path>] [--privacy-policy-url <url>] [--project <path>] [--json]\n              tn distribution set-target --platform <platform> --runtime <runtime> --formats <format,...> [--architecture <architecture>] [--capabilities <capability,...>] [--channel <channel>] [--minimum-os <version>] [--project <path>] [--json]",
  },
  animation: {
    description: "Add model animation clip and graph metadata to structured asset source.",
    implemented: true,
    usage: "tn animation add-clip <asset-id> <clip-id> [--source-clip <name>] [--loop true|false] [--speed <n>] [--project <path>] [--json]\n              tn animation graph add-state <asset-id> <state-id> --clip <clip-id> [--initial] [--project <path>] [--json]",
  },
  environment: {
    description: "Create and mutate structured environment source documents.",
    implemented: true,
    usage: "tn environment create <environment-id> [--project <path>] [--json]\n              tn environment set-skybox <environment-id> --asset <asset-id-or-path> [--mode equirect|cube|color] [--project <path>] [--json]\n              tn environment set-map <environment-id> --asset <asset-id-or-path> [--project <path>] [--json]\n              tn environment set-volumetrics <environment-id> --volumetrics '<json-object>' [--project <path>] [--json]\n              tn environment set-terrain <environment-id> [--id <terrain-id>] [--height-mode flat|heightmap] [--heightmap <asset-id-or-path>] [--project <path>] [--json]\n              tn environment set-path <environment-id> --path '<json>' [--project <path>] [--json]\n              tn environment set-walkability <environment-id> --walkability '<json>' [--project <path>] [--json]\n              tn environment add-scatter-layer <environment-id> --scatter '<json-object>' [--project <path>] [--json]\n              tn environment set-source-asset-lod <environment-id> <source-asset-id> --lod '<json>' [--project <path>] [--json]",
  },
  flow: {
    description: "Create and mutate declarative GameFlow source documents.",
    implemented: true,
    usage: "tn flow create <flow-id> [--initial <state-id>] [--scene <scene-id>] [--project <path>] [--json]\n              tn flow add-state <flow-id> <state-id> [--actions '<json-array>'] [--project <path>] [--json]\n              tn flow add-transition <flow-id> <transition-id> --from <state-id> --to <state-id> --trigger '<json-object>' [--actions '<json-array>'] [--project <path>] [--json]",
  },
  authoring: {
    description: "Inspect, validate, and atomically mutate structured authoring source documents.",
    implemented: true,
    subcommands: ["batch", "compile-typed-spec", "inspect", "prototype", "script", "validate"],
    usage: "tn authoring inspect [--project <path>] [--plan <plan.json>] [--json]\n              tn authoring validate [--project <path>] [--json]\n              tn authoring prototype --from-plan <plan.json> [--project <path>] [--run-proof] [--json]\n              tn authoring compile-typed-spec [--entry <src/game.spec.ts>] [--project <path>] [--json]\n              tn authoring batch plan --file <path|-> [--project <path>] [--json]\n              tn authoring batch apply --file <path|-> [--project <path>] [--json]\n              tn authoring script scaffold [--module src/scripts/<name>.ts] [--export <name>] [--entity <id>] [--resource <id>] [--input <id>] [--project <path>] [--json]\n              tn authoring script check [--module src/scripts/<name>.ts] [--export <name>] [--project <path>] [--json]",
  },
  bake: {
    description: "Bake deterministic portable lighting data into durable content.",
    handler: bakeGiCommand,
    implemented: true,
    subcommands: ["gi"],
    usage: "tn bake gi [--ray-count <n>] [--seed <n>] [--max-distance <n>] [--project <path>] [--json]",
  },
  create: {
    description: "Scaffold a ThreeNative project from a maintained template.",
    implemented: true,
    usage: "tn create <name> [--template <template>] [--authoring structured-source|typed-spec] [--json]",
  },
  cookbook: {
    adapters: {
      mcp: {
        description: "Show a cookbook entry by id or search cookbook entries by query through tn cookbook --json.",
        name: "cookbook_lookup",
      },
    },
    description: "List, search, and show validated agent authoring cookbook examples.",
    implemented: true,
    usage: "tn cookbook list [--json]\n              tn cookbook search <query> [--json]\n              tn cookbook show <id> [--json]\n              tn cookbook <id> [--json]",
  },
  init: {
    description: "Alias for create with first-project next steps.",
    implemented: true,
    usage: "tn init <name> [--template <template>] [--json]",
  },
  iterate: {
    description: "Run validate, build, screenshot, and optional playtest as one agent iteration loop.",
    implemented: true,
    usage: "tn iterate [--project <path>] [--scenario playtests/<name>.playtest.json] [--native] [--audit-writes] [--skip-playtest|--visual-only] [--keep] [--json]",
  },
  look: {
    description: "List and apply curated portable look profiles to structured source projects.",
    implemented: true,
    usage: "tn look list [--json]\n              tn look apply <arcade-neon|forest-dawn|sunset-racer|toybox-pop|noir-metal> [--project <path>] [--json]",
  },
  overlay: {
    description: "Scaffold an optional React webview overlay.",
    handler: overlayCommand,
    implemented: true,
    subcommands: ["add"],
    usage: formatOverlayAddUsage(),
  },
  help: {
    description: "Show task-oriented help for scaffold, assets, camera, transform, visual QA, screenshot, and record workflows.",
    implemented: true,
    usage: "tn help [topic] [--json]",
  },
  generator: {
    description: "Record and run project-local generators for structured source outputs.",
    implemented: true,
    usage: "tn generator record <generator-id> --module <path> --export <name> --outputs <path,path> [--overwrite-policy skip|replace|manual] [--input-hash <hash>] [--output-hash <hash>] [--project <path>] [--json]\n              tn generator record-blender <generator-id> --recipe <path-or-json> [--out <path>] [--overwrite-policy manual|replace|skip] [--project <path>] [--json]\n              tn generator run <generator-id> [--project <path>] [--json]",
  },
  game: {
    description: "Plan, score, QA, and release-check source-backed game production evidence.",
    implemented: true,
    usage: "tn game plan --goal <text> [--project <path>] [--json] [--full-json] [--apply]\n              tn game next [--project <path>] [--json]\n              tn game improve --apply-plan <file> [--project <path>] [--json]\n              tn game providers [--project <path>] [--env-file <path>] [--json]\n              tn game score [--project <path>] [--json]\n              tn game scale [--project <path>] [--url <preview-url>] [--out <file>] [--json]\n              tn game qa [--project <path>] [--run-proof] [--url <preview-url>] [--entity <id>] [--press <KeyboardEvent.code>] [--expect-axis x|y|z] [--record] [--out <file>] [--json]\n              tn game release [--project <path>] [--out <file>] [--json]",
  },
  world: {
    description: "Generate and prove dressed biome world source documents.",
    implemented: true,
    usage: "tn world generate --biome <meadow|forest|desert|canyon|arctic> --seed <n> [--size <n>] [--flatten-radius <n>] [--project <path>] [--json]\n              tn world proof [--project <path>] [--json]",
  },
  "model-test": {
    adapters: { mcp: MODEL_TEST_MCP_DESCRIPTOR },
    description: "Inspect a GLB/glTF model with an interactive preview, screenshot, or bounded turntable capture.",
    implemented: true,
    usage: "tn model-test <asset-path> --view [--angle <degrees>] [--out <dir>] [--json]\n              tn model-test <asset-path> --screenshot [--angle <degrees>] [--url <preview-url>] [--screenshot-out <file.png>] [--out <dir>] [--json]\n              tn model-test <asset-path> --angles <degrees,...> [--out <dir>] [--json]",
  },
  doctor: {
    description: "Inspect project setup, scripts, source entrypoint, and bundle files with actionable diagnostics.",
    implemented: true,
    usage: "tn doctor [--project <path>] [--json]",
  },
  validate: {
    description: "Validate a game bundle or project.",
    implemented: true,
    usage: "tn validate [--project <path>] [--bundle <path>] [--json]",
  },
  build: {
    description: "Compile supported TypeScript source into game.bundle.",
    handler: buildCommand,
    implemented: true,
    usage: "tn build [--project <path>] [--json]",
  },
  bundle: {
    description: "Import recoverable generated bundle catalogs into structured source documents.",
    implemented: true,
    usage: "tn bundle import <bundle-dir> --project <path> --mode source [--dry-run] [--json]",
  },
  input: {
    description: "Create and mutate structured input source documents.",
    implemented: true,
    usage: "tn input add-action <input-doc-id> <action-id> --keys <key,key> [--project <path>] [--json]\n              tn input add-axis <input-doc-id> <axis-id> --negative-keys <bare-code|keyboard.<code>,...> --positive-keys <bare-code|keyboard.<code>,...> [--value <binding>] [--project <path>] [--json]\n              tn input set-controls <input-doc-id> --profile <profile-id> --rows <json-array> [--project <path>] [--json]\n              tn input set-override <input-doc-id> <action-or-axis-id> --profile <profile-id> --device <device> --control <control> [--axis-slot <slot>] [--json]",
  },
  material: {
    description: "Create and mutate structured material source documents.",
    implemented: true,
    usage: "tn material create <material-id> [--project <path>] [--json]\n              tn material set <material-id> [--color <css-color>] [--roughness <n>] [--metalness <n>] [--base-color-texture <asset-id>] [--normal-texture <asset-id>] [--emissive <css-color>] [--alpha-mode opaque|mask|blend] [--project <path>] [--json]",
  },
  mesh: {
    description: "Create structured primitive and custom mesh source documents.",
    implemented: true,
    usage: "tn mesh primitive <mesh-id> --kind <box|sphere|cylinder|cone|plane|torus> [--size n,n,...] [--file <path>] [--project <path>] [--json]\n              tn mesh custom <mesh-id> --attributes '<json-array>' [--indices '<json-array>'] [--storage binary] [--project <path>] [--json]",
  },
  "compare-images": {
    description: "Compare two PNG screenshots and report visual deltas.",
    implemented: true,
    usage: "tn compare-images <first.png> <second.png> [--json]",
  },
  dev: {
    description: "Run a runtime preview with optional rebuild watch mode.",
    implemented: true,
    usage: "tn dev --target <web|desktop> [--project <path>] [--watch] [--debug]",
  },
  editor: {
    description: "Launch the editor shell and inspect, edit, apply, and diff local editor snapshots from bundle JSON.",
    implemented: true,
    usage: "tn editor dev --project <path> [--port <n>] [--json]\n              tn editor open --project <path> [--bundle <path>] [--json]\n              tn editor snapshot --bundle <path> [--out <path>] [--json]\n              tn editor inspect --bundle <path> [--out <path>] [--json]\n              tn editor set --bundle <path> --path <json-pointer> --value <json> [--json]\n              tn editor apply --snapshot <path> --bundle <path> [--json]",
  },
  package: {
    description: "Plan and build registry-backed release artifacts.",
    implemented: true,
    subcommands: ["plan", "build", "verify", "inspect"],
    usage: packageCommandUsage(),
  },
  parity: {
    description: "Run paired runtime parity proof helpers.",
    handler: parityPlaytestCommand,
    implemented: true,
    subcommands: ["playtest"],
    usage: "tn parity playtest --project <path> --scenario <playtest.json> [--targets web,desktop] [--stable-artifacts] [--json]",
  },
  performance: {
    description: "Capture runtime performance metrics or unsupported native counter diagnostics and write a versioned proof sidecar.",
    implemented: true,
    usage: "tn performance proof [--project <path>] [--target web|desktop|native] [--url <preview-url>] [--frames <n>] [--target-profile <id>] [--out <file>] [--json]",
  },
  playtest: {
    description: "Run, scaffold, or inspect playtest scenarios and assertion DSL.",
    implemented: true,
    usage: "tn playtest --project <path> --entity <id> --press <KeyboardEvent.code> --frames <n> [--expect-moved] [--expect-axis x|y|z|+x|-x|+y|-y|+z|-z] [--follow <entityId>] [--debug] [--effects stdout] [--audit-writes] [--json]\n             tn playtest --project <path> --scenario playtests/<name>.playtest.json [--out <dir>] [--stable-artifacts] [--target web|desktop|bevy] [--headless] [--viewport 1280x720] [--audit-writes] [--json]\n             tn playtest report --project <path> --latest --scenario <name> --json\n             tn playtest report --project <path> --summary artifacts/playtest/<name>/latest/summary.json --json\n             tn playtest --project <path> --scenario playtests/<name>.playtest.json --watch [--max-runs <n>] [--fail-fast] [--pass-once] [--json]\n             tn playtest --project <path> --discover --json\n             tn playtest --project <path> --suggest-scenario smoke-movement --json\n             tn playtest schema --json\n             tn playtest scaffold --assert <movement|pickup|win-state|retry> [--project <path>] [--json]",
  },
  prove: {
    description: "Evaluate changed durable source/assets/bundles against proof manifests.",
    implemented: true,
    usage: "tn prove changed [--project <path>] [--previous <manifest>] [--write-manifest] [--run] [--json]",
  },
  proof: {
    description: "Inspect and compare proof manifest artifacts.",
    handler: proofCommand,
    implemented: true,
    subcommands: ["diff"],
    usage: "tn proof diff --from <manifest> --to <manifest> [--json]",
  },
  recipe: {
    description: "Apply composed registry-backed recipes for common game objects.",
    implemented: true,
    usage: "tn recipe [apply] <recipe-id> --scene <scene-id> [--entity <entity-id>|--player <player-id>|--vehicle <vehicle-id>] [--camera <camera-id>] [--module <path>] [--export <name>] [--dry-run] [--project <path>] [--json] [--full-json]",
  },
  particle: {
    description: "Add bounded particle emitter metadata to structured model asset source.",
    implemented: true,
    usage: "tn particle add-emitter <asset-id> <emitter-id> --rate <n> --max <n> --lifetime <seconds> [--shape point|sphere] [--radius <n>] [--project <path>] [--json]",
  },
  physics: {
    description: "Add typed physics components to structured scene source.",
    implemented: true,
    subcommands: ["add-collider", "add-rigid-body", "aerodynamics", "fracture", "vehicle", "wind"],
    usage: "tn physics add-rigid-body <scene-id> <entity-id> [--kind <dynamic|kinematic|static>] [--mass <n>] [--damping <n>] [--gravity-scale <n>] [--velocity x,y,z] [--angular-velocity x,y,z] [--enabled-translations x,y,z] [--ccd <true|false>] [--ccd-mode <linear|swept-aabb>] [--project <path>] [--json]\n              tn physics add-collider <scene-id> <entity-id> [--kind <box|sphere|capsule|cylinder|mesh>] [--size x,y,z] [--center x,y,z] [--radius <n>] [--height <n>] [--friction <n>] [--restitution <n>] [--layer <name>] [--mask <layer-a,layer-b>] [--trigger <true|false>] [--project <path>] [--json]\n              tn physics fracture <generate|inspect|validate> ... [--json]\n              tn physics <vehicle|aerodynamics|wind> <add|inspect|validate> ... [--json]",
  },
  nav: {
    description: "Add typed navigation/character-agent components to structured scene source.",
    implemented: true,
    usage: "tn nav add-agent <scene-id> <entity-id> [--move-x <axis>] [--move-z <axis>] [--speed <n>] [--slope-limit <n>] [--step-offset <n>] [--grounding <mode>] [--blocking <true|false>] [--project <path>] [--json]",
  },
  runtime: {
    description: "Create and mutate structured runtime config source documents.",
    implemented: true,
    usage: "tn runtime create <runtime-id> [--render-profile parity|balanced|cinematic|stylized] [--project <path>] [--json]\n              tn runtime set-window <runtime-id> [--width <n>] [--height <n>] [--title <title>] [--project <path>] [--json]\n              tn runtime set-rendering <runtime-id> [--antialias none|msaa2|msaa4|msaa8|fxaa|taa|smaa] [--render-profile parity|balanced|cinematic|stylized] [--bloom true|false] [--ambient-occlusion true|false] [--screen-space-reflections true|false] [--motion-blur true|false] [--screen-space-global-illumination true|false] [--render-path forward] [--project <path>] [--json]",
  },
  target: {
    description: "Create and mutate structured target profile source documents.",
    implemented: true,
    usage: "tn target set <target-profile-id> --targets web,desktop [--budgets '<json-object>'] [--performance '<json-object>'] [--project <path>] [--json]",
  },
  tool: {
    description: "Inspect, explicitly install, and remove optional authoring tools.",
    implemented: true,
    subcommands: ["status", "install", "remove"],
    usage: "tn tool status blender [--json]\n              tn tool install blender --accept-download [--json]\n              tn tool remove blender [--json]",
  },
  types: {
    description: "Generate project-specific TypeScript context and id-union types for scripts.",
    implemented: true,
    usage: "tn types generate [--project <path>] [--out <path>] [--json]",
  },
  resources: {
    description: "Create and mutate reusable resource source documents.",
    implemented: true,
    usage: "tn resources create <resources-doc-id> [--project <path>] [--json]\n              tn resources add <resources-doc-id> <resource-id> [--path <resource.path>] [--value <json>] [--project <path>] [--json]\n              tn resources set <resources-doc-id> <resource-id> [--path <resource.path>] [--value <json>] [--project <path>] [--json]",
  },
  schema: {
    description: "Create and mutate reusable component, event, and resource schema source documents.",
    implemented: true,
    usage: "tn schema create <schema-doc-id> --kind <component|event|resource> [--project <path>] [--json]\n              tn schema set <schema-doc-id> <schema-id> --kind <component|event|resource> --fields <json-object> [--project <path>] [--json]",
  },
  scene: {
    description: "Create, inspect, validate, mutate, and prove structured source scene documents.",
    implemented: true,
    usage: "tn scene create <scene-id> [--file <path>] [--json]\n              tn scene import-world <scene-id> --world <path/to/world.ir.json> [--file <path>] [--replace] [--json]\n              tn scene validate [scene-id] [--project <path>] [--json]\n              tn scene inspect <scene-id> [--node <id>] [--project <path>] [--json]\n              tn scene add-prefab <scene-id> <prefab-id> [--primitive <primitive>] [--color <css-color>] [--json]\n              tn scene set-prefab <scene-id> <prefab-id> [--primitive <primitive>] [--color <css-color>] [--asset <path.glb>] [--json]\n              tn scene set-prefab-color <scene-id> <prefab-id> --color <css-color> [--json]\n              tn scene add-resource <scene-id> <resource-id> [--path <resource.path>] [--value <json>] [--json]\n              tn scene set-resource <scene-id> <resource-id> [--path <resource.path>] [--value <json>] [--json]\n              tn scene add-ui-node <scene-id> <ui-node-id> [--json]\n              tn scene add-entity <scene-id> <entity-id> [--prefab <prefab-id>] [--json]\n              tn scene add-prefab-instance <scene-id> <instance-id> --prefab <prefab-id> [--position x,y,z] [--components <json-object>] [--replace] [--json]\n              tn scene add-prefab-instances <scene-id> --prefab <prefab-id> --positions \"x,y,z;...\" [--prefix <id-prefix>] [--components <json-object>] [--json]\n              tn scene remove-entity <scene-id> <entity-id> [--json]\n              tn scene remove-ui-node <scene-id> <ui-node-id> [--json]\n              tn scene remove-resource <scene-id> <resource-id> [--json]\n              tn scene layout ten-pin <scene-id> --prefab <prefab-id> [--prefix pin] [--origin x,y,z] [--spacing n] [--replace] [--json]\n              tn scene add-tag <scene-id> <entity-id> <tag> [--json]\n              tn scene add-group <scene-id> <group-id> [--name <label>] [--position x,y,z] [--json]\n              tn scene add-component <scene-id> <entity-id> light|mesh-renderer|render-layers|visibility|rigid-body|collider|character-controller [typed flags] [--json]\n              tn scene set-component <scene-id> <entity-id> <component-kind> --value <json-object> [--json]\n              tn scene remove-component <scene-id> <entity-id> <component-kind> [--json]\n              tn scene set-transform <scene-id> <entity-id> [--position x,y,z] [--rotation x,y,z|--rotation-deg x,y,z] [--scale x,y,z] [--json]\n              tn scene set-camera <scene-id> <camera-id> --mode <mode> --target <entity-id> [--json]\n              tn scene attach-script <scene-id> <system-id> --module <path> --export <name> [--json]\n              tn scene bind-ui <scene-id> <ui-node-id> --resource <resource.path> [--json]\n              tn scene proof <scene-id> --project <path> --web-url <url> --out <dir> [--native] [--json]",
  },
  sequence: {
    description: "Create and mutate declarative sequence source documents.",
    implemented: true,
    usage: "tn sequence create <sequence-id> --duration <seconds> [--skippable true|false] [--project <path>] [--json]\n              tn sequence add-track <sequence-id> <track-id> --kind <cameraPose|transform|event|ui|audio|timeScale> [--entity <entity-id>] [--project <path>] [--json]\n              tn sequence add-key <sequence-id> <track-id> --time <seconds> [--value <json>] [--easing linear|step] [--project <path>] [--json]",
  },
  prefab: {
    description: "Create and mutate structured prefab source documents.",
    implemented: true,
    usage: "tn prefab create <prefab-id> [--project <path>] [--json]\n              tn prefab add-component <prefab-id> <component> --value <json-object> [--project <path>] [--json]\n              tn prefab set-defaults <prefab-id> <component> --value <json-object> [--project <path>] [--json]\n              tn prefab set-material <prefab-id> --material <material-id> [--project <path>] [--json]",
  },
  project: {
    description: "Create and mutate structured project metadata source documents.",
    implemented: true,
    usage: "tn project init-source <project-id> [--source-roots content,src] [--build-targets web,desktop] [--authoring-version <version>] [--file <path>] [--project <path>] [--json]",
  },
  system: {
    description: "Create and mutate structured system source documents.",
    implemented: true,
    usage: "tn system create <system-id> --schedule <schedule> [--project <path>] [--json]\n              tn system attach-script <system-id> --module <path> --export <name> [--project <path>] [--json]\n              tn system set-metadata <system-id> [--schedule update|fixedUpdate|startup|postUpdate] [--reads A,B] [--writes A,B] [--queries <json-array>] [--commands <json-array>] [--services service.name] [--project <path>] [--json]",
  },
  ui: {
    description: "Create and mutate structured retained UI source documents.",
    implemented: true,
    usage: "tn ui create <ui-doc-id> [--project <path>] [--json]\n              tn ui add-text <ui-doc-id> <node-id> --text <text> [--project <path>] [--json]\n              tn ui set-layout <ui-doc-id> <node-id> [--justify <value>] [--align <value>] [--top <n>] [--height <n>] [--width <n>] [--project <path>] [--json]\n              tn ui bind <ui-doc-id> <node-id> --resource <resource.path> [--project <path>] [--json]",
  },
  screenshot: {
    description: "Capture a PNG proof frame from a web preview URL.",
    implemented: true,
    usage: "tn screenshot [--project <path>] --url <preview-url> --out <file.png> [--wait-ready] [--viewport desktop|mobile|<width>x<height>] [--json]",
  },
  record: {
    description: "Record a short WebM/MP4 proof clip from a web preview URL.",
    implemented: true,
    usage: "tn record [--project <path>] --url <preview-url> --out <file.webm|file.mp4> [--duration <seconds>|--seconds <seconds>] [--input-script <path|default|none>] [--json]",
  },
  verify: {
    description: "Run visual self-verification for the web preview.",
    implemented: true,
    usage: "tn verify [--project <path>] [--url <preview-url>] [--frames <count>] [--expect-motion] [--json]",
  },
});

export const CLI_COMMAND_DEFINITIONS: Record<string, ICommandDefinition> = CLI_COMMAND_REGISTRY;
export const UNMIGRATED_COMMAND_FAMILIES = unmigratedCommandNames(CLI_COMMAND_REGISTRY);

const commands = CLI_COMMAND_REGISTRY;

const helpFlags = new Set(["--help", "-h"]);

export function renderHelp(): string {
  return renderCommandHelp(commands);
}

export async function dispatch(argv: readonly string[]): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [commandName] = normalizedArgv;

  if (commandName === undefined || helpFlags.has(commandName)) {
    return {
      exitCode: 0,
      stdout: renderHelp(),
    };
  }

  const command = findCommand(commands, commandName);

  if (command === undefined) {
    return {
      exitCode: 1,
      stderr: `Unknown command '${commandName}'. Run 'tn --help' for available commands or 'tn help' for task help.\n`,
      stdout: "",
    };
  }

  const commandArgv = normalizedArgv.slice(1);
  if (command.handler !== undefined) {
    return command.handler(commandArgv);
  }

  return legacyDispatch(commandName, commandArgv, command, normalizedArgv);
}

async function legacyDispatch(commandName: string, commandArgv: readonly string[], command: ICommandDefinition, normalizedArgv: readonly string[]): Promise<ICommandResult> {
  if (commandName === "create") {
    return createProject(commandArgv);
  }

  if (commandName === "tool") {
    return toolCommand(commandArgv);
  }

  if (commandName === "asset") {
    return assetCommand(commandArgv);
  }
  if (commandName === "add") {
    return addCommand(commandArgv);
  }
  if (commandName === "remove") {
    return removeCommand(commandArgv);
  }

  if (commandName === "audio") {
    return audioCommand(commandArgv);
  }

  if (commandName === "animation") {
    return animationCommand(commandArgv);
  }

  if (commandName === "environment") {
    return environmentCommand(commandArgv);
  }

  if (commandName === "flow") {
    return flowCommand(commandArgv);
  }

  if (commandName === "authoring") {
    return authoringCommand(commandArgv);
  }

  if (commandName === "init") {
    return initProject(commandArgv);
  }

  if (commandName === "iterate") {
    return iterateCommand(commandArgv);
  }

  if (commandName === "look") {
    return lookCommand(commandArgv);
  }

  if (commandName === "help") {
    return helpCommand(commandArgv);
  }

  if (commandName === "generator") {
    return generatorCommand(commandArgv);
  }

  if (commandName === "game") {
    return gameCommand(commandArgv);
  }

  if (commandName === "world") {
    return worldCommand(commandArgv);
  }

  if (commandName === "model-test") {
    return modelTestCommand(commandArgv);
  }

  if (commandName === "doctor") {
    return doctorCommand(commandArgv);
  }

  if (commandName === "validate") {
    return validateProject(commandArgv);
  }

  if (commandName === "bundle") {
    return bundleCommand(commandArgv);
  }

  if (commandName === "cookbook") {
    return cookbookCommand(commandArgv);
  }

  if (commandName === "input") {
    return inputCommand(commandArgv);
  }

  if (commandName === "material") {
    return materialCommand(commandArgv);
  }

  if (commandName === "mesh") {
    return meshCommand(commandArgv);
  }

  if (commandName === "compare-images") {
    return compareImagesCommand(commandArgv);
  }

  if (commandName === "dev") {
    return devCommand(commandArgv);
  }

  if (commandName === "editor") {
    return editorCommand(commandArgv);
  }

  if (commandName === "package") {
    return packageCommand(commandArgv);
  }

  if (commandName === "performance") {
    return performanceProofCommand(commandArgv);
  }

  if (commandName === "playtest") {
    return playtestCommand(commandArgv);
  }

  if (commandName === "prove") {
    return proveCommand(commandArgv);
  }

  if (commandName === "recipe") {
    return recipeCommand(commandArgv);
  }

  if (commandName === "particle") {
    return particleCommand(commandArgv);
  }

  if (commandName === "physics") {
    return physicsCommand(commandArgv);
  }

  if (commandName === "nav") {
    return navCommand(commandArgv);
  }

  if (commandName === "scene") {
    return sceneCommand(commandArgv);
  }

  if (commandName === "sequence") {
    return sequenceCommand(commandArgv);
  }

  if (commandName === "prefab") {
    return prefabCommand(commandArgv);
  }

  if (commandName === "project") {
    return projectCommand(commandArgv);
  }

  if (commandName === "runtime") {
    return runtimeCommand(commandArgv);
  }

  if (commandName === "resources") {
    return resourcesCommand(commandArgv);
  }

  if (commandName === "schema") {
    return schemaCommand(commandArgv);
  }

  if (commandName === "system") {
    return systemCommand(commandArgv);
  }

  if (commandName === "target") {
    return targetCommand(commandArgv);
  }

  if (commandName === "types") {
    return typesCommand(commandArgv);
  }

  if (commandName === "ui") {
    return uiCommand(commandArgv);
  }

  if (commandName === "screenshot") {
    return screenshotCommand(commandArgv);
  }

  if (commandName === "record") {
    return recordCommand(commandArgv);
  }

  if (commandName === "verify") {
    return verifyCommand(commandArgv);
  }

  const json = normalizedArgv.includes("--json");
  const payload = {
    code: "TN_COMMAND_NOT_IMPLEMENTED",
    command: commandName,
    implemented: command.implemented,
    message: `Command '${commandName}' is registered but is not implemented yet.`,
    usage: command.usage,
  };

  return {
    exitCode: 2,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\nUsage: ${command.usage}\n`,
  };
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const result = await dispatch(argv);

  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr !== undefined && result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }

  process.exitCode = result.exitCode;
}

if (isEntrypoint(process.argv[1], fileURLToPath(import.meta.url))) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}

function isEntrypoint(argvPath: string | undefined, modulePath: string): boolean {
  if (argvPath === undefined) {
    return false;
  }

  try {
    return realpathSync(argvPath) === realpathSync(modulePath);
  } catch {
    return argvPath === modulePath;
  }
}
