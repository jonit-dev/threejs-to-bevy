import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { AnimationRuntimeController, ParticleRuntimeController, animationPlaybackState, sampleTransformAnimations, traceAnimationGraphs } from "./animation.js";
import { loadBundle } from "./loadBundle.js";

test("animation trace should match V7 graph and particle fixture", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/animation-graphs-particles/game.bundle"));
  const trace = traceAnimationGraphs(bundle.assets, {
    fixedDelta: 0.5,
    parameters: { moving: true },
  });

  assert.deepEqual(trace, [
    {
      activeState: "run",
      asset: "model.hero",
      clip: "run",
      events: [{ atSeconds: 0.25, event: "Footstep", state: "run" }],
      initialState: "idle",
      parameters: { moving: true },
      particles: [
        {
          id: "dust",
          lifetimeSeconds: 0.5,
          maxParticles: 64,
          shape: "point",
          spawned: 6,
        },
      ],
      queuedEvents: [
        {
          event: "Footstep",
          payload: {
            asset: "model.hero",
            atSeconds: 0.25,
            clip: "run",
            state: "run",
          },
        },
      ],
      transition: {
        blendSeconds: 0.15,
        from: "idle",
        to: "run",
      },
    },
  ]);
});

test("animation playback should resolve active visual clip metadata", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/animation-graphs-particles/game.bundle"));
  const asset = bundle.assets.assets.find((candidate) => candidate.id === "model.hero");
  assert.equal(asset?.kind, "model");

  assert.deepEqual(animationPlaybackState(asset, { fixedDelta: 0.5, parameters: { moving: true } }), {
    activeState: "run",
    asset: "model.hero",
    clip: "run",
    loop: true,
    sourceClip: "Armature|Run",
    speed: 1.25,
    timeSeconds: 0.625,
  });
});

test("should return active runtime state when animation is playing", () => {
  const animation = new AnimationRuntimeController();

  assert.deepEqual(animation.play("player", "run", {
    activeState: "locomotion.run",
    durationSeconds: 2,
    loop: true,
    sourceClip: "Armature|Run",
    speed: 1.25,
  }), {
    active: true,
    activeState: "locomotion.run",
    clip: "run",
    entity: "player",
    loop: true,
    normalizedTime: 0,
    sourceClip: "Armature|Run",
    speed: 1.25,
    stopped: false,
    timeSeconds: 0,
  });

  animation.advance(0.5);

  assert.deepEqual(animation.query("player", "run"), {
    active: true,
    activeState: "locomotion.run",
    clip: "run",
    entity: "player",
    loop: true,
    normalizedTime: 0.3125,
    sourceClip: "Armature|Run",
    speed: 1.25,
    stopped: false,
    timeSeconds: 0.625,
  });
});

test("should report blend weights during graph transition", () => {
  const animation = new AnimationRuntimeController();

  animation.play("player", "idle", { durationSeconds: 2 });
  animation.play("player", "run", { blendSeconds: 0.4, durationSeconds: 1 });
  animation.advance(0.2);

  assert.deepEqual(animation.query("player", "run").blend, {
    complete: false,
    durationSeconds: 0.4,
    elapsedSeconds: 0.2,
    fromClip: "idle",
    fromWeight: 0.5,
    toClip: "run",
    toWeight: 0.5,
  });
});

test("should execute bounded particle burst command", () => {
  const particles = new ParticleRuntimeController({
    schema: "threenative.assets",
    version: "0.1.0",
    assets: [
      {
        format: "glb",
        id: "model.hero",
        kind: "model",
        particleEmitters: [{ id: "dust", lifetimeSeconds: 0.5, maxParticles: 8, ratePerSecond: 8, shape: "point" }],
        path: "assets/hero.glb",
      },
    ],
  });

  const emitted = particles.execute("emit", "model.hero", "dust", { count: 99, seed: "impact" });

  assert.deepEqual(emitted, {
    accepted: true,
    active: true,
    asset: "model.hero",
    command: "emit",
    count: 8,
    emitter: "dust",
    maxParticles: 8,
    seed: 510767767,
    status: "emitted",
  });
  assert.deepEqual(particles.advanceFixedTicks(30, 1 / 60), [{
    ...emitted,
    active: false,
    count: 0,
  }]);
  const playing = particles.execute("play", "model.hero", "dust", { seed: 7 });
  assert.deepEqual(playing, {
    accepted: true,
    active: true,
    asset: "model.hero",
    command: "play",
    count: 4,
    emitter: "dust",
    maxParticles: 8,
    seed: 7,
    status: "played",
  });

  assert.deepEqual(particles.advanceFixedTicks(30, 1 / 60), [playing]);
  assert.deepEqual(particles.execute("clear", "model.hero", "dust"), {
    accepted: true,
    active: false,
    asset: "model.hero",
    command: "clear",
    count: 0,
    emitter: "dust",
    maxParticles: 8,
    seed: 3788948739,
    status: "cleared",
  });
  assert.deepEqual(particles.snapshot(), []);
});

test("transform animation sampler should interpolate and loop deterministically", () => {
  const samples = sampleTransformAnimations({
    schema: "threenative.animations",
    version: "0.1.0",
    transformClips: [
      {
        id: "move",
        loop: "repeat",
        tracks: [
          {
            channel: "position",
            easing: "linear",
            keyframes: [
              { timeSeconds: 0, value: [0, 0, 0] },
              { timeSeconds: 1, value: [2, 0, 0] },
            ],
            target: "cube",
          },
          {
            channel: "scale",
            easing: "step",
            keyframes: [
              { timeSeconds: 0, value: [1, 1, 1] },
              { timeSeconds: 1, value: [2, 2, 2] },
            ],
            target: "cube",
          },
        ],
      },
    ],
  }, { timeSeconds: 1.25 });

  assert.deepEqual(samples, [
    { channel: "position", clip: "move", target: "cube", timeSeconds: 0.25, value: [0.5, 0, 0] },
    { channel: "scale", clip: "move", target: "cube", timeSeconds: 0.25, value: [1, 1, 1] },
  ]);
});
