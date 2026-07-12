import { spawn, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, mkdir, open, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import initSqlJs, { type SqlValue } from "sql.js";

const require = createRequire(import.meta.url);

export interface IAssetSourceOrigin {
  id: string;
  importerName: string;
  importerVersion: string;
  importedOn: string;
  notes: string;
  originLineEnd: number | null;
  originLineStart: number | null;
  originName: string;
  originPath: string | null;
  originRef: string | null;
  originSection: string | null;
  originType: string;
  originUrl: string;
  reviewEvidence: string;
  reviewStatus: string;
}

export interface IAssetSourceRecord {
  attributionRequired: boolean;
  byteSize: number | null;
  cautions: string;
  creator: string | null;
  directName: string;
  downloadUrl: string | null;
  engineFit: string;
  fileRole: string;
  format: string;
  gameCategory: string;
  id: string;
  importNotes: string;
  isDirectDownload: boolean;
  licenseId: string;
  licensePosture: string;
  licenseUrl: string | null;
  name: string;
  notes: string;
  origin: IAssetSourceOrigin;
  previewUrl: string | null;
  provenanceUrl: string;
  recommendedNextCommand: string;
  redistributionAllowed: boolean;
  reviewedBy: string;
  reviewedOn: string;
  sha256: string | null;
  sourceId: string;
  sourceKind: string;
  sourceMetadata: Record<string, string>;
  sourceUrl: string;
  tags: string[];
}

export interface IAssetSourceSearchOptions {
  directOnly?: boolean;
  fileRole?: string;
  format?: string;
  gameCategory?: string;
  includeBlocked?: boolean;
  license?: string;
  limit?: number;
  query?: string;
  tag?: string;
}

export function resolveAssetSourceCatalogPath(startUrl = import.meta.url): string {
  const sourceFile = fileURLToPath(startUrl);
  const candidates = [
    resolve(dirname(sourceFile), "../../data/asset-sources.sqlite"),
    resolve(dirname(sourceFile), "../data/asset-sources.sqlite"),
    resolve(process.cwd(), "packages/cli/data/asset-sources.sqlite"),
  ];
  return candidates[0] ?? resolve(process.cwd(), "packages/cli/data/asset-sources.sqlite");
}

export async function findAssetSourceCatalogPath(startUrl = import.meta.url): Promise<string> {
  const sourceFile = fileURLToPath(startUrl);
  const candidates = [
    resolve(dirname(sourceFile), "../../data/asset-sources.sqlite"),
    resolve(dirname(sourceFile), "../data/asset-sources.sqlite"),
    resolve(process.cwd(), "packages/cli/data/asset-sources.sqlite"),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known package/source checkout layout.
    }
  }
  return candidates[0] ?? resolve(process.cwd(), "packages/cli/data/asset-sources.sqlite");
}

export async function searchAssetSources(options: IAssetSourceSearchOptions = {}): Promise<IAssetSourceRecord[]> {
  const terms = options.query === undefined ? [] : searchTerms(options.query);
  const where = assetSourceWhere({ ...options, query: undefined }, { broadCategory: terms.length > 0 });
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  if (terms.length > 0) {
    const candidates = await queryRecords(`${matchedAssetSearchSql(terms)} ${baseSelectSql("JOIN matched_asset_search m ON m.asset_file_id = f.id")} WHERE ${where.join(" AND ")} ORDER BY ${searchOrderSql(options, true)} LIMIT ${Math.min(limit * 5, 500)};`);
    return candidates
      .map((record) => ({ record, score: assetSourceRelevanceScore(record, options.query ?? "") }))
      .filter(({ record, score }) => score > (record.isDirectDownload ? 2.5 : 0.5))
      .sort((left, right) => right.score - left.score || Number(right.record.isDirectDownload) - Number(left.record.isDirectDownload) || left.record.id.localeCompare(right.record.id))
      .slice(0, limit)
      .map(({ record }) => record);
  }
  return queryRecords(`${baseSelectSql()} WHERE ${where.join(" AND ")} ORDER BY ${searchOrderSql(options, false)} LIMIT ${limit};`);
}

