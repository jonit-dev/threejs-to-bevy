import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface FixtureCatalogEntry {
  aggregateGate: string;
  bundlePath: string;
  canonicalId: string;
  legacyAliases: string[];
  ownerDocs: string;
  promotedCapabilities: string[];
  reportArtifacts: string[];
}

export interface FixtureCatalog {
  fixtures: FixtureCatalogEntry[];
  legacyCatalogs: string[];
  schema: string;
  version: string;
}

const catalogPath = resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
  "packages/ir/fixtures/conformance/fixture-catalog.json",
);

export async function loadFixtureCatalog(root?: string): Promise<FixtureCatalog> {
  const path = root ? resolve(root, "packages/ir/fixtures/conformance/fixture-catalog.json") : catalogPath;
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as FixtureCatalog;
}

export function resolveFixtureId(catalog: FixtureCatalog, requestedId: string): {
  entry: FixtureCatalogEntry;
  legacyAliasUsed: boolean;
  message?: string;
} | null {
  const direct = catalog.fixtures.find((entry) => entry.canonicalId === requestedId);
  if (direct) {
    return { entry: direct, legacyAliasUsed: false };
  }

  const alias = catalog.fixtures.find((entry) => entry.legacyAliases.includes(requestedId));
  if (!alias) {
    return null;
  }

  return {
    entry: alias,
    legacyAliasUsed: true,
    message: `Fixture id '${requestedId}' is a legacy alias for '${alias.canonicalId}'.`,
  };
}

export function listCurrentFixtures(catalog: FixtureCatalog): FixtureCatalogEntry[] {
  return catalog.fixtures.filter((entry) => entry.aggregateGate === "verify:release" || entry.aggregateGate === "verify:v9");
}
