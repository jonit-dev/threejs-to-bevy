#!/usr/bin/env node
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const exampleRoot = resolve(scriptDir, "..");
const nativeAssetDir = "assets/native";
const assets = [
  "assets/tree-tronk-transformed.glb",
  "assets/tree-leaves-mesh.glb",
  "assets/grass-blades-up.glb",
];
const forbiddenExtensions = new Set(["KHR_draco_mesh_compression", "EXT_texture_webp"]);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: exampleRoot,
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed (${result.status}): ${command} ${args.join(" ")}`,
        result.stdout?.trim(),
        result.stderr?.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

function readGlbJson(glbPath) {
  const data = readFileSync(glbPath);
  if (data.toString("utf8", 0, 4) !== "glTF") {
    throw new Error(`${glbPath} is not a GLB file.`);
  }

  const jsonChunkLength = data.readUInt32LE(12);
  const jsonChunkType = data.toString("utf8", 16, 20);
  if (jsonChunkType !== "JSON") {
    throw new Error(`${glbPath} does not start with a JSON chunk.`);
  }

  return JSON.parse(data.subarray(20, 20 + jsonChunkLength).toString("utf8"));
}

function assertNativeCompatible(glbPath) {
  const json = readGlbJson(glbPath);
  const extensionLists = [
    ["extensionsRequired", json.extensionsRequired ?? []],
    ["extensionsUsed", json.extensionsUsed ?? []],
  ];
  const images = json.images ?? [];

  for (const [field, extensions] of extensionLists) {
    for (const extension of extensions) {
      if (forbiddenExtensions.has(extension)) {
        throw new Error(`${glbPath} still has forbidden ${field} entry: ${extension}`);
      }
    }
  }

  for (const image of images) {
    if (image.mimeType === "image/webp") {
      throw new Error(`${glbPath} still contains an embedded WebP image: ${image.name ?? "<unnamed>"}`);
    }
  }
}

for (const relativeAssetPath of assets) {
  const inputPath = resolve(exampleRoot, relativeAssetPath);
  if (!existsSync(inputPath)) {
    throw new Error(`Missing source asset: ${relativeAssetPath}`);
  }

  const outputRelativePath = join(nativeAssetDir, basename(relativeAssetPath));
  const outputPath = resolve(exampleRoot, outputRelativePath);
  const tempDir = await mkdtemp(join(dirname(inputPath), ".native-glb-"));
  const copiedPath = join(tempDir, `${basename(inputPath, ".glb")}.decoded.glb`);
  const nativePath = join(tempDir, `${basename(inputPath, ".glb")}.native.glb`);

  try {
    // gltf-transform copy decodes KHR_draco_mesh_compression while preserving other model data.
    run("pnpm", ["exec", "gltf-transform", "copy", inputPath, copiedPath]);

    // The default png command only visits PNG inputs. Explicitly include WebP inputs so
    // embedded EXT_texture_webp images are transcoded to ordinary image/png textures.
    run("pnpm", ["exec", "gltf-transform", "png", copiedPath, nativePath, "--formats", "webp"]);

    assertNativeCompatible(nativePath);

    await mkdir(dirname(outputPath), { recursive: true });
    await copyFile(nativePath, outputPath);
    assertNativeCompatible(outputPath);

    console.log(`converted ${relativeAssetPath} -> ${outputRelativePath}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
