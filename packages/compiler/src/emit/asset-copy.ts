import { cp, mkdir, readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";

export type IInternalAsset = Record<string, unknown> & { id: string; sourcePath?: string };

export interface IAssetCopy {
  path: string;
  sourcePath: string;
}

interface IGltfLikeDocument {
  images?: Array<{ bufferView?: number; uri?: string }>;
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
    await copyExternalGltfImageDependencies(projectPath, outDir, asset.path, asset.sourcePath ?? asset.path);
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

async function copyExternalGltfImageDependencies(projectPath: string, outDir: string, bundleAssetPath: string, sourceAssetPath: string): Promise<void> {
  const extension = extname(sourceAssetPath).toLowerCase();
  if (extension !== ".glb" && extension !== ".gltf") {
    return;
  }

  const sourceBuffer = await readFile(resolve(projectPath, sourceAssetPath));
  const document = extension === ".glb"
    ? tryParseGlbJson(sourceBuffer)
    : JSON.parse(sourceBuffer.toString("utf8")) as IGltfLikeDocument;
  if (document === undefined) {
    return;
  }

  const sourceBase = dirname(sourceAssetPath);
  const bundleBase = dirname(bundleAssetPath);
  for (const uri of document.images?.flatMap((image) => image.uri === undefined ? [] : [image.uri]) ?? []) {
    if (!isCopyableExternalGltfUri(uri)) {
      continue;
    }
    const sourceDependencyPath = resolveRelativeAssetPath(sourceBase, uri, "GLTF image source");
    const bundleDependencyPath = resolveRelativeAssetPath(bundleBase, uri, "GLTF image bundle");
    const from = resolve(projectPath, sourceDependencyPath);
    const to = resolveBundlePath(outDir, bundleDependencyPath);
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to);
  }
}

function tryParseGlbJson(buffer: Buffer): IGltfLikeDocument | undefined {
  if (buffer.length < 20 || buffer.toString("ascii", 0, 4) !== "glTF") {
    return undefined;
  }
  return parseGlbJson(buffer);
}

function parseGlbJson(buffer: Buffer): IGltfLikeDocument {
  const version = buffer.readUInt32LE(4);
  if (version !== 2) {
    throw new Error(`Unsupported GLB version '${version}'.`);
  }
  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength > buffer.length) {
    throw new Error("Invalid GLB asset: declared length exceeds file size.");
  }
  const chunkLength = buffer.readUInt32LE(12);
  const chunkType = buffer.readUInt32LE(16);
  if (chunkType !== 0x4e4f534a) {
    throw new Error("Invalid GLB asset: first chunk is not JSON.");
  }
  const jsonStart = 20;
  const jsonEnd = jsonStart + chunkLength;
  if (jsonEnd > buffer.length) {
    throw new Error("Invalid GLB asset: JSON chunk exceeds file size.");
  }
  return JSON.parse(buffer.toString("utf8", jsonStart, jsonEnd).trim()) as IGltfLikeDocument;
}

function isCopyableExternalGltfUri(uri: string): boolean {
  if (uri.length === 0) {
    return false;
  }
  const normalized = uri.toLowerCase();
  return !normalized.startsWith("data:") && !normalized.startsWith("http://") && !normalized.startsWith("https://") && !isAbsolute(uri);
}

function resolveRelativeAssetPath(basePath: string, dependencyPath: string, label: string): string {
  const combined = basePath === "." ? dependencyPath : `${basePath}/${dependencyPath}`;
  if (combined.split(/[\\/]+/).includes("..")) {
    throw new Error(`${label} path '${dependencyPath}' must not contain parent traversal.`);
  }
  return combined;
}
