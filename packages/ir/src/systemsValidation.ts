import type { IAudioIr, IIrNamedSchema, IPrefabsIr } from "./types.js";
import type { IrSystemCommand, IrSystemService, ISystemsIr } from "./systems.js";
import type { IIrDiagnostic } from "./validate.js";
import { PROMOTED_SCRIPT_SERVICES } from "./scriptingHost.js";
import { isBuiltInComponent, isBuiltInResource } from "./schemaValidation.js";
import { isRecord } from "./validationPrimitives.js";
import { validateFiniteRange } from "./validationPrimitives.js";
import { validateUnsupportedFields } from "./validationDiagnostics.js";

function componentSchemaFix(component: string): NonNullable<IIrDiagnostic["fix"]> {
  return {
    docs: "docs/contracts/ir.md",
    instruction: `Declare component '${component}' in component schemas before listing it in reads, writes, queries, or commands. If '${component}' is global game state, move it to resourceReads/resourceWrites and declare a resource schema instead.`,
    snippet: JSON.stringify({
      schema: "threenative.component-schemas",
      version: "0.1.0",
      schemas: {
        [component]: {
          fields: {},
        },
      },
    }, null, 2),
  };
}

function resourceSchemaFix(resource: string): NonNullable<IIrDiagnostic["fix"]> {
  return {
    docs: "docs/contracts/ir.md",
    instruction: `Replace content/schemas/resources.schema.json with this full authoring document, then replace the placeholder field with the fields used by resource '${resource}'.`,
    snippet: JSON.stringify({
      schema: "threenative.schema",
      version: "0.1.0",
      id: "resource-schemas",
      kind: "resource",
      schemas: [{ id: resource, fields: { value: { kind: "json" } } }],
    }, null, 2),
  };
}

