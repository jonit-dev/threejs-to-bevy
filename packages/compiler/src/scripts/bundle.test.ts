import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

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
        helperImports: [
          {
            imported: ["Vec3", "NumberEx"],
            module: "@threenative/script-stdlib",
          },
        ],
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
        helperImports: [
          {
            imported: ["NumberEx", "Vec3"],
            module: "@threenative/script-stdlib",
          },
        ],
        hash: "sha256-deadbeef",
        module: "src/scripts/kartArcadePhysics.ts",
      },
      systemId: "kartArcadePhysics",
    },
  ]);
});

test("should bundle supported script stdlib imports", () => {
  const result = bundleSystemScripts([
    {
      name: "kartArcadePhysics",
      script: {
        exportName: "system_kartArcadePhysics",
        helperImports: [
          {
            imported: ["Vec3"],
            module: "@threenative/script-stdlib",
          },
        ],
        source: "(context) => Vec3.round([1.2345, 0, 2.3456], 2)",
      },
    },
  ]);

  assert.deepEqual(result.diagnostics, []);
  assert.match(result.code ?? "", /const Vec3 = Object\.freeze/);
  assert.match(result.code ?? "", /const system_kartArcadePhysics = \(context\) => Vec3\.round/);
});

test("should bundle preferred script stdlib aliases", () => {
  const result = bundleSystemScripts([
    {
      name: "updatePlayer",
      script: {
        exportName: "system_updatePlayer",
        helperImports: [
          {
            imported: ["Mathf", "Vector2", "Vector3"],
            module: "@threenative/script-stdlib",
          },
        ],
        source:
          "(context) => ({ axis: Vector2.normalize([3, 4]), next: Vector3.add([1, 2, 3], [4, 5, 6]), speed: Mathf.clamp(4, 0, 2) })",
      },
    },
  ]);

  assert.deepEqual(result.diagnostics, []);
  assert.match(result.code ?? "", /const Mathf = NumberEx/);
  assert.match(result.code ?? "", /const Vector3 = Vec3/);
  assert.deepEqual(runBundledSystem(result.code, "system_updatePlayer"), {
    axis: [0.6, 0.8],
    next: [5, 7, 9],
    speed: 2,
  });
});

test("should bundle a project local helper module into one executable system", () => {
  const result = bundleSystemScripts([
    {
      name: "collect",
      script: {
        exportName: "system_collect",
        source: "(context) => context",
        sourceRef: { export: "collect", module: "src/scripts/collect.ts", systemId: "collect" },
        localModuleGraph: {
          entry: "src/scripts/collect.ts",
          hash: "sha256-graph",
          modules: [
            { dependencies: [], hash: "sha256-helper", path: "src/scripts/shared.ts", source: "export const addPoint = (value: number) => value + 2;" },
            { dependencies: ["src/scripts/shared.ts"], hash: "sha256-entry", path: "src/scripts/collect.ts", source: "import { addPoint } from './shared'; export const collect = () => addPoint(3);" },
          ],
          order: ["src/scripts/shared.ts", "src/scripts/collect.ts"],
        },
      },
    },
  ]);

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(runBundledSystem(result.code, "system_collect"), 5);
  assert.match(result.code ?? "", /__tn_local_module_0/);
  assert.equal(result.manifest?.systems[0]?.source?.moduleGraph?.hash, "sha256-graph");
});

test("should execute a local module that imports a stdlib helper by its authored name", () => {
  const result = bundleSystemScripts([
    {
      name: "collect",
      script: {
        exportName: "system_collect",
        helperImports: [{ imported: ["Vec3"], module: "@threenative/script-stdlib" }],
        source: "() => undefined",
        sourceRef: { export: "collect", module: "src/scripts/collect.ts", systemId: "collect" },
        localModuleGraph: {
          entry: "src/scripts/collect.ts",
          hash: "sha256-stdlib-graph",
          modules: [
            {
              dependencies: [],
              hash: "sha256-helper",
              path: "src/scripts/shared.ts",
              source: "import { Vec3 } from '@threenative/script-stdlib'; export const offset = (value: number[]) => Vec3.add(value, [1, 2, 3]);",
            },
            {
              dependencies: ["src/scripts/shared.ts"],
              hash: "sha256-entry",
              path: "src/scripts/collect.ts",
              source: "import { offset } from './shared'; export const collect = () => offset([4, 5, 6]);",
            },
          ],
          order: ["src/scripts/shared.ts", "src/scripts/collect.ts"],
        },
      },
    },
  ]);

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(runBundledSystem(result.code, "system_collect"), [5, 7, 9]);
});

