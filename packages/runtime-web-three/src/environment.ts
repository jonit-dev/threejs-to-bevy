import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { IWebBundle } from "./loadBundle.js";
import { buildInstancingPlan, type IInstancingPlan } from "./instancing.js";
import { observeAtmosphereProfile, type IAtmosphereObservation } from "./rendering.js";

export interface IEnvironmentRuntime {
  atmosphere: IAtmosphereObservation;
  instancingPlan: IInstancingPlan;
  object: THREE.Group;
  observation: IEnvironmentObservation;
}

export interface IEnvironmentObservation {
  bookmarks: string[];
  heroPlacementIds: string[];
  instancingGroups?: Array<{
    count: number;
    evidence: "model-asset-backed" | "placeholder";
    sourceAsset: string;
  }>;
  lodSelections: Record<string, string>;
  lodSourceAssetCount: number;
  pathPointCount: number;
  scatterCountsByTag: Record<string, number>;
  scatterInstanceCount: number;
  sourceAssetCount: number;
  totalInstanceCount: number;
  terrain?: {
    id: string;
    max: readonly [number, number, number];
    min: readonly [number, number, number];
  };
}

type EnvironmentTerrain = NonNullable<NonNullable<IWebBundle["environmentScene"]>["terrain"]>;
type EnvironmentScene = NonNullable<IWebBundle["environmentScene"]>;
type EnvironmentSourceAsset = EnvironmentScene["sourceAssets"][number];
type EnvironmentInstance = EnvironmentScene["instances"][number];
type EnvironmentAsset = NonNullable<IWebBundle["assets"]>["assets"][number];

interface IEnvironmentTerrainRuntime {
  heightAt(x: number, z: number): number;
  mesh: THREE.Mesh;
  terrain: EnvironmentTerrain;
}

export function createEnvironmentRuntime(bundle: IWebBundle, options: { renderPlaceholders?: boolean } = {}): IEnvironmentRuntime | undefined {
  if (bundle.environmentScene === undefined) {
    return undefined;
  }
  const renderPlaceholders = options.renderPlaceholders ?? true;
  const instancingPlan = buildInstancingPlan(bundle.environmentScene);
  const terrain = bundle.environmentScene.terrain;
  const terrainRuntime = createTerrainRuntime(terrain, bundle.assets?.assets ?? []);
  const object = new THREE.Group();
  object.name = "tn-environment";
  const atmosphere = observeAtmosphereProfile(bundle.environmentScene.atmosphere);

  if (terrainRuntime !== undefined) {
    object.add(terrainRuntime.mesh);
  }

  const pathPoints = bundle.environmentScene.path.points.map((point) => new THREE.Vector3(point[0], terrainAdjustedY(point, terrainRuntime) + 0.08, point[2]));
  const path = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pathPoints),
    new THREE.LineBasicMaterial({ color: "#8b7a55" }),
  );
  path.name = `path:${bundle.environmentScene.path.id}`;
  object.add(path);
  object.add(createPathSurface(bundle.environmentScene.path.points, bundle.environmentScene.path.width, terrainRuntime));

  if (renderPlaceholders) {
    for (const group of instancingPlan.groups) {
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.35, 0.8, 0.35),
        new THREE.MeshBasicMaterial({ color: colorForSourceAsset(group.sourceAsset) }),
        group.count,
      );
      mesh.name = `instanced:${group.sourceAsset}`;
      group.instanceIds.forEach((id, index) => {
        const instance = bundle.environmentScene?.instances.find((item) => item.id === id);
        if (instance === undefined) {
          return;
        }
        mesh.setMatrixAt(index, matrixForInstance(adjustedTerrainPosition(instance.position, terrainRuntime), instance.scale, instance.rotation));
      });
      mesh.instanceMatrix.needsUpdate = true;
      object.add(mesh);
    }

    for (const item of instancingPlan.uninstanced) {
      const instance = bundle.environmentScene.instances.find((candidate) => candidate.id === item.id);
      if (instance === undefined) {
        continue;
      }
      const mesh = new THREE.Mesh(
        geometryForInstance(instance.tags ?? [], item.sourceAsset),
        new THREE.MeshBasicMaterial({ color: colorForSourceAsset(item.sourceAsset) }),
      );
      mesh.name = `environment:${instance.id}`;
      mesh.position.fromArray([...adjustedTerrainPosition(instance.position, terrainRuntime)]);
      mesh.scale.fromArray([...(instance.scale ?? [1, 1, 1])]);
      object.add(mesh);
    }
  }

  return { atmosphere, instancingPlan, object, observation: observeEnvironmentScene(bundle.environmentScene) };
}

