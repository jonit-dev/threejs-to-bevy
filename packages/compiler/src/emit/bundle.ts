import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type IBundleManifest } from "@threenative/ir";

import { type IProjectConfig } from "../config.js";
import { ecsToIr } from "./ecs.js";
import { sceneToWorld } from "./scene-to-world.js";
import { stableJson } from "./stable-json.js";

export async function emitBundle(config: IProjectConfig, root: unknown): Promise<string> {
  const outDir = resolve(config.projectPath, config.outDir);
  const isWorld = typeof root === "object" && root !== null && root.constructor.name === "World";
  const emitted = isWorld ? undefined : sceneToWorld(root as Parameters<typeof sceneToWorld>[0]);
  const ecs = isWorld ? ecsToIr(root as Parameters<typeof ecsToIr>[0]) : undefined;
  const manifest: IBundleManifest = {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "threenative-game",
    requiredCapabilities: {
      rendering: ["mesh.primitive.box", "material.standard", "light.directional"],
    },
    entry: {
      ...(ecs?.scriptBundle === undefined ? {} : { scripts: "scripts.bundle.js" }),
      ...(ecs === undefined ? {} : { systems: "systems.ir.json" }),
      world: "world.ir.json",
    },
    files: {
      assets: "assets.manifest.json",
      ...(ecs?.input === undefined ? {} : { input: "input.ir.json" }),
      materials: "materials.ir.json",
      targetProfile: "target.profile.json",
      ...(ecs === undefined
        ? {}
        : {
            componentSchemas: "schemas/components.schema.json" as const,
            eventSchemas: "schemas/events.schema.json" as const,
            resourceSchemas: "schemas/resources.schema.json" as const,
            ...(ecs.runtimeConfig === undefined ? {} : { runtimeConfig: "runtime.config.json" as const }),
            ...(ecs.scriptBundle === undefined ? {} : { scripts: "scripts.bundle.js" as const }),
          }),
    },
  };

  await rm(outDir, { force: true, recursive: true });
  await mkdir(outDir, { recursive: true });
  await mkdir(resolve(outDir, "schemas"), { recursive: true });
  await writeFile(resolve(outDir, "manifest.json"), stableJson(manifest));
  await writeFile(resolve(outDir, "world.ir.json"), stableJson(ecs?.world ?? emitted?.world));
  await writeFile(
    resolve(outDir, "materials.ir.json"),
    stableJson({ schema: "threenative.materials", version: "0.1.0", materials: emitted?.materials ?? [] }),
  );
  await writeFile(
    resolve(outDir, "assets.manifest.json"),
    stableJson({ schema: "threenative.assets", version: "0.1.0", assets: emitted?.assets ?? [] }),
  );
  await writeFile(
    resolve(outDir, "target.profile.json"),
    stableJson({ schema: "threenative.target-profile", version: "0.1.0", targets: ["web", "desktop"] }),
  );
  if (ecs !== undefined) {
    await writeFile(resolve(outDir, "schemas/components.schema.json"), stableJson(ecs.componentSchemas));
    await writeFile(resolve(outDir, "schemas/resources.schema.json"), stableJson(ecs.resourceSchemas));
    await writeFile(resolve(outDir, "schemas/events.schema.json"), stableJson(ecs.eventSchemas));
    await writeFile(resolve(outDir, "systems.ir.json"), stableJson(ecs.systems));
    if (ecs.input !== undefined) {
      await writeFile(resolve(outDir, "input.ir.json"), stableJson(ecs.input));
    }
    if (ecs.runtimeConfig !== undefined) {
      await writeFile(resolve(outDir, "runtime.config.json"), stableJson(ecs.runtimeConfig));
    }
    if (ecs.scriptBundle !== undefined) {
      await writeFile(resolve(outDir, "scripts.bundle.js"), ecs.scriptBundle);
    }
  }

  return outDir;
}
