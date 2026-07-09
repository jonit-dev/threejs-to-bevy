import type { IWorldIr } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";
import { isRecord } from "./validationPrimitives.js";

export function validateRuntimeConfig(config: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(config)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_CONFIG_INVALID",
      message: "Runtime config IR must be a JSON object.",
      path,
      severity: "error",
      suggestion: "Regenerate runtime.config.json from defineRuntimeConfig or remove the manifest reference.",
    });
    return;
  }
  if (config.schema !== "threenative.runtime-config" || config.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_RUNTIME_CONFIG_VERSION_UNSUPPORTED",
      message: "Runtime config IR must use threenative.runtime-config version 0.1.0.",
      path,
    });
  }
  const time = config.time;
  if (!isRecord(time)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_TIME_INVALID",
      message: "Runtime config time must define fixedDelta and paused.",
      path: `${path}/time`,
    });
  } else {
    if (typeof time.fixedDelta !== "number" || !Number.isFinite(time.fixedDelta) || time.fixedDelta <= 0) {
      diagnostics.push({
        code: "TN_IR_RUNTIME_FIXED_DELTA_INVALID",
        message: "Fixed timestep must be a positive finite number.",
        path: `${path}/time/fixedDelta`,
      });
    }
    if (typeof time.paused !== "boolean") {
      diagnostics.push({
        code: "TN_IR_RUNTIME_PAUSED_INVALID",
        message: "Runtime paused flag must be a boolean.",
        path: `${path}/time/paused`,
      });
    }
  }

  const renderer = config.renderer;
  if (renderer !== undefined && !isRecord(renderer)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_RENDERER_INVALID",
      message: "Runtime renderer config must be an object.",
      path: `${path}/renderer`,
    });
  }
  if (isRecord(renderer)) {
    validateUnsupportedRendererFields(renderer, `${path}/renderer`, diagnostics);
  }
  if (isRecord(renderer) && !["none", "msaa2", "msaa4", "msaa8", "fxaa", "taa", "smaa"].includes(renderer.antialias as string)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_RENDERER_ANTIALIAS_INVALID",
      message: "Renderer antialias mode must be one of none, msaa2, msaa4, msaa8, fxaa, taa, or smaa.",
      path: `${path}/renderer/antialias`,
      severity: "error",
      suggestion: "Use a promoted MSAA or post-process antialiasing mode.",
    });
  }
  const bloom = isRecord(renderer) ? renderer.bloom : undefined;
  if (bloom !== undefined) {
    if (!isRecord(bloom)) {
      diagnostics.push({
        code: "TN_IR_RUNTIME_RENDERER_BLOOM_INVALID",
        message: "Renderer bloom config must be an object.",
        path: `${path}/renderer/bloom`,
      });
    } else {
      if (typeof bloom.enabled !== "boolean") {
        diagnostics.push({
          code: "TN_IR_RUNTIME_RENDERER_BLOOM_INVALID",
          message: "Renderer bloom enabled must be a boolean.",
          path: `${path}/renderer/bloom/enabled`,
        });
      }
      if (typeof bloom.intensity !== "number" || !Number.isFinite(bloom.intensity) || bloom.intensity < 0) {
        diagnostics.push({
          code: "TN_IR_RUNTIME_RENDERER_BLOOM_INVALID",
          message: "Renderer bloom intensity must be a non-negative finite number.",
          path: `${path}/renderer/bloom/intensity`,
        });
      }
      if (typeof bloom.threshold !== "number" || !Number.isFinite(bloom.threshold) || bloom.threshold < 0) {
        diagnostics.push({
          code: "TN_IR_RUNTIME_RENDERER_BLOOM_INVALID",
          message: "Renderer bloom threshold must be a non-negative finite number.",
          path: `${path}/renderer/bloom/threshold`,
        });
      }
    }
  }
  const ambientOcclusion = isRecord(renderer) ? renderer.ambientOcclusion : undefined;
  if (ambientOcclusion !== undefined) {
    validateAmbientOcclusion(ambientOcclusion, `${path}/renderer/ambientOcclusion`, diagnostics);
  }
  const renderPath = isRecord(renderer) ? renderer.renderPath : undefined;
  if (renderPath !== undefined && renderPath !== "forward") {
    diagnostics.push({
      code: "TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED",
      limit: RENDERER_ADVANCED_PROMOTION_EVIDENCE.deferred,
      message: "Runtime renderer renderPath only supports 'forward' in V9; deferred rendering is explicitly unsupported.",
      path: `${path}/renderer/renderPath`,
      severity: "error",
      suggestion: rendererAdvancedSuggestion("deferred"),
      target: "web,bevy",
      value: typeof renderPath === "string" ? renderPath : undefined,
    });
  }
  const renderLook = isRecord(renderer) ? renderer.renderLook : undefined;
  if (renderLook !== undefined) {
    validateRenderLook(renderLook, `${path}/renderer/renderLook`, diagnostics);
  }
  const colorGrading = isRecord(renderer) ? renderer.colorGrading : undefined;
  if (colorGrading !== undefined) {
    validateColorGrading(colorGrading, `${path}/renderer/colorGrading`, diagnostics);
  }
  const depthOfField = isRecord(renderer) ? renderer.depthOfField : undefined;
  if (depthOfField !== undefined) {
    validateDepthOfField(depthOfField, `${path}/renderer/depthOfField`, diagnostics);
  }
  const screenSpaceReflections = isRecord(renderer) ? renderer.screenSpaceReflections : undefined;
  if (screenSpaceReflections !== undefined) {
    validateScreenSpaceReflections(screenSpaceReflections, `${path}/renderer/screenSpaceReflections`, diagnostics);
  }
  const motionBlur = isRecord(renderer) ? renderer.motionBlur : undefined;
  if (motionBlur !== undefined) {
    validateMotionBlur(motionBlur, `${path}/renderer/motionBlur`, diagnostics);
  }
  const screenSpaceGlobalIllumination = isRecord(renderer) ? renderer.screenSpaceGlobalIllumination : undefined;
  if (screenSpaceGlobalIllumination !== undefined) {
    validateScreenSpaceGlobalIllumination(screenSpaceGlobalIllumination, `${path}/renderer/screenSpaceGlobalIllumination`, diagnostics);
  }

  const window = config.window;
  if (!isRecord(window)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_WINDOW_INVALID",
      message: "Runtime config window must define width and height.",
      path: `${path}/window`,
    });
  } else {
    if (typeof window.width !== "number" || !Number.isFinite(window.width) || window.width <= 0) {
      diagnostics.push({
        code: "TN_IR_RUNTIME_WINDOW_INVALID",
        message: "Window width must be a positive finite number.",
        path: `${path}/window/width`,
      });
    }
    if (typeof window.height !== "number" || !Number.isFinite(window.height) || window.height <= 0) {
      diagnostics.push({
        code: "TN_IR_RUNTIME_WINDOW_INVALID",
        message: "Window height must be a positive finite number.",
        path: `${path}/window/height`,
      });
    }
    if (window.title !== undefined && (typeof window.title !== "string" || window.title.length === 0)) {
      diagnostics.push({
        code: "TN_IR_RUNTIME_WINDOW_INVALID",
        message: "Window title must be a non-empty string when present.",
        path: `${path}/window/title`,
      });
    }
  }
}