export function validateSystems(
  systems: ISystemsIr,
  path: string,
  componentSchemas: Record<string, IIrNamedSchema>,
  resourceSchemas: Record<string, IIrNamedSchema>,
  eventSchemas: Record<string, IIrNamedSchema>,
  prefabs: IPrefabsIr | undefined,
  diagnostics: IIrDiagnostic[],
): void {
  const rawSystems = systems as unknown as Record<string, unknown>;
  for (const key of Object.keys(rawSystems)) {
    if (!["channels", "componentHooks", "countdowns", "lifecycle", "observers", "pluginGroups", "plugins", "schema", "scriptAudio", "systems", "tasks", "version"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_SYSTEMS_FIELD_UNSUPPORTED",
        message: `Systems IR uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
        severity: "error",
        suggestion: "Remove platform or host-specific scripting metadata unless it is represented by promoted systems lifecycle, task, or channel fields.",
      });
    }
  }
  if (systems.schema !== "threenative.systems" || systems.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_SYSTEMS_VERSION_UNSUPPORTED",
      message: "Systems IR must use threenative.systems version 0.1.0.",
      path,
    });
  }
  validateComponentHooks(systems.componentHooks, `${path}/componentHooks`, componentSchemas, diagnostics);
  validateSystemsLifecycle(systems.lifecycle, `${path}/lifecycle`, resourceSchemas, diagnostics);
  validateSystemObservers(systems.observers, `${path}/observers`, eventSchemas, diagnostics);
  const channelIds = validateSystemChannels(systems.channels, `${path}/channels`, eventSchemas, diagnostics);
  validateSystemTasks(systems.tasks, `${path}/tasks`, channelIds, diagnostics);
  validateCountdowns(systems.countdowns, `${path}/countdowns`, resourceSchemas, eventSchemas, diagnostics);
  const systemNames = new Set(systems.systems.map((system) => system.name));
  validateSystemOrdering(systems.systems, `${path}/systems`, diagnostics);
  const pluginIds = validateSystemPlugins(systems.plugins, `${path}/plugins`, systemNames, diagnostics);
  validateSystemPluginGroups(systems.pluginGroups, `${path}/pluginGroups`, pluginIds, diagnostics);

  systems.systems.forEach((system, systemIndex) => {
    const rawSystem = system as unknown as Record<string, unknown>;
    for (const key of Object.keys(rawSystem)) {
      if (!["after", "before", "commands", "delayedCommands", "eventReads", "eventWrites", "name", "queries", "reads", "resourceReads", "resourceWrites", "schedule", "script", "services", "source", "writes"].includes(key)) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_FIELD_UNSUPPORTED",
          message: `System '${system.name}' uses unsupported field '${key}'.`,
          path: `${path}/systems/${systemIndex}/${key}`,
          severity: "error",
          suggestion: "Use deterministic schedules, declared effects, and promoted lifecycle metadata instead of async timers, platform APIs, or system-local persisted state.",
        });
      }
    }
    const writes = new Set(system.writes);
    const eventWrites = new Set(system.eventWrites);
    if (!["fixedUpdate", "postUpdate", "startup", "update"].includes(system.schedule)) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_STAGE_UNSUPPORTED",
        message: `System '${system.name}' uses unsupported schedule '${system.schedule}'.`,
        path: `${path}/systems/${systemIndex}/schedule`,
      });
    }
    if (system.source !== undefined && system.source !== "behavior-metadata") {
      diagnostics.push({
        code: "TN_IR_SYSTEM_SOURCE_UNSUPPORTED",
        message: `System '${system.name}' uses unsupported source '${system.source}'.`,
        path: `${path}/systems/${systemIndex}/source`,
        severity: "error",
        suggestion: "Use 'behavior-metadata' only for compiler-synthesized defineBehavior system metadata.",
      });
    }
    system.reads.forEach((component, componentIndex) => {
      if (!isBuiltInComponent(component) && componentSchemas[component] === undefined) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
          fix: componentSchemaFix(component),
          message: `System '${system.name}' reads component '${component}' without a schema.`,
          path: `${path}/systems/${systemIndex}/reads/${componentIndex}`,
        });
      }
    });
    system.writes.forEach((component, componentIndex) => {
      if (!isBuiltInComponent(component) && componentSchemas[component] === undefined) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
          fix: componentSchemaFix(component),
          message: `System '${system.name}' writes component '${component}' without a schema.`,
          path: `${path}/systems/${systemIndex}/writes/${componentIndex}`,
        });
      }
    });
    (system.resourceReads ?? []).forEach((resource, resourceIndex) => {
      if (!isBuiltInResource(resource) && resourceSchemas[resource] === undefined) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_RESOURCE_SCHEMA_MISSING",
          fix: resourceSchemaFix(resource),
          message: `System '${system.name}' reads resource '${resource}' without a schema.`,
          path: `${path}/systems/${systemIndex}/resourceReads/${resourceIndex}`,
        });
      }
    });
    (system.resourceWrites ?? []).forEach((resource, resourceIndex) => {
      if (!isBuiltInResource(resource) && resourceSchemas[resource] === undefined) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_RESOURCE_SCHEMA_MISSING",
          fix: resourceSchemaFix(resource),
          message: `System '${system.name}' writes resource '${resource}' without a schema.`,
          path: `${path}/systems/${systemIndex}/resourceWrites/${resourceIndex}`,
        });
      }
    });
    system.eventReads.forEach((event, eventIndex) => {
      if (eventSchemas[event] === undefined) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_EVENT_SCHEMA_MISSING",
          message: `System '${system.name}' reads event '${event}' without a schema.`,
          path: `${path}/systems/${systemIndex}/eventReads/${eventIndex}`,
        });
      }
    });
    system.eventWrites.forEach((event, eventIndex) => {
      if (eventSchemas[event] === undefined) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_EVENT_SCHEMA_MISSING",
          message: `System '${system.name}' writes event '${event}' without a schema.`,
          path: `${path}/systems/${systemIndex}/eventWrites/${eventIndex}`,
        });
      }
    });
    system.queries.forEach((query, queryIndex) => {
      if (query.orderBy !== undefined && query.orderBy !== "id") {
        diagnostics.push({
          code: "TN_IR_SYSTEM_QUERY_ORDER_UNSUPPORTED",
          message: `System '${system.name}' declares unsupported query order '${query.orderBy}'.`,
          path: `${path}/systems/${systemIndex}/queries/${queryIndex}/orderBy`,
        });
      }
      if (query.offset !== undefined && (!Number.isInteger(query.offset) || query.offset < 0)) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_QUERY_OFFSET_INVALID",
          message: `System '${system.name}' query offset must be a non-negative integer.`,
          path: `${path}/systems/${systemIndex}/queries/${queryIndex}/offset`,
        });
      }
      if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 0)) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_QUERY_LIMIT_INVALID",
          message: `System '${system.name}' query limit must be a non-negative integer.`,
          path: `${path}/systems/${systemIndex}/queries/${queryIndex}/limit`,
        });
      }
      (query.changed ?? []).forEach((component, componentIndex) => {
        if (!isValidChangedComponentSelector(component)) {
          diagnostics.push({
            code: "TN_IR_SYSTEM_QUERY_CHANGED_SELECTOR_UNSUPPORTED",
            message: `System '${system.name}' changed-query filter '${component}' must reference a top-level component name without wildcards or deep paths.`,
            path: `${path}/systems/${systemIndex}/queries/${queryIndex}/changed/${componentIndex}`,
          });
        } else if (!isBuiltInComponent(component) && componentSchemas[component] === undefined) {
          diagnostics.push({
            code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
            fix: componentSchemaFix(component),
            message: `System '${system.name}' changed-query filter references component '${component}' without a schema.`,
            path: `${path}/systems/${systemIndex}/queries/${queryIndex}/changed/${componentIndex}`,
          });
        }
      });
      query.with.forEach((component, componentIndex) => {
        if (!isBuiltInComponent(component) && componentSchemas[component] === undefined) {
          diagnostics.push({
            code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
            fix: componentSchemaFix(component),
            message: `System '${system.name}' queries component '${component}' without a schema.`,
            path: `${path}/systems/${systemIndex}/queries/${queryIndex}/with/${componentIndex}`,
          });
        }
      });
      query.without.forEach((component, componentIndex) => {
        if (!isBuiltInComponent(component) && componentSchemas[component] === undefined) {
          diagnostics.push({
            code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
            fix: componentSchemaFix(component),
            message: `System '${system.name}' excludes component '${component}' without a schema.`,
            path: `${path}/systems/${systemIndex}/queries/${queryIndex}/without/${componentIndex}`,
          });
        }
      });
    });
    (system.services ?? []).forEach((service, serviceIndex) => {
      if (!SUPPORTED_SYSTEM_SERVICES.includes(service)) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_SERVICE_UNSUPPORTED",
          message: `System '${system.name}' declares unsupported service '${service}'.`,
          path: `${path}/systems/${systemIndex}/services/${serviceIndex}`,
        });
      }
    });
    system.commands.forEach((command, commandIndex) => {
      validateSystemCommand(command, `${path}/systems/${systemIndex}/commands/${commandIndex}`, system.name, writes, eventWrites, componentSchemas, eventSchemas, prefabs, diagnostics);
    });
    validateDelayedCommands(system.delayedCommands, `${path}/systems/${systemIndex}/delayedCommands`, system.name, writes, eventWrites, componentSchemas, eventSchemas, prefabs, diagnostics);
  });
}

function validateCountdowns(
  countdowns: ISystemsIr["countdowns"] | undefined,
  path: string,
  resourceSchemas: Record<string, IIrNamedSchema>,
  eventSchemas: Record<string, IIrNamedSchema>,
  diagnostics: IIrDiagnostic[],
): void {
  if (countdowns === undefined) {
    return;
  }
  if (!Array.isArray(countdowns)) {
    diagnostics.push({ code: "TN_IR_COUNTDOWNS_INVALID", message: "Systems countdowns must be an array.", path, severity: "error" });
    return;
  }
  const ids = new Set<string>();
  countdowns.forEach((countdown, index) => {
    const countdownPath = `${path}/${index}`;
    if (!isRecord(countdown)) {
      diagnostics.push({ code: "TN_IR_COUNTDOWN_INVALID", message: "Countdown declaration must be an object.", path: countdownPath, severity: "error" });
      return;
    }
    validateUnsupportedFields(diagnostics, countdown, ["autostart", "direction", "event", "field", "id", "limit", "resource"], (key) => ({
      code: "TN_IR_COUNTDOWN_FIELD_UNSUPPORTED",
      message: `Countdown uses unsupported field '${key}'.`,
      path: `${countdownPath}/${key}`,
      severity: "error",
    }));
    if (typeof countdown.id !== "string" || countdown.id.trim() === "" || countdown.id.length > 64) {
      diagnostics.push({ code: "TN_IR_COUNTDOWN_ID_INVALID", message: "Countdown id must be a non-empty string of at most 64 characters.", path: `${countdownPath}/id`, severity: "error" });
    } else if (ids.has(countdown.id)) {
      diagnostics.push({ code: "TN_IR_COUNTDOWN_ID_DUPLICATE", message: `Countdown '${countdown.id}' is duplicated.`, path: `${countdownPath}/id`, severity: "error" });
    } else {
      ids.add(countdown.id);
    }
    if (countdown.direction !== "up" && countdown.direction !== "down") {
      diagnostics.push({ code: "TN_IR_COUNTDOWN_DIRECTION_INVALID", message: "Countdown.direction must be up or down.", path: `${countdownPath}/direction`, severity: "error" });
    }
    validateFiniteRange(countdown.limit, 0, 86400, `${countdownPath}/limit`, "TN_IR_COUNTDOWN_LIMIT_INVALID", diagnostics);
    for (const field of ["event", "field", "resource"] as const) {
      if (typeof countdown[field] !== "string" || countdown[field].trim() === "") {
        diagnostics.push({ code: "TN_IR_COUNTDOWN_REFERENCE_INVALID", message: `Countdown.${field} must be a non-empty string.`, path: `${countdownPath}/${field}`, severity: "error" });
      }
    }
    if (countdown.autostart !== undefined && typeof countdown.autostart !== "boolean") {
      diagnostics.push({ code: "TN_IR_COUNTDOWN_AUTOSTART_INVALID", message: "Countdown.autostart must be boolean.", path: `${countdownPath}/autostart`, severity: "error" });
    }
    if (typeof countdown.resource === "string" && countdown.resource.trim() !== "") {
      const schema = resourceSchemas[countdown.resource];
      if (!isBuiltInResource(countdown.resource) && schema === undefined) {
        diagnostics.push({
          code: "TN_IR_COUNTDOWN_RESOURCE_SCHEMA_MISSING",
          fix: resourceSchemaFix(countdown.resource),
          message: `Countdown resource '${countdown.resource}' does not have a schema.`,
          path: `${countdownPath}/resource`,
          severity: "error",
        });
      } else if (schema !== undefined && typeof countdown.field === "string" && schema.fields[countdown.field] === undefined) {
        diagnostics.push({ code: "TN_IR_COUNTDOWN_RESOURCE_FIELD_MISSING", message: `Countdown field '${countdown.field}' is not declared on resource '${countdown.resource}'.`, path: `${countdownPath}/field`, severity: "error", suggestion: `Declare '${countdown.field}' as a number field on resource '${countdown.resource}'.` });
      } else if (schema !== undefined && typeof countdown.field === "string" && !["integer", "number"].includes(schema.fields[countdown.field]?.kind ?? "")) {
        diagnostics.push({ code: "TN_IR_COUNTDOWN_RESOURCE_FIELD_INVALID", message: `Countdown field '${countdown.field}' must use a number or integer schema kind.`, path: `${countdownPath}/field`, severity: "error" });
      }
    }
    if (typeof countdown.event === "string" && countdown.event.trim() !== "" && eventSchemas[countdown.event] === undefined) {
      diagnostics.push({ code: "TN_IR_COUNTDOWN_EVENT_SCHEMA_MISSING", message: `Countdown event '${countdown.event}' does not have an event schema.`, path: `${countdownPath}/event`, severity: "error", suggestion: `Declare event '${countdown.event}' in the ECS event schemas.` });
    }
  });
}

function validateDelayedCommands(
  delayedCommands: ISystemsIr["systems"][number]["delayedCommands"],
  path: string,
  systemName: string,
  writes: ReadonlySet<string>,
  eventWrites: ReadonlySet<string>,
  componentSchemas: Record<string, IIrNamedSchema>,
  eventSchemas: Record<string, IIrNamedSchema>,
  prefabs: IPrefabsIr | undefined,
  diagnostics: IIrDiagnostic[],
): void {
  if (delayedCommands === undefined) {
    return;
  }
  if (!Array.isArray(delayedCommands)) {
    diagnostics.push({
      code: "TN_IR_SYSTEM_DELAYED_COMMANDS_INVALID",
      message: `System '${systemName}' delayedCommands metadata must be an array.`,
      path,
      severity: "error",
    });
    return;
  }
  const ids = new Set<string>();
  delayedCommands.forEach((declaration, index) => {
    const declarationPath = `${path}/${index}`;
    const raw = declaration as unknown as Record<string, unknown>;
    if (!isRecord(raw)) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_DELAYED_COMMAND_INVALID",
        message: `System '${systemName}' delayed command metadata must be an object.`,
        path: declarationPath,
        severity: "error",
      });
      return;
    }
    for (const key of Object.keys(raw)) {
      if (!["cancelPolicy", "command", "id", "maxDelayTicks", "ownership"].includes(key)) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_DELAYED_COMMAND_FIELD_UNSUPPORTED",
          message: `System '${systemName}' delayed command '${declaration.id}' uses unsupported field '${key}'.`,
          path: `${declarationPath}/${key}`,
          severity: "error",
          suggestion: "Declare only id, maxDelayTicks, ownership, cancelPolicy, and one supported command.",
        });
      }
    }
    if (typeof declaration.id !== "string" || declaration.id.trim() === "") {
      diagnostics.push({
        code: "TN_IR_SYSTEM_DELAYED_COMMAND_ID_INVALID",
        message: `System '${systemName}' delayed command id must be a non-empty string.`,
        path: `${declarationPath}/id`,
        severity: "error",
      });
    } else if (ids.has(declaration.id)) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_DELAYED_COMMAND_DUPLICATE",
        message: `System '${systemName}' declares duplicate delayed command '${declaration.id}'.`,
        path: `${declarationPath}/id`,
        severity: "error",
      });
    } else {
      ids.add(declaration.id);
    }
    if (!Number.isInteger(declaration.maxDelayTicks) || declaration.maxDelayTicks < 1) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_DELAYED_COMMAND_MAX_TICKS_INVALID",
        message: `System '${systemName}' delayed command '${declaration.id}' must declare a positive integer maxDelayTicks bound.`,
        path: `${declarationPath}/maxDelayTicks`,
        severity: "error",
        suggestion: "Use fixed-tick delays with an explicit finite upper bound; wall-clock timers are not portable.",
      });
    }
    validateDelayedCommandOwnership(declaration.ownership, `${declarationPath}/ownership`, systemName, declaration.id, diagnostics);
    if (!["drop", "flush"].includes(declaration.cancelPolicy)) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_DELAYED_COMMAND_CANCEL_UNSUPPORTED",
        message: `System '${systemName}' delayed command '${declaration.id}' uses unsupported cancelPolicy '${declaration.cancelPolicy}'.`,
        path: `${declarationPath}/cancelPolicy`,
        severity: "error",
        suggestion: "Use 'drop' for missing owners or 'flush' when the command remains valid after owner removal.",
      });
    }
    validateSystemCommand(declaration.command, `${declarationPath}/command`, systemName, writes, eventWrites, componentSchemas, eventSchemas, prefabs, diagnostics);
  });
}

function validateDelayedCommandOwnership(
  ownership: NonNullable<ISystemsIr["systems"][number]["delayedCommands"]>[number]["ownership"],
  path: string,
  systemName: string,
  commandId: string,
  diagnostics: IIrDiagnostic[],
): void {
  const raw = ownership as unknown as Record<string, unknown>;
  if (!isRecord(raw)) {
    diagnostics.push({
      code: "TN_IR_SYSTEM_DELAYED_COMMAND_OWNERSHIP_INVALID",
      message: `System '${systemName}' delayed command '${commandId}' must declare scene or entity ownership.`,
      path,
      severity: "error",
    });
    return;
  }
  for (const key of Object.keys(raw)) {
    if (!["id", "kind"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_DELAYED_COMMAND_OWNERSHIP_FIELD_UNSUPPORTED",
        message: `System '${systemName}' delayed command '${commandId}' ownership uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
        severity: "error",
      });
    }
  }
  if (!["entity", "scene"].includes(ownership.kind)) {
    diagnostics.push({
      code: "TN_IR_SYSTEM_DELAYED_COMMAND_OWNERSHIP_KIND_UNSUPPORTED",
      message: `System '${systemName}' delayed command '${commandId}' ownership kind must be 'entity' or 'scene'.`,
      path: `${path}/kind`,
      severity: "error",
    });
  }
  if (typeof ownership.id !== "string" || ownership.id.trim() === "") {
    diagnostics.push({
      code: "TN_IR_SYSTEM_DELAYED_COMMAND_OWNERSHIP_ID_INVALID",
      message: `System '${systemName}' delayed command '${commandId}' ownership id must be a non-empty string.`,
      path: `${path}/id`,
      severity: "error",
    });
  }
}

