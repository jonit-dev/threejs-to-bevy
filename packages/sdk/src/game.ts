import type { IAudioDeclaration } from "./audio.js";
import { SdkError } from "./errors.js";
import type { IInputMapDeclaration } from "./input.js";
import type { IRuntimeConfigDeclaration } from "./time.js";
import type { World } from "./ecs/World.js";

export interface IGameRoot {
  audio?: IAudioDeclaration;
  environment?: unknown;
  input?: IInputMapDeclaration;
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
    world !== undefined ||
    options.input !== undefined ||
    options.audio !== undefined ||
    options.environment !== undefined ||
    options.ui !== undefined;
  if (!hasPortableRoot) {
    throw new SdkError("TN_SDK_GAME_ROOT_EMPTY", "defineGame requires at least one portable scene, world, input, audio, environment, or UI declaration.");
  }
  if (options.runtimeConfig !== undefined) {
    if (world === undefined) {
      throw new SdkError("TN_SDK_GAME_RUNTIME_CONFIG_WORLD_REQUIRED", "defineGame runtimeConfig requires a World so it can lower through the existing ECS runtime config path.");
    }
    world.setRuntimeConfig(options.runtimeConfig);
  }

  return {
    ...(options.audio === undefined ? {} : { audio: options.audio }),
    ...(options.environment === undefined ? {} : { environment: options.environment }),
    ...(options.input === undefined ? {} : { input: options.input }),
    ...(options.scene === undefined ? {} : { scene: options.scene }),
    ...(options.ui === undefined ? {} : { ui: options.ui }),
    ...(world === undefined ? {} : { world }),
  };
}
