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
    assert.match(result.diagnostics[0]?.fix?.instruction ?? "", /Declare component 'Helath'/);
    assert.match(result.diagnostics[0]?.fix?.snippet ?? "", /"Helath"/);
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

test("should accept behavior metadata system source marker", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-behavior-source-"));
  try {
    await writeBundle(root, {
      commands: [],
      reads: ["Transform"],
      source: "behavior-metadata",
      writes: ["Transform"],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported system source marker", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-behavior-source-invalid-"));
  try {
    await writeBundle(root, {
      commands: [],
      reads: ["Transform"],
      source: "manual-json",
      writes: ["Transform"],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_SYSTEM_SOURCE_UNSUPPORTED");
    assert.equal(result.diagnostics[0]?.path, "systems.ir.json/systems/0/source");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept built-in transform system access without custom schema", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-builtin-transform-"));
  try {
    await writeBundle(root, {
      commands: [{ component: "Transform", entity: "target", kind: "setComponent" }],
      omitTransformSchema: true,
      reads: ["Transform"],
      writes: ["Transform"],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept v7 physics, picking, character, particles, and animation control services", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-v7-services-"));
  try {
    await writeBundle(root, {
      commands: [],
      reads: ["Transform"],
      services: ["animation.play", "animation.query", "animation.stop", "character.move", "particles.burst", "particles.clear", "particles.emit", "particles.play", "particles.reset", "particles.start", "particles.stop", "physics.overlap", "physics.raycast", "physics.shapeCast", "picking.mesh", "picking.pointerRay"],
      writes: ["Transform"],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept declared bundle-local asset load service", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-assets-load-"));
  try {
    await writeBundle(root, {
      commands: [],
      reads: [],
      services: ["assets.load"],
      writes: [],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept declared scene lifecycle services", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-scene-services-"));
  try {
    await writeBundle(root, {
      commands: [],
      reads: [],
      services: ["scene.change", "scene.current", "scene.loadAdditive", "scene.pop", "scene.push", "scene.unload"],
      writes: [],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept query ordering pagination and changed filters", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-query-metadata-"));
  try {
    await writeBundle(root, {
      commands: [],
      queries: [{ changed: ["Transform"], limit: 2, offset: 1, orderBy: "id", with: ["Transform"], without: ["Health"] }],
      reads: ["Transform"],
      writes: [],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept runtime changed query metadata without explicit change resources", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-runtime-changed-query-"));
  try {
    await writeBundle(root, {
      commands: [],
      queries: [{ changed: ["Transform"], with: ["Transform"], without: [] }],
      reads: ["Transform"],
      writes: ["Transform"],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported changed query selectors", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-invalid-changed-selectors-"));
  try {
    await writeBundle(root, {
      commands: [],
      queries: [{ changed: ["Transform.position", "Health*"], with: ["Transform"], without: [] }],
      reads: ["Transform"],
      writes: [],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      [
        "TN_IR_SYSTEM_QUERY_CHANGED_SELECTOR_UNSUPPORTED",
        "TN_IR_SYSTEM_QUERY_CHANGED_SELECTOR_UNSUPPORTED",
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid query metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-invalid-query-metadata-"));
  try {
    await writeBundle(root, {
      commands: [],
      queries: [{ changed: ["MissingComponent"], limit: -1, offset: 0.5, orderBy: "z", with: ["Transform"], without: [] }],
      reads: ["Transform"],
      writes: [],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      [
        "TN_IR_SYSTEM_QUERY_ORDER_UNSUPPORTED",
        "TN_IR_SYSTEM_QUERY_OFFSET_INVALID",
        "TN_IR_SYSTEM_QUERY_LIMIT_INVALID",
        "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept same-schedule system ordering constraints", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-ordering-"));
  try {
    await writeBundle(root, {
      commands: [],
      reads: [],
      systemsOverride: [
        systemDeclaration({ before: ["applyDamage"], name: "collectInput" }),
        systemDeclaration({ after: ["collectInput"], before: ["score"], name: "applyDamage" }),
        systemDeclaration({ after: ["applyDamage"], name: "score" }),
      ],
      writes: [],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid system ordering constraints", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-ordering-invalid-"));
  try {
    await writeBundle(root, {
      commands: [],
      reads: [],
      systemsOverride: [
        systemDeclaration({ after: ["missing"], before: ["collectInput"], name: "collectInput" }),
        systemDeclaration({ after: ["score"], name: "applyDamage" }),
        systemDeclaration({ before: ["applyDamage"], name: "score", schedule: "postUpdate" }),
      ],
      writes: [],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      [
        "TN_IR_SYSTEM_ORDER_SELF_REFERENCE",
        "TN_IR_SYSTEM_ORDER_TARGET_MISSING",
        "TN_IR_SYSTEM_ORDER_CROSS_SCHEDULE",
        "TN_IR_SYSTEM_ORDER_CROSS_SCHEDULE",
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject cyclic system ordering constraints", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-ordering-cycle-"));
  try {
    await writeBundle(root, {
      commands: [],
      reads: [],
      systemsOverride: [
        systemDeclaration({ after: ["score"], name: "collectInput" }),
        systemDeclaration({ after: ["collectInput"], name: "applyDamage" }),
        systemDeclaration({ after: ["applyDamage"], name: "score" }),
      ],
      writes: [],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_SYSTEM_ORDER_CYCLE");
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
    assert.match(result.diagnostics[0]?.fix?.instruction ?? "", /content\/schemas\/resources\.schema\.json/);
    const fix = JSON.parse(result.diagnostics[0]?.fix?.snippet ?? "{}") as { kind?: string; schema?: string; schemas?: Array<{ id?: string; fields?: Record<string, unknown> }> };
    assert.equal(fix.schema, "threenative.schema");
    assert.equal(fix.kind, "resource");
    assert.deepEqual(fix.schemas?.[0], { id: "Score", fields: { value: { kind: "json" } } });
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

test("should accept bounded delayed command metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-delayed-command-"));
  try {
    await writeBundle(root, {
      commands: [],
      delayedCommands: [
        {
          cancelPolicy: "drop",
          command: { components: ["Health"], entity: "marker", kind: "spawn" },
          id: "spawnMarker",
          maxDelayTicks: 8,
          ownership: { id: "arena", kind: "scene" },
        },
        {
          cancelPolicy: "flush",
          command: { event: "LifecycleEvent", kind: "emitEvent" },
          id: "emitReady",
          maxDelayTicks: 2,
          ownership: { id: "player", kind: "entity" },
        },
      ],
      eventWrites: ["LifecycleEvent"],
      reads: ["Health"],
      schedule: "fixedUpdate",
      writes: ["Health"],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unbounded delayed command metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-systems-delayed-command-invalid-"));
  try {
    await writeBundle(root, {
      commands: [],
      delayedCommands: [
        {
          cancelPolicy: "wallClock",
          command: { component: "Health", entity: "target", kind: "setComponent" },
          id: "badDelay",
          maxDelayTicks: 0,
          ownership: { id: "", kind: "timer" },
          timer: "setTimeout",
        },
      ],
      reads: ["Health"],
      schedule: "fixedUpdate",
      writes: [],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
      "TN_IR_SYSTEM_DELAYED_COMMAND_FIELD_UNSUPPORTED",
      "TN_IR_SYSTEM_DELAYED_COMMAND_MAX_TICKS_INVALID",
      "TN_IR_SYSTEM_DELAYED_COMMAND_OWNERSHIP_KIND_UNSUPPORTED",
      "TN_IR_SYSTEM_DELAYED_COMMAND_OWNERSHIP_ID_INVALID",
      "TN_IR_SYSTEM_DELAYED_COMMAND_CANCEL_UNSUPPORTED",
      "TN_IR_SYSTEM_WRITE_UNDECLARED",
    ]);
    assert.deepEqual(result.diagnostics.at(-1)?.path, "systems.ir.json/systems/0/delayedCommands/0/command/component");
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
    delayedCommands?: unknown;
    eventWrites?: string[];
    lifecycle?: unknown;
    omitTransformSchema?: boolean;
    reads: string[];
    resourceReads?: string[];
    resourceWrites?: string[];
    observers?: unknown;
    pluginGroups?: unknown;
    plugins?: unknown;
    queries?: unknown[];
    schedule?: unknown;
    services?: unknown[];
    source?: unknown;
    systemsOverride?: unknown[];
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
    systems:
      system.systemsOverride ??
      [
        {
          ...(system.async === undefined ? {} : { async: system.async }),
          commands: system.commands,
          ...(system.delayedCommands === undefined ? {} : { delayedCommands: system.delayedCommands }),
          eventReads: [],
          eventWrites: system.eventWrites ?? [],
          name: "badDamage",
          queries: system.queries ?? [],
          reads: system.reads,
          resourceReads: system.resourceReads ?? [],
          resourceWrites: system.resourceWrites ?? [],
          services: system.services ?? [],
          ...(system.source === undefined ? {} : { source: system.source }),
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
      ...(system.omitTransformSchema === true
        ? {}
        : {
            Transform: {
              fields: {
                position: { kind: "vec3", required: false },
                rotation: { kind: "quat", required: false },
              },
            },
          }),
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

function systemDeclaration(options: { after?: string[]; before?: string[]; name: string; schedule?: string }): Record<string, unknown> {
  return {
    ...(options.after === undefined ? {} : { after: options.after }),
    ...(options.before === undefined ? {} : { before: options.before }),
    commands: [],
    eventReads: [],
    eventWrites: [],
    name: options.name,
    queries: [],
    reads: [],
    resourceReads: [],
    resourceWrites: [],
    schedule: options.schedule ?? "update",
    services: [],
    writes: [],
  };
}

async function writeJson(root: string, file: string, value: unknown): Promise<void> {
  await writeFile(join(root, file), `${JSON.stringify(value, null, 2)}\n`);
}