function validateSystemCommand(
  command: IrSystemCommand,
  path: string,
  systemName: string,
  writes: ReadonlySet<string>,
  eventWrites: ReadonlySet<string>,
  componentSchemas: Record<string, IIrNamedSchema>,
  eventSchemas: Record<string, IIrNamedSchema>,
  prefabs: IPrefabsIr | undefined,
  diagnostics: IIrDiagnostic[],
): void {
  const raw = command as unknown as Record<string, unknown>;
  if (!isRecord(raw)) {
    diagnostics.push({
      code: "TN_IR_SYSTEM_COMMAND_INVALID",
      message: `System '${systemName}' command metadata must be an object.`,
      path,
      severity: "error",
    });
    return;
  }
  if (!["addComponent", "clearParent", "despawn", "emitEvent", "instantiate", "removeComponent", "setComponent", "setParent", "spawn"].includes(command.kind)) {
    diagnostics.push({
      code: "TN_IR_SYSTEM_COMMAND_KIND_UNSUPPORTED",
      message: `System '${systemName}' command uses unsupported kind '${String(command.kind)}'.`,
      path: `${path}/kind`,
      severity: "error",
      suggestion: "Use a promoted command kind and declare the matching component write or event write access.",
    });
    return;
  }
  if (command.kind === "addComponent" || command.kind === "removeComponent" || command.kind === "setComponent") {
    if (typeof command.component !== "string" || command.component.trim() === "") {
      diagnostics.push({
        code: "TN_IR_SYSTEM_COMMAND_INVALID",
        message: `System '${systemName}' component command must reference a non-empty component name.`,
        path: `${path}/component`,
        severity: "error",
      });
      return;
    }
    if (!isBuiltInComponent(command.component) && componentSchemas[command.component] === undefined) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
        fix: componentSchemaFix(command.component),
        message: `System '${systemName}' command references component '${command.component}' without a schema.`,
        path: `${path}/component`,
      });
    }
    if (!writes.has(command.component)) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_WRITE_UNDECLARED",
        message: `System '${systemName}' command writes component '${command.component}' without declaring write access.`,
        path: `${path}/component`,
      });
    }
  }
  if (command.kind === "spawn") {
    if (!Array.isArray(command.components)) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_COMMAND_INVALID",
        message: `System '${systemName}' spawn command must declare a components array.`,
        path: `${path}/components`,
        severity: "error",
      });
      return;
    }
    command.components.forEach((component, componentIndex) => {
      if (typeof component !== "string" || component.trim() === "") {
        diagnostics.push({
          code: "TN_IR_SYSTEM_COMMAND_INVALID",
          message: `System '${systemName}' spawn command component names must be non-empty strings.`,
          path: `${path}/components/${componentIndex}`,
          severity: "error",
        });
        return;
      }
      if (!isBuiltInComponent(component) && componentSchemas[component] === undefined) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
          fix: componentSchemaFix(component),
          message: `System '${systemName}' command spawns component '${component}' without a schema.`,
          path: `${path}/components/${componentIndex}`,
        });
      }
      if (!writes.has(component)) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_WRITE_UNDECLARED",
          message: `System '${systemName}' command spawns component '${component}' without declaring write access.`,
          path: `${path}/components`,
        });
      }
    });
  }
  if (command.kind === "emitEvent") {
    if (typeof command.event !== "string" || command.event.trim() === "") {
      diagnostics.push({
        code: "TN_IR_SYSTEM_COMMAND_INVALID",
        message: `System '${systemName}' emitEvent command must reference a non-empty event name.`,
        path: `${path}/event`,
        severity: "error",
      });
      return;
    }
    if (eventSchemas[command.event] === undefined) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_EVENT_SCHEMA_MISSING",
        message: `System '${systemName}' command emits event '${command.event}' without a schema.`,
        path: `${path}/event`,
      });
    }
    if (!eventWrites.has(command.event)) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_EVENT_WRITE_UNDECLARED",
        message: `System '${systemName}' emits event '${command.event}' without declaring event write access.`,
        path: `${path}/event`,
      });
    }
  }
  if (command.kind === "instantiate") {
    if (typeof command.prefab !== "string" || command.prefab.trim() === "") {
      diagnostics.push({ code: "TN_IR_SYSTEM_PREFAB_COMMAND_INVALID", message: "Instantiate command must reference a non-empty prefab id.", path: `${path}/prefab` });
    } else if (prefabs === undefined || !prefabs.prefabs.some((prefab) => prefab.id === command.prefab)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_PREFAB_MISSING", message: `System '${systemName}' instantiate command references unknown prefab '${command.prefab}'.`, path: `${path}/prefab` });
    }
    if (typeof command.prefix !== "string" || command.prefix.trim() === "") {
      diagnostics.push({ code: "TN_IR_SYSTEM_PREFAB_PREFIX_INVALID", message: "Instantiate command must declare a non-empty deterministic instance prefix.", path: `${path}/prefix` });
    }
  }
  if (command.kind === "setParent" || command.kind === "clearParent") {
    if (!writes.has("Hierarchy")) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_WRITE_UNDECLARED",
        message: `System '${systemName}' hierarchy command requires declaring write access to Hierarchy.`,
        path: `${path}/kind`,
      });
    }
    if (typeof command.child !== "string" || command.child.trim() === "") {
      diagnostics.push({ code: "TN_IR_SYSTEM_HIERARCHY_CHILD_INVALID", message: "Hierarchy command child must be a non-empty entity id.", path: `${path}/child` });
    }
    if (command.kind === "setParent" && (typeof command.parent !== "string" || command.parent.trim() === "")) {
      diagnostics.push({ code: "TN_IR_SYSTEM_HIERARCHY_PARENT_INVALID", message: "setParent command parent must be a non-empty entity id.", path: `${path}/parent` });
    }
  }
}

