import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PNG } from "pngjs";

import { verifyV3Scene } from "./v3Scene.js";

test("v3Scene should report scene authoring artifacts when verification passes", async () => {
  const root = await makeBundle();
  try {
    const report = await verifyV3Scene({ artifactDir: root, bundlePath: root, screenshotCapturer: mockScreenshotCapturer(80) });

    assert.equal(report.status, "pass");
    assert.equal(report.counts.bookmarks, 1);
    assert.equal(report.counts.heroPlacements, 1);
    assert.equal(report.counts.scatterInstances, 1);
    assert.equal(report.captures[0]?.bookmarkId, "bookmark.start");
    assert.match(report.artifacts.sideBySideContactSheetPath ?? "", /threejs-bevy-side-by-side\.png$/);
    assert.equal(report.nativeSmoke.visualParity, "not-asserted");
    assert.match(report.artifacts.bundleHash, /^[a-f0-9]{64}$/);
    assert.equal(JSON.parse(await readFile(join(root, "v3-scene-report.json"), "utf8")).status, "pass");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("v3Scene should fail when required asset tag is absent", async () => {
  const root = await makeBundle({ expectedTags: ["flower"] });
  try {
    const report = await verifyV3Scene({ artifactDir: root, bundlePath: root, screenshotCapturer: mockScreenshotCapturer(80) });

    assert.equal(report.status, "fail");
    assert.equal(report.diagnostics[0]?.code, "TN_V3_SCENE_BOOKMARK_TAG_MISSING");
    assert.match(report.diagnostics[0]?.message ?? "", /flower/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("v3Scene should fail when screenshot is blank", async () => {
  const root = await makeBundle();
  try {
    const report = await verifyV3Scene({ artifactDir: root, bundlePath: root, screenshotCapturer: mockScreenshotCapturer(0) });

    assert.equal(report.status, "fail");
    assert.equal(report.diagnostics[0]?.code, "TN_V3_SCENE_SCREENSHOT_BLANK");
    assert.match(report.diagnostics[0]?.message ?? "", /bookmark.start/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function makeBundle(options: { expectedTags?: string[] } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-v3-scene-"));
  await mkdir(join(root, "assets/environment"), { recursive: true });
  await writeJson(root, "manifest.json", {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "scene",
    entry: { world: "world.ir.json", environmentScene: "environment.scene.json" },
    files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    requiredCapabilities: {},
  });
  await writeJson(root, "world.ir.json", { schema: "threenative.world", version: "0.1.0", entities: [] });
  await writeJson(root, "assets.manifest.json", {
    schema: "threenative.assets",
    version: "0.1.0",
    assets: [{ format: "gltf", id: "model.env.Rock", kind: "model", path: "assets/environment/Rock.gltf" }],
  });
  await writeJson(root, "materials.ir.json", { schema: "threenative.materials", version: "0.1.0", materials: [] });
  await writeJson(root, "target.profile.json", { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] });
  await writeJson(root, "environment.scene.json", {
    schema: "threenative.environment-scene",
    version: "0.1.0",
    terrain: { id: "terrain.forest", heightMode: "flat", bounds: { min: [-5, 0, -5], max: [5, 0, 5] } },
    path: { id: "path.main", points: [[0, 0, 3], [0, 0, -3]], width: 2 },
    sourceAssets: [{ id: "env.Rock", asset: "model.env.Rock", category: "rock" }],
    instances: [
      { id: "rock.hero", kind: "hero", sourceAsset: "env.Rock", position: [2, 0, 0], tags: ["rock"] },
      { id: "rock.scatter.1", kind: "scatter", sourceAsset: "env.Rock", position: [-2, 0, 0], tags: ["rock"] },
    ],
    bookmarks: [{ id: "bookmark.start", position: [0, 1.7, 4], yaw: 180, pitch: -5, expectedTags: options.expectedTags ?? ["rock"] }],
  });
  return root;
}

async function writeJson(root: string, file: string, value: unknown): Promise<void> {
  await writeFile(join(root, file), `${JSON.stringify(value, null, 2)}\n`);
}

function mockScreenshotCapturer(value: number) {
  return async (options: { artifactDir: string; bookmarkIds: readonly string[] }) => {
    const screenshotDir = join(options.artifactDir, "screenshots");
    await mkdir(screenshotDir, { recursive: true });
    const sideBySidePath = join(screenshotDir, "threejs-bevy-side-by-side.png");
    await writePng(sideBySidePath, 80);
    return Promise.all(options.bookmarkIds.map(async (bookmarkId) => {
      const threejsPath = join(screenshotDir, `${bookmarkId}.threejs.png`);
      const bevyGltfPath = join(screenshotDir, `${bookmarkId}.bevy-gltf.png`);
      await writePng(threejsPath, value);
      await writePng(bevyGltfPath, 40);
      return { bookmarkId, bevyGltfPath, sideBySidePath, threejsPath };
    }));
  };
}

async function writePng(path: string, value: number): Promise<void> {
  const png = new PNG({ height: 8, width: 8 });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = value;
    png.data[index + 1] = value;
    png.data[index + 2] = value;
    png.data[index + 3] = 255;
  }
  await writeFile(path, PNG.sync.write(png));
}
