import * as THREE from "three";
import type { IAssetIr, IRuntimeDiagnostic, IWorldEntity, IWorldIr } from "@threenative/ir";
import { bundleUrl, isLoadableModelFormat } from "./assets.js";
import { colorToThree } from "./colors.js";
import { advanceOceanWaterRuntime, readOceanWater } from "./oceanWater.js";
import { applyTextureControls, canLoadImageInRuntime, enqueuePendingTextureLoad } from "./textureLoading.js";

export { createOceanWaterObject, readOceanWater, type IOceanWaterComponent } from "./oceanWater.js";

export interface IStylizedModelLoader {
  loadAsync(url: string): Promise<{ animations?: THREE.AnimationClip[]; scene: THREE.Object3D }>;
}

export interface IStylizedNatureComponent {
  barkColor?: string;
  density?: string;
  grassCount?: number;
  grassRootColor?: string;
  grassTipColor?: string;
  groundColor?: string;
  leafColor?: string;
  pathColor?: string;
  grassColorMap?: string;
  grassNormalMap?: string;
  grassRoughnessMap?: string;
  dirtColorMap?: string;
  dirtNormalMap?: string;
  dirtRoughnessMap?: string;
  dirtAoMap?: string;
  dirtHeightMap?: string;
  dirtMetallicMap?: string;
  pathMaskMap?: string;
  noiseMap?: string;
  grassModel?: string;
  treeLeavesModel?: string;
  treeTrunkModel?: string;
  leavesAlphaMap?: string;
  pathWidth?: number;
  size?: number;
  treeCount?: number;
  windStrength?: number;
}

const STYLIZED_NATURE_RUNTIME_DEFAULTS = {
  barkColor: "#684329",
  fallbackGrassCount: 4200,
  groundColor: "#4f9c45",
  grassGeometryRootColor: "#236c34",
  grassGeometryTipColor: "#a7df63",
  grassMaterialColor: "#6aa14f",
  leafColor: "#4d973c",
  pathWidth: 3,
  size: 34,
  sourceGrassCount: 5000,
  sourceSize: 40,
  treeCount: 7,
  windStrength: 0.35,
};

export interface IStylizedSparklesComponent {
  color?: string;
  count?: number;
  height?: number;
  radius?: number;
  secondaryColor?: string;
  seed?: number;
  size?: number;
  speed?: number;
}

export interface IRippleWaterComponent {
  color?: string;
  foamColor?: string;
  opacity?: number;
  rippleScale?: number;
  size?: number;
  speed?: number;
  waveStrength?: number;
}

export function hasStylizedNatureContent(world: IWorldIr): boolean {
  return world.entities.some(
    (entity) =>
      readStylizedNature(entity) !== undefined ||
      readStylizedSparkles(entity) !== undefined ||
      readRippleWater(entity) !== undefined ||
      readOceanWater(entity) !== undefined,
  );
}

export function readStylizedNature(entity: IWorldEntity): IStylizedNatureComponent | undefined {
  const value = entity.components.StylizedNature;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as IStylizedNatureComponent;
}

export function readStylizedSparkles(entity: IWorldEntity): IStylizedSparklesComponent | undefined {
  const value = entity.components.StylizedSparkles;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as IStylizedSparklesComponent;
}

export function readRippleWater(entity: IWorldEntity): IRippleWaterComponent | undefined {
  const value = entity.components.RippleWater;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as IRippleWaterComponent;
}

export function advanceStylizedNatureRuntime(object: THREE.Object3D, fixedDelta: number): void {
  advanceOceanWaterRuntime(object, fixedDelta);
  object.traverse((child) => {
    const grassState = child.userData.threeNativeGrassWind as IGrassWindState | undefined;
    if (grassState !== undefined && child instanceof THREE.InstancedMesh) {
      grassState.time += fixedDelta;
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      const euler = new THREE.Euler();
      for (let index = 0; index < grassState.count; index += 1) {
        const base = grassState.instances[index];
        if (base === undefined) {
          continue;
        }
        const gust = Math.sin(grassState.time * 2.4 + base.phase) * 0.16 + Math.sin(grassState.time * 4.1 + base.phase * 0.37) * 0.055;
        position.copy(base.position);
        euler.set(base.rotation.x + gust * 0.22, base.rotation.y, base.rotation.z + gust * grassState.windStrength);
        quaternion.setFromEuler(euler);
        scale.copy(base.scale);
        matrix.compose(position, quaternion, scale);
        child.setMatrixAt(index, matrix);
      }
      child.instanceMatrix.needsUpdate = true;
    }
    const rippleMaterial = child.userData.threeNativeRippleMaterial as THREE.ShaderMaterial | undefined;
    if (rippleMaterial !== undefined) {
      const uniform = rippleMaterial.uniforms.uTime;
      if (uniform !== undefined) {
        uniform.value = Number(uniform.value ?? 0) + fixedDelta;
      }
    }
  });
}

interface IGrassWindState {
  count: number;
  instances: Array<{ phase: number; position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }>;
  time: number;
  windStrength: number;
}

