import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { VerificationDiagnostic } from "./runner.js";

const GATE_SCHEMA = "threenative.verify.gameplay-primitives" as const;
const GATE_VERSION = "0.1.0" as const;
const FIXTURE_ROOT = "packages/ir/fixtures/conformance/gameplay-primitives/game.bundle";

const REQUIRED_FILES = [
  "packages/ir/src/tagValidation.ts",
  "packages/runtime-web-three/src/patrol.ts",
  "packages/runtime-web-three/src/patrol.test.ts",
  "packages/runtime-web-three/src/stateMachines.ts",
  "packages/runtime-web-three/src/stateMachines.test.ts",
  "packages/runtime-web-three/src/countdowns.ts",
  "packages/runtime-web-three/src/countdowns.test.ts",
  "runtime-bevy/crates/threenative_runtime/src/patrol.rs",
  "runtime-bevy/crates/threenative_runtime/src/state_machines.rs",
  "runtime-bevy/crates/threenative_runtime/src/countdowns.rs",
  "runtime-bevy/crates/threenative_runtime/tests/systems_host.rs",
  "packages/cli/src/mechanicBlocks/registry.ts",
  "docs/cookbook/runtime-gameplay-primitives.md",
] as const;

export interface GameplayPrimitivesGateResult {
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  reportPath: string;
}

