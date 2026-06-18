import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { IR_DOCUMENTS } from "./documents.js";
import { validateBundle } from "./validate.js";

test("should return diagnostics for malformed manifest shape", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-manifest-shape-"));
  try {
    await writeJson(root, "manifest.json", {
      schema: "threenative.bundle",
      version: "0.1.0",
      entry: {},
      files: { targetProfile: "target.profile.json" },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_WORLD_ENTRY_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_MANIFEST_PATH_INVALID"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject manifest paths that drift from canonical document metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-manifest-path-drift-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, IR_DOCUMENTS.manifest.fileName, {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "schema-test",
      requiredCapabilities: {},
      entry: { world: "scene/world.ir.json" },
      files: {
        assets: "manifests/assets.json",
        materials: "materials.json",
        targetProfile: "target.json",
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.filter((diagnostic) => diagnostic.code === "TN_IR_MANIFEST_PATH_INVALID").map((diagnostic) => diagnostic.path),
      ["manifest.json/files/assets", "manifest.json/files/materials", "manifest.json/files/targetProfile"],
    );
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_WORLD_ENTRY_INVALID"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should return diagnostics for malformed runtime config shape", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-runtime-shape-"));
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
        runtimeConfig: "runtime.config.json",
      },
    });
    await writeJson(root, "runtime.config.json", {
      schema: "threenative.runtime-config",
      version: "0.1.0",
      renderer: { bloom: true },
      window: {},
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_RUNTIME_TIME_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_RUNTIME_RENDERER_ANTIALIAS_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === "runtime.config.json/renderer/bloom"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

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

test("should reject mesh renderer material references missing from materials document", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-missing-material-ref-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "world.ir.json", {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [{ id: "mesh.entity", components: { MeshRenderer: { material: "mat.missing", mesh: "mesh.main" } } }],
      resources: {},
      events: {},
      prefabs: [],
    });
    await writeJson(root, "assets.manifest.json", {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [{ id: "mesh.main", kind: "mesh", primitive: "box", size: [1, 1, 1] }],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.find((diagnostic) => diagnostic.code === "TN_IR_MESH_RENDERER_MATERIAL_MISSING")?.path, "world.ir.json/entities/0/components/MeshRenderer/material");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject mesh renderer mesh references missing from assets document", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-missing-mesh-ref-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "world.ir.json", {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [{ id: "mesh.entity", components: { MeshRenderer: { material: "mat.main", mesh: "mesh.missing" } } }],
      resources: {},
      events: {},
      prefabs: [],
    });
    await writeJson(root, "materials.ir.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [{ id: "mat.main", kind: "standard", color: "#ffffff" }],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.find((diagnostic) => diagnostic.code === "TN_IR_MESH_RENDERER_MESH_MISSING")?.path, "world.ir.json/entities/0/components/MeshRenderer/mesh");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject non finite transform values", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-invalid-transform-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "world.ir.json", {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [{ id: "bad.transform", components: { Transform: { position: [0, null, 0] } } }],
      resources: {},
      events: {},
      prefabs: [],
    });
    await writeJson(root, "materials.ir.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [{ id: "mat.main", kind: "standard", color: "#ffffff" }],
    });
    await writeJson(root, "assets.manifest.json", {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [{ id: "mesh.main", kind: "mesh", primitive: "box", size: [1, 1, 1] }],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.find((diagnostic) => diagnostic.code === "TN_IR_TRANSFORM_VALUE_INVALID")?.path, "world.ir.json/entities/0/components/Transform/position");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject public renderer plugin escape hatches", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-v10-renderer-plugin-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "manifest.json", {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "v10-boundary-test",
      requiredCapabilities: { renderer: ["runtime-plugin.custom-pass"] },
      entry: { world: "world.ir.json" },
      files: {
        assets: "assets.manifest.json",
        materials: "materials.ir.json",
        targetProfile: "target.profile.json",
        componentSchemas: "schemas/components.schema.json",
      },
    });

    const result = await validateBundle(root);
    const diagnostic = result.diagnostics.find((item) => item.code === "TN_IR_RENDERER_PLUGIN_UNSUPPORTED");

    assert.equal(result.ok, false);
    assert.equal(diagnostic?.severity, "error");
    assert.equal(diagnostic?.path, "manifest.json/requiredCapabilities/renderer");
    assert.equal(diagnostic?.target, "portable-web-native");
    assert.match(diagnostic?.suggestion ?? "", /portable plugin contract|SDK\/IR/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject online replication declarations while networking is non-portable", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-v10-networking-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "manifest.json", {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "v10-boundary-test",
      requiredCapabilities: { networking: ["replication.websocket"] },
      entry: { world: "world.ir.json" },
      files: {
        assets: "assets.manifest.json",
        materials: "materials.ir.json",
        targetProfile: "target.profile.json",
        componentSchemas: "schemas/components.schema.json",
      },
    });

    const result = await validateBundle(root);
    const diagnostic = result.diagnostics.find((item) => item.code === "TN_IR_NETWORKING_UNSUPPORTED");

    assert.equal(result.ok, false);
    assert.equal(diagnostic?.target, "portable-web-native");
    assert.match(diagnostic?.suggestion ?? "", /networking PRD|resources\/events/);
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

