#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdtemp, open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultSchema = resolve(root, "docs/data/asset-sources.schema.sql");
const defaultSeed = resolve(root, "docs/data/asset-sources.seed.jsonl");
const defaultWorkflowDoc = resolve(root, "docs/workflows/open-source-3d-asset-kits.md");
const defaultOs3aSnapshot = resolve(root, "docs/data/os3a-asset-sources.snapshot.json");
const defaultPolyhavenSnapshot = resolve(root, "docs/data/polyhaven-asset-sources.snapshot.json");
const defaultAmbientcgSnapshot = resolve(root, "docs/data/ambientcg-asset-sources.snapshot.json");
const defaultOut = resolve(root, "packages/cli/data/asset-sources.sqlite");
const schemaVersion = "1";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const schemaPath = resolve(root, args.schema ?? defaultSchema);
  const seedPath = resolve(root, args.seed ?? defaultSeed);
  const workflowDocPath = resolve(root, args.workflowDoc ?? defaultWorkflowDoc);
  const os3aSnapshotPath = resolve(root, args.os3aSnapshot ?? defaultOs3aSnapshot);
  const polyhavenSnapshotPath = resolve(root, args.polyhavenSnapshot ?? defaultPolyhavenSnapshot);
  const ambientcgSnapshotPath = resolve(root, args.ambientcgSnapshot ?? defaultAmbientcgSnapshot);
  const outPath = resolve(root, args.out ?? defaultOut);
  const records = dedupeRecords([
    ...await readSeed(seedPath),
    ...await readWorkflowDocRecords(workflowDocPath),
    ...await readOs3aSnapshotRecords(os3aSnapshotPath),
    ...await readPolyhavenSnapshotRecords(polyhavenSnapshotPath),
    ...await readAmbientcgSnapshotRecords(ambientcgSnapshotPath),
    ...readCuratedDirectRecords(),
  ]);
  validateRecords(records);

  if (args.check) {
    const temp = await mkdtemp(resolve(tmpdir(), "tn-asset-sources-"));
    try {
      const checkDb = resolve(temp, "asset-sources.sqlite");
      const report = await buildCatalog({ outPath: checkDb, records, ambientcgSnapshotPath, os3aSnapshotPath, polyhavenSnapshotPath, schemaPath, seedPath, workflowDocPath });
      const current = await readFile(outPath);
      const generated = await readFile(checkDb);
      if (!current.equals(generated)) {
        throw new Error(`Asset source catalog is stale. Run: node scripts/build-asset-source-catalog.mjs`);
      }
      printReport(report, true);
    } finally {
      await rm(temp, { force: true, recursive: true });
    }
    return;
  }

  const report = await buildCatalog({ outPath, records, ambientcgSnapshotPath, os3aSnapshotPath, polyhavenSnapshotPath, schemaPath, seedPath, workflowDocPath });
  printReport(report, false);
}

