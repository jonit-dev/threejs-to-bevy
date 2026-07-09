import type { ICommandResult } from "../diagnostics.js";

export type CommandHandler = (argv: readonly string[]) => Promise<ICommandResult>;

export interface ICommandDefinition {
  description: string;
  handler?: CommandHandler;
  implemented: boolean;
  name: string;
  subcommands?: readonly string[];
  usage: string;
}

type CommandDefinitionInput = Omit<ICommandDefinition, "name">;

export function defineCommandRegistry<T extends Record<string, CommandDefinitionInput>>(definitions: T): Record<keyof T & string, ICommandDefinition> {
  return Object.fromEntries(Object.entries(definitions).map(([name, definition]) => [name, { ...definition, name }])) as Record<keyof T & string, ICommandDefinition>;
}

export function commandEntries(commands: Record<string, ICommandDefinition>): ICommandDefinition[] {
  return Object.values(commands);
}

export function findCommand(commands: Record<string, ICommandDefinition>, name: string): ICommandDefinition | undefined {
  return commands[name];
}

export function migratedCommandNames(commands: Record<string, ICommandDefinition>): string[] {
  return commandEntries(commands).filter((command) => command.handler !== undefined).map((command) => command.name).sort();
}

export function unmigratedCommandNames(commands: Record<string, ICommandDefinition>): string[] {
  return commandEntries(commands).filter((command) => command.handler === undefined).map((command) => command.name).sort();
}

export function renderCommandHelp(commands: Record<string, ICommandDefinition>): string {
  const commandRows = commandEntries(commands)
    .map((command) => `  ${command.name.padEnd(10)} ${command.description}\n              ${command.usage}`)
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
