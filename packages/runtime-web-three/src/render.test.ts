import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { RENDER_LOOK_PROFILE_PRESETS, type IRuntimeConfigIr } from "@threenative/ir";

import type { IWebBundle } from "./loadBundle.js";
import { mapWorld } from "./mapWorld.js";
import { applyRendererColorManagement, applyRendererShadowSettings, applyRenderLookSceneDefaults, collectWebRuntimeDiagnostics, createRenderedParticleObjects, createWebRenderLifecycle, disposeThreeWorld, newAudioEvents, renderCameraViews, webAmbientOcclusionSettings, webBloomSettings, webDepthOfFieldSettings, webMotionBlurSettings, webRendererParameters, webScreenSpaceReflectionsSettings } from "./render.js";

function runtimeConfig(
  antialias: NonNullable<IRuntimeConfigIr["renderer"]>["antialias"],
  renderer?: Omit<NonNullable<IRuntimeConfigIr["renderer"]>, "antialias">,
): IRuntimeConfigIr {
  return {
    schema: "threenative.runtime-config",
    version: "0.1.0",
    renderer: { antialias, ...(renderer ?? {}) },
    time: { fixedDelta: 1 / 60, paused: false },
    window: { height: 720, width: 1280 },
  };
}

test("should disable tone mapping by default to match Bevy without atmosphere color management", () => {
  const renderer = mockRenderer();
  applyRendererColorManagement(renderer, undefined);
  assert.equal(renderer.outputColorSpace, THREE.SRGBColorSpace);
  assert.equal(renderer.toneMapping, THREE.NoToneMapping);
  assert.equal(renderer.toneMappingExposure, 1);
});

test("should map atmosphere color management to renderer tone mapping", () => {
  const renderer = mockRenderer();
  applyRendererColorManagement(renderer, {
    exposure: 1.05,
    outputColorSpace: "srgb",
    textureColorSpace: "srgb",
    toneMapping: "aces",
  });
  assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping);
  assert.equal(renderer.toneMappingExposure, 1.05);
});

test("should let runtime color grading drive renderer tone mapping and exposure", () => {
  const renderer = mockRenderer();
  applyRendererColorManagement(
    renderer,
    {
      exposure: 1.05,
      outputColorSpace: "srgb",
      textureColorSpace: "srgb",
      toneMapping: "none",
    },
    {
      contrast: 0.1,
      exposure: 1.2,
      saturation: 0.9,
      toneMapping: "aces",
    },
  );
  assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping);
  assert.equal(renderer.toneMappingExposure, 1.2);
});

function mockRenderer(): THREE.WebGLRenderer {
  return {
    outputColorSpace: THREE.NoColorSpace,
    shadowMap: { enabled: false, type: THREE.BasicShadowMap },
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
  } as THREE.WebGLRenderer;
}

test("should enable renderer shadow maps from render look quality", () => {
  const renderer = mockRenderer();
  applyRendererShadowSettings(renderer, runtimeConfig("msaa4", { renderLook: { version: 1, profile: "balanced", overrides: { shadowQuality: "high" } } }));
  assert.equal(renderer.shadowMap.enabled, true);
  assert.equal(renderer.shadowMap.type, THREE.PCFSoftShadowMap);

  applyRendererShadowSettings(renderer, runtimeConfig("none", { renderLook: { version: 1, profile: "parity", overrides: { shadowQuality: "off" } } }));
  assert.equal(renderer.shadowMap.enabled, false);
  assert.equal(renderer.shadowMap.type, THREE.BasicShadowMap);
});

test("should map runtime antialias modes to WebGL renderer parameters", () => {
  assert.deepEqual(webRendererParameters(runtimeConfig("none")), {
    antialias: false,
    preserveDrawingBuffer: false,
  });
  assert.deepEqual(webRendererParameters(runtimeConfig("msaa2")), {
    antialias: true,
    preserveDrawingBuffer: false,
  });
  assert.deepEqual(webRendererParameters(runtimeConfig("msaa4")), {
    antialias: true,
    preserveDrawingBuffer: false,
  });
  assert.deepEqual(webRendererParameters(runtimeConfig("msaa8")), {
    antialias: true,
    preserveDrawingBuffer: false,
  });
  for (const mode of ["fxaa", "taa", "smaa"] as const) {
    assert.deepEqual(webRendererParameters(runtimeConfig(mode)), {
      antialias: false,
      preserveDrawingBuffer: false,
    });
  }
});

