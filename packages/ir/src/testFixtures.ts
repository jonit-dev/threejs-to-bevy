import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  IAssetsManifest,
  IBundleManifest,
  IMaterialsIr,
  ITargetProfile,
  IWorldIr,
} from "./types.js";

export interface ITestBundleOptions {
  assets?: IAssetsManifest;
  createAssetsDir?: boolean;
  manifest?: Partial<Omit<IBundleManifest, "entry" | "files">> & {
    entry?: Partial<IBundleManifest["entry"]>;
    files?: Partial<IBundleManifest["files"]>;
  };
  materials?: IMaterialsIr;
  targetProfile?: ITargetProfile;
  world?: IWorldIr;
}

export async function writeTestBundle(root: string, options: ITestBundleOptions = {}): Promise<void> {
  if (options.createAssetsDir === true) {
    await mkdir(join(root, "assets"), { recursive: true });
  }

  const manifest = testManifest(options.manifest);
  await writeJson(root, "manifest.json", manifest);
  await writeJson(root, manifest.entry.world, options.world ?? emptyWorld());
  await writeJson(root, manifest.files.assets, options.assets ?? emptyAssets());
  await writeJson(root, manifest.files.materials, options.materials ?? emptyMaterials());
  await writeJson(root, manifest.files.targetProfile, options.targetProfile ?? webTargetProfile());
}

export async function writeJson(root: string, file: string, value: unknown): Promise<void> {
  await mkdir(join(root, file, ".."), { recursive: true });
  await writeFile(join(root, file), `${JSON.stringify(value, null, 2)}\n`);
}

export function testManifest(
  overrides: ITestBundleOptions["manifest"] = {},
): IBundleManifest {
  return {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "test-bundle",
    requiredCapabilities: {},
    entry: { world: "world.ir.json", ...overrides.entry },
    files: {
      assets: "assets.manifest.json",
      materials: "materials.ir.json",
      targetProfile: "target.profile.json",
      ...overrides.files,
    },
    ...withoutNestedManifestFields(overrides),
  };
}

export function emptyWorld(): IWorldIr {
  return { schema: "threenative.world", version: "0.1.0", entities: [] };
}

export function emptyAssets(): IAssetsManifest {
  return { schema: "threenative.assets", version: "0.1.0", assets: [] };
}

export function emptyMaterials(): IMaterialsIr {
  return { schema: "threenative.materials", version: "0.1.0", materials: [] };
}

export function webTargetProfile(): ITargetProfile {
  return { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] };
}

function withoutNestedManifestFields(
  overrides: ITestBundleOptions["manifest"],
): Partial<IBundleManifest> {
  const { entry: _entry, files: _files, ...rest } = overrides ?? {};
  return rest;
}
