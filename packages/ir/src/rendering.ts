import type { IAssetsManifest, IAtmosphereProfileIr, IContactShadowsIr, IEnvironmentSceneIr, IEnvironmentTextureSourceIr, Vec3 } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";

export function validateContactShadows(
  value: IContactShadowsIr | undefined,
  path: string,
): IIrDiagnostic[] {
  if (value === undefined) {
    return [];
  }
  const diagnostics: IIrDiagnostic[] = [];
  if (
    !Array.isArray(value.size)
    || value.size.length !== 2
    || value.size.some((entry) => !Number.isFinite(entry) || entry < 0.1 || entry > 500)
  ) {
    diagnostics.push({
      code: "TN_IR_CONTACT_SHADOWS_SIZE_INVALID",
      message: "ContactShadows size must contain two finite world-space extents between 0.1 and 500.",
      path: `${path}/size`,
      severity: "error",
      suggestion: "Use size: [width, depth] with each extent between 0.1 and 500.",
    });
  }
  validateContactShadowRange(value.height, 0.1, 50, "HEIGHT", `${path}/height`, diagnostics);
  if (![128, 256, 512, 1024].includes(value.resolution)) {
    diagnostics.push({
      code: "TN_IR_CONTACT_SHADOWS_RESOLUTION_INVALID",
      message: "ContactShadows resolution must be 128, 256, 512, or 1024.",
      path: `${path}/resolution`,
      severity: "error",
      suggestion: "Use a bounded power-of-two resolution: 128, 256, 512, or 1024.",
    });
  }
  validateContactShadowRange(value.softness, 0, 10, "SOFTNESS", `${path}/softness`, diagnostics);
  validateContactShadowRange(value.opacity, 0, 1, "OPACITY", `${path}/opacity`, diagnostics);
  if (!(["dynamic", "static"] as const).includes(value.updateMode)) {
    diagnostics.push({
      code: "TN_IR_CONTACT_SHADOWS_UPDATE_MODE_INVALID",
      message: "ContactShadows updateMode must be 'static' or 'dynamic'.",
      path: `${path}/updateMode`,
      severity: "error",
      suggestion: "Use updateMode: 'static' for invalidation-driven captures or 'dynamic' for every-frame captures.",
    });
  }
  return diagnostics;
}

