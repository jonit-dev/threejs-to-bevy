import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { IBundleManifest } from "./types.js";

export interface IConformanceFixture {
  bundlePath: string;
  capabilityTags: string[];
  name: string;
}

export interface IConformanceFixtureCatalogEntry {
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
  regenerateCommand?: string;
  reportArtifacts: string[];
  sourceExample?: string;
}

export interface IConformanceFixtureCatalog {
  fixtures: IConformanceFixtureCatalogEntry[];
  schema: string;
  version: string;
}

export async function loadConformanceFixtureCatalog(
  root = resolve(process.cwd(), "fixtures/conformance/fixture-catalog.json"),
): Promise<IConformanceFixtureCatalog> {
  return JSON.parse(await readFile(root, "utf8")) as IConformanceFixtureCatalog;
}

export async function listConformanceFixtures(root = resolve(process.cwd(), "fixtures/conformance")): Promise<IConformanceFixture[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const fixtures: IConformanceFixture[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const bundlePath = resolve(root, entry.name, "game.bundle");
    const manifest = JSON.parse(await readFile(resolve(bundlePath, "manifest.json"), "utf8")) as IBundleManifest;
    fixtures.push({
      bundlePath,
      capabilityTags: capabilityTagsFromManifest(manifest),
      name: entry.name,
    });
  }

  return fixtures.sort((a, b) => a.name.localeCompare(b.name));
}

function capabilityTagsFromManifest(manifest: IBundleManifest): string[] {
  return Object.entries(manifest.requiredCapabilities)
    .flatMap(([domain, capabilities]) => capabilities.map((capability) => `${domain}:${capability}`))
    .sort();
}
