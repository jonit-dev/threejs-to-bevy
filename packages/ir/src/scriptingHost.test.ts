import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { PROMOTED_SCRIPT_SERVICES, SCRIPT_HOST_SERVICE_MATRIX } from "./scriptingHost.js";

const repoRoot = resolve(process.cwd(), "../..");

test("scripting host matrix should be sorted and unique", () => {
  const services = [...PROMOTED_SCRIPT_SERVICES];
  assert.deepEqual(services, [...new Set(services)]);
  assert.deepEqual(services, [...services].sort());
  assert.equal(SCRIPT_HOST_SERVICE_MATRIX.every((entry) => entry.web === "implemented" && entry.bevy === "implemented"), true);
});

test("scripting host matrix should match SDK IR web Bevy and docs surfaces", async () => {
  const services = [...PROMOTED_SCRIPT_SERVICES].sort();
  const [sdkSystem, irSystems, webContext, bevyMatrix, docsMatrix] = await Promise.all([
    readRepo("packages/sdk/src/ecs/system.ts"),
    readRepo("packages/ir/src/systems.ts"),
    readRepo("packages/runtime-web-three/src/systems/context.ts"),
    readRepo("runtime-bevy/crates/threenative_runtime/src/scripting_host_matrix.rs"),
    readRepo("docs/contracts/scripting-host-matrix.md"),
  ]);

  assert.deepEqual(extractTypeUnion(sdkSystem, "SystemService"), services);
  assert.deepEqual(extractTypeUnion(irSystems, "IrSystemService"), services);
  assert.deepEqual(extractQueuedWebServices(webContext), services);
  assert.deepEqual(extractRustServices(bevyMatrix), services);
  for (const service of services) {
    assert.match(docsMatrix, new RegExp(`\\| \`${escapeRegExp(service)}\` \\|`), `docs matrix should document ${service}`);
  }
});

function readRepo(path: string): Promise<string> {
  return readFile(resolve(repoRoot, path), "utf8");
}

function extractTypeUnion(source: string, typeName: string): string[] {
  const pattern = new RegExp(`export type ${typeName} =([\\s\\S]*?);`);
  const body = pattern.exec(source)?.[1] ?? "";
  return extractServices(body);
}

function extractQueuedWebServices(source: string): string[] {
  const body = /export interface IQueuedServiceCall \{[\s\S]*?service:([\s\S]*?);[\s\S]*?\}/.exec(source)?.[1] ?? "";
  return extractServices(body);
}

function extractRustServices(source: string): string[] {
  return extractServices(source);
}

function extractServices(source: string): string[] {
  return [...new Set([...source.matchAll(/"([a-z]+\.[A-Za-z][A-Za-z0-9]*)"/g)].map((match) => match[1] ?? ""))].sort();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
