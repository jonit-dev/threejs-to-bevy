import { access, mkdir, readFile, writeFile } from "node:fs/promises";
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
  const where = assetSourceWhere(options);
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  return queryRecords(`${baseSelectSql()} WHERE ${where.join(" AND ")} ORDER BY f.is_direct_download DESC, f.game_category, f.id LIMIT ${limit};`);
}

export async function listAssetSources(options: Omit<IAssetSourceSearchOptions, "limit"> = {}): Promise<IAssetSourceRecord[]> {
  const where = assetSourceWhere(options);
  return queryRecords(`${baseSelectSql()} WHERE ${where.join(" AND ")} ORDER BY f.is_direct_download DESC, f.game_category, f.id;`);
}

function assetSourceWhere(options: IAssetSourceSearchOptions): string[] {
  const where = ["1 = 1"];
  if (options.includeBlocked !== true) {
    where.push("s.license_posture != 'blocked'", "o.review_status != 'blocked'");
  }
  if (options.directOnly === true) {
    where.push("f.is_direct_download = 1");
  }
  if (options.gameCategory !== undefined) {
    where.push(`f.game_category = ${sqlString(options.gameCategory)}`);
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
  return where;
}

export async function getAssetSource(id: string): Promise<IAssetSourceRecord | undefined> {
  const rows = await queryRecords(`${baseSelectSql()} WHERE f.id = ${sqlString(id)} LIMIT 1;`);
  return rows[0];
}

export async function suggestAssetSources(goal: string, options: Pick<IAssetSourceSearchOptions, "limit"> = {}): Promise<IAssetSourceRecord[]> {
  const words = goal.toLowerCase().split(/[^a-z0-9-]+/u).filter((word) => word.length >= 3);
  const rows = await searchAssetSources({ includeBlocked: false, limit: 100 });
  const scored = rows
    .map((row) => ({
      row,
      score: words.reduce((score, word) => score + scoreWord(row, word), 0) + (row.isDirectDownload ? 2 : 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));
  return scored.slice(0, Math.max(1, Math.min(options.limit ?? 10, 50))).map((entry) => entry.row);
}

export async function exportAssetSourcesJsonl(outPath: string): Promise<{ count: number; outPath: string }> {
  const rows = await listAssetSources({ includeBlocked: true });
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  return { count: rows.length, outPath };
}

async function queryRecords(sql: string): Promise<IAssetSourceRecord[]> {
  const rows = await querySql(sql);
  return rows.map((row) => recordFromRow(row as Record<string, unknown>));
}

async function querySql(sql: string): Promise<unknown[]> {
  const dbPath = await findAssetSourceCatalogPath();
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

function baseSelectSql(): string {
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
JOIN source_origins o ON o.id = s.origin_id`;
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
  const fields = [row.id, row.directName, row.gameCategory, row.name, row.licenseId, row.licensePosture, ...row.tags].map((field) => field.toLowerCase());
  for (const field of fields) {
    if (field === word) {
      score += 4;
    } else if (field.includes(word)) {
      score += 1;
    }
  }
  return score;
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