function validateUnsupportedRendererFields(renderer: Record<string, unknown>, path: string, diagnostics: IIrDiagnostic[]): void {
  const supported = new Set([
    "ambientOcclusion",
    "antialias",
    "bloom",
    "colorGrading",
    "depthOfField",
    "motionBlur",
    "renderLook",
    "renderPath",
    "screenSpaceGlobalIllumination",
    "screenSpaceReflections",
  ]);
  const advanced = new Map<string, string>([
    ["autoExposure", "Auto exposure is explicitly deferred in V9."],
    ["customPasses", "Custom post-processing passes are explicitly deferred in V9."],
    ["customPostPasses", "Custom post-processing passes are explicitly deferred in V9."],
    ["decals", "Decals are diagnostic-only until both runtimes prove a portable mapping."],
    ["deferred", "Deferred rendering is explicitly deferred in V9; use renderPath: 'forward'."],
    ["mirror", "Screen-space reflections and mirrors are explicitly deferred in V9."],
    ["mirrors", "Screen-space reflections and mirrors are explicitly deferred in V9."],
    ["motionVectors", "Motion blur and motion vectors are explicitly deferred in V9."],
    ["ssr", "Screen-space reflections and mirrors are explicitly deferred in V9."],
    ["virtualGeometry", "Virtual geometry and meshlets are explicitly deferred in V9."],
    ["volumetricFog", "Volumetric fog and lighting are explicitly deferred in V9."],
    ["volumetricLighting", "Volumetric fog and lighting are explicitly deferred in V9."],
  ]);
  for (const key of Object.keys(renderer)) {
    if (supported.has(key)) {
      continue;
    }
    diagnostics.push({
      code: advanced.has(key) ? "TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED" : "TN_IR_RENDERER_POST_EFFECT_UNSUPPORTED",
      ...(advanced.has(key) ? { limit: RENDERER_ADVANCED_PROMOTION_EVIDENCE[rendererAdvancedBoundary(key)] } : {}),
      message: advanced.get(key) ?? `Runtime renderer field '${key}' is not promoted in V9.`,
      path: `${path}/${key}`,
      severity: "error",
      suggestion: advanced.has(key)
        ? rendererAdvancedSuggestion(rendererAdvancedBoundary(key))
        : "Remove the field or wait for a PRD that promotes it with cross-runtime evidence.",
      ...(advanced.has(key) ? { target: "web,bevy" } : {}),
    });
  }
}

