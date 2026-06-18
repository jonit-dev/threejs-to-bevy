import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultCatalogPath = resolve(
  fileURLToPath(new URL("..", import.meta.url)),
  "packages/ir/fixtures/conformance/fixture-catalog.json",
);

export async function loadFixtureCatalog(root) {
  const catalogPath = resolve(root, "packages/ir/fixtures/conformance/fixture-catalog.json");
  const raw = await readFile(catalogPath, "utf8");
  return JSON.parse(raw);
}

export function resolveFixtureEntry(catalog, requestedId) {
  const direct = catalog.fixtures.find((entry) => entry.canonicalId === requestedId);
  if (direct) {
    return { entry: direct };
  }
  return null;
}

export function resolveFixtureBundlePath(catalog, requestedId, root) {
  const resolved = resolveFixtureEntry(catalog, requestedId);
  if (!resolved) {
    throw new Error(`Unknown conformance fixture id '${requestedId}'.`);
  }
  return {
    bundlePath: resolve(root, resolved.entry.bundlePath),
    canonicalId: resolved.entry.canonicalId,
  };
}

export async function loadDefaultFixtureCatalog() {
  const raw = await readFile(defaultCatalogPath, "utf8");
  return JSON.parse(raw);
}
