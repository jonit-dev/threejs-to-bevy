import { type ICommandResult } from "../diagnostics.js";
import { sceneCommand } from "./scene.js";

interface IPhysicsNavCommandOptions {
  cwd?: string;
}

export async function physicsCommand(argv: readonly string[], options: IPhysicsNavCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [subcommand] = normalizedArgv;
  const json = normalizedArgv.includes("--json");
  const sceneId = readPositional(normalizedArgv, 1);
  const entityId = readPositional(normalizedArgv, 2);

  if (subcommand === "add-rigid-body") {
    if (sceneId === undefined || entityId === undefined) {
      return renderUsage(json, "TN_PHYSICS_RIGID_BODY_ARGS_MISSING", physicsUsage());
    }
    return sceneCommand(["add-component", sceneId, entityId, "rigid-body", ...normalizedArgv.slice(3)], options);
  }

  if (subcommand === "add-collider") {
    if (sceneId === undefined || entityId === undefined) {
      return renderUsage(json, "TN_PHYSICS_COLLIDER_ARGS_MISSING", physicsUsage());
    }
    return sceneCommand(["add-component", sceneId, entityId, "collider", ...normalizedArgv.slice(3)], options);
  }

  return renderUsage(json, "TN_PHYSICS_COMMAND_UNKNOWN", physicsUsage());
}

export async function navCommand(argv: readonly string[], options: IPhysicsNavCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [subcommand] = normalizedArgv;
  const json = normalizedArgv.includes("--json");
  const sceneId = readPositional(normalizedArgv, 1);
  const entityId = readPositional(normalizedArgv, 2);

  if (subcommand === "add-agent") {
    if (sceneId === undefined || entityId === undefined) {
      return renderUsage(json, "TN_NAV_AGENT_ARGS_MISSING", navUsage());
    }
    return sceneCommand(["add-component", sceneId, entityId, "character-controller", ...normalizedArgv.slice(3)], options);
  }

  return renderUsage(json, "TN_NAV_COMMAND_UNKNOWN", navUsage());
}

function readPositional(argv: readonly string[], index: number): string | undefined {
  const positionals = argv.filter((arg, argIndex) => {
    if (arg.startsWith("--")) {
      return false;
    }
    const previous = argv[argIndex - 1];
    return !flagsWithValues.has(previous ?? "");
  });
  return positionals[index];
}

function renderUsage(json: boolean, code: string, usage: string): ICommandResult {
  const payload = {
    code,
    message: usage,
    severity: "error",
  };
  return {
    exitCode: 2,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${usage}\n`,
  };
}

function physicsUsage(): string {
  return "Usage: tn physics add-rigid-body <scene-id> <entity-id> [--kind <dynamic|kinematic|static>] [--mass <n>] [--damping <n>] [--gravity-scale <n>] [--project <path>] [--json]\n       tn physics add-collider <scene-id> <entity-id> [--kind <box|sphere|capsule|cylinder|mesh>] [--size x,y,z] [--radius <n>] [--height <n>] [--trigger <true|false>] [--project <path>] [--json]";
}

function navUsage(): string {
  return "Usage: tn nav add-agent <scene-id> <entity-id> [--move-x <axis>] [--move-z <axis>] [--speed <n>] [--slope-limit <n>] [--step-offset <n>] [--grounding <mode>] [--blocking <true|false>] [--project <path>] [--json]";
}

const flagsWithValues = new Set(["--kind", "--mass", "--damping", "--gravity-scale", "--size", "--radius", "--height", "--trigger", "--project", "--move-x", "--move-z", "--speed", "--slope-limit", "--step-offset", "--grounding", "--blocking"]);
