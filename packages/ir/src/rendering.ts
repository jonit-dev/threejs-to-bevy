import type { IAtmosphereProfileIr } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";

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
  validatePositiveFinite(profile.shadows.maxDistance, `${path}/shadows/maxDistance`, "TN_IR_ATMOSPHERE_SHADOW_DISTANCE_INVALID", diagnostics);
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
