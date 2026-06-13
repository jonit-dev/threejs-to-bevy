import assert from "node:assert/strict";
import test from "node:test";

import { bundleSystemScripts } from "./bundle.js";
import { probeQuickJsLoadability } from "./quickjsProbe.js";

test("should parse primitive system bundle", async () => {
  const bundle = bundleSystemScripts([
    {
      name: "rotatePrimitiveCubes",
      reads: ["Transform"],
      script: {
        exportName: "system_rotatePrimitiveCubes",
        source: "(context) => context.query()[0]?.get(Transform)",
      },
    },
  ]);

  const result = await probeQuickJsLoadability(bundle.code ?? "");

  assert.equal(result.ok, true);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.nativeQuickJsBinding, "not-configured");
});

test("should reject bundle with native host globals", async () => {
  const result = await probeQuickJsLoadability("export const systems = { bad: () => window.location.href };\n");

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0]?.code, "TN_SCRIPT_QUICKJS_HOST_GLOBAL_UNSUPPORTED");
});