function dedupeRecords(records) {
  const seen = new Set();
  return records.filter((record) => {
    const key = record.file.id;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function readCuratedDirectRecords() {
  return [
    ...directRepoRecords({
      category: "racing",
      creator: "Kenney",
      defaultTags: ["racing", "kenney", "glb"],
      licenseEvidence: "Workflow doc identifies Kenney Starter Kit Racing as MIT code with included CC0 assets; repository exposes direct GLB models.",
      originLine: 143,
      originName: "Kenney Starter Kit Racing",
      originRef: "f5241ebdf00c25bc951bf4fdb7950bb1b78b4bcc",
      repo: "KenneyNL/Starter-Kit-Racing",
      section: "Kenney Shortlist",
      sourceRoot: "models",
      files: [
        ["decoration-empty", "models/decoration-empty.glb", 55764],
        ["decoration-forest", "models/decoration-forest.glb", 189784],
        ["decoration-tents", "models/decoration-tents.glb", 168004],
        ["track-bump", "models/track-bump.glb", 17888],
        ["track-corner", "models/track-corner.glb", 103480],
        ["track-finish", "models/track-finish.glb", 24544],
        ["track-straight", "models/track-straight.glb", 11080],
        ["track-tents", "models/track-tents.glb", 167988],
        ["vehicle-motorcycle", "models/vehicle-motorcycle.glb", 97172],
        ["vehicle-truck-green", "models/vehicle-truck-green.glb", 104228],
        ["vehicle-truck-purple", "models/vehicle-truck-purple.glb", 78552],
        ["vehicle-truck-red", "models/vehicle-truck-red.glb", 92436],
        ["vehicle-truck-yellow", "models/vehicle-truck-yellow.glb", 93480],
      ],
    }),
    ...directRepoRecords({
      category: "platformer",
      creator: "Kenney",
      defaultTags: ["platformer", "kenney", "glb"],
      licenseEvidence: "Workflow doc identifies Kenney Starter Kit 3D Platformer as MIT code with included CC0 assets; repository exposes direct GLB models.",
      originLine: 145,
      originName: "Kenney Starter Kit 3D Platformer",
      originRef: "3fa8a04b1c01ab23db43123d4ce814a34c3fc7f0",
      repo: "KenneyNL/Starter-Kit-3D-Platformer",
      section: "Kenney Shortlist",
      sourceRoot: "models",
      files: [
        ["block-coin", "models/block-coin.glb"],
        ["brick-particle", "models/brick-particle.glb"],
        ["brick", "models/brick.glb"],
        ["character", "models/character.glb"],
        ["cloud", "models/cloud.glb"],
        ["coin", "models/coin.glb"],
        ["dust", "models/dust.glb"],
        ["flag", "models/flag.glb"],
        ["grass-small", "models/grass-small.glb"],
        ["grass", "models/grass.glb"],
        ["platform-falling", "models/platform-falling.glb"],
        ["platform-grass-large-round", "models/platform-grass-large-round.glb"],
        ["platform-large", "models/platform-large.glb"],
        ["platform-medium", "models/platform-medium.glb"],
        ["platform", "models/platform.glb"],
      ],
    }),
    ...directRepoRecords({
      category: "rpg-adventure",
      creator: "Kenney",
      defaultTags: ["arena", "rpg-adventure", "kenney", "glb"],
      licenseEvidence: "Workflow doc identifies Kenney Starter Kit Basic Scene as MIT code with included CC0 assets; repository exposes direct Mini Arena GLB models.",
      originLine: 146,
      originName: "Kenney Starter Kit Basic Scene",
      originRef: "a6927e66ff8dd8e173660ce4825abe773c65f683",
      repo: "KenneyNL/Starter-Kit-Basic-Scene",
      section: "Kenney Shortlist",
      sourceRoot: "sample/Mini Arena/Models/GLB format",
      files: [
        ["banner", "sample/Mini Arena/Models/GLB format/banner.glb", 22108],
        ["block", "sample/Mini Arena/Models/GLB format/block.glb", 2804],
        ["border-corner", "sample/Mini Arena/Models/GLB format/border-corner.glb", 11124],
        ["border-straight", "sample/Mini Arena/Models/GLB format/border-straight.glb", 6520],
        ["bricks", "sample/Mini Arena/Models/GLB format/bricks.glb", 13192],
        ["character-soldier", "sample/Mini Arena/Models/GLB format/character-soldier.glb", 215704],
        ["column-damaged", "sample/Mini Arena/Models/GLB format/column-damaged.glb", 14308],
        ["column", "sample/Mini Arena/Models/GLB format/column.glb", 17140],
        ["floor-detail", "sample/Mini Arena/Models/GLB format/floor-detail.glb", 6484],
        ["floor", "sample/Mini Arena/Models/GLB format/floor.glb", 1796],
        ["stairs-corner-inner", "sample/Mini Arena/Models/GLB format/stairs-corner-inner.glb", 7584],
        ["stairs-corner", "sample/Mini Arena/Models/GLB format/stairs-corner.glb", 8752],
        ["stairs", "sample/Mini Arena/Models/GLB format/stairs.glb", 5244],
        ["statue", "sample/Mini Arena/Models/GLB format/statue.glb", 51012],
        ["tree", "sample/Mini Arena/Models/GLB format/tree.glb", 34164],
        ["trophy", "sample/Mini Arena/Models/GLB format/trophy.glb", 23752],
        ["wall-corner", "sample/Mini Arena/Models/GLB format/wall-corner.glb", 22476],
        ["wall-gate", "sample/Mini Arena/Models/GLB format/wall-gate.glb", 31064],
        ["wall", "sample/Mini Arena/Models/GLB format/wall.glb", 16000],
        ["weapon-rack", "sample/Mini Arena/Models/GLB format/weapon-rack.glb", 20056],
        ["weapon-spear", "sample/Mini Arena/Models/GLB format/weapon-spear.glb", 7152],
        ["weapon-sword", "sample/Mini Arena/Models/GLB format/weapon-sword.glb", 9340],
      ],
    }),
    ...directRepoRecords({
      category: "underwater",
      creator: "Babylon.js Assets contributors",
      defaultTags: ["underwater", "babylon", "glb"],
      licenseEvidence: "Workflow doc identifies Babylon.js Assets as an underwater and cross-engine GLB source; repository README says CC BY 4.0 unless folder-specific terms differ.",
      licenseId: "CC-BY-4.0",
      licensePosture: "permissive-attribution",
      attributionRequired: 1,
      originLine: 266,
      originName: "Babylon.js Assets",
      originRef: "070cf3313f6730f836ffaef879276d506f74df38",
      repo: "BabylonJS/Assets",
      section: "glTF And Loader Test Sources",
      sourceRoot: "meshes/Demos/UnderWaterScene",
      files: [
        ["greySnapper_vertColor", "meshes/Demos/UnderWaterScene/fish/greySnapper_vertColor.glb"],
        ["underwaterGround", "meshes/Demos/UnderWaterScene/ground/underwaterGround.glb"],
        ["underwaterSceneNavMesh", "meshes/Demos/UnderWaterScene/navMesh/underwaterSceneNavMesh.glb"],
        ["underwaterSceneShadowCatcher", "meshes/Demos/UnderWaterScene/shadows/underwaterSceneShadowCatcher.glb"],
        ["underwaterScene", "meshes/Demos/UnderWaterScene/underwaterScene.glb"],
        ["underwaterSceneRocksBarnaclesMussels", "meshes/Demos/UnderWaterScene/underwaterSceneRocksBarnaclesMussels.glb"],
      ],
    }),
    ...directRepoRecords({
      category: "loader-conformance",
      creator: "Khronos Group sample contributors",
      defaultTags: ["gltf", "loader", "fixture", "khronos"],
      licenseEvidence: "Workflow doc identifies Khronos glTF Sample Assets as primary loader coverage; repository provides direct binary glTF assets with per-model metadata.",
      originLine: 249,
      originName: "Khronos glTF Sample Assets",
      originRef: "2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf",
      repo: "KhronosGroup/glTF-Sample-Assets",
      section: "glTF And Loader Test Sources",
      sourceRoot: "Models",
      files: [
        ["Avocado", "Models/Avocado/glTF-Binary/Avocado.glb"],
        ["BarramundiFish", "Models/BarramundiFish/glTF-Binary/BarramundiFish.glb"],
        ["BoomBox", "Models/BoomBox/glTF-Binary/BoomBox.glb"],
        ["Box", "Models/Box/glTF-Binary/Box.glb"],
        ["BoxTextured", "Models/BoxTextured/glTF-Binary/BoxTextured.glb"],
        ["CarConcept", "Models/CarConcept/glTF-Binary/CarConcept.glb"],
        ["CesiumMan", "Models/CesiumMan/glTF-Binary/CesiumMan.glb"],
        ["CesiumMilkTruck", "Models/CesiumMilkTruck/glTF-Binary/CesiumMilkTruck.glb"],
        ["DamagedHelmet", "Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb"],
        ["Duck", "Models/Duck/glTF-Binary/Duck.glb"],
        ["Fox", "Models/Fox/glTF-Binary/Fox.glb"],
        ["Lantern", "Models/Lantern/glTF-Binary/Lantern.glb"],
        ["MetalRoughSpheres", "Models/MetalRoughSpheres/glTF-Binary/MetalRoughSpheres.glb"],
        ["RiggedFigure", "Models/RiggedFigure/glTF-Binary/RiggedFigure.glb"],
        ["ToyCar", "Models/ToyCar/glTF-Binary/ToyCar.glb"],
        ["VirtualCity", "Models/VirtualCity/glTF-Binary/VirtualCity.glb"],
      ],
    }),
  ];
}

function directRepoRecords(config) {
  const branch = config.branch ?? "main";
  const encodedSourceRoot = encodePath(config.sourceRoot);
  return config.files.map(([directName, path, byteSize]) => {
    const slug = slugify(`${config.repo}-${directName}`);
    const encodedPath = encodePath(path);
    const tags = [...new Set([...config.defaultTags, ...directName.toLowerCase().split(/[-_\s]+/u).filter(Boolean)])];
    return {
      origin: {
        id: `origin-direct-${slug}`,
        originType: "repository",
        originName: config.originName,
        originUrl: `https://github.com/${config.repo}`,
        originPath: path,
        originSection: config.section,
        originRef: config.originRef,
        originLineStart: config.originLine,
        originLineEnd: config.originLine,
        importerName: "curated-direct-records",
        importerVersion: "1",
        importedOn: "2026-07-02",
        reviewStatus: "reviewed",
        reviewEvidence: config.licenseEvidence,
        notes: `Direct ${config.category} GLB from curated workflow source.`,
      },
      source: {
        id: `source-direct-${slug}`,
        name: `${config.originName} ${directName}`,
        sourceKind: "direct-file",
        sourceUrl: `https://github.com/${config.repo}/tree/${branch}/${encodedSourceRoot}`,
        provenanceUrl: `https://github.com/${config.repo}/blob/${branch}/${encodedPath}`,
        creator: config.creator,
        licenseId: config.licenseId ?? "CC0-1.0",
        licenseUrl: `https://github.com/${config.repo}`,
        licensePosture: config.licensePosture ?? "cc0",
        redistributionAllowed: 1,
        attributionRequired: config.attributionRequired ?? 0,
        notes: `Direct GLB ${directName} from ${config.originName}.`,
        cautions: "Preserve upstream provenance and inspect bounds, scale, materials, and dependencies before scene use.",
        reviewedOn: "2026-07-02",
        reviewedBy: "repo-curation",
      },
      file: {
        id: `${slug}-glb`,
        directName,
        gameCategory: categoryForDirectAsset(config.category, directName),
        downloadUrl: `https://raw.githubusercontent.com/${config.repo}/${branch}/${encodedPath}`,
        format: "glb",
        fileRole: "model",
        previewUrl: `https://github.com/${config.repo}/blob/${branch}/${encodedPath}`,
        sha256: null,
        byteSize: byteSize ?? null,
        engineFit: "web-and-native",
        importNotes: "Direct catalog record generated from curated workflow source; run tn asset inspect and tn model-test after download.",
        isDirectDownload: 1,
      },
      tags,
      sourceMetadata: {
        upstreamRepository: config.repo,
        sourcePath: path,
        workflowDocPath: "docs/workflows/open-source-3d-asset-kits.md",
        workflowDocSection: config.section,
      },
    };
  });
}

function categoryForDirectAsset(defaultCategory, name) {
  const lower = name.toLowerCase();
  if (lower.includes("tree") || lower.includes("forest") || lower.includes("grass")) {
    return "nature-terrain";
  }
  if (lower.includes("wall") || lower.includes("floor") || lower.includes("stairs") || lower.includes("border")) {
    return "dungeon-crawler";
  }
  if (lower.includes("car") || lower.includes("truck") || lower.includes("vehicle") || lower.includes("track")) {
    return "racing";
  }
  if (lower.includes("fish") || lower.includes("underwater")) {
    return "underwater";
  }
  if (lower.includes("rigged") || lower.includes("fox") || lower.includes("cesiumman")) {
    return "animation-skinning";
  }
  if (lower.includes("city")) {
    return "city-builder";
  }
  return defaultCategory;
}

function encodePath(path) {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

async function readSeed(seedPath) {
  const text = await readFile(seedPath, "utf8");
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSONL at ${seedPath}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
}

async function buildCatalog({ outPath, records, ambientcgSnapshotPath, os3aSnapshotPath, polyhavenSnapshotPath, schemaPath, seedPath, workflowDocPath }) {
  const schema = await readFile(schemaPath, "utf8");
  const workflowDoc = await readFile(workflowDocPath, "utf8");
  const ambientcgSnapshot = await readFile(ambientcgSnapshotPath, "utf8");
  const os3aSnapshot = await readFile(os3aSnapshotPath, "utf8");
  const polyhavenSnapshot = await readFile(polyhavenSnapshotPath, "utf8");
  await mkdir(dirname(outPath), { recursive: true });
  const tempSql = `${outPath}.sql`;
  await rm(outPath, { force: true });
  await rm(tempSql, { force: true });
  const sqlFile = await open(tempSql, "w");
  try {
    await sqlFile.writeFile(`${schema}\nBEGIN;\n`);
    await sqlFile.writeFile(`${[
      insert("catalog_meta", { key: "schema_version", value: schemaVersion }),
      insert("catalog_meta", { key: "seed_sha256", value: hashText(await readFile(seedPath, "utf8")) }),
      insert("catalog_meta", { key: "workflow_doc_sha256", value: hashText(workflowDoc) }),
      insert("catalog_meta", { key: "ambientcg_snapshot_sha256", value: hashText(ambientcgSnapshot) }),
      insert("catalog_meta", { key: "os3a_snapshot_sha256", value: hashText(os3aSnapshot) }),
      insert("catalog_meta", { key: "polyhaven_snapshot_sha256", value: hashText(polyhavenSnapshot) }),
      insert("catalog_meta", { key: "builder", value: "scripts/build-asset-source-catalog.mjs" }),
      insert("catalog_meta", { key: "built_on", value: "deterministic" }),
    ].join("\n")}\n`);
    for (const record of records) {
      await sqlFile.writeFile(`${sqlForRecord(record).join("\n")}\n`);
    }
    await sqlFile.writeFile("COMMIT;\nPRAGMA foreign_key_check;\nVACUUM;\n");
  } finally {
    await sqlFile.close();
  }
  const result = spawnSync("sqlite3", [outPath, `.read ${tempSql}`], { encoding: "utf8" });
  await rm(tempSql, { force: true });
  if (result.status !== 0) {
    throw new Error(`sqlite3 failed while building asset source catalog:\n${result.stderr || result.stdout}`);
  }
  return summarize(outPath);
}

async function readOs3aSnapshotRecords(snapshotPath) {
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  if (!Array.isArray(snapshot.projects)) {
    throw new Error(`Invalid OS3A snapshot at ${snapshotPath}: projects array is required.`);
  }
  return snapshot.projects.flatMap((project) => {
    const assets = Array.isArray(project.assets) ? project.assets : [];
    return assets
      .filter((asset) => typeof asset.modelFileUrl === "string" && asset.modelFileUrl.endsWith(".glb"))
      .map((asset) => os3aRecord({ asset, project, snapshotPath }));
  });
}

async function readPolyhavenSnapshotRecords(snapshotPath) {
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  if (!Array.isArray(snapshot.assets)) {
    throw new Error(`Invalid Poly Haven snapshot at ${snapshotPath}: assets array is required.`);
  }
  return snapshot.assets.map((asset) => polyhavenRecord({ asset, snapshotPath }));
}

function polyhavenRecord({ asset, snapshotPath }) {
  const id = `polyhaven-${asset.type}-${slugify(asset.id)}`;
  const text = [
    asset.type,
    asset.name,
    asset.category,
    ...(Array.isArray(asset.categories) ? asset.categories : []),
    ...(Array.isArray(asset.tags) ? asset.tags : []),
    asset.description,
  ].filter(Boolean).join(" ");
  const category = categoryForPolyhavenAsset(asset, text);
  const role = fileRoleForPolyhavenAsset(asset);
  const format = formatForPolyhavenAsset(asset);
  const sourceUrl = `https://polyhaven.com/a/${encodeURIComponent(asset.id)}`;
  const provenanceUrl = `https://api.polyhaven.com/assets?t=${encodeURIComponent(asset.type)}`;
  return {
    origin: {
      id: `origin-${id}`,
      originType: "api",
      originName: `Poly Haven ${asset.type}`,
      originUrl: "https://polyhaven.com",
      originPath: snapshotPath,
      originSection: asset.type,
      originRef: asset.filesHash ?? asset.id,
      originLineStart: null,
      originLineEnd: null,
      importerName: "polyhaven-api-snapshot",
      importerVersion: "1",
      importedOn: "2026-07-02",
      reviewStatus: "reviewed",
      reviewEvidence: "Poly Haven publishes CC0 HDRIs, textures, and models; snapshot records authoritative Poly Haven API metadata for game lighting, skyboxes, and PBR surface treatment.",
      notes: asset.description ?? "",
    },
    source: {
      id: `source-${id}`,
      name: `Poly Haven ${asset.name}`,
      sourceKind: "index",
      sourceUrl,
      provenanceUrl,
      creator: polyhavenCreators(asset),
      licenseId: "CC0-1.0",
      licenseUrl: "https://polyhaven.com/license",
      licensePosture: "cc0",
      redistributionAllowed: 1,
      attributionRequired: 0,
      notes: asset.description ?? "",
      cautions: "Index record only; choose exact resolution/maps from Poly Haven, preserve files hash/API provenance, and verify color space, texture scale, and runtime format before committing assets.",
      reviewedOn: "2026-07-02",
      reviewedBy: "repo-curation",
    },
    file: {
      id,
      directName: asset.name,
      gameCategory: category,
      downloadUrl: null,
      format,
      fileRole: role,
      previewUrl: asset.thumbnailUrl ?? sourceUrl,
      sha256: null,
      byteSize: null,
      engineFit: "web-and-native",
      importNotes: polyhavenImportNotes(asset),
      isDirectDownload: 0,
    },
    tags: tagsForWorkflowRow(`${text} ${category} ${role} ${format} poly haven cc0`).slice(0, 16),
    sourceMetadata: {
      polyhavenAssetId: asset.id,
      polyhavenType: asset.type,
      polyhavenCategory: asset.category ?? "",
      polyhavenCategories: Array.isArray(asset.categories) ? asset.categories.join("|") : "",
      polyhavenTags: Array.isArray(asset.tags) ? asset.tags.join("|") : "",
      polyhavenFilesHash: asset.filesHash ?? "",
      polyhavenMaxResolution: Array.isArray(asset.maxResolution) ? asset.maxResolution.join("x") : "",
      polyhavenDimensions: asset.dimensions ?? "",
      polyhavenPolycount: asset.polycount ?? "",
      polyhavenDownloadCount: asset.downloadCount ?? "",
      polyhavenSnapshotPath: snapshotPath,
    },
  };
}

function polyhavenCreators(asset) {
  if (asset.authors !== null && typeof asset.authors === "object" && !Array.isArray(asset.authors)) {
    return Object.keys(asset.authors).filter(Boolean).join(", ") || "Poly Haven contributors";
  }
  return "Poly Haven contributors";
}

function fileRoleForPolyhavenAsset(asset) {
  if (asset.type === "hdri") {
    return "hdri-index";
  }
  if (asset.type === "texture") {
    return "material-index";
  }
  if (asset.type === "model") {
    return "model-index";
  }
  return "index";
}

function formatForPolyhavenAsset(asset) {
  if (asset.type === "hdri") {
    return "hdr";
  }
  if (asset.type === "texture") {
    return "texture-set";
  }
  if (asset.type === "model") {
    return "model-pack";
  }
  return "unknown";
}

function polyhavenImportNotes(asset) {
  if (asset.type === "hdri") {
    return "CC0 HDRI/skybox/IBL index record from Poly Haven; pick an HDR or EXR resolution, verify exposure, rotation, background visibility, and environment lighting before scene use.";
  }
  if (asset.type === "texture") {
    return "CC0 PBR material index record from Poly Haven; pick required maps/resolution, verify albedo color space, normal orientation, roughness/metalness packing, and UV scale.";
  }
  if (asset.type === "model") {
    return "CC0 model index record from Poly Haven; choose exact format, inspect mesh bounds/material dependencies, and run tn asset inspect plus tn model-test after download.";
  }
  return "CC0 Poly Haven index record; resolve exact downloadable files and verify runtime compatibility before use.";
}

function categoryForPolyhavenAsset(asset, text) {
  const lower = text.toLowerCase();
  if (asset.type === "hdri") {
    if (lower.includes("indoor") || lower.includes("interior") || lower.includes("room") || lower.includes("studio")) {
      return "cozy-interiors";
    }
    if (lower.includes("road") || lower.includes("street") || lower.includes("garage") || lower.includes("parking") || lower.includes("track")) {
      return "racing";
    }
    if (lower.includes("city") || lower.includes("urban") || lower.includes("building")) {
      return "city-builder";
    }
    if (lower.includes("night") || lower.includes("space") || lower.includes("star")) {
      return "space";
    }
    if (lower.includes("forest") || lower.includes("field") || lower.includes("mountain") || lower.includes("nature") || lower.includes("outdoor") || lower.includes("beach") || lower.includes("desert")) {
      return "skybox-hdri";
    }
    return "pbr-test";
  }
  if (asset.type === "texture") {
    if (lower.includes("asphalt") || lower.includes("road") || lower.includes("tarmac") || lower.includes("track")) {
      return "racing";
    }
    if (lower.includes("grass") || lower.includes("soil") || lower.includes("mud") || lower.includes("rock") || lower.includes("ground") || lower.includes("terrain") || lower.includes("sand")) {
      return "nature-terrain";
    }
    if (lower.includes("brick") || lower.includes("tile") || lower.includes("wall") || lower.includes("plaster") || lower.includes("floor") || lower.includes("wood") || lower.includes("fabric") || lower.includes("leather")) {
      return "cozy-interiors";
    }
    if (lower.includes("concrete") || lower.includes("metal") || lower.includes("industrial")) {
      return "city-builder";
    }
    return "pbr-test";
  }
  if (asset.type === "model") {
    return categoryForWorkflowRow(lower);
  }
  return categoryForWorkflowRow(lower);
}

async function readAmbientcgSnapshotRecords(snapshotPath) {
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  if (!Array.isArray(snapshot.assets)) {
    throw new Error(`Invalid ambientCG snapshot at ${snapshotPath}: assets array is required.`);
  }
  return snapshot.assets.flatMap((asset) => ambientcgRecords({ asset, snapshotPath }));
}

function ambientcgRecords({ asset, snapshotPath }) {
  const variants = ambientcgVariantsForAsset(asset);
  const records = variants.map((variant) => ambientcgRecord({ asset, snapshotPath, variant }));
  if (ambientcgSupportsMaterialMaps(asset)) {
    records.push(...ambientcgMaterialMapRecords({ asset, snapshotPath }));
  }
  return records;
}

function ambientcgVariantsForAsset(asset) {
  const type = String(asset.dataType ?? "");
  if (type === "HDRI" || type === "HDRIElement") {
    return ["1K", "2K", "4K", "8K"];
  }
  if (type === "3DModel") {
    return ["1K-JPG", "2K-JPG", "4K-JPG", "1K-PNG"];
  }
  return ["1K-JPG", "2K-JPG", "4K-JPG", "8K-JPG"];
}

function ambientcgRecord({ asset, snapshotPath, variant }) {
  const assetId = String(asset.assetId);
  const recordId = `ambientcg-${slugify(assetId)}-${slugify(variant)}`;
  const text = [
    asset.dataType,
    asset.dataTypeName,
    asset.dataTypeDescription,
    asset.creationMethod,
    asset.creationMethodName,
    asset.displayName,
    asset.displayCategory,
    asset.category,
    ...(Array.isArray(asset.tags) ? asset.tags : []),
    asset.description,
  ].filter(Boolean).join(" ");
  const sourceUrl = asset.shortLink ?? `https://ambientcg.com/a/${encodeURIComponent(assetId)}`;
  const fileName = `${assetId}_${variant}.zip`;
  return {
    origin: {
      id: `origin-${recordId}`,
      originType: "api",
      originName: `ambientCG ${asset.dataType}`,
      originUrl: "https://ambientcg.com",
      originPath: snapshotPath,
      originSection: asset.dataType ?? null,
      originRef: assetId,
      originLineStart: null,
      originLineEnd: null,
      importerName: "ambientcg-api-snapshot",
      importerVersion: "1",
      importedOn: "2026-07-02",
      reviewStatus: "reviewed",
      reviewEvidence: "ambientCG publishes CC0 materials, HDRIs, decals, atlases, terrains, brushes, and models; snapshot records API metadata and deterministic standard ZIP bundle candidates.",
      notes: asset.description ?? "",
    },
    source: {
      id: `source-${recordId}`,
      name: `ambientCG ${asset.displayName ?? assetId} ${variant}`,
      sourceKind: "index",
      sourceUrl,
      provenanceUrl: snapshotPath,
      creator: "ambientCG contributors",
      licenseId: "CC0-1.0",
      licenseUrl: "https://ambientcg.com/license",
      licensePosture: "cc0",
      redistributionAllowed: 1,
      attributionRequired: 0,
      notes: asset.dataTypeDescription ?? asset.description ?? "",
      cautions: "Download candidate generated from ambientCG API metadata; verify selected ZIP exists, map set, color space, normal convention, and texture scale before committing runtime assets.",
      reviewedOn: "2026-07-02",
      reviewedBy: "repo-curation",
    },
    file: {
      id: recordId,
      directName: `${asset.displayName ?? assetId} ${variant}`,
      gameCategory: categoryForAmbientcgAsset(asset, text),
      downloadUrl: `https://ambientcg.com/get?file=${encodeURIComponent(fileName)}`,
      format: "zip",
      fileRole: fileRoleForAmbientcgAsset(asset),
      previewUrl: asset.previewUrl ?? sourceUrl,
      sha256: null,
      byteSize: null,
      engineFit: "web-and-native",
      importNotes: ambientcgImportNotes(asset, variant),
      isDirectDownload: 0,
    },
    tags: tagsForWorkflowRow(`${text} ${variant} ${categoryForAmbientcgAsset(asset, text)} ${fileRoleForAmbientcgAsset(asset)} ambientcg cc0`).slice(0, 16),
    sourceMetadata: {
      ambientcgAssetId: assetId,
      ambientcgDataType: asset.dataType ?? "",
      ambientcgDisplayCategory: asset.displayCategory ?? "",
      ambientcgVariant: variant,
      ambientcgReleaseDate: asset.releaseDate ?? "",
      ambientcgTags: Array.isArray(asset.tags) ? asset.tags.join("|") : "",
      ambientcgDimensions: [asset.dimensionX, asset.dimensionY, asset.dimensionZ].filter((value) => value !== null && value !== undefined).join("x"),
      ambientcgDownloadCount: asset.downloadCount ?? "",
      ambientcgPopularityScore: asset.popularityScore ?? "",
      ambientcgSnapshotPath: snapshotPath,
    },
  };
}

function ambientcgSupportsMaterialMaps(asset) {
  return ["Atlas", "Brush", "Decal", "Material", "PlainTexture", "Substance", "Terrain"].includes(String(asset.dataType ?? ""));
}

function ambientcgMaterialMapRecords({ asset, snapshotPath }) {
  return ambientcgMaterialMapVariants().map((variant) => ambientcgMaterialMapRecord({ asset, snapshotPath, variant }));
}

function ambientcgMaterialMapVariants() {
  const resolutions = ["1K", "2K", "4K", "8K"];
  const encodings = ["JPG", "PNG"];
  const maps = ["Color", "NormalDX", "Roughness", "Displacement", "AmbientOcclusion"];
  return resolutions.flatMap((resolution) =>
    encodings.flatMap((encoding) =>
      maps.map((map) => ({ encoding, map, resolution, zipVariant: `${resolution}-${encoding}` })),
    ),
  );
}

function ambientcgMaterialMapRecord({ asset, snapshotPath, variant }) {
  const assetId = String(asset.assetId);
  const assetSlug = slugify(assetId);
  const mapSlug = slugify(`${variant.resolution}-${variant.encoding}-${variant.map}`);
  const recordId = `ambientcg-map-${assetSlug}-${mapSlug}`;
  const text = [
    asset.dataType,
    asset.dataTypeName,
    asset.dataTypeDescription,
    asset.creationMethod,
    asset.creationMethodName,
    asset.displayName,
    asset.displayCategory,
    asset.category,
    ...(Array.isArray(asset.tags) ? asset.tags : []),
    asset.description,
    variant.map,
  ].filter(Boolean).join(" ");
  const sourceUrl = asset.shortLink ?? `https://ambientcg.com/a/${encodeURIComponent(assetId)}`;
  const zipFileName = `${assetId}_${variant.zipVariant}.zip`;
  const category = categoryForAmbientcgAsset(asset, text);
  return {
    origin: {
      id: `origin-ambientcg-asset-${assetSlug}`,
      originType: "api",
      originName: `ambientCG ${asset.dataType}`,
      originUrl: "https://ambientcg.com",
      originPath: snapshotPath,
      originSection: asset.dataType ?? null,
      originRef: assetId,
      originLineStart: null,
      originLineEnd: null,
      importerName: "ambientcg-api-snapshot",
      importerVersion: "1",
      importedOn: "2026-07-02",
      reviewStatus: "reviewed",
      reviewEvidence: "ambientCG publishes CC0 PBR materials and texture sets; this record identifies a standard material map candidate inside a deterministic ambientCG ZIP bundle.",
      notes: asset.description ?? "",
    },
    source: {
      id: `source-ambientcg-asset-${assetSlug}`,
      name: `ambientCG ${asset.displayName ?? assetId}`,
      sourceKind: "index",
      sourceUrl,
      provenanceUrl: snapshotPath,
      creator: "ambientCG contributors",
      licenseId: "CC0-1.0",
      licenseUrl: "https://ambientcg.com/license",
      licensePosture: "cc0",
      redistributionAllowed: 1,
      attributionRequired: 0,
      notes: asset.dataTypeDescription ?? asset.description ?? "",
      cautions: "Material map candidate generated from ambientCG API metadata; verify the selected ZIP/map exists, color space, normal convention, and UV scale before committing runtime assets.",
      reviewedOn: "2026-07-02",
      reviewedBy: "repo-curation",
    },
    file: {
      id: recordId,
      directName: `${asset.displayName ?? assetId} ${variant.resolution} ${variant.encoding} ${variant.map}`,
      gameCategory: category,
      downloadUrl: `https://ambientcg.com/get?file=${encodeURIComponent(zipFileName)}`,
      format: "zip-map",
      fileRole: "material-index",
      previewUrl: asset.previewUrl ?? sourceUrl,
      sha256: null,
      byteSize: null,
      engineFit: "web-and-native",
      importNotes: `CC0 ambientCG ${variant.map} map candidate in ${variant.zipVariant} ZIP; verify map availability, color space, and channel usage before material authoring.`,
      isDirectDownload: 0,
    },
    tags: tagsForWorkflowRow(`${text} ${variant.resolution} ${variant.encoding} ${variant.map} ${category} material-index ambientcg cc0`).slice(0, 16),
    sourceMetadata: {
      ambientcgAssetId: assetId,
      ambientcgDataType: asset.dataType ?? "",
      ambientcgMapKind: variant.map,
      ambientcgMapResolution: variant.resolution,
      ambientcgMapEncoding: variant.encoding,
      ambientcgZipVariant: variant.zipVariant,
      ambientcgDisplayCategory: asset.displayCategory ?? "",
      ambientcgSnapshotPath: snapshotPath,
    },
  };
}

function fileRoleForAmbientcgAsset(asset) {
  switch (asset.dataType) {
    case "HDRI":
    case "HDRIElement":
      return "hdri-index";
    case "3DModel":
      return "model-index";
    case "Decal":
      return "decal-index";
    case "Atlas":
      return "atlas-index";
    case "Terrain":
      return "terrain-index";
    case "Brush":
      return "brush-index";
    case "PlainTexture":
      return "texture-index";
    case "Material":
    case "Substance":
    default:
      return "material-index";
  }
}

function ambientcgImportNotes(asset, variant) {
  if (asset.dataType === "HDRI" || asset.dataType === "HDRIElement") {
    return `CC0 ambientCG HDRI ZIP candidate (${variant}); verify exposure, rotation, resolution, and whether it should be authored as skybox, reflection, or IBL before use.`;
  }
  if (asset.dataType === "3DModel") {
    return `CC0 ambientCG model ZIP candidate (${variant}); inspect mesh bounds, material dependencies, and runtime format after download.`;
  }
  return `CC0 ambientCG PBR texture ZIP candidate (${variant}); verify map names, albedo color space, normal convention, roughness/metalness workflow, and UV scale before use.`;
}

function categoryForAmbientcgAsset(asset, text) {
  const lower = text.toLowerCase();
  if (asset.dataType === "HDRI" || asset.dataType === "HDRIElement") {
    if (lower.includes("studio") || lower.includes("indoor") || lower.includes("room") || lower.includes("interior")) {
      return "cozy-interiors";
    }
    if (lower.includes("road") || lower.includes("street") || lower.includes("parking") || lower.includes("garage")) {
      return "racing";
    }
    if (lower.includes("city") || lower.includes("urban") || lower.includes("building")) {
      return "city-builder";
    }
    return "skybox-hdri";
  }
  if (lower.includes("asphalt") || lower.includes("road") || lower.includes("tarmac") || lower.includes("street")) {
    return "racing";
  }
  if (lower.includes("soil") || lower.includes("grass") || lower.includes("ground") || lower.includes("rock") || lower.includes("mud") || lower.includes("sand") || lower.includes("terrain") || lower.includes("leaf")) {
    return "nature-terrain";
  }
  if (lower.includes("brick") || lower.includes("tile") || lower.includes("wall") || lower.includes("floor") || lower.includes("wood") || lower.includes("fabric") || lower.includes("leather") || lower.includes("kitchen") || lower.includes("bathroom")) {
    return "cozy-interiors";
  }
  if (lower.includes("metal") || lower.includes("concrete") || lower.includes("industrial") || lower.includes("urban")) {
    return "city-builder";
  }
  if (asset.dataType === "3DModel") {
    return categoryForWorkflowRow(lower);
  }
  return "pbr-test";
}

function os3aRecord({ asset, project, snapshotPath }) {
  const attributes = Array.isArray(asset.metadata?.attributes) ? asset.metadata.attributes : [];
  const attributeText = attributes.map((attribute) => `${attribute.traitType ?? ""} ${attribute.value ?? ""}`).join(" ");
  const projectText = `${project.name ?? ""} ${project.description ?? ""}`;
  const nameText = `${asset.name ?? ""} ${asset.description ?? ""}`;
  const category = categoryForOs3aRecord(`${projectText} ${nameText} ${attributeText}`);
  const id = `os3a-${slugify(`${project.id}-${asset.id}-${asset.name}`)}`;
  const sourceUrl = typeof project.githubUrl === "string" && project.githubUrl.length > 0
    ? project.githubUrl
    : "https://github.com/ToxSam/open-source-3D-assets";
  return {
    origin: {
      id: `origin-${id}`,
      originType: "generated-index",
      originName: `OS3A ${project.name}`,
      originUrl: "https://github.com/ToxSam/open-source-3D-assets",
      originPath: project.assetDataFile ?? null,
      originSection: "GitHub-Hosted Sources",
      originRef: "snapshot",
      originLineStart: null,
      originLineEnd: null,
      importerName: "os3a-snapshot",
      importerVersion: "1",
      importedOn: "2026-07-02",
      reviewStatus: "reviewed",
      reviewEvidence: "Workflow doc identifies ToxSam/open-source-3D-assets as a GLB asset discovery registry with CC0/CC BY metadata; this snapshot includes CC0 Polygonal Mind records.",
      notes: project.description ?? "",
    },
    source: {
      id: `source-${id}`,
      name: `${project.name} ${asset.name}`,
      sourceKind: "direct-file",
      sourceUrl,
      provenanceUrl: sourceUrl,
      creator: project.creatorId ?? "Polygonal Mind",
      licenseId: project.license === "CC0" ? "CC0-1.0" : String(project.license ?? "ReviewRequired"),
      licenseUrl: sourceUrl,
      licensePosture: project.license === "CC0" ? "cc0" : "review-needed",
      redistributionAllowed: project.license === "CC0" ? 1 : 0,
      attributionRequired: 0,
      notes: asset.description ?? project.description ?? "",
      cautions: "Snapshot record from OS3A registry; inspect scale, pivot, material dependencies, and gameplay readability before use.",
      reviewedOn: "2026-07-02",
      reviewedBy: "repo-curation",
    },
    file: {
      id,
      directName: asset.name,
      gameCategory: category,
      downloadUrl: asset.modelFileUrl,
      format: "glb",
      fileRole: "model",
      previewUrl: asset.thumbnailUrl ?? null,
      sha256: null,
      byteSize: asset.metadata?.fileSize ?? null,
      engineFit: "web-and-native",
      importNotes: "Direct CC0 GLB record from local OS3A snapshot; run tn asset inspect and tn model-test after download.",
      isDirectDownload: 1,
    },
    tags: tagsForWorkflowRow(`${projectText} ${nameText} ${attributeText} ${category}`),
    sourceMetadata: {
      os3aAssetId: asset.id,
      os3aProjectId: project.id,
      os3aSnapshotPath: snapshotPath,
      sourcePath: asset.metadata?.githubPath ?? "",
      attributes: attributes.map((attribute) => `${attribute.traitType}:${attribute.value}`).join("|"),
    },
  };
}

function categoryForOs3aRecord(text) {
  const lower = text.toLowerCase();
  if (lower.includes("car") || lower.includes("road") || lower.includes("transit") || lower.includes("vehicle")) {
    return "racing";
  }
  if (lower.includes("avatar") || lower.includes("character") || lower.includes("show")) {
    return "rpg-adventure";
  }
  if (lower.includes("tomb") || lower.includes("altar") || lower.includes("medieval") || lower.includes("fair")) {
    return "dungeon-crawler";
  }
  if (lower.includes("garden") || lower.includes("park") || lower.includes("tree") || lower.includes("plant") || lower.includes("nature")) {
    return "nature-terrain";
  }
  if (lower.includes("tower") || lower.includes("building") || lower.includes("house")) {
    return "city-builder";
  }
  if (lower.includes("space") || lower.includes("aero") || lower.includes("lunar") || lower.includes("crystal")) {
    return "space";
  }
  if (lower.includes("booth") || lower.includes("world") || lower.includes("room") || lower.includes("chair") || lower.includes("table")) {
    return "cozy-interiors";
  }
  if (lower.includes("christmas") || lower.includes("trash") || lower.includes("polka")) {
    return "party-coop";
  }
  return "general";
}

async function readWorkflowDocRecords(workflowDocPath) {
  const text = await readFile(workflowDocPath, "utf8");
  const lines = text.split(/\r?\n/u);
  const records = [];
  let section = "";
  let tableHeader = [];
  let inTable = false;

  for (const [index, line] of lines.entries()) {
    const heading = /^##\s+(.+)$/u.exec(line);
    if (heading !== null) {
      section = heading[1];
      tableHeader = [];
      inTable = false;
      continue;
    }
    if (!line.startsWith("|")) {
      inTable = false;
      continue;
    }
    const cells = splitMarkdownTableRow(line);
    if (cells.length < 4) {
      continue;
    }
    if (!inTable) {
      tableHeader = cells.map((cell) => cell.toLowerCase());
      inTable = true;
      continue;
    }
    if (cells.every((cell) => /^:?-{3,}:?$/u.test(cell))) {
      continue;
    }
    if (tableHeader.length < 4 || !tableHeader[0].includes("source")) {
      continue;
    }
    const source = parseMarkdownLink(cells[0]);
    if (source === undefined) {
      continue;
    }
    records.push(workflowRecord({ source, cells, section, lineNumber: index + 1, workflowDocPath }));
  }
  return records;
}

function splitMarkdownTableRow(line) {
  return line
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseMarkdownLink(markdown) {
  const match = /\[([^\]]+)\]\(([^)]+)\)/u.exec(markdown);
  if (match === null) {
    return undefined;
  }
  return { name: match[1], url: match[2] };
}

function workflowRecord({ source, cells, section, lineNumber, workflowDocPath }) {
  const licenseText = cells[1] ?? "";
  const bestFit = cells[2] ?? "";
  const notes = cells[3] ?? "";
  const slug = slugify(`${section}-${source.name}`);
  const sourceKind = sourceKindForUrl(source.url);
  const license = classifyLicense(licenseText);
  const category = categoryForWorkflowRow(`${section} ${source.name} ${bestFit} ${notes}`);
  const role = fileRoleForWorkflowRow(section, bestFit, source.url);
  const sourcePath = "docs/workflows/open-source-3d-asset-kits.md";
  return {
    origin: {
      id: `origin-workflow-${slug}`,
      originType: sourceKind === "repository" ? "repository" : "asset-page",
      originName: source.name,
      originUrl: source.url,
      originPath: sourcePath,
      originSection: section,
      originRef: "workflow-doc-table",
      originLineStart: lineNumber,
      originLineEnd: lineNumber,
      importerName: "workflow-doc-table-parser",
      importerVersion: "1",
      importedOn: "2026-07-02",
      reviewStatus: license.reviewStatus,
      reviewEvidence: `Curated workflow row: ${licenseText}`,
      notes,
    },
    source: {
      id: `source-workflow-${slug}`,
      name: source.name,
      sourceKind,
      sourceUrl: source.url,
      provenanceUrl: `${sourcePath}#${slugify(section)}`,
      creator: creatorFromName(source.name),
      licenseId: license.licenseId,
      licenseUrl: source.url,
      licensePosture: license.licensePosture,
      redistributionAllowed: license.redistributionAllowed,
      attributionRequired: license.attributionRequired,
      notes: bestFit,
      cautions: notes,
      reviewedOn: "2026-07-02",
      reviewedBy: "workflow-doc-table-parser",
    },
    file: {
      id: `workflow-${slug}`,
      directName: `${source.name} ${role}`,
      gameCategory: category,
      downloadUrl: null,
      format: "unknown",
      fileRole: role,
      previewUrl: source.url,
      sha256: null,
      byteSize: null,
      engineFit: "web-and-native",
      importNotes: `Workflow fallback source from ${section}. Select exact files, verify license/format, and record subasset provenance before use.`,
      isDirectDownload: 0,
    },
    tags: tagsForWorkflowRow(`${section} ${source.name} ${bestFit} ${notes} ${category}`),
    sourceMetadata: {
      workflowDocPath,
      workflowDocSection: section,
      workflowDocLine: lineNumber,
      workflowLicenseText: licenseText,
      workflowBestFit: bestFit,
    },
  };
}

function sourceKindForUrl(url) {
  if (url.includes("github.com")) {
    return "repository";
  }
  if (url.includes("api.") || url.includes("ambientcg.com")) {
    return "index";
  }
  return "pack-page";
}

function classifyLicense(text) {
  const lower = text.toLowerCase();
  if (lower.includes("cc0") || lower.includes("public domain") || lower.includes("unlicense")) {
    return { attributionRequired: 0, licenseId: lower.includes("unlicense") ? "Unlicense" : "CC0-1.0", licensePosture: "cc0", redistributionAllowed: 1, reviewStatus: "reviewed" };
  }
  if (lower.includes("cc by") || lower.includes("attribution")) {
    return { attributionRequired: 1, licenseId: "CC-BY-or-attribution-review", licensePosture: "permissive-attribution", redistributionAllowed: 1, reviewStatus: "reviewed" };
  }
  if (lower.includes("mit") || lower.includes("apache") || lower.includes("bsd") || lower.includes("zlib")) {
    return { attributionRequired: 1, licenseId: "Permissive-Review", licensePosture: "permissive-attribution", redistributionAllowed: 1, reviewStatus: "needs-license-review" };
  }
  return { attributionRequired: 0, licenseId: "ReviewRequired", licensePosture: "review-needed", redistributionAllowed: 0, reviewStatus: "needs-license-review" };
}

function categoryForWorkflowRow(text) {
  const lower = text.toLowerCase();
  const rules = [
    ["space", ["space", "spaceship", "spacecraft", "starfield", "planet", "spaceport", "space station"]],
    ["base-building", ["base building", "colony", "space base"]],
    ["racing", ["racing", "driving", "vehicle", "car", "road"]],
    ["platformer", ["platformer", "jump", "platform"]],
    ["city-builder", ["city", "town", "builder", "buildings"]],
    ["nature-terrain", ["nature", "terrain", "vegetation", "rocks", "trees", "outdoor"]],
    ["cozy-interiors", ["cozy", "interior", "kitchen", "room"]],
    ["rpg-adventure", ["rpg", "adventure", "fantasy", "character", "weapon"]],
    ["dungeon-crawler", ["dungeon", "roguelite", "rogue"]],
    ["shooter", ["shooter", "fps", "tps", "gun", "blaster"]],
    ["survival-horror", ["survival", "horror", "zombie", "graveyard"]],
    ["stealth", ["stealth", "corridor", "sci-fi interior"]],
    ["rts", ["rts", "empire", "strategy"]],
    ["tower-defense", ["tower defense"]],
    ["factory-automation", ["factory", "automation", "conveyor"]],
    ["farming-life-sim", ["farm", "farming", "life sim", "animal"]],
    ["restaurant-cooking", ["restaurant", "cooking", "sushi"]],
    ["puzzle", ["puzzle", "sokoban", "logic"]],
    ["tabletop", ["tabletop", "board", "card", "dice"]],
    ["sports-minigames", ["sports", "minigame", "mini-game", "party"]],
    ["golf", ["golf", "minigolf"]],
    ["bowling", ["bowling"]],
    ["train", ["train", "rail"]],
    ["naval", ["naval", "boat", "watercraft", "pirate", "ship"]],
    ["flight", ["flight", "aircraft", "plane", "aerospace"]],
    ["underwater", ["underwater", "fish", "reef"]],
    ["webxr", ["webxr", "vr", "controller"]],
    ["pbr-test", ["pbr", "material", "texture", "hdri", "ibl", "shader"]],
    ["animation-skinning", ["animation", "skinning", "rigged", "humanoid"]],
    ["loader-conformance", ["gltf", "loader", "conformance", "parser"]],
    ["prototype", ["prototype", "placeholder", "greybox", "base mesh"]],
  ];
  return rules.find(([, terms]) => terms.some((term) => lower.includes(term)))?.[0] ?? "general";
}

function fileRoleForWorkflowRow(section, bestFit, url) {
  const lower = `${section} ${bestFit} ${url}`.toLowerCase();
  if (lower.includes("hdri") || lower.includes("ibl") || lower.includes("skybox")) {
    return "hdri-index";
  }
  if (lower.includes("material") || lower.includes("texture") || lower.includes("pbr")) {
    return lower.includes("model") ? "texture-index" : "material-index";
  }
  if (lower.includes("github-hosted") || lower.includes("library") || lower.includes("index")) {
    return "index";
  }
  return "pack-page";
}

function tagsForWorkflowRow(text) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .split(/\s+/u)
    .filter((word) => word.length >= 3 && !["and", "the", "for", "with", "from", "when", "use", "this", "that", "assets", "source"].includes(word));
  return [...new Set(words)].slice(0, 12);
}

function creatorFromName(name) {
  return name.split(/[/:|-]/u)[0].trim();
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 90);
}

function sqlForRecord(record) {
  const origin = normalizeOrigin(record.origin);
  const source = normalizeSource(record.source, origin.id);
  const file = normalizeFile(record.file, source.id);
  return [
    insert("source_origins", origin, { orIgnore: true }),
    insert("asset_sources", source, { orIgnore: true }),
    insert("asset_files", file),
    ...[...new Set(record.tags ?? [])].sort().map((tag) => insert("asset_tags", { asset_file_id: file.id, tag })),
    ...Object.entries(record.sourceMetadata ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => insert("asset_source_metadata", { asset_file_id: file.id, key, value: String(value) })),
  ];
}

function normalizeOrigin(origin) {
  return {
    id: origin.id,
    origin_type: origin.originType,
    origin_name: origin.originName,
    origin_url: origin.originUrl,
    origin_path: origin.originPath ?? null,
    origin_section: origin.originSection ?? null,
    origin_ref: origin.originRef ?? null,
    origin_line_start: origin.originLineStart ?? null,
    origin_line_end: origin.originLineEnd ?? null,
    importer_name: origin.importerName,
    importer_version: origin.importerVersion,
    imported_on: origin.importedOn,
    review_status: origin.reviewStatus,
    review_evidence: origin.reviewEvidence ?? "",
    notes: origin.notes ?? "",
  };
}

function normalizeSource(source, originId) {
  return {
    id: source.id,
    origin_id: originId,
    name: source.name,
    source_kind: source.sourceKind,
    source_url: source.sourceUrl,
    provenance_url: source.provenanceUrl,
    creator: source.creator ?? null,
    license_id: source.licenseId,
    license_url: source.licenseUrl ?? null,
    license_posture: source.licensePosture,
    redistribution_allowed: source.redistributionAllowed ? 1 : 0,
    attribution_required: source.attributionRequired ? 1 : 0,
    notes: source.notes ?? "",
    cautions: source.cautions ?? "",
    reviewed_on: source.reviewedOn,
    reviewed_by: source.reviewedBy ?? "repo-curation",
  };
}

function normalizeFile(file, sourceId) {
  return {
    id: file.id,
    source_id: sourceId,
    direct_name: file.directName,
    game_category: file.gameCategory,
    download_url: file.downloadUrl ?? null,
    format: file.format,
    file_role: file.fileRole ?? "model",
    preview_url: file.previewUrl ?? null,
    sha256: file.sha256 ?? null,
    byte_size: file.byteSize ?? null,
    engine_fit: file.engineFit ?? "web-and-native",
    import_notes: file.importNotes ?? "",
    is_direct_download: file.isDirectDownload ? 1 : 0,
  };
}

function validateRecords(records) {
  if (records.length === 0) {
    throw new Error("Seed must contain at least one asset source record.");
  }
  const ids = new Set();
  for (const [index, record] of records.entries()) {
    const prefix = `Record ${index + 1}`;
    requireFields(record.origin, ["id", "originType", "originName", "originUrl", "importerName", "importerVersion", "importedOn", "reviewStatus", "reviewEvidence"], `${prefix}.origin`);
    requireFields(record.source, ["id", "name", "sourceKind", "sourceUrl", "provenanceUrl", "licenseId", "licensePosture", "reviewedOn"], `${prefix}.source`);
    requireFields(record.file, ["id", "directName", "gameCategory", "format"], `${prefix}.file`);
    if (ids.has(record.file.id)) {
      throw new Error(`${prefix}.file.id '${record.file.id}' is duplicated.`);
    }
    ids.add(record.file.id);
    if (isTruthy(record.file.isDirectDownload)) {
      requireFields(record.file, ["downloadUrl"], `${prefix}.file`);
      requireFields(record.source, ["licenseId", "licensePosture", "sourceUrl", "provenanceUrl"], `${prefix}.source`);
      if (!["glb", "gltf"].includes(record.file.format)) {
        throw new Error(`${prefix}.file.format must be glb or gltf for direct records.`);
      }
    }
    if (record.source.sourceKind === "pack-page" && isTruthy(record.file.isDirectDownload)) {
      throw new Error(`${prefix} cannot mark a pack-page as a direct download.`);
    }
    if ((record.tags ?? []).length === 0) {
      throw new Error(`${prefix}.tags must include at least one searchable tag.`);
    }
  }
}

function isTruthy(value) {
  return value === true || value === 1;
}

function requireFields(object, fields, label) {
  if (object === undefined || object === null) {
    throw new Error(`${label} is required.`);
  }
  for (const field of fields) {
    if (object[field] === undefined || object[field] === null || object[field] === "") {
      throw new Error(`${label}.${field} is required.`);
    }
  }
}

function insert(table, row, options = {}) {
  const columns = Object.keys(row);
  return `INSERT${options.orIgnore === true ? " OR IGNORE" : ""} INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((column) => sqlValue(row[column])).join(", ")});`;
}

function sqlValue(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function summarize(dbPath) {
  const sql = [
    "SELECT 'direct_file_count' AS key, COUNT(*) AS value FROM asset_files WHERE is_direct_download = 1",
    "UNION ALL SELECT 'pack_page_count' AS key, COUNT(*) AS value FROM asset_files WHERE is_direct_download = 0",
    "UNION ALL SELECT 'review_needed_count' AS key, COUNT(*) AS value FROM source_origins WHERE review_status != 'reviewed'",
    "UNION ALL SELECT 'schema_version' AS key, value FROM catalog_meta WHERE key = 'schema_version';",
  ].join("\n");
  const result = spawnSync("sqlite3", ["-json", dbPath, sql], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`sqlite3 failed while summarizing asset source catalog:\n${result.stderr || result.stdout}`);
  }
  const rows = JSON.parse(result.stdout);
  return Object.fromEntries(rows.map((row) => [row.key, Number.isNaN(Number(row.value)) ? row.value : Number(row.value)]));
}

function printReport(report, check) {
  console.log(JSON.stringify({
    code: "TN_ASSET_SOURCE_CATALOG_OK",
    message: check ? "Asset source catalog is current." : "Asset source catalog built.",
    ...report,
  }, null, 2));
}

function parseArgs(argv) {
  const args = { check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      args.check = true;
    } else if (arg === "--schema" || arg === "--seed" || arg === "--out") {
      args[arg.slice(2)] = argv[index + 1];
      index += 1;
    } else if (arg === "--workflow-doc") {
      args.workflowDoc = argv[index + 1];
      index += 1;
    } else if (arg === "--os3a-snapshot") {
      args.os3aSnapshot = argv[index + 1];
      index += 1;
    } else if (arg === "--polyhaven-snapshot") {
      args.polyhavenSnapshot = argv[index + 1];
      index += 1;
    } else if (arg === "--ambientcg-snapshot") {
      args.ambientcgSnapshot = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