export async function loadEnvironmentAssetInstances(bundle: IWebBundle, source: string): Promise<THREE.Group | undefined> {
  const scene = bundle.environmentScene;
  if (scene === undefined) {
    return undefined;
  }
  const sourceAssets = new Map(scene.sourceAssets.map((asset) => [asset.id, asset]));
  const assets = new Map(bundle.assets.assets.map((asset) => [asset.id, asset]));
  const terrain = scene.terrain;
  const terrainRuntime = createTerrainRuntime(terrain, bundle.assets.assets);
  const loader = new GLTFLoader();
  const models = new Map<string, THREE.Object3D>();
  const instancingPlan = buildInstancingPlan(scene);
  const instancesById = new Map(scene.instances.map((instance) => [instance.id, instance]));
  const instancedInstanceIds = new Set<string>();
  const group = new THREE.Group();
  group.name = "tn-environment-gltf-instances";

  async function loadModel(sourceAsset: EnvironmentSourceAsset | undefined): Promise<THREE.Object3D | undefined> {
    if (sourceAsset === undefined) {
      return undefined;
    }
    const asset = assets.get(sourceAsset.asset);
    const assetPath = asset?.kind === "model" ? asset.path : undefined;
    if (assetPath === undefined) {
      return undefined;
    }
    let model = models.get(sourceAsset.id);
    if (model === undefined) {
      const gltf = await loader.loadAsync(bundleUrl(source, assetPath));
      model = normalizeModel(gltf.scene, sourceAsset.category);
      models.set(sourceAsset.id, model);
    }
    return model;
  }

  for (const instancedGroup of instancingPlan.groups) {
    const sourceAsset = sourceAssets.get(instancedGroup.sourceAsset);
    const model = await loadModel(sourceAsset);
    if (model === undefined) {
      continue;
    }
    const instances = instancedGroup.instanceIds.map((id) => instancesById.get(id)).filter((instance): instance is EnvironmentInstance => instance !== undefined);
    const instancedObject = createInstancedModelGroup(model, instancedGroup.sourceAsset, instances, terrainRuntime);
    if (instancedObject === undefined) {
      continue;
    }
    for (const instance of instances) {
      instancedInstanceIds.add(instance.id);
    }
    group.add(instancedObject);
  }

  for (const instance of scene.instances) {
    if (instancedInstanceIds.has(instance.id)) {
      continue;
    }
    const sourceAsset = sourceAssets.get(instance.sourceAsset);
    const model = await loadModel(sourceAsset);
    if (model === undefined) {
      continue;
    }
    const object = new THREE.Group();
    object.name = `environment:${instance.id}`;
    object.position.fromArray([...adjustedTerrainPosition(instance.position, terrainRuntime)]);
    object.quaternion.fromArray([...(instance.rotation ?? [0, 0, 0, 1])]);
    object.scale.fromArray([...(instance.scale ?? [1, 1, 1])]);
    const normalizedModel = model.clone(true);
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    normalizedModel.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    object.add(normalizedModel);
    group.add(object);
  }

  return group;
}

export function createInstancedModelGroup(
  model: THREE.Object3D,
  sourceAsset: string,
  instances: readonly EnvironmentInstance[],
  terrain: EnvironmentTerrain | IEnvironmentTerrainRuntime | undefined,
): THREE.Group | undefined {
  const meshes: THREE.Mesh[] = [];
  model.updateMatrixWorld(true);
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshes.push(child);
    }
  });
  if (meshes.length === 0 || instances.length === 0) {
    return undefined;
  }

  const group = new THREE.Group();
  group.name = `instanced-gltf:${sourceAsset}`;
  for (const [meshIndex, sourceMesh] of meshes.entries()) {
    const material = Array.isArray(sourceMesh.material) ? sourceMesh.material.map((item) => item.clone()) : sourceMesh.material.clone();
    const instancedMesh = new THREE.InstancedMesh(sourceMesh.geometry, material, instances.length);
    instancedMesh.name = `instanced-gltf:${sourceAsset}:${meshIndex}`;
    instancedMesh.castShadow = sourceMesh.castShadow;
    instancedMesh.receiveShadow = true;
    instances.forEach((instance, index) => {
      const instanceMatrix = matrixForInstance(adjustedTerrainPosition(instance.position, terrain), instance.scale, instance.rotation);
      instancedMesh.setMatrixAt(index, instanceMatrix.multiply(sourceMesh.matrixWorld));
    });
    instancedMesh.instanceMatrix.needsUpdate = true;
    group.add(instancedMesh);
  }
  return group;
}

