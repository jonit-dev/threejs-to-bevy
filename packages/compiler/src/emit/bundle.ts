import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import {
  type IAssetsManifest,
  type IAudioIr,
  type IBundleManifest,
  type IEnvironmentSceneIr,
  type IIrSchemaFile,
  type IMaterialIr,
  type IMaterialsIr,
  type ITargetProfile,
  type IUiIr,
  type IWorldIr,
} from "@threenative/ir";
import type { IInputIr, IRuntimeConfigIr, ISystemsIr } from "@threenative/ir";
import { type IAssetReference, type IAudioDeclaration, type IInputMapDeclaration, type World } from "@threenative/sdk";
import { type IUiElement } from "@threenative/ui";

import { type IProjectConfig } from "../config.js";
import { emitAudio } from "./audio.js";
import { ecsToIr } from "./ecs.js";
import { inputToIr } from "./input.js";
import { sceneToWorld } from "./scene-to-world.js";
import { stableJson } from "./stable-json.js";
import { emitUi } from "./ui.js";

export async function emitBundle(config: IProjectConfig, root: unknown): Promise<string> {
  const outDir = resolve(config.projectPath, config.outDir);
  const bundleRoot = normalizeBundleRoot(root);
  const isWorld =
    typeof bundleRoot.scene === "object" && bundleRoot.scene !== null && bundleRoot.scene.constructor.name === "World";
  const worldRoot = bundleRoot.world ?? (isWorld ? bundleRoot.scene : undefined);
  const sceneRoot = isWorld ? undefined : bundleRoot.scene;
  const emitted = sceneRoot === undefined ? undefined : sceneToWorld(sceneRoot as Parameters<typeof sceneToWorld>[0]);
  const ecs = worldRoot === undefined ? undefined : ecsToIr(worldRoot as Parameters<typeof ecsToIr>[0]);
  const input = bundleRoot.input === undefined ? ecs?.input : inputToIr(bundleRoot.input);
  const audio = bundleRoot.audio === undefined ? undefined : emitAudio(bundleRoot.audio);
  const environment = bundleRoot.environment === undefined ? undefined : await emitEnvironment(config.projectPath, bundleRoot.environment);
  const assets = mergeEnvironmentAssets(mergeAudioAssets(emitted?.assets ?? [], bundleRoot.audio), environment?.assets ?? []);
  const ui = (bundleRoot.ui === undefined ? undefined : emitUi(bundleRoot.ui)) as IUiIr | undefined;
  const world = mergeWorlds(emitted?.world, ecs?.world);
  const materials: IMaterialsIr = {
    schema: "threenative.materials",
    version: "0.1.0",
    materials: (emitted?.materials ?? []) as unknown as IMaterialIr[],
  };
  const assetsManifest: IAssetsManifest = {
    schema: "threenative.assets",
    version: "0.1.0",
    assets: assets.map(stripInternalAssetFields) as IAssetsManifest["assets"],
  };
  const targetProfile: ITargetProfile = {
    schema: "threenative.target-profile",
    version: "0.1.0",
    targets: ["web", "desktop"],
    ...(environment?.budgets === undefined ? {} : { budgets: environment.budgets }),
    ...(environment?.performance === undefined ? {} : { performance: environment.performance }),
  };
  const manifest: IBundleManifest = {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "threenative-game",
    requiredCapabilities: deriveRequiredCapabilities({
      assets: assetsManifest,
      audio,
      componentSchemas: ecs?.componentSchemas,
      environment: environment?.scene,
      eventSchemas: ecs?.eventSchemas,
      input,
      materials,
      resourceSchemas: ecs?.resourceSchemas,
      runtimeConfig: ecs?.runtimeConfig,
      systems: ecs?.systems,
      ui,
      world,
    }),
    entry: {
      ...(audio === undefined ? {} : { audio: "audio.ir.json" }),
      ...(environment === undefined ? {} : { environmentScene: "environment.scene.json" }),
      ...(ecs?.scriptBundle === undefined ? {} : { scripts: "scripts.bundle.js" }),
      ...(ecs === undefined ? {} : { systems: "systems.ir.json" }),
      ...(ui === undefined ? {} : { ui: "ui.ir.json" }),
      world: "world.ir.json",
    },
    files: {
      assets: "assets.manifest.json",
      ...(input === undefined ? {} : { input: "input.ir.json" }),
      materials: "materials.ir.json",
      targetProfile: "target.profile.json",
      ...(ecs === undefined
        ? {}
        : {
            componentSchemas: "schemas/components.schema.json" as const,
            eventSchemas: "schemas/events.schema.json" as const,
            resourceSchemas: "schemas/resources.schema.json" as const,
            ...(ecs.runtimeConfig === undefined ? {} : { runtimeConfig: "runtime.config.json" as const }),
            ...(ecs.scriptBundle === undefined ? {} : { scripts: "scripts.bundle.js" as const }),
          }),
    },
  };

  await rm(outDir, { force: true, recursive: true });
  await mkdir(outDir, { recursive: true });
  await mkdir(resolve(outDir, "schemas"), { recursive: true });
  await writeFile(resolve(outDir, "manifest.json"), stableJson(manifest));
  await copyAssetFiles(config.projectPath, outDir, assets);
  await copyExtraAssetFiles(config.projectPath, outDir, environment?.extraFiles ?? []);
  await writeFile(resolve(outDir, "world.ir.json"), stableJson(world));
  await writeFile(resolve(outDir, "materials.ir.json"), stableJson(materials));
  await writeFile(resolve(outDir, "assets.manifest.json"), stableJson(assetsManifest));
  await writeFile(resolve(outDir, "target.profile.json"), stableJson(targetProfile));
  if (environment !== undefined) {
    await writeFile(resolve(outDir, "environment.scene.json"), stableJson(environment.scene));
  }
  if (ui !== undefined) {
    await writeFile(resolve(outDir, "ui.ir.json"), stableJson(ui));
  }
  if (audio !== undefined) {
    await writeFile(resolve(outDir, "audio.ir.json"), stableJson(audio));
  }
  if (input !== undefined) {
    await writeFile(resolve(outDir, "input.ir.json"), stableJson(input));
  }
  if (ecs !== undefined) {
    await writeFile(resolve(outDir, "schemas/components.schema.json"), stableJson(ecs.componentSchemas));
    await writeFile(resolve(outDir, "schemas/resources.schema.json"), stableJson(ecs.resourceSchemas));
    await writeFile(resolve(outDir, "schemas/events.schema.json"), stableJson(ecs.eventSchemas));
    await writeFile(resolve(outDir, "systems.ir.json"), stableJson(ecs.systems));
    if (ecs.runtimeConfig !== undefined) {
      await writeFile(resolve(outDir, "runtime.config.json"), stableJson(ecs.runtimeConfig));
    }
    if (ecs.scriptBundle !== undefined) {
      await writeFile(resolve(outDir, "scripts.bundle.js"), ecs.scriptBundle);
    }
  }

  return outDir;
}

