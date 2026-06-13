import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { IBundleManifest } from "./types.js";

export interface IConformanceFixture {
  bundlePath: string;
  capabilityTags: string[];
  name: string;
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
