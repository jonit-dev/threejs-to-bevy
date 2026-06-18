import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("animation physics residual verifier is wired to focused fixture and native trace", async () => {
  const source = await readFile("scripts/verify-animation-physics-residuals.mjs", "utf8");

  assert.match(source, /animation-physics-residuals\/game\.bundle/);
  assert.match(source, /threenative_animation_physics_residuals_trace/);
  assert.match(source, /tools\/verify\/artifacts\/animation-physics-residuals\/verification-report\.json/);
  assert.match(source, /animation masks/);
  assert.match(source, /crowd steering/);
});
