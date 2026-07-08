#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, basename, extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const exampleRoot = resolve(scriptDir, "..");
const textures = [
  "assets/grass_texture/grass_05_basecolor_1k.webp",
  "assets/grass_texture/grass_05_normal_gl_1k.webp",
  "assets/grass_texture/grass_05_roughness_1k.webp",
  "assets/ground_texture/ground_07_4k/ground_07__basecolor_1k.webp",
  "assets/ground_texture/ground_07_4k/ground_07__normal_gl_1k.webp",
  "assets/ground_texture/ground_07_4k/ground_07__roughness_1k.webp",
  "assets/ground_texture/ground_07_4k/ground_07__ambientocclusion_1k.webp",
  "assets/ground_texture/ground_07_4k/ground_07__height_1k.webp",
  "assets/ground_texture/ground_07_4k/ground_07__metallic_1k.webp",
  "assets/path.webp",
  "assets/perlin.webp",
];
const alphaMasks = ["assets/leaves-alpha-map.png"];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: exampleRoot,
    encoding: "utf8",
    stdio: "pipe",
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
}

function imageMagickCommand() {
  const magick = spawnSync("magick", ["-version"], { encoding: "utf8", stdio: "pipe" });
  if (magick.status === 0) {
    return ["magick"];
  }
  const convert = spawnSync("convert", ["-version"], { encoding: "utf8", stdio: "pipe" });
  if (convert.status === 0) {
    return ["convert"];
  }
  throw new Error("ImageMagick is required to convert native texture sidecars.");
}

const command = imageMagickCommand();

function nativePngPath(relativeTexturePath) {
  const sourceDir = dirname(relativeTexturePath);
  const stem = basename(relativeTexturePath, extname(relativeTexturePath));
  return join(sourceDir, "native", `${stem}.png`);
}

for (const relativeTexturePath of textures) {
  const inputPath = resolve(exampleRoot, relativeTexturePath);
  if (!existsSync(inputPath)) {
    throw new Error(`Missing source texture: ${relativeTexturePath}`);
  }

  const outputRelativePath = nativePngPath(relativeTexturePath);
  const outputPath = resolve(exampleRoot, outputRelativePath);

  await mkdir(dirname(outputPath), { recursive: true });
  run(command[0], [...command.slice(1), inputPath, outputPath]);
  console.log(`converted ${relativeTexturePath} -> ${outputRelativePath}`);
}

for (const relativeTexturePath of alphaMasks) {
  const inputPath = resolve(exampleRoot, relativeTexturePath);
  if (!existsSync(inputPath)) {
    throw new Error(`Missing source alpha texture: ${relativeTexturePath}`);
  }

  const outputRelativePath = nativePngPath(relativeTexturePath);
  const outputPath = resolve(exampleRoot, outputRelativePath);

  await mkdir(dirname(outputPath), { recursive: true });
  run(command[0], [
    ...command.slice(1),
    inputPath,
    "-colorspace",
    "Gray",
    "-alpha",
    "Copy",
    "-fill",
    "white",
    "-colorize",
    "100",
    outputPath,
  ]);
  console.log(`converted alpha ${relativeTexturePath} -> ${outputRelativePath}`);
}