function validateSystemOrdering(systems: ISystemsIr["systems"], path: string, diagnostics: IIrDiagnostic[]): void {
  const byName = new Map<string, { index: number; schedule: string; system: ISystemsIr["systems"][number] }>();
  systems.forEach((system, index) => {
    byName.set(system.name, { index, schedule: system.schedule, system });
  });

  systems.forEach((system, systemIndex) => {
    validateSystemOrderRefs(system.before, `${path}/${systemIndex}/before`, "before", system, byName, diagnostics);
    validateSystemOrderRefs(system.after, `${path}/${systemIndex}/after`, "after", system, byName, diagnostics);
  });

  for (const schedule of ["startup", "fixedUpdate", "update", "postUpdate"]) {
    const scheduled = systems.filter((system) => system.schedule === schedule);
    const names = new Set(scheduled.map((system) => system.name));
    const outgoing = new Map<string, Set<string>>();
    const indegree = new Map<string, number>();
    for (const name of names) {
      outgoing.set(name, new Set());
      indegree.set(name, 0);
    }
    for (const system of scheduled) {
      for (const target of system.before ?? []) {
        if (target === system.name || !names.has(target)) {
          continue;
        }
        addSystemOrderEdge(system.name, target, outgoing, indegree);
      }
      for (const source of system.after ?? []) {
        if (source === system.name || !names.has(source)) {
          continue;
        }
        addSystemOrderEdge(source, system.name, outgoing, indegree);
      }
    }
    const ready = [...names].filter((name) => indegree.get(name) === 0).sort();
    let visited = 0;
    while (ready.length > 0) {
      const name = ready.shift()!;
      visited += 1;
      for (const next of [...(outgoing.get(name) ?? [])].sort()) {
        indegree.set(next, (indegree.get(next) ?? 0) - 1);
        if (indegree.get(next) === 0) {
          ready.push(next);
          ready.sort();
        }
      }
    }
    if (visited !== names.size) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_ORDER_CYCLE",
        message: `Systems in schedule '${schedule}' declare cyclic before/after ordering constraints.`,
        path,
        severity: "error",
        suggestion: "Remove one of the before/after constraints so the schedule has a deterministic acyclic order.",
      });
    }
  }
}

