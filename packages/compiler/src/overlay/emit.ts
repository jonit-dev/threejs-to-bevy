import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { validateOverlayEntry, validateOverlaysIr, type IIrDiagnostic, type IOverlaysIr } from "@threenative/ir";
import type { IOverlayDeclaration } from "@threenative/sdk";

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
