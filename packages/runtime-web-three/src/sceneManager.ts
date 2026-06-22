import type { ISceneLifecycleIr, IScenesIr } from "@threenative/ir";
import type { IQueuedServiceCall } from "./systems/context.js";

export type SceneLifecycleOperationKind = "change" | "loadAdditive" | "pop" | "push" | "unload";
export type SceneLifecycleTracePhase =
  | "active"
  | "enter"
  | "exit"
  | "pause"
  | "preload"
  | "resume"
  | "unload";

export interface ISceneLifecycleOperation {
  kind: SceneLifecycleOperationKind;
  scene?: string;
}

export interface ISceneLifecycleTraceEvent {
  phase: SceneLifecycleTracePhase;
  scene: string;
  reason: string;
}

export interface ISceneLifecycleRuntimeState {
  additiveScenes: readonly string[];
  activeScene: string;
  activeScopes: ISceneLifecycleActiveScopes;
  stack: readonly string[];
  trace: readonly ISceneLifecycleTraceEvent[];
}

export interface ISceneLifecycleActiveScopes {
  input: readonly string[];
  scenes: readonly string[];
  systems: readonly string[];
  ui: readonly string[];
}

export interface ISceneLifecycleManager {
  readonly state: ISceneLifecycleRuntimeState;
  change(scene: string): ISceneLifecycleRuntimeState;
  loadAdditive(scene: string): ISceneLifecycleRuntimeState;
  pop(): ISceneLifecycleRuntimeState;
  push(scene: string): ISceneLifecycleRuntimeState;
  unload(scene: string): ISceneLifecycleRuntimeState;
}

export function traceSceneLifecycle(
  scenes: IScenesIr,
  operations: readonly ISceneLifecycleOperation[],
): ISceneLifecycleRuntimeState {
  const manager = createSceneLifecycleManager(scenes);
  for (const operation of operations) {
    switch (operation.kind) {
      case "change":
        manager.change(requireSceneOperationTarget(operation));
        break;
      case "loadAdditive":
        manager.loadAdditive(requireSceneOperationTarget(operation));
        break;
      case "pop":
        manager.pop();
        break;
      case "push":
        manager.push(requireSceneOperationTarget(operation));
        break;
      case "unload":
        manager.unload(requireSceneOperationTarget(operation));
        break;
    }
  }
  return manager.state;
}

export function createSceneLifecycleManager(scenes: IScenesIr): ISceneLifecycleManager {
  const sceneById = new Map(scenes.scenes.map((scene) => [scene.id, scene]));
  const initialScene = requireScene(sceneById, scenes.initialScene);
  const mutable = {
    additiveScenes: [] as string[],
    activeScene: initialScene.id,
    stack: [initialScene.id],
    trace: [] as ISceneLifecycleTraceEvent[],
  };
  enterScene(mutable, initialScene.id, "initial");

  return {
    get state() {
      return snapshot(sceneById, mutable);
    },
    change(scene: string) {
      const target = requireScene(sceneById, scene);
      const current = mutable.stack.at(-1);
      if (current !== undefined) {
        exitScene(mutable, current, "change");
      }
      mutable.stack = [target.id];
      mutable.activeScene = target.id;
      enterScene(mutable, target.id, "change");
      return snapshot(sceneById, mutable);
    },
    loadAdditive(scene: string) {
      const target = requireScene(sceneById, scene);
      if (!mutable.additiveScenes.includes(target.id)) {
        mutable.additiveScenes.push(target.id);
        enterScene(mutable, target.id, "loadAdditive");
      }
      return snapshot(sceneById, mutable);
    },
    pop() {
      if (mutable.stack.length <= 1) {
        return snapshot(sceneById, mutable);
      }
      const current = mutable.stack.pop();
      if (current !== undefined) {
        exitScene(mutable, current, "pop");
      }
      const resumed = mutable.stack.at(-1);
      if (resumed !== undefined) {
        mutable.activeScene = resumed;
        pushTrace(mutable, resumed, "resume", "pop");
        pushTrace(mutable, resumed, "active", "pop");
      }
      return snapshot(sceneById, mutable);
    },
    push(scene: string) {
      const target = requireScene(sceneById, scene);
      const current = mutable.stack.at(-1);
      if (current !== undefined) {
        pushTrace(mutable, current, "pause", "push");
      }
      mutable.stack.push(target.id);
      mutable.activeScene = target.id;
      enterScene(mutable, target.id, "push");
      return snapshot(sceneById, mutable);
    },
    unload(scene: string) {
      requireScene(sceneById, scene);
      mutable.additiveScenes = mutable.additiveScenes.filter((id) => id !== scene);
      mutable.stack = mutable.stack.filter((id, index) => index === 0 || id !== scene);
      if (mutable.activeScene === scene) {
        mutable.activeScene = mutable.stack.at(-1) ?? scenes.initialScene;
      }
      exitScene(mutable, scene, "unload");
      return snapshot(sceneById, mutable);
    },
  };
}

