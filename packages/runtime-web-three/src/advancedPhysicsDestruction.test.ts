import assert from "node:assert/strict";
import test from "node:test";

import { traceAdvancedPhysicsDestruction } from "./advancedPhysicsDestruction.js";

const fixture = new URL("../../../packages/ir/fixtures/conformance/advanced-physics-destruction/game.bundle/", import.meta.url);

test("advanced destruction trace should replay the canonical impact, regional, and budget scenarios", async () => {
  const trace = await traceAdvancedPhysicsDestruction({ fixtureDir: fixture.pathname });

  assert.deepEqual(trace.impact.ticks.map(({ tick, events }) => ({ tick, types: events.map((event) => event.type) })), [
    { tick: 1, types: ["damaged"] },
    { tick: 2, types: ["damaged", "bondBroken", "pieceActivated", "pieceActivated"] },
  ]);
  assert.deepEqual(trace.impact.physical.pieces.map(({ id, lifecycle }) => ({ id, lifecycle })), [
    { id: "piece.northeast", lifecycle: "active" },
    { id: "piece.northwest", lifecycle: "active" },
    { id: "piece.southeast", lifecycle: "bound" },
    { id: "piece.southwest", lifecycle: "bound" },
  ]);
  assert.equal(trace.impact.physical.pieces.reduce((sum, piece) => sum + piece.mass, 0), 80);
  assert.deepEqual(trace.regional.brokenBonds, ["bond.north", "bond.west"]);
  assert.deepEqual(trace.regional.inactivePieces, ["piece.southeast"]);
  assert.equal(trace.budget.activePieces, 2);
  assert.ok(trace.budget.eventTypes.includes("budgetExceeded"));
  assert.match(trace.bundleHash, /^sha256-[a-f0-9]{64}$/u);
  assert.match(trace.sourceHash, /^sha256-[a-f0-9]{64}$/u);
});