export function applyEnvironmentBookmark(bundle: IWebBundle, camera: THREE.Camera, bookmarkId: string): boolean {
  const bookmark = bundle.environmentScene?.bookmarks?.find((item) => item.id === bookmarkId);
  if (bookmark === undefined) {
    return false;
  }
  camera.position.fromArray([...bookmark.position]);
  camera.rotation.set(THREE.MathUtils.degToRad(bookmark.pitch), THREE.MathUtils.degToRad(bookmark.yaw - 180), 0, "YXZ");
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.fov = 62;
    camera.updateProjectionMatrix();
  }
  return true;
}

export function observeEnvironmentScene(scene: NonNullable<IWebBundle["environmentScene"]>): IEnvironmentObservation {
  const scatterCountsByTag: Record<string, number> = {};
  for (const instance of scene.instances) {
    if (instance.kind !== "scatter") {
      continue;
    }
    for (const tag of instance.tags ?? ["untagged"]) {
      scatterCountsByTag[tag] = (scatterCountsByTag[tag] ?? 0) + 1;
    }
  }
  return {
    bookmarks: (scene.bookmarks ?? []).map((bookmark) => bookmark.id).sort((left, right) => left.localeCompare(right)),
    heroPlacementIds: scene.instances
      .filter((instance) => instance.kind === "hero")
      .map((instance) => instance.id)
      .sort((left, right) => left.localeCompare(right)),
    lodSelections: selectLodsForDistance(scene, 32),
    lodSourceAssetCount: scene.sourceAssets.filter((asset) => asset.lod !== undefined && asset.lod.length > 0).length,
    pathPointCount: scene.path.points.length,
    scatterCountsByTag,
    scatterInstanceCount: scene.instances.filter((instance) => instance.kind === "scatter").length,
    sourceAssetCount: scene.sourceAssets.length,
    totalInstanceCount: scene.instances.length,
    terrain:
      scene.terrain === undefined
        ? undefined
        : {
            id: scene.terrain.id,
            max: scene.terrain.bounds.max,
            min: scene.terrain.bounds.min,
          },
  };
}

export function traceEnvironmentContent(bundle: IWebBundle): IEnvironmentObservation {
  if (bundle.environmentScene === undefined) {
    throw new Error("bundle does not contain environment.scene.json");
  }
  return observeEnvironmentSceneWithAssets(bundle.environmentScene, bundle.assets?.assets ?? []);
}

function observeEnvironmentSceneWithAssets(
  scene: NonNullable<IWebBundle["environmentScene"]>,
  assets: readonly NonNullable<IWebBundle["assets"]>["assets"][number][],
): IEnvironmentObservation {
  return {
    ...observeEnvironmentScene(scene),
    instancingGroups: repeatedAssetGroups(scene, assets),
  };
}

function repeatedAssetGroups(
  scene: NonNullable<IWebBundle["environmentScene"]>,
  assets: readonly NonNullable<IWebBundle["assets"]>["assets"][number][],
): NonNullable<IEnvironmentObservation["instancingGroups"]> {
  const counts = new Map<string, number>();
  for (const instance of scene.instances) {
    if (instance.kind !== "scatter") {
      continue;
    }
    if (instance.tags?.some((tag) => tag === "hero" || tag === "unique" || tag === "foreground") === true) {
      continue;
    }
    counts.set(instance.sourceAsset, (counts.get(instance.sourceAsset) ?? 0) + 1);
  }
  const sourceAssetIds = new Map(scene.sourceAssets.map((asset) => [asset.id, asset.asset]));
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([sourceAsset, count]) => {
      const asset = assetsById.get(sourceAssetIds.get(sourceAsset) ?? "");
      const modelBacked = asset?.kind === "model" && (asset.format === "gltf" || asset.format === "glb") && asset.path !== undefined;
      return {
        count,
        evidence: modelBacked ? "model-asset-backed" as const : "placeholder" as const,
        sourceAsset,
      };
    })
    .sort((left, right) => left.sourceAsset.localeCompare(right.sourceAsset));
}

