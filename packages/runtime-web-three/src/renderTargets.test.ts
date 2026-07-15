import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import type { IWorldIr } from "@threenative/ir";

import { mapWorld } from "./mapWorld.js";
import { renderCameraViews, renderComposerCameraViews } from "./render.js";
import { createRenderTargetRegistry, renderTargetCameraPasses } from "./renderTargets.js";

test("should render a target camera before material sampling", () => {
  const world: IWorldIr = {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        id: "camera.depth",
        components: {
          Camera: {
            far: 100,
            kind: "perspective",
            near: 0.1,
            target: { asset: "rt.depth", kind: "depth" },
          },
        },
      },
      {
        id: "camera.monitor",
        components: {
          Camera: {
            far: 100,
            kind: "perspective",
            near: 0.1,
            target: { asset: "rt.monitor", kind: "texture" },
          },
        },
      },
      {
        id: "camera.main",
        components: {
          Camera: {
            clear: { color: "#2244aa", mode: "color" },
            far: 100,
            kind: "perspective",
            near: 0.1,
            order: 1,
          },
        },
      },
      {
        id: "mesh.subject",
        components: {
          MeshRenderer: { material: "mat.subject", mesh: "mesh.box" },
          RenderLayers: { layers: ["monitor"] },
        },
      },
    ],
    resources: {
      ActiveCameras: {
        cameras: [{ entity: "camera.depth" }, { entity: "camera.monitor" }, { entity: "camera.main" }],
      },
    },
  };

  const mapped = mapWorld({
    assets: {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        { format: "depth24plus", height: 96, id: "rt.depth", kind: "render-target", usage: "depth", width: 128 },
        { format: "rgba8", height: 128, id: "rt.monitor", kind: "render-target", usage: "color", width: 128 },
        { id: "mesh.box", kind: "mesh", format: "generated", primitive: "box" },
      ],
    },
    manifest: {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "render-target",
      requiredCapabilities: {},
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    },
    materials: {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [{ color: "#ffffff", id: "mat.subject", kind: "standard" }],
    },
    targetProfile: { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] },
    world,
  });

  const renderer = {
    autoClear: true,
    clear: () => undefined,
    getRenderTarget: () => null,
    render: () => undefined,
    setClearColor: () => undefined,
    setRenderTarget: () => undefined,
  } as unknown as THREE.WebGLRenderer;

  const registry = createRenderTargetRegistry(
    {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        { format: "depth24plus", height: 96, id: "rt.depth", kind: "render-target", usage: "depth", width: 128 },
        { format: "rgba8", height: 128, id: "rt.monitor", kind: "render-target", usage: "color", width: 128 },
      ],
    },
    renderer,
  );
  const depthEntry = registry.entries.get("rt.depth");
  assert.equal(depthEntry?.usage, "depth");
  assert.equal(depthEntry?.target.depthTexture?.name, "rt.depth");
  assert.equal(depthEntry?.texture, depthEntry?.target.depthTexture);

  const renderTargets: Array<THREE.WebGLRenderTarget | null> = [];
  const backbufferCalls: string[] = [];
  const cascadeOrder: string[] = [];
  renderer.setRenderTarget = ((target: THREE.WebGLRenderTarget | null) => {
    renderTargets.push(target);
  }) as typeof renderer.setRenderTarget;
  renderer.render = ((_scene: THREE.Scene, camera: THREE.Camera) => {
    for (const [id, mappedCamera] of mapped.cameras.entries()) {
      if (mappedCamera === camera && renderTargets.at(-1) === null) {
        backbufferCalls.push(id);
      }
      if (mappedCamera === camera) {
        cascadeOrder.push(`render:${id}`);
      }
    }
  }) as typeof renderer.render;

  const targetCameras = renderTargetCameraPasses(renderer, mapped, world, registry, 0, (camera) => {
    for (const [id, mappedCamera] of mapped.cameras.entries()) {
      if (mappedCamera === camera) {
        cascadeOrder.push(`cascade:${id}`);
      }
    }
  });
  assert.deepEqual(targetCameras, ["camera.depth", "camera.monitor"]);
  assert.equal(renderTargets[0]?.depthTexture?.name, "rt.depth");
  assert.equal(renderTargets[1]?.texture.name, "rt.monitor");
  assert.equal(backbufferCalls.length, 0);
  assert.deepEqual(cascadeOrder, ["cascade:camera.depth", "render:camera.depth", "cascade:camera.monitor", "render:camera.monitor"]);
});