interface IBundleRoot {
  audio?: IAudioDeclaration;
  environment?: IEnvironmentDeclaration;
  input?: IInputMapDeclaration;
  scene: unknown;
  ui?: IUiElement;
  world?: World;
}

interface IEnvironmentDeclaration {
  assetNames: string[];
  atmosphere?: IEnvironmentSceneIr["atmosphere"];
  bookmarks?: IEnvironmentSceneIr["bookmarks"];
  budgets?: ITargetProfile["budgets"];
  controller?: IEnvironmentSceneIr["controller"];
  exclusionZones?: IEnvironmentSceneIr["exclusionZones"];
  instances: IEnvironmentSceneIr["instances"];
  lod?: Record<string, Array<{ assetName: string; maxDistance: number; minDistance: number }>>;
  path: IEnvironmentSceneIr["path"];
  performance?: ITargetProfile["performance"];
  previewImage?: string;
  scatter?: IEnvironmentSceneIr["scatter"];
  sourceDir: string;
  terrain?: IEnvironmentSceneIr["terrain"];
  walkability?: IEnvironmentSceneIr["walkability"];
}

interface IEmittedEnvironment {
  assets: IInternalAsset[];
  budgets?: ITargetProfile["budgets"];
  extraFiles: IAssetCopy[];
  performance?: ITargetProfile["performance"];
  scene: IEnvironmentSceneIr;
}

type IInternalAsset = Record<string, unknown> & { id: string; sourcePath?: string };

interface IAssetCopy {
  path: string;
  sourcePath: string;
}

function normalizeBundleRoot(root: unknown): IBundleRoot {
  if (isBundleRoot(root)) {
    return root;
  }
  return { scene: root };
}

function isBundleRoot(root: unknown): root is IBundleRoot {
  return typeof root === "object" && root !== null && "scene" in root;
}

