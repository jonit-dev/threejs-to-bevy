import type { IGameFlowIr } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";
import { IR_SCHEMA_IDS, IR_VERSION } from "./documents.js";
import { isRecord, validateUniqueIds } from "./validationPrimitives.js";

const triggerKinds = new Set(["allCollected", "event", "resourceEquals", "timer"]);
const actionKinds = new Set(["activateUiScreen", "emitEvent", "playSequence", "sceneChange", "setResource", "setTimeScale", "spawnerEnable"]);

export function validateGameFlow(flow: IGameFlowIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (flow.schema !== IR_SCHEMA_IDS.gameFlow || flow.version !== IR_VERSION) {
    diagnostics.push({
      code: "TN_GAMEFLOW_SCHEMA_INVALID",
      message: `GameFlow document must use ${IR_SCHEMA_IDS.gameFlow} version ${IR_VERSION}.`,
      path,
      severity: "error",
      suggestion: "Regenerate the game flow document from structured source.",
    });
  }
  if (!Array.isArray(flow.flows)) {
    diagnostics.push(shapeDiagnostic(`${path}/flows`, "GameFlow document must contain a flows array."));
    return;
  }
  validateUniqueIds(flow.flows, `${path}/flows`, "TN_GAMEFLOW_DUPLICATE_ID", diagnostics);
  for (const [flowIndex, item] of flow.flows.entries()) {
    const flowPath = `${path}/flows/${flowIndex}`;
    if (!isRecord(item)) {
      diagnostics.push(shapeDiagnostic(flowPath, "GameFlow entries must be objects."));
      continue;
    }
    if (typeof item.id !== "string" || item.id.trim() === "") {
      diagnostics.push(shapeDiagnostic(`${flowPath}/id`, "GameFlow id must be a non-empty string."));
    }
    if (typeof item.initial !== "string" || item.initial.trim() === "") {
      diagnostics.push(shapeDiagnostic(`${flowPath}/initial`, "GameFlow initial state must be a non-empty string."));
    }
    if (!Array.isArray(item.states)) {
      diagnostics.push(shapeDiagnostic(`${flowPath}/states`, "GameFlow states must be an array."));
      continue;
    }
    validateUniqueIds(item.states, `${flowPath}/states`, "TN_GAMEFLOW_DUPLICATE_STATE", diagnostics);
    const stateIds = new Set(item.states.filter(isRecord).map((state) => state.id).filter((id): id is string => typeof id === "string" && id.trim() !== ""));
    if (typeof item.initial === "string" && !stateIds.has(item.initial)) {
      diagnostics.push({
        code: "TN_GAMEFLOW_INITIAL_STATE_UNKNOWN",
        message: `GameFlow initial state '${item.initial}' is not declared.`,
        path: `${flowPath}/initial`,
        severity: "error",
        suggestion: "Add the state or point initial to a declared state id.",
        value: item.initial,
      });
    }
    for (const [stateIndex, state] of item.states.entries()) {
      const statePath = `${flowPath}/states/${stateIndex}`;
      if (!isRecord(state)) {
        diagnostics.push(shapeDiagnostic(statePath, "GameFlow state entries must be objects."));
        continue;
      }
      validateActions(state.actions, `${statePath}/actions`, diagnostics);
    }
    if (item.transitions !== undefined && !Array.isArray(item.transitions)) {
      diagnostics.push(shapeDiagnostic(`${flowPath}/transitions`, "GameFlow transitions must be an array when present."));
      continue;
    }
    const transitions = Array.isArray(item.transitions) ? item.transitions : [];
    validateUniqueIds(transitions, `${flowPath}/transitions`, "TN_GAMEFLOW_DUPLICATE_TRANSITION", diagnostics);
    for (const [transitionIndex, transition] of transitions.entries()) {
      const transitionPath = `${flowPath}/transitions/${transitionIndex}`;
      if (!isRecord(transition)) {
        diagnostics.push(shapeDiagnostic(transitionPath, "GameFlow transition entries must be objects."));
        continue;
      }
      validateStateRef(transition.from, stateIds, `${transitionPath}/from`, diagnostics);
      validateStateRef(transition.to, stateIds, `${transitionPath}/to`, diagnostics);
      validateTrigger(transition.trigger, `${transitionPath}/trigger`, diagnostics);
      validateActions(transition.actions, `${transitionPath}/actions`, diagnostics);
    }
  }
}

function validateStateRef(value: unknown, stateIds: Set<string>, path: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "string" || value.trim() === "") {
    diagnostics.push(shapeDiagnostic(path, "GameFlow transition state references must be non-empty strings."));
    return;
  }
  if (!stateIds.has(value)) {
    diagnostics.push({
      code: "TN_GAMEFLOW_STATE_UNKNOWN",
      message: `GameFlow transition references unknown state '${value}'.`,
      path,
      severity: "error",
      suggestion: "Reference one of the declared state ids in this flow.",
      value,
    });
  }
}

function validateTrigger(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push(shapeDiagnostic(path, "GameFlow transition trigger must be an object."));
    return;
  }
  if (!triggerKinds.has(String(value.kind))) {
    diagnostics.push({
      code: "TN_GAMEFLOW_TRIGGER_UNSUPPORTED",
      message: `Unsupported GameFlow trigger kind '${String(value.kind)}'.`,
      path: `${path}/kind`,
      severity: "error",
      suggestion: "Use event, timer, resourceEquals, or allCollected.",
      value: String(value.kind),
    });
  }
  if (value.kind === "timer" && (typeof value.seconds !== "number" || !Number.isFinite(value.seconds) || value.seconds < 0)) {
    diagnostics.push(shapeDiagnostic(`${path}/seconds`, "Timer triggers must include a non-negative finite seconds value."));
  }
}

function validateActions(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push(shapeDiagnostic(path, "GameFlow actions must be an array when present."));
    return;
  }
  for (const [index, actionValue] of value.entries()) {
    const actionPath = `${path}/${index}`;
    if (!isRecord(actionValue)) {
      diagnostics.push(shapeDiagnostic(actionPath, "GameFlow action entries must be objects."));
      continue;
    }
    if (!actionKinds.has(String(actionValue.kind))) {
      diagnostics.push({
        code: "TN_GAMEFLOW_ACTION_UNSUPPORTED",
        message: `Unsupported GameFlow action kind '${String(actionValue.kind)}'.`,
        path: `${actionPath}/kind`,
        severity: "error",
        suggestion: "Use a supported bounded action kind such as emitEvent, playSequence, or setResource.",
        value: String(actionValue.kind),
      });
    }
  }
}

function shapeDiagnostic(path: string, message: string): IIrDiagnostic {
  return {
    code: "TN_GAMEFLOW_SHAPE_INVALID",
    message,
    path,
    severity: "error",
    suggestion: "Regenerate the GameFlow document with bounded flow authoring commands.",
  };
}
