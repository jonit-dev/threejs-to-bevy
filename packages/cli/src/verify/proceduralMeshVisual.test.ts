import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PNG } from "pngjs";

import { verifyProceduralMeshVisual } from "./proceduralMeshVisual.js";

test("should pass matching procedural mesh screenshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v8-procedural-"));
  try {
    await makeBundle(root);
    const report = await verifyProceduralMeshVisual({
      artifactDir: root,
      bundlePath: root,
      screenshotCapturer: mockCapturer([210, 64, 64], [210, 64, 64]),
    });

    assert.equal(report.status, "pass");
    assert.equal(report.metrics.silhouetteOverlap, 1);
    assert.deepEqual(report.helpers.map((entry) => entry.helper), ["pineTree", "bush", "arch"]);
    assert.match(report.artifacts.contactSheetPath, /contact-sheet\.png$/);
    assert.match(report.artifacts.diffPath, /diff\.png$/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail when the native screenshot is blank", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v8-procedural-blank-"));
  try {
    await makeBundle(root);
    const report = await verifyProceduralMeshVisual({
      artifactDir: root,
      bundlePath: root,
      screenshotCapturer: mockCapturer([210, 64, 64], [0, 0, 0], 0),
    });

    assert.equal(report.status, "fail");
    assert.equal(report.diagnostics[0]?.code, "TN_V8_PROCEDURAL_MESH_BEVY_BLANK");
    assert.match(report.diagnostics[0]?.message ?? "", /bevy\.png/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail when material color drifts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v8-procedural-color-"));
  try {
    await makeBundle(root);
    const report = await verifyProceduralMeshVisual({
      artifactDir: root,
      bundlePath: root,
      screenshotCapturer: mockCapturer([210, 64, 64], [64, 64, 210]),
    });

    assert.equal(report.status, "fail");
    assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_V8_PROCEDURAL_MESH_COLOR_DRIFT"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject fixture drift when a registry-enrolled visual helper is absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v8-procedural-drift-"));
  try {
    await makeBundle(root);
    const assetsPath = join(root, "assets.manifest.json");
    const assets = JSON.parse(await readFile(assetsPath, "utf8")) as { assets: Array<{ generation?: { helper?: string } }> };
    assets.assets = assets.assets.filter((asset) => asset.generation?.helper !== "arch");
    await writeFile(assetsPath, `${JSON.stringify(assets, null, 2)}\n`);
    await assert.rejects(
      verifyProceduralMeshVisual({ artifactDir: root, bundlePath: root, screenshotCapturer: mockCapturer([210, 64, 64], [210, 64, 64]) }),
      /missing registry enrollments: arch/,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function makeBundle(root: string): Promise<void> {
  await writeJson(root, "manifest.json", {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "procedural",
    requiredCapabilities: { rendering: ["mesh.procedural.custom", "material.standard"] },
    entry: { world: "world.ir.json" },
    files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
  });
  await writeJson(root, "world.ir.json", {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      ...["pineTree", "bush", "arch"].map((helper) => ({
        id: `prop.${helper}`,
        components: {
          Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          MeshRenderer: { mesh: `mesh.${helper}`, material: "mat.prop" },
        },
      })),
    ],
  });
  await writeJson(root, "assets.manifest.json", {
    schema: "threenative.assets",
    version: "0.1.0",
    assets: [
      ...["pineTree", "bush", "arch"].map((helper) => ({
        id: `mesh.${helper}`,
        kind: "mesh",
        format: "generated",
        primitive: "custom",
        topology: "triangle-list",
        usage: "static",
        bounds: { min: [0, 0, 0], max: [1, 1, 0] },
        attributes: [{ name: "position", itemSize: 3, values: [0, 0, 0, 1, 0, 0, 0, 1, 0] }],
        indices: [0, 1, 2],
        generation: { helper, seed: 1 },
      })),
    ],
  });
  await writeJson(root, "materials.ir.json", {
    schema: "threenative.materials",
    version: "0.1.0",
    materials: [{ id: "mat.prop", kind: "standard", color: "#d24040", roughness: 1, metalness: 0 }],
  });
  await writeJson(root, "target.profile.json", { schema: "threenative.target-profile", version: "0.1.0", targets: ["web", "desktop"] });
}

function mockCapturer(webColor: [number, number, number], bevyColor: [number, number, number], bevyAlpha = 255) {
  return async (options: { artifactDir: string }) => {
    await mkdir(options.artifactDir, { recursive: true });
    const webScreenshotPath = join(options.artifactDir, "web.png");
    const bevyScreenshotPath = join(options.artifactDir, "bevy.png");
    await writePng(webScreenshotPath, webColor, 255);
    await writePng(bevyScreenshotPath, bevyColor, bevyAlpha);
    return { bevyScreenshotPath, webScreenshotPath };
  };
}

async function writeJson(root: string, file: string, value: unknown): Promise<void> {
  await writeFile(join(root, file), `${JSON.stringify(value, null, 2)}\n`);
}

async function writePng(path: string, color: [number, number, number], alpha: number): Promise<void> {
  const png = new PNG({ height: 8, width: 8 });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = color[0];
    png.data[index + 1] = color[1];
    png.data[index + 2] = color[2];
    png.data[index + 3] = alpha;
  }
  await writeFile(path, PNG.sync.write(png));
}