const SUPPORTED_SYSTEM_SERVICES = PROMOTED_SCRIPT_SERVICES;

const AUDIO_SYSTEM_SERVICES = new Set<IrSystemService>(["audio.play", "audio.query", "audio.stop"]);
const SCRIPT_AUDIO_EXTERNAL_FIELDS = new Set(["decoderPlugin", "device", "deviceId", "nativeHandle", "networkStream", "networkUrl", "platformHandle", "src", "stream", "streaming", "streamingUrl", "url"]);

export function validateSystemAudioContract(
  systems: ISystemsIr,
  audio: IAudioIr | undefined,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  const usesAudioServices = systems.systems.some((system) => (system.services ?? []).some((service) => AUDIO_SYSTEM_SERVICES.has(service)));
  if (!usesAudioServices) {
    return;
  }
  if (audio === undefined) {
    diagnostics.push({
      code: "TN_IR_SYSTEM_AUDIO_IR_REQUIRED",
      message: "Systems that declare audio services require audio.ir.json in the bundle manifest.",
      path: `${path}/services`,
      severity: "error",
      suggestion: "Add audio.ir.json to manifest.entry.audio and declare bundle-local one-shots, music, or tones.",
    });
    return;
  }
  validateScriptAudioMetadata(systems.scriptAudio, declaredAudioSoundIds(audio), `${path}/scriptAudio`, diagnostics);
}

function declaredAudioSoundIds(audio: IAudioIr): Set<string> {
  return new Set([
    ...audio.oneShots.map((oneShot) => oneShot.id),
    ...audio.music.map((music) => music.id),
    ...(audio.tones ?? []).map((tone) => tone.id),
  ]);
}

function validateScriptAudioMetadata(
  scriptAudio: ISystemsIr["scriptAudio"],
  declaredSoundIds: Set<string>,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (scriptAudio === undefined) {
    return;
  }
  if (!Array.isArray(scriptAudio)) {
    diagnostics.push({
      code: "TN_IR_SCRIPT_AUDIO_INVALID",
      message: "Script audio metadata must be an array of declared sound IDs.",
      path,
      severity: "error",
    });
    return;
  }
  scriptAudio.forEach((entry, index) => {
    const entryPath = `${path}/${index}`;
    const raw = entry as unknown as Record<string, unknown>;
    if (!isRecord(raw)) {
      diagnostics.push({
        code: "TN_IR_SCRIPT_AUDIO_INVALID",
        message: "Script audio metadata entries must be objects.",
        path: entryPath,
        severity: "error",
      });
      return;
    }
    for (const key of Object.keys(raw)) {
      if (key === "id") {
        continue;
      }
      if (SCRIPT_AUDIO_EXTERNAL_FIELDS.has(key)) {
        diagnostics.push({
          code: "TN_IR_SCRIPT_AUDIO_EXTERNAL_UNSUPPORTED",
          message: `Script audio metadata uses unsupported external source field '${key}'. Audio sources must be declared in audio.ir.json.`,
          path: `${entryPath}/${key}`,
          severity: "error",
        });
        continue;
      }
      diagnostics.push({
        code: "TN_IR_SCRIPT_AUDIO_FIELD_UNSUPPORTED",
        message: `Script audio metadata uses unsupported field '${key}'.`,
        path: `${entryPath}/${key}`,
        severity: "error",
      });
    }
    if (typeof raw.id !== "string" || raw.id.trim() === "") {
      diagnostics.push({
        code: "TN_IR_SCRIPT_AUDIO_ID_INVALID",
        message: "Script audio metadata ID must be a non-empty string.",
        path: `${entryPath}/id`,
        severity: "error",
      });
      return;
    }
    if (!declaredSoundIds.has(raw.id)) {
      diagnostics.push({
        code: "TN_IR_SCRIPT_AUDIO_SOUND_MISSING",
        message: `Script audio metadata references undeclared sound '${raw.id}'.`,
        path: `${entryPath}/id`,
        severity: "error",
        suggestion: "Declare the sound in audio.ir.json oneShots, music, or tones before referencing it from script audio metadata.",
      });
    }
  });
}

function validateSystemOrderRefs(
  value: string[] | undefined,
  path: string,
  field: "after" | "before",
  system: ISystemsIr["systems"][number],
  byName: ReadonlyMap<string, { index: number; schedule: string; system: ISystemsIr["systems"][number] }>,
  diagnostics: IIrDiagnostic[],
): void {
  if (value === undefined) {
    return;
  }
  const raw = value as unknown;
  if (!Array.isArray(raw)) {
    diagnostics.push({
      code: "TN_IR_SYSTEM_ORDER_INVALID",
      message: `System '${system.name}' ${field} constraints must be an array of system names.`,
      path,
      severity: "error",
    });
    return;
  }
  raw.forEach((candidate, index) => {
    if (typeof candidate !== "string" || candidate.trim() === "") {
      diagnostics.push({
        code: "TN_IR_SYSTEM_ORDER_INVALID",
        message: `System '${system.name}' ${field} constraint must reference a non-empty system name.`,
        path: `${path}/${index}`,
        severity: "error",
      });
      return;
    }
    if (candidate === system.name) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_ORDER_SELF_REFERENCE",
        message: `System '${system.name}' cannot order itself with a ${field} constraint.`,
        path: `${path}/${index}`,
        severity: "error",
      });
      return;
    }
    const target = byName.get(candidate);
    if (target === undefined) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_ORDER_TARGET_MISSING",
        message: `System '${system.name}' ${field} constraint references missing system '${candidate}'.`,
        path: `${path}/${index}`,
        severity: "error",
      });
      return;
    }
    if (target.schedule !== system.schedule) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_ORDER_CROSS_SCHEDULE",
        message: `System '${system.name}' ${field} constraint references system '${candidate}' in schedule '${target.schedule}', not '${system.schedule}'.`,
        path: `${path}/${index}`,
        severity: "error",
        suggestion: "Only order systems within the same schedule; stage order remains startup, fixedUpdate, update, postUpdate.",
      });
    }
  });
}

function addSystemOrderEdge(source: string, target: string, outgoing: Map<string, Set<string>>, indegree: Map<string, number>): void {
  const edges = outgoing.get(source);
  if (edges === undefined || edges.has(target)) {
    return;
  }
  edges.add(target);
  indegree.set(target, (indegree.get(target) ?? 0) + 1);
}

