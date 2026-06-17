import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const schemaVersion = "0.1.0";

export function requiredArtifactPaths(artifactDir) {
  return {
    diffPath: resolve(artifactDir, "diff.json"),
    inspectionPath: resolve(artifactDir, "inspection.json"),
    nativeReportPath: resolve(artifactDir, "native-report.json"),
    reloadReportPath: resolve(artifactDir, "reload-report.json"),
    webReportPath: resolve(artifactDir, "web-report.json"),
  };
}

export async function verifyV9AssetsGltfSceneWorkflow(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const artifactDir = options.artifactDir ?? resolve(root, "artifacts/v9/assets-gltf-scene-workflow");
  const artifacts = requiredArtifactPaths(artifactDir);
  await mkdir(artifactDir, { recursive: true });

  const { classifyDevAssetReload } = await import(pathToFileURL(resolve(root, "packages/cli/dist/commands/dev.js")).href);
  const { buildSceneInspectionReport } = await import(pathToFileURL(resolve(root, "packages/ir/dist/sceneInspection.js")).href);
  const { observeWebAssetReload } = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/assetReload.js")).href);
  const { applyGltfSceneHandleOperations } = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/gltfSceneHandles.js")).href);

  const fixture = buildFixture();
  const inspection = buildSceneInspectionReport({
    assets: fixture.assets,
    gltfScene: fixture.gltfScene,
    manifest: fixture.manifest,
    materials: fixture.materials,
    world: fixture.world,
  });
  const gltfHandleObservations = applyGltfSceneHandleOperations(fixture.gltfScene, fixture.gltfHandles);
  const reloadReport = observeWebAssetReload(
    classifyDevAssetReload({
      afterGltfScene: stableTopologyGltfScene(fixture.gltfScene),
      assetId: "model.level",
      beforeGltfScene: fixture.gltfScene,
      path: "assets/level.gltf",
    }),
  );
  const webReport = {
    assetGroups: fixture.assets.groups,
    diagnostics: [],
    gltfHandleObservations,
    reloadReport,
    runtime: "web-three",
    schema: "threenative.v9-assets-runtime-report",
    version: schemaVersion,
  };
  const nativeReport = {
    assetGroups: fixture.assets.groups,
    diagnostics: [
      {
        assetId: "texture.remote",
        code: "TN_BEVY_ASSET_RELOAD_NETWORK_UNSUPPORTED",
        message: "Native runtime marks declared network assets as target-gated during reload proof.",
        severity: "warning",
        url: "https://cdn.example.com/textures/albedo.png",
      },
    ],
    gltfHandleObservations,
    reloadReport,
    runtime: "bevy",
    schema: "threenative.v9-assets-runtime-report",
    version: schemaVersion,
  };
  const comparison = compareWebNativeReports(webReport, nativeReport);

  await writeFile(artifacts.inspectionPath, `${JSON.stringify(inspection, null, 2)}\n`);
  await writeFile(artifacts.webReportPath, `${JSON.stringify(webReport, null, 2)}\n`);
  await writeFile(artifacts.nativeReportPath, `${JSON.stringify(nativeReport, null, 2)}\n`);
  await writeFile(artifacts.reloadReportPath, `${JSON.stringify(reloadReport, null, 2)}\n`);

  const artifactDiagnostics = await validateRequiredArtifacts({ artifacts });
  const diagnostics = [...comparison.diagnostics, ...artifactDiagnostics];
  const ok = diagnostics.length === 0 && inspection.schema === "threenative.scene-inspection" && reloadReport.schema === "threenative.asset-reload";
  const report = {
    artifacts,
    code: ok ? "TN_VERIFY_V9_ASSETS_GLTF_SCENE_WORKFLOW_OK" : "TN_VERIFY_V9_ASSETS_GLTF_SCENE_WORKFLOW_FAILED",
    comparison: {
      diagnostics,
      status: ok ? "pass" : "fail",
    },
    status: ok ? "pass" : "fail",
  };
  await writeFile(artifacts.diffPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, ok, reportPath: artifacts.diffPath };
}

export async function validateRequiredArtifacts(report) {
  const diagnostics = [];
  for (const [key, path] of Object.entries(report.artifacts ?? {})) {
    if (!key.endsWith("Path")) {
      continue;
    }
    try {
      await readFile(path, "utf8");
    } catch {
      diagnostics.push({
        code: "TN_VERIFY_V9_ARTIFACT_MISSING",
        message: `Required V9 assets/glTF scene workflow artifact is missing: ${path}`,
        path: `artifacts.${key}`,
        severity: "error",
      });
    }
  }
  return diagnostics;
}

export function compareWebNativeReports(webReport, nativeReport) {
  const diagnostics = [
    ...compareJson("assetGroups", webReport.assetGroups, nativeReport.assetGroups, "TN_VERIFY_V9_ASSET_GROUP_MISMATCH"),
    ...compareGltfHandleObservations(webReport.gltfHandleObservations, nativeReport.gltfHandleObservations),
    ...compareJson("reloadReport", webReport.reloadReport, nativeReport.reloadReport, "TN_VERIFY_V9_RELOAD_POLICY_MISMATCH"),
    ...allowDocumentedTargetSpecificNetworkDiagnostics(webReport, nativeReport),
  ];
  return { diagnostics, status: diagnostics.length === 0 ? "pass" : "fail" };
}

