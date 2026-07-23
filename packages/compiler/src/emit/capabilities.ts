import type {
  IAssetsManifest,
  IAnimationsIr,
  IAudioIr,
  IBundleManifest,
  IEnvironmentSceneIr,
  IGameFlowIr,
  IInteractionsIr,
  IIrSchemaFile,
  ILocalDataIr,
  IMaterialsIr,
  IOverlaysIr,
  IScenesIr,
  ISequencesIr,
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
  gameFlow?: IGameFlowIr;
  input?: IInputIr;
  interactions?: IInteractionsIr;
  localData?: ILocalDataIr;
  materials: IMaterialsIr;
  overlays?: IOverlaysIr;
  resourceSchemas?: IIrSchemaFile;
  runtimeConfig?: IRuntimeConfigIr;
  scenes?: IScenesIr;
  sequences?: ISequencesIr;
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
  if (source.interactions !== undefined && source.interactions.interactions.length > 0) add("gameplay", "interactions");
  collectAudioCapabilities(source.audio, add);
  collectLocalDataCapabilities(source.localData, add);
  collectUiCapabilities(source.ui, add);
  collectOverlayCapabilities(source.overlays, add);
  collectSceneCapabilities(source.scenes, add);
  collectGameFlowCapabilities(source.gameFlow, add);
  collectSequenceCapabilities(source.sequences, add);
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
    if (source.runtimeConfig.renderer?.colorGrading !== undefined) {
      add("rendering", "color-grading");
      add("rendering", "color-management.srgb");
      add("rendering", "tone-mapping");
    }
    if (source.runtimeConfig.renderer?.depthOfField !== undefined) {
      add("rendering", "depth-of-field");
    }
    if (source.runtimeConfig.renderer?.ambientOcclusion !== undefined) {
      add("rendering", "ambient-occlusion.screen-space");
    }
    if (source.runtimeConfig.renderer?.screenSpaceReflections !== undefined) {
      add("rendering", "screen-space-reflections");
    }
    if (source.runtimeConfig.renderer?.motionBlur !== undefined) {
      add("rendering", "motion-blur");
    }
    if (source.runtimeConfig.renderer?.screenSpaceGlobalIllumination !== undefined) {
      add("rendering", "screen-space-global-illumination");
    }
    const antialias = source.runtimeConfig.renderer?.antialias;
    if (antialias !== undefined) {
      add("rendering", `antialias.${antialias}`);
    }
    if (source.runtimeConfig.renderer?.renderPath === "forward") {
      add("rendering", "render-path.forward");
    }
    const renderLook = source.runtimeConfig.renderer?.renderLook;
    if (renderLook !== undefined) {
      add("rendering", "look-profile.v1");
      add("rendering", `profile.${renderLook.profile}`);
      if (renderLook.profile === "balanced") {
        add("rendering", "color-management.srgb");
        add("rendering", "tone-mapping");
        add("rendering", "shadow.directional");
      }
    }
    if (source.runtimeConfig.renderer?.bloom?.enabled === true || renderLook?.profile === "balanced") {
      add("rendering", "postprocess.bloom");
    }
  }

  return Object.fromEntries(
    [...capabilities.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([domain, domainCapabilities]) => [domain, [...domainCapabilities].sort((left, right) => left.localeCompare(right))]),
  );
}

function collectGameFlowCapabilities(gameFlow: IGameFlowIr | undefined, add: (domain: string, capability: string) => void): void {
  if (gameFlow === undefined || gameFlow.flows.length === 0) {
    return;
  }
  add("gameplay", "game-flow");
}

function collectSequenceCapabilities(sequences: ISequencesIr | undefined, add: (domain: string, capability: string) => void): void {
  if (sequences === undefined || sequences.sequences.length === 0) {
    return;
  }
  add("gameplay", "sequences");
}

