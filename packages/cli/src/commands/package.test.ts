import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { packageCommand } from "./package.js";

test("package should copy a desktop bundle into stable artifact layout", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-package-"));
  try {
    await writeBundle(root, ["web", "desktop"]);

    const result = await packageCommand(["--bundle", "game.bundle", "--outDir", "artifacts/package", "--json"], root);
    const payload = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_PACKAGE_OK");
    assert.equal(payload.target, "desktop");
    assert.equal(payload.artifacts.packagedBundlePath.endsWith("artifacts/package/desktop/game.bundle"), true);
    assert.equal(payload.manifestPath.endsWith("artifacts/package/desktop/package.manifest.json"), true);
    assert.equal(payload.runtimeArgsPath.endsWith("artifacts/package/desktop/runtime.args.json"), true);
    assert.deepEqual(payload.files, ["assets.manifest.json", "manifest.json", "materials.ir.json", "target.profile.json", "world.ir.json"]);

    const report = JSON.parse(await readFile(join(root, "artifacts/package/desktop/package.report.json"), "utf8"));
    assert.equal(report.schema, "threenative.package-report");
    const manifest = JSON.parse(await readFile(join(root, "artifacts/package/desktop/package.manifest.json"), "utf8"));
    assert.equal(manifest.schema, "threenative.package");
    assert.equal(manifest.target, "desktop");
    const runtimeArgs = JSON.parse(await readFile(join(root, "artifacts/package/desktop/runtime.args.json"), "utf8"));
    assert.equal(runtimeArgs.command, "threenative_runtime");
    assert.deepEqual(runtimeArgs.args, ["game.bundle"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("package should reject mobile and online targets", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-package-mobile-"));
  try {
    await writeBundle(root, ["web", "desktop", "mobile"]);

    const result = await packageCommand(["--bundle", "game.bundle", "--json"], root);
    const payload = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_PACKAGE_FAILED");
    assert.match(payload.message, /Mobile and online/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("package should reject non-desktop command target", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-package-target-"));
  try {
    await writeBundle(root, ["web", "desktop"]);

    const result = await packageCommand(["--bundle", "game.bundle", "--target", "ios", "--json"], root);
    const payload = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_PACKAGE_TARGET_UNSUPPORTED");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("package should reject invalid bundles before copying artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-package-invalid-"));
  try {
    await writeBundle(root, ["web", "desktop"]);
    await writeFile(
      join(root, "game.bundle", "manifest.json"),
      JSON.stringify({ schema: "threenative.bundle", version: "0.1.0", entry: { world: "world.ir.json" }, files: { targetProfile: "target.profile.json" } }),
    );

    const result = await packageCommand(["--bundle", "game.bundle", "--json"], root);
    const payload = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_PACKAGE_BUNDLE_INVALID");
    assert.equal(payload.diagnostics.some((diagnostic: { code?: string }) => diagnostic.code === "TN_IR_MANIFEST_PATH_INVALID"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeBundle(root: string, targets: string[]): Promise<void> {
  const bundle = join(root, "game.bundle");
  await mkdir(bundle);
  await writeFile(
    join(bundle, "manifest.json"),
    JSON.stringify({
      schema: "threenative.bundle",
      version: "0.1.0",
      entry: { world: "world.ir.json" },
      requiredCapabilities: {},
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    }),
  );
  await writeFile(join(bundle, "target.profile.json"), JSON.stringify({ schema: "threenative.target-profile", version: "0.1.0", targets }));
  await writeFile(join(bundle, "world.ir.json"), JSON.stringify({ schema: "threenative.world", version: "0.1.0", entities: [], prefabs: [] }));
  await writeFile(join(bundle, "assets.manifest.json"), JSON.stringify({ schema: "threenative.assets", version: "0.1.0", assets: [] }));
  await writeFile(join(bundle, "materials.ir.json"), JSON.stringify({ schema: "threenative.materials", version: "0.1.0", materials: [] }));
}
