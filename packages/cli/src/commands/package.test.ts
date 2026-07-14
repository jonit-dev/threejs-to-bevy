import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { packageCommand, type ICefPayloadManifest } from "./package.js";

const execFileAsync = promisify(execFile);

test("package should copy a desktop bundle into stable artifact layout", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-package-"));
  try {
    await writeBundle(root, ["web", "desktop"]);
    let runtimeFeatures: string[] | undefined;

    const result = await packageCommand(["--bundle", "game.bundle", "--outDir", "artifacts/package", "--json"], root, {
      runtimeBuilder: async ({ cargoFeatures, outputPath }) => {
        runtimeFeatures = cargoFeatures;
        await writeFile(outputPath, "#!/usr/bin/env sh\necho threenative runtime\n", { mode: 0o755 });
        return outputPath;
      },
    });
    const payload = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_PACKAGE_OK");
    assert.deepEqual(runtimeFeatures, []);
    assert.equal(payload.target, "desktop");
    assert.equal(payload.artifacts.packagedBundlePath.endsWith("artifacts/package/desktop/game.bundle"), true);
    assert.equal(payload.artifacts.runtimeExecutablePath.endsWith("artifacts/package/desktop/threenative_runtime"), true);
    assert.equal(payload.manifestPath.endsWith("artifacts/package/desktop/package.manifest.json"), true);
    assert.equal(payload.runtimeArgsPath.endsWith("artifacts/package/desktop/runtime.args.json"), true);
    assert.deepEqual(payload.files, ["assets.manifest.json", "manifest.json", "materials.ir.json", "target.profile.json", "world.ir.json"]);

    const report = JSON.parse(await readFile(join(root, "artifacts/package/desktop/package.report.json"), "utf8"));
    assert.equal(report.schema, "threenative.package-report");
    assert.equal(report.artifacts.runtimeExecutablePath.endsWith("artifacts/package/desktop/threenative_runtime"), true);
    const manifest = JSON.parse(await readFile(join(root, "artifacts/package/desktop/package.manifest.json"), "utf8"));
    assert.equal(manifest.schema, "threenative.package");
    assert.equal(manifest.target, "desktop");
    assert.equal(manifest.artifacts.runtimeExecutablePath.endsWith("artifacts/package/desktop/threenative_runtime"), true);
    const runtimeArgs = JSON.parse(await readFile(join(root, "artifacts/package/desktop/runtime.args.json"), "utf8"));
    assert.equal(runtimeArgs.command, "./threenative_runtime");
    assert.deepEqual(runtimeArgs.args, ["game.bundle"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("package should create archive and installer artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-package-installer-"));
  try {
    await writeBundle(root, ["web", "desktop"]);
    const runtimeBuilder = async ({ outputPath }: { outputPath: string }): Promise<string> => {
      await writeFile(outputPath, "#!/usr/bin/env sh\necho threenative runtime\n", { mode: 0o755 });
      return outputPath;
    };

    const archiveResult = await packageCommand(["--bundle", "game.bundle", "--outDir", "artifacts/archive", "--format", "archive", "--json"], root, { runtimeBuilder });
    const archivePayload = JSON.parse(archiveResult.stdout);
    assert.equal(archiveResult.exitCode, 0);
    assert.equal(archivePayload.format, "archive");
    assert.match(archivePayload.artifacts.archivePath, /game-bevy-[^-]+-[^-]+\.tar\.gz$/);
    const archiveListing = await execFileAsync("tar", ["-tzf", archivePayload.artifacts.archivePath]);
    assert.match(archiveListing.stdout, /desktop\/threenative_runtime/);
    assert.match(archiveListing.stdout, /desktop\/game\.bundle\/manifest\.json/);

    const installerResult = await packageCommand(["--bundle", "game.bundle", "--outDir", "artifacts/installer", "--format", "installer", "--json"], root, { runtimeBuilder });
    const installerPayload = JSON.parse(installerResult.stdout);
    assert.equal(installerResult.exitCode, 0);
    assert.equal(installerPayload.format, "installer");
    assert.match(installerPayload.artifacts.installerPath, /game-[^-]+-[^-]+-installer\.sh$/);
    const installerScript = await readFile(installerPayload.artifacts.installerPath, "utf8");
    assert.match(installerScript, /^#!\/usr\/bin\/env sh/);
    assert.match(installerScript, /__THREENATIVE_ARCHIVE_BELOW__/);

    const installDir = join(root, "installed-game");
    await execFileAsync("sh", [installerPayload.artifacts.installerPath, installDir]);
    assert.match(await readFile(join(installDir, "run.sh"), "utf8"), /exec \.\/threenative_runtime "game\.bundle"/);
    assert.equal(await readFile(join(installDir, "desktop", "game.bundle", "manifest.json"), "utf8").then((value) => value.length > 0), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("package should build a validated mounted CEF AppImage", { skip: process.platform !== "linux" || process.arch !== "x64" }, async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-package-cef-appimage-"));
  try {
    await writeBundle(root, ["web", "desktop"], true);
    const cefRuntimeDir = join(root, "cef-runtime");
    await mkdir(cefRuntimeDir);
    const bytes = Buffer.from("pinned-cef-runtime");
    await writeFile(join(cefRuntimeDir, "libcef.so"), bytes);
    const manifest = testCefManifest("libcef.so", bytes);
    let runtimeFeatures: string[] | undefined;

    const result = await packageCommand(
      ["--bundle", "game.bundle", "--outDir", "artifacts/appimage", "--format", "appimage", "--json"],
      root,
      {
        cefPayloadManifest: manifest,
        cefRuntimeDir,
        runtimeBuilder: async ({ cargoFeatures, outputPath }) => {
          runtimeFeatures = cargoFeatures;
          await writeFile(outputPath, "fake-runtime", { mode: 0o755 });
          return outputPath;
        },
        appImageBuilder: async ({ appDir, outputPath }) => {
          assert.match(await readFile(join(appDir, "AppRun"), "utf8"), /game\.bundle/);
          assert.match(await readFile(join(appDir, "threenative_runtime"), "utf8"), /LD_LIBRARY_PATH/);
          assert.equal(await readFile(join(appDir, "libcef.so"), "utf8"), bytes.toString());
          assert.equal(JSON.parse(await readFile(join(appDir, "cef-runtime-manifest.json"), "utf8")).backend, "cef-osr");
          await writeFile(outputPath, "mounted-appimage", { mode: 0o755 });
          return outputPath;
        },
      },
    );
    const payload = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 0);
    assert.equal(payload.format, "appimage");
    assert.equal(payload.nativeOverlay.backend, "cef-osr");
    assert.deepEqual(runtimeFeatures, ["native-overlay-cef"]);
    assert.equal(payload.nativeOverlay.logicalPayloadBytes, bytes.length);
    assert.equal(payload.nativeOverlay.mountedPackage.bytes, Buffer.byteLength("mounted-appimage"));
    assert.equal(payload.nativeOverlay.mountedPackage.sha256, createHash("sha256").update("mounted-appimage").digest("hex"));
    assert.match(payload.artifacts.appImagePath, /game-bevy-linux-x64\.AppImage$/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("package should fail when a descriptor-owned CEF artifact is missing", { skip: process.platform !== "linux" || process.arch !== "x64" }, async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-package-cef-missing-"));
  try {
    await writeBundle(root, ["desktop"], true);
    const cefRuntimeDir = join(root, "cef-runtime");
    await mkdir(cefRuntimeDir);
    const result = await packageCommand(["--bundle", "game.bundle", "--json"], root, {
      cefPayloadManifest: testCefManifest("libcef.so", Buffer.from("expected")),
      cefRuntimeDir,
      runtimeBuilder: async ({ outputPath }) => {
        await writeFile(outputPath, "fake-runtime", { mode: 0o755 });
        return outputPath;
      },
    });
    const payload = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_OVERLAY_CEF_HELPER_MISSING");
    assert.match(payload.message, /libcef\.so/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("package should reject an unpinned CEF artifact", { skip: process.platform !== "linux" || process.arch !== "x64" }, async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-package-cef-checksum-"));
  try {
    await writeBundle(root, ["desktop"], true);
    const cefRuntimeDir = join(root, "cef-runtime");
    await mkdir(cefRuntimeDir);
    await writeFile(join(cefRuntimeDir, "libcef.so"), "wrong-version");
    const result = await packageCommand(["--bundle", "game.bundle", "--json"], root, {
      cefPayloadManifest: testCefManifest("libcef.so", Buffer.from("expected-version")),
      cefRuntimeDir,
      runtimeBuilder: async ({ outputPath }) => {
        await writeFile(outputPath, "fake-runtime", { mode: 0o755 });
        return outputPath;
      },
    });
    const payload = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_OVERLAY_CEF_RESOURCE_REJECTED");
    assert.match(payload.message, /checksum mismatch/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});


test("package should create desktop-web runtime package artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-package-webview-"));
  try {
    await writeBundle(root, ["web", "desktop"]);

    const result = await packageCommand(["--bundle", "game.bundle", "--outDir", "artifacts/webview", "--runtime", "webview", "--format", "installer", "--json"], root);
    const payload = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 0);
    assert.equal(payload.runtime, "webview");
    assert.equal(payload.format, "installer");
    assert.equal(payload.bundlePath.endsWith("artifacts/webview/desktop-web/app/bundle"), true);
    assert.equal(payload.artifacts.runtimeExecutablePath.endsWith("artifacts/webview/desktop-web/threenative_webview_runtime"), true);
    assert.equal(payload.artifacts.webviewInspectionPath.endsWith("artifacts/webview/desktop-web/webview.inspection.json"), true);
    assert.match(payload.artifacts.archivePath, /game-webview-[^-]+-[^-]+\.tar\.gz$/);

    const archiveListing = await execFileAsync("tar", ["-tzf", payload.artifacts.archivePath]);
    assert.match(archiveListing.stdout, /desktop-web\/threenative_webview_runtime/);
    assert.match(archiveListing.stdout, /desktop-web\/app\/index\.html/);
    assert.match(archiveListing.stdout, /desktop-web\/app\/bundle\/manifest\.json/);
    assert.match(archiveListing.stdout, /desktop-web\/webview\.inspection\.json/);

    const inspection = JSON.parse(await readFile(payload.artifacts.webviewInspectionPath, "utf8"));
    assert.equal(inspection.schema, "threenative.package-webview-inspection");
    assert.equal(inspection.code, "TN_PACKAGE_WEBVIEW_INSPECTION_READY");
    assert.equal(inspection.host.embeddedWebview, false);
    assert.equal(inspection.host.launcher, "local-static-server");
    assert.equal(inspection.checks.some((check: { code: string; status: string }) => check.code === "TN_PACKAGE_WEBVIEW_HOST_MANUAL" && check.status === "manual"), true);
    assert.match(inspection.manualChecks.join("\n"), /window\.__THREENATIVE_READY__/);

    const installDir = join(root, "installed-webview-game");
    await execFileAsync("sh", [payload.artifacts.installerPath, installDir]);
    const runner = await readFile(join(installDir, "run.sh"), "utf8");
    assert.match(runner, /cd "\$HERE\/desktop-web"/);
    assert.match(runner, /exec \.\/threenative_webview_runtime "app"/);
    assert.equal(await readFile(join(installDir, "desktop-web", "app", "bundle", "manifest.json"), "utf8").then((value) => value.length > 0), true);
    assert.equal(await readFile(join(installDir, "desktop-web", "webview.inspection.json"), "utf8").then((value) => value.includes("TN_PACKAGE_WEBVIEW_INSPECTION_READY")), true);
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
    assert.equal(payload.code, "TN_PACKAGE_TARGET_PROFILE_UNSUPPORTED");
    assert.equal(payload.path, "target.profile.json/targets");
    assert.equal(payload.target, "desktop");
    assert.match(payload.message, /Mobile and online/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("package should reject bundle target profile without desktop target", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-package-profile-"));
  try {
    await writeBundle(root, ["web"]);

    const result = await packageCommand(["--bundle", "game.bundle", "--json"], root);
    const payload = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_PACKAGE_TARGET_PROFILE_UNSUPPORTED");
    assert.equal(payload.path, "target.profile.json/targets");
    assert.equal(payload.target, "desktop");
    assert.deepEqual(payload.value, ["web"]);
    assert.match(payload.suggestion, /desktop/);
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

test("package should reject unsupported package formats", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-package-format-"));
  try {
    await writeBundle(root, ["web", "desktop"]);

    const result = await packageCommand(["--bundle", "game.bundle", "--format", "msi", "--json"], root);
    const payload = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_PACKAGE_FORMAT_UNSUPPORTED");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("package preflight should report credential-required when signing identity is omitted", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-package-preflight-"));
  try {
    await writeBundle(root, ["web", "desktop"]);

    const result = await packageCommand(["--bundle", "game.bundle", "--target", "mobile", "--preflight", "--json"], root);
    const payload = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 0);
    assert.equal(payload.schema, "threenative.package-preflight-report");
    assert.equal(payload.credentials[0].code, "TN_PACKAGE_SIGNING_CREDENTIAL_REQUIRED");
    assert.equal(payload.credentials[0].status, "missing");
    assert.equal(payload.diagnostics[0].path, "package.signing.identity");
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

async function writeBundle(root: string, targets: string[], desktopOverlay = false): Promise<void> {
  const bundle = join(root, "game.bundle");
  await mkdir(bundle);
  await writeFile(
    join(bundle, "manifest.json"),
    JSON.stringify({
      schema: "threenative.bundle",
      version: "0.1.0",
      entry: { world: "world.ir.json", ...(desktopOverlay ? { overlays: "overlays.ir.json" } : {}) },
      requiredCapabilities: {},
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    }),
  );
  await writeFile(join(bundle, "target.profile.json"), JSON.stringify({ schema: "threenative.target-profile", version: "0.1.0", targets }));
  await writeFile(join(bundle, "world.ir.json"), JSON.stringify({ schema: "threenative.world", version: "0.1.0", entities: [], prefabs: [] }));
  await writeFile(join(bundle, "assets.manifest.json"), JSON.stringify({ schema: "threenative.assets", version: "0.1.0", assets: [] }));
  await writeFile(join(bundle, "materials.ir.json"), JSON.stringify({ schema: "threenative.materials", version: "0.1.0", materials: [] }));
  if (desktopOverlay) {
    await writeFile(join(bundle, "overlays.ir.json"), JSON.stringify({
      schema: "threenative.overlays",
      version: "0.2.0",
      overlays: [{
        id: "hud",
        entry: "overlay/index.html",
        targetProfiles: ["desktop"],
        transparent: true,
        zIndex: 1,
        input: "pointer",
        messages: { gameToOverlay: [], overlayToGame: [] },
      }],
    }));
    await mkdir(join(bundle, "overlay"));
    await writeFile(join(bundle, "overlay", "index.html"), "<!doctype html><title>HUD</title>");
  }
}

function testCefManifest(path: string, bytes: Buffer): ICefPayloadManifest {
  return {
    schema: "threenative.native-overlay-backend",
    version: "0.1.0",
    backend: "cef-osr",
    cargoFeature: "native-overlay-cef",
    cefCrate: "150.0.0+150.0.10",
    cefDistribution: "150.0.10+test",
    chromium: "150.0.7871.101",
    platform: "linux-x86_64",
    helperModel: "runtime-reexec-before-bevy",
    locales: ["en-US"],
    payload: [{
      path,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      source: "distribution",
    }],
  };
}