test("should accept promoted runtime renderer antialias modes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-runtime-renderer-valid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeRuntimeConfig(root, { antialias: "fxaa", bloom: { enabled: true, intensity: 0.35, threshold: 0.8 } });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept promoted runtime renderer quality metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-runtime-renderer-quality-valid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeRuntimeConfig(root, {
      antialias: "msaa4",
      colorGrading: { contrast: 0.15, exposure: 1.1, saturation: 0.9, toneMapping: "aces" },
      depthOfField: { aperture: 0.03, enabled: true, focusDistance: 12, maxBlur: 0.02 },
      renderPath: "forward",
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid runtime renderer antialias modes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-runtime-renderer-invalid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeRuntimeConfig(root, { antialias: "ssaa" });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_RUNTIME_RENDERER_ANTIALIAS_INVALID");
    assert.equal(result.diagnostics[0]?.path, "runtime.config.json/renderer/antialias");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported advanced renderer requests with stable diagnostics", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-runtime-renderer-advanced-invalid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeRuntimeConfig(root, {
      antialias: "msaa4",
      customPasses: [{ fragment: "frag.wgsl" }],
      motionVectors: true,
      renderPath: "deferred",
      screenSpaceReflections: true,
      virtualGeometry: true,
      volumetricFog: true,
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.path]),
      [
        ["TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED", "runtime.config.json/renderer/customPasses"],
        ["TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED", "runtime.config.json/renderer/motionVectors"],
        ["TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED", "runtime.config.json/renderer/screenSpaceReflections"],
        ["TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED", "runtime.config.json/renderer/virtualGeometry"],
        ["TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED", "runtime.config.json/renderer/volumetricFog"],
        ["TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED", "runtime.config.json/renderer/renderPath"],
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid runtime renderer depth of field settings", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-runtime-dof-invalid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeRuntimeConfig(root, { antialias: "msaa4", depthOfField: { aperture: -0.1, enabled: "yes", focusDistance: 0, maxBlur: Number.NaN } });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.path),
      [
        "runtime.config.json/renderer/depthOfField/enabled",
        "runtime.config.json/renderer/depthOfField/focusDistance",
        "runtime.config.json/renderer/depthOfField/aperture",
        "runtime.config.json/renderer/depthOfField/maxBlur",
      ],
    );
    assert.equal(result.diagnostics.every((diagnostic) => diagnostic.code === "TN_IR_RUNTIME_RENDERER_DOF_INVALID"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid runtime renderer bloom settings", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-runtime-bloom-invalid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeRuntimeConfig(root, { antialias: "msaa4", bloom: { enabled: "yes", intensity: -0.1, threshold: Number.NaN } });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.path),
      [
        "runtime.config.json/renderer/bloom/enabled",
        "runtime.config.json/renderer/bloom/intensity",
        "runtime.config.json/renderer/bloom/threshold",
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

test("should validate material emissive bloom metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-material-emissive-bloom-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "materials.ir.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [
        { id: "mat.valid", kind: "standard", color: "#ffffff", emissive: "#33ccff", emissiveBloom: { enabled: true, intensity: 0.8, threshold: 1.1 }, emissiveIntensity: 2.5 },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid material emissive bloom metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-material-emissive-bloom-invalid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "materials.ir.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [
        { id: "mat.invalid", kind: "standard", color: "#ffffff", emissiveBloom: { enabled: true, intensity: -1, threshold: Number.NaN } },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      [
        "TN_IR_MATERIAL_EMISSIVE_BLOOM_INVALID",
        "TN_IR_MATERIAL_EMISSIVE_BLOOM_INVALID",
        "TN_IR_MATERIAL_EMISSIVE_BLOOM_INVALID",
      ],
    );
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
    await writeJson(root, "materials.ir.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [{ id: "mat.main", kind: "standard", color: "#ffffff" }],
    });
    await writeJson(root, "assets.manifest.json", {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [{ id: "mesh.main", kind: "mesh", primitive: "box", size: [1, 1, 1] }],
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

test("should reject invalid light shadow bias values", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-light-shadow-bias-invalid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "world.ir.json", {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [
        {
          id: "sun",
          components: {
            Light: { color: "#ffffff", intensity: 1, kind: "directional", shadowBias: "low", shadowNormalBias: Number.POSITIVE_INFINITY },
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
      "TN_IR_LIGHT_SHADOW_BIAS_INVALID",
      "TN_IR_LIGHT_SHADOW_BIAS_INVALID",
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported shadow filter modes when authored", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-light-shadow-filter-invalid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "world.ir.json", {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [
        {
          id: "lamp",
          components: {
            Light: { color: "#ffffff", intensity: 1, kind: "point", shadowFilter: { mode: "variance", quality: "medium" } },
          },
        },
      ],
      resources: {},
      events: {},
      prefabs: [],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_LIGHT_SHADOW_FILTER_UNSUPPORTED");
    assert.equal(result.diagnostics[0]?.path, "world.ir.json/entities/0/components/Light/shadowFilter");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid rendering light budget metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-light-budget-invalid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "world.ir.json", {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [],
      resources: {
        RenderingLightBudget: {
          cullingPolicy: "random",
          maximumShadowedPointLights: -1,
          maximumVisibleDynamicLights: 1.5,
          overBudgetSeverity: "fatal",
        },
      },
      events: {},
      prefabs: [],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
      "TN_IR_LIGHT_BUDGET_INVALID",
      "TN_IR_LIGHT_BUDGET_INVALID",
      "TN_IR_LIGHT_BUDGET_INVALID",
      "TN_IR_LIGHT_BUDGET_INVALID",
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should report over-budget dynamic lights when budget policy is error", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-light-budget-exceeded-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "world.ir.json", {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [
        {
          id: "light.point.a",
          components: {
            Light: { color: "#ffffff", intensity: 1, kind: "point", shadowFilter: { mode: "pcf", quality: "medium" } },
          },
        },
        {
          id: "light.point.b",
          components: {
            Light: { color: "#ffffff", intensity: 1, kind: "point", shadowFilter: { mode: "pcf", quality: "medium" } },
          },
        },
      ],
      resources: {
        RenderingLightBudget: {
          cullingPolicy: "nearest",
          maximumShadowedPointLights: 1,
          maximumVisibleDynamicLights: 1,
          overBudgetSeverity: "error",
        },
      },
      events: {},
      prefabs: [],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.at(-1)?.code, "TN_IR_LIGHT_BUDGET_EXCEEDED");
    assert.equal(result.diagnostics.at(-1)?.path, "world.ir.json/resources/RenderingLightBudget");
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

test("should accept bounded dynamic mesh collider CCD and suspension joint metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-physics-mesh-joint-valid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "world.ir.json", {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [
        {
          id: "car.chassis",
          components: {
            Collider: { kind: "mesh", mesh: { bounds: { center: [0, 0.25, 0], size: [2, 0.5, 4] }, source: "mesh.car", triangleCount: 128 } },
            RigidBody: { ccd: { enabled: true, maxSubsteps: 4, mode: "swept-aabb" }, kind: "dynamic", velocity: [0, -12, 0] },
            Transform: { position: [0, 2, 0] },
          },
        },
        {
          id: "wheel.fl",
          components: {
            Collider: { kind: "sphere", radius: 0.35 },
            PhysicsJoint: { axis: [0, 1, 0], connectedEntity: "car.chassis", damping: 0.6, kind: "suspension", stiffness: 12, travel: 0.4 },
            RigidBody: { kind: "dynamic" },
            Transform: { position: [-0.8, 1.2, 1.2] },
          },
        },
      ],
      resources: {},
      events: {},
      prefabs: [],
    });

    const result = await validateBundle(root);

    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unbounded dynamic mesh collider and invalid joint metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-physics-mesh-joint-invalid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "world.ir.json", {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [
        {
          id: "car.chassis",
          components: {
            Collider: { kind: "mesh" },
            RigidBody: { ccd: { enabled: true, maxSubsteps: 32, mode: "teleport" }, kind: "dynamic" },
          },
        },
        {
          id: "wheel.fl",
          components: {
            PhysicsJoint: { connectedEntity: "missing", kind: "vehicle", limits: { max: -1, min: 1 } },
          },
        },
      ],
      resources: {},
      events: {},
      prefabs: [],
    });

    const result = await validateBundle(root);
    const diagnostics = result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.path]);

    assert.equal(result.ok, false);
    for (const expected of [
      ["TN_IR_PHYSICS_MESH_COLLIDER_INVALID", "world.ir.json/entities/0/components/Collider/mesh"],
      ["TN_IR_PHYSICS_CCD_INVALID", "world.ir.json/entities/0/components/RigidBody/ccd/mode"],
      ["TN_IR_PHYSICS_CCD_SUBSTEPS_INVALID", "world.ir.json/entities/0/components/RigidBody/ccd/maxSubsteps"],
      ["TN_IR_PHYSICS_DYNAMIC_MESH_COLLIDER_INVALID", "world.ir.json/entities/0/components/Collider/mesh"],
      ["TN_IR_PHYSICS_JOINT_UNSUPPORTED", "world.ir.json/entities/1/components/PhysicsJoint/kind"],
      ["TN_IR_PHYSICS_JOINT_TARGET_INVALID", "world.ir.json/entities/1/components/PhysicsJoint/connectedEntity"],
      ["TN_IR_PHYSICS_JOINT_LIMITS_INVALID", "world.ir.json/entities/1/components/PhysicsJoint/limits"],
    ]) {
      assert.equal(diagnostics.some(([code, path]) => code === expected[0] && path === expected[1]), true);
    }
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

async function writeRuntimeConfig(root: string, renderer: Record<string, unknown>): Promise<void> {
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
      runtimeConfig: "runtime.config.json",
    },
  });
  await writeJson(root, "runtime.config.json", {
    schema: "threenative.runtime-config",
    version: "0.1.0",
    renderer,
    time: { fixedDelta: 1 / 60, paused: false },
    window: { height: 720, width: 1280 },
  });
}

async function writeJson(root: string, file: string, value: unknown): Promise<void> {
  await writeFile(join(root, file), `${JSON.stringify(value, null, 2)}\n`);
}