export async function attachStylizedSourceAssets(
  root: THREE.Group,
  component: IStylizedNatureComponent,
  assetsById: Map<string, IAssetIr>,
  source: string,
  loader: IStylizedModelLoader,
  diagnostics: IRuntimeDiagnostic[],
): Promise<void> {
  const grassAsset = modelAssetById(component.grassModel, assetsById, diagnostics, "grassModel");
  if (grassAsset !== undefined) {
    try {
      const gltf = await loader.loadAsync(bundleUrl(source, grassAsset.path));
      const geometry = firstMeshGeometry(gltf.scene);
      if (geometry !== undefined) {
        root.getObjectByName("lush-stylized-grass-clumps")?.removeFromParent();
        root.add(createSourceGrass(geometry, component));
      }
    } catch (error) {
      reportStylizedModelLoadError(diagnostics, grassAsset.id, error);
    }
  }

  const trunkAsset = modelAssetById(component.treeTrunkModel, assetsById, diagnostics, "treeTrunkModel");
  const leavesAsset = modelAssetById(component.treeLeavesModel, assetsById, diagnostics, "treeLeavesModel");
  if (trunkAsset === undefined || leavesAsset === undefined) {
    return;
  }
  try {
    const [trunkGltf, leavesGltf] = await Promise.all([
      loader.loadAsync(bundleUrl(source, trunkAsset.path)),
      loader.loadAsync(bundleUrl(source, leavesAsset.path)),
    ]);
    for (const child of [...root.children]) {
      if (child.name.startsWith("stylized-tree-") || child.name.startsWith("rounded-stylized-tree-")) {
        child.removeFromParent();
      }
    }
    const treeAnchors: Array<[number, number, number, number]> = [
      [13, -13, 0.0, 1.0],
      [-13, -13, 2.1, 0.9],
      [-13, 13, 4.0, 1.1],
      [13, 13, 1.0, 0.95],
    ];
    const treeCount = Math.min(Math.max(0, Math.floor(finiteNonNegative(component.treeCount, 4))), treeAnchors.length);
    for (let index = 0; index < treeCount; index += 1) {
      const [x, z, yaw, treeScale] = treeAnchors[index]!;
      const tree = createSourceTree(trunkGltf.scene, leavesGltf.scene, component, assetsById, diagnostics, source);
      tree.name = `source-stylized-tree-${index}`;
      tree.position.set(x, stylizedTerrainHeight(x, z), z);
      tree.rotation.y = yaw;
      tree.scale.setScalar(treeScale);
      root.add(tree);
    }
  } catch (error) {
    reportStylizedModelLoadError(diagnostics, `${trunkAsset.id}/${leavesAsset.id}`, error);
  }
}

function modelAssetById(
  assetId: string | undefined,
  assetsById: Map<string, IAssetIr>,
  diagnostics: IRuntimeDiagnostic[],
  slot: string,
): (Extract<IAssetIr, { kind: "model" }> & { path: string }) | undefined {
  if (assetId === undefined) {
    return undefined;
  }
  const asset = assetsById.get(assetId);
  if (asset?.kind !== "model" || asset.path === undefined || !isLoadableModelFormat(asset)) {
    diagnostics.push({
      code: "TN-WEB-STYLIZED-NATURE-MODEL-MISSING",
      message: `StylizedNature references missing model asset '${assetId}'.`,
      path: `world.ir.json/entities/*/components/StylizedNature/${slot}`,
      severity: "warning",
    });
    return undefined;
  }
  return asset as Extract<IAssetIr, { kind: "model" }> & { path: string };
}

function firstMeshGeometry(object: THREE.Object3D): THREE.BufferGeometry | undefined {
  let geometry: THREE.BufferGeometry | undefined;
  object.traverse((child) => {
    if (geometry === undefined && child instanceof THREE.Mesh) {
      geometry = child.geometry;
    }
  });
  return geometry;
}