export function validateAtmosphereProfile(profile: IAtmosphereProfileIr | undefined, path: string): IIrDiagnostic[] {
  if (profile === undefined) {
    return [];
  }
  const diagnostics: IIrDiagnostic[] = [];
  validateColor(profile.sun.color, `${path}/sun/color`, diagnostics);
  validateVec3(profile.sun.direction, `${path}/sun/direction`, diagnostics);
  validatePositiveFinite(profile.sun.intensity, `${path}/sun/intensity`, "TN_IR_ATMOSPHERE_SUN_INTENSITY_INVALID", diagnostics);
  validateColor(profile.ambient.color, `${path}/ambient/color`, diagnostics);
  validatePositiveFinite(profile.ambient.intensity, `${path}/ambient/intensity`, "TN_IR_ATMOSPHERE_AMBIENT_INTENSITY_INVALID", diagnostics);
  validatePositiveFinite(profile.colorManagement.exposure, `${path}/colorManagement/exposure`, "TN_IR_ATMOSPHERE_EXPOSURE_INVALID", diagnostics);
  if (!Number.isFinite(profile.shadows.maxDistance) || profile.shadows.maxDistance <= 0) {
    diagnostics.push({
      code: "TN_IR_ATMOSPHERE_SHADOW_CASCADE_MAX_DISTANCE_INVALID",
      message: "Shadow cascade maxDistance must be a positive finite number.",
      path: `${path}/shadows/maxDistance`,
      severity: "error",
      suggestion: "Use a positive world-space shadow reach such as maxDistance: 48.",
    });
  }
  validateOptionalUnitInterval(
    profile.shadows.splitLambda,
    `${path}/shadows/splitLambda`,
    "TN_IR_ATMOSPHERE_SHADOW_CASCADE_SPLIT_LAMBDA_INVALID",
    diagnostics,
  );
  validateOptionalUnitInterval(
    profile.shadows.cascadeBlendFraction,
    `${path}/shadows/cascadeBlendFraction`,
    "TN_IR_ATMOSPHERE_SHADOW_CASCADE_BLEND_FRACTION_INVALID",
    diagnostics,
  );
  if (profile.shadows.splitScheme !== undefined && !["uniform", "logarithmic", "practical"].includes(profile.shadows.splitScheme)) {
    diagnostics.push({
      code: "TN_IR_ATMOSPHERE_SHADOW_CASCADE_SPLIT_SCHEME_INVALID",
      message: "Expected shadow cascade split scheme 'uniform', 'logarithmic', or 'practical'.",
      path: `${path}/shadows/splitScheme`,
      severity: "error",
      suggestion: "Use splitScheme: 'uniform', 'logarithmic', or 'practical'.",
    });
  }
  if (profile.shadows.stabilized !== undefined && typeof profile.shadows.stabilized !== "boolean") {
    diagnostics.push({
      code: "TN_IR_ATMOSPHERE_SHADOW_CASCADE_STABILIZED_INVALID",
      message: "Expected a boolean shadow cascade stabilization value when declared.",
      path: `${path}/shadows/stabilized`,
      severity: "error",
      suggestion: "Use stabilized: true for texel-snapped cascades or stabilized: false to request unsnapped movement.",
    });
  }
  if (profile.shadows.mapSize > 2048) {
    diagnostics.push({
      code: "TN_IR_ATMOSPHERE_SHADOW_MAP_SIZE_EXCEEDED",
      message: `Atmosphere profile '${profile.id}' requests shadow map size ${profile.shadows.mapSize}, exceeding maximum 2048.`,
      path: `${path}/shadows/mapSize`,
    });
  }
  if (!Number.isFinite(profile.shadows.bias) || !Number.isFinite(profile.shadows.normalBias)) {
    diagnostics.push({
      code: "TN_IR_ATMOSPHERE_SHADOW_BIAS_INVALID",
      message: `Atmosphere profile '${profile.id}' must use finite shadow bias values.`,
      path: `${path}/shadows`,
    });
  }
  validateColor(profile.sky.color, `${path}/sky/color`, diagnostics);
  if (profile.sky.horizonColor !== undefined) {
    validateColor(profile.sky.horizonColor, `${path}/sky/horizonColor`, diagnostics);
  }
  if (profile.fog !== undefined) {
    validateColor(profile.fog.color, `${path}/fog/color`, diagnostics);
    if (profile.fog.mode === "linear" && (profile.fog.near === undefined || profile.fog.far === undefined)) {
      diagnostics.push({
        code: "TN_IR_ATMOSPHERE_FOG_LINEAR_DISTANCE_MISSING",
        message: `Atmosphere profile '${profile.id}' uses linear fog and must define near and far.`,
        path: `${path}/fog`,
      });
    }
    if (profile.fog.mode === "exponential" && profile.fog.density === undefined) {
      diagnostics.push({
        code: "TN_IR_ATMOSPHERE_FOG_DENSITY_MISSING",
        message: `Atmosphere profile '${profile.id}' uses exponential fog and must define density.`,
        path: `${path}/fog/density`,
      });
    }
    if (profile.fog.density !== undefined) {
      validatePositiveFinite(profile.fog.density, `${path}/fog/density`, "TN_IR_ATMOSPHERE_FOG_DENSITY_INVALID", diagnostics);
    }
    if (profile.fog.near !== undefined) {
      validatePositiveFinite(profile.fog.near, `${path}/fog/near`, "TN_IR_ATMOSPHERE_FOG_DISTANCE_INVALID", diagnostics);
    }
    if (profile.fog.far !== undefined) {
      validatePositiveFinite(profile.fog.far, `${path}/fog/far`, "TN_IR_ATMOSPHERE_FOG_DISTANCE_INVALID", diagnostics);
    }
  }
  return diagnostics;
}

