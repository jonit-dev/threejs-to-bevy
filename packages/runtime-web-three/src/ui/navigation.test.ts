import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { loadBundle } from "../loadBundle.js";
import { traceUiNavigation } from "./navigation.js";

test("ui navigation trace should follow focus order and activate actions", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/v7-rich-ui-navigation/game.bundle"));
  const trace = traceUiNavigation(bundle.ui!, { events: ["next", "activate"] });

  assert.deepEqual(trace, {
    events: [
      { focus: "settings", input: "next", kind: "focus" },
      { action: "OpenSettings", focus: "settings", input: "activate", kind: "activate" },
    ],
    finalFocus: "settings",
    focusOrder: ["play", "settings"],
    initialFocus: "play",
    safeArea: { edges: ["top", "bottom"], mode: "avoid" },
  });
});
