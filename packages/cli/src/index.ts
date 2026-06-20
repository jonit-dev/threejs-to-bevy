#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildCommand } from "./commands/build.js";
import { compareImagesCommand } from "./commands/compareImages.js";
import { createProject } from "./commands/create.js";
import { devCommand } from "./commands/dev.js";
import { editorCommand } from "./commands/editor.js";
import { packageCommand } from "./commands/package.js";
import { validateProject } from "./commands/validate.js";
import { verifyCommand } from "./commands/verify.js";
import { type ICommandResult } from "./diagnostics.js";

interface ICommandDefinition {
  description: string;
  implemented: boolean;
  usage: string;
}

const commands: Record<string, ICommandDefinition> = {
  create: {
    description: "Scaffold a V1 starter project.",
    implemented: true,
    usage: "tn create <name>",
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
    description: "Create, inspect, edit, apply, and diff local editor snapshots from bundle JSON.",
    implemented: true,
    usage: "tn editor snapshot --bundle <path> [--out <path>] [--json]\n              tn editor inspect --bundle <path> [--out <path>] [--json]\n              tn editor set --bundle <path> --path <json-pointer> --value <json> [--json]\n              tn editor apply --snapshot <path> --bundle <path> [--json]",
  },
  package: {
    description: "Create a local desktop package artifact from a bundle.",
    implemented: true,
    usage: "tn package --target desktop --bundle <path> [--format portable|archive|installer] [--out <path>] [--json]",
  },
  verify: {
    description: "Run visual self-verification for the web preview.",
    implemented: true,
    usage: "tn verify [--project <path>] [--url <preview-url>] [--frames <count>] [--expect-motion] [--json]",
  },
};

const helpFlags = new Set(["--help", "-h", "help"]);

export function renderHelp(): string {
  const commandRows = Object.entries(commands)
    .map(([name, command]) => `  ${name.padEnd(10)} ${command.description}\n              ${command.usage}`)
    .join("\n");

  return `ThreeNative CLI

Usage:
  tn <command> [options]

V1 commands:
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
      stderr: `Unknown command '${commandName}'. Run 'tn --help' for available V1 commands.\n`,
      stdout: "",
    };
  }

  if (commandName === "create") {
    return createProject(normalizedArgv.slice(1));
  }

  if (commandName === "validate") {
    return validateProject(normalizedArgv.slice(1));
  }

  if (commandName === "build") {
    return buildCommand(normalizedArgv.slice(1));
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

  if (commandName === "verify") {
    return verifyCommand(normalizedArgv.slice(1));
  }

  const json = normalizedArgv.includes("--json");
  const payload = {
    code: "TN_COMMAND_NOT_IMPLEMENTED",
    command: commandName,
    implemented: command.implemented,
    message: `Command '${commandName}' is registered for V1 but is not implemented yet.`,
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
