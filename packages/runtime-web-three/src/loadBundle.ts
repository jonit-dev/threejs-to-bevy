import type { IIrDiagnostic } from "@threenative/ir";
import { assertBundleRelativePath } from "@threenative/ir/bundlePaths";
import { hydrateWebBundle } from "./bundleHydration.js";
import { loadBundleUrl } from "./loadBundleUrl.js";
import type { IWebBundle } from "./webBundle.js";
export type { IWebBundle } from "./webBundle.js";

export class WebBundleValidationError extends Error {
  constructor(public readonly diagnostics: readonly IIrDiagnostic[]) {
    const first = diagnostics[0];
    super(
      first === undefined
        ? "Bundle validation failed."
        : `Bundle validation failed: ${first.code} at ${first.path}. ${first.message}`,
    );
    this.name = "WebBundleValidationError";
  }
}

export async function validateAndLoadBundle(source: string): Promise<IWebBundle> {
  if (isFetchable(source)) {
    throw new Error("Bundle validation for fetchable sources is not supported yet; pass a local bundle path to validate before loading.");
  }
  const irPackage = "@threenative/ir";
  const { validateBundle } = await dynamicImport<{ validateBundle(source: string): Promise<{ diagnostics: IIrDiagnostic[]; ok: boolean }> }>(irPackage);
  const result = await validateBundle(source);
  if (!result.ok) {
    throw new WebBundleValidationError(result.diagnostics);
  }
  return loadBundle(source);
}

export async function loadBundle(source: string): Promise<IWebBundle> {
  if (isFetchable(source)) {
    return loadBundleUrl(source);
  }
  return hydrateWebBundle(source, {
    readBytes(file) {
      return readBundleBytes(source, file);
    },
    readJson<T>(file: string): Promise<T> {
      return readBundleJson(source, file);
    },
  });
}

async function readBundleBytes(source: string, file: string): Promise<Uint8Array> {
  assertBundleRelativePath(file);
  if (isFetchable(source)) {
    throw new Error("Fetchable byte reads should use loadBundleUrl directly.");
  }

  const fsModule = nodeModuleName("fs/promises");
  const pathModule = nodeModuleName("path");
  const { readFile } = await dynamicImport<{ readFile(path: string): Promise<Uint8Array> }>(fsModule);
  const { resolve } = await dynamicImport<{ resolve(...paths: string[]): string }>(pathModule);
  return readFile(resolve(source, file));
}

async function readBundleJson<T>(source: string, file: string): Promise<T> {
  assertBundleRelativePath(file);
  if (isFetchable(source)) {
    const response = await fetch(`${source.replace(/\/$/, "")}/${file}`);
    if (!response.ok) {
      throw new Error(`Failed to load bundle file '${file}': ${response.status}`);
    }
    return (await response.json()) as T;
  }

  const fsModule = nodeModuleName("fs/promises");
  const pathModule = nodeModuleName("path");
  const { readFile } = await dynamicImport<{ readFile(path: string, encoding: "utf8"): Promise<string> }>(
    fsModule,
  );
  const { resolve } = await dynamicImport<{ resolve(...paths: string[]): string }>(pathModule);
  return JSON.parse(await readFile(resolve(source, file), "utf8")) as T;
}

function nodeModuleName(name: string): string {
  return `node:${name}`;
}

function dynamicImport<T>(moduleName: string): Promise<T> {
  const importer = new Function("moduleName", "return import(moduleName)") as <T>(moduleName: string) => Promise<T>;
  return importer<T>(moduleName);
}

function isFetchable(source: string): boolean {
  return (
    source.startsWith("http://") ||
    source.startsWith("https://") ||
    (typeof window !== "undefined" && source.startsWith("/"))
  );
}
