import assert from "node:assert/strict";
import test from "node:test";

import { comparePlaytestParity, type ComparablePlaytestSummary } from "./parityPlaytestCompare.js";

test("gameplay parity comparator should pass movement parity within tolerance", () => {
  const result = comparePlaytestParity(summary({ distance: 1, movementDelta: [0, 0, -1] }), summary({ distance: 1.1, movementDelta: [0, 0.02, -1.1] }), {
    axisDelta: { z: 0.15 },
    movementDistance: { maxDelta: 0.15 },
  });

  assert.equal(result.pass, true);
  assert.deepEqual(result.diagnostics, []);
});

test("gameplay parity comparator should fail movement parity outside tolerance", () => {
  const result = comparePlaytestParity(summary({ distance: 1, movementDelta: [0, 0, -1] }), summary({ distance: 1.4, movementDelta: [0, 0, -1.4] }), {
    axisDelta: { z: 0.15 },
    movementDistance: { maxDelta: 0.15 },
  });

  assert.equal(result.pass, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAMEPLAY_PARITY_MOVEMENT_DRIFT"), true);
});

test("gameplay parity comparator should fail resource parity when requested path differs", () => {
  const result = comparePlaytestParity(
    summary({ observations: { resources: { GameState: { after: { checkpoint: 1 } } } } }),
    summary({ observations: { resources: { GameState: { after: { checkpoint: 0 } } } } }),
    { resources: ["GameState.checkpoint"] },
  );

  assert.equal(result.pass, false);
  assert.equal(result.diagnostics[0]?.code, "TN_GAMEPLAY_PARITY_RESOURCE_DRIFT");
});

test("projectile parity should fail when input, cooldown, or collision lifecycle evidence is removed", () => {
  const baseline = summary({
    observations: {
      resources: {
        ProjectileLauncher: {
          after: { cooldownRejected: 1, fired: 1, impacts: 1, lastImpactEntity: "projectile-impact-target" },
        },
      },
    },
  });
  const resources = [
    "ProjectileLauncher.fired",
    "ProjectileLauncher.cooldownRejected",
    "ProjectileLauncher.impacts",
    "ProjectileLauncher.lastImpactEntity",
  ];
  for (const [path, value] of [
    ["fired", 0],
    ["cooldownRejected", 0],
    ["impacts", 0],
    ["lastImpactEntity", ""],
  ] as const) {
    const mutated = summary({
      observations: {
        resources: {
          ProjectileLauncher: {
            after: { cooldownRejected: 1, fired: 1, impacts: 1, lastImpactEntity: "projectile-impact-target", [path]: value },
          },
        },
      },
    });
    const result = comparePlaytestParity(baseline, mutated, { resources });
    assert.equal(result.pass, false, `${path} mutation should fail parity`);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAMEPLAY_PARITY_RESOURCE_DRIFT"), true);
  }
});

test("gameplay parity comparator should fail contact parity when shared evidence is missing", () => {
  const result = comparePlaytestParity(
    summary({ assertions: [{ id: "contact.player", pass: true }] }),
    summary({ assertions: [{ id: "contact.player", pass: false }] }),
    { contacts: { minSharedCount: 1 } },
  );

  assert.equal(result.pass, false);
  assert.equal(result.diagnostics[0]?.code, "TN_GAMEPLAY_PARITY_CONTACT_DRIFT");
});

function summary(value: ComparablePlaytestSummary): ComparablePlaytestSummary {
  return {
    assertions: [],
    diagnostics: [],
    distance: 0,
    ...value,
  };
}
