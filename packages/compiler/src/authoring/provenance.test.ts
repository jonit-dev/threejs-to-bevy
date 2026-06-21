import assert from "node:assert/strict";
import test from "node:test";
import type { IAuthoringDocument } from "@threenative/authoring";

import type { IAuthoringGraph } from "./graph.js";
import { buildAuthoringProvenanceDocument } from "./provenance.js";

test("builds structured source ownership for emitted authoring provenance", () => {
  const report = buildAuthoringProvenanceDocument(emptyGraph(), {
    documents: [
      document("content/scenes/level.scene.json", "scene", {
        schema: "threenative.scene",
        id: "level",
        entities: [
          {
            components: {
              MeshRenderer: { material: "materials.countdown" },
              Transform: { position: [0, 0, 0] },
            },
            id: "countdown-sign",
          },
        ],
        systems: [
          {
            id: "countdown.tick",
            script: { export: "tickCountdown", module: "src/scripts/countdown.ts" },
          },
        ],
      }),
      document("content/materials/hud.materials.json", "material", {
        schema: "threenative.materials",
        id: "hud",
        materials: [{ color: "#ffffff", id: "materials.countdown" }],
      }),
      document("content/ui/hud.ui.json", "ui", {
        schema: "threenative.ui",
        id: "hud",
        nodes: [{ id: "countdown" }],
      }),
    ],
    emitted: [
      { kind: "entity", path: "world.ir.json" },
      { kind: "material", path: "materials.ir.json" },
      { kind: "ui", path: "ui.ir.json" },
      { kind: "system", path: "systems.ir.json" },
      { kind: "generated-script", path: "scripts.bundle.js" },
    ],
  });

  assert.equal(report.schema, "threenative.authoring-provenance");

  assert.deepEqual(select(report.ownership, "entity", "countdown-sign"), {
    emittedPath: "world.ir.json",
    ownership: "source-persistable",
    sourcePath: "content/scenes/level.scene.json",
    sourcePointer: "/entities/0",
  });
  assert.deepEqual(select(report.ownership, "component", "countdown-sign.MeshRenderer"), {
    emittedPath: "world.ir.json",
    ownership: "source-persistable",
    sourcePath: "content/scenes/level.scene.json",
    sourcePointer: "/entities/0/components/MeshRenderer",
  });
  assert.deepEqual(select(report.ownership, "mesh-renderer-material-ref", "countdown-sign.MeshRenderer.material"), {
    emittedPath: "world.ir.json",
    ownership: "source-persistable",
    sourcePath: "content/materials/hud.materials.json",
    sourcePointer: "/materials/0",
  });
  assert.deepEqual(select(report.ownership, "ui", "countdown"), {
    emittedPath: "ui.ir.json",
    ownership: "source-persistable",
    sourcePath: "content/ui/hud.ui.json",
    sourcePointer: "/nodes/0",
  });

  const system = report.ownership.find((entry) => entry.emitted.artifactKind === "system" && entry.emitted.id === "countdown.tick");
  assert.equal(system?.source?.path, "content/scenes/level.scene.json");
  assert.equal(system?.source?.pointer, "/systems/0/script");
  assert.equal(system?.source?.modulePath, "src/scripts/countdown.ts");
  assert.equal(system?.source?.exportName, "tickCountdown");

  const scriptBundle = report.ownership.find((entry) => entry.emitted.path === "scripts.bundle.js");
  assert.equal(scriptBundle?.ownership, "rejected/not-source");
  assert.equal(scriptBundle.source, undefined);
});

test("diagnoses duplicate source owners for the same emitted artifact id", () => {
  const report = buildAuthoringProvenanceDocument(emptyGraph(), {
    documents: [
      document("content/materials/a.materials.json", "material", {
        schema: "threenative.materials",
        id: "a",
        materials: [{ id: "shared.material" }],
      }),
      document("content/materials/b.materials.json", "material", {
        schema: "threenative.materials",
        id: "b",
        materials: [{ id: "shared.material" }],
      }),
    ],
    emitted: [{ kind: "material", path: "materials.ir.json" }],
  });

  assert.equal(report.diagnostics.length, 1);
  assert.equal(report.diagnostics[0]?.code, "TN_AUTHORING_DUPLICATE_EMITTED_OWNER");
  assert.equal(report.diagnostics[0]?.target, "shared.material");
});

function emptyGraph(): IAuthoringGraph {
  return {
    declarations: [],
    diagnostics: [],
    entryPath: "content/scenes/level.scene.json",
    modules: [],
    projectRoot: "/project",
    schema: "threenative.authoring-graph",
    version: "0.1.0",
  };
}

function document(projectRelativePath: string, kind: IAuthoringDocument["kind"], data: unknown): IAuthoringDocument {
  return {
    data,
    file: `/project/${projectRelativePath}`,
    kind,
    projectRelativePath,
  };
}

function select(
  entries: ReturnType<typeof buildAuthoringProvenanceDocument>["ownership"],
  artifactKind: string,
  id: string,
): { emittedPath: string; ownership: string; sourcePath?: string; sourcePointer?: string } | undefined {
  const entry = entries.find((item) => item.emitted.artifactKind === artifactKind && item.emitted.id === id);
  if (entry === undefined) {
    return undefined;
  }
  return {
    emittedPath: entry.emitted.path,
    ownership: entry.ownership,
    sourcePath: entry.source?.path,
    sourcePointer: entry.source?.pointer,
  };
}