function selectLodsForDistance(scene: NonNullable<IWebBundle["environmentScene"]>, distance: number): Record<string, string> {
  const selections: Record<string, string> = {};
  for (const sourceAsset of [...scene.sourceAssets].sort((left, right) => left.id.localeCompare(right.id))) {
    const selected = sourceAsset.lod
      ?.find((level) => distance >= level.minDistance && distance < level.maxDistance)
      ?.asset;
    selections[sourceAsset.id] = selected ?? sourceAsset.asset;
  }
  return selections;
}

function matrixForInstance(
  position: readonly [number, number, number],
  scale: readonly [number, number, number] | undefined,
  rotation: readonly [number, number, number, number] | undefined,
): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion(...(rotation ?? [0, 0, 0, 1])),
    new THREE.Vector3(...(scale ?? [1, 1, 1])),
  );
}

function createTerrainRuntime(terrain: EnvironmentTerrain | undefined, assets: readonly EnvironmentAsset[]): IEnvironmentTerrainRuntime | undefined {
  if (terrain === undefined) {
    return undefined;
  }
  if (terrain.heightMode === "heightmap" && terrain.chunks !== undefined && terrain.chunks.length > 0) {
    const runtime = createHeightmapTerrainRuntime(terrain, assets);
    if (runtime !== undefined) {
      return runtime;
    }
  }
  const mesh = createTerrainMesh(terrain);
  return { heightAt: (x, z) => terrainHeightAt(terrain, x, z), mesh, terrain };
}

function createHeightmapTerrainRuntime(terrain: EnvironmentTerrain, assets: readonly EnvironmentAsset[]): IEnvironmentTerrainRuntime | undefined {
  const chunk = terrain.chunks?.[0];
  const asset = chunk === undefined ? undefined : assets.find((candidate) => candidate.id === chunk.mesh);
  if (asset?.kind !== "mesh" || asset.primitive !== "custom" || !Array.isArray(asset.attributes)) {
    return undefined;
  }
  const position = asset.attributes.find((attribute) => attribute.name === "position" && attribute.itemSize === 3);
  if (position === undefined) {
    return undefined;
  }
  const geometry = customMeshGeometry(asset);
  applyTerrainVertexColors(geometry);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ roughness: 0.98, vertexColors: true }));
  mesh.name = `terrain:${terrain.id}`;
  mesh.receiveShadow = true;
  const sampler = heightfieldSampler(terrain, position.values);
  return { heightAt: sampler, mesh, terrain };
}

function customMeshGeometry(asset: Extract<EnvironmentAsset, { kind: "mesh" }>): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  for (const attribute of asset.attributes ?? []) {
    geometry.setAttribute(attribute.name, new THREE.Float32BufferAttribute(attribute.values, attribute.itemSize));
  }
  if (Array.isArray(asset.indices)) {
    geometry.setIndex(asset.indices);
  }
  return geometry;
}

function createTerrainMesh(terrain: EnvironmentTerrain): THREE.Mesh {
  const min = terrain.bounds.min;
  const max = terrain.bounds.max;
  const width = max[0] - min[0];
  const depth = max[2] - min[2];
  const subdivisions = terrain.heightMode === "controlPoints" ? 48 : 1;
  const geometry = new THREE.PlaneGeometry(width, depth, subdivisions, subdivisions);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2);
  if (terrain.heightMode === "controlPoints") {
    applyTerrainControlPoints(geometry, terrain);
  }
  applyTerrainVertexColors(geometry);
  geometry.computeVertexNormals();
  const ground = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ roughness: 0.98, vertexColors: true }),
  );
  ground.name = `terrain:${terrain.id}`;
  ground.receiveShadow = true;
  return ground;
}

function applyTerrainControlPoints(geometry: THREE.BufferGeometry, terrain: EnvironmentTerrain): void {
  const position = geometry.getAttribute("position");
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    position.setY(index, terrainHeightAt(terrain, x, z));
  }
  position.needsUpdate = true;
}