function validateAmbientOcclusion(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({
      code: "TN_RENDER_FEATURE_UNSUPPORTED",
      message: "Renderer ambientOcclusion config must be an object.",
      path,
      severity: "error",
      suggestion: "Use ambientOcclusion with enabled, mode: 'screen-space', radius, intensity, and quality.",
    });
    return;
  }
  validateEnabled(value.enabled, `${path}/enabled`, "ambientOcclusion", diagnostics);
  if (value.mode !== "screen-space") {
    diagnostics.push({
      code: "TN_RENDER_FEATURE_UNSUPPORTED",
      limit: ["screen-space"],
      message: "Renderer ambientOcclusion mode must be 'screen-space'.",
      path: `${path}/mode`,
      severity: "error",
      suggestion: "Use the portable screen-space ambient occlusion mode.",
      value: typeof value.mode === "string" ? value.mode : undefined,
    });
  }
  validateNumberRange(value.radius, `${path}/radius`, "ambientOcclusion radius", 0, 16, diagnostics);
  validateNumberRange(value.intensity, `${path}/intensity`, "ambientOcclusion intensity", 0, 4, diagnostics);
  validateQuality(value.quality, `${path}/quality`, diagnostics);
}

function validateScreenSpaceReflections(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({
      code: "TN_RENDER_FEATURE_UNSUPPORTED",
      message: "Renderer screenSpaceReflections config must be an object.",
      path,
      severity: "error",
      suggestion: "Use screenSpaceReflections with enabled, quality, and roughnessLimit.",
    });
    return;
  }
  validateEnabled(value.enabled, `${path}/enabled`, "screenSpaceReflections", diagnostics);
  validateQuality(value.quality, `${path}/quality`, diagnostics);
  validateNumberRange(value.roughnessLimit, `${path}/roughnessLimit`, "screenSpaceReflections roughnessLimit", 0, 1, diagnostics);
}

function validateMotionBlur(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({
      code: "TN_RENDER_FEATURE_UNSUPPORTED",
      message: "Renderer motionBlur config must be an object.",
      path,
      severity: "error",
      suggestion: "Use motionBlur with enabled and shutterAngle.",
    });
    return;
  }
  validateEnabled(value.enabled, `${path}/enabled`, "motionBlur", diagnostics);
  validateNumberRange(value.shutterAngle, `${path}/shutterAngle`, "motionBlur shutterAngle", 0, 1, diagnostics);
}

