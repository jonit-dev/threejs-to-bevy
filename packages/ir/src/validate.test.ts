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

test("should validate fixed-trace systems tasks and channels", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-channels-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
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
      schemas: {
        LifecycleEvent: {
          fields: {
            phase: { kind: "string", required: true },
          },
        },
      },
    });
    await writeJson(root, "systems.ir.json", {
      schema: "threenative.systems",
      version: "0.1.0",
      channels: [{ delivery: "fixed-trace", event: "LifecycleEvent", id: "lifecycle" }],
      tasks: [{ channel: "lifecycle", id: "handoff", mode: "fixed-trace", schedule: "update" }],
      systems: [
        {
          commands: [],
          eventReads: ["LifecycleEvent"],
          eventWrites: ["LifecycleEvent"],
          name: "handoff",
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

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid systems task and channel declarations", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-channels-invalid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
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
      channels: [{ delivery: "timer", event: "LifecycleEvent", id: "lifecycle" }],
      tasks: [{ channel: "missing", id: "handoff", mode: "promise", schedule: "async" }],
      systems: [],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      [
        "TN_IR_SYSTEM_CHANNEL_EVENT_SCHEMA_MISSING",
        "TN_IR_SYSTEM_CHANNEL_DELIVERY_UNSUPPORTED",
        "TN_IR_SYSTEM_TASK_MODE_UNSUPPORTED",
        "TN_IR_SYSTEM_TASK_SCHEDULE_UNSUPPORTED",
        "TN_IR_SYSTEM_TASK_CHANNEL_MISSING",
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid material alpha values", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-material-alpha-invalid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "materials.ir.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [
        { id: "mat.invalid", kind: "standard", alphaCutoff: 1.2, alphaMode: "screen", color: "#ffffff", opacity: -0.1 },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      [
        "TN_IR_MATERIAL_ALPHA_MODE_INVALID",
        "TN_IR_MATERIAL_ALPHA_CUTOFF_INVALID",
        "TN_IR_MATERIAL_OPACITY_INVALID",
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid material emissive intensity", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-material-emissive-invalid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "materials.ir.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [
        { id: "mat.invalid", kind: "standard", color: "#ffffff", emissive: "#33ccff", emissiveIntensity: -0.1 },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_MATERIAL_EMISSIVE_INTENSITY_INVALID");
    assert.equal(result.diagnostics[0]?.path, "materials.ir.json/materials/0/emissiveIntensity");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid physical material factors", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-material-physical-invalid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "materials.ir.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [
        { id: "mat.invalid", kind: "standard", clearcoat: 1.2, clearcoatRoughness: -0.1, color: "#ffffff", specularIntensity: 2, transmission: -0.1 },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.path),
      [
        "materials.ir.json/materials/0/clearcoat",
        "materials.ir.json/materials/0/clearcoatRoughness",
        "materials.ir.json/materials/0/specularIntensity",
        "materials.ir.json/materials/0/transmission",
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid mesh renderer shadow flags", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-renderer-shadow-invalid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "world.ir.json", {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [
        {
          id: "mesh",
          components: {
            MeshRenderer: { castShadow: "yes", material: "mat.main", mesh: "mesh.main", receiveShadow: 1 },
          },
        },
      ],
      resources: {},
      events: {},
      prefabs: [],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
      "TN_IR_RENDER_SHADOW_FLAG_INVALID",
      "TN_IR_RENDER_SHADOW_FLAG_INVALID",
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept material alpha metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-material-alpha-valid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "materials.ir.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [
        { id: "mat.masked", kind: "standard", alphaCutoff: 0.4, alphaMode: "mask", color: "#ffffff", emissive: "#33ccff", emissiveIntensity: 2, opacity: 0.8 },
      ],
    });

    const result = await validateBundle(root);

    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.ok, true);
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
