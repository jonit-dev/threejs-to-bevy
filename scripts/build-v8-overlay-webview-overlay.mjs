import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";

import { runCommand } from "./verify-conformance.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function buildV8OverlayWebviewOverlay(root = repoRoot, run = runCommand) {
  const result = await run({
    args: ["exec", "vite", "build", "--config", resolve(root, "examples/v8-overlay-webview/overlay/react/vite.config.mjs")],
    command: "pnpm",
    cwd: root,
    name: "build v8 overlay React app",
    timeoutMs: 120000,
  });
  if (result.exitCode === 0) {
    await normalizeOverlayHtml(resolve(root, "examples/v8-overlay-webview/overlay/dist/index.html"));
  }
  return result;
}

async function normalizeOverlayHtml(path) {
  const html = await readFile(path, "utf8");
  await writeFile(path, html.replaceAll(" crossorigin", ""), "utf8");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await buildV8OverlayWebviewOverlay();
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