function validateScreenSpaceGlobalIllumination(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({
      code: "TN_RENDER_FEATURE_UNSUPPORTED",
      message: "Renderer screenSpaceGlobalIllumination config must be an object.",
      path,
      severity: "error",
      suggestion: "Use screenSpaceGlobalIllumination with enabled and quality.",
    });
    return;
  }
  validateEnabled(value.enabled, `${path}/enabled`, "screenSpaceGlobalIllumination", diagnostics);
  if (value.quality !== "low" && value.quality !== "medium") {
    diagnostics.push({
      code: "TN_RENDER_FEATURE_UNSUPPORTED",
      limit: ["low", "medium"],
      message: "Renderer screenSpaceGlobalIllumination quality must be low or medium.",
      path: `${path}/quality`,
      severity: "error",
      suggestion: "Use low or medium until high-quality SSGI has cross-runtime proof.",
      value: typeof value.quality === "string" ? value.quality : undefined,
    });
  }
}

function validateEnabled(value: unknown, path: string, feature: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "boolean") {
    diagnostics.push({
      code: "TN_RENDER_FEATURE_UNSUPPORTED",
      message: `Renderer ${feature} enabled must be a boolean.`,
      path,
      severity: "error",
      suggestion: `Set ${feature}.enabled to true or false.`,
    });
  }
}

function validateQuality(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value !== "low" && value !== "medium" && value !== "high") {
    diagnostics.push({
      code: "TN_RENDER_FEATURE_UNSUPPORTED",
      limit: ["low", "medium", "high"],
      message: "Renderer feature quality must be low, medium, or high.",
      path,
      severity: "error",
      suggestion: "Use a promoted portable quality value.",
      value: typeof value === "string" ? value : undefined,
    });
  }
}

function validateNumberRange(
  value: unknown,
  path: string,
  label: string,
  minimum: number,
  maximum: number,
  diagnostics: IIrDiagnostic[],
): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    diagnostics.push({
      code: "TN_RENDER_FEATURE_UNSUPPORTED",
      limit: maximum,
      message: `Renderer ${label} must be a finite number from ${minimum} to ${maximum}.`,
      path,
      severity: "error",
      suggestion: `Use ${label} in the supported range ${minimum}..${maximum}.`,
      value: typeof value === "number" ? value : undefined,
    });
  }
}

const RENDERER_ADVANCED_PROMOTION_EVIDENCE = {
  autoExposure: ["deterministic histogram policy", "web/native exposure convergence report", "mobile fallback budget"],
  customPost: ["finite portable effect catalog", "shader/resource binding contract", "web/native screenshot evidence"],
  decals: ["surface-aligned authoring semantics", "depth sorting policy", "web/native screenshot evidence"],
  deferred: ["forward-renderer fallback", "target-profile render-path policy", "web/native screenshot evidence"],
  motion: ["shutter/sample semantics", "motion-vector or authored approximation policy", "video/screenshot proof"],
  reflections: ["material/reflection intent contract", "non-SSR fallback tier", "web/native screenshot evidence"],
  virtualGeometry: ["meshlet/LOD authoring contract", "runtime memory budget", "web/native performance proof"],
  volumetrics: ["density/scattering profile", "participating-light limits", "web/native performance and screenshot proof"],
} as const satisfies Record<string, readonly string[]>;

type RendererAdvancedBoundary = keyof typeof RENDERER_ADVANCED_PROMOTION_EVIDENCE;

function rendererAdvancedBoundary(key: string): RendererAdvancedBoundary {
  if (key === "autoExposure") {
    return "autoExposure";
  }
  if (key === "customPasses" || key === "customPostPasses") {
    return "customPost";
  }
  if (key === "decals") {
    return "decals";
  }
  if (key === "deferred") {
    return "deferred";
  }
  if (key === "motionBlur" || key === "motionVectors") {
    return "motion";
  }
  if (key === "screenSpaceReflections" || key === "ssr" || key === "mirror" || key === "mirrors") {
    return "reflections";
  }
  if (key === "virtualGeometry") {
    return "virtualGeometry";
  }
  if (key === "volumetricFog" || key === "volumetricLighting") {
    return "volumetrics";
  }
  return "customPost";
}