test("renderTargetCameraPasses should select mesh LOD before a target draw", () => {
  const { mapped, registry, renderer, world } = meshLodRenderFixture();
  let targetDraws = 0;
  renderer.render = (() => {
    const mesh = mapped.objectsById.get("mesh.subject");
    assert.ok(mesh instanceof THREE.Mesh);
    assert.equal(mesh.geometry.index?.count, 3);
    targetDraws += 1;
  }) as typeof renderer.render;

  renderTargetCameraPasses(renderer, mapped, world, registry);

  assert.equal(targetDraws, 1);
});

test("renderComposerCameraViews should render targets and current LOD before the composer draw", () => {
  const { mapped, registry, renderer, world } = meshLodRenderFixture();
  const drawOrder: string[] = [];
  renderer.render = (() => {
    const mesh = mapped.objectsById.get("mesh.subject");
    assert.ok(mesh instanceof THREE.Mesh);
    assert.equal(mesh.geometry.index?.count, 3);
    drawOrder.push("target");
  }) as typeof renderer.render;

  renderComposerCameraViews(renderer, mapped, world, registry, () => {
    const mesh = mapped.objectsById.get("mesh.subject");
    assert.ok(mesh instanceof THREE.Mesh);
    assert.equal(mesh.geometry.index?.count, 3);
    drawOrder.push("composer");
  });

  assert.deepEqual(drawOrder, ["target", "composer"]);
});

test("renderCameraViews should prepare target camera LOD exactly once", () => {
  const { mapped, registry, renderer, world } = meshLodRenderFixture();
  const camera = mapped.cameras.get("camera.target");
  assert.ok(camera !== undefined);
  const getWorldPosition = camera.getWorldPosition.bind(camera);
  let cameraSamples = 0;
  camera.getWorldPosition = ((target: THREE.Vector3) => {
    cameraSamples += 1;
    return getWorldPosition(target);
  }) as typeof camera.getWorldPosition;
  Object.assign(renderer, {
    domElement: { height: 64, width: 64 },
    getScissorTest: () => false,
    setScissor: () => undefined,
    setScissorTest: () => undefined,
    setViewport: () => undefined,
  });

  renderCameraViews(renderer, mapped, world, 0, registry);

  assert.equal(cameraSamples, 1);
});

function meshLodRenderFixture(): {
  mapped: ReturnType<typeof mapWorld>;
  registry: ReturnType<typeof createRenderTargetRegistry>;
  renderer: THREE.WebGLRenderer;
  world: IWorldIr;
} {
  const world: IWorldIr = {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        id: "camera.target",
        components: {
          Camera: { far: 100, kind: "perspective", near: 0.1, target: { asset: "rt.color", kind: "texture" } },
          Transform: { position: [10, 0, 0] },
        },
      },
      {
        id: "mesh.subject",
        components: {
          MeshRenderer: {
            lod: { levels: [{ mesh: "mesh.subject.lod.1", minDistance: 5 }] },
            material: "mat.subject",
            mesh: "mesh.subject",
          },
        },
      },
    ],
    resources: { ActiveCamera: { entity: "camera.target" } },
  };
  const assets = {
    schema: "threenative.assets" as const,
    version: "0.1.0" as const,
    assets: [
      { format: "rgba8" as const, height: 64, id: "rt.color", kind: "render-target" as const, usage: "color" as const, width: 64 },
      { format: "generated" as const, id: "mesh.subject", kind: "mesh" as const, primitive: "box" as const },
      {
        attributes: [{ itemSize: 3 as const, name: "position" as const, values: [-1, -1, 0, 1, -1, 0, 0, 1, 0] }],
        format: "generated" as const,
        id: "mesh.subject.lod.1",
        indices: [0, 1, 2],
        kind: "mesh" as const,
        primitive: "custom" as const,
      },
    ],
  };
  const mapped = mapWorld({
    assets,
    manifest: {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "mesh-lod-render-target",
      requiredCapabilities: {},
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    },
    materials: { schema: "threenative.materials", version: "0.1.0", materials: [{ color: "#ffffff", id: "mat.subject", kind: "standard" }] },
    targetProfile: { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] },
    world,
  });
  const renderer = {
    autoClear: true,
    clear: () => undefined,
    getRenderTarget: () => null,
    render: () => undefined,
    setClearColor: () => undefined,
    setRenderTarget: () => undefined,
  } as unknown as THREE.WebGLRenderer;
  return {
    mapped,
    registry: createRenderTargetRegistry(assets, renderer),
    renderer,
    world,
  };
}
