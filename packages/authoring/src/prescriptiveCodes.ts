import type { IAuthoringDiagnosticFix } from "./diagnostics.js";

export interface IPrescriptiveDiagnosticCode {
  code: string;
  evidence: string;
  fix: IAuthoringDiagnosticFix;
  snippetKind?: "json" | "typescript";
}

const helperPackages = [
  "@threenative/checkpoint-race-kit",
  "@threenative/collector-kit",
  "@threenative/lane-runner-kit",
  "@threenative/racing-kit",
  "@threenative/script-stdlib",
] as const;

export const PRESCRIPTIVE_DIAGNOSTIC_CODES: readonly IPrescriptiveDiagnosticCode[] = [
  {
    code: "TN_SCRIPT_UNSUPPORTED_IMPORT",
    evidence: "Compiler sourceRef tests and agent QA commonly hit arbitrary Three.js/local imports before learning the portable helper allowlist.",
    fix: {
      allowed: helperPackages,
      cookbook: "script-portable-system",
      docs: "docs/contracts/scripting.md",
      instruction: "Replace arbitrary, namespace, or default imports with named imports from approved portable helper packages, or inline deterministic helpers inside the exported system.",
      snippet: 'import { Vector3 } from "@threenative/script-stdlib";',
    },
    snippetKind: "typescript",
  },
  {
    code: "TN_SCRIPT_MODULE_LOCAL_REFERENCE_UNSUPPORTED",
    evidence: "Compiler sourceRef fixtures cover exported systems that call module-local helpers which are not emitted into scripts.bundle.js.",
    fix: {
      allowed: helperPackages,
      cookbook: "script-portable-system",
      docs: "docs/contracts/scripting.md",
      instruction: "Move helper functions and constants inside the exported system function, or replace them with supported portable helper imports.",
      snippet: "export function update(context) {\n  const speed = 3.5;\n  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));\n  return clamp(speed, 0, 10);\n}",
    },
    snippetKind: "typescript",
  },
  {
    code: "TN_AUTHORING_GENERATED_SOURCE_PATH",
    evidence: "Structured source tests and editor operation tests reject attempts to mutate dist/game.bundle or scripts.bundle.js.",
    fix: {
      docs: "docs/contracts/authoring-source-documents.md",
      instruction: "Edit the owning durable source document under content/** or src/scripts/**, then rebuild generated bundle artifacts.",
      snippet: '{ "source": "content/scenes/arena.scene.json" }',
    },
    snippetKind: "json",
  },
  {
    code: "TN_AUTHORING_SHAPE_INVALID",
    evidence: "Authoring operation payload validation produces the most common validation failure across scene, UI, material, and runtime document fixtures.",
    fix: {
      cookbook: "scene-first-pass",
      docs: "docs/contracts/authoring-mcp.md",
      instruction: "Send the operation payload shape named by the diagnostic path, using arrays/objects/scalars exactly as the structured source schema expects.",
      snippet: '{ "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] }',
    },
    snippetKind: "json",
  },
  {
    code: "TN_AUTHORING_REF_MISSING",
    evidence: "Scene validation fixtures and MCP parity tests cover missing entity, prefab, material, resource, and UI references.",
    fix: {
      cookbook: "scene-first-pass",
      docs: "docs/contracts/authoring-mcp.md",
      instruction: "Create the referenced durable declaration first or update the source reference to one of the declared stable IDs.",
      snippet: '{ "id": "player-kart" }',
    },
    snippetKind: "json",
  },
  {
    code: "TN_AUTHORING_DUPLICATE_ENTITY_ID",
    evidence: "Structured scene validation fixtures reject duplicate stable entity IDs.",
    fix: {
      docs: "docs/contracts/authoring-mcp.md",
      instruction: "Give each scene entity a unique stable id and update any references that pointed at the duplicate.",
      snippet: '{ "id": "player-kart-2" }',
    },
    snippetKind: "json",
  },
  {
    code: "TN_AUTHORING_DUPLICATE_DOCUMENT_ID",
    evidence: "Document-level source validation rejects duplicate IDs before source mutation.",
    fix: {
      docs: "docs/contracts/authoring-mcp.md",
      instruction: "Rename one durable source declaration or mutate the existing declaration instead of adding a second document with the same id.",
      snippet: '{ "id": "mat.track-asphalt" }',
    },
    snippetKind: "json",
  },
  {
    code: "TN_AUTHORING_DUPLICATE_SCENE_ID",
    evidence: "CLI scene-create and compiler capture fixtures reject duplicate scene IDs.",
    fix: {
      docs: "docs/contracts/authoring-mcp.md",
      instruction: "Use a new scene id or mutate the existing scene document that already owns this id.",
      snippet: '{ "id": "scene.arena.variant" }',
    },
    snippetKind: "json",
  },
  {
    code: "TN_IR_TRANSFORM_VALUE_INVALID",
    evidence: "IR validation fixtures cover invalid Transform position/rotation/scale vectors emitted from source.",
    fix: {
      docs: "docs/contracts/ir.md",
      instruction: "Use finite numeric Transform vectors; repair the durable scene source that emitted this IR path.",
      snippet: '{ "Transform": { "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] } }',
    },
    snippetKind: "json",
  },
  {
    code: "TN_IR_MESH_RENDERER_MATERIAL_MISSING",
    evidence: "IR validation fixtures cover missing material references after bundle emission.",
    fix: {
      cookbook: "materials-first-pass",
      docs: "docs/contracts/ir.md",
      instruction: "Add the missing material to the durable material source document or update MeshRenderer.material to an existing material id.",
      snippet: '{ "id": "mat.default", "color": "#ffffff", "roughness": 0.8, "metalness": 0 }',
    },
    snippetKind: "json",
  },
  {
    code: "TN_PLAYTEST_SCENARIO_INVALID",
    evidence: "Playtest scenario tests cover malformed scenario files and missing required scenario fields.",
    fix: {
      docs: "docs/workflows/playtesting.md",
      instruction: "Use playtest schemaVersion 1 with a file-safe name, target, viewport, warmupFrames, and non-empty steps.",
      snippet: '{ "schemaVersion": 1, "name": "forward-smoke", "target": "web", "viewport": { "width": 1280, "height": 720 }, "warmupFrames": 10, "steps": [{ "press": "KeyW", "holdFrames": 30, "release": true }] }',
    },
    snippetKind: "json",
  },
  {
    code: "TN_PLAYTEST_SCENARIO_STEP_INVALID",
    evidence: "Playtest scenario tests cover invalid steps without press/waitFrames and non-positive frame counts.",
    fix: {
      docs: "docs/workflows/playtesting.md",
      instruction: "Give each step either a press with positive holdFrames or a positive waitFrames value.",
      snippet: '{ "press": "KeyW", "holdFrames": 30, "release": true }',
    },
    snippetKind: "json",
  },
  {
    code: "TN_SCRIPT_RUNTIME_IMPORT_UNSUPPORTED",
    evidence: "Compiler portable script tests reject imports from Three.js, Bevy, and runtime adapter internals.",
    fix: {
      allowed: ["@threenative/sdk", ...helperPackages],
      docs: "docs/contracts/scripting.md",
      instruction: "Remove runtime adapter imports and express behavior through portable SDK declarations, context services, resources, events, or supported helper packages.",
      snippet: 'import { Vector3 } from "@threenative/script-stdlib";',
    },
    snippetKind: "typescript",
  },
  {
    code: "TN_SCRIPT_NODE_API_UNSUPPORTED",
    evidence: "Compiler portable script tests reject filesystem, process, require, and node: imports.",
    fix: {
      docs: "docs/contracts/scripting.md",
      instruction: "Remove Node APIs from portable gameplay scripts; declare data in content/** or pass state through resources/events.",
      snippet: "export function update(context) {\n  return context.resources;\n}",
    },
    snippetKind: "typescript",
  },
  {
    code: "TN_SCRIPT_DOM_API_UNSUPPORTED",
    evidence: "Compiler portable script tests reject DOM, worker, browser globals, and localStorage/sessionStorage usage.",
    fix: {
      docs: "docs/contracts/scripting.md",
      instruction: "Remove DOM/browser globals from portable scripts and read input, time, transforms, and services from the portable system context.",
      snippet: "export function update(context) {\n  const dt = context.time.delta;\n  return dt;\n}",
    },
    snippetKind: "typescript",
  },
] as const;

const prescriptiveFixes = new Map(PRESCRIPTIVE_DIAGNOSTIC_CODES.map((entry) => [entry.code, entry.fix]));

export function prescriptiveFixForCode(code: string): IAuthoringDiagnosticFix | undefined {
  return prescriptiveFixes.get(code);
}
