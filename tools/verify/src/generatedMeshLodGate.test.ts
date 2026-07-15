import assert from "node:assert/strict";
import test from "node:test";

import type { FixtureCatalog, FixtureCatalogEntry } from "./conformance.js";
import {
  resolveGeneratedMeshLodFixture,
  validateGeneratedMeshLodEvidence,
  type GeneratedMeshLodContract,
  type GeneratedMeshLodStateEvidence,
} from "./generatedMeshLodGate.js";

test("generated mesh LOD evidence accepts paired selections, triangle ordering, and visual metrics", () => {
  const value = contract();
  assert.deepEqual(validateGeneratedMeshLodEvidence(value, states(), invariants(value)), []);
});

test("generated mesh LOD evidence rejects selection, distance, triangle, blank, silhouette, and color drift", () => {
  const invalidContract = contract();
  invalidContract.triangleCounts["mesh.hero.lod.1"] = 700;
  const invalidStates = states();
  invalidStates[0]!.webSelection.selectedMesh = "mesh.wrong";
  invalidStates[1]!.nativeSelection.distance = 25;
  invalidStates[2]!.webSelection.distance = 22.1;
  invalidStates[2]!.nativeSelection.distance = 22.2;
  invalidStates[3]!.nativeBytes = 0;
  invalidStates[3]!.webMetrics = { ...invalidStates[3]!.webMetrics, colorMae: 0.21, silhouetteDelta: 0.26 };

  assert.deepEqual(
    validateGeneratedMeshLodEvidence(invalidContract, invalidStates, invariants(invalidContract)).map((entry) => entry.code).sort(),
    [
      "TN_VERIFY_GENERATED_MESH_LOD_COLOR_DRIFT",
      "TN_VERIFY_GENERATED_MESH_LOD_DISTANCE_INVALID",
      "TN_VERIFY_GENERATED_MESH_LOD_DISTANCE_PARITY_INVALID",
      "TN_VERIFY_GENERATED_MESH_LOD_DISTANCE_PARITY_INVALID",
      "TN_VERIFY_GENERATED_MESH_LOD_SCREENSHOT_BLANK",
      "TN_VERIFY_GENERATED_MESH_LOD_SELECTION_INVALID",
      "TN_VERIFY_GENERATED_MESH_LOD_SILHOUETTE_DRIFT",
      "TN_VERIFY_GENERATED_MESH_LOD_THRESHOLD_DISTANCE_INVALID",
      "TN_VERIFY_GENERATED_MESH_LOD_THRESHOLD_DISTANCE_INVALID",
      "TN_VERIFY_GENERATED_MESH_LOD_THRESHOLD_DISTANCE_INVALID",
      "TN_VERIFY_GENERATED_MESH_LOD_TRIANGLE_ORDER_INVALID",
    ],
  );
});

test("generated mesh LOD catalog enrollment has one owning fixture", () => {
  const entry = fixture();
  assert.equal(resolveGeneratedMeshLodFixture(catalog([entry])), entry);
  assert.throws(() => resolveGeneratedMeshLodFixture(catalog([])), /exactly once; found 0/);
  assert.throws(() => resolveGeneratedMeshLodFixture(catalog([entry, { ...entry }])), /exactly once; found 2/);
});

function contract(): GeneratedMeshLodContract {
  return {
    baseMesh: "mesh.hero",
    cameraEntity: "camera.main",
    entity: "hero",
    invariant: {
      collider: { kind: "box", size: [1, 2, 1] },
      hierarchy: { parent: "root" },
      layers: { layers: ["actors"] },
      material: "mat.hero",
      shadows: { cast: true, receive: true },
      transform: { position: [0, 0, 0] },
      visibility: true,
    },
    levels: [
      { mesh: "mesh.hero.lod.1", minDistance: 10 },
      { mesh: "mesh.hero.lod.2", minDistance: 20 },
    ],
    payloads: [
      { bytes: 1000, id: "mesh.hero", sha256: "base", triangleCount: 600 },
      { bytes: 600, id: "mesh.hero.lod.1", sha256: "lod1", triangleCount: 300 },
      { bytes: 300, id: "mesh.hero.lod.2", sha256: "lod2", triangleCount: 120 },
    ],
    payloadSizes: { baseBytes: 1000, totalBytes: 1900 },
    triangleCounts: { "mesh.hero": 600, "mesh.hero.lod.1": 300, "mesh.hero.lod.2": 120 },
  };
}

function invariants(value: GeneratedMeshLodContract) {
  const observation = {
    collider: true,
    hierarchy: "root",
    layers: true,
    material: "mat.hero",
    shadows: { cast: true, receive: true },
    transform: value.invariant.transform,
    visibility: true,
  };
  return { native: { ...observation }, web: { ...observation } };
}

function states(): GeneratedMeshLodStateEvidence[] {
  return [
    state("near", 5, "mesh.hero", 0),
    state("threshold-1", 10, "mesh.hero.lod.1", 10),
    state("threshold-2", 20, "mesh.hero.lod.2", 20),
    state("far", 35, "mesh.hero.lod.2", 20),
  ];
}

function state(stateName: GeneratedMeshLodStateEvidence["state"], distance: number, selectedMesh: string, threshold: number): GeneratedMeshLodStateEvidence {
  const metrics = { colorMae: 0.01, nativeNonBackgroundFraction: 0.3, silhouetteDelta: 0.02, webNonBackgroundFraction: 0.31 };
  const selection = { distance, entity: "hero", selectedMesh, threshold };
  return { nativeBytes: 1024, nativeMetrics: { ...metrics }, nativeSelection: { ...selection }, state: stateName, webBytes: 1024, webMetrics: { ...metrics }, webSelection: { ...selection } };
}

function catalog(fixtures: FixtureCatalogEntry[]): FixtureCatalog {
  return { fixtures, schema: "threenative.fixture-catalog", version: "0.1.0" };
}

function fixture(): FixtureCatalogEntry {
  return {
    aggregateGate: "verify:generated-mesh-lod",
    bundlePath: "packages/ir/fixtures/conformance/procedural-mesh-lod/game.bundle",
    canonicalId: "procedural-mesh-lod",
    ownerDocs: "docs/PRDs/done/procedural-generated-mesh-lod-contract-2026-07-14.md",
    promotedCapabilities: ["rendering:generated-mesh-lod"],
    reportArtifacts: ["tools/verify/artifacts/generated-mesh-lod/verification-report.json"],
  };
}
