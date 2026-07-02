#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultSchema = resolve(root, "docs/data/asset-sources.schema.sql");
const defaultSeed = resolve(root, "docs/data/asset-sources.seed.jsonl");
const defaultOut = resolve(root, "packages/cli/data/asset-sources.sqlite");
const schemaVersion = "1";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const schemaPath = resolve(root, args.schema ?? defaultSchema);
  const seedPath = resolve(root, args.seed ?? defaultSeed);
  const outPath = resolve(root, args.out ?? defaultOut);
  const records = await readSeed(seedPath);
  validateRecords(records);

  if (args.check) {
    const temp = await mkdtemp(resolve(tmpdir(), "tn-asset-sources-"));
    try {
      const checkDb = resolve(temp, "asset-sources.sqlite");
      const report = await buildCatalog({ outPath: checkDb, records, schemaPath, seedPath });
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

  const report = await buildCatalog({ outPath, records, schemaPath, seedPath });
  printReport(report, false);
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

async function buildCatalog({ outPath, records, schemaPath, seedPath }) {
  const schema = await readFile(schemaPath, "utf8");
  await mkdir(dirname(outPath), { recursive: true });
  const sql = [
    schema,
    "BEGIN;",
    insert("catalog_meta", { key: "schema_version", value: schemaVersion }),
    insert("catalog_meta", { key: "seed_sha256", value: hashText(await readFile(seedPath, "utf8")) }),
    insert("catalog_meta", { key: "builder", value: "scripts/build-asset-source-catalog.mjs" }),
    insert("catalog_meta", { key: "built_on", value: "deterministic" }),
    ...records.flatMap((record) => sqlForRecord(record)),
    "COMMIT;",
    "PRAGMA foreign_key_check;",
    "VACUUM;",
  ].join("\n");
  const tempSql = `${outPath}.sql`;
  await rm(outPath, { force: true });
  await writeFile(tempSql, sql);
  const result = spawnSync("sqlite3", [outPath, `.read ${tempSql}`], { encoding: "utf8" });
  await rm(tempSql, { force: true });
  if (result.status !== 0) {
    throw new Error(`sqlite3 failed while building asset source catalog:\n${result.stderr || result.stdout}`);
  }
  return summarize(outPath);
}

function sqlForRecord(record) {
  const origin = normalizeOrigin(record.origin);
  const source = normalizeSource(record.source, origin.id);
  const file = normalizeFile(record.file, source.id);
  return [
    insert("source_origins", origin),
    insert("asset_sources", source),
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

function insert(table, row) {
  const columns = Object.keys(row);
  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((column) => sqlValue(row[column])).join(", ")});`;
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
