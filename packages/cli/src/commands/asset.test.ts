import assert from "node:assert/strict";
import { createReadStream, existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";
import { pathToFileURL } from "node:url";

import type { IAuthoringOperationResult, IDispatchAuthoringOperationOptions } from "@threenative/authoring";

import { findAssetSourceCatalogPath, resolveAssetSourceCatalogPath } from "../assetSourceCatalog/catalog.js";
import { assetGenerationProviderRegistry } from "../assetGenerationProviders/registry.js";
import type { IRunImg2ThreejsGeneratorResult } from "../img2threejs/runImg2ThreejsGenerator.js";
import { CLI_COMMAND_REGISTRY } from "../index.js";
import { ASSET_GENERATE_BLENDER_DESCRIPTOR, assetCommand } from "./asset.js";
import { generatorCommand } from "./sourceGeneratorCommand.js";

const assetCatalogPath = resolveAssetSourceCatalogPath();
const catalogTest = existsSync(assetCatalogPath) ? test : test.skip;

test("should derive asset generate help from the provider registry", async () => {
  const textHelp = await assetCommand(["generate", "--help"]);
  const help = await assetCommand(["generate", "--help", "--json"]);
  const payload = JSON.parse(help.stdout) as { providers: Array<{ availability: string; id: string; upstream?: { reviewedCommit: string } }> };
  for (const provider of assetGenerationProviderRegistry) {
    assert.equal(textHelp.stdout.split(provider.usage).length - 1, 1);
    assert.equal(payload.providers.find((candidate) => candidate.id === provider.id)?.availability, provider.availability);
  }
  assert.equal(CLI_COMMAND_REGISTRY.asset!.usage.split(ASSET_GENERATE_BLENDER_DESCRIPTOR.usage).length - 1, 1);
  assert.equal(payload.providers.find((provider) => provider.id === "img2threejs")?.upstream?.reviewedCommit, "e8ff28a6ae0cb534c7b2ebc15cb3f06709262d5b");
  const orderedFlags = ASSET_GENERATE_BLENDER_DESCRIPTOR.mcp.argv.arguments.flatMap((argument) => "flag" in argument ? [argument.flag] : []);
  let cursor = -1;
  for (const flag of orderedFlags) {
    const next = assetGenerationProviderRegistry[0]?.usage.indexOf(flag, cursor + 1) ?? -1;
    assert.ok(next > cursor, `${flag} must remain represented in descriptor-derived help order`);
    cursor = next;
  }
});

test("should reject unknown local generation providers and reach img2threejs recording", async () => {
  const unknown = await assetCommand(["generate", "crate", "--provider", "missing", "--recipe", "content/generators/crate.recipe.json", "--json"]);
  const reachable = await assetCommand(["generate", "crate", "--provider", "img2threejs", "--recipe", "content/generators/crate.img2threejs.json", "--json"]);
  assert.equal((JSON.parse(unknown.stdout) as { code: string }).code, "TN_ASSET_GENERATE_PROVIDER_UNKNOWN");
  assert.ok((JSON.parse(reachable.stdout) as { diagnostics: Array<{ code: string }> }).diagnostics.some((diagnostic) => diagnostic.code.startsWith("TN_IMG2THREEJS_")));
});

test("should preserve Blender generation behavior after registry extraction", () => {
  assert.deepEqual(ASSET_GENERATE_BLENDER_DESCRIPTOR, {
    assetIdPattern: "^[a-z][a-z0-9._-]*$",
    usage: "tn asset generate <asset-id> --provider blender --recipe <path-or-json> [--out <path>] [--overwrite-policy manual|replace|skip] [--project <path>] [--json]",
    mcp: {
      argv: {
        arguments: [
          { name: "assetId", positional: true },
          { encoding: "json", flag: "--recipe", name: "recipe" },
          { flag: "--out", name: "out" },
          { flag: "--overwrite-policy", name: "overwritePolicy" },
        ],
        fixed: ["--provider", "blender"],
        prefix: ["asset", "generate"],
        projectScoped: true,
      },
      description: "Generate and register a bounded Blender recipe through tn asset generate --json without installing tools or accepting code.",
      inputSchema: {
        additionalProperties: false,
        properties: {
          assetId: { pattern: "^[a-z][a-z0-9._-]*$", type: "string" },
          out: { pattern: "^assets/generated/[a-z][a-z0-9._-]*\\.glb$", type: "string" },
          overwritePolicy: { enum: ["manual", "replace", "skip"], type: "string" },
          recipe: { oneOf: [{ pattern: "^content/generators/[a-z][a-z0-9._-]*\\.recipe\\.json$", type: "string" }, { type: "object" }] },
        },
        required: ["assetId", "recipe"],
        type: "object",
      },
      name: "asset.generate_blender",
    },
  });
});

test("should expose Poly Haven provider commands through registry help", async () => {
  const text = await assetCommand(["provider", "help"]);
  const json = await assetCommand(["provider", "help", "--json"]);
  const payload = JSON.parse(json.stdout) as { providers: Array<{ features: Array<{ operation: string; usage: string }>; id: string; networkDefault: string }> };

  assert.equal(text.exitCode, 0);
  assert.match(text.stdout, /tn asset provider search poly-haven/);
  assert.match(text.stdout, /tn asset provider import poly-haven/);
  assert.equal(payload.providers[0]?.id, "poly-haven");
  assert.equal(payload.providers[0]?.networkDefault, "offline");
  assert.deepEqual(payload.providers[0]?.features.map((feature) => feature.operation), ["status", "categories", "search", "import"]);
});

test("should require an explicit live flag before calling Poly Haven API", async () => {
  let calls = 0;
  const offlineFetch = (async () => { calls += 1; throw new Error("unexpected network"); }) as typeof fetch;
  const liveFetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ rock_01: { authors: { Artist: "All" }, categories: ["rocks"], download_count: 2, name: "Rock", tags: ["rock"], type: 2 } }), { status: 200 });
  }) as typeof fetch;
  const offline = await assetCommand(["provider", "search", "poly-haven", "--query", "rock", "--type", "models", "--json"], { polyHavenDependencies: { fetch: offlineFetch } });
  const live = await assetCommand(["provider", "search", "poly-haven", "--query", "rock", "--type", "models", "--live", "--json"], { polyHavenDependencies: { fetch: liveFetch } });

  assert.equal(offline.exitCode, 0);
  assert.equal((JSON.parse(offline.stdout) as { source: string }).source, "snapshot");
  assert.equal(live.exitCode, 0);
  assert.equal((JSON.parse(live.stdout) as { source: string }).source, "live");
  assert.equal(calls, 1);
});

test("should expose Sketchfab provider commands through registry help", async () => {
  const result = await assetCommand(["provider", "help", "--json"]);
  const payload = JSON.parse(result.stdout) as { providers: Array<{ features: Array<{ operation: string; usage: string }>; id: string; networkDefault: string }> };
  const sketchfab = payload.providers.find((provider) => provider.id === "sketchfab");
  assert.equal(sketchfab?.networkDefault, "explicit");
  assert.deepEqual(sketchfab?.features.map((feature) => feature.operation), ["status", "search", "preview", "import"]);
  assert.match(sketchfab?.features.find((feature) => feature.operation === "import")?.usage ?? "", /--accept-license.*--target-size/);
});

