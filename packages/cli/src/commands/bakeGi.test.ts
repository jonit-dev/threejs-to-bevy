import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { bakeGiCommand } from "./bakeGi.js";

test("bake gi command writes deterministic durable probe content", async () => {
  const root = await mkdtemp(join(process.cwd(), "tmp-bake-gi-"));
  try {
    await mkdir(join(root, "content/environment"), { recursive: true });
    await writeFile(join(root, "content/environment/alcove.environment.json"), JSON.stringify({ id: "alcove" }));
    const buildCalls: string[] = [];
    const result = await bakeGiCommand(["gi", "--ray-count", "64", "--seed", "7", "--project", root, "--json"], root, {
      bake: async (_bundlePath, options) => ({
        hitCount: 12,
        probes: [{ id: "probe.center", source: { bakeVersion: 1, coefficients: Array(27).fill(0.1), format: "sh2", sceneContentHash: `sha256:${"a".repeat(64)}` } }],
        rayCount: options.rayCount ?? 0,
        sceneContentHash: `sha256:${"a".repeat(64)}`,
        seed: options.seed ?? 0,
        unsupportedMeshIds: [],
      }),
      build: async (projectPath) => {
        buildCalls.push(projectPath);
        return { bundlePath: join(root, "dist/game.bundle") };
      },
      generateTypes: async () => undefined,
    });
    const document = JSON.parse(await readFile(join(root, "content/lighting/alcove.probes.json"), "utf8"));
    assert.equal(result.exitCode, 0);
    assert.deepEqual(buildCalls, [root, root], "The second build must embed the newly written durable payload.");
    assert.equal(JSON.parse(result.stdout).bundlePath, join(root, "dist/game.bundle"));
    assert.deepEqual(document, {
      probes: [{ id: "probe.center", source: { bakeVersion: 1, coefficients: Array(27).fill(0.1), format: "sh2", sceneContentHash: `sha256:${"a".repeat(64)}` } }],
      sceneContentHash: `sha256:${"a".repeat(64)}`,
      sceneId: "alcove",
      schema: "threenative.baked-probes",
      version: "0.1.0",
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
