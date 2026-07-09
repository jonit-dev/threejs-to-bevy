import * as THREE from "three";
import { buildRuntimeTraceBundleFromConformanceReport, generatePortableShaderMaterial } from "@threenative/ir";
import type {
  IAssetIr,
  IAudioIr,
  IConformanceAssetReport,
  IConformanceAudioReport,
  IConformanceCameraViewReport,
  IConformanceEntityReport,
  IConformanceEnvironmentReport,
  IConformanceEventReport,
  IConformanceLightBudgetReport,
  IConformanceMaterialReport,
  IConformanceReport,
  IConformanceResourceReport,
  IConformanceRuntimeConfigReport,
  IConformanceSceneLifecycleReport,
  IConformanceScreenshotExportReport,
  IConformanceSystemReport,
  IConformanceUiNodeReport,
  IConformanceUiReport,
  IEnvironmentSceneIr,
  IMaterialIr,
  IShaderMaterialIr,
  IRuntimeConfigIr,
  IRendererFeatureReport,
  IUiIr,
  IWorldEntity,
  Quat,
  Vec3,
} from "@threenative/ir";
import { createWebAudioRuntime } from "./audio.js";
import { projectionMatrixHash } from "./cameras.js";
import type { IWebBundle } from "./loadBundle.js";
import type { IThreeWorld } from "./mapWorld.js";
import { listScreenshotExportDeclarations } from "./renderTargets.js";
import { detectPhysicsEvents } from "./physics.js";
import { traceSceneLifecycle } from "./sceneManager.js";
import { applyWebRenderLookProfile } from "./rendering/applyRenderLookProfile.js";

type IRuntimeLightReport = NonNullable<IConformanceEntityReport["light"]>["runtime"];

export function reportWebConformance(
  bundle: IWebBundle,
  mapped: IThreeWorld,
  fixture = bundle.manifest.name,
): IConformanceReport {
  const idsByObject = new Map<THREE.Object3D, string>();
  for (const [id, object] of mapped.objectsById.entries()) {
    idsByObject.set(object, id);
  }

  const report: IConformanceReport = {
    activeCamera: activeCameraId(mapped),
    audio: bundle.audio === undefined ? undefined : reportAudio(bundle.audio, bundle.world.events ?? {}),
    assets: bundle.assets.assets.map(reportAsset).sort((left, right) => left.id.localeCompare(right.id)),
    cameraViews: reportCameraViews(bundle, mapped),
    diagnostics: mapped.diagnostics,
    entities: bundle.world.entities
      .map((entity) => reportEntity(entity, mapped, idsByObject))
      .sort((left, right) => left.id.localeCompare(right.id)),
    environment: bundle.environmentScene === undefined ? undefined : reportEnvironment(bundle.environmentScene),
    events: reportEvents(observedEvents(bundle.world)),
    fixture,
    gltfFidelity: reportGltfFidelity(bundle),
    lightBudget: reportLightBudget(bundle.world),
    materials: bundle.materials.materials.map(reportMaterial).sort((left, right) => left.id.localeCompare(right.id)),
    resources: reportResources(bundle.world.resources ?? {}),
    runtime: "web-three",
    runtimeConfig: reportRuntimeConfig(bundle.runtimeConfig),
    sceneLifecycle: reportSceneLifecycle(bundle),
    screenshotExports: reportScreenshotExports(bundle.world),
    systems: reportSystems(bundle),
    ui: bundle.ui === undefined ? undefined : reportUi(bundle.ui),
  };
  return {
    ...report,
    traces: buildRuntimeTraceBundleFromConformanceReport(report),
  };
}

function reportGltfFidelity(bundle: IWebBundle): IConformanceReport["gltfFidelity"] {
  if (bundle.gltfScene === undefined) {
    return undefined;
  }
  return {
    assets: bundle.gltfScene.assets
      .map((asset) => ({
        assetId: asset.assetId,
        customAttributes: [...asset.customAttributes].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
        materials: [...asset.materials].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
        morphTargets: [...asset.morphTargets].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
      }))
      .sort((left, right) => left.assetId.localeCompare(right.assetId)),
  };
}

