import type { ICommandResult } from "../diagnostics.js";
import type { AssetGenerationProviderId, IAssetGenerationMcpPathRole } from "../assetGenerationProviders/registry.js";

export type CommandHandler = (argv: readonly string[]) => Promise<ICommandResult>;
export type CommandMcpToolName = "asset.creation_strategy" | `asset.generate_${AssetGenerationProviderId}` | "asset.hyper3d_generate" | "asset.hyper3d_import" | "asset.hyper3d_poll" | "asset.hyper3d_status" | "asset.hunyuan_status" | "asset.inspect" | "asset.model_test" | "asset.polyhaven_categories" | "asset.polyhaven_import" | "asset.polyhaven_search" | "asset.polyhaven_status" | "asset.sketchfab_import" | "asset.sketchfab_preview" | "asset.sketchfab_search" | "asset.sketchfab_status" | "cookbook_lookup";

export interface ICommandMcpArgvArgumentDefinition {
  boolean?: boolean;
  encoding?: "json";
  flag?: string;
  name: string;
  positional?: boolean;
  resolveProjectPath?: boolean;
}

export interface ICommandMcpArgvDefinition {
  arguments: readonly ICommandMcpArgvArgumentDefinition[];
  fixed?: readonly string[];
  prefix: readonly string[];
  projectScoped?: boolean;
  projectOutput?: { flag: string; path: string };
}

export interface ICommandMcpAdapterDefinition {
  argv?: ICommandMcpArgvDefinition;
  description: string;
  inputSchema?: Record<string, unknown>;
  name: CommandMcpToolName;
  pathRoles?: readonly IAssetGenerationMcpPathRole[];
}

export interface ICommandDefinition {
  adapters?: {
    mcp?: ICommandMcpAdapterDefinition | readonly ICommandMcpAdapterDefinition[];
  };
  description: string;
  handler?: CommandHandler;
  implemented: boolean;
  name: string;
  output?: {
    summary?: boolean;
  };
  subcommands?: readonly string[];
  usage: string;
}

type CommandDefinitionInput = Omit<ICommandDefinition, "name">;

export function defineCommandRegistry<T extends Record<string, CommandDefinitionInput>>(definitions: T): Record<keyof T & string, ICommandDefinition> {
  for (const [name, definition] of Object.entries(definitions)) {
    if (definition.output?.summary === true && !definition.usage.includes("--json")) {
      throw new Error(`CLI command '${name}' cannot advertise --summary without a JSON output contract.`);
    }
  }
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
    .map((command) => `  ${command.name.padEnd(10)} ${command.description}\n              ${command.usage}${command.output?.summary === true ? "\n              Supports: --summary" : ""}`)
    .join("\n");
  const summaryOption = commandEntries(commands).some((command) => command.output?.summary === true)
    ? "\n  --summary     Print a bounded JSON result for commands that declare summary support."
    : "";

  return `ThreeNative CLI

Usage:
  tn <command> [options]

Commands:
${commandRows}

Global options:
  --help, -h    Print this help.
  --json        Print machine-readable diagnostics where supported.${summaryOption}
`;
}
