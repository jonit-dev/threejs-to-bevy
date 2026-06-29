import { defineComponent, type IEcsDeclaration } from "./ecs/schema.js";
import { assertNonNegativeNumber, assertPositiveNumber, SdkError } from "./errors.js";

export type StylizedNatureDensity = "low" | "medium" | "high";

export interface IStylizedNatureOptions {
  /** Overall square patch size in world units. */
  size?: number;
  /** Visual density preset. Controls default grass/tree counts. */
  density?: StylizedNatureDensity;
  grassCount?: number;
  treeCount?: number;
  pathWidth?: number;
  windStrength?: number;
  groundColor?: string;
  grassRootColor?: string;
  grassTipColor?: string;
  barkColor?: string;
  leafColor?: string;
  pathColor?: string;
  grassColorMap?: string;
  grassNormalMap?: string;
  grassRoughnessMap?: string;
  dirtColorMap?: string;
  dirtNormalMap?: string;
  dirtRoughnessMap?: string;
  dirtAoMap?: string;
  dirtHeightMap?: string;
  dirtMetallicMap?: string;
  pathMaskMap?: string;
  noiseMap?: string;
  grassModel?: string;
  treeLeavesModel?: string;
  treeTrunkModel?: string;
  leavesAlphaMap?: string;
}

export interface IStylizedNatureComponent {
  barkColor: string;
  density: StylizedNatureDensity;
  grassCount: number;
  grassRootColor: string;
  grassTipColor: string;
  groundColor: string;
  leafColor: string;
  pathColor: string;
  grassColorMap?: string;
  grassNormalMap?: string;
  grassRoughnessMap?: string;
  dirtColorMap?: string;
  dirtNormalMap?: string;
  dirtRoughnessMap?: string;
  dirtAoMap?: string;
  dirtHeightMap?: string;
  dirtMetallicMap?: string;
  pathMaskMap?: string;
  noiseMap?: string;
  grassModel?: string;
  treeLeavesModel?: string;
  treeTrunkModel?: string;
  leavesAlphaMap?: string;
  pathWidth: number;
  size: number;
  treeCount: number;
  windStrength: number;
}

export const StylizedNature = defineComponent("StylizedNature", {
  barkColor: "string",
  density: "string",
  grassCount: "number",
  grassRootColor: "string",
  grassTipColor: "string",
  groundColor: "string",
  leafColor: "string",
  pathColor: "string",
  grassColorMap: "string",
  grassNormalMap: "string",
  grassRoughnessMap: "string",
  dirtColorMap: "string",
  dirtNormalMap: "string",
  dirtRoughnessMap: "string",
  dirtAoMap: "string",
  dirtHeightMap: "string",
  dirtMetallicMap: "string",
  pathMaskMap: "string",
  noiseMap: "string",
  grassModel: "string",
  treeLeavesModel: "string",
  treeTrunkModel: "string",
  leavesAlphaMap: "string",
  pathWidth: "number",
  size: "number",
  treeCount: "number",
  windStrength: "number",
});

export const STYLIZED_NATURE_DENSITY_DEFAULTS: Record<StylizedNatureDensity, { grassCount: number; treeCount: number }> = {
  low: { grassCount: 48, treeCount: 3 },
  medium: { grassCount: 140, treeCount: 6 },
  high: { grassCount: 320, treeCount: 10 },
};

export const STYLIZED_NATURE_AUTHORED_DEFAULTS = {
  barkColor: "#7b4f2f",
  density: "medium" as StylizedNatureDensity,
  grassRootColor: "#5e8f42",
  grassTipColor: "#c8df5f",
  groundColor: "#5c8d45",
  leafColor: "#7fbf45",
  pathColor: "#8b7250",
  pathWidth: 2.4,
  size: 24,
  windStrength: 0.35,
};

