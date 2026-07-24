import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PNG } from "pngjs";

import type { ICommandResult } from "../diagnostics.js";
import { parityVisualCommand } from "./parityVisual.js";

test("visual parity captures at reference dimensions and appends numeric history", async () => {
  const root = await createProject();
  const screenshotCalls: string[][] = [];
  const result = await parityVisualCommand(
    ["visual", "--project", ".", "--url", "http://127.0.0.1:5173", "--reference", "reference.png", "--json"],
    root,
    {
      compareRunner: async () => jsonResult({
        averageBrightnessDelta: 0.1,
        averageColorDelta: { blue: 0.3, green: 0.2, red: 0.1 },
        changedPixelRatio: 0.9,
      }),
      fetcher: async () => devStateResponse(root),
      screenshotRunner: async (argv: readonly string[]) => {
        screenshotCalls.push([...argv]);
        return jsonResult({ code: "TN_SCREENSHOT_OK" });
      },
    },
  );
  const payload = JSON.parse(result.stdout) as { code: string; similarity: number };
  const history = JSON.parse(await readFile(join(root, "artifacts/visual-parity/history.json"), "utf8")) as Array<{ similarity: number; screenshotPath: string; timestamp: string }>;

  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_PARITY_VISUAL_OK");
  assert.equal(payload.similarity, 0.8);
  assert.equal(screenshotCalls[0]?.includes("2x3"), true);
  assert.deepEqual(history, [{
    screenshotPath: "artifacts/visual-parity/current.png",
    similarity: 0.8,
    timestamp: history[0]?.timestamp,
  }]);
});

test("visual parity refuses a preview serving a different bundle hash", async () => {
  const root = await createProject();
  let captured = false;
  const result = await parityVisualCommand(
    ["visual", "--project", ".", "--url", "http://127.0.0.1:5173", "--reference", "reference.png", "--json"],
    root,
    {
      fetcher: async () => new Response(JSON.stringify({ bundleHash: "stale", executedRuntimeBuildHash: "runtime", runtimeBuildHash: "runtime" })),
      screenshotRunner: async () => {
        captured = true;
        return jsonResult({});
      },
    },
  );
  const payload = JSON.parse(result.stdout) as { code: string };

  assert.equal(result.exitCode, 1);
  assert.equal(payload.code, "TN_PARITY_VISUAL_PREVIEW_STALE");
  assert.equal(captured, false);
});

test("visual parity refuses a preview that has not executed the current runtime build", async () => {
  const root = await createProject();
  let captured = false;
  const result = await parityVisualCommand(
    ["visual", "--project", ".", "--url", "http://127.0.0.1:5173", "--reference", "reference.png", "--json"],
    root,
    {
      fetcher: async () => {
        const response = await devStateResponse(root);
        const state = await response.json() as Record<string, unknown>;
        return new Response(JSON.stringify({ ...state, executedRuntimeBuildHash: "old-runtime", runtimeBuildHash: "new-runtime" }));
      },
      screenshotRunner: async () => {
        captured = true;
        return jsonResult({});
      },
    },
  );
  const payload = JSON.parse(result.stdout) as { code: string };

  assert.equal(result.exitCode, 1);
  assert.equal(payload.code, "TN_PARITY_VISUAL_RUNTIME_STALE");
  assert.equal(captured, false);
});

test("visual parity refuses source newer than the bundle manifest", async () => {
  const root = await createProject();
  const future = new Date(Date.now() + 60_000);
  await utimes(join(root, "content/scene.json"), future, future);
  const result = await parityVisualCommand(
    ["visual", "--project", ".", "--url", "http://127.0.0.1:5173", "--reference", "reference.png", "--json"],
    root,
    { fetcher: async () => devStateResponse(root) },
  );
  const payload = JSON.parse(result.stdout) as { code: string; path?: string };

  assert.equal(result.exitCode, 1);
  assert.equal(payload.code, "TN_PARITY_VISUAL_SOURCE_STALE");
  assert.equal(payload.path, "content/scene.json");
});

async function createProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-parity-visual-"));
  await mkdir(join(root, "content"), { recursive: true });
  await mkdir(join(root, "dist/game.bundle"), { recursive: true });
  await writeFile(join(root, "content/scene.json"), "{}\n");
  await writeFile(join(root, "threenative.config.json"), `${JSON.stringify({
    entry: "content/scene.json",
    outDir: "dist/game.bundle",
    schema: "threenative.project",
    version: "0.1.0",
  })}\n`);
  await writeFile(join(root, "dist/game.bundle/manifest.json"), "{}\n");
  const png = new PNG({ height: 3, width: 2 });
  await writeFile(join(root, "reference.png"), PNG.sync.write(png));
  return root;
}

async function devStateResponse(root: string): Promise<Response> {
  const manifest = await readFile(join(root, "dist/game.bundle/manifest.json"));
  return new Response(JSON.stringify({
    bundleHash: createHash("sha256").update(manifest).digest("hex"),
    executedRuntimeBuildHash: "runtime-build",
    runtimeBuildHash: "runtime-build",
    sourceBuildStatus: "current",
  }));
}

function jsonResult(payload: Record<string, unknown>): ICommandResult {
  return { exitCode: 0, stdout: `${JSON.stringify(payload)}\n` };
}
