import assert from "node:assert/strict";
import test from "node:test";

import { assetSourceRelevanceScore, type IAssetSourceRecord } from "./catalog.js";

test("should rank category-matching records above incidental keyword hits", () => {
  const chess = record({ directName: "Chess set pieces", gameCategory: "board-games", id: "chess-set", tags: ["chess", "piece"] });
  const track = record({ directName: "Track pieces", gameCategory: "racing", id: "track-pieces", tags: ["track"] });
  assert.equal(assetSourceRelevanceScore(chess, "chess piece") > assetSourceRelevanceScore(track, "chess piece"), true);
});

test("should rank direct downloads above index-only records at equal score", () => {
  const direct = record({ directName: "Chess piece", id: "direct", isDirectDownload: true });
  const index = record({ directName: "Chess piece", id: "index", isDirectDownload: false });
  assert.equal(assetSourceRelevanceScore(direct, "chess piece") > assetSourceRelevanceScore(index, "chess piece"), true);
});

function record(overrides: Partial<IAssetSourceRecord>): IAssetSourceRecord {
  return {
    directName: "", fileRole: "model", format: "glb", gameCategory: "misc", id: "record", importNotes: "", isDirectDownload: false,
    licenseId: "CC0", licensePosture: "allowed", name: "", notes: "", sourceMetadata: {}, sourceUrl: "", tags: [],
    ...overrides,
  } as IAssetSourceRecord;
}
