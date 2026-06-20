import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  authoringDiagnostic,
  authoringOperationResult,
  formatAuthoringDocument,
  isGeneratedArtifactPath,
  loadAuthoringProject,
  sortAuthoringDiagnostics,
} from "../index.js";

test("authoring diagnostics use the stable AI repair shape", () => {
  const diagnostic = authoringDiagnostic({
    code: "E_SCENE_REF_MISSING",
    file: "content/scenes/kart-track.scene.json",
    message: "No entity with id 'playerKartt' exists.",
    path: "/entities/chase-camera/components/camera/target",
    related: [{ message: "Candidate entity.", path: "/entities/player-kart" }],
    suggestion: "Did you mean 'player-kart'?",
    value: "playerKartt",
  });

  assert.deepEqual(diagnostic, {
    code: "E_SCENE_REF_MISSING",
    severity: "error",
    message: "No entity with id 'playerKartt' exists.",
    file: "content/scenes/kart-track.scene.json",
    path: "/entities/chase-camera/components/camera/target",
    value: "playerKartt",
    suggestion: "Did you mean 'player-kart'?",
    related: [{ path: "/entities/player-kart", message: "Candidate entity." }],
  });
});

test("authoring diagnostics sort deterministically", () => {
  const diagnostics = sortAuthoringDiagnostics([
    authoringDiagnostic({ code: "B", file: "b.scene.json", message: "second", path: "/b" }),
    authoringDiagnostic({ code: "A", file: "a.scene.json", message: "first", path: "/a" }),
  ]);

  assert.deepEqual(
    diagnostics.map((diagnostic) => diagnostic.code),
    ["A", "B"],
  );
});

test("operation results expose stable status, files, and sorted diagnostics", () => {
  const result = authoringOperationResult({
    changed: true,
    diagnostics: [
      authoringDiagnostic({ code: "B", message: "second", severity: "warning" }),
      authoringDiagnostic({ code: "A", message: "first" }),
    ],
    filesWritten: ["content/scenes/b.scene.json", "content/scenes/a.scene.json"],
    projectPath: "/project",
  });

  assert.equal(result.ok, false);
  assert.equal(result.changed, true);
  assert.deepEqual(result.filesWritten, ["content/scenes/a.scene.json", "content/scenes/b.scene.json"]);
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.code),
    ["A", "B"],
  );
});

test("authoring JSON formatting is stable and newline terminated", () => {
  assert.equal(formatAuthoringDocument({ z: 1, a: { b: 2, a: 1 } }), '{\n  "a": {\n    "a": 1,\n    "b": 2\n  },\n  "z": 1\n}\n');
});

test("project loader discovers supported source documents without treating bundles as source", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-"));
  try {
    await mkdir(join(root, "content", "scenes"), { recursive: true });
    await mkdir(join(root, "dist", "game.bundle"), { recursive: true });
    await writeFile(join(root, "content", "scenes", "arena.scene.json"), '{"schema":"threenative.scene","id":"arena"}\n');
    await writeFile(join(root, "dist", "game.bundle", "world.ir.json"), "{}\n");

    const project = await loadAuthoringProject({ projectPath: root });

    assert.deepEqual(
      project.documents.map((document) => [document.projectRelativePath, document.kind]),
      [["content/scenes/arena.scene.json", "scene"]],
    );
    assert.equal(project.diagnostics.length, 0);
    assert.equal(isGeneratedArtifactPath("dist/game.bundle/world.ir.json"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("project loader reports invalid JSON with authoring diagnostics", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-invalid-"));
  try {
    await mkdir(join(root, "content", "scenes"), { recursive: true });
    await writeFile(join(root, "content", "scenes", "broken.scene.json"), "{");

    const project = await loadAuthoringProject({ projectPath: root });

    assert.equal(project.documents.length, 0);
    assert.equal(project.diagnostics[0]?.code, "TN_AUTHORING_DOCUMENT_READ_FAILED");
    assert.equal(project.diagnostics[0]?.severity, "error");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("write formatting output is deterministic for source files", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-format-"));
  try {
    await mkdir(join(root, "content", "scenes"), { recursive: true });
    const file = join(root, "content", "scenes", "arena.scene.json");
    await writeFile(file, '{"z":1,"schema":"threenative.scene","id":"arena"}\n');

    const project = await loadAuthoringProject({ projectPath: root });
    const document = project.documents[0];

    assert.equal(document?.projectRelativePath, "content/scenes/arena.scene.json");
    assert.equal(formatAuthoringDocument(document?.data), '{\n  "id": "arena",\n  "schema": "threenative.scene",\n  "z": 1\n}\n');
    assert.equal((await readFile(file, "utf8")).includes('"z":1'), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
