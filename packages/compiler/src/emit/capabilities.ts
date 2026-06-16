import type {
  IAssetsManifest,
  IAnimationsIr,
  IAudioIr,
  IBundleManifest,
  IEnvironmentSceneIr,
  IIrSchemaFile,
  IMaterialsIr,
  IOverlaysIr,
  IUiIr,
  IWorldIr,
} from "@threenative/ir";
import type { IInputIr, IRuntimeConfigIr, ISystemsIr } from "@threenative/ir";

export interface ICapabilitySource {
  assets: IAssetsManifest;
  animations?: IAnimationsIr;
  audio?: IAudioIr;
  componentSchemas?: IIrSchemaFile;
  environment?: IEnvironmentSceneIr;
  eventSchemas?: IIrSchemaFile;
  input?: IInputIr;
  materials: IMaterialsIr;
  overlays?: IOverlaysIr;
  resourceSchemas?: IIrSchemaFile;
  runtimeConfig?: IRuntimeConfigIr;
  systems?: ISystemsIr;
  ui?: IUiIr;
  world?: IWorldIr;
}

export function deriveRequiredCapabilities(source: ICapabilitySource): IBundleManifest["requiredCapabilities"] {
  const capabilities = new Map<string, Set<string>>();
  const add = (domain: string, capability: string): void => {
    const domainCapabilities = capabilities.get(domain) ?? new Set<string>();
    domainCapabilities.add(capability);
    capabilities.set(domain, domainCapabilities);
  };

  collectWorldCapabilities(source.world, add);
  collectMaterialCapabilities(source.materials, add);
  collectAssetCapabilities(source.assets, add);
  collectAnimationCapabilities(source.animations, add);
  collectSystemCapabilities(source.systems, add);
  collectInputCapabilities(source.input, add);
  collectAudioCapabilities(source.audio, add);
  collectUiCapabilities(source.ui, add);
  collectOverlayCapabilities(source.overlays, add);
  collectEnvironmentCapabilities(source.environment, add);

  if (source.componentSchemas !== undefined && Object.keys(source.componentSchemas.schemas).length > 0) {
    add("ecs", "component-reflection");
    add("ecs", "component-schemas");
    if (source.systems !== undefined && source.systems.systems.length > 0) {
      add("scripting", "component-reflection");
    }
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

function collectOverlayCapabilities(overlays: IOverlaysIr | undefined, add: (domain: string, capability: string) => void): void {
  if (overlays === undefined || overlays.overlays.length === 0) {
    return;
  }
  add("overlay", "bridge");
  add("overlay", "webview");
  for (const overlay of overlays.overlays) {
    if (overlay.transparent) {
      add("overlay", "transparent");
    }
    add("overlay", `input.${overlay.input}`);
    for (const profile of overlay.targetProfiles) {
      add("overlay", `target.${profile}`);
    }
  }
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
  if (world.resources?.ActiveCameras !== undefined) {
    add("rendering", "camera.multiple");
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
      if (entity.components.MeshRenderer.castShadow !== undefined || entity.components.MeshRenderer.receiveShadow !== undefined) {
        add("rendering", "mesh-renderer.shadows");
      }
      if (entity.components.MeshRenderer.visible !== undefined) {
        add("rendering", "visibility");
      }
    }
    if (entity.components.Camera !== undefined) {
      add("rendering", `camera.${entity.components.Camera.kind}`);
      if (
        entity.components.Camera.follow !== undefined
        || entity.components.Camera.orbit !== undefined
        || entity.components.Camera.pan !== undefined
        || entity.components.Camera.zoom !== undefined
        || entity.components.Camera.screenShake !== undefined
        || entity.components.Camera.viewModel !== undefined
      ) {
        add("rendering", "camera.helpers");
      }
      if (entity.components.Camera.viewport !== undefined) {
        add("rendering", "camera.viewport");
      }
      if (entity.components.Camera.layers !== undefined && entity.components.Camera.layers.length > 0) {
        add("rendering", "render-layers");
      }
      if (entity.components.Camera.target?.kind === "texture") {
        add("rendering", "camera.render-target");
      }
      if (entity.components.Camera.target?.kind === "depth") {
        add("rendering", "camera.depth-target");
      }
      if (entity.components.Camera.output !== undefined) {
        add("rendering", "camera.screenshot-export");
      }
    }
    if (entity.components.RenderLayers !== undefined) {
      add("rendering", "render-layers");
    }
    if (entity.components.Light !== undefined) {
      add("rendering", `light.${entity.components.Light.kind}`);
      if (entity.components.Light.angle !== undefined) {
        add("rendering", "light.angle");
      }
      if (entity.components.Light.range !== undefined) {
        add("rendering", "light.range");
      }
      if (entity.components.Light.shadowBias !== undefined || entity.components.Light.shadowNormalBias !== undefined) {
        add("rendering", "light.shadow-bias");
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
      if (entity.components.Collider.slope !== undefined) {
        add("physics", "collider.slope");
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
      if (entity.components.CharacterController.stepOffset !== undefined) {
        add("character", "step-offset");
      }
      if (entity.components.CharacterController.slopeLimit !== undefined) {
        add("character", "slope-limit");
      }
    }
  }
}

function collectMaterialCapabilities(materials: IMaterialsIr, add: (domain: string, capability: string) => void): void {
  for (const material of materials.materials) {
    add("rendering", `material.${material.kind}`);
    if (material.extension !== undefined) {
      add("rendering", `material.extended.${material.extension.preset}`);
    }
    if (material.alphaMode !== undefined && material.alphaMode !== "opaque") {
      add("rendering", `material.alpha.${material.alphaMode}`);
    }
    if (material.blendMode !== undefined) {
      add("rendering", `material.blend.${material.blendMode}`);
    }
    if (material.renderOrder !== undefined) {
      add("rendering", "material.render-order");
    }
    if (material.depthWrite !== undefined || material.depthTest !== undefined) {
      add("rendering", "material.depth-policy");
    }
    if (material.opacity !== undefined && material.opacity < 1) {
      add("rendering", "material.opacity");
    }
    if (material.emissive !== undefined || material.emissiveIntensity !== undefined) {
      add("rendering", "material.emissive");
    }
    if (material.specularIntensity !== undefined || material.specularTexture !== undefined) {
      add("rendering", "material.specular");
    }
    if (material.clearcoat !== undefined || material.clearcoatRoughness !== undefined) {
      add("rendering", "material.clearcoat");
    }
    if (material.transmission !== undefined) {
      add("rendering", "material.transmission");
    }
    for (const slot of [
      "baseColorTexture",
      "normalTexture",
      "metallicRoughnessTexture",
      "emissiveTexture",
      "occlusionTexture",
      "clearcoatTexture",
      "clearcoatRoughnessTexture",
      "transmissionTexture",
      "specularTexture",
    ] as const) {
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
      for (const attribute of asset.attributes ?? []) {
        if (attribute.name === "color" || attribute.name === "uv1") {
          add("rendering", `mesh.attribute.${attribute.name}`);
        }
      }
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
    if (
      asset.kind === "texture"
      && (
        asset.center !== undefined
        || asset.magFilter !== undefined
        || asset.minFilter !== undefined
        || asset.offset !== undefined
        || asset.repeat !== undefined
        || asset.rotation !== undefined
        || asset.wrapS !== undefined
        || asset.wrapT !== undefined
      )
    ) {
      add("rendering", "texture.sampler");
      add("rendering", "texture.uv-transform");
    }
    add("asset", `${asset.kind}.${asset.format}`);
  }
}

function collectAnimationCapabilities(animations: IAnimationsIr | undefined, add: (domain: string, capability: string) => void): void {
  if (animations === undefined || animations.transformClips.length === 0) {
    return;
  }
  add("animation", "transform-tracks");
  for (const clip of animations.transformClips) {
    if (clip.loop === "repeat") {
      add("animation", "loop-repeat");
    }
    for (const track of clip.tracks) {
      add("animation", `transform.${track.channel}`);
      if (track.easing !== undefined) {
        add("animation", `easing.${track.easing}`);
      }
    }
  }
}

function collectSystemCapabilities(systems: ISystemsIr | undefined, add: (domain: string, capability: string) => void): void {
  if (systems === undefined || systems.systems.length === 0) {
    return;
  }
  add("scripting", "systems");
  if (systems.lifecycle !== undefined) {
    add("scripting", "replay.fixed-trace");
    if ((systems.lifecycle.appStates ?? []).length > 0) {
      add("scripting", "state.app");
    }
    if ((systems.lifecycle.computedStates ?? []).length > 0) {
      add("scripting", "state.computed");
    }
    if ((systems.lifecycle.substates ?? []).length > 0) {
      add("scripting", "state.substate");
    }
    add("scripting", `state.${systems.lifecycle.state}`);
    add("scripting", `hot-reload.${systems.lifecycle.hotReload}`);
  }
  if ((systems.observers ?? []).length > 0) {
    add("ecs", "observer-propagation");
    add("scripting", "observer-propagation");
  }
  if ((systems.componentHooks ?? []).length > 0) {
    add("ecs", "component-hooks");
    add("scripting", "component-hooks");
  }
  if ((systems.channels ?? []).length > 0) {
    add("scripting", "channels");
  }
  if ((systems.tasks ?? []).length > 0) {
    add("scripting", "tasks");
  }
  if ((systems.plugins ?? []).length > 0 || (systems.pluginGroups ?? []).length > 0) {
    add("ecs", "plugin-composition");
    add("scripting", "plugin-composition");
  }
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
    if (system.resourceReads.length > 0) {
      add("scripting", "resource-reads");
    }
    if (system.resourceWrites.length > 0) {
      add("scripting", "resource-writes");
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
  if ((audio.controls ?? []).length > 0) {
    add("audio", "playback-control");
    for (const control of audio.controls ?? []) {
      add("audio", `playback-control.${control.kind}`);
    }
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
  if (node.kind === "image") {
    add("ui", "image");
  }
  if (node.binding !== undefined) {
    add("ui", `binding.${node.binding.kind}`);
  }
  if (node.action !== undefined) {
    add("ui", "action");
  }
  if (node.accessibilityLabel !== undefined || node.role !== undefined) {
    add("ui", "accessibility");
  }
  if (node.accessibilityLabel !== undefined) {
    add("ui", "accessibility.label");
  }
  if (node.role !== undefined) {
    add("ui", "accessibility.role");
  }
  if (node.focusable === true) {
    add("ui", "focusable");
  }
  if (node.layout !== undefined) {
    add("ui", "flex-layout");
    if (node.layout.grid !== undefined) {
      add("ui", "grid-layout");
    }
    if (node.layout.position !== undefined || node.layout.inset !== undefined) {
      add("ui", "anchors");
    }
    if (
      node.layout.minWidth !== undefined
      || node.layout.maxWidth !== undefined
      || node.layout.minHeight !== undefined
      || node.layout.maxHeight !== undefined
    ) {
      add("ui", "size-constraints");
    }
    if (node.layout.overflow !== undefined) {
      add("ui", "overflow");
      if (node.layout.overflow === "scroll") {
        add("ui", "scroll-container");
      }
    }
    if (node.layout.zIndex !== undefined) {
      add("ui", "z-index");
    }
  }
  if (node.style !== undefined) {
    add("ui", "style");
    if (node.style.backgroundColor !== undefined) {
      add("ui", "style.background");
    }
    if (node.style.gradient !== undefined) {
      add("ui", "style.gradient");
    }
    if (node.style.borderColor !== undefined || node.style.borderWidth !== undefined) {
      add("ui", "style.border");
    }
    if (node.style.borderRadius !== undefined) {
      add("ui", "style.radius");
    }
    if (node.style.color !== undefined) {
      add("ui", "style.color");
    }
    if (
      node.style.fontSize !== undefined
      || node.style.fontWeight !== undefined
      || node.style.textAlign !== undefined
      || node.style.textDecoration !== undefined
      || node.style.wrap !== undefined
    ) {
      add("ui", "style.text");
    }
    if (node.style.opacity !== undefined) {
      add("ui", "style.opacity");
    }
    if (node.style.shadow !== undefined) {
      add("ui", "style.shadow");
    }
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
