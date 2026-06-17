import { cp, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export type IInternalAsset = Record<string, unknown> & { id: string; sourcePath?: string };

export interface IAssetCopy {
  path: string;
  sourcePath: string;
}

export async function copyAssetFiles(
  projectPath: string,
  outDir: string,
  assets: ReadonlyArray<IInternalAsset>,
): Promise<void> {
  for (const asset of assets) {
    if (asset.sourceMode !== undefined && asset.sourceMode !== "bundle") {
      continue;
    }
    if (typeof asset.path !== "string") {
      continue;
    }
    const from = resolve(projectPath, asset.sourcePath ?? asset.path);
    const to = resolveBundlePath(outDir, asset.path);
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to);
  }
}

export async function copyExtraAssetFiles(projectPath: string, outDir: string, files: readonly IAssetCopy[]): Promise<void> {
  for (const file of files) {
    const from = resolve(projectPath, file.sourcePath);
    const to = resolveBundlePath(outDir, file.path);
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to);
  }
}

export function resolveBundlePath(outDir: string, bundlePath: string): string {
  if (isAbsolute(bundlePath) || bundlePath.split(/[\\/]+/).includes("..")) {
    throw new Error(`Bundle asset path '${bundlePath}' must be relative and must not contain parent traversal.`);
  }
  const resolved = resolve(outDir, bundlePath);
  const relativePath = relative(outDir, resolved);
  if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath) || relativePath.split(sep).includes("..")) {
    throw new Error(`Bundle asset path '${bundlePath}' must stay within the emitted bundle.`);
  }
  return resolved;
}
