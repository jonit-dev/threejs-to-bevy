import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { FocusedGate, GateProfile } from "./cli/run.js";
import type { FixtureCatalog } from "./conformance.js";

type CommandSpec = readonly [command: string, ...args: string[]];

export type GateTimingCategory = "artifact" | "conformance" | "focused-gate" | "setup" | "test" | "visual-native";
export type GateConflictPolicy = "none" | "conformance-artifact-conflict";

export interface GateDescriptor {
  artifact: {
    reportPath: string;
  };
  command: {
    commands: readonly CommandSpec[];
  };
  conflictPolicy: GateConflictPolicy;
  description: string;
  focused: {
    profile: GateProfile;
  };
  name: string;
  owner: string;
  protects: string;
  reason: string;
  release: {
    enrolled: boolean;
    name: string;
    timingCategory: GateTimingCategory;
  };
}

export interface GateDescriptorMigrationGap {
  category: "focused-inline";
  name: string;
  owner: string;
  reason: string;
  reviewed: string;
}

const STATIC_GATE_DESCRIPTORS: readonly GateDescriptor[] = [
  {
    artifact: { reportPath: "tools/verify/artifacts/distribution/android/webview/verification-report.json" },
    command: {
      commands: [
        ["node", "--test", "scripts/verify-android-webview-distribution.test.mjs"],
        ["node", "scripts/verify-android-webview-distribution.mjs", "--input", "examples/chess/artifacts/distribution/android/webview/phase-7-partial-proof-report.json", "--emulator-only"],
      ],
    },
    conflictPolicy: "none",
    description: "Android embedded-webview artifact and lifecycle evidence gate.",
    focused: { profile: "focused" },
    name: "verify:android-webview-distribution",
    owner: "distribution Android webview report collector",
    protects: "Android permissions, signed release metadata, install/launch/input/lifecycle proof, and artifact hashes.",
    reason: "Prevents Android webview advancement without hash-bound emulator proof; physical-device proof remains a promotion prerequisite.",
    release: { enrolled: false, name: "verify Android webview distribution", timingCategory: "visual-native" },
  },
  {
    artifact: { reportPath: "tools/verify/artifacts/distribution/desktop/verification-report.json" },
    command: {
      commands: [
        ["pnpm", "--filter", "@threenative/ir", "build"],
        ["node", "--test", "scripts/verify-desktop-distribution.test.mjs"],
        ["node", "scripts/verify-desktop-distribution.mjs", "--input", "examples/chess/artifacts/distribution/desktop-proof-report.json", "--lifecycle", "implemented"],
      ],
    },
    conflictPolicy: "none",
    description: "Registry-derived desktop distribution artifact and native-host launch evidence gate.",
    focused: { profile: "focused" },
    name: "verify:desktop-distribution",
    owner: "distribution desktop report collector",
    protects: "Implemented desktop Bevy and embedded-webview rows, artifact hashes, eligible hosts, and launch evidence.",
    reason: "Prevents a desktop registry row from advancing without a real artifact and launch proof from its eligible native host.",
    release: { enrolled: false, name: "verify desktop distribution", timingCategory: "visual-native" },
  },
  {
    artifact: { reportPath: "tools/verify/artifacts/native-overlay-cef/verification-report.json" },
    command: {
      commands: [
        ["pnpm", "--filter", "@threenative/verify-tools", "build"],
        ["node", "--test", "tools/verify/dist/nativeOverlayCefGate.test.js"],
        ["node", "tools/verify/dist/nativeOverlayCefGate.js"],
      ],
    },
    conflictPolicy: "none",
    description: "Native CEF off-screen overlay compositor evidence gate.",
    focused: { profile: "release" },
    name: "verify:native-overlay-cef",
    owner: "tools/verify native CEF overlay gate",
    protects: "CEF chooser, hover, Black-side start, HUD, modal removal, bridge, one-window, startup, and mounted-package evidence.",
    reason: "Rejects stale, blank, wrong-region, or drifted native overlay pixels so bridge-only state cannot promote a broken compositor path.",
    release: { enrolled: true, name: "verify native overlay CEF", timingCategory: "visual-native" },
  },
  {
    artifact: { reportPath: "tools/verify/artifacts/overlay-scaffold/verification-report.json" },
    command: {
      commands: [
        ["pnpm", "--filter", "@threenative/cli", "build"],
        ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
        ["pnpm", "--filter", "@threenative/verify-tools", "build"],
        ["node", "tools/verify/dist/overlayScaffoldGate.js"],
      ],
    },
    conflictPolicy: "none",
    description: "Generated React webview overlay scaffold gate.",
    focused: { profile: "release" },
    name: "verify:overlay-scaffold",
    owner: "tools/verify overlay scaffold gate",
    protects: "Tailwind-default and vanilla generated overlay installation, local static output, preset isolation, and release evidence.",
    reason: "Builds both descriptor-owned overlay presets from maintained clean starters so generated dependency and output drift fails before release.",
    release: { enrolled: true, name: "verify overlay scaffold", timingCategory: "focused-gate" },
  },
  {
    artifact: { reportPath: "tools/verify/artifacts/emitted-commands/verification-report.json" },
    command: {
      commands: [
        ["pnpm", "--filter", "@threenative/authoring", "build"],
        ["pnpm", "--filter", "@threenative/compiler", "build"],
        ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
        ["pnpm", "--filter", "@threenative/cli", "build"],
        ["pnpm", "--filter", "@threenative/verify-tools", "build"],
        ["node", "tools/verify/dist/emittedCommandGate.js"],
      ],
    },
    conflictPolicy: "none",
    description: "Executable plan-emitted command acceptance gate.",
    focused: { profile: "focused" },
    name: "verify:emitted-commands",
    owner: "tools/verify emitted command gate",
    protects: "Registry-derived plan commands, cookbook ids, recipe adoption, JSON purity, and zero emitted-command failures across templates and archetypes.",
    reason: "Runs every command and cookbook id emitted by game plans before benchmark agents can encounter drift or repair detours.",
    release: { enrolled: false, name: "verify emitted commands", timingCategory: "focused-gate" },
  },
  {
    artifact: { reportPath: "tools/verify/artifacts/agent-io/verification-report.json" },
    command: {
      commands: [
        ["pnpm", "--filter", "@threenative/sdk", "build"],
        ["pnpm", "--filter", "@threenative/ir", "build"],
        ["pnpm", "--filter", "@threenative/authoring", "build"],
        ["pnpm", "--filter", "@threenative/compiler", "build"],
        ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
        ["pnpm", "--filter", "@threenative/cli", "build"],
        ["pnpm", "--filter", "@threenative/verify-tools", "build"],
        ["node", "tools/verify/dist/agentIoBudget.js"],
      ],
    },
    conflictPolicy: "none",
    description: "Agent-facing CLI stdout budget gate.",
    focused: { profile: "focused" },
    name: "verify:agent-io",
    owner: "tools/verify agent IO budget gate",
    protects: "Agent token budget, compact playtest/iterate reports, and stable diagnostics for output bloat regressions.",
    reason: "Measures documented agent commands so normal JSON stdout stays bounded and deep logs remain artifact-only.",
    release: { enrolled: true, name: "verify agent io", timingCategory: "focused-gate" },
  },
  {
    artifact: { reportPath: "tools/verify/artifacts/session-cost/verification-report.json" },
    command: {
      commands: [
        ["pnpm", "--filter", "@threenative/sdk", "build"],
        ["pnpm", "--filter", "@threenative/ir", "build"],
        ["pnpm", "--filter", "@threenative/authoring", "build"],
        ["pnpm", "--filter", "@threenative/compiler", "build"],
        ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
        ["pnpm", "--filter", "@threenative/cli", "build"],
        ["pnpm", "--filter", "@threenative/verify-tools", "build"],
        ["node", "tools/verify/dist/sessionCostGate.js"],
      ],
    },
    conflictPolicy: "none",
    description: "Deterministic scaffold session-cost ratchet gate.",
    focused: { profile: "focused" },
    name: "verify:session-cost",
    owner: "tools/verify session cost gate",
    protects: "Agent token budget, zero-repair scaffold paths, compact iterate summaries, and CI-visible session cost ratchets.",
    reason: "Replays maintained scaffold-first paths without LLM agents and fails step, command-failure, or compact-output regressions before expensive benchmark rounds.",
    release: { enrolled: true, name: "verify session cost", timingCategory: "focused-gate" },
  },
  {
    artifact: { reportPath: "tools/verify/artifacts/webview-package/verification-report.json" },
    command: {
      commands: [
        ["pnpm", "--dir", "examples/chess", "run", "build:overlay"],
        ["pnpm", "--filter", "@threenative/compiler", "build"],
        ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
        ["pnpm", "--filter", "@threenative/cli", "build"],
        ["pnpm", "--dir", "examples/chess", "run", "build"],
        ["pnpm", "--filter", "@threenative/verify-tools", "build"],
        ["node", "tools/verify/dist/webviewPackageGate.js"],
      ],
    },
    conflictPolicy: "none",
    description: "Desktop-web package measurement gate.",
    focused: { profile: "focused" },
    name: "verify:webview-package",
    owner: "tools/verify webview package gate",
    protects: "Native path decision evidence, webview fallback package artifact quality, and the parity-freeze boundary around Bevy promotion claims.",
    reason: "Packages a real web/desktop conformance bundle through the desktop-web runtime and records size, startup, input, settings, and save-slot evidence.",
    release: { enrolled: true, name: "verify webview package", timingCategory: "focused-gate" },
  },
] as const;