function applyTerrainVertexColors(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute("position");
  const colors: number[] = [];
  const low = new THREE.Color("#43573d");
  const mid = new THREE.Color("#64713f");
  const high = new THREE.Color("#7f8750");
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < position.count; index += 1) {
    const y = position.getY(index);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const range = Math.max(0.001, maxY - minY);
  for (let index = 0; index < position.count; index += 1) {
    const height = (position.getY(index) - minY) / range;
    const x = position.getX(index);
    const z = position.getZ(index);
    const noise = (Math.sin(x * 1.7 + z * 0.9) + 1) * 0.04;
    const color = height + noise < 0.5
      ? low.clone().lerp(mid, (height + noise) * 2)
      : mid.clone().lerp(high, (height + noise - 0.5) * 2);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
}

function createPathSurface(points: readonly (readonly [number, number, number])[], width: number, terrain: EnvironmentTerrain | IEnvironmentTerrainRuntime | undefined): THREE.Group {
  const group = new THREE.Group();
  group.name = "path-surface";
  if (points.length < 2) {
    return group;
  }
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const halfWidth = width / 2;
  let distance = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    if (index > 0) {
      const previous = points[index - 1]!;
      distance += Math.hypot(point[0] - previous[0], point[2] - previous[2]);
    }
    const normal = pathPointNormal(points, index);
    const y = terrainHeightAt(terrain, point[0], point[2]) + 0.08;
    positions.push(point[0] + normal.x * halfWidth, y, point[2] + normal.z * halfWidth);
    positions.push(point[0] - normal.x * halfWidth, y, point[2] - normal.z * halfWidth);
    uvs.push(0, distance, 1, distance);
    if (index < points.length - 1) {
      const left = index * 2;
      indices.push(left, left + 1, left + 2, left + 1, left + 3, left + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const path = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: "#8f7a55", roughness: 0.95 }),
  );
  path.name = "path-surface:0";
  group.add(path);
  return group;
}

function pathPointNormal(points: readonly (readonly [number, number, number])[], index: number): { x: number; z: number } {
  const previous = points[Math.max(0, index - 1)]!;
  const next = points[Math.min(points.length - 1, index + 1)]!;
  const dx = next[0] - previous[0];
  const dz = next[2] - previous[2];
  const length = Math.max(0.001, Math.hypot(dx, dz));
  return { x: dz / length, z: -dx / length };
}

function adjustedTerrainPosition(position: readonly [number, number, number], terrain: EnvironmentTerrain | IEnvironmentTerrainRuntime | undefined): readonly [number, number, number] {
  return [position[0], terrainAdjustedY(position, terrain), position[2]];
}

function terrainAdjustedY(position: readonly [number, number, number], terrain: EnvironmentTerrain | IEnvironmentTerrainRuntime | undefined): number {
  return position[1] + terrainHeightAt(terrain, position[0], position[2]);
}

function terrainHeightAt(terrain: EnvironmentTerrain | IEnvironmentTerrainRuntime | undefined, x: number, z: number): number {
  if (isTerrainRuntime(terrain)) {
    return terrain.heightAt(x, z);
  }
  if (terrain === undefined || terrain.heightMode !== "controlPoints") {
    return terrain?.bounds.min[1] ?? 0;
  }
  let weightedHeight = 0;
  let totalWeight = 0;
  for (const point of terrain.controlPoints ?? []) {
    const distance = Math.hypot(x - point[0], z - point[2]);
    const weight = Math.exp(-(distance * distance) / 18);
    weightedHeight += point[1] * weight;
    totalWeight += weight;
  }
  const baseHeight = totalWeight > 0 ? weightedHeight / totalWeight : terrain.bounds.min[1];
  return baseHeight + terrainDetailHeight(terrain, x, z);
}

function heightfieldSampler(terrain: EnvironmentTerrain, positions: readonly number[]): (x: number, z: number) => number {
  const collider = terrain.collider;
  if (collider === undefined) {
    return () => terrain.bounds.min[1];
  }
  const [width, depth] = collider.sampleCount;
  return (x, z) => {
    const localX = clamp((x - collider.origin[0]) / collider.cellSize, 0, width - 1);
    const localZ = clamp((z - collider.origin[2]) / collider.cellSize, 0, depth - 1);
    const x0 = Math.floor(localX);
    const z0 = Math.floor(localZ);
    const x1 = Math.min(width - 1, x0 + 1);
    const z1 = Math.min(depth - 1, z0 + 1);
    const tx = localX - x0;
    const tz = localZ - z0;
    const h00 = heightfieldVertexY(positions, width, x0, z0);
    const h10 = heightfieldVertexY(positions, width, x1, z0);
    const h01 = heightfieldVertexY(positions, width, x0, z1);
    const h11 = heightfieldVertexY(positions, width, x1, z1);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(h00, h10, tx), THREE.MathUtils.lerp(h01, h11, tx), tz);
  };
}

