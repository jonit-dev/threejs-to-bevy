import assert from "node:assert/strict";
import test from "node:test";

import type { IRuntimeConfigIr } from "@threenative/ir";

import { webBloomSettings, webRendererParameters } from "./render.js";

function runtimeConfig(
  antialias: NonNullable<IRuntimeConfigIr["renderer"]>["antialias"],
  bloom?: NonNullable<NonNullable<IRuntimeConfigIr["renderer"]>["bloom"]>,
): IRuntimeConfigIr {
  return {
    schema: "threenative.runtime-config",
    version: "0.1.0",
    renderer: { antialias, ...(bloom === undefined ? {} : { bloom }) },
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

test("should map runtime bloom settings to web post-processing settings", () => {
  assert.deepEqual(webBloomSettings(runtimeConfig("msaa4")), {
    enabled: false,
    intensity: 0.15,
    threshold: 0,
  });
  assert.deepEqual(webBloomSettings(runtimeConfig("msaa4", { enabled: true, intensity: 0.35, threshold: 0.8 })), {
    enabled: true,
    intensity: 0.35,
    threshold: 0.8,
  });
});
