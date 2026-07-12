import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { runWebviewPackageGate } from "./webviewPackageGate.js";

test("should package and measure a desktop-web webview package fixture", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-webview-package-gate-"));
  try {
    const bundlePath = "fixtures/game.bundle";
    await writeFixtureBundle(resolve(root, bundlePath));
    let omitOverlayJavaScript = false;
    const runPackage = ({ args }: { args: readonly string[] }) => {
        const out = requireArg(args, "--out");
        const packageRoot = resolve(out, "desktop-web");
        const appRoot = resolve(packageRoot, "app");
        mkdirSync(resolve(appRoot, "bundle"), { recursive: true });
        mkdirSync(resolve(appRoot, "bundle/overlay/inventory/assets"), { recursive: true });
        writeFileSync(resolve(appRoot, "index.html"), "<!doctype html><canvas></canvas>\n");
        writeFileSync(resolve(appRoot, "assets.js"), "export {};\n");
        writeFileSync(resolve(appRoot, "bundle", "manifest.json"), "{}\n");
        writeFileSync(resolve(appRoot, "bundle/overlays.ir.json"), JSON.stringify({ overlays: [{ entry: "overlay/inventory/index.html", id: "inventory" }] }));
        writeFileSync(resolve(appRoot, "bundle/overlay/inventory/index.html"), '<link rel="stylesheet" href="./assets/app.css"><script type="module" src="./assets/app.js"></script>');
        writeFileSync(resolve(appRoot, "bundle/overlay/inventory/assets/app.css"), ".inventory{display:grid}\n");
        if (!omitOverlayJavaScript) writeFileSync(resolve(appRoot, "bundle/overlay/inventory/assets/app.js"), "export {};\n");
        const runtimeExecutablePath = resolve(packageRoot, "threenative_webview_runtime");
        writeFileSync(runtimeExecutablePath, "#!/usr/bin/env sh\nprintf 'ThreeNative desktop-web runtime ready at http://127.0.0.1:0/index.html\\n'\nsleep 5\n");
        chmodSync(runtimeExecutablePath, 0o755);
        writeFileSync(resolve(packageRoot, "runtime.args.json"), JSON.stringify({ args: ["app"], runtime: "webview" }));
        writeFileSync(resolve(packageRoot, "webview.inspection.json"), JSON.stringify({
          checks: [
            { code: "TN_PACKAGE_WEBVIEW_BUNDLE_COPIED", status: "pass" },
            { code: "TN_PACKAGE_WEBVIEW_RUNTIME_LAUNCHER", status: "pass" },
            { code: "TN_PACKAGE_WEBVIEW_RUNTIME_ARGS", status: "pass" },
          ],
          host: { embeddedWebview: false },
          schema: "threenative.package-webview-inspection",
        }));
        writeFileSync(resolve(packageRoot, "package.report.json"), JSON.stringify({
          artifacts: {
            archivePath: resolve(out, "game-webview-linux-x64.tar.gz"),
            packageReportPath: resolve(packageRoot, "package.report.json"),
            runtimeExecutablePath,
            runtimeArgsPath: resolve(packageRoot, "runtime.args.json"),
            webviewInspectionPath: resolve(packageRoot, "webview.inspection.json"),
          },
          files: ["index.html", "assets.js", "bundle/manifest.json", "bundle/overlays.ir.json", "bundle/overlay/inventory/index.html", "bundle/overlay/inventory/assets/app.css", "bundle/overlay/inventory/assets/app.js"],
          schema: "threenative.package-report",
        }));
        writeFileSync(resolve(out, "game-webview-linux-x64.tar.gz"), "archive\n");
      return {
          exitCode: 0,
          stderr: "",
          stdout: JSON.stringify({
            artifacts: {
              archivePath: resolve(out, "game-webview-linux-x64.tar.gz"),
              packageReportPath: resolve(packageRoot, "package.report.json"),
              runtimeExecutablePath,
              runtimeArgsPath: resolve(packageRoot, "runtime.args.json"),
              webviewInspectionPath: resolve(packageRoot, "webview.inspection.json"),
            },
          }),
      };
    };
    const result = await runWebviewPackageGate({
      bundlePath,
      reportPath: resolve(root, "artifacts/webview-package/verification-report.json"),
      root,
      runPackage,
    });

    assert.equal(result.ok, true, result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    assert.equal(result.measurements?.inputServiceCount, 2);
    assert.equal(result.measurements?.saveSlotCount, 1);
    assert.equal(result.measurements?.settingsCount, 1);
    assert.equal(typeof result.measurements?.startupMs, "number");
    assert.equal(result.measurements?.startupChecks.includes("TN_PACKAGE_WEBVIEW_RUNTIME_ARGS"), true);
    assert.equal(result.measurements?.bundleFileCount, 5);
    assert.equal(result.measurements?.overlayCount, 1);
    assert.equal(result.measurements?.overlayAssetCount, 2);

    omitOverlayJavaScript = true;
    const missingAsset = await runWebviewPackageGate({
      bundlePath,
      reportPath: resolve(root, "artifacts/webview-package/missing-asset-report.json"),
      root,
      runPackage,
    });
    assert.equal(missingAsset.ok, false);
    assert.equal(missingAsset.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_WEBVIEW_OVERLAY_ASSET_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeFixtureBundle(bundleRoot: string): Promise<void> {
  await mkdir(bundleRoot, { recursive: true });
  await writeFile(resolve(bundleRoot, "systems.ir.json"), JSON.stringify({
    systems: [
      {
        services: ["ui.activate", "ui.focus", "persistence.save", "settings.set"],
      },
    ],
  }));
  await writeFile(resolve(bundleRoot, "local-data.ir.json"), JSON.stringify({
    saveSlots: [{ id: "slot.auto" }],
    settings: [{ key: "volume" }],
  }));
  await writeFile(resolve(bundleRoot, "ui.ir.json"), JSON.stringify({
    focusOrder: ["play"],
  }));
  await mkdir(resolve(bundleRoot, "overlay/inventory/assets"), { recursive: true });
  await writeFile(resolve(bundleRoot, "overlays.ir.json"), JSON.stringify({
    overlays: [{ entry: "overlay/inventory/index.html", id: "inventory" }],
  }));
  await writeFile(resolve(bundleRoot, "overlay/inventory/index.html"), '<link rel="stylesheet" href="./assets/app.css"><script type="module" src="./assets/app.js"></script>');
  await writeFile(resolve(bundleRoot, "overlay/inventory/assets/app.css"), ".inventory{display:grid}\n");
  await writeFile(resolve(bundleRoot, "overlay/inventory/assets/app.js"), "export {};\n");
}

function requireArg(args: readonly string[], name: string): string {
  const value = args[args.indexOf(name) + 1];
  if (typeof value !== "string") {
    throw new Error(`Missing ${name}`);
  }
  return value;
}
