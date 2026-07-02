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

test("should ignore native host global names inside bundle strings and comments", async () => {
  const result = await probeQuickJsLoadability(
    "export const systems = { good: () => { // window prose\nreturn 'The relay window closed.'; } };\n",
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.diagnostics, []);
});

test("should reject node protocol imports in bundle probes", async () => {
  const result = await probeQuickJsLoadability('import { readFileSync } from "node:fs"; export const systems = {};\n');

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0]?.code, "TN_SCRIPT_QUICKJS_HOST_GLOBAL_UNSUPPORTED");
});
