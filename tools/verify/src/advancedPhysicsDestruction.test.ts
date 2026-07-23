import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { IWorldIr } from "@threenative/ir";

import {
  validateAdvancedPhysicsDestructionEvidence,
  validateAdvancedPhysicsDestructionFixture,
  type AdvancedPhysicsDestructionExpected,
  type AdvancedPhysicsDestructionScenarios,
  type AdvancedPhysicsDestructionTrace,
} from "./advancedPhysicsDestruction.js";

const fixture = new URL("../../../packages/ir/fixtures/conformance/advanced-physics-destruction/game.bundle/", import.meta.url);

test("should accept the canonical destruction fixture and paired bounded traces", async () => {
  const [world, scenarios, expected] = await Promise.all([
    json<IWorldIr>("world.ir.json"),
    json<AdvancedPhysicsDestructionScenarios>("destruction.scenarios.json"),
    json<AdvancedPhysicsDestructionExpected>("destruction.expected.json"),
  ]);
  assert.deepEqual(validateAdvancedPhysicsDestructionFixture(world, scenarios, expected), []);
  assert.deepEqual(validateAdvancedPhysicsDestructionEvidence(trace("web"), trace("bevy"), expected), []);
});

test("should reject stale or single-fixture destruction evidence", async () => {
  const expected = await json<AdvancedPhysicsDestructionExpected>("destruction.expected.json");
  const native = trace("bevy");
  native.bundleHash = "sha256-stale";
  assert.ok(validateAdvancedPhysicsDestructionEvidence(trace("web"), native, expected).some((diagnostic) => diagnostic.code === "TN_VERIFY_PHYSICS_DESTRUCTION_PROVENANCE"));
});

test("should reject weakened event ordering and regional isolation", async () => {
  const expected = await json<AdvancedPhysicsDestructionExpected>("destruction.expected.json");
  const web = trace("web");
  web.impact.ticks[1]!.events.reverse();
  web.regional.inactivePieces = [];
  const diagnostics = validateAdvancedPhysicsDestructionEvidence(web, trace("bevy"), expected);
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_PHYSICS_DESTRUCTION_EVENT_ORDER"));
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_PHYSICS_DESTRUCTION_REGIONAL_ISOLATION"));
});

test("should reject lost mass and silent budget overflow", async () => {
  const expected = await json<AdvancedPhysicsDestructionExpected>("destruction.expected.json");
  const web = trace("web");
  web.impact.physical.pieces[0]!.mass = 1;
  web.impact.physical.pieces[1]!.velocity[0] = 5;
  web.budget.activePieces = 3;
  web.budget.eventTypes = [];
  const diagnostics = validateAdvancedPhysicsDestructionEvidence(web, trace("bevy"), expected);
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_PHYSICS_DESTRUCTION_MASS"));
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_PHYSICS_DESTRUCTION_MOMENTUM"));
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_PHYSICS_DESTRUCTION_BUDGET"));
});

function trace(runtime: "bevy" | "web"): AdvancedPhysicsDestructionTrace {
  const pieces = ["piece.northeast", "piece.northwest", "piece.southeast", "piece.southwest"].map((id, index) => ({
    handle: index + 1,
    id,
    lifecycle: index < 2 ? "active" : "bound",
    mass: 20,
    position: [index, 0, 0],
    velocity: [0, 0, 0],
  }));
  return {
    budget: { activePieces: 2, eventTypes: ["damaged", "bondBroken", "pieceActivated", "pieceActivated", "budgetExceeded"], policy: "reject-new" },
    bundleHash: "sha256-bundle",
    fixture: "advanced-physics-destruction",
    fixedDt: 1 / 120,
    impact: {
      physical: { assemblyCollisionActive: false, pieces: structuredClone(pieces) },
      ticks: [
        { events: [{ assembly: "wall", bond: "bond.north", tick: 1, type: "damaged" }], tick: 1 },
        { events: [
          { assembly: "wall", bond: "bond.north", tick: 2, type: "damaged" },
          { assembly: "wall", bond: "bond.north", tick: 2, type: "bondBroken" },
          { assembly: "wall", piece: "piece.northwest", tick: 2, type: "pieceActivated" },
          { assembly: "wall", piece: "piece.northeast", tick: 2, type: "pieceActivated" },
        ], tick: 2 },
      ],
    },
    regional: { brokenBonds: ["bond.north", "bond.west"], inactivePieces: ["piece.southeast"], physical: { assemblyCollisionActive: false, pieces: structuredClone(pieces) } },
    runtime,
    schema: "threenative.advanced-physics-destruction-trace",
    sourceHash: "sha256-source",
    version: "0.1.0",
  };
}

async function json<T>(name: string): Promise<T> { return JSON.parse(await readFile(new URL(name, fixture), "utf8")) as T; }
