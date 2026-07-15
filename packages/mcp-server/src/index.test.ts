import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { type AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { AUTHORING_BATCH_SCHEMA, AUTHORING_BATCH_VERSION, AUTHORING_OPERATION_NAMES } from "@threenative/authoring";
import { assetCommand, assetCreationStrategy, blenderMcpOutcomeCoverage, CLI_COMMAND_REGISTRY, dispatch, type IAssetCommandOptions } from "@threenative/cli";

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
  const exposed = AUTHORING_MCP_TOOLS.map((tool) => tool.name);
  const commandOwned = Object.values(CLI_COMMAND_REGISTRY).flatMap((command) => command.adapters?.mcp === undefined ? [] : (Array.isArray(command.adapters.mcp) ? command.adapters.mcp : [command.adapters.mcp]).map((adapter) => adapter.name));
  assert.ok(commandOwned.every((name) => exposed.includes(name)));
  assert.ok(AUTHORING_OPERATION_NAMES.every((name) => exposed.includes(name)));
  assert.equal(new Set(exposed).size, exposed.length);
  assert.ok(["scene.inspect", "scene.validate", "bundle.import", "project.build", "project.screenshot", "project.verify"].every((name) => exposed.includes(name as typeof exposed[number])));
});

test("Hyper3D MCP lifecycle derives argv and rejects missing paid-provider acknowledgements before execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-mcp-hyper3d-"));
  const calls: string[][] = [];
  const execute = async (argv: readonly string[]) => { calls.push([...argv]); return { exitCode: 0, stdout: '{"code":"TN_MODEL_PROVIDER_OK"}\n' }; };
  try {
    const rejected = await callAuthoringMcpTool({ arguments: { acceptCost: false, acceptProviderTerms: true, confirmInputRights: true, jobId: "crate-job", prompt: "beveled crate" }, name: "asset.hyper3d_generate" }, { allowedProjectRoots: [root], execute, projectRoot: root });
    assert.equal(rejected.isError, true);
    assert.equal(calls.length, 0);

    await callAuthoringMcpTool({ arguments: { acceptCost: true, acceptProviderTerms: true, bbox: "1,2,3", confirmInputRights: true, jobId: "crate-job", prompt: "beveled crate" }, name: "asset.hyper3d_generate" }, { allowedProjectRoots: [root], execute, projectRoot: root });
    await callAuthoringMcpTool({ arguments: { jobId: "crate-job" }, name: "asset.hyper3d_poll" }, { allowedProjectRoots: [root], execute, projectRoot: root });
    await callAuthoringMcpTool({ arguments: { assetId: "crate", jobId: "crate-job", targetSize: 1 }, name: "asset.hyper3d_import" }, { allowedProjectRoots: [root], execute, projectRoot: root });
    await callAuthoringMcpTool({ arguments: {}, name: "asset.hunyuan_status" }, { allowedProjectRoots: [root], execute, projectRoot: root });
    assert.deepEqual(calls[0], ["asset", "model-provider", "generate", "hyper3d", "--id", "crate-job", "--prompt", "beveled crate", "--bbox", "1,2,3", "--accept-cost", "--accept-provider-terms", "--confirm-input-rights", "--project", root, "--json"]);
    assert.deepEqual(calls[1], ["asset", "model-provider", "poll", "hyper3d", "crate-job", "--project", root, "--json"]);
    assert.deepEqual(calls[2], ["asset", "model-provider", "import", "hyper3d", "crate-job", "--id", "crate", "--target-size", "1", "--project", root, "--json"]);
    assert.deepEqual(calls[3], ["asset", "model-provider", "status", "hunyuan", "--json"]);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("provider MCP schemas reject remote generated mistyped and out-of-budget arguments before execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-mcp-provider-schema-")); let calls = 0;
  const execute = async () => { calls += 1; return { exitCode: 0, stdout: "{}\n" }; };
  try {
    const base = { acceptCost: true, acceptProviderTerms: true, confirmInputRights: true, jobId: "image-job" };
    const invalidImages: unknown[] = ["https://example.com/ref.png", "dist/ref.png", 123];
    for (const image of invalidImages) {
      const result = await callAuthoringMcpTool({ arguments: { ...base, image }, name: "asset.hyper3d_generate" }, { allowedProjectRoots: [root], execute, projectRoot: root });
      assert.equal(result.isError, true);
    }
    const invalidType = await callAuthoringMcpTool({ arguments: { limit: 3, query: "brick", type: "invalid" }, name: "asset.polyhaven_search" }, { allowedProjectRoots: [root], execute, projectRoot: root });
    const invalidLimit = await callAuthoringMcpTool({ arguments: { limit: 999, query: "chair" }, name: "asset.sketchfab_search" }, { allowedProjectRoots: [root], execute, projectRoot: root });
    const invalidScale = await callAuthoringMcpTool({ arguments: { acceptedLicense: "cc-by", assetId: "chair", modelUid: "0123456789abcdef0123456789abcdef", targetSize: -1 }, name: "asset.sketchfab_import" }, { allowedProjectRoots: [root], execute, projectRoot: root });
    assert.equal(invalidType.isError, true); assert.equal(invalidLimit.isError, true); assert.equal(invalidScale.isError, true);
    assert.equal(calls, 0);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("provider status categories and creation strategy derive bounded CLI argv", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-mcp-provider-registry-")); const calls: string[][] = [];
  const execute = async (argv: readonly string[]) => { calls.push([...argv]); return { exitCode: 0, stdout: '{"code":"TN_PROVIDER_OK"}\n' }; };
  try {
    await callAuthoringMcpTool({ arguments: { live: false }, name: "asset.polyhaven_status" }, { allowedProjectRoots: [root], execute, projectRoot: root });
    await callAuthoringMcpTool({ arguments: { limit: 4, live: true, type: "textures" }, name: "asset.polyhaven_categories" }, { allowedProjectRoots: [root], execute, projectRoot: root });
    await callAuthoringMcpTool({ arguments: { live: false }, name: "asset.sketchfab_status" }, { allowedProjectRoots: [root], execute, projectRoot: root });
    await callAuthoringMcpTool({ arguments: {}, name: "asset.creation_strategy" }, { allowedProjectRoots: [root], execute, projectRoot: root });
    assert.deepEqual(calls, [
      ["asset", "provider", "status", "poly-haven", "--json"],
      ["asset", "provider", "categories", "poly-haven", "--type", "textures", "--limit", "4", "--live", "--json"],
      ["asset", "provider", "status", "sketchfab", "--json"],
      ["asset", "strategy", "--json"],
    ]);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("should prove nineteen of twenty-two upstream outcome rows and safe deferrals", () => {
  assert.equal(blenderMcpOutcomeCoverage.length, 22);
  assert.deepEqual(blenderMcpOutcomeCoverage.map((row) => row.id), Array.from({ length: 22 }, (_, index) => index + 1));
  assert.equal(blenderMcpOutcomeCoverage.filter((row) => row.disposition !== "deferred").length, 19);
  assert.equal(blenderMcpOutcomeCoverage[3]?.disposition, "safe-replacement");
  assert.deepEqual(blenderMcpOutcomeCoverage.slice(19).map((row) => row.disposition), ["deferred", "deferred", "deferred"]);
  assert.ok(blenderMcpOutcomeCoverage.every((row) => row.evidence !== ""));
  const tools = new Set(AUTHORING_MCP_TOOLS.map((tool) => tool.name));
  assert.ok(blenderMcpOutcomeCoverage.slice(0, 19).every((row) => row.mcpTool !== undefined && tools.has(row.mcpTool as typeof AUTHORING_MCP_TOOLS[number]["name"])));
  assert.ok(blenderMcpOutcomeCoverage.slice(0, 19).every((row) => [row.coreEvidence, row.cliEvidence, row.mcpEvidence].every((path) => typeof path === "string" && existsSync(resolve(process.cwd(), "../..", path)))));
});

test("asset inspect and model-test MCP adapters resolve project paths and return proof image content", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-mcp-model-proof-")); const calls: string[][] = [];
  try {
    await mkdir(join(root, "assets"), { recursive: true }); await writeFile(join(root, "assets/prop.glb"), "fixture");
    const pngPath = join(root, "artifacts/mcp-model-test/artifacts/model-test.png"); await mkdir(resolve(pngPath, ".."), { recursive: true }); await writeFile(pngPath, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const execute = async (argv: readonly string[]) => { calls.push([...argv]); return argv[0] === "asset" ? { exitCode: 0, stdout: '{"code":"TN_ASSET_INSPECT_OK"}\n' } : { exitCode: 0, stdout: `${JSON.stringify({ code: "TN_MODEL_TEST_OK", screenshot: { outPath: pngPath } })}\n` }; };
    await callAuthoringMcpTool({ arguments: { assetPath: "assets/prop.glb" }, name: "asset.inspect" }, { allowedProjectRoots: [root], execute, projectRoot: root });
    const proof = await callAuthoringMcpTool({ arguments: { angle: 45, assetPath: "assets/prop.glb" }, name: "asset.model_test" }, { allowedProjectRoots: [root], execute, projectRoot: root });
    assert.deepEqual(calls[0], ["asset", "inspect", join(root, "assets/prop.glb"), "--json"]);
    assert.deepEqual(calls[1], ["model-test", join(root, "assets/prop.glb"), "--angle", "45", "--screenshot", "--out", join(root, "artifacts/mcp-model-test"), "--json"]);
    assert.equal((proof.content as Array<{ type: string }>)[0]?.type, "image");
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("asset model-test rejects output-directory and returned-image symlink escapes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-mcp-model-symlink-")); const outside = await mkdtemp(join(tmpdir(), "tn-mcp-model-outside-")); let calls = 0;
  try {
    await mkdir(join(root, "assets"), { recursive: true }); await writeFile(join(root, "assets/prop.glb"), "fixture");
    await symlink(outside, join(root, "artifacts"), "dir");
    const rejectedOutput = await callAuthoringMcpTool({ arguments: { assetPath: "assets/prop.glb" }, name: "asset.model_test" }, { allowedProjectRoots: [root], execute: async () => { calls += 1; return { exitCode: 0, stdout: "{}\n" }; }, projectRoot: root });
    assert.equal(rejectedOutput.isError, true); assert.equal(calls, 0);
    await rm(join(root, "artifacts")); const localOutput = join(root, "artifacts/mcp-model-test"); await mkdir(localOutput, { recursive: true });
    const outsidePng = join(outside, "secret.png"); await writeFile(outsidePng, Buffer.from("outside-secret-not-a-png")); const linked = join(localOutput, "model-test.png"); await symlink(outsidePng, linked);
    await assert.rejects(callAuthoringMcpTool({ arguments: { assetPath: "assets/prop.glb" }, name: "asset.model_test" }, { allowedProjectRoots: [root], execute: async () => ({ exitCode: 0, stdout: `${JSON.stringify({ screenshot: { outPath: linked } })}\n` }), projectRoot: root }), /PATH_REJECTED/);
  } finally { await rm(root, { force: true, recursive: true }); await rm(outside, { force: true, recursive: true }); }
});

test("Hunyuan MCP status returns the real fail-closed CLI result", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-mcp-hunyuan-real-"));
  try {
    const result = await callAuthoringMcpTool({ arguments: {}, name: "asset.hunyuan_status" }, { allowedProjectRoots: [root], execute: async (argv) => assetCommand(argv.slice(1)), projectRoot: root });
    assert.equal((result.content as { code: string }).code, "TN_MODEL_PROVIDER_UNSUPPORTED");
    assert.equal((result.content as { state: string }).state, "unsupported");
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("should expose descriptor-owned creation strategy with reuse before paid or procedural generation", async () => {
  const result = await assetCommand(["strategy", "--json"]); const payload = JSON.parse(result.stdout) as { guidance: string[] };
  const guidance = payload.guidance.join(" ").toLowerCase();
  assert.deepEqual(payload.guidance, assetCreationStrategy);
  assert.ok(guidance.indexOf("catalog") < guidance.indexOf("paid model-provider"));
  assert.ok(guidance.indexOf("reuse") < guidance.indexOf("paid model-provider"));
  assert.ok(guidance.indexOf("paid model-provider") < guidance.indexOf("blender recipe"));
  assert.doesNotMatch(guidance, /python|execute[_ ]blender[_ ]code|socket/iu);
});

test("asset.generate_blender MCP exposure derives schema and description from CLI descriptor", () => {
  const configured = CLI_COMMAND_REGISTRY.asset.adapters?.mcp;
  const adapter = (Array.isArray(configured) ? configured : configured === undefined ? [] : [configured]).find((candidate) => candidate.name === "asset.generate_blender");
  const tool = AUTHORING_MCP_TOOLS.find((candidate) => candidate.name === "asset.generate_blender") as { description: string; inputSchema?: Record<string, unknown>; name: string } | undefined;

  assert.notEqual(adapter, undefined);
  assert.deepEqual((tool?.inputSchema?.required as unknown[] | undefined), ["assetId", "recipe"]);
  assert.deepEqual(tool, adapter === undefined ? undefined : {
    description: adapter.description,
    inputSchema: adapter.inputSchema,
    name: adapter.name,
  });
});

test("Poly Haven MCP search and import derive argv and preserve CLI JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-mcp-polyhaven-"));
  const calls: string[][] = [];
  const payload = { code: "TN_POLY_HAVEN_SEARCH_OK", results: [{ id: "rock_01" }], source: "live" };
  try {
    const search = await callAuthoringMcpTool({ arguments: { limit: 3, query: "rock", type: "models" }, name: "asset.polyhaven_search" }, { allowedProjectRoots: [root], execute: async (argv) => { calls.push([...argv]); return { exitCode: 0, stdout: `${JSON.stringify(payload)}\n` }; }, projectRoot: root });
    const imported = await callAuthoringMcpTool({ arguments: { assetId: "rock", format: "gltf", maxBytes: 1000000, providerAssetId: "rock_01", resolution: "1k", type: "models" }, name: "asset.polyhaven_import" }, { allowedProjectRoots: [root], execute: async (argv) => { calls.push([...argv]); return { exitCode: 0, stdout: '{"code":"TN_POLY_HAVEN_IMPORT_OK","assetId":"rock"}\n' }; }, projectRoot: root });

    assert.deepEqual(search.content, payload);
    assert.deepEqual(calls[0], ["asset", "provider", "search", "poly-haven", "--query", "rock", "--type", "models", "--limit", "3", "--live", "--json"]);
    assert.deepEqual(imported.content, { assetId: "rock", code: "TN_POLY_HAVEN_IMPORT_OK" });
    assert.deepEqual(calls[1], ["asset", "provider", "import", "poly-haven", "rock_01", "--type", "models", "--resolution", "1k", "--format", "gltf", "--id", "rock", "--max-bytes", "1000000", "--project", root, "--json"]);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("Sketchfab MCP search preview and import derive argv preserve JSON and return image content", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-mcp-sketchfab-"));
  const calls: string[][] = [];
  const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const execute = async (argv: readonly string[]) => {
    calls.push([...argv]);
    if (argv.includes("search")) return { exitCode: 0, stdout: '{"code":"TN_SKETCHFAB_SEARCH_OK","results":[{"uid":"0123456789abcdef0123456789abcdef","license":{"id":"cc-by"}}]}\n' };
    if (argv.includes("preview")) return { exitCode: 0, stdout: `${JSON.stringify({ code: "TN_SKETCHFAB_PREVIEW_OK", image: { dataBase64: imageBytes.toString("base64"), mimeType: "image/jpeg", sha256: "preview-hash" }, uid: "0123456789abcdef0123456789abcdef" })}\n` };
    return { exitCode: 0, stdout: '{"code":"TN_SKETCHFAB_IMPORT_OK","assetId":"chair","bounds":{"size":[1,0.8,0.7]}}\n' };
  };
  try {
    const search = await callAuthoringMcpTool({ arguments: { cursor: "17", limit: 3, query: "chair" }, name: "asset.sketchfab_search" }, { allowedProjectRoots: [root], execute, projectRoot: root });
    const preview = await callAuthoringMcpTool({ arguments: { modelUid: "0123456789abcdef0123456789abcdef" }, name: "asset.sketchfab_preview" }, { allowedProjectRoots: [root], execute, projectRoot: root });
    const imported = await callAuthoringMcpTool({ arguments: { acceptedLicense: "cc-by", assetId: "chair", maxBytes: 1000000, modelUid: "0123456789abcdef0123456789abcdef", targetSize: 1 }, name: "asset.sketchfab_import" }, { allowedProjectRoots: [root], execute, projectRoot: root });

    assert.deepEqual(search.content, { code: "TN_SKETCHFAB_SEARCH_OK", results: [{ license: { id: "cc-by" }, uid: "0123456789abcdef0123456789abcdef" }] });
    assert.deepEqual(calls[0], ["asset", "provider", "search", "sketchfab", "--query", "chair", "--limit", "3", "--cursor", "17", "--json"]);
    assert.deepEqual(preview.content, [{ data: imageBytes.toString("base64"), mimeType: "image/jpeg", type: "image" }, { text: '{"code":"TN_SKETCHFAB_PREVIEW_OK","image":{"mimeType":"image/jpeg","sha256":"preview-hash"},"uid":"0123456789abcdef0123456789abcdef"}', type: "text" }]);
    assert.deepEqual(calls[1], ["asset", "provider", "preview", "sketchfab", "0123456789abcdef0123456789abcdef", "--json"]);
    assert.deepEqual(imported.content, { assetId: "chair", bounds: { size: [1, 0.8, 0.7] }, code: "TN_SKETCHFAB_IMPORT_OK" });
    assert.deepEqual(calls[2], ["asset", "provider", "import", "sketchfab", "0123456789abcdef0123456789abcdef", "--accept-license", "cc-by", "--target-size", "1", "--id", "chair", "--max-bytes", "1000000", "--project", root, "--json"]);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("Sketchfab MCP descriptors are the owning schema and reject implicit license acceptance", async () => {
  const configured = CLI_COMMAND_REGISTRY.asset.adapters?.mcp;
  const adapters = Array.isArray(configured) ? configured : configured === undefined ? [] : [configured];
  const names = adapters.filter((adapter) => adapter.name.startsWith("asset.sketchfab_")).map((adapter) => adapter.name);
  const root = await mkdtemp(join(tmpdir(), "tn-mcp-sketchfab-license-")); let calls = 0;
  try {
    const rejected = await callAuthoringMcpTool({ arguments: { assetId: "chair", modelUid: "0123456789abcdef0123456789abcdef", targetSize: 1 }, name: "asset.sketchfab_import" }, { allowedProjectRoots: [root], execute: async () => { calls += 1; return { exitCode: 0, stdout: "{}\n" }; }, projectRoot: root });
    assert.deepEqual(names, ["asset.sketchfab_status", "asset.sketchfab_search", "asset.sketchfab_preview", "asset.sketchfab_import"]);
    assert.deepEqual(AUTHORING_MCP_TOOLS.filter((tool) => names.includes(tool.name as typeof names[number])).map((tool) => tool.name), names);
    assert.equal((rejected.content as IJsonPayload).code, "TN_MCP_ARGUMENT_INVALID");
    assert.equal(calls, 0);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("should match CLI asset generation result through injected executor", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-mcp-generate-blender-"));
  const calls: string[][] = [];
  const recipe = { schema: "threenative.blender-recipe", version: "0.1.0", id: "crate", budgets: { maxOutputBytes: 1_000_000, maxPolygons: 10_000 }, parts: [{ id: "body", primitive: "cube" }] };
  const cliPayload = {
    code: "TN_ASSET_GENERATE_OK", command: "asset generate", diagnostics: [], filesWritten: ["assets/generated/crate.glb", "content/assets/crate.assets.json"],
    inputHash: "sha256:input", inspection: { counts: { animations: 0, materials: 1, meshes: 1, triangles: 12 } }, nextCommands: ["tn asset inspect assets/generated/crate.glb --json"], ok: true, outputHash: "sha256:output",
  };
  try {
    const result = await callAuthoringMcpTool({ arguments: { assetId: "crate", overwritePolicy: "replace", recipe }, name: "asset.generate_blender" }, {
      allowedProjectRoots: [root],
      execute: async (argv) => { calls.push([...argv]); return { exitCode: 0, stdout: `${JSON.stringify(cliPayload)}\n` }; },
      projectRoot: root,
    });

    assert.equal(result.isError, false);
    assert.deepEqual(result.content, cliPayload);
    assert.deepEqual(result.cli.argv, calls[0]);
    assert.deepEqual(calls[0]?.slice(0, 3), ["asset", "generate", "crate"]);
    assert.equal(calls[0]?.includes("--provider"), true);
    assert.equal(calls[0]?.includes("blender"), true);
    assert.equal(calls[0]?.includes(JSON.stringify(recipe)), true);
    assert.deepEqual(calls[0]?.slice(-3), ["--project", root, "--json"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should match the real CLI asset generation core through injected Blender dependencies", async () => {
  const mcpRoot = await mkdtemp(join(tmpdir(), "tn-mcp-generate-real-core-"));
  const cliRoot = await mkdtemp(join(tmpdir(), "tn-cli-generate-real-core-"));
  const recipe = { schema: "threenative.blender-recipe", version: "0.1.0", id: "crate", budgets: { maxOutputBytes: 1_000_000, maxPolygons: 10_000 }, parts: [{ id: "body", primitive: "cube" }] };
  try {
    const mcp = await callAuthoringMcpTool({ arguments: { assetId: "crate", overwritePolicy: "replace", recipe }, name: "asset.generate_blender" }, {
      allowedProjectRoots: [mcpRoot],
      execute: (argv) => assetCommand(argv.slice(1), { blenderDependencies: fakeBlenderDependencies() }),
      projectRoot: mcpRoot,
    });
    const cli = await assetCommand(["generate", "crate", "--provider", "blender", "--recipe", JSON.stringify(recipe), "--overwrite-policy", "replace", "--project", cliRoot, "--json"], { blenderDependencies: fakeBlenderDependencies() });

    assert.equal(mcp.isError, false);
    assert.equal(cli.exitCode, 0);
    const cliPayload = JSON.parse(cli.stdout) as IJsonPayload;
    assertHardenedExecution(mcp.content as IJsonPayload);
    assertHardenedExecution(cliPayload);
    assert.deepEqual(stripVolatileExecution(stripProjectPath(mcp.content)), stripVolatileExecution(stripProjectPath(cliPayload)));
    assert.equal(await readFile(join(mcpRoot, "assets/generated/crate.glb"), "utf8"), await readFile(join(cliRoot, "assets/generated/crate.glb"), "utf8"));
  } finally {
    await rm(mcpRoot, { force: true, recursive: true });
    await rm(cliRoot, { force: true, recursive: true });
  }
});

test("should reject Blender recipe and output traversal before executor", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-mcp-generate-guards-"));
  let calls = 0;
  const execute = async () => { calls += 1; return { exitCode: 0, stdout: "{}\n" }; };
  try {
    const recipeTraversal = await callAuthoringMcpTool({ arguments: { assetId: "crate", recipe: "../crate.recipe.json" }, name: "asset.generate_blender" }, { allowedProjectRoots: [root], execute, projectRoot: root });
    const outputTraversal = await callAuthoringMcpTool({ arguments: { assetId: "crate", out: "../crate.glb", recipe: { id: "crate" } }, name: "asset.generate_blender" }, { allowedProjectRoots: [root], execute, projectRoot: root });
    const generatedRecipe = await callAuthoringMcpTool({ arguments: { assetId: "crate", recipe: "dist/crate.recipe.json" }, name: "asset.generate_blender" }, { allowedProjectRoots: [root], execute, projectRoot: root });

    assert.equal((recipeTraversal.content as IJsonPayload).code, "TN_MCP_PATH_REJECTED");
    assert.equal((outputTraversal.content as IJsonPayload).code, "TN_MCP_PATH_REJECTED");
    assert.equal((generatedRecipe.content as IJsonPayload).code, "TN_MCP_PATH_REJECTED");
    assert.equal(calls, 0);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid generated asset id before project filesystem or executor access", async () => {
  const projectRoot = join(tmpdir(), `tn-mcp-invalid-asset-id-${process.pid}-${Date.now()}`);
  let calls = 0;
  const result = await callAuthoringMcpTool({ arguments: { assetId: "../crate", recipe: { id: "crate" } }, name: "asset.generate_blender" }, {
    allowedProjectRoots: [projectRoot],
    execute: async () => { calls += 1; return { exitCode: 0, stdout: "{}\n" }; },
    projectRoot,
  });

  assert.equal(result.isError, true);
  assert.equal((result.content as IJsonPayload).code, "TN_MCP_ARGUMENT_INVALID");
  assert.equal((result.content as IJsonPayload).diagnostics?.[0]?.path, "assetId");
  assert.equal(calls, 0);
  await assert.rejects(readFile(projectRoot));
});

test("should reject Blender recipe and output symlinks that resolve outside the project", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-mcp-generate-symlink-root-"));
  const outside = await mkdtemp(join(tmpdir(), "tn-mcp-generate-symlink-outside-"));
  let calls = 0;
  const execute = async () => { calls += 1; return { exitCode: 0, stdout: "{}\n" }; };
  try {
    await mkdir(join(root, "content/generators"), { recursive: true });
    await writeFile(join(outside, "crate.recipe.json"), "{}\n");
    await symlink(join(outside, "crate.recipe.json"), join(root, "content/generators/crate.recipe.json"));
    await mkdir(join(root, "assets"), { recursive: true });
    await symlink(outside, join(root, "assets/generated"));

    const recipeSymlink = await callAuthoringMcpTool({ arguments: { assetId: "crate", recipe: "content/generators/crate.recipe.json" }, name: "asset.generate_blender" }, { allowedProjectRoots: [root], execute, projectRoot: root });
    const outputSymlink = await callAuthoringMcpTool({ arguments: { assetId: "crate", out: "assets/generated/crate.glb", recipe: { id: "crate" } }, name: "asset.generate_blender" }, { allowedProjectRoots: [root], execute, projectRoot: root });

    assert.equal((recipeSymlink.content as IJsonPayload).code, "TN_MCP_PATH_REJECTED");
    assert.equal((outputSymlink.content as IJsonPayload).code, "TN_MCP_PATH_REJECTED");
    assert.equal(calls, 0);
  } finally {
    await rm(root, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
  }
});

test("should expose no Blender install remove or Python tools or arguments", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-mcp-generate-forbidden-"));
  let calls = 0;
  try {
    const blenderToolNames = AUTHORING_MCP_TOOLS.map((tool) => tool.name).filter((name) => name.includes("blender"));
    const schemaText = JSON.stringify(AUTHORING_MCP_TOOLS.find((tool) => tool.name === "asset.generate_blender")?.inputSchema);
    const forbiddenArgument = await callAuthoringMcpTool({ arguments: { assetId: "crate", python: "print('unsafe')", recipe: { id: "crate" } }, name: "asset.generate_blender" }, {
      allowedProjectRoots: [root], execute: async () => { calls += 1; return { exitCode: 0, stdout: "{}\n" }; }, projectRoot: root,
    });
    const forbiddenRecipe = await callAuthoringMcpTool({ arguments: { assetId: "crate", recipe: { id: "crate", script: "unsafe.py" } }, name: "asset.generate_blender" }, {
      allowedProjectRoots: [root], execute: async () => { calls += 1; return { exitCode: 0, stdout: "{}\n" }; }, projectRoot: root,
    });

    assert.deepEqual(blenderToolNames, ["asset.generate_blender", "generator.record_blender"]);
    assert.equal(blenderToolNames.some((name) => /install|remove|python/iu.test(name)), false);
    assert.equal(/install|remove|python|code/iu.test(schemaText), false);
    assert.equal((forbiddenArgument.content as IJsonPayload).code, "TN_MCP_ARGUMENT_INVALID");
    assert.equal((forbiddenRecipe.content as IJsonPayload).code, "TN_MCP_ARGUMENT_INVALID");
    assert.equal(calls, 0);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should preserve explicit Blender install fix without triggering download", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-mcp-generate-missing-"));
  let calls = 0;
  const missing = {
    code: "TN_GENERATOR_RUN_FAILED", diagnostics: [{ code: "TN_EXTERNAL_TOOL_MISSING", fix: { instruction: "Install the pinned optional Blender tool.", snippet: "tn tool install blender --accept-download --json" }, severity: "error" }], message: "Generator 'crate' failed.", ok: false,
  };
  try {
    const result = await callAuthoringMcpTool({ arguments: { assetId: "crate", recipe: { id: "crate" } }, name: "asset.generate_blender" }, {
      allowedProjectRoots: [root],
      execute: async (argv) => { calls += 1; assert.equal(argv[0], "asset"); return { exitCode: 1, stdout: `${JSON.stringify(missing)}\n` }; },
      projectRoot: root,
    });

    assert.equal(result.isError, true);
    assert.deepEqual(result.content, missing);
    assert.equal(calls, 1);
    assert.equal((result.content as IJsonPayload).diagnostics?.[0]?.fix?.snippet, "tn tool install blender --accept-download --json");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("cookbook MCP exposure derives from the owning CLI command descriptor", () => {
  const configured = CLI_COMMAND_REGISTRY.cookbook.adapters?.mcp;
  const adapter = (Array.isArray(configured) ? configured : configured === undefined ? [] : [configured]).find((candidate) => candidate.name === "cookbook_lookup");

  assert.notEqual(adapter, undefined);
  assert.equal(adapter?.name, "cookbook_lookup");
  assert.deepEqual(
    AUTHORING_MCP_TOOLS.filter((tool) => tool.name === "cookbook_lookup"),
    adapter === undefined ? [] : [adapter],
  );
});

test("cookbook lookup MCP delegates show-by-id to the CLI JSON surface", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-mcp-cookbook-show-"));

  try {
    const mcp = await callMcp(root, "cookbook_lookup", { id: "player-move-wasd" });
    const cli = await dispatch(["cookbook", "show", "player-move-wasd", "--json"]);

    assert.equal(mcp.isError, false);
    assert.deepEqual(mcp.cli.argv, ["cookbook", "show", "player-move-wasd", "--json"]);
    assert.deepEqual(mcp.content, JSON.parse(cli.stdout));
    assert.equal((mcp.content as IJsonPayload).code, "TN_COOKBOOK_SHOW_OK");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("cookbook lookup MCP delegates ranked query search to the CLI JSON surface", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-mcp-cookbook-search-"));

  try {
    const mcp = await callMcp(root, "cookbook_lookup", { query: "collect coins" });
    const cli = await dispatch(["cookbook", "search", "collect coins", "--json"]);

    assert.equal(mcp.isError, false);
    assert.deepEqual(mcp.cli.argv, ["cookbook", "search", "collect coins", "--json"]);
    assert.deepEqual(mcp.content, JSON.parse(cli.stdout));
    assert.equal((mcp.content as IJsonPayload).code, "TN_COOKBOOK_SEARCH_OK");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("cookbook lookup MCP requires exactly one lookup mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-mcp-cookbook-invalid-"));

  try {
    const missing = await callMcp(root, "cookbook_lookup", {});
    const ambiguous = await callMcp(root, "cookbook_lookup", { id: "player-move-wasd", query: "move player" });

    assert.equal(missing.isError, true);
    assert.equal((missing.content as IJsonPayload).code, "TN_MCP_ARGUMENT_INVALID");
    assert.match((missing.content as { message?: string }).message ?? "", /exactly one of 'id' or 'query'/);
    assert.equal(ambiguous.isError, true);
    assert.equal((ambiguous.content as IJsonPayload).code, "TN_MCP_ARGUMENT_INVALID");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should expose registry-backed tool names", () => {
  const mcpOperationNames = AUTHORING_MCP_TOOLS.map((tool) => tool.name).filter((name) =>
    AUTHORING_OPERATION_NAMES.includes(name as (typeof AUTHORING_OPERATION_NAMES)[number]),
  );

  assert.deepEqual(mcpOperationNames, AUTHORING_OPERATION_NAMES);
});

test("batch tool schema derives registered operation names", async () => {
  const tools = ["authoring.batch.plan", "authoring.batch.apply"].map((name) =>
    AUTHORING_MCP_TOOLS.find((tool) => tool.name === name),
  );
  const operationNames = tools.map((tool) => {
    const properties = tool?.inputSchema?.properties as Record<string, { items?: { oneOf?: Array<{ properties?: { name?: { const?: string } } }> } }> | undefined;
    return properties?.operations?.items?.oneOf?.map((operation) => operation.properties?.name?.const);
  });

  assert.ok(tools.every((tool) => tool !== undefined));
  assert.deepEqual(operationNames, [[...AUTHORING_OPERATION_NAMES], [...AUTHORING_OPERATION_NAMES]]);

  const root = await mkdtemp(join(tmpdir(), "tn-mcp-batch-schema-"));
  let calls = 0;
  try {
    const result = await callAuthoringMcpTool({
      arguments: {
        id: "unknown-operation",
        operations: [{ args: {}, name: "unknown.operation" }],
        schema: AUTHORING_BATCH_SCHEMA,
        version: AUTHORING_BATCH_VERSION,
      },
      name: "authoring.batch.plan",
    }, {
      allowedProjectRoots: [root],
      execute: async () => {
        calls += 1;
        return { exitCode: 0, stdout: "{}\n" };
      },
      projectRoot: root,
    });

    assert.equal(result.isError, true);
    assert.equal((result.content as IJsonPayload).code, "TN_MCP_ARGUMENT_INVALID");
    assert.equal(calls, 0);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("batch plan and apply delegate to the shared authoring core", async () => {
  const root = await createMcpSceneProject();
  const file = join(root, "content/scenes/arena.scene.json");
  const batch = {
    id: "add-batch-entity",
    operations: [{ args: { entityId: "batch-kart", prefabId: "kart", sceneId: "scene.arena" }, name: "scene.add_entity" }],
    schema: AUTHORING_BATCH_SCHEMA,
    version: AUTHORING_BATCH_VERSION,
  };
  let calls = 0;
  const options = {
    allowedProjectRoots: [root],
    execute: async () => {
      calls += 1;
      return { exitCode: 0, stdout: "{}\n" };
    },
    projectRoot: root,
  };

  try {
    const planned = await callAuthoringMcpTool({ arguments: batch, name: "authoring.batch.plan" }, options);
    const afterPlan = JSON.parse(await readFile(file, "utf8")) as { entities: Array<{ id: string }> };
    const applied = await callAuthoringMcpTool({ arguments: batch, name: "authoring.batch.apply" }, options);
    const afterApply = JSON.parse(await readFile(file, "utf8")) as { entities: Array<{ id: string }> };

    assert.equal(planned.isError, false);
    assert.equal((planned.content as { changed: boolean }).changed, true);
    assert.equal(afterPlan.entities.some((entity) => entity.id === "batch-kart"), false);
    assert.equal(applied.isError, false);
    assert.equal((applied.content as { committed: boolean }).committed, true);
    assert.equal(afterApply.entities.some((entity) => entity.id === "batch-kart"), true);
    assert.equal(calls, 0);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
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
    assert.deepEqual(transform.cli.argv.slice(0, 8), ["scene", "set-transform", "scene.arena", "rival-kart", "--position", "1,2,3", "--rotation", "0,0,0"]);
    assert.equal(camera.isError, false);
    assert.equal(camera.cli.argv.includes("--mode"), true);
    assert.equal(camera.cli.argv.includes("third-person-follow"), true);
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

test("material, runtime, and system MCP tools delegate to CLI JSON operation groups", async () => {
  const root = await createMcpSourceGroupProject();

  try {
    const material = await callMcp(root, "material.set", { alphaMode: "blend", color: "#ffcc00", materialId: "kart", roughness: 0.35 });
    const runtime = await callMcp(root, "runtime.set_rendering", {
      ambientOcclusionEnabled: true,
      ambientOcclusionIntensity: 1.2,
      ambientOcclusionMode: "screen-space",
      ambientOcclusionQuality: "medium",
      ambientOcclusionRadius: 3,
      bloomEnabled: true,
      motionBlurEnabled: true,
      motionBlurShutterAngle: 0.5,
      renderLookExposure: 1.1,
      renderProfile: "balanced",
      runtimeId: "default",
      screenSpaceGlobalIlluminationEnabled: false,
      screenSpaceGlobalIlluminationIntensity: 0.5,
      screenSpaceGlobalIlluminationQuality: "low",
      screenSpaceGlobalIlluminationRadius: 2,
      screenSpaceReflectionsEnabled: true,
      screenSpaceReflectionsQuality: "medium",
      screenSpaceReflectionsRoughnessLimit: 0.45,
    });
    const system = await callMcp(root, "system.attach_script", { exportName: "raceController", modulePath: "src/scripts/race.ts", systemId: "race" });

    assert.equal(material.isError, false);
    assert.equal(runtime.isError, false);
    assert.equal(system.isError, false);
    assert.deepEqual(material.cli.argv.slice(0, 9), ["material", "set", "kart", "--color", "#ffcc00", "--roughness", "0.35", "--alpha-mode", "blend"]);
    assert.equal(runtime.cli.argv.includes("--bloom"), true);
    assert.equal(runtime.cli.argv.includes("true"), true);
    assert.equal(runtime.cli.argv.includes("--ambient-occlusion"), true);
    assert.equal(runtime.cli.argv.includes("--screen-space-reflections-roughness-limit"), true);
    assert.equal(runtime.cli.argv.includes("--motion-blur-shutter-angle"), true);
    assert.equal(runtime.cli.argv.includes("--render-profile"), true);
    assert.deepEqual((material.content as IJsonPayload).filesWritten, ["content/materials/kart.materials.json"]);
    assert.deepEqual((runtime.content as IJsonPayload).filesWritten, ["content/runtime/default.runtime.json"]);
    assert.deepEqual((system.content as IJsonPayload).filesWritten, ["content/systems/race.systems.json"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("registry MCP tools without adapter metadata fail closed", async () => {
  const root = await createMcpSourceGroupProject();

  try {
    const result = await callMcp(root, "audio.create", { audioId: "default" });

    assert.equal(result.isError, true);
    assert.equal((result.content as IJsonPayload).code, "TN_MCP_ARGUMENT_INVALID");
    assert.match((result.content as { message?: string }).message ?? "", /missing CLI adapter metadata/);
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

test("mcp wrapper rejects an allowed-root symlink that resolves outside the allowlist", async () => {
  const allowed = await mkdtemp(join(tmpdir(), "tn-mcp-realpath-allowed-"));
  const outside = await mkdtemp(join(tmpdir(), "tn-mcp-realpath-outside-"));
  const linkedProject = join(allowed, "linked-project");
  let calls = 0;
  try {
    await symlink(outside, linkedProject);
    const result = await callAuthoringMcpTool({ arguments: {}, name: "scene.validate" }, {
      allowedProjectRoots: [allowed], execute: async () => { calls += 1; return { exitCode: 0, stdout: "{}\n" }; }, projectRoot: linkedProject,
    });

    assert.equal(result.isError, true);
    assert.equal((result.content as IJsonPayload).code, "TN_MCP_PROJECT_ROOT_REJECTED");
    assert.equal(calls, 0);
  } finally {
    await rm(allowed, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
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

function fakeBlenderDependencies(): NonNullable<IAssetCommandOptions["blenderDependencies"]> {
  return {
    inspect: async (path) => ({ code: "TN_ASSET_INSPECT_OK", counts: { animations: 0, materials: 1, meshes: 1, triangles: 12 }, diagnostics: [], file: { byteSize: 3, path } }),
    now: () => new Date("2026-07-14T00:00:00.000Z"),
    runnerPath: resolve(import.meta.dirname, "../../cli/src/blender/runner.py"),
    toolStatus: async () => ({
      artifact: { archive: "tar.xz", archiveFile: "blender.tar.xz", executablePath: "blender", expectedBytes: 1, host: "linux-x64", sha256: "0".repeat(64), url: "https://download.blender.org/blender.tar.xz" },
      cachePath: "/managed", code: "TN_EXTERNAL_TOOL_READY", executablePath: "/managed/blender", id: "blender",
      license: { name: "GPL", url: "https://developer.blender.org/docs/license/" }, ready: true, source: "managed", sourceUrl: "https://download.blender.org/source/", version: "4.5.11",
    }),
    uniqueId: () => "mcp-parity",
    runProcess: async (_executable, args) => {
      const job = JSON.parse(await readFile(args.at(-1)!, "utf8")) as { outputPath: string; resultPath: string };
      await writeFile(job.outputPath, "glb");
      await writeFile(job.resultPath, `${JSON.stringify({ animations: [], nodes: ["body"], ok: true })}\n`);
      return { exitCode: 0, stderr: "", stdout: "", timedOut: false };
    },
  };
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
  await mkdir(join(root, "content", "runtime"), { recursive: true });
  await mkdir(join(root, "content", "systems"), { recursive: true });
  await mkdir(join(root, "src", "scripts"), { recursive: true });
  await writeFile(join(root, "src", "scripts", "race.ts"), "export function raceController() {}\n");
  await writeFile(
    join(root, "content", "materials", "kart.materials.json"),
    `${JSON.stringify({ schema: "threenative.materials", version: "0.1.0", id: "kart", materials: [{ id: "kart" }] }, null, 2)}\n`,
  );
  await writeFile(
    join(root, "content", "runtime", "default.runtime.json"),
    `${JSON.stringify(
      {
        id: "default",
        renderer: { bloom: { enabled: false, intensity: 0.2, threshold: 0.8 } },
        schema: "threenative.runtime-config",
        time: { fixedDelta: 1 / 60, paused: false },
        version: "0.1.0",
        window: { height: 720, width: 1280 },
      },
      null,
      2,
    )}\n`,
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

function assertHardenedExecution(value: IJsonPayload): void {
  const execution = (value as unknown as Record<string, unknown>).execution as { argv?: string[]; cwd?: string; exitCode?: number; timedOut?: boolean } | undefined;
  assert.deepEqual(execution?.argv?.slice(0, 6), ["--background", "--factory-startup", "--disable-autoexec", "--python-exit-code", "1", "--python"]);
  assert.equal(execution?.argv?.[7], "--");
  assert.equal(execution?.argv?.[8], "--job");
  assert.equal(execution?.argv?.[9], resolve(execution?.cwd ?? "", "job.json"));
  assert.equal(execution?.exitCode, 0);
  assert.equal(execution?.timedOut, false);
}

function stripVolatileExecution(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const execution = record.execution as { argv?: string[] } | undefined;
  if (execution === undefined) return value;
  return { ...record, execution: { ...execution, argv: execution.argv?.map((entry, index) => index === 9 ? "<owned-job>" : entry), cwd: "<work-directory>" } };
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
