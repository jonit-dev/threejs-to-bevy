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
      `import { NumberEx, Quat, Vec3 } from "@threenative/script-stdlib";\nexport const kartArcadePhysics = (context: unknown) => ({ context, next: Vec3.round(Vec3.add([1, 0, 0], [0.25, 0, 1])), yaw: Quat.yaw(Quat.fromYaw(NumberEx.clamp(1, 0, 2))) });\n`,
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

test("should record promoted gameplay reducer imports", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-source-ref-gameplay-reducers-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(
      join(root, "src/scripts/player.ts"),
      `import { ArrayEx, CameraMath, ColorEx, InputEx, MotionEx, RandomEx, TextEx, TimerEx } from "@threenative/script-stdlib";\nexport const updatePlayer = () => ({ camera: CameraMath.followPose({ target: [0, 0, 0] }), color: ColorEx.toHex("#336699"), input: InputEx.axis2([1, 1]), motion: MotionEx.integrate([0, 0, 0], [1, 0, 0], 0.1), random: RandomEx.pickIndex(1, 2, 3), text: TextEx.percent(0.5), timer: TimerEx.cooldown(1, 0.1), item: ArrayEx.cycle(["a"], 2) });\n`,
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
        imported: ["ArrayEx", "CameraMath", "ColorEx", "InputEx", "MotionEx", "RandomEx", "TextEx", "TimerEx"],
        module: "@threenative/script-stdlib",
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
    assert.equal(result.systems[0]?.script?.source, undefined);
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