function validateSystemPlugins(
  value: ISystemsIr["plugins"] | undefined,
  path: string,
  systemNames: ReadonlySet<string>,
  diagnostics: IIrDiagnostic[],
): Set<string> {
  const pluginIds = new Set<string>();
  if (value === undefined) {
    return pluginIds;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_SYSTEM_PLUGINS_INVALID", message: "Systems plugins must be an array.", path, severity: "error" });
    return pluginIds;
  }
  value.forEach((plugin, index) => {
    const pluginPath = `${path}/${index}`;
    if (!isRecord(plugin)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_INVALID", message: "Plugin declaration must be an object.", path: pluginPath, severity: "error" });
      return;
    }
    for (const key of Object.keys(plugin)) {
      if (!["id", "systems"].includes(key)) {
        diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_FIELD_UNSUPPORTED", message: `Plugin declaration uses unsupported field '${key}'.`, path: `${pluginPath}/${key}`, severity: "error" });
      }
    }
    if (typeof plugin.id !== "string" || plugin.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_ID_INVALID", message: "Plugin ID must be a non-empty string.", path: `${pluginPath}/id`, severity: "error" });
    } else if (pluginIds.has(plugin.id)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_DUPLICATE", message: `Plugin '${plugin.id}' is duplicated.`, path: `${pluginPath}/id`, severity: "error" });
    } else {
      pluginIds.add(plugin.id);
    }
    validatePluginSystems(plugin.systems, `${pluginPath}/systems`, systemNames, diagnostics);
  });
  return pluginIds;
}

function validatePluginSystems(value: unknown, path: string, systemNames: ReadonlySet<string>, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_SYSTEMS_INVALID", message: "Plugin systems must be a non-empty array.", path, severity: "error" });
    return;
  }
  const seen = new Set<string>();
  value.forEach((system, index) => {
    if (typeof system !== "string" || system.trim() === "" || !systemNames.has(system)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_SYSTEM_MISSING", message: "Plugin system must reference a declared system.", path: `${path}/${index}`, severity: "error" });
      return;
    }
    if (seen.has(system)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_SYSTEM_DUPLICATE", message: `Plugin system '${system}' is duplicated.`, path: `${path}/${index}`, severity: "error" });
      return;
    }
    seen.add(system);
  });
}

function validateSystemPluginGroups(
  value: ISystemsIr["pluginGroups"] | undefined,
  path: string,
  pluginIds: ReadonlySet<string>,
  diagnostics: IIrDiagnostic[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_GROUPS_INVALID", message: "Systems plugin groups must be an array.", path, severity: "error" });
    return;
  }
  const groupIds = new Set<string>();
  value.forEach((group, index) => {
    const groupPath = `${path}/${index}`;
    if (!isRecord(group)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_GROUP_INVALID", message: "Plugin group declaration must be an object.", path: groupPath, severity: "error" });
      return;
    }
    for (const key of Object.keys(group)) {
      if (!["id", "plugins"].includes(key)) {
        diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_GROUP_FIELD_UNSUPPORTED", message: `Plugin group declaration uses unsupported field '${key}'.`, path: `${groupPath}/${key}`, severity: "error" });
      }
    }
    if (typeof group.id !== "string" || group.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_GROUP_ID_INVALID", message: "Plugin group ID must be a non-empty string.", path: `${groupPath}/id`, severity: "error" });
    } else if (groupIds.has(group.id)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_GROUP_DUPLICATE", message: `Plugin group '${group.id}' is duplicated.`, path: `${groupPath}/id`, severity: "error" });
    } else {
      groupIds.add(group.id);
    }
    validatePluginGroupPlugins(group.plugins, `${groupPath}/plugins`, pluginIds, diagnostics);
  });
}

function validatePluginGroupPlugins(value: unknown, path: string, pluginIds: ReadonlySet<string>, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_GROUP_PLUGINS_INVALID", message: "Plugin group plugins must be a non-empty array.", path, severity: "error" });
    return;
  }
  const seen = new Set<string>();
  value.forEach((plugin, index) => {
    if (typeof plugin !== "string" || plugin.trim() === "" || !pluginIds.has(plugin)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_GROUP_PLUGIN_MISSING", message: "Plugin group plugin must reference a declared plugin.", path: `${path}/${index}`, severity: "error" });
      return;
    }
    if (seen.has(plugin)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_GROUP_PLUGIN_DUPLICATE", message: `Plugin group plugin '${plugin}' is duplicated.`, path: `${path}/${index}`, severity: "error" });
      return;
    }
    seen.add(plugin);
  });
}

function validateSystemChannels(
  value: ISystemsIr["channels"] | undefined,
  path: string,
  eventSchemas: Record<string, IIrNamedSchema>,
  diagnostics: IIrDiagnostic[],
): Set<string> {
  const channelIds = new Set<string>();
  if (value === undefined) {
    return channelIds;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_SYSTEM_CHANNELS_INVALID", message: "Systems channels must be an array.", path, severity: "error" });
    return channelIds;
  }
  const eventRoutes = new Set<string>();
  value.forEach((channel, index) => {
    const channelPath = `${path}/${index}`;
    if (!isRecord(channel)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_CHANNEL_INVALID", message: "Channel declaration must be an object.", path: channelPath, severity: "error" });
      return;
    }
    for (const key of Object.keys(channel)) {
      if (!["delivery", "event", "id"].includes(key)) {
        diagnostics.push({ code: "TN_IR_SYSTEM_CHANNEL_FIELD_UNSUPPORTED", message: `Channel declaration uses unsupported field '${key}'.`, path: `${channelPath}/${key}`, severity: "error" });
      }
    }
    if (typeof channel.id !== "string" || channel.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_SYSTEM_CHANNEL_ID_INVALID", message: "Channel ID must be a non-empty string.", path: `${channelPath}/id`, severity: "error" });
    } else if (channelIds.has(channel.id)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_CHANNEL_DUPLICATE", message: `Channel '${channel.id}' is duplicated.`, path: `${channelPath}/id`, severity: "error" });
    } else {
      channelIds.add(channel.id);
    }
    if (typeof channel.event !== "string" || channel.event.trim() === "" || eventSchemas[channel.event] === undefined) {
      diagnostics.push({ code: "TN_IR_SYSTEM_CHANNEL_EVENT_SCHEMA_MISSING", message: "Channel event must reference a declared event schema.", path: `${channelPath}/event`, severity: "error" });
    } else if (eventRoutes.has(channel.event)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_CHANNEL_EVENT_DUPLICATE", message: `Event '${channel.event}' is already bound to a channel.`, path: `${channelPath}/event`, severity: "error" });
    } else {
      eventRoutes.add(channel.event);
    }
    if (channel.delivery !== "fixed-trace") {
      diagnostics.push({ code: "TN_IR_SYSTEM_CHANNEL_DELIVERY_UNSUPPORTED", message: "Channel delivery must be 'fixed-trace'.", path: `${channelPath}/delivery`, severity: "error" });
    }
  });
  return channelIds;
}

