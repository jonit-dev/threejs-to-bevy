import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateBundle } from "./validate.js";

test("should reject component values outside schema", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-schema-"));
  try {
    await writeBundle(root, { current: "full", max: 100 });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_SCHEMA_FIELD_TYPE");
    assert.equal(result.diagnostics[0]?.path, "world.ir.json/entities/0/components/Health/current");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject schema missing entity reference", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-schema-entity-"));
  try {
    await writeBundle(root, { current: 100, max: 100, target: "missing" });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_ENTITY_REFERENCE_MISSING");
    assert.equal(result.diagnostics[0]?.path, "world.ir.json/entities/0/components/Health/target");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject schema unknown component fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-schema-extra-"));
  try {
    await writeBundle(root, { current: 100, extra: true, max: 100 });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_SCHEMA_FIELD_UNKNOWN");
    assert.equal(result.diagnostics[0]?.path, "world.ir.json/entities/0/components/Health/extra");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject schema unknown resource fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-schema-resource-extra-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "manifest.json", {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "schema-test",
      requiredCapabilities: {},
      entry: { world: "world.ir.json" },
      files: {
        assets: "assets.manifest.json",
        materials: "materials.ir.json",
        targetProfile: "target.profile.json",
        componentSchemas: "schemas/components.schema.json",
        resourceSchemas: "schemas/resources.schema.json",
      },
    });
    await writeJson(root, "world.ir.json", {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [{ id: "player", components: { Health: { current: 100, max: 100 } } }],
      resources: { GameState: { extra: true, phase: "playing" } },
      events: {},
      prefabs: [],
    });
    await writeJson(root, "schemas/resources.schema.json", {
      schema: "threenative.resource-schemas",
      version: "0.1.0",
      schemas: {
        GameState: {
          fields: {
            phase: { kind: "string", required: true },
          },
        },
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_SCHEMA_FIELD_UNKNOWN");
    assert.equal(result.diagnostics[0]?.path, "world.ir.json/resources/GameState/extra");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject schema event references without declarations", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-schema-events-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "world.ir.json", {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [{ id: "player", components: { Health: { current: 100, max: 100 } } }],
      resources: {},
      events: { DamageEvent: {} },
      prefabs: [],
    });
    await writeJson(root, "manifest.json", {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "schema-test",
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
        eventSchemas: "schemas/events.schema.json",
      },
    });
    await writeJson(root, "schemas/events.schema.json", {
      schema: "threenative.event-schemas",
      version: "0.1.0",
      schemas: {},
    });
    await writeJson(root, "systems.ir.json", {
      schema: "threenative.systems",
      version: "0.1.0",
      systems: [
        {
          commands: [{ event: "DamageEvent", kind: "emitEvent" }],
          eventReads: [],
          eventWrites: ["DamageEvent"],
          name: "emitDamage",
          queries: [],
          reads: [],
          resourceReads: [],
          resourceWrites: [],
          services: [],
          schedule: "update",
          writes: [],
        },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      ["TN_IR_EVENT_SCHEMA_MISSING", "TN_IR_SYSTEM_EVENT_SCHEMA_MISSING", "TN_IR_SYSTEM_EVENT_SCHEMA_MISSING"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeBundle(root: string, health: Record<string, unknown>): Promise<void> {
  await mkdir(join(root, "schemas"), { recursive: true });
  await writeJson(root, "manifest.json", {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "schema-test",
    requiredCapabilities: {},
    entry: { world: "world.ir.json" },
    files: {
      assets: "assets.manifest.json",
      materials: "materials.ir.json",
      targetProfile: "target.profile.json",
      componentSchemas: "schemas/components.schema.json",
    },
  });
  await writeJson(root, "world.ir.json", {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [{ id: "player", components: { Health: health } }],
    resources: {},
    events: {},
    prefabs: [],
  });
  await writeJson(root, "schemas/components.schema.json", {
    schema: "threenative.component-schemas",
    version: "0.1.0",
    schemas: {
      Health: {
        fields: {
          current: { kind: "number", required: true },
          max: { kind: "number", required: true },
          target: { kind: "entity", required: false },
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