function rendererAdvancedSuggestion(boundary: RendererAdvancedBoundary): string {
  const evidence = RENDERER_ADVANCED_PROMOTION_EVIDENCE[boundary].join(", ");
  return `Remove the field or keep the visual intent in authored materials/camera data until promotion provides ${evidence}.`;
}

const PROMOTED_RENDER_LOOK_PROFILES = new Set(["parity", "balanced", "cinematic", "stylized"]);
const RENDER_LOOK_OVERRIDE_RANGES = {
  bloomIntensity: [0, 2],
  contrast: [-0.5, 0.5],
  environmentIntensity: [0, 4],
  exposure: [0.25, 4],
  saturation: [0, 2],
} as const;

function validateRenderLook(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({
      code: "TN_RENDER_PROFILE_UNSUPPORTED",
      message: "Renderer renderLook must be a portable profile object.",
      path,
      severity: "error",
      suggestion: "Use { version: 1, profile: 'parity' | 'balanced' | 'cinematic' | 'stylized' }.",
    });
    return;
  }

  if (value.version !== 1) {
    diagnostics.push({
      code: "TN_RENDER_PROFILE_UNSUPPORTED",
      message: "Renderer renderLook must use version 1.",
      path: `${path}/version`,
      severity: "error",
      suggestion: "Use renderLook.version: 1.",
    });
  }

  const profile = value.profile;
  if (typeof profile !== "string" || !PROMOTED_RENDER_LOOK_PROFILES.has(profile)) {
    diagnostics.push({
      code: "TN_RENDER_PROFILE_UNSUPPORTED",
      limit: ["parity", "balanced", "cinematic", "stylized"],
      message: "Renderer renderLook profile must be a promoted portable profile.",
      path: `${path}/profile`,
      severity: "error",
      suggestion: "Use 'parity' for deterministic conformance, 'balanced' for conservative polish, 'cinematic' for the default filmic look, or 'stylized' for saturated/toon-leaning scenes.",
      value: typeof profile === "string" ? profile : undefined,
    });
  }

  const overrides = value.overrides;
  if (overrides !== undefined) {
    if (!isRecord(overrides)) {
      diagnostics.push({
        code: "TN_RENDER_LOOK_OUT_OF_RANGE",
        message: "Renderer renderLook overrides must be an object.",
        path: `${path}/overrides`,
        severity: "error",
        suggestion: "Use bounded numeric overrides or omit overrides.",
      });
    } else {
      validateRenderLookOverrides(overrides, `${path}/overrides`, diagnostics);
    }
  }

  for (const key of Object.keys(value)) {
    if (key === "version" || key === "profile" || key === "overrides") {
      continue;
    }
    diagnostics.push({
      code: "TN_RENDER_PROFILE_UNSUPPORTED",
      message: `Renderer renderLook field '${key}' is not portable profile data.`,
      path: `${path}/${key}`,
      severity: "error",
      suggestion: "Remove renderer-specific renderLook payloads; use promoted profile names and bounded overrides only.",
    });
  }
}