function validateSystemTasks(
  value: ISystemsIr["tasks"] | undefined,
  path: string,
  channelIds: ReadonlySet<string>,
  diagnostics: IIrDiagnostic[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_SYSTEM_TASKS_INVALID", message: "Systems tasks must be an array.", path, severity: "error" });
    return;
  }
  const taskIds = new Set<string>();
  value.forEach((task, index) => {
    const taskPath = `${path}/${index}`;
    if (!isRecord(task)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_TASK_INVALID", message: "Task declaration must be an object.", path: taskPath, severity: "error" });
      return;
    }
    for (const key of Object.keys(task)) {
      if (!["channel", "id", "mode", "schedule"].includes(key)) {
        diagnostics.push({ code: "TN_IR_SYSTEM_TASK_FIELD_UNSUPPORTED", message: `Task declaration uses unsupported field '${key}'.`, path: `${taskPath}/${key}`, severity: "error" });
      }
    }
    if (typeof task.id !== "string" || task.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_SYSTEM_TASK_ID_INVALID", message: "Task ID must be a non-empty string.", path: `${taskPath}/id`, severity: "error" });
    } else if (taskIds.has(task.id)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_TASK_DUPLICATE", message: `Task '${task.id}' is duplicated.`, path: `${taskPath}/id`, severity: "error" });
    } else {
      taskIds.add(task.id);
    }
    if (task.mode !== "fixed-trace") {
      diagnostics.push({ code: "TN_IR_SYSTEM_TASK_MODE_UNSUPPORTED", message: "Task mode must be 'fixed-trace'.", path: `${taskPath}/mode`, severity: "error" });
    }
    if (!["fixedUpdate", "postUpdate", "startup", "update"].includes(task.schedule as string)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_TASK_SCHEDULE_UNSUPPORTED", message: "Task schedule must be a supported system schedule.", path: `${taskPath}/schedule`, severity: "error" });
    }
    if (task.channel !== undefined && (typeof task.channel !== "string" || !channelIds.has(task.channel))) {
      diagnostics.push({ code: "TN_IR_SYSTEM_TASK_CHANNEL_MISSING", message: "Task channel must reference a declared systems channel.", path: `${taskPath}/channel`, severity: "error" });
    }
  });
}

function validateComponentHooks(
  value: unknown,
  path: string,
  componentSchemas: Record<string, IIrNamedSchema>,
  diagnostics: IIrDiagnostic[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_SYSTEM_COMPONENT_HOOKS_INVALID", message: "Component hooks must be an array.", path, severity: "error" });
    return;
  }
  const components = new Set<string>();
  value.forEach((declaration, index) => {
    const declarationPath = `${path}/${index}`;
    if (!isRecord(declaration)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_COMPONENT_HOOK_INVALID", message: "Component hook declaration must be an object.", path: declarationPath, severity: "error" });
      return;
    }
    for (const key of Object.keys(declaration)) {
      if (!["component", "hooks"].includes(key)) {
        diagnostics.push({ code: "TN_IR_SYSTEM_COMPONENT_HOOK_FIELD_UNSUPPORTED", message: `Component hook declaration uses unsupported field '${key}'.`, path: `${declarationPath}/${key}`, severity: "error" });
      }
    }
    if (typeof declaration.component !== "string" || declaration.component.trim() === "" || componentSchemas[declaration.component] === undefined) {
      diagnostics.push({ code: "TN_IR_SYSTEM_COMPONENT_HOOK_SCHEMA_MISSING", message: "Component hook must reference a declared component schema.", path: `${declarationPath}/component`, severity: "error" });
    } else if (components.has(declaration.component)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_COMPONENT_HOOK_DUPLICATE", message: `Component hook declaration for '${declaration.component}' is duplicated.`, path: declarationPath, severity: "error" });
    } else {
      components.add(declaration.component);
    }
    validateComponentHookKinds(declaration.hooks, `${declarationPath}/hooks`, diagnostics);
  });
}

function validateComponentHookKinds(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push({ code: "TN_IR_SYSTEM_COMPONENT_HOOK_KINDS_INVALID", message: "Component hook kinds must be a non-empty array.", path, severity: "error" });
    return;
  }
  const hooks = new Set<string>();
  value.forEach((hook, index) => {
    if (hook !== "onAdd" && hook !== "onInsert") {
      diagnostics.push({ code: "TN_IR_SYSTEM_COMPONENT_HOOK_KIND_UNSUPPORTED", message: "Component hook kind must be 'onAdd' or 'onInsert'.", path: `${path}/${index}`, severity: "error" });
      return;
    }
    if (hooks.has(hook)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_COMPONENT_HOOK_KIND_DUPLICATE", message: `Component hook kind '${hook}' is duplicated.`, path: `${path}/${index}`, severity: "error" });
      return;
    }
    hooks.add(hook);
  });
}

function validateSystemObservers(
  value: unknown,
  path: string,
  eventSchemas: Record<string, IIrNamedSchema>,
  diagnostics: IIrDiagnostic[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_SYSTEM_OBSERVERS_INVALID", message: "Systems observers must be an array.", path, severity: "error" });
    return;
  }
  const routes = new Set<string>();
  value.forEach((observer, index) => {
    const observerPath = `${path}/${index}`;
    if (!isRecord(observer)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_OBSERVER_INVALID", message: "Observer declaration must be an object.", path: observerPath, severity: "error" });
      return;
    }
    for (const key of Object.keys(observer)) {
      if (!["event", "phases", "propagation"].includes(key)) {
        diagnostics.push({ code: "TN_IR_SYSTEM_OBSERVER_FIELD_UNSUPPORTED", message: `Observer declaration uses unsupported field '${key}'.`, path: `${observerPath}/${key}`, severity: "error" });
      }
    }
    if (typeof observer.event !== "string" || observer.event.trim() === "" || eventSchemas[observer.event] === undefined) {
      diagnostics.push({ code: "TN_IR_SYSTEM_OBSERVER_EVENT_SCHEMA_MISSING", message: "Observer event must reference a declared event schema.", path: `${observerPath}/event`, severity: "error" });
    }
    if (observer.propagation !== "target-ancestors") {
      diagnostics.push({ code: "TN_IR_SYSTEM_OBSERVER_PROPAGATION_UNSUPPORTED", message: "Observer propagation must be 'target-ancestors'.", path: `${observerPath}/propagation`, severity: "error" });
    }
    validateObserverPhases(observer.phases, `${observerPath}/phases`, diagnostics);
    const routeKey = `${String(observer.event)}:${String(observer.propagation)}:${JSON.stringify(observer.phases)}`;
    if (routes.has(routeKey)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_OBSERVER_DUPLICATE", message: "Observer route is duplicated.", path: observerPath, severity: "error" });
    } else {
      routes.add(routeKey);
    }
  });
}

function validateObserverPhases(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push({ code: "TN_IR_SYSTEM_OBSERVER_PHASES_INVALID", message: "Observer phases must be a non-empty array.", path, severity: "error" });
    return;
  }
  const phases = new Set<string>();
  value.forEach((phase, index) => {
    if (phase !== "target" && phase !== "bubble") {
      diagnostics.push({ code: "TN_IR_SYSTEM_OBSERVER_PHASE_UNSUPPORTED", message: "Observer phase must be 'target' or 'bubble'.", path: `${path}/${index}`, severity: "error" });
      return;
    }
    if (phases.has(phase)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_OBSERVER_PHASE_DUPLICATE", message: `Observer phase '${phase}' is duplicated.`, path: `${path}/${index}`, severity: "error" });
      return;
    }
    phases.add(phase);
  });
}

