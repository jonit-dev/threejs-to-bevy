import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { ILocalDataIr, IWorldIr } from "@threenative/ir";

import { createWebPersistenceService, type IPersistenceSaveRecord } from "./persistence.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const recordsFixturePath = resolve(repoRoot, "packages/ir/fixtures/contracts/persistence/records.json");

interface IPersistenceRecordsFixture {
  corruptRaw: string;
  localData: ILocalDataIr;
  maxRecordBytes: number;
  records: {
    declared: IPersistenceSaveRecord;
    forward: IPersistenceSaveRecord;
    migratable: IPersistenceSaveRecord;
    undeclared: IPersistenceSaveRecord;
  };
  storageNamespace: string;
}

test("should restore declared resources when save slot is loaded", () => {
  const service = createWebPersistenceService({
    schema: "threenative.local-data",
    version: "0.1.0",
    components: [{ id: "Inventory", schema: { fields: { items: { kind: "string" } } } }],
    resources: [{ id: "Progress", schema: { fields: { level: { kind: "integer" } } } }],
    saveSlots: [{ appVersion: "1.0.0", id: "slot.main", schemaVersion: 1 }],
    settings: [{ defaultValue: 0.5, group: "audio", key: "audio.master", kind: "number", max: 1, min: 0 }],
  }, { storage: memoryStorage(new Map()) });
  const world = {
    schema: "threenative.world" as const,
    version: "0.1.0" as const,
    entities: [
      { id: "player", components: { Inventory: { items: ["key"] }, RuntimeOnly: { handle: 1 } } },
    ],
    resources: { Progress: { level: 4 }, RuntimeOnly: { handle: 2 } },
  };

  assert.equal(service.setSetting("audio.master", 0.25), true);
  const saved = service.save("slot.main", world);
  assert.equal(saved.accepted, true);
  assert.deepEqual(saved.record?.resources, { Progress: { level: 4 } });
  assert.deepEqual(saved.record?.components, { player: { Inventory: { items: ["key"] } } });

  const loaded = service.load("slot.main", {
    ...world,
    entities: [{ id: "player", components: { Inventory: { items: [] }, RuntimeOnly: { handle: 3 } } }],
    resources: { Progress: { level: 0 }, RuntimeOnly: { handle: 4 } },
  });

  assert.equal(loaded.accepted, true);
  assert.deepEqual(loaded.world.resources, { Progress: { level: 4 }, RuntimeOnly: { handle: 4 } });
  assert.deepEqual(loaded.world.entities[0]?.components, { Inventory: { items: ["key"] }, RuntimeOnly: { handle: 3 } });
  assert.deepEqual(service.exportSettings(), { "audio.master": 0.25 });
});

test("should restore a save from adapter storage after a cold runtime restart", () => {
  const records = new Map<string, string>();
  const storage = {
    getItem: (key: string) => records.get(key) ?? null,
    removeItem: (key: string) => { records.delete(key); },
    setItem: (key: string, value: string) => { records.set(key, value); },
  };
  const localData = {
    schema: "threenative.local-data" as const,
    version: "0.1.0" as const,
    components: [{ id: "ChessPiece", schema: { fields: { file: { kind: "integer" } } } }],
    resources: [{ id: "ChessGame", schema: { fields: { playerColor: { kind: "string" } } } }],
    saveSlots: [{ appVersion: "1.0.0", id: "slot.auto", schemaVersion: 1 }],
    settings: [],
  };
  const savedWorld = {
    schema: "threenative.world" as const,
    version: "0.1.0" as const,
    entities: [{ id: "piece.white.pawn.e", components: { ChessPiece: { file: 4, rank: 3 } } }],
    resources: { ChessGame: { playerColor: "white" } },
  };

  assert.equal(createWebPersistenceService(localData, { storage, storageKey: "chess" }).save("slot.auto", savedWorld).accepted, true);
  const restarted = createWebPersistenceService(localData, { storage, storageKey: "chess" });
  const loaded = restarted.load("slot.auto", {
    ...savedWorld,
    entities: [{ id: "piece.white.pawn.e", components: { ChessPiece: { file: 4, rank: 1 } } }],
    resources: { ChessGame: { playerColor: "" } },
  });

  assert.equal(loaded.accepted, true);
  assert.deepEqual(loaded.world.resources, { ChessGame: { playerColor: "white" } });
  assert.deepEqual(loaded.world.entities[0]?.components.ChessPiece, { file: 4, rank: 3 });
});

