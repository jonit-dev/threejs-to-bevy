import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type IBundleManifest } from "@threenative/ir";
import { type IAssetReference, type IAudioDeclaration } from "@threenative/sdk";
import { type IUiElement } from "@threenative/ui";

import { type IProjectConfig } from "../config.js";
import { emitAudio } from "./audio.js";
import { ecsToIr } from "./ecs.js";
import { sceneToWorld } from "./scene-to-world.js";
import { stableJson } from "./stable-json.js";
import { emitUi } from "./ui.js";

export async function emitBundle(config: IProjectConfig, root: unknown): Promise<string> {
  const outDir = resolve(config.projectPath, config.outDir);
  const bundleRoot = normalizeBundleRoot(root);
  const isWorld =
    typeof bundleRoot.scene === "object" && bundleRoot.scene !== null && bundleRoot.scene.constructor.name === "World";
  const emitted = isWorld ? undefined : sceneToWorld(bundleRoot.scene as Parameters<typeof sceneToWorld>[0]);
  const ecs = isWorld ? ecsToIr(bundleRoot.scene as Parameters<typeof ecsToIr>[0]) : undefined;
  const audio = bundleRoot.audio === undefined ? undefined : emitAudio(bundleRoot.audio);
  const assets = mergeAudioAssets(emitted?.assets ?? [], bundleRoot.audio);
  const ui = bundleRoot.ui === undefined ? undefined : emitUi(bundleRoot.ui);
  const manifest: IBundleManifest = {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "threenative-game",
    requiredCapabilities: {
      rendering: ["mesh.primitive.box", "material.standard", "light.directional"],
    },
    entry: {
      ...(audio === undefined ? {} : { audio: "audio.ir.json" }),
      ...(ecs?.scriptBundle === undefined ? {} : { scripts: "scripts.bundle.js" }),
      ...(ecs === undefined ? {} : { systems: "systems.ir.json" }),
      ...(ui === undefined ? {} : { ui: "ui.ir.json" }),
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
    stableJson({ schema: "threenative.assets", version: "0.1.0", assets }),
  );
  await writeFile(
    resolve(outDir, "target.profile.json"),
    stableJson({ schema: "threenative.target-profile", version: "0.1.0", targets: ["web", "desktop"] }),
  );
  if (ui !== undefined) {
    await writeFile(resolve(outDir, "ui.ir.json"), stableJson(ui));
  }
  if (audio !== undefined) {
    await writeFile(resolve(outDir, "audio.ir.json"), stableJson(audio));
  }
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

interface IBundleRoot {
  audio?: IAudioDeclaration;
  scene: unknown;
  ui?: IUiElement;
}

function normalizeBundleRoot(root: unknown): IBundleRoot {
  if (isBundleRoot(root)) {
    return root;
  }
  return { scene: root };
}

function isBundleRoot(root: unknown): root is IBundleRoot {
  return typeof root === "object" && root !== null && "scene" in root;
}

function mergeAudioAssets(
  assets: Array<Record<string, unknown> & { id: string }>,
  audio: IAudioDeclaration | undefined,
): Array<Record<string, unknown> & { id: string }> {
  const merged = new Map(assets.map((asset) => [asset.id, asset]));
  for (const asset of audioAssetRefs(audio)) {
    merged.set(asset.id, {
      format: asset.format,
      id: asset.id,
      kind: asset.kind,
      path: asset.path,
    });
  }
  return [...merged.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function audioAssetRefs(audio: IAudioDeclaration | undefined): IAssetReference[] {
  if (audio === undefined) {
    return [];
  }
  return [...audio.music, ...audio.oneShots].flatMap((item) => (item.assetRef === undefined ? [] : [item.assetRef]));
}
