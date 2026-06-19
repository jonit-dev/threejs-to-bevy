import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SCRIPT_ONLY_GATES } from "../scriptGates.js";

type CommandSpec = readonly [command: string, ...args: string[]];
export type GateProfile = "smoke" | "changed" | "focused" | "release" | "full";

export interface FocusedGate {
  commands: readonly CommandSpec[];
  description: string;
  metadata: {
    owner: string;
    profile: GateProfile;
    reason: string;
    protects: string;
  };
}

export interface FocusedGateCommandOptions {
  forwardedArgs?: readonly string[];
  skipSetup?: boolean;
}

export interface FocusedGateRunOptions extends FocusedGateCommandOptions {
  root?: string;
}

export const FOCUSED_GATES: Record<string, FocusedGate> = {
  ...SCRIPT_ONLY_GATES,
  "verify:animation-physics-residuals": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["node", "scripts/verify-animation-physics-residuals.mjs"],
    ],
    description: "Animation, physics, and navigation residual gate.",
    metadata: {
      owner: "tools/verify animation-physics-residuals gate",
      profile: "focused",
      reason: "Compares emitted bundle/runtime evidence for promoted animation, physics, and navigation residual behavior across verifier artifacts.",
      protects: "Cross-runtime residual traces, unsupported-feature diagnostics, and durable release evidence.",
    },
  },
  "verify:bundle-safety-hardening": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/compiler", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["pnpm", "--filter", "@threenative/cli", "build"],
      ["node", "scripts/verify-bundle-safety-hardening.mjs"],
    ],
    description: "Bundle safety and runtime robustness hardening gate.",
    metadata: {
      owner: "tools/verify bundle-safety-hardening gate",
      profile: "focused",
      reason: "Exercises bundle emission, runtime loading, and malformed artifact handling across package boundaries.",
      protects: "Path safety, staged bundle writes, generated-mesh payload diagnostics, and release artifact quality.",
    },
  },
  "verify:input-ui-polish": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["node", "scripts/verify-input-ui-polish.mjs"],
    ],
    description: "Input and UI platform polish gate.",
    metadata: {
      owner: "tools/verify input-ui-polish gate",
      profile: "focused",
      reason: "Validates platform input/UI behavior through generated runtime reports rather than isolated package logic.",
      protects: "Cross-runtime input traces, UI state evidence, and stable platform diagnostics.",
    },
  },
  "verify:persistence-reload": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["node", "scripts/verify-persistence-reload.mjs"],
    ],
    description: "Persistence and hot reload gate.",
    metadata: {
      owner: "tools/verify persistence-reload gate",
      profile: "focused",
      reason: "Proves save/settings and reload behavior through runtime state reports that depend on emitted bundle artifacts.",
      protects: "Durable persistence evidence, reload policy traces, migration diagnostics, and web/Bevy parity.",
    },
  },
  "verify:production-hardening": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["pnpm", "--filter", "@threenative/cli", "build"],
      ["node", "scripts/verify-production-hardening.mjs"],
    ],
    description: "Production audio, diagnostics, and packaging gate.",
    metadata: {
      owner: "tools/verify production-hardening gate",
      profile: "focused",
      reason: "Aggregates production-facing audio, profiling, diagnostics, and packaging proof across CLI/runtime artifacts.",
      protects: "Production diagnostic quality, package preflight evidence, profiler reports, and audio/runtime boundaries.",
    },
  },
  "verify:rendering-residuals": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["node", "scripts/verify-rendering-residuals.mjs"],
    ],
    description: "Rendering, materials, and geometry residual gate.",
    metadata: {
      owner: "tools/verify rendering-residuals gate",
      profile: "focused",
      reason: "Checks promoted rendering/material/geometry slices through generated artifacts and runtime observations.",
      protects: "Runtime LOD/material evidence, asset streaming diagnostics, and renderer boundary guarantees.",
    },
  },
  "verify:runtime-gameplay-host": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["node", "scripts/verify-runtime-gameplay-host.mjs"],
    ],
    description: "Runtime gameplay host gate.",
    metadata: {
      owner: "tools/verify runtime-gameplay-host gate",
      profile: "focused",
      reason: "Validates gameplay host semantics against runtime traces that span ECS declarations, emitted IR, and adapters.",
      protects: "Live entity reconciliation, event windows, dynamic state handoff, and host diagnostic parity.",
    },
  },
  "verify:scene-lifecycle": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["node", "scripts/verify-scene-lifecycle.mjs"],
    ],
    description: "Scene lifecycle and flow contract gate.",
    metadata: {
      owner: "tools/verify scene-lifecycle gate",
      profile: "focused",
      reason: "Proves authored scene lifecycle declarations through emitted scene IR and matching runtime traces.",
      protects: "Scene transition contracts, lifecycle diagnostics, and web/Bevy trace alignment.",
    },
  },
  "verify:v10:ecs-tags-groups": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "test", "--", "--run", "conformance"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "test", "--", "--run", "conformance"],
      ["cargo", "test", "--manifest-path", "runtime-bevy/Cargo.toml", "-p", "threenative_runtime", "should_report_v10_ecs_tags"],
    ],
    description: "V10 ECS tags and scene groups focused gate.",
    metadata: {
      owner: "packages/ir conformance and runtime adapters",
      profile: "focused",
      reason: "Combines IR conformance tests and Bevy runtime tests for shared tag/group semantics.",
      protects: "ECS tag queries, scene group hierarchy semantics, and shared IR fixture parity.",
    },
  },
  "verify:v10:visual-calibration": {
    commands: [
      ["pnpm", "--filter", "@threenative/cli", "build"],
      ["node", "scripts/verify-v10-visual-calibration.mjs"],
    ],
    description: "V10 visual calibration gate.",
    metadata: {
      owner: "tools/verify visual-calibration gate",
      profile: "focused",
      reason: "Runs calibrated visual comparison evidence that cannot be represented as package-local assertions.",
      protects: "Cross-runtime screenshot calibration, material/light/post parity, and indexed visual evidence.",
    },
  },
  "verify:v9:assets-gltf-scene-workflow": {
    commands: [
      ["pnpm", "--filter", "@threenative/cli", "build"],
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["node", "scripts/verify-v9-assets-gltf-scene-workflow.mjs"],
    ],
    description: "V9 asset GLTF scene workflow gate.",
    metadata: {
      owner: "examples/assets-gltf-scene-workflow verifier",
      profile: "focused",
      reason: "Builds and validates a full asset workflow from example source through bundle and runtime evidence.",
      protects: "glTF asset manifest behavior, scene workflow artifacts, and runtime asset parity.",
    },
  },
  "verify:v9:rendering-lights": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["pnpm", "--filter", "@threenative/cli", "build"],
      ["node", "scripts/verify-v9-rendering-lights.mjs"],
    ],
    description: "V9 rendering lights gate.",
    metadata: {
      owner: "examples/rendering-lights verifier",
      profile: "focused",
      reason: "Uses rendered example evidence for lighting behavior that depends on runtime adapters and screenshots.",
      protects: "Lighting parity, rendered fixture artifacts, and release-required visual evidence.",
    },
  },
};