function mergeWorlds(scene: IWorldIr | undefined, ecs: IWorldIr | undefined): IWorldIr | undefined {
  if (scene === undefined) {
    return ecs;
  }
  if (ecs === undefined) {
    return scene;
  }
  const entities = new Map(scene.entities.map((entity) => [entity.id, { ...entity, components: { ...entity.components } }]));
  for (const entity of ecs.entities) {
    const existing = entities.get(entity.id);
    entities.set(
      entity.id,
      existing === undefined
        ? { ...entity, components: { ...entity.components } }
        : { ...existing, components: { ...existing.components, ...entity.components }, tags: entity.tags ?? existing.tags },
    );
  }
  return {
    ...scene,
    entities: [...entities.values()].sort((left, right) => left.id.localeCompare(right.id)),
    events: { ...(scene.events ?? {}), ...(ecs.events ?? {}) },
    resources: { ...(scene.resources ?? {}), ...(ecs.resources ?? {}) },
  };
}

interface ICapabilitySource {
  assets: IAssetsManifest;
  audio?: IAudioIr;
  componentSchemas?: IIrSchemaFile;
  environment?: IEnvironmentSceneIr;
  eventSchemas?: IIrSchemaFile;
  input?: IInputIr;
  materials: IMaterialsIr;
  resourceSchemas?: IIrSchemaFile;
  runtimeConfig?: IRuntimeConfigIr;
  systems?: ISystemsIr;
  ui?: IUiIr;
  world?: IWorldIr;
}

function deriveRequiredCapabilities(source: ICapabilitySource): IBundleManifest["requiredCapabilities"] {
  const capabilities = new Map<string, Set<string>>();
  const add = (domain: string, capability: string): void => {
    const domainCapabilities = capabilities.get(domain) ?? new Set<string>();
    domainCapabilities.add(capability);
    capabilities.set(domain, domainCapabilities);
  };

  collectWorldCapabilities(source.world, add);
  collectMaterialCapabilities(source.materials, add);
  collectAssetCapabilities(source.assets, add);
  collectSystemCapabilities(source.systems, add);
  collectInputCapabilities(source.input, add);
  collectAudioCapabilities(source.audio, add);
  collectUiCapabilities(source.ui, add);
  collectEnvironmentCapabilities(source.environment, add);

  if (source.componentSchemas !== undefined && Object.keys(source.componentSchemas.schemas).length > 0) {
    add("ecs", "component-schemas");
  }
  if (source.resourceSchemas !== undefined && Object.keys(source.resourceSchemas.schemas).length > 0) {
    add("ecs", "resource-schemas");
  }
  if (source.eventSchemas !== undefined && Object.keys(source.eventSchemas.schemas).length > 0) {
    add("ecs", "event-schemas");
  }
  if (source.runtimeConfig !== undefined) {
    add("runtime", "config");
    add("runtime", "fixed-timestep");
  }

  return Object.fromEntries(
    [...capabilities.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([domain, domainCapabilities]) => [domain, [...domainCapabilities].sort((left, right) => left.localeCompare(right))]),
  );
}

function collectWorldCapabilities(world: IWorldIr | undefined, add: (domain: string, capability: string) => void): void {
  if (world === undefined) {
    return;
  }
  if (Object.keys(world.resources ?? {}).length > 0) {
    add("ecs", "resources");
  }
  if (world.resources?.ActiveCamera !== undefined) {
    add("rendering", "camera.active");
  }
  if (Object.keys(world.events ?? {}).length > 0) {
    add("ecs", "events");
  }
  for (const entity of world.entities) {
    if (entity.components.Hierarchy !== undefined) {
      add("transform", "hierarchy");
    }
    if (entity.components.Visibility !== undefined) {
      add("rendering", "visibility");
    }
    if (entity.components.MeshRenderer !== undefined) {
      add("rendering", "mesh-renderer");
      if (entity.components.MeshRenderer.visible !== undefined) {
        add("rendering", "visibility");
      }
    }
    if (entity.components.Camera !== undefined) {
      add("rendering", `camera.${entity.components.Camera.kind}`);
    }
    if (entity.components.Light !== undefined) {
      add("rendering", `light.${entity.components.Light.kind}`);
      if (entity.components.Light.angle !== undefined) {
        add("rendering", "light.angle");
      }
      if (entity.components.Light.range !== undefined) {
        add("rendering", "light.range");
      }
    }
    if (entity.components.RigidBody !== undefined) {
      add("physics", `rigid-body.${entity.components.RigidBody.kind}`);
    }
    if (entity.components.Collider !== undefined) {
      add("physics", `collider.${entity.components.Collider.kind}`);
      if (entity.components.Collider.layer !== undefined || entity.components.Collider.mask !== undefined) {
        add("physics", "contact-filtering");
      }
      if (entity.components.Collider.trigger === true) {
        add("physics", "trigger-collider");
      }
    }
    if (entity.components.CharacterController !== undefined) {
      add("character", "controller");
      if (entity.components.CharacterController.blocking === true) {
        add("character", "blocking");
      }
      if (entity.components.CharacterController.grounding === "raycast") {
        add("character", "grounding");
      }
      if (entity.components.CharacterController.interactAction !== undefined) {
        add("character", "interaction");
      }
    }
  }
}

