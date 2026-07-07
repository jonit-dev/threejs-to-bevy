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

    const result = await runWebviewPackageGate({
      bundlePath,
      reportPath: resolve(root, "artifacts/webview-package/verification-report.json"),
      root,
      runPackage: ({ args }) => {
        const out = requireArg(args, "--out");
        const packageRoot = resolve(out, "desktop-web");
        const appRoot = resolve(packageRoot, "app");
        mkdirSync(resolve(appRoot, "bundle"), { recursive: true });
        writeFileSync(resolve(appRoot, "index.html"), "<!doctype html><canvas></canvas>\n");
        writeFileSync(resolve(appRoot, "assets.js"), "export {};\n");
        writeFileSync(resolve(appRoot, "bundle", "manifest.json"), "{}\n");
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
          files: ["index.html", "assets.js", "bundle/manifest.json"],
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
      },
    });

    assert.equal(result.ok, true, result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    assert.equal(result.measurements?.inputServiceCount, 2);
    assert.equal(result.measurements?.saveSlotCount, 1);
    assert.equal(result.measurements?.settingsCount, 1);
    assert.equal(typeof result.measurements?.startupMs, "number");
    assert.equal(result.measurements?.startupChecks.includes("TN_PACKAGE_WEBVIEW_RUNTIME_ARGS"), true);
    assert.equal(result.measurements?.bundleFileCount, 1);
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
}

function requireArg(args: readonly string[], name: string): string {
  const value = args[args.indexOf(name) + 1];
  if (typeof value !== "string") {
    throw new Error(`Missing ${name}`);
  }
  return value;
}