export function validateEnvironmentLighting(
  scene: Pick<IEnvironmentSceneIr, "environmentMap" | "lightProbes" | "skybox">,
  assets: IAssetsManifest | undefined,
  path: string,
): IIrDiagnostic[] {
  const diagnostics: IIrDiagnostic[] = [];
  const bundleAssets = new Map((assets?.assets ?? []).map((asset) => [asset.id, asset]));

  if (scene.skybox !== undefined) {
    validateTextureSource(scene.skybox, bundleAssets, `${path}/skybox`, "TN_IR_RENDERER_SKYBOX", diagnostics);
    validateOptionalNonNegativeFinite(scene.skybox.intensity, `${path}/skybox/intensity`, "TN_IR_RENDERER_SKYBOX_INTENSITY_INVALID", diagnostics);
    validateOptionalFinite(scene.skybox.rotationY, `${path}/skybox/rotationY`, "TN_IR_RENDERER_SKYBOX_ROTATION_INVALID", diagnostics);
  }

  if (scene.environmentMap !== undefined) {
    validateTextureSource(scene.environmentMap, bundleAssets, `${path}/environmentMap`, "TN_IR_RENDERER_ENVIRONMENT_MAP", diagnostics);
    validateIntent(scene.environmentMap.intent, `${path}/environmentMap/intent`, "TN_IR_RENDERER_ENVIRONMENT_MAP_INTENT_INVALID", diagnostics);
    validateOptionalNonNegativeFinite(scene.environmentMap.intensity, `${path}/environmentMap/intensity`, "TN_IR_RENDERER_ENVIRONMENT_MAP_INTENSITY_INVALID", diagnostics);
  }

  (scene.lightProbes ?? []).forEach((probe, index) => {
    const probePath = `${path}/lightProbes/${index}`;
    if (probe.id.trim().length === 0) {
      diagnostics.push({
        code: "TN_IR_RENDERER_LIGHT_PROBE_ID_EMPTY",
        message: "Light probe id must be a non-empty string.",
        path: `${probePath}/id`,
        severity: "error",
      });
    }
    validateTextureSource(probe.source, bundleAssets, `${probePath}/source`, "TN_IR_RENDERER_LIGHT_PROBE", diagnostics);
    validateIntent(probe.intent, `${probePath}/intent`, "TN_IR_RENDERER_LIGHT_PROBE_INTENT_INVALID", diagnostics);
    validateBounds(probe.bounds, `${probePath}/bounds`, diagnostics);
    validatePositiveFinite(probe.influenceRadius, `${probePath}/influenceRadius`, "TN_IR_RENDERER_LIGHT_PROBE_RADIUS_INVALID", diagnostics);
  });

  return diagnostics;
}

function validateTextureSource(
  source: IEnvironmentTextureSourceIr,
  bundleAssets: ReadonlyMap<string, IAssetsManifest["assets"][number]>,
  path: string,
  codePrefix: "TN_IR_RENDERER_ENVIRONMENT_MAP" | "TN_IR_RENDERER_LIGHT_PROBE" | "TN_IR_RENDERER_SKYBOX",
  diagnostics: IIrDiagnostic[],
): void {
  if (source.mode === "equirect") {
    if (typeof source.asset !== "string" || source.asset.trim().length === 0) {
      diagnostics.push({
        code: `${codePrefix}_ASSET_MISSING`,
        message: "Equirect environment texture source must reference a non-empty texture asset id.",
        path: `${path}/asset`,
        severity: "error",
        suggestion: "Reference a bundle-local PNG or JPEG texture asset.",
      });
      return;
    }
    validateTextureAssetRef(source.asset, bundleAssets, `${path}/asset`, codePrefix, diagnostics);
    return;
  }
  if (source.mode === "cubemap") {
    if (typeof source.faces !== "object" || source.faces === null || Array.isArray(source.faces)) {
      diagnostics.push({
        code: `${codePrefix}_FACES_MISSING`,
        message: "Cubemap environment texture source must declare all six face asset ids.",
        path: `${path}/faces`,
        severity: "error",
        suggestion: "Declare positiveX, negativeX, positiveY, negativeY, positiveZ, and negativeZ texture asset ids.",
      });
      return;
    }
    for (const face of ["positiveX", "negativeX", "positiveY", "negativeY", "positiveZ", "negativeZ"] as const) {
      if (typeof source.faces[face] !== "string" || source.faces[face].trim().length === 0) {
        diagnostics.push({
          code: `${codePrefix}_FACE_MISSING`,
          message: `Cubemap face '${face}' must reference a non-empty texture asset id.`,
          path: `${path}/faces/${face}`,
          severity: "error",
          suggestion: "Reference a bundle-local PNG or JPEG texture asset for every cubemap face.",
        });
        continue;
      }
      validateTextureAssetRef(source.faces[face], bundleAssets, `${path}/faces/${face}`, codePrefix, diagnostics);
    }
    return;
  }
  diagnostics.push({
    code: `${codePrefix}_MODE_UNSUPPORTED`,
    message: `Environment texture source uses unsupported mode '${String((source as { mode?: unknown }).mode)}'.`,
    path: `${path}/mode`,
    severity: "error",
    suggestion: "Use 'cubemap' with six bundle-local texture faces or 'equirect' with one bundle-local texture asset.",
  });
}

