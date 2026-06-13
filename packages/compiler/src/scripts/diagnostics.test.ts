import assert from "node:assert/strict";
import test from "node:test";

import { diagnosePortableSystem } from "./diagnostics.js";

test("should reject scripts browser api in portable system", () => {
  const diagnostics = diagnosePortableSystem({
    source: "() => document.querySelector('canvas')",
    systemName: "badDom",
  });

  assert.equal(diagnostics[0]?.code, "TN_SCRIPT_DOM_API_UNSUPPORTED");
  assert.equal(diagnostics[0]?.severity, "error");
  assert.equal(diagnostics[0]?.path, "systems/badDom");
  assert.match(diagnostics[0]?.suggestion ?? "", /portable system context/);
});