test("should expose provider job flow through CLI and generic MCP descriptors", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-model-provider-cli-")); let calls = 0;
  try {
    const help = await assetCommand(["model-provider", "help", "--json"]);
    const providers = (JSON.parse(help.stdout) as { providers: Array<{ id: string; status: string }> }).providers;
    const missingAck = await assetCommand(["model-provider", "generate", "hyper3d", "--id", "crate-job", "--prompt", "beveled crate", "--project", root, "--json"], { hyper3dDependencies: { fetch: async () => { calls += 1; return new Response(); }, token: "secret" } });
    assert.deepEqual(providers.map((provider) => provider.id), ["hyper3d", "hunyuan"]);
    assert.match(CLI_COMMAND_REGISTRY.asset.usage, /--accept-cost --accept-provider-terms --confirm-input-rights/);
    assert.match((JSON.parse(missingAck.stdout) as { message: string }).message, /0\.5-credit base cost.*Business subscription.*hyper3d\.ai\/pricing/);
    assert.equal((JSON.parse(missingAck.stdout) as { code: string }).code, "TN_MODEL_PROVIDER_COST_ACK_REQUIRED");
    assert.equal(calls, 0);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("should report Hunyuan unsupported without submitting a request", async () => {
  let calls = 0;
  const result = await assetCommand(["model-provider", "status", "hunyuan", "--json"], { hyper3dDependencies: { fetch: async () => { calls += 1; return new Response(); } } });
  const payload = JSON.parse(result.stdout) as { followUp: string; state: string };
  assert.equal(payload.state, "unsupported");
  assert.match(payload.followUp, /optional-headless-blender-asset-generation\.md#open-questions$/);
  assert.equal(calls, 0);
});

test("should preserve Sketchfab provenance through inspect and asset add", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-sketchfab-cli-"));
  const uid = "0123456789abcdef0123456789abcdef";
  const gltf = Buffer.from(JSON.stringify({ accessors: [{ max: [2, 4, 1], min: [-2, 0, -1], type: "VEC3" }], asset: { version: "2.0" }, materials: [{ name: "Chair fabric" }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], nodes: [{ mesh: 0 }], scene: 0, scenes: [{ nodes: [0] }] }));
  const archive = makeStoredZip([{ bytes: gltf, name: "scene.gltf" }]);
  const dependencies = { credential: "secret-cli-token", now: () => new Date("2026-07-14T00:00:00.000Z"), fetch: (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/download")) return new Response(JSON.stringify({ gltf: { expires: 300, size: archive.byteLength, url: "https://sketchfab-prod-media.s3.amazonaws.com/model.zip?signature=secret" } }), { status: 200 });
    if (url.startsWith("https://api.sketchfab.com/")) return new Response(JSON.stringify({ isDownloadable: true, license: { label: "CC Attribution", slug: "cc-by", url: "https://creativecommons.org/licenses/by/4.0/" }, name: "Chair", uid, user: { displayName: "Chair Artist", profileUrl: "https://sketchfab.com/chair-artist" }, viewerUrl: `https://sketchfab.com/3d-models/chair-${uid}` }), { status: 200 });
    return new Response(archive, { headers: { "content-length": String(archive.byteLength), "content-type": "application/zip" }, status: 200 });
  }) as typeof fetch };
  try {
    const result = await assetCommand(["provider", "import", "sketchfab", uid, "--accept-license", "cc-by", "--target-size", "1", "--id", "chair", "--project", root, "--json"], { sketchfabDependencies: dependencies });
    const payload = JSON.parse(result.stdout) as { bounds: { size: number[] }; code: string; provenance: Record<string, unknown> };
    const asset = JSON.parse(await readFile(join(root, "content/assets/chair.assets.json"), "utf8")) as { assets: Array<Record<string, unknown>> };
    const provenance = await readFile(join(root, "assets/imported/sketchfab/chair/provenance.json"), "utf8");
    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_SKETCHFAB_IMPORT_OK");
    assert.ok(Math.abs(Math.max(...payload.bounds.size) - 1) < 0.001);
    assert.equal(asset.assets[0]?.source, `sketchfab:${uid}`);
    assert.equal(asset.assets[0]?.license, "cc-by");
    assert.match(String(asset.assets[0]?.attribution), /Chair Artist/);
    assert.equal(provenance.includes("secret-cli-token"), false);
    assert.equal(provenance.includes("signature=secret"), false);
  } finally { await rm(root, { force: true, recursive: true }); }
});

const fixtureGltf = {
  asset: { version: "2.0", generator: "asset-command-test" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, translation: [1, 0, -2], scale: [2, 1, 1] }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  accessors: [{ type: "VEC3", min: [-0.5, 0, -1], max: [0.5, 2, 1] }],
  images: [{ uri: "textures/kart.png" }],
  buffers: [{ uri: "mesh.bin", byteLength: 12 }],
  materials: [{}],
  textures: [{}],
};

test("should inspect glTF bounds, dependencies, and scale calibration", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-gltf-"));
  const previousInitCwd = process.env.INIT_CWD;
  try {
    process.env.INIT_CWD = root;
    await mkdir(join(root, "textures"), { recursive: true });
    await writeFile(join(root, "textures", "kart.png"), "png");
    await writeFile(join(root, "mesh.bin"), "bin");
    await writeFile(join(root, "kart.gltf"), `${JSON.stringify(fixtureGltf, null, 2)}\n`);

    const result = await assetCommand(["inspect", "kart.gltf", "--json"]);
    const payload = JSON.parse(result.stdout) as {
      bounds: { center: number[]; min: number[]; max: number[]; size: number[] };
      calibration: { camera: { recommendedDistance: number }; fitScales: { targetHeight2m: number; targetLength4m: number }; gameplay: { verdict: string; widthToLaneRatio: number } };
      code: string;
      counts: { images: number; meshes: number; nodes: number };
      dependencies: Array<{ kind: string; missing?: boolean; uri?: string }>;
      diagnostics: Array<{ code: string }>;
      file: { type: string };
      modular: {
        footprint: { center: number[]; size: number[] };
        originCorrection: number[];
        placement: { cardinalYaw: Array<{ entityPositionForFootprintCenterAtOrigin: number[]; yawDegrees: number }> };
        pivotOffsetFromFootprintCenter: number[];
        snap: { suggestedCellSize: number };
      };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_ASSET_INSPECT_OK");
    assert.equal(payload.file.type, "gltf");
    assert.deepEqual(payload.bounds.min, [0, 0, -3]);
    assert.deepEqual(payload.bounds.max, [2, 2, -1]);
    assert.deepEqual(payload.bounds.size, [2, 2, 2]);
    assert.equal(payload.counts.meshes, 1);
    assert.equal(payload.counts.images, 1);
    assert.equal(payload.dependencies.some((dependency) => dependency.kind === "image" && dependency.uri === "textures/kart.png" && dependency.missing !== true), true);
    assert.equal(payload.calibration.fitScales.targetHeight2m, 1);
    assert.equal(payload.calibration.fitScales.targetLength4m, 2);
    assert.equal(payload.calibration.camera.recommendedDistance, 3.6);
    assert.equal(payload.calibration.gameplay.verdict, "ok");
    assert.equal(payload.calibration.gameplay.widthToLaneRatio, 0.571429);
    assert.deepEqual(payload.modular.footprint.center, [1, -2]);
    assert.deepEqual(payload.modular.footprint.size, [2, 2]);
    assert.deepEqual(payload.modular.originCorrection, [-1, -1, 2]);
    assert.deepEqual(payload.modular.placement.cardinalYaw.map((placement) => placement.yawDegrees), [0, 90, 180, 270]);
    assert.deepEqual(payload.modular.placement.cardinalYaw[0]?.entityPositionForFootprintCenterAtOrigin, [-1, -1, 2]);
    assert.deepEqual(payload.modular.placement.cardinalYaw[1]?.entityPositionForFootprintCenterAtOrigin, [2, -1, 1]);
    assert.deepEqual(payload.modular.pivotOffsetFromFootprintCenter, [1, -2]);
    assert.equal(payload.modular.snap.suggestedCellSize, 2);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_ASSET_MODULAR_PIVOT_OFFSET"), true);
  } finally {
    restoreInitCwd(previousInitCwd);
    await rm(root, { force: true, recursive: true });
  }
});

test("should inspect triangle counts named nodes and animation clips for generated quality review", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-animation-"));
  const previousInitCwd = process.env.INIT_CWD;
  try {
    process.env.INIT_CWD = root;
    const animated = {
      asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, name: "body" }, { name: "arm" }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
      accessors: [{ count: 6, type: "VEC3", min: [-1, 0, -1], max: [1, 2, 1] }, { count: 6, type: "SCALAR" }],
      animations: [{ name: "wave", channels: [{ sampler: 0, target: { node: 1, path: "rotation" } }], samplers: [{ input: 2, output: 3 }] }],
    };
    await writeFile(join(root, "robot.gltf"), `${JSON.stringify(animated, null, 2)}\n`);
    const result = await assetCommand(["inspect", "robot.gltf", "--json"]);
    const payload = JSON.parse(result.stdout) as { animationClips: unknown[]; counts: { animations: number; triangles: number }; namedNodes: string[] };
    assert.equal(result.exitCode, 0);
    assert.deepEqual(payload.namedNodes, ["arm", "body"]);
    assert.deepEqual(payload.animationClips, [{ channels: 1, name: "wave", samplers: 1 }]);
    assert.equal(payload.counts.animations, 1);
    assert.equal(payload.counts.triangles, 2);
  } finally {
    restoreInitCwd(previousInitCwd);
    await rm(root, { force: true, recursive: true });
  }
});

