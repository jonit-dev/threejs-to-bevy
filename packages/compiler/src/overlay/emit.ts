import { access, readdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { validateOverlayEntry, validateOverlaysIr, type IIrDiagnostic, type IOverlaysIr } from "@threenative/ir";
import type { IOverlayDeclaration } from "@threenative/sdk";
import type { IAuthoringDocument } from "@threenative/authoring";

import type { IAssetCopy } from "../emit/asset-copy.js";

export interface IEmittedOverlayBundle {
  extraFiles: IAssetCopy[];
  overlays: IOverlaysIr;
}

export async function emitOverlays(projectPath: string, declaration: IOverlayDeclaration): Promise<IEmittedOverlayBundle> {
  const overlays: IOverlaysIr = {
    schema: "threenative.overlays",
    version: "0.1.0",
    overlays: [
      {
        entry: declaration.entry,
        id: declaration.id,
        input: declaration.input,
        messages: {
          ...(declaration.messages.gameToOverlay.length === 0 ? {} : { gameToOverlay: [...declaration.messages.gameToOverlay] }),
          ...(declaration.messages.overlayToGame.length === 0 ? {} : { overlayToGame: [...declaration.messages.overlayToGame] }),
        },
        targetProfiles: [...declaration.targetProfiles],
        transparent: declaration.transparent,
        zIndex: declaration.zIndex,
      },
    ],
  };
  const diagnostics = validateOverlaysIr(overlays);
  if (diagnostics.length > 0) {
    throw new Error(`TN_COMPILER_OVERLAY_INVALID: ${diagnostics.map((diagnostic) => `${diagnostic.code} at ${diagnostic.path}`).join(", ")}`);
  }
  const extraFiles = await Promise.all(
    declaration.assets.map(async (path) => {
      validateOverlayAssetPath(path);
      await assertOverlayAssetExists(projectPath, path);
      return { path, sourcePath: path };
    }),
  );
  return { extraFiles, overlays };
}

export async function emitStructuredOverlays(projectPath: string, documents: readonly IAuthoringDocument[] | undefined): Promise<IEmittedOverlayBundle | undefined> {
  const matches = (documents ?? []).filter((document) => document.kind === "overlay");
  if (matches.length === 0) return undefined;
  if (matches.length > 1) throw new Error("TN_COMPILER_OVERLAY_DUPLICATE: structured projects may declare one overlays document.");
  const overlays = matches[0]?.data as IOverlaysIr;
  const diagnostics = validateOverlaysIr(overlays);
  if (diagnostics.length > 0) throw new Error(`TN_COMPILER_OVERLAY_INVALID: ${diagnostics.map((diagnostic) => `${diagnostic.code} at ${diagnostic.path}`).join(", ")}`);
  const paths = new Set<string>();
  for (const overlay of overlays.overlays) {
    for (const path of await listOverlayFiles(projectPath, dirname(overlay.entry))) paths.add(path);
  }
  return { overlays, extraFiles: [...paths].sort().map((path) => ({ path, sourcePath: path })) };
}

async function listOverlayFiles(projectPath: string, directory: string): Promise<string[]> {
  validateOverlayAssetPath(`${directory}/index.html`);
  const absolute = resolve(projectPath, directory);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const child = resolve(absolute, entry.name);
    if (entry.isDirectory()) files.push(...await listOverlayFiles(projectPath, relative(projectPath, child).split("\\").join("/")));
    else if (entry.isFile()) files.push(relative(projectPath, child).split("\\").join("/"));
  }
  return files;
}

function validateOverlayAssetPath(path: string): void {
  const diagnostics: IIrDiagnostic[] = [];
  validateOverlayEntry(path, "overlay/assets", diagnostics);
  if (diagnostics.length > 0) {
    throw new Error(`TN_COMPILER_OVERLAY_ASSET_INVALID: '${path}' must be bundle-relative and local.`);
  }
}

async function assertOverlayAssetExists(projectPath: string, path: string): Promise<void> {
  try {
    await access(resolve(projectPath, path));
  } catch {
    throw new Error(`TN_COMPILER_OVERLAY_ASSET_MISSING: overlay asset '${path}' does not exist.`);
  }
}