export const GATE_DESCRIPTORS: readonly GateDescriptor[] = [
  ...STATIC_GATE_DESCRIPTORS,
  ...fixtureCatalogGateDescriptors(),
];

export function fixtureCatalogGateDescriptors(root?: string): GateDescriptor[] {
  const repoRoot = root ?? resolve(fileURLToPath(new URL("../../../", import.meta.url)));
  const path = resolve(repoRoot, "packages/ir/fixtures/conformance/fixture-catalog.json");
  const catalog = JSON.parse(readFileSync(path, "utf8")) as FixtureCatalog;
  const descriptors = new Map<string, GateDescriptor>();
  for (const fixture of catalog.fixtures) {
    const gate = fixture.focusedGate;
    if (gate === undefined) continue;
    const reportPath = fixture.reportArtifacts.find((artifact) => artifact.endsWith("/verification-report.json"));
    if (reportPath === undefined) {
      throw new Error(`Fixture '${fixture.canonicalId}' focused gate must declare a verification-report.json artifact.`);
    }
    const descriptor: GateDescriptor = {
      artifact: { reportPath },
      command: { commands: gate.commands.map((command) => toCommandSpec(fixture.canonicalId, command)) },
      conflictPolicy: gate.conflictPolicy,
      description: gate.description,
      focused: { profile: gate.profile },
      name: fixture.aggregateGate,
      owner: gate.owner,
      protects: gate.protects,
      reason: gate.reason,
      release: gate.release,
    };
    const existing = descriptors.get(descriptor.name);
    if (existing !== undefined && !isDeepEqual(existing, descriptor)) {
      throw new Error(`Fixtures enrolled in '${descriptor.name}' must share one focused gate descriptor.`);
    }
    descriptors.set(descriptor.name, descriptor);
  }
  return [...descriptors.values()];
}

function isDeepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function toCommandSpec(fixtureId: string, command: string[]): CommandSpec {
  const [executable, ...args] = command;
  if (executable === undefined || executable.length === 0) {
    throw new Error(`Fixture '${fixtureId}' focused gate commands must name an executable.`);
  }
  return [executable, ...args];
}

export const GATE_DESCRIPTOR_MIGRATION_GAPS: readonly GateDescriptorMigrationGap[] = [
  { category: "focused-inline", name: "test:gameplay", owner: "tools/verify gameplay parity gate", reason: "Smoke/full gameplay profiles still share bespoke profile-specific argv and report semantics.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:animation-physics-residuals", owner: "tools/verify animation-physics-residuals gate", reason: "Script-backed residual proof needs descriptor artifact coverage before migration.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:bundle-safety-hardening", owner: "tools/verify bundle-safety-hardening gate", reason: "Release-enrolled hardening proof remains inline until the next descriptor migration wave.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:character-physics-contacts", owner: "tools/verify character-physics-contacts gate", reason: "Physics contact parity proof remains inline pending descriptor artifact coverage.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:default-look", owner: "tools/verify render look gate", reason: "Render-look proof has paired default/look gate semantics not yet modeled in descriptors.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:editor-ai-chat", owner: "tools/verify editor AI chat gate", reason: "Editor chat proof remains inline until editor gate families move together.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:editor-package", owner: "tools/verify editor package gate", reason: "Editor package proof remains inline until editor artifact contracts move together.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:efficient-scale", owner: "tools/verify efficient scale gate", reason: "Efficient-scale texture and performance budgets need descriptor budget fields before migration.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:feature-parity-visual-polish", owner: "tools/verify feature-parity visual-polish gate", reason: "Visual-polish proof composes screenshot calibration, native conformance, and measured texture artifacts that are not yet modeled as descriptor dependencies.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:feature-parity-ui-native", owner: "tools/verify feature-parity UI native gate", reason: "UI-native proof composes browser/native screenshots, platform-scoped accessibility metadata, and cross-adapter traces not yet modeled as descriptor dependencies.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:feature-parity-physics-native", owner: "tools/verify feature-parity physics native gate", reason: "Physics-native proof composes generated fixed-step scenes, native trace binaries, residual navigation evidence, and negative boundary fixtures.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:feature-parity-audio-platform", owner: "tools/verify feature-parity audio-platform gate", reason: "Audio/platform proof composes native trace binaries, package preflight, device support reports, and shared window-policy diagnostics.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:example-build-sweep", owner: "tools/verify example build sweep", reason: "Build-sweep release behavior is still coupled to example discovery logic.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:game-production", owner: "tools/verify game production gate", reason: "Generated-game aggregate proof uses project config and remains separate from descriptor-owned proof gates.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:gameplay-parity", owner: "tools/verify gameplay parity gate", reason: "Smoke/full gameplay profiles still share bespoke profile-specific argv and report semantics.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:generated-games", owner: "tools/verify generated games gate", reason: "Generated-game release enrollment is already config-owned and should migrate separately.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:input-ui-polish", owner: "tools/verify input-ui-polish gate", reason: "Release-enrolled UI/input proof remains inline until conflict and timing metadata migrate.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:particle-commands", owner: "tools/verify particle command gate", reason: "Particle command fixture proof remains inline pending descriptor artifact coverage.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:persistence-reload", owner: "tools/verify persistence reload gate", reason: "Release-enrolled persistence proof remains inline until the next descriptor migration wave.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:physics-self-verification", owner: "tools/verify physics self-verification gate", reason: "Physics self-verification has multi-scene report semantics not yet modeled in descriptors.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:portable-shader-material", owner: "tools/verify portable shader material gate", reason: "Portable shader proof has custom fixture/sample-region semantics not yet modeled in descriptors.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:production-hardening", owner: "tools/verify production hardening gate", reason: "Release-enrolled production proof remains inline until conflict and timing metadata migrate.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:render-look", owner: "tools/verify render look gate", reason: "Render-look proof has paired default/look gate semantics not yet modeled in descriptors.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:rendering-residuals", owner: "tools/verify rendering residuals gate", reason: "Release-enrolled rendering residual proof remains inline until descriptor artifact coverage expands.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:runtime-gameplay-host", owner: "tools/verify runtime gameplay host gate", reason: "Release-enrolled runtime host proof remains inline until descriptor artifact coverage expands.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:runtime-prefabs-hierarchy", owner: "tools/verify runtime prefabs hierarchy gate", reason: "Conformance artifact conflict handling must move into descriptors before migration.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:runtime-query-diffing", owner: "tools/verify runtime query diffing gate", reason: "Conformance artifact conflict handling must move into descriptors before migration.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:runtime-write-audit", owner: "tools/verify runtime write-audit gate", reason: "Runtime write-audit proof remains inline until descriptor artifact coverage expands.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:scene-lifecycle", owner: "tools/verify scene lifecycle gate", reason: "Scene lifecycle proof remains inline pending descriptor artifact coverage.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:scripting-helpers-lifecycle", owner: "tools/verify scripting helpers lifecycle gate", reason: "Release-enrolled scripting helper proof remains inline until descriptor artifact coverage expands.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:template-playability", owner: "tools/verify template playability gate", reason: "Template playability proof remains inline until template manifests own gate expectations.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:template-production", owner: "tools/verify template production gate", reason: "Template production proof remains inline until template manifests own gate expectations.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:ui-persistence-settings-facades", owner: "tools/verify UI persistence settings facades gate", reason: "Conformance artifact conflict handling must move into descriptors before migration.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:v10:ecs-tags-groups", owner: "tools/verify v10 ECS tags/groups gate", reason: "Legacy milestone compatibility gate remains inline during staged cleanup.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:v10:visual-calibration", owner: "tools/verify visual calibration gate", reason: "Visual calibration proof has custom screenshot metric semantics not yet modeled in descriptors.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:v9:assets-gltf-scene-workflow", owner: "tools/verify assets glTF scene workflow gate", reason: "Legacy milestone compatibility gate remains inline during staged cleanup.", reviewed: "2026-07-09" },
  { category: "focused-inline", name: "verify:v9:rendering-lights", owner: "tools/verify rendering lights gate", reason: "Legacy milestone compatibility gate remains inline during staged cleanup.", reviewed: "2026-07-09" },
] as const;

