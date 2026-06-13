#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import { buildCommand } from "./commands/build.js";
import { createProject } from "./commands/create.js";
import { validateProject } from "./commands/validate.js";
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
  dev: {
    description: "Run a V1 runtime preview.",
    implemented: false,
    usage: "tn dev --target <web|desktop> [--project <path>]",
  },
  verify: {
    description: "Run visual self-verification for the web preview.",
    implemented: false,
    usage: "tn verify [--project <path>] [--json]",
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

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