function createSourceGrass(geometry: THREE.BufferGeometry, component: IStylizedNatureComponent): THREE.InstancedMesh {
  const grassCount = Math.max(0, Math.floor(finiteNonNegative(component.grassCount, STYLIZED_NATURE_RUNTIME_DEFAULTS.sourceGrassCount)));
  const size = finitePositive(component.size, STYLIZED_NATURE_RUNTIME_DEFAULTS.sourceSize);
  const pathWidth = finitePositive(component.pathWidth, STYLIZED_NATURE_RUNTIME_DEFAULTS.pathWidth);
  const windStrength = finiteNonNegative(component.windStrength, STYLIZED_NATURE_RUNTIME_DEFAULTS.windStrength);
  const material = new THREE.MeshStandardMaterial({ color: colorToThree(component.grassRootColor ?? STYLIZED_NATURE_RUNTIME_DEFAULTS.grassMaterialColor), roughness: 0.85, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geometry.clone(), material, grassCount);
  mesh.name = "source-grass-blades-up";
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const random = seededRandom(1337);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const windInstances: IGrassWindState["instances"] = [];
  let written = 0;
  for (let attempts = 0; written < grassCount && attempts < grassCount * 4; attempts += 1) {
    const x = (random() - 0.5) * size;
    const z = (random() - 0.5) * size;
    if (stylizedSourcePathMask(x, z, size, pathWidth) > 0.16) {
      continue;
    }
    position.set(x, stylizedTerrainHeight(x, z), z);
    euler.set(0, random() * Math.PI * 2, 0);
    quaternion.setFromEuler(euler);
    const instanceScale = 1.3 * (0.85 + random() * 0.35);
    scale.set(instanceScale, instanceScale, instanceScale);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(written, matrix);
    windInstances.push({ phase: random() * Math.PI * 2 + x * 0.17 + z * 0.11, position: position.clone(), rotation: euler.clone(), scale: scale.clone() });
    written += 1;
  }
  mesh.count = written;
  mesh.userData.threeNativeGrassWind = { count: written, instances: windInstances, time: 0, windStrength } satisfies IGrassWindState;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function createSourceTree(
  trunkScene: THREE.Object3D,
  leavesScene: THREE.Object3D,
  component: IStylizedNatureComponent,
  assetsById: Map<string, IAssetIr>,
  diagnostics: IRuntimeDiagnostic[],
  source: string,
): THREE.Group {
  const tree = new THREE.Group();
  const trunk = trunkScene.clone(true);
  trunk.name = "source-tree-trunk";
  trunk.scale.setScalar(12);
  trunk.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  tree.add(trunk);
  const leavesGeometry = firstMeshGeometry(leavesScene);
  if (leavesGeometry !== undefined) {
    const leafMaterial = new THREE.MeshStandardMaterial({
      color: colorToThree(component.leafColor ?? "#4a6b27"),
      roughness: 0.8,
      metalness: 0,
      side: THREE.DoubleSide,
      alphaTest: 0.1,
    });
    leafMaterial.alphaMap = stylizedTexture(component.leavesAlphaMap, assetsById, diagnostics, source, "leavesAlpha") ?? null;
    leafMaterial.needsUpdate = true;
    const leaves = new THREE.InstancedMesh(
      leavesGeometry.clone(),
      leafMaterial,
      3,
    );
    leaves.name = "source-tree-leaves";
    leaves.frustumCulled = false;
    leaves.castShadow = true;
    const bushes: Array<[number, number, number, number, number]> = [
      [-0.47, 7.59, 0.48, 0.0, 0.85],
      [-3.87, 6.79, -4.47, 1.3, 0.76],
      [-2.08, 10.5, 0.18, 2.5, 0.9],
    ];
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < bushes.length; index += 1) {
      const [x, y, z, yaw, sourceScale] = bushes[index]!;
      matrix.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(sourceScale, sourceScale, sourceScale));
      leaves.setMatrixAt(index, matrix);
    }
    leaves.instanceMatrix.needsUpdate = true;
    tree.add(leaves);
  }
  return tree;
}

function reportStylizedModelLoadError(diagnostics: IRuntimeDiagnostic[], assetId: string, error: unknown): void {
  const reason = error instanceof Error ? ` ${error.message}` : "";
  diagnostics.push({
    code: "TN-WEB-STYLIZED-NATURE-MODEL-LOAD-FAILED",
    message: `Failed to load StylizedNature model asset '${assetId}'.${reason}`,
    path: "world.ir.json/entities/*/components/StylizedNature",
    severity: "warning",
  });
}

