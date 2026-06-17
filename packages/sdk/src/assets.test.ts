import assert from "node:assert/strict";
import test from "node:test";

import { animationClip, animationEvent, animationGraph, boundedParticleEmitter, modelAsset, textureAsset } from "./assets.js";
import { SdkError } from "./errors.js";

test("assets should create deterministic model animation metadata", () => {
  const asset = modelAsset("model.hero", "assets/hero.glb", {
    animations: [
      animationClip("run", { loop: true, sourceClip: "Armature|Run", speed: 1.2 }),
      animationClip("idle", { loop: true }),
    ],
  });

  assert.deepEqual(asset, {
    animations: [
      { id: "idle", loop: true },
      { id: "run", loop: true, sourceClip: "Armature|Run", speed: 1.2 },
    ],
    format: "glb",
    id: "model.hero",
    kind: "model",
    path: "assets/hero.glb",
    sourceMode: "bundle",
  });
});

test("assets should reject unsupported advanced animation metadata", () => {
  assert.throws(
    () => animationClip("run", { speed: 0 }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_ANIMATION_SPEED_INVALID",
  );
  assert.throws(
    () => modelAsset("model.hero", "assets/hero.glb", { animations: [animationClip("run"), animationClip("run")] }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_ANIMATION_CLIP_DUPLICATE",
  );
  assert.throws(
    () => modelAsset("model.hero", "assets/hero.glb", { unsupported: { stateMachine: true } }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_ANIMATION_STATE_MACHINE_UNSUPPORTED",
  );
  assert.throws(
    () => modelAsset("model.hero", "assets/hero.glb", { unsupported: { engineController: true } }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_ANIMATION_ENGINE_CONTROLLER_UNSUPPORTED",
  );
});

test("assets should create texture sampler and transform metadata", () => {
  const asset = textureAsset("tex.floor", "assets/floor.png", {
    center: [0.5, 0.5],
    magFilter: "nearest",
    minFilter: "nearestMipmapLinear",
    offset: [0.25, 0.5],
    repeat: [4, 2],
    rotation: 0.5,
    wrapS: "repeat",
    wrapT: "mirroredRepeat",
  });

  assert.deepEqual(asset, {
    center: [0.5, 0.5],
    format: "png",
    id: "tex.floor",
    kind: "texture",
    magFilter: "nearest",
    minFilter: "nearestMipmapLinear",
    offset: [0.25, 0.5],
    path: "assets/floor.png",
    repeat: [4, 2],
    rotation: 0.5,
    sourceMode: "bundle",
    wrapS: "repeat",
    wrapT: "mirroredRepeat",
  });
});

test("assets should reject invalid texture transforms", () => {
  assert.throws(
    () => textureAsset("tex.floor", "assets/floor.png", { repeat: [1, Number.NaN] }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_TEXTURE_VECTOR_INVALID",
  );
  assert.throws(
    () => textureAsset("tex.floor", "assets/floor.png", { rotation: Number.POSITIVE_INFINITY }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_TEXTURE_ROTATION_INVALID",
  );
});

test("assets should create deterministic v7 animation graph and bounded particle metadata", () => {
  const graph = animationGraph({
    initialState: "idle",
    parameters: [
      { default: false, id: "moving", kind: "boolean" },
      { default: 0, id: "speed", kind: "number" },
    ],
    states: [
      { clip: "run", events: [animationEvent("Footstep", 0.25)], id: "run" },
      { clip: "idle", id: "idle" },
    ],
    transitions: [
      { blendSeconds: 0.15, from: "idle", to: "run", when: { equals: true, parameter: "moving" } },
    ],
  });
  const asset = modelAsset("model.hero", "assets/hero.glb", {
    animationGraph: graph,
    animations: [animationClip("run"), animationClip("idle")],
    particleEmitters: [boundedParticleEmitter("dust", { lifetimeSeconds: 0.5, maxParticles: 64, ratePerSecond: 12, shape: "point" })],
  });

  assert.deepEqual(asset.animationGraph, {
    initialState: "idle",
    parameters: [
      { default: false, id: "moving", kind: "boolean" },
      { default: 0, id: "speed", kind: "number" },
    ],
    states: [
      { clip: "idle", id: "idle" },
      { clip: "run", events: [{ atSeconds: 0.25, event: "Footstep" }], id: "run" },
    ],
    transitions: [
      { blendSeconds: 0.15, from: "idle", to: "run", when: { equals: true, parameter: "moving" } },
    ],
  });
  assert.deepEqual(asset.particleEmitters, [
    { id: "dust", lifetimeSeconds: 0.5, maxParticles: 64, ratePerSecond: 12, shape: "point" },
  ]);
});

test("should create renderable bounded particle emitter", () => {
  const asset = modelAsset("model.hero", "assets/hero.glb", {
    particleEmitters: [
      boundedParticleEmitter("spark", { lifetimeSeconds: 0.75, maxParticles: 16, radius: 0.4, ratePerSecond: 12, shape: "sphere" }),
      boundedParticleEmitter("dust", { lifetimeSeconds: 1, maxParticles: 8, ratePerSecond: 4, shape: "point" }),
    ],
  });

  assert.deepEqual(asset.particleEmitters, [
    { id: "dust", lifetimeSeconds: 1, maxParticles: 8, ratePerSecond: 4, shape: "point" },
    { id: "spark", lifetimeSeconds: 0.75, maxParticles: 16, radius: 0.4, ratePerSecond: 12, shape: "sphere" },
  ]);
});

test("assets should reject invalid v7 animation graph and particle metadata", () => {
  assert.throws(
    () => modelAsset("model.hero", "assets/hero.glb", {
      animationGraph: { initialState: "run", states: [{ clip: "missing", id: "run" }] },
      animations: [animationClip("idle")],
    }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_ANIMATION_GRAPH_CLIP_MISSING",
  );
  assert.throws(
    () => boundedParticleEmitter("dust", { lifetimeSeconds: 1, maxParticles: 0, ratePerSecond: 12, shape: "point" }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_PARTICLE_MAX_INVALID",
  );
});
