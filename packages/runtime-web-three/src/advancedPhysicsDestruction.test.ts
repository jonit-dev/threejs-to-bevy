import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { IFractureManifest, IWorldIr } from "@threenative/ir";

import { traceAdvancedPhysicsDestruction, type IAdvancedPhysicsDestructionScenarios } from "./advancedPhysicsDestruction.js";

const fixture = new URL("../../../packages/ir/fixtures/conformance/advanced-physics-destruction/game.bundle/", import.meta.url);

test("advanced destruction trace should replay the canonical impact, regional, and budget scenarios", async () => {
  const [world, manifest, scenarios, expected] = await Promise.all([
    readJson<IWorldIr>("world.ir.json"),
    readJson<IFractureManifest>("fractures/wall.main.json"),
    readJson<IAdvancedPhysicsDestructionScenarios>("destruction.scenarios.json"),
    readJson<Record<string, unknown>>("destruction.expected.json"),
  ]);

  const trace = await traceAdvancedPhysicsDestruction({ bundleHash: "sha256-bundle", expected, fixtureDir: fixture.pathname, manifest, scenarios, sourceHash: "sha256-source", world });

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
});

async function readJson<T>(path: string): Promise<T> { return JSON.parse(await readFile(new URL(path, fixture), "utf8")) as T; }
