import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import test from "node:test";

import { chromium } from "playwright";

import { buildWebDistribution } from "./web.js";

test("should build a static artifact that launches without the dev server", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-web-static-"));
  try {
    const bundlePath = await writeBundle(root);
    const report = await buildWebDistribution({ bundlePath, format: "static", outputPath: join(root, "release") });
    const server = createStaticServer(join(root, "release/artifact"));
    await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const browserErrors: string[] = [];
        page.on("pageerror", (error) => browserErrors.push(error.message));
        await page.goto(`http://127.0.0.1:${address.port}/index.html`);
        await page.waitForTimeout(2_000);
        const ready = await page.evaluate(() => (globalThis as unknown as { __THREENATIVE_READY__?: { diagnostics: unknown[]; ok: boolean } }).__THREENATIVE_READY__);
        assert.equal(ready?.ok, true, JSON.stringify({ browserErrors, ready }));
        assert.equal(await page.locator("canvas").count(), 1);
      } finally {
        await browser.close();
      }
    } finally {
      await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
    }
    assert.equal(report.format, "static");
    assert.equal(await readFile(join(root, "release/artifact/index.html"), "utf8").then((value) => value.includes("/src/main.js")), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should produce stable hashes for repeated unsigned web builds", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-web-stable-"));
  try {
    const bundlePath = await writeBundle(root);
    const first = await buildWebDistribution({ bundlePath, format: "zip", outputPath: join(root, "first") });
    const second = await buildWebDistribution({ bundlePath, format: "zip", outputPath: join(root, "second") });

    assert.deepEqual(first.inventory, second.inventory);
    assert.equal(first.artifact.contentSha256, second.artifact.contentSha256);
    assert.equal(first.artifact.zip?.sha256, second.artifact.zip?.sha256);
    assert.equal(first.artifact.zip?.bytes, second.artifact.zip?.bytes);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject absolute development URLs in release output", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-web-dev-url-"));
  try {
    const bundlePath = await writeBundle(root);
    await writeFile(join(bundlePath, "development.txt"), "http://[::1]:5173/dev.js\n/workspace/build/private.js\nC:\\Users\\developer\\game.js");

    await assert.rejects(
      () => buildWebDistribution({ bundlePath, format: "static", outputPath: join(root, "release") }),
      /TN_PACKAGE_WEB_DEVELOPMENT_URL_FORBIDDEN.*development\.txt/,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject output roots that overlap project bundle source", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-web-output-overlap-"));
  try {
    const bundlePath = await writeBundle(root);
    await assert.rejects(
      () => buildWebDistribution({ bundlePath, format: "static", outputPath: root }),
      /TN_PACKAGE_OUTPUT_(?:OVERLAP|UNSAFE)/,
    );
    assert.equal(await readFile(join(bundlePath, "manifest.json"), "utf8").then((value) => value.length > 0), true);
    await assert.rejects(
      () => buildWebDistribution({ bundlePath, format: "static", outputPath: join(bundlePath, "release") }),
      /TN_PACKAGE_OUTPUT_OVERLAP/,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should launch PWA offline from a configured subpath", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-web-pwa-offline-"));
  try {
    const bundlePath = await writeBundle(root);
    await buildWebDistribution({ bundlePath, format: "pwa", outputPath: join(root, "release") });
    const server = createStaticServer(join(root, "release/artifact"), "/game");
    await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${address.port}/game/index.html`);
        await page.waitForFunction(() => (globalThis as unknown as { __THREENATIVE_READY__?: { ok: boolean } }).__THREENATIVE_READY__?.ok === true);
        await page.evaluate(() => (globalThis as unknown as {
          navigator: { serviceWorker: { ready: Promise<unknown> } };
        }).navigator.serviceWorker.ready);
        await page.reload();
        await page.waitForFunction(() => (globalThis as unknown as {
          navigator: { serviceWorker: { controller: unknown } };
        }).navigator.serviceWorker.controller !== null);
        await context.setOffline(true);
        await page.reload();
        await page.waitForFunction(() => (globalThis as unknown as { __THREENATIVE_READY__?: { ok: boolean } }).__THREENATIVE_READY__?.ok === true);
        assert.equal(await page.locator("canvas").count(), 1);
      } finally {
        await browser.close();
      }
    } finally {
      await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeBundle(root: string): Promise<string> {
  const bundlePath = join(root, "game.bundle");
  await mkdir(bundlePath, { recursive: true });
  await writeJson(bundlePath, "manifest.json", {
    entry: { world: "world.ir.json" },
    files: { assets: "assets.manifest.json", distribution: "distribution.ir.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    name: "web-test",
    requiredCapabilities: {},
    schema: "threenative.bundle",
    version: "0.1.0",
  });
  await writeJson(bundlePath, "world.ir.json", {
    entities: [
      {
        components: {
          Camera: { active: true, far: 100, fovY: 60, kind: "perspective", near: 0.1 },
          Transform: { position: [0, 0, 5], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        },
        id: "camera.main",
      },
      {
        components: {
          MeshRenderer: { material: "mat.box", mesh: "mesh.box" },
          Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        },
        id: "box",
      },
    ],
    schema: "threenative.world",
    version: "0.1.0",
  });
  await writeJson(bundlePath, "assets.manifest.json", { assets: [{ format: "generated", id: "mesh.box", kind: "mesh", primitive: "box", size: [1, 1, 1] }], schema: "threenative.assets", version: "0.1.0" });
  await writeJson(bundlePath, "materials.ir.json", { materials: [{ color: "#ffffff", id: "mat.box", kind: "standard" }], schema: "threenative.materials", version: "0.1.0" });
  await writeJson(bundlePath, "target.profile.json", { schema: "threenative.target-profile", targets: ["web", "desktop"], version: "0.1.0" });
  await writeJson(bundlePath, "distribution.ir.json", {
    app: { buildNumber: 1, displayName: "Web Test", icons: "assets/icon.png", id: "com.threenative.webtest", version: "1.0.0" },
    schema: "threenative.distribution",
    targets: [{ formats: ["static", "zip", "pwa"], platform: "web", runtime: "web" }],
    version: "0.1.0",
  });
  return bundlePath;
}

async function writeJson(root: string, path: string, value: unknown): Promise<void> {
  await writeFile(join(root, path), `${JSON.stringify(value, null, 2)}\n`);
}

function createStaticServer(root: string, basePath = "") {
  return createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (basePath !== "" && pathname !== basePath && !pathname.startsWith(`${basePath}/`)) throw new Error("outside base path");
      const urlPath = basePath === "" ? pathname : pathname.slice(basePath.length) || "/";
      const requested = resolve(root, `.${urlPath === "/" ? "/index.html" : urlPath}`);
      if (!requested.startsWith(`${resolve(root)}/`)) throw new Error("unsafe path");
      const bytes = await readFile(requested);
      response.statusCode = 200;
      response.setHeader("content-type", mime(extname(requested)));
      response.end(bytes);
    } catch {
      response.statusCode = 404;
      response.end("not found");
    }
  });
}

function mime(extension: string): string {
  if (extension === ".html") return "text/html";
  if (extension === ".js") return "text/javascript";
  if (extension === ".json") return "application/json";
  return "application/octet-stream";
}
