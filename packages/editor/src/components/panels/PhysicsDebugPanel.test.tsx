import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PHYSICS_DEBUG_CATEGORIES,
  PHYSICS_DEBUG_SCHEMA,
  PHYSICS_DEBUG_VERSION,
  type IPhysicsDebugSnapshot,
} from "@threenative/ir/physicsDebug";

import { nextPhysicsDebugCategories, PhysicsDebugPanel } from "./PhysicsDebugPanel.js";

test("physics debug inspector should expose every registry category and bounded live telemetry", () => {
  const snapshot: IPhysicsDebugSnapshot = {
    artifact: core(false),
    schema: PHYSICS_DEBUG_SCHEMA,
    summary: core(true),
    version: PHYSICS_DEBUG_VERSION,
  };
  const html = renderToStaticMarkup(
    <PhysicsDebugPanel
      enabledCategories={PHYSICS_DEBUG_CATEGORIES}
      onEnabledCategoriesChange={() => undefined}
      snapshot={snapshot}
    />,
  );
  for (const category of PHYSICS_DEBUG_CATEGORIES) {
    assert.match(html, new RegExp(`data-physics-debug-category="${category}"`));
    assert.match(html, new RegExp(`data-physics-debug-toggle="${category}"`));
  }
  assert.match(html, /Physics debug inspector/);
  assert.match(html, /data-physics-debug-primitive="contact:vehicle:ground:0"/);
  assert.match(html, /12 active/);
  assert.match(html, /7 additional primitives are retained in the artifact/);
});

test("physics debug inspector should deterministically toggle registry-owned views", () => {
  assert.deepEqual(
    nextPhysicsDebugCategories(PHYSICS_DEBUG_CATEGORIES, "contact"),
    PHYSICS_DEBUG_CATEGORIES.filter((category) => category !== "contact"),
  );
  assert.deepEqual(nextPhysicsDebugCategories(["collider"], "contact"), ["collider", "contact"]);

  const snapshot: IPhysicsDebugSnapshot = {
    artifact: core(false),
    schema: PHYSICS_DEBUG_SCHEMA,
    summary: core(false),
    version: PHYSICS_DEBUG_VERSION,
  };
  const html = renderToStaticMarkup(
    <PhysicsDebugPanel
      enabledCategories={["collider"]}
      onEnabledCategoriesChange={() => undefined}
      snapshot={snapshot}
    />,
  );
  assert.doesNotMatch(html, /data-physics-debug-primitive="contact:vehicle:ground:0"/);
  assert.match(html, /data-enabled="false" data-physics-debug-category="contact"/);
});

function core(truncated: boolean): IPhysicsDebugSnapshot["summary"] {
  return {
    omittedPrimitives: truncated ? 7 : 0,
    primitives: [{
      category: "contact",
      entity: "vehicle",
      id: "contact:vehicle:ground:0",
      kind: "point",
      position: [0, 0, 0],
      value: 12,
    }],
    telemetry: {
      allocatedPieces: 8,
      bodies: { active: 12, sleeping: 4 },
      contacts: 1,
      fixedDt: 1 / 60,
      queries: 4,
      rebuilds: 0,
      solverIterations: 12,
      tick: 42,
      timings: [{ milliseconds: 0.4, system: "physics" }],
    },
    truncated,
  };
}