export function applySceneServiceEffects(
  manager: ISceneLifecycleManager,
  services: readonly IQueuedServiceCall[],
): ISceneLifecycleRuntimeState {
  for (const service of services) {
    switch (service.service) {
      case "scene.change":
        manager.change(readSceneServiceTarget(service));
        break;
      case "scene.loadAdditive":
        manager.loadAdditive(readSceneServiceTarget(service));
        break;
      case "scene.pop":
        manager.pop();
        break;
      case "scene.push":
        manager.push(readSceneServiceTarget(service));
        break;
      case "scene.unload":
        manager.unload(readSceneServiceTarget(service));
        break;
    }
  }
  return manager.state;
}

function requireScene(sceneById: ReadonlyMap<string, ISceneLifecycleIr>, id: string): ISceneLifecycleIr {
  const scene = sceneById.get(id);
  if (scene === undefined) {
    throw new Error(`Unknown scene lifecycle id '${id}'.`);
  }
  return scene;
}

function requireSceneOperationTarget(operation: ISceneLifecycleOperation): string {
  if (operation.scene === undefined) {
    throw new Error(`Scene operation '${operation.kind}' requires a scene id.`);
  }
  return operation.scene;
}

function readSceneServiceTarget(service: IQueuedServiceCall): string {
  const payload = service.payload;
  if (typeof payload === "object" && payload !== null && "request" in payload) {
    const request = (payload as { request?: unknown }).request;
    if (typeof request === "object" && request !== null && "scene" in request && typeof (request as { scene?: unknown }).scene === "string") {
      return (request as { scene: string }).scene;
    }
  }
  throw new Error(`Scene service '${service.service}' requires a scene id.`);
}

function enterScene(
  state: { trace: ISceneLifecycleTraceEvent[] },
  scene: string,
  reason: string,
): void {
  pushTrace(state, scene, "preload", reason);
  pushTrace(state, scene, "enter", reason);
  pushTrace(state, scene, "active", reason);
}

function exitScene(
  state: { trace: ISceneLifecycleTraceEvent[] },
  scene: string,
  reason: string,
): void {
  pushTrace(state, scene, "exit", reason);
  pushTrace(state, scene, "unload", reason);
}

function pushTrace(
  state: { trace: ISceneLifecycleTraceEvent[] },
  scene: string,
  phase: SceneLifecycleTracePhase,
  reason: string,
): void {
  state.trace.push({ phase, reason, scene });
}

function snapshot(
  sceneById: ReadonlyMap<string, ISceneLifecycleIr>,
  state: {
    additiveScenes: string[];
    activeScene: string;
    stack: string[];
    trace: ISceneLifecycleTraceEvent[];
  },
): ISceneLifecycleRuntimeState {
  return {
    additiveScenes: [...state.additiveScenes],
    activeScene: state.activeScene,
    activeScopes: activeScopes(sceneById, state),
    stack: [...state.stack],
    trace: [...state.trace],
  };
}

function activeScopes(
  sceneById: ReadonlyMap<string, ISceneLifecycleIr>,
  state: { activeScene: string; additiveScenes: string[] },
): ISceneLifecycleActiveScopes {
  const sceneIds = [state.activeScene, ...state.additiveScenes].filter((scene, index, scenes) => scenes.indexOf(scene) === index);
  const scenes = sceneIds.map((id) => requireScene(sceneById, id));
  return {
    input: sortedUnique(scenes.flatMap((scene) => scene.input === undefined ? [] : [scene.input])),
    scenes: sceneIds,
    systems: sortedUnique(scenes.flatMap((scene) => [...(scene.systems ?? [])])),
    ui: sortedUnique(scenes.flatMap((scene) => [...(scene.ui ?? [])])),
  };
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
