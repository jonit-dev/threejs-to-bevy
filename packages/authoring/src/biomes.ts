export const WORLD_BIOME_IDS = ["meadow", "forest", "desert", "canyon", "arctic"] as const;

export type WorldBiomeId = typeof WORLD_BIOME_IDS[number];

export interface IWorldBiomeDefinition {
  atmosphere: {
    fogColor: string;
    fogDensity: number;
    skyColor: string;
  };
  boundaryStyle: string;
  flattenRadius: number;
  heightRange: {
    max: number;
    min: number;
  };
  id: WorldBiomeId;
  scatter: Array<{
    assetQuery: string;
    category: "grass" | "rock" | "tree";
    density: number;
    maxScale: number;
    maxSlope: number;
    minScale: number;
  }>;
  splatQueries: string[];
}

export const WORLD_BIOMES: Record<WorldBiomeId, IWorldBiomeDefinition> = {
  arctic: {
    atmosphere: { fogColor: "#dbeafe", fogDensity: 0.018, skyColor: "#c7d2fe" },
    boundaryStyle: "snow-drift fog wall",
    flattenRadius: 26,
    heightRange: { max: 3.2, min: -0.4 },
    id: "arctic",
    scatter: [
      { assetQuery: "rock snow", category: "rock", density: 0.006, maxScale: 1.8, maxSlope: 38, minScale: 0.8 },
    ],
    splatQueries: ["snow", "rock", "gravel"],
  },
  canyon: {
    atmosphere: { fogColor: "#f6d7a7", fogDensity: 0.014, skyColor: "#f9c97f" },
    boundaryStyle: "perimeter cliffs and dust haze",
    flattenRadius: 30,
    heightRange: { max: 6, min: -1.5 },
    id: "canyon",
    scatter: [
      { assetQuery: "rock", category: "rock", density: 0.012, maxScale: 2.5, maxSlope: 55, minScale: 0.9 },
    ],
    splatQueries: ["rock", "ground", "gravel"],
  },
  desert: {
    atmosphere: { fogColor: "#f5d49b", fogDensity: 0.01, skyColor: "#ffe1a8" },
    boundaryStyle: "sand berm and heat haze",
    flattenRadius: 34,
    heightRange: { max: 2.8, min: -0.8 },
    id: "desert",
    scatter: [
      { assetQuery: "rock desert", category: "rock", density: 0.007, maxScale: 1.7, maxSlope: 32, minScale: 0.7 },
    ],
    splatQueries: ["sand", "ground", "gravel"],
  },
  forest: {
    atmosphere: { fogColor: "#88a17d", fogDensity: 0.022, skyColor: "#a7c7a1" },
    boundaryStyle: "tree line and low mist",
    flattenRadius: 28,
    heightRange: { max: 4.5, min: -0.8 },
    id: "forest",
    scatter: [
      { assetQuery: "tree", category: "tree", density: 0.018, maxScale: 2.2, maxSlope: 28, minScale: 1 },
      { assetQuery: "rock", category: "rock", density: 0.006, maxScale: 1.4, maxSlope: 38, minScale: 0.7 },
    ],
    splatQueries: ["moss", "grass", "ground", "rock"],
  },
  meadow: {
    atmosphere: { fogColor: "#b7d8b0", fogDensity: 0.012, skyColor: "#bfe6ff" },
    boundaryStyle: "soft hills and grass horizon",
    flattenRadius: 32,
    heightRange: { max: 3.4, min: -0.5 },
    id: "meadow",
    scatter: [
      { assetQuery: "grass", category: "grass", density: 0.025, maxScale: 1.2, maxSlope: 26, minScale: 0.6 },
      { assetQuery: "rock", category: "rock", density: 0.004, maxScale: 1.3, maxSlope: 35, minScale: 0.6 },
    ],
    splatQueries: ["grass", "ground", "gravel"],
  },
};

export function isWorldBiomeId(value: string): value is WorldBiomeId {
  return WORLD_BIOME_IDS.includes(value as WorldBiomeId);
}