export async function listAssetSources(options: Omit<IAssetSourceSearchOptions, "limit"> = {}): Promise<IAssetSourceRecord[]> {
  const where = assetSourceWhere(options);
  return queryRecords(`${baseSelectSql()} WHERE ${where.join(" AND ")} ORDER BY f.is_direct_download DESC, f.game_category, f.id;`);
}

function assetSourceWhere(options: IAssetSourceSearchOptions, searchOptions: { broadCategory?: boolean } = {}): string[] {
  const where = ["1 = 1"];
  if (options.includeBlocked !== true) {
    where.push("s.license_posture != 'blocked'", "o.review_status != 'blocked'");
  }
  if (options.directOnly === true) {
    where.push("f.is_direct_download = 1");
  }
  if (options.gameCategory !== undefined) {
    where.push(searchOptions.broadCategory === true ? broadCategorySql(options.gameCategory) : `lower(f.game_category) = ${sqlString(options.gameCategory.toLowerCase())}`);
  }
  if (options.format !== undefined) {
    where.push(`f.format = ${sqlString(options.format)}`);
  }
  if (options.fileRole !== undefined) {
    where.push(`f.file_role = ${sqlString(options.fileRole)}`);
  }
  if (options.license !== undefined) {
    where.push(`(s.license_id = ${sqlString(options.license)} OR s.license_posture = ${sqlString(options.license)})`);
  }
  if (options.tag !== undefined) {
    where.push(`EXISTS (SELECT 1 FROM asset_tags tag_filter WHERE tag_filter.asset_file_id = f.id AND tag_filter.tag = ${sqlString(options.tag)})`);
  }
  if (options.query !== undefined) {
    const terms = searchTerms(options.query);
    if (terms.length > 0) {
      where.push(`(${terms.map((term) => keywordSql(term)).join(" OR ")})`);
    }
  }
  return where;
}

export async function getAssetSource(id: string): Promise<IAssetSourceRecord | undefined> {
  const rows = await queryRecords(`${baseSelectSql()} WHERE f.id = ${sqlString(id)} LIMIT 1;`);
  return rows[0];
}

export async function suggestAssetSources(goal: string, options: Pick<IAssetSourceSearchOptions, "limit"> = {}): Promise<IAssetSourceRecord[]> {
  const words = goal.toLowerCase().split(/[^a-z0-9-]+/u).filter((word) => word.length >= 3);
  const candidateLimit = Math.max(50, Math.min((options.limit ?? 10) * 20, 250));
  const rows = words.length > 0
    ? await queryRecords(`${matchedAssetSearchSql(words)} ${baseSelectSql("JOIN matched_asset_search m ON m.asset_file_id = f.id")} WHERE ${suggestWhereSql()} ORDER BY m.rank, f.is_direct_download DESC, f.id LIMIT ${candidateLimit};`)
    : await searchAssetSources({ includeBlocked: false, limit: candidateLimit });
  const scored = rows
    .map((row) => {
      const lexicalScore = words.reduce((score, word) => score + suggestWordScore(row, word), 0);
      return {
        row,
        score: lexicalScore + (row.isDirectDownload ? 2 : 0),
        lexicalScore,
      };
    })
    .filter((entry) => entry.lexicalScore > 0)
    .sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));
  return scored.slice(0, Math.max(1, Math.min(options.limit ?? 10, 50))).map((entry) => entry.row);
}

