import { addAsset, type IAuthoringOperationResult } from "@threenative/authoring";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";

import type { ICommandResult } from "../diagnostics.js";

interface IAssimpResult { FileCount(): number; GetErrorCode(): unknown; GetFile(index: number): { GetContent(): Uint8Array }; IsSuccess(): boolean }
interface IAssimpModule { ConvertFileList(files: unknown, format: string): IAssimpResult; FileList: new () => { AddFile(name: string, bytes: Uint8Array): void } }

export async function assetImportCommand(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd(), options: { loadConverter?: () => Promise<IAssimpModule> } = {}): Promise<ICommandResult> {
  const json = argv.includes("--json");
  const source = argv.find((value, index) => index > 0 && !value.startsWith("-") && !IMPORT_VALUE_FLAGS.has(argv[index - 1] ?? ""));
  const assetId = readFlag(argv, "--id");
  const projectPath = resolve(cwd, readFlag(argv, "--project") ?? ".");
  const license = readFlag(argv, "--license");
  const attribution = readFlag(argv, "--attribution");
  if (source === undefined || assetId === undefined) return result({ code: "TN_ASSET_IMPORT_ARGS_MISSING", message: "Usage: tn asset import <source-path-or-url> --id <asset-id> [--license <id>] [--attribution <text>] [--variant name=#rrggbb] [--project <path>] [--json]", severity: "error" }, json, 2);
  if (isRemote(source) && license === undefined) return result({ code: "TN_ASSET_IMPORT_LICENSE_REQUIRED", message: "Remote asset imports require --license <id>.", severity: "error" }, json, 2);

  let assimp: IAssimpModule;
  try {
    assimp = await (options.loadConverter ?? loadAssimp)();
  } catch {
    return result({ code: "TN_ASSET_IMPORT_CONVERTER_MISSING", message: "Asset conversion requires the optional assimpjs package.", severity: "error", suggestion: "Install assimpjs in the CLI environment, then rerun tn asset import." }, json, 1);
  }
  try {
    const sourceBytes = isRemote(source) ? await download(source) : await readFile(resolve(projectPath, source));
    const files = new assimp.FileList();
    files.AddFile(basename(new URL(source, "file:///").pathname), sourceBytes);
    const converted = assimp.ConvertFileList(files, "glb2");
    if (!converted.IsSuccess() || converted.FileCount() !== 1) throw new Error(String(converted.GetErrorCode()));
    const repaired = rewriteGlb(Buffer.from(converted.GetFile(0).GetContent()));
    const outputDir = resolve(projectPath, "assets", "imported");
    await mkdir(outputDir, { recursive: true });
    const outputs: Array<{ assetId: string; bytes: Buffer; path: string }> = [{ assetId, bytes: repaired, path: `assets/imported/${safeName(assetId)}.glb` }];
    for (const variant of readVariants(argv)) outputs.push({ assetId: `${assetId}.${variant.name}`, bytes: rewriteGlb(repaired, variant.color), path: `assets/imported/${safeName(assetId)}-${safeName(variant.name)}.glb` });
    const registrations: IAuthoringOperationResult[] = [];
    for (const output of outputs) {
      await writeFile(resolve(projectPath, output.path), output.bytes);
      registrations.push(await addAsset({ assetId: output.assetId, attribution, license, path: output.path, projectPath, source, type: "model" }));
    }
    const failed = registrations.find((registration) => !registration.ok);
    if (failed !== undefined) return result({ code: "TN_ASSET_IMPORT_REGISTER_FAILED", diagnostics: failed.diagnostics, message: "Converted asset could not be registered.", severity: "error" }, json, 1);
    return result({ assets: outputs.map((output) => ({ id: output.assetId, path: output.path })), code: "TN_ASSET_IMPORT_OK", message: `Imported '${source}' as ${outputs.length} registered GLB asset(s).`, provenance: { attribution, license, source } }, json, 0);
  } catch (error) {
    return result({ code: "TN_ASSET_IMPORT_CONVERT_FAILED", message: `Asset conversion failed: ${error instanceof Error ? error.message : String(error)}`, severity: "error" }, json, 1);
  }
}