function validateTextureAssetRef(
  assetId: string,
  bundleAssets: ReadonlyMap<string, IAssetsManifest["assets"][number]>,
  path: string,
  codePrefix: "TN_IR_RENDERER_ENVIRONMENT_MAP" | "TN_IR_RENDERER_LIGHT_PROBE" | "TN_IR_RENDERER_SKYBOX",
  diagnostics: IIrDiagnostic[],
): void {
  const asset = bundleAssets.get(assetId);
  if (asset === undefined) {
    diagnostics.push({
      code: `${codePrefix}_ASSET_MISSING`,
      message: `Environment texture references unknown texture asset '${assetId}'.`,
      path,
      severity: "error",
      suggestion: "Add the texture to assets.manifest.json and keep the referenced file inside the emitted bundle.",
    });
    return;
  }
  if (asset.kind !== "texture" || (asset.format !== "png" && asset.format !== "jpeg" && asset.format !== "webp")) {
    diagnostics.push({
      code: `${codePrefix}_ASSET_FORMAT_UNSUPPORTED`,
      message: `Environment texture '${assetId}' uses unsupported format '${"format" in asset ? String(asset.format) : "unknown"}'.`,
      path,
      severity: "error",
      suggestion: "Use PNG, JPEG, or WebP texture assets for skyboxes, environment maps, and light probes.",
    });
  }
}

function validateIntent(value: unknown, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (value === "reflection" || value === "irradiance" || value === "reflection-and-irradiance") {
    return;
  }
  diagnostics.push({
    code,
    message: "Environment lighting intent must be 'reflection', 'irradiance', or 'reflection-and-irradiance'.",
    path,
    severity: "error",
  });
}

function validateBounds(bounds: { max: Vec3; min: Vec3 }, path: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof bounds !== "object" || bounds === null || !("min" in bounds) || !("max" in bounds) || !Array.isArray(bounds.min) || !Array.isArray(bounds.max)) {
    diagnostics.push({
      code: "TN_IR_RENDERER_LIGHT_PROBE_BOUNDS_INVALID",
      message: "Light probe bounds must declare finite min and max vec3 values.",
      path,
      severity: "error",
      suggestion: "Use bounds: { min: [x, y, z], max: [x, y, z] } with max greater than min on every axis.",
    });
    return;
  }
  validateVec3(bounds.min, `${path}/min`, diagnostics);
  validateVec3(bounds.max, `${path}/max`, diagnostics);
  const hasInvalidAxis = bounds.max[0] <= bounds.min[0] || bounds.max[1] <= bounds.min[1] || bounds.max[2] <= bounds.min[2];
  if (hasInvalidAxis) {
    diagnostics.push({
      code: "TN_IR_RENDERER_LIGHT_PROBE_BOUNDS_INVALID",
      message: "Light probe bounds must use max values greater than min values on every axis.",
      path,
      severity: "error",
      suggestion: "Use finite ordered bounds that enclose the probe influence volume.",
    });
  }
}

function validateColor(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
    return;
  }
  if (Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    return;
  }
  diagnostics.push({ code: "TN_IR_ATMOSPHERE_COLOR_INVALID", message: "Expected a hex color or finite RGB tuple.", path });
}

function validateVec3(value: readonly number[], path: string, diagnostics: IIrDiagnostic[]): void {
  if (value.length !== 3 || value.some((item) => !Number.isFinite(item))) {
    diagnostics.push({ code: "TN_IR_ATMOSPHERE_DIRECTION_INVALID", message: "Expected a finite vec3 value.", path });
  }
}

function validatePositiveFinite(value: unknown, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    diagnostics.push({ code, message: "Expected a positive finite number.", path });
  }
}

function validateOptionalFinite(value: unknown, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
    diagnostics.push({ code, message: "Expected a finite number when declared.", path, severity: "error" });
  }
}

function validateOptionalNonNegativeFinite(value: unknown, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
    diagnostics.push({ code, message: "Expected a non-negative finite number when declared.", path, severity: "error" });
  }
}

function validateOptionalUnitInterval(value: unknown, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)) {
    diagnostics.push({
      code,
      message: "Expected a finite number from 0 through 1 when declared.",
      path,
      severity: "error",
      suggestion: "Clamp the authored value to the inclusive range from 0 through 1.",
    });
  }
}

function validateContactShadowRange(
  value: number,
  minimum: number,
  maximum: number,
  field: "HEIGHT" | "OPACITY" | "SOFTNESS",
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    diagnostics.push({
      code: `TN_IR_CONTACT_SHADOWS_${field}_INVALID`,
      message: `ContactShadows ${field.toLowerCase()} must be a finite number between ${minimum} and ${maximum}.`,
      path,
      severity: "error",
      suggestion: `Use a ${field.toLowerCase()} value in the inclusive range ${minimum}..${maximum}.`,
    });
  }
}