export async function exportAssetSourcesJsonl(outPath: string): Promise<{ count: number; outPath: string }> {
  await mkdir(dirname(outPath), { recursive: true });
  const dbPath = await findAssetSourceCatalogPath();
  const nativeCount = await exportAssetSourcesJsonlWithNativeSqlite(dbPath, outPath);
  if (nativeCount !== undefined) {
    return { count: nativeCount, outPath };
  }
  const file = await open(outPath, "w");
  const batchSize = 5000;
  let count = 0;
  try {
    for (let offset = 0;; offset += batchSize) {
      const rows = await queryRecords(`${baseSelectSql()} WHERE 1 = 1 ORDER BY f.is_direct_download DESC, f.game_category, f.id LIMIT ${batchSize} OFFSET ${offset};`);
      if (rows.length === 0) {
        break;
      }
      await file.write(rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
      count += rows.length;
    }
  } finally {
    await file.close();
  }
  return { count, outPath };
}

async function exportAssetSourcesJsonlWithNativeSqlite(dbPath: string, outPath: string): Promise<number | undefined> {
  const count = countAssetSourceRowsWithNativeSqlite(dbPath);
  if (count === undefined) {
    return undefined;
  }
  const result = await pipeSqliteJsonl(dbPath, exportJsonlSql(), outPath);
  if (result === false) {
    return undefined;
  }
  return count;
}

function countAssetSourceRowsWithNativeSqlite(dbPath: string): number | undefined {
  const rows = querySqlWithNativeSqlite(dbPath, "SELECT COUNT(*) AS count FROM asset_files LIMIT 1;");
  const count = rows?.[0] as { count?: unknown } | undefined;
  const value = Number(count?.count);
  return Number.isFinite(value) ? value : undefined;
}

async function pipeSqliteJsonl(dbPath: string, sql: string, outPath: string): Promise<boolean> {
  return new Promise((resolvePromise, reject) => {
    const sqlite = spawn("sqlite3", ["-readonly", dbPath, sql], { stdio: ["ignore", "pipe", "pipe"] });
    const out = createWriteStream(outPath, { encoding: "utf8" });
    let stderr = "";
    sqlite.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    sqlite.on("error", (error: NodeJS.ErrnoException) => {
      out.destroy();
      if (error.code === "ENOENT") {
        resolvePromise(false);
        return;
      }
      reject(error);
    });
    out.on("error", reject);
    sqlite.stdout.pipe(out);
    sqlite.on("close", (code) => {
      out.end(() => {
        if (code === 0) {
          resolvePromise(true);
          return;
        }
        reject(new Error(`sqlite3 failed while exporting asset source catalog:\n${stderr.trim()}`));
      });
    });
  });
}

async function queryRecords(sql: string): Promise<IAssetSourceRecord[]> {
  const rows = await querySql(sql);
  return rows.map((row) => recordFromRow(row as Record<string, unknown>));
}

async function querySql(sql: string): Promise<unknown[]> {
  const dbPath = await findAssetSourceCatalogPath();
  const nativeRows = shouldUseNativeSqlite(sql) ? querySqlWithNativeSqlite(dbPath, sql) : undefined;
  if (nativeRows !== undefined) {
    return nativeRows;
  }
  return querySqlWithSqlJs(dbPath, sql);
}

function shouldUseNativeSqlite(sql: string): boolean {
  return /\bLIMIT\s+\d+\b/iu.test(sql);
}

function querySqlWithNativeSqlite(dbPath: string, sql: string): unknown[] | undefined {
  const result = spawnSync("sqlite3", ["-json", dbPath, sql], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error !== undefined) {
    return undefined;
  }
  if (result.status !== 0) {
    throw new Error(`sqlite3 failed while querying asset source catalog:\n${result.stderr.trim()}`);
  }
  const output = result.stdout.trim();
  if (output.length === 0) {
    return [];
  }
  try {
    return JSON.parse(output) as unknown[];
  } catch {
    return undefined;
  }
}

async function querySqlWithSqlJs(dbPath: string, sql: string): Promise<unknown[]> {
  const SQL = await initSqlJs({
    locateFile: (file) => require.resolve(`sql.js/dist/${file}`),
  });
  const db = new SQL.Database(await readFile(dbPath));
  try {
    const [result] = db.exec(sql);
    if (result === undefined) {
      return [];
    }
    return result.values.map((values) => Object.fromEntries(result.columns.map((column, index) => [column, sqliteValue(values[index])])));
  } finally {
    db.close();
  }
}

function sqliteValue(value: SqlValue | undefined): unknown {
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf8");
  }
  return value;
}

