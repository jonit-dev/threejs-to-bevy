import type { IAssetReference } from "./assets.js";
import { SdkError } from "./errors.js";
import type { Vector3Tuple } from "./math/Vector3.js";
import type { MeshStandardMaterial } from "./materials/MeshStandardMaterial.js";
import type { SupportedGeometry } from "./geometry/primitives.js";
import { Mesh } from "./scene/Mesh.js";
import { defineComponent, type IEcsDeclaration } from "./ecs/schema.js";

export const PrefabTransform = defineComponent("Transform", {
  position: { kind: "vec3", required: false },
  rotation: { kind: "quat", required: false },
  scale: { kind: "vec3", required: false },
});

export const PrefabModelAsset = defineComponent("ModelAsset", {
  asset: "asset",
});

export interface IPrefabDeclaration {
  components: IEcsDeclaration[];
  id: string;
  mesh?: Mesh;
}

export interface IPrimitiveActorPrefabDeclaration extends IPrefabDeclaration {
  mesh: Mesh;
}

export interface IPrimitiveActorPrefabOptions extends IPrefabBaseOptions {
  geometry: SupportedGeometry;
  material: MeshStandardMaterial;
}

export interface IModelActorPrefabOptions extends IPrefabBaseOptions {
  asset: IAssetReference | string;
}

export interface IPrefabBaseOptions {
  components?: readonly IEcsDeclaration[];
  id: string;
  position?: Vector3Tuple;
  rotation?: readonly [number, number, number, number];
  scale?: Vector3Tuple;
  unsupported?: IUnsupportedPrefabOptions;
}

export interface IUnsupportedPrefabOptions {
  arbitraryPhysicsController?: boolean;
  rawRendererHook?: boolean;
  runtimeAssetLoading?: boolean;
}

export function definePrefab(options: IPrefabDeclaration): IPrefabDeclaration {
  assertId(options.id);
  return {
    components: [...options.components].sort((left, right) => left.schema.name.localeCompare(right.schema.name)),
    id: options.id,
    ...(options.mesh === undefined ? {} : { mesh: options.mesh }),
  };
}

export function primitiveActorPrefab(options: IPrimitiveActorPrefabOptions): IPrimitiveActorPrefabDeclaration {
  assertSupportedPrefabOptions(options.unsupported);
  const mesh = new Mesh({ geometry: options.geometry, id: options.id, material: options.material });
  if (options.position !== undefined) {
    mesh.position.set(...options.position);
  }
  if (options.scale !== undefined) {
    mesh.scale.set(...options.scale);
  }
  return definePrefab({
    components: [...(options.components ?? []), PrefabTransform(transformData(options))],
    id: options.id,
    mesh,
  }) as IPrimitiveActorPrefabDeclaration;
}

export function modelActorPrefab(options: IModelActorPrefabOptions): IPrefabDeclaration {
  assertSupportedPrefabOptions(options.unsupported);
  if (typeof options.asset !== "string" && options.asset.kind !== "model") {
    throw new SdkError("TN_SDK_PREFAB_MODEL_ASSET_KIND_INVALID", "Model actor prefabs must reference a model asset.");
  }
  return definePrefab({
    components: [
      ...(options.components ?? []),
      PrefabModelAsset({ asset: typeof options.asset === "string" ? options.asset : options.asset.id }),
      PrefabTransform(transformData(options)),
    ],
    id: options.id,
  });
}

function transformData(options: IPrefabBaseOptions): Record<string, unknown> {
  return {
    ...(options.position === undefined ? {} : { position: [...options.position] }),
    ...(options.rotation === undefined ? {} : { rotation: [...options.rotation] }),
    ...(options.scale === undefined ? {} : { scale: [...options.scale] }),
  };
}

function assertSupportedPrefabOptions(options: IUnsupportedPrefabOptions | undefined): void {
  if (options?.arbitraryPhysicsController === true) {
    throw new SdkError("TN_SDK_PREFAB_UNSUPPORTED_PHYSICS_CONTROLLER", "Prefab recipes cannot declare arbitrary physics controllers.");
  }
  if (options?.rawRendererHook === true) {
    throw new SdkError("TN_SDK_PREFAB_UNSUPPORTED_RENDERER_HOOK", "Prefab recipes cannot declare raw renderer hooks.");
  }
  if (options?.runtimeAssetLoading === true) {
    throw new SdkError("TN_SDK_PREFAB_UNSUPPORTED_RUNTIME_ASSET_LOADING", "Prefab recipes cannot declare runtime asset loading.");
  }
}

function assertId(id: string): void {
  if (id.trim() === "") {
    throw new SdkError("TN_SDK_PREFAB_ID_EMPTY", "Prefab ID must not be empty.");
  }
}
