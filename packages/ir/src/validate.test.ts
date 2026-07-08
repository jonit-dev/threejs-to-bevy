import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { IR_DOCUMENTS } from "./documents.js";
import { writeTestBundle } from "./testFixtures.js";
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

test("should reject game flow transition to undeclared state", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-flow-invalid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "manifest.json", {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "flow-test",
      requiredCapabilities: {},
      entry: { gameFlow: "game-flow.ir.json", world: "world.ir.json" },
      files: {
        assets: "assets.manifest.json",
        componentSchemas: "schemas/components.schema.json",
        materials: "materials.ir.json",
        targetProfile: "target.profile.json",
      },
    });
    await writeJson(root, "game-flow.ir.json", {
      schema: "threenative.game-flow",
      version: "0.1.0",
      flows: [{
        id: "match",
        initial: "ready",
        states: [{ id: "ready" }],
        transitions: [{ id: "start", from: "ready", to: "playing", trigger: { kind: "event", event: "start" } }],
      }],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAMEFLOW_STATE_UNKNOWN"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject non-monotonic sequence key times", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-sequence-invalid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "manifest.json", {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "sequence-test",
      requiredCapabilities: {},
      entry: { sequences: "sequences.ir.json", world: "world.ir.json" },
      files: {
        assets: "assets.manifest.json",
        componentSchemas: "schemas/components.schema.json",
        materials: "materials.ir.json",
        targetProfile: "target.profile.json",
      },
    });
    await writeJson(root, "sequences.ir.json", {
      schema: "threenative.sequences",
      version: "0.1.0",
      sequences: [{
        duration: 2,
        id: "intro",
        tracks: [{ id: "camera", kind: "cameraPose", keyframes: [{ time: 1, value: {} }, { time: 0.5, value: {} }] }],
      }],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_SEQUENCE_KEYFRAMES_NOT_MONOTONIC"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject stale target profile schema literal", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-target-profile-schema-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "target.profile.json", { schema: "threenative.targetProfile", version: "0.1.0", targets: ["web"] });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.filter((diagnostic) => diagnostic.code === "TN_IR_TARGET_PROFILE_SCHEMA_UNSUPPORTED"),
      [
        {
          code: "TN_IR_TARGET_PROFILE_SCHEMA_UNSUPPORTED",
          message: "Target profile schema must be 'threenative.target-profile'.",
          path: "target.profile.json/schema",
          severity: "error",
          suggestion: "Update target.profile.json to use the canonical target-profile schema literal.",
          value: "threenative.targetProfile",
        },
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported target profile version", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-target-profile-version-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "target.profile.json", { schema: "threenative.target-profile", version: "1.0.0", targets: ["web"] });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.find((diagnostic) => diagnostic.code === "TN_IR_TARGET_PROFILE_VERSION_UNSUPPORTED")?.path, "target.profile.json/version");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported target profile target", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-target-profile-target-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "target.profile.json", { schema: "threenative.target-profile", version: "0.1.0", targets: ["web", "bevy"] });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.filter((diagnostic) => diagnostic.code === "TN_IR_TARGET_PROFILE_TARGET_UNSUPPORTED"),
      [
        {
          code: "TN_IR_TARGET_PROFILE_TARGET_UNSUPPORTED",
          limit: ["desktop", "web"],
          message: "Unsupported target profile target 'bevy'.",
          path: "target.profile.json/targets/1",
          severity: "error",
          suggestion: "Use 'desktop' for native desktop bundles; Bevy remains an adapter-private runtime name.",
          value: "bevy",
        },
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept canonical web desktop target profile", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-target-profile-canonical-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "target.profile.json", { schema: "threenative.target-profile", version: "0.1.0", targets: ["web", "desktop"] });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path.startsWith("target.profile.json")), false);
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

test("should accept runtime prefab catalog", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-runtime-prefab-valid-"));
  try {
    await writePrefabBundle(root, {
      schema: "threenative.prefabs",
      version: "0.1.0",
      prefabs: [
        {
          id: "prefab.crate",
          root: "root",
          entities: [
            { id: "root", components: { Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } } },
            { id: "child", components: { Hierarchy: { parent: "root" } } },
          ],
        },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject cyclic prefab hierarchy", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-runtime-prefab-cycle-"));
  try {
    await writePrefabBundle(root, {
      schema: "threenative.prefabs",
      version: "0.1.0",
      prefabs: [
        {
          id: "prefab.loop",
          root: "a",
          entities: [
            { id: "a", components: { Hierarchy: { parent: "b" } } },
            { id: "b", components: { Hierarchy: { parent: "a" } } },
          ],
        },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_PREFAB_HIERARCHY_CYCLE"), true);
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
    const diagnostic = result.diagnostics.find((candidate) => candidate.code === "TN_IR_MESH_RENDERER_MATERIAL_MISSING");
    assert.equal(diagnostic?.path, "world.ir.json/entities/0/components/MeshRenderer/material");
    assert.equal(diagnostic?.fix?.instruction.includes("durable material source document"), true);
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

test("should accept valid scene lifecycle document", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-scenes-valid-"));
  try {
    await writeSceneBundle(root, {
      initialScene: "menu",
      scenes: [
        {
          activation: "exclusive",
          assetGroups: ["bundle.requiredAssets"],
          audio: { music: "music.menu" },
          entities: ["player"],
          id: "menu",
          input: "Start",
          kind: "menu",
          systems: ["menuLoop"],
          transitions: { enter: { durationMs: 250, kind: "fade", color: "#000000" } },
          ui: ["ui.menu"],
        },
        {
          activation: "loading",
          id: "loading",
          kind: "loading",
          transitions: { enter: { durationMs: 0, kind: "instant" } },
        },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unknown initial scene", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-scenes-initial-"));
  try {
    await writeSceneBundle(root, {
      initialScene: "missing",
      scenes: [{ activation: "exclusive", id: "menu", kind: "menu" }],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_SCENE_INITIAL_UNKNOWN"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject duplicate exclusive ownership", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-scenes-ownership-"));
  try {
    await writeSceneBundle(root, {
      initialScene: "menu",
      scenes: [
        { activation: "exclusive", entities: ["player"], id: "menu", kind: "menu" },
        { activation: "exclusive", entities: ["player"], id: "level", kind: "level" },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) => diagnostic.code === "TN_IR_SCENE_OWNERSHIP_CONFLICT" && diagnostic.path === "scenes.ir.json/scenes/1/entities",
      ),
      true,
    );
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
    const diagnostic = result.diagnostics.find((candidate) => candidate.code === "TN_IR_TRANSFORM_VALUE_INVALID");
    assert.equal(diagnostic?.path, "world.ir.json/entities/0/components/Transform/position");
    assert.equal(diagnostic?.fix?.snippet?.includes('"scale": [1, 1, 1]'), true);
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

test("should accept parity and balanced render look profiles", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-render-look-valid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeRuntimeConfig(root, {
      antialias: "msaa4",
      renderLook: { version: 1, profile: "parity" },
    });

    let result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);

    await writeRuntimeConfig(root, {
      antialias: "msaa4",
      renderLook: {
        version: 1,
        profile: "balanced",
        overrides: { bloomIntensity: 0.4, contrast: 0.1, environmentIntensity: 1.2, exposure: 1.1, saturation: 1.15, shadowQuality: "high" },
      },
    });

    result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject out of range render look overrides", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-render-look-range-invalid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeRuntimeConfig(root, {
      antialias: "msaa4",
      renderLook: {
        version: 1,
        profile: "balanced",
        overrides: { bloomIntensity: 3, contrast: 0.7, environmentIntensity: 5, exposure: 0, saturation: -0.1, shadowQuality: "ultra" },
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.path, diagnostic.suggestion]),
      [
        ["TN_RENDER_LOOK_OUT_OF_RANGE", "runtime.config.json/renderer/renderLook/overrides/bloomIntensity", "Use bloomIntensity in the supported range 0..2."],
        ["TN_RENDER_LOOK_OUT_OF_RANGE", "runtime.config.json/renderer/renderLook/overrides/contrast", "Use contrast in the supported range -0.5..0.5."],
        ["TN_RENDER_LOOK_OUT_OF_RANGE", "runtime.config.json/renderer/renderLook/overrides/environmentIntensity", "Use environmentIntensity in the supported range 0..4."],
        ["TN_RENDER_LOOK_OUT_OF_RANGE", "runtime.config.json/renderer/renderLook/overrides/exposure", "Use exposure in the supported range 0.25..4."],
        ["TN_RENDER_LOOK_OUT_OF_RANGE", "runtime.config.json/renderer/renderLook/overrides/saturation", "Use saturation in the supported range 0..2."],
        ["TN_RENDER_LOOK_OUT_OF_RANGE", "runtime.config.json/renderer/renderLook/overrides/shadowQuality", "Use a promoted portable shadow quality value."],
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject backend-specific render look payloads", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-render-look-backend-invalid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeRuntimeConfig(root, {
      antialias: "msaa4",
      renderLook: {
        version: 1,
        profile: "balanced",
        bevyComponent: "BloomSettings",
        threePasses: ["UnrealBloomPass"],
        overrides: { composerPass: "custom", exposure: 1.1 },
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.path]),
      [
        ["TN_RENDER_PROFILE_UNSUPPORTED", "runtime.config.json/renderer/renderLook/overrides/composerPass"],
        ["TN_RENDER_PROFILE_UNSUPPORTED", "runtime.config.json/renderer/renderLook/bevyComponent"],
        ["TN_RENDER_PROFILE_UNSUPPORTED", "runtime.config.json/renderer/renderLook/threePasses"],
      ],
    );
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
      autoExposure: true,
      customPasses: [{ fragment: "frag.wgsl" }],
      customPostPasses: [{ id: "chromatic", shader: "chromatic.wgsl" }],
      decals: true,
      deferred: true,
      mirrors: true,
      motionBlur: true,
      motionVectors: true,
      renderPath: "deferred",
      screenSpaceReflections: true,
      ssr: true,
      virtualGeometry: true,
      volumetricFog: true,
      volumetricLighting: true,
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.path]),
      [
        ["TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED", "runtime.config.json/renderer/autoExposure"],
        ["TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED", "runtime.config.json/renderer/customPasses"],
        ["TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED", "runtime.config.json/renderer/customPostPasses"],
        ["TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED", "runtime.config.json/renderer/decals"],
        ["TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED", "runtime.config.json/renderer/deferred"],
        ["TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED", "runtime.config.json/renderer/mirrors"],
        ["TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED", "runtime.config.json/renderer/motionBlur"],
        ["TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED", "runtime.config.json/renderer/motionVectors"],
        ["TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED", "runtime.config.json/renderer/screenSpaceReflections"],
        ["TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED", "runtime.config.json/renderer/ssr"],
        ["TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED", "runtime.config.json/renderer/virtualGeometry"],
        ["TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED", "runtime.config.json/renderer/volumetricFog"],
        ["TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED", "runtime.config.json/renderer/volumetricLighting"],
        ["TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED", "runtime.config.json/renderer/renderPath"],
      ],
    );
    assert.equal(result.diagnostics.every((diagnostic) => diagnostic.target === "web,bevy"), true);
    assert.deepEqual(
      result.diagnostics.find((diagnostic) => diagnostic.path === "runtime.config.json/renderer/autoExposure")?.limit,
      ["deterministic histogram policy", "web/native exposure convergence report", "mobile fallback budget"],
    );
    assert.deepEqual(
      result.diagnostics.find((diagnostic) => diagnostic.path === "runtime.config.json/renderer/motionBlur")?.limit,
      ["shutter/sample semantics", "motion-vector or authored approximation policy", "video/screenshot proof"],
    );
    assert.deepEqual(
      result.diagnostics.find((diagnostic) => diagnostic.path === "runtime.config.json/renderer/mirrors")?.limit,
      ["material/reflection intent contract", "non-SSR fallback tier", "web/native screenshot evidence"],
    );
    assert.equal(
      result.diagnostics.find((diagnostic) => diagnostic.path === "runtime.config.json/renderer/renderPath")?.suggestion?.includes("target-profile render-path policy"),
      true,
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

test("should reject unsupported advanced material depth and PBR fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-material-advanced-unsupported-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "materials.ir.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [
        {
          id: "mat.advanced",
          kind: "standard",
          color: "#ffffff",
          anisotropy: 0.5,
          lightmapTexture: "tex.lightmap",
          parallaxTexture: "tex.height",
          specularTint: "#ffeecc",
        },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.path]),
      [
        ["TN_IR_MATERIAL_LIGHTMAP_UNSUPPORTED", "materials.ir.json/materials/0/lightmapTexture"],
        ["TN_IR_MATERIAL_PARALLAX_UNSUPPORTED", "materials.ir.json/materials/0/parallaxTexture"],
        ["TN_IR_MATERIAL_ADVANCED_PBR_UNSUPPORTED", "materials.ir.json/materials/0/anisotropy"],
        ["TN_IR_MATERIAL_ADVANCED_PBR_UNSUPPORTED", "materials.ir.json/materials/0/specularTint"],
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported advanced light kinds", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-light-advanced-unsupported-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "world.ir.json", {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [
        {
          id: "softbox",
          components: {
            Light: { color: "#ffffff", intensity: 1, kind: "area", size: [2, 1] },
          },
        },
      ],
      resources: {},
      events: {},
      prefabs: [],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_LIGHT_ADVANCED_UNSUPPORTED");
    assert.equal(result.diagnostics[0]?.path, "world.ir.json/entities/0/components/Light/kind");
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

test("should reject mismatched mass metadata and warn on suspect character capsule center", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-physics-body-capsule-invalid-"));
  try {
    await writeBundle(root, { current: 100, max: 100 });
    await writeJson(root, "manifest.json", {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "physics-footgun-test",
      requiredCapabilities: {},
      entry: { input: "input.ir.json", world: "world.ir.json" },
      files: {
        assets: "assets.manifest.json",
        componentSchemas: "schemas/components.schema.json",
        materials: "materials.ir.json",
        targetProfile: "target.profile.json",
      },
    });
    await writeJson(root, "input.ir.json", {
      schema: "threenative.input",
      version: "0.1.0",
      actions: [],
      axes: [
        { id: "MoveX", negative: [], positive: [] },
        { id: "MoveZ", negative: [], positive: [] },
      ],
    });
    await writeJson(root, "world.ir.json", {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [
        {
          id: "player",
          components: {
            CharacterController: {
              blocking: true,
              grounding: "raycast",
              moveXAxis: "MoveX",
              moveZAxis: "MoveZ",
              speed: 3,
            },
            Collider: { center: [0, 0, 0], height: 2, kind: "capsule", radius: 0.35 },
            RigidBody: { kind: "kinematic" },
            Transform: { position: [0, 0, 0] },
          },
        },
        {
          id: "crate",
          components: {
            Collider: { kind: "box", size: [1, 1, 1] },
            RigidBody: { inverseMass: 0.1, kind: "dynamic", mass: 2 },
            Transform: { position: [2, 0, 0] },
          },
        },
      ],
      resources: {},
      events: {},
      prefabs: [],
    });

    const result = await validateBundle(root);
    const diagnostics = result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.path, diagnostic.severity]);

    assert.equal(result.ok, false);
    assert.equal(diagnostics.some(([code, path]) => code === "TN_IR_PHYSICS_BODY_INVERSE_MASS_INVALID" && path === "world.ir.json/entities/1/components/RigidBody/inverseMass"), true);
    assert.equal(diagnostics.some(([code, path, severity]) => code === "TN_PHYSICS_CAPSULE_CENTER_SUSPECT" && path === "world.ir.json/entities/0/components/Collider/center" && severity === "warning"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept sine KinematicMover component", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-kinematic-mover-accept-"));
  try {
    await writeTestBundle(root, {
      world: {
        schema: "threenative.world",
        version: "0.1.0",
        entities: [
          {
            id: "hazard",
            components: {
              KinematicMover: { axis: "x", mode: "sine", phase: 0.25, radius: 2, speed: 3 },
              Transform: { position: [1, 0, 2] },
            },
          },
        ],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid KinematicMover mode and fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-kinematic-mover-reject-"));
  try {
    await writeTestBundle(root, {
      world: {
        schema: "threenative.world",
        version: "0.1.0",
        entities: [
          {
            id: "hazard",
            components: {
              KinematicMover: { axis: "q", mode: "orbit", radius: -1, speed: "fast" },
              Transform: { position: [0, 0, 0] },
            } as unknown as Record<string, unknown>,
          },
        ],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics
        .filter((diagnostic) => diagnostic.path.startsWith("world.ir.json/entities/0/components/KinematicMover"))
        .map((diagnostic) => diagnostic.code),
      [
        "TN_IR_KINEMATIC_MOVER_MODE_INVALID",
        "TN_IR_KINEMATIC_MOVER_SPEED_INVALID",
        "TN_IR_KINEMATIC_MOVER_AXIS_INVALID",
        "TN_IR_KINEMATIC_MOVER_RADIUS_INVALID",
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept wave Spawner component", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-spawner-accept-"));
  try {
    await writeTestBundle(root, {
      world: {
        schema: "threenative.world",
        version: "0.1.0",
        entities: [
          {
            id: "drone-spawner",
            components: {
              Spawner: {
                area: { shape: "box", size: [4, 0, 2] },
                despawnPolicy: { afterSeconds: 12, beyondDistance: 30 },
                enabled: true,
                jitterSeed: 42,
                maxAlive: 8,
                maxTotal: 24,
                mode: "wave",
                prefab: "prefab.drone",
                waveSize: 3,
              },
              Transform: { position: [0, 0, 0] },
            },
          },
        ],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid Spawner mode and fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-spawner-reject-"));
  try {
    await writeTestBundle(root, {
      world: {
        schema: "threenative.world",
        version: "0.1.0",
        entities: [
          {
            id: "drone-spawner",
            components: {
              Spawner: {
                area: { shape: "sphere", size: "wide" },
                enabled: "yes",
                interval: -1,
                maxAlive: 0,
                mode: "burst",
                prefab: "",
                waveSize: 0,
              },
            } as unknown as Record<string, unknown>,
          },
        ],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics
        .filter((diagnostic) => diagnostic.path.startsWith("world.ir.json/entities/0/components/Spawner"))
        .map((diagnostic) => diagnostic.code),
      [
        "TN_IR_SPAWNER_MODE_INVALID",
        "TN_IR_SPAWNER_PREFAB_INVALID",
        "TN_IR_SPAWNER_ENABLED_INVALID",
        "TN_IR_SPAWNER_INTERVAL_INVALID",
        "TN_IR_SPAWNER_WAVE_SIZE_INVALID",
        "TN_IR_SPAWNER_MAX_ALIVE_INVALID",
        "TN_IR_SPAWNER_AREA_SHAPE_INVALID",
        "TN_IR_SPAWNER_AREA_SIZE_INVALID",
      ],
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

async function writePrefabBundle(root: string, prefabs: unknown): Promise<void> {
  await writeBundle(root, { current: 100, max: 100 });
  await writeJson(root, "manifest.json", {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "prefab-test",
    requiredCapabilities: {},
    entry: { prefabs: "prefabs.ir.json", world: "world.ir.json" },
    files: {
      assets: "assets.manifest.json",
      componentSchemas: "schemas/components.schema.json",
      materials: "materials.ir.json",
      prefabs: "prefabs.ir.json",
      targetProfile: "target.profile.json",
    },
  });
  await writeJson(root, "prefabs.ir.json", prefabs);
}

async function writeSceneBundle(root: string, scenes: unknown): Promise<void> {
  await writeBundle(root, { current: 100, max: 100 });
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(join(root, "assets/music-menu.ogg"), "");
  await writeJson(root, "manifest.json", {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "schema-test",
    requiredCapabilities: {},
    entry: {
      audio: "audio.ir.json",
      scenes: "scenes.ir.json",
      systems: "systems.ir.json",
      ui: "ui.ir.json",
      world: "world.ir.json",
    },
    files: {
      assets: "assets.manifest.json",
      componentSchemas: "schemas/components.schema.json",
      input: "input.ir.json",
      materials: "materials.ir.json",
      targetProfile: "target.profile.json",
    },
  });
  await writeJson(root, "scenes.ir.json", {
    schema: "threenative.scenes",
    version: "0.1.0",
    ...(scenes as Record<string, unknown>),
  });
  await writeJson(root, "assets.manifest.json", {
    schema: "threenative.assets",
    version: "0.1.0",
    assets: [{ format: "ogg", id: "music.menu.asset", kind: "audio", path: "assets/music-menu.ogg" }],
    groups: [{ id: "bundle.requiredAssets", required: ["music.menu.asset"] }],
  });
  await writeJson(root, "input.ir.json", {
    schema: "threenative.input",
    version: "0.1.0",
    actions: [{ id: "Start", bindings: [{ code: "Enter", device: "keyboard" }] }],
    axes: [],
  });
  await writeJson(root, "audio.ir.json", {
    schema: "threenative.audio",
    version: "0.1.0",
    music: [{ asset: "music.menu.asset", id: "music.menu", loop: true }],
    oneShots: [],
  });
  await writeJson(root, "systems.ir.json", {
    schema: "threenative.systems",
    version: "0.1.0",
    systems: [
      {
        commands: [],
        eventReads: [],
        eventWrites: [],
        name: "menuLoop",
        queries: [],
        reads: [],
        resourceReads: [],
        resourceWrites: [],
        schedule: "update",
        services: [],
        writes: [],
      },
    ],
  });
  await writeJson(root, "ui.ir.json", {
    schema: "threenative.ui",
    version: "0.1.0",
    root: { children: [{ action: "Start", id: "ui.menu", kind: "button", label: "Start" }], id: "ui.root", kind: "column" },
  });
}

async function writeJson(root: string, file: string, value: unknown): Promise<void> {
  await writeFile(join(root, file), `${JSON.stringify(value, null, 2)}\n`);
}
