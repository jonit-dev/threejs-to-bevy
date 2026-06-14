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

test("should accept v4 movement system metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-v4-"));
  try {
    await writeBundle(root, {
      commands: [],
      reads: ["Transform", "Rotator"],
      services: ["physics.raycast"],
      writes: ["Transform"],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept v7 physics query services", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-v7-services-"));
  try {
    await writeBundle(root, {
      commands: [],
      reads: ["Transform"],
      services: ["physics.overlap", "physics.raycast", "physics.shapeCast"],
      writes: ["Transform"],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject undeclared service reference", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-v4-service-"));
  try {
    await writeBundle(root, {
      commands: [],
      reads: ["Transform"],
      services: ["physics.nativeHandle"],
      writes: ["Transform"],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_SYSTEM_SERVICE_UNSUPPORTED");
    assert.equal(result.diagnostics[0]?.path, "systems.ir.json/systems/0/services/0");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject schema ecs system resource without schema", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-resource-schema-"));
  try {
    await writeBundle(root, {
      commands: [],
      reads: [],
      resourceReads: ["Score"],
      resourceWrites: ["Score"],
      writes: [],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_SYSTEM_RESOURCE_SCHEMA_MISSING");
    assert.equal(result.diagnostics[0]?.path, "systems.ir.json/systems/0/resourceReads/0");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should allow built-in resource access without resource schema", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-builtin-resource-"));
  try {
    await writeBundle(root, {
      commands: [],
      reads: [],
      resourceReads: ["ActiveCamera"],
      writes: [],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept startup system schedule", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-startup-"));
  try {
    await writeBundle(root, {
      commands: [],
      reads: ["Transform"],
      schedule: "startup",
      writes: ["Transform"],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept v7 deterministic lifecycle metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-lifecycle-"));
  try {
    await writeBundle(root, {
      commands: [],
      lifecycle: {
        hotReload: "invalidate",
        replay: "fixed-trace",
        state: "system-local-disallowed",
      },
      reads: ["Transform"],
      schedule: "fixedUpdate",
      writes: ["Transform"],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept resource-derived app states, computed states, and substates", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-states-"));
  try {
    await writeBundle(root, {
      commands: [],
      lifecycle: {
        appStates: [
          {
            id: "Game",
            initial: "boot",
            source: { field: "phase", resource: "GameState" },
            values: ["boot", "playing"],
          },
        ],
        computedStates: [
          {
            fallback: "safe",
            id: "Difficulty",
            source: { field: "difficulty", resource: "GameState" },
            values: ["safe", "danger"],
          },
        ],
        hotReload: "invalidate",
        replay: "fixed-trace",
        state: "system-local-disallowed",
        substates: [
          {
            fallback: "grounded",
            id: "Locomotion",
            parent: "Game",
            parentValue: "playing",
            source: { field: "locomotion", resource: "GameState" },
            values: ["grounded", "airborne"],
          },
        ],
      },
      reads: ["Transform"],
      resourceReads: ["GameState"],
      schedule: "fixedUpdate",
      writes: ["Transform"],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept component lifecycle hook metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-component-hooks-"));
  try {
    await writeBundle(root, {
      commands: [],
      componentHooks: [
        {
          component: "Health",
          hooks: ["onAdd", "onInsert"],
        },
      ],
      reads: ["Health"],
      writes: ["Health"],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept observer event propagation metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-observers-"));
  try {
    await writeBundle(root, {
      commands: [],
      observers: [
        {
          event: "LifecycleEvent",
          phases: ["target", "bubble"],
          propagation: "target-ancestors",
        },
      ],
      reads: ["Transform"],
      schedule: "fixedUpdate",
      writes: ["Transform"],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept portable plugin and plugin-group declarations", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-plugins-"));
  try {
    await writeBundle(root, {
      commands: [],
      pluginGroups: [{ id: "gameplay", plugins: ["core"] }],
      plugins: [{ id: "core", systems: ["badDamage"] }],
      reads: ["Transform"],
      schedule: "fixedUpdate",
      writes: ["Transform"],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid plugin and plugin-group declarations", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-plugins-invalid-"));
  try {
    await writeBundle(root, {
      commands: [],
      pluginGroups: [
        { id: "gameplay", plugins: ["missing", "core", "core"], unsupported: true },
        { id: "gameplay", plugins: ["core"] },
      ],
      plugins: [
        { id: "core", systems: ["missing", "badDamage", "badDamage"], unsupported: true },
        { id: "core", systems: ["badDamage"] },
      ],
      reads: ["Transform"],
      schedule: "fixedUpdate",
      writes: ["Transform"],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
      "TN_IR_SYSTEM_PLUGIN_FIELD_UNSUPPORTED",
      "TN_IR_SYSTEM_PLUGIN_SYSTEM_MISSING",
      "TN_IR_SYSTEM_PLUGIN_SYSTEM_DUPLICATE",
      "TN_IR_SYSTEM_PLUGIN_DUPLICATE",
      "TN_IR_SYSTEM_PLUGIN_GROUP_FIELD_UNSUPPORTED",
      "TN_IR_SYSTEM_PLUGIN_GROUP_PLUGIN_MISSING",
      "TN_IR_SYSTEM_PLUGIN_GROUP_PLUGIN_DUPLICATE",
      "TN_IR_SYSTEM_PLUGIN_GROUP_DUPLICATE",
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported scripting lifecycle assumptions", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-lifecycle-invalid-"));
  try {
    await writeBundle(root, {
      async: true,
      commands: [],
      lifecycle: {
        hotReload: "state-handoff",
        npmPackage: "platform-timers",
        replay: "wall-clock",
        state: "system-local-persisted",
      },
      reads: ["Transform"],
      schedule: "fixedUpdate",
      timer: "setInterval",
      writes: ["Transform"],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      [
        "TN_IR_SYSTEM_LIFECYCLE_FIELD_UNSUPPORTED",
        "TN_IR_SYSTEM_LIFECYCLE_REPLAY_UNSUPPORTED",
        "TN_IR_SYSTEM_LIFECYCLE_STATE_UNSUPPORTED",
        "TN_IR_SYSTEM_LIFECYCLE_HOT_RELOAD_UNSUPPORTED",
        "TN_IR_SYSTEM_FIELD_UNSUPPORTED",
        "TN_IR_SYSTEM_FIELD_UNSUPPORTED",
      ],
    );
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.path),
      [
        "systems.ir.json/lifecycle/npmPackage",
        "systems.ir.json/lifecycle/replay",
        "systems.ir.json/lifecycle/state",
        "systems.ir.json/lifecycle/hotReload",
        "systems.ir.json/systems/0/async",
        "systems.ir.json/systems/0/timer",
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid component lifecycle hook metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-component-hooks-invalid-"));
  try {
    await writeBundle(root, {
      commands: [],
      componentHooks: [
        {
          component: "Missing",
          hooks: ["onRemove", "onAdd", "onAdd"],
          unsupported: true,
        },
        {
          component: "Health",
          hooks: ["onInsert"],
        },
        {
          component: "Health",
          hooks: ["onAdd"],
        },
      ],
      reads: ["Health"],
      writes: ["Health"],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
      "TN_IR_SYSTEM_COMPONENT_HOOK_FIELD_UNSUPPORTED",
      "TN_IR_SYSTEM_COMPONENT_HOOK_SCHEMA_MISSING",
      "TN_IR_SYSTEM_COMPONENT_HOOK_KIND_UNSUPPORTED",
      "TN_IR_SYSTEM_COMPONENT_HOOK_KIND_DUPLICATE",
      "TN_IR_SYSTEM_COMPONENT_HOOK_DUPLICATE",
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid observer event propagation metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-observers-invalid-"));
  try {
    await writeBundle(root, {
      commands: [],
      observers: [
        {
          event: "MissingEvent",
          phases: ["target", "target", "capture"],
          propagation: "broadcast",
          stop: "manual",
        },
      ],
      reads: ["Transform"],
      schedule: "fixedUpdate",
      writes: ["Transform"],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      [
        "TN_IR_SYSTEM_OBSERVER_FIELD_UNSUPPORTED",
        "TN_IR_SYSTEM_OBSERVER_EVENT_SCHEMA_MISSING",
        "TN_IR_SYSTEM_OBSERVER_PROPAGATION_UNSUPPORTED",
        "TN_IR_SYSTEM_OBSERVER_PHASE_DUPLICATE",
        "TN_IR_SYSTEM_OBSERVER_PHASE_UNSUPPORTED",
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid resource-derived state declarations", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-states-invalid-"));
  try {
    await writeBundle(root, {
      commands: [],
      lifecycle: {
        appStates: [
          {
            id: "Game",
            initial: "missing",
            source: { field: "phase", resource: "MissingState" },
            values: ["boot"],
          },
        ],
        computedStates: [
          {
            fallback: "safe",
            id: "Game",
            source: { field: "difficulty", resource: "GameState" },
            values: ["safe"],
          },
        ],
        hotReload: "invalidate",
        replay: "fixed-trace",
        state: "system-local-disallowed",
        substates: [
          {
            fallback: "grounded",
            id: "Locomotion",
            parent: "MissingParent",
            parentValue: "",
            source: { field: "locomotion", resource: "GameState" },
            values: ["grounded"],
          },
        ],
      },
      reads: ["Transform"],
      resourceReads: ["GameState"],
      schedule: "fixedUpdate",
      writes: ["Transform"],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      [
        "TN_IR_SYSTEM_STATE_VALUE_MISSING",
        "TN_IR_SYSTEM_STATE_RESOURCE_SCHEMA_MISSING",
        "TN_IR_SYSTEM_STATE_ID_DUPLICATE",
        "TN_IR_SYSTEM_SUBSTATE_PARENT_MISSING",
        "TN_IR_SYSTEM_SUBSTATE_PARENT_VALUE_INVALID",
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported v4 system stage", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-v4-stage-"));
  try {
    await writeBundle(root, {
      commands: [],
      reads: ["Transform"],
      schedule: "render",
      writes: ["Transform"],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_SYSTEM_STAGE_UNSUPPORTED");
    assert.equal(result.diagnostics[0]?.path, "systems.ir.json/systems/0/schedule");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeBundle(
  root: string,
  system: {
    async?: unknown;
    commands: unknown[];
    componentHooks?: unknown;
    lifecycle?: unknown;
    reads: string[];
    resourceReads?: string[];
    resourceWrites?: string[];
    observers?: unknown;
    pluginGroups?: unknown;
    plugins?: unknown;
    schedule?: unknown;
    services?: unknown[];
    timer?: unknown;
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
      eventSchemas: "schemas/events.schema.json",
      resourceSchemas: "schemas/resources.schema.json",
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
    ...(system.componentHooks === undefined ? {} : { componentHooks: system.componentHooks }),
    ...(system.lifecycle === undefined ? {} : { lifecycle: system.lifecycle }),
    ...(system.observers === undefined ? {} : { observers: system.observers }),
    ...(system.pluginGroups === undefined ? {} : { pluginGroups: system.pluginGroups }),
    ...(system.plugins === undefined ? {} : { plugins: system.plugins }),
    schema: "threenative.systems",
    version: "0.1.0",
    systems: [
      {
        ...(system.async === undefined ? {} : { async: system.async }),
        commands: system.commands,
        eventReads: [],
        eventWrites: [],
        name: "badDamage",
        queries: [],
        reads: system.reads,
        resourceReads: system.resourceReads ?? [],
        resourceWrites: system.resourceWrites ?? [],
        services: system.services ?? [],
        schedule: system.schedule ?? "fixedUpdate",
        ...(system.timer === undefined ? {} : { timer: system.timer }),
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
      Rotator: {
        fields: {
          radiansPerSecond: { kind: "number", required: true },
        },
      },
      Transform: {
        fields: {
          position: { kind: "vec3", required: false },
          rotation: { kind: "quat", required: false },
        },
      },
    },
  });
  await writeJson(root, "schemas/resources.schema.json", {
    schema: "threenative.resource-schemas",
    version: "0.1.0",
    schemas: {
      GameState: {
        fields: {
          difficulty: { kind: "string", required: false },
          locomotion: { kind: "string", required: false },
          phase: { kind: "string", required: true },
        },
      },
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
  await writeJson(root, "assets.manifest.json", { schema: "threenative.assets", version: "0.1.0", assets: [] });
  await writeJson(root, "materials.ir.json", { schema: "threenative.materials", version: "0.1.0", materials: [] });
  await writeJson(root, "target.profile.json", { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] });
}

async function writeJson(root: string, file: string, value: unknown): Promise<void> {
  await writeFile(join(root, file), `${JSON.stringify(value, null, 2)}\n`);
}
