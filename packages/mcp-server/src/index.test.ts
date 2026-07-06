import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { type AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AUTHORING_OPERATION_NAMES } from "@threenative/authoring";
import { dispatch } from "@threenative/cli";

import { AUTHORING_MCP_TOOLS, callAuthoringMcpTool, type IAuthoringMcpResult } from "./index.js";

interface IJsonPayload {
  code: string;
  diagnostics?: Array<{ code: string; fix?: { docs?: string; instruction: string; snippet?: string }; path?: string; suggestion?: string }>;
  filesWritten?: string[];
  imported?: Array<{ artifact: string; file: string; kind: string }>;
  ok?: boolean;
  scene?: {
    entities: string[];
    id: string;
  };
  skipped?: Array<{ artifact: string; reason: string }>;
}

test("mcp wrapper exposes the authoring tool registry", () => {
  assert.deepEqual(
    AUTHORING_MCP_TOOLS.map((tool) => tool.name),
    [
      "scene.inspect",
      "scene.validate",
      ...AUTHORING_OPERATION_NAMES,
      "bundle.import",
      "project.build",
      "project.screenshot",
      "project.verify",
    ],
  );
});

test("should expose registry-backed tool names", () => {
  const mcpOperationNames = AUTHORING_MCP_TOOLS.map((tool) => tool.name).filter((name) =>
    AUTHORING_OPERATION_NAMES.includes(name as (typeof AUTHORING_OPERATION_NAMES)[number]),
  );

  assert.deepEqual(mcpOperationNames, AUTHORING_OPERATION_NAMES);
});

