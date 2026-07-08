import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  compareRequiredFields,
  requiredFieldsFromJsonSchema,
  requiredFieldsFromRustStruct,
  requiredFieldsFromTypeScriptInterface,
} from "./contractDrift.js";
import { IR_DOCUMENTS, IR_SCHEMA_IDS, IR_VERSION, schemaBackedDocuments } from "./documents.js";
import { schemaUrls } from "./schemas.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const loaderTypesPath = resolve(repoRoot, "runtime-bevy/crates/threenative_loader/src/types.rs");
const schemaBackedTypeScriptCases = [
  { document: "manifest", interfaceName: "IBundleManifest", schema: "manifest.schema.json", source: "src/types.ts" },
  { document: "world", interfaceName: "IWorldIr", schema: "world.schema.json", source: "src/types.ts" },
  { document: "materials", interfaceName: "IMaterialsIr", schema: "materials.schema.json", source: "src/types.ts" },
  { document: "assets", interfaceName: "IAssetsManifest", schema: "assets.schema.json", source: "src/types.ts" },
  { document: "targetProfile", interfaceName: "ITargetProfile", schema: "target-profile.schema.json", source: "src/types.ts" },
  { document: "input", interfaceName: "IInputIr", schema: "input.schema.json", source: "src/input.ts" },
  { document: "runtimeConfig", interfaceName: "IRuntimeConfigIr", schema: "runtime-config.schema.json", source: "src/runtimeConfig.ts" },
  { document: "overlays", interfaceName: "IOverlaysIr", schema: "overlays.schema.json", source: "src/overlays.ts" },
  { document: "scenes", interfaceName: "IScenesIr", schema: "scenes.schema.json", source: "src/types.ts" },
];
const bevyRuntimeDocumentCases = [
  { document: "manifest", schema: "manifest.schema.json", structName: "BundleManifest" },
  { document: "world", schema: "world.schema.json", structName: "WorldIr" },
  { document: "materials", schema: "materials.schema.json", structName: "MaterialsIr" },
  { document: "assets", schema: "assets.schema.json", structName: "AssetsManifest" },
  { document: "targetProfile", schema: "target-profile.schema.json", structName: "TargetProfile" },
  { document: "input", schema: "input.schema.json", structName: "InputIr" },
  { document: "runtimeConfig", schema: "runtime-config.schema.json", structName: "RuntimeConfigIr" },
  { document: "overlays", schema: "overlays.schema.json", structName: "OverlaysIr" },
  { document: "scenes", schema: "scenes.schema.json", structName: "ScenesIr" },
];

test("contractDrift should list every registered IR document when checking contract drift", async () => {
  const expectedDocuments = [
    "manifest",
    "world",
    "materials",
    "assets",
    "targetProfile",
    "input",
    "runtimeConfig",
    "ui",
    "overlays",
    "scenes",
    "systems",
    "animations",
    "audio",
    "environmentScene",
    "gameFlow",
    "localData",
    "gltfScene",
    "prefabs",
    "componentSchemas",
    "resourceSchemas",
    "eventSchemas",
    "scripts",
    "sequences",
  ];
  assert.deepEqual(Object.keys(IR_DOCUMENTS).sort(), expectedDocuments.sort());

  assertManifestDocument("entry", "world", "world.ir.json");
  assertManifestDocument("entry", "animations", "animations.ir.json");
  assertManifestDocument("entry", "audio", "audio.ir.json");
  assertManifestDocument("entry", "environmentScene", "environment.scene.json");
  assertManifestDocument("entry", "gameFlow", "game-flow.ir.json");
  assertManifestDocument("entry", "localData", "local-data.ir.json");
  assertManifestDocument("entry", "overlays", "overlays.ir.json");
  assertManifestDocument("entry", "prefabs", "prefabs.ir.json");
  assertManifestDocument("entry", "scenes", "scenes.ir.json");
  assertManifestDocument("entry", "sequences", "sequences.ir.json");
  assertManifestDocument("entry", "scripts", "scripts.bundle.js");
  assertManifestDocument("entry", "systems", "systems.ir.json");
  assertManifestDocument("entry", "ui", "ui.ir.json");
  assertManifestDocument("files", "animations", "animations.ir.json");
  assertManifestDocument("files", "assets", "assets.manifest.json");
  assertManifestDocument("files", "componentSchemas", "schemas/components.schema.json");
  assertManifestDocument("files", "eventSchemas", "schemas/events.schema.json");
  assertManifestDocument("files", "gltfScene", "gltf.scene.json");
  assertManifestDocument("files", "input", "input.ir.json");
  assertManifestDocument("files", "localData", "local-data.ir.json");
  assertManifestDocument("files", "materials", "materials.ir.json");
  assertManifestDocument("files", "prefabs", "prefabs.ir.json");
  assertManifestDocument("files", "resourceSchemas", "schemas/resources.schema.json");
  assertManifestDocument("files", "runtimeConfig", "runtime.config.json");
  assertManifestDocument("files", "scripts", "scripts.bundle.js");
  assertManifestDocument("files", "targetProfile", "target.profile.json");
});

