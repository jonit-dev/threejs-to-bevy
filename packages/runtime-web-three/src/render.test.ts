import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import type { IRuntimeConfigIr } from "@threenative/ir";

import { mapWorld } from "./mapWorld.js";
import { applyRendererColorManagement, createRenderedParticleObjects, renderCameraViews, webBloomSettings, webDepthOfFieldSettings, webRendererParameters } from "./render.js";

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
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
  } as THREE.WebGLRenderer;
}

test("should map runtime antialias modes to WebGL renderer parameters", () => {
  assert.deepEqual(webRendererParameters(runtimeConfig("none")), {
    antialias: false,
    preserveDrawingBuffer: true,
  });
  assert.deepEqual(webRendererParameters(runtimeConfig("msaa2")), {
    antialias: true,
    preserveDrawingBuffer: true,
  });
  assert.deepEqual(webRendererParameters(runtimeConfig("msaa4")), {
    antialias: true,
    preserveDrawingBuffer: true,
  });
  assert.deepEqual(webRendererParameters(runtimeConfig("msaa8")), {
    antialias: true,
    preserveDrawingBuffer: true,
  });
  for (const mode of ["fxaa", "taa", "smaa"] as const) {
    assert.deepEqual(webRendererParameters(runtimeConfig(mode)), {
      antialias: false,
      preserveDrawingBuffer: true,
    });
  }
});

test("should keep antialiasing enabled when runtime config is absent", () => {
  assert.deepEqual(webRendererParameters(), {
    antialias: true,
    preserveDrawingBuffer: true,
  });
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
