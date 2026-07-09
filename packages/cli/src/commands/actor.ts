import { applyActorArchetype, listActorArchetypes, updateActorArchetype } from "@threenative/authoring";

import { type ICommandResult } from "../diagnostics.js";
import {
  normalizeArgv,
  parseOptionalNumber,
  readFlag,
  readPositional,
  renderAuthoringResult,
  renderUsage,
  resolveProjectPath,
  type ISourceCommandOptions,
} from "./sourceCommandUtils.js";

export async function actorCommand(argv: readonly string[], options: ISourceCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = normalizeArgv(argv);
  const [subcommand] = normalizedArgv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv, options.cwd);

  if (subcommand === "list") {
    const payload = {
      archetypes: listActorArchetypes(),
      code: "TN_ACTOR_ARCHETYPES",
      message: "Available actor archetypes listed.",
    };
    return {
      exitCode: 0,
      stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.archetypes.map((entry) => entry.id).join("\n")}\n`,
    };
  }

  if (subcommand === "add") {
    const archetype = readPositional(normalizedArgv, 1);
    const actorId = readFlag(normalizedArgv, "--id");
    const speed = parseOptionalNumber(normalizedArgv, "--speed");
    const sprintSpeed = parseOptionalNumber(normalizedArgv, "--sprint-speed");
    if (speed.diagnostic !== undefined || sprintSpeed.diagnostic !== undefined) {
      return renderUsage(json, "TN_ACTOR_NUMBER_INVALID", "Actor speed flags must be finite numbers.");
    }
    if (archetype === undefined || actorId === undefined) {
      return renderUsage(json, "TN_ACTOR_ADD_ARGS_MISSING", "Usage: tn actor add character --id <actor-id> [--asset <asset-id-or-path>] [--scene <scene-id>] [--speed <n>] [--sprint-speed <n>] [--project <path>] [--json]");
    }
    return renderAuthoringResult(
      "actor",
      await applyActorArchetype({
        actorId,
        archetype,
        asset: readFlag(normalizedArgv, "--asset"),
        projectPath,
        sceneId: readFlag(normalizedArgv, "--scene"),
        speed: speed.value,
        sprintSpeed: sprintSpeed.value,
      }),
      json,
      `Actor '${actorId}' created from '${archetype}' archetype.`,
    );
  }

  if (subcommand === "update") {
    const actorId = readPositional(normalizedArgv, 1);
    const set = parseSetFlags(normalizedArgv);
    if (set.diagnostic !== undefined) {
      return renderUsage(json, set.diagnostic, "Usage: tn actor update <actor-id> --set speed=4 [--set sprintSpeed=6] [--project <path>] [--json]");
    }
    if (actorId === undefined) {
      return renderUsage(json, "TN_ACTOR_UPDATE_ARGS_MISSING", "Usage: tn actor update <actor-id> --set speed=4 [--set sprintSpeed=6] [--project <path>] [--json]");
    }
    return renderAuthoringResult(
      "actor",
      await updateActorArchetype({
        actorId,
        projectPath,
        set: set.value,
      }),
      json,
      `Actor '${actorId}' updated.`,
    );
  }

  return renderUsage(json, "TN_ACTOR_COMMAND_UNSUPPORTED", "Usage: tn actor list [--json]\n       tn actor add character --id <actor-id> [--asset <asset-id-or-path>] [--scene <scene-id>] [--speed <n>] [--sprint-speed <n>] [--project <path>] [--json]\n       tn actor update <actor-id> --set speed=4 [--set sprintSpeed=6] [--project <path>] [--json]");
}

function parseSetFlags(argv: readonly string[]): { diagnostic?: string; value?: Record<string, unknown> } {
  const entries = new Map<string, unknown>();
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--set") {
      continue;
    }
    const raw = argv[index + 1];
    if (raw === undefined) {
      return { diagnostic: "TN_ACTOR_SET_INVALID" };
    }
    const separator = raw.indexOf("=");
    if (separator <= 0) {
      return { diagnostic: "TN_ACTOR_SET_INVALID" };
    }
    const key = raw.slice(0, separator);
    const value = raw.slice(separator + 1);
    const number = Number(value);
    entries.set(key, Number.isFinite(number) && value.trim() !== "" ? number : value);
  }
  return { value: Object.fromEntries(entries) };
}
