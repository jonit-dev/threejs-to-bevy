type CommandSpec = readonly [command: string, ...args: string[]];

interface FocusedGate {
  commands: readonly CommandSpec[];
  description: string;
  metadata: {
    owner: string;
    profile: "smoke" | "changed" | "focused" | "release" | "full";
    reason: string;
    protects: string;
  };
}

function scriptGate(
  name: string,
  script: string,
  description: string,
  protects: string,
): [string, FocusedGate] {
  return [
    name,
    {
      commands: [["node", `scripts/${script}`]],
      description,
      metadata: {
        owner: `scripts/${script}`,
        profile: "focused",
        reason: "Produces cross-runtime or durable-artifact evidence through the focused gate dispatcher.",
        protects,
      },
    },
  ];
}

const SCRIPT_GATES: Array<[string, FocusedGate]> = [
  scriptGate(
    "verify:baseline:visual-parity",
    "verify-baseline-visual-parity.mjs",
    "Baseline visual parity gate.",
    "Durable web/Bevy screenshot parity evidence across checkpoint scenes.",
  ),
  scriptGate(
    "verify:v8:overlay",
    "verify-v8-overlay-webview.mjs",
    "Overlay webview gate.",
    "Optional overlay bundle/runtime bridge behavior and unsupported-host diagnostics.",
  ),
  scriptGate(
    "verify:v8:camera-views",
    "verify-v8-camera-views.mjs",
    "Camera and multi-view gate.",
    "Camera helpers, viewports, render targets, and screenshot evidence.",
  ),
  scriptGate(
    "verify:v8:color-parity",
    "verify-v8-color-parity.mjs",
    "Color parity gate.",
    "Calibrated color and tone screenshot evidence.",
  ),
  scriptGate(
    "verify:v8:material-parity",
    "verify-v8-material-parity.mjs",
    "Material parity gate.",
    "Web/Bevy material and texture parity artifacts.",
  ),
  scriptGate(
    "verify:v8:animation-transform",
    "verify-v8-animation-transform-trace.mjs",
    "Animation transform trace gate.",
    "Runtime transform animation trace parity.",
  ),
  scriptGate(
    "verify:v8:animation-controls",
    "verify-v8-animation-controls.mjs",
    "Animation controls gate.",
    "Animation control runtime evidence and diagnostics.",
  ),
  scriptGate(
    "verify:v8:rigid-body-primitive",
    "verify-v8-rigid-body-primitive-trace.mjs",
    "Rigid-body primitive trace gate.",
    "Primitive rigid-body trace parity.",
  ),
  scriptGate(
    "verify:v8:asset-load-gltf-inspection",
    "verify-v8-asset-load-gltf-inspection.mjs",
    "Asset load glTF inspection gate.",
    "Generated glTF asset inspection evidence.",
  ),
  scriptGate(
    "verify:v8:rendering-quality",
    "verify-v8-rendering-quality.mjs",
    "Rendering quality gate.",
    "Screenshot and renderer quality artifacts.",
  ),
  scriptGate(
    "verify:v9:skeletal-animation",
    "verify-v9-skeletal-animation.mjs",
    "Skeletal animation gate.",
    "Skeletal animation runtime evidence.",
  ),
  scriptGate(
    "verify:v9:animation-state",
    "verify-v9-animation-state.mjs",
    "Animation state gate.",
    "Web/native animation service state traces and diff artifacts.",
  ),
  scriptGate(
    "verify:v9:animation-blending",
    "verify-v9-animation-blending.mjs",
    "Animation blending gate.",
    "Bounded crossfade blend traces and event ordering evidence.",
  ),
  scriptGate(
    "verify:v9:animation-particles",
    "verify-v9-animation-particles.mjs",
    "Animation particles gate.",
    "Rendered particle count and web/native visual evidence.",
  ),
  scriptGate(
    "verify:v9:physics-character",
    "verify-v9-physics-character.mjs",
    "Physics character gate.",
    "Character physics conformance and runtime report artifacts.",
  ),
  scriptGate(
    "verify:v10:advanced-physics",
    "verify-v10-advanced-physics.mjs",
    "Advanced physics gate.",
    "Advanced physics residual diagnostics and evidence.",
  ),
  scriptGate(
    "verify:v10:debug-draw",
    "verify-v10-debug-draw.mjs",
    "Debug draw gate.",
    "Debug rendering evidence and diagnostics.",
  ),
  scriptGate(
    "verify:v10:editor-panels",
    "verify-v10-editor-panels.mjs",
    "Editor panels gate.",
    "Bounded editor panel evidence.",
  ),
  scriptGate(
    "verify:v10:editor-property-editing",
    "verify-v10-editor-property-editing.mjs",
    "Editor property editing gate.",
    "Editor property editing artifacts and diagnostics.",
  ),
  scriptGate(
    "verify:v10:editor-tools",
    "verify-v10-editor-tools.mjs",
    "Editor tools gate.",
    "Editor tool evidence.",
  ),
  scriptGate(
    "verify:v10:emissive-bloom",
    "verify-v10-emissive-bloom.mjs",
    "Emissive bloom gate.",
    "Visual evidence for emissive and bloom parity.",
  ),
  scriptGate(
    "verify:v10:native-instancing",
    "verify-v10-native-instancing.mjs",
    "Native instancing gate.",
    "Native instancing evidence and diagnostics.",
  ),
  scriptGate(
    "verify:v10:native-ui-effects",
    "verify-v10-native-ui-effects.mjs",
    "Native UI effects gate.",
    "Native UI effect evidence.",
  ),
  scriptGate(
    "verify:v10:native-ui-images",
    "verify-v10-native-ui-images.mjs",
    "Native UI images gate.",
    "Native UI image evidence.",
  ),
  scriptGate(
    "verify:v10:native-rich-text",
    "verify-v10-native-rich-text.mjs",
    "Native rich text gate.",
    "Native rich text evidence.",
  ),
  scriptGate(
    "verify:v10:post-antialiasing",
    "verify-v10-post-antialiasing.mjs",
    "Post antialiasing gate.",
    "Post-processing and antialiasing evidence.",
  ),
  [
    "check:quality:v9",
    {
      commands: [
        ["pnpm", "--filter", "@threenative/verify-tools", "build"],
        ["node", "scripts/check-v9-quality-gates.mjs"],
      ],
      description: "V9 release quality catalog gate.",
      metadata: {
        owner: "tools/verify v9 quality catalog",
        profile: "focused",
        reason: "Protects the release-focused gate list and required V9 evidence wiring.",
        protects: "Release-focused V9 gate catalog and required evidence registration.",
      },
    },
  ],
];

export const SCRIPT_ONLY_GATES: Record<string, FocusedGate> = Object.fromEntries(SCRIPT_GATES);

export function listScriptGateNames(): string[] {
  return Object.keys(SCRIPT_ONLY_GATES).sort();
}
