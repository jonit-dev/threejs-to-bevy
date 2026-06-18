import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type CommandSpec = readonly [command: string, ...args: string[]];

export interface FocusedGate {
  commands: readonly CommandSpec[];
  description: string;
}

export const FOCUSED_GATES: Record<string, FocusedGate> = {
  "verify:animation-physics-residuals": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["node", "scripts/verify-animation-physics-residuals.mjs"],
    ],
    description: "Animation, physics, and navigation residual gate.",
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
  },
  "verify:input-ui-polish": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["node", "scripts/verify-input-ui-polish.mjs"],
    ],
    description: "Input and UI platform polish gate.",
  },
  "verify:persistence-reload": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["node", "scripts/verify-persistence-reload.mjs"],
    ],
    description: "Persistence and hot reload gate.",
  },
  "verify:production-hardening": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["pnpm", "--filter", "@threenative/cli", "build"],
      ["node", "scripts/verify-production-hardening.mjs"],
    ],
    description: "Production audio, diagnostics, and packaging gate.",
  },
  "verify:rendering-residuals": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["node", "scripts/verify-rendering-residuals.mjs"],
    ],
    description: "Rendering, materials, and geometry residual gate.",
  },
  "verify:runtime-gameplay-host": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["node", "scripts/verify-runtime-gameplay-host.mjs"],
    ],
    description: "Runtime gameplay host gate.",
  },
  "verify:scene-lifecycle": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["node", "scripts/verify-scene-lifecycle.mjs"],
    ],
    description: "Scene lifecycle and flow contract gate.",
  },
  "verify:v10:ecs-tags-groups": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "test", "--", "--run", "conformance"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "test", "--", "--run", "conformance"],
      ["cargo", "test", "--manifest-path", "runtime-bevy/Cargo.toml", "-p", "threenative_runtime", "should_report_v10_ecs_tags"],
    ],
    description: "V10 ECS tags and scene groups focused gate.",
  },
  "verify:v10:visual-calibration": {
    commands: [
      ["pnpm", "--filter", "@threenative/cli", "build"],
      ["node", "scripts/verify-v10-visual-calibration.mjs"],
    ],
    description: "V10 visual calibration gate.",
  },
  "verify:v9:assets-gltf-scene-workflow": {
    commands: [
      ["pnpm", "--filter", "@threenative/cli", "build"],
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["node", "scripts/verify-v9-assets-gltf-scene-workflow.mjs"],
    ],
    description: "V9 asset GLTF scene workflow gate.",
  },
  "verify:v9:rendering-lights": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["pnpm", "--filter", "@threenative/cli", "build"],
      ["node", "scripts/verify-v9-rendering-lights.mjs"],
    ],
    description: "V9 rendering lights gate.",
  },
};

const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));

export function listFocusedGateNames(): string[] {
  return Object.keys(FOCUSED_GATES).sort();
}

export function runFocusedGate(gateName: string, forwardedArgs: readonly string[] = [], root = repoRoot): number {
  const gate = FOCUSED_GATES[gateName];
  if (!gate) {
    process.stderr.write(`Unknown verify gate '${gateName}'. Known gates: ${listFocusedGateNames().join(", ")}\n`);
    return 1;
  }

  for (let index = 0; index < gate.commands.length; index += 1) {
    const [command, ...args] = gate.commands[index]!;
    const isFinalCommand = index === gate.commands.length - 1;
    const result = spawnSync(command, isFinalCommand ? [...args, ...forwardedArgs] : args, {
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [gateName, ...forwardedArgs] = process.argv.slice(2);
  if (!gateName) {
    process.stderr.write(`Usage: node tools/verify/dist/cli/run.js <gate>\nKnown gates: ${listFocusedGateNames().join(", ")}\n`);
    process.exitCode = 1;
  } else {
    process.exitCode = runFocusedGate(gateName, forwardedArgs);
  }
}
