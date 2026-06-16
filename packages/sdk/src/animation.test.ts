import assert from "node:assert/strict";
import test from "node:test";

import { defineAnimations, transformAnimationClip } from "./animation.js";
import { SdkError } from "./errors.js";

test("animation should create deterministic transform clips", () => {
  const animations = defineAnimations({
    transformClips: [
      transformAnimationClip("move", {
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
        ],
      }),
    ],
  });

  assert.deepEqual(animations, {
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
        ],
      },
    ],
  });
});

test("animation should reject non-monotonic transform keyframes", () => {
  assert.throws(
    () => transformAnimationClip("bad", {
      tracks: [
        {
          channel: "scale",
          keyframes: [
            { timeSeconds: 0, value: [1, 1, 1] },
            { timeSeconds: 0, value: [2, 2, 2] },
          ],
          target: "cube",
        },
      ],
    }),
    (error) => error instanceof SdkError && error.code === "TN_SDK_TRANSFORM_ANIMATION_TIME_NON_MONOTONIC",
  );
});
