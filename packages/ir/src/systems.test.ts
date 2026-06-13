import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateBundle } from "./validate.js";

test("should reject schema ecs undeclared component write", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-"));
  try {
    await writeBundle(root);

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_SYSTEM_WRITE_UNDECLARED");
    assert.equal(result.diagnostics[0]?.path, "systems.ir.json/systems/0/commands/0/component");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject schema ecs system component without schema", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-schema-"));
  try {
    await writeBundle(root, {
      commands: [{ component: "Helath", entity: "target", kind: "setComponent" }],
      reads: [],
      writes: ["Helath"],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING");
    assert.equal(result.diagnostics[0]?.path, "systems.ir.json/systems/0/writes/0");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeBundle(
  root: string,
  system: {
    commands: unknown[];
    reads: string[];
    writes: string[];
  } = {
    commands: [{ component: "Health", entity: "target", kind: "setComponent" }],
    reads: ["Health"],
    writes: [],
  },
): Promise<void> {
  await writeJson(root, "manifest.json", {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "systems-test",
    requiredCapabilities: {},
    entry: {
      systems: "systems.ir.json",
      world: "world.ir.json",
    },
    files: {
      assets: "assets.manifest.json",
      materials: "materials.ir.json",
      targetProfile: "target.profile.json",
      componentSchemas: "schemas/components.schema.json",
    },
  });
  await mkdir(join(root, "schemas"), { recursive: true });
  await writeJson(root, "world.ir.json", {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [],
    resources: {},
    events: {},
    prefabs: [],
  });
  await writeJson(root, "systems.ir.json", {
    schema: "threenative.systems",
    version: "0.1.0",
      systems: [
        {
        commands: system.commands,
        eventReads: [],
        eventWrites: [],
        name: "badDamage",
        queries: [],
        reads: system.reads,
        schedule: "fixedUpdate",
        writes: system.writes,
      },
    ],
  });
  await writeJson(root, "schemas/components.schema.json", {
    schema: "threenative.component-schemas",
    version: "0.1.0",
    schemas: {
      Health: {
        fields: {
          current: { kind: "number", required: true },
        },
      },
    },
  });
  await writeJson(root, "assets.manifest.json", { schema: "threenative.assets", version: "0.1.0", assets: [] });
  await writeJson(root, "materials.ir.json", { schema: "threenative.materials", version: "0.1.0", materials: [] });
  await writeJson(root, "target.profile.json", { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] });
}

async function writeJson(root: string, file: string, value: unknown): Promise<void> {
  await writeFile(join(root, file), `${JSON.stringify(value, null, 2)}\n`);
}