async function loadAssimp(): Promise<IAssimpModule> {
  const moduleName = "assimpjs";
  const loaded = await import(moduleName) as { default?: () => Promise<IAssimpModule> };
  if (loaded.default === undefined) throw new Error("assimpjs default export is unavailable");
  return loaded.default();
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

function rewriteGlb(bytes: Buffer, baseColorFactor?: [number, number, number, number]): Buffer {
  if (bytes.length < 20 || bytes.toString("ascii", 0, 4) !== "glTF") throw new Error("Converter output is not a GLB file.");
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").replace(/[\0 ]+$/u, "")) as Record<string, unknown>;
  repairAbsoluteTextureUris(json);
  if (baseColorFactor !== undefined && Array.isArray(json.materials)) {
    for (const material of json.materials) {
      if (!isRecord(material)) continue;
      const pbr = isRecord(material.pbrMetallicRoughness) ? material.pbrMetallicRoughness : {};
      pbr.baseColorFactor = baseColorFactor;
      material.pbrMetallicRoughness = pbr;
    }
  }
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const paddedLength = Math.ceil(jsonBytes.length / 4) * 4;
  const remaining = bytes.subarray(20 + jsonLength);
  const output = Buffer.alloc(20 + paddedLength + remaining.length, 0x20);
  bytes.copy(output, 0, 0, 12);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(paddedLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonBytes.copy(output, 20);
  remaining.copy(output, 20 + paddedLength);
  return output;
}

function repairAbsoluteTextureUris(json: Record<string, unknown>): void {
  const images = Array.isArray(json.images) ? json.images : [];
  if (!images.some((image) => isRecord(image) && typeof image.uri === "string" && !isRelativeTextureUri(image.uri))) return;
  delete json.images; delete json.textures; delete json.samplers;
  if (!Array.isArray(json.materials)) return;
  for (const material of json.materials) {
    if (!isRecord(material)) continue;
    if (isRecord(material.pbrMetallicRoughness)) delete material.pbrMetallicRoughness.baseColorTexture;
    delete material.normalTexture; delete material.occlusionTexture; delete material.emissiveTexture;
  }
}

function isRelativeTextureUri(uri: string): boolean {
  return uri.startsWith("data:") || (!isAbsolute(uri) && !/^[A-Za-z]:[\\/]/u.test(uri) && !/^[a-z][a-z0-9+.-]*:/iu.test(uri));
}

function readVariants(argv: readonly string[]): Array<{ color: [number, number, number, number]; name: string }> {
  const variants: Array<{ color: [number, number, number, number]; name: string }> = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--variant") continue;
    const value = argv[index + 1] ?? "";
    const separator = value.indexOf("=");
    const color = parseHexColor(value.slice(separator + 1));
    if (separator > 0 && color !== undefined) variants.push({ color, name: value.slice(0, separator) });
  }
  return variants;
}

function parseHexColor(value: string): [number, number, number, number] | undefined {
  const hex = /^#([0-9a-f]{6})$/iu.exec(value)?.[1];
  if (hex === undefined) return undefined;
  return [Number.parseInt(hex.slice(0, 2), 16) / 255, Number.parseInt(hex.slice(2, 4), 16) / 255, Number.parseInt(hex.slice(4, 6), 16) / 255, 1];
}

function readFlag(argv: readonly string[], flag: string): string | undefined { const index = argv.indexOf(flag); return index === -1 ? undefined : argv[index + 1] }
function result(payload: Record<string, unknown>, json: boolean, exitCode: number): ICommandResult { return { exitCode, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${String(payload.message ?? payload.code)}\n` } }
function isRemote(value: string): boolean { return /^https?:\/\//iu.test(value) }
function safeName(value: string): string { return value.replace(/[^A-Za-z0-9._-]+/gu, "-") }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }
const IMPORT_VALUE_FLAGS = new Set(["--attribution", "--id", "--license", "--project", "--variant"]);