export function stylizedNature(options: IStylizedNatureOptions = {}): IEcsDeclaration {
  const density = options.density ?? STYLIZED_NATURE_AUTHORED_DEFAULTS.density;
  const defaults = STYLIZED_NATURE_DENSITY_DEFAULTS[density];
  if (defaults === undefined) {
    throw new SdkError("TN_SDK_STYLIZED_NATURE_DENSITY_INVALID", "StylizedNature density must be 'low', 'medium', or 'high'.");
  }
  const size = options.size ?? STYLIZED_NATURE_AUTHORED_DEFAULTS.size;
  const grassCount = options.grassCount ?? defaults.grassCount;
  const treeCount = options.treeCount ?? defaults.treeCount;
  const pathWidth = options.pathWidth ?? STYLIZED_NATURE_AUTHORED_DEFAULTS.pathWidth;
  const windStrength = options.windStrength ?? STYLIZED_NATURE_AUTHORED_DEFAULTS.windStrength;
  assertPositiveNumber(size, "TN_SDK_STYLIZED_NATURE_SIZE_INVALID", "StylizedNature size");
  assertNonNegativeNumber(grassCount, "TN_SDK_STYLIZED_NATURE_GRASS_COUNT_INVALID", "StylizedNature grassCount");
  assertNonNegativeNumber(treeCount, "TN_SDK_STYLIZED_NATURE_TREE_COUNT_INVALID", "StylizedNature treeCount");
  assertPositiveNumber(pathWidth, "TN_SDK_STYLIZED_NATURE_PATH_WIDTH_INVALID", "StylizedNature pathWidth");
  assertNonNegativeNumber(windStrength, "TN_SDK_STYLIZED_NATURE_WIND_INVALID", "StylizedNature windStrength");
  return StylizedNature({
    barkColor: options.barkColor ?? STYLIZED_NATURE_AUTHORED_DEFAULTS.barkColor,
    density,
    grassCount,
    grassRootColor: options.grassRootColor ?? STYLIZED_NATURE_AUTHORED_DEFAULTS.grassRootColor,
    grassTipColor: options.grassTipColor ?? STYLIZED_NATURE_AUTHORED_DEFAULTS.grassTipColor,
    groundColor: options.groundColor ?? STYLIZED_NATURE_AUTHORED_DEFAULTS.groundColor,
    leafColor: options.leafColor ?? STYLIZED_NATURE_AUTHORED_DEFAULTS.leafColor,
    pathColor: options.pathColor ?? STYLIZED_NATURE_AUTHORED_DEFAULTS.pathColor,
    ...(options.grassColorMap === undefined ? {} : { grassColorMap: options.grassColorMap }),
    ...(options.grassNormalMap === undefined ? {} : { grassNormalMap: options.grassNormalMap }),
    ...(options.grassRoughnessMap === undefined ? {} : { grassRoughnessMap: options.grassRoughnessMap }),
    ...(options.dirtColorMap === undefined ? {} : { dirtColorMap: options.dirtColorMap }),
    ...(options.dirtNormalMap === undefined ? {} : { dirtNormalMap: options.dirtNormalMap }),
    ...(options.dirtRoughnessMap === undefined ? {} : { dirtRoughnessMap: options.dirtRoughnessMap }),
    ...(options.dirtAoMap === undefined ? {} : { dirtAoMap: options.dirtAoMap }),
    ...(options.dirtHeightMap === undefined ? {} : { dirtHeightMap: options.dirtHeightMap }),
    ...(options.dirtMetallicMap === undefined ? {} : { dirtMetallicMap: options.dirtMetallicMap }),
    ...(options.pathMaskMap === undefined ? {} : { pathMaskMap: options.pathMaskMap }),
    ...(options.noiseMap === undefined ? {} : { noiseMap: options.noiseMap }),
    ...(options.grassModel === undefined ? {} : { grassModel: options.grassModel }),
    ...(options.treeLeavesModel === undefined ? {} : { treeLeavesModel: options.treeLeavesModel }),
    ...(options.treeTrunkModel === undefined ? {} : { treeTrunkModel: options.treeTrunkModel }),
    ...(options.leavesAlphaMap === undefined ? {} : { leavesAlphaMap: options.leavesAlphaMap }),
    pathWidth,
    size,
    treeCount,
    windStrength,
  });
}

