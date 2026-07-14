import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import ts from "typescript";

import { generateProjectContextTypes } from "./typegen.js";

test("should generate project context id unions and schema maps", () => {
  const output = generateProjectContextTypes([
    {
      data: {
        entities: [{ components: { ChessPiece: { side: "white" }, Health: { value: 100 } }, id: "hero" }],
        id: "arena",
        instances: [{ id: "coin.1", prefab: "coin" }],
        prefabs: [{ id: "coin" }],
        resources: [{ id: "GameState", value: { score: 0 } }],
        schema: "threenative.scene",
        ui: { nodes: [{ id: "score-label" }] },
      },
      file: "content/scenes/arena.scene.json",
      kind: "scene",
      projectRelativePath: "content/scenes/arena.scene.json",
    },
    {
      data: {
        actions: [{ id: "Jump" }],
        axes: [{ id: "MoveX" }],
        id: "arena-input",
        schema: "threenative.input",
      },
      file: "content/input/arena.input.json",
      kind: "input",
      projectRelativePath: "content/input/arena.input.json",
    },
    {
      data: {
        id: "component-schemas",
        kind: "component",
        schema: "threenative.schema",
        schemas: [{ id: "Health", fields: { value: { kind: "number", required: true } } }],
      },
      file: "content/schemas/components.schema.json",
      kind: "schema",
      projectRelativePath: "content/schemas/components.schema.json",
    },
    {
      data: {
        id: "resource-schemas",
        kind: "resource",
        schema: "threenative.schema",
        schemas: [{ id: "GameState", fields: { score: { kind: "number" }, status: { kind: "string" } } }],
      },
      file: "content/schemas/resources.schema.json",
      kind: "schema",
      projectRelativePath: "content/schemas/resources.schema.json",
    },
    {
      data: {
        schema: "threenative.overlays", version: "0.2.0", overlays: [{
          entry: "overlay/hud/dist/index.html", id: "hud", input: "none", targetProfiles: ["web"], transparent: true, zIndex: 1,
          messages: {
            gameToOverlay: [{ name: "hud:snapshot", schema: { kind: "object", fields: { score: "integer" }, required: ["score"] } }],
            overlayToGame: [{ name: "hud:action", schema: { kind: "object", fields: { action: "string" }, required: ["action"] } }],
          },
        }],
      },
      file: "content/overlays/hud.overlays.json",
      kind: "overlay",
      projectRelativePath: "content/overlays/hud.overlays.json",
    },
  ]);

  assert.match(output, /export type ProjectEntityId = "coin\.1" \| "hero";/);
  assert.match(output, /export type ProjectInputId = "Jump" \| "MoveX";/);
  assert.match(output, /export type ProjectPrefabId = "coin";/);
  assert.match(output, /export type ProjectResourceId = "GameState";/);
  assert.match(output, /export type ProjectSceneId = "arena";/);
  assert.match(output, /export type ProjectUiId = "score-label";/);
  assert.match(output, /"Health": \{ "value": number \};/);
  assert.match(output, /"ChessPiece": \{ \[key: string\]: unknown \};/);
  assert.doesNotMatch(output, /"Health": \{ \[key: string\]: unknown \};/);
  assert.match(output, /"GameState": \{ "score": number; "status": string \};/);
  assert.match(output, /export interface ProjectContext extends Omit<ScriptContext, "entity" \| "input" \| "query" \| "resources">/);
  assert.match(output, /input: Omit<ScriptContext\["input"\]/);
  assert.match(output, /resources: Omit<ScriptContext\["resources"\]/);
  assert.match(output, /export interface ProjectGameToOverlayMessageMap/);
  assert.match(output, /"hud:snapshot": \{ "score": number \};/);
  assert.match(output, /"hud:action": \{ "action": string \};/);
});

test("should preserve generated ProjectContext ID narrowing", () => {
  const output = generateProjectContextTypes([
    {
      data: {
        entities: [{ id: "hero" }],
        id: "arena",
        resources: [{ id: "GameState", value: { score: 0 } }],
        schema: "threenative.scene",
      },
      file: "content/scenes/arena.scene.json",
      kind: "scene",
      projectRelativePath: "content/scenes/arena.scene.json",
    },
    {
      data: { actions: [{ id: "Jump" }], axes: [{ id: "MoveX" }], id: "arena-input", schema: "threenative.input" },
      file: "content/input/arena.input.json",
      kind: "input",
      projectRelativePath: "content/input/arena.input.json",
    },
  ]);

  assert.doesNotMatch(output, /interface ProjectContext extends ScriptContext/);
  assert.match(output, /entity\(id: ProjectEntityId\)/);
  assert.match(output, /action\(name: ProjectInputId\)/);
  assert.match(output, /get<K extends ProjectResourceId>/);

  const root = mkdtempSync(resolve(process.cwd(), ".typegen-contract-"));
  try {
    const declarations = resolve(root, "project-context.d.ts");
    const fixture = resolve(root, "fixture.ts");
    writeFileSync(declarations, output);
    writeFileSync(fixture, [
      'import type { ProjectContext } from "./project-context.js";',
      "declare const context: ProjectContext;",
      'context.entity("hero");',
      'context.input.action("Jump");',
      'context.input.getAxis2("MoveX", "MoveX");',
      'context.resources.get("GameState");',
      '// @ts-expect-error undeclared entity ID',
      'context.entity("villain");',
      '// @ts-expect-error undeclared input ID',
      'context.input.action("Fire");',
      '// @ts-expect-error undeclared resource ID',
      'context.resources.get("MissingState");',
      "",
    ].join("\n"));
    const program = ts.createProgram({
      options: {
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        noEmit: true,
        skipLibCheck: true,
        strict: true,
        target: ts.ScriptTarget.ES2023,
      },
      rootNames: [fixture],
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.deepEqual(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")), []);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