test("should cancel pending animation frame on render lifecycle dispose", () => {
  const cancelled: number[] = [];
  const lifecycle = createWebRenderLifecycle({
    cancelAnimationFrame: (handle) => cancelled.push(handle),
    diagnostics: [],
    frame: () => undefined,
    requestAnimationFrame: () => 42,
  });

  lifecycle.schedule();
  lifecycle.dispose();

  assert.deepEqual(cancelled, [42]);
});

test("should consume appended and replaced audio event queues exactly once", () => {
  const cursors = new Map<string, unknown[]>();
  const first = { amount: 1 };
  const second = { amount: 2 };
  assert.deepEqual(newAudioEvents({ DamageEvent: [first] }, cursors), [
    { event: "DamageEvent", payload: first },
  ]);
  assert.deepEqual(newAudioEvents({ DamageEvent: [first, second] }, cursors), [
    { event: "DamageEvent", payload: second },
  ]);
  assert.deepEqual(newAudioEvents({ DamageEvent: [second] }, cursors), [
    { event: "DamageEvent", payload: second },
  ]);
  assert.deepEqual(newAudioEvents({ DamageEvent: [second] }, cursors), []);
});

test("should dispose owned scene geometry, materials, and textures once", () => {
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: texture });
  scene.add(new THREE.Mesh(geometry, material));
  let geometryDisposals = 0;
  let materialDisposals = 0;
  let textureDisposals = 0;
  geometry.dispose = () => { geometryDisposals += 1; };
  material.dispose = () => { materialDisposals += 1; };
  texture.dispose = () => { textureDisposals += 1; };
  const mapped = {
    cameras: new Map(),
    objectsById: new Map([["mesh", scene.children[0]!]]),
    scene,
  } as unknown as ReturnType<typeof mapWorld>;

  disposeThreeWorld(mapped);

  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
  assert.equal(textureDisposals, 1);
  assert.equal(scene.children.length, 0);
  assert.equal(mapped.objectsById.size, 0);
});

test("should detach render resources once on lifecycle dispose", () => {
  let disposed = 0;
  const lifecycle = createWebRenderLifecycle({
    cancelAnimationFrame: () => undefined,
    diagnostics: [],
    frame: () => undefined,
    onDispose: () => {
      disposed += 1;
    },
    requestAnimationFrame: () => 7,
  });

  lifecycle.schedule();
  lifecycle.dispose();
  lifecycle.dispose();

  assert.equal(disposed, 1);
});

test("should report rejected render frames as diagnostics", async () => {
  let frame: FrameRequestCallback | undefined;
  const diagnostics: Array<{ code: string; message: string; path: string; severity: "error" | "warning" }> = [];
  const lifecycle = createWebRenderLifecycle({
    cancelAnimationFrame: () => undefined,
    diagnostics,
    frame: async () => {
      throw new Error("boom");
    },
    requestAnimationFrame: (callback) => {
      frame = callback;
      return 9;
    },
  });

  lifecycle.schedule();
  frame?.(16);
  await Promise.resolve();
  await Promise.resolve();
  lifecycle.dispose();

  assert.equal(diagnostics[0]?.code, "TN_WEB_RENDER_FRAME_FAILED");
  assert.match(diagnostics[0]?.message ?? "", /boom/);
  assert.equal(diagnostics[0]?.path, "runtime.frame");
});

test("should keep antialiasing enabled when runtime config is absent", () => {
  assert.deepEqual(webRendererParameters(), {
    antialias: true,
    preserveDrawingBuffer: false,
  });
});

test("should preserve the drawing buffer only for explicit capture", () => {
  assert.equal(webRendererParameters(undefined, true).preserveDrawingBuffer, true);
  assert.equal(webRendererParameters(undefined, false).preserveDrawingBuffer, false);
});

test("should map runtime bloom settings to web post-processing settings", () => {
  assert.deepEqual(webBloomSettings(runtimeConfig("msaa4")), {
    enabled: false,
    intensity: 0.15,
    threshold: 0,
  });
  assert.deepEqual(webBloomSettings(runtimeConfig("msaa4", { bloom: { enabled: true, intensity: 0.35, threshold: 0.8 } })), {
    enabled: true,
    intensity: 0.35,
    threshold: 0.8,
  });
});

