import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { loadBundle } from "./loadBundle.js";
import { traceProductionHardening } from "./productionHardening.js";

test("should apply declared mixer effect chain and production diagnostics", async () => {
  const bundle = await loadBundle(resolve("../../packages/ir/fixtures/conformance/production-hardening/game.bundle"));
  const report = traceProductionHardening(bundle.audio!, bundle.targetProfile);

  assert.equal(report.schema, "threenative.production-hardening");
  assert.deepEqual(report.audio.mixer.effects.map((effect) => effect.id), ["bus.master.gain", "bus.music.gain", "bus.sfx.gain", "duck.music"]);
  assert.equal(report.audio.deviceRouting.some((route) => route.device === "native-handle" && route.status === "diagnostic"), true);
  assert.equal(report.profiler.capture.hostState, "captured");
  assert.equal(report.profiler.gpu.state, "unavailable");
  assert.equal(report.debug.enabled, true);
  assert.equal(report.boundaries.some((boundary) => boundary.code === "TN_AUDIO_CUSTOM_DECODER_UNSUPPORTED"), true);
});