test("should bind an entry export that is re-exported through a local import", () => {
  const result = bundleSystemScripts([{
    name: "collect",
    script: {
      exportName: "system_collect",
      source: "() => undefined",
      sourceRef: { export: "collect", module: "src/scripts/entry.ts", systemId: "collect" },
      localModuleGraph: {
        entry: "src/scripts/entry.ts",
        hash: "sha256-graph",
        modules: [
          { dependencies: [], hash: "sha256-helper", path: "src/scripts/shared.ts", source: "export const addPoint = () => 5;" },
          { dependencies: ["src/scripts/shared.ts"], hash: "sha256-entry", path: "src/scripts/entry.ts", source: "import { addPoint as importedAddPoint } from './shared'; export { importedAddPoint as collect };" },
        ],
        order: ["src/scripts/shared.ts", "src/scripts/entry.ts"],
      },
    },
  }]);

  assert.deepEqual(result.diagnostics, []);
  assert.equal(runBundledSystem(result.code, "system_collect"), 5);
});

test("should exclude default exports from stars and preserve explicit precedence", () => {
  const result = bundleSystemScripts([{
    name: "collect",
    script: {
      exportName: "system_collect",
      source: "() => undefined",
      sourceRef: { export: "collect", module: "src/scripts/entry.ts", systemId: "collect" },
      localModuleGraph: {
        entry: "src/scripts/entry.ts",
        hash: "sha256-graph",
        modules: [
          { dependencies: [], hash: "sha256-first", path: "src/scripts/first.ts", source: "export const value = 1; export default 9;" },
          { dependencies: ["src/scripts/first.ts"], hash: "sha256-exports", path: "src/scripts/exports.ts", source: "export * from './first'; export const value = 2;" },
          { dependencies: ["src/scripts/exports.ts"], hash: "sha256-entry", path: "src/scripts/entry.ts", source: "import * as values from './exports'; export const collect = () => ({ keys: Object.keys(values).sort(), value: values.value });" },
        ],
        order: ["src/scripts/first.ts", "src/scripts/exports.ts", "src/scripts/entry.ts"],
      },
    },
  }]);

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(runBundledSystem(result.code, "system_collect"), { keys: ["value"], value: 2 });
});

test("should reject a local import that names an unexported binding", () => {
  const result = bundleSystemScripts([{
    name: "collect",
    script: {
      exportName: "system_collect",
      source: "() => undefined",
      sourceRef: { export: "collect", module: "src/scripts/collect.ts", systemId: "collect" },
      localModuleGraph: {
        entry: "src/scripts/collect.ts",
        hash: "sha256-graph",
        modules: [
          { dependencies: [], hash: "sha256-helper", path: "src/scripts/shared.ts", source: "export const addPoint = (value: number) => value + 2;" },
          { dependencies: ["src/scripts/shared.ts"], hash: "sha256-entry", path: "src/scripts/collect.ts", source: "import { missing } from './shared'; export const collect = () => missing(3);" },
        ],
        order: ["src/scripts/shared.ts", "src/scripts/collect.ts"],
      },
    },
  }]);

  assert.equal(result.code, undefined);
  assert.equal(result.diagnostics[0]?.code, "TN_SCRIPT_MODULE_EXPORT_MISSING");
  assert.match(result.diagnostics[0]?.message ?? "", /missing/);
});

test("should bundle promoted gameplay math helpers", () => {
  const result = bundleSystemScripts([
    {
      name: "updatePlayer",
      script: {
        exportName: "system_updatePlayer",
        helperImports: [
          {
            imported: ["AngleEx", "Bounds2", "Bounds3", "Ease", "Vec2", "Vec3"],
            module: "@threenative/script-stdlib",
          },
        ],
        source:
          "(context) => ({ angle: AngleEx.radToDeg(Math.PI), axis: Vec2.round(Vec2.normalize([3, 4]), 3), inside: Bounds2.containsPoint(Bounds2.rect(0, 0, 4, 4), [2, 2]), box: Bounds3.size(Bounds3.aabb([0, 0, 0], [1, 2, 3])), ease: Ease.smoothStep(0.5), forward: Vec3.round(Vec3.rotateYaw([0, 0, 1], Math.PI / 2), 3) })",
      },
    },
  ]);

  assert.deepEqual(result.diagnostics, []);
  assert.match(result.code ?? "", /const AngleEx = Object\.freeze/);
  assert.match(result.code ?? "", /const Vec2 = Object\.freeze/);
  assert.deepEqual(runBundledSystem(result.code, "system_updatePlayer"), {
    angle: 180,
    axis: [0.6, 0.8],
    box: [1, 2, 3],
    ease: 0.5,
    forward: [1, 0, 0],
    inside: true,
  });
});

test("should bundle deterministic feedback helpers", () => {
  const result = bundleSystemScripts([
    {
      name: "lootText",
      script: {
        exportName: "system_lootText",
        helperImports: [
          {
            imported: ["ColorEx", "RandomEx", "TextEx"],
            module: "@threenative/script-stdlib",
          },
        ],
        source:
          "(context) => ({ color: ColorEx.toHex(ColorEx.withAlpha('#336699', 0.5), true), roll: RandomEx.rangeInt(42, 3, 1, 6), text: TextEx.joinNonEmpty(['Loot', TextEx.percent(0.5)], ' ') })",
      },
    },
  ]);

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(runBundledSystem(result.code, "system_lootText"), {
    color: "#33669980",
    roll: 3,
    text: "Loot 50%",
  });
});