test("mcp wrapper delegates inspect and validate to CLI JSON output", async () => {
  const root = await createMcpSceneProject();

  try {
    const inspect = await callMcp(root, "scene.inspect", { sceneId: "scene.arena" });
    const validate = await callMcp(root, "scene.validate", { sceneId: "scene.arena" });
    const cliValidate = await dispatch(["scene", "validate", "scene.arena", "--project", root, "--json"]);

    assert.equal(inspect.isError, false);
    assert.equal(inspect.cli.argv[0], "scene");
    assert.equal(inspect.cli.argv.includes("--json"), true);
    assert.equal((inspect.content as IJsonPayload).code, "TN_SCENE_OK");
    assert.deepEqual((inspect.content as IJsonPayload).scene?.entities, ["chase-camera", "player-kart"]);

    assert.equal(validate.isError, false);
    assert.deepEqual(validate.content, JSON.parse(cliValidate.stdout));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("mcp wrapper preserves CLI diagnostics and suggestions", async () => {
  const root = await createMcpSceneProject({ invalidTarget: true });

  try {
    const mcp = await callMcp(root, "scene.validate", { sceneId: "scene.arena" });
    const cli = await dispatch(["scene", "validate", "scene.arena", "--project", root, "--json"]);

    assert.equal(mcp.isError, true);
    assert.deepEqual(mcp.content, JSON.parse(cli.stdout));
    assert.equal((mcp.content as IJsonPayload).diagnostics?.[0]?.code, "TN_AUTHORING_REF_MISSING");
    assert.equal((mcp.content as IJsonPayload).diagnostics?.[0]?.suggestion, "Did you mean 'player-kart'?");
    assert.deepEqual((mcp.content as IJsonPayload).diagnostics?.[0]?.fix, (JSON.parse(cli.stdout) as IJsonPayload).diagnostics?.[0]?.fix);
    assert.equal((mcp.content as IJsonPayload).diagnostics?.[0]?.fix?.instruction.includes("Create the referenced durable declaration"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("mcp wrapper runs scene mutations through CLI and returns changed files", async () => {
  const root = await createMcpSceneProject({ minimal: true });

  try {
    const add = await callMcp(root, "scene.add_entity", { entityId: "rival-kart", prefabId: "kart", sceneId: "scene.arena" });
    const transform = await callMcp(root, "scene.set_transform", {
      entityId: "rival-kart",
      sceneId: "scene.arena",
      transform: { position: [1, 2, 3], rotation: [0, 0, 0], scale: [1, 1, 1] },
    });
    const camera = await callMcp(root, "scene.set_camera", { cameraId: "chase-camera", mode: "third-person-follow", sceneId: "scene.arena", targetId: "player-kart" });
    const script = await callMcp(root, "scene.attach_script", { exportName: "raceController", modulePath: "src/scripts/race.ts", sceneId: "scene.arena", systemId: "race-controller" });
    const binding = await callMcp(root, "scene.bind_ui", { resourcePath: "hud.score.value", sceneId: "scene.arena", uiNodeId: "score-label" });
    const validate = await callMcp(root, "scene.validate", { sceneId: "scene.arena" });

    assert.equal(add.isError, false);
    assert.equal(transform.isError, false);
    assert.equal(camera.isError, false);
    assert.equal(script.isError, false);
    assert.equal(binding.isError, false);
    assert.equal(validate.isError, false);
    assert.deepEqual((binding.content as IJsonPayload).filesWritten, ["content/scenes/arena.scene.json"]);
    assert.equal((validate.content as IJsonPayload).code, "TN_SCENE_OK");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui layout MCP matches CLI operation result and source output", async () => {
  const mcpRoot = await createMcpUiProject();
  const cliRoot = await createMcpUiProject();

  try {
    const mcp = await callMcp(mcpRoot, "ui.set_layout", { layout: { align: "center", justify: "center", top: 60, width: 320 }, nodeId: "countdown", uiDocId: "hud" });
    const cli = await dispatch(["ui", "set-layout", "hud", "countdown", "--justify", "center", "--align", "center", "--top", "60", "--width", "320", "--project", cliRoot, "--json"]);

    assert.equal(mcp.isError, false);
    assert.equal(mcp.cli.argv[0], "ui");
    assert.equal(mcp.cli.argv.includes("--json"), true);
    assert.deepEqual(stripProjectPath(mcp.content), stripProjectPath(JSON.parse(cli.stdout)));

    const mcpDoc = JSON.parse(await readFile(join(mcpRoot, "content", "ui", "hud.ui.json"), "utf8")) as { nodes: Array<{ id: string; layout?: Record<string, unknown> }> };
    const cliDoc = JSON.parse(await readFile(join(cliRoot, "content", "ui", "hud.ui.json"), "utf8")) as { nodes: Array<{ id: string; layout?: Record<string, unknown> }> };
    assert.deepEqual(mcpDoc, cliDoc);
    assert.deepEqual(mcpDoc.nodes.find((node) => node.id === "countdown")?.layout, { align: "center", justify: "center", top: 60, width: 320 });
  } finally {
    await rm(mcpRoot, { force: true, recursive: true });
    await rm(cliRoot, { force: true, recursive: true });
  }
});

test("ui bind MCP matches CLI operation result", async () => {
  const mcpRoot = await createMcpUiProject();
  const cliRoot = await createMcpUiProject();

  try {
    const mcp = await callMcp(mcpRoot, "ui.bind", { nodeId: "countdown", resourcePath: "race.countdown.value", uiDocId: "hud" });
    const cli = await dispatch(["ui", "bind", "hud", "countdown", "--resource", "race.countdown.value", "--project", cliRoot, "--json"]);

    assert.equal(mcp.isError, false);
    assert.deepEqual(stripProjectPath(mcp.content), stripProjectPath(JSON.parse(cli.stdout)));
    assert.deepEqual((mcp.content as IJsonPayload).filesWritten, ["content/ui/hud.ui.json"]);
  } finally {
    await rm(mcpRoot, { force: true, recursive: true });
    await rm(cliRoot, { force: true, recursive: true });
  }
});

test("bundle import MCP wraps same authoring core behavior and keeps generated scripts non-source", async () => {
  const mcpRoot = await createMcpBundleImportProject();
  const cliRoot = await createMcpBundleImportProject();

  try {
    const mcp = await callMcp(mcpRoot, "bundle.import", { bundleDir: "dist/game.bundle" });
    const cli = await dispatch(["bundle", "import", "dist/game.bundle", "--project", cliRoot, "--mode", "source", "--json"]);

    assert.equal(mcp.isError, false);
    assert.deepEqual(stripImportPaths(mcp.content), stripImportPaths(JSON.parse(cli.stdout)));
    assert.deepEqual((mcp.content as IJsonPayload).filesWritten, ["content/scenes/imported.scene.json", "content/ui/imported.ui.json"]);
    assert.equal((mcp.content as IJsonPayload).skipped?.some((item) => item.artifact === "scripts.bundle.js" && item.reason === "unrecoverable"), true);
    assert.equal((mcp.content as IJsonPayload).diagnostics?.some((diagnostic) => diagnostic.code === "TN_AUTHORING_IMPORT_UNRECOVERABLE_SCRIPT_BODY"), true);
    await assert.rejects(readFile(join(mcpRoot, "content", "scripts.bundle.js"), "utf8"));
    await assert.rejects(readFile(join(mcpRoot, "src", "scripts.bundle.js"), "utf8"));
  } finally {
    await rm(mcpRoot, { force: true, recursive: true });
    await rm(cliRoot, { force: true, recursive: true });
  }
});

test("material and system MCP tools delegate to CLI JSON operation groups", async () => {
  const root = await createMcpSourceGroupProject();

  try {
    const material = await callMcp(root, "material.set", { color: "#ffcc00", materialId: "kart", roughness: 0.35 });
    const system = await callMcp(root, "system.attach_script", { exportName: "raceController", modulePath: "src/scripts/race.ts", systemId: "race" });

    assert.equal(material.isError, false);
    assert.equal(system.isError, false);
    assert.deepEqual((material.content as IJsonPayload).filesWritten, ["content/materials/kart.materials.json"]);
    assert.deepEqual((system.content as IJsonPayload).filesWritten, ["content/systems/race.systems.json"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("mcp wrapper blocks project roots outside the allowlist", async () => {
  const root = await createMcpSceneProject();
  const allowed = await mkdtemp(join(tmpdir(), "tn-mcp-allowed-"));

  try {
    const result = await callAuthoringMcpTool({ arguments: { sceneId: "scene.arena" }, name: "scene.inspect" }, { allowedProjectRoots: [allowed], projectRoot: root });

    assert.equal(result.isError, true);
    assert.equal((result.content as IJsonPayload).code, "TN_MCP_PROJECT_ROOT_REJECTED");
    assert.deepEqual(result.cli.argv, []);
  } finally {
    await rm(root, { force: true, recursive: true });
    await rm(allowed, { force: true, recursive: true });
  }
});

test("mcp wrapper blocks paths outside source authoring space", async () => {
  const root = await createMcpSceneProject();

  try {
    const traversal = await callMcp(root, "scene.attach_script", { exportName: "raceController", modulePath: "../race.ts", sceneId: "scene.arena", systemId: "race-controller" });
    const generated = await callMcp(root, "scene.attach_script", { exportName: "raceController", modulePath: "dist/game.bundle/world.ir.json", sceneId: "scene.arena", systemId: "race-controller" });
    const bundleTraversal = await callMcp(root, "bundle.import", { bundleDir: "../game.bundle" });

    assert.equal(traversal.isError, true);
    assert.equal((traversal.content as IJsonPayload).code, "TN_MCP_PATH_REJECTED");
    assert.equal(generated.isError, true);
    assert.equal((generated.content as IJsonPayload).code, "TN_MCP_GENERATED_SOURCE_REJECTED");
    assert.equal(bundleTraversal.isError, true);
    assert.equal((bundleTraversal.content as IJsonPayload).code, "TN_MCP_PATH_REJECTED");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("mcp wrapper does not persist invalid mutation results", async () => {
  const root = await createMcpSceneProject();

  try {
    const scenePath = join(root, "content", "scenes", "arena.scene.json");
    const before = await readFile(scenePath, "utf8");
    const result = await callMcp(root, "scene.set_camera", { cameraId: "chase-camera", mode: "third-person-follow", sceneId: "scene.arena", targetId: "missing-kart" });
    const after = await readFile(scenePath, "utf8");

    assert.equal(result.isError, true);
    assert.equal((result.content as IJsonPayload).diagnostics?.[0]?.code, "TN_AUTHORING_REF_MISSING");
    assert.equal(after, before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("mcp smoke performs inspect mutate validate build and verify", async () => {
  const root = await createMcpSceneProject({ minimal: true });
  const preview = await startReadyCanvasServer();

  try {
    const inspect = await callMcp(root, "scene.inspect", { sceneId: "scene.arena" });
    const mutate = await callMcp(root, "scene.add_entity", { entityId: "smoke-kart", prefabId: "kart", sceneId: "scene.arena" });
    const transform = await callMcp(root, "scene.set_transform", { entityId: "smoke-kart", sceneId: "scene.arena", transform: { position: [2, 0, 0] } });
    const validate = await callMcp(root, "scene.validate", { sceneId: "scene.arena" });
    const build = await callMcp(root, "project.build", {});
    const verify = await callMcp(root, "project.verify", { frames: 1, url: preview.url });

    assert.equal(inspect.isError, false);
    assert.equal(mutate.isError, false);
    assert.equal(transform.isError, false);
    assert.equal(validate.isError, false);
    assert.equal(build.isError, false);
    assert.equal(verify.isError, false);
    assert.equal((build.content as IJsonPayload).code, "TN_BUILD_OK");
    assert.equal((verify.content as IJsonPayload).code, "TN_VERIFY_OK");
  } finally {
    await preview.close();
    await rm(root, { force: true, recursive: true });
  }
});

async function callMcp(root: string, name: Parameters<typeof callAuthoringMcpTool>[0]["name"], args: Record<string, unknown>): Promise<IAuthoringMcpResult> {
  return callAuthoringMcpTool({ arguments: args, name }, { allowedProjectRoots: [root], projectRoot: root });
}

async function createMcpSceneProject(options: { invalidTarget?: boolean; minimal?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-mcp-scene-"));
  await mkdir(join(root, "content", "scenes"), { recursive: true });
  await mkdir(join(root, "src", "scripts"), { recursive: true });
  await writeFile(join(root, "src", "scripts", "race.ts"), "export function raceController() {}\n");
  await writeFile(
    join(root, "threenative.config.json"),
    `${JSON.stringify(
      {
        entry: "src/game.ts",
        outDir: "dist/game.bundle",
        schema: "threenative.project",
        version: "0.1.0",
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(root, "src", "game.ts"), 'import { Scene } from "@threenative/sdk";\nexport default new Scene({ id: "scene.arena" });\n');
  await writeFile(
    join(root, "content", "scenes", "arena.scene.json"),
    `${JSON.stringify(
      {
        schema: "threenative.scene",
        version: "0.1.0",
        id: "scene.arena",
        prefabs: [{ id: "kart" }],
        resources: [{ id: "hud.score" }],
        entities: [
          {
            id: "player-kart",
            prefab: "kart",
            transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          },
          {
            components: { camera: { mode: "third-person-follow", target: options.invalidTarget === true ? "player-kartt" : "player-kart" } },
            id: "chase-camera",
          },
        ],
        systems: [{ id: "race-controller", script: { export: "raceController", module: "src/scripts/race.ts" } }],
        ui: {
          nodes: [{ id: "score-label" }],
          ...(options.minimal === true ? {} : { bindings: [{ node: "score-label", resource: "hud.score.value" }] }),
        },
      },
      null,
      2,
    )}\n`,
  );
  return root;
}

async function createMcpUiProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-mcp-ui-"));
  await mkdir(join(root, "content", "ui"), { recursive: true });
  await writeFile(
    join(root, "content", "ui", "hud.ui.json"),
    `${JSON.stringify(
      {
        schema: "threenative.ui",
        version: "0.1.0",
        id: "hud",
        nodes: [{ id: "countdown", text: "3", type: "text" }],
        bindings: [],
      },
      null,
      2,
    )}\n`,
  );
  return root;
}

async function createMcpBundleImportProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-mcp-import-"));
  await mkdir(join(root, "dist", "game.bundle"), { recursive: true });
  await writeFile(
    join(root, "dist", "game.bundle", "world.ir.json"),
    `${JSON.stringify(
      {
        entities: [{ id: "player", transform: { position: [0, 0, 0] } }],
        resources: { "race.score": { value: 0 } },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(root, "dist", "game.bundle", "ui.ir.json"),
    `${JSON.stringify(
      {
        root: { children: [{ id: "ui.score", kind: "text", text: "000" }], id: "ui.hud" },
        schema: "threenative.ui",
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(root, "dist", "game.bundle", "scripts.bundle.js"), "export function generated() {}\n");
  return root;
}

async function createMcpSourceGroupProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-mcp-source-groups-"));
  await mkdir(join(root, "content", "materials"), { recursive: true });
  await mkdir(join(root, "content", "systems"), { recursive: true });
  await mkdir(join(root, "src", "scripts"), { recursive: true });
  await writeFile(join(root, "src", "scripts", "race.ts"), "export function raceController() {}\n");
  await writeFile(
    join(root, "content", "materials", "kart.materials.json"),
    `${JSON.stringify({ schema: "threenative.materials", version: "0.1.0", id: "kart", materials: [{ id: "kart" }] }, null, 2)}\n`,
  );
  await writeFile(
    join(root, "content", "systems", "race.systems.json"),
    `${JSON.stringify({ schema: "threenative.systems", version: "0.1.0", id: "race", systems: [{ id: "race", schedule: "update" }] }, null, 2)}\n`,
  );
  return root;
}

function stripProjectPath(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }
  const { projectPath: _projectPath, ...rest } = value as Record<string, unknown>;
  return rest;
}

function stripImportPaths(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }
  const { bundleDir: _bundleDir, projectPath: _projectPath, ...rest } = value as Record<string, unknown>;
  return rest;
}

async function startReadyCanvasServer(): Promise<{ close: () => Promise<void>; url: string }> {
  const html = `<!doctype html>
<html>
  <body style="margin:0">
    <canvas id="c" width="1280" height="720" style="width:1280px;height:720px"></canvas>
    <script>
      const ctx = document.getElementById("c").getContext("2d");
      ctx.fillStyle = "#111111";
      ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = "#ff3333";
      ctx.fillRect(140, 120, 520, 360);
      globalThis.__THREENATIVE_READY__ = true;
    </script>
  </body>
</html>`;
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(html);
  });
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolvePromise());
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.notEqual(address, null);
  const listenAddress = address as AddressInfo;
  return {
    close: () => closeServer(server),
    url: `http://127.0.0.1:${listenAddress.port}`,
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolvePromise();
    });
  });
}
