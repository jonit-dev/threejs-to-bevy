import assert from "node:assert/strict";
import test from "node:test";

import type { IRuntimeConfigIr } from "@threenative/ir";

import { webRendererParameters } from "./render.js";

function runtimeConfig(antialias: NonNullable<IRuntimeConfigIr["renderer"]>["antialias"]): IRuntimeConfigIr {
  return {
    schema: "threenative.runtime-config",
    version: "0.1.0",
    renderer: { antialias },
    time: { fixedDelta: 1 / 60, paused: false },
    window: { height: 720, width: 1280 },
  };
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
});

test("should keep antialiasing enabled when runtime config is absent", () => {
  assert.deepEqual(webRendererParameters(), {
    antialias: true,
    preserveDrawingBuffer: true,
  });
});