export interface IRippleWaterOptions {
  size?: number;
  color?: string;
  foamColor?: string;
  waveStrength?: number;
  rippleScale?: number;
  opacity?: number;
  speed?: number;
}

export interface IRippleWaterComponent {
  color: string;
  foamColor: string;
  opacity: number;
  rippleScale: number;
  size: number;
  speed: number;
  waveStrength: number;
}

export const RippleWater = defineComponent("RippleWater", {
  color: "string",
  foamColor: "string",
  opacity: "number",
  rippleScale: "number",
  size: "number",
  speed: "number",
  waveStrength: "number",
});

export function rippleWater(options: IRippleWaterOptions = {}): IEcsDeclaration {
  const size = options.size ?? 7.5;
  const waveStrength = options.waveStrength ?? 0.18;
  const rippleScale = options.rippleScale ?? 5.5;
  const opacity = options.opacity ?? 0.72;
  const speed = options.speed ?? 0.8;
  assertPositiveNumber(size, "TN_SDK_RIPPLE_WATER_SIZE_INVALID", "RippleWater size");
  assertNonNegativeNumber(waveStrength, "TN_SDK_RIPPLE_WATER_WAVE_INVALID", "RippleWater waveStrength");
  assertPositiveNumber(rippleScale, "TN_SDK_RIPPLE_WATER_RIPPLE_SCALE_INVALID", "RippleWater rippleScale");
  assertPositiveNumber(opacity, "TN_SDK_RIPPLE_WATER_OPACITY_INVALID", "RippleWater opacity");
  assertNonNegativeNumber(speed, "TN_SDK_RIPPLE_WATER_SPEED_INVALID", "RippleWater speed");
  return RippleWater({
    color: options.color ?? "#2fb7d3",
    foamColor: options.foamColor ?? "#b8f7ff",
    opacity: Math.min(1, opacity),
    rippleScale,
    size,
    speed,
    waveStrength,
  });
}

export interface IStylizedSparklesOptions {
  count?: number;
  radius?: number;
  height?: number;
  color?: string;
  secondaryColor?: string;
  size?: number;
  speed?: number;
  seed?: number;
}

export interface IStylizedSparklesComponent {
  color: string;
  count: number;
  height: number;
  radius: number;
  secondaryColor: string;
  seed: number;
  size: number;
  speed: number;
}

export const StylizedSparkles = defineComponent("StylizedSparkles", {
  color: "string",
  count: "number",
  height: "number",
  radius: "number",
  secondaryColor: "string",
  seed: "number",
  size: "number",
  speed: "number",
});

export function stylizedSparkles(options: IStylizedSparklesOptions = {}): IEcsDeclaration {
  const count = options.count ?? 96;
  const radius = options.radius ?? 10;
  const height = options.height ?? 3.2;
  const size = options.size ?? 0.08;
  const speed = options.speed ?? 0.45;
  assertNonNegativeNumber(count, "TN_SDK_STYLIZED_SPARKLES_COUNT_INVALID", "StylizedSparkles count");
  assertPositiveNumber(radius, "TN_SDK_STYLIZED_SPARKLES_RADIUS_INVALID", "StylizedSparkles radius");
  assertPositiveNumber(height, "TN_SDK_STYLIZED_SPARKLES_HEIGHT_INVALID", "StylizedSparkles height");
  assertPositiveNumber(size, "TN_SDK_STYLIZED_SPARKLES_SIZE_INVALID", "StylizedSparkles size");
  assertNonNegativeNumber(speed, "TN_SDK_STYLIZED_SPARKLES_SPEED_INVALID", "StylizedSparkles speed");
  return StylizedSparkles({
    color: options.color ?? "#fff3a6",
    count,
    height,
    radius,
    secondaryColor: options.secondaryColor ?? "#89d7ff",
    seed: options.seed ?? 4242,
    size,
    speed,
  });
}