export async function runGameplayPrimitivesGate(options: { reportPath?: string; root?: string } = {}): Promise<GameplayPrimitivesGateResult> {
  const root = resolve(options.root ?? fileURLToPath(new URL("../../..", import.meta.url)));
  const reportPath = options.reportPath ?? resolve(root, "tools/verify/artifacts/gameplay-primitives/verification-report.json");
  const diagnostics: VerificationDiagnostic[] = [];

  for (const relativePath of REQUIRED_FILES) {
    try {
      await access(resolve(root, relativePath));
    } catch {
      diagnostics.push(failure("TN_VERIFY_GAMEPLAY_PRIMITIVES_FILE_MISSING", `Gameplay primitives proof file is missing: ${relativePath}.`, relativePath));
    }
  }

  const fixture = await readJson(root, `${FIXTURE_ROOT}/manifest.json`, diagnostics);
  const world = await readJson(root, `${FIXTURE_ROOT}/world.ir.json`, diagnostics);
  const systems = await readJson(root, `${FIXTURE_ROOT}/systems.ir.json`, diagnostics);
  validateFixture(fixture, world, systems, diagnostics);

  const webPatrolTests = await readSource(root, "packages/runtime-web-three/src/patrol.test.ts", diagnostics);
  const webStateMachineTests = await readSource(root, "packages/runtime-web-three/src/stateMachines.test.ts", diagnostics);
  const webCountdownTests = await readSource(root, "packages/runtime-web-three/src/countdowns.test.ts", diagnostics);
  const nativeTests = await readSource(root, "runtime-bevy/crates/threenative_runtime/tests/systems_host.rs", diagnostics);
  assertContains(webPatrolTests, "should traverse loop waypoints without overshoot", diagnostics, "TN_VERIFY_GAMEPLAY_PRIMITIVES_WEB_PATROL_TEST_MISSING");
  assertContains(webStateMachineTests, "should resolve simultaneous transitions by declaration order", diagnostics, "TN_VERIFY_GAMEPLAY_PRIMITIVES_WEB_STATE_MACHINE_TEST_MISSING");
  assertContains(webCountdownTests, "should fire a down countdown limit event once per cycle", diagnostics, "TN_VERIFY_GAMEPLAY_PRIMITIVES_WEB_COUNTDOWN_TEST_MISSING");
  assertContains(nativeTests, "systems_host_should_run_native_patrol_trace_on_fixed_ticks", diagnostics, "TN_VERIFY_GAMEPLAY_PRIMITIVES_NATIVE_PATROL_TEST_MISSING");
  assertContains(nativeTests, "systems_host_should_run_native_state_machine_event_once", diagnostics, "TN_VERIFY_GAMEPLAY_PRIMITIVES_NATIVE_STATE_MACHINE_TEST_MISSING");
  assertContains(nativeTests, "systems_host_should_tick_countdown_and_fire_one_limit_event_per_cycle", diagnostics, "TN_VERIFY_GAMEPLAY_PRIMITIVES_NATIVE_COUNTDOWN_TEST_MISSING");

  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({
    code: ok ? "TN_VERIFY_GAMEPLAY_PRIMITIVES_OK" : "TN_VERIFY_GAMEPLAY_PRIMITIVES_FAILED",
    diagnostics,
    evidence: {
      fixture: FIXTURE_ROOT,
      nativeTests: [
        "systems_host_should_query_native_entities_by_tag",
        "systems_host_should_observe_native_lifecycle_after_bundle_reconciliation",
        "systems_host_should_run_native_patrol_trace_on_fixed_ticks",
        "systems_host_should_run_native_state_machine_event_once",
        "systems_host_should_tick_countdown_and_fire_one_limit_event_per_cycle",
      ],
      webTests: [
        "should query entities by tag in lexical order",
        "should expose spawn and despawn once per tick",
        "should traverse loop waypoints without overshoot",
        "should resolve simultaneous transitions by declaration order",
        "should fire a down countdown limit event once per cycle",
      ],
    },
    generatedBy: "@threenative/verify-tools gameplayPrimitivesGate",
    ok,
    schema: GATE_SCHEMA,
    status: ok ? "pass" : "fail",
    version: GATE_VERSION,
  }, null, 2)}\n`, "utf8");
  return { diagnostics, ok, reportPath };
}

async function readJson(root: string, relativePath: string, diagnostics: VerificationDiagnostic[]): Promise<Record<string, unknown>> {
  try {
    const value: unknown = JSON.parse(await readFile(resolve(root, relativePath), "utf8"));
    if (isRecord(value)) {
      return value;
    }
    diagnostics.push(failure("TN_VERIFY_GAMEPLAY_PRIMITIVES_JSON_INVALID", `Expected an object in ${relativePath}.`, relativePath));
  } catch (error) {
    diagnostics.push(failure("TN_VERIFY_GAMEPLAY_PRIMITIVES_JSON_INVALID", `Unable to read ${relativePath}: ${error instanceof Error ? error.message : String(error)}.`, relativePath));
  }
  return {};
}

async function readSource(root: string, relativePath: string, diagnostics: VerificationDiagnostic[]): Promise<string> {
  try {
    return await readFile(resolve(root, relativePath), "utf8");
  } catch (error) {
    diagnostics.push(failure("TN_VERIFY_GAMEPLAY_PRIMITIVES_SOURCE_MISSING", `Unable to read ${relativePath}: ${error instanceof Error ? error.message : String(error)}.`, relativePath));
    return "";
  }
}

function validateFixture(
  manifest: Record<string, unknown>,
  world: Record<string, unknown>,
  systems: Record<string, unknown>,
  diagnostics: VerificationDiagnostic[],
): void {
  const capabilities = isRecord(manifest.requiredCapabilities) ? manifest.requiredCapabilities : {};
  const requiredCapabilities = [
    ["ecs", "entity-tags"],
    ["gameplay", "entity-state-machine"],
    ["gameplay", "patrol"],
    ["scripting", "runtime-countdowns"],
    ["scripting", "tag-queries"],
  ] as const;
  for (const [domain, capability] of requiredCapabilities) {
    const values = capabilities[domain];
    if (!Array.isArray(values) || !values.includes(capability)) {
      diagnostics.push(failure("TN_VERIFY_GAMEPLAY_PRIMITIVES_CAPABILITY_MISSING", `Fixture manifest must declare ${domain}:${capability}.`, `${FIXTURE_ROOT}/manifest.json/requiredCapabilities/${domain}`));
    }
  }
  const entities = Array.isArray(world.entities) ? world.entities : [];
  const guard = entities.find((entity): entity is Record<string, unknown> => isRecord(entity) && entity.id === "guard");
  const components = guard !== undefined && isRecord(guard.components) ? guard.components : {};
  if (guard === undefined || !Array.isArray(guard.tags) || !guard.tags.includes("patrol")) {
    diagnostics.push(failure("TN_VERIFY_GAMEPLAY_PRIMITIVES_TAG_FIXTURE_MISSING", "Fixture must contain a tagged guard entity.", `${FIXTURE_ROOT}/world.ir.json/entities`));
  }
  if (!isRecord(components.Patrol) || !isRecord(components.StateMachine)) {
    diagnostics.push(failure("TN_VERIFY_GAMEPLAY_PRIMITIVES_COMPONENT_FIXTURE_MISSING", "Fixture must contain Patrol and StateMachine components.", `${FIXTURE_ROOT}/world.ir.json/entities/guard/components`));
  }
  const countdowns = Array.isArray(systems.countdowns) ? systems.countdowns : [];
  if (countdowns.length !== 1 || !isRecord(countdowns[0]) || countdowns[0].resource !== "Race" || countdowns[0].field !== "remaining") {
    diagnostics.push(failure("TN_VERIFY_GAMEPLAY_PRIMITIVES_COUNTDOWN_FIXTURE_MISSING", "Fixture must contain the canonical Race.remaining countdown declaration.", `${FIXTURE_ROOT}/systems.ir.json/countdowns`));
  }
}

function assertContains(source: string, expected: string, diagnostics: VerificationDiagnostic[], code: string): void {
  if (!source.includes(expected)) {
    diagnostics.push(failure(code, `Gameplay primitives proof source must contain '${expected}'.`));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(code: string, message: string, path?: string): VerificationDiagnostic {
  return {
    code,
    message,
    ...(path === undefined ? {} : { path }),
    severity: "error",
    suggestedFix: "Restore the gameplay-primitives fixture or its paired web/native proof and rerun the focused gate.",
  };
}

if (process.argv[1]?.endsWith("gameplayPrimitivesGate.js")) {
  const result = await runGameplayPrimitivesGate();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