export function descriptorFocusedGates(): Record<string, FocusedGate> {
  return Object.fromEntries(GATE_DESCRIPTORS.map((descriptor) => [descriptor.name, {
    commands: descriptor.command.commands,
    description: descriptor.description,
    metadata: {
      owner: descriptor.owner,
      profile: descriptor.focused.profile,
      protects: descriptor.protects,
      reason: descriptor.reason,
    },
  }]));
}

export function descriptorReleaseFocusedGates(): Array<{ name: string; reportPath: string; script: string }> {
  return GATE_DESCRIPTORS
    .filter((descriptor) => descriptor.release.enrolled)
    .map((descriptor) => ({
      name: descriptor.release.name,
      reportPath: descriptor.artifact.reportPath,
      script: descriptor.name,
    }));
}

export function validateGateDescriptors(descriptors: readonly GateDescriptor[] = GATE_DESCRIPTORS): string[] {
  const diagnostics: string[] = [];
  const names = new Set<string>();
  const artifactPaths = new Set<string>();
  for (const descriptor of descriptors) {
    if (names.has(descriptor.name)) {
      diagnostics.push(`${descriptor.name}:duplicate-name`);
    }
    names.add(descriptor.name);
    if (!descriptor.artifact.reportPath.startsWith("tools/verify/artifacts/") || !descriptor.artifact.reportPath.endsWith(".json")) {
      diagnostics.push(`${descriptor.name}:artifact-path`);
    }
    if (artifactPaths.has(descriptor.artifact.reportPath)) {
      diagnostics.push(`${descriptor.name}:duplicate-artifact`);
    }
    artifactPaths.add(descriptor.artifact.reportPath);
    if (!["changed", "focused", "full", "release", "smoke"].includes(descriptor.focused.profile)) {
      diagnostics.push(`${descriptor.name}:profile`);
    }
    if (descriptor.command.commands.length === 0) {
      diagnostics.push(`${descriptor.name}:commands`);
    }
  }
  return diagnostics;
}

