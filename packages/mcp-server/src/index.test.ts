import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { type AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { dispatch } from "@threenative/cli";

import { AUTHORING_MCP_TOOLS, callAuthoringMcpTool, type IAuthoringMcpResult } from "./index.js";

interface IJsonPayload {
  code: string;
  diagnostics?: Array<{ code: string; path?: string; suggestion?: string }>;
  filesWritten?: string[];
  ok?: boolean;
  scene?: {
    entities: string[];
    id: string;
  };
}

test("mcp wrapper exposes the authoring tool registry", () => {
  assert.deepEqual(
    AUTHORING_MCP_TOOLS.map((tool) => tool.name),
    [
      "scene.inspect",
      "scene.validate",
      "scene.add_entity",
      "scene.set_transform",
      "scene.set_camera",
      "scene.attach_script",
      "scene.bind_ui",
      "project.build",
      "project.screenshot",
      "project.verify",
    ],
  );
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

    assert.equal(traversal.isError, true);
    assert.equal((traversal.content as IJsonPayload).code, "TN_MCP_PATH_REJECTED");
    assert.equal(generated.isError, true);
    assert.equal((generated.content as IJsonPayload).code, "TN_MCP_GENERATED_SOURCE_REJECTED");
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