function reportSceneLifecycle(bundle: IWebBundle): IConformanceSceneLifecycleReport | undefined {
  if (bundle.scenes === undefined) {
    return undefined;
  }
  return traceSceneLifecycle(bundle.scenes, [
    { kind: "change", scene: "level" },
    { kind: "push", scene: "pause" },
    { kind: "pop" },
  ]);
}

function reportSystems(bundle: IWebBundle): IConformanceSystemReport[] | undefined {
  if (bundle.systems === undefined) {
    return undefined;
  }
  return bundle.systems.systems.map((system) => ({
    name: system.name,
    queries: system.queries.map((query) => ({
      matchedEntities: bundle.world.entities
        .filter((entity) => matchesQuery(entity, query.with, query.without))
        .map((entity) => entity.id)
        .sort((left, right) => left.localeCompare(right)),
      with: [...query.with],
      without: [...query.without],
    })),
  }));
}

function matchesQuery(entity: IWorldEntity, withComponents: string[], withoutComponents: string[]): boolean {
  return withComponents.every((component) => entity.components[component] !== undefined)
    && withoutComponents.every((component) => entity.components[component] === undefined);
}

function reportCameraViews(bundle: IWebBundle, mapped: IThreeWorld): IConformanceCameraViewReport[] {
  const entityById = new Map(bundle.world.entities.map((entity) => [entity.id, entity]));
  return mapped.cameraViews.map((view) => {
    const camera = entityById.get(view.entityId)?.components.Camera;
    return {
      cameraId: view.entityId,
      clearMode: camera?.clear?.mode,
      ...(camera?.output?.path === undefined ? {} : { exportPath: camera.output.path }),
      layers: [...view.layers],
      order: view.order,
      ...(camera?.projection === undefined
        ? {}
        : {
            projectionKind: camera.projection.kind,
            projectionMatrixHash: projectionMatrixHash(camera.projection),
          }),
      ...(view.targetAsset === undefined ? {} : { targetAsset: view.targetAsset }),
      targetKind: view.targetKind,
      ...(view.viewport === undefined ? {} : { viewport: view.viewport }),
    };
  });
}

function reportScreenshotExports(world: IWebBundle["world"]): IConformanceScreenshotExportReport[] {
  return listScreenshotExportDeclarations(world).map((entry) => ({
    cameraId: entry.cameraId,
    format: entry.format,
    path: entry.path,
  }));
}

function activeCameraId(mapped: IThreeWorld): string | undefined {
  for (const [id, object] of mapped.objectsById.entries()) {
    if (object === mapped.camera) {
      return id;
    }
  }
  return undefined;
}

