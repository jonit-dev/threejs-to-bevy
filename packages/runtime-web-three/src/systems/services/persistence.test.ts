import assert from "node:assert/strict";
import test from "node:test";

import { createWebPersistenceService } from "./persistence.js";

test("should restore declared resources when save slot is loaded", () => {
  const service = createWebPersistenceService({
    schema: "threenative.local-data",
    version: "0.1.0",
    components: [{ id: "Inventory", schema: { fields: { items: { kind: "string" } } } }],
    resources: [{ id: "Progress", schema: { fields: { level: { kind: "integer" } } } }],
    saveSlots: [{ appVersion: "1.0.0", id: "slot.main", schemaVersion: 1 }],
    settings: [{ defaultValue: 0.5, group: "audio", key: "audio.master", kind: "number", max: 1, min: 0 }],
  });
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
