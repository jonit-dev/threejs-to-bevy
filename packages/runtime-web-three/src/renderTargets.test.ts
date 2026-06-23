import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import type { IWorldIr } from "@threenative/ir";

import { mapWorld } from "./mapWorld.js";
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
  renderer.setRenderTarget = ((target: THREE.WebGLRenderTarget | null) => {
    renderTargets.push(target);
  }) as typeof renderer.setRenderTarget;
  renderer.render = ((_scene: THREE.Scene, camera: THREE.Camera) => {
    for (const [id, mappedCamera] of mapped.cameras.entries()) {
      if (mappedCamera === camera && renderTargets.at(-1) === null) {
        backbufferCalls.push(id);
      }
    }
  }) as typeof renderer.render;

  const targetCameras = renderTargetCameraPasses(renderer, mapped, world, registry);
  assert.deepEqual(targetCameras, ["camera.depth", "camera.monitor"]);
  assert.equal(renderTargets[0]?.depthTexture?.name, "rt.depth");
  assert.equal(renderTargets[1]?.texture.name, "rt.monitor");
  assert.equal(backbufferCalls.length, 0);
});