test("should accept a declared bounded save record", async () => {
  const fixture = await readRecordsFixture();
  const storage = memoryStorage(new Map([[slotStorageKey(fixture), JSON.stringify(fixture.records.declared)]]));
  const service = createWebPersistenceService(fixture.localData, { maxRecordBytes: fixture.maxRecordBytes, storage, storageKey: fixture.storageNamespace });

  const loaded = service.load("slot.main", emptyWorld());

  assert.equal(loaded.accepted, true);
  assert.deepEqual(loaded.record, fixture.records.declared);
  assert.deepEqual(service.diagnostics, []);
});

test("should reject undeclared fields", async () => {
  const fixture = await readRecordsFixture();
  const storage = memoryStorage(new Map([[slotStorageKey(fixture), JSON.stringify(fixture.records.undeclared)]]));
  const service = createWebPersistenceService(fixture.localData, { maxRecordBytes: fixture.maxRecordBytes, storage, storageKey: fixture.storageNamespace });

  assert.equal(service.load("slot.main", emptyWorld()).status, "missing-save");
  assert.equal(service.diagnostics[0]?.code, "TN_PERSISTENCE_RECORD_UNDECLARED_FIELD");
});

test("should preserve a corrupt record for recovery", async () => {
  const fixture = await readRecordsFixture();
  const records = new Map([[slotStorageKey(fixture), fixture.corruptRaw]]);
  const service = createWebPersistenceService(fixture.localData, { maxRecordBytes: fixture.maxRecordBytes, storage: memoryStorage(records), storageKey: fixture.storageNamespace });

  assert.equal(service.load("slot.main", emptyWorld()).status, "missing-save");
  assert.equal(service.diagnostics[0]?.code, "TN_PERSISTENCE_RECORD_CORRUPT");
  assert.equal(records.get(slotStorageKey(fixture)), fixture.corruptRaw);
});

test("should diagnose a forward-incompatible record", async () => {
  const fixture = await readRecordsFixture();
  const storage = memoryStorage(new Map([[slotStorageKey(fixture), JSON.stringify(fixture.records.forward)]]));
  const service = createWebPersistenceService(fixture.localData, { maxRecordBytes: fixture.maxRecordBytes, storage, storageKey: fixture.storageNamespace });

  assert.equal(service.load("slot.main", emptyWorld()).status, "missing-save");
  assert.equal(service.diagnostics[0]?.code, "TN_PERSISTENCE_SAVE_FORWARD_INCOMPATIBLE");
});

test("should reject a save record above the configured byte limit", async () => {
  const fixture = await readRecordsFixture();
  const service = createWebPersistenceService(fixture.localData, { maxRecordBytes: 128, storage: memoryStorage(new Map()) });
  const world = { ...emptyWorld(), resources: { Progress: { level: 4, padding: "x".repeat(256) } } };

  assert.deepEqual(service.save("slot.main", world), { accepted: false, slot: "slot.main", status: "record-too-large" });
  assert.equal(service.load("slot.main", emptyWorld()).status, "missing-save");
  assert.equal(service.diagnostics[0]?.code, "TN_PERSISTENCE_RECORD_TOO_LARGE");
});

test("should apply every declarative migration transform in order", async () => {
  const fixture = await readRecordsFixture();
  const storage = memoryStorage(new Map([[slotStorageKey(fixture), JSON.stringify(fixture.records.migratable)]]));
  const service = createWebPersistenceService(fixture.localData, { maxRecordBytes: fixture.maxRecordBytes, storage, storageKey: fixture.storageNamespace });

  const loaded = service.load("slot.main", emptyWorld());

  assert.equal(loaded.accepted, true);
  assert.equal(loaded.record?.schemaVersion, 2);
  assert.deepEqual(loaded.record?.resources, { Progress: { level: 2 } });
  assert.equal(JSON.parse(storage.getItem(slotStorageKey(fixture)) ?? "{}").schemaVersion, 2);
});

