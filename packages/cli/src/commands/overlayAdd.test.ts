import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { overlayAddCommand } from "./overlayAdd.js";
import { overlayBuildScript, resolveOverlayScaffold } from "../overlays/scaffoldRegistry.js";

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-overlay-add-"));
  await mkdir(join(root, "content"), { recursive: true });
  await writeFile(join(root, "package.json"), `${JSON.stringify({ name: "game", private: true, scripts: { validate: "tn validate" }, dependencies: { existing: "1.0.0" } }, null, 2)}\n`);
  await writeFile(join(root, "threenative.config.json"), `${JSON.stringify({ schema: "threenative.project", version: "0.1.0", entry: "content/scene.json" }, null, 2)}\n`);
  return root;
}

test("should scaffold a Tailwind React overlay when style is omitted", async () => {
  const root = await project();
  try {
    const result = await overlayAddCommand(["inventory", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { entry: string; style: string; changedFiles: string[] };
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string>; scripts: Record<string, string> };
    const declaration = JSON.parse(await readFile(join(root, "content/overlays/webview.overlays.json"), "utf8")) as { overlays: Array<{ entry: string; id: string; input: string }> };
    const descriptor = resolveOverlayScaffold()!;
    const expectedScript = overlayBuildScript(descriptor, "inventory", "overlay/inventory");
    assert.equal(result.exitCode, 0);
    assert.equal(payload.style, "tailwind");
    assert.equal(payload.entry, "overlay/inventory/dist/index.html");
    assert.deepEqual(packageJson.devDependencies, descriptor.devDependencies);
    for (const [dependency, version] of Object.entries(descriptor.dependencies)) assert.equal(packageJson.dependencies[dependency], version);
    for (const dependency of Object.keys(descriptor.dependencies)) assert.equal(packageJson.devDependencies[dependency], undefined);
    for (const dependency of Object.keys(descriptor.devDependencies)) assert.equal(packageJson.dependencies[dependency], undefined);
    assert.equal(packageJson.scripts[expectedScript.name], expectedScript.command);
    assert.doesNotMatch(expectedScript.command, /--root/);
    assert.equal(payload.entry, `overlay/inventory/${descriptor.entry}`);
    assert.deepEqual(declaration.overlays[0], { entry: `overlay/inventory/${descriptor.entry}`, id: "inventory", input: "pointer", messages: { gameToOverlay: [], overlayToGame: [{ name: "overlay:action", schema: { fields: { action: "string" }, kind: "object", required: ["action"] } }] }, targetProfiles: ["web", "desktop"], transparent: true, zIndex: 20 });
    assert.equal(payload.changedFiles.includes("overlay/inventory/src/App.tsx"), true);
    assert.match(await readFile(join(root, "overlay/inventory/src/styles.css"), "utf8"), /tailwindcss/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("should preserve unrelated package metadata", async () => {
  const root = await project();
  try {
    await overlayAddCommand(["inventory", "--json"], { cwd: root });
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { dependencies: Record<string, string>; scripts: Record<string, string> };
    assert.equal(packageJson.dependencies.existing, "1.0.0");
    assert.equal(packageJson.scripts.validate, "tn validate");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("should reject an existing overlay source conflict without partial mutation", async () => {
  const root = await project();
  try {
    await mkdir(join(root, "overlay/inventory/src"), { recursive: true });
    await writeFile(join(root, "overlay/inventory/src/App.tsx"), "owned");
    const before = await readFile(join(root, "package.json"), "utf8");
    const result = await overlayAddCommand(["inventory", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; path: string };
    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_OVERLAY_SCAFFOLD_CONFLICT");
    assert.equal(payload.path, "overlay/inventory/src/App.tsx");
    assert.equal(await readFile(join(root, "package.json"), "utf8"), before);
    await assert.rejects(access(join(root, "content/overlays/webview.overlays.json")));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("should not duplicate an existing overlay declaration", async () => {
  const root = await project();
  try {
    assert.equal((await overlayAddCommand(["inventory", "--json"], { cwd: root })).exitCode, 0);
    const repeated = await overlayAddCommand(["inventory", "--json"], { cwd: root });
    const declaration = JSON.parse(await readFile(join(root, "content/overlays/webview.overlays.json"), "utf8")) as { overlays: unknown[] };
    assert.equal(repeated.exitCode, 1);
    assert.equal(declaration.overlays.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("should scaffold vanilla CSS without Tailwind metadata", async () => {
  const root = await project();
  try {
    const result = await overlayAddCommand(["menu", "--style", "vanilla", "--json"], { cwd: root });
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { devDependencies: Record<string, string> };
    assert.equal(result.exitCode, 0);
    assert.equal(Object.keys(packageJson.devDependencies).some((name) => name.includes("tailwind")), false);
    assert.doesNotMatch(await readFile(join(root, "overlay/menu/src/styles.css"), "utf8"), /tailwind/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("should generate identical shared entry and bridge source for both presets", async () => {
  const tailwindRoot = await project();
  const vanillaRoot = await project();
  try {
    await overlayAddCommand(["hud", "--json"], { cwd: tailwindRoot });
    await overlayAddCommand(["hud", "--style", "vanilla", "--json"], { cwd: vanillaRoot });
    for (const path of ["src/main.tsx", "src/bridge.ts"]) {
      assert.equal(await readFile(join(tailwindRoot, "overlay/hud", path), "utf8"), await readFile(join(vanillaRoot, "overlay/hud", path), "utf8"));
    }
  } finally {
    await rm(tailwindRoot, { recursive: true, force: true });
    await rm(vanillaRoot, { recursive: true, force: true });
  }
});

test("should reject usage, invalid IDs, and unsupported styles with stable diagnostics", async () => {
  const root = await project();
  try {
    for (const [argv, code] of [[[], "TN_OVERLAY_ADD_USAGE"], [["Bad/Id"], "TN_OVERLAY_ID_INVALID"], [["menu", "--style", "sass"], "TN_OVERLAY_STYLE_UNSUPPORTED"]] as const) {
      const result = await overlayAddCommand([...argv, "--json"], { cwd: root });
      assert.equal((JSON.parse(result.stdout) as { code: string }).code, code);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("should select the canonical owner when multiple overlay documents exist", async () => {
  const root = await project();
  try {
    await mkdir(join(root, "content/overlays"), { recursive: true });
    const first = { schema: "threenative.overlays", version: "0.1.0", overlays: [{ id: "legacy", entry: "legacy/dist/index.html", input: "pointer", messages: {}, targetProfiles: ["web"], transparent: true, zIndex: 1 }] };
    const canonical = { schema: "threenative.overlays", version: "0.1.0", overlays: [{ id: "canonical", entry: "canonical/dist/index.html", input: "pointer", messages: {}, targetProfiles: ["web"], transparent: true, zIndex: 1 }] };
    await writeFile(join(root, "content/overlays/a.overlays.json"), `${JSON.stringify(first)}\n`);
    await writeFile(join(root, "content/overlays/webview.overlays.json"), `${JSON.stringify(canonical)}\n`);
    const result = await overlayAddCommand(["menu", "--json"], { cwd: root });
    const updated = JSON.parse(await readFile(join(root, "content/overlays/webview.overlays.json"), "utf8")) as { overlays: Array<{ id: string }> };
    const untouched = JSON.parse(await readFile(join(root, "content/overlays/a.overlays.json"), "utf8")) as { overlays: Array<{ id: string }> };
    assert.equal(result.exitCode, 0);
    assert.deepEqual(updated.overlays.map((item) => item.id), ["canonical", "menu"]);
    assert.deepEqual(untouched.overlays.map((item) => item.id), ["legacy"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("should reject dependencies already declared in the opposite role", async () => {
  const root = await project();
  try {
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as Record<string, unknown>;
    packageJson.devDependencies = { react: "^19.2.7" };
    await writeFile(join(root, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
    const result = await overlayAddCommand(["menu", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; path: string };
    assert.equal(payload.code, "TN_OVERLAY_SCAFFOLD_CONFLICT");
    assert.equal(payload.path, "package.json#/devDependencies/react");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("should roll back every file when a staged commit fails", async () => {
  const root = await project();
  try {
    const before = await readFile(join(root, "package.json"), "utf8");
    const result = await overlayAddCommand(["menu", "--json"], { cwd: root, beforeCommit(index) { if (index === 2) throw new Error("injected write failure"); } });
    const payload = JSON.parse(result.stdout) as { code: string };
    assert.equal(payload.code, "TN_OVERLAY_SCAFFOLD_WRITE_FAILED");
    assert.equal(await readFile(join(root, "package.json"), "utf8"), before);
    await assert.rejects(access(join(root, "content/overlays/webview.overlays.json")));
    await assert.rejects(access(join(root, "overlay/menu/index.html")));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("should remove prior stages when staging fails", async () => {
  const root = await project();
  try {
    const before = await readFile(join(root, "package.json"), "utf8");
    const result = await overlayAddCommand(["menu", "--json"], { cwd: root, transactionHook(phase, index) { if (phase === "stage" && index === 1) throw new Error("injected staging failure"); } });
    assert.equal((JSON.parse(result.stdout) as { code: string }).code, "TN_OVERLAY_SCAFFOLD_WRITE_FAILED");
    assert.equal(await readFile(join(root, "package.json"), "utf8"), before);
    await assert.rejects(access(join(root, "overlay/menu/index.html")));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("should keep committed files when backup cleanup fails", async () => {
  const root = await project();
  try {
    const result = await overlayAddCommand(["menu", "--json"], { cwd: root, transactionHook(phase) { if (phase === "cleanup") throw new Error("injected cleanup failure"); } });
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> };
    assert.equal(result.exitCode, 0);
    assert.equal(typeof packageJson.scripts["build:overlay:menu"], "string");
    await access(join(root, "overlay/menu/index.html"));
    await access(join(root, "content/overlays/webview.overlays.json"));
  } finally { await rm(root, { recursive: true, force: true }); }
});
