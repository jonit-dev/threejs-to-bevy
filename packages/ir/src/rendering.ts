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
  const volumetrics = profile.volumetrics as unknown;
  if (volumetrics !== undefined && !isRecord(volumetrics)) {
    diagnostics.push({
      code: "TN_IR_ATMOSPHERE_VOLUMETRICS_INVALID",
      message: "Atmosphere volumetrics must be an object when declared.",
      path: `${path}/volumetrics`,
      severity: "error",
      suggestion: "Declare optional heightFog and godRays objects under volumetrics.",
    });
    return diagnostics;
  }
  const heightFog = isRecord(volumetrics) ? volumetrics.heightFog : undefined;
  if (heightFog !== undefined && !isRecord(heightFog)) {
    diagnostics.push({
      code: "TN_IR_ATMOSPHERE_VOLUMETRICS_HEIGHT_FOG_INVALID",
      message: "Volumetric heightFog must be an object when declared.",
      path: `${path}/volumetrics/heightFog`,
      severity: "error",
    });
  } else if (isRecord(heightFog)) {
    validateBoolean(heightFog.enabled, `${path}/volumetrics/heightFog/enabled`, "TN_IR_ATMOSPHERE_VOLUMETRICS_HEIGHT_FOG_ENABLED_INVALID", diagnostics);
    validateUnitInterval(
      heightFog.density,
      `${path}/volumetrics/heightFog/density`,
      "TN_IR_ATMOSPHERE_VOLUMETRICS_HEIGHT_FOG_DENSITY_INVALID",
      diagnostics,
    );
    validatePositiveFinite(
      heightFog.falloffHeight,
      `${path}/volumetrics/heightFog/falloffHeight`,
      "TN_IR_ATMOSPHERE_VOLUMETRICS_HEIGHT_FOG_FALLOFF_HEIGHT_INVALID",
      diagnostics,
    );
    if (!Number.isFinite(heightFog.baseHeight)) {
      diagnostics.push({
        code: "TN_IR_ATMOSPHERE_VOLUMETRICS_HEIGHT_FOG_BASE_HEIGHT_INVALID",
        message: "Volumetric height fog baseHeight must be finite.",
        path: `${path}/volumetrics/heightFog/baseHeight`,
        severity: "error",
        suggestion: "Use a finite world-space Y coordinate for baseHeight.",
      });
    }
    if (heightFog.color !== undefined) {
      validateColor(heightFog.color, `${path}/volumetrics/heightFog/color`, diagnostics);
    }
  }
  const godRays = isRecord(volumetrics) ? volumetrics.godRays : undefined;
  if (godRays !== undefined && !isRecord(godRays)) {
    diagnostics.push({
      code: "TN_IR_ATMOSPHERE_VOLUMETRICS_GOD_RAYS_INVALID",
      message: "Volumetric godRays must be an object when declared.",
      path: `${path}/volumetrics/godRays`,
      severity: "error",
    });
  } else if (isRecord(godRays)) {
    validateBoolean(godRays.enabled, `${path}/volumetrics/godRays/enabled`, "TN_IR_ATMOSPHERE_VOLUMETRICS_GOD_RAYS_ENABLED_INVALID", diagnostics);
    validateRange(godRays.intensity, 0, 2, `${path}/volumetrics/godRays/intensity`, "TN_IR_ATMOSPHERE_VOLUMETRICS_GOD_RAYS_INTENSITY_INVALID", diagnostics);
    validateUnitInterval(godRays.density, `${path}/volumetrics/godRays/density`, "TN_IR_ATMOSPHERE_VOLUMETRICS_GOD_RAYS_DENSITY_INVALID", diagnostics);
    validatePositiveFinite(godRays.maxDistance, `${path}/volumetrics/godRays/maxDistance`, "TN_IR_ATMOSPHERE_VOLUMETRICS_GOD_RAYS_MAX_DISTANCE_INVALID", diagnostics);
    if (typeof godRays.quality !== "string" || !["low", "medium", "high"].includes(godRays.quality)) {
      diagnostics.push({
        code: "TN_IR_ATMOSPHERE_VOLUMETRICS_GOD_RAYS_QUALITY_INVALID",
        message: "Volumetric god-ray quality must be 'low', 'medium', or 'high'.",
        path: `${path}/volumetrics/godRays/quality`,
        severity: "error",
        suggestion: "Use a bounded quality tier: 'low', 'medium', or 'high'.",
      });
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
    if (isRecord(probe.source) && isBakedProbeSource(probe.source)) {
      validateBakedProbePayload(probe.source, `${probePath}/source`, diagnostics);
    } else {
      validateTextureSource(probe.source as IEnvironmentTextureSourceIr, bundleAssets, `${probePath}/source`, "TN_IR_RENDERER_LIGHT_PROBE", diagnostics);
    }
    validateIntent(probe.intent, `${probePath}/intent`, "TN_IR_RENDERER_LIGHT_PROBE_INTENT_INVALID", diagnostics);
    validateBounds(probe.bounds, `${probePath}/bounds`, diagnostics);
    validatePositiveFinite(probe.influenceRadius, `${probePath}/influenceRadius`, "TN_IR_RENDERER_LIGHT_PROBE_RADIUS_INVALID", diagnostics);
  });

  return diagnostics;
}