function reportRuntimeConfig(config: IRuntimeConfigIr | undefined): IConformanceRuntimeConfigReport | undefined {
  if (config?.renderer === undefined) {
    return undefined;
  }
  const renderLook = applyWebRenderLookProfile(config);
  const bloom = config.renderer.bloom ?? renderLook.bloom;
  const colorGrading = config.renderer.colorGrading ?? renderLook.colorGrading;
  const featureReports = reportRendererFeatures(config.renderer, "web-three");
  return {
    renderer: {
      antialias: config.renderer.antialias,
      ...(config.renderer.ambientOcclusion === undefined ? {} : { ambientOcclusion: config.renderer.ambientOcclusion }),
      ...(bloom === undefined ? {} : { bloom }),
      ...(colorGrading === undefined ? {} : { colorGrading }),
      ...(config.renderer.depthOfField === undefined ? {} : { depthOfField: config.renderer.depthOfField }),
      ...(featureReports.length === 0 ? {} : { featureReports }),
      ...(config.renderer.motionBlur === undefined ? {} : { motionBlur: config.renderer.motionBlur }),
      postProcessing: {
        applied: [
          ...(bloom?.enabled === true ? ["bloom"] : []),
          ...(colorGrading === undefined ? [] : ["colorGrading"]),
          ...featureReports
            .filter((feature) => feature.status === "baseline" && feature.requestedMode !== "disabled")
            .map((feature) => feature.feature.replace(/^renderer\./, "")),
          ...postAntialiasFeatures(config.renderer.antialias),
        ],
        skipped: [
          ...renderLook.fallbacks.map((fallback) => ({ feature: fallback.feature, reason: fallback.reason })),
          ...featureReports
            .filter((feature) => feature.status !== "baseline" && feature.diagnostic !== undefined)
            .map((feature) => ({ feature: feature.feature, reason: feature.diagnostic?.reason ?? "Feature was not applied." })),
        ],
      },
      renderLook: {
        appliedProfile: renderLook.appliedProfile,
        fallbacks: renderLook.fallbacks,
        ...(config.renderer.renderLook?.overrides === undefined ? {} : { overrides: config.renderer.renderLook.overrides }),
        requestedProfile: renderLook.requestedProfile,
      },
      ...(config.renderer.renderPath === undefined ? {} : { renderPath: config.renderer.renderPath }),
      ...(config.renderer.screenSpaceGlobalIllumination === undefined ? {} : { screenSpaceGlobalIllumination: config.renderer.screenSpaceGlobalIllumination }),
      ...(config.renderer.screenSpaceReflections === undefined ? {} : { screenSpaceReflections: config.renderer.screenSpaceReflections }),
    },
  };
}

function reportRendererFeatures(
  renderer: NonNullable<IRuntimeConfigIr["renderer"]>,
  runtime: "web-three" | "bevy",
): IRendererFeatureReport[] {
  return [
    renderer.ambientOcclusion === undefined
      ? undefined
      : rendererFeatureReport("renderer.ambientOcclusion", renderer.ambientOcclusion.enabled, renderer.ambientOcclusion.mode, "screen-space", runtime),
    renderer.depthOfField === undefined
      ? undefined
      : rendererFeatureReport("renderer.depthOfField", renderer.depthOfField.enabled, "lens", "bokeh", runtime),
    renderer.screenSpaceReflections === undefined
      ? undefined
      : rendererFeatureReport("renderer.screenSpaceReflections", renderer.screenSpaceReflections.enabled, "screen-space", "screen-space-planar", runtime),
    renderer.motionBlur === undefined
      ? undefined
      : rendererFeatureReport("renderer.motionBlur", renderer.motionBlur.enabled, "shutter", "temporal-accumulation", runtime),
    renderer.screenSpaceGlobalIllumination === undefined
      ? undefined
      : rendererFeatureReport("renderer.screenSpaceGlobalIllumination", renderer.screenSpaceGlobalIllumination.enabled, "screen-space", "disabled", runtime),
  ].filter((feature): feature is IRendererFeatureReport => feature !== undefined);
}

function rendererFeatureReport(
  feature: string,
  enabled: boolean,
  requestedMode: string,
  appliedMode: string,
  runtime: "web-three" | "bevy",
): IRendererFeatureReport {
  if (!enabled) {
    return { appliedMode: "disabled", feature, requestedMode: "disabled", status: "baseline" };
  }
  if (appliedMode !== "disabled") {
    return { appliedMode, feature, requestedMode, status: "baseline" };
  }
  return {
    appliedMode,
    diagnostic: {
      code: "TN_RENDER_FEATURE_FALLBACK",
      reason: `${runtime} adapter has not landed the baseline ${feature} implementation yet.`,
      suggestion: `Finish the ${runtime} ${feature} baseline lane before making release support claims.`,
    },
    feature,
    requestedMode,
    status: "rollout-gap",
  };
}

