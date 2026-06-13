import assert from "node:assert/strict";
import test from "node:test";

import { bundleSystemScripts } from "./bundle.js";

test("should emit deterministic scripts movement system bundle", () => {
  const systems = [
    {
      name: "movePlayer",
      script: {
        exportName: "system_movePlayer",
        source: "(context) => { for (const entity of context.query({ with: ['Transform'] })) entity.components.Transform.position[0] += 1; }",
      },
    },
  ];

  const first = bundleSystemScripts(systems);
  const second = bundleSystemScripts([...systems].reverse());

  assert.equal(first.code, second.code);
  assert.match(first.code ?? "", /system_movePlayer/);
  assert.deepEqual(first.diagnostics, []);
});
