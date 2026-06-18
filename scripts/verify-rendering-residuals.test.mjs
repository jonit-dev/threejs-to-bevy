import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("rendering residuals verifier should declare native trace and visual evidence", async () => {
  const source = await readFile(new URL("./verify-rendering-residuals.mjs", import.meta.url), "utf8");

  assert.match(source, /rendering-residuals/);
  assert.match(source, /threenative_rendering_residuals_trace/);
  assert.match(source, /contact-sheet\.png/);
});
