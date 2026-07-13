import type { IGameFlowIr, IIrNamedSchema, IPrefabsIr, IWorldIr } from "./types.js";
import type { IFeedbackPreset } from "./feedback.js";
import type { IInteractionsIr } from "./interactions.js";
import type { IIrDiagnostic } from "./validate.js";
import { isBuiltInComponent, isBuiltInResource } from "./schemaValidation.js";
import { isRecord } from "./validationPrimitives.js";

const DETECTORS = ["sensor-enter", "sensor-exit", "overlap", "distance2d", "distance3d", "ray-hit", "event"] as const;
const GATES = ["once", "once-per-target", "cooldown", "equals"] as const;
const EFFECTS = ["addResource", "setResource", "patchComponent", "emitEvent", "feedbackPreset", "setTransform", "instantiate", "despawn", "requestFlowTransition"] as const;

interface ValidationContext {
  componentSchemas: Record<string, IIrNamedSchema>;
  eventSchemas: Record<string, IIrNamedSchema>;
  feedbackPresets: readonly IFeedbackPreset[];
  gameFlow?: IGameFlowIr;
  prefabs?: IPrefabsIr;
  resourceSchemas: Record<string, IIrNamedSchema>;
  world?: IWorldIr;
}

export function validateInteractions(interactions: IInteractionsIr, path: string, context: ValidationContext, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(interactions) || interactions.schema !== "threenative.interactions" || interactions.version !== "0.1.0" || typeof interactions.id !== "string" || interactions.id.trim() === "" || !Array.isArray(interactions.interactions)) {
    push(diagnostics, "TN_INTERACTION_ORDER_AMBIGUOUS", path, "Interactions document must use threenative.interactions version 0.1.0 with a non-empty id and interactions array.", ["schema", "version", "id", "interactions"]);
    return;
  }
  unsupported(interactions, ["id", "interactions", "schema", "version"], path, "<document>", diagnostics);
  const ids = new Set<string>();
  const exclusiveWrites = new Map<string, string>();
  interactions.interactions.forEach((value, index) => {
    const itemPath = `${path}/interactions/${index}`;
    if (!isRecord(value)) {
      push(diagnostics, "TN_INTERACTION_ORDER_AMBIGUOUS", itemPath, "Interaction declaration must be an object.");
      return;
    }
    const id = typeof value.id === "string" && value.id.trim() !== "" ? value.id : `<index:${index}>`;
    unsupported(value, ["complete", "detector", "effects", "gate", "id", "when"], itemPath, id, diagnostics);
    if (id.startsWith("<index:") || ids.has(id)) {
      push(diagnostics, "TN_INTERACTION_ORDER_AMBIGUOUS", `${itemPath}/id`, `Interaction '${id}' must have a unique non-empty id.`);
    } else {
      ids.add(id);
    }
    validateDetector(value.detector, `${itemPath}/detector`, id, context, diagnostics, false);
    validateGate(value.gate, `${itemPath}/gate`, id, context, diagnostics);
    validatePredicates(value.when, `${itemPath}/when`, id, context, diagnostics, true);
    if (!Array.isArray(value.effects) || value.effects.length === 0) {
      push(diagnostics, "TN_INTERACTION_EFFECT_UNSUPPORTED", `${itemPath}/effects`, `Interaction '${id}' must declare at least one supported effect.`, EFFECTS);
    } else {
      value.effects.forEach((effect, effectIndex) => validateEffect(effect, `${itemPath}/effects/${effectIndex}`, id, context, diagnostics, exclusiveWrites));
    }
    if (value.complete !== undefined) validateCompletion(value.complete, `${itemPath}/complete`, id, context, diagnostics);
  });
}

