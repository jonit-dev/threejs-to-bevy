import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
    for (const file of ["albedo.png", "normal.png", "metallic-roughness.png", "emissive.png", "occlusion.png", "clearcoat.png", "clearcoat-roughness.png", "transmission.png"]) {
      await writeFile(join(root, "assets", file), "texture");
    }
    await writeJson(root, "assets.manifest.json", {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        {
          id: "tex.albedo",
          kind: "texture",
          format: "png",
          path: "assets/albedo.png",
          center: [0.5, 0.5],
          magFilter: "nearest",
          minFilter: "nearestMipmapLinear",
          offset: [0.25, 0.5],
          repeat: [4, 2],
          rotation: 0.5,
          wrapS: "repeat",
          wrapT: "mirroredRepeat",
        },
        { id: "tex.normal", kind: "texture", format: "png", path: "assets/normal.png" },
        { id: "tex.mr", kind: "texture", format: "png", path: "assets/metallic-roughness.png" },
        { id: "tex.emissive", kind: "texture", format: "png", path: "assets/emissive.png" },
        { id: "tex.occlusion", kind: "texture", format: "png", path: "assets/occlusion.png" },
        { id: "tex.clearcoat", kind: "texture", format: "png", path: "assets/clearcoat.png" },
        { id: "tex.clearcoatRoughness", kind: "texture", format: "png", path: "assets/clearcoat-roughness.png" },
        { id: "tex.transmission", kind: "texture", format: "png", path: "assets/transmission.png" },
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
          clearcoatTexture: "tex.clearcoat",
          clearcoatRoughnessTexture: "tex.clearcoatRoughness",
          transmissionTexture: "tex.transmission",
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

test("animations should accept transform tracks when targets exist", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-transform-animation-"));
  try {
    await writeTestBundle(root, {
      manifest: {
        entry: { animations: "animations.ir.json" },
        files: { animations: "animations.ir.json" },
      },
      world: {
        schema: "threenative.world",
        version: "0.1.0",
        entities: [{ id: "cube", components: { Transform: { position: [0, 0, 0], scale: [1, 1, 1] } } }],
      },
    });
    await writeJson(root, "animations.ir.json", {
      schema: "threenative.animations",
      version: "0.1.0",
      transformClips: [
        {
          id: "move",
          loop: "repeat",
          tracks: [
            {
              channel: "position",
              easing: "linear",
              keyframes: [
                { timeSeconds: 0, value: [0, 0, 0] },
                { timeSeconds: 1, value: [2, 0, 0] },
              ],
              target: "cube",
            },
          ],
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

test("animations should reject missing targets and non-monotonic keyframes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-transform-animation-invalid-"));
  try {
    await writeTestBundle(root, {
      manifest: {
        entry: { animations: "animations.ir.json" },
        files: { animations: "animations.ir.json" },
      },
      world: {
        schema: "threenative.world",
        version: "0.1.0",
        entities: [{ id: "cube", components: { Transform: { position: [0, 0, 0] } } }],
      },
    });
    await writeJson(root, "animations.ir.json", {
      schema: "threenative.animations",
      version: "0.1.0",
      transformClips: [
        {
          id: "bad",
          tracks: [
            {
              channel: "scale",
              keyframes: [
                { timeSeconds: 0, value: [1, 1, 1] },
                { timeSeconds: 0, value: [2, 2, 2] },
              ],
              target: "missing",
            },
          ],
        },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      ["TN_IR_TRANSFORM_ANIMATION_TARGET_MISSING", "TN_IR_TRANSFORM_ANIMATION_TIME_NON_MONOTONIC"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("assets should accept expanded generated mesh primitive catalog", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-assets-generated-mesh-catalog-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(root, "assets.manifest.json", {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        { id: "mesh.cone", kind: "mesh", format: "generated", primitive: "cone", size: [0.5, 1] },
        { id: "mesh.frustum", kind: "mesh", format: "generated", primitive: "conicalFrustum", size: [0.25, 0.5, 1] },
        { id: "mesh.torus", kind: "mesh", format: "generated", primitive: "torus", size: [0.25, 0.75] },
        { id: "mesh.circle", kind: "mesh", format: "generated", primitive: "circle", size: [0.5] },
        { id: "mesh.annulus", kind: "mesh", format: "generated", primitive: "annulus", size: [0.25, 0.75] },
        { id: "mesh.polygon", kind: "mesh", format: "generated", primitive: "regularPolygon", size: [0.5, 6] },
        { id: "mesh.extruded", kind: "mesh", format: "generated", primitive: "extrudedRectangle", size: [1, 2, 0.5] },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("assets should reject invalid generated mesh primitive dimensions", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-assets-generated-mesh-invalid-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(root, "assets.manifest.json", {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        { id: "mesh.torus", kind: "mesh", format: "generated", primitive: "torus", size: [1, 0.5] },
        { id: "mesh.polygon", kind: "mesh", format: "generated", primitive: "regularPolygon", size: [0.5, 2] },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      ["TN_IR_MESH_SIZE_INVALID", "TN_IR_MESH_SIZE_INVALID"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("assets should accept custom generated mesh attributes and indices", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-assets-custom-mesh-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(root, "assets.manifest.json", {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        {
          id: "mesh.custom",
          kind: "mesh",
          format: "generated",
          primitive: "custom",
          attributes: [
            { itemSize: 3, name: "position", values: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
            { itemSize: 4, name: "color", values: [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1] },
            { itemSize: 1, name: "custom:weight", values: [0, 0.5, 1] },
          ],
          indices: [0, 1, 2],
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

test("assets should accept binary generated mesh payload references", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-assets-binary-mesh-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await mkdir(join(root, "generated/meshes"), { recursive: true });
    await writeFile(join(root, "generated/meshes/mesh.position.bin"), float32([0, 0, 0, 1, 0, 0, 0, 1, 0]));
    await writeFile(join(root, "generated/meshes/mesh.normal.bin"), float32([0, 0, 1, 0, 0, 1, 0, 0, 1]));
    await writeFile(join(root, "generated/meshes/mesh.uv.bin"), float32([0, 0, 1, 0, 0, 1]));
    await writeFile(join(root, "generated/meshes/mesh.indices.bin"), uint16([0, 1, 2]));
    await writeJson(root, "assets.manifest.json", {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        {
          id: "mesh.procedural",
          kind: "mesh",
          format: "generated",
          primitive: "custom",
          topology: "triangle-list",
          usage: "static",
          bounds: { min: [0, 0, 0], max: [1, 1, 0] },
          budget: { classification: "standard-prop", vertexCount: 3, limit: 8000 },
          generation: { id: "prop.test", source: "MeshBuilder", seed: 3 },
          binaryAttributes: [
            { name: "position", itemSize: 3, format: "float32x3", count: 3, path: "generated/meshes/mesh.position.bin" },
            { name: "normal", itemSize: 3, format: "float32x3", count: 3, path: "generated/meshes/mesh.normal.bin" },
            { name: "uv", itemSize: 2, format: "float32x2", count: 3, path: "generated/meshes/mesh.uv.bin" },
          ],
          binaryIndices: { format: "uint16", count: 3, path: "generated/meshes/mesh.indices.bin" },
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

test("assets should reject generated mesh indices outside the vertex range", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-assets-binary-mesh-invalid-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await mkdir(join(root, "generated/meshes"), { recursive: true });
    await writeFile(join(root, "generated/meshes/mesh.position.bin"), float32([0, 0, 0, 1, 0, 0, 0, 1, 0]));
    await writeFile(join(root, "generated/meshes/mesh.indices.bin"), uint16([0, 1, 4]));
    await writeJson(root, "assets.manifest.json", {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        {
          id: "mesh.procedural",
          kind: "mesh",
          format: "generated",
          primitive: "custom",
          topology: "triangle-list",
          usage: "static",
          bounds: { min: [0, 0, 0], max: [1, 1, 0] },
          binaryAttributes: [
            { name: "position", itemSize: 3, format: "float32x3", count: 3, path: "generated/meshes/mesh.position.bin" },
          ],
          binaryIndices: { format: "uint16", count: 3, path: "generated/meshes/mesh.indices.bin" },
        },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_MESH_INDICES_INVALID");
    assert.match(result.diagnostics[0]?.path ?? "", /binaryIndices\/2$/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("assets should reject invalid custom generated mesh attributes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-assets-custom-mesh-invalid-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(root, "assets.manifest.json", {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        {
          id: "mesh.custom",
          kind: "mesh",
          format: "generated",
          primitive: "custom",
          attributes: [
            { itemSize: 3, name: "position", values: [0, 0, 0, 1, 0, 0] },
            { itemSize: 2, name: "normal", values: [0, 0, 1, 0] },
          ],
          indices: [0, 2, 1],
        },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      ["TN_IR_MESH_ATTRIBUTE_ITEM_SIZE_INVALID", "TN_IR_MESH_INDICES_INVALID"],
    );
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
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_IK_UNSUPPORTED"));
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_ANIMATION_GRAPH_CLIP_MISSING"));
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_ANIMATION_BLEND_INVALID"));
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_PARTICLE_FIELD_UNSUPPORTED"));
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_PARTICLE_MAX_INVALID"));
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_PARTICLE_SHAPE_UNSUPPORTED"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject animation masks when authored", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-assets-animation-masks-"));
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
            animations: [{ id: "idle" }, { id: "wave" }],
            animationGraph: {
              initialState: "idle",
              states: [
                { id: "idle", clip: "idle" },
                { id: "wave", clip: "wave" },
              ],
            },
            masks: [{ id: "upperBody", joints: ["Spine", "Arm.L", "Arm.R"] }],
          },
        ],
      } as any,
    });
    await writeFile(join(root, "assets/hero.glb"), "model");

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_ANIMATION_MASKS_UNSUPPORTED"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unbounded rendered particle emitters", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-assets-unbounded-particles-"));
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
            particleEmitters: [
              { id: "dust", lifetimeSeconds: 1, maxParticles: 0, ratePerSecond: Number.POSITIVE_INFINITY, shape: "gpu", shader: "dust.wgsl" },
            ],
          },
        ],
      } as any,
    });
    await writeFile(join(root, "assets/hero.glb"), "model");

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_PARTICLE_FIELD_UNSUPPORTED"));
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_PARTICLE_MAX_INVALID"));
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_PARTICLE_RATE_INVALID"));
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_PARTICLE_SHAPE_UNSUPPORTED"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function float32(values: readonly number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  return buffer;
}

function uint16(values: readonly number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 2);
  values.forEach((value, index) => buffer.writeUInt16LE(value, index * 2));
  return buffer;
}
