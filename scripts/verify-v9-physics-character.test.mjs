import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("v9 physics-character verification report records promoted and deferred checklist items", async () => {
  const verifier = await readFile("scripts/verify-v9-physics-character.mjs", "utf8");

  for (const promoted of ["primitive-solver-v2", "broad-sensors", "character-push", "static-navigation", "backend-boundary-diagnostics"]) {
    assert.match(verifier, new RegExp(`"${promoted}"`));
  }
  assert.match(verifier, /"dynamic-mesh-colliders"/);
  assert.match(verifier, /artifacts\/conformance\/v9-physics-character\/diff-v9-physics-character\.json/);
});