export function validateGateDescriptorMigrationGaps(options: {
  descriptors?: readonly GateDescriptor[];
  focusedGateNames: readonly string[];
  gaps?: readonly GateDescriptorMigrationGap[];
  scriptGateNames?: readonly string[];
}): string[] {
  const descriptors = options.descriptors ?? GATE_DESCRIPTORS;
  const gaps = options.gaps ?? GATE_DESCRIPTOR_MIGRATION_GAPS;
  const descriptorNames = new Set(descriptors.map((descriptor) => descriptor.name));
  const focusedGateNames = new Set(options.focusedGateNames);
  const scriptGateNames = new Set(options.scriptGateNames ?? []);
  const gapNames = new Set(gaps.map((gap) => gap.name));
  const diagnostics: string[] = [];

  for (const name of [...focusedGateNames].sort()) {
    if (!descriptorNames.has(name) && !scriptGateNames.has(name) && !gapNames.has(name)) {
      diagnostics.push(`${name}:missing-migration-gap`);
    }
  }
  for (const gap of gaps) {
    if (descriptorNames.has(gap.name)) {
      diagnostics.push(`${gap.name}:stale-migration-gap`);
    }
    if (!focusedGateNames.has(gap.name)) {
      diagnostics.push(`${gap.name}:unknown-migration-gap`);
    }
    if (gap.owner.trim().length === 0 || gap.reason.trim().length === 0 || gap.reviewed.trim().length === 0) {
      diagnostics.push(`${gap.name}:unclassified-migration-gap`);
    }
  }
  return diagnostics;
}