test("should bundle pure gameplay reducer helpers", () => {
  const result = bundleSystemScripts([
    {
      name: "movement",
      script: {
        exportName: "system_movement",
        helperImports: [
          {
            imported: ["ArrayEx", "CameraMath", "InputEx", "MotionEx", "TimerEx"],
            module: "@threenative/script-stdlib",
          },
        ],
        source:
          "(context) => ({ animation: ArrayEx.cycle(['idle', 'run'], 5), camera: CameraMath.followPose({ target: [0, 0, 0], offset: [0, 4, -8] }).position, input: InputEx.axis2([0.2, 1], { deadzone: 0.1 }), motion: MotionEx.planarVelocity({ velocity: [0, 0, 0], input: [1, 0], maxSpeed: 3, acceleration: 12, friction: 2, dt: 0.25 }), timer: TimerEx.cooldown(0.5, 0.2) })",
      },
    },
  ]);

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(roundJson(runBundledSystem(result.code, "system_movement")), {
    animation: "run",
    camera: [0, 4, -8],
    input: [0.110432, 0.993884],
    motion: {
      heading: 1.570796,
      speed: 3,
      velocity: [3, 0, 0],
    },
    timer: {
      ready: false,
      remaining: 0.3,
    },
  });
});

test("should bundle supported racing kit imports", () => {
  const result = bundleSystemScripts([
    {
      name: "rallyLoop",
      script: {
        exportName: "system_rallyLoop",
        helperImports: [
          {
            imported: ["Track2D", "CheckpointRace"],
            module: "@threenative/racing-kit",
          },
        ],
        source: "(context) => CheckpointRace.hud({ checkpoint: 0, lap: 1, speed: Track2D.loop({ points: [[0,0,0]], width: 1 }).width })",
      },
    },
  ]);

  assert.deepEqual(result.diagnostics, []);
  assert.match(result.code ?? "", /const Track2D = Object\.freeze/);
  assert.match(result.code ?? "", /const CheckpointRace = Object\.freeze/);
  assert.match(result.code ?? "", /const system_rallyLoop = \(context\) => CheckpointRace\.hud/);
});

test("should bundle promoted game velocity kit imports", () => {
  const result = bundleSystemScripts([
    {
      name: "kitLoop",
      script: {
        exportName: "system_kitLoop",
        helperImports: [
          { imported: ["CollectorKit"], module: "@threenative/collector-kit" },
          { imported: ["LaneRunnerKit"], module: "@threenative/lane-runner-kit" },
          { imported: ["CheckpointRaceKit"], module: "@threenative/checkpoint-race-kit" },
        ],
        source: "() => ({ collector: CollectorKit.hud(CollectorKit.initial()), lane: LaneRunnerKit.tick(LaneRunnerKit.initial(), 1).score, race: CheckpointRaceKit.initial().status })",
      },
    },
  ]);

  assert.deepEqual(result.diagnostics, []);
  assert.match(result.code ?? "", /const CollectorKit = Object\.freeze/);
  assert.match(result.code ?? "", /const LaneRunnerKit = Object\.freeze/);
  assert.match(result.code ?? "", /const CheckpointRaceKit = Object\.freeze/);
  assert.deepEqual(runBundledSystem(result.code, "system_kitLoop"), {
    collector: "Score 0 | Lives 3",
    lane: 6,
    race: "racing",
  });
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

test("should reject generated script export collisions", () => {
  const result = bundleSystemScripts([
    {
      name: "kart-physics",
      script: {
        exportName: "system_kart_physics",
        source: "(context) => context",
      },
    },
    {
      name: "kart_physics",
      script: {
        exportName: "system_kart_physics",
        source: "(context) => context",
      },
    },
  ]);

  assert.equal(result.code, undefined);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ["TN_SCRIPT_EXPORT_COLLISION", "TN_SCRIPT_EXPORT_COLLISION"]);
});

function runBundledSystem(code: string | undefined, exportName: string): unknown {
  assert.equal(typeof code, "string");
  const script = new vm.Script(`${code?.replace(/^export const /gm, "const ")}; systems[${JSON.stringify(exportName)}]({});`);
  return JSON.parse(JSON.stringify(script.runInNewContext(Object.create(null)))) as unknown;
}

function roundJson(value: unknown): unknown {
  if (typeof value === "number") {
    return Math.round(value * 1000000) / 1000000;
  }
  if (Array.isArray(value)) {
    return value.map((item) => roundJson(item));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundJson(item)]));
  }
  return value;
}
