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
  assert.match(loaderTypes, /pub antialias: String,/);
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

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}