test("contractDrift should register schema urls only for schema-backed documents", () => {
  assert.deepEqual(Object.keys(schemaUrls).sort(), schemaBackedDocuments().map(([name]) => name).sort());
});

test("contractDrift should keep schema literals aligned with document metadata", async () => {
  const diagnostics: string[] = [];
  for (const [document, metadata] of schemaBackedDocuments()) {
    const constants = await readSchemaConstants(resolve(packageRoot, "schemas", metadata.schemaFile));
    if (constants.schema !== metadata.schema) {
      diagnostics.push(`${document}: schema const ${constants.schema ?? "<missing>"} does not match ${metadata.schema}.`);
    }
    if (constants.version !== IR_VERSION) {
      diagnostics.push(`${document}: version const ${constants.version ?? "<missing>"} does not match ${IR_VERSION}.`);
    }
  }

  assert.deepEqual(diagnostics, []);
  assert.equal(IR_SCHEMA_IDS.world, "threenative.world");
});

test("contractDrift should keep runtime config antialias aligned across schema TypeScript and Rust", async () => {
  const schema = await readJson<{ properties: { renderer: { required?: string[] } } }>(
    resolve(packageRoot, "schemas/runtime-config.schema.json"),
  );
  const runtimeConfigTypes = await readFile(resolve(packageRoot, "src/runtimeConfig.ts"), "utf8");
  const loaderTypes = await readFile(loaderTypesPath, "utf8");

  assert.deepEqual(schema.properties.renderer.required, ["antialias"]);
  assert.match(runtimeConfigTypes, /RendererAntialiasMode = "none" \| "msaa2" \| "msaa4" \| "msaa8" \| "fxaa" \| "taa" \| "smaa";/);
  assert.match(runtimeConfigTypes, /antialias:\s*RendererAntialiasMode;/);
  assert.match(runtimeConfigTypes, /colorGrading\?:/);
  assert.match(runtimeConfigTypes, /renderPath\?: "forward";/);
  assert.match(loaderTypes, /pub antialias: String,/);
  assert.match(loaderTypes, /pub color_grading: Option<RuntimeRendererColorGradingConfig>,/);
  assert.match(loaderTypes, /pub render_path: Option<String>,/);
  assert.doesNotMatch(loaderTypes, /pub antialias: Option<String>,/);
});

test("contractDrift should keep target profile target enum aligned", async () => {
  const schema = await readJson<{ properties: { targets: { items: { enum: string[] } } } }>(
    resolve(packageRoot, "schemas/target-profile.schema.json"),
  );
  const types = await readFile(resolve(packageRoot, "src/types.ts"), "utf8");
  const match = types.match(/targets:\s*Array<([^>]+)>;/);
  const targetUnion = match?.[1];

  assert.ok(targetUnion, "ITargetProfile.targets union should be inspectable");
  const targetLiterals = [...targetUnion.matchAll(/"([^"]+)"/g)].map((item) => item[1]).sort();

  assert.deepEqual(schema.properties.targets.items.enum.sort(), ["desktop", "web"]);
  assert.deepEqual(targetLiterals, schema.properties.targets.items.enum.sort());
});

