import assert from "node:assert/strict";
import test from "node:test";

import { assetCreationStrategy, blenderMcpOutcomeCoverage, findModelProvider } from "./registry.js";

test("should keep Hunyuan visible and fail closed without job handlers", () => {
  const provider = findModelProvider("hunyuan");
  assert.equal(provider?.status, "unsupported");
  assert.deepEqual(provider?.features, []);
  assert.match(provider?.unsupportedReason ?? "", /official|review|absent/iu);
});

test("should retain fixed twenty-two-row BlenderMCP outcome coverage", () => {
  assert.equal(blenderMcpOutcomeCoverage.length, 22);
  assert.deepEqual(blenderMcpOutcomeCoverage.map((row) => row.id), Array.from({ length: 22 }, (_, index) => index + 1));
  assert.equal(blenderMcpOutcomeCoverage.filter((row) => row.disposition !== "deferred").length, 19);
  assert.deepEqual(blenderMcpOutcomeCoverage.filter((row) => row.disposition === "deferred").map((row) => row.id), [20, 21, 22]);
  assert.equal(blenderMcpOutcomeCoverage.find((row) => row.id === 4)?.disposition, "safe-replacement");
  assert.ok(blenderMcpOutcomeCoverage.every((row) => row.owner !== "" && row.evidence !== ""));
});

test("should recommend catalog and reuse before paid generation or procedural fallback", () => {
  const guidance = assetCreationStrategy.join(" ").toLowerCase();
  assert.ok(guidance.indexOf("catalog") < guidance.indexOf("paid model-provider"));
  assert.ok(guidance.indexOf("reuse") < guidance.indexOf("paid model-provider"));
  assert.ok(guidance.indexOf("paid model-provider") < guidance.indexOf("blender recipe"));
  assert.ok(guidance.indexOf("blender recipe") < guidance.indexOf("finish with"));
  assert.doesNotMatch(guidance, /python|execute[_ ]blender[_ ]code|socket/iu);
});
