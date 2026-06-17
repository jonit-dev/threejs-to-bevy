import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const packageRoot = process.cwd();
const repoRoot = resolve(packageRoot, "../..");

test("runtime renderer antialias requiredness should not drift across schema, TypeScript, and Rust", async () => {
  const schema = await readJson<{ properties: { renderer: { required?: string[] } } }>(
    resolve(packageRoot, "schemas/runtime-config.schema.json"),
  );
  const runtimeConfigTypes = await readFile(resolve(packageRoot, "src/runtimeConfig.ts"), "utf8");
  const loaderTypes = await readFile(resolve(repoRoot, "runtime-bevy/crates/threenative_loader/src/lib.rs"), "utf8");

  assert.deepEqual(schema.properties.renderer.required, ["antialias"]);
  assert.match(runtimeConfigTypes, /antialias:\s*"none" \| "msaa2" \| "msaa4" \| "msaa8";/);
  assert.match(runtimeConfigTypes, /colorGrading\?:/);
  assert.match(runtimeConfigTypes, /renderPath\?: "forward";/);
  assert.match(loaderTypes, /pub antialias: String,/);
  assert.match(loaderTypes, /pub color_grading: Option<RuntimeRendererColorGradingConfig>,/);
  assert.match(loaderTypes, /pub render_path: Option<String>,/);
  assert.doesNotMatch(loaderTypes, /pub antialias: Option<String>,/);
});

test("world component extension point should remain explicit across schema, TypeScript, and Rust", async () => {
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
  const loaderTypes = await readFile(resolve(repoRoot, "runtime-bevy/crates/threenative_loader/src/lib.rs"), "utf8");

  assert.deepEqual(schema.properties.entities.items.required, ["id", "components"]);
  assert.equal(schema.properties.entities.items.properties.components.type, "object");
  assert.match(worldTypes, /components: Record<string, unknown> & \{/);
  assert.match(loaderTypes, /#\[serde\(flatten\)\]\s+pub extra: HashMap<String, serde_json::Value>,/);
});

test("should reject unchecked support checklist drift when claimed in status", async () => {
  const status = await readFile(resolve(repoRoot, "docs/STATUS.md"), "utf8");
  const parity = await readFile(resolve(repoRoot, "docs/bevy-feature-parity.md"), "utf8");
  const irTypes = await readFile(resolve(packageRoot, "src/types.ts"), "utf8");
  const webMetrics = await readFile(resolve(repoRoot, "packages/runtime-web-three/src/performanceMetrics.ts"), "utf8");
  const nativeConformance = await readFile(resolve(repoRoot, "runtime-bevy/crates/threenative_runtime/src/conformance.rs"), "utf8");

  assert.equal(rejectSupportDrift({ irTypes, nativeConformance, parity, status, webMetrics }), undefined);
  assert.equal(
    rejectSupportDrift({
      irTypes,
      nativeConformance,
      parity: parity.replace("- [x] `P1` Broader platform target profiles and repair hints", "- [ ] `P1` Broader platform target profiles and repair hints"),
      status,
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
