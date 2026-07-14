import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

import { createInteractionRuntimeState, loadBundle, runInteractionFixedTick } from "@threenative/runtime-web-three";

import type { IInteractionParitySnapshot } from "./interactionParity.js";

const execFileAsync = promisify(execFile);
const SNAPSHOT_ENTITIES = ["residual-overlap-source", "residual-small-outside", "residual-small-source", "residual-typed-source"] as const;

export async function generateInteractionResidualArtifacts(repoRoot: string): Promise<{ nativePath: string; webPath: string }> {
  const bundlePath = resolve(repoRoot, "packages/ir/fixtures/conformance/physics-events/game.bundle");
  const artifactRoot = resolve(repoRoot, "packages/ir/artifacts/conformance/interactions");
  const webPath = resolve(artifactRoot, "residuals.web.json");
  const nativePath = resolve(artifactRoot, "residuals.native.json");
  const bundle = await loadBundle(bundlePath);
  if (bundle.interactions === undefined) throw new Error("Interaction residual fixture is missing interactions.ir.json.");
  bundle.interactions = { ...bundle.interactions, interactions: bundle.interactions.interactions.filter((interaction) => interaction.id.startsWith("residual-")) };
  const state = createInteractionRuntimeState();
  const result = runInteractionFixedTick({ interactions: bundle.interactions, state, tick: 0, world: bundle.world });
  const customComponents = new Set(Object.keys(bundle.componentSchemas?.schemas ?? {}));
  const components: NonNullable<IInteractionParitySnapshot["components"]> = {};
  const componentStorage: NonNullable<IInteractionParitySnapshot["componentStorage"]> = {};
  for (const id of SNAPSHOT_ENTITIES) {
    const entity = bundle.world.entities.find((candidate) => candidate.id === id);
    if (entity === undefined) throw new Error(`Interaction residual fixture is missing snapshot entity '${id}'.`);
    components[id] = normalizeF32(structuredClone(entity.components)) as Record<string, unknown>;
    componentStorage[id] = Object.fromEntries(Object.keys(entity.components).sort().map((name) => [name, customComponents.has(name) ? "custom" : "typed"]));
  }
  const typedSourceStorage = componentStorage["residual-typed-source"];
  if (typedSourceStorage?.Health !== "custom" || typedSourceStorage.Collider !== "typed" || typedSourceStorage.Transform !== "typed") {
    throw new Error("Interaction residual component storage must derive Health as custom and Collider/Transform as typed from the fixture component schema.");
  }
  const snapshot: IInteractionParitySnapshot & { adapter: "web"; scenario: "residuals"; schema: string; version: string } = {
    adapter: "web",
    componentStorage,
    components,
    diagnostics: result.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    entities: bundle.world.entities.map((entity) => entity.id).sort(),
    resources: bundle.world.resources ?? {},
    scenario: "residuals",
    schema: "threenative.interaction-parity",
    traces: result.traces,
    version: "0.1.0",
  };
  await mkdir(dirname(webPath), { recursive: true });
  await writeFile(webPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await execFileAsync("cargo", [
    "run",
    "-p",
    "threenative_runtime",
    "--bin",
    "threenative_interaction_residual_trace",
    "--",
    bundlePath,
    nativePath,
  ], { cwd: resolve(repoRoot, "runtime-bevy"), maxBuffer: 10 * 1024 * 1024 });
  return { nativePath, webPath };
}

function normalizeF32(value: unknown): unknown {
  if (typeof value === "number") return Math.fround(value);
  if (Array.isArray(value)) return value.map(normalizeF32);
  if (typeof value === "object" && value !== null) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeF32(item)]));
  return value;
}
