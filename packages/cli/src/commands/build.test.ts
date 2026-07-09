import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildCommand } from "./build.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const structuredSourceStarterPath = resolve(repoRoot, "templates/structured-source-starter");

test("build should emit structured scripts diagnostic", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-build-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "threenative.config.json"),
      JSON.stringify({
        entry: "src/game.ts",
        outDir: "dist/game.bundle",
        schema: "threenative.project",
        version: "0.1.0",
      }),
    );
    await writeFile(
      join(root, "src/game.ts"),
      [
        "import { World, update } from '@threenative/sdk';",
        "export default new World().addSystem(update('badDom', {",
        "  run: () => document.querySelector('canvas')",
        "}));",
        "",
      ].join("\n"),
    );

    const result = await buildCommand(["--json"], root);
    const payload = JSON.parse(result.stdout) as { code: string; next: string; notice: string; severity: string; suggestion: string };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_SCRIPT_DOM_API_UNSUPPORTED");
    assert.equal(payload.next, "tn iterate --project . --json");
    assert.match(payload.notice, /Standalone build is subsumed/);
    assert.equal(payload.severity, "error");
    assert.match(payload.suggestion, /portable system context/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("build should emit structured portable script diagnostic", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-build-script-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "threenative.config.json"),
      JSON.stringify({
        entry: "src/game.ts",
        outDir: "dist/game.bundle",
        schema: "threenative.project",
        version: "0.1.0",
      }),
    );
    await writeFile(
      join(root, "src/game.ts"),
      [
        "import { World, update } from '@threenative/sdk';",
        "export default new World().addSystem(update('badProcess', {",
        "  run: () => process.cwd()",
        "}));",
        "",
      ].join("\n"),
    );

    const result = await buildCommand(["--json"], root);
    const payload = JSON.parse(result.stdout) as { code: string; next: string; notice: string; severity: string; suggestion: string };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_SCRIPT_NODE_API_UNSUPPORTED");
    assert.equal(payload.next, "tn iterate --project . --json");
    assert.match(payload.notice, /Standalone build is subsumed/);
    assert.equal(payload.severity, "error");
    assert.match(payload.suggestion, /filesystem/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("build should preserve emitted bundle schema fix", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-build-schema-fix-"));
  try {
    await cp(structuredSourceStarterPath, root, { recursive: true });
    await clearStarterSceneSystems(root);
    await writeFile(
      join(root, "src/scripts/schema-fix.ts"),
      [
        "export function badGameStateWrite(_ctx: any): void {",
        "}",
        "",
      ].join("\n"),
    );
    await writeFile(
      join(root, "content/systems/arena.systems.json"),
      `${JSON.stringify({
        schema: "threenative.systems",
        version: "0.1.0",
        id: "arena-systems",
        systems: [
          {
            id: "bad-game-state-write",
            schedule: "update",
            script: { module: "src/scripts/schema-fix.ts", export: "badGameStateWrite" },
            commands: [],
            queries: [],
            reads: ["Transform"],
            resourceReads: [],
            resourceWrites: [],
            services: [],
            writes: ["Transform", "GameState"],
          },
        ],
      }, null, 2)}\n`,
    );

    const result = await buildCommand(["--json"], root);
    const payload = JSON.parse(result.stdout) as { code: string; fix?: { instruction?: string; snippet?: string }; message: string; next: string; path: string };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_COMPILER_EMITTED_INVALID_BUNDLE");
    assert.equal(payload.next, "tn iterate --project . --json");
    assert.match(payload.message, /writes component 'GameState' without a schema/);
    assert.match(payload.path, /systems\.ir\.json/);
    assert.match(payload.fix?.instruction ?? "", /move it to resourceReads\/resourceWrites/);
    assert.match(payload.fix?.snippet ?? "", /"GameState"/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("build should not fail inferable resource writes during build", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-build-derived-resource-writes-"));
  try {
    await cp(structuredSourceStarterPath, root, { recursive: true });
    await clearStarterSceneSystems(root);
    await writeFile(
      join(root, "src/scripts/resource-write.ts"),
      `
export function writeGameState(ctx: any): void {
  ctx.resources.set("GameState", { status: "Ready" });
}
`,
    );
    await writeFile(
      join(root, "content/systems/arena.systems.json"),
      `${JSON.stringify({
        schema: "threenative.systems",
        version: "0.1.0",
        id: "arena-systems",
        systems: [
          {
            id: "derived-resource-write",
            schedule: "update",
            script: { module: "src/scripts/resource-write.ts", export: "writeGameState" },
            commands: [],
            queries: [],
            reads: ["Transform"],
            services: [],
            writes: ["Transform"],
          },
        ],
      }, null, 2)}\n`,
    );

    const result = await buildCommand(["--json"], root);
    const payload = JSON.parse(result.stdout) as { bundlePath: string; code: string };
    const systems = JSON.parse(await readFile(resolve(root, payload.bundlePath, "systems.ir.json"), "utf8")) as {
      systems: Array<{ name: string; resourceWrites?: string[] }>;
    };
    const system = systems.systems.find((item) => item.name === "derived-resource-write");

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_BUILD_OK");
    assert.deepEqual(system?.resourceWrites, ["GameState"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function clearStarterSceneSystems(root: string): Promise<void> {
  const scenePath = join(root, "content/scenes/arena.scene.json");
  const scene = JSON.parse(await readFile(scenePath, "utf8")) as { systems?: unknown[] };
  scene.systems = [];
  await writeFile(scenePath, `${JSON.stringify(scene, null, 2)}\n`);
}