test("should map portable ambient occlusion settings to web SSAO settings", () => {
  assert.deepEqual(webAmbientOcclusionSettings(runtimeConfig("msaa4")), {
    enabled: false,
    intensity: 1,
    kernelSize: 32,
    maxDistance: 0.3,
    minDistance: 0.005,
    radius: 3,
  });
  assert.deepEqual(webAmbientOcclusionSettings(runtimeConfig("msaa4", {
    ambientOcclusion: { enabled: true, intensity: 1.5, mode: "screen-space", quality: "high", radius: 4 },
  })), {
    enabled: true,
    intensity: 1.5,
    kernelSize: 64,
    maxDistance: 0.6,
    minDistance: 0.005,
    radius: 4,
  });
});

test("should preserve parity render look without artistic passes", () => {
  assert.deepEqual(webBloomSettings(runtimeConfig("msaa4", { renderLook: { version: 1, profile: "parity" } })), {
    enabled: false,
    intensity: 0.15,
    threshold: 0,
  });
  const renderer = mockRenderer();
  applyRendererColorManagement(renderer, undefined);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#111318");
  applyRenderLookSceneDefaults(scene, { appliedProfile: "parity" });
  assert.equal(renderer.toneMapping, THREE.NoToneMapping);
  assert.equal(renderer.toneMappingExposure, 1);
  assert.equal(scene.background.getHexString(), "111318");
  assert.equal(scene.children.filter((child) => child instanceof THREE.Light).length, 0);
});

test("should map balanced render look to supported web renderer settings", () => {
  const renderer = mockRenderer();
  const config = runtimeConfig("msaa4", {
    renderLook: {
      version: 1,
      profile: "balanced",
      overrides: { bloomIntensity: 0.4, contrast: 0.1, exposure: 1.1, saturation: 1.15 },
    },
  });

  applyRendererColorManagement(renderer, undefined, {
    contrast: 0.1,
    exposure: 1.1,
    saturation: 1.15,
    toneMapping: "aces",
  });

  assert.deepEqual(webBloomSettings(config), {
    enabled: true,
    intensity: 0.4,
    threshold: 0.85,
  });
  assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping);
  assert.equal(renderer.toneMappingExposure, 1.1);
});

test("should map balanced render look defaults from the shared IR preset", () => {
  const renderer = mockRenderer();
  const preset = RENDER_LOOK_PROFILE_PRESETS.balanced;
  const config = runtimeConfig("msaa4", {
    renderLook: {
      version: 1,
      profile: "balanced",
    },
  });

  applyRendererColorManagement(renderer, undefined, {
    contrast: preset.contrast,
    exposure: preset.exposure,
    saturation: preset.saturation,
    toneMapping: preset.toneMapping,
  });

  assert.deepEqual(webBloomSettings(config), {
    enabled: true,
    intensity: preset.bloomIntensity,
    threshold: 0.85,
  });
  assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping);
  assert.equal(renderer.toneMappingExposure, preset.exposure);
});

test("should map cinematic render look defaults from the shared IR preset", () => {
  const renderer = mockRenderer();
  const preset = RENDER_LOOK_PROFILE_PRESETS.cinematic;
  const config = runtimeConfig("msaa8", {
    renderLook: {
      version: 1,
      profile: "cinematic",
    },
  });

  applyRendererColorManagement(renderer, undefined, {
    contrast: preset.contrast,
    exposure: preset.exposure,
    saturation: preset.saturation,
    toneMapping: preset.toneMapping,
  });

  assert.deepEqual(webBloomSettings(config), {
    enabled: true,
    intensity: preset.bloomIntensity,
    threshold: 0.85,
  });
  assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping);
  assert.equal(renderer.toneMappingExposure, preset.exposure);
});

test("should add balanced sky and fill lights when a scene has no authored lighting", () => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#111318");

  applyRenderLookSceneDefaults(scene, { appliedProfile: "balanced" });

  assert.equal(scene.background.getHexString(), "38bdf8");
  assert.deepEqual(scene.children.map((child) => child.name).sort(), [
    "renderLook.balanced.ambientFill",
    "renderLook.balanced.keyLight",
  ]);
});

test("should add cinematic sky and fill lights when a scene has no authored lighting", () => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#111318");

  applyRenderLookSceneDefaults(scene, { appliedProfile: "cinematic" });

  assert.equal(scene.background.getHexString(), "8fb6d8");
  assert.deepEqual(scene.children.map((child) => child.name).sort(), [
    "renderLook.cinematic.ambientFill",
    "renderLook.cinematic.keyLight",
  ]);
});