function validateRenderLookOverrides(overrides: Record<string, unknown>, path: string, diagnostics: IIrDiagnostic[]): void {
  for (const key of Object.keys(overrides)) {
    if (!(key in RENDER_LOOK_OVERRIDE_RANGES) && key !== "shadowQuality") {
      diagnostics.push({
        code: "TN_RENDER_PROFILE_UNSUPPORTED",
        message: `Renderer renderLook override '${key}' is not portable.`,
        path: `${path}/${key}`,
        severity: "error",
        suggestion: "Use exposure, contrast, saturation, bloomIntensity, shadowQuality, or environmentIntensity.",
      });
      continue;
    }
    if (key === "shadowQuality") {
      const quality = overrides.shadowQuality;
      if (!["off", "low", "medium", "high"].includes(quality as string)) {
        diagnostics.push({
          code: "TN_RENDER_LOOK_OUT_OF_RANGE",
          limit: ["off", "low", "medium", "high"],
          message: "Renderer renderLook shadowQuality must be off, low, medium, or high.",
          path: `${path}/shadowQuality`,
          severity: "error",
          suggestion: "Use a promoted portable shadow quality value.",
          value: typeof quality === "string" ? quality : undefined,
        });
      }
      continue;
    }
    const [minimum, maximum] = RENDER_LOOK_OVERRIDE_RANGES[key as keyof typeof RENDER_LOOK_OVERRIDE_RANGES];
    const overrideValue = overrides[key];
    if (typeof overrideValue !== "number" || !Number.isFinite(overrideValue) || overrideValue < minimum || overrideValue > maximum) {
      diagnostics.push({
        code: "TN_RENDER_LOOK_OUT_OF_RANGE",
        limit: maximum,
        message: `Renderer renderLook ${key} must be a finite number from ${minimum} to ${maximum}.`,
        path: `${path}/${key}`,
        severity: "error",
        suggestion: `Use ${key} in the supported range ${minimum}..${maximum}.`,
        value: typeof overrideValue === "number" ? overrideValue : undefined,
      });
    }
  }
}

function validateColorGrading(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_RENDERER_COLOR_GRADING_INVALID",
      message: "Renderer colorGrading config must be an object.",
      path,
      severity: "error",
      suggestion: "Use a colorGrading object with portable numeric controls.",
    });
    return;
  }
  const toneMapping = value.toneMapping;
  if (toneMapping !== undefined && !["aces", "linear", "none", "reinhard"].includes(toneMapping as string)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_RENDERER_COLOR_GRADING_INVALID",
      message: "Renderer toneMapping must be one of aces, linear, none, or reinhard.",
      path: `${path}/toneMapping`,
      severity: "error",
    });
  }
  for (const key of ["contrast", "temperature", "tint"] as const) {
    if (value[key] !== undefined && (typeof value[key] !== "number" || !Number.isFinite(value[key]))) {
      diagnostics.push({
        code: "TN_IR_RUNTIME_RENDERER_COLOR_GRADING_INVALID",
        message: `Renderer colorGrading ${key} must be finite.`,
        path: `${path}/${key}`,
        severity: "error",
      });
    }
  }
  if (value.exposure !== undefined && (typeof value.exposure !== "number" || !Number.isFinite(value.exposure) || value.exposure <= 0)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_RENDERER_COLOR_GRADING_INVALID",
      message: "Renderer colorGrading exposure must be positive and finite.",
      path: `${path}/exposure`,
      severity: "error",
    });
  }
  if (value.saturation !== undefined && (typeof value.saturation !== "number" || !Number.isFinite(value.saturation) || value.saturation < 0)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_RENDERER_COLOR_GRADING_INVALID",
      message: "Renderer colorGrading saturation must be non-negative and finite.",
      path: `${path}/saturation`,
      severity: "error",
    });
  }
  if (value.lut !== undefined && (typeof value.lut !== "string" || value.lut.trim().length === 0)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_RENDERER_COLOR_GRADING_INVALID",
      message: "Renderer colorGrading LUT must reference a non-empty bundle asset id.",
      path: `${path}/lut`,
      severity: "error",
    });
  }
}

function validateDepthOfField(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_RENDERER_DOF_INVALID",
      message: "Renderer depthOfField config must be an object.",
      path,
      severity: "error",
      suggestion: "Use depthOfField with enabled, focusDistance, aperture, and maxBlur.",
    });
    return;
  }
  if (typeof value.enabled !== "boolean") {
    diagnostics.push({
      code: "TN_IR_RUNTIME_RENDERER_DOF_INVALID",
      message: "Renderer depthOfField enabled must be a boolean.",
      path: `${path}/enabled`,
      severity: "error",
      suggestion: "Set depthOfField.enabled to true or false.",
    });
  }
  if (typeof value.focusDistance !== "number" || !Number.isFinite(value.focusDistance) || value.focusDistance <= 0) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_RENDERER_DOF_INVALID",
      message: "Renderer depthOfField focusDistance must be a positive finite number.",
      path: `${path}/focusDistance`,
      severity: "error",
      suggestion: "Use a positive scene-space focus distance.",
    });
  }
  for (const key of ["aperture", "maxBlur"] as const) {
    const fieldValue = value[key];
    if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue) || fieldValue < 0) {
      diagnostics.push({
        code: "TN_IR_RUNTIME_RENDERER_DOF_INVALID",
        message: `Renderer depthOfField ${key} must be a non-negative finite number.`,
        path: `${path}/${key}`,
        severity: "error",
        suggestion: `Use a non-negative finite ${key} value.`,
      });
    }
  }
}

