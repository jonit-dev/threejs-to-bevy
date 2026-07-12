import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defaultOverlayStyle, OVERLAY_CLIENT_VERSION, OVERLAY_SCAFFOLD_REGISTRY, resolveOverlayScaffold, resolveOverlayTemplateFiles, resolveOverlayTemplateRoot } from "./scaffoldRegistry.js";

test("should select tailwind when overlay style is omitted", () => {
  assert.equal(defaultOverlayStyle(), "tailwind");
  assert.equal(OVERLAY_SCAFFOLD_REGISTRY.filter((item) => item.default).length, 1);
  assert.equal(resolveOverlayScaffold()?.style, "tailwind");
});

test("should keep the chess reference overlay dependency versions aligned with the registry", async () => {
  const chess = JSON.parse(await readFile(new URL("../../../../examples/chess/package.json", import.meta.url), "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
  const clientPackage = JSON.parse(await readFile(new URL("../../../overlay-client/package.json", import.meta.url), "utf8")) as { version: string };
  const descriptor = resolveOverlayScaffold("tailwind")!;

  for (const [name, version] of Object.entries(descriptor.dependencies)) {
    if (name !== "@threenative/overlay-client") assert.equal(chess.dependencies[name], version, name);
  }
  for (const [name, version] of Object.entries(descriptor.devDependencies)) assert.equal(chess.devDependencies[name], version, name);
  assert.equal(OVERLAY_CLIENT_VERSION, `^${clientPackage.version}`);
  assert.match(chess.dependencies["@threenative/overlay-client"] ?? "", /packages\/overlay-client$/);
});

test("should keep preset dependency metadata disjoint", async () => {
  const tailwind = resolveOverlayScaffold("tailwind")!;
  const vanilla = resolveOverlayScaffold("vanilla")!;
  assert.equal(Object.keys(tailwind.devDependencies).some((name) => name.includes("tailwind")), true);
  assert.equal(Object.keys(vanilla.devDependencies).some((name) => name.includes("tailwind")), false);
  assert.equal(resolveOverlayScaffold("unknown"), undefined);
  const vanillaCss = await readFile(resolve(resolveOverlayTemplateRoot(new URL("../commands/overlayAdd.js", import.meta.url).href, vanilla), "src/styles.css"), "utf8");
  assert.doesNotMatch(vanillaCss, /tailwind|@import\s+["']tailwindcss/i);
  const moduleUrl = new URL("../commands/overlayAdd.js", import.meta.url).href;
  const tailwindShared = resolveOverlayTemplateFiles(moduleUrl, tailwind).filter((file) => tailwind.sharedFiles.includes(file.destination));
  const vanillaShared = resolveOverlayTemplateFiles(moduleUrl, vanilla).filter((file) => vanilla.sharedFiles.includes(file.destination));
  assert.deepEqual(tailwindShared, vanillaShared);
});