test("should map runtime depth of field settings to web post-processing settings", () => {
  assert.deepEqual(webDepthOfFieldSettings(runtimeConfig("msaa4")), {
    aperture: 0.02,
    enabled: false,
    focusDistance: 8,
    maxBlur: 0.01,
  });
  assert.deepEqual(webDepthOfFieldSettings(runtimeConfig("msaa4", { depthOfField: { aperture: 0.03, enabled: true, focusDistance: 12, maxBlur: 0.02 } })), {
    aperture: 0.03,
    enabled: true,
    focusDistance: 12,
    maxBlur: 0.02,
  });
});

test("should map runtime motion blur settings to web post-processing settings", () => {
  assert.deepEqual(webMotionBlurSettings(runtimeConfig("msaa4")), {
    enabled: false,
    shutterAngle: 0.5,
  });
  assert.deepEqual(webMotionBlurSettings(runtimeConfig("msaa4", { motionBlur: { enabled: true, shutterAngle: 0.4 } })), {
    enabled: true,
    shutterAngle: 0.4,
  });
});

test("should map runtime screen-space reflection settings to web post-processing settings", () => {
  assert.deepEqual(webScreenSpaceReflectionsSettings(runtimeConfig("msaa4")), {
    enabled: false,
    opacity: 0.27,
    roughnessLimit: 0.45,
  });
  assert.deepEqual(webScreenSpaceReflectionsSettings(runtimeConfig("msaa4", { screenSpaceReflections: { enabled: true, quality: "high", roughnessLimit: 0.5 } })), {
    enabled: true,
    opacity: 0.55,
    roughnessLimit: 0.5,
  });
});

test("should collect runtime visibility, camera, bounds, and asset diagnostics", () => {
  const bundle = {
    assets: {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [{ id: "mesh.cube", kind: "mesh", format: "generated", primitive: "box", size: [1, 1, 1] }],
    },
    manifest: {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "runtime-diagnostics",
      requiredCapabilities: {},
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    },
    materials: {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [{ id: "mat.main", kind: "standard", color: "#ffffff", extension: { preset: "unlitMasked" } }],
    },
    scenes: {
      schema: "threenative.scenes",
      version: "0.1.0",
      initialScene: "arena",
      scenes: [{ activation: "exclusive", id: "arena", kind: "level" }],
    },
    targetProfile: { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] },
    world: {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [
        {
          id: "camera.main",
          components: {
            Camera: { far: 100, fovY: 60, kind: "perspective", near: 0.1 },
            Transform: { position: [0, 0, 5] },
          },
        },
        {
          id: "cube.visible",
          components: {
            MeshRenderer: { material: "mat.main", mesh: "mesh.cube" },
            Transform: { position: [0, 0, 0] },
          },
        },
        {
          id: "cube.hidden",
          components: {
            MeshRenderer: { material: "mat.main", mesh: "mesh.cube", visible: false },
            Transform: { position: [10, 0, 0] },
          },
        },
      ],
      resources: { ActiveCamera: { entity: "camera.main" } },
    },
  } satisfies IWebBundle;
  const mapped = mapWorld(bundle);
  mapped.diagnostics.push({
    code: "TN-WEB-MODEL-LOAD-FAILED",
    message: "Failed to load model.",
    path: "assets.manifest.json/assets/kart/path",
    severity: "warning",
  });
  mapped.diagnostics.push({
    code: "TN_WEB_RENDER_FRAME_FAILED",
    message: "Frame failed.",
    path: "runtime.frame",
    severity: "error",
  });

  const diagnostics = collectWebRuntimeDiagnostics(mapped, bundle);

  assert.equal(diagnostics.activeCameraId, "camera.main");
  assert.equal(diagnostics.assets.declared, 1);
  assert.equal(diagnostics.assets.resourceFailures.length, 1);
  assert.equal(diagnostics.scene.entityCount, 3);
  assert.equal(diagnostics.scene.objectCount, 3);
  assert.equal(diagnostics.scene.currentSceneId, "arena");
  assert.equal(diagnostics.scene.culledMeshCount, 1);
  assert.equal(diagnostics.scene.visibleMeshCount, 1);
  assert.equal(diagnostics.scene.renderedEntities.length, 2);
  assert.equal(diagnostics.scene.renderedEntities.find((entity) => entity.id === "cube.visible")?.visible, true);
  assert.equal(diagnostics.scene.renderedEntities.find((entity) => entity.id === "cube.visible")?.clipping, "in-range");
  assert.deepEqual(diagnostics.scene.renderedEntities.find((entity) => entity.id === "cube.visible")?.finalScale, [1, 1, 1]);
  assert.equal(diagnostics.scene.renderedEntities.find((entity) => entity.id === "cube.visible")?.material?.type, "MeshStandardMaterial");
  assert.equal(diagnostics.scene.renderedEntities.find((entity) => entity.id === "cube.hidden")?.visible, false);
  assert.deepEqual(diagnostics.scene.worldBounds?.center, [0, 0, 0]);
  assert.deepEqual(diagnostics.scene.worldBounds?.size, [1, 1, 1]);
  assert.deepEqual(diagnostics.camera?.worldPosition, [0, 0, 5]);
  assert.equal(diagnostics.camera?.worldRadiusWithinClipRange, true);
  assert.equal(diagnostics.recentRuntimeErrors[0]?.code, "TN_WEB_RENDER_FRAME_FAILED");
});

