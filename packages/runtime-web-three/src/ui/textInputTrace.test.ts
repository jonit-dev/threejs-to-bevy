import assert from "node:assert/strict";
import test from "node:test";

import { traceWebUiTextEdit } from "./textInputTrace.js";

test("should report caret position after deterministic text edits", () => {
  const trace = traceWebUiTextEdit("Nova", [
    { kind: "move", offset: -1 },
    { kind: "insert", text: "r" },
    { kind: "backspace" },
  ]);

  assert.deepEqual(trace.frames.map((frame) => [frame.value, frame.caret]), [
    ["Nova", 4],
    ["Nova", 3],
    ["Novra", 4],
    ["Nova", 3],
  ]);
  assert.equal(trace.capability.ime, "platform-diagnostic");
});
