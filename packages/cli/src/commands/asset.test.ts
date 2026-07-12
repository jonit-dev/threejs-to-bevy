import assert from "node:assert/strict";
import { createReadStream, existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { findAssetSourceCatalogPath, resolveAssetSourceCatalogPath } from "../assetSourceCatalog/catalog.js";
import { assetCommand } from "./asset.js";

const assetCatalogPath = resolveAssetSourceCatalogPath();
const catalogTest = existsSync(assetCatalogPath) ? test : test.skip;

const fixtureGltf = {
  asset: { version: "2.0", generator: "asset-command-test" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, translation: [1, 0, -2], scale: [2, 1, 1] }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  accessors: [{ type: "VEC3", min: [-0.5, 0, -1], max: [0.5, 2, 1] }],
  images: [{ uri: "textures/kart.png" }],
  buffers: [{ uri: "mesh.bin", byteLength: 12 }],
  materials: [{}],
  textures: [{}],
};

test("should inspect glTF bounds, dependencies, and scale calibration", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-gltf-"));
  const previousInitCwd = process.env.INIT_CWD;
  try {
    process.env.INIT_CWD = root;
    await mkdir(join(root, "textures"), { recursive: true });
    await writeFile(join(root, "textures", "kart.png"), "png");
    await writeFile(join(root, "mesh.bin"), "bin");
    await writeFile(join(root, "kart.gltf"), `${JSON.stringify(fixtureGltf, null, 2)}\n`);

    const result = await assetCommand(["inspect", "kart.gltf", "--json"]);
    const payload = JSON.parse(result.stdout) as {
      bounds: { center: number[]; min: number[]; max: number[]; size: number[] };
      calibration: { camera: { recommendedDistance: number }; fitScales: { targetHeight2m: number; targetLength4m: number }; gameplay: { verdict: string; widthToLaneRatio: number } };
      code: string;
      counts: { images: number; meshes: number; nodes: number };
      dependencies: Array<{ kind: string; missing?: boolean; uri?: string }>;
      diagnostics: Array<{ code: string }>;
      file: { type: string };
      modular: {
        footprint: { center: number[]; size: number[] };
        originCorrection: number[];
        placement: { cardinalYaw: Array<{ entityPositionForFootprintCenterAtOrigin: number[]; yawDegrees: number }> };
        pivotOffsetFromFootprintCenter: number[];
        snap: { suggestedCellSize: number };
      };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_ASSET_INSPECT_OK");
    assert.equal(payload.file.type, "gltf");
    assert.deepEqual(payload.bounds.min, [0, 0, -3]);
    assert.deepEqual(payload.bounds.max, [2, 2, -1]);
    assert.deepEqual(payload.bounds.size, [2, 2, 2]);
    assert.equal(payload.counts.meshes, 1);
    assert.equal(payload.counts.images, 1);
    assert.equal(payload.dependencies.some((dependency) => dependency.kind === "image" && dependency.uri === "textures/kart.png" && dependency.missing !== true), true);
    assert.equal(payload.calibration.fitScales.targetHeight2m, 1);
    assert.equal(payload.calibration.fitScales.targetLength4m, 2);
    assert.equal(payload.calibration.camera.recommendedDistance, 3.6);
    assert.equal(payload.calibration.gameplay.verdict, "ok");
    assert.equal(payload.calibration.gameplay.widthToLaneRatio, 0.571429);
    assert.deepEqual(payload.modular.footprint.center, [1, -2]);
    assert.deepEqual(payload.modular.footprint.size, [2, 2]);
    assert.deepEqual(payload.modular.originCorrection, [-1, -1, 2]);
    assert.deepEqual(payload.modular.placement.cardinalYaw.map((placement) => placement.yawDegrees), [0, 90, 180, 270]);
    assert.deepEqual(payload.modular.placement.cardinalYaw[0]?.entityPositionForFootprintCenterAtOrigin, [-1, -1, 2]);
    assert.deepEqual(payload.modular.placement.cardinalYaw[1]?.entityPositionForFootprintCenterAtOrigin, [2, -1, 1]);
    assert.deepEqual(payload.modular.pivotOffsetFromFootprintCenter, [1, -2]);
    assert.equal(payload.modular.snap.suggestedCellSize, 2);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_ASSET_MODULAR_PIVOT_OFFSET"), true);
  } finally {
    restoreInitCwd(previousInitCwd);
    await rm(root, { force: true, recursive: true });
  }
});

test("should render modular placement guidance in text inspect output", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-modular-text-"));
  try {
    await mkdir(join(root, "textures"), { recursive: true });
    await writeFile(join(root, "textures", "kart.png"), "png");
    await writeFile(join(root, "mesh.bin"), "bin");
    await writeFile(join(root, "kart.gltf"), `${JSON.stringify(fixtureGltf, null, 2)}\n`);

    const result = await assetCommand(["inspect", join(root, "kart.gltf")]);

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Modular: footprint X\/Z size \[2, 2\], center \[1, -2\], origin correction \[-1, -1, 2\], yaw0 \[-1, -1, 2\], yaw90 \[2, -1, 1\], suggested cell 2/);
    assert.match(result.stdout, /TN_ASSET_MODULAR_PIVOT_OFFSET/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should report glTF material extension metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-gltf-materials-"));
  try {
    await writeFile(join(root, "hero.gltf"), `${JSON.stringify({
      ...fixtureGltf,
      buffers: [],
      images: [],
      materials: [
        {
          extensions: {
            KHR_materials_clearcoat: { clearcoatFactor: 0.5 },
            VENDOR_custom_shader: { processor: "executable" },
          },
          extras: { gameplayMaterial: "visor" },
          name: "HeroVisor",
          pbrMetallicRoughness: {
            baseColorTexture: {
              index: 0,
              extensions: {
                KHR_texture_transform: {
                  offset: [0.25, 0.5],
                  scale: [2, 2],
                },
              },
            },
          },
        },
      ],
      meshes: [
        {
          extras: { targetNames: ["Smile"] },
          primitives: [{ attributes: { POSITION: 0 }, material: 0, targets: [{ POSITION: 0 }] }],
          weights: [0.3],
        },
      ],
    }, null, 2)}\n`);

    const result = await assetCommand(["inspect", join(root, "hero.gltf"), "--json"]);
    const payload = JSON.parse(result.stdout) as {
      diagnostics: Array<{ code: string; path?: string; severity: string }>;
      gltf: {
        assetId: string;
        materials: Array<{
          extensions: Array<{ extension: string; path: string; status: string }>;
          material: string;
          textureTransforms: Array<{ offset: number[]; path: string; textureSlot: string }>;
        }>;
        morphTargets: Array<{ defaultWeight: number; target: string }>;
      };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.gltf.assetId, "asset:hero");
    assert.deepEqual(payload.gltf.materials[0]?.extensions.map((extension) => [extension.extension, extension.status]), [
      ["KHR_materials_clearcoat", "promoted"],
      ["VENDOR_custom_shader", "unsupported"],
    ]);
    assert.equal(payload.gltf.materials[0]?.textureTransforms[0]?.textureSlot, "pbrMetallicRoughness.baseColorTexture");
    assert.deepEqual(payload.gltf.materials[0]?.textureTransforms[0]?.offset, [0.25, 0.5]);
    assert.deepEqual(payload.gltf.morphTargets, [{ defaultWeight: 0.3, mesh: "mesh:0", path: "/meshes/0/extras/targetNames/0", source: "mesh.extras.targetNames", target: "Smile" }]);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_ASSET_GLTF_EXTENSION_PROCESSOR_UNSUPPORTED" && diagnostic.path === "/materials/0/extensions/VENDOR_custom_shader" && diagnostic.severity === "warning"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should omit modular pivot diagnostic for centered model footprints", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-centered-modular-"));
  try {
    await writeFile(join(root, "centered.gltf"), `${JSON.stringify({
      ...fixtureGltf,
      nodes: [{ mesh: 0 }],
      accessors: [{ type: "VEC3", min: [-1, 0, -1], max: [1, 0.1, 1] }],
      images: [],
      buffers: [{ uri: "mesh.bin", byteLength: 12 }],
    }, null, 2)}\n`);
    await writeFile(join(root, "mesh.bin"), "bin");

    const result = await assetCommand(["inspect", join(root, "centered.gltf"), "--json"]);
    const payload = JSON.parse(result.stdout) as {
      diagnostics: Array<{ code: string }>;
      modular: { originCorrection: number[]; pivotOffsetFromFootprintCenter: number[] };
    };

    assert.equal(result.exitCode, 0);
    assert.deepEqual(payload.modular.pivotOffsetFromFootprintCenter, [0, 0]);
    assert.deepEqual(payload.modular.originCorrection, [0, -0.05, 0]);
    assert.deepEqual(payload.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should inspect a directory as a modular asset catalog", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-catalog-"));
  try {
    await mkdir(join(root, "nested"), { recursive: true });
    await writeFile(join(root, "road.gltf"), `${JSON.stringify({
      ...fixtureGltf,
      images: [],
      buffers: [{ uri: "mesh.bin", byteLength: 12 }],
    }, null, 2)}\n`);
    await writeFile(join(root, "nested", "corner.gltf"), `${JSON.stringify({
      ...fixtureGltf,
      nodes: [{ mesh: 0 }],
      accessors: [{ type: "VEC3", min: [-1, 0, -1], max: [1, 0.1, 1] }],
      images: [],
      buffers: [{ uri: "../mesh.bin", byteLength: 12 }],
    }, null, 2)}\n`);
    await writeFile(join(root, "mesh.bin"), "bin");
    await writeFile(join(root, "notes.txt"), "ignored");

    const shallow = await assetCommand(["inspect", root, "--json"]);
    const shallowPayload = JSON.parse(shallow.stdout) as {
      assets: Array<{ file: { path: string }; modular: { footprint: { size: number[] } } }>;
      code: string;
      directory: { recursive: boolean };
      summary: { inspected: number; warnings: number };
    };

    assert.equal(shallow.exitCode, 0);
    assert.equal(shallowPayload.code, "TN_ASSET_CATALOG_OK");
    assert.equal(shallowPayload.directory.recursive, false);
    assert.equal(shallowPayload.summary.inspected, 1);
    assert.equal(shallowPayload.summary.warnings, 1);
    assert.equal(shallowPayload.assets[0]?.file.path, join(root, "road.gltf"));
    assert.deepEqual(shallowPayload.assets[0]?.modular.footprint.size, [2, 2]);

    const recursive = await assetCommand(["inspect", root, "--recursive", "--json"]);
    const recursivePayload = JSON.parse(recursive.stdout) as {
      assets: Array<{ file: { path: string } }>;
      directory: { recursive: boolean };
      summary: { inspected: number };
    };

    assert.equal(recursive.exitCode, 0);
    assert.equal(recursivePayload.directory.recursive, true);
    assert.equal(recursivePayload.summary.inspected, 2);
    assert.deepEqual(recursivePayload.assets.map((asset) => asset.file.path), [join(root, "nested", "corner.gltf"), join(root, "road.gltf")].sort((a, b) => a.localeCompare(b)));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should render modular asset catalog guidance as text", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-catalog-text-"));
  try {
    await writeFile(join(root, "road.gltf"), `${JSON.stringify({
      ...fixtureGltf,
      images: [],
      buffers: [],
    }, null, 2)}\n`);

    const result = await assetCommand(["inspect", root]);

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Asset catalog inspection completed/);
    assert.match(result.stdout, /Inspected: 1, warnings: 1, errors: 0/);
    assert.match(result.stdout, /road\.gltf: size \[2, 2\], center \[1, -2\], correction \[-1, -1, 2\], yaw0 \[-1, -1, 2\], yaw90 \[2, -1, 1\], cell 2/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail directory inspection when no glTF assets are present", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-empty-catalog-"));
  try {
    await writeFile(join(root, "notes.txt"), "ignored");

    const result = await assetCommand(["inspect", root, "--json"]);
    const payload = JSON.parse(result.stdout) as {
      code: string;
      diagnostics: Array<{ code: string; severity: string }>;
      summary: { inspected: number; errors: number };
    };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_ASSET_CATALOG_FAILED");
    assert.equal(payload.summary.inspected, 0);
    assert.equal(payload.summary.errors, 1);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_ASSET_CATALOG_EMPTY" && diagnostic.severity === "error"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should inspect GLB JSON chunk and report embedded dependencies", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-glb-"));
  try {
    const glbGltf = {
      ...fixtureGltf,
      buffers: [{ byteLength: 12 }],
      images: [{ bufferView: 0, mimeType: "image/png" }],
    };
    await writeFile(join(root, "kart.glb"), makeGlb(glbGltf));

    const result = await assetCommand(["inspect", join(root, "kart.glb"), "--json"]);
    const payload = JSON.parse(result.stdout) as {
      bounds: { size: number[] };
      code: string;
      dependencies: Array<{ embedded: boolean; kind: string }>;
      file: { type: string };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_ASSET_INSPECT_OK");
    assert.equal(payload.file.type, "glb");
    assert.deepEqual(payload.bounds.size, [2, 2, 2]);
    assert.equal(payload.dependencies.some((dependency) => dependency.kind === "image" && dependency.embedded), true);
    assert.equal(payload.dependencies.some((dependency) => dependency.kind === "buffer" && dependency.embedded), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should infer modular road connectors from road material geometry", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-road-connectors-"));
  try {
    await writeFile(join(root, "road.glb"), makeRoadGlb("straight"));

    const result = await assetCommand(["inspect", join(root, "road.glb"), "--json"]);
    const payload = JSON.parse(result.stdout) as {
      modular: {
        connectors: {
          cardinalYaw: Array<{ edges: string[]; yawDegrees: number }>;
          local: string[];
          source: string;
        };
      };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.modular.connectors.source, "material:road");
    assert.deepEqual(payload.modular.connectors.local, ["north", "south"]);
    assert.deepEqual(payload.modular.connectors.cardinalYaw.find((placement) => placement.yawDegrees === 90)?.edges, ["east", "west"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should report missing external texture with stable diagnostic", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-missing-"));
  try {
    await writeFile(join(root, "mesh.bin"), "bin");
    await writeFile(join(root, "kart.gltf"), `${JSON.stringify(fixtureGltf, null, 2)}\n`);

    const result = await assetCommand(["inspect", join(root, "kart.gltf"), "--json"]);
    const payload = JSON.parse(result.stdout) as {
      code: string;
      dependencies: Array<{ kind: string; missing?: boolean; uri?: string }>;
      diagnostics: Array<{ code: string; severity: string }>;
    };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_ASSET_INSPECT_FAILED");
    assert.equal(payload.dependencies.some((dependency) => dependency.kind === "image" && dependency.uri === "textures/kart.png" && dependency.missing === true), true);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_ASSET_IMAGE_MISSING" && diagnostic.severity === "error"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should add structured asset source document", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-add-source-"));
  try {
    const result = await assetCommand(["add", "model.kart", "--type", "model", "--path", "assets/kart.glb", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { filesWritten: string[] };
    const doc = JSON.parse(await readFile(join(root, "content", "assets", "model.kart.assets.json"), "utf8")) as {
      assets: Array<{ id: string; path: string; type: string }>;
    };

    assert.equal(result.exitCode, 0);
    assert.deepEqual(payload.filesWritten, ["content/assets/model.kart.assets.json"]);
    assert.deepEqual(doc.assets, [{ id: "model.kart", path: "assets/kart.glb", type: "model" }]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported asset type at add time", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-type-invalid-"));
  try {
    const result = await assetCommand(["add", "piece", "--type", "glb", "--path", "assets/piece.glb", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string; fix?: { snippet?: string } }> };
    assert.equal(result.exitCode, 1);
    assert.equal(payload.diagnostics[0]?.code, "TN_AUTHORING_ASSET_TYPE_INVALID");
    assert.equal(payload.diagnostics[0]?.fix?.snippet, "--type model");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject format mismatch for kind at add time", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-format-invalid-"));
  try {
    const result = await assetCommand(["add", "piece", "--type", "model", "--path", "assets/piece.dae", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { diagnostics: Array<{ fix?: { snippet?: string }; message: string }> };
    assert.equal(result.exitCode, 1);
    assert.match(payload.diagnostics[0]?.message ?? "", /glb, gltf/);
    assert.match(payload.diagnostics[0]?.fix?.snippet ?? "", /tn asset import/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept model glb add unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-model-valid-"));
  try {
    const result = await assetCommand(["add", "piece", "--type", "model", "--path", "assets/piece.glb", "--project", root, "--json"]);
    assert.equal(result.exitCode, 0, result.stdout);
    assert.equal((JSON.parse(result.stdout) as { code: string }).code, "TN_ASSET_OK");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should add structured render target asset source document", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-add-render-target-"));
  try {
    const result = await assetCommand(["add", "rt.minimap", "--type", "render-target", "--width", "512", "--height", "256", "--usage", "depth", "--format", "depth24plus", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { filesWritten: string[] };
    const doc = JSON.parse(await readFile(join(root, "content", "assets", "rt.minimap.assets.json"), "utf8")) as {
      assets: Array<{ format: string; height: number; id: string; type: string; usage: string; width: number }>;
    };

    assert.equal(result.exitCode, 0);
    assert.deepEqual(payload.filesWritten, ["content/assets/rt.minimap.assets.json"]);
    assert.deepEqual(doc.assets, [{ format: "depth24plus", height: 256, id: "rt.minimap", type: "render-target", usage: "depth", width: 512 }]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

catalogTest("should search direct GLB sources by game category", async () => {
  const result = await assetCommand(["source", "search", "--game-category", "underwater", "--format", "glb", "--direct-only", "--json"]);
  const payload = JSON.parse(result.stdout) as {
    code: string;
    records: Array<{ downloadUrl: string | null; format: string; gameCategory: string; isDirectDownload: boolean }>;
  };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_ASSET_SOURCE_SEARCH_OK");
  assert.equal(payload.records.length >= 1, true);
  assert.equal(payload.records.every((record) => record.gameCategory === "underwater" && record.format === "glb" && record.isDirectDownload && record.downloadUrl !== null), true);
});

catalogTest("should search typed material and texture source records by file role", async () => {
  const result = await assetCommand(["source", "search", "--file-role", "material-index", "--query", "poly haven", "--json"]);
  const payload = JSON.parse(result.stdout) as {
    records: Array<{ fileRole: string; id: string; isDirectDownload: boolean; sourceMetadata: Record<string, string> }>;
  };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.records.some((record) => record.id.startsWith("polyhaven-texture-")), true);
  assert.equal(payload.records.every((record) => record.fileRole === "material-index" && !record.isDirectDownload), true);
  assert.equal(payload.records.some((record) => record.sourceMetadata.polyhavenType === "texture"), true);

  const generated = await assetCommand(["source", "search", "--file-role", "material-index", "--query", "ambientcg", "--json"]);
  const generatedPayload = JSON.parse(generated.stdout) as {
    records: Array<{ downloadUrl: string | null; format: string; id: string; sourceMetadata: Record<string, string> }>;
  };

  assert.equal(generated.exitCode, 0);
  assert.equal(generatedPayload.records.some((record) => record.id.startsWith("ambientcg-") && record.format === "zip" && record.downloadUrl?.startsWith("https://ambientcg.com/get?file=")), true);
  assert.equal(generatedPayload.records.some((record) => record.sourceMetadata.ambientcgDataType === "Material" || record.sourceMetadata.ambientcgDataType === "Substance"), true);

  const curated = await assetCommand(["source", "get", "ambientcg-material-index", "--json"]);
  const curatedPayload = JSON.parse(curated.stdout) as {
    record: { id: string; sourceMetadata: Record<string, string> };
  };

  assert.equal(curated.exitCode, 0);
  assert.equal(curatedPayload.record.id, "ambientcg-material-index");
  assert.equal(curatedPayload.record.sourceMetadata.assetType, "material-texture");
});

catalogTest("should include fallback records when direct-only search has no match", async () => {
  const result = await assetCommand(["source", "search", "--game-category", "restaurant-cooking", "--format", "glb", "--direct-only", "--json"]);
  const payload = JSON.parse(result.stdout) as {
    code: string;
    fallbackRecords: Array<{ id: string; isDirectDownload: boolean; recommendedNextCommand: string }>;
    records: unknown[];
  };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_ASSET_SOURCE_NO_MATCH");
  assert.deepEqual(payload.records, []);
  assert.equal(payload.fallbackRecords.some((record) => record.id === "workflow-genre-specific-pack-shortlist-kaykit-restaurant-bits" && !record.isDirectDownload), true);
  assert.equal(payload.fallbackRecords.every((record) => /Review .*tn asset inspect/.test(record.recommendedNextCommand)), true);
});

catalogTest("should find curated bowling pack records by keyword and broad category", async () => {
  const keyword = await assetCommand(["source", "search", "--query", "bowling pins", "--json"]);
  const keywordPayload = JSON.parse(keyword.stdout) as {
    records: Array<{ id: string; isDirectDownload: boolean; licenseId: string }>;
  };

  assert.equal(keyword.exitCode, 0);
  assert.equal(keywordPayload.records.some((record) => record.id === "babylon-bowling-ball-glb" && record.isDirectDownload && record.licenseId === "CC-BY-4.0"), true);
  assert.equal(keywordPayload.records.some((record) => record.id === "babylon-bowling-pin-glb" && record.isDirectDownload && record.licenseId === "CC-BY-4.0"), true);
  assert.equal(keywordPayload.records.some((record) => record.id === "deplorablemountaineer-bowling-ball-pins-pack" && !record.isDirectDownload && record.licenseId === "CC0-1.0"), true);

  const category = await assetCommand(["source", "search", "--game-category", "sports", "--query", "bowling", "--json"]);
  const categoryPayload = JSON.parse(category.stdout) as {
    records: Array<{ id: string }>;
  };

  assert.equal(category.exitCode, 0);
  assert.equal(categoryPayload.records.some((record) => record.id === "deplorablemountaineer-bowling-ball-pins-pack"), true);
});

catalogTest("should only suggest records with lexical goal matches", async () => {
  const result = await assetCommand(["source", "suggest", "--goal", "bowling ball pins alley", "--json"]);
  const payload = JSON.parse(result.stdout) as { records: Array<{ id: string }> };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.records.some((record) => record.id === "babylon-bowling-ball-glb"), true);
  assert.equal(payload.records.some((record) => record.id === "babylon-bowling-pin-glb"), true);
  assert.equal(payload.records.some((record) => record.id === "babylon-grey-snapper-vert-color"), false);
});

catalogTest("should get one asset source record by id", async () => {
  const result = await assetCommand(["source", "get", "babylon-grey-snapper-vert-color", "--json"]);
  const payload = JSON.parse(result.stdout) as {
    record: {
      directName: string;
      downloadUrl: string;
      licenseId: string;
      origin: { originName: string; reviewEvidence: string; reviewStatus: string };
      provenanceUrl: string;
      sourceMetadata: Record<string, string>;
    };
  };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.record.directName, "greySnapper_vertColor");
  assert.match(payload.record.downloadUrl, /greySnapper_vertColor\.glb$/);
  assert.equal(payload.record.licenseId, "CC-BY-4.0");
  assert.match(payload.record.provenanceUrl, /Assets\.md/);
  assert.equal(payload.record.origin.originName, "BabylonJS Assets.md");
  assert.equal(payload.record.origin.reviewStatus, "reviewed");
  assert.match(payload.record.origin.reviewEvidence, /Assets\.md/);
  assert.equal(payload.record.sourceMetadata.upstreamRepository, "BabylonJS/Assets");
});

catalogTest("should not return blocked records unless requested", async () => {
  const result = await assetCommand(["source", "search", "--json"]);
  const payload = JSON.parse(result.stdout) as {
    records: Array<{ licensePosture: string; origin: { reviewStatus: string } }>;
  };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.records.some((record) => record.licensePosture === "blocked" || record.origin.reviewStatus === "blocked"), false);
});

catalogTest("should export jsonl from sqlite catalog", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-source-export-"));
  try {
    const out = join(root, "asset-sources.jsonl");
    const result = await assetCommand(["source", "export", "--format", "jsonl", "--out", out, "--json"]);
    const payload = JSON.parse(result.stdout) as { count: number; outPath: string };
    const summary = await readJsonlSummary(out);

    assert.equal(result.exitCode, 0);
    assert.equal(payload.outPath, out);
    assert.equal(payload.count, summary.count);
    assert.equal(summary.count >= 4, true);
    assert.equal(typeof summary.first.id, "string");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function readJsonlSummary(path: string): Promise<{ count: number; first: { id?: string } }> {
  const lines = createInterface({ crlfDelay: Infinity, input: createReadStream(path, { encoding: "utf8" }) });
  let count = 0;
  let first: { id?: string } = {};
  for await (const line of lines) {
    if (line.length === 0) {
      continue;
    }
    count += 1;
    if (count === 1) {
      first = JSON.parse(line) as { id?: string };
    }
  }
  return { count, first };
}

catalogTest("should suggest asset sources from a goal", async () => {
  const result = await assetCommand(["source", "suggest", "--goal", "underwater fish model", "--json"]);
  const payload = JSON.parse(result.stdout) as { records: Array<{ id: string }> };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.records.some((record) => record.id === "babylon-grey-snapper-vert-color"), true);
});

catalogTest("should resolve catalog from source checkout and packaged layout", async () => {
  const resolved = resolveAssetSourceCatalogPath();
  const found = await findAssetSourceCatalogPath();

  assert.match(resolved, /packages\/cli\/data\/asset-sources\.sqlite$/);
  assert.equal(found, resolved);

  const root = await mkdtemp(join(tmpdir(), "tn-asset-source-packaged-"));
  try {
    await mkdir(join(root, "dist", "assetSourceCatalog"), { recursive: true });
    await mkdir(join(root, "data"), { recursive: true });
    await writeFile(join(root, "dist", "assetSourceCatalog", "catalog.js"), "");
    await copyFile(found, join(root, "data", "asset-sources.sqlite"));
    const packagedUrl = pathToFileURL(join(root, "dist", "assetSourceCatalog", "catalog.js")).href;

    assert.equal(resolveAssetSourceCatalogPath(packagedUrl), join(root, "data", "asset-sources.sqlite"));
    assert.equal(await findAssetSourceCatalogPath(packagedUrl), join(root, "data", "asset-sources.sqlite"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject missing inspect path", async () => {
  const result = await assetCommand(["inspect", "--json"]);
  const payload = JSON.parse(result.stdout) as { code: string; severity: string };

  assert.equal(result.exitCode, 1);
  assert.equal(payload.code, "TN_ASSET_PATH_MISSING");
  assert.equal(payload.severity, "error");
});

function makeGlb(json: unknown, binaryChunk?: Buffer): Buffer {
  const jsonText = JSON.stringify(json);
  const jsonBuffer = Buffer.from(jsonText.padEnd(jsonText.length + ((4 - (jsonText.length % 4)) % 4), " "), "utf8");
  const binPadding = binaryChunk === undefined ? 0 : ((4 - (binaryChunk.length % 4)) % 4);
  const paddedBinary = binaryChunk === undefined ? undefined : Buffer.concat([binaryChunk, Buffer.alloc(binPadding)]);
  const totalLength = 12 + 8 + jsonBuffer.length + (paddedBinary === undefined ? 0 : 8 + paddedBinary.length);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  header.writeUInt32LE(jsonBuffer.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  if (paddedBinary === undefined) {
    return Buffer.concat([header, jsonBuffer]);
  }
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(paddedBinary.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonBuffer, binHeader, paddedBinary]);
}

function makeRoadGlb(kind: "corner" | "straight"): Buffer {
  const grass = [[0, 0, -2], [2, 0, -2], [2, 0, 0], [0, 0, 0]];
  const road = kind === "straight"
    ? [[0.65, 0.01, -2], [1.35, 0.01, -2], [1.35, 0.01, 0], [0.65, 0.01, 0]]
    : [[0.65, 0.01, -1.35], [2, 0.01, -1.35], [2, 0.01, 0], [0.65, 0.01, 0]];
  const roadMin = kind === "straight" ? [0.65, 0.01, -2] : [0.65, 0.01, -1.35];
  const roadMax = kind === "straight" ? [1.35, 0.01, 0] : [2, 0.01, 0];
  const grassBytes = positionsBuffer(grass);
  const roadBytes = positionsBuffer(road);
  const indexBytes = indicesBuffer([0, 1, 2, 0, 2, 3]);
  const roadOffset = grassBytes.length;
  const grassIndexOffset = roadOffset + roadBytes.length;
  const roadIndexOffset = grassIndexOffset + indexBytes.length;
  const binary = Buffer.concat([grassBytes, roadBytes, indexBytes, indexBytes]);
  return makeGlb({
    asset: { version: "2.0", generator: "asset-road-connectors-test" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: [-0.35, -0.01, -0.65] }],
    meshes: [{
      primitives: [
        { attributes: { POSITION: 0 }, indices: 2, material: 0, mode: 4 },
        { attributes: { POSITION: 1 }, indices: 3, material: 1, mode: 4 },
      ],
    }],
    materials: [{ name: "grass" }, { name: "road" }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: grassBytes.length },
      { buffer: 0, byteOffset: roadOffset, byteLength: roadBytes.length },
      { buffer: 0, byteOffset: grassIndexOffset, byteLength: indexBytes.length },
      { buffer: 0, byteOffset: roadIndexOffset, byteLength: indexBytes.length },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: "VEC3", min: [0, 0, -2], max: [2, 0, 0] },
      { bufferView: 1, componentType: 5126, count: 4, type: "VEC3", min: roadMin, max: roadMax },
      { bufferView: 2, componentType: 5123, count: 6, type: "SCALAR" },
      { bufferView: 3, componentType: 5123, count: 6, type: "SCALAR" },
    ],
  }, binary);
}

function positionsBuffer(positions: number[][]): Buffer {
  const buffer = Buffer.alloc(positions.length * 12);
  positions.forEach((position, index) => {
    buffer.writeFloatLE(position[0] ?? 0, index * 12);
    buffer.writeFloatLE(position[1] ?? 0, index * 12 + 4);
    buffer.writeFloatLE(position[2] ?? 0, index * 12 + 8);
  });
  return buffer;
}

function indicesBuffer(indices: number[]): Buffer {
  const buffer = Buffer.alloc(indices.length * 2);
  indices.forEach((index, offset) => buffer.writeUInt16LE(index, offset * 2));
  return buffer;
}

function restoreInitCwd(previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env.INIT_CWD;
  } else {
    process.env.INIT_CWD = previous;
  }
}
