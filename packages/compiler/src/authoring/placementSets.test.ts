import assert from "node:assert/strict";
import test from "node:test";

import type { IScenePlacementSet } from "@threenative/authoring";
import { expandPlacementSet, expandPlacementSets, setDottedPath } from "./placementSets.js";

test("expands every placement pattern in stable row-major order", () => {
  const sets: IScenePlacementSet[] = [
    placement("grid", { kind: "grid", origin: [10, 2, 20], step: [2, 0, 3], rows: 2, columns: 2 }),
    placement("line", { kind: "line", origin: [1, 2, 3], step: [2, 1, -1], count: 2 }),
    placement("ring", { kind: "ring", center: [0, 1, 0], radius: 2, count: 4 }),
    placement("lanes", { kind: "lanes", origin: [0, 0, 0], step: [0, 0, 2], laneStep: [3, 0, 0], lanes: 2, count: 2 }),
    placement("explicit", { kind: "explicit", positions: [[3, 2, 1], [6, 5, 4]] }),
  ];
  const expanded = expandPlacementSets(sets);
  assert.deepEqual(expanded.slice(0, 4).map((item) => [item.id, item.transform?.position]), [
    ["grid.0.0.0", [10, 2, 20]], ["grid.0.0.1", [12, 2, 20]], ["grid.1.1.0", [10, 2, 23]], ["grid.1.1.1", [12, 2, 23]],
  ]);
  assert.deepEqual(expanded.slice(4, 6).map((item) => item.transform?.position), [[1, 2, 3], [3, 3, 2]]);
  assert.deepEqual(expanded.slice(6, 10).map((item) => item.transform?.position?.map(round)), [[2, 1, 0], [0, 1, 2], [-2, 1, 0], [0, 1, -2]]);
  assert.deepEqual(expanded.slice(10, 14).map((item) => item.transform?.position), [[0, 0, 0], [0, 0, 2], [3, 0, 0], [3, 0, 2]]);
  assert.deepEqual(expanded.slice(14).map((item) => item.transform?.position), [[3, 2, 1], [6, 5, 4]]);
  assert.deepEqual(expandPlacementSets(sets), expanded);
});

test("applies defaults then bindings then overrides without mutating source", () => {
  const source = placement("pawn", { kind: "line", origin: [0, 0, 0], step: [1, 0, 0], count: 2 });
  source.defaults = { transform: { scale: [10, 10, 10] }, components: { Piece: { file: -1, alive: true } } };
  source.indexBindings = { "components.Piece.file": "column" };
  source.overrides = { "1": { "components.Piece.file": 7, "components.Piece.alive": false } };
  const before = JSON.stringify(source);
  const expanded = expandPlacementSet(source);
  assert.deepEqual(expanded[0]?.components, { Piece: { alive: true, file: 0 } });
  assert.deepEqual(expanded[1]?.components, { Piece: { alive: false, file: 7 } });
  assert.deepEqual(expanded[1]?.transform, { position: [1, 0, 0], scale: [10, 10, 10] });
  assert.equal(JSON.stringify(source), before);
});

test("rejects unsafe and structurally invalid dotted paths", () => {
  assert.throws(() => setDottedPath({}, "components.__proto__.polluted", true), /Invalid placement path/);
  assert.throws(() => setDottedPath({ components: 1 }, "components.Piece.file", 1), /crosses non-object/);
  assert.throws(() => setDottedPath({}, "components", 1), /Invalid placement path/);
});

test("rejects duplicate generated ids", () => {
  const first = placement("same", { kind: "explicit", positions: [[0, 0, 0]] });
  const second = placement("same", { kind: "explicit", positions: [[1, 0, 0]] });
  assert.throws(() => expandPlacementSets([first, second]), /duplicate entity id 'same\.0\.0\.0'/);
});

test("preserves stable authored string ids through bounded id values", () => {
  const set = placement("pawn", { kind: "line", origin: [0, 0, 0], step: [1, 0, 0], count: 3 });
  set.idFormat = "piece.white.pawn.{value}";
  set.idValues = ["a", "b", "h7"];
  assert.deepEqual(expandPlacementSet(set).map((item) => item.id), ["piece.white.pawn.a", "piece.white.pawn.b", "piece.white.pawn.h7"]);
});

test("binds finite authored pattern coordinates without repeating values", () => {
  const set = placement("coin", { kind: "explicit", positions: [[-1, 0.5, -2], [1, 0.5, -4]] });
  set.defaults = { components: { Coin: { z: 0 } } };
  set.indexBindings = { "components.Coin.z": "positionZ" };
  assert.deepEqual(expandPlacementSet(set).map((item) => item.components), [{ Coin: { z: -2 } }, { Coin: { z: -4 } }]);
});

function placement(id: string, pattern: IScenePlacementSet["pattern"]): IScenePlacementSet {
  return { id, idFormat: `${id}.{lane}.{row}.{column}`, kind: "placement-set", pattern, prefab: "prefab.test" };
}
function round(value: number): number { const rounded = Math.round(value * 1e12) / 1e12; return Object.is(rounded, -0) ? 0 : rounded; }
