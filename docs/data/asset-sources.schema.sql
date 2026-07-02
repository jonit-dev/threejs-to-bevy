PRAGMA foreign_keys = ON;

CREATE TABLE catalog_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE source_origins (
  id TEXT PRIMARY KEY,
  origin_type TEXT NOT NULL CHECK (
    origin_type IN ('workflow-doc', 'generated-index', 'repository', 'asset-page', 'api', 'manual-review')
  ),
  origin_name TEXT NOT NULL,
  origin_url TEXT NOT NULL,
  origin_path TEXT,
  origin_section TEXT,
  origin_ref TEXT,
  origin_line_start INTEGER,
  origin_line_end INTEGER,
  importer_name TEXT NOT NULL,
  importer_version TEXT NOT NULL,
  imported_on TEXT NOT NULL,
  review_status TEXT NOT NULL CHECK (
    review_status IN ('reviewed', 'needs-license-review', 'needs-format-review', 'blocked')
  ),
  review_evidence TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE asset_sources (
  id TEXT PRIMARY KEY,
  origin_id TEXT NOT NULL REFERENCES source_origins(id),
  name TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (
    source_kind IN ('direct-file', 'pack-page', 'index', 'repository', 'scan')
  ),
  source_url TEXT NOT NULL,
  provenance_url TEXT NOT NULL,
  creator TEXT,
  license_id TEXT NOT NULL,
  license_url TEXT,
  license_posture TEXT NOT NULL CHECK (
    license_posture IN ('cc0', 'permissive-attribution', 'mixed', 'review-needed', 'blocked')
  ),
  redistribution_allowed INTEGER NOT NULL CHECK (redistribution_allowed IN (0, 1)),
  attribution_required INTEGER NOT NULL CHECK (attribution_required IN (0, 1)),
  notes TEXT NOT NULL DEFAULT '',
  cautions TEXT NOT NULL DEFAULT '',
  reviewed_on TEXT NOT NULL,
  reviewed_by TEXT NOT NULL DEFAULT 'repo-curation'
);

CREATE TABLE asset_files (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES asset_sources(id),
  direct_name TEXT NOT NULL,
  game_category TEXT NOT NULL,
  download_url TEXT,
  format TEXT NOT NULL,
  file_role TEXT NOT NULL DEFAULT 'model',
  preview_url TEXT,
  sha256 TEXT,
  byte_size INTEGER,
  engine_fit TEXT NOT NULL DEFAULT 'web-and-native',
  import_notes TEXT NOT NULL DEFAULT '',
  is_direct_download INTEGER NOT NULL CHECK (is_direct_download IN (0, 1))
);

CREATE TABLE asset_tags (
  asset_file_id TEXT NOT NULL REFERENCES asset_files(id),
  tag TEXT NOT NULL,
  PRIMARY KEY (asset_file_id, tag)
);

CREATE TABLE asset_source_metadata (
  asset_file_id TEXT NOT NULL REFERENCES asset_files(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (asset_file_id, key)
);

CREATE TABLE asset_search_docs (
  rowid INTEGER PRIMARY KEY,
  asset_file_id TEXT NOT NULL UNIQUE REFERENCES asset_files(id)
);

CREATE VIRTUAL TABLE asset_search USING fts5(
  search_text,
  tokenize = 'unicode61',
  content = ''
);

CREATE INDEX idx_source_origins_type ON source_origins(origin_type);
CREATE INDEX idx_source_origins_review ON source_origins(review_status);
CREATE INDEX idx_asset_files_category ON asset_files(game_category);
CREATE INDEX idx_asset_files_format ON asset_files(format);
CREATE INDEX idx_asset_files_role ON asset_files(file_role);
CREATE INDEX idx_asset_files_direct_format_category_id ON asset_files(is_direct_download, format, game_category, id);
CREATE INDEX idx_asset_files_role_format_category_id ON asset_files(file_role, format, game_category, id);
CREATE UNIQUE INDEX idx_asset_files_download_url_unique ON asset_files(download_url)
  WHERE download_url IS NOT NULL AND download_url != '';
CREATE INDEX idx_asset_sources_license ON asset_sources(license_id);
CREATE INDEX idx_asset_files_direct ON asset_files(is_direct_download);
CREATE INDEX idx_asset_source_metadata_key ON asset_source_metadata(key);
