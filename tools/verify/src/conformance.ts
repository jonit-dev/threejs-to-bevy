import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface FixtureCatalogEntry {
  aggregateGate: string;
  bundlePath: string;
  canonicalArtifactGate?: string;
  canonicalId: string;
  focusedGate?: {
    commands: string[][];
    conflictPolicy: "none" | "conformance-artifact-conflict";
    description: string;
    owner: string;
    profile: "smoke" | "changed" | "focused" | "release" | "full";
    protects: string;
    reason: string;
    release: {
      enrolled: boolean;
      name: string;
      timingCategory: "artifact" | "conformance" | "focused-gate" | "setup" | "test" | "visual-native";
    };
  };
  owner?: string;
  ownerDocs: string;
  promotedCapabilities: string[];
  reportArtifacts: string[];
  regenerateCommand?: string;
  sourceExample?: string;
}

export interface FixtureCatalog {
  fixtures: FixtureCatalogEntry[];
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
} | null {
  const direct = catalog.fixtures.find((entry) => entry.canonicalId === requestedId);
  if (direct) {
    return { entry: direct };
  }
  return null;
}

export function listCurrentFixtures(catalog: FixtureCatalog): FixtureCatalogEntry[] {
  return catalog.fixtures.filter((entry) => entry.aggregateGate === "verify:release" || entry.aggregateGate === "verify:v9");
}