function collectMaterialCapabilities(materials: IMaterialsIr, add: (domain: string, capability: string) => void): void {
  for (const material of materials.materials) {
    add("rendering", `material.${material.kind}`);
    for (const slot of ["baseColorTexture", "normalTexture", "metallicRoughnessTexture", "emissiveTexture", "occlusionTexture"] as const) {
      if (material[slot] !== undefined) {
        add("rendering", `material.texture.${textureSlotCapability(slot)}`);
      }
    }
  }
}

function textureSlotCapability(slot: string): string {
  return slot.replace(/Texture$/, "").replace(/[A-Z]/g, (value) => `-${value.toLowerCase()}`);
}

function collectAssetCapabilities(assets: IAssetsManifest, add: (domain: string, capability: string) => void): void {
  for (const asset of assets.assets) {
    if (asset.kind === "mesh" && asset.format === "generated") {
      add("rendering", `mesh.primitive.${asset.primitive}`);
    }
    if (asset.kind === "model" && asset.animations !== undefined && asset.animations.length > 0) {
      add("animation", "clip-metadata");
    }
    if (asset.kind === "model" && asset.animationGraph !== undefined) {
      add("animation", "events");
      add("animation", "graph");
      add("animation", "state-machine");
    }
    if (asset.kind === "model" && asset.particleEmitters !== undefined && asset.particleEmitters.length > 0) {
      add("particles", "bounded-emitter");
    }
    add("asset", `${asset.kind}.${asset.format}`);
  }
}

function collectSystemCapabilities(systems: ISystemsIr | undefined, add: (domain: string, capability: string) => void): void {
  if (systems === undefined || systems.systems.length === 0) {
    return;
  }
  add("scripting", "systems");
  for (const system of systems.systems) {
    add("scripting", `schedule.${system.schedule}`);
    if (system.script !== undefined) {
      add("scripting", "script-bundle");
    }
    if (system.queries.length > 0) {
      add("scripting", "queries");
    }
    for (const command of system.commands) {
      add("scripting", `command.${command.kind}`);
    }
    for (const service of system.services) {
      add("scripting", `service.${service}`);
    }
    if (system.eventReads.length > 0) {
      add("scripting", "event-reads");
    }
    if (system.eventWrites.length > 0) {
      add("scripting", "event-writes");
    }
  }
}

function collectInputCapabilities(input: IInputIr | undefined, add: (domain: string, capability: string) => void): void {
  if (input === undefined) {
    return;
  }
  if (input.actions.length > 0) {
    add("input", "actions");
  }
  if (input.axes.length > 0) {
    add("input", "axes");
  }
  for (const binding of [
    ...input.actions.flatMap((action) => action.bindings),
    ...input.axes.flatMap((axis) => [...axis.negative, ...axis.positive, ...(axis.value === undefined ? [] : [axis.value])]),
  ]) {
    add("input", `device.${binding.device}`);
    if (binding.required === true) {
      add("input", "required-binding");
    }
  }
}

function collectAudioCapabilities(audio: IAudioIr | undefined, add: (domain: string, capability: string) => void): void {
  if (audio === undefined) {
    return;
  }
  if (audio.music.length > 0) {
    add("audio", "music");
  }
  if (audio.music.some((music) => music.autoplay === true)) {
    add("audio", "autoplay");
  }
  if (audio.music.some((music) => music.loop === true)) {
    add("audio", "loop");
  }
  if (audio.oneShots.length > 0) {
    add("audio", "one-shot");
  }
  if ([...audio.music, ...audio.oneShots].some((item) => item.volume !== undefined)) {
    add("audio", "volume");
  }
  if ((audio.buses ?? []).length > 0 || [...audio.music, ...audio.oneShots].some((item) => item.bus !== undefined)) {
    add("audio", "bus");
    add("audio", "volume-routing");
  }
  if ((audio.listeners ?? []).length > 0) {
    add("audio", "listener");
  }
  if ((audio.emitters ?? []).length > 0 || audio.oneShots.some((item) => item.emitter !== undefined)) {
    add("audio", "spatial-emitter");
  }
}