function collectSceneCapabilities(scenes: IScenesIr | undefined, add: (domain: string, capability: string) => void): void {
  if (scenes === undefined || scenes.scenes.length === 0) {
    return;
  }
  add("scene", "lifecycle");
  add("scene", "initial");
  for (const scene of scenes.scenes) {
    add("scene", `activation.${scene.activation}`);
    add("scene", `kind.${scene.kind}`);
    if ((scene.assetGroups ?? []).length > 0) {
      add("scene", "asset-groups");
    }
    if (scene.transitions !== undefined) {
      add("scene", "transitions");
      for (const transition of [scene.transitions.enter, scene.transitions.exit]) {
        if (transition !== undefined) {
          add("scene", `transition.${transition.kind}`);
        }
      }
    }
  }
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
  if (world.resources?.Navigation !== undefined) {
    const navigation = world.resources.Navigation as Record<string, unknown>;
    add("navigation", "static-regions");
    add("navigation", "path");
    if (navigation.dynamicRebake !== undefined) {
      add("navigation", "dynamic-rebake");
    }
    if (navigation.offMeshLinks !== undefined) {
      add("navigation", "off-mesh-links");
    }
    if (navigation.crowd !== undefined) {
      add("navigation", "crowd-steering");
    }
  }
  if (world.resources?.RenderingLightBudget !== undefined) {
    add("rendering", "light-budget");
  }
  if (Object.keys(world.events ?? {}).length > 0) {
    add("ecs", "events");
  }
  for (const entity of world.entities) {
    if ((entity.tags ?? []).length > 0) {
      add("ecs", "entity-tags");
      add("scripting", "tag-queries");
    }
    if (entity.components.Patrol !== undefined) {
      add("gameplay", "patrol");
    }
    if (entity.components.StateMachine !== undefined) {
      add("gameplay", "entity-state-machine");
    }
    if (entity.components.WorldText !== undefined) {
      add("rendering", "world-text");
    }
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
    if (entity.components.ContactShadows !== undefined) {
      add("rendering", "contact-shadows");
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
      if (entity.components.Light.shadowFilter !== undefined) {
        add("rendering", "light.shadow-filter.pcf");
      }
      if (entity.components.Light.debug?.gizmo === true) {
        add("rendering", "light.debug-gizmo");
      }
    }
    if (entity.components.RigidBody !== undefined) {
      add("physics", `rigid-body.${entity.components.RigidBody.kind}`);
      if (entity.components.RigidBody.ccd?.enabled === true) {
        add("physics", `ccd.${entity.components.RigidBody.ccd.mode}`);
      }
      if (usesPrimitiveSolverV2(entity.components.RigidBody, entity.components.Collider)) {
        add("physics", "primitive-solver-v2");
      }
    }
    if (entity.components.Collider !== undefined) {
      add("physics", `collider.${entity.components.Collider.kind}`);
      if (entity.components.Collider.kind === "mesh" && entity.components.Collider.mesh !== undefined) {
        add("physics", "collider.mesh.bounds");
      }
      if (entity.components.Collider.layer !== undefined || entity.components.Collider.mask !== undefined) {
        add("physics", "contact-filtering");
      }
      if (entity.components.Collider.slope !== undefined) {
        add("physics", "collider.slope");
      }
      if (entity.components.Collider.trigger === true) {
        add("physics", "trigger-collider");
      }
      if (entity.components.Collider.sensor !== undefined) {
        add("physics", "sensors");
        add("physics", "interaction-volumes");
      }
    }
    if (entity.components.PhysicsJoint !== undefined) {
      add("physics", `joint.${entity.components.PhysicsJoint.kind}`);
    }
    if (entity.components.Destructible !== undefined) {
      add("physics", "destruction.bounded-fracture");
      add("physics", `destruction.cleanup.${entity.components.Destructible.cleanupPolicy ?? "manifest"}`);
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
      if (entity.components.CharacterController.pushPolicy?.enabled === true) {
        add("character", "push");
      }
    }
  }
}

function usesPrimitiveSolverV2(
  body: NonNullable<IWorldIr["entities"][number]["components"]["RigidBody"]>,
  collider: IWorldIr["entities"][number]["components"]["Collider"] | undefined,
): boolean {
  if (collider === undefined || !["box", "capsule", "sphere"].includes(collider.kind)) {
    return false;
  }
  return [
    body.angularVelocity,
    body.damping,
    body.gravityScale,
    body.inverseMass,
    body.mass,
    body.sleepThreshold,
    body.solverIterations,
    body.velocity,
    collider.friction,
    collider.restitution,
  ].some((value) => value !== undefined);
}

