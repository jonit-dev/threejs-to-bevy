import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type IBundleManifest } from "@threenative/ir";

import { type IProjectConfig } from "../config.js";
import { sceneToWorld } from "./scene-to-world.js";
import { stableJson } from "./stable-json.js";

export async function emitBundle(config: IProjectConfig, scene: unknown): Promise<string> {
  const outDir = resolve(config.projectPath, config.outDir);
  const emitted = sceneToWorld(scene as Parameters<typeof sceneToWorld>[0]);
  const manifest: IBundleManifest = {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "threenative-game",
    requiredCapabilities: {
      rendering: ["mesh.primitive.box", "material.standard", "light.directional"],
    },
    entry: {
      world: "world.ir.json",
    },
    files: {
      assets: "assets.manifest.json",
      materials: "materials.ir.json",
      targetProfile: "target.profile.json",
    },
  };

  await rm(outDir, { force: true, recursive: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, "manifest.json"), stableJson(manifest));
  await writeFile(resolve(outDir, "world.ir.json"), stableJson(emitted.world));
  await writeFile(
    resolve(outDir, "materials.ir.json"),
    stableJson({ schema: "threenative.materials", version: "0.1.0", materials: emitted.materials }),
  );
  await writeFile(
    resolve(outDir, "assets.manifest.json"),
    stableJson({ schema: "threenative.assets", version: "0.1.0", assets: emitted.assets }),
  );
  await writeFile(
    resolve(outDir, "target.profile.json"),
    stableJson({ schema: "threenative.target-profile", version: "0.1.0", targets: ["web", "desktop"] }),
  );

  return outDir;
}
