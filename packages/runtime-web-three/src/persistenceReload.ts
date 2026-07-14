import type { IAssetReloadReportIr, ILocalDataIr, IWorldIr } from "@threenative/ir";

import { observeWebAssetReload } from "./assetReload.js";
import { createMemoryPersistenceStorage, createWebPersistenceService, type IPersistenceSaveRecord } from "./systems/services/persistence.js";

export interface IPersistenceReloadReport {
  boundaries: IPersistenceReloadBoundary[];
  diagnostics: IPersistenceReloadDiagnostic[];
  persistence: {
    autosave: IPersistenceAutosaveObservation[];
    restore: IPersistenceRestoreObservation;
    savedRecord: IPersistenceSaveRecord;
    settings: Record<string, boolean | number | string>;
    storage: IPersistenceStorageObservation;
  };
  reload: IPersistenceReloadPolicyObservation;
  schema: "threenative.persistence-reload";
  version: "0.1.0";
}

export interface IPersistenceReloadDiagnostic {
  code: string;
  message: string;
  path: string;
  severity: "error" | "warning";
  suggestion?: string;
}

export interface IPersistenceAutosaveObservation {
  event: string;
  slot: string;
  status: "saved";
}

export interface IPersistenceRestoreObservation {
  resourceValue?: unknown;
  slot: string;
  status: "loaded";
}

export interface IPersistenceStorageObservation {
  backend: "native-json";
  pathPolicy: "target-profile";
  slot: string;
}

export interface IPersistenceReloadPolicyObservation {
  assetReload: IAssetReloadReportIr;
  incompatible: string[];
  replaced: string[];
  reset: string[];
  retained: string[];
  status: "retained";
}

export interface IPersistenceReloadBoundary {
  code: string;
  status: "diagnostic-only";
}

export function tracePersistenceReload(localData: ILocalDataIr, world: IWorldIr): IPersistenceReloadReport {
  const service = createWebPersistenceService(localData, { storage: createMemoryPersistenceStorage() });
  const slot = localData.saveSlots[0]?.id ?? "slot.main";
  service.setSetting("audio.master", 0.6);
  const save = service.save(slot, world);
  const restored = service.load(slot, mutatedWorld(world));
  const checkpointEvents = localData.autosave?.checkpointEvents ?? [];
  return {
    boundaries: boundaries(),
    diagnostics: migrationDiagnostics(localData, (save.record?.schemaVersion ?? 1) + 1),
    persistence: {
      autosave: checkpointEvents.map((event) => ({ event, slot, status: "saved" as const })),
      restore: { resourceValue: (restored.world.resources?.Progress as { level?: number } | undefined)?.level, slot, status: "loaded" },
      savedRecord: save.record!,
      settings: service.exportSettings(),
      storage: { backend: "native-json", pathPolicy: "target-profile", slot },
    },
    reload: reloadPolicy(),
    schema: "threenative.persistence-reload",
    version: "0.1.0",
  };
}

function mutatedWorld(world: IWorldIr): IWorldIr {
  return {
    ...world,
    resources: { ...(world.resources ?? {}), Progress: { level: 99 } },
  };
}

function migrationDiagnostics(localData: ILocalDataIr, saveVersion: number): IPersistenceReloadDiagnostic[] {
  const currentVersion = localData.migration?.currentVersion ?? Math.max(...localData.saveSlots.map((slot) => slot.schemaVersion), 1);
  if (saveVersion <= currentVersion) {
    return [];
  }
  return [{
    code: "TN_PERSISTENCE_SAVE_FORWARD_INCOMPATIBLE",
    message: `Save schema version ${saveVersion} is newer than local data version ${currentVersion}.`,
    path: "local-data.ir.json/migration/currentVersion",
    severity: "error",
    suggestion: "Open this save with a newer game build or add a compatible migrator before restore.",
  }];
}

function reloadPolicy(): IPersistenceReloadPolicyObservation {
  return {
    assetReload: observeWebAssetReload({
      changedAssets: [{ assetId: "texture.hud", change: "changed", path: "assets/hud.png" }],
      classification: "reloadable",
      diagnostics: [],
      impactedHandles: ["texture.hud"],
      schema: "threenative.asset-reload",
      statePolicy: "preserve",
      version: "0.1.0",
    }),
    incompatible: ["local-data.ir.json/migration/currentVersion"],
    replaced: ["assets/hud.png"],
    reset: ["TransientEffects"],
    retained: ["Progress", "Inventory", "settings"],
    status: "retained",
  };
}

function boundaries(): IPersistenceReloadBoundary[] {
  return [
    { code: "TN_PERSISTENCE_CLOUD_STORAGE_UNSUPPORTED", status: "diagnostic-only" },
    { code: "TN_SCRIPT_FILESYSTEM_API_UNSUPPORTED", status: "diagnostic-only" },
  ];
}
