import type { IAnimationsDeclaration } from "./animation.js";
import type { IAudioDeclaration } from "./audio.js";
import { SdkError } from "./errors.js";
import type { IInputMapDeclaration } from "./input.js";
import type { IOverlayDeclaration } from "./overlay.js";
import type { IRuntimeConfigDeclaration } from "./time.js";
import type { World } from "./ecs/World.js";

export interface IGameRoot {
  animations?: IAnimationsDeclaration;
  audio?: IAudioDeclaration;
  environment?: unknown;
  input?: IInputMapDeclaration;
  overlay?: IOverlayDeclaration;
  scene?: unknown;
  ui?: unknown;
  world?: World;
}

export interface IGameRootOptions extends IGameRoot {
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
    options.ui !== undefined;
  if (!hasPortableRoot) {
    throw new SdkError("TN_SDK_GAME_ROOT_EMPTY", "defineGame requires at least one portable scene, world, input, audio, environment, overlay, or UI declaration.");
  }
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
    ...(options.scene === undefined ? {} : { scene: options.scene }),
    ...(options.ui === undefined ? {} : { ui: options.ui }),
    ...(world === undefined ? {} : { world }),
  };
}