test("should render modular placement guidance in text inspect output", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-modular-text-"));
  try {
    await mkdir(join(root, "textures"), { recursive: true });
    await writeFile(join(root, "textures", "kart.png"), "png");
    await writeFile(join(root, "mesh.bin"), "bin");
    await writeFile(join(root, "kart.gltf"), `${JSON.stringify(fixtureGltf, null, 2)}\n`);

    const result = await assetCommand(["inspect", join(root, "kart.gltf")]);

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Modular: footprint X\/Z size \[2, 2\], center \[1, -2\], origin correction \[-1, -1, 2\], yaw0 \[-1, -1, 2\], yaw90 \[2, -1, 1\], suggested cell 2/);
    assert.match(result.stdout, /TN_ASSET_MODULAR_PIVOT_OFFSET/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should report glTF material extension metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-gltf-materials-"));
  try {
    await writeFile(join(root, "hero.gltf"), `${JSON.stringify({
      ...fixtureGltf,
      buffers: [],
      images: [],
      materials: [
        {
          extensions: {
            KHR_materials_clearcoat: { clearcoatFactor: 0.5 },
            VENDOR_custom_shader: { processor: "executable" },
          },
          extras: { gameplayMaterial: "visor" },
          name: "HeroVisor",
          pbrMetallicRoughness: {
            baseColorTexture: {
              index: 0,
              extensions: {
                KHR_texture_transform: {
                  offset: [0.25, 0.5],
                  scale: [2, 2],
                },
              },
            },
          },
        },
      ],
      meshes: [
        {
          extras: { targetNames: ["Smile"] },
          primitives: [{ attributes: { POSITION: 0 }, material: 0, targets: [{ POSITION: 0 }] }],
          weights: [0.3],
        },
      ],
    }, null, 2)}\n`);

    const result = await assetCommand(["inspect", join(root, "hero.gltf"), "--json"]);
    const payload = JSON.parse(result.stdout) as {
      diagnostics: Array<{ code: string; fix?: { snippet?: string }; path?: string; severity: string }>;
      gltf: {
        assetId: string;
        materials: Array<{
          extensions: Array<{ extension: string; path: string; status: string }>;
          material: string;
          textureTransforms: Array<{ offset: number[]; path: string; textureSlot: string }>;
        }>;
        morphTargets: Array<{ defaultWeight: number; target: string }>;
      };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.gltf.assetId, "asset:hero");
    assert.deepEqual(payload.gltf.materials[0]?.extensions.map((extension) => [extension.extension, extension.status]), [
      ["KHR_materials_clearcoat", "promoted"],
      ["VENDOR_custom_shader", "unsupported"],
    ]);
    assert.match(payload.diagnostics.find((diagnostic) => diagnostic.code.includes("GLTF_EXTENSION"))?.fix?.snippet ?? "", /tn asset repair/);
    assert.equal(payload.gltf.materials[0]?.textureTransforms[0]?.textureSlot, "pbrMetallicRoughness.baseColorTexture");
    assert.deepEqual(payload.gltf.materials[0]?.textureTransforms[0]?.offset, [0.25, 0.5]);
    assert.deepEqual(payload.gltf.morphTargets, [{ defaultWeight: 0.3, mesh: "mesh:0", path: "/meshes/0/extras/targetNames/0", source: "mesh.extras.targetNames", target: "Smile" }]);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_ASSET_GLTF_EXTENSION_PROCESSOR_UNSUPPORTED" && diagnostic.path === "/materials/0/extensions/VENDOR_custom_shader" && diagnostic.severity === "warning"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should omit modular pivot diagnostic for centered model footprints", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-centered-modular-"));
  try {
    await writeFile(join(root, "centered.gltf"), `${JSON.stringify({
      ...fixtureGltf,
      nodes: [{ mesh: 0 }],
      accessors: [{ type: "VEC3", min: [-1, 0, -1], max: [1, 0.1, 1] }],
      images: [],
      buffers: [{ uri: "mesh.bin", byteLength: 12 }],
    }, null, 2)}\n`);
    await writeFile(join(root, "mesh.bin"), "bin");

    const result = await assetCommand(["inspect", join(root, "centered.gltf"), "--json"]);
    const payload = JSON.parse(result.stdout) as {
      diagnostics: Array<{ code: string }>;
      modular: { originCorrection: number[]; pivotOffsetFromFootprintCenter: number[] };
    };

    assert.equal(result.exitCode, 0);
    assert.deepEqual(payload.modular.pivotOffsetFromFootprintCenter, [0, 0]);
    assert.deepEqual(payload.modular.originCorrection, [0, -0.05, 0]);
    assert.deepEqual(payload.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should inspect a directory as a modular asset catalog", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-catalog-"));
  try {
    await mkdir(join(root, "nested"), { recursive: true });
    await writeFile(join(root, "road.gltf"), `${JSON.stringify({
      ...fixtureGltf,
      images: [],
      buffers: [{ uri: "mesh.bin", byteLength: 12 }],
    }, null, 2)}\n`);
    await writeFile(join(root, "nested", "corner.gltf"), `${JSON.stringify({
      ...fixtureGltf,
      nodes: [{ mesh: 0 }],
      accessors: [{ type: "VEC3", min: [-1, 0, -1], max: [1, 0.1, 1] }],
      images: [],
      buffers: [{ uri: "../mesh.bin", byteLength: 12 }],
    }, null, 2)}\n`);
    await writeFile(join(root, "mesh.bin"), "bin");
    await writeFile(join(root, "notes.txt"), "ignored");

    const shallow = await assetCommand(["inspect", root, "--json"]);
    const shallowPayload = JSON.parse(shallow.stdout) as {
      assets: Array<{ file: { path: string }; modular: { footprint: { size: number[] } } }>;
      code: string;
      directory: { recursive: boolean };
      summary: { inspected: number; warnings: number };
    };

    assert.equal(shallow.exitCode, 0);
    assert.equal(shallowPayload.code, "TN_ASSET_CATALOG_OK");
    assert.equal(shallowPayload.directory.recursive, false);
    assert.equal(shallowPayload.summary.inspected, 1);
    assert.equal(shallowPayload.summary.warnings, 1);
    assert.equal(shallowPayload.assets[0]?.file.path, join(root, "road.gltf"));
    assert.deepEqual(shallowPayload.assets[0]?.modular.footprint.size, [2, 2]);

    const recursive = await assetCommand(["inspect", root, "--recursive", "--json"]);
    const recursivePayload = JSON.parse(recursive.stdout) as {
      assets: Array<{ file: { path: string } }>;
      directory: { recursive: boolean };
      summary: { inspected: number };
    };

    assert.equal(recursive.exitCode, 0);
    assert.equal(recursivePayload.directory.recursive, true);
    assert.equal(recursivePayload.summary.inspected, 2);
    assert.deepEqual(recursivePayload.assets.map((asset) => asset.file.path), [join(root, "nested", "corner.gltf"), join(root, "road.gltf")].sort((a, b) => a.localeCompare(b)));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should render modular asset catalog guidance as text", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-catalog-text-"));
  try {
    await writeFile(join(root, "road.gltf"), `${JSON.stringify({
      ...fixtureGltf,
      images: [],
      buffers: [],
    }, null, 2)}\n`);

    const result = await assetCommand(["inspect", root]);

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Asset catalog inspection completed/);
    assert.match(result.stdout, /Inspected: 1, warnings: 1, errors: 0/);
    assert.match(result.stdout, /road\.gltf: size \[2, 2\], center \[1, -2\], correction \[-1, -1, 2\], yaw0 \[-1, -1, 2\], yaw90 \[2, -1, 1\], cell 2/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail directory inspection when no glTF assets are present", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-empty-catalog-"));
  try {
    await writeFile(join(root, "notes.txt"), "ignored");

    const result = await assetCommand(["inspect", root, "--json"]);
    const payload = JSON.parse(result.stdout) as {
      code: string;
      diagnostics: Array<{ code: string; severity: string }>;
      summary: { inspected: number; errors: number };
    };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_ASSET_CATALOG_FAILED");
    assert.equal(payload.summary.inspected, 0);
    assert.equal(payload.summary.errors, 1);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_ASSET_CATALOG_EMPTY" && diagnostic.severity === "error"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should inspect GLB JSON chunk and report embedded dependencies", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-glb-"));
  try {
    const glbGltf = {
      ...fixtureGltf,
      buffers: [{ byteLength: 12 }],
      images: [{ bufferView: 0, mimeType: "image/png" }],
    };
    await writeFile(join(root, "kart.glb"), makeGlb(glbGltf));

    const result = await assetCommand(["inspect", join(root, "kart.glb"), "--json"]);
    const payload = JSON.parse(result.stdout) as {
      bounds: { size: number[] };
      code: string;
      dependencies: Array<{ embedded: boolean; kind: string }>;
      file: { type: string };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_ASSET_INSPECT_OK");
    assert.equal(payload.file.type, "glb");
    assert.deepEqual(payload.bounds.size, [2, 2, 2]);
    assert.equal(payload.dependencies.some((dependency) => dependency.kind === "image" && dependency.embedded), true);
    assert.equal(payload.dependencies.some((dependency) => dependency.kind === "buffer" && dependency.embedded), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should infer modular road connectors from road material geometry", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-road-connectors-"));
  try {
    await writeFile(join(root, "road.glb"), makeRoadGlb("straight"));

    const result = await assetCommand(["inspect", join(root, "road.glb"), "--json"]);
    const payload = JSON.parse(result.stdout) as {
      modular: {
        connectors: {
          cardinalYaw: Array<{ edges: string[]; yawDegrees: number }>;
          local: string[];
          source: string;
        };
      };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.modular.connectors.source, "material:road");
    assert.deepEqual(payload.modular.connectors.local, ["north", "south"]);
    assert.deepEqual(payload.modular.connectors.cardinalYaw.find((placement) => placement.yawDegrees === 90)?.edges, ["east", "west"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should report missing external texture with stable diagnostic", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-missing-"));
  try {
    await writeFile(join(root, "mesh.bin"), "bin");
    await writeFile(join(root, "kart.gltf"), `${JSON.stringify(fixtureGltf, null, 2)}\n`);

    const result = await assetCommand(["inspect", join(root, "kart.gltf"), "--json"]);
    const payload = JSON.parse(result.stdout) as {
      code: string;
      dependencies: Array<{ kind: string; missing?: boolean; uri?: string }>;
      diagnostics: Array<{ code: string; severity: string }>;
    };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_ASSET_INSPECT_FAILED");
    assert.equal(payload.dependencies.some((dependency) => dependency.kind === "image" && dependency.uri === "textures/kart.png" && dependency.missing === true), true);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_ASSET_IMAGE_MISSING" && diagnostic.severity === "error"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should add structured asset source document", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-add-source-"));
  try {
    const result = await assetCommand(["add", "model.kart", "--type", "model", "--path", "assets/kart.glb", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { filesWritten: string[] };
    const doc = JSON.parse(await readFile(join(root, "content", "assets", "model.kart.assets.json"), "utf8")) as {
      assets: Array<{ id: string; path: string; type: string }>;
    };

    assert.equal(result.exitCode, 0);
    assert.deepEqual(payload.filesWritten, ["content/assets/model.kart.assets.json"]);
    assert.deepEqual(doc.assets, [{ id: "model.kart", path: "assets/kart.glb", type: "model" }]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should record run inspect and register through asset generate", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-generate-"));
  try {
    const recipe = {
      schema: "threenative.blender-recipe", version: "0.1.0", id: "robot",
      budgets: { maxOutputBytes: 1_000_000, maxPolygons: 10_000 },
      parts: [{ id: "body", primitive: "cube" }],
      animations: [{ id: "wave", duration: 1, loop: true, tracks: [{ node: "body", property: "rotation", keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [0, 0, 30] }] }] }],
    };
    const result = await assetCommand([
      "generate", "robot", "--provider", "blender", "--recipe", JSON.stringify(recipe), "--overwrite-policy", "replace", "--project", root, "--json",
    ], {
      blenderDependencies: {
        inspect: async (path) => ({ animationClips: [{ channels: 1, name: "wave", samplers: 1 }], code: "TN_ASSET_INSPECT_OK", counts: { animations: 1, materials: 0, meshes: 1, triangles: 12 }, diagnostics: [], file: { byteSize: 3, path } }),
        runnerPath: resolve(import.meta.dirname, "../blender/runner.py"),
        toolStatus: async () => ({
          artifact: { archive: "tar.xz", archiveFile: "blender.tar.xz", executablePath: "blender", expectedBytes: 1, host: "linux-x64", sha256: "0".repeat(64), url: "https://download.blender.org/blender.tar.xz" },
          cachePath: "/managed", code: "TN_EXTERNAL_TOOL_READY", executablePath: "/managed/blender", id: "blender",
          license: { name: "GPL", url: "https://developer.blender.org/docs/license/" }, ready: true, source: "managed", sourceUrl: "https://download.blender.org/source/", version: "4.5.11",
        }),
        runProcess: async (_executable, args) => {
          const job = JSON.parse(await readFile(args.at(-1)!, "utf8")) as { outputPath: string; resultPath: string };
          await writeFile(job.outputPath, "glb");
          await writeFile(job.resultPath, `${JSON.stringify({ animations: ["wave"], nodes: ["body"], ok: true })}\n`);
          return { exitCode: 0, stderr: "", stdout: "", timedOut: false };
        },
      },
    });
    const payload = JSON.parse(result.stdout) as { code: string; inspection: { counts: { animations: number } }; recordedFiles: string[] };
    assert.equal(result.exitCode, 0, result.stdout);
    assert.equal(payload.code, "TN_ASSET_GENERATE_OK");
    assert.equal(payload.inspection.counts.animations, 1);
    assert.deepEqual(payload.recordedFiles.sort(), ["content/generators/robot.generator.json", "content/generators/robot.recipe.json"]);
    assert.equal((await readFile(join(root, "content/assets/robot.assets.json"), "utf8")).includes('"sourceClip": "wave"'), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should roll back Blender recipe and provenance when asset generation fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-generate-rollback-"));
  try {
    const recipe = { schema: "threenative.blender-recipe", version: "0.1.0", id: "crate", budgets: { maxOutputBytes: 1_000_000, maxPolygons: 10_000 }, parts: [{ id: "body", primitive: "cube" }] };
    const priorRecipe = `${JSON.stringify({ ...recipe, parts: [{ id: "prior-body", primitive: "sphere" }] }, null, 2)}\n`;
    const priorProvenance = `${JSON.stringify({ schema: "threenative.generator-provenance", version: "0.1.0", id: "crate", provider: "blender", providerVersion: "4.5.11", recipe: "content/generators/crate.recipe.json", outputs: ["assets/generated/crate.glb"], overwritePolicy: "manual" }, null, 2)}\n`;
    await mkdir(join(root, "content/generators"), { recursive: true });
    await writeFile(join(root, "content/generators/crate.recipe.json"), priorRecipe);
    await writeFile(join(root, "content/generators/crate.generator.json"), priorProvenance);
    const result = await assetCommand(["generate", "crate", "--provider", "blender", "--recipe", JSON.stringify(recipe), "--project", root, "--json"], {
      blenderDependencies: { toolStatus: async () => ({
        artifact: { archive: "tar.xz", archiveFile: "blender.tar.xz", executablePath: "blender", expectedBytes: 1, host: "linux-x64", sha256: "0".repeat(64), url: "https://download.blender.org/blender.tar.xz" },
        cachePath: "/missing", code: "TN_EXTERNAL_TOOL_MISSING", executablePath: "/missing/blender", id: "blender",
        license: { name: "GPL", url: "https://developer.blender.org/docs/license/" }, ready: false, source: "missing", sourceUrl: "https://download.blender.org/source/", version: "4.5.11",
      }) },
    });
    const payload = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string; fix?: { snippet?: string } }> };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.diagnostics[0]?.code, "TN_EXTERNAL_TOOL_MISSING");
    assert.equal(payload.diagnostics[0]?.fix?.snippet, "tn tool install blender --accept-download --json");
    assert.equal(await readFile(join(root, "content/generators/crate.generator.json"), "utf8"), priorProvenance);
    assert.equal(await readFile(join(root, "content/generators/crate.recipe.json"), "utf8"), priorRecipe);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should return one complete img2threejs asset generation payload", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-generate-img2threejs-"));
  const generatorId = "prop.radio";
  try {
    const authoringDispatch = async (options: IDispatchAuthoringOperationOptions): Promise<IAuthoringOperationResult> => {
      assert.equal(options.name, "generator.record_img2threejs");
      await writeImg2ThreejsProvenance(root, generatorId);
      return { changed: true, diagnostics: [], filesWritten: [`content/generators/${generatorId}.generator.json`], ok: true, projectPath: root };
    };
    const img2ThreejsRunner = async (projectPath: string): Promise<IRunImg2ThreejsGeneratorResult> => {
      const result = img2ThreejsAssetSentinelResult(projectPath, generatorId);
      await mkdir(join(root, "assets/generated"), { recursive: true });
      await mkdir(join(root, "content/assets"), { recursive: true });
      await writeFile(join(root, `assets/generated/${generatorId}.glb`), "sentinel-glb");
      await writeFile(join(root, `content/assets/${generatorId}.assets.json`), `${JSON.stringify({ assets: [{ id: generatorId, path: `assets/generated/${generatorId}.glb`, source: `generator:${generatorId}`, type: "model" }], id: generatorId, schema: "threenative.assets", version: "0.1.0" }, null, 2)}\n`);
      await writeImg2ThreejsProvenance(root, generatorId, result.outputHash);
      return result;
    };

    const asset = await assetCommand([
      "generate", generatorId, "--provider", "img2threejs", "--recipe", `content/generators/${generatorId}.img2threejs.json`, "--overwrite-policy", "replace", "--project", root, "--json",
    ], { authoringDispatch, img2ThreejsRunner });
    const rerun = await generatorCommand(["run", generatorId, "--project", root, "--json"], { img2ThreejsRunner });
    const assetPayload = JSON.parse(asset.stdout) as Record<string, unknown>;
    const rerunPayload = JSON.parse(rerun.stdout) as Record<string, unknown>;

    assert.equal(asset.exitCode, 0, asset.stdout);
    assert.equal(assetPayload.code, "TN_ASSET_GENERATE_OK");
    assert.equal(assetPayload.command, "asset generate");
    assert.deepEqual(assetPayload.recordedFiles, [`content/generators/${generatorId}.generator.json`]);
    assert.deepEqual(assetPayload.inspection, img2ThreejsAssetSentinelResult(root, generatorId).inspection);
    assert.deepEqual(assetPayload.diagnostics, []);
    assert.deepEqual(assetPayload.filesWritten, [`assets/generated/${generatorId}.glb`, `content/assets/${generatorId}.assets.json`, `content/generators/${generatorId}.generator.json`]);
    assert.equal(assetPayload.inputHash, `sha256:${"a".repeat(64)}`);
    assert.equal(assetPayload.outputHash, `sha256:${"b".repeat(64)}`);
    assert.deepEqual(assetPayload.proofFiles, [`artifacts/img2threejs/${generatorId}/reload-proof/hash/source.png`]);
    assert.deepEqual(assetPayload.nextCommands, [
      `tn asset inspect assets/generated/${generatorId}.glb --json`,
      `tn model-test assets/generated/${generatorId}.glb --angles 0,90,180,270 --json`,
      "tn build",
    ]);
    assert.deepEqual(withoutAssetGenerateEnvelope(assetPayload), withoutAssetGenerateEnvelope(rerunPayload));
    assert.equal(await readFile(join(root, `assets/generated/${generatorId}.glb`), "utf8"), "sentinel-glb");
    assert.match(await readFile(join(root, `content/assets/${generatorId}.assets.json`), "utf8"), new RegExp(`generator:${generatorId.replace(".", "\\.")}`));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should leave no partial source or output on registration failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-generate-img2threejs-rollback-"));
  const generatorId = "prop.radio";
  const provenancePath = join(root, `content/generators/${generatorId}.generator.json`);
  const outputPath = join(root, `assets/generated/${generatorId}.glb`);
  const assetPath = join(root, `content/assets/${generatorId}.assets.json`);
  try {
    await writeImg2ThreejsProvenance(root, generatorId, `sha256:${"c".repeat(64)}`);
    await mkdir(join(root, "assets/generated"), { recursive: true });
    await mkdir(join(root, "content/assets"), { recursive: true });
    await writeFile(outputPath, "accepted-output");
    await writeFile(assetPath, `${JSON.stringify({ assets: [{ id: generatorId, path: `assets/generated/${generatorId}.glb`, source: `generator:${generatorId}`, type: "model" }], id: generatorId, schema: "threenative.assets", version: "0.1.0" }, null, 2)}\n`);
    const before = await Promise.all([readFile(provenancePath), readFile(outputPath), readFile(assetPath)]);
    const authoringDispatch = async (options: IDispatchAuthoringOperationOptions): Promise<IAuthoringOperationResult> => {
      assert.equal(options.name, "generator.record_img2threejs");
      await writeImg2ThreejsProvenance(root, generatorId);
      return { changed: true, diagnostics: [], filesWritten: [`content/generators/${generatorId}.generator.json`], ok: true, projectPath: root };
    };
    const img2ThreejsRunner = async (projectPath: string): Promise<IRunImg2ThreejsGeneratorResult> => ({
      code: "TN_IMG2THREEJS_PROMOTION_FAILED",
      diagnostics: [{ code: "TN_IMG2THREEJS_PROMOTION_FAILED", message: "Asset registration transaction failed.", path: `content/assets/${generatorId}.assets.json`, severity: "error" }],
      filesWritten: [], generatorId, message: "Generation failed.", ok: false, projectPath,
    });

    const result = await assetCommand([
      "generate", generatorId, "--provider", "img2threejs", "--recipe", `content/generators/${generatorId}.img2threejs.json`, "--overwrite-policy", "replace", "--project", root, "--json",
    ], { authoringDispatch, img2ThreejsRunner });
    const payload = JSON.parse(result.stdout) as { code: string; recordedFiles: string[] };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_GENERATOR_RUN_FAILED");
    assert.deepEqual(payload.recordedFiles, []);
    assert.deepEqual(await Promise.all([readFile(provenancePath), readFile(outputPath), readFile(assetPath)]), before);

    const concurrentProvenance = "concurrent-user-provenance";
    const concurrentFailure = await assetCommand([
      "generate", generatorId, "--provider", "img2threejs", "--recipe", `content/generators/${generatorId}.img2threejs.json`, "--overwrite-policy", "replace", "--project", root, "--json",
    ], {
      authoringDispatch,
      img2ThreejsRunner: async (projectPath) => {
        await writeFile(provenancePath, concurrentProvenance);
        return { code: "TN_IMG2THREEJS_PROMOTION_FAILED", diagnostics: [], filesWritten: [], generatorId, message: "Generation failed.", ok: false, projectPath };
      },
    });
    assert.equal(concurrentFailure.exitCode, 1);
    assert.equal(await readFile(provenancePath, "utf8"), concurrentProvenance);
    assert.deepEqual(await Promise.all([readFile(outputPath), readFile(assetPath)]), before.slice(1));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should not replace a manually registered asset with generated source", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-generate-manual-conflict-"));
  try {
    const assetPath = join(root, "content/assets/crate.assets.json");
    const manual = `${JSON.stringify({ schema: "threenative.assets", version: "0.1.0", id: "crate", assets: [{ id: "crate", path: "assets/manual/crate.glb", source: "artist:manual", type: "model" }] }, null, 2)}\n`;
    await mkdir(join(root, "content/assets"), { recursive: true });
    await writeFile(assetPath, manual);
    const recipe = { schema: "threenative.blender-recipe", version: "0.1.0", id: "crate", budgets: { maxOutputBytes: 1_000_000, maxPolygons: 10_000 }, parts: [{ id: "body", primitive: "cube" }] };
    const result = await assetCommand(["generate", "crate", "--provider", "blender", "--recipe", JSON.stringify(recipe), "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { code: string };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_ASSET_GENERATE_MANUAL_ASSET_CONFLICT");
    assert.equal(await readFile(assetPath, "utf8"), manual);
    await assert.rejects(readFile(join(root, "content/generators/crate.generator.json")));
    await assert.rejects(readFile(join(root, "content/generators/crate.recipe.json")));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid generated asset id before project or Blender access", async () => {
  const parent = await mkdtemp(join(tmpdir(), "tn-asset-generate-invalid-id-"));
  const projectPath = join(parent, "must-not-exist");
  let toolStatusCalls = 0;
  try {
    const result = await assetCommand(["generate", "../crate", "--provider", "blender", "--recipe", "{}", "--project", projectPath, "--json"], {
      blenderDependencies: { toolStatus: async () => { toolStatusCalls += 1; throw new Error("must not execute"); } },
    });
    const payload = JSON.parse(result.stdout) as { code: string };

    assert.equal(result.exitCode, 2);
    assert.equal(payload.code, "TN_ASSET_GENERATE_ASSET_ID_INVALID");
    assert.equal(toolStatusCalls, 0);
    await assert.rejects(readFile(projectPath));
  } finally {
    await rm(parent, { force: true, recursive: true });
  }
});

test("should reject manual asset declaration with same id in non-default asset document", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-generate-project-ownership-"));
  const assetPath = join(root, "content/assets/characters/shared.assets.json");
  const manual = `${JSON.stringify({ schema: "threenative.assets", version: "0.1.0", id: "shared", assets: [{ id: "crate", path: "assets/manual/crate.glb", source: "artist:manual", type: "model" }] }, null, 2)}\n`;
  try {
    await mkdir(join(root, "content/assets/characters"), { recursive: true });
    await writeFile(assetPath, manual);
    const recipe = { schema: "threenative.blender-recipe", version: "0.1.0", id: "crate", budgets: { maxOutputBytes: 1_000_000, maxPolygons: 10_000 }, parts: [{ id: "body", primitive: "cube" }] };
    const result = await assetCommand(["generate", "crate", "--provider", "blender", "--recipe", JSON.stringify(recipe), "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { code: string; message: string };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_ASSET_GENERATE_MANUAL_ASSET_CONFLICT");
    assert.match(payload.message, /content\/assets\/characters\/shared\.assets\.json/);
    assert.equal(await readFile(assetPath, "utf8"), manual);
    await assert.rejects(readFile(join(root, "content/generators/crate.generator.json")));
    await assert.rejects(readFile(join(root, "content/generators/crate.recipe.json")));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported asset type at add time", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-type-invalid-"));
  try {
    const result = await assetCommand(["add", "piece", "--type", "glb", "--path", "assets/piece.glb", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string; fix?: { snippet?: string } }> };
    assert.equal(result.exitCode, 1);
    assert.equal(payload.diagnostics[0]?.code, "TN_AUTHORING_ASSET_TYPE_INVALID");
    assert.equal(payload.diagnostics[0]?.fix?.snippet, "--type model");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject format mismatch for kind at add time", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-format-invalid-"));
  try {
    const result = await assetCommand(["add", "piece", "--type", "model", "--path", "assets/piece.dae", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { diagnostics: Array<{ fix?: { snippet?: string }; message: string }> };
    assert.equal(result.exitCode, 1);
    assert.match(payload.diagnostics[0]?.message ?? "", /glb, gltf/);
    assert.match(payload.diagnostics[0]?.fix?.snippet ?? "", /tn asset import/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept model glb add unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-model-valid-"));
  try {
    const result = await assetCommand(["add", "piece", "--type", "model", "--path", "assets/piece.glb", "--project", root, "--json"]);
    assert.equal(result.exitCode, 0, result.stdout);
    assert.equal((JSON.parse(result.stdout) as { code: string }).code, "TN_ASSET_OK");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should add structured render target asset source document", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-add-render-target-"));
  try {
    const result = await assetCommand(["add", "rt.minimap", "--type", "render-target", "--width", "512", "--height", "256", "--usage", "depth", "--format", "depth24plus", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { filesWritten: string[] };
    const doc = JSON.parse(await readFile(join(root, "content", "assets", "rt.minimap.assets.json"), "utf8")) as {
      assets: Array<{ format: string; height: number; id: string; type: string; usage: string; width: number }>;
    };

    assert.equal(result.exitCode, 0);
    assert.deepEqual(payload.filesWritten, ["content/assets/rt.minimap.assets.json"]);
    assert.deepEqual(doc.assets, [{ format: "depth24plus", height: 256, id: "rt.minimap", type: "render-target", usage: "depth", width: 512 }]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

catalogTest("should search direct GLB sources by game category", async () => {
  const result = await assetCommand(["source", "search", "--game-category", "underwater", "--format", "glb", "--direct-only", "--full", "--json"]);
  const payload = JSON.parse(result.stdout) as {
    code: string;
    records: Array<{ downloadUrl: string | null; format: string; gameCategory: string; isDirectDownload: boolean }>;
  };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_ASSET_SOURCE_SEARCH_OK");
  assert.equal(payload.records.length >= 1, true);
  assert.equal(payload.records.every((record) => record.gameCategory === "underwater" && record.format === "glb" && record.isDirectDownload && record.downloadUrl !== null), true);
});

catalogTest("should emit compact search records by default and full records with --full", async () => {
  const compact = await assetCommand(["source", "search", "--query", "bowling", "--json"]);
  const full = await assetCommand(["source", "search", "--query", "bowling", "--full", "--json"]);
  const compactRecord = (JSON.parse(compact.stdout) as { records: Array<Record<string, unknown>> }).records[0];
  const compactRecords = (JSON.parse(compact.stdout) as { records: Array<Record<string, unknown>> }).records;
  const fullRecord = (JSON.parse(full.stdout) as { records: Array<Record<string, unknown>> }).records[0];
  assert.equal(Object.keys(compactRecord ?? {}).length <= 8, true);
  assert.equal(compactRecords.length <= 10, true);
  assert.deepEqual(Object.keys(compactRecord ?? {}).sort(), ["direct", "format", "id", "license", "name", "note", "score"]);
  assert.equal(Object.keys(fullRecord ?? {}).length > 8, true);
});

catalogTest("should search typed material and texture source records by file role", async () => {
  const result = await assetCommand(["source", "search", "--file-role", "material-index", "--query", "poly haven", "--full", "--json"]);
  const payload = JSON.parse(result.stdout) as {
    records: Array<{ fileRole: string; id: string; isDirectDownload: boolean; sourceMetadata: Record<string, string> }>;
  };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.records.some((record) => record.id.startsWith("polyhaven-texture-")), true);
  assert.equal(payload.records.every((record) => record.fileRole === "material-index" && !record.isDirectDownload), true);
  assert.equal(payload.records.some((record) => record.sourceMetadata.polyhavenType === "texture"), true);

  const generated = await assetCommand(["source", "search", "--file-role", "material-index", "--query", "ambientcg", "--full", "--json"]);
  const generatedPayload = JSON.parse(generated.stdout) as {
    records: Array<{ downloadUrl: string | null; format: string; id: string; sourceMetadata: Record<string, string> }>;
  };

  assert.equal(generated.exitCode, 0);
  assert.equal(generatedPayload.records.some((record) => record.id.startsWith("ambientcg-") && record.format === "zip" && record.downloadUrl?.startsWith("https://ambientcg.com/get?file=")), true);
  assert.equal(generatedPayload.records.some((record) => record.sourceMetadata.ambientcgDataType === "Material" || record.sourceMetadata.ambientcgDataType === "Substance"), true);

  const curated = await assetCommand(["source", "get", "ambientcg-material-index", "--json"]);
  const curatedPayload = JSON.parse(curated.stdout) as {
    record: { id: string; sourceMetadata: Record<string, string> };
  };

  assert.equal(curated.exitCode, 0);
  assert.equal(curatedPayload.record.id, "ambientcg-material-index");
  assert.equal(curatedPayload.record.sourceMetadata.assetType, "material-texture");
});

catalogTest("should include fallback records when direct-only search has no match", async () => {
  const result = await assetCommand(["source", "search", "--game-category", "restaurant-cooking", "--format", "glb", "--direct-only", "--full", "--json"]);
  const payload = JSON.parse(result.stdout) as {
    code: string;
    fallbackRecords: Array<{ id: string; isDirectDownload: boolean; recommendedNextCommand: string }>;
    records: unknown[];
  };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_ASSET_SOURCE_NO_MATCH");
  assert.deepEqual(payload.records, []);
  assert.equal(payload.fallbackRecords.some((record) => record.id === "workflow-genre-specific-pack-shortlist-kaykit-restaurant-bits" && !record.isDirectDownload), true);
  assert.equal(payload.fallbackRecords.every((record) => /Review .*tn asset inspect/.test(record.recommendedNextCommand)), true);
});

catalogTest("should find curated bowling pack records by keyword and broad category", async () => {
  const keyword = await assetCommand(["source", "search", "--query", "bowling pins", "--full", "--json"]);
  const keywordPayload = JSON.parse(keyword.stdout) as {
    records: Array<{ id: string; isDirectDownload: boolean; licenseId: string }>;
  };

  assert.equal(keyword.exitCode, 0);
  assert.equal(keywordPayload.records.some((record) => record.id === "babylon-bowling-ball-glb" && record.isDirectDownload && record.licenseId === "CC-BY-4.0"), true);
  assert.equal(keywordPayload.records.some((record) => record.id === "babylon-bowling-pin-glb" && record.isDirectDownload && record.licenseId === "CC-BY-4.0"), true);
  assert.equal(keywordPayload.records.some((record) => record.id === "deplorablemountaineer-bowling-ball-pins-pack" && !record.isDirectDownload && record.licenseId === "CC0-1.0"), true);

  const category = await assetCommand(["source", "search", "--game-category", "sports", "--query", "bowling", "--json"]);
  const categoryPayload = JSON.parse(category.stdout) as {
    records: Array<{ id: string }>;
  };

  assert.equal(category.exitCode, 0);
  assert.equal(categoryPayload.records.some((record) => record.id === "deplorablemountaineer-bowling-ball-pins-pack"), true);
});

catalogTest("should only suggest records with lexical goal matches", async () => {
  const result = await assetCommand(["source", "suggest", "--goal", "bowling ball pins alley", "--json"]);
  const payload = JSON.parse(result.stdout) as { records: Array<{ id: string }> };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.records.some((record) => record.id === "babylon-bowling-ball-glb"), true);
  assert.equal(payload.records.some((record) => record.id === "babylon-bowling-pin-glb"), true);
  assert.equal(payload.records.some((record) => record.id === "babylon-grey-snapper-vert-color"), false);
});

catalogTest("should get one asset source record by id", async () => {
  const result = await assetCommand(["source", "get", "babylon-grey-snapper-vert-color", "--json"]);
  const payload = JSON.parse(result.stdout) as {
    record: {
      directName: string;
      downloadUrl: string;
      licenseId: string;
      origin: { originName: string; reviewEvidence: string; reviewStatus: string };
      provenanceUrl: string;
      sourceMetadata: Record<string, string>;
    };
  };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.record.directName, "greySnapper_vertColor");
  assert.match(payload.record.downloadUrl, /greySnapper_vertColor\.glb$/);
  assert.equal(payload.record.licenseId, "CC-BY-4.0");
  assert.match(payload.record.provenanceUrl, /Assets\.md/);
  assert.equal(payload.record.origin.originName, "BabylonJS Assets.md");
  assert.equal(payload.record.origin.reviewStatus, "reviewed");
  assert.match(payload.record.origin.reviewEvidence, /Assets\.md/);
  assert.equal(payload.record.sourceMetadata.upstreamRepository, "BabylonJS/Assets");
});

catalogTest("should not return blocked records unless requested", async () => {
  const result = await assetCommand(["source", "search", "--full", "--json"]);
  const payload = JSON.parse(result.stdout) as {
    records: Array<{ licensePosture: string; origin: { reviewStatus: string } }>;
  };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.records.some((record) => record.licensePosture === "blocked" || record.origin.reviewStatus === "blocked"), false);
});

catalogTest("should export jsonl from sqlite catalog", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-source-export-"));
  try {
    const out = join(root, "asset-sources.jsonl");
    const result = await assetCommand(["source", "export", "--format", "jsonl", "--out", out, "--json"]);
    const payload = JSON.parse(result.stdout) as { count: number; outPath: string };
    const summary = await readJsonlSummary(out);

    assert.equal(result.exitCode, 0);
    assert.equal(payload.outPath, out);
    assert.equal(payload.count, summary.count);
    assert.equal(summary.count >= 4, true);
    assert.equal(typeof summary.first.id, "string");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function readJsonlSummary(path: string): Promise<{ count: number; first: { id?: string } }> {
  const lines = createInterface({ crlfDelay: Infinity, input: createReadStream(path, { encoding: "utf8" }) });
  let count = 0;
  let first: { id?: string } = {};
  for await (const line of lines) {
    if (line.length === 0) {
      continue;
    }
    count += 1;
    if (count === 1) {
      first = JSON.parse(line) as { id?: string };
    }
  }
  return { count, first };
}

catalogTest("should suggest asset sources from a goal", async () => {
  const result = await assetCommand(["source", "suggest", "--goal", "underwater fish model", "--json"]);
  const payload = JSON.parse(result.stdout) as { records: Array<{ id: string }> };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.records.some((record) => record.id === "babylon-grey-snapper-vert-color"), true);
});

catalogTest("should resolve catalog from source checkout and packaged layout", async () => {
  const resolved = resolveAssetSourceCatalogPath();
  const found = await findAssetSourceCatalogPath();

  assert.match(resolved, /packages\/cli\/data\/asset-sources\.sqlite$/);
  assert.equal(found, resolved);

  const root = await mkdtemp(join(tmpdir(), "tn-asset-source-packaged-"));
  try {
    await mkdir(join(root, "dist", "assetSourceCatalog"), { recursive: true });
    await mkdir(join(root, "data"), { recursive: true });
    await writeFile(join(root, "dist", "assetSourceCatalog", "catalog.js"), "");
    await copyFile(found, join(root, "data", "asset-sources.sqlite"));
    const packagedUrl = pathToFileURL(join(root, "dist", "assetSourceCatalog", "catalog.js")).href;

    assert.equal(resolveAssetSourceCatalogPath(packagedUrl), join(root, "data", "asset-sources.sqlite"));
    assert.equal(await findAssetSourceCatalogPath(packagedUrl), join(root, "data", "asset-sources.sqlite"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject missing inspect path", async () => {
  const result = await assetCommand(["inspect", "--json"]);
  const payload = JSON.parse(result.stdout) as { code: string; severity: string };

  assert.equal(result.exitCode, 1);
  assert.equal(payload.code, "TN_ASSET_PATH_MISSING");
  assert.equal(payload.severity, "error");
});

async function writeImg2ThreejsProvenance(root: string, generatorId: string, outputHash?: string): Promise<void> {
  const sha = `sha256:${"a".repeat(64)}`;
  const provenance = {
    acceptedPasses: [{ evidence: [{ path: `artifacts/img2threejs/${generatorId}/review.png`, sha256: sha }], id: "blockout", reviewHash: sha }],
    budgets: { maxMaterials: 8, maxOutputBytes: 2_000_000, maxTextures: 8, maxTriangles: 20_000, timeoutMs: 10_000 },
    export: "createPropRadioModel",
    id: generatorId,
    inputHash: sha,
    module: "src/generators/createPropRadioModel.ts",
    outputs: [`assets/generated/${generatorId}.glb`],
    overwritePolicy: "replace",
    provider: "img2threejs",
    providerVersion: "1.2.0",
    recipe: `content/generators/${generatorId}.img2threejs.json`,
    schema: "threenative.generator-provenance",
    sculptSpec: `content/generators/${generatorId}.sculpt-spec.json`,
    sourceHashes: { factory: sha, recipe: sha, resources: [], sculptSpec: sha, sourceImage: sha, validationReport: sha },
    sourceImage: `content/references/${generatorId}.png`,
    upstream: { commit: "e8ff28a6ae0cb534c7b2ebc15cb3f06709262d5b", internalForkTree: "3f410de76c9a7ae53875abe7b47f99edf3beb2a6", repository: "https://github.com/hoainho/img2threejs", skillVersion: "1.2.0" },
    version: "0.1.0",
    ...(outputHash === undefined ? {} : { outputHash }),
  };
  await mkdir(join(root, "content/generators"), { recursive: true });
  await writeFile(join(root, `content/generators/${generatorId}.generator.json`), `${JSON.stringify(provenance, null, 2)}\n`);
}

function img2ThreejsAssetSentinelResult(projectPath: string, generatorId: string): IRunImg2ThreejsGeneratorResult {
  return {
    code: "TN_IMG2THREEJS_RUN_OK",
    diagnostics: [],
    filesWritten: [`assets/generated/${generatorId}.glb`, `content/assets/${generatorId}.assets.json`, `content/generators/${generatorId}.generator.json`],
    generatorId,
    inputHash: `sha256:${"a".repeat(64)}`,
    inspection: {
      bounds: { center: [0, 0, 0], max: [0.7, 0.41, 0.19], min: [-0.7, -0.41, -0.19], size: [1.4, 0.82, 0.38], source: "accessor-min-max" },
      code: "TN_ASSET_INSPECT_OK",
      counts: { accessors: 3, animations: 0, buffers: 1, images: 1, materials: 2, meshes: 2, nodes: 4, scenes: 1, textures: 1, triangles: 12 },
      diagnostics: [],
      file: { byteSize: 12, path: `assets/generated/${generatorId}.glb`, type: "glb" },
      message: "Asset inspection completed.",
    },
    message: `Generated and registered 'assets/generated/${generatorId}.glb'.`,
    ok: true,
    outputHash: `sha256:${"b".repeat(64)}`,
    projectPath,
    proofFiles: [`artifacts/img2threejs/${generatorId}/reload-proof/hash/source.png`],
    validation: { issues: { messages: [], numErrors: 0, numHints: 0, numInfos: 0, numWarnings: 0 } },
    visualMetrics: { meanNormalizedRgbDelta: 0, passed: true, silhouetteIou: 1, ssim: 1, thresholds: { meanNormalizedRgbDelta: 3 / 255, silhouetteIou: 0.995, ssim: 0.98 } },
  };
}

function withoutAssetGenerateEnvelope(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "code" && key !== "command" && key !== "recordedFiles"));
}

function makeGlb(json: unknown, binaryChunk?: Buffer): Buffer {
  const jsonText = JSON.stringify(json);
  const jsonBuffer = Buffer.from(jsonText.padEnd(jsonText.length + ((4 - (jsonText.length % 4)) % 4), " "), "utf8");
  const binPadding = binaryChunk === undefined ? 0 : ((4 - (binaryChunk.length % 4)) % 4);
  const paddedBinary = binaryChunk === undefined ? undefined : Buffer.concat([binaryChunk, Buffer.alloc(binPadding)]);
  const totalLength = 12 + 8 + jsonBuffer.length + (paddedBinary === undefined ? 0 : 8 + paddedBinary.length);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  header.writeUInt32LE(jsonBuffer.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  if (paddedBinary === undefined) {
    return Buffer.concat([header, jsonBuffer]);
  }
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(paddedBinary.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonBuffer, binHeader, paddedBinary]);
}

function makeStoredZip(files: Array<{ bytes: Buffer; name: string }>): Buffer {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name); const local = Buffer.alloc(30); const crc = assetTestCrc32(file.bytes);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt32LE(crc, 14); local.writeUInt32LE(file.bytes.length, 18); local.writeUInt32LE(file.bytes.length, 22); local.writeUInt16LE(name.length, 26);
    locals.push(local, name, file.bytes);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt32LE(crc, 16); central.writeUInt32LE(file.bytes.length, 20); central.writeUInt32LE(file.bytes.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    centrals.push(central, name); offset += local.length + name.length + file.bytes.length;
  }
  const directory = Buffer.concat(centrals); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

function assetTestCrc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }

function makeRoadGlb(kind: "corner" | "straight"): Buffer {
  const grass = [[0, 0, -2], [2, 0, -2], [2, 0, 0], [0, 0, 0]];
  const road = kind === "straight"
    ? [[0.65, 0.01, -2], [1.35, 0.01, -2], [1.35, 0.01, 0], [0.65, 0.01, 0]]
    : [[0.65, 0.01, -1.35], [2, 0.01, -1.35], [2, 0.01, 0], [0.65, 0.01, 0]];
  const roadMin = kind === "straight" ? [0.65, 0.01, -2] : [0.65, 0.01, -1.35];
  const roadMax = kind === "straight" ? [1.35, 0.01, 0] : [2, 0.01, 0];
  const grassBytes = positionsBuffer(grass);
  const roadBytes = positionsBuffer(road);
  const indexBytes = indicesBuffer([0, 1, 2, 0, 2, 3]);
  const roadOffset = grassBytes.length;
  const grassIndexOffset = roadOffset + roadBytes.length;
  const roadIndexOffset = grassIndexOffset + indexBytes.length;
  const binary = Buffer.concat([grassBytes, roadBytes, indexBytes, indexBytes]);
  return makeGlb({
    asset: { version: "2.0", generator: "asset-road-connectors-test" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: [-0.35, -0.01, -0.65] }],
    meshes: [{
      primitives: [
        { attributes: { POSITION: 0 }, indices: 2, material: 0, mode: 4 },
        { attributes: { POSITION: 1 }, indices: 3, material: 1, mode: 4 },
      ],
    }],
    materials: [{ name: "grass" }, { name: "road" }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: grassBytes.length },
      { buffer: 0, byteOffset: roadOffset, byteLength: roadBytes.length },
      { buffer: 0, byteOffset: grassIndexOffset, byteLength: indexBytes.length },
      { buffer: 0, byteOffset: roadIndexOffset, byteLength: indexBytes.length },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: "VEC3", min: [0, 0, -2], max: [2, 0, 0] },
      { bufferView: 1, componentType: 5126, count: 4, type: "VEC3", min: roadMin, max: roadMax },
      { bufferView: 2, componentType: 5123, count: 6, type: "SCALAR" },
      { bufferView: 3, componentType: 5123, count: 6, type: "SCALAR" },
    ],
  }, binary);
}

function positionsBuffer(positions: number[][]): Buffer {
  const buffer = Buffer.alloc(positions.length * 12);
  positions.forEach((position, index) => {
    buffer.writeFloatLE(position[0] ?? 0, index * 12);
    buffer.writeFloatLE(position[1] ?? 0, index * 12 + 4);
    buffer.writeFloatLE(position[2] ?? 0, index * 12 + 8);
  });
  return buffer;
}

function indicesBuffer(indices: number[]): Buffer {
  const buffer = Buffer.alloc(indices.length * 2);
  indices.forEach((index, offset) => buffer.writeUInt16LE(index, offset * 2));
  return buffer;
}

function restoreInitCwd(previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env.INIT_CWD;
  } else {
    process.env.INIT_CWD = previous;
  }
}
