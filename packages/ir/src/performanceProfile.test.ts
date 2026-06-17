import assert from "node:assert/strict";
import test from "node:test";

import type { IPerformanceProfile } from "./types.js";
import { validatePerformanceProfile } from "./performanceProfile.js";

test("performanceProfile should validate a web performance profile", () => {
  const diagnostics = validatePerformanceProfile(makeProfile());

  assert.deepEqual(diagnostics, []);
});

test("performanceProfile should reject warning thresholds above hard thresholds", () => {
  const diagnostics = validatePerformanceProfile({
    ...makeProfile(),
    p95FrameMs: { max: 22, warn: 30 },
  });

  assert.equal(diagnostics[0]?.code, "TN_IR_PERFORMANCE_WARN_EXCEEDS_MAX");
  assert.match(diagnostics[0]?.message ?? "", /p95FrameMs/);
});

test("should validate support profile repair hints when target capability is missing", () => {
  const diagnostics = validatePerformanceProfile({
    ...makeProfile(),
    support: {
      requirements: [
        {
          availableCapabilities: ["audio.device"],
          category: "audio",
          repairHints: [
            {
              code: "TN_SUPPORT_AUDIO_BACKEND_MISSING",
              missingCapability: "audio.decoder.ogg",
              suggestion: "Install or enable an OGG decoder backend for the target runtime.",
              target: "audio",
            },
          ],
          requiredCapabilities: ["audio.device", "audio.decoder.ogg"],
        },
      ],
    },
  });

  assert.equal(diagnostics[0]?.code, "TN_IR_SUPPORT_PROFILE_CAPABILITY_MISSING");
  assert.equal(diagnostics[0]?.value, "audio.decoder.ogg");
  assert.match(diagnostics[0]?.message ?? "", /audio/);
  assert.match(diagnostics[0]?.suggestion ?? "", /OGG decoder/);
});

function makeProfile(): IPerformanceProfile {
  return {
    averageFrameMs: { max: 18, warn: 16 },
    drawCalls: { max: 140, warn: 110 },
    instancedGroups: { max: 64, warn: 48 },
    instances: { max: 2000, warn: 1600 },
    loadMs: { max: 2500, warn: 1800 },
    p95FrameMs: { max: 22, warn: 18 },
    requiredTarget: "web",
    textureBytes: { max: 20000000, warn: 16000000 },
    triangles: { max: 500000, warn: 400000 },
    uninstancedRepeatedProps: { max: 0 },
    worstFrameMs: { max: 34, warn: 28 },
  };
}