function validateDetector(value: unknown, path: string, id: string, context: ValidationContext, diagnostics: IIrDiagnostic[], fallback: boolean): void {
  if (!isRecord(value) || typeof value.kind !== "string" || !DETECTORS.includes(value.kind as (typeof DETECTORS)[number]) || (fallback && value.kind !== "distance2d" && value.kind !== "distance3d")) {
    push(diagnostics, "TN_INTERACTION_DETECTOR_UNSUPPORTED", `${path}/kind`, `Interaction '${id}' uses an unsupported detector${fallback ? " fallback" : ""}.`, fallback ? ["distance2d", "distance3d"] : DETECTORS);
    return;
  }
  const allowed = value.kind === "distance2d" || value.kind === "distance3d" ? ["kind", "radius", "source", "target"] : value.kind === "sensor-enter" || value.kind === "sensor-exit" ? ["fallback", "kind", "source", "target"] : value.kind === "event" || value.kind === "ray-hit" ? ["event", "kind", "source", "target"] : ["kind", "source", "target"];
  unsupported(value, allowed, path, id, diagnostics);
  validateSelector(value.source, `${path}/source`, id, context, diagnostics);
  validateSelector(value.target, `${path}/target`, id, context, diagnostics);
  if ((value.kind === "distance2d" || value.kind === "distance3d") && (typeof value.radius !== "number" || !Number.isFinite(value.radius) || value.radius <= 0)) {
    push(diagnostics, "TN_INTERACTION_DETECTOR_UNSUPPORTED", `${path}/radius`, `Interaction '${id}' distance radius must be a positive finite number.`);
  }
  if ((value.kind === "event" || value.kind === "ray-hit") && !knownEvent(value.event, context)) {
    push(diagnostics, "TN_INTERACTION_DETECTOR_UNSUPPORTED", `${path}/event`, `Interaction '${id}' detector must reference a declared event.`);
  }
  if (value.fallback !== undefined) validateDetector(value.fallback, `${path}/fallback`, id, context, diagnostics, true);
}

function validateSelector(value: unknown, path: string, id: string, context: ValidationContext, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    push(diagnostics, "TN_INTERACTION_SELECTOR_INVALID", path, `Interaction '${id}' selector must be an object.`, ["entity", "withTag", "withComponent"]);
    return;
  }
  const keys = ["entity", "withTag", "withComponent"].filter((key) => value[key] !== undefined);
  if (keys.length !== 1 || typeof value[keys[0] ?? ""] !== "string" || (value[keys[0] ?? ""] as string).trim() === "") {
    push(diagnostics, "TN_INTERACTION_SELECTOR_INVALID", path, `Interaction '${id}' selector must declare exactly one non-empty entity, withTag, or withComponent field.`, ["entity", "withTag", "withComponent"]);
    return;
  }
  unsupported(value, [keys[0]!], path, id, diagnostics);
  if (keys[0] === "entity" && context.world !== undefined && !context.world.entities.some((entity) => entity.id === value.entity)) {
    push(diagnostics, "TN_INTERACTION_SELECTOR_INVALID", `${path}/entity`, `Interaction '${id}' selector references unknown entity '${String(value.entity)}'.`);
  }
  if (keys[0] === "withComponent" && !knownComponent(value.withComponent, context)) {
    push(diagnostics, "TN_INTERACTION_SELECTOR_INVALID", `${path}/withComponent`, `Interaction '${id}' selector references unknown component '${String(value.withComponent)}'.`);
  }
}

function validateGate(value: unknown, path: string, id: string, context: ValidationContext, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value) || typeof value.kind !== "string" || !GATES.includes(value.kind as (typeof GATES)[number])) {
    push(diagnostics, "TN_INTERACTION_GATE_UNSUPPORTED", `${path}/kind`, `Interaction '${id}' uses an unsupported gate.`, GATES);
    return;
  }
  const allowed = value.kind === "cooldown" ? ["kind", "ticks"] : value.kind === "equals" ? ["kind", "predicate"] : ["kind"];
  unsupported(value, allowed, path, id, diagnostics);
  if (value.kind === "cooldown" && (!Number.isInteger(value.ticks) || (value.ticks as number) <= 0)) push(diagnostics, "TN_INTERACTION_GATE_UNSUPPORTED", `${path}/ticks`, `Interaction '${id}' cooldown ticks must be a positive integer.`);
  if (value.kind === "equals") validatePredicate(value.predicate, `${path}/predicate`, id, context, diagnostics, true);
}

function validatePredicates(value: unknown, path: string, id: string, context: ValidationContext, diagnostics: IIrDiagnostic[], optional: boolean): void {
  if (value === undefined && optional) return;
  if (!Array.isArray(value)) {
    push(diagnostics, "TN_INTERACTION_GATE_UNSUPPORTED", path, `Interaction '${id}' predicates must be an array.`);
    return;
  }
  value.forEach((predicate, index) => validatePredicate(predicate, `${path}/${index}`, id, context, diagnostics, false));
}

