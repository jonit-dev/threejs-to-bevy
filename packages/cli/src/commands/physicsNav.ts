import { type ICommandResult } from "../diagnostics.js";
import { dispatchAuthoringOperation, listAuthoringOperationDescriptors, renderAuthoringOperationCliUsage } from "@threenative/authoring";
import { sceneCommand } from "./scene.js";
import { parseJsonObjectFlag, renderSceneResult, resolveProjectPath } from "./sceneShared.js";

interface IPhysicsNavCommandOptions {
  cwd?: string;
}

export async function physicsCommand(argv: readonly string[], options: IPhysicsNavCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [subcommand] = normalizedArgv;
  const json = normalizedArgv.includes("--json");
  const sceneId = readPositional(normalizedArgv, 1);
  const entityId = readPositional(normalizedArgv, 2);

  if (subcommand === "vehicle" || subcommand === "aerodynamics" || subcommand === "wind") {
    const action = readPositional(normalizedArgv, 1);
    const operationSceneId = readPositional(normalizedArgv, 2);
    const operationEntityId = readPositional(normalizedArgv, 3);
    const operationName = nestedPhysicsOperationName(subcommand, action);
    const payloadFlag = subcommand === "vehicle" ? "--controller" : subcommand === "aerodynamics" ? "--body" : "--volume";
    const payloadName = payloadFlag.slice(2);
    const payload = parseJsonObjectFlag(normalizedArgv, payloadFlag, `TN_PHYSICS_${subcommand.toUpperCase()}_PAYLOAD_INVALID`);
    if (payload.diagnostic !== undefined) return renderUsage(json, payload.diagnostic, `${payloadFlag} must be a JSON object.`);
    if (operationName === undefined || operationSceneId === undefined || operationEntityId === undefined || (action === "add" && payload.value === undefined)) {
      return renderUsage(json, `TN_PHYSICS_${subcommand.toUpperCase()}_ARGS_MISSING`, physicsUsage());
    }
    const result = await dispatchAuthoringOperation({
      args: { sceneId: operationSceneId, entityId: operationEntityId, ...(payload.value === undefined ? {} : { [payloadName]: payload.value }) },
      name: operationName,
      projectPath: resolveProjectPath(normalizedArgv, options.cwd),
    });
    return renderSceneResult(result, json, result.ok ? `${subcommand} '${operationEntityId}' ${action} completed.` : `${subcommand} '${operationEntityId}' ${action} failed.`);
  }

  if (subcommand === "add-rigid-body") {
    if (sceneId === undefined || entityId === undefined) {
      return renderUsage(json, "TN_PHYSICS_RIGID_BODY_ARGS_MISSING", physicsUsage());
    }
    const parsed = parseRigidBody(normalizedArgv);
    if (parsed.diagnostic !== undefined || parsed.value === undefined) {
      return renderUsage(json, parsed.diagnostic ?? "TN_PHYSICS_RIGID_BODY_INVALID", parsed.usage ?? physicsUsage());
    }
    return sceneCommand(["set-component", sceneId, entityId, "RigidBody", "--value", JSON.stringify(parsed.value), ...passthroughFlags(normalizedArgv)], options);
  }

  if (subcommand === "add-collider") {
    if (sceneId === undefined || entityId === undefined) {
      return renderUsage(json, "TN_PHYSICS_COLLIDER_ARGS_MISSING", physicsUsage());
    }
    const parsed = parseCollider(normalizedArgv);
    if (parsed.diagnostic !== undefined || parsed.value === undefined) {
      return renderUsage(json, parsed.diagnostic ?? "TN_PHYSICS_COLLIDER_INVALID", parsed.usage ?? physicsUsage());
    }
    return sceneCommand(["set-component", sceneId, entityId, "Collider", "--value", JSON.stringify(parsed.value), ...passthroughFlags(normalizedArgv)], options);
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
  const legacy = "Usage: tn physics add-rigid-body <scene-id> <entity-id> [--kind <dynamic|kinematic|static>] [--mass <n>] [--damping <n>] [--gravity-scale <n>] [--velocity x,y,z] [--angular-velocity x,y,z] [--enabled-translations x,y,z] [--enabled-rotations x,y,z] [--ccd <true|false>] [--ccd-mode <linear|swept-aabb>] [--project <path>] [--json]\n       tn physics add-collider <scene-id> <entity-id> [--kind <box|sphere|capsule|cylinder|mesh>] [--size x,y,z] [--center x,y,z] [--radius <n>] [--height <n>] [--friction <n>] [--restitution <n>] [--layer <name>] [--mask <layer-a,layer-b>] [--trigger <true|false>] [--project <path>] [--json]";
  return [legacy, ...physicsOperationNames().map((name) => renderAuthoringOperationCliUsage(name)).filter((value): value is string => value !== undefined)].join("\n       ");
}

function physicsOperationNames(): string[] { return listAuthoringOperationDescriptors().filter((descriptor) => descriptor.adapters?.cli?.path[0] === "physics").map((descriptor) => descriptor.name); }
function nestedPhysicsOperationName(group: string, action: string | undefined): string | undefined { return listAuthoringOperationDescriptors().find((descriptor) => descriptor.adapters?.cli?.path.join(" ") === `physics ${group} ${action ?? ""}`)?.name; }

function navUsage(): string {
  return "Usage: tn nav add-agent <scene-id> <entity-id> [--move-x <axis>] [--move-z <axis>] [--speed <n>] [--slope-limit <n>] [--step-offset <n>] [--grounding <mode>] [--blocking <true|false>] [--project <path>] [--json]";
}

const flagsWithValues = new Set([
  "--angular-velocity",
  "--blocking",
  "--ccd",
  "--ccd-mode",
  "--center",
  "--controller",
  "--body",
  "--damping",
  "--enabled-rotations",
  "--enabled-translations",
  "--friction",
  "--gravity-scale",
  "--grounding",
  "--height",
  "--kind",
  "--layer",
  "--mask",
  "--mass",
  "--move-x",
  "--move-z",
  "--project",
  "--radius",
  "--restitution",
  "--sensor",
  "--size",
  "--slope-limit",
  "--speed",
  "--step-offset",
  "--trigger",
  "--volume",
  "--velocity",
]);

type PhysicsRecord = Record<string, unknown>;

function parseRigidBody(argv: readonly string[]): { diagnostic?: string; usage?: string; value?: PhysicsRecord } {
  const value: PhysicsRecord = {};
  copyStringFlag(argv, value, "--kind", "kind");
  for (const [flag, key] of [
    ["--mass", "mass"],
    ["--damping", "damping"],
    ["--gravity-scale", "gravityScale"],
  ] as const) {
    const parsed = parseOptionalNumberFlag(argv, flag);
    if (parsed.diagnostic !== undefined) {
      return { diagnostic: parsed.diagnostic, usage: "RigidBody numeric flags must be finite numbers." };
    }
    if (parsed.value !== undefined) {
      value[key] = parsed.value;
    }
  }
  for (const [flag, key] of [
    ["--velocity", "velocity"],
    ["--angular-velocity", "angularVelocity"],
  ] as const) {
    const parsed = parseOptionalVectorFlag(argv, flag);
    if (parsed.diagnostic !== undefined) {
      return { diagnostic: parsed.diagnostic, usage: `${flag} must use x,y,z numeric values.` };
    }
    if (parsed.value !== undefined) {
      value[key] = parsed.value;
    }
  }
  for (const [flag, key] of [
    ["--enabled-translations", "enabledTranslations"],
    ["--enabled-rotations", "enabledRotations"],
  ] as const) {
    const parsed = parseOptionalBooleanVectorFlag(argv, flag);
    if (parsed.diagnostic !== undefined) {
      return { diagnostic: parsed.diagnostic, usage: `${flag} must use true,false,true boolean values.` };
    }
    if (parsed.value !== undefined) {
      value[key] = parsed.value;
    }
  }
  const ccd = parseOptionalBooleanFlag(argv, "--ccd");
  if (ccd.diagnostic !== undefined) {
    return { diagnostic: ccd.diagnostic, usage: "--ccd must be true or false." };
  }
  const ccdMode = readFlag(argv, "--ccd-mode");
  if (ccd.value !== undefined || ccdMode !== undefined) {
    value.ccd = {
      ...(ccd.value === undefined ? {} : { enabled: ccd.value }),
      ...(ccdMode === undefined ? {} : { mode: ccdMode }),
    };
  }
  return { value };
}

function parseCollider(argv: readonly string[]): { diagnostic?: string; usage?: string; value?: PhysicsRecord } {
  const value: PhysicsRecord = {};
  copyStringFlag(argv, value, "--kind", "kind");
  copyStringFlag(argv, value, "--layer", "layer");
  for (const [flag, key] of [
    ["--radius", "radius"],
    ["--height", "height"],
    ["--friction", "friction"],
    ["--restitution", "restitution"],
  ] as const) {
    const parsed = parseOptionalNumberFlag(argv, flag);
    if (parsed.diagnostic !== undefined) {
      return { diagnostic: parsed.diagnostic, usage: "Collider numeric flags must be finite numbers." };
    }
    if (parsed.value !== undefined) {
      value[key] = parsed.value;
    }
  }
  for (const [flag, key] of [
    ["--size", "size"],
    ["--center", "center"],
  ] as const) {
    const parsed = parseOptionalVectorFlag(argv, flag);
    if (parsed.diagnostic !== undefined) {
      return { diagnostic: parsed.diagnostic, usage: `${flag} must use x,y,z numeric values.` };
    }
    if (parsed.value !== undefined) {
      value[key] = parsed.value;
    }
  }
  const mask = parseOptionalStringListFlag(argv, "--mask");
  if (mask.diagnostic !== undefined) {
    return { diagnostic: mask.diagnostic, usage: "--mask must be a comma-separated layer list." };
  }
  if (mask.value !== undefined) {
    value.mask = mask.value;
  }
  const trigger = parseOptionalBooleanFlag(argv, "--trigger");
  if (trigger.diagnostic !== undefined) {
    return { diagnostic: trigger.diagnostic, usage: "--trigger must be true or false." };
  }
  if (trigger.value !== undefined) {
    value.trigger = trigger.value;
  }
  if (value.kind === "capsule" && value.size === undefined) {
    value.size = [1, 1, 1];
  }
  return { value };
}

function passthroughFlags(argv: readonly string[]): string[] {
  const flags: string[] = [];
  if (argv.includes("--json")) {
    flags.push("--json");
  }
  const project = readFlag(argv, "--project");
  if (project !== undefined) {
    flags.push("--project", project);
  }
  return flags;
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function copyStringFlag(argv: readonly string[], value: PhysicsRecord, flag: string, key: string): void {
  const raw = readFlag(argv, flag);
  if (raw !== undefined) {
    value[key] = raw;
  }
}

function parseOptionalNumberFlag(argv: readonly string[], flag: string): { diagnostic?: string; value?: number } {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return {};
  }
  const value = Number(raw);
  return Number.isFinite(value) ? { value } : { diagnostic: "TN_PHYSICS_NUMBER_INVALID" };
}

function parseOptionalBooleanFlag(argv: readonly string[], flag: string): { diagnostic?: string; value?: boolean } {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return {};
  }
  if (raw !== "true" && raw !== "false") {
    return { diagnostic: "TN_PHYSICS_BOOLEAN_INVALID" };
  }
  return { value: raw === "true" };
}

function parseOptionalVectorFlag(argv: readonly string[], flag: string): { diagnostic?: string; value?: [number, number, number] } {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return {};
  }
  const parts = raw.split(",").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return { diagnostic: "TN_PHYSICS_VECTOR_INVALID" };
  }
  const [x, y, z] = parts as [number, number, number];
  return { value: [x, y, z] };
}

function parseOptionalBooleanVectorFlag(argv: readonly string[], flag: string): { diagnostic?: string; value?: [boolean, boolean, boolean] } {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return {};
  }
  const parts = raw.split(",").map((part) => part.trim());
  if (parts.length !== 3 || parts.some((part) => part !== "true" && part !== "false")) {
    return { diagnostic: "TN_PHYSICS_BOOLEAN_VECTOR_INVALID" };
  }
  return { value: [parts[0] === "true", parts[1] === "true", parts[2] === "true"] };
}

function parseOptionalStringListFlag(argv: readonly string[], flag: string): { diagnostic?: string; value?: string[] } {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return {};
  }
  const value = raw.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
  return value.length === 0 ? { diagnostic: "TN_PHYSICS_STRING_LIST_INVALID" } : { value };
}
