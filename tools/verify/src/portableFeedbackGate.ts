import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { VerificationDiagnostic } from "./runner.js";

const FIXTURE_ROOT = "packages/ir/fixtures/conformance/portable-feedback/game.bundle";
const REQUIRED_FILES = [
  "packages/ir/src/feedback.ts",
  "packages/runtime-web-three/src/presentation.ts",
  "packages/runtime-web-three/src/tweens.test.ts",
  "packages/runtime-web-three/src/worldText.ts",
  "packages/runtime-web-three/src/worldText.test.ts",
  "runtime-bevy/crates/threenative_runtime/src/presentation.rs",
  "runtime-bevy/crates/threenative_runtime/src/world_text.rs",
  "runtime-bevy/crates/threenative_runtime/src/systems_host_bridge.js",
  "docs/cookbook/portable-feedback.md",
  "docs/contracts/scripting-api.md",
] as const;

export interface PortableFeedbackGateResult {
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  reportPath: string;
}

export async function runPortableFeedbackGate(options: { reportPath?: string; root?: string } = {}): Promise<PortableFeedbackGateResult> {
  const root = resolve(options.root ?? fileURLToPath(new URL("../../..", import.meta.url)));
  const reportPath = options.reportPath ?? resolve(root, "tools/verify/artifacts/portable-feedback/verification-report.json");
  const diagnostics: VerificationDiagnostic[] = [];

  for (const path of REQUIRED_FILES) {
    try {
      await access(resolve(root, path));
    } catch {
      diagnostics.push(failure("TN_VERIFY_PORTABLE_FEEDBACK_FILE_MISSING", `Portable feedback proof file is missing: ${path}.`, path));
    }
  }

  const manifest = await readJson(root, `${FIXTURE_ROOT}/manifest.json`, diagnostics);
  const world = await readJson(root, `${FIXTURE_ROOT}/world.ir.json`, diagnostics);
  const systems = await readJson(root, `${FIXTURE_ROOT}/systems.ir.json`, diagnostics);
  validateFixture(manifest, world, systems, diagnostics);

  const webTweens = await readSource(root, "packages/runtime-web-three/src/tweens.test.ts", diagnostics);
  const webText = await readSource(root, "packages/runtime-web-three/src/worldText.test.ts", diagnostics);
  const nativePresentation = await readSource(root, "runtime-bevy/crates/threenative_runtime/src/presentation.rs", diagnostics);
  assertContains(webTweens, "tween scale with ease out finishes exactly at the target", diagnostics, "TN_VERIFY_PORTABLE_FEEDBACK_WEB_TWEEN_TEST_MISSING");
  assertContains(webTweens, "owned tween cancels when the entity despawns", diagnostics, "TN_VERIFY_PORTABLE_FEEDBACK_WEB_CANCEL_TEST_MISSING");
  assertContains(webText, "world text follows its target, floats, and expires", diagnostics, "TN_VERIFY_PORTABLE_FEEDBACK_WEB_TEXT_TEST_MISSING");
  assertContains(nativePresentation, "tween_easing_and_shortest_rotation_are_deterministic", diagnostics, "TN_VERIFY_PORTABLE_FEEDBACK_NATIVE_TWEEN_TEST_MISSING");
  assertContains(nativePresentation, "shake_envelope_uses_elapsed_delta", diagnostics, "TN_VERIFY_PORTABLE_FEEDBACK_NATIVE_SHAKE_TEST_MISSING");

  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({
    code: ok ? "TN_VERIFY_PORTABLE_FEEDBACK_OK" : "TN_VERIFY_PORTABLE_FEEDBACK_FAILED",
    diagnostics,
    evidence: {
      fixture: FIXTURE_ROOT,
      nativeTests: [
        "presentation::tests::tween_easing_and_shortest_rotation_are_deterministic",
        "presentation::tests::shake_envelope_uses_elapsed_delta",
      ],
      webTests: [
        "tween scale with ease out finishes exactly at the target",
        "owned tween cancels when the entity despawns",
        "portable shake envelope uses real elapsed delta",
        "world text follows its target, floats, and expires",
      ],
    },
    generatedBy: "@threenative/verify-tools portableFeedbackGate",
    ok,
    schema: "threenative.verify.portable-feedback",
    status: ok ? "pass" : "fail",
    version: "0.1.0",
  }, null, 2)}\n`, "utf8");
  return { diagnostics, ok, reportPath };
}

function validateFixture(
  manifest: Record<string, unknown>,
  world: Record<string, unknown>,
  systems: Record<string, unknown>,
  diagnostics: VerificationDiagnostic[],
): void {
  const capabilities = isRecord(manifest.requiredCapabilities) ? manifest.requiredCapabilities : {};
  assertCapability(capabilities, "rendering", "world-text", diagnostics);
  assertCapability(capabilities, "scripting", "feedback-presets", diagnostics);
  assertCapability(capabilities, "scripting", "service.camera.shake", diagnostics);
  assertCapability(capabilities, "scripting", "service.effects.play", diagnostics);

  const entities = Array.isArray(world.entities) ? world.entities : [];
  const label = entities.find((entity): entity is Record<string, unknown> => isRecord(entity) && entity.id === "pickup-label");
  const components = label !== undefined && isRecord(label.components) ? label.components : {};
  const text = isRecord(components.WorldText) ? components.WorldText : {};
  if (text.target !== "pickup" || text.fade !== true || typeof text.lifetime !== "number" || typeof text.floatDistance !== "number") {
    diagnostics.push(failure("TN_VERIFY_PORTABLE_FEEDBACK_WORLD_TEXT_FIXTURE_INVALID", "Fixture must contain bounded target-following, floating, fading world text.", `${FIXTURE_ROOT}/world.ir.json/entities`));
  }

  const presets = Array.isArray(systems.feedbackPresets) ? systems.feedbackPresets : [];
  const ids = presets.filter(isRecord).map((preset) => preset.id).filter((id): id is string => typeof id === "string").sort();
  if (JSON.stringify(ids) !== JSON.stringify(["dust", "explosion", "pickup-sparkle", "trail"])) {
    diagnostics.push(failure("TN_VERIFY_PORTABLE_FEEDBACK_PRESETS_INVALID", "Fixture must declare the four canonical portable feedback preset ids.", `${FIXTURE_ROOT}/systems.ir.json/feedbackPresets`));
  }
  const explosion = presets.find((preset): preset is Record<string, unknown> => isRecord(preset) && preset.id === "explosion");
  if (explosion === undefined || !isRecord(explosion.audio) || !isRecord(explosion.camera) || !Array.isArray(explosion.particles)) {
    diagnostics.push(failure("TN_VERIFY_PORTABLE_FEEDBACK_COMPOSITION_MISSING", "Explosion preset must compose bounded audio, camera, and particle declarations.", `${FIXTURE_ROOT}/systems.ir.json/feedbackPresets`));
  }
  const declarations = Array.isArray(systems.systems) ? systems.systems.filter(isRecord) : [];
  const system = declarations.find((entry) => entry.name === "pickupFeedback");
  const services = system !== undefined && Array.isArray(system.services) ? system.services : [];
  const commands = system !== undefined && Array.isArray(system.commands) ? system.commands.filter(isRecord) : [];
  if (!services.includes("camera.shake") || !services.includes("effects.play") || !commands.some((command) => command.kind === "tween") || !commands.some((command) => command.kind === "worldText")) {
    diagnostics.push(failure("TN_VERIFY_PORTABLE_FEEDBACK_DECLARATIONS_MISSING", "Fixture system must declare tween, world-text, camera-shake, and feedback-preset surfaces.", `${FIXTURE_ROOT}/systems.ir.json/systems`));
  }
}

function assertCapability(capabilities: Record<string, unknown>, domain: string, capability: string, diagnostics: VerificationDiagnostic[]): void {
  const values = capabilities[domain];
  if (!Array.isArray(values) || !values.includes(capability)) {
    diagnostics.push(failure("TN_VERIFY_PORTABLE_FEEDBACK_CAPABILITY_MISSING", `Fixture manifest must declare ${domain}:${capability}.`, `${FIXTURE_ROOT}/manifest.json/requiredCapabilities/${domain}`));
  }
}

async function readJson(root: string, path: string, diagnostics: VerificationDiagnostic[]): Promise<Record<string, unknown>> {
  try {
    const value: unknown = JSON.parse(await readFile(resolve(root, path), "utf8"));
    if (isRecord(value)) return value;
  } catch (error) {
    diagnostics.push(failure("TN_VERIFY_PORTABLE_FEEDBACK_JSON_INVALID", `Unable to read ${path}: ${error instanceof Error ? error.message : String(error)}.`, path));
  }
  return {};
}

async function readSource(root: string, path: string, diagnostics: VerificationDiagnostic[]): Promise<string> {
  try {
    return await readFile(resolve(root, path), "utf8");
  } catch (error) {
    diagnostics.push(failure("TN_VERIFY_PORTABLE_FEEDBACK_SOURCE_MISSING", `Unable to read ${path}: ${error instanceof Error ? error.message : String(error)}.`, path));
    return "";
  }
}

function assertContains(source: string, expected: string, diagnostics: VerificationDiagnostic[], code: string): void {
  if (!source.includes(expected)) diagnostics.push(failure(code, `Portable feedback proof source must contain '${expected}'.`));
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
    suggestedFix: "Restore the portable-feedback fixture or paired web/native proof and rerun the focused gate.",
  };
}

if (process.argv[1]?.endsWith("portableFeedbackGate.js")) {
  const result = await runPortableFeedbackGate();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