test("should fail closed and preserve the prior web record when migration commit fails", async () => {
  const fixture = await readRecordsFixture();
  const original = JSON.stringify(fixture.records.migratable);
  const records = new Map([[slotStorageKey(fixture), original]]);
  const storage = {
    ...memoryStorage(records),
    setItem: () => { throw new Error("quota"); },
  };
  const service = createWebPersistenceService(fixture.localData, { storage, storageKey: fixture.storageNamespace });
  assert.equal(service.load("slot.main", emptyWorld()).status, "missing-save");
  assert.equal(service.diagnostics[0]?.code, "TN_PERSISTENCE_MIGRATION_COMMIT_FAILED");
  assert.equal(records.get(slotStorageKey(fixture)), original);
});

test("should report storage failure when no web storage backend exists", () => {
  const localData = settingsLocalData();
  const service = createWebPersistenceService({
    ...localData,
    resources: [{ id: "Progress", schema: {} }],
    saveSlots: [{ appVersion: "1.0.0", id: "slot.main", schemaVersion: 1 }],
  }, { storage: undefined });
  assert.equal(service.setSetting("audio.master", 0.25), false);
  assert.deepEqual(service.save("slot.main", emptyWorld()), { accepted: false, slot: "slot.main", status: "storage-failed" });
  assert.equal(service.diagnostics.at(-1)?.code, "TN_PERSISTENCE_STORAGE_WRITE_FAILED");
});

test("should keep legacy numeric migrators diagnostic-only", () => {
  const records = new Map<string, string>();
  records.set("threenative:persistence:legacy:slot.main", JSON.stringify({
    appVersion: "1.0.0", components: {}, resources: {}, schema: "threenative.persistence-record", schemaVersion: 1, settings: {}, slot: "slot.main", version: "0.1.0",
  }));
  const service = createWebPersistenceService({
    schema: "threenative.local-data",
    version: "0.1.0",
    components: [],
    migration: { currentVersion: 2, migrators: [1] },
    resources: [],
    saveSlots: [{ appVersion: "1.0.0", id: "slot.main", schemaVersion: 2 }],
    settings: [],
  }, { storage: memoryStorage(records), storageKey: "legacy" });

  assert.equal(service.diagnostics[0]?.code, "TN_PERSISTENCE_MIGRATOR_UNEXECUTABLE");
  assert.equal(records.size, 1);
});

test("should persist settings immediately across cold service recreation", () => {
  const records = new Map<string, string>();
  const storage = memoryStorage(records);
  const localData = settingsLocalData();
  const first = createWebPersistenceService(localData, { storage, storageKey: "settings-cold" });

  assert.equal(first.setSetting("audio.master", 0.25), true);
  assert.deepEqual(first.importSettings({ "accessibility.contrast": "highContrast" }), {
    "accessibility.contrast": "highContrast", "audio.master": 0.25,
  });

  const restarted = createWebPersistenceService(localData, { storage, storageKey: "settings-cold" });
  assert.deepEqual(restarted.exportSettings(), {
    "accessibility.contrast": "highContrast", "audio.master": 0.25,
  });
});

test("should keep newer dedicated settings when an older save is recreated and loaded", () => {
  const records = new Map<string, string>();
  const storage = memoryStorage(records);
  const localData: ILocalDataIr = {
    ...settingsLocalData(),
    saveSlots: [{ appVersion: "1.0.0", id: "slot.main", schemaVersion: 1 }],
  };
  const world = { schema: "threenative.world" as const, version: "0.1.0" as const, entities: [], resources: {} };
  const first = createWebPersistenceService(localData, { storage, storageKey: "settings-owner" });

  assert.equal(first.setSetting("audio.master", 0.25), true);
  assert.equal(first.save("slot.main", world).accepted, true);
  assert.equal(first.setSetting("audio.master", 0.75), true);

  const restarted = createWebPersistenceService(localData, { storage, storageKey: "settings-owner" });
  assert.equal(restarted.getSetting("audio.master"), 0.75);
  assert.equal(restarted.load("slot.main", world).accepted, true);
  assert.equal(restarted.getSetting("audio.master"), 0.75);
});