function heightfieldVertexY(positions: readonly number[], width: number, x: number, z: number): number {
  return positions[(z * width + x) * 3 + 1] ?? 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isTerrainRuntime(value: EnvironmentTerrain | IEnvironmentTerrainRuntime | undefined): value is IEnvironmentTerrainRuntime {
  return value !== undefined && "heightAt" in value;
}

function terrainDetailHeight(terrain: EnvironmentTerrain, x: number, z: number): number {
  const width = Math.max(0.001, terrain.bounds.max[0] - terrain.bounds.min[0]);
  const depth = Math.max(0.001, terrain.bounds.max[2] - terrain.bounds.min[2]);
  const scale = Math.min(width, depth);
  const amplitude = Math.min(0.24, scale * 0.012);
  const broad = Math.sin(x * 0.72 + z * 0.38) * 0.55;
  const cross = Math.cos(x * 0.31 - z * 0.86) * 0.32;
  const detail = Math.sin((x + z) * 1.18) * 0.13;
  return (broad + cross + detail) * amplitude;
}

function normalizeModel(model: THREE.Object3D, category: NonNullable<IWebBundle["environmentScene"]>["sourceAssets"][number]["category"]): THREE.Object3D {
  const clone = model.clone(true);
  const box = new THREE.Box3().setFromObject(clone);
  const size = box.getSize(new THREE.Vector3());
  const maxAxis = Math.max(size.x, size.y, size.z);
  if (maxAxis > 0) {
    clone.scale.multiplyScalar(sizeForCategory(category) / maxAxis);
  }
  const normalizedBox = new THREE.Box3().setFromObject(clone);
  clone.position.sub(new THREE.Vector3((normalizedBox.min.x + normalizedBox.max.x) / 2, normalizedBox.min.y, (normalizedBox.min.z + normalizedBox.max.z) / 2));
  return clone;
}

function sizeForCategory(category: NonNullable<IWebBundle["environmentScene"]>["sourceAssets"][number]["category"]): number {
  switch (category) {
    case "tree":
      return 4.2;
    case "terrain":
      return 1;
    case "rock":
      return 0.9;
    case "vegetation":
      return 1.2;
    case "grass":
      return 1;
    case "flower":
      return 0.3;
    case "mushroom":
      return 0.36;
    case "pebble":
      return 0.35;
  }
}

function bundleUrl(source: string, file: string): string {
  return `${source.replace(/\/$/, "")}/${file}`;
}

function geometryForInstance(tags: readonly string[], sourceAsset: string): THREE.BufferGeometry {
  if (tags.includes("tree") || sourceAsset.toLowerCase().includes("tree") || sourceAsset.toLowerCase().includes("pine")) {
    return new THREE.ConeGeometry(0.55, 2.4, 8);
  }
  if (tags.includes("rock") || sourceAsset.toLowerCase().includes("rock")) {
    return new THREE.DodecahedronGeometry(0.45, 0);
  }
  if (tags.includes("mushroom")) {
    return new THREE.SphereGeometry(0.22, 12, 8);
  }
  if (tags.includes("flower")) {
    return new THREE.SphereGeometry(0.14, 8, 6);
  }
  return new THREE.BoxGeometry(0.28, 0.45, 0.28);
}

function colorForSourceAsset(sourceAsset: string): THREE.Color {
  const normalized = sourceAsset.toLowerCase();
  if (normalized.includes("tree") || normalized.includes("pine")) {
    return new THREE.Color("#2f5f3f");
  }
  if (normalized.includes("rock")) {
    return new THREE.Color("#77766d");
  }
  if (normalized.includes("mushroom")) {
    return new THREE.Color("#d9c7a4");
  }
  if (normalized.includes("flower")) {
    return new THREE.Color("#d77b96");
  }
  if (normalized.includes("pebble")) {
    return new THREE.Color("#a0998c");
  }
  return new THREE.Color("#6aa05f");
}
