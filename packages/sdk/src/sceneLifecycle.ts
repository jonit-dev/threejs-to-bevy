import { SdkError, assertNonNegativeNumber } from "./errors.js";
import type { IAudioDeclaration } from "./audio.js";
import type { IInputMapDeclaration } from "./input.js";
import type { World } from "./ecs/World.js";
import type { Scene } from "./scene/Scene.js";

export type SceneLifecycleKind = "credits" | "cutscene" | "level" | "loading" | "menu" | "overlay" | "system";
export type SceneActivationPolicy = "additive" | "exclusive" | "loading" | "overlay" | "persistent";
export type SceneTransitionKind = "crossfade" | "fade" | "instant" | "loadingScreen";

export interface ISceneTransitionDeclaration {
  color?: string;
  durationMs: number;
  kind: SceneTransitionKind;
  loadingScene?: string;
}

export interface IScenePreloadDeclaration {
  assetGroups: string[];
}

export interface ISceneAudioDeclaration {
  music?: string;
  transition?: ISceneTransitionDeclaration;
}

export interface IScenePersistenceDeclaration {
  keepEntities: string[];
  keepResources: string[];
}

export interface ISceneLifecycleDeclaration {
  activation: SceneActivationPolicy;
  audio?: IAudioDeclaration | ISceneAudioDeclaration;
  id: string;
  input?: IInputMapDeclaration;
  kind: SceneLifecycleKind;
  persistence?: IScenePersistenceDeclaration;
  preload?: IScenePreloadDeclaration;
  transitions: {
    enter?: ISceneTransitionDeclaration;
    exit?: ISceneTransitionDeclaration;
  };
  ui?: unknown;
  visual?: Scene;
  world?: World;
}

export interface ISceneLifecycleOptions {
  activation?: SceneActivationPolicy;
  audio?: IAudioDeclaration | ISceneAudioDeclaration;
  hooks?: never;
  id: string;
  input?: IInputMapDeclaration;
  kind: SceneLifecycleKind;
  persistence?: {
    keepEntities?: ReadonlyArray<string>;
    keepResources?: ReadonlyArray<string>;
  };
  preload?: {
    assetGroups?: ReadonlyArray<string>;
  };
  transitions?: {
    enter?: ISceneTransitionDeclaration;
    exit?: ISceneTransitionDeclaration;
  };
  ui?: unknown;
  unsupported?: never;
  visual?: Scene;
  world?: World;
}

export const sceneTransition = {
  crossfade(options: { durationMs: number }): ISceneTransitionDeclaration {
    assertTransitionDuration(options.durationMs);
    return { durationMs: options.durationMs, kind: "crossfade" };
  },
  fade(options: { color?: string; durationMs: number }): ISceneTransitionDeclaration {
    assertTransitionDuration(options.durationMs);
    if (options.color !== undefined) {
      assertColor(options.color);
    }
    return { ...(options.color === undefined ? {} : { color: options.color }), durationMs: options.durationMs, kind: "fade" };
  },
  instant(): ISceneTransitionDeclaration {
    return { durationMs: 0, kind: "instant" };
  },
  loadingScreen(options: { durationMs?: number; scene: string }): ISceneTransitionDeclaration {
    assertId(options.scene, "TN_SDK_SCENE_TRANSITION_LOADING_ID_EMPTY", "Loading-screen transition scene ID must not be empty.");
    const durationMs = options.durationMs ?? 0;
    assertTransitionDuration(durationMs);
    return { durationMs, kind: "loadingScreen", loadingScene: options.scene };
  },
} as const;

/**
 * Declares a scene lifecycle entry for `defineGame`.
 *
 * Scenes connect optional visual `Scene` objects, ECS worlds, input, audio, UI,
 * preload groups, persistence rules, and transition metadata. The declaration
 * is portable IR input; unsupported lifecycle hooks or invalid IDs throw
 * `SdkError` diagnostics instead of being ignored.
 */
export function defineScene(options: ISceneLifecycleOptions): ISceneLifecycleDeclaration {
  assertNoUnsupportedOptions(options);
  assertId(options.id, "TN_SDK_SCENE_ID_EMPTY", "Scene lifecycle ID must not be empty.");
  assertSupportedKind(options.kind);
  const activation = options.activation ?? defaultActivationForKind(options.kind);
  assertSupportedActivation(activation);
  const transitions = normalizeTransitions(options.transitions);
  return {
    activation,
    ...(options.audio === undefined ? {} : { audio: options.audio }),
    id: options.id,
    ...(options.input === undefined ? {} : { input: options.input }),
    kind: options.kind,
    ...(options.persistence === undefined ? {} : { persistence: normalizePersistence(options.persistence) }),
    ...(options.preload === undefined ? {} : { preload: normalizePreload(options.preload) }),
    transitions,
    ...(options.ui === undefined ? {} : { ui: options.ui }),
    ...(options.visual === undefined ? {} : { visual: options.visual }),
    ...(options.world === undefined ? {} : { world: options.world }),
  };
}

