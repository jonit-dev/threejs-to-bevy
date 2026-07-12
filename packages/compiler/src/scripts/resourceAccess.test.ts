import assert from "node:assert/strict";
import test from "node:test";

import { extractResourceAccess } from "./resourceAccess.js";

test("should infer resource reads and writes from literal helper calls", () => {
  const result = extractResourceAccess(
    `(ctx) => {
      const state = ctx.resources.get("GameState", { score: 0 });
      ctx.resources.patch("RoundState", { started: true });
      ctx.resources.set(ScoreState, { score: state.score + 1 });
    }`,
    { systemName: "score" },
  );

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.resourceReads, ["GameState"]);
  assert.deepEqual(result.resourceWrites, ["RoundState", "ScoreState"]);
  assert.deepEqual(result.resourceSchemas, {
    GameState: { fields: { score: { kind: "number" } } },
    RoundState: { fields: { started: { kind: "boolean" } } },
    ScoreState: { fields: { score: { kind: "json" } } },
  });
});

test("should reject dynamic resource ids with a fix", () => {
  const result = extractResourceAccess(
    `(context) => {
      const id = "GameState";
      context.resources.get(id, {});
    }`,
    { exportName: "readState", file: "src/scripts/state.ts", systemName: "readState" },
  );

  assert.equal(result.diagnostics[0]?.code, "TN_SCRIPT_DYNAMIC_RESOURCE_ID_UNSUPPORTED");
  assert.equal(result.diagnostics[0]?.file, "src/scripts/state.ts");
  assert.equal(result.diagnostics[0]?.target, "readState");
  assert.match(result.diagnostics[0]?.fix?.instruction ?? "", /literal resource id/);
  assert.match(result.diagnostics[0]?.suggestion ?? "", /resourceReads/);
});

test("should infer event writes and literal payload schema fields", () => {
  const result = extractResourceAccess(
    `(context) => {
      context.events.emit("match.win", { collected: 0, label: "complete", position: [1, 2, 3] });
    }`,
    { exportName: "finishMatch", file: "src/scripts/match.ts", systemName: "finishMatch" },
  );

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.eventWrites, ["match.win"]);
  assert.deepEqual(result.eventSchemas, {
    "match.win": {
      fields: {
        collected: { kind: "number" },
        label: { kind: "string" },
        position: { kind: "vec3" },
      },
    },
  });
});

test("should infer shorthand event payload fields from local resource defaults", () => {
  const result = extractResourceAccess(
    `(context) => {
      const orbs = context.resources.get("Orbs", { collected: 0 });
      let collected = orbs.collected;
      collected += 1;
      context.events.emit("match.win", { collected });
    }`,
    { systemName: "collect" },
  );

  assert.deepEqual(result.eventSchemas, {
    "match.win": { fields: { collected: { kind: "number" } } },
  });
});

test("should scope resource access to the referenced export", () => {
  const source = `
    export function awake(ctx: any): void {
      ctx.resources.set("GameState", { ready: true });
    }
    export function update(ctx: any): void {
      ctx.resources.get("InputState", { active: false });
    }
  `;

  assert.deepEqual(
    extractResourceAccess(source, { exportName: "awake", systemName: "lifecycle.awake" }).resourceWrites,
    ["GameState"],
  );
  const update = extractResourceAccess(source, { exportName: "update", systemName: "lifecycle.update" });
  assert.deepEqual(update.resourceReads, ["InputState"]);
  assert.deepEqual(update.resourceWrites, []);
});