function baseSelectSql(extraJoin = ""): string {
  return `
SELECT
  f.id,
  f.source_id AS sourceId,
  f.direct_name AS directName,
  f.game_category AS gameCategory,
  f.download_url AS downloadUrl,
  f.format,
  f.file_role AS fileRole,
  f.preview_url AS previewUrl,
  f.sha256,
  f.byte_size AS byteSize,
  f.engine_fit AS engineFit,
  f.import_notes AS importNotes,
  f.is_direct_download AS isDirectDownload,
  s.name,
  s.source_kind AS sourceKind,
  s.source_url AS sourceUrl,
  s.provenance_url AS provenanceUrl,
  s.creator,
  s.license_id AS licenseId,
  s.license_url AS licenseUrl,
  s.license_posture AS licensePosture,
  s.redistribution_allowed AS redistributionAllowed,
  s.attribution_required AS attributionRequired,
  s.notes,
  s.cautions,
  s.reviewed_on AS reviewedOn,
  s.reviewed_by AS reviewedBy,
  o.id AS originId,
  o.origin_type AS originType,
  o.origin_name AS originName,
  o.origin_url AS originUrl,
  o.origin_path AS originPath,
  o.origin_section AS originSection,
  o.origin_ref AS originRef,
  o.origin_line_start AS originLineStart,
  o.origin_line_end AS originLineEnd,
  o.importer_name AS importerName,
  o.importer_version AS importerVersion,
  o.imported_on AS importedOn,
  o.review_status AS reviewStatus,
  o.review_evidence AS reviewEvidence,
  o.notes AS originNotes,
  COALESCE((SELECT json_group_array(tag) FROM (SELECT tag FROM asset_tags WHERE asset_file_id = f.id ORDER BY tag)), '[]') AS tagsJson,
  COALESCE((SELECT json_group_object(key, value) FROM (SELECT key, value FROM asset_source_metadata WHERE asset_file_id = f.id ORDER BY key)), '{}') AS metadataJson
FROM asset_files f
JOIN asset_sources s ON s.id = f.source_id
JOIN source_origins o ON o.id = s.origin_id
${extraJoin}`;
}

function exportJsonlSql(): string {
  return `
SELECT json_object(
  'attributionRequired', json(CASE WHEN s.attribution_required = 1 THEN 'true' ELSE 'false' END),
  'byteSize', f.byte_size,
  'cautions', s.cautions,
  'creator', s.creator,
  'directName', f.direct_name,
  'downloadUrl', f.download_url,
  'engineFit', f.engine_fit,
  'fileRole', f.file_role,
  'format', f.format,
  'gameCategory', f.game_category,
  'id', f.id,
  'importNotes', f.import_notes,
  'isDirectDownload', json(CASE WHEN f.is_direct_download = 1 THEN 'true' ELSE 'false' END),
  'licenseId', s.license_id,
  'licensePosture', s.license_posture,
  'licenseUrl', s.license_url,
  'name', s.name,
  'notes', s.notes,
  'origin', json_object(
    'id', o.id,
    'importerName', o.importer_name,
    'importerVersion', o.importer_version,
    'importedOn', o.imported_on,
    'notes', o.notes,
    'originLineEnd', o.origin_line_end,
    'originLineStart', o.origin_line_start,
    'originName', o.origin_name,
    'originPath', o.origin_path,
    'originRef', o.origin_ref,
    'originSection', o.origin_section,
    'originType', o.origin_type,
    'originUrl', o.origin_url,
    'reviewEvidence', o.review_evidence,
    'reviewStatus', o.review_status
  ),
  'previewUrl', f.preview_url,
  'provenanceUrl', s.provenance_url,
  'recommendedNextCommand', CASE
    WHEN f.download_url IS NOT NULL THEN 'curl -L ' || f.download_url || ' -o assets/' || f.id || '.' || f.format || ' && tn asset inspect assets/' || f.id || '.' || f.format || ' --json'
    WHEN f.file_role IN ('material-index', 'texture-index', 'hdri-index') THEN 'Review ' || s.source_url || ', select exact files, record source metadata, then reference the texture/HDRI from structured asset source.'
    WHEN f.file_role IN ('pack-page', 'index') THEN 'Review ' || s.source_url || ', download a selected model or pack, record exact subasset metadata, then run tn asset inspect <path> --json.'
    ELSE 'Review ' || s.source_url || ', record exact source metadata, then run the relevant asset validation command.'
  END,
  'redistributionAllowed', json(CASE WHEN s.redistribution_allowed = 1 THEN 'true' ELSE 'false' END),
  'reviewedBy', s.reviewed_by,
  'reviewedOn', s.reviewed_on,
  'sha256', f.sha256,
  'sourceId', f.source_id,
  'sourceKind', s.source_kind,
  'sourceMetadata', json(COALESCE((SELECT json_group_object(key, value) FROM (SELECT key, value FROM asset_source_metadata WHERE asset_file_id = f.id ORDER BY key)), '{}')),
  'sourceUrl', s.source_url,
  'tags', json(COALESCE((SELECT json_group_array(tag) FROM (SELECT tag FROM asset_tags WHERE asset_file_id = f.id ORDER BY tag)), '[]'))
)
FROM asset_files f
JOIN asset_sources s ON s.id = f.source_id
JOIN source_origins o ON o.id = s.origin_id
ORDER BY f.is_direct_download DESC, f.game_category, f.id;`;
}

