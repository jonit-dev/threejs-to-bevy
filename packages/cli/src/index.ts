#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { assetCommand } from "./commands/asset.js";
import { authoringCommand } from "./commands/authoring.js";
import { buildCommand } from "./commands/build.js";
import { bundleCommand } from "./commands/bundle.js";
import { compareImagesCommand } from "./commands/compareImages.js";
import { createProject, initProject } from "./commands/create.js";
import { devCommand } from "./commands/dev.js";
import { doctorCommand } from "./commands/doctor.js";
import { editorCommand } from "./commands/editor.js";
import { helpCommand } from "./commands/help.js";
import { modelTestCommand } from "./commands/modelTest.js";
import { packageCommand } from "./commands/package.js";
import { navCommand, physicsCommand } from "./commands/physicsNav.js";
import { sceneCommand } from "./commands/scene.js";
import { animationCommand, audioCommand, environmentCommand, generatorCommand, inputCommand, materialCommand, meshCommand, particleCommand, prefabCommand, projectCommand, resourcesCommand, runtimeCommand, schemaCommand, systemCommand, targetCommand, uiCommand } from "./commands/sourceDocuments.js";
import { validateProject } from "./commands/validate.js";
import { recordCommand, screenshotCommand } from "./commands/visualProof.js";
import { verifyCommand } from "./commands/verify.js";
import { type ICommandResult } from "./diagnostics.js";

interface ICommandDefinition {
  description: string;
  implemented: boolean;
  usage: string;
}