function collectUiCapabilities(ui: IUiIr | undefined, add: (domain: string, capability: string) => void): void {
  if (ui === undefined) {
    return;
  }
  add("ui", "runtime");
  if (ui.focusOrder !== undefined) {
    add("ui", "focus-order");
  }
  if (ui.inputActions !== undefined) {
    add("ui", "input-actions");
  }
  if (ui.safeArea !== undefined) {
    add("ui", "safe-area");
  }
  visitUiNode(ui.root, add);
}

function visitUiNode(node: IUiIr["root"], add: (domain: string, capability: string) => void): void {
  add("ui", `node.${node.kind}`);
  if (node.binding !== undefined) {
    add("ui", `binding.${node.binding.kind}`);
  }
  if (node.action !== undefined) {
    add("ui", "action");
  }
  if (node.focusable === true) {
    add("ui", "focusable");
  }
  if (node.navigation !== undefined) {
    add("ui", "navigation");
  }
  for (const child of node.children ?? []) {
    visitUiNode(child, add);
  }
}

function collectEnvironmentCapabilities(
  environment: IEnvironmentSceneIr | undefined,
  add: (domain: string, capability: string) => void,
): void {
  if (environment === undefined) {
    return;
  }
  add("environment", "scene");
  add("environment", "path");
  if (environment.sourceAssets.length > 0) {
    add("environment", "source-assets");
  }
  if (environment.instances.length > 0) {
    add("environment", "instances");
  }
  if (environment.instances.some((instance) => instance.kind === "scatter")) {
    add("environment", "scatter-instances");
  }
  if (environment.sourceAssets.some((asset) => asset.lod !== undefined && asset.lod.length > 0)) {
    add("environment", "lod");
  }
  if (environment.scatter !== undefined && environment.scatter.length > 0) {
    add("environment", "scatter");
  }
  if (environment.terrain !== undefined) {
    add("environment", "terrain");
  }
  if (environment.atmosphere !== undefined) {
    add("environment", "atmosphere");
    add("rendering", "light.directional");
    add("rendering", "light.ambient");
    add("rendering", "color-management");
    add("rendering", "sky");
    if (environment.atmosphere.fog?.enabled === true) {
      add("rendering", `fog.${environment.atmosphere.fog.mode}`);
    }
    if (environment.atmosphere.shadows.enabled) {
      add("rendering", "shadows");
    }
  }
  if (environment.controller !== undefined) {
    add("environment", "first-person-controller");
  }
  if (environment.walkability !== undefined) {
    add("environment", "walkability");
  }
  if (environment.bookmarks !== undefined && environment.bookmarks.length > 0) {
    add("environment", "camera-bookmarks");
  }
  if (environment.referenceImage !== undefined) {
    add("environment", "reference-image");
  }
}

