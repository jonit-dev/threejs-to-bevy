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

test("script service extractors should preserve nested service identifiers", () => {
  assert.deepEqual(extractServices('"physics.raycast" | "physics.vehicle.setInputs"'), ["physics.raycast", "physics.vehicle.setInputs"]);
  assert.deepEqual(extractNativeServiceEffects('service: "physics.vehicle.setInputs"'), ["physics.vehicle.setInputs"]);
});

test("scripting host matrix should match SDK IR web Bevy and docs surfaces", async () => {
  const services = [...PROMOTED_SCRIPT_SERVICES].sort();
  const [sdkSystem, irSystems, webContext, bevyBridge, docsMatrix] = await Promise.all([
    readRepo("packages/sdk/src/ecs/system.ts"),
    readRepo("packages/ir/src/systems.ts"),
    readRepo("packages/runtime-web-three/src/systems/contextTypes.ts"),
    readRepo("runtime-bevy/crates/threenative_runtime/src/systems_host_bridge.js"),
    readRepo("docs/contracts/scripting-host-matrix.md"),
  ]);

  assert.deepEqual(extractTypeUnion(sdkSystem, "SystemService"), services);
  assert.deepEqual(extractTypeUnion(irSystems, "IrSystemService"), services);
  assert.deepEqual(extractQueuedWebServices(webContext, irSystems), services);
  const nativeContexts = SCRIPT_HOST_SERVICE_MATRIX.map((entry) => entry.context.slice("ctx.".length)).sort();
  assert.deepEqual(extractNativeContextMethods(bevyBridge).filter((context) => nativeContexts.includes(context)), nativeContexts);
  assert.deepEqual(extractNativeServiceEffects(bevyBridge), services);
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

function extractQueuedWebServices(source: string, irSystems: string): string[] {
  const body = /export interface IQueuedServiceCall \{[\s\S]*?service:([\s\S]*?);[\s\S]*?\}/.exec(source)?.[1] ?? "";
  if (/\bIrSystemService\b/.test(body)) {
    return extractTypeUnion(irSystems, "IrSystemService");
  }
  return extractServices(body);
}

function extractNativeContextMethods(source: string): string[] {
  const context = source.slice(source.indexOf("  const context = {"));
  const roots = [...new Set(SCRIPT_HOST_SERVICE_MATRIX.map((entry) => entry.context.split(".")[1] ?? ""))];
  return roots.flatMap((root) => {
    const rootMatch = new RegExp(`^( {4,6})${escapeRegExp(root)}: \\{$`, "m").exec(context);
    assert.ok(rootMatch, `native context should implement ${root}`);
    const start = rootMatch.index;
    const rootIndent = rootMatch[1]?.length ?? 4;
    const tail = context.slice(start);
    const firstLineEnd = tail.indexOf("\n") + 1;
    const nextRootOffset = tail.slice(firstLineEnd).search(/^ {4,6}[a-zA-Z][a-zA-Z0-9]*: \{$/m);
    const body = nextRootOffset === -1 ? tail : tail.slice(0, firstLineEnd + nextRootOffset);
    const direct = [...body.matchAll(new RegExp(`^ {${rootIndent + 2}}([a-zA-Z][a-zA-Z0-9]*)\\([^\\n]*\\) \\{`, "gm"))]
      .map((match) => `${root}.${match[1] ?? ""}`);
    const nested = [...body.matchAll(new RegExp(`^ {${rootIndent + 2}}([a-zA-Z][a-zA-Z0-9]*): \\{([\\s\\S]*?)(?=^ {${rootIndent + 2}}[a-zA-Z][a-zA-Z0-9]*(?:: \\{|\\()|^ {${rootIndent}}\\})`, "gm"))]
      .flatMap((match) => [...(match[2] ?? "").matchAll(new RegExp(`^ {${rootIndent + 4}}([a-zA-Z][a-zA-Z0-9]*)\\([^\\n]*\\) \\{`, "gm"))]
        .map((method) => `${root}.${match[1] ?? ""}.${method[1] ?? ""}`));
    return [...direct, ...nested];
  }).sort();
}

function extractNativeServiceEffects(source: string): string[] {
  const emitted = [...source.matchAll(/service: "([a-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+)"/g)].map((match) => match[1] ?? "");
  const delegated = [...source.matchAll(/physicsBodyCommand\("([a-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+)"/g)].map((match) => match[1] ?? "");
  return [...new Set([...emitted, ...delegated])].sort();
}

function extractServices(source: string): string[] {
  return [...new Set([...source.matchAll(/"([a-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+)"/g)].map((match) => match[1] ?? ""))].sort();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