export function createStylizedNatureObject(
  component: IStylizedNatureComponent,
  assetsById: Map<string, IAssetIr>,
  diagnostics: IRuntimeDiagnostic[],
  source?: string,
): THREE.Group {
  const size = finitePositive(component.size, STYLIZED_NATURE_RUNTIME_DEFAULTS.size);
  const half = size / 2;
  const grassCount = Math.max(0, Math.floor(finiteNonNegative(component.grassCount, STYLIZED_NATURE_RUNTIME_DEFAULTS.fallbackGrassCount)));
  const treeCount = Math.max(0, Math.floor(finiteNonNegative(component.treeCount, STYLIZED_NATURE_RUNTIME_DEFAULTS.treeCount)));
  const pathWidth = finitePositive(component.pathWidth, STYLIZED_NATURE_RUNTIME_DEFAULTS.pathWidth);
  const windStrength = finiteNonNegative(component.windStrength, STYLIZED_NATURE_RUNTIME_DEFAULTS.windStrength);
  const root = new THREE.Group();
  root.name = "StylizedNature";
  root.userData.threeNativeStylizedNature = { ...component, grassCount, treeCount, windStrength, artDirection: "source-stylized-scene" };

  // Source-backed stylized scenes use the authored equirectangular skybox/environment;
  // keep the old fake sky card out of the render so it cannot hide color/parity bugs.
  const ground = new THREE.Mesh(
    createRollingTerrainGeometry(size, 256, pathWidth),
    stylizedGroundMaterial(component, assetsById, diagnostics, source, {
      color: component.groundColor ?? STYLIZED_NATURE_RUNTIME_DEFAULTS.groundColor,
      sourceMap: component.grassColorMap,
      sourceNormalMap: component.grassNormalMap,
      sourceRoughnessMap: component.grassRoughnessMap,
      sourceDirtMap: component.dirtColorMap,
      sourceDirtNormalMap: component.dirtNormalMap,
      sourceDirtRoughnessMap: component.dirtRoughnessMap,
      sourceDirtAoMap: component.dirtAoMap,
      sourcePathMaskMap: component.pathMaskMap,
      sourceNoiseMap: component.noiseMap,
      roughness: 0.88,
    }),
  );
  ground.name = "stylized-rolling-grass-ground";
  ground.receiveShadow = true;
  root.add(ground);

  const grassGeometry = createGrassBladeGeometry(
    colorToThree(component.grassRootColor ?? STYLIZED_NATURE_RUNTIME_DEFAULTS.grassGeometryRootColor),
    colorToThree(component.grassTipColor ?? STYLIZED_NATURE_RUNTIME_DEFAULTS.grassGeometryTipColor),
  );
  const grassMaterial = stylizedTextureMaterial(component, assetsById, diagnostics, source, {
    color: component.grassRootColor ?? STYLIZED_NATURE_RUNTIME_DEFAULTS.grassMaterialColor,
    sourceMap: component.grassColorMap,
    sourceNormalMap: component.grassNormalMap,
    sourceRoughnessMap: component.grassRoughnessMap,
    roughness: 0.74,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  const grass = new THREE.InstancedMesh(grassGeometry, grassMaterial, grassCount);
  grass.name = "lush-stylized-grass-clumps";
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  const random = seededRandom(1337);
  const windInstances: IGrassWindState["instances"] = [];
  let written = 0;
  for (let attempts = 0; written < grassCount && attempts < grassCount * 4; attempts += 1) {
    const zBias = Math.pow(random(), 1.65);
    const z = half - zBias * size;
    const x = (random() - 0.5) * size * (0.72 + zBias * 0.32);
    const pathMask = stylizedSourcePathMask(x, z, size, pathWidth);
    if (pathMask > 0.14 + random() * 0.12) {
      continue;
    }
    const y = stylizedTerrainHeight(x, z) + 0.035;
    position.set(x, y, z);
    euler.set((random() - 0.5) * 0.12, random() * Math.PI * 2, (random() - 0.5) * windStrength);
    quaternion.setFromEuler(euler);
    const foregroundBoost = z > 0 ? 1.55 : 1.1;
    const bladeScale = foregroundBoost * (0.85 + random() * 1.25);
    scale.set(bladeScale, bladeScale * (0.9 + random() * 0.8), bladeScale);
    matrix.compose(position, quaternion, scale);
    grass.setMatrixAt(written, matrix);
    windInstances.push({ phase: random() * Math.PI * 2 + x * 0.17 + z * 0.11, position: position.clone(), rotation: euler.clone(), scale: scale.clone() });
    written += 1;
  }
  grass.count = written;
  grass.userData.threeNativeGrassWind = { count: written, instances: windInstances, time: 0, windStrength } satisfies IGrassWindState;
  grass.instanceMatrix.needsUpdate = true;
  grass.castShadow = true;
  root.add(grass);

  const treeAnchors: Array<[number, number, number, number]> = [
    [13, -13, 0.0, 1.0],
    [-13, -13, 2.1, 0.9],
    [-13, 13, 4.0, 1.1],
    [13, 13, 1.0, 0.95],
  ];
  for (let index = 0; index < Math.min(treeCount, treeAnchors.length); index += 1) {
    const anchor = treeAnchors[index];
    if (anchor === undefined) {
      continue;
    }
    const [x, z, yaw, sourceScale] = anchor;
    const tree = createStylizedTree(component, index);
    tree.position.set(x, stylizedTerrainHeight(x, z), z);
    tree.rotation.y = yaw;
    tree.scale.setScalar(sourceScale);
    root.add(tree);
  }

  return root;
}

function stylizedTextureMaterial(
  _component: IStylizedNatureComponent,
  assetsById: Map<string, IAssetIr>,
  diagnostics: IRuntimeDiagnostic[],
  source: string | undefined,
  options: {
    color: string;
    sourceMap?: string;
    sourceNormalMap?: string;
    sourceRoughnessMap?: string;
    roughness: number;
    side?: THREE.Side;
    vertexColors?: boolean;
  },
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: typeof options.color === "string" ? colorToThree(options.color) : options.color,
    roughness: options.roughness,
    side: options.side,
    vertexColors: options.vertexColors,
  });
  material.map = stylizedTexture(options.sourceMap, assetsById, diagnostics, source, "baseColor") ?? null;
  if (material.map !== null) {
    material.map.wrapS = THREE.RepeatWrapping;
    material.map.wrapT = THREE.RepeatWrapping;
    material.map.repeat.set(8, 8);
    material.map.colorSpace = THREE.SRGBColorSpace;
  }
  material.normalMap = stylizedTexture(options.sourceNormalMap, assetsById, diagnostics, source, "normal") ?? null;
  if (material.normalMap !== null) {
    material.normalMap.wrapS = THREE.RepeatWrapping;
    material.normalMap.wrapT = THREE.RepeatWrapping;
    material.normalMap.repeat.set(8, 8);
  }
  material.roughnessMap = stylizedTexture(options.sourceRoughnessMap, assetsById, diagnostics, source, "roughness") ?? null;
  if (material.roughnessMap !== null) {
    material.roughnessMap.wrapS = THREE.RepeatWrapping;
    material.roughnessMap.wrapT = THREE.RepeatWrapping;
    material.roughnessMap.repeat.set(8, 8);
  }
  material.needsUpdate = true;
  return material;
}

