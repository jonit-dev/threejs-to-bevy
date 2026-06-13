import assert from "node:assert/strict";
import test from "node:test";

import { validateAtmosphereProfile } from "./rendering.js";
import type { IAtmosphereProfileIr } from "./types.js";

test("rendering should validate sun ambient fog sky and color management profile", () => {
  assert.deepEqual(validateAtmosphereProfile(makeProfile(), "environment.scene.json/atmosphere"), []);
});

test("rendering should reject lighting profile when sun intensity is negative", () => {
  const profile = makeProfile({ sun: { ...makeProfile().sun, intensity: -1 } });

  const diagnostics = validateAtmosphereProfile(profile, "environment.scene.json/atmosphere");

  assert.equal(diagnostics[0]?.code, "TN_IR_ATMOSPHERE_SUN_INTENSITY_INVALID");
});

test("rendering should reject linear fog when distance fields are missing", () => {
  const profile = makeProfile({ fog: { color: "#8899aa", enabled: true, mode: "linear" } });

  const diagnostics = validateAtmosphereProfile(profile, "environment.scene.json/atmosphere");

  assert.equal(diagnostics[0]?.code, "TN_IR_ATMOSPHERE_FOG_LINEAR_DISTANCE_MISSING");
});

test("rendering should reject shadow profile when map size exceeds target budget", () => {
  const profile = makeProfile({ shadows: { ...makeProfile().shadows, mapSize: 4096 as 2048 } });

  const diagnostics = validateAtmosphereProfile(profile, "environment.scene.json/atmosphere");

  assert.equal(diagnostics[0]?.code, "TN_IR_ATMOSPHERE_SHADOW_MAP_SIZE_EXCEEDED");
});

function makeProfile(overrides: Partial<IAtmosphereProfileIr> = {}): IAtmosphereProfileIr {
  return {
    active: true,
    id: "atmosphere.forest",
    sun: { castsShadow: true, color: "#ffd39a", direction: [-0.45, -0.8, -0.2], id: "sun.forest", intensity: 3.2 },
    ambient: { color: "#8fb2a5", intensity: 0.8, mode: "constant" },
    fog: { color: "#9eb6aa", density: 0.028, enabled: true, mode: "exponential" },
    sky: { color: "#9eb6aa", horizonColor: "#d6c39d" },
    colorManagement: { exposure: 1.05, outputColorSpace: "srgb", textureColorSpace: "srgb", toneMapping: "aces" },
    shadows: { bias: -0.0005, cascadeCount: 1, enabled: true, mapSize: 1024, maxDistance: 45, normalBias: 0.02, receiverPolicy: "terrain-and-path" },
    ...overrides,
  };
}