function normalizeTransitions(transitions: ISceneLifecycleOptions["transitions"]): ISceneLifecycleDeclaration["transitions"] {
  if (transitions === undefined) {
    return {};
  }
  if (transitions.enter !== undefined) {
    assertTransition(transitions.enter);
  }
  if (transitions.exit !== undefined) {
    assertTransition(transitions.exit);
  }
  return {
    ...(transitions.enter === undefined ? {} : { enter: transitions.enter }),
    ...(transitions.exit === undefined ? {} : { exit: transitions.exit }),
  };
}

function normalizePreload(preload: NonNullable<ISceneLifecycleOptions["preload"]>): IScenePreloadDeclaration {
  return { assetGroups: normalizeIdList(preload.assetGroups ?? [], "TN_SDK_SCENE_PRELOAD_ASSET_GROUP_EMPTY", "Scene preload asset group ID") };
}

function normalizePersistence(persistence: NonNullable<ISceneLifecycleOptions["persistence"]>): IScenePersistenceDeclaration {
  return {
    keepEntities: normalizeIdList(persistence.keepEntities ?? [], "TN_SDK_SCENE_PERSIST_ENTITY_EMPTY", "Scene persistent entity ID"),
    keepResources: normalizeIdList(persistence.keepResources ?? [], "TN_SDK_SCENE_PERSIST_RESOURCE_EMPTY", "Scene persistent resource ID"),
  };
}

function normalizeIdList(values: ReadonlyArray<string>, code: string, label: string): string[] {
  const ids = [...values].sort((left, right) => left.localeCompare(right));
  for (const id of ids) {
    assertId(id, code, `${label} must not be empty.`);
  }
  return ids;
}

function assertTransition(transition: ISceneTransitionDeclaration): void {
  if (!["crossfade", "fade", "instant", "loadingScreen"].includes(transition.kind)) {
    throw new SdkError("TN_SDK_SCENE_TRANSITION_KIND_INVALID", `Unsupported scene transition kind '${String(transition.kind)}'.`);
  }
  assertTransitionDuration(transition.durationMs);
  if (transition.kind === "fade" && transition.color !== undefined) {
    assertColor(transition.color);
  }
  if (transition.kind === "loadingScreen") {
    assertId(transition.loadingScene, "TN_SDK_SCENE_TRANSITION_LOADING_ID_EMPTY", "Loading-screen transition scene ID must not be empty.");
  }
}

function assertTransitionDuration(durationMs: number): void {
  assertNonNegativeNumber(durationMs, "TN_SDK_SCENE_TRANSITION_DURATION_INVALID", "Scene transition durationMs");
  if (durationMs > 60000) {
    throw new SdkError("TN_SDK_SCENE_TRANSITION_DURATION_INVALID", "Scene transition durationMs must be 60000 or less.");
  }
}

function assertColor(color: string): void {
  if (!/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(color)) {
    throw new SdkError("TN_SDK_SCENE_TRANSITION_COLOR_INVALID", "Scene transition color must be #RRGGBB or #RRGGBBAA.");
  }
}

function assertId(value: string | undefined, code: string, message: string): asserts value is string {
  if (value === undefined || value.trim() === "") {
    throw new SdkError(code, message);
  }
}

function assertSupportedKind(kind: SceneLifecycleKind): void {
  if (!["credits", "cutscene", "level", "loading", "menu", "overlay", "system"].includes(kind)) {
    throw new SdkError("TN_SDK_SCENE_KIND_INVALID", `Unsupported scene lifecycle kind '${String(kind)}'.`);
  }
}

function assertSupportedActivation(activation: SceneActivationPolicy): void {
  if (!["additive", "exclusive", "loading", "overlay", "persistent"].includes(activation)) {
    throw new SdkError("TN_SDK_SCENE_ACTIVATION_INVALID", `Unsupported scene activation policy '${String(activation)}'.`);
  }
}

function defaultActivationForKind(kind: SceneLifecycleKind): SceneActivationPolicy {
  if (kind === "overlay") {
    return "overlay";
  }
  if (kind === "loading") {
    return "loading";
  }
  if (kind === "system") {
    return "persistent";
  }
  return "exclusive";
}

function assertNoUnsupportedOptions(options: ISceneLifecycleOptions): void {
  const optionBag = options as unknown as Record<string, unknown>;
  if (optionBag.hooks !== undefined || optionBag.unsupported !== undefined) {
    throw new SdkError("TN_SDK_SCENE_UNSUPPORTED_OPTION", "Scene lifecycle hooks and adapter-private options are not portable SDK declarations.");
  }
}
