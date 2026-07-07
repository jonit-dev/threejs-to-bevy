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