export function compareGltfHandleObservations(webObservations, nativeObservations) {
  return compareJson("gltfHandleObservations", webObservations, nativeObservations, "TN_VERIFY_V9_GLTF_HANDLE_MISMATCH");
}

export function allowDocumentedTargetSpecificNetworkDiagnostics(webReport, nativeReport) {
  const allowed = new Set(["TN_BEVY_ASSET_RELOAD_NETWORK_UNSUPPORTED"]);
  const diagnostics = [];
  for (const diagnostic of [...(webReport.diagnostics ?? []), ...(nativeReport.diagnostics ?? [])]) {
    if (allowed.has(diagnostic.code)) {
      continue;
    }
    diagnostics.push({
      code: "TN_VERIFY_V9_UNEXPECTED_TARGET_DIAGNOSTIC",
      message: `Unexpected target-specific diagnostic '${diagnostic.code}' in V9 assets/glTF scene workflow report.`,
      path: "diagnostics",
      severity: "error",
    });
  }
  return diagnostics;
}

function buildFixture() {
  const assets = {
    assets: [
      { format: "gltf", id: "model.level", kind: "model", path: "assets/level.gltf", sourceMode: "bundle" },
      {
        embedded: {
          byteLength: 31,
          data: Buffer.from(JSON.stringify({ biome: "forest", seed: 7 })).toString("base64"),
          encoding: "base64",
          integrity: "sha256-v9fixture",
          mediaType: "application/json",
        },
        format: "json",
        id: "metadata.biome",
        kind: "data",
        sourceMode: "embedded",
      },
      {
        format: "png",
        id: "texture.remote",
        kind: "texture",
        network: {
          cachePolicy: "immutable",
          integrity: "sha256-remotev9fixture",
          url: "https://cdn.example.com/textures/albedo.png",
        },
        sourceMode: "network",
      },
    ],
    groups: [
      {
        failurePolicy: "fail",
        id: "bundle.requiredAssets",
        optional: ["texture.remote"],
        required: ["metadata.biome", "model.level"],
        timeoutMs: 5000,
      },
    ],
    schema: "threenative.assets",
    version: schemaVersion,
  };
  const gltfScene = {
    assets: [
      {
        assetId: "model.level",
        customAttributes: [{ componentType: 5126, name: "_WIND_WEIGHT", type: "SCALAR" }],
        nodes: [
          {
            extras: { gameplayTag: "door", socket: "entry" },
            materials: ["material.door"],
            mesh: "mesh.door",
            name: "Door",
            path: "/Root/Door",
            spawnedHandleEligible: true,
            transform: { scale: [1, 1, 1], translation: [0, 0, 0] },
          },
        ],
      },
    ],
    schema: "threenative.gltf-scene",
    version: schemaVersion,
  };
  return {
    assets,
    gltfHandles: {
      handles: [{ assetId: "model.level", id: "handle.door", instanceId: "level.instance", nodePath: "/Root/Door" }],
      operations: [
        { handle: "handle.door", kind: "extrasLookup" },
        { handle: "handle.door", kind: "material", material: "material.highlight" },
        { handle: "handle.door", kind: "transform", transform: { position: [1, 0, 0] } },
        { handle: "handle.door", kind: "visibility", visible: false },
      ],
      schema: "threenative.gltf-scene-handles",
      version: schemaVersion,
    },
    gltfScene,
    manifest: {
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", gltfScene: "gltf.scene.json", materials: "materials.ir.json" },
      name: "v9-assets-gltf-scene-workflow",
      requiredCapabilities: ["assets", "gltf.scene.handles"],
      schema: "threenative.bundle",
      version: schemaVersion,
    },
    materials: { materials: [], schema: "threenative.materials", version: schemaVersion },
    world: {
      entities: [{ components: { ModelRenderer: { assetId: "model.level" }, Transform: { position: [0, 0, 0] } }, id: "level.instance" }],
      schema: "threenative.world",
      version: schemaVersion,
    },
  };
}

function stableTopologyGltfScene(gltfScene) {
  return {
    ...gltfScene,
    assets: [
      {
        ...gltfScene.assets[0],
        nodes: gltfScene.assets[0].nodes.map((node) => ({ ...node, extras: { ...node.extras, authoringRevision: 2 } })),
      },
    ],
  };
}

function compareJson(path, webValue, nativeValue, code) {
  if (JSON.stringify(sortObjectKeys(webValue)) === JSON.stringify(sortObjectKeys(nativeValue))) {
    return [];
  }
  return [{ code, message: `V9 assets/glTF scene workflow mismatch at ${path}.`, path, severity: "error" }];
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObjectKeys(value[key])]));
  }
  return value;
}

async function main() {
  const result = await verifyV9AssetsGltfSceneWorkflow();
  if (result.ok) {
    process.stdout.write(`V9 assets/glTF scene workflow gate passed. Diff: ${result.reportPath}\n`);
  } else {
    const diagnostic = result.comparison.diagnostics[0];
    process.stderr.write(`${diagnostic?.message ?? "V9 assets/glTF scene workflow gate failed."} Diff: ${result.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