function validatePredicate(value: unknown, path: string, id: string, context: ValidationContext, diagnostics: IIrDiagnostic[], equalityOnly: boolean): void {
  if (!isRecord(value) || typeof value.field !== "string" || value.field.trim() === "") {
    push(diagnostics, "TN_INTERACTION_GATE_UNSUPPORTED", path, `Interaction '${id}' predicate requires a non-empty field.`);
    return;
  }
  if (typeof value.resource === "string") {
    unsupported(value, ["equals", "field", "gte", "resource"], path, id, diagnostics);
    const operators = [value.equals !== undefined, value.gte !== undefined].filter(Boolean).length;
    if (operators !== 1 || (equalityOnly && value.equals === undefined) || (value.gte !== undefined && (typeof value.gte !== "number" || !Number.isFinite(value.gte)))) push(diagnostics, "TN_INTERACTION_GATE_UNSUPPORTED", path, `Interaction '${id}' resource predicate must declare exactly one supported ${equalityOnly ? "equals" : "equals or gte"} operator.`);
    validateResourceField(value.resource, value.field, path, id, context, diagnostics);
    return;
  }
  if (typeof value.component === "string") {
    unsupported(value, ["component", "equals", "field", "target"], path, id, diagnostics);
    if (value.equals === undefined || !validTarget(value.target)) push(diagnostics, "TN_INTERACTION_GATE_UNSUPPORTED", path, `Interaction '${id}' component predicate requires equals and a valid target.`);
    validateComponentField(value.component, value.field, path, id, context, diagnostics);
    return;
  }
  push(diagnostics, "TN_INTERACTION_GATE_UNSUPPORTED", path, `Interaction '${id}' predicate must target a resource or component.`);
}

function validateEffect(value: unknown, path: string, id: string, context: ValidationContext, diagnostics: IIrDiagnostic[], writes: Map<string, string>): void {
  if (!isRecord(value) || typeof value.kind !== "string" || !EFFECTS.includes(value.kind as (typeof EFFECTS)[number])) {
    push(diagnostics, "TN_INTERACTION_EFFECT_UNSUPPORTED", `${path}/kind`, `Interaction '${id}' uses an unsupported effect.`, EFFECTS);
    return;
  }
  const fields: Record<string, string[]> = { addResource: ["field", "kind", "resource", "value"], setResource: ["field", "kind", "resource", "value"], patchComponent: ["component", "kind", "patch", "target"], emitEvent: ["event", "kind", "payload"], feedbackPreset: ["kind", "preset", "target"], setTransform: ["kind", "position", "rotation", "scale", "target"], instantiate: ["kind", "prefab", "prefix"], despawn: ["kind", "target"], requestFlowTransition: ["flow", "kind", "transition"] };
  unsupported(value, fields[value.kind]!, path, id, diagnostics);
  if (value.kind === "addResource" || value.kind === "setResource") {
    if (typeof value.resource !== "string" || typeof value.field !== "string" || (value.kind === "addResource" && (typeof value.value !== "number" || !Number.isFinite(value.value)))) push(diagnostics, "TN_INTERACTION_EFFECT_UNSUPPORTED", path, `Interaction '${id}' ${value.kind} effect has invalid fields.`);
    else {
      validateResourceField(value.resource, value.field, path, id, context, diagnostics);
      if (value.kind === "setResource") exclusiveWrite(`${value.resource}/${value.field}`, id, path, writes, diagnostics);
    }
  } else if (value.kind === "patchComponent") {
    if (typeof value.component !== "string" || !isRecord(value.patch) || !validTarget(value.target)) push(diagnostics, "TN_INTERACTION_EFFECT_UNSUPPORTED", path, `Interaction '${id}' patchComponent effect has invalid fields.`);
    else for (const field of Object.keys(value.patch)) validateComponentField(value.component, field, `${path}/patch/${field}`, id, context, diagnostics);
  } else if (value.kind === "emitEvent") {
    if (!knownEvent(value.event, context)) push(diagnostics, "TN_INTERACTION_EFFECT_UNSUPPORTED", `${path}/event`, `Interaction '${id}' emitEvent effect references an undeclared event.`);
  } else if (value.kind === "feedbackPreset") {
    if (typeof value.preset !== "string" || !context.feedbackPresets.some((preset) => preset.id === value.preset) || (value.target !== undefined && !validTarget(value.target))) push(diagnostics, "TN_INTERACTION_EFFECT_UNSUPPORTED", path, `Interaction '${id}' feedbackPreset effect references an unknown preset or invalid target.`);
  } else if (value.kind === "setTransform") {
    if (!validTarget(value.target) || ![value.position, value.rotation, value.scale].some((item) => item !== undefined) || !validVector(value.position, 3) || !validVector(value.rotation, 4) || !validVector(value.scale, 3)) push(diagnostics, "TN_INTERACTION_EFFECT_UNSUPPORTED", path, `Interaction '${id}' setTransform effect requires a target and finite authored transform values.`);
  } else if (value.kind === "instantiate") {
    if (typeof value.prefab !== "string" || typeof value.prefix !== "string" || value.prefix.trim() === "" || !context.prefabs?.prefabs.some((prefab) => prefab.id === value.prefab)) push(diagnostics, "TN_INTERACTION_EFFECT_UNSUPPORTED", path, `Interaction '${id}' instantiate effect references an unknown prefab or invalid prefix.`);
  } else if (value.kind === "despawn") {
    if (!validTarget(value.target)) push(diagnostics, "TN_INTERACTION_EFFECT_UNSUPPORTED", `${path}/target`, `Interaction '${id}' despawn target is invalid.`);
  } else if (value.kind === "requestFlowTransition") {
    const flow = context.gameFlow?.flows.find((candidate) => candidate.id === value.flow);
    if (flow === undefined || !flow.transitions?.some((transition) => transition.id === value.transition)) push(diagnostics, "TN_INTERACTION_EFFECT_UNSUPPORTED", path, `Interaction '${id}' requestFlowTransition effect references an unknown flow transition.`);
  }
}