function mergeAudioAssets(
  assets: Array<Record<string, unknown> & { id: string }>,
  audio: IAudioDeclaration | undefined,
): IInternalAsset[] {
  const merged = new Map(assets.map((asset) => [asset.id, asset]));
  for (const asset of audioAssetRefs(audio)) {
    merged.set(asset.id, {
      format: asset.format,
      id: asset.id,
      kind: asset.kind,
      path: asset.path,
    });
  }
  return [...merged.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function mergeEnvironmentAssets(
  assets: IInternalAsset[],
  environmentAssets: IInternalAsset[],
): IInternalAsset[] {
  const merged = new Map(assets.map((asset) => [asset.id, asset]));
  for (const asset of environmentAssets) {
    merged.set(asset.id, asset);
  }
  return [...merged.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function audioAssetRefs(audio: IAudioDeclaration | undefined): IAssetReference[] {
  if (audio === undefined) {
    return [];
  }
  return [...audio.music, ...audio.oneShots].flatMap((item) => (item.assetRef === undefined ? [] : [item.assetRef]));
}

async function copyAssetFiles(
  projectPath: string,
  outDir: string,
  assets: ReadonlyArray<IInternalAsset>,
): Promise<void> {
  for (const asset of assets) {
    if (typeof asset.path !== "string") {
      continue;
    }
    const from = resolve(projectPath, asset.sourcePath ?? asset.path);
    const to = resolve(outDir, asset.path);
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to);
  }
}

async function copyExtraAssetFiles(projectPath: string, outDir: string, files: readonly IAssetCopy[]): Promise<void> {
  for (const file of files) {
    const from = resolve(projectPath, file.sourcePath);
    const to = resolve(outDir, file.path);
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to);
  }
}

function stripInternalAssetFields(asset: IInternalAsset): Record<string, unknown> & { id: string } {
  const { sourcePath: _sourcePath, ...publicAsset } = asset;
  return publicAsset;
}

async function emitEnvironment(projectPath: string, declaration: IEnvironmentDeclaration): Promise<IEmittedEnvironment> {
  const sourceDir = resolve(projectPath, declaration.sourceDir);
  const entries = await readdir(sourceDir, { withFileTypes: true });
  const available = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  const sourceAssetNames = [...declaration.assetNames].sort((left, right) => left.localeCompare(right));
  const assetNames = collectEnvironmentModelAssetNames(declaration);
  const assets: IEmittedEnvironment["assets"] = [];
  const extraFiles: IAssetCopy[] = [];
  const sourceAssets: IEnvironmentSceneIr["sourceAssets"] = [];

  for (const assetName of assetNames) {
    if (!available.has(assetName)) {
      throw new Error(`Environment asset '${assetName}' is missing from '${declaration.sourceDir}'.`);
    }
    const extension = assetName.split(".").pop()?.toLowerCase();
    if (extension !== "gltf" && extension !== "glb") {
      throw new Error(`Environment asset '${assetName}' must be a glTF or GLB model.`);
    }
    const id = `env.${assetName.slice(0, -(extension.length + 1))}`;
    const bounds = extension === "gltf" ? await readGltfBounds(sourceDir, assetName) : undefined;
    assets.push({
      ...(bounds === undefined ? {} : { bounds }),
      format: extension,
      id: `model.${id}`,
      kind: "model",
      path: `assets/environment/${assetName}`,
      sourcePath: `${declaration.sourceDir}/${assetName}`,
    });
    if (extension === "gltf") {
      for (const dependency of await readGltfDependencies(sourceDir, assetName)) {
        if (!available.has(dependency)) {
          throw new Error(`Environment asset '${assetName}' references missing dependency '${dependency}'.`);
        }
        const dependencyExtension = dependency.split(".").pop()?.toLowerCase();
        const copy = { path: `assets/environment/${dependency}`, sourcePath: `${declaration.sourceDir}/${dependency}` };
        if (dependencyExtension === "bin") {
          assets.push({
            format: "bin",
            id: `buffer.env.${dependency.slice(0, -(dependencyExtension.length + 1))}`,
            kind: "buffer",
            path: copy.path,
            sourcePath: copy.sourcePath,
          });
        } else if (dependencyExtension === "png" || dependencyExtension === "jpeg" || dependencyExtension === "jpg") {
          const textureFormat = dependencyExtension === "jpg" ? "jpeg" : dependencyExtension;
          assets.push({
            format: textureFormat,
            id: `tex.env.${dependency.slice(0, -(dependencyExtension.length + 1))}`,
            kind: "texture",
            path: copy.path,
            sourcePath: copy.sourcePath,
          });
        } else {
          extraFiles.push(copy);
        }
      }
    }
    if (sourceAssetNames.includes(assetName)) {
      sourceAssets.push({
        asset: `model.${id}`,
        category: categorizeEnvironmentAsset(assetName),
        id,
        ...emitSourceAssetLod(assetName, declaration),
      });
    }
  }
  const previewAsset =
    declaration.previewImage === undefined
      ? undefined
      : emitPreviewAsset(declaration.previewImage, "assets/environment/reference");
  if (previewAsset !== undefined) {
    assets.push(previewAsset);
  }

  return {
    assets,
    budgets: declaration.budgets,
    extraFiles,
    performance: declaration.performance,
    scene: {
      schema: "threenative.environment-scene",
      version: "0.1.0",
      ...(declaration.atmosphere === undefined ? {} : { atmosphere: declaration.atmosphere }),
      ...(declaration.bookmarks === undefined ? {} : { bookmarks: [...declaration.bookmarks].sort((left, right) => left.id.localeCompare(right.id)) }),
      ...(declaration.controller === undefined ? {} : { controller: declaration.controller }),
      ...(declaration.exclusionZones === undefined ? {} : { exclusionZones: [...declaration.exclusionZones].sort((left, right) => left.id.localeCompare(right.id)) }),
      ...(previewAsset === undefined ? {} : { referenceImage: previewAsset.id }),
      ...(declaration.scatter === undefined ? {} : { scatter: [...declaration.scatter].sort((left, right) => left.id.localeCompare(right.id)) }),
      sourceAssets,
      instances: emitEnvironmentInstances(declaration),
      path: declaration.path,
      ...(declaration.terrain === undefined ? {} : { terrain: declaration.terrain }),
      ...(declaration.walkability === undefined ? {} : { walkability: declaration.walkability }),
    },
  };
}

function collectEnvironmentModelAssetNames(declaration: IEnvironmentDeclaration): string[] {
  const assetNames = new Set(declaration.assetNames);
  for (const levels of Object.values(declaration.lod ?? {})) {
    for (const level of levels) {
      assetNames.add(level.assetName);
    }
  }
  return [...assetNames].sort((left, right) => left.localeCompare(right));
}

function emitSourceAssetLod(
  assetName: string,
  declaration: IEnvironmentDeclaration,
): Pick<IEnvironmentSceneIr["sourceAssets"][number], "lod"> {
  const sourceAssetId = `env.${assetName.slice(0, -(assetName.split(".").pop()!.length + 1))}`;
  const levels = declaration.lod?.[sourceAssetId];
  if (levels === undefined || levels.length === 0) {
    return {};
  }
  return {
    lod: [...levels]
      .sort((left, right) => left.minDistance - right.minDistance || left.maxDistance - right.maxDistance || left.assetName.localeCompare(right.assetName))
      .map((level) => {
        const extension = level.assetName.split(".").pop()?.toLowerCase();
        const id = `env.${level.assetName.slice(0, -((extension?.length ?? 0) + 1))}`;
        return {
          asset: `model.${id}`,
          maxDistance: level.maxDistance,
          minDistance: level.minDistance,
        };
      }),
  };
}

function emitEnvironmentInstances(declaration: IEnvironmentDeclaration): IEnvironmentSceneIr["instances"] {
  return [...declaration.instances.map((instance) => ({ kind: "hero" as const, ...instance })), ...expandScatterInstances(declaration)].sort(
    compareEnvironmentInstances,
  );
}

function compareEnvironmentInstances(left: IEnvironmentSceneIr["instances"][number], right: IEnvironmentSceneIr["instances"][number]): number {
  const kindOrder = (value: IEnvironmentSceneIr["instances"][number]): number => (value.kind === "hero" ? 0 : value.kind === "manual" ? 1 : 2);
  const kindDelta = kindOrder(left) - kindOrder(right);
  return kindDelta === 0 ? left.id.localeCompare(right.id) : kindDelta;
}

function expandScatterInstances(declaration: IEnvironmentDeclaration): IEnvironmentSceneIr["instances"] {
  const instances: IEnvironmentSceneIr["instances"] = [];
  const exclusionZones = declaration.exclusionZones ?? [];
  for (const scatter of [...(declaration.scatter ?? [])].sort((left, right) => left.id.localeCompare(right.id))) {
    const count = scatter.count ?? estimateScatterCount(scatter);
    const assetIds = [...scatter.assetIds].sort((left, right) => left.localeCompare(right));
    if (assetIds.length === 0) {
      continue;
    }
    const random = seededRandom(scatter.seed);
    let emitted = 0;
    let attempts = 0;
    while (emitted < count && attempts < count * 20) {
      attempts += 1;
      const sourceAsset = assetIds[Math.floor(random() * assetIds.length)] ?? assetIds[0]!;
      const position = [
        lerp(scatter.bounds.min[0], scatter.bounds.max[0], random()),
        0,
        lerp(scatter.bounds.min[2], scatter.bounds.max[2], random()),
      ] as const;
      if (isExcluded(position, declaration.path, exclusionZones, scatter.exclusionZoneIds ?? [])) {
        continue;
      }
      const scale = lerp(scatter.minScale, scatter.maxScale, random());
      const yaw = lerp(scatter.rotation?.minYaw ?? 0, scatter.rotation?.maxYaw ?? Math.PI * 2, random());
      instances.push({
        collisionMode: scatter.collisionMode ?? "none",
        id: `${scatter.id}.${sourceAsset}.${String(emitted).padStart(3, "0")}`,
        kind: "scatter",
        position,
        rotation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
        scale: [scale, scale, scale],
        scatterSource: scatter.id,
        sourceAsset,
        tags: [...(scatter.tags ?? [])].sort((left, right) => left.localeCompare(right)),
      });
      emitted += 1;
    }
  }
  return instances;
}

function estimateScatterCount(scatter: NonNullable<IEnvironmentDeclaration["scatter"]>[number]): number {
  const area = Math.abs((scatter.bounds.max[0] - scatter.bounds.min[0]) * (scatter.bounds.max[2] - scatter.bounds.min[2]));
  return Math.floor(area * (scatter.density ?? 0));
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isExcluded(
  position: readonly [number, number, number],
  path: IEnvironmentSceneIr["path"],
  zones: NonNullable<IEnvironmentDeclaration["exclusionZones"]>,
  enabledZoneIds: readonly string[],
): boolean {
  const pathClearance = path.clearingRadius ?? path.width / 2;
  for (let index = 1; index < path.points.length; index += 1) {
    const start = path.points[index - 1];
    const end = path.points[index];
    if (start !== undefined && end !== undefined && distanceToSegment2d(position, start, end) <= pathClearance) {
      return true;
    }
  }
  const enabled = new Set(enabledZoneIds);
  return zones.some((zone) => {
    if (enabled.size > 0 && !enabled.has(zone.id)) {
      return false;
    }
    if (zone.bounds !== undefined) {
      return position[0] >= zone.bounds.min[0] && position[0] <= zone.bounds.max[0] && position[2] >= zone.bounds.min[2] && position[2] <= zone.bounds.max[2];
    }
    if (zone.radius !== undefined) {
      return Math.hypot(position[0], position[2]) <= zone.radius;
    }
    return false;
  });
}

function distanceToSegment2d(point: readonly [number, number, number], start: readonly [number, number, number], end: readonly [number, number, number]): number {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) {
    return Math.hypot(point[0] - start[0], point[2] - start[2]);
  }
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[2] - start[2]) * dz) / lengthSquared));
  return Math.hypot(point[0] - (start[0] + t * dx), point[2] - (start[2] + t * dz));
}