test("should preserve active and committed settings when immediate write fails", () => {
  const records = new Map<string, string>();
  let failWrites = false;
  const storage = {
    ...memoryStorage(records),
    setItem: (key: string, value: string) => {
      if (failWrites) throw new Error("read only");
      records.set(key, value);
    },
  };
  const localData = settingsLocalData();
  const service = createWebPersistenceService(localData, { storage, storageKey: "settings-failure" });
  assert.equal(service.setSetting("audio.master", 0.25), true);
  failWrites = true;
  assert.equal(service.setSetting("audio.master", 0.75), false);
  assert.deepEqual(service.importSettings({ "accessibility.contrast": "highContrast" }), {
    "accessibility.contrast": "normal", "audio.master": 0.25,
  });
  assert.equal(service.diagnostics.at(-1)?.code, "TN_PERSISTENCE_SETTINGS_WRITE_FAILED");
  failWrites = false;
  const restarted = createWebPersistenceService(localData, { storage, storageKey: "settings-failure" });
  assert.deepEqual(restarted.exportSettings(), {
    "accessibility.contrast": "normal", "audio.master": 0.25,
  });
});

test("should retain the prior committed record when storage write fails", () => {
  const records = new Map<string, string>();
  let failWrites = false;
  const storage = {
    ...memoryStorage(records),
    setItem: (key: string, value: string) => {
      if (failWrites) throw new Error("disk full");
      records.set(key, value);
    },
  };
  const localData = {
    schema: "threenative.local-data" as const,
    version: "0.1.0" as const,
    components: [],
    resources: [{ id: "Progress", schema: { fields: { level: { kind: "integer" } } } }],
    saveSlots: [{ appVersion: "1.0.0", id: "slot.main", schemaVersion: 1 }],
    settings: [],
  };
  const service = createWebPersistenceService(localData, { storage });
  const initial = { ...emptyWorld(), resources: { Progress: { level: 1 } } };
  const changed = { ...emptyWorld(), resources: { Progress: { level: 2 } } };

  assert.equal(service.save("slot.main", initial).accepted, true);
  failWrites = true;
  assert.deepEqual(service.save("slot.main", changed), { accepted: false, slot: "slot.main", status: "storage-failed" });
  assert.deepEqual(service.load("slot.main", emptyWorld()).world.resources, { Progress: { level: 1 } });
  assert.equal(service.diagnostics.at(-1)?.code, "TN_PERSISTENCE_STORAGE_WRITE_FAILED");
});

test("should not report deletion when storage removal fails", () => {
  const records = new Map<string, string>();
  const storage = {
    ...memoryStorage(records),
    removeItem: () => { throw new Error("read only"); },
  };
  const localData = {
    schema: "threenative.local-data" as const,
    version: "0.1.0" as const,
    components: [], resources: [], settings: [],
    saveSlots: [{ appVersion: "1.0.0", id: "slot.main", schemaVersion: 1 }],
  };
  const service = createWebPersistenceService(localData, { storage });
  assert.equal(service.save("slot.main", emptyWorld()).accepted, true);

  assert.equal(service.delete("slot.main"), false);
  assert.equal(service.load("slot.main", emptyWorld()).accepted, true);
  assert.equal(service.diagnostics.at(-1)?.code, "TN_PERSISTENCE_STORAGE_DELETE_FAILED");
});

async function readRecordsFixture(): Promise<IPersistenceRecordsFixture> {
  return JSON.parse(await readFile(recordsFixturePath, "utf8")) as IPersistenceRecordsFixture;
}

function slotStorageKey(fixture: IPersistenceRecordsFixture): string {
  return `threenative:persistence:${encodeURIComponent(fixture.storageNamespace)}:slot.main`;
}

function memoryStorage(records: Map<string, string>) {
  return {
    getItem: (key: string) => records.get(key) ?? null,
    removeItem: (key: string) => { records.delete(key); },
    setItem: (key: string, value: string) => { records.set(key, value); },
  };
}

function emptyWorld(): IWorldIr {
  return { schema: "threenative.world", version: "0.1.0", entities: [], resources: {} };
}

function settingsLocalData(): ILocalDataIr {
  return {
    schema: "threenative.local-data", version: "0.1.0", components: [], resources: [], saveSlots: [],
    settings: [
      { defaultValue: 0.8, group: "audio", key: "audio.master", kind: "number", min: 0, max: 1 },
      { defaultValue: "normal", enumValues: ["normal", "highContrast"], group: "accessibility", key: "accessibility.contrast", kind: "string" },
    ],
  };
}
