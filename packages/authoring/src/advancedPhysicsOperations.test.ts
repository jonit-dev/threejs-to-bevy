import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PHYSICS_CAPABILITY_DESCRIPTORS } from "@threenative/ir";

import { applyAuthoringBatch, planAuthoringBatch, type IAuthoringBatchDocument } from "./batches.js";
import { buildAuthoringOperationCliArgv, dispatchAuthoringOperation, listAuthoringOperationDescriptors } from "./operationRegistry.js";
import { PORTABLE_PHYSICS_AUTHORING_COMPONENTS } from "./operations/physics.js";

const controller = {
  brakes: { frontBias: 0.6, handbrakeWheelIds: ["main"] },
  differential: { kind: "open" },
  engine: { engineBraking: 0.1, idleRpm: 900, redlineRpm: 6000, torqueCurve: [{ rpm: 900, torque: 100 }, { rpm: 6000, torque: 50 }] },
  steering: { speedCurve: [{ scale: 1, speed: 0 }, { scale: 0.5, speed: 30 }] },
  transmission: { clutchResponse: 0.2, finalDrive: 3, forwardRatios: [3, 2], reverseRatio: 3, shiftPolicy: "manual" },
};

const values = {
  aerodynamics: { dragArea: [1, 1, 1], maxForce: 1000, surfaces: [{ area: 1, aspectRatio: 4, centerOfPressure: [0, 0, 0], dragCurve: [{ angle: -1, coefficient: 0.1 }, { angle: 1, coefficient: 0.1 }], id: "wing", liftCurve: [{ angle: -1, coefficient: -0.2 }, { angle: 1, coefficient: 0.2 }], recoveryAngle: 0.3, stallAngle: 0.5 }] },
  compound: { children: [{ id: "body", localPose: { position: [0, 0, 0] }, shape: { kind: "box", size: [1, 1, 1] } }] },
  destructible: { activationBudget: 8, cleanupPolicy: "sleep", fractureManifest: "fractures/crate.json", maxDepth: 1 },
  joint: { connectedEntity: "anchor", kind: "fixed" },
  vehicle: controller,
  wheel: { maxSteeringAngle: 0.5, maxSuspensionForce: 10000, maxTireForce: 5000, wheels: [{ attachment: [0, -0.5, 0], braked: true, driven: true, id: "main", radius: 0.35, steering: true, suspension: { damperRate: 3000, springRate: 30000, travel: 0.2 }, tire: "tire", visual: "wheel-visual", width: 0.2 }] },
} as const;