function lerp(min: number, max: number, amount: number): number {
  return min + (max - min) * amount;
}

async function readGltfDependencies(sourceDir: string, assetName: string): Promise<string[]> {
  const gltf = JSON.parse(await readFile(resolve(sourceDir, assetName), "utf8")) as {
    buffers?: Array<{ uri?: string }>;
    images?: Array<{ uri?: string }>;
  };
  const dependencies = new Set<string>();
  for (const item of [...(gltf.buffers ?? []), ...(gltf.images ?? [])]) {
    if (item.uri === undefined || item.uri.startsWith("data:") || item.uri.includes("/") || item.uri.includes("..")) {
      continue;
    }
    dependencies.add(item.uri);
  }
  if (dependencies.size === 0) {
    const binName = `${basename(assetName, ".gltf")}.bin`;
    dependencies.add(binName);
  }
  return [...dependencies].sort((left, right) => left.localeCompare(right));
}

async function readGltfBounds(sourceDir: string, assetName: string): Promise<{ max: [number, number, number]; min: [number, number, number] } | undefined> {
  const gltf = JSON.parse(await readFile(resolve(sourceDir, assetName), "utf8")) as {
    accessors?: Array<{ max?: number[]; min?: number[] }>;
    meshes?: Array<{ primitives?: Array<{ attributes?: { POSITION?: number } }> }>;
  };
  const mins: number[][] = [];
  const maxes: number[][] = [];
  for (const mesh of gltf.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const position = primitive.attributes?.POSITION;
      const accessor = position === undefined ? undefined : gltf.accessors?.[position];
      if (accessor?.min?.length === 3 && accessor.max?.length === 3) {
        mins.push(accessor.min);
        maxes.push(accessor.max);
      }
    }
  }
  if (mins.length === 0 || maxes.length === 0) {
    return undefined;
  }
  return {
    max: [0, 1, 2].map((index) => Math.max(...maxes.map((item) => item[index] ?? 0))) as [number, number, number],
    min: [0, 1, 2].map((index) => Math.min(...mins.map((item) => item[index] ?? 0))) as [number, number, number],
  };
}

