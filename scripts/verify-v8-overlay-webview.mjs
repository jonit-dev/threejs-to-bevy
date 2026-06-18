import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveArtifactTargets } from "./artifact-paths.mjs";

import { buildV8OverlayWebviewOverlay } from "./build-v8-overlay-webview-overlay.mjs";
import { runCommand } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV8OverlayWebview(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const targets = resolveArtifactTargets({ gate: "overlay-webview", owner: { kind: "aggregate", name: "overlay-webview" }, root });

  const artifactDir = options.artifactDir ?? targets.absoluteDir;
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const projectPath = resolve(root, "examples/v8-overlay-webview");
  const bundlePath = resolve(projectPath, "dist/v8-overlay-webview.bundle");
  const steps = [];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    return result.exitCode === 0;
  }

  const overlayBuild = await buildV8OverlayWebviewOverlay(root, run);
  steps.push({ ...summarize(overlayBuild), name: "build React overlay app" });
  if (overlayBuild.exitCode !== 0) {
    return writeReport({ artifactDir, bundlePath, checks: {}, ok: false, reportPath, steps });
  }

  for (const [name, filter] of [
    ["build sdk", "@threenative/sdk"],
    ["build ir", "@threenative/ir"],
    ["build compiler", "@threenative/compiler"],
    ["build web runtime", "@threenative/runtime-web-three"],
    ["build cli", "@threenative/cli"],
  ]) {
    if (!(await step(name, "pnpm", ["--filter", filter, "build"], { timeoutMs: 120000 }))) {
      return writeReport({ artifactDir, bundlePath, checks: {}, ok: false, reportPath, steps });
    }
  }

  if (!(await step("build v8 overlay example", process.execPath, [resolve(root, "packages/cli/dist/index.js"), "build", "--project", projectPath, "--json"], { timeoutMs: 120000 }))) {
    return writeReport({ artifactDir, bundlePath, checks: {}, ok: false, reportPath, steps });
  }
  if (!(await step("validate v8 overlay example", process.execPath, [resolve(root, "packages/cli/dist/index.js"), "validate", "--project", projectPath, "--json"], { timeoutMs: 120000 }))) {
    return writeReport({ artifactDir, bundlePath, checks: {}, ok: false, reportPath, steps });
  }
  const nativeOverlayTest = await run({
    args: ["test", "overlay"],
    command: "cargo",
    cwd: resolve(root, "runtime-bevy"),
    name: "test native overlay bridge, host, and input policy",
    timeoutMs: 180000,
  });
  steps.push({ ...summarize(nativeOverlayTest), name: "test native overlay bridge, host, and input policy" });
  if (nativeOverlayTest.exitCode !== 0) {
    return writeReport({ artifactDir, bundlePath, checks: {}, ok: false, reportPath, steps });
  }

  const manifest = JSON.parse(await readFile(resolve(bundlePath, "manifest.json"), "utf8"));
  const overlays = JSON.parse(await readFile(resolve(bundlePath, "overlays.ir.json"), "utf8"));
  const overlayHtml = await readFile(resolve(bundlePath, "overlay/dist/index.html"), "utf8");
  const overlayJs = await readFile(resolve(bundlePath, "overlay/dist/assets/inventory-react.js"), "utf8");
  const spriteNames = ["key.svg", "potion.svg", "shield.svg"];
  const sprites = await Promise.all(spriteNames.map((name) => readFile(resolve(bundlePath, `overlay/dist/${name}`), "utf8")));
  const { createOverlayBridge } = await import("../packages/runtime-web-three/dist/overlay/bridge.js");
  const { overlayPointerEvents } = await import("../packages/runtime-web-three/dist/overlay/host.js");
  const bridge = createOverlayBridge(overlays.overlays);
  const validUseItem = bridge.send({ overlayId: "inventory", payload: { itemId: "potion" }, type: "inventory:use-item" });
  const validSnapshot = bridge.publish("inventory", "inventory:snapshot", { gold: 42, selected: "potion" });
  const invalidRejected = !bridge.send({ overlayId: "inventory", payload: { itemId: 99 }, type: "inventory:use-item" });

  const checks = {
    bridge: {
      eventCount: bridge.events.length,
      invalidRejected,
      snapshotCount: bridge.snapshots.length,
      validSnapshot,
      validUseItem,
      ok: validUseItem && validSnapshot && invalidRejected && bridge.events[0]?.type === "inventory:use-item",
    },
    emittedBundle: {
      hasOverlayEntry: manifest.entry.overlays === "overlays.ir.json",
      hasOverlayCapabilities: ["bridge", "input.pointer", "target.desktop", "target.web", "transparent", "webview"].every((capability) =>
        manifest.requiredCapabilities.overlay?.includes(capability),
      ),
      overlayId: overlays.overlays[0]?.id,
      overlayInput: overlays.overlays[0]?.input,
      ok:
        manifest.entry.overlays === "overlays.ir.json"
        && overlays.overlays[0]?.id === "inventory"
        && overlays.overlays[0]?.input === "pointer",
    },
    inputPolicy: {
      keyboardPassesPointerClicks: overlayPointerEvents("keyboard") === "none",
      nonePassesPointerClicks: overlayPointerEvents("none") === "none",
      pointerCapturesPointerClicks: overlayPointerEvents("pointer") === "auto",
      ok:
        overlayPointerEvents("none") === "none"
        && overlayPointerEvents("keyboard") === "none"
        && overlayPointerEvents("pointer") === "auto",
    },
    nativeHost: {
      defaultUnsupportedDiagnosticTestRan: nativeOverlayTest.stdout.includes("native_overlay_host_default_build_reports_unsupported"),
      overlayHostTestsPassed: nativeOverlayTest.stdout.includes("test result: ok") && nativeOverlayTest.stdout.includes("overlay_host"),
      ok:
        nativeOverlayTest.stdout.includes("native_overlay_host_default_build_reports_unsupported")
        && nativeOverlayTest.stdout.includes("maps_overlay_input_capture_modes"),
    },
    reactOverlay: {
      htmlReferencesBundle: overlayHtml.includes("inventory-react.js"),
      reactBundlePresent: overlayJs.includes("createElement") || overlayJs.includes("jsx"),
      spritesPresent: sprites.every((sprite) => sprite.includes("<svg")),
      ok: overlayHtml.includes("inventory-react.js") && sprites.every((sprite) => sprite.includes("<svg")),
    },
  };

  const ok = Object.values(checks).every((check) => check.ok);
  return writeReport({ artifactDir, bundlePath, checks, ok, reportPath, steps });
}

async function writeReport({ artifactDir, bundlePath, checks, ok, reportPath, steps }) {
  await mkdir(artifactDir, { recursive: true });
  const report = {
    artifacts: {
      bundlePath,
      reportPath,
    },
    checks,
    code: ok ? "TN_V8_OVERLAY_WEBVIEW_OK" : "TN_V8_OVERLAY_WEBVIEW_FAILED",
    ok,
    steps,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyV8OverlayWebview();
  if (json) {
    process.stdout.write(`${JSON.stringify({ code: result.code, reportPath: result.artifacts.reportPath, status: result.ok ? "pass" : "fail" }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`V8 overlay webview verification passed. Report: ${result.artifacts.reportPath}\n`);
  } else {
    process.stderr.write(`V8 overlay webview verification failed. Report: ${result.artifacts.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
