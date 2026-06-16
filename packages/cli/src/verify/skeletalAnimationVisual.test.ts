import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PNG } from "pngjs";

import { verifySkeletalAnimationVisual } from "./skeletalAnimationVisual.js";

test("should pass when web and bevy skeletal animation frames show motion", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v9-skeletal-"));
  try {
    await makeBundle(root);
    const report = await verifySkeletalAnimationVisual({
      artifactDir: root,
      bundlePath: root,
      screenshotCapturer: mockCapturer(0, 64, 64, 48),
    });

    assert.equal(report.status, "pass");
    assert.equal(report.metrics.webMotion.ok, true);
    assert.equal(report.metrics.bevyMotion.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail when skeletal animation frames are frozen", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v9-skeletal-frozen-"));
  try {
    await makeBundle(root);
    const report = await verifySkeletalAnimationVisual({
      artifactDir: root,
      bundlePath: root,
      screenshotCapturer: mockCapturer(0, 64, 64, 64),
    });

    assert.equal(report.status, "fail");
    assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_V9_SKELETAL_WEB_FROZEN"));
    assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_V9_SKELETAL_BEVY_FROZEN"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail when the native screenshot is blank", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v9-skeletal-blank-"));
  try {
    await makeBundle(root);
    const report = await verifySkeletalAnimationVisual({
      artifactDir: root,
      bundlePath: root,
      screenshotCapturer: async ({ artifactDir }) => {
        const webFrame01Path = join(artifactDir, "web-frame-01.png");
        const webFrame02Path = join(artifactDir, "web-frame-02.png");
        const bevyFrame01Path = join(artifactDir, "bevy-frame-01.png");
        const bevyFrame02Path = join(artifactDir, "bevy-frame-02.png");
        await writePng(webFrame01Path, 0, 64, 64);
        await writePng(webFrame02Path, 0, 96, 64);
        await writePng(bevyFrame01Path, 0, 0, 0);
        await writePng(bevyFrame02Path, 0, 48, 64);
        return { bevyFrame01Path, bevyFrame02Path, webFrame01Path, webFrame02Path };
      },
    });

    assert.equal(report.status, "fail");
    assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_V9_SKELETAL_BEVY_BLANK"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function makeBundle(root: string): Promise<void> {
  await writeJson(root, "manifest.json", {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "skeletal-animation",
    requiredCapabilities: { animation: ["clip-metadata"] },
    entry: { world: "world.ir.json" },
    files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
  });
  await writeJson(root, "world.ir.json", {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        id: "hero",
        components: {
          MeshRenderer: { mesh: "model.hero", material: "mat.hero" },
          Transform: { position: [0, 0.9, 0] },
        },
      },
      {
        id: "camera.main",
        components: {
          Camera: { kind: "perspective", fovY: 42, near: 0.1, far: 50 },
          Transform: { position: [0, 1.35, 3.4] },
        },
      },
    ],
    resources: { ActiveCamera: { entity: "camera.main" } },
  });
  await writeJson(root, "assets.manifest.json", {
    schema: "threenative.assets",
    version: "0.1.0",
    assets: [
      {
        id: "model.hero",
        kind: "model",
        format: "glb",
        path: "assets/hero.glb",
        animations: [{ id: "run", loop: true, sourceClip: "Armature|Run", speed: 1.1 }],
      },
    ],
  });
  await writeJson(root, "materials.ir.json", {
    schema: "threenative.materials",
    version: "0.1.0",
    materials: [{ id: "mat.hero", kind: "standard", color: "#ffffff" }],
  });
  await writeJson(root, "target.profile.json", {
    schema: "threenative.target-profile",
    version: "0.1.0",
    targets: ["desktop"],
  });
}

function mockCapturer(red: number, green: number, blue = 64, frame02Green = green) {
  return async ({ artifactDir }: { artifactDir: string }) => {
    const webFrame01Path = join(artifactDir, "web-frame-01.png");
    const webFrame02Path = join(artifactDir, "web-frame-02.png");
    const bevyFrame01Path = join(artifactDir, "bevy-frame-01.png");
    const bevyFrame02Path = join(artifactDir, "bevy-frame-02.png");
    await writePng(webFrame01Path, red, green, blue);
    await writePng(webFrame02Path, red, frame02Green, blue);
    await writePng(bevyFrame01Path, red, green, blue);
    await writePng(bevyFrame02Path, red, frame02Green, blue);
    return { bevyFrame01Path, bevyFrame02Path, webFrame01Path, webFrame02Path };
  };
}

async function writePng(path: string, red: number, green: number, blue: number): Promise<void> {
  const png = new PNG({ height: 64, width: 64 });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = red;
    png.data[index + 1] = green;
    png.data[index + 2] = blue;
    png.data[index + 3] = 255;
  }
  await writeFile(path, PNG.sync.write(png));
}

async function writeJson(root: string, file: string, value: unknown): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(join(root, file), `${JSON.stringify(value, null, 2)}\n`);
}