function stylizedGroundMaterial(
  component: IStylizedNatureComponent,
  assetsById: Map<string, IAssetIr>,
  diagnostics: IRuntimeDiagnostic[],
  source: string | undefined,
  options: {
    color: string;
    sourceMap?: string;
    sourceNormalMap?: string;
    sourceRoughnessMap?: string;
    sourceDirtMap?: string;
    sourceDirtNormalMap?: string;
    sourceDirtRoughnessMap?: string;
    sourceDirtAoMap?: string;
    sourcePathMaskMap?: string;
    sourceNoiseMap?: string;
    roughness: number;
  },
): THREE.MeshStandardMaterial {
  const material = stylizedTextureMaterial(component, assetsById, diagnostics, source, {
    color: options.color,
    sourceMap: options.sourceMap,
    sourceNormalMap: options.sourceNormalMap,
    sourceRoughnessMap: options.sourceRoughnessMap,
    roughness: options.roughness,
  });
  material.name = "stylized-source-ground-material";
  material.vertexColors = false;

  const dirtMap = stylizedTexture(options.sourceDirtMap, assetsById, diagnostics, source, "dirtBaseColor");
  const dirtRoughnessMap = stylizedTexture(options.sourceDirtRoughnessMap, assetsById, diagnostics, source, "dirtRoughness");
  const dirtAoMap = stylizedTexture(options.sourceDirtAoMap, assetsById, diagnostics, source, "dirtAo");
  const pathMaskMap = stylizedTexture(options.sourcePathMaskMap, assetsById, diagnostics, source, "pathMask");
  const noiseMap = stylizedTexture(options.sourceNoiseMap, assetsById, diagnostics, source, "noise");

  for (const texture of [dirtMap, dirtRoughnessMap, dirtAoMap]) {
    if (texture !== undefined) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(8, 8);
    }
  }
  for (const texture of [pathMaskMap, noiseMap]) {
    if (texture !== undefined) {
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.repeat.set(1, 1);
    }
  }

  if (dirtMap === undefined || pathMaskMap === undefined) {
    return material;
  }

  material.userData.threeNativeStylizedGround = {
    dirtMap: dirtMap.name,
    dirtRoughnessMap: dirtRoughnessMap?.name,
    dirtAoMap: dirtAoMap?.name,
    pathMaskMap: pathMaskMap.name,
    noiseMap: noiseMap?.name,
    blend: "source-path-mask-smoothstep",
  };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.threeNativeDirtMap = { value: dirtMap };
    shader.uniforms.threeNativeDirtRoughnessMap = { value: dirtRoughnessMap ?? dirtMap };
    shader.uniforms.threeNativeDirtAoMap = { value: dirtAoMap ?? dirtMap };
    shader.uniforms.threeNativePathMaskMap = { value: pathMaskMap };
    shader.uniforms.threeNativeNoiseMap = { value: noiseMap ?? pathMaskMap };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float threeNativePathMask;
varying float vThreeNativePathMask;`,
      )
      .replace(
        "#include <begin_vertex>",
        `vThreeNativePathMask = threeNativePathMask;