function validateCompletion(value: unknown, path: string, id: string, context: ValidationContext, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) { push(diagnostics, "TN_INTERACTION_GATE_UNSUPPORTED", path, `Interaction '${id}' completion must be an object.`); return; }
  unsupported(value, ["effects", "event", "when"], path, id, diagnostics);
  if (!knownEvent(value.event, context)) push(diagnostics, "TN_INTERACTION_EFFECT_UNSUPPORTED", `${path}/event`, `Interaction '${id}' completion references an undeclared event.`);
  validatePredicate(value.when, `${path}/when`, id, context, diagnostics, false);
  if (value.effects !== undefined) {
    if (!Array.isArray(value.effects)) push(diagnostics, "TN_INTERACTION_EFFECT_UNSUPPORTED", `${path}/effects`, `Interaction '${id}' completion effects must be an array.`);
    else value.effects.forEach((effect, index) => validateEffect(effect, `${path}/effects/${index}`, id, context, diagnostics, new Map()));
  }
}

function validateResourceField(resource: string, field: string, path: string, id: string, context: ValidationContext, diagnostics: IIrDiagnostic[]): void {
  const schema = context.resourceSchemas[resource];
  if ((!isBuiltInResource(resource) && schema === undefined) || (schema !== undefined && schema.fields[field] === undefined)) push(diagnostics, "TN_INTERACTION_EFFECT_UNSUPPORTED", path, `Interaction '${id}' references unknown resource field '${resource}.${field}'.`);
}
function validateComponentField(component: string, field: string, path: string, id: string, context: ValidationContext, diagnostics: IIrDiagnostic[]): void {
  const schema = context.componentSchemas[component];
  if ((!isBuiltInComponent(component) && schema === undefined) || (schema !== undefined && schema.fields[field] === undefined)) push(diagnostics, "TN_INTERACTION_EFFECT_UNSUPPORTED", path, `Interaction '${id}' references unknown component field '${component}.${field}'.`);
}
function knownComponent(value: unknown, context: ValidationContext): boolean { return typeof value === "string" && (isBuiltInComponent(value) || context.componentSchemas[value] !== undefined || context.world?.entities.some((entity) => entity.components[value] !== undefined) === true); }
function knownEvent(value: unknown, context: ValidationContext): boolean { return typeof value === "string" && context.eventSchemas[value] !== undefined; }
function validTarget(value: unknown): boolean { return value === "source" || value === "detected" || (isRecord(value) && typeof value.entity === "string" && value.entity.trim() !== "" && Object.keys(value).length === 1); }
function validVector(value: unknown, size: number): boolean { return value === undefined || (Array.isArray(value) && value.length === size && value.every((item) => typeof item === "number" && Number.isFinite(item))); }
function exclusiveWrite(key: string, id: string, path: string, writes: Map<string, string>, diagnostics: IIrDiagnostic[]): void { const owner = writes.get(key); if (owner !== undefined && owner !== id) push(diagnostics, "TN_INTERACTION_WRITE_CONFLICT", path, `Interactions '${owner}' and '${id}' both claim exclusive lifecycle ownership of '${key}'.`); else writes.set(key, id); }
function unsupported(value: Record<string, unknown>, allowed: readonly string[], path: string, id: string, diagnostics: IIrDiagnostic[]): void { for (const key of Object.keys(value)) if (!allowed.includes(key)) push(diagnostics, "TN_INTERACTION_ORDER_AMBIGUOUS", `${path}/${key}`, `Interaction '${id}' uses unsupported field '${key}'.`, allowed); }
function push(diagnostics: IIrDiagnostic[], code: string, path: string, message: string, allowed?: readonly string[]): void { diagnostics.push({ code, path, message, severity: "error", ...(allowed === undefined ? {} : { fix: { allowed, instruction: `Use only the supported values: ${allowed.join(", ")}.` } }) }); }
