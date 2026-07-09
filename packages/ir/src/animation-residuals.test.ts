import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateBundle } from "./validate.js";
import { writeJson, writeTestBundle } from "./testFixtures.js";

test("should reject mask paths not present in model skeleton", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-animation-mask-missing-"));
  try {
    await writeTestBundle(root, {
      createAssetsDir: true,
      assets: {
        schema: "threenative.assets",
        version: "0.1.0",
        assets: [
          {
            animations: [{ id: "wave", mask: "upperBody" }],
            format: "glb",
            id: "model.hero",
            kind: "model",
            masks: [{ id: "upperBody", joints: ["Spine", "Arm.L", "Missing.Hand"] }],
            path: "assets/hero.glb",
            skeleton: { joints: ["Root", "Spine", "Arm.L"] },
          },
        ],
      } as any,
    });
    await writeFile(join(root, "assets/hero.glb"), "model");

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    const diagnostic = result.diagnostics.find((item) => item.code === "TN_IR_ANIMATION_MASK_PATH_MISSING");
    assert.equal(diagnostic?.path, "assets.manifest.json/assets/0/masks/0/joints/2");
    assert.match(diagnostic?.message ?? "", /upperBody/);
    assert.match(diagnostic?.message ?? "", /Missing\.Hand/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept bounded animation masks and morph target clips", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-animation-residuals-"));
  try {
    await writeTestBundle(root, {
      createAssetsDir: true,
      assets: {
        schema: "threenative.assets",
        version: "0.1.0",
        assets: [
          {
            animations: [{ id: "smile", mask: "face" }],
            format: "glb",
            id: "model.hero",
            kind: "model",
            masks: [{ id: "face", joints: ["Head", "Jaw"] }],
            morphClips: [{ id: "smile", target: "Smile", keyframes: [{ timeSeconds: 0, weight: 0 }, { timeSeconds: 0.5, weight: 1 }] }],
            morphTargets: [{ defaultWeight: 0, id: "Smile" }],
            path: "assets/hero.glb",
            skeleton: { joints: ["Root", "Head", "Jaw"] },
          },
        ],
      } as any,
    });
    await writeFile(join(root, "assets/hero.glb"), "model");

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept bounded particle command services", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-particle-command-services-"));
  try {
    await writeTestBundle(root, {
      createAssetsDir: true,
      manifest: { entry: { systems: "systems.ir.json" } },
      assets: {
        schema: "threenative.assets",
        version: "0.1.0",
        assets: [
          {
            format: "glb",
            id: "model.hero",
            kind: "model",
            particleEmitters: [{ id: "dust", lifetimeSeconds: 0.5, maxParticles: 8, ratePerSecond: 8, shape: "point" }],
            path: "assets/hero.glb",
          },
        ],
      } as any,
    });
    await writeFile(join(root, "assets/hero.glb"), "model");
    await writeJson(root, "systems.ir.json", {
      schema: "threenative.systems",
      version: "0.1.0",
      systems: [
        {
          commands: [],
          eventReads: [],
          eventWrites: [],
          name: "particleCommands",
          queries: [],
          reads: [],
          resourceReads: [],
          resourceWrites: [],
          schedule: "update",
          services: ["particles.play", "particles.emit", "particles.clear", "particles.stop", "particles.start", "particles.burst", "particles.reset"],
          writes: [],
        },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unbounded particle commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-particle-command-unbounded-"));
  try {
    await writeTestBundle(root, {
      createAssetsDir: true,
      manifest: { entry: { systems: "systems.ir.json" } },
      assets: {
        schema: "threenative.assets",
        version: "0.1.0",
        assets: [
          {
            format: "glb",
            id: "model.hero",
            kind: "model",
            particleEmitters: [
              { id: "dust", lifetimeSeconds: 0, maxParticles: 0, ratePerSecond: Number.POSITIVE_INFINITY, shape: "gpu", handle: "renderer-particle-system" },
            ],
            path: "assets/hero.glb",
          },
        ],
      } as any,
    });
    await writeFile(join(root, "assets/hero.glb"), "model");
    await writeJson(root, "systems.ir.json", {
      schema: "threenative.systems",
      version: "0.1.0",
      systems: [
        {
          commands: [],
          eventReads: [],
          eventWrites: [],
          name: "particleCommands",
          queries: [],
          reads: [],
          resourceReads: [],
          resourceWrites: [],
          schedule: "update",
          services: ["particles.emit"],
          writes: [],
        },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.path]),
      [
        ["TN_IR_PARTICLE_FIELD_UNSUPPORTED", "assets.manifest.json/assets/0/particleEmitters/0/handle"],
        ["TN_IR_PARTICLE_MAX_INVALID", "assets.manifest.json/assets/0/particleEmitters/0/maxParticles"],
        ["TN_IR_PARTICLE_RATE_INVALID", "assets.manifest.json/assets/0/particleEmitters/0/ratePerSecond"],
        ["TN_IR_PARTICLE_LIFETIME_INVALID", "assets.manifest.json/assets/0/particleEmitters/0/lifetimeSeconds"],
        ["TN_IR_PARTICLE_SHAPE_UNSUPPORTED", "assets.manifest.json/assets/0/particleEmitters/0/shape"],
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
