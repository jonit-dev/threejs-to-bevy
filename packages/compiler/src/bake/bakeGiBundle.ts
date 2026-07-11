import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { IAssetsManifest, IEnvironmentSceneIr, IMaterialIr, IMaterialsIr, IWorldIr } from "@threenative/ir";
import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { bakeGiProbes, type IProbeBakeReport } from "./probeBaker.js";
import { ToolingSceneRayQuery, type ISceneRayQueryInstance } from "./sceneRayQuery.js";

export interface IBakeGiBundleResult extends IProbeBakeReport {
  unsupportedMeshIds: string[];
}

export async function bakeGiBundle(bundlePath: string, options: { maxDistance?: number; rayCount?: number; seed?: number } = {}): Promise<IBakeGiBundleResult> {
  const manifest = await readJson<Record<string, any>>(resolve(bundlePath, "manifest.json"));
  const world = await readJson<IWorldIr>(resolve(bundlePath, manifest.entry?.world ?? "world.ir.json"));
  const materials = await readJson<IMaterialsIr>(resolve(bundlePath, manifest.files?.materials ?? "materials.ir.json"));
  const assets = await readJson<IAssetsManifest>(resolve(bundlePath, manifest.files?.assets ?? "assets.manifest.json"));
  const environmentPath = manifest.entry?.environmentScene;
  if (typeof environmentPath !== "string") throw new Error("GI baking requires an emitted environment scene with authored light probes.");
  const environment = await readJson<IEnvironmentSceneIr>(resolve(bundlePath, environmentPath));
  if ((environment.lightProbes?.length ?? 0) === 0) throw new Error("GI baking requires at least one authored light probe.");

  const scene = buildSceneRayQuery(world, assets, materials);
  const report = bakeGiProbes({
    albedoByEntity: scene.albedoByEntity,
    assets,
    environment,
    materials,
    maxDistance: options.maxDistance,
    query: scene.query,
    rayCount: options.rayCount,
    seed: options.seed,
    world,
  });
  return { ...report, unsupportedMeshIds: scene.unsupportedMeshIds };
}

function buildSceneRayQuery(world: IWorldIr, assets: IAssetsManifest, materials: IMaterialsIr): { albedoByEntity: Map<string, readonly [number, number, number]>; query: ToolingSceneRayQuery; unsupportedMeshIds: string[] } {
  const assetsById = new Map(assets.assets.map((asset) => [asset.id, asset]));
  const materialsById = new Map(materials.materials.map((material) => [material.id, material]));
  const geometries = new Map<string, BufferGeometry>();
  const instances: ISceneRayQueryInstance[] = [];
  const albedoByEntity = new Map<string, readonly [number, number, number]>();
  const unsupported = new Set<string>();

  for (const entity of world.entities) {
    const renderer = entity.components.MeshRenderer;
    if (renderer === undefined || renderer.visible === false || renderer.castShadow === false || entity.components.RigidBody?.kind === "dynamic") continue;
    const asset = assetsById.get(renderer.mesh);
    if (asset?.kind !== "mesh") {
      unsupported.add(renderer.mesh);
      continue;
    }
    let geometry = geometries.get(asset.id);
    if (geometry === undefined) {
      geometry = geometryForAsset(asset);
      if (geometry === undefined) {
        unsupported.add(asset.id);
        continue;
      }
      geometries.set(asset.id, geometry);
    }
    instances.push({ entityId: entity.id, geometry, matrixWorld: transformMatrix(entity.components.Transform) });
    albedoByEntity.set(entity.id, materialAlbedo(materialsById.get(renderer.material)));
  }
  return { albedoByEntity, query: new ToolingSceneRayQuery(instances), unsupportedMeshIds: [...unsupported].sort() };
}

function geometryForAsset(asset: Extract<IAssetsManifest["assets"][number], { kind: "mesh" }>): BufferGeometry | undefined {
  const size = asset.size ?? [];
  if (asset.primitive === "custom") {
    const position = asset.attributes?.find((attribute) => attribute.name === "position");
    if (position === undefined) return undefined;
    const geometry = new BufferGeometry();
    for (const attribute of asset.attributes ?? []) geometry.setAttribute(attribute.name.replace(/^custom:/, ""), new Float32BufferAttribute([...attribute.values], attribute.itemSize));
    if (asset.indices !== undefined) geometry.setIndex([...asset.indices]);
    return geometry;
  }
  if (asset.primitive === "box") return new BoxGeometry(size[0] ?? 1, size[1] ?? 1, size[2] ?? 1);
  if (asset.primitive === "sphere") return new SphereGeometry(size[0] ?? 0.5, 32, 16);
  if (asset.primitive === "cylinder") return new CylinderGeometry(size[0] ?? 0.5, size[0] ?? 0.5, size[1] ?? 1, 32);
  if (asset.primitive === "capsule") return new CapsuleGeometry(size[0] ?? 0.5, size[1] ?? 1, 16, 32);
  if (asset.primitive === "cone") return new ConeGeometry(size[0] ?? 0.5, size[1] ?? 1, 32);
  if (asset.primitive === "conicalFrustum") return new CylinderGeometry(size[0] ?? 0.25, size[1] ?? 0.5, size[2] ?? 1, 32);
  if (asset.primitive === "torus") { const tube = ((size[1] ?? 1) - (size[0] ?? 0.5)) / 2; return new TorusGeometry((size[1] ?? 1) - tube, tube, 32, 64); }
  if (asset.primitive === "circle") return new CircleGeometry(size[0] ?? 0.5, 64);
  if (asset.primitive === "annulus") return new RingGeometry(size[0] ?? 0.5, size[1] ?? 1, 64);
  if (asset.primitive === "regularPolygon") return new CircleGeometry(size[0] ?? 0.5, size[1] ?? 6);
  if (asset.primitive === "extrudedRectangle") {
    const [width = 1, height = 1, depth = 1] = size;
    const shape = new Shape().moveTo(-width / 2, -height / 2).lineTo(width / 2, -height / 2).lineTo(width / 2, height / 2).lineTo(-width / 2, height / 2).lineTo(-width / 2, -height / 2);
    const geometry = new ExtrudeGeometry(shape, { bevelEnabled: false, depth });
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  }
  if (asset.primitive === "plane") return new PlaneGeometry(size[0] ?? 1, size[1] ?? 1);
  return undefined;
}

function transformMatrix(transform: IWorldIr["entities"][number]["components"]["Transform"]): Matrix4 {
  const position = transform?.position ?? [0, 0, 0];
  const rotation = transform?.rotation ?? [0, 0, 0, 1];
  const scale = transform?.scale ?? [1, 1, 1];
  return new Matrix4().compose(new Vector3(...position), new Quaternion(...rotation), new Vector3(...scale));
}

function materialAlbedo(material: IMaterialIr | undefined): readonly [number, number, number] {
  const color = material?.color;
  if (Array.isArray(color)) return [Number(color[0] ?? 1), Number(color[1] ?? 1), Number(color[2] ?? 1)];
  if (typeof color === "string") {
    const hex = color.startsWith("#") ? color.slice(1) : color;
    if (/^[0-9a-fA-F]{6}$/.test(hex)) return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255) as [number, number, number];
  }
  return [0.8, 0.8, 0.8];
}

async function readJson<T>(path: string): Promise<T> { return JSON.parse(await readFile(path, "utf8")) as T; }