function recordFromRow(row: Record<string, unknown>): IAssetSourceRecord {
  const downloadUrl = nullableString(row.downloadUrl);
  const id = stringValue(row.id);
  return {
    attributionRequired: booleanValue(row.attributionRequired),
    byteSize: nullableNumber(row.byteSize),
    cautions: stringValue(row.cautions),
    creator: nullableString(row.creator),
    directName: stringValue(row.directName),
    downloadUrl,
    engineFit: stringValue(row.engineFit),
    fileRole: stringValue(row.fileRole),
    format: stringValue(row.format),
    gameCategory: stringValue(row.gameCategory),
    id,
    importNotes: stringValue(row.importNotes),
    isDirectDownload: booleanValue(row.isDirectDownload),
    licenseId: stringValue(row.licenseId),
    licensePosture: stringValue(row.licensePosture),
    licenseUrl: nullableString(row.licenseUrl),
    name: stringValue(row.name),
    notes: stringValue(row.notes),
    origin: {
      id: stringValue(row.originId),
      importerName: stringValue(row.importerName),
      importerVersion: stringValue(row.importerVersion),
      importedOn: stringValue(row.importedOn),
      notes: stringValue(row.originNotes),
      originLineEnd: nullableNumber(row.originLineEnd),
      originLineStart: nullableNumber(row.originLineStart),
      originName: stringValue(row.originName),
      originPath: nullableString(row.originPath),
      originRef: nullableString(row.originRef),
      originSection: nullableString(row.originSection),
      originType: stringValue(row.originType),
      originUrl: stringValue(row.originUrl),
      reviewEvidence: stringValue(row.reviewEvidence),
      reviewStatus: stringValue(row.reviewStatus),
    },
    previewUrl: nullableString(row.previewUrl),
    provenanceUrl: stringValue(row.provenanceUrl),
    recommendedNextCommand: nextCommandForRecord({
      downloadUrl,
      fileRole: stringValue(row.fileRole),
      format: stringValue(row.format),
      id,
      sourceUrl: stringValue(row.sourceUrl),
    }),
    redistributionAllowed: booleanValue(row.redistributionAllowed),
    reviewedBy: stringValue(row.reviewedBy),
    reviewedOn: stringValue(row.reviewedOn),
    sha256: nullableString(row.sha256),
    sourceId: stringValue(row.sourceId),
    sourceKind: stringValue(row.sourceKind),
    sourceMetadata: JSON.parse(stringValue(row.metadataJson)) as Record<string, string>,
    sourceUrl: stringValue(row.sourceUrl),
    tags: JSON.parse(stringValue(row.tagsJson)) as string[],
  };
}

