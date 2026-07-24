import { gltfMaterialExtensionStatus } from "@threenative/compiler";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import type { ICommandResult } from "../diagnostics.js";

export async function assetRepairCommand(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): Promise<ICommandResult> {
  const json = argv.includes("--json");
  const source = argv.find((value, index) => index > 0 && !value.startsWith("-") && argv[index - 1] !== "--project");
  const stripExtensions = argv.includes("--strip-extensions");
  const dedupeNodeNames = argv.includes("--dedupe-node-names");
  if (source === undefined || (!stripExtensions && !dedupeNodeNames)) {
    return render({ code: "TN_ASSET_REPAIR_ARGS_MISSING", message: "Usage: tn asset repair <path.glb|path.gltf> (--strip-extensions|--dedupe-node-names) [--no-backup] [--json]", severity: "error" }, json, 2);
  }
  const projectPath = resolve(cwd, readFlag(argv, "--project") ?? ".");
  const assetPath = resolve(projectPath, source);
  try {
    const original = await readFile(assetPath);
    const parsed = extname(assetPath).toLowerCase() === ".glb" ? parseGlb(original) : { document: JSON.parse(original.toString("utf8")) as Record<string, unknown>, suffix: undefined };
    const stripped = stripExtensions ? stripUnsupportedMaterialExtensions(parsed.document) : [];
    const renamedNodes = dedupeNodeNames ? renameDuplicateSiblingNodes(parsed.document) : [];
    if (!argv.includes("--no-backup")) await copyFile(assetPath, `${assetPath}.bak`);
    await writeFile(assetPath, parsed.suffix === undefined ? `${JSON.stringify(parsed.document, null, 2)}\n` : writeGlb(parsed.document, parsed.suffix));
    return render({ backup: argv.includes("--no-backup") ? undefined : `${assetPath}.bak`, code: "TN_ASSET_REPAIR_OK", message: `Repaired '${source}': stripped ${stripped.length} extension(s), renamed ${renamedNodes.length} duplicate node(s).`, path: assetPath, renamedNodes, stripped }, json, 0);
  } catch (error) {
    return render({ code: "TN_ASSET_REPAIR_FAILED", message: `Asset repair failed: ${error instanceof Error ? error.message : String(error)}`, severity: "error" }, json, 1);
  }
}

function renameDuplicateSiblingNodes(document: Record<string, unknown>): Array<{ from: string; index: number; to: string }> {
  if (!Array.isArray(document.nodes)) return [];
  const nodes = document.nodes;
  const parentByIndex = new Map<number, number>();
  nodes.forEach((node, parentIndex) => {
    if (!isRecord(node) || !Array.isArray(node.children)) return;
    node.children.forEach((child) => {
      if (typeof child === "number" && Number.isInteger(child)) parentByIndex.set(child, parentIndex);
    });
  });
  const usedByParent = new Map<number, Set<string>>();
  const renamed: Array<{ from: string; index: number; to: string }> = [];
  nodes.forEach((node, index) => {
    if (!isRecord(node) || typeof node.name !== "string" || node.name.trim() === "") return;
    const parent = parentByIndex.get(index) ?? -1;
    const used = usedByParent.get(parent) ?? new Set<string>();
    usedByParent.set(parent, used);
    const original = node.name;
    let candidate = original;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${original}.${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    if (candidate !== original) {
      node.name = candidate;
      renamed.push({ from: original, index, to: candidate });
    }
  });
  return renamed;
}

function stripUnsupportedMaterialExtensions(document: Record<string, unknown>): string[] {
  const stripped = new Set<string>();
  if (Array.isArray(document.materials)) {
    for (const material of document.materials) {
      if (!isRecord(material) || !isRecord(material.extensions)) continue;
      for (const extension of Object.keys(material.extensions)) {
        if (gltfMaterialExtensionStatus(extension) === "unsupported") {
          delete material.extensions[extension];
          stripped.add(extension);
        }
      }
      if (Object.keys(material.extensions).length === 0) delete material.extensions;
    }
  }
  for (const key of ["extensionsUsed", "extensionsRequired"] as const) {
    if (Array.isArray(document[key])) document[key] = document[key].filter((extension) => typeof extension !== "string" || !stripped.has(extension));
  }
  return [...stripped].sort();
}

function parseGlb(bytes: Buffer): { document: Record<string, unknown>; suffix: Buffer } {
  if (bytes.length < 20 || bytes.toString("ascii", 0, 4) !== "glTF") throw new Error("GLB file must start with glTF magic.");
  const jsonLength = bytes.readUInt32LE(12);
  return {
    document: JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").replace(/[\0 ]+$/u, "")) as Record<string, unknown>,
    suffix: bytes.subarray(20 + jsonLength),
  };
}

function writeGlb(document: Record<string, unknown>, suffix: Buffer): Buffer {
  const json = Buffer.from(JSON.stringify(document));
  const padded = Math.ceil(json.length / 4) * 4;
  const output = Buffer.alloc(20 + padded + suffix.length, 0x20);
  output.write("glTF", 0, "ascii");
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(padded, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  json.copy(output, 20);
  suffix.copy(output, 20 + padded);
  return output;
}

function readFlag(argv: readonly string[], flag: string): string | undefined { const index = argv.indexOf(flag); return index === -1 ? undefined : argv[index + 1] }
function render(payload: Record<string, unknown>, json: boolean, exitCode: number): ICommandResult { return { exitCode, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${String(payload.message)}\n` } }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }
