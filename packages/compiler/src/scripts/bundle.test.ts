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
  assert.deepEqual(first.manifest?.artifacts, [{ generated: true, path: "scripts.bundle.js", source: false }]);
});

test("should emit deterministic scripts bundle with stable system ids", () => {
  const systems = [
    {
      name: "zSystem",
      writes: ["Transform"],
      script: {
        exportName: "system_zSystem",
        source: "(context) => context.query()[0]?.patch(Transform, {})",
      },
    },
    {
      eventWrites: ["HitEvent"],
      name: "aSystem",
      script: {
        exportName: "system_aSystem",
        source: "(context) => context.events.emit(HitEvent, {})",
      },
    },
  ];

  const first = bundleSystemScripts(systems).code;
  const second = bundleSystemScripts([...systems].reverse()).code;

  assert.equal(first, second);
  assert.match(first ?? "", /export const systemIds = Object\.freeze/);
  assert.match(first ?? "", /"system_aSystem": "aSystem"/);
  assert.match(first ?? "", /"system_zSystem": "zSystem"/);
});

test("should emit script manifest source provenance when available", () => {
  const result = bundleSystemScripts([
    {
      name: "kartArcadePhysics",
      script: {
        exportName: "system_kartArcadePhysics",
        source: "(context) => context",
        sourceRef: {
          export: "kartArcadePhysics",
          hash: "sha256-deadbeef",
          module: "src/scripts/kartArcadePhysics.ts",
          systemId: "kartArcadePhysics",
        },
      },
    },
  ]);

  assert.deepEqual(result.manifest?.systems, [
    {
      generated: {
        bundle: "scripts.bundle.js",
        exportName: "system_kartArcadePhysics",
      },
      source: {
        export: "kartArcadePhysics",
        hash: "sha256-deadbeef",
        module: "src/scripts/kartArcadePhysics.ts",
      },
      systemId: "kartArcadePhysics",
    },
  ]);
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

test("should reject unresolved script source references before bundling", () => {
  const result = bundleSystemScripts([
    {
      name: "kartArcadePhysics",
      script: {
        exportName: "system_kartArcadePhysics",
        sourceRef: {
          export: "kartArcadePhysics",
          hash: "sha256-deadbeef",
          module: "src/scripts/kartArcadePhysics.ts",
          systemId: "kartArcadePhysics",
        },
      },
    },
  ]);

  assert.equal(result.code, undefined);
  assert.equal(result.diagnostics[0]?.code, "TN_SCRIPT_SOURCE_REFERENCE_UNRESOLVED");
  assert.equal(result.diagnostics[0]?.file, "src/scripts/kartArcadePhysics.ts");
});