test("contractDrift should keep world component extension point explicit across schema TypeScript and Rust", async () => {
  const schema = await readJson<{
    properties: {
      entities: {
        items: {
          properties: { components: { type: string } };
          required?: string[];
        };
      };
    };
  }>(resolve(packageRoot, "schemas/world.schema.json"));
  const worldTypes = await readFile(resolve(packageRoot, "src/types.ts"), "utf8");
  const loaderTypes = await readFile(loaderTypesPath, "utf8");

  assert.deepEqual(schema.properties.entities.items.required, ["id", "components"]);
  assert.equal(schema.properties.entities.items.properties.components.type, "object");
  assert.match(worldTypes, /components: Record<string, unknown> & \{/);
  assert.match(loaderTypes, /#\[serde\(flatten\)\]\s+pub extra: HashMap<String, serde_json::Value>,/);
});

test("contractDrift should keep schema backed document required fields aligned with TypeScript interfaces", async () => {
  const diagnostics = [];

  for (const item of schemaBackedTypeScriptCases) {
    const schemaPath = resolve(packageRoot, "schemas", item.schema);
    const tsPath = resolve(packageRoot, item.source);
    diagnostics.push(
      ...compareRequiredFields({
        actual: requiredFieldsFromTypeScriptInterface(await readFile(tsPath, "utf8"), item.interfaceName, item.source),
        document: item.document,
        expected: requiredFieldsFromJsonSchema(await readJson(schemaPath), item.schema),
        representation: "TypeScript interface",
      }),
    );
  }

  assert.deepEqual(diagnostics, []);
});

test("contractDrift should keep Bevy loader required fields aligned for runtime consumed documents", async () => {
  const loaderPath = loaderTypesPath;
  const loaderTypes = await readFile(loaderPath, "utf8");
  const diagnostics = [];

  for (const item of bevyRuntimeDocumentCases) {
    diagnostics.push(
      ...compareRequiredFields({
        actual: requiredFieldsFromRustStruct(loaderTypes, item.structName, "runtime-bevy/crates/threenative_loader/src/types.rs"),
        document: item.document,
        expected: requiredFieldsFromJsonSchema(await readJson(resolve(packageRoot, "schemas", item.schema)), item.schema),
        representation: "Bevy loader struct",
      }),
    );
  }

  assert.deepEqual(diagnostics, []);
});

test("contractDrift should fail with a document path when a schema backed field is missing from an inspected surface", () => {
  const diagnostics = compareRequiredFields({
    actual: { fields: new Set(["schema", "version"]), source: "fixture/types.ts" },
    document: "fixtureDoc",
    expected: { fields: new Set(["schema", "version", "entities"]), source: "fixture.schema.json" },
    representation: "TypeScript interface",
  });

  assert.equal(diagnostics[0]?.document, "fixtureDoc");
  assert.equal(diagnostics[0]?.field, "entities");
  assert.equal(diagnostics[0]?.representation, "TypeScript interface");
  assert.match(diagnostics[0]?.message ?? "", /fixtureDoc.*entities.*fixture\.schema\.json/);
});

test("contractDrift should fail with a document path when an inspected surface adds a required field outside schema", () => {
  const diagnostics = compareRequiredFields({
    actual: { fields: new Set(["schema", "version", "entities", "runtimeOnly"]), source: "fixture/types.ts" },
    document: "fixtureDoc",
    expected: { fields: new Set(["schema", "version", "entities"]), source: "fixture.schema.json" },
    representation: "TypeScript interface",
  });

  assert.equal(diagnostics[0]?.document, "fixtureDoc");
  assert.equal(diagnostics[0]?.field, "runtimeOnly");
  assert.equal(diagnostics[0]?.representation, "TypeScript interface");
  assert.match(diagnostics[0]?.message ?? "", /fixtureDoc.*requires field 'runtimeOnly'.*fixture\.schema\.json/);
});

test("contractDrift should reject unchecked support checklist drift when claimed in status", async () => {
  const status = await readFile(resolve(repoRoot, "docs/STATUS.md"), "utf8");
  const parity = await readFile(resolve(repoRoot, "docs/bevy-feature-parity.md"), "utf8");
  const irTypes = await readFile(resolve(packageRoot, "src/types.ts"), "utf8");
  const webMetrics = await readFile(resolve(repoRoot, "packages/runtime-web-three/src/performanceMetrics.ts"), "utf8");
  const nativeConformance = await readFile(resolve(repoRoot, "runtime-bevy/crates/threenative_runtime/src/conformance.rs"), "utf8");
  const claimedStatus = `${status}\nV9-06 target profiles`;

  assert.equal(rejectSupportDrift({ irTypes, nativeConformance, parity, status: claimedStatus, webMetrics }), undefined);
  assert.equal(
    rejectSupportDrift({
      irTypes,
      nativeConformance,
      parity: parity.replace("- [x] `P1` Broader platform target profiles and repair hints", "- [ ] `P1` Broader platform target profiles and repair hints"),
      status: claimedStatus,
      webMetrics,
    })?.code,
    "TN_CONTRACT_DRIFT_V9_SUPPORT_CHECKLIST_UNCHECKED",
  );
});

function rejectSupportDrift(input: { irTypes: string; nativeConformance: string; parity: string; status: string; webMetrics: string }): { code: string } | undefined {
  if (!input.status.includes("V9-06 target profiles")) {
    return undefined;
  }
  if (!input.parity.includes("- [x] `P1` Broader platform target profiles and repair hints")) {
    return { code: "TN_CONTRACT_DRIFT_V9_SUPPORT_CHECKLIST_UNCHECKED" };
  }
  if (!input.parity.includes("- [x] `P1` Large-scene stress-test fixtures for UI, text, lights, cubes, and animated models")) {
    return { code: "TN_CONTRACT_DRIFT_V9_SUPPORT_CHECKLIST_UNCHECKED" };
  }
  if (!input.irTypes.includes("ISupportTargetProfile") || !input.irTypes.includes("ISupportProfilerMetadata")) {
    return { code: "TN_CONTRACT_DRIFT_V9_SUPPORT_IR_MISSING" };
  }
  if (!input.webMetrics.includes("audioVoiceCount") || !input.webMetrics.includes("uiNodeCount")) {
    return { code: "TN_CONTRACT_DRIFT_V9_SUPPORT_WEB_METRICS_MISSING" };
  }
  if (!input.nativeConformance.includes("ConformanceProfilerReport") || !input.nativeConformance.includes("TN_PROFILER_GPU_TIMING_UNAVAILABLE")) {
    return { code: "TN_CONTRACT_DRIFT_V9_SUPPORT_NATIVE_PROFILER_MISSING" };
  }
  return undefined;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readSchemaConstants(path: string): Promise<{ schema?: string; version?: string }> {
  const schema = await readJson<{
    properties?: {
      schema?: { const?: unknown };
      version?: { const?: unknown };
    };
  }>(path);
  return {
    schema: typeof schema.properties?.schema?.const === "string" ? schema.properties.schema.const : undefined,
    version: typeof schema.properties?.version?.const === "string" ? schema.properties.version.const : undefined,
  };
}

function assertManifestDocument(section: "entry" | "files", key: string, fileName: string): void {
  const match = Object.values(IR_DOCUMENTS).find((document) => {
    if (document.fileName !== fileName) {
      return false;
    }
    if ("manifestSection" in document) {
      return document.manifestSection === section && document.manifestKey === key;
    }
    if ("manifestLocations" in document) {
      return document.manifestLocations.some((location) => location.section === section && location.key === key);
    }
    return false;
  });
  assert.ok(match, `Missing IR document metadata for manifest.${section}.${key} -> ${fileName}`);
}