test("should render active cameras in order with viewport scissors", () => {
  const mapped = mapWorld({
    assets: {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [],
    },
    manifest: {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "multi-view",
      requiredCapabilities: {},
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    },
    materials: {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [],
    },
    targetProfile: { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] },
    world: {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [
        {
          id: "camera.left",
          components: {
            Camera: {
              clear: { color: "#ff0000", mode: "color" },
              far: 100,
              kind: "perspective",
              near: 0.1,
              order: 1,
              viewport: [0, 0, 0.5, 1],
            },
          },
        },
        {
          id: "camera.right",
          components: {
            Camera: {
              clear: { color: "#0000ff", mode: "color" },
              far: 100,
              kind: "perspective",
              near: 0.1,
              order: 2,
              viewport: [0.5, 0, 0.5, 1],
            },
          },
        },
      ],
      resources: {
        ActiveCameras: { cameras: [{ entity: "camera.left" }, { entity: "camera.right" }] },
      },
    },
  });

  const renderer = {
    autoClear: true,
    domElement: { height: 600, width: 800 },
    getScissorTest: () => false,
    render: () => undefined,
    setClearColor: () => undefined,
    setScissor: () => undefined,
    setScissorTest: () => undefined,
    setViewport: () => undefined,
  } as unknown as THREE.WebGLRenderer;

  const viewportCalls: Array<{ height: number; width: number; x: number; y: number }> = [];
  const renderOrder: string[] = [];
  renderer.setViewport = ((x: number, y: number, width: number, height: number) => {
    viewportCalls.push({ x, y, width, height });
  }) as typeof renderer.setViewport;
  renderer.setScissor = ((x: number, y: number, width: number, height: number) => {
    viewportCalls.push({ x, y, width, height });
  }) as typeof renderer.setScissor;
  renderer.render = ((_scene: THREE.Scene, camera: THREE.Camera) => {
    for (const [id, mappedCamera] of mapped.cameras.entries()) {
      if (mappedCamera === camera) {
        renderOrder.push(id);
      }
    }
  }) as typeof renderer.render;

  const records = renderCameraViews(renderer, mapped, {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [],
    resources: { ActiveCameras: { cameras: [{ entity: "camera.left" }, { entity: "camera.right" }] } },
  });

  assert.deepEqual(renderOrder, ["camera.left", "camera.right"]);
  assert.deepEqual(records.map((record) => record.cameraId), ["camera.left", "camera.right"]);
  assert.deepEqual(records[0]?.viewport, { x: 0, y: 0, width: 400, height: 600 });
  assert.deepEqual(records[1]?.viewport, { x: 400, y: 0, width: 400, height: 600 });
  assert.ok(viewportCalls.length >= 4);
});

test("should create rendered particles from bounded emitter state", () => {
  const particles = createRenderedParticleObjects({
    schema: "threenative.assets",
    version: "0.1.0",
    assets: [
      {
        id: "model.hero",
        kind: "model",
        format: "glb",
        path: "assets/hero.glb",
        particleEmitters: [
          { id: "dust", lifetimeSeconds: 1, maxParticles: 8, ratePerSecond: 4, shape: "point" },
          { id: "spark", lifetimeSeconds: 1, maxParticles: 16, radius: 0.5, ratePerSecond: 12, shape: "sphere" },
        ],
      },
    ],
  }, 1);

  assert.equal(particles.length, 2);
  assert.deepEqual(particles.map((particle) => particle.name), ["particle.model.hero.dust", "particle.model.hero.spark"]);
  assert.equal(particles[0]?.geometry.getAttribute("position").count, 4);
  assert.equal(particles[1]?.geometry.getAttribute("position").count, 12);
  assert.equal(particles[0]?.userData.threeNativeParticleEmitter.count, 4);
});
