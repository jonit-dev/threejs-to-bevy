import assert from "node:assert/strict";
import test from "node:test";

import { buildComponentReflectionRegistry } from "./reflection.js";
import type { IIrSchemaFile } from "./types.js";

test("should build a deterministic component reflection registry", () => {
  const schemas: IIrSchemaFile = {
    schema: "threenative.component-schemas",
    schemas: {
      Transform: {
        fields: {
          position: { default: [0, 0, 0], kind: "vec3", required: false },
        },
      },
      Health: {
        fields: {
          max: { default: 100, kind: "number", required: false },
          current: { kind: "number", required: true },
        },
      },
    },
    version: "0.1.0",
  };

  assert.deepEqual(buildComponentReflectionRegistry(schemas), {
    components: [
      {
        fields: [
          { kind: "number", name: "current", required: true },
          { default: 100, kind: "number", name: "max", required: false },
        ],
        id: "Health",
      },
      {
        fields: [{ default: [0, 0, 0], kind: "vec3", name: "position", required: false }],
        id: "Transform",
      },
    ],
    schema: "threenative.component-reflection",
    version: "0.1.0",
  });
});
