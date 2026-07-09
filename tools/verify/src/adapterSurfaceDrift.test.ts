import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { listAuthoringOperationDescriptors } from "@threenative/authoring";

const EDITOR_OPERATION_GAPS = gapMap([
  "archetype.apply", "archetype.update", "archetype.list", "audio.create", "audio.add_sound",
  "environment.create", "generator.record", "scene.create", "input.set_controls", "input.set_override",
  "material.create", "mesh.create_custom", "prefab.create", "prefab.add_component", "prefab.set_defaults",
  "resources.create", "resources.add", "resources.set", "flow.create", "flow.add_state",
  "flow.add_transition", "sequence.create", "sequence.add_track", "sequence.add_key", "schema.create",
  "schema.set", "runtime.create", "runtime.set_window", "runtime.set_rendering", "scene.add_prefab_instance",
  "scene.layout_ten_pin", "scene.add_group", "scene.add_tag", "scene.add_resource", "scene.add_ui_node",
  "scene.set_stylized_nature", "scene.set_stylized_sparkles", "scene.set_ripple_water", "scene.set_camera_component", "scene.set_spawner",
  "scene.remove_component", "scene.attach_script", "scene.bind_ui", "ui.create", "ui.add_text",
  "ui.add_component", "ui.apply_recipe", "ui.remove_component", "ui.set_layout", "system.create",
], "Operation is registry-backed for CLI/MCP but not enabled as a direct editor inspector/modal action in this slice.");

const EDITOR_SMOKE_GAPS = gapMap([
  "archetype.apply", "archetype.update", "archetype.list", "asset.add", "audio.create",
  "audio.add_sound", "environment.create", "environment.set_skybox", "environment.set_map", "environment.set_light_probe",
  "environment.set_path", "environment.set_terrain", "environment.set_walkability", "environment.set_source_asset_lod", "generator.record",
  "scene.create", "input.add_action", "input.add_axis", "input.set_controls", "input.set_override",
  "material.create", "material.set", "mesh.create_custom", "prefab.create", "prefab.add_component",
  "prefab.set_defaults", "project.create", "resources.create", "resources.add", "resources.set",
  "flow.create", "flow.add_state", "flow.add_transition", "sequence.create", "sequence.add_track",
  "sequence.add_key", "schema.create", "schema.set", "runtime.create", "runtime.set_window",
  "runtime.set_rendering", "target.set_profile", "scene.add_prefab_instance", "scene.layout_ten_pin", "scene.add_group",
  "scene.add_tag", "scene.add_resource", "scene.add_ui_node", "scene.set_camera", "scene.set_stylized_nature",
  "scene.set_stylized_sparkles", "scene.set_ripple_water", "scene.set_camera_component", "scene.set_light", "scene.set_lifecycle",
  "scene.set_prefab", "scene.set_mesh_renderer", "scene.set_render_layers", "scene.set_spawner", "scene.set_character_controller",
  "scene.set_visibility", "scene.remove_component", "scene.set_resource", "scene.attach_script", "scene.bind_ui",
  "ui.create", "ui.add_text", "ui.add_node", "ui.add_component", "ui.apply_recipe",
  "ui.remove_component", "ui.set_layout", "ui.bind", "ui.set_style", "system.set_metadata",
], "Operation is covered by registry/package tests or editor metadata but is outside the focused editor-required smoke path.");

test("adapter surface drift should account for every authoring operation", async () => {
  const descriptors = listAuthoringOperationDescriptors();
  const operationNames = descriptors.map((descriptor) => descriptor.name).sort();
  const operationNameSet = new Set(operationNames);
  const root = resolve(new URL("../../..", import.meta.url).pathname);
  const [cliIndex, editorModel, editorStore, mcpServer, smoke] = await Promise.all([
    readFile(resolve(root, "packages/cli/src/index.ts"), "utf8"),
    readFile(resolve(root, "packages/editor/src/adapters/editorModel.ts"), "utf8"),
    readFile(resolve(root, "packages/editor/src/state/editorStore.ts"), "utf8"),
    readFile(resolve(root, "packages/mcp-server/src/index.ts"), "utf8"),
    readFile(resolve(root, "tools/verify/src/editorRequiredOperations.ts"), "utf8"),
  ]);
  const cliCommands = new Set([...cliIndex.matchAll(/^  "?([a-z][a-z-]*)"?: \{/gm)].map((match) => match[1]).filter((name): name is string => name !== undefined));
  const editorOperations = operationNamesFromSource(`${editorModel}\n${editorStore}`);
  const smokeOperations = operationNamesFromSource(smoke);
  const missingCli = descriptors.filter((descriptor) => !cliCommands.has(cliCommandForFamily(descriptor.sourceFamily))).map((descriptor) => descriptor.name);
  const missingEditor = operationNames.filter((name) => !editorOperations.has(name) && !EDITOR_OPERATION_GAPS.has(name));
  const missingSmoke = operationNames.filter((name) => !smokeOperations.has(name) && !EDITOR_SMOKE_GAPS.has(name));

  assert.equal(mcpServer.includes("AUTHORING_OPERATION_NAMES.map"), true, "MCP server must derive tool exposure from AUTHORING_OPERATION_NAMES.");
  assert.deepEqual(missingCli, [], `CLI route coverage missing for authoring operation(s): ${missingCli.join(", ")}`);
  assert.deepEqual(missingEditor, [], `Editor coverage missing for authoring operation(s): ${missingEditor.join(", ")}`);
  assert.deepEqual(missingSmoke, [], `editorRequiredOperations smoke coverage or gap missing for authoring operation(s): ${missingSmoke.join(", ")}`);
  assert.deepEqual(staleGaps(EDITOR_OPERATION_GAPS, operationNameSet), [], "Editor operation gap allowlist contains stale registry names.");
  assert.deepEqual(staleGaps(EDITOR_SMOKE_GAPS, operationNameSet), [], "Editor smoke gap allowlist contains stale registry names.");
});

function operationNamesFromSource(source: string): Set<string> {
  return new Set([...source.matchAll(/operationName: "([^"]+)"|postOperation\("([^"]+)"|apply\("([^"]+)"|name: "([^"]+)"/g)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? match[4])
    .filter((name): name is string => name !== undefined && name.includes(".")));
}

function cliCommandForFamily(family: string): string {
  return family === "archetype" ? "actor" : family;
}

function gapMap(names: readonly string[], reason: string): Map<string, string> {
  return new Map(names.map((name) => [name, reason]));
}

function staleGaps(gaps: ReadonlyMap<string, string>, operationNames: ReadonlySet<string>): string[] {
  return [...gaps].filter(([name, reason]) => !operationNames.has(name) || reason.trim().length < 20).map(([name]) => name);
}

