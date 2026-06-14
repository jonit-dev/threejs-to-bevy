import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateBundle } from "./validate.js";
import { writeJson, writeTestBundle } from "./testFixtures.js";

test("assets should reject missing asset path", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-assets-missing-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(root, "assets.manifest.json", {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [{ id: "tex.missing", kind: "texture", format: "png", path: "assets/missing.png" }],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_ASSET_PATH_MISSING");
    assert.equal(result.diagnostics[0]?.path, "assets.manifest.json/assets/0/path");
    assert.equal(result.diagnostics[0]?.severity, "error");
    assert.match(result.diagnostics[0]?.suggestion ?? "", /Copy the referenced file/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("assets should reject unknown texture asset", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-assets-texture-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(root, "materials.ir.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [{ id: "mat.crate", kind: "standard", color: "#ffffff", baseColorTexture: "tex.unknown" }],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_MATERIAL_TEXTURE_ASSET_MISSING");
    assert.equal(result.diagnostics[0]?.severity, "error");
    assert.match(result.diagnostics[0]?.suggestion ?? "", /baseColorTexture/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("assets should accept supported material texture slots", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-assets-texture-slots-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    for (const file of ["albedo.png", "normal.png", "metallic-roughness.png", "emissive.png", "occlusion.png"]) {
      await writeFile(join(root, "assets", file), "texture");
    }
    await writeJson(root, "assets.manifest.json", {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        { id: "tex.albedo", kind: "texture", format: "png", path: "assets/albedo.png" },
        { id: "tex.normal", kind: "texture", format: "png", path: "assets/normal.png" },
        { id: "tex.mr", kind: "texture", format: "png", path: "assets/metallic-roughness.png" },
        { id: "tex.emissive", kind: "texture", format: "png", path: "assets/emissive.png" },
        { id: "tex.occlusion", kind: "texture", format: "png", path: "assets/occlusion.png" },
      ],
    });
    await writeJson(root, "materials.ir.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [
        {
          id: "mat.textured",
          kind: "standard",
          color: "#ffffff",
          baseColorTexture: "tex.albedo",
          normalTexture: "tex.normal",
          metallicRoughnessTexture: "tex.mr",
          emissiveTexture: "tex.emissive",
          occlusionTexture: "tex.occlusion",
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

test("assets should reject material texture slot referencing non-texture asset", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-assets-texture-kind-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeFile(join(root, "assets", "crate.gltf"), "{}");
    await writeJson(root, "assets.manifest.json", {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [{ id: "model.crate", kind: "model", format: "gltf", path: "assets/crate.gltf" }],
    });
    await writeJson(root, "materials.ir.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [{ id: "mat.crate", kind: "standard", color: "#ffffff", baseColorTexture: "model.crate" }],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_MATERIAL_TEXTURE_ASSET_MISSING");
    assert.equal(result.diagnostics[0]?.path, "materials.ir.json/materials/0/baseColorTexture");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("assets should reject v3 environment bundle over budget", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-assets-budget-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeFile(join(root, "assets/tree.gltf"), "{}");
    await writeJson(root, "assets.manifest.json", {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [{ id: "model.env.tree", kind: "model", format: "gltf", path: "assets/tree.gltf" }],
    });
    await writeJson(root, "target.profile.json", {
      schema: "threenative.target-profile",
      version: "0.1.0",
      targets: ["web"],
      budgets: { maxBundleBytes: 1, supportedModelFormats: ["gltf"], supportedTextureFormats: ["png"] },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_BUDGET_BUNDLE_BYTES_EXCEEDED");
    assert.equal(result.diagnostics[0]?.limit, 1);
    assert.equal(result.diagnostics[0]?.path, "target.profile.json/budgets/maxBundleBytes");
    assert.equal(result.diagnostics[0]?.severity, "error");
    assert.match(result.diagnostics[0]?.suggestion ?? "", /Reduce copied assets/);
    assert.equal(result.diagnostics[0]?.value, 2);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("assets should accept model animation clip metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-assets-animation-clips-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeFile(join(root, "assets/hero.glb"), "model");
    await writeJson(root, "assets.manifest.json", {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        {
          animations: [
            { id: "idle", loop: true, speed: 1 },
            { id: "run", loop: true, sourceClip: "Armature|Run", speed: 1.25 },
          ],
          format: "glb",
          id: "model.hero",
          kind: "model",
          path: "assets/hero.glb",
        },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("assets should accept v7 animation graph and bounded particle metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-assets-v7-animation-"));
  try {
    await writeTestBundle(root, {
      createAssetsDir: true,
      assets: {
        schema: "threenative.assets",
        version: "0.1.0",
        assets: [
          {
            id: "model.hero",
            kind: "model",
            format: "glb",
            path: "assets/hero.glb",
            animations: [{ id: "idle" }, { id: "run" }],
            animationGraph: {
              initialState: "idle",
              parameters: [{ default: false, id: "moving", kind: "boolean" }],
              states: [
                { id: "idle", clip: "idle" },
                { id: "run", clip: "run", events: [{ event: "Footstep", atSeconds: 0.25 }] },
              ],
              transitions: [{ from: "idle", to: "run", blendSeconds: 0.15, when: { parameter: "moving", equals: true } }],
            },
            particleEmitters: [{ id: "dust", lifetimeSeconds: 0.5, maxParticles: 64, ratePerSecond: 12, shape: "point" }],
          },
        ],
      },
    });
    await writeFile(join(root, "assets/hero.glb"), "model");

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("assets should reject invalid and unsupported animation clip metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-assets-animation-invalid-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeFile(join(root, "assets/hero.glb"), "model");
    await writeFile(join(root, "assets/hit.wav"), "audio");
    await writeJson(root, "assets.manifest.json", {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        {
          animations: [
            { id: "", loop: "forever", speed: 0 },
            { id: "run", blendGraph: "locomotion", sourceClip: "" },
            { id: "run" },
          ],
          format: "glb",
          id: "model.hero",
          kind: "model",
          path: "assets/hero.glb",
          stateMachine: "Locomotion",
        },
        {
          animations: [{ id: "hit" }],
          format: "wav",
          id: "audio.hit",
          kind: "audio",
          path: "assets/hit.wav",
        },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      [
        "TN_IR_ANIMATION_FIELD_UNSUPPORTED",
        "TN_IR_ANIMATION_CLIP_ID_INVALID",
        "TN_IR_ANIMATION_LOOP_INVALID",
        "TN_IR_ANIMATION_SPEED_INVALID",
        "TN_IR_ANIMATION_FIELD_UNSUPPORTED",
        "TN_IR_ANIMATION_SOURCE_CLIP_INVALID",
        "TN_IR_ANIMATION_CLIP_DUPLICATE",
        "TN_IR_ANIMATION_MODEL_REQUIRED",
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("assets should reject invalid v7 animation graph and particle metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-assets-v7-animation-invalid-"));
  try {
    await writeTestBundle(root, {
      createAssetsDir: true,
      assets: {
        schema: "threenative.assets",
        version: "0.1.0",
        assets: [
          {
            id: "model.hero",
            kind: "model",
            format: "glb",
            path: "assets/hero.glb",
            animations: [{ id: "idle" }],
            animationGraph: {
              initialState: "run",
              states: [{ id: "run", clip: "missing" }],
              transitions: [{ from: "run", to: "walk", blendSeconds: -1, when: { parameter: "moving" } }],
            },
            particleEmitters: [{ id: "dust", lifetimeSeconds: 0, maxParticles: 0, ratePerSecond: -1, shape: "unbounded", unbounded: true }],
            ik: true,
          },
        ],
      } as any,
    });
    await writeFile(join(root, "assets/hero.glb"), "model");

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_ANIMATION_FIELD_UNSUPPORTED"));
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_ANIMATION_GRAPH_CLIP_MISSING"));
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_ANIMATION_BLEND_INVALID"));
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_PARTICLE_FIELD_UNSUPPORTED"));
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_PARTICLE_MAX_INVALID"));
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_PARTICLE_SHAPE_UNSUPPORTED"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
