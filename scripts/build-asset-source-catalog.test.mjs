import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = resolve(new URL("..", import.meta.url).pathname);
const script = resolve(root, "scripts/build-asset-source-catalog.mjs");
const seed = resolve(root, "docs/data/asset-sources.seed.jsonl");
const schema = resolve(root, "docs/data/asset-sources.schema.sql");

test("should build deterministic sqlite catalog from seed jsonl", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tn-asset-source-catalog-"));
  try {
    const first = join(dir, "first.sqlite");
    const second = join(dir, "second.sqlite");
    run(["--out", first]);
    run(["--out", second]);
    assert.deepEqual(await readFile(first), await readFile(second));
    const summary = query(first, "SELECT 'schema_version' AS key, value FROM catalog_meta WHERE key = 'schema_version' UNION ALL SELECT 'asset_count' AS key, COUNT(*) AS value FROM asset_files;");
    const byKey = Object.fromEntries(summary.map((row) => [row.key, row.value]));
    assert.equal(byKey.schema_version, "1");
    assert.equal(Number(byKey.asset_count) >= 4, true);
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
