import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("input UI polish verifier should declare stable artifacts and native trace command", async () => {
  const script = await readFile(new URL("./verify-input-ui-polish.mjs", import.meta.url), "utf8");
  assert.match(script, /input-ui-polish\/game\.bundle/);
  assert.match(script, /threenative_input_ui_polish_trace/);
  assert.match(script, /tools\/verify\/artifacts\/input-ui-polish\/verification-report\.json/);
  assert.match(script, /compareReports/);
});
