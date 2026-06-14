import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { animationPlaybackState, traceAnimationGraphs } from "./animation.js";
import { loadBundle } from "./loadBundle.js";

test("animation trace should match V7 graph and particle fixture", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/v7-animation-graphs-particles/game.bundle"));
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
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/v7-animation-graphs-particles/game.bundle"));
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
