import assert from "node:assert/strict";
import test from "node:test";

import { bundleSystemScripts } from "./bundle.js";

test("should emit deterministic scripts movement system bundle", () => {
  const systems = [
    {
      name: "movePlayer",
      queries: [{ with: ["Transform"], without: [] }],
      reads: ["Transform"],
      script: {
        exportName: "system_movePlayer",
        source: "(context) => { for (const entity of context.query({ with: ['Transform'] })) entity.components.Transform.position[0] += 1; }",
      },
    },
  ];

  const first = bundleSystemScripts(systems);
  const second = bundleSystemScripts([...systems].reverse());

  assert.equal(first.code, second.code);
  assert.match(first.code ?? "", /const Transform = Object\.freeze/);
  assert.match(first.code ?? "", /system_movePlayer/);
  assert.deepEqual(first.diagnostics, []);
});

test("should normalize method shorthand system functions", () => {
  const result = bundleSystemScripts([
    {
      name: "applyDamage",
      script: {
        exportName: "system_applyDamage",
        source: "run(context) { return context; }",
      },
    },
  ]);

  assert.match(result.code ?? "", /const system_applyDamage = function run\(context\) \{ return context; \};/);
  assert.deepEqual(result.diagnostics, []);
});