function emitPreviewAsset(previewImage: string, outDir: string): IInternalAsset {
  const extension = previewImage.split(".").pop()?.toLowerCase();
  if (extension !== "jpg" && extension !== "jpeg" && extension !== "png") {
    throw new Error(`Environment preview '${previewImage}' must be a PNG or JPEG image.`);
  }
  const fileName = basename(previewImage);
  return {
    format: extension === "jpg" ? "jpeg" : extension,
    id: `tex.env.reference.${fileName.slice(0, -(extension.length + 1))}`,
    kind: "texture",
    path: `${outDir}/${fileName}`,
    sourcePath: previewImage,
  };
}

function categorizeEnvironmentAsset(assetName: string): IEnvironmentSceneIr["sourceAssets"][number]["category"] {
  const lower = assetName.toLowerCase();
  if (lower.includes("tree") || lower.includes("pine")) {
    return "tree";
  }
  if (lower.includes("grass") || lower.includes("clover") || lower.includes("fern") || lower.includes("plant")) {
    return "grass";
  }
  if (lower.includes("mushroom")) {
    return "mushroom";
  }
  if (lower.includes("pebble")) {
    return "pebble";
  }
  if (lower.includes("rock")) {
    return "rock";
  }
  if (lower.includes("flower") || lower.includes("petal")) {
    return "flower";
  }
  return "vegetation";
}
