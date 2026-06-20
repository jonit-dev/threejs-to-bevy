import { animationClip, defineAssetModule, modelAsset } from "@threenative/sdk";

export const heroModel = defineAssetModule({
  asset: modelAsset("model.hero", "assets/hero.glb", {
    animations: [
      animationClip("idle", { loop: true }),
      animationClip("dash", { loop: false, sourceClip: "Armature|Dash", speed: 1.25 }),
    ],
  }),
  source: { sourcePath: "src/assets/catalog.ts" },
});
