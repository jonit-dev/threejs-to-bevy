import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = resolve(new URL("..", import.meta.url).pathname);
const script = resolve(root, "scripts/build-asset-source-catalog.mjs");
const seed = resolve(root, "docs/data/asset-sources.seed.jsonl");
const schema = resolve(root, "docs/data/asset-sources.schema.sql");
const objaverseSnapshot = resolve(root, "docs/data/objaverse-glb-asset-sources.snapshot.json");

test("should build deterministic sqlite catalog from seed jsonl", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tn-asset-source-catalog-"));
  try {
    const first = join(dir, "first.sqlite");
    const second = join(dir, "second.sqlite");
    run(["--out", first]);
    run(["--out", second]);
    assert.deepEqual(await readFile(first), await readFile(second));
    const summary = query(first, "SELECT 'schema_version' AS key, value FROM catalog_meta WHERE key = 'schema_version' UNION ALL SELECT 'asset_count' AS key, COUNT(*) AS value FROM asset_files UNION ALL SELECT 'search_index_count' AS key, COUNT(*) AS value FROM asset_search UNION ALL SELECT 'direct_count' AS key, COUNT(*) AS value FROM asset_files WHERE is_direct_download = 1 UNION ALL SELECT 'direct_glb_count' AS key, COUNT(*) AS value FROM asset_files WHERE is_direct_download = 1 AND format = 'glb' UNION ALL SELECT 'model_count' AS key, COUNT(*) AS value FROM asset_files WHERE file_role IN ('model', 'model-index') UNION ALL SELECT 'hdri_count' AS key, COUNT(*) AS value FROM asset_files WHERE file_role = 'hdri-index' UNION ALL SELECT 'material_count' AS key, COUNT(*) AS value FROM asset_files WHERE file_role = 'material-index' UNION ALL SELECT 'ambientcg_count' AS key, COUNT(*) AS value FROM asset_source_metadata WHERE key = 'ambientcgAssetId' UNION ALL SELECT 'ambientcg_map_count' AS key, COUNT(*) AS value FROM asset_source_metadata WHERE key = 'ambientcgMapKind' UNION ALL SELECT 'objaverse_count' AS key, COUNT(*) AS value FROM asset_source_metadata WHERE key = 'objaverseUid' UNION ALL SELECT 'workflow_doc_hash' AS key, value FROM catalog_meta WHERE key = 'workflow_doc_sha256' UNION ALL SELECT 'ambientcg_snapshot_hash' AS key, value FROM catalog_meta WHERE key = 'ambientcg_snapshot_sha256' UNION ALL SELECT 'objaverse_snapshot_hash' AS key, value FROM catalog_meta WHERE key = 'objaverse_snapshot_sha256' UNION ALL SELECT 'os3a_snapshot_hash' AS key, value FROM catalog_meta WHERE key = 'os3a_snapshot_sha256' UNION ALL SELECT 'polyhaven_snapshot_hash' AS key, value FROM catalog_meta WHERE key = 'polyhaven_snapshot_sha256';");
    const byKey = Object.fromEntries(summary.map((row) => [row.key, row.value]));
    assert.equal(byKey.schema_version, "1");
    const hasObjaverseSnapshot = existsSync(objaverseSnapshot);
    assert.equal(Number(byKey.asset_count) > (hasObjaverseSnapshot ? 250000 : 100000), true);
    assert.equal(Number(byKey.search_index_count), Number(byKey.asset_count));
    assert.equal(Number(byKey.direct_count) > (hasObjaverseSnapshot ? 150000 : 1000), true);
    assert.equal(Number(byKey.direct_glb_count) > (hasObjaverseSnapshot ? 150000 : 1000), true);
    assert.equal(Number(byKey.model_count) > (hasObjaverseSnapshot ? 150000 : 1000), true);
    assert.equal(Number(byKey.hdri_count) > 900, true);
    assert.equal(Number(byKey.material_count) > 100000, true);
    assert.equal(Number(byKey.ambientcg_count) > 100000, true);
    assert.equal(Number(byKey.ambientcg_map_count) > 90000, true);
    assert.equal(Number(byKey.objaverse_count), hasObjaverseSnapshot ? 150000 : 0);
    assert.equal(typeof byKey.workflow_doc_hash, "string");
    assert.equal(typeof byKey.ambientcg_snapshot_hash, "string");
    assert.equal(typeof byKey.objaverse_snapshot_hash, "string");
    assert.equal(typeof byKey.os3a_snapshot_hash, "string");
    assert.equal(typeof byKey.polyhaven_snapshot_hash, "string");
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("should require direct records to include download url format license and category", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tn-asset-source-invalid-direct-"));
  try {
    const badSeed = join(dir, "bad.jsonl");
    const record = JSON.parse((await readFile(seed, "utf8")).split("\n").find((line) => line.includes("\"isDirectDownload\":1")) ?? "{}");
    delete record.file.downloadUrl;
    await writeFile(badSeed, `${JSON.stringify(record)}\n`);
    const result = run(["--seed", badSeed, "--out", join(dir, "bad.sqlite")], { expectFailure: true });
    assert.match(result.stderr, /file\.downloadUrl is required/);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("should require source origin metadata for every asset source", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tn-asset-source-invalid-origin-"));
  try {
    const badSeed = join(dir, "bad.jsonl");
    const record = JSON.parse((await readFile(seed, "utf8")).split("\n").find(Boolean) ?? "{}");
    delete record.origin.reviewEvidence;
    await writeFile(badSeed, `${JSON.stringify(record)}\n`);
    const result = run(["--seed", badSeed, "--out", join(dir, "bad.sqlite")], { expectFailure: true });
    assert.match(result.stderr, /origin\.reviewEvidence is required/);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("should preserve pack page records without treating them as direct downloads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tn-asset-source-pack-page-"));
  try {
    const db = join(dir, "catalog.sqlite");
    run(["--out", db]);
    const rows = query(db, "SELECT id, download_url, is_direct_download FROM asset_files WHERE id = 'kenney-racing-kit-pack';");
    assert.equal(rows[0].download_url, null);
    assert.equal(rows[0].is_direct_download, 0);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("should include workflow-doc extracted categories", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tn-asset-source-categories-"));
  try {
    const db = join(dir, "catalog.sqlite");
    run(["--out", db]);
    const rows = query(db, "SELECT value FROM asset_source_metadata WHERE asset_file_id = 'workflow-category-underwater' AND key = 'normalizedCategories';");
    assert.match(rows[0].value, /underwater/);
    assert.match(rows[0].value, /racing/);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("should preserve workflow-doc source line anchors", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tn-asset-source-line-anchors-"));
  try {
    const db = join(dir, "catalog.sqlite");
    run(["--out", db]);
    const rows = query(db, "SELECT origin_path, origin_section, origin_line_start, origin_line_end FROM source_origins WHERE id = 'origin-workflow-use-case-shortlist';");
    assert.equal(rows[0].origin_path, "docs/workflows/open-source-3d-asset-kits.md");
    assert.equal(rows[0].origin_section, "Use-Case Shortlist");
    assert.equal(rows[0].origin_line_start, 70);
    assert.equal(rows[0].origin_line_end, 114);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("should fail when sqlite artifact is stale", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tn-asset-source-stale-"));
  try {
    const copiedSeed = join(dir, "seed.jsonl");
    const copiedDb = join(dir, "catalog.sqlite");
    await writeFile(copiedSeed, await readFile(seed, "utf8"));
    run(["--seed", copiedSeed, "--out", copiedDb]);
    await writeFile(copiedSeed, `${await readFile(copiedSeed, "utf8")}\n`);
    const result = run(["--seed", copiedSeed, "--out", copiedDb, "--check"], { expectFailure: true });
    assert.match(result.stderr, /stale/);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [script, "--schema", schema, "--seed", seed, ...args], { cwd: root, encoding: "utf8" });
  if (options.expectFailure === true) {
    assert.notEqual(result.status, 0, result.stdout);
  } else {
    assert.equal(result.status, 0, result.stderr);
  }
  return result;
}

function query(db, sql) {
  const result = spawnSync("sqlite3", ["-json", db, sql], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