function postAntialiasFeatures(mode: NonNullable<IRuntimeConfigIr["renderer"]>["antialias"]): string[] {
  if (mode === "fxaa" || mode === "taa" || mode === "smaa") {
    return [`antialias.${mode}`];
  }
  return [];
}

function reportAudio(audio: IAudioIr, events: Record<string, unknown>): IConformanceAudioReport {
  const runtime = createWebAudioRuntime(audio);
  runtime.start();
  runtime.handleEvents(audioEvents(events));
  return {
    commands: runtime.commands.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function audioEvents(events: Record<string, unknown>): Array<{ event: string; payload: unknown }> {
  return Object.entries(events).flatMap(([event, payloads]) =>
    Array.isArray(payloads)
      ? payloads.map((payload) => ({ event, payload }))
      : [{ event, payload: payloads }],
  );
}

function reportEntity(
  entity: IWorldEntity,
  mapped: IThreeWorld,
  idsByObject: Map<THREE.Object3D, string>,
): IConformanceEntityReport {
  const object = mapped.objectsById.get(entity.id);
  const report: IConformanceEntityReport = {
    components: componentNames(entity),
    id: entity.id,
  };

  if (object !== undefined) {
    report.transform = {
      position: object.position.toArray() as Vec3,
      rotation: object.quaternion.toArray() as Quat,
      scale: object.scale.toArray() as Vec3,
    };
    const parentId = object.parent === null || object.parent instanceof THREE.Scene ? undefined : idsByObject.get(object.parent);
    if (parentId !== undefined) {
      report.parent = parentId;
    }
  }

  if (entity.components.MeshRenderer !== undefined) {
    const renderer = entity.components.MeshRenderer;
    report.mesh = renderer.mesh;
    report.material = renderer.material;
    report.meshRenderer = {
      castShadow: renderer.castShadow,
      material: renderer.material,
      mesh: renderer.mesh,
      receiveShadow: renderer.receiveShadow,
      visible: renderer.visible,
    };
  }
  if (entity.components.Camera !== undefined) {
    report.camera = {
      far: entity.components.Camera.far,
      fovY: entity.components.Camera.fovY,
      kind: entity.components.Camera.kind,
      near: entity.components.Camera.near,
      runtime: object === undefined ? undefined : reportRuntimeCamera(object),
      size: entity.components.Camera.size,
    };
  }
  if (entity.components.Light !== undefined) {
    report.light = {
      angle: entity.components.Light.angle,
      color: entity.components.Light.color,
      intensity: entity.components.Light.intensity,
      kind: entity.components.Light.kind,
      range: entity.components.Light.range,
      shadowFilter: entity.components.Light.shadowFilter,
      shadowBias: entity.components.Light.shadowBias,
      shadowNormalBias: entity.components.Light.shadowNormalBias,
      runtime: object === undefined ? undefined : reportRuntimeLight(object, entity.components.Light.shadowFilter),
    };
  }
  if (entity.components.Visibility !== undefined || entity.components.MeshRenderer?.visible !== undefined || object !== undefined) {
    report.visibility = {
      meshRendererVisible: entity.components.MeshRenderer?.visible,
      runtimeVisible: object?.visible,
      visible: entity.components.Visibility?.visible,
    };
  }

  return report;
}

function reportRuntimeCamera(object: THREE.Object3D): NonNullable<NonNullable<IConformanceEntityReport["camera"]>["runtime"]> | undefined {
  if (object instanceof THREE.PerspectiveCamera) {
    return {
      far: object.far,
      fovY: object.fov,
      kind: "perspective",
      near: object.near,
    };
  }
  if (object instanceof THREE.OrthographicCamera) {
    return {
      far: object.far,
      kind: "orthographic",
      near: object.near,
      size: object.top - object.bottom,
    };
  }
  return undefined;
}

function reportRuntimeLight(object: THREE.Object3D, shadowFilter?: NonNullable<IConformanceEntityReport["light"]>["shadowFilter"]): IRuntimeLightReport | undefined {
  if (object instanceof THREE.DirectionalLight) {
    return { color: `#${object.color.getHexString()}`, intensity: object.intensity, kind: "directional", shadowFilter, shadowBias: object.shadow.bias, shadowNormalBias: object.shadow.normalBias };
  }
  if (object instanceof THREE.AmbientLight) {
    return undefined;
  }
  if (object instanceof THREE.PointLight) {
    return {
      color: `#${object.color.getHexString()}`,
      intensity: object.intensity,
      kind: "point",
      range: object.distance,
      shadowFilter,
      shadowBias: object.shadow.bias,
      shadowNormalBias: object.shadow.normalBias,
    };
  }
  if (object instanceof THREE.SpotLight) {
    return {
      angle: object.angle,
      color: `#${object.color.getHexString()}`,
      intensity: object.intensity,
      kind: "spot",
      range: object.distance,
      shadowFilter,
      shadowBias: object.shadow.bias,
      shadowNormalBias: object.shadow.normalBias,
    };
  }
  return undefined;
}

function reportAsset(asset: IAssetIr): IConformanceAssetReport {
  return {
    animations: "animations" in asset ? asset.animations : undefined,
    bounds: "bounds" in asset ? asset.bounds : undefined,
    center: "center" in asset ? asset.center : undefined,
    format: asset.format,
    generation: "generation" in asset ? asset.generation : undefined,
    id: asset.id,
    indexCount: "indices" in asset ? asset.indices?.length : undefined,
    kind: asset.kind,
    magFilter: "magFilter" in asset ? asset.magFilter : undefined,
    minFilter: "minFilter" in asset ? asset.minFilter : undefined,
    offset: "offset" in asset ? asset.offset : undefined,
    ...("path" in asset && typeof asset.path === "string" ? { path: asset.path } : {}),
    primitive: "primitive" in asset ? asset.primitive : undefined,
    repeat: "repeat" in asset ? asset.repeat : undefined,
    rotation: "rotation" in asset ? asset.rotation : undefined,
    size: "size" in asset ? asset.size : undefined,
    topology: "topology" in asset ? asset.topology : undefined,
    usage: "usage" in asset ? asset.usage : undefined,
    vertexCount: "attributes" in asset
      ? vertexCountForAttributes(asset.attributes)
      : undefined,
    wrapS: "wrapS" in asset ? asset.wrapS : undefined,
    wrapT: "wrapT" in asset ? asset.wrapT : undefined,
  };
}

function vertexCountForAttributes(attributes: Extract<IAssetIr, { kind: "mesh" }>["attributes"]): number | undefined {
  const position = attributes?.find((attribute) => attribute.name === "position");
  return position === undefined ? undefined : position.values.length / 3;
}

function reportMaterial(material: IMaterialIr): IConformanceMaterialReport {
  return {
    alphaCutoff: material.alphaCutoff,
    alphaMode: material.alphaMode,
    blendMode: material.blendMode,
    clearcoat: material.clearcoat,
    clearcoatRoughness: material.clearcoatRoughness,
    color: material.color,
    depthTest: material.depthTest,
    depthWrite: material.depthWrite,
    emissive: material.emissive,
    emissiveBloom: material.emissiveBloom,
    emissiveIntensity: material.emissiveIntensity,
    extension: material.extension,
    id: material.id,
    kind: material.kind,
    metalness: material.metalness,
    opacity: material.opacity,
    renderOrder: material.renderOrder,
    roughness: material.roughness,
    shader: material.kind === "shader" ? reportShaderMaterial(material) : undefined,
    specularIntensity: material.specularIntensity,
    transmission: material.transmission,
    textures: {
      baseColor: material.baseColorTexture,
      clearcoat: material.clearcoatTexture,
      clearcoatRoughness: material.clearcoatRoughnessTexture,
      emissive: material.emissiveTexture,
      metallicRoughness: material.metallicRoughnessTexture,
      normal: material.normalTexture,
      occlusion: material.occlusionTexture,
      specular: material.specularTexture,
      transmission: material.transmissionTexture,
    },
  };
}

function reportShaderMaterial(material: IShaderMaterialIr): NonNullable<IConformanceMaterialReport["shader"]> {
  const generatedShader = generatePortableShaderMaterial(material);
  return {
    bindingLayout: generatedShader.bindingLayout,
    fragmentOutputs: generatedShader.fragmentOutputs,
    language: material.program.language,
    targets: {
      glsl: { entryPoints: generatedShader.glsl.entryPoints, language: generatedShader.glsl.language },
      wgsl: { entryPoints: generatedShader.wgsl.entryPoints, language: generatedShader.wgsl.language },
    },
    textures: (material.textures ?? []).map((texture) => texture.name).sort(),
    uniforms: (material.uniforms ?? []).map((uniform) => uniform.name).sort(),
  };
}

function reportEnvironment(environment: IEnvironmentSceneIr): IConformanceEnvironmentReport {
  return {
    atmosphere: environment.atmosphere?.id,
    bookmarks: (environment.bookmarks ?? []).map((bookmark) => bookmark.id).sort(),
    debugGizmos: [
      ...environment.sourceAssets.filter((asset) => asset.debug?.gizmo === true).map((asset) => `sourceAsset:${asset.id}`),
      ...environment.instances.filter((instance) => instance.debug?.gizmo === true).map((instance) => `instance:${instance.id}`),
      ...(environment.lightProbes ?? []).map((probe) => `lightProbe:${probe.id}`),
    ].sort(),
    environmentMap: environment.environmentMap,
    hlodFades: environment.sourceAssets.flatMap((asset) =>
      (asset.lod ?? []).flatMap((level) =>
        level.fade === undefined
          ? []
          : [{ asset: level.asset, endDistance: level.fade.endDistance, sourceAsset: asset.id, startDistance: level.fade.startDistance }],
      ),
    ),
    instances: environment.instances.map((instance) => instance.id).sort(),
    instanceVisibility: environment.instances.flatMap((instance) =>
      instance.visibility === undefined
        ? []
        : [{
            id: instance.id,
            maxDistance: instance.visibility.maxDistance,
            minDistance: instance.visibility.minDistance,
            ...(instance.visibility.fade === undefined
              ? {}
              : { endDistance: instance.visibility.fade.endDistance, startDistance: instance.visibility.fade.startDistance }),
          }],
    ),
    lightProbes: environment.lightProbes,
    lodImpostors: environment.sourceAssets.flatMap((asset) =>
      (asset.lod ?? []).flatMap((level) =>
        level.impostor === undefined
          ? []
          : [{ asset: level.asset, material: level.impostor.material, mode: level.impostor.mode, sourceAsset: asset.id }],
      ),
    ),
    path: environment.path.id,
    scatter: (environment.scatter ?? []).map((scatter) => scatter.id).sort(),
    skybox: environment.skybox,
    sourceAssets: environment.sourceAssets.map((asset) => asset.id).sort(),
    sourceAssetVisibility: environment.sourceAssets.flatMap((asset) =>
      asset.visibility === undefined
        ? []
        : [{
            id: asset.id,
            maxDistance: asset.visibility.maxDistance,
            minDistance: asset.visibility.minDistance,
            ...(asset.visibility.fade === undefined
              ? {}
              : { endDistance: asset.visibility.fade.endDistance, startDistance: asset.visibility.fade.startDistance }),
          }],
    ),
    terrain: environment.terrain?.id,
  };
}

function reportLightBudget(world: IWebBundle["world"]): IConformanceLightBudgetReport | undefined {
  const budget = world.resources?.RenderingLightBudget as
    | { cullingPolicy?: string; maximumShadowedPointLights?: number; maximumVisibleDynamicLights?: number }
    | undefined;
  const dynamicLights = world.entities
    .filter((entity) => {
      const kind = entity.components.Light?.kind;
      return kind === "directional" || kind === "point" || kind === "spot";
    })
    .map((entity) => entity.id)
    .sort();
  const shadowedPointLights = world.entities
    .filter((entity) => entity.components.Light?.kind === "point" && entity.components.Light.shadowFilter !== undefined)
    .map((entity) => entity.id)
    .sort();
  if (budget === undefined && dynamicLights.length === 0 && shadowedPointLights.length === 0) {
    return undefined;
  }
  const maximumVisibleDynamicLights = budget?.maximumVisibleDynamicLights;
  const culledLights =
    budget?.cullingPolicy === "nearest" && maximumVisibleDynamicLights !== undefined && dynamicLights.length > maximumVisibleDynamicLights
      ? dynamicLights.slice(maximumVisibleDynamicLights)
      : [];
  return {
    culledLights,
    cullingPolicy: budget?.cullingPolicy,
    dynamicLights,
    maximumShadowedPointLights: budget?.maximumShadowedPointLights,
    maximumVisibleDynamicLights,
    overBudget:
      (maximumVisibleDynamicLights !== undefined && dynamicLights.length > maximumVisibleDynamicLights) ||
      (budget?.maximumShadowedPointLights !== undefined && shadowedPointLights.length > budget.maximumShadowedPointLights),
    shadowedPointLights,
  };
}

function reportEvents(events: Record<string, unknown>): IConformanceEventReport[] {
  return Object.entries(events)
    .map(([id, value]) => ({
      id,
      values: Array.isArray(value) ? value : [],
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function observedEvents(world: IWebBundle["world"]): Record<string, unknown> {
  const events: Record<string, unknown[]> = Object.fromEntries(
    Object.entries(world.events ?? {}).map(([id, value]) => [id, Array.isArray(value) ? [...value] : []]),
  );
  for (const observation of detectPhysicsEvents(world)) {
    const { event, ...payload } = observation;
    if (!hasEventPayload(events[event] ?? [], payload)) {
      events[event] = [...(events[event] ?? []), payload];
    }
  }
  return events;
}

function hasEventPayload(values: unknown[], payload: unknown): boolean {
  return values.some((value) => jsonEquals(value, payload));
}

function jsonEquals(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonEquals(value, right[index]))
    );
  }
  if (isJsonObject(left) || isJsonObject(right)) {
    if (!isJsonObject(left) || !isJsonObject(right)) {
      return false;
    }
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => key === rightKeys[index] && jsonEquals(left[key], right[key]))
    );
  }
  return false;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reportResources(resources: Record<string, unknown>): IConformanceResourceReport[] {
  return Object.entries(resources)
    .map(([id, value]) => ({ id, value }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function reportUi(ui: IUiIr): IConformanceUiReport {
  return { root: reportUiNode(ui.root) };
}

function reportUiNode(node: IUiIr["root"]): IConformanceUiNodeReport {
  return {
    ...(node.accessibilityLabel === undefined ? {} : { accessibilityLabel: node.accessibilityLabel }),
    ...(node.action === undefined ? {} : { action: node.action }),
    children: (node.children ?? []).map(reportUiNode),
    ...(node.focusable === undefined ? {} : { focusable: node.focusable }),
    id: node.id,
    kind: node.kind,
    ...(node.label === undefined ? {} : { label: node.label }),
    ...(node.max === undefined ? {} : { max: node.max }),
    ...(node.role === undefined ? {} : { role: node.role }),
    ...(node.src === undefined ? {} : { src: node.src }),
    ...(node.text === undefined ? {} : { text: node.text }),
    ...(node.value === undefined ? {} : { value: node.value }),
  };
}

function componentNames(entity: IWorldEntity): string[] {
  return Object.keys(entity.components)
    .filter((componentName) => entity.components[componentName] !== undefined)
    .sort();
}
