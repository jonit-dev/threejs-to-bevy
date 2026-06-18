import type { IAnimationsDeclaration } from "./animation.js";
import type { IAudioDeclaration } from "./audio.js";
import { SdkError } from "./errors.js";
import type { IInputMapDeclaration } from "./input.js";
import type { IOverlayDeclaration } from "./overlay.js";
import type { IPersistenceDeclaration } from "./persistence.js";
import type { ISceneLifecycleDeclaration } from "./sceneLifecycle.js";
import type { IRuntimeConfigDeclaration } from "./time.js";
import type { World } from "./ecs/World.js";

export interface IGameRoot {
  animations?: IAnimationsDeclaration;
  audio?: IAudioDeclaration;
  environment?: unknown;
  initialScene?: string;
  input?: IInputMapDeclaration;
  overlay?: IOverlayDeclaration;
  persistence?: IPersistenceDeclaration;
  scene?: unknown;
  scenes?: ISceneLifecycleDeclaration[];
  ui?: unknown;
  world?: World;
}

export interface IGameRootOptions extends IGameRoot {
  initialScene?: string;
  runtimeConfig?: IRuntimeConfigDeclaration;
}

export function defineGame(options: IGameRootOptions): IGameRoot {
  const world = options.world;
  const hasPortableRoot =
    options.scene !== undefined ||
    options.animations !== undefined ||
    world !== undefined ||
    options.input !== undefined ||
    options.audio !== undefined ||
    options.environment !== undefined ||
    options.overlay !== undefined ||
    options.persistence !== undefined ||
    options.scenes !== undefined ||
    options.ui !== undefined;
  if (!hasPortableRoot) {
    throw new SdkError("TN_SDK_GAME_ROOT_EMPTY", "defineGame requires at least one portable scene, scenes, world, input, audio, environment, overlay, persistence, or UI declaration.");
  }
  const sceneRoot = normalizeLifecycleScenes(options.scenes, options.initialScene);
  if (options.runtimeConfig !== undefined) {
    if (world === undefined) {
      throw new SdkError("TN_SDK_GAME_RUNTIME_CONFIG_WORLD_REQUIRED", "defineGame runtimeConfig requires a World so it can lower through the existing ECS runtime config path.");
    }
    world.setRuntimeConfig(options.runtimeConfig);
  }

  return {
    ...(options.animations === undefined ? {} : { animations: options.animations }),
    ...(options.audio === undefined ? {} : { audio: options.audio }),
    ...(options.environment === undefined ? {} : { environment: options.environment }),
    ...(options.input === undefined ? {} : { input: options.input }),
    ...(options.overlay === undefined ? {} : { overlay: options.overlay }),
    ...(options.persistence === undefined ? {} : { persistence: options.persistence }),
    ...(options.scene === undefined ? {} : { scene: options.scene }),
    ...sceneRoot,
    ...(options.ui === undefined ? {} : { ui: options.ui }),
    ...(world === undefined ? {} : { world }),
  };
}

function normalizeLifecycleScenes(scenes: ISceneLifecycleDeclaration[] | undefined, initialScene: string | undefined): { initialScene?: string; scenes?: ISceneLifecycleDeclaration[] } {
  if (scenes === undefined) {
    if (initialScene !== undefined) {
      throw new SdkError("TN_SDK_GAME_INITIAL_SCENE_WITHOUT_SCENES", "defineGame initialScene requires scenes to be declared.");
    }
    return {};
  }
  if (scenes.length === 0) {
    throw new SdkError("TN_SDK_GAME_SCENES_EMPTY", "defineGame scenes must include at least one scene declaration.");
  }
  if (initialScene === undefined || initialScene.trim() === "") {
    throw new SdkError("TN_SDK_GAME_INITIAL_SCENE_REQUIRED", "defineGame requires initialScene when scenes are declared.");
  }
  const sceneIds = new Set<string>();
  for (const scene of scenes) {
    if (sceneIds.has(scene.id)) {
      throw new SdkError("TN_SDK_GAME_SCENE_DUPLICATE", `defineGame scenes include duplicate scene ID '${scene.id}'.`);
    }
    sceneIds.add(scene.id);
  }
  if (!sceneIds.has(initialScene)) {
    throw new SdkError("TN_SDK_GAME_INITIAL_SCENE_UNKNOWN", `defineGame initialScene '${initialScene}' is not declared.`);
  }
  return { initialScene, scenes: [...scenes] };
}
