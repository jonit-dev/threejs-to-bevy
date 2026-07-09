import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SCRIPT_ONLY_GATES } from "../scriptGates.js";
import { descriptorFocusedGates } from "../gateDescriptors.js";

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
  ...descriptorFocusedGates(),
  "test:gameplay": {
    commands: [
      ["pnpm", "--filter", "@threenative/cli", "build"],
      ["node", "tools/verify/dist/gameplayParity.js", "--profile", "smoke"],
    ],
    description: "Gameplay parity smoke gate.",
    metadata: {
      owner: "tools/verify gameplay parity gate",
      profile: "smoke",
      reason: "Runs the bounded gameplay parity smoke harness through the focused gate dispatcher for local regression checks.",
      protects: "Paired runtime playtest/probe aggregation, scene coverage accounting, and behavioral parity report shape.",
    },
  },
  "verify:gameplay-parity": {
    commands: [
      ["pnpm", "--filter", "@threenative/cli", "build"],
      ["node", "tools/verify/dist/gameplayParity.js", "--profile", "full"],
    ],
    description: "Gameplay parity verification gate.",
    metadata: {
      owner: "tools/verify gameplay parity gate",
      profile: "focused",
      reason: "Runs the CI-oriented gameplay parity harness with full-profile enrollment and artifact-backed diagnostics.",
      protects: "Web/Bevy gameplay parity assertions, runtime probe comparisons, and explicit scene surface coverage.",
    },
  },
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
  "verify:character-physics-contacts": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["node", "scripts/verify-character-physics-contacts.mjs"],
    ],
    description: "Character physics contacts parity gate.",
    metadata: {
      owner: "tools/verify character-physics-contacts gate",
      profile: "focused",
      reason: "Compares web and native character movement observations for portable contact filters, slope reports, and pushed bodies.",
      protects: "Character contact payload ordering, web/native observation parity, and release evidence for contact filtering.",
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
  "verify:particle-commands": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/ir", "test", "--", "--run", "particle command fixture"],
      ["node", "scripts/verify-particle-commands.mjs"],
    ],
    description: "Bounded particle command fixture gate.",
    metadata: {
      owner: "tools/verify particle command gate",
      profile: "focused",
      reason: "Validates the portable particle command fixture and writes bounded count plus visual artifacts before particle command claims are promoted.",
      protects: "Canonical particle command service names, bounded emitter metadata, fixture registration, count observations, and nonblank visual evidence.",
    },
  },
  "verify:portable-shader-material": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["pnpm", "--filter", "@threenative/verify-tools", "build"],
      ["node", "scripts/verify-portable-shader-material.mjs"],
    ],
    description: "Portable shader material parity proof gate.",
    metadata: {
      owner: "tools/verify portable shader material gate",
      profile: "focused",
      reason: "Validates the shared portable shader fixture, web/native shader metadata, binding layout parity, and sample-region proof contract before shader material support can be promoted.",
      protects: "Portable shader material fixture coverage, web/native shader binding metadata, and release evidence wiring.",
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
  "verify:physics-self-verification": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["node", "tools/verify/dist/physicsSelfVerification.js"],
    ],
    description: "Physics runtime self-verification gate.",
    metadata: {
      owner: "tools/verify physics-self-verification gate",
      profile: "focused",
      reason: "Executes fixture-backed physics scenes, negative diagnostics, trace diffs, and evidence indexing for promoted physics claims.",
      protects: "Portable physics contract evidence, deterministic web/native trace comparison artifacts, and unsupported physics boundary diagnostics.",
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
  "verify:render-look": {
    commands: [
      ["pnpm", "--filter", "@threenative/verify-tools", "build"],
      ["node", "tools/verify/dist/cli/renderLook.js"],
    ],
    description: "Render look profile quality gate.",
    metadata: {
      owner: "tools/verify render-look gate",
      profile: "focused",
      reason: "Compares parity, balanced, and cinematic render-look evidence so beautiful defaults cannot regress into flat screenshots.",
      protects: "Render-look profile quality, parity profile isolation, cinematic default-look quality, and artifact-backed visual improvement thresholds.",
    },
  },
  "verify:efficient-scale": {
    commands: [
      ["pnpm", "--filter", "@threenative/cli", "build"],
      ["pnpm", "--filter", "@threenative/verify-tools", "build"],
      ["node", "tools/verify/dist/efficientScaleGate.js"],
    ],
    description: "Dense-world efficient scale proof gate.",
    metadata: {
      owner: "tools/verify efficient-scale gate",
      profile: "focused",
      reason: "Builds the dense-world benchmark and validates runtime performance-proof budgets.",
      protects: "Frame-time, draw-call, visible-instance, texture-byte, and entity-count budget evidence for dense scenes.",
    },
  },
  "verify:default-look": {
    commands: [
      ["pnpm", "--filter", "@threenative/verify-tools", "build"],
      ["node", "tools/verify/dist/cli/renderLook.js"],
    ],
    description: "Cinematic default look quality gate.",
    metadata: {
      owner: "tools/verify render-look gate",
      profile: "focused",
      reason: "Captures and compares the promoted cinematic default look against parity/balanced baselines.",
      protects: "Fresh-project cinematic defaults, cross-runtime render-look evidence, and profile fallback diagnostics.",
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
  "verify:runtime-prefabs-hierarchy": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["node", "scripts/verify-runtime-prefabs-hierarchy.mjs"],
    ],
    description: "Runtime prefab and hierarchy command gate.",
    metadata: {
      owner: "tools/verify runtime-prefabs-hierarchy gate",
      profile: "focused",
      reason: "Compares web and Bevy runtime prefab expansion and hierarchy mutation using a shared conformance fixture.",
      protects: "Deterministic prefab instantiation, hierarchy parent commands, and web/Bevy command parity.",
    },
  },
  "verify:runtime-query-diffing": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["node", "scripts/verify-runtime-query-diffing.mjs"],
    ],
    description: "Runtime changed-query diffing gate.",
    metadata: {
      owner: "tools/verify runtime-query-diffing gate",
      profile: "focused",
      reason: "Compares web and Bevy component snapshot diffing for changed queries using a shared conformance fixture.",
      protects: "Hidden runtime changed-query diffing, ordering/pagination semantics, and web/Bevy query parity.",
    },
  },
  "verify:scripting-helpers-lifecycle": {
    commands: [
      ["pnpm", "--filter", "@threenative/sdk", "build"],
      ["pnpm", "--filter", "@threenative/compiler", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["pnpm", "--filter", "@threenative/cli", "build"],
      ["node", "scripts/verify-scripting-helpers-lifecycle.mjs"],
    ],
    description: "Scripting helper imports, lifecycle facade, and racing example gate.",
    metadata: {
      owner: "tools/verify scripting-helpers-lifecycle gate",
      profile: "focused",
      reason: "Aggregates SDK lifecycle lowering, compiler helper import bundling, web playtest evidence, and Bevy context-helper bridge evidence for portable scripting ergonomics.",
      protects: "Portable script helper imports, lifecycle alias schedules, context helper parity, and structured-source domain example rebuilds.",
    },
  },
  "verify:ui-persistence-settings-facades": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["node", "scripts/verify-ui-persistence-settings-facades.mjs"],
    ],
    description: "UI, persistence, and settings scripting facade gate.",
    metadata: {
      owner: "tools/verify ui-persistence-settings-facades gate",
      profile: "focused",
      reason: "Compares web and Bevy logical facade results for UI, local-data saves, and settings through a shared conformance fixture.",
      protects: "Script UI/persistence/settings service parity, bounded storage results, and retained UI state evidence.",
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
  "verify:editor-package": {
    commands: [
      ["pnpm", "--filter", "@threenative/editor", "build"],
      ["node", "tools/verify/dist/editorPackage.js"],
    ],
    description: "Editor package browser smoke gate.",
    metadata: {
      owner: "tools/verify editor-package gate",
      profile: "focused",
      reason: "Uses a real browser to prove the editor shell, source inventory fixture, and preview status render together.",
      protects: "Editor package launchability, browser framing, and visual smoke artifacts.",
    },
  },
  "verify:editor-ai-chat": {
    commands: [
      ["pnpm", "--filter", "@threenative/authoring", "build"],
      ["pnpm", "--filter", "@threenative/compiler", "build"],
      ["pnpm", "--filter", "@threenative/editor", "build"],
      ["node", "tools/verify/dist/editorAiChat.js"],
    ],
    description: "Editor AI chat source-backed ECS operation gate.",
    metadata: {
      owner: "tools/verify editor-ai-chat gate",
      profile: "focused",
      reason: "Plans and approves a deterministic editor chat ECS request, applies source operations, validates source/IR proof, and writes durable evidence.",
      protects: "Editor AI chat approval flow, source-only mutation boundary, live-update hinting, and generated IR proof.",
    },
  },
  "verify:game-production": {
    commands: [
      ["pnpm", "--filter", "@threenative/authoring", "build"],
      ["pnpm", "--filter", "@threenative/verify-tools", "build"],
      ["node", "tools/verify/dist/cli/game-production.js"],
    ],
    description: "Game production workflow report gate.",
    metadata: {
      owner: "tools/verify game-production gate",
      profile: "focused",
      reason: "Validates source-backed game quality reports, phase ledgers, scorecards, UI states, asset/audio ledgers, QA evidence, and release blockers.",
      protects: "tn game score/qa/release report contract and release-ready claim boundaries.",
    },
  },
  "verify:generated-games": {
    commands: [
      ["pnpm", "--filter", "@threenative/authoring", "build"],
      ["pnpm", "--filter", "@threenative/verify-tools", "build"],
      ["node", "tools/verify/dist/cli/game-production.js", "--generated-games"],
    ],
    description: "Generated game aggregate production proof gate.",
    metadata: {
      owner: "tools/verify generated-games gate",
      profile: "focused",
      reason: "Aggregates release and visual-quality proof across the current generated-game examples.",
      protects: "Generated-game QA/release evidence, clean release risks, and objective screenshot quality sidecars.",
    },
  },
  "verify:example-build-sweep": {
    commands: [
      ["pnpm", "--filter", "@threenative/sdk", "build"],
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/authoring", "build"],
      ["pnpm", "--filter", "@threenative/compiler", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["pnpm", "--filter", "@threenative/cli", "build"],
      ["pnpm", "--filter", "@threenative/verify-tools", "build"],
      ["node", "tools/verify/dist/cli/example-build-sweep.js"],
    ],
    description: "Build-only sweep for generated-game examples outside the release evidence set.",
    metadata: {
      owner: "tools/verify example-build-sweep gate",
      profile: "smoke",
      reason: "Keeps de-enrolled examples buildable without requiring full QA/release evidence.",
      protects: "Generated-game inventory pruning, example build drift, and release gate scope.",
    },
  },
  "verify:template-production": {
    commands: [
      ["pnpm", "--filter", "@threenative/verify-tools", "build"],
      ["node", "tools/verify/dist/templateProductionGate.js"],
    ],
    description: "Maintained starter production workflow scaffold gate.",
    metadata: {
      owner: "tools/verify template-production gate",
      profile: "focused",
      reason: "Checks maintained starters directly so plan/improve/QA/release production workflow scaffolding cannot drift out of templates.",
      protects: "Fresh-project game-production scripts, proof-running QA defaults, and production metadata for playable loops.",
    },
  },
  "verify:template-playability": {
    commands: [
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["pnpm", "--filter", "@threenative/cli", "build"],
      ["pnpm", "--filter", "@threenative/verify-tools", "build"],
      ["node", "tools/verify/dist/templatePlayability.js"],
    ],
    description: "Maintained racing starter runtime playability gate.",
    metadata: {
      owner: "tools/verify template-playability gate",
      profile: "focused",
      reason: "Scaffolds the racing starter and runs validation, build, camera proof, modular track proof, playtest, and malformed-input negative proof.",
      protects: "Starter throttle movement, canonical controls, camera framing, track scale, and input validation before first-use regressions ship.",
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
  "verify:feature-parity-visual-polish": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["pnpm", "--filter", "@threenative/cli", "build"],
      ["pnpm", "--filter", "@threenative/verify-tools", "build"],
      ["node", "scripts/verify-v10-visual-calibration.mjs", "--group=lighting,materials,dense"],
      ["node", "tools/verify/dist/visualPolish.js"],
    ],
    description: "Cross-adapter visual polish evidence gate.",
    metadata: {
      owner: "tools/verify feature-parity visual-polish gate",
      profile: "focused",
      reason: "Aggregates calibrated screenshots with paired shadow/material reports and measured dense texture-variant evidence.",
      protects: "Promoted shadow profiles, specular material slots, billboard LOD calibration, and dense-scene texture budgets.",
    },
  },
  "verify:feature-parity-ui-native": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["pnpm", "--filter", "@threenative/cli", "build"],
      ["pnpm", "--filter", "@threenative/verify-tools", "build"],
      ["node", "scripts/verify-feature-parity-ui-native.mjs"],
      ["node", "tools/verify/dist/uiNative.js"],
    ],
    description: "Bounded native UI, text editing, accessibility, and attachment evidence gate.",
    metadata: {
      owner: "tools/verify feature-parity UI native gate",
      profile: "focused",
      reason: "Pairs real UI captures with cross-adapter effect, text/caret, accessibility, image, and world-attachment reports.",
      protects: "Bounded retained UI pixel claims and target-scoped native text/accessibility boundaries.",
    },
  },
  "verify:feature-parity-physics-native": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["pnpm", "--filter", "@threenative/verify-tools", "build"],
      ["node", "tools/verify/dist/physicsSelfVerification.js"],
      ["node", "tools/verify/dist/physicsNative.js"],
    ],
    description: "Native contact, mesh grounding, navigation residual, and physics boundary evidence gate.",
    metadata: {
      owner: "tools/verify feature-parity physics native gate",
      profile: "focused",
      reason: "Aggregates deep fixed-step contact sidecars with existing mesh-grounding and bounded navigation residual traces.",
      protects: "Promoted contact ordering, material/stack response, bounded mesh grounding, navigation residuals, and backend boundaries.",
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
      owner: "tools/verify assets-gltf-scene-workflow gate",
      profile: "focused",
      reason: "Validates the asset workflow through fixture data and aggregate runtime evidence.",
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
      owner: "tools/verify rendering-lights gate",
      profile: "focused",
      reason: "Uses rendered fixture evidence for lighting behavior that depends on runtime adapters and screenshots.",
      protects: "Lighting parity, rendered fixture artifacts, and release-required visual evidence.",
    },
  },
};

const RELEASE_PROFILE_GATES = [
  "verify:animation-physics-residuals",
  "verify:bundle-safety-hardening",
  "verify:generated-games",
  "verify:example-build-sweep",
  "verify:input-ui-polish",
  "verify:persistence-reload",
  "verify:production-hardening",
  "verify:rendering-residuals",
  "verify:runtime-gameplay-host",
  "verify:runtime-prefabs-hierarchy",
  "verify:runtime-query-diffing",
  "verify:scripting-helpers-lifecycle",
  "verify:template-production",
  "verify:ui-persistence-settings-facades",
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