test("advanced physics operations round trip through dry run and atomic apply", async () => {
  const root = await project();
  try {
    const definitions = Object.entries(PORTABLE_PHYSICS_AUTHORING_COMPONENTS) as Array<[keyof typeof values, (typeof PORTABLE_PHYSICS_AUTHORING_COMPONENTS)[keyof typeof PORTABLE_PHYSICS_AUTHORING_COMPONENTS]]>;
    const operationOrder: Array<keyof typeof values> = ["compound", "wheel", "vehicle", "aerodynamics", "joint", "destructible"];
    const operations = operationOrder.map((key) => {
      const definition = PORTABLE_PHYSICS_AUTHORING_COMPONENTS[key];
      return { args: { entityId: "body", sceneId: "arena", [definition.valueArgument]: values[key] }, name: `${definition.operationPrefix}.add` };
    }) as unknown as IAuthoringBatchDocument["operations"];
    const batch = { id: "advanced-physics-round-trip", operations, schema: "threenative.authoring-batch", version: "0.1.0" } satisfies IAuthoringBatchDocument;
    const before = await readFile(join(root, "content/scenes/arena.scene.json"), "utf8");
    const plan = await planAuthoringBatch({ batch, projectPath: root });
    assert.equal(plan.ok, true, JSON.stringify(plan.diagnostics));
    assert.equal(await readFile(join(root, "content/scenes/arena.scene.json"), "utf8"), before);
    const applied = await applyAuthoringBatch({ batch: { ...batch, preconditions: { planHash: plan.planHash } }, projectPath: root });
    assert.equal(applied.ok, true, JSON.stringify(applied.diagnostics));
    assert.equal(applied.committed, true);

    for (const [, definition] of definitions) {
      const inspect = await dispatchAuthoringOperation({ args: { entityId: "body", sceneId: "arena" }, name: `${definition.operationPrefix}.inspect`, projectPath: root });
      assert.equal(inspect.ok, true, JSON.stringify(inspect.diagnostics));
      assert.deepEqual((inspect as unknown as Record<string, unknown>)[definition.resultField], values[definitions.find(([candidate]) => PORTABLE_PHYSICS_AUTHORING_COMPONENTS[candidate] === definition)![0]]);
      const validation = await dispatchAuthoringOperation({ args: { entityId: "body", sceneId: "arena" }, name: `${definition.operationPrefix}.validate`, projectPath: root });
      assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics));
      assert.equal((validation as unknown as Record<string, unknown>).valid, true);
    }

    const setBatch = {
      id: "advanced-physics-set-round-trip",
      operations: operationOrder.map((key) => {
        const definition = PORTABLE_PHYSICS_AUTHORING_COMPONENTS[key];
        return { args: { entityId: "body", sceneId: "arena", [definition.valueArgument]: values[key] }, name: `${definition.operationPrefix}.set` };
      }),
      schema: "threenative.authoring-batch",
      version: "0.1.0",
    } as unknown as IAuthoringBatchDocument;
    const beforeSetPlan = await readFile(join(root, "content/scenes/arena.scene.json"), "utf8");
    const setPlan = await planAuthoringBatch({ batch: setBatch, projectPath: root });
    assert.equal(setPlan.ok, true, JSON.stringify(setPlan.diagnostics));
    assert.equal(await readFile(join(root, "content/scenes/arena.scene.json"), "utf8"), beforeSetPlan);
    const setApplied = await applyAuthoringBatch({ batch: { ...setBatch, preconditions: { planHash: setPlan.planHash } }, projectPath: root });
    assert.equal(setApplied.ok, true, JSON.stringify(setApplied.diagnostics));
    assert.equal(setApplied.committed, true);

    const removeBatch = {
      id: "advanced-physics-remove-round-trip",
      operations: operationOrder.map((key) => ({ args: { entityId: "body", sceneId: "arena" }, name: `${PORTABLE_PHYSICS_AUTHORING_COMPONENTS[key].operationPrefix}.remove` })),
      schema: "threenative.authoring-batch",
      version: "0.1.0",
    } as unknown as IAuthoringBatchDocument;
    const beforeRemovePlan = await readFile(join(root, "content/scenes/arena.scene.json"), "utf8");
    const removePlan = await planAuthoringBatch({ batch: removeBatch, projectPath: root });
    assert.equal(removePlan.ok, true, JSON.stringify(removePlan.diagnostics));
    assert.equal(await readFile(join(root, "content/scenes/arena.scene.json"), "utf8"), beforeRemovePlan);
    const removeApplied = await applyAuthoringBatch({ batch: { ...removeBatch, preconditions: { planHash: removePlan.planHash } }, projectPath: root });
    assert.equal(removeApplied.ok, true, JSON.stringify(removeApplied.diagnostics));
    assert.equal(removeApplied.committed, true);
    const scene = JSON.parse(await readFile(join(root, "content/scenes/arena.scene.json"), "utf8")) as { entities: Array<{ components?: Record<string, unknown>; id: string }> };
    const components = scene.entities.find((entity) => entity.id === "body")?.components ?? {};
    for (const definition of Object.values(PORTABLE_PHYSICS_AUTHORING_COMPONENTS)) assert.equal(components[definition.component], undefined);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("advanced physics operation descriptors derive CLI editor and API metadata", () => {
  const expectedCapabilityEvidence = new Map([
    ["AerodynamicBody", ["advanced-physics-aerodynamics", "advanced-physics-aerodynamics"]],
    ["CompoundCollider", ["advanced-physics-foundation", "physics-self-verification"]],
    ["Destructible", ["advanced-physics-destruction", "advanced-physics-destruction"]],
    ["PhysicsJoint", ["advanced-physics-joints", "advanced-physics-joints"]],
    ["VehicleController", ["advanced-physics-drivetrain", "advanced-physics-drivetrain"]],
    ["WheelAssembly", ["advanced-physics-wheels", "advanced-physics-wheels"]],
  ]);
  for (const definition of Object.values(PORTABLE_PHYSICS_AUTHORING_COMPONENTS)) {
    const capability = PHYSICS_CAPABILITY_DESCRIPTORS.find((candidate) => candidate.component === definition.component);
    assert.ok(capability, `Missing physics capability descriptor for ${definition.component}`);
    assert.equal(capability.authoringOperation, `${definition.operationPrefix}.add`);
    assert.deepEqual(["fixture" in capability ? capability.fixture : undefined, "gate" in capability ? capability.gate : undefined], expectedCapabilityEvidence.get(definition.component));
    const cards = listAuthoringOperationDescriptors().filter((card) => card.name.startsWith(`${definition.operationPrefix}.`));
    assert.deepEqual(cards.map((card) => card.name), ["add", "set", "remove", "inspect", "validate"].map((action) => `${definition.operationPrefix}.${action}`));
    assert.ok(cards.every((card) => card.adapters?.editor?.surface === "api" && card.adapters.cli !== undefined));
    assert.deepEqual(buildAuthoringOperationCliArgv(`${definition.operationPrefix}.inspect`, { entityId: "body", sceneId: "arena" }, { projectPath: "/project" }), [...definition.operationPrefix.split("."), "inspect", "arena", "body", "--project", "/project", "--json"]);
  }
});

test("advanced physics operations reject invalid payloads and missing removals", async () => {
  const root = await project();
  try {
    const invalid = await dispatchAuthoringOperation({ args: { collider: { children: [] }, entityId: "body", sceneId: "arena" }, name: "physics.compound.add", projectPath: root });
    assert.equal(invalid.ok, false);
    const missing = await dispatchAuthoringOperation({ args: { entityId: "body", sceneId: "arena" }, name: "physics.joint.remove", projectPath: root });
    assert.equal(missing.ok, false);
    assert.ok(missing.diagnostics.some((diagnostic) => diagnostic.code === "TN_AUTHORING_PHYSICS_JOINT_MISSING"));
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("advanced physics diagnostics round trip structured fixes through authoring operations", async () => {
  const cases = [
    {
      code: "TN_IR_PHYSICS_COMPOUND_FIELD_UNSUPPORTED",
      key: "compound",
      value: { ...values.compound, backendHandle: 42 },
    },
    {
      code: "TN_IR_PHYSICS_DESTRUCTIBLE_BOND_STRENGTH_INVALID",
      key: "destructible",
      value: { ...values.destructible, bondStrength: Number.NaN },
    },
    {
      code: "TN_IR_PHYSICS_WHEEL_REFERENCE_INVALID",
      key: "wheel",
      value: { ...values.wheel, wheels: [{ ...values.wheel.wheels[0], tire: "missing-tire" }] },
    },
    {
      code: "TN_IR_PHYSICS_DESTRUCTIBLE_BUDGET_INVALID",
      key: "destructible",
      value: { ...values.destructible, activationBudget: 257 },
    },
  ] as const;

  for (const fixture of cases) {
    const root = await project();
    try {
      const definition = PORTABLE_PHYSICS_AUTHORING_COMPONENTS[fixture.key];
      const rejected = await dispatchAuthoringOperation({
        args: { entityId: "body", sceneId: "arena", [definition.valueArgument]: fixture.value },
        name: `${definition.operationPrefix}.add`,
        projectPath: root,
      });
      assert.equal(rejected.ok, false);
      const diagnostic = rejected.diagnostics.find((candidate) => candidate.code === fixture.code);
      assert.ok(diagnostic, `Missing ${fixture.code}`);
      assert.equal(diagnostic.fix?.cookbook, fixture.key === "destructible" ? "advanced-physics-destruction" : undefined);
      assert.ok(diagnostic.fix?.snippet, `${fixture.code} must include a structured component fix`);
      const fixedValue = JSON.parse(diagnostic.fix.snippet) as Record<string, unknown>;

      const applied = await dispatchAuthoringOperation({
        args: { entityId: "body", sceneId: "arena", [definition.valueArgument]: fixedValue },
        name: `${definition.operationPrefix}.set`,
        projectPath: root,
      });
      assert.equal(applied.ok, true, JSON.stringify(applied.diagnostics));
      const inspected = await dispatchAuthoringOperation({
        args: { entityId: "body", sceneId: "arena" },
        name: `${definition.operationPrefix}.inspect`,
        projectPath: root,
      });
      assert.deepEqual((inspected as unknown as Record<string, unknown>)[definition.resultField], fixedValue);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
});

test("advanced physics validate should scope diagnostics to the requested declaration", async () => {
  const root = await project();
  try {
    const added = await dispatchAuthoringOperation({ args: { collider: values.compound, entityId: "body", sceneId: "arena" }, name: "physics.compound.add", projectPath: root });
    assert.equal(added.ok, true, JSON.stringify(added.diagnostics));
    const path = join(root, "content/scenes/arena.scene.json");
    const scene = JSON.parse(await readFile(path, "utf8")) as { entities: Array<{ components?: Record<string, unknown>; id: string }> };
    scene.entities.find((entity) => entity.id === "anchor")!.components!.Collider = { kind: "box", size: [0, 0, 0] };
    await writeFile(path, `${JSON.stringify(scene, null, 2)}\n`);

    const validation = await dispatchAuthoringOperation({ args: { entityId: "body", sceneId: "arena" }, name: "physics.compound.validate", projectPath: root });

    assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics));
    assert.equal((validation as unknown as { valid?: boolean }).valid, true);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("advanced physics operations accept the generated structured-source transform owner", async () => {
  const root = await project();
  try {
    const path = join(root, "content/scenes/arena.scene.json");
    const scene = JSON.parse(await readFile(path, "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string; transform?: Record<string, unknown> }>;
    };
    const body = scene.entities.find((entity) => entity.id === "body")!;
    body.transform = body.components!.Transform as Record<string, unknown>;
    delete body.components!.Transform;
    await writeFile(path, `${JSON.stringify(scene, null, 2)}\n`);

    const added = await dispatchAuthoringOperation({
      args: { assembly: values.wheel, entityId: "body", sceneId: "arena" },
      name: "physics.wheel.add",
      projectPath: root,
    });

    assert.equal(added.ok, true, JSON.stringify(added.diagnostics));
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("advanced physics operations resolve compact prefab instance references", async () => {
  const root = await project();
  try {
    const path = join(root, "content/scenes/arena.scene.json");
    const scene = JSON.parse(await readFile(path, "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string }>;
      instances?: Array<{ components?: Record<string, unknown>; id: string; prefab: string; transform?: Record<string, unknown> }>;
      prefabs?: Array<{ id: string; primitive: string }>;
    };
    const tire = scene.entities.find((entity) => entity.id === "tire")!;
    const visual = scene.entities.find((entity) => entity.id === "wheel-visual")!;
    scene.entities = scene.entities.filter((entity) => entity !== tire && entity !== visual);
    scene.prefabs = [{ id: "prefab.goal", primitive: "box" }];
    scene.instances = [
      { components: tire.components, id: tire.id, prefab: "prefab.goal", transform: { position: [0, 0, 0] } },
      { components: visual.components, id: visual.id, prefab: "prefab.goal", transform: { position: [0, 0, 0] } },
    ];
    await writeFile(path, `${JSON.stringify(scene, null, 2)}\n`);

    const added = await dispatchAuthoringOperation({
      args: { assembly: values.wheel, entityId: "body", sceneId: "arena" },
      name: "physics.wheel.add",
      projectPath: root,
    });

    assert.equal(added.ok, true, JSON.stringify(added.diagnostics));
  } finally { await rm(root, { force: true, recursive: true }); }
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-advanced-physics-ops-"));
  await mkdir(join(root, "content/scenes"), { recursive: true });
  await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({
    entities: [
      { components: { CompoundCollider: values.compound, RigidBody: { kind: "dynamic", mass: 100 }, Transform: { position: [0, 0, 0] } }, id: "body" },
      { components: { RigidBody: { kind: "static" }, Transform: { position: [0, 0, 0] } }, id: "anchor" },
      { components: { TireModel: { lateralSlipCurve: [{ grip: 1, slip: 0 }, { grip: 1, slip: 1 }], loadSensitivity: 0, longitudinalSlipCurve: [{ grip: 1, slip: 0 }, { grip: 1, slip: 1 }], rollingResistance: 0 }, Transform: { position: [0, 0, 0] } }, id: "tire" },
      { id: "wheel-visual" },
    ],
    id: "arena",
    schema: "threenative.scene",
    version: "0.1.0",
  }, null, 2)}\n`);
  return root;
}