function collectMaterialCapabilities(materials: IMaterialsIr, add: (domain: string, capability: string) => void): void {
  for (const material of materials.materials) {
    add("rendering", `material.${material.kind}`);
    if (material.extension !== undefined) {
      add("rendering", `material.extended.${material.extension.preset}`);
    }
    if (material.kind === "shader") {
      add("rendering", "material.shader.v1");
      for (const uniform of material.uniforms ?? []) {
        add("rendering", `shader.uniform.${uniform.type}`);
      }
      if ((material.textures?.length ?? 0) > 0) {
        add("rendering", "shader.texture2d");
      }
      if (material.program.vertex?.displacement !== undefined) {
        add("rendering", "shader.vertex-displacement");
      }
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
    if (material.emissiveBloom !== undefined) {
      add("rendering", "material.emissive-bloom");
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
    if (asset.kind === "model" && "masks" in asset && Array.isArray(asset.masks) && asset.masks.length > 0) {
      add("animation", "masks");
    }
    if (asset.kind === "model" && "morphTargets" in asset && Array.isArray(asset.morphTargets) && asset.morphTargets.length > 0) {
      add("animation", "morph-targets");
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
  if (systems === undefined || (systems.systems.length === 0 && (systems.countdowns ?? []).length === 0 && (systems.feedbackPresets ?? []).length === 0)) {
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
  if ((systems.countdowns ?? []).length > 0) {
    add("scripting", "runtime-countdowns");
  }
  if ((systems.feedbackPresets ?? []).length > 0) {
    add("scripting", "feedback-presets");
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

function collectLocalDataCapabilities(localData: ILocalDataIr | undefined, add: (domain: string, capability: string) => void): void {
  if (localData === undefined) {
    return;
  }
  add("localData", "runtime");
  if (localData.saveSlots.length > 0) {
    add("localData", "save-slots");
  }
  if (localData.resources.length > 0) {
    add("localData", "resources");
  }
  if (localData.components.length > 0) {
    add("localData", "components");
  }
  if (localData.settings.length > 0) {
    add("localData", "settings");
    for (const setting of localData.settings) {
      add("localData", `settings.${setting.group}`);
    }
  }
  if (localData.migration !== undefined) {
    add("localData", "migration");
  }
  if (localData.autosave !== undefined) {
    add("localData", "autosave");
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
  if ((ui.screens ?? []).length > 0) {
    add("ui", "screen-stack");
    for (const screen of ui.screens ?? []) {
      add("ui", `screen.${screen.role}`);
      if (screen.focusScope !== undefined) {
        add("ui", "focus-scope");
        add("ui", `input-capture.${screen.focusScope.inputCapture}`);
      }
      if (screen.stackPolicy !== undefined) {
        add("ui", `stack-policy.${screen.stackPolicy}`);
      }
    }
  }
  if ((ui.fonts ?? []).length > 0) {
    add("ui", "font-assets");
    for (const font of ui.fonts ?? []) {
      add("ui", `font.${font.family}`);
    }
  }
  visitUiNode(ui.root, add);
}

function visitUiNode(node: IUiIr["root"], add: (domain: string, capability: string) => void): void {
  add("ui", `node.${node.kind}`);
  if (node.kind === "image") {
    add("ui", "image");
  }
  if (node.kind === "slider" || node.kind === "scrollbar" || node.kind === "contextMenu" || node.kind === "textInput") {
    add("ui", "widget");
    add("ui", `widget.${node.kind}`);
  }
  if (node.disabled === true) {
    add("ui", "disabled");
  }
  if (node.image !== undefined) {
    add("ui", "image.metadata");
    if (node.image.atlas !== undefined) {
      add("ui", "image.atlas");
    }
    if (node.image.nineSlice !== undefined) {
      add("ui", "image.nine-slice");
    }
    if (node.image.flipX === true || node.image.flipY === true) {
      add("ui", "image.flip");
    }
    if (node.image.tileSize !== undefined) {
      add("ui", "image.tile");
    }
  }
  if ((node.spans ?? []).length > 0) {
    add("ui", "rich-text");
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
      || node.style.fontFamily !== undefined
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
  if (environment.sourceAssets.some((asset) => asset.lod?.some((level) => level.fade !== undefined))) {
    add("environment", "hlod-fades");
  }
  if (environment.sourceAssets.some((asset) => asset.visibility !== undefined) || environment.instances.some((instance) => instance.visibility !== undefined)) {
    add("environment", "visibility-ranges");
  }
  if (environment.sourceAssets.some((asset) => asset.debug?.gizmo === true) || environment.instances.some((instance) => instance.debug?.gizmo === true)) {
    add("environment", "debug-gizmos");
  }
  if (environment.scatter !== undefined && environment.scatter.length > 0) {
    add("environment", "scatter");
  }
  if (environment.terrain !== undefined) {
    add("environment", "terrain");
    if (environment.terrain.chunks !== undefined && environment.terrain.chunks.length > 0) {
      add("environment", "terrain.heightfield");
    }
    if (environment.terrain.collider?.kind === "heightfield") {
      add("physics", "collider.heightfield");
      add("physics", "rigid-body.static");
    }
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
    if (environment.atmosphere.volumetrics?.heightFog?.enabled === true) {
      add("rendering", "volumetric-height-fog");
    }
    if (environment.atmosphere.volumetrics?.godRays?.enabled === true) {
      add("rendering", "volumetric-god-rays");
    }
    if (environment.atmosphere.shadows.enabled) {
      add("rendering", "shadows");
    }
    const shadows = environment.atmosphere.shadows;
    if (
      shadows.maxDistance !== undefined
      || shadows.splitScheme !== undefined
      || shadows.splitLambda !== undefined
      || shadows.cascadeBlendFraction !== undefined
      || shadows.stabilized !== undefined
    ) {
      add("rendering", "shadow-cascade-profile");
    }
  }
  if (environment.skybox !== undefined) {
    add("rendering", "skybox");
  }
  if (environment.environmentMap !== undefined) {
    add("rendering", "environment-map");
  }
  if (environment.lightProbes !== undefined && environment.lightProbes.length > 0) {
    add("rendering", "light-probes");
    if (environment.lightProbes.some((probe) => "format" in probe.source && probe.source.format === "sh2")) {
      add("rendering", "baked-gi-probes");
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
