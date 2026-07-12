import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { ISystemScriptSource } from "./bundle.js";
import { resolveSystemScriptSources } from "./sourceRefs.js";

test("should resolve named TypeScript script source exports", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-source-ref-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(join(root, "src/scripts/kart.ts"), `export function kartArcadePhysics(context: unknown) {\n  return context;\n}\n`);

    const systems: ISystemScriptSource[] = [
      {
        name: "kartArcadePhysics",
        script: {
          exportName: "system_kartArcadePhysics",
          sourceRef: {
            export: "kartArcadePhysics",
            module: "src/scripts/kart.ts",
            systemId: "kartArcadePhysics",
          },
        },
      },
    ];
    const result = resolveSystemScriptSources(systems, root);

    assert.deepEqual(result.diagnostics, []);
    assert.match(result.systems[0]?.script?.source ?? "", /function kartArcadePhysics\(context\)/);
    assert.match(result.systems[0]?.script?.sourceRef?.hash ?? "", /^sha256-[0-9a-f]{64}$/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should allow supported script stdlib imports", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-source-ref-stdlib-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(
      join(root, "src/scripts/kart.ts"),
      `import { NumberEx, Quat, type ScriptContext, Vec3 } from "@threenative/script-stdlib";\nexport const kartArcadePhysics = (context: ScriptContext) => ({ context, next: Vec3.round(Vec3.add([1, 0, 0], [0.25, 0, 1])), yaw: Quat.yaw(Quat.fromYaw(NumberEx.clamp(1, 0, 2))) });\n`,
    );

    const systems: ISystemScriptSource[] = [
      {
        name: "kartArcadePhysics",
        script: {
          exportName: "system_kartArcadePhysics",
          sourceRef: {
            export: "kartArcadePhysics",
            module: "src/scripts/kart.ts",
            systemId: "kartArcadePhysics",
          },
        },
      },
    ];
    const result = resolveSystemScriptSources(systems, root);

    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.systems[0]?.script?.helperImports, [
      {
        imported: ["NumberEx", "Quat", "Vec3"],
        module: "@threenative/script-stdlib",
      },
    ]);
    assert.match(result.systems[0]?.script?.source ?? "", /Vec3\.round/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should allow preferred script stdlib alias imports", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-source-ref-stdlib-aliases-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(
      join(root, "src/scripts/player.ts"),
      `import { Mathf, Vector2, Vector3, type ScriptContext } from "@threenative/script-stdlib";\nexport const updatePlayer = (context: ScriptContext) => ({ axis: Vector2.normalize([1, 1]), next: Vector3.add([1, 0, 0], [0, 0, 1]), speed: Mathf.clamp(context.time.fixedDelta * 10, 0, 1) });\n`,
    );

    const systems: ISystemScriptSource[] = [
      {
        name: "updatePlayer",
        script: {
          exportName: "system_updatePlayer",
          sourceRef: {
            export: "updatePlayer",
            module: "src/scripts/player.ts",
            systemId: "updatePlayer",
          },
        },
      },
    ];
    const result = resolveSystemScriptSources(systems, root);

    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.systems[0]?.script?.helperImports, [
      {
        imported: ["Mathf", "Vector2", "Vector3"],
        module: "@threenative/script-stdlib",
      },
    ]);
    assert.match(result.systems[0]?.script?.source ?? "", /Vector3\.add/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should ignore type-only script stdlib imports", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-source-ref-type-only-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(
      join(root, "src/scripts/player.ts"),
      `import type { ScriptContext } from "@threenative/script-stdlib";\nimport type { ProjectContext } from "../../.threenative/types/project-context";\nexport function updatePlayer(context: ScriptContext | ProjectContext) {\n  return context.time.deltaTime;\n}\n`,
    );

    const systems: ISystemScriptSource[] = [
      {
        name: "updatePlayer",
        script: {
          exportName: "system_updatePlayer",
          sourceRef: {
            export: "updatePlayer",
            module: "src/scripts/player.ts",
            systemId: "updatePlayer",
          },
        },
      },
    ];
    const result = resolveSystemScriptSources(systems, root);

    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.systems[0]?.script?.helperImports, undefined);
    assert.match(result.systems[0]?.script?.source ?? "", /context\.time\.deltaTime/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should extract defineBehavior metadata into system declarations", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-source-ref-behavior-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(
      join(root, "src/scripts/player.ts"),
      `import { defineBehavior, Vector3, type ScriptContext } from "@threenative/script-stdlib";\nexport const updatePlayer = defineBehavior({ schedule: "update", reads: ["Transform"], writes: ["Transform"], resourceReads: ["GameState"], services: ["physics.raycast"], queries: [{ with: ["Transform"], without: [] }] }, (context: ScriptContext) => {\n  return Vector3.round([context.time.deltaTime, 0, 0]);\n});\n`,
    );

    const systems: ISystemScriptSource[] = [
      {
        commands: [],
        eventReads: [],
        eventWrites: [],
        name: "updatePlayer",
        queries: [],
        reads: [],
        resourceReads: [],
        resourceWrites: [],
        services: [],
        script: {
          exportName: "system_updatePlayer",
          sourceRef: {
            export: "updatePlayer",
            module: "src/scripts/player.ts",
            systemId: "updatePlayer",
          },
        },
        writes: [],
      },
    ];
    const result = resolveSystemScriptSources(systems, root);

    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.systems[0]?.schedule, "update");
    assert.equal(result.systems[0]?.source, "behavior-metadata");
    assert.deepEqual(result.systems[0]?.reads, ["Transform"]);
    assert.deepEqual(result.systems[0]?.resourceReads, ["GameState"]);
    assert.deepEqual(result.systems[0]?.services, ["physics.raycast"]);
    assert.match(result.systems[0]?.script?.source ?? "", /Vector3\.round/);
    assert.doesNotMatch(result.systems[0]?.script?.source ?? "", /defineBehavior/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject duplicate defineBehavior and structured source metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-source-ref-behavior-duplicate-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(
      join(root, "src/scripts/player.ts"),
      `import { defineBehavior, type ScriptContext } from "@threenative/script-stdlib";\nexport const updatePlayer = defineBehavior({ writes: ["Transform"] }, (context: ScriptContext) => context.time.deltaTime);\n`,
    );

    const systems: ISystemScriptSource[] = [
      {
        commands: [],
        eventReads: [],
        eventWrites: [],
        name: "updatePlayer",
        queries: [],
        reads: [],
        resourceReads: [],
        resourceWrites: [],
        services: [],
        script: {
          exportName: "system_updatePlayer",
          sourceRef: {
            export: "updatePlayer",
            module: "src/scripts/player.ts",
            systemId: "updatePlayer",
          },
        },
        writes: ["Transform"],
      },
    ];
    const result = resolveSystemScriptSources(systems, root);

    assert.equal(result.diagnostics[0]?.code, "TN_SCRIPT_BEHAVIOR_METADATA_DUPLICATE");
    assert.equal(result.diagnostics[0]?.path, "systems/updatePlayer/writes");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should allow defineBehavior schedule to replace the implicit fixedUpdate default", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-source-ref-behavior-default-schedule-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(
      join(root, "src/scripts/player.ts"),
      `import { defineBehavior, type ScriptContext } from "@threenative/script-stdlib";\nexport const updatePlayer = defineBehavior({ schedule: "update", writes: ["Transform"] }, (context: ScriptContext) => context.time.deltaTime);\n`,
    );

    const systems: ISystemScriptSource[] = [
      {
        commands: [],
        eventReads: [],
        eventWrites: [],
        name: "updatePlayer",
        queries: [],
        reads: [],
        resourceReads: [],
        resourceWrites: [],
        schedule: "fixedUpdate",
        services: [],
        script: {
          exportName: "system_updatePlayer",
          sourceRef: {
            export: "updatePlayer",
            module: "src/scripts/player.ts",
            systemId: "updatePlayer",
          },
        },
        writes: [],
      },
    ];
    const result = resolveSystemScriptSources(systems, root);

    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.systems[0]?.schedule, "update");
    assert.equal(result.systems[0]?.source, "behavior-metadata");
    assert.deepEqual(result.systems[0]?.writes, ["Transform"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should report untyped script context without blocking source emit", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-source-ref-untyped-context-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(
      join(root, "src/scripts/player.ts"),
      `type ScriptContext = any;\nexport const updatePlayer = (context: ScriptContext) => context.time.delta;\n`,
    );

    const systems: ISystemScriptSource[] = [
      {
        name: "updatePlayer",
        script: {
          exportName: "system_updatePlayer",
          sourceRef: {
            export: "updatePlayer",
            module: "src/scripts/player.ts",
            systemId: "updatePlayer",
          },
        },
      },
    ];
    const result = resolveSystemScriptSources(systems, root);

    assert.equal(result.diagnostics[0]?.code, "TN_SCRIPT_UNTYPED_CONTEXT");
    assert.equal(result.diagnostics[0]?.severity, "info");
    assert.match(result.diagnostics[0]?.fix?.snippet ?? "", /ScriptContext/);
    assert.match(result.systems[0]?.script?.source ?? "", /context\.time\.delta/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should record promoted gameplay math helper imports", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-source-ref-gameplay-math-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(
      join(root, "src/scripts/player.ts"),
      `import { AngleEx, Bounds2, Bounds3, Ease, Vec2, Vec3 } from "@threenative/script-stdlib";\nexport const updatePlayer = () => ({ angle: AngleEx.degToRad(90), axis: Vec2.normalize([1, 1]), bounds: Bounds2.rect(0, 0, 2, 2), box: Bounds3.aabb([0, 0, 0], [1, 1, 1]), ease: Ease.smoothStep(0.5), forward: Vec3.rotateYaw([0, 0, 1], 1) });\n`,
    );

    const systems: ISystemScriptSource[] = [
      {
        name: "updatePlayer",
        script: {
          exportName: "system_updatePlayer",
          sourceRef: {
            export: "updatePlayer",
            module: "src/scripts/player.ts",
            systemId: "updatePlayer",
          },
        },
      },
    ];
    const result = resolveSystemScriptSources(systems, root);

    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.systems[0]?.script?.helperImports, [
      {
        imported: ["AngleEx", "Bounds2", "Bounds3", "Ease", "Vec2", "Vec3"],
        module: "@threenative/script-stdlib",
      },
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should allow gameplay accuracy stdlib imports", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-source-ref-gameplay-accuracy-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(
      join(root, "src/scripts/player.ts"),
      `import { BasisEx, CheckpointRaceEx, ControllerEx, SpawnEx } from "@threenative/script-stdlib";\nexport const updatePlayer = () => ({ basis: BasisEx.create(), controller: ControllerEx.worldCardinalCharacter({ dt: 0.1 }), race: CheckpointRaceEx.init(), spawn: SpawnEx.sample({ seed: 1, region: { kind: "rect", min: [0, 0], max: [1, 1] } }) });\n`,
    );

    const systems: ISystemScriptSource[] = [
      {
        name: "updatePlayer",
        script: {
          exportName: "system_updatePlayer",
          sourceRef: {
            export: "updatePlayer",
            module: "src/scripts/player.ts",
            systemId: "updatePlayer",
          },
        },
      },
    ];
    const result = resolveSystemScriptSources(systems, root);

    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.systems[0]?.script?.helperImports, [
      {
        imported: ["BasisEx", "CheckpointRaceEx", "ControllerEx", "SpawnEx"],
        module: "@threenative/script-stdlib",
      },
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should record promoted gameplay reducer imports", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-source-ref-gameplay-reducers-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(
      join(root, "src/scripts/player.ts"),
      `import { CollectorKit } from "@threenative/collector-kit";\nimport { LaneRunnerKit } from "@threenative/lane-runner-kit";\nimport { CheckpointRaceKit } from "@threenative/checkpoint-race-kit";\nexport const updatePlayer = () => ({ collector: CollectorKit.initial(), runner: LaneRunnerKit.initial(), race: CheckpointRaceKit.initial() });\n`,
    );

    const systems: ISystemScriptSource[] = [
      {
        name: "updatePlayer",
        script: {
          exportName: "system_updatePlayer",
          sourceRef: {
            export: "updatePlayer",
            module: "src/scripts/player.ts",
            systemId: "updatePlayer",
          },
        },
      },
    ];
    const result = resolveSystemScriptSources(systems, root);

    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.systems[0]?.script?.helperImports, [
      {
        imported: ["CheckpointRaceKit"],
        module: "@threenative/checkpoint-race-kit",
      },
      {
        imported: ["CollectorKit"],
        module: "@threenative/collector-kit",
      },
      {
        imported: ["LaneRunnerKit"],
        module: "@threenative/lane-runner-kit",
      },
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported script helper imports", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-source-ref-import-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(join(root, "src/scripts/kart.ts"), `import { helper } from "./helper.js";\nexport const kartArcadePhysics = (context: unknown) => helper(context);\n`);

    const systems: ISystemScriptSource[] = [
      {
        name: "kartArcadePhysics",
        script: {
          exportName: "system_kartArcadePhysics",
          sourceRef: {
            export: "kartArcadePhysics",
            module: "src/scripts/kart.ts",
            systemId: "kartArcadePhysics",
          },
        },
      },
    ];
    const result = resolveSystemScriptSources(systems, root);

    assert.equal(result.diagnostics[0]?.code, "TN_SCRIPT_UNSUPPORTED_IMPORT");
    assert.equal(result.diagnostics[0]?.target, "kartArcadePhysics");
    assert.equal(result.diagnostics[0]?.fix?.allowed?.includes("@threenative/script-stdlib"), true);
    assert.equal(result.diagnostics[0]?.fix?.snippet, 'import { Vector3 } from "@threenative/script-stdlib";');
    assert.equal(result.systems[0]?.script?.source, undefined);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should clear unsupported import diagnostic when fix snippet is applied", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-source-ref-import-fix-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    const scriptPath = join(root, "src/scripts/kart.ts");
    await writeFile(scriptPath, `import * as THREE from "three";\nexport const kartArcadePhysics = () => THREE.Vector3;\n`);

    const systems: ISystemScriptSource[] = [
      {
        name: "kartArcadePhysics",
        script: {
          exportName: "system_kartArcadePhysics",
          sourceRef: {
            export: "kartArcadePhysics",
            module: "src/scripts/kart.ts",
            systemId: "kartArcadePhysics",
          },
        },
      },
    ];
    const rejected = resolveSystemScriptSources(systems, root);
    assert.equal(rejected.diagnostics[0]?.code, "TN_SCRIPT_UNSUPPORTED_IMPORT");

    await writeFile(scriptPath, `${rejected.diagnostics[0]?.fix?.snippet ?? ""}\nexport const kartArcadePhysics = () => Vector3.add([1, 0, 0], [0, 0, 1]);\n`);
    const fixed = resolveSystemScriptSources(systems, root);

    assert.deepEqual(fixed.diagnostics, []);
    assert.match(fixed.systems[0]?.script?.source ?? "", /Vector3\.add/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported script stdlib import shapes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-source-ref-stdlib-shape-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(
      join(root, "src/scripts/kart.ts"),
      `import * as Stdlib from "@threenative/script-stdlib";\nexport const kartArcadePhysics = () => Stdlib.Vec3.round([1, 0, 2]);\n`,
    );

    const systems: ISystemScriptSource[] = [
      {
        name: "kartArcadePhysics",
        script: {
          exportName: "system_kartArcadePhysics",
          sourceRef: {
            export: "kartArcadePhysics",
            module: "src/scripts/kart.ts",
            systemId: "kartArcadePhysics",
          },
        },
      },
    ];
    const result = resolveSystemScriptSources(systems, root);

    assert.equal(result.diagnostics[0]?.code, "TN_SCRIPT_UNSUPPORTED_IMPORT");
    assert.match(result.diagnostics[0]?.suggestion ?? "", /portable named helpers/);
    assert.equal(result.systems[0]?.script?.source, undefined);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported helper import shapes for feedback helpers", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-source-ref-feedback-shape-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(
      join(root, "src/scripts/kart.ts"),
      `import Stdlib, { RandomEx as R } from "@threenative/script-stdlib";\nexport const kartArcadePhysics = () => Stdlib ?? R.hash32(1, 2);\n`,
    );

    const systems: ISystemScriptSource[] = [
      {
        name: "kartArcadePhysics",
        script: {
          exportName: "system_kartArcadePhysics",
          sourceRef: {
            export: "kartArcadePhysics",
            module: "src/scripts/kart.ts",
            systemId: "kartArcadePhysics",
          },
        },
      },
    ];
    const result = resolveSystemScriptSources(systems, root);

    assert.equal(result.diagnostics[0]?.code, "TN_SCRIPT_UNSUPPORTED_IMPORT");
    assert.equal(result.systems[0]?.script?.source, undefined);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject source script mutable module state", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-source-ref-state-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(join(root, "src/scripts/kart.ts"), `let cached = 0;\nexport function kartArcadePhysics(context: unknown) {\n  cached += 1;\n  return context;\n}\n`);
    const systems: ISystemScriptSource[] = [
      {
        name: "kartArcadePhysics",
        script: {
          exportName: "system_kartArcadePhysics",
          sourceRef: {
            export: "kartArcadePhysics",
            module: "src/scripts/kart.ts",
            systemId: "kartArcadePhysics",
          },
        },
      },
    ];

    const result = resolveSystemScriptSources(systems, root);

    assert.equal(result.diagnostics[0]?.code, "TN_SCRIPT_MODULE_STATE_UNSUPPORTED");
    assert.equal(result.diagnostics[0]?.file, "src/scripts/kart.ts");
    assert.equal(result.diagnostics[0]?.target, "kartArcadePhysics");
    assert.match(result.diagnostics[0]?.suggestion ?? "", /resources|components/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject module-local helpers referenced by exported system", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-source-ref-local-helper-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(
      join(root, "src/scripts/player.ts"),
      `const CART_SPEED = 3.5;
function animateSteam(context: unknown) {
  return context;
}
export function copperRailSwitcherSystem(context: unknown) {
  animateSteam(context);
  return CART_SPEED;
}
`,
    );
    const systems: ISystemScriptSource[] = [
      {
        name: "copper-rail-switcher",
        script: {
          exportName: "system_copper_rail_switcher",
          sourceRef: {
            export: "copperRailSwitcherSystem",
            module: "src/scripts/player.ts",
            systemId: "copper-rail-switcher",
          },
        },
      },
    ];

    const result = resolveSystemScriptSources(systems, root);

    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.path),
      [
        "systems/copper-rail-switcher/script/sourceRef/moduleLocals/CART_SPEED",
        "systems/copper-rail-switcher/script/sourceRef/moduleLocals/animateSteam",
      ],
    );
    assert.equal(result.diagnostics[0]?.code, "TN_SCRIPT_MODULE_LOCAL_REFERENCE_UNSUPPORTED");
    assert.equal(result.diagnostics[0]?.fix?.snippet?.includes("const speed = 3.5"), true);
    assert.match(result.diagnostics[0]?.message ?? "", /scripts\.bundle\.js/);
    assert.match(result.diagnostics[0]?.suggestion ?? "", /Inline deterministic helpers/);
    assert.equal(result.systems[0]?.script?.source, undefined);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should allow helpers and constants scoped inside exported system", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-source-ref-inline-helper-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(
      join(root, "src/scripts/player.ts"),
      `export function copperRailSwitcherSystem(context: unknown) {
  const cartSpeed = 3.5;
  function animateSteam(value: number) {
    return value + cartSpeed;
  }
  return animateSteam(1);
}
`,
    );
    const systems: ISystemScriptSource[] = [
      {
        name: "copper-rail-switcher",
        script: {
          exportName: "system_copper_rail_switcher",
          sourceRef: {
            export: "copperRailSwitcherSystem",
            module: "src/scripts/player.ts",
            systemId: "copper-rail-switcher",
          },
        },
      },
    ];

    const result = resolveSystemScriptSources(systems, root);

    assert.deepEqual(result.diagnostics, []);
    assert.match(result.systems[0]?.script?.source ?? "", /function animateSteam/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should invalidate a source entry when a transitive helper changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-source-ref-transitive-hash-"));
  try {
    await mkdir(join(root, "src/scripts/shared"), { recursive: true });
    const helperPath = join(root, "src/scripts/shared/math.ts");
    await writeFile(helperPath, `export const addBonus = (value: number) => value + 2;\n`);
    await writeFile(
      join(root, "src/scripts/player.ts"),
      `import { addBonus } from "./shared/math";\nexport const updatePlayer = () => addBonus(3);\n`,
    );
    const systems: ISystemScriptSource[] = [{
      name: "updatePlayer",
      script: {
        exportName: "system_updatePlayer",
        sourceRef: {
          export: "updatePlayer",
          module: "src/scripts/player.ts",
          systemId: "updatePlayer",
        },
      },
    }];

    const first = resolveSystemScriptSources(systems, root);
    const firstGraph = first.systems[0]?.script?.localModuleGraph;
    assert.deepEqual(first.diagnostics, []);
    assert.deepEqual(firstGraph?.modules.map((module) => module.path), [
      "src/scripts/shared/math.ts",
      "src/scripts/player.ts",
    ]);
    assert.deepEqual(firstGraph?.modules[1]?.dependencies, ["src/scripts/shared/math.ts"]);

    await writeFile(helperPath, `export const addBonus = (value: number) => value + 3;\n`);
    const second = resolveSystemScriptSources(systems, root);

    assert.deepEqual(second.diagnostics, []);
    assert.notEqual(first.systems[0]?.script?.sourceRef?.hash, second.systems[0]?.script?.sourceRef?.hash);
    assert.notEqual(firstGraph?.hash, second.systems[0]?.script?.localModuleGraph?.hash);
    assert.equal(second.systems[0]?.script?.localModuleGraph?.modules[0]?.hash !== firstGraph?.modules[0]?.hash, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