export function validateRenderingLightBudget(value: unknown, path: string, diagnostics: IIrDiagnostic[], entities: IWorldIr["entities"]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({
      code: "TN_IR_LIGHT_BUDGET_INVALID",
      message: "RenderingLightBudget resource must be an object.",
      path,
      severity: "error",
      suggestion: "Use maximumVisibleDynamicLights, maximumShadowedPointLights, cullingPolicy, and overBudgetSeverity.",
    });
    return;
  }
  validateNonNegativeInteger(value.maximumVisibleDynamicLights, `${path}/maximumVisibleDynamicLights`, diagnostics);
  validateNonNegativeInteger(value.maximumShadowedPointLights, `${path}/maximumShadowedPointLights`, diagnostics);
  if (value.cullingPolicy !== "nearest" && value.cullingPolicy !== "none") {
    diagnostics.push({
      code: "TN_IR_LIGHT_BUDGET_INVALID",
      message: "RenderingLightBudget cullingPolicy must be 'nearest' or 'none'.",
      path: `${path}/cullingPolicy`,
      severity: "error",
      suggestion: "Use nearest for deterministic culling, or none for diagnostics-only budget reporting.",
    });
  }
  if (value.overBudgetSeverity !== "error" && value.overBudgetSeverity !== "warning") {
    diagnostics.push({
      code: "TN_IR_LIGHT_BUDGET_INVALID",
      message: "RenderingLightBudget overBudgetSeverity must be 'warning' or 'error'.",
      path: `${path}/overBudgetSeverity`,
      severity: "error",
    });
  }
  if (
    value.overBudgetSeverity === "error" &&
    typeof value.maximumVisibleDynamicLights === "number" &&
    Number.isInteger(value.maximumVisibleDynamicLights) &&
    value.maximumVisibleDynamicLights >= 0 &&
    typeof value.maximumShadowedPointLights === "number" &&
    Number.isInteger(value.maximumShadowedPointLights) &&
    value.maximumShadowedPointLights >= 0
  ) {
    const dynamicLights = entities.filter((entity) => entity.components.Light !== undefined);
    const shadowedPointLights = dynamicLights.filter((entity) => {
      const light = entity.components.Light;
      return light?.kind === "point" && light.shadowFilter !== undefined;
    });
    if (dynamicLights.length > value.maximumVisibleDynamicLights || shadowedPointLights.length > value.maximumShadowedPointLights) {
      diagnostics.push({
        code: "TN_IR_LIGHT_BUDGET_EXCEEDED",
        limit: [`maximumVisibleDynamicLights=${value.maximumVisibleDynamicLights}`, `maximumShadowedPointLights=${value.maximumShadowedPointLights}`],
        message: "RenderingLightBudget is exceeded by authored dynamic lights.",
        path,
        severity: "error",
        suggestion: "Reduce dynamic or shadowed point lights, raise the budget, or use overBudgetSeverity: 'warning' for reporting-only fixtures.",
        value: `dynamicLights=${dynamicLights.length}; shadowedPointLights=${shadowedPointLights.length}`,
      });
    }
  }
}

function validateNonNegativeInteger(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    diagnostics.push({
      code: "TN_IR_LIGHT_BUDGET_INVALID",
      message: "RenderingLightBudget counts must be non-negative integers.",
      path,
      severity: "error",
    });
  }
}