const commands: Record<string, ICommandDefinition> = {
  asset: {
    description: "Inspect GLB/glTF assets and mutate structured asset source documents.",
    implemented: true,
    usage: "tn asset inspect <path> [--json]\n              tn asset add <asset-id> --type <model|texture|audio|mesh> --path <source-path> [--project <path>] [--json]\n              tn asset add <asset-id> --type render-target --width <n> --height <n> [--usage color|depth] [--format rgba8|rgba16f|depth24plus] [--sample-count <n>] [--project <path>] [--json]",
  },
  audio: {
    description: "Create and mutate structured audio source documents.",
    implemented: true,
    usage: "tn audio create <audio-doc-id> [--project <path>] [--json]\n              tn audio add-sound <audio-doc-id> <sound-id> --asset <asset-id-or-path> [--project <path>] [--json]",
  },
  animation: {
    description: "Add model animation clip and graph metadata to structured asset source.",
    implemented: true,
    usage: "tn animation add-clip <asset-id> <clip-id> [--source-clip <name>] [--loop true|false] [--speed <n>] [--project <path>] [--json]\n              tn animation graph add-state <asset-id> <state-id> --clip <clip-id> [--initial] [--project <path>] [--json]",
  },
  environment: {
    description: "Create and mutate structured environment source documents.",
    implemented: true,
    usage: "tn environment create <environment-id> [--project <path>] [--json]\n              tn environment set-skybox <environment-id> --asset <asset-id-or-path> [--mode equirect|cube|color] [--project <path>] [--json]\n              tn environment set-map <environment-id> --asset <asset-id-or-path> [--project <path>] [--json]\n              tn environment set-terrain <environment-id> [--id <terrain-id>] [--height-mode flat|heightmap] [--heightmap <asset-id-or-path>] [--project <path>] [--json]\n              tn environment set-path <environment-id> --path '<json>' [--project <path>] [--json]\n              tn environment set-walkability <environment-id> --walkability '<json>' [--project <path>] [--json]\n              tn environment set-source-asset-lod <environment-id> <source-asset-id> --lod '<json>' [--project <path>] [--json]",
  },
  authoring: {
    description: "Inspect and validate structured authoring source documents.",
    implemented: true,
    usage: "tn authoring inspect [--project <path>] [--json]\n              tn authoring validate [--project <path>] [--json]",
  },
  create: {
    description: "Scaffold a ThreeNative project from a maintained template.",
    implemented: true,
    usage: "tn create <name> [--template <template>] [--json]",
  },
  init: {
    description: "Alias for create with first-project next steps.",
    implemented: true,
    usage: "tn init <name> [--template <template>] [--json]",
  },
  help: {
    description: "Show task-oriented help for scaffold, assets, camera, transform, visual QA, screenshot, and record workflows.",
    implemented: true,
    usage: "tn help [topic] [--json]",
  },
  generator: {
    description: "Record one-way generator provenance for structured source outputs.",
    implemented: true,
    usage: "tn generator record <generator-id> --module <path> --export <name> --outputs <path,path> [--overwrite-policy skip|replace|manual] [--input-hash <hash>] [--output-hash <hash>] [--project <path>] [--json]",
  },
  "model-test": {
    description: "Generate a one-model proof project with scale, bounds, ruler, and camera hints.",
    implemented: true,
    usage: "tn model-test <asset-path> [--out <dir>] [--verify] [--screenshot] [--url <preview-url>] [--json]",
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
    usage: "tn input add-action <input-doc-id> <action-id> --keys <key,key> [--project <path>] [--json]\n              tn input add-axis <input-doc-id> <axis-id> --negative-keys <key,key> --positive-keys <key,key> [--value <binding>] [--project <path>] [--json]",
  },
  material: {
    description: "Create and mutate structured material source documents.",
    implemented: true,
    usage: "tn material create <material-id> [--project <path>] [--json]\n              tn material set <material-id> [--color <css-color>] [--roughness <n>] [--metalness <n>] [--base-color-texture <asset-id>] [--normal-texture <asset-id>] [--emissive <css-color>] [--alpha-mode opaque|mask|blend] [--project <path>] [--json]",
  },
  mesh: {
    description: "Create structured primitive and custom mesh source documents.",
    implemented: true,
    usage: "tn mesh primitive <mesh-id> --kind <box|sphere|cylinder|cone|plane> [--project <path>] [--json]\n              tn mesh custom <mesh-id> --attributes '<json-array>' [--indices '<json-array>'] [--storage binary] [--project <path>] [--json]",
  },
  "compare-images": {
    description: "Compare two PNG screenshots and report visual deltas.",
    implemented: true,
    usage: "tn compare-images <first.png> <second.png> [--json]",
  },
  dev: {
    description: "Run a runtime preview with optional rebuild watch mode.",
    implemented: true,
    usage: "tn dev --target <web|desktop> [--project <path>] [--watch]",
  },
  editor: {
    description: "Launch the editor shell and inspect, edit, apply, and diff local editor snapshots from bundle JSON.",
    implemented: true,
    usage: "tn editor dev --project <path> [--port <n>] [--json]\n              tn editor open --project <path> [--bundle <path>] [--json]\n              tn editor snapshot --bundle <path> [--out <path>] [--json]\n              tn editor inspect --bundle <path> [--out <path>] [--json]\n              tn editor set --bundle <path> --path <json-pointer> --value <json> [--json]\n              tn editor apply --snapshot <path> --bundle <path> [--json]",
  },
  package: {
    description: "Create a local desktop package artifact from a bundle.",
    implemented: true,
    usage: "tn package --target desktop --bundle <path> [--runtime bevy|webview] [--format portable|archive|installer] [--out <path>] [--json]",
  },
  particle: {
    description: "Add bounded particle emitter metadata to structured model asset source.",
    implemented: true,
    usage: "tn particle add-emitter <asset-id> <emitter-id> --rate <n> --max <n> --lifetime <seconds> [--shape point|sphere] [--radius <n>] [--project <path>] [--json]",
  },
  physics: {
    description: "Add typed physics components to structured scene source.",
    implemented: true,
    usage: "tn physics add-rigid-body <scene-id> <entity-id> [--kind <dynamic|kinematic|static>] [--mass <n>] [--damping <n>] [--gravity-scale <n>] [--project <path>] [--json]\n              tn physics add-collider <scene-id> <entity-id> [--kind <box|sphere|capsule|cylinder|mesh>] [--size x,y,z] [--radius <n>] [--height <n>] [--trigger <true|false>] [--project <path>] [--json]",
  },
  nav: {
    description: "Add typed navigation/character-agent components to structured scene source.",
    implemented: true,
    usage: "tn nav add-agent <scene-id> <entity-id> [--move-x <axis>] [--move-z <axis>] [--speed <n>] [--slope-limit <n>] [--step-offset <n>] [--grounding <mode>] [--blocking <true|false>] [--project <path>] [--json]",
  },
  runtime: {
    description: "Create and mutate structured runtime config source documents.",
    implemented: true,
    usage: "tn runtime create <runtime-id> [--project <path>] [--json]\n              tn runtime set-window <runtime-id> [--width <n>] [--height <n>] [--title <title>] [--project <path>] [--json]\n              tn runtime set-rendering <runtime-id> [--antialias none|msaa2|msaa4|msaa8|fxaa|taa|smaa] [--bloom true|false] [--bloom-intensity <n>] [--bloom-threshold <n>] [--render-path forward] [--project <path>] [--json]",
  },
  target: {
    description: "Create and mutate structured target profile source documents.",
    implemented: true,
    usage: "tn target set <target-profile-id> --targets web,desktop [--budgets '<json-object>'] [--performance '<json-object>'] [--project <path>] [--json]",
  },
  resources: {
    description: "Create and mutate reusable resource source documents.",
    implemented: true,
    usage: "tn resources create <resources-doc-id> [--project <path>] [--json]\n              tn resources add <resources-doc-id> <resource-id> [--path <resource.path>] [--value <json>] [--project <path>] [--json]\n              tn resources set <resources-doc-id> <resource-id> [--path <resource.path>] [--value <json>] [--project <path>] [--json]",
  },
  schema: {
    description: "Create and mutate reusable component and resource schema source documents.",
    implemented: true,
    usage: "tn schema create <schema-doc-id> --kind <component|resource> [--project <path>] [--json]\n              tn schema set <schema-doc-id> <schema-id> --kind <component|resource> --fields <json-object> [--project <path>] [--json]",
  },
  scene: {
    description: "Create, inspect, validate, mutate, and prove structured source scene documents.",
    implemented: true,
    usage: "tn scene create <scene-id> [--file <path>] [--json]\n              tn scene import-world <scene-id> --world <path/to/world.ir.json> [--file <path>] [--replace] [--json]\n              tn scene validate [scene-id] [--project <path>] [--json]\n              tn scene inspect <scene-id> [--project <path>] [--json]\n              tn scene add-prefab <scene-id> <prefab-id> [--primitive <primitive>] [--color <css-color>] [--json]\n              tn scene set-prefab <scene-id> <prefab-id> [--primitive <primitive>] [--color <css-color>] [--asset <path.glb>] [--json]\n              tn scene set-prefab-color <scene-id> <prefab-id> --color <css-color> [--json]\n              tn scene add-resource <scene-id> <resource-id> [--path <resource.path>] [--value <json>] [--json]\n              tn scene set-resource <scene-id> <resource-id> [--path <resource.path>] [--value <json>] [--json]\n              tn scene add-ui-node <scene-id> <ui-node-id> [--json]\n              tn scene add-entity <scene-id> <entity-id> [--prefab <prefab-id>] [--json]\n              tn scene add-tag <scene-id> <entity-id> <tag> [--json]\n              tn scene add-group <scene-id> <group-id> [--name <label>] [--position x,y,z] [--json]\n              tn scene add-component <scene-id> <entity-id> light|mesh-renderer|render-layers|visibility|rigid-body|collider|character-controller [typed flags] [--json]\n              tn scene set-component <scene-id> <entity-id> <component-kind> --value <json-object> [--json]\n              tn scene remove-component <scene-id> <entity-id> <component-kind> [--json]\n              tn scene set-transform <scene-id> <entity-id> [--position x,y,z] [--rotation x,y,z] [--scale x,y,z] [--json]\n              tn scene set-camera <scene-id> <camera-id> --mode <mode> --target <entity-id> [--json]\n              tn scene attach-script <scene-id> <system-id> --module <path> --export <name> [--json]\n              tn scene bind-ui <scene-id> <ui-node-id> --resource <resource.path> [--json]\n              tn scene proof <scene-id> --project <path> --web-url <url> --out <dir> [--native] [--json]",
  },
  prefab: {
    description: "Create and mutate structured prefab source documents.",
    implemented: true,
    usage: "tn prefab create <prefab-id> [--project <path>] [--json]\n              tn prefab add-component <prefab-id> <component> --value <json-object> [--project <path>] [--json]",
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
    usage: "tn screenshot [--project <path>] --url <preview-url> --out <file.png> [--wait-ready] [--json]",
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
};

const helpFlags = new Set(["--help", "-h"]);

export function renderHelp(): string {
  const commandRows = Object.entries(commands)
    .map(([name, command]) => `  ${name.padEnd(10)} ${command.description}\n              ${command.usage}`)
    .join("\n");

  return `ThreeNative CLI

Usage:
  tn <command> [options]

Commands:
${commandRows}

Global options:
  --help, -h    Print this help.
  --json        Print machine-readable diagnostics where supported.
`;
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

  const command = commands[commandName];

  if (command === undefined) {
    return {
      exitCode: 1,
      stderr: `Unknown command '${commandName}'. Run 'tn --help' for available commands or 'tn help' for task help.\n`,
      stdout: "",
    };
  }

  if (commandName === "create") {
    return createProject(normalizedArgv.slice(1));
  }

  if (commandName === "asset") {
    return assetCommand(normalizedArgv.slice(1));
  }

  if (commandName === "audio") {
    return audioCommand(normalizedArgv.slice(1));
  }

  if (commandName === "animation") {
    return animationCommand(normalizedArgv.slice(1));
  }

  if (commandName === "environment") {
    return environmentCommand(normalizedArgv.slice(1));
  }

  if (commandName === "authoring") {
    return authoringCommand(normalizedArgv.slice(1));
  }

  if (commandName === "init") {
    return initProject(normalizedArgv.slice(1));
  }

  if (commandName === "help") {
    return helpCommand(normalizedArgv.slice(1));
  }

  if (commandName === "generator") {
    return generatorCommand(normalizedArgv.slice(1));
  }

  if (commandName === "model-test") {
    return modelTestCommand(normalizedArgv.slice(1));
  }

  if (commandName === "doctor") {
    return doctorCommand(normalizedArgv.slice(1));
  }

  if (commandName === "validate") {
    return validateProject(normalizedArgv.slice(1));
  }

  if (commandName === "build") {
    return buildCommand(normalizedArgv.slice(1));
  }

  if (commandName === "bundle") {
    return bundleCommand(normalizedArgv.slice(1));
  }

  if (commandName === "input") {
    return inputCommand(normalizedArgv.slice(1));
  }

  if (commandName === "material") {
    return materialCommand(normalizedArgv.slice(1));
  }

  if (commandName === "mesh") {
    return meshCommand(normalizedArgv.slice(1));
  }

  if (commandName === "compare-images") {
    return compareImagesCommand(normalizedArgv.slice(1));
  }

  if (commandName === "dev") {
    return devCommand(normalizedArgv.slice(1));
  }

  if (commandName === "editor") {
    return editorCommand(normalizedArgv.slice(1));
  }

  if (commandName === "package") {
    return packageCommand(normalizedArgv.slice(1));
  }

  if (commandName === "particle") {
    return particleCommand(normalizedArgv.slice(1));
  }

  if (commandName === "physics") {
    return physicsCommand(normalizedArgv.slice(1));
  }

  if (commandName === "nav") {
    return navCommand(normalizedArgv.slice(1));
  }

  if (commandName === "scene") {
    return sceneCommand(normalizedArgv.slice(1));
  }

  if (commandName === "prefab") {
    return prefabCommand(normalizedArgv.slice(1));
  }

  if (commandName === "project") {
    return projectCommand(normalizedArgv.slice(1));
  }

  if (commandName === "runtime") {
    return runtimeCommand(normalizedArgv.slice(1));
  }

  if (commandName === "resources") {
    return resourcesCommand(normalizedArgv.slice(1));
  }

  if (commandName === "schema") {
    return schemaCommand(normalizedArgv.slice(1));
  }

  if (commandName === "system") {
    return systemCommand(normalizedArgv.slice(1));
  }

  if (commandName === "target") {
    return targetCommand(normalizedArgv.slice(1));
  }

  if (commandName === "ui") {
    return uiCommand(normalizedArgv.slice(1));
  }

  if (commandName === "screenshot") {
    return screenshotCommand(normalizedArgv.slice(1));
  }

  if (commandName === "record") {
    return recordCommand(normalizedArgv.slice(1));
  }

  if (commandName === "verify") {
    return verifyCommand(normalizedArgv.slice(1));
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
