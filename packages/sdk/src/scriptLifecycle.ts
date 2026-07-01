import { SdkError } from "./errors.js";
import { fixedUpdate, postUpdate, startup, update, type ISystemDeclaration, type ISystemOptions } from "./ecs/system.js";

export interface IScriptLifecycleOptions extends Omit<ISystemOptions, "run" | "script"> {
  awake?: string;
  fixedUpdate?: string;
  id: string;
  lateUpdate?: string;
  module: string;
  onEnter?: string;
  onExit?: string;
  scene?: string;
  update?: string;
}

type LifecyclePhase = "awake" | "fixedUpdate" | "lateUpdate" | "update";

const lifecyclePhases: Array<{
  key: LifecyclePhase;
  schedule: ISystemDeclaration["schedule"];
  system: (name: string, options?: ISystemOptions) => ISystemDeclaration;
}> = [
  { key: "awake", schedule: "startup", system: startup },
  { key: "fixedUpdate", schedule: "fixedUpdate", system: fixedUpdate },
  { key: "update", schedule: "update", system: update },
  { key: "lateUpdate", schedule: "postUpdate", system: postUpdate },
];

const supportedOptionKeys = new Set([
  "after",
  "awake",
  "before",
  "commands",
  "eventReads",
  "eventWrites",
  "fixedUpdate",
  "id",
  "lateUpdate",
  "module",
  "onEnter",
  "onExit",
  "queries",
  "reads",
  "resourceReads",
  "resourceWrites",
  "scene",
  "services",
  "update",
  "writes",
]);

/**
 * Expands familiar script lifecycle export names into ordinary portable
 * systems. The runtime still sees only startup, fixedUpdate, update, and
 * postUpdate schedules.
 */
export function scriptLifecycle(options: IScriptLifecycleOptions): ISystemDeclaration[] {
  assertSupportedOptions(options);
  assertSceneHooksSupported(options);
  const id = options.id.trim();
  if (id.length === 0) {
    throw new SdkError("TN_SDK_SCRIPT_LIFECYCLE_ID_EMPTY", "Script lifecycle id must not be empty.");
  }

  const systems: ISystemDeclaration[] = [];
  for (const phase of lifecyclePhases) {
    const exportName = options[phase.key];
    if (exportName === undefined) {
      continue;
    }
    systems.push(phase.system(`${id}.${phase.key}`, {
      ...sharedSystemOptions(options),
      script: { export: exportName, module: options.module },
    }));
  }

  if (systems.length === 0) {
    throw new SdkError("TN_SDK_SCRIPT_LIFECYCLE_EMPTY", "Script lifecycle must declare at least one supported lifecycle export.");
  }
  return systems;
}

function sharedSystemOptions(options: IScriptLifecycleOptions): ISystemOptions {
  return {
    after: options.after,
    before: options.before,
    commands: options.commands,
    eventReads: options.eventReads,
    eventWrites: options.eventWrites,
    queries: options.queries,
    reads: options.reads,
    resourceReads: options.resourceReads,
    resourceWrites: options.resourceWrites,
    services: options.services,
    writes: options.writes,
  };
}

function assertSceneHooksSupported(options: IScriptLifecycleOptions): void {
  if (options.onEnter !== undefined || options.onExit !== undefined) {
    throw new SdkError(
      "TN_SDK_SCRIPT_LIFECYCLE_HOOK_UNSUPPORTED",
      "Script lifecycle onEnter/onExit hooks are not supported until they can lower to the scene lifecycle contract.",
    );
  }
}

function assertSupportedOptions(options: IScriptLifecycleOptions): void {
  const unknownKeys = Object.keys(options).filter((key) => !supportedOptionKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new SdkError("TN_SDK_SCRIPT_LIFECYCLE_OPTION_UNSUPPORTED", `Unsupported script lifecycle option '${unknownKeys.sort()[0]}'.`);
  }
}
