import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { BoxGeometry, Mesh, MeshStandardMaterial, Object3D, Scene, animationClip, animationGraph, boundedParticleEmitter, modelAsset, textureAsset } from "@threenative/sdk";
import { validateBundle } from "@threenative/ir";

import { emitBundle } from "./bundle.js";
import { sceneToWorld } from "./scene-to-world.js";

test("assets should emit texture asset references", () => {
  const scene = new Scene({ id: "scene" });
  scene.add(
    new Mesh({
      geometry: new BoxGeometry(),
      id: "crate",
      material: new MeshStandardMaterial({
        baseColorTexture: textureAsset("tex.crate", "assets/crate.png"),
        emissiveTexture: textureAsset("tex.emissive", "assets/emissive.png"),
        metallicRoughnessTexture: textureAsset("tex.metallicRoughness", "assets/metallic-roughness.png"),
        normalTexture: textureAsset("tex.normal", "assets/normal.png"),
        occlusionTexture: textureAsset("tex.occlusion", "assets/occlusion.png"),
        color: "#ffffff",
      }),
    }),
  );

  const emitted = sceneToWorld(scene);

  assert.deepEqual(emitted.assets, [
    {
      format: "generated",
      id: "mesh.crate",
      kind: "mesh",
      primitive: "box",
      size: [1, 1, 1],
    },
    {
      format: "png",
      id: "tex.crate",
      kind: "texture",
      path: "assets/crate.png",
    },
    {
      format: "png",
      id: "tex.emissive",
      kind: "texture",
      path: "assets/emissive.png",
    },
    {
      format: "png",
      id: "tex.metallicRoughness",
      kind: "texture",
      path: "assets/metallic-roughness.png",
    },
    {
      format: "png",
      id: "tex.normal",
      kind: "texture",
      path: "assets/normal.png",
    },
    {
      format: "png",
      id: "tex.occlusion",
      kind: "texture",
      path: "assets/occlusion.png",
    },
  ]);
  assert.equal(emitted.materials[0]?.baseColorTexture, "tex.crate");
  assert.equal(emitted.materials[0]?.emissiveTexture, "tex.emissive");
  assert.equal(emitted.materials[0]?.metallicRoughnessTexture, "tex.metallicRoughness");
  assert.equal(emitted.materials[0]?.normalTexture, "tex.normal");
  assert.equal(emitted.materials[0]?.occlusionTexture, "tex.occlusion");
});

test("assets should emit deterministic model animation metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-animation-assets-"));
  try {
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets/hero.glb"), "model");
    const scene = new Scene({ id: "scene" });
    scene.add(
      new Object3D({
        assetRefs: [
          modelAsset("model.hero", "assets/hero.glb", {
            animations: [
              animationClip("run", { loop: true, sourceClip: "Armature|Run", speed: 1.2 }),
              animationClip("idle", { loop: true }),
            ],
          }),
        ],
        id: "hero.asset",
      }),
    );

    const bundlePath = await emitBundle(
      {
        entry: "src/game.ts",
        outDir: "dist/game.bundle",
        projectPath: root,
        schema: "threenative.project" as const,
        version: "0.1.0" as const,
      },
      scene,
    );
    const assets = JSON.parse(await readFile(join(bundlePath, "assets.manifest.json"), "utf8"));
    const manifest = JSON.parse(await readFile(join(bundlePath, "manifest.json"), "utf8"));
    const result = await validateBundle(bundlePath);

    assert.equal(result.ok, true);
    assert.deepEqual(assets.assets.find((asset: { id: string }) => asset.id === "model.hero"), {
      animations: [
        { id: "idle", loop: true },
        { id: "run", loop: true, sourceClip: "Armature|Run", speed: 1.2 },
      ],
      format: "glb",
      id: "model.hero",
      kind: "model",
      path: "assets/hero.glb",
    });
    assert.ok(manifest.requiredCapabilities.animation.includes("clip-metadata"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("assets should emit v7 animation graph and bounded particle capabilities", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-v7-animation-assets-"));
  try {
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets/hero.glb"), "model");
    const scene = new Scene({ id: "scene" });
    scene.add(
      new Object3D({
        assetRefs: [
          modelAsset("model.hero", "assets/hero.glb", {
            animationGraph: animationGraph({
              initialState: "idle",
              parameters: [{ default: false, id: "moving", kind: "boolean" }],
              states: [
                { clip: "run", events: [{ atSeconds: 0.25, event: "Footstep" }], id: "run" },
                { clip: "idle", id: "idle" },
              ],
              transitions: [{ blendSeconds: 0.15, from: "idle", to: "run", when: { equals: true, parameter: "moving" } }],
            }),
            animations: [animationClip("run"), animationClip("idle")],
            particleEmitters: [boundedParticleEmitter("dust", { lifetimeSeconds: 0.5, maxParticles: 64, ratePerSecond: 12, shape: "point" })],
          }),
        ],
        id: "hero.asset",
      }),
    );

    const bundlePath = await emitBundle(
      {
        entry: "src/game.ts",
        outDir: "dist/game.bundle",
        projectPath: root,
        schema: "threenative.project" as const,
        version: "0.1.0" as const,
      },
      scene,
    );
    const assets = JSON.parse(await readFile(join(bundlePath, "assets.manifest.json"), "utf8"));
    const manifest = JSON.parse(await readFile(join(bundlePath, "manifest.json"), "utf8"));
    const result = await validateBundle(bundlePath);
    const model = assets.assets.find((asset: { id: string }) => asset.id === "model.hero");

    assert.equal(result.ok, true);
    assert.equal(model.animationGraph.initialState, "idle");
    assert.deepEqual(model.particleEmitters, [
      { id: "dust", lifetimeSeconds: 0.5, maxParticles: 64, ratePerSecond: 12, shape: "point" },
    ]);
    assert.ok(manifest.requiredCapabilities.animation.includes("events"));
    assert.ok(manifest.requiredCapabilities.animation.includes("graph"));
    assert.ok(manifest.requiredCapabilities.animation.includes("state-machine"));
    assert.ok(manifest.requiredCapabilities.particles.includes("bounded-emitter"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
