export interface ILookProfileMaterial {
  color: string;
  emissive?: string;
  emissiveIntensity?: number;
  id: string;
  metalness?: number;
  roughness?: number;
}

export interface ILookProfileDefinition {
  id: string;
  renderLook: {
    bloomIntensity: number;
    contrast: number;
    environmentIntensity: number;
    exposure: number;
    saturation: number;
    shadowQuality: "low" | "medium" | "high";
  };
  summary: string;
  materials: ILookProfileMaterial[];
}

export const lookProfiles: readonly ILookProfileDefinition[] = [
  {
    id: "arcade-neon",
    summary: "High-contrast cyan, magenta, and gold arcade palette with restrained bloom.",
    renderLook: { bloomIntensity: 0.65, contrast: 0.22, environmentIntensity: 1.35, exposure: 1.08, saturation: 1.35, shadowQuality: "medium" },
    materials: [
      { id: "mat.floor", color: "#111827", emissive: "#0ea5e9", emissiveIntensity: 0.08, metalness: 0.08, roughness: 0.62 },
      { id: "mat.player", color: "#22d3ee", emissive: "#0891b2", emissiveIntensity: 0.25, metalness: 0.15, roughness: 0.38 },
      { id: "mat.goal", color: "#facc15", emissive: "#f97316", emissiveIntensity: 0.35, metalness: 0.05, roughness: 0.42 },
    ],
  },
  {
    id: "forest-dawn",
    summary: "Soft green, warm amber, and misty blue values for outdoor exploration.",
    renderLook: { bloomIntensity: 0.22, contrast: 0.08, environmentIntensity: 1.18, exposure: 1.12, saturation: 1.12, shadowQuality: "high" },
    materials: [
      { id: "mat.floor", color: "#2f3e2e", roughness: 0.9 },
      { id: "mat.player", color: "#f59e0b", emissive: "#92400e", emissiveIntensity: 0.08, metalness: 0.02, roughness: 0.58 },
      { id: "mat.goal", color: "#a7f3d0", emissive: "#34d399", emissiveIntensity: 0.22, roughness: 0.48 },
    ],
  },
  {
    id: "sunset-racer",
    summary: "Warm asphalt, coral body color, and cool checkpoint highlights for speed games.",
    renderLook: { bloomIntensity: 0.38, contrast: 0.16, environmentIntensity: 1.25, exposure: 1.05, saturation: 1.24, shadowQuality: "medium" },
    materials: [
      { id: "mat.floor", color: "#27272a", metalness: 0.04, roughness: 0.7 },
      { id: "mat.player", color: "#fb7185", emissive: "#be123c", emissiveIntensity: 0.16, metalness: 0.2, roughness: 0.34 },
      { id: "mat.goal", color: "#38bdf8", emissive: "#0284c7", emissiveIntensity: 0.28, metalness: 0.08, roughness: 0.4 },
    ],
  },
  {
    id: "toybox-pop",
    summary: "Bright playful primaries tuned for readable puzzle and platformer scaffolds.",
    renderLook: { bloomIntensity: 0.18, contrast: 0.12, environmentIntensity: 1.12, exposure: 1.0, saturation: 1.42, shadowQuality: "medium" },
    materials: [
      { id: "mat.floor", color: "#475569", roughness: 0.78 },
      { id: "mat.player", color: "#ef4444", emissive: "#991b1b", emissiveIntensity: 0.07, roughness: 0.5 },
      { id: "mat.goal", color: "#84cc16", emissive: "#65a30d", emissiveIntensity: 0.18, roughness: 0.45 },
    ],
  },
  {
    id: "noir-metal",
    summary: "Desaturated industrial base with blue rim accents and polished metal response.",
    renderLook: { bloomIntensity: 0.3, contrast: 0.28, environmentIntensity: 0.95, exposure: 0.92, saturation: 0.78, shadowQuality: "high" },
    materials: [
      { id: "mat.floor", color: "#1f2937", metalness: 0.18, roughness: 0.52 },
      { id: "mat.player", color: "#94a3b8", emissive: "#2563eb", emissiveIntensity: 0.18, metalness: 0.35, roughness: 0.32 },
      { id: "mat.goal", color: "#60a5fa", emissive: "#2563eb", emissiveIntensity: 0.32, metalness: 0.16, roughness: 0.38 },
    ],
  },
];

export function getLookProfile(id: string): ILookProfileDefinition | undefined {
  return lookProfiles.find((profile) => profile.id === id);
}

export function formatLookProfileUsage(): string {
  return lookProfiles.map((profile) => profile.id).join("|");
}