const RELEASE_PROFILE_GATES = [
  "verify:animation-physics-residuals",
  "verify:bundle-safety-hardening",
  "verify:input-ui-polish",
  "verify:persistence-reload",
  "verify:production-hardening",
  "verify:rendering-residuals",
  "verify:runtime-gameplay-host",
  "verify:v9:assets-gltf-scene-workflow",
  "verify:v9:rendering-lights",
] as const;

export const GATE_PROFILES: Record<GateProfile, { description: string; gates: readonly string[] }> = {
  changed: {
    description: "Package-local build, typecheck, lint, and tests for ordinary changed-code review.",
    gates: [],
  },
  focused: {
    description: "All typed focused capability gates.",
    gates: listFocusedGateNames(),
  },
  full: {
    description: "Every typed focused gate known to the dispatcher.",
    gates: listFocusedGateNames(),
  },
  release: {
    description: "Typed focused gates consumed by verify:release after shared setup.",
    gates: RELEASE_PROFILE_GATES,
  },
  smoke: {
    description: "Fast local smoke path; currently implemented by package scripts rather than focused gates.",
    gates: [],
  },
};

const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));

export function listFocusedGateNames(): string[] {
  return Object.keys(FOCUSED_GATES).sort();
}

export function listFocusedGateNamesByProfile(profile: GateProfile): string[] {
  return [...GATE_PROFILES[profile].gates].sort();
}

export function getFocusedGateCommands(gateName: string, options: FocusedGateCommandOptions = {}): readonly CommandSpec[] {
  const gate = FOCUSED_GATES[gateName];
  if (!gate) {
    return [];
  }
  const commands = options.skipSetup ? gate.commands.slice(-1) : gate.commands;
  const forwardedArgs = options.forwardedArgs ?? [];
  if (forwardedArgs.length === 0) {
    return commands;
  }
  return commands.map((command, index) =>
    index === commands.length - 1 ? ([...command, ...forwardedArgs] as CommandSpec) : command,
  );
}

export function runFocusedGate(gateName: string, forwardedArgs: readonly string[], root?: string): number;
export function runFocusedGate(gateName: string, options?: FocusedGateRunOptions): number;
export function runFocusedGate(
  gateName: string,
  forwardedArgsOrOptions: readonly string[] | FocusedGateRunOptions = [],
  legacyRoot = repoRoot,
): number {
  if (!FOCUSED_GATES[gateName]) {
    process.stderr.write(`Unknown verify gate '${gateName}'. Known gates: ${listFocusedGateNames().join(", ")}\n`);
    return 1;
  }

  const options: FocusedGateRunOptions = isForwardedArgs(forwardedArgsOrOptions)
    ? { forwardedArgs: forwardedArgsOrOptions, root: legacyRoot }
    : forwardedArgsOrOptions;
  const root = options.root ?? repoRoot;
  for (const [command, ...args] of getFocusedGateCommands(gateName, options)) {
    const result = spawnSync(command, args, {
      cwd: root,
      encoding: "utf8",
      stdio: "inherit",
    });
    if (result.status !== 0) {
      return result.status ?? 1;
    }
  }
  return 0;
}

function isForwardedArgs(value: readonly string[] | FocusedGateRunOptions): value is readonly string[] {
  return Array.isArray(value);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [gateName, ...rawForwardedArgs] = process.argv.slice(2);
  const skipSetup = rawForwardedArgs.includes("--no-setup");
  const forwardedArgs = rawForwardedArgs.filter((arg) => arg !== "--no-setup");
  if (!gateName) {
    process.stderr.write(`Usage: node tools/verify/dist/cli/run.js <gate> [--no-setup] [...args]\nKnown gates: ${listFocusedGateNames().join(", ")}\n`);
    process.exitCode = 1;
  } else {
    process.exitCode = runFocusedGate(gateName, { forwardedArgs, skipSetup });
  }
}
