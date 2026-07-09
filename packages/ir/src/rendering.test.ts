import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { validateAtmosphereProfile } from "./rendering.js";
import { validateBundle } from "./validate.js";
import type { IAtmosphereProfileIr } from "./types.js";

async function writeJson(root: string, name: string, value: unknown): Promise<void> {
  await writeFile(join(root, name), `${JSON.stringify(value, null, 2)}\n`);
}

test("rendering should accept blended materials with explicit render order", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-material-blend-"));
  try {
    await writeJson(root, "manifest.json", {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "material-blend",
      requiredCapabilities: {},
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    });
    await writeJson(root, "target.profile.json", { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] });
    await writeJson(root, "world.ir.json", { schema: "threenative.world", version: "0.1.0", entities: [] });
    await writeJson(root, "assets.manifest.json", { schema: "threenative.assets", version: "0.1.0", assets: [] });
    await writeJson(root, "materials.ir.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [{ id: "mat.glass", kind: "standard", color: "#ffffff", alphaMode: "blend", blendMode: "normal", renderOrder: 2 }],
    });
    const result = await validateBundle(root);
    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rendering should reject unsupported blend mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-material-blend-invalid-"));
  try {
    await writeJson(root, "manifest.json", {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "material-blend-invalid",
      requiredCapabilities: {},
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    });
    await writeJson(root, "target.profile.json", { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] });
    await writeJson(root, "world.ir.json", { schema: "threenative.world", version: "0.1.0", entities: [] });
    await writeJson(root, "assets.manifest.json", { schema: "threenative.assets", version: "0.1.0", assets: [] });
    await writeJson(root, "materials.ir.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [{ id: "mat.bad", kind: "standard", color: "#ffffff", alphaMode: "blend", blendMode: "screen" }],
    });
    const result = await validateBundle(root);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_MATERIAL_BLEND_MODE_UNSUPPORTED");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rendering should accept constrained extended material preset", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-material-extended-"));
  try {
    await writeJson(root, "manifest.json", {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "material-extended",
      requiredCapabilities: {},
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    });
    await writeJson(root, "target.profile.json", { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] });
    await writeJson(root, "world.ir.json", { schema: "threenative.world", version: "0.1.0", entities: [] });
    await writeJson(root, "assets.manifest.json", { schema: "threenative.assets", version: "0.1.0", assets: [] });
    await writeJson(root, "materials.ir.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [{ id: "mat.foliage", kind: "extended", color: "#3fbf6b", alphaMode: "mask", extension: { preset: "foliage", doubleSided: true } }],
    });
    const result = await validateBundle(root);
    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rendering should reject broad shader fields until promoted", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-material-shader-"));
  try {
    await writeJson(root, "manifest.json", {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "material-shader",
      requiredCapabilities: {},
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    });
    await writeJson(root, "target.profile.json", { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] });
    await writeJson(root, "world.ir.json", { schema: "threenative.world", version: "0.1.0", entities: [] });
    await writeJson(root, "assets.manifest.json", { schema: "threenative.assets", version: "0.1.0", assets: [] });
    await writeJson(root, "materials.ir.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [
        {
          id: "mat.shader",
          kind: "standard",
          bindlessTextures: ["albedo"],
          color: "#ffffff",
          fragmentShader: "void main(){}",
          renderPhase: "transparent-prepass",
          shaderDefs: ["USE_WIND"],
          storageBuffers: ["particles"],
        },
      ],
    });
    const result = await validateBundle(root);
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      [
        "TN_IR_SHADER_CUSTOM_UNSUPPORTED",
        "TN_IR_SHADER_DEFS_UNSUPPORTED",
        "TN_IR_SHADER_STORAGE_BUFFER_UNSUPPORTED",
        "TN_IR_SHADER_RENDER_PHASE_UNSUPPORTED",
        "TN_IR_SHADER_BINDLESS_UNSUPPORTED",
      ],
    );
    assert.equal(result.diagnostics.every((diagnostic) => diagnostic.suggestion?.includes("constrained portable shader model")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept portable shader material declarations", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-material-portable-shader-"));
  try {
    await writeJson(root, "manifest.json", {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "portable-shader-material",
      requiredCapabilities: {},
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    });
    await writeJson(root, "target.profile.json", { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] });
    await writeJson(root, "world.ir.json", { schema: "threenative.world", version: "0.1.0", entities: [] });
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets/ramp.png"), "");
    await writeJson(root, "assets.manifest.json", {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [{ id: "tex.ramp", kind: "texture", format: "png", path: "assets/ramp.png" }],
    });
    await writeJson(root, "materials.ir.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [
        {
          id: "mat.shader",
          kind: "shader",
          alphaMode: "blend",
          inputs: ["normal", "uv0", "elapsedTime"],
          outputs: ["baseColor", "alpha"],
          program: {
            language: "threenative-shader-v1",
            fragment: {
              outputs: {
                alpha: { kind: "literal", value: 0.9 },
                baseColor: { kind: "uniform", uniform: "tint" },
                emissive: { kind: "sampleTexture", texture: "ramp" },
              },
            },
            vertex: {
              displacement: {
                amount: { kind: "uniform", uniform: "waveAmount" },
                axis: "normal",
              },
            },
          },
          textures: [{ name: "ramp", asset: "tex.ramp" }],
          uniforms: [
            { name: "tint", type: "color", default: "#33ccff" },
            { name: "waveAmount", type: "float", default: 0.1 },
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

test("should reject raw backend shader payloads on shader materials", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-material-portable-shader-raw-"));
  try {
    await writeJson(root, "manifest.json", {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "portable-shader-raw",
      requiredCapabilities: {},
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    });
    await writeJson(root, "target.profile.json", { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] });
    await writeJson(root, "world.ir.json", { schema: "threenative.world", version: "0.1.0", entities: [] });
    await writeJson(root, "assets.manifest.json", { schema: "threenative.assets", version: "0.1.0", assets: [] });
    await writeJson(root, "materials.ir.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [
        {
          id: "mat.shader",
          kind: "shader",
          fragmentShader: "void main() {}",
          program: {
            language: "threenative-shader-v1",
            fragment: { outputs: { baseColor: { kind: "literal", value: "#ffffff" } } },
          },
        },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_SHADER_CUSTOM_UNSUPPORTED"));
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.path.endsWith("/fragmentShader")));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject undeclared shader bindings", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-material-portable-shader-binding-"));
  try {
    await writeJson(root, "manifest.json", {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "portable-shader-binding",
      requiredCapabilities: {},
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    });
    await writeJson(root, "target.profile.json", { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] });
    await writeJson(root, "world.ir.json", { schema: "threenative.world", version: "0.1.0", entities: [] });
    await writeJson(root, "assets.manifest.json", { schema: "threenative.assets", version: "0.1.0", assets: [] });
    await writeJson(root, "materials.ir.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [
        {
          id: "mat.shader",
          kind: "shader",
          program: {
            language: "threenative-shader-v1",
            fragment: {
              outputs: {
                baseColor: { kind: "uniform", uniform: "missingTint" },
                emissive: { kind: "sampleTexture", texture: "missingTexture" },
              },
            },
          },
          uniforms: [{ name: "declaredTint", type: "color", default: "#ffffff" }],
        },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.filter((diagnostic) => diagnostic.code === "TN_IR_SHADER_BINDING_UNDECLARED").map((diagnostic) => diagnostic.path),
      [
        "materials.ir.json/materials/0/program/fragment/outputs/baseColor/uniform",
        "materials.ir.json/materials/0/program/fragment/outputs/emissive/texture",
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rendering should validate sun ambient fog sky and color management profile", () => {
  assert.deepEqual(validateAtmosphereProfile(makeProfile(), "environment.scene.json/atmosphere"), []);
});

test("rendering should reject lighting profile when sun intensity is negative", () => {
  const profile = makeProfile({ sun: { ...makeProfile().sun, intensity: -1 } });

  const diagnostics = validateAtmosphereProfile(profile, "environment.scene.json/atmosphere");

  assert.equal(diagnostics[0]?.code, "TN_IR_ATMOSPHERE_SUN_INTENSITY_INVALID");
});

test("rendering should reject linear fog when distance fields are missing", () => {
  const profile = makeProfile({ fog: { color: "#8899aa", enabled: true, mode: "linear" } });

  const diagnostics = validateAtmosphereProfile(profile, "environment.scene.json/atmosphere");

  assert.equal(diagnostics[0]?.code, "TN_IR_ATMOSPHERE_FOG_LINEAR_DISTANCE_MISSING");
});

test("rendering should reject shadow profile when map size exceeds target budget", () => {
  const profile = makeProfile({ shadows: { ...makeProfile().shadows, mapSize: 4096 as 2048 } });

  const diagnostics = validateAtmosphereProfile(profile, "environment.scene.json/atmosphere");

  assert.equal(diagnostics[0]?.code, "TN_IR_ATMOSPHERE_SHADOW_MAP_SIZE_EXCEEDED");
});

test("should accept skybox and environment probe refs when assets are bundle local", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-env-lighting-"));
  try {
    await writeEnvironmentLightingBundle(root, {
      assets: [
        ...["px", "nx", "py", "ny", "pz", "nz"].map((face) => ({ format: "png", id: `tex.sky.${face}`, kind: "texture", path: `assets/sky/${face}.png` })),
        { format: "png", id: "tex.env.studio", kind: "texture", path: "assets/studio.png" },
      ],
      environment: {
        skybox: {
          faces: {
            negativeX: "tex.sky.nx",
            negativeY: "tex.sky.ny",
            negativeZ: "tex.sky.nz",
            positiveX: "tex.sky.px",
            positiveY: "tex.sky.py",
            positiveZ: "tex.sky.pz",
          },
          intensity: 0.9,
          mode: "cubemap",
          rotationY: 0.5,
        },
        environmentMap: { asset: "tex.env.studio", intent: "reflection-and-irradiance", mode: "equirect" },
        lightProbes: [
          {
            bounds: { min: [-3, 0, -3], max: [3, 4, 3] },
            id: "probe.center",
            influenceRadius: 5,
            intent: "irradiance",
            source: { asset: "tex.env.studio", mode: "equirect" },
          },
        ],
      },
    });

    const result = await validateBundle(root);

    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject skybox refs when cubemap assets are missing or unsupported", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-env-lighting-invalid-"));
  try {
    await writeEnvironmentLightingBundle(root, {
      assets: [
        { format: "png", id: "tex.sky.px", kind: "texture", path: "assets/sky/px.png" },
        { format: "ktx2", id: "tex.sky.nx", kind: "texture", path: "assets/sky/nx.ktx2" },
      ],
      environment: {
        skybox: {
          faces: {
            negativeX: "tex.sky.nx",
            negativeY: "tex.sky.missing.ny",
            negativeZ: "tex.sky.missing.nz",
            positiveX: "tex.sky.px",
            positiveY: "tex.sky.missing.py",
            positiveZ: "tex.sky.missing.pz",
          },
          mode: "cubemap",
        },
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_RENDERER_SKYBOX_ASSET_FORMAT_UNSUPPORTED"));
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_RENDERER_SKYBOX_ASSET_MISSING"));
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.path === "environment.scene.json/skybox/faces/negativeX"));
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.path === "environment.scene.json/skybox/faces/negativeY"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function makeProfile(overrides: Partial<IAtmosphereProfileIr> = {}): IAtmosphereProfileIr {
  return {
    active: true,
    id: "atmosphere.forest",
    sun: { castsShadow: true, color: "#ffd39a", direction: [-0.45, -0.8, -0.2], id: "sun.forest", intensity: 3.2 },
    ambient: { color: "#8fb2a5", intensity: 0.8, mode: "constant" },
    fog: { color: "#9eb6aa", density: 0.028, enabled: true, mode: "exponential" },
    sky: { color: "#9eb6aa", horizonColor: "#d6c39d" },
    colorManagement: { exposure: 1.05, outputColorSpace: "srgb", textureColorSpace: "srgb", toneMapping: "aces" },
    shadows: { bias: -0.0005, cascadeCount: 1, enabled: true, mapSize: 1024, maxDistance: 45, normalBias: 0.02, receiverPolicy: "terrain-and-path" },
    ...overrides,
  };
}

async function writeEnvironmentLightingBundle(
  root: string,
  options: {
    assets: Array<Record<string, unknown> & { path?: string }>;
    environment: Record<string, unknown>;
  },
): Promise<void> {
  await writeJson(root, "manifest.json", {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "environment-lighting",
    requiredCapabilities: {},
    entry: { environmentScene: "environment.scene.json", world: "world.ir.json" },
    files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
  });
  await writeJson(root, "target.profile.json", { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] });
  await writeJson(root, "world.ir.json", { schema: "threenative.world", version: "0.1.0", entities: [] });
  await writeJson(root, "materials.ir.json", { schema: "threenative.materials", version: "0.1.0", materials: [] });
  await writeJson(root, "assets.manifest.json", { schema: "threenative.assets", version: "0.1.0", assets: options.assets });
  await writeJson(root, "environment.scene.json", {
    schema: "threenative.environment-scene",
    version: "0.1.0",
    sourceAssets: [],
    instances: [],
    path: { id: "path.empty", points: [[0, 0, 0], [1, 0, 0]], width: 1 },
    ...options.environment,
  });
  for (const asset of options.assets) {
    if (asset.path !== undefined && typeof asset.path === "string" && !asset.path.includes(".ktx2")) {
      await mkdir(dirname(join(root, asset.path)), { recursive: true });
      await writeFile(join(root, asset.path), "texture");
    }
  }
}