function validateSystemsLifecycle(
  value: ISystemsIr["lifecycle"] | undefined,
  path: string,
  resourceSchemas: Record<string, IIrNamedSchema>,
  diagnostics: IIrDiagnostic[],
): void {
  if (value === undefined) {
    return;
  }
  const raw = value as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!["appStates", "computedStates", "hotReload", "replay", "state", "substates"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_LIFECYCLE_FIELD_UNSUPPORTED",
        message: `Systems lifecycle uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
        severity: "error",
      });
    }
  }
  if (value.replay !== "fixed-trace") {
    diagnostics.push({
      code: "TN_IR_SYSTEM_LIFECYCLE_REPLAY_UNSUPPORTED",
      message: "Systems lifecycle replay must be 'fixed-trace'.",
      path: `${path}/replay`,
      severity: "error",
    });
  }
  if (value.state !== "system-local-disallowed") {
    diagnostics.push({
      code: "TN_IR_SYSTEM_LIFECYCLE_STATE_UNSUPPORTED",
      message: "Systems lifecycle state must disallow system-local persisted state.",
      path: `${path}/state`,
      severity: "error",
    });
  }
  if (value.hotReload !== "invalidate") {
    diagnostics.push({
      code: "TN_IR_SYSTEM_LIFECYCLE_HOT_RELOAD_UNSUPPORTED",
      message: "Systems lifecycle hotReload must be 'invalidate'.",
      path: `${path}/hotReload`,
      severity: "error",
    });
  }
  const stateIds = new Set<string>();
  validateStateDeclarations(value.appStates, `${path}/appStates`, "app", resourceSchemas, stateIds, diagnostics);
  validateStateDeclarations(value.computedStates, `${path}/computedStates`, "computed", resourceSchemas, stateIds, diagnostics);
  validateSubstateDeclarations(value.substates, `${path}/substates`, resourceSchemas, stateIds, diagnostics);
}

function validateStateDeclarations(
  value: unknown,
  path: string,
  kind: "app" | "computed",
  resourceSchemas: Record<string, IIrNamedSchema>,
  stateIds: Set<string>,
  diagnostics: IIrDiagnostic[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_SYSTEM_STATE_DECLARATIONS_INVALID", message: "State declarations must be an array.", path, severity: "error" });
    return;
  }
  value.forEach((state, index) => {
    const statePath = `${path}/${index}`;
    if (!isRecord(state)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_STATE_INVALID", message: "State declaration must be an object.", path: statePath, severity: "error" });
      return;
    }
    for (const key of Object.keys(state)) {
      const allowed = kind === "app" ? ["id", "initial", "source", "values"] : ["fallback", "id", "source", "values"];
      if (!allowed.includes(key)) {
        diagnostics.push({ code: "TN_IR_SYSTEM_STATE_FIELD_UNSUPPORTED", message: `State declaration uses unsupported field '${key}'.`, path: `${statePath}/${key}`, severity: "error" });
      }
    }
    validateStateId(state.id, `${statePath}/id`, stateIds, diagnostics);
    validateStateValues(state.values, `${statePath}/values`, diagnostics);
    const values = Array.isArray(state.values) ? state.values : [];
    if (kind === "app") {
      validateStateValueRef(state.initial, values, `${statePath}/initial`, "initial", diagnostics);
    } else {
      validateStateValueRef(state.fallback, values, `${statePath}/fallback`, "fallback", diagnostics);
    }
    validateStateSource(state.source, `${statePath}/source`, resourceSchemas, diagnostics);
  });
}

function validateSubstateDeclarations(
  value: unknown,
  path: string,
  resourceSchemas: Record<string, IIrNamedSchema>,
  stateIds: ReadonlySet<string>,
  diagnostics: IIrDiagnostic[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_SYSTEM_STATE_DECLARATIONS_INVALID", message: "Substate declarations must be an array.", path, severity: "error" });
    return;
  }
  const substateIds = new Set<string>();
  value.forEach((state, index) => {
    const statePath = `${path}/${index}`;
    if (!isRecord(state)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_STATE_INVALID", message: "Substate declaration must be an object.", path: statePath, severity: "error" });
      return;
    }
    for (const key of Object.keys(state)) {
      if (!["fallback", "id", "parent", "parentValue", "source", "values"].includes(key)) {
        diagnostics.push({ code: "TN_IR_SYSTEM_STATE_FIELD_UNSUPPORTED", message: `Substate declaration uses unsupported field '${key}'.`, path: `${statePath}/${key}`, severity: "error" });
      }
    }
    validateStateId(state.id, `${statePath}/id`, substateIds, diagnostics);
    if (typeof state.parent !== "string" || state.parent.trim() === "" || !stateIds.has(state.parent)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_SUBSTATE_PARENT_MISSING", message: "Substate parent must reference a declared app or computed state.", path: `${statePath}/parent`, severity: "error" });
    }
    validateStateValues(state.values, `${statePath}/values`, diagnostics);
    const values = Array.isArray(state.values) ? state.values : [];
    validateStateValueRef(state.fallback, values, `${statePath}/fallback`, "fallback", diagnostics);
    if (typeof state.parentValue !== "string" || state.parentValue.trim() === "") {
      diagnostics.push({ code: "TN_IR_SYSTEM_SUBSTATE_PARENT_VALUE_INVALID", message: "Substate parentValue must be a non-empty string.", path: `${statePath}/parentValue`, severity: "error" });
    }
    validateStateSource(state.source, `${statePath}/source`, resourceSchemas, diagnostics);
  });
}

function validateStateId(value: unknown, path: string, ids: Set<string>, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "string" || value.trim() === "") {
    diagnostics.push({ code: "TN_IR_SYSTEM_STATE_ID_INVALID", message: "State ID must be a non-empty string.", path, severity: "error" });
    return;
  }
  if (ids.has(value)) {
    diagnostics.push({ code: "TN_IR_SYSTEM_STATE_ID_DUPLICATE", message: `State ID '${value}' is duplicated.`, path, severity: "error" });
    return;
  }
  ids.add(value);
}

function validateStateValues(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    diagnostics.push({ code: "TN_IR_SYSTEM_STATE_VALUES_INVALID", message: "State values must be a non-empty array of strings.", path, severity: "error" });
  }
}

function validateStateValueRef(value: unknown, values: unknown[], path: string, label: "fallback" | "initial", diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "string" || !values.includes(value)) {
    diagnostics.push({ code: "TN_IR_SYSTEM_STATE_VALUE_MISSING", message: `State ${label} value must be declared in values.`, path, severity: "error" });
  }
}

function validateStateSource(value: unknown, path: string, resourceSchemas: Record<string, IIrNamedSchema>, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_SYSTEM_STATE_SOURCE_INVALID", message: "State source must be an object.", path, severity: "error" });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["field", "resource"].includes(key)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_STATE_SOURCE_FIELD_UNSUPPORTED", message: `State source uses unsupported field '${key}'.`, path: `${path}/${key}`, severity: "error" });
    }
  }
  if (typeof value.resource !== "string" || value.resource.trim() === "" || resourceSchemas[value.resource] === undefined) {
    diagnostics.push({ code: "TN_IR_SYSTEM_STATE_RESOURCE_SCHEMA_MISSING", message: "State source resource must reference a declared resource schema.", path: `${path}/resource`, severity: "error" });
  }
  if (typeof value.field !== "string" || value.field.trim() === "" || value.field.includes("/")) {
    diagnostics.push({ code: "TN_IR_SYSTEM_STATE_SOURCE_FIELD_INVALID", message: "State source field must be a non-empty resource field name.", path: `${path}/field`, severity: "error" });
  }
}

function isValidChangedComponentSelector(componentName: string): boolean {
  return componentName.trim() !== "" && !componentName.includes(".") && !componentName.includes("*");
}
