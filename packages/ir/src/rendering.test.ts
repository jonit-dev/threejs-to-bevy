import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
      materials: [{ id: "mat.shader", kind: "standard", color: "#ffffff", fragmentShader: "void main(){}" }],
    });
    const result = await validateBundle(root);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_MATERIAL_CAPABILITY_UNSUPPORTED");
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
