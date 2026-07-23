import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { AerodynamicsTrace } from "./advancedPhysicsAerodynamics.js";
import { AERODYNAMICS_TRACE_SCHEMA, AERODYNAMICS_TRACE_VERSION, validateAdvancedPhysicsAerodynamicsEvidence } from "./advancedPhysicsAerodynamics.js";

test("should accept the canonical paired aerodynamic traces", async () => {
  const base = new URL("../artifacts/advanced-physics/phase-4-aerodynamics/", import.meta.url);
  const web = JSON.parse(await readFile(new URL("web-trace.json", base), "utf8")) as AerodynamicsTrace;
  const native = JSON.parse(await readFile(new URL("native-trace.json", base), "utf8")) as AerodynamicsTrace;
  assert.equal(web.schema, AERODYNAMICS_TRACE_SCHEMA);
  assert.equal(native.version, AERODYNAMICS_TRACE_VERSION);
  assert.deepEqual(validateAdvancedPhysicsAerodynamicsEvidence(web, native), []);
});

test("should reject a missing stall transition", async () => {
  const path = new URL("../artifacts/advanced-physics/phase-4-aerodynamics/web-trace.json", import.meta.url);
  const web = JSON.parse(await readFile(path, "utf8")) as AerodynamicsTrace;
  const broken = structuredClone(web);
  broken.runtime = "bevy";
  broken.observations.find((sample) => sample.label === "stall-entry")!.observation.surfaces.forEach((surface) => { surface.stalled = false; });
  assert.ok(validateAdvancedPhysicsAerodynamicsEvidence(web, broken).some((diagnostic) => diagnostic.code === "TN_VERIFY_AERODYNAMICS_STALL_ORDER"));
});

test("should enforce manifest-owned maneuver windows and adapter parity limits", async () => {
  const base = new URL("../artifacts/advanced-physics/phase-4-aerodynamics/", import.meta.url);
  const web = JSON.parse(await readFile(new URL("web-trace.json", base), "utf8")) as AerodynamicsTrace;
  const native = JSON.parse(await readFile(new URL("native-trace.json", base), "utf8")) as AerodynamicsTrace;
  const invalidWindowWeb = structuredClone(web);
  const invalidWindowNative = structuredClone(native);
  invalidWindowWeb.maneuverBounds.stallTick = [0, 1];
  invalidWindowNative.maneuverBounds.stallTick = [0, 1];
  assert.ok(validateAdvancedPhysicsAerodynamicsEvidence(invalidWindowWeb, invalidWindowNative).some((diagnostic) => diagnostic.code === "TN_VERIFY_AERODYNAMICS_MANEUVER_WINDOW"));
  const drifted = structuredClone(native);
  drifted.maneuverParity.finalPositionMaxDelta += 1;
  assert.ok(validateAdvancedPhysicsAerodynamicsEvidence(web, drifted).some((diagnostic) => diagnostic.code === "TN_VERIFY_AERODYNAMICS_MANEUVER_PARITY_DRIFT"));
});