#include <begin_vertex>`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D threeNativeDirtMap;
uniform sampler2D threeNativeDirtRoughnessMap;
uniform sampler2D threeNativeDirtAoMap;
uniform sampler2D threeNativePathMaskMap;
uniform sampler2D threeNativeNoiseMap;
varying float vThreeNativePathMask;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
vec2 threeNativeGroundUv = vMapUv / 8.0;
vec2 threeNativeTiledUv = vMapUv;
vec3 threeNativeDirtColor = texture2D(threeNativeDirtMap, threeNativeTiledUv).rgb;
float threeNativeMask = max(texture2D(threeNativePathMaskMap, threeNativeGroundUv).r, vThreeNativePathMask);
float threeNativeNoise = texture2D(threeNativeNoiseMap, threeNativeGroundUv * 2.0).r;
float threeNativeAdjustedMask = clamp(threeNativeMask + (threeNativeNoise - 0.5) * 0.18, 0.0, 1.0);
float threeNativeDirtWeight = smoothstep(0.35, 0.55, threeNativeAdjustedMask);
float threeNativeAo = texture2D(threeNativeDirtAoMap, threeNativeTiledUv).r;
diffuseColor.rgb = mix(diffuseColor.rgb, threeNativeDirtColor * mix(0.72, 1.0, threeNativeAo), threeNativeDirtWeight);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
float threeNativeDirtRoughness = texture2D(threeNativeDirtRoughnessMap, vMapUv).g;
float threeNativeRoughMask = max(texture2D(threeNativePathMaskMap, vMapUv / 8.0).r, vThreeNativePathMask);
roughnessFactor = mix(roughnessFactor, threeNativeDirtRoughness, smoothstep(0.35, 0.55, threeNativeRoughMask));`,
      );
  };
  material.customProgramCacheKey = () => "threenative-stylized-ground-source-blend-v1";
  material.needsUpdate = true;
  return material;
}

function stylizedTexture(
  assetId: string | undefined,
  assetsById: Map<string, IAssetIr>,
  diagnostics: IRuntimeDiagnostic[],
  source: string | undefined,
  slot: string,
): THREE.Texture | undefined {
  if (assetId === undefined) {
    return undefined;
  }
  const asset = assetsById.get(assetId);
  if (asset?.kind !== "texture" || asset.path === undefined) {
    diagnostics.push({
      code: "TN-WEB-STYLIZED-NATURE-TEXTURE-MISSING",
      message: `StylizedNature references missing texture asset '${assetId}'.`,
      path: `world.ir.json/entities/*/components/StylizedNature/${slot}`,
      severity: "warning",
    });
    return undefined;
  }
  const url = source === undefined ? asset.path : `${source.replace(/\/$/, "")}/${asset.path}`;
  const texture = new THREE.Texture();
  texture.name = asset.id;
  texture.userData = {
    ...texture.userData,
    threenativeAssetId: asset.id,
    threenativeSlot: `stylized:${slot}`,
    threenativeUrl: url,
  };
  applyTextureControls(texture, asset);
  if (canLoadImageInRuntime()) {
    enqueuePendingTextureLoad(
      new THREE.TextureLoader()
        .loadAsync(url)
        .then((loaded) => {
          texture.image = loaded.image;
          texture.colorSpace = slot === "baseColor" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          texture.needsUpdate = true;
        })
        .catch(() => undefined),
    );
  }
  return texture;
}

function stylizedPathCenter(z: number): number {
  return Math.sin(z * 0.18) * 1.35 + Math.sin(z * 0.055 + 1.2) * 0.9;
}

function stylizedTerrainHeight(x: number, z: number): number {
  const rise = Math.max(0, -z) * 0.055;
  return rise + Math.sin(x * 0.18 + z * 0.12) * 0.12 + Math.cos(z * 0.2) * 0.08;
}

function createRollingTerrainGeometry(size: number, segments: number, pathWidth: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const pathMasks: number[] = [];
  const indices: number[] = [];
  const dark = new THREE.Color("#3f8b3b");
  const mid = new THREE.Color("#5eaa45");
  const light = new THREE.Color("#79bd4e");
  for (let zi = 0; zi <= segments; zi += 1) {
    const z = -size / 2 + (zi / segments) * size;
    for (let xi = 0; xi <= segments; xi += 1) {
      const x = -size / 2 + (xi / segments) * size;
      const pathMask = stylizedSourcePathMask(x, z, size, pathWidth);
      const y = stylizedTerrainHeight(x, z) - pathMask * 0.25;
      positions.push(x, y, z);
      uvs.push(xi / segments, 1 - zi / segments);
      pathMasks.push(pathMask);
      const pathDistance = Math.abs(x - stylizedPathCenter(z));
      const tint = light.clone().lerp(mid, Math.min(1, Math.max(0, (z + size / 2) / size) * 0.55));
      if (pathDistance < pathWidth * 1.8) {
        tint.lerp(new THREE.Color("#66a746"), 0.35);
      }
      tint.lerp(dark, Math.max(0, -z / size) * 0.22);
      colors.push(tint.r, tint.g, tint.b);
    }
  }
  for (let zi = 0; zi < segments; zi += 1) {
    for (let xi = 0; xi < segments; xi += 1) {
      const a = zi * (segments + 1) + xi;
      indices.push(a, a + segments + 1, a + 1, a + 1, a + segments + 1, a + segments + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("threeNativePathMask", new THREE.Float32BufferAttribute(pathMasks, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function stylizedSourcePathMask(x: number, z: number, size: number, pathWidth: number): number {
  const verticalCenter = Math.sin(z * 0.18) * 1.15 + Math.sin(z * 0.055 + 1.2) * 0.75;
  const vertical = 1 - smoothstep(pathWidth * 0.42, pathWidth * 0.9, Math.abs(x - verticalCenter));

  const horizontalCenter = Math.sin(x * 0.12 + 0.8) * 1.1;
  const horizontal = 1 - smoothstep(pathWidth * 0.34, pathWidth * 0.82, Math.abs(z - horizontalCenter));

  const branchCenter = -9 + Math.sin((x + size * 0.25) * 0.2) * 1.1;
  const branch = 1 - smoothstep(pathWidth * 0.24, pathWidth * 0.64, Math.abs(z - branchCenter));
  const branchGate = smoothstep(-size * 0.42, -size * 0.05, x) * (1 - smoothstep(size * 0.18, size * 0.42, x));

  const breakup = 0.5 + 0.5 * Math.sin(x * 1.7 + z * 0.9) * Math.sin(x * 0.6 - z * 1.2);
  const mask = Math.max(vertical, horizontal, branch * branchGate);
  return Math.min(1, Math.max(0, mask + (breakup - 0.5) * 0.16));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const x = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

function createWindingPathGeometry(size: number, pathWidth: number): THREE.BufferGeometry {
  const steps = 72;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const centerColor = new THREE.Color("#b77745");
  const edgeColor = new THREE.Color("#75462e");
  for (let step = 0; step <= steps; step += 1) {
    const z = size / 2 - (step / steps) * size;
    const center = stylizedPathCenter(z);
    const nextCenter = stylizedPathCenter(z - size / steps);
    const tangent = new THREE.Vector2(nextCenter - center, -size / steps).normalize();
    const normal = new THREE.Vector2(-tangent.y, tangent.x);
    for (const side of [-1, 0, 1]) {
      const width = side === 0 ? 0 : pathWidth * (0.5 + 0.07 * Math.sin(step * 0.7));
      const x = center + normal.x * width * side;
      const zz = z + normal.y * width * side;
      positions.push(x, stylizedTerrainHeight(x, zz) + 0.035, zz);
      const c = side === 0 ? centerColor : edgeColor;
      colors.push(c.r, c.g, c.b);
    }
  }
  for (let step = 0; step < steps; step += 1) {
    const row = step * 3;
    const next = row + 3;
    indices.push(row, next, row + 1, row + 1, next, next + 1, row + 1, next + 1, row + 2, row + 2, next + 1, next + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createPathPebbles(size: number, pathWidth: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "reddish-path-pebbles";
  const random = seededRandom(2401);
  const material = new THREE.MeshStandardMaterial({ color: "#c18455", roughness: 1 });
  const geometry = new THREE.BoxGeometry(0.42, 0.045, 0.22);
  const count = 96;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  for (let index = 0; index < count; index += 1) {
    const z = size / 2 - (index / count) * size + (random() - 0.5) * 0.45;
    const center = stylizedPathCenter(z);
    const x = center + (random() - 0.5) * pathWidth * 0.72;
    position.set(x, stylizedTerrainHeight(x, z) + 0.09, z);
    euler.set(0, random() * Math.PI, 0);
    quaternion.setFromEuler(euler);
    const s = 0.8 + random() * 0.75;
    scale.set(s, 1, 0.8 + random() * 0.6);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

function createSkyBackdrop(size: number): THREE.Group {
  const group = new THREE.Group();
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 2.8, size * 1.15),
    new THREE.MeshBasicMaterial({ color: "#8fd3ff", side: THREE.DoubleSide }),
  );
  sky.name = "soft-blue-sky-card";
  sky.position.set(0, 8.4, -size * 0.68);
  group.add(sky);
  const cloudMaterial = new THREE.MeshBasicMaterial({ color: "#f5f7f0", side: THREE.DoubleSide });
  const cloudSpecs: Array<[number, number, number, number, number]> = [
    [-9, 8.8, -size * 0.66, 3.3, 0.95],
    [-5.8, 9.25, -size * 0.665, 2.5, 0.78],
    [6.8, 8.35, -size * 0.67, 3.6, 1.0],
    [10.4, 8.9, -size * 0.675, 2.6, 0.72],
  ];
  for (const [x, y, z, sx, sy] of cloudSpecs) {
    const cloud = new THREE.Mesh(new THREE.CircleGeometry(1, 24), cloudMaterial);
    cloud.name = "soft-stylized-cloud";
    cloud.position.set(x, y, z);
    cloud.scale.set(sx, sy, 1);
    group.add(cloud);
  }
  return group;
}

function createGrassBladeGeometry(rootColor: THREE.Color, tipColor: THREE.Color): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const addBlade = (angle: number, offsetX: number, offsetZ: number, height: number, width: number, bend: number) => {
    const base = positions.length / 3;
    const rightX = Math.cos(angle) * width;
    const rightZ = Math.sin(angle) * width;
    const bendX = Math.cos(angle + Math.PI / 2) * bend;
    const bendZ = Math.sin(angle + Math.PI / 2) * bend;
    positions.push(
      offsetX - rightX, 0, offsetZ - rightZ,
      offsetX + rightX, 0, offsetZ + rightZ,
      offsetX + bendX * 0.45, height * 0.58, offsetZ + bendZ * 0.45,
      offsetX + bendX, height, offsetZ + bendZ,
    );
    colors.push(
      rootColor.r, rootColor.g, rootColor.b,
      rootColor.r, rootColor.g, rootColor.b,
      tipColor.r * 0.85, tipColor.g * 0.85, tipColor.b * 0.85,
      tipColor.r, tipColor.g, tipColor.b,
    );
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let blade = 0; blade < 7; blade += 1) {
    const angle = (blade / 7) * Math.PI * 2;
    const ring = blade === 0 ? 0 : 0.035 + (blade % 3) * 0.012;
    addBlade(
      angle,
      Math.cos(angle) * ring,
      Math.sin(angle) * ring,
      0.42 + (blade % 4) * 0.09,
      0.025 + (blade % 2) * 0.01,
      0.055 + (blade % 3) * 0.035,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createStylizedTree(component: IStylizedNatureComponent, index: number): THREE.Group {
  const tree = new THREE.Group();
  tree.name = `rounded-stylized-tree-${index}`;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.28, 1.45, 7),
    new THREE.MeshStandardMaterial({ color: colorToThree(component.barkColor ?? STYLIZED_NATURE_RUNTIME_DEFAULTS.barkColor), roughness: 0.95 }),
  );
  trunk.position.y = 0.72;
  trunk.castShadow = true;
  tree.add(trunk);

  const leafMaterial = new THREE.MeshStandardMaterial({ color: colorToThree(component.leafColor ?? STYLIZED_NATURE_RUNTIME_DEFAULTS.leafColor), roughness: 0.82 });
  const canopyOffsets: Array<[number, number, number, number]> = [
    [0, 1.72, 0, 0.95],
    [-0.48, 1.55, 0.12, 0.68],
    [0.5, 1.58, -0.08, 0.72],
    [0.08, 2.05, 0.04, 0.66],
  ];
  for (const [x, y, z, radius] of canopyOffsets) {
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), leafMaterial);
    leaves.position.set(x, y, z);
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    tree.add(leaves);
  }
  return tree;
}

export function createRippleWaterObject(component: IRippleWaterComponent): THREE.Group {
  const size = finitePositive(component.size, 5.8);
  const waveStrength = finiteNonNegative(component.waveStrength, 0.22);
  const rippleScale = finitePositive(component.rippleScale, 6.5);
  const speed = finiteNonNegative(component.speed, 0.9);
  const opacity = Math.min(1, finitePositive(component.opacity, 0.78));
  const group = new THREE.Group();
  group.name = "RippleWaterPond";

  const basin = new THREE.Mesh(
    new THREE.CircleGeometry(size * 0.56, 64),
    new THREE.MeshStandardMaterial({ color: "#314f37", roughness: 0.96 }),
  );
  basin.name = "pond-dark-underwater-bed";
  basin.rotation.x = -Math.PI / 2;
  basin.position.y = 0.018;
  basin.scale.set(1.25, 0.68, 1);
  basin.receiveShadow = true;
  group.add(basin);

  const waterMaterial = new THREE.ShaderMaterial({
    name: "EvanWallaceBorrowedRippleWaterShader",
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uBaseColor: { value: colorToThree(component.color ?? "#40c4df") },
      uFoamColor: { value: colorToThree(component.foamColor ?? "#d5fbff") },
      uOpacity: { value: opacity },
      uRippleScale: { value: rippleScale },
      uSpeed: { value: speed },
      uWaveStrength: { value: waveStrength },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uRippleScale;
      uniform float uSpeed;
      uniform float uWaveStrength;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      float ripple(vec2 p, vec2 c, float phase) {
        float d = distance(p, c);
        return sin(d * uRippleScale * 6.28318 - uTime * uSpeed * 3.2 + phase) * exp(-d * 1.7);
      }
      void main() {
        vUv = uv;
        vec3 transformed = position;
        vec2 p = uv * 2.0 - 1.0;
        float h = ripple(p, vec2(-0.28, 0.18), 0.0) + ripple(p, vec2(0.36, -0.22), 1.7) * 0.72;
        transformed.z += h * uWaveStrength;
        vec4 world = modelMatrix * vec4(transformed, 1.0);
        vWorldPosition = world.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uBaseColor;
      uniform vec3 uFoamColor;
      uniform float uOpacity;
      uniform float uRippleScale;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      float ring(vec2 p, vec2 c, float phase) {
        float d = distance(p, c);
        float wave = sin(d * uRippleScale * 6.28318 - uTime * 2.8 + phase);
        return smoothstep(0.72, 1.0, wave) * exp(-d * 1.9);
      }
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float edge = smoothstep(1.04, 0.72, length(vec2(p.x * 0.72, p.y * 1.2)));
        if (edge < 0.02) discard;
        float waves = ring(p, vec2(-0.28, 0.18), 0.0) + ring(p, vec2(0.36, -0.22), 1.7) * 0.85;
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float fresnel = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 3.0);
        vec3 shallow = mix(uBaseColor * 0.58, uBaseColor * 1.35, vUv.y);
        vec3 color = mix(shallow, vec3(0.92, 0.98, 1.0), fresnel * 0.72);
        color = mix(color, uFoamColor, clamp(waves * 0.32 + fresnel * 0.22, 0.0, 0.55));
        gl_FragColor = vec4(color, uOpacity * edge);
      }
    `,
  });

  const water = new THREE.Mesh(new THREE.CircleGeometry(size * 0.54, 96), waterMaterial);
  water.name = "borrowed-webgl-water-ripple-surface";
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.085;
  water.scale.set(1.25, 0.68, 1);
  water.userData.threeNativeRippleMaterial = waterMaterial;
  group.add(water);

  const rimMaterial = new THREE.MeshStandardMaterial({ color: "#5c8d45", roughness: 0.94 });
  for (let index = 0; index < 26; index += 1) {
    const angle = (index / 26) * Math.PI * 2;
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18 + (index % 4) * 0.035, 0), rimMaterial);
    rock.name = "pond-grass-bank-rock";
    rock.position.set(Math.cos(angle) * size * 0.68, 0.13, Math.sin(angle) * size * 0.38);
    rock.scale.set(1.35, 0.38, 0.82);
    rock.rotation.y = angle;
    rock.castShadow = true;
    group.add(rock);
  }

  return group;
}

export function createStylizedSparklesObject(component: IStylizedSparklesComponent): THREE.Group {
  const count = Math.max(0, Math.floor(finiteNonNegative(component.count, 96)));
  const radius = finitePositive(component.radius, 10);
  const height = finitePositive(component.height, 3.2);
  const size = finitePositive(component.size, 0.14);
  const random = seededRandom(Math.floor(finiteNonNegative(component.seed, 4242)));
  const group = new THREE.Group();
  group.name = "stylized-sparkles";
  const primary = colorToThree(component.color ?? "#fff3a6");
  const secondary = colorToThree(component.secondaryColor ?? "#89d7ff");
  const primaryMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(size, 1),
    new THREE.MeshBasicMaterial({ color: primary, toneMapped: false }),
    count,
  );
  const secondaryMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(size * 0.82, 1),
    new THREE.MeshBasicMaterial({ color: secondary, toneMapped: false }),
    count,
  );
  primaryMesh.name = "stylized-sparkle-primary-instances";
  secondaryMesh.name = "stylized-sparkle-secondary-instances";
  primaryMesh.count = 0;
  secondaryMesh.count = 0;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  for (let index = 0; index < count; index += 1) {
    const angle = random() * Math.PI * 2;
    const ring = Math.sqrt(random()) * radius;
    position.set(Math.cos(angle) * ring, 0.45 + random() * height, Math.sin(angle) * ring);
    matrix.makeScale(1, 1, 1).setPosition(position);
    if (random() > 0.55) {
      secondaryMesh.setMatrixAt(secondaryMesh.count, matrix);
      secondaryMesh.count += 1;
    } else {
      primaryMesh.setMatrixAt(primaryMesh.count, matrix);
      primaryMesh.count += 1;
    }
  }
  primaryMesh.instanceMatrix.needsUpdate = true;
  secondaryMesh.instanceMatrix.needsUpdate = true;
  group.userData.threeNativeStylizedSparkles = { count, speed: finiteNonNegative(component.speed, 0.45) };
  group.add(primaryMesh, secondaryMesh);
  return group;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function finitePositive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function finiteNonNegative(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}