function nextCommandForRecord(record: { downloadUrl: string | null; fileRole: string; format: string; id: string; sourceUrl: string }): string {
  if (record.downloadUrl !== null) {
    return `curl -L ${record.downloadUrl} -o assets/${record.id}.${record.format} && tn asset inspect assets/${record.id}.${record.format} --json`;
  }
  if (record.fileRole === "material-index" || record.fileRole === "texture-index" || record.fileRole === "hdri-index") {
    return `Review ${record.sourceUrl}, select exact files, record source metadata, then reference the texture/HDRI from structured asset source.`;
  }
  if (record.fileRole === "pack-page" || record.fileRole === "index") {
    return `Review ${record.sourceUrl}, download a selected model or pack, record exact subasset metadata, then run tn asset inspect <path> --json.`;
  }
  return `Review ${record.sourceUrl}, record exact source metadata, then run the relevant asset validation command.`;
}

function scoreWord(row: IAssetSourceRecord, word: string): number {
  let score = 0;
  score += weightedFieldScore(row.id, word, 16, 10);
  score += weightedFieldScore(row.directName, word, 16, 10);
  score += weightedFieldScore(row.gameCategory, word, 12, 7);
  for (const tag of row.tags) score += weightedFieldScore(tag, word, 10, 6);
  score += weightedFieldScore(row.name, word, 8, 4);
  for (const field of [row.fileRole, row.format, row.importNotes, row.licenseId, row.licensePosture, row.notes, row.sourceUrl, ...Object.values(row.sourceMetadata)]) {
    score += weightedFieldScore(field, word, 3, 1);
  }
  return score;
}

function suggestWordScore(row: IAssetSourceRecord, word: string): number {
  const fields = [
    row.id,
    row.directName,
    row.fileRole,
    row.format,
    row.gameCategory,
    row.importNotes,
    row.licenseId,
    row.licensePosture,
    row.name,
    row.notes,
    row.sourceUrl,
    ...row.tags,
    ...Object.values(row.sourceMetadata),
  ];
  return fields.reduce((score, field) => {
    const normalized = field.toLowerCase();
    return score + (normalized === word ? 4 : normalized.includes(word) ? 1 : 0);
  }, 0);
}

export function assetSourceRelevanceScore(row: IAssetSourceRecord, query: string): number {
  const words = searchTerms(query);
  const lexical = words.reduce((score, word) => score + scoreWord(row, word), 0);
  const categoryText = [row.gameCategory, ...row.tags].join(" ").toLowerCase();
  const categoryMatched = words.length === 0 || words.every((word) => categoryText.includes(word));
  return (categoryMatched ? lexical : lexical * 0.2) + (row.isDirectDownload ? 2 : 0);
}

function weightedFieldScore(value: string, word: string, exact: number, substring: number): number {
  const normalized = value.toLowerCase();
  return normalized === word ? exact : normalized.includes(word) ? substring : 0;
}

function broadCategorySql(category: string): string {
  const value = category.toLowerCase();
  const likePrefix = `${value}-%`;
  const likeSuffix = `%-${value}`;
  const likeWrapped = `%-${value}-%`;
  return `(
    lower(f.game_category) = ${sqlString(value)}
    OR lower(f.game_category) LIKE ${sqlString(likePrefix)}
    OR lower(f.game_category) LIKE ${sqlString(likeSuffix)}
    OR lower(f.game_category) LIKE ${sqlString(likeWrapped)}
    OR EXISTS (
      SELECT 1 FROM asset_tags category_tag
      WHERE category_tag.asset_file_id = f.id
        AND lower(category_tag.tag) = ${sqlString(value)}
    )
  )`;
}

