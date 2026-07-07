import { assertBundleRelativePath } from "@threenative/ir/bundlePaths";
import { hydrateWebBundle } from "./bundleHydration.js";
import type { IWebBundle } from "./webBundle.js";

export async function loadBundleUrl(source: string): Promise<IWebBundle> {
  const baseUrl = source.replace(/\/$/, "");
  return hydrateWebBundle(source, {
    async readBytes(file) {
      assertBundleRelativePath(file);
      const response = await fetch(`${baseUrl}/${file}`);
      if (!response.ok) {
        throw new Error(`Failed to load bundle file '${file}': ${response.status}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    },
    async readJson<T>(file: string): Promise<T> {
      assertBundleRelativePath(file);
      const response = await fetch(`${baseUrl}/${file}`);
      if (!response.ok) {
        throw new Error(`Failed to load bundle file '${file}': ${response.status}`);
      }
      return (await response.json()) as T;
    },
  });
}
