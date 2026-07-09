import assert from "node:assert/strict";
import test from "node:test";

import { validateUiNativeReport } from "./uiNative.js";

test("should fail when promoted native UI style lacks screenshot evidence", async () => {
  const report = {
    artifacts: {
      bevyScreenshot: "/missing/bevy.png",
      contactSheet: "/artifacts/contact.png",
      nativeReport: "/artifacts/native.json",
      webReport: "/artifacts/web.json",
      webScreenshot: "/artifacts/web.png",
    },
    capabilityScope: { ime: "platform-diagnostic", virtualKeyboard: "platform-diagnostic" },
    ok: true,
  };
  const diagnostics = await validateUiNativeReport(report, async (path) => {
    if (path.includes("missing")) throw new Error("missing");
  });
  assert.deepEqual(diagnostics.map((entry) => entry.path), ["/missing/bevy.png"]);
});