function isBakedProbeSource(source: Record<string, unknown>): boolean {
  return ["bakeVersion", "coefficients", "format", "sceneContentHash"].some((key) => key in source);
}

function validateBakedProbePayload(source: Record<string, unknown>, path: string, diagnostics: IIrDiagnostic[]): void {
  if (source.format !== "sh2") {
    diagnostics.push({
      code: "TN_IR_LIGHT_PROBE_BAKE_FORMAT_INVALID",
      message: "Baked light probe format must be 'sh2'.",
      path: `${path}/format`,
      severity: "error",
      suggestion: "Regenerate the probe with 'tn bake gi'.",
    });
  }
  if (source.bakeVersion !== 1) {
    diagnostics.push({
      code: "TN_IR_LIGHT_PROBE_BAKE_VERSION_INVALID",
      message: "Baked light probe bakeVersion must be 1.",
      path: `${path}/bakeVersion`,
      severity: "error",
      suggestion: "Regenerate the probe with the current 'tn bake gi' command.",
    });
  }
  if (!Array.isArray(source.coefficients) || source.coefficients.length !== 27 || source.coefficients.some((coefficient) => typeof coefficient !== "number" || !Number.isFinite(coefficient))) {
    diagnostics.push({
      code: "TN_IR_LIGHT_PROBE_BAKE_COEFFICIENTS_INVALID",
      message: "Baked SH2 light probes require exactly 27 finite RGB coefficients.",
      path: `${path}/coefficients`,
      severity: "error",
      suggestion: "Regenerate all 9 RGB SH2 coefficients with 'tn bake gi'.",
    });
  }
  if (typeof source.sceneContentHash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(source.sceneContentHash)) {
    diagnostics.push({
      code: "TN_IR_LIGHT_PROBE_BAKE_CONTENT_HASH_INVALID",
      message: "Baked light probe sceneContentHash must be a lowercase sha256 digest.",
      path: `${path}/sceneContentHash`,
      severity: "error",
      suggestion: "Regenerate the probe with 'tn bake gi' so staleness can be detected.",
    });
  }
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

function validateUnitInterval(value: unknown, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    diagnostics.push({
      code,
      message: "Expected a finite number from 0 through 1.",
      path,
      severity: "error",
      suggestion: "Clamp the authored value to the inclusive range from 0 through 1.",
    });
  }
}

function validateBoolean(value: unknown, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "boolean") {
    diagnostics.push({ code, message: "Expected a boolean value.", path, severity: "error" });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateRange(
  value: unknown,
  minimum: number,
  maximum: number,
  path: string,
  code: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    diagnostics.push({
      code,
      message: `Expected a finite number from ${minimum} through ${maximum}.`,
      path,
      severity: "error",
      suggestion: `Clamp the authored value to the inclusive range from ${minimum} through ${maximum}.`,
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