function searchOrderSql(options: IAssetSourceSearchOptions, hasMatchedSearch: boolean): string {
  const order = [];
  if (options.gameCategory !== undefined) {
    order.push(`CASE WHEN lower(f.game_category) = ${sqlString(options.gameCategory.toLowerCase())} THEN 0 ELSE 1 END`);
  }
  order.push("CASE WHEN f.format LIKE '%-map' THEN 1 ELSE 0 END");
  if (hasMatchedSearch) {
    order.push("m.rank");
  }
  order.push("f.is_direct_download DESC", "f.game_category", "f.id");
  return order.join(", ");
}

function keywordSql(term: string): string {
  const pattern = `%${term.toLowerCase()}%`;
  return `(
    lower(f.id) LIKE ${sqlString(pattern)}
    OR lower(f.direct_name) LIKE ${sqlString(pattern)}
    OR lower(f.game_category) LIKE ${sqlString(pattern)}
    OR lower(f.file_role) LIKE ${sqlString(pattern)}
    OR lower(f.format) LIKE ${sqlString(pattern)}
    OR lower(f.import_notes) LIKE ${sqlString(pattern)}
    OR lower(s.name) LIKE ${sqlString(pattern)}
    OR lower(s.source_url) LIKE ${sqlString(pattern)}
    OR lower(s.notes) LIKE ${sqlString(pattern)}
    OR lower(s.license_id) LIKE ${sqlString(pattern)}
    OR lower(s.license_posture) LIKE ${sqlString(pattern)}
    OR EXISTS (
      SELECT 1 FROM asset_tags keyword_tag
      WHERE keyword_tag.asset_file_id = f.id
        AND lower(keyword_tag.tag) LIKE ${sqlString(pattern)}
    )
  )`;
}

function searchTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/[^a-z0-9]+/u).filter((word) => word.length >= 2))].slice(0, 8);
}

function matchedAssetSearchSql(terms: string[]): string {
  return `WITH matched_asset_search AS (
    SELECT d.asset_file_id, bm25(asset_search) AS rank
    FROM asset_search
    JOIN asset_search_docs d ON d.rowid = asset_search.rowid
    WHERE asset_search MATCH ${ftsQuerySql(terms)}
  )`;
}

function ftsQuerySql(terms: string[]): string {
  const query = terms
    .map((term) => term.replace(/[^a-z0-9]/gu, ""))
    .filter(Boolean)
    .map((term) => `${term}*`)
    .join(" OR ");
  return sqlString(query || "__nomatch__");
}

function suggestWhereSql(): string {
  const where = ["s.license_posture != 'blocked'", "o.review_status != 'blocked'"];
  return where.join(" AND ");
}

function suggestScoreSql(words: string[]): string {
  const terms = words.slice(0, 8);
  if (terms.length === 0) {
    return "f.is_direct_download";
  }
  return terms.map((word) => {
    const exact = sqlString(word);
    const pattern = sqlString(`%${word}%`);
    return `(
      CASE WHEN lower(f.id) = ${exact} THEN 12 WHEN lower(f.id) LIKE ${pattern} THEN 8 ELSE 0 END
      + CASE WHEN lower(f.direct_name) = ${exact} THEN 12 WHEN lower(f.direct_name) LIKE ${pattern} THEN 8 ELSE 0 END
      + CASE WHEN lower(f.game_category) LIKE ${pattern} THEN 5 ELSE 0 END
      + CASE WHEN lower(s.name) LIKE ${pattern} THEN 4 ELSE 0 END
      + CASE WHEN EXISTS (
        SELECT 1 FROM asset_tags score_tag
        WHERE score_tag.asset_file_id = f.id
          AND lower(score_tag.tag) LIKE ${pattern}
      ) THEN 4 ELSE 0 END
      + CASE WHEN lower(f.import_notes) LIKE ${pattern} THEN 2 ELSE 0 END
      + CASE WHEN lower(s.notes) LIKE ${pattern} THEN 1 ELSE 0 END
    )`;
  }).join(" + ");
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : stringValue(value);
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function booleanValue(value: unknown): boolean {
  return value === 1 || value === "1" || value === true;
}
