import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";

import {
  AUTHORING_OPERATION_NAMES,
  buildAuthoringOperationCliArgv,
  dispatchAuthoringOperation,
  getAuthoringOperationDescriptor,
  listAuthoringOperationDescriptors,
  renderAuthoringOperationCliUsage,
} from "./operationRegistry.js";
import { validateAuthoringProject } from "./operations.js";
import { recordBlenderGenerator } from "./operations/documents.js";
import { loadAuthoringProject } from "./project.js";

test("should update one distribution target without replacing siblings", async () => {
  const root = await createRegistryProject();
  try {
    const app = await dispatchAuthoringOperation({
      args: { appId: "com.threenative.chess", displayName: "Chess", icons: "assets/chess-game.png", version: "1.0.0" },
      name: "distribution.set_app",
      projectPath: root,
    });
    await dispatchAuthoringOperation({ args: { formats: ["aab", "apk"], platform: "android", runtime: "webview" }, name: "distribution.set_target", projectPath: root });
    await dispatchAuthoringOperation({ args: { formats: ["aab", "apk"], platform: "android", runtime: "bevy" }, name: "distribution.set_target", projectPath: root });
    const update = await dispatchAuthoringOperation({ args: { capabilities: ["storage"], formats: ["apk"], platform: "android", runtime: "webview" }, name: "distribution.set_target", projectPath: root });
    const source = JSON.parse(await readFile(join(root, "content/distribution.json"), "utf8")) as { targets: Array<Record<string, unknown>> };

    assert.equal(app.ok, true);
    assert.equal(update.ok, true);
    assert.deepEqual(source.targets, [
      { formats: ["static", "zip", "pwa"], platform: "web", runtime: "web" },
      { capabilities: ["storage"], formats: ["apk"], platform: "android", runtime: "webview" },
      { formats: ["aab", "apk"], platform: "android", runtime: "bevy" },
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should be idempotent when distribution metadata is unchanged", async () => {
  const root = await createRegistryProject();
  try {
    const args = { appId: "com.threenative.chess", displayName: "Chess", icons: "assets/chess-game.png", version: "1.0.0" };
    const first = await dispatchAuthoringOperation({ args, name: "distribution.set_app", projectPath: root });
    const second = await dispatchAuthoringOperation({ args, name: "distribution.set_app", projectPath: root });
    const loaded = await loadAuthoringProject({ projectPath: root });

    assert.equal(first.changed, true);
    assert.equal(second.ok, true);
    assert.equal(second.changed, false);
    assert.deepEqual(second.filesWritten, []);
    assert.equal(loaded.documents.find((document) => document.projectRelativePath === "content/distribution.json")?.kind, "distribution");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should dispatch promoted editor-safe operations", async () => {
  const root = await createRegistryProject();
  try {
    const result = await dispatchAuthoringOperation({
      args: {
        entityId: "player",
        position: [1, 2, 3],
        sceneId: "scene.arena",
      },
      name: "scene.set_transform",
      projectPath: root,
    });
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ id: string; transform?: { position?: number[] } }>;
    };

    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.deepEqual(result.filesWritten, ["content/scenes/arena.scene.json"]);
    assert.deepEqual(scene.entities.find((entity) => entity.id === "player")?.transform?.position, [1, 2, 3]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should dispatch actor archetype operations through the registry", async () => {
  const root = await createRegistryProject();
  try {
    const result = await dispatchAuthoringOperation({
      args: {
        actorId: "hero",
        archetype: "character",
        sceneId: "scene.arena",
        speed: 5,
      },
      name: "archetype.apply",
      projectPath: root,
    });
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ archetype?: { id: string }; components?: Record<string, unknown>; id: string }>;
    };
    const descriptor = getAuthoringOperationDescriptor("archetype.apply");

    assert.equal(result.ok, true);
    assert.equal(descriptor?.sourceFamily, "archetype");
    assert.equal(scene.entities.find((entity) => entity.id === "hero")?.archetype?.id, "character");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should preserve legacy TypeScript generator documents", async () => {
  const root = await createRegistryProject();
  try {
    const result = await dispatchAuthoringOperation({
      args: { exportName: "generateArena", generatorId: "arena.layout", modulePath: "src/generators/arena.ts", outputs: ["content/scenes/arena.scene.json"] },
      name: "generator.record",
      projectPath: root,
    });
    const document = JSON.parse(await readFile(join(root, "content/generators/arena.layout.generator.json"), "utf8")) as Record<string, unknown>;
    assert.equal(result.ok, true);
    assert.equal(document.provider, undefined);
    assert.equal(document.module, "src/generators/arena.ts");
    assert.equal(document.export, "generateArena");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should record normalized Blender recipe and provider provenance", async () => {
  const root = await createRegistryProject();
  try {
    const result = await dispatchAuthoringOperation({
      args: {
        generatorId: "prop.crate",
        output: "assets/generated/prop.crate.glb",
        providerVersion: "4.5.11",
        recipe: validBlenderRecipe({
          animations: [{ id: "idle", duration: 1, loop: true, tracks: [{ node: "body", property: "rotation", keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [0, 0.1, 0], interpolation: "linear" }] }] }],
        }),
      },
      name: "generator.record_blender",
      projectPath: root,
    });
    const recipe = JSON.parse(await readFile(join(root, "content/generators/prop.crate.recipe.json"), "utf8")) as Record<string, unknown>;
    const provenance = JSON.parse(await readFile(join(root, "content/generators/prop.crate.generator.json"), "utf8")) as Record<string, unknown>;
    const reloaded = await validateAuthoringProject({ projectPath: root });
    assert.equal(result.ok, true);
    assert.equal(reloaded.ok, true);
    assert.deepEqual(result.filesWritten, ["content/generators/prop.crate.generator.json", "content/generators/prop.crate.recipe.json"]);
    assert.equal(recipe.schema, "threenative.blender-recipe");
    assert.equal(recipe.id, "prop.crate");
    assert.deepEqual((recipe.budgets as Record<string, unknown>).maxParts, 128);
    assert.deepEqual(provenance, {
      id: "prop.crate",
      outputs: ["assets/generated/prop.crate.glb"],
      overwritePolicy: "manual",
      provider: "blender",
      providerVersion: "4.5.11",
      recipe: "content/generators/prop.crate.recipe.json",
      schema: "threenative.generator-provenance",
      version: "0.1.0",
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reload Blender recipe and provider provenance in a fresh process", async () => {
  const root = await createRegistryProject();
  try {
    const recorded = await dispatchAuthoringOperation({
      args: {
        generatorId: "prop.crate",
        output: "assets/generated/prop.crate.glb",
        recipe: validBlenderRecipe(),
      },
      name: "generator.record_blender",
      projectPath: root,
    });
    assert.equal(recorded.ok, true, JSON.stringify(recorded.diagnostics));

    const child = spawnSync(process.execPath, [
      "--input-type=module",
      "--eval",
      [
        "const { validateAuthoringProject } = await import(process.env.TN_AUTHORING_OPERATIONS_URL);",
        "const result = await validateAuthoringProject({ projectPath: process.env.TN_AUTHORING_PROJECT });",
        "process.stdout.write(JSON.stringify({ diagnostics: result.diagnostics, ok: result.ok }));",
      ].join("\n"),
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        TN_AUTHORING_OPERATIONS_URL: new URL("./operations.js", import.meta.url).href,
        TN_AUTHORING_PROJECT: root,
      },
    });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), { diagnostics: [], ok: true });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should record a reviewed img2threejs generator workspace", async () => {
  const root = await createRegistryProject();
  try {
    const workspace = await createReviewedImg2ThreejsWorkspace(root);
    const result = await dispatchAuthoringOperation({
      args: { generatorId: "prop.radio", output: workspace.output, recipePath: workspace.recipePath },
      name: "generator.record_img2threejs",
      projectPath: root,
    });
    const provenance = JSON.parse(await readFile(join(root, "content/generators/prop.radio.generator.json"), "utf8")) as Record<string, unknown>;
    const acceptedPasses = provenance.acceptedPasses as Array<Record<string, unknown>>;
    const sourceHashes = provenance.sourceHashes as Record<string, unknown>;
    const descriptor = getAuthoringOperationDescriptor("generator.record_img2threejs");
    const reloaded = await validateAuthoringProject({ projectPath: root });
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.equal(reloaded.ok, true, JSON.stringify(reloaded.diagnostics));
    assert.deepEqual(result.filesWritten, ["content/generators/prop.radio.generator.json"]);
    assert.equal(provenance.provider, "img2threejs");
    assert.equal(provenance.recipe, workspace.recipePath);
    assert.equal(provenance.sourceImage, "content/references/prop.radio.png");
    assert.equal(provenance.sculptSpec, "content/generators/prop.radio.sculpt-spec.json");
    assert.equal(provenance.module, "src/generators/createPropRadioModel.ts");
    assert.equal(provenance.export, "createPropRadioModel");
    assert.deepEqual(acceptedPasses.map((pass) => pass.id), ["blockout", "structural-pass", "material-pass", "optimization-pass"]);
    assert.equal(acceptedPasses.every((pass) => typeof pass.reviewHash === "string" && String(pass.reviewHash).startsWith("sha256:")), true);
    assert.equal(Object.values(sourceHashes).filter((value) => typeof value === "string").every((value) => value.startsWith("sha256:")), true);
    assert.equal(typeof provenance.inputHash === "string" && provenance.inputHash.startsWith("sha256:"), true);
    assert.equal(descriptor?.providerManifest?.reviewedCommit, "e8ff28a6ae0cb534c7b2ebc15cb3f06709262d5b");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should preserve accepted img2threejs run state when re-recording the same owner", async () => {
  const root = await createRegistryProject();
  try {
    const workspace = await createReviewedImg2ThreejsWorkspace(root);
    const first = await dispatchAuthoringOperation({ args: { generatorId: "prop.radio", output: workspace.output, recipePath: workspace.recipePath }, name: "generator.record_img2threejs", projectPath: root });
    assert.equal(first.ok, true, JSON.stringify(first.diagnostics));
    const provenancePath = join(root, "content/generators/prop.radio.generator.json");
    const accepted = JSON.parse(await readFile(provenancePath, "utf8")) as Record<string, unknown>;
    accepted.outputHash = `sha256:${"a".repeat(64)}`;
    accepted.lastRun = { marker: "accepted-run", outputHash: accepted.outputHash };
    await writeFile(provenancePath, `${JSON.stringify(accepted, null, 2)}\n`);

    const rerecorded = await dispatchAuthoringOperation({ args: { generatorId: "prop.radio", output: workspace.output, overwritePolicy: "replace", recipePath: workspace.recipePath }, name: "generator.record_img2threejs", projectPath: root });
    const preserved = JSON.parse(await readFile(provenancePath, "utf8")) as Record<string, unknown>;
    assert.equal(rerecorded.ok, true, JSON.stringify(rerecorded.diagnostics));
    assert.equal(preserved.outputHash, accepted.outputHash);
    assert.deepEqual(preserved.lastRun, accepted.lastRun);
    assert.equal(preserved.overwritePolicy, "replace");

    const moved = await dispatchAuthoringOperation({ args: { generatorId: "prop.radio", output: "assets/generated/prop.radio-moved.glb", overwritePolicy: "replace", recipePath: workspace.recipePath }, name: "generator.record_img2threejs", projectPath: root });
    const movedData = JSON.parse(await readFile(provenancePath, "utf8")) as Record<string, unknown>;
    assert.equal(moved.ok, true, JSON.stringify(moved.diagnostics));
    assert.equal(movedData.outputHash, undefined);
    assert.equal(movedData.lastRun, undefined);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject img2threejs review gaps before recording", async () => {
  const root = await createRegistryProject();
  try {
    const workspace = await createReviewedImg2ThreejsWorkspace(root);
    const specPath = join(root, "content/generators/prop.radio.sculpt-spec.json");
    const spec = JSON.parse(await readFile(specPath, "utf8")) as Record<string, unknown>;
    (spec.reviewHistory as Array<Record<string, unknown>>)[1]!.action = "refine-code";
    await writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`);
    const result = await dispatchAuthoringOperation({ args: { generatorId: "prop.radio", output: workspace.output, recipePath: workspace.recipePath }, name: "generator.record_img2threejs", projectPath: root });
    const diagnostic = result.diagnostics.find((item) => item.code === "TN_IMG2THREEJS_REVIEW_INCOMPLETE");
    assert.equal(result.ok, false);
    assert.match(diagnostic?.message ?? "", /structural-pass.*refine-code/);
    assert.match(diagnostic?.fix?.instruction ?? "", /Resume 'structural-pass'/);
    await assert.rejects(readFile(join(root, "content/generators/prop.radio.generator.json")));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject malformed img2threejs provenance after a fresh reload", async () => {
  const root = await createRegistryProject();
  try {
    const workspace = await createReviewedImg2ThreejsWorkspace(root);
    const recorded = await dispatchAuthoringOperation({ args: { generatorId: "prop.radio", output: workspace.output, recipePath: workspace.recipePath }, name: "generator.record_img2threejs", projectPath: root });
    assert.equal(recorded.ok, true, JSON.stringify(recorded.diagnostics));
    const provenancePath = join(root, "content/generators/prop.radio.generator.json");
    const provenance = JSON.parse(await readFile(provenancePath, "utf8")) as Record<string, unknown>;
    delete provenance.sourceHashes;
    await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
    const child = spawnSync(process.execPath, [
      "--input-type=module",
      "--eval",
      [
        "const { validateAuthoringProject } = await import(process.env.TN_AUTHORING_OPERATIONS_URL);",
        "const result = await validateAuthoringProject({ projectPath: process.env.TN_AUTHORING_PROJECT });",
        "process.stdout.write(JSON.stringify(result.diagnostics));",
      ].join("\n"),
    ], {
      encoding: "utf8",
      env: { ...process.env, TN_AUTHORING_OPERATIONS_URL: new URL("./operations.js", import.meta.url).href, TN_AUTHORING_PROJECT: root },
    });
    assert.equal(child.status, 0, child.stderr);
    const diagnostics = JSON.parse(child.stdout) as Array<{ code: string; path: string }>;
    assert.equal(diagnostics.some((item) => item.code === "TN_IMG2THREEJS_PROVENANCE_INVALID" && item.path === "/sourceHashes"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsafe img2threejs provenance paths after a fresh reload", async () => {
  const root = await createRegistryProject();
  try {
    const workspace = await createReviewedImg2ThreejsWorkspace(root);
    const recorded = await dispatchAuthoringOperation({ args: { generatorId: "prop.radio", output: workspace.output, recipePath: workspace.recipePath }, name: "generator.record_img2threejs", projectPath: root });
    assert.equal(recorded.ok, true, JSON.stringify(recorded.diagnostics));
    const provenancePath = join(root, "content/generators/prop.radio.generator.json");
    const provenance = JSON.parse(await readFile(provenancePath, "utf8")) as Record<string, unknown>;
    delete provenance.version;
    (((provenance.sourceHashes as Record<string, unknown>).resources as Array<Record<string, unknown>>)[0]!).path = "https://evil.example/texture.png";
    (((provenance.acceptedPasses as Array<Record<string, unknown>>)[0]!.evidence as Array<Record<string, unknown>>)[0]!).path = "/etc/passwd";
    await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
    const child = spawnSync(process.execPath, [
      "--input-type=module",
      "--eval",
      [
        "const { validateAuthoringProject } = await import(process.env.TN_AUTHORING_OPERATIONS_URL);",
        "const result = await validateAuthoringProject({ projectPath: process.env.TN_AUTHORING_PROJECT });",
        "process.stdout.write(JSON.stringify(result.diagnostics));",
      ].join("\n"),
    ], {
      encoding: "utf8",
      env: { ...process.env, TN_AUTHORING_OPERATIONS_URL: new URL("./operations.js", import.meta.url).href, TN_AUTHORING_PROJECT: root },
    });
    assert.equal(child.status, 0, child.stderr);
    const diagnostics = JSON.parse(child.stdout) as Array<{ code: string; path: string }>;
    assert.equal(diagnostics.some((item) => item.code === "TN_IMG2THREEJS_PROVENANCE_INVALID" && item.path === "/version"), true);
    assert.equal(diagnostics.some((item) => item.code === "TN_IMG2THREEJS_PROVENANCE_INVALID" && item.path === "/sourceHashes/resources/0/path"), true);
    assert.equal(diagnostics.some((item) => item.code === "TN_IMG2THREEJS_PROVENANCE_INVALID" && item.path === "/acceptedPasses/0/evidence/0/path"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unreviewed upstream commits", async () => {
  const root = await createRegistryProject();
  try {
    const workspace = await createReviewedImg2ThreejsWorkspace(root);
    const recipePath = join(root, workspace.recipePath);
    const recipe = JSON.parse(await readFile(recipePath, "utf8")) as Record<string, unknown>;
    (recipe.upstream as Record<string, unknown>).commit = "0000000000000000000000000000000000000000";
    await writeFile(recipePath, `${JSON.stringify(recipe, null, 2)}\n`);
    const result = await dispatchAuthoringOperation({ args: { generatorId: "prop.radio", output: workspace.output, recipePath: workspace.recipePath }, name: "generator.record_img2threejs", projectPath: root });
    const diagnostic = result.diagnostics.find((item) => item.code === "TN_IMG2THREEJS_UPSTREAM_UNREVIEWED");
    assert.equal(result.ok, false);
    assert.match(diagnostic?.message ?? "", /e8ff28a6ae0cb534c7b2ebc15cb3f06709262d5b/);
    assert.match(diagnostic?.fix?.instruction ?? "", /supported internal skill/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unknown img2threejs recipe fields", async () => {
  const root = await createRegistryProject();
  try {
    const workspace = await createReviewedImg2ThreejsWorkspace(root);
    const recipePath = join(root, workspace.recipePath);
    const recipe = JSON.parse(await readFile(recipePath, "utf8")) as Record<string, unknown>;
    recipe.command = "run arbitrary code";
    await writeFile(recipePath, `${JSON.stringify(recipe, null, 2)}\n`);
    const result = await dispatchAuthoringOperation({ args: { generatorId: "prop.radio", output: workspace.output, recipePath: workspace.recipePath }, name: "generator.record_img2threejs", projectPath: root });
    const diagnostic = result.diagnostics.find((item) => item.code === "TN_IMG2THREEJS_RECIPE_INVALID");
    assert.equal(result.ok, false);
    assert.equal(diagnostic?.path, "/command");
    assert.match(diagnostic?.message ?? "", /Unknown field/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject failed or stale img2threejs strict validation reports", async () => {
  for (const mode of ["failed", "stale"] as const) {
    const root = await createRegistryProject();
    try {
      const workspace = await createReviewedImg2ThreejsWorkspace(root);
      const reportPath = join(root, "content/generators/prop.radio.validation.json");
      const report = JSON.parse(await readFile(reportPath, "utf8")) as Record<string, unknown>;
      if (mode === "failed") (report.result as Record<string, unknown>).ok = false;
      else report.sculptSpecHash = `sha256:${"0".repeat(64)}`;
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      const result = await dispatchAuthoringOperation({ args: { generatorId: "prop.radio", output: workspace.output, recipePath: workspace.recipePath }, name: "generator.record_img2threejs", projectPath: root });
      assert.equal(result.ok, false, mode);
      assert.equal(result.diagnostics.some((item) => item.code === "TN_IMG2THREEJS_SPEC_INVALID"), true, mode);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
});

test("should reject source factory texture and output traversal", async () => {
  const cases: Array<{ field: string; mutate(root: string, recipe: Record<string, unknown>, spec: Record<string, unknown>): Promise<void> | void; output?: string }> = [
    { field: "source", mutate: (_root, recipe) => { recipe.sourceImage = "../outside.png"; } },
    { field: "factory", mutate: (_root, recipe) => { (recipe.factory as Record<string, unknown>).module = "../factory.ts"; } },
    { field: "texture", mutate: (_root, _recipe, spec) => { (((spec.materials as Array<Record<string, unknown>>)[0]!.referencePbr as Record<string, unknown>).maps as Record<string, unknown>).albedo = { path: "../texture.png" }; } },
    { field: "source symlink", mutate: async (root) => {
      const outside = join(tmpdir(), `${basename(root)}-outside.png`);
      await writeFile(outside, "outside-project-image");
      await rm(join(root, "content/references/prop.radio.png"));
      await symlink(outside, join(root, "content/references/prop.radio.png"));
    } },
    { field: "source cross-root symlink", mutate: async (root) => {
      await writeFile(join(root, "src/not-a-reference.png"), "wrong-source-root");
      await rm(join(root, "content/references/prop.radio.png"));
      await symlink(join(root, "src/not-a-reference.png"), join(root, "content/references/prop.radio.png"));
    } },
    { field: "output parent symlink", mutate: async (root) => {
      await mkdir(join(root, "assets"), { recursive: true });
      await symlink(join(root, "content/references"), join(root, "assets/generated"));
    } },
    { field: "output", mutate: () => undefined, output: "../prop.radio.glb" },
  ];
  for (const testCase of cases) {
    const root = await createRegistryProject();
    try {
      const workspace = await createReviewedImg2ThreejsWorkspace(root);
      const recipeFile = join(root, workspace.recipePath);
      const specFile = join(root, "content/generators/prop.radio.sculpt-spec.json");
      const recipe = JSON.parse(await readFile(recipeFile, "utf8")) as Record<string, unknown>;
      const spec = JSON.parse(await readFile(specFile, "utf8")) as Record<string, unknown>;
      await testCase.mutate(root, recipe, spec);
      await writeFile(recipeFile, `${JSON.stringify(recipe, null, 2)}\n`);
      await writeFile(specFile, `${JSON.stringify(spec, null, 2)}\n`);
      const result = await dispatchAuthoringOperation({ args: { generatorId: "prop.radio", output: testCase.output ?? workspace.output, recipePath: workspace.recipePath }, name: "generator.record_img2threejs", projectPath: root });
      assert.equal(result.ok, false, testCase.field);
      assert.equal(result.diagnostics.some((item) => item.code === "TN_IMG2THREEJS_RESOURCE_OUTSIDE_PROJECT"), true, testCase.field);
      await assert.rejects(readFile(join(root, "content/generators/prop.radio.generator.json")));
    } finally {
      await rm(root, { force: true, recursive: true });
      await rm(join(tmpdir(), `${basename(root)}-outside.png`), { force: true });
    }
  }
});

test("should preserve manual generated output under manual overwrite policy", async () => {
  const root = await createRegistryProject();
  try {
    const workspace = await createReviewedImg2ThreejsWorkspace(root);
    const outputFile = join(root, workspace.output);
    await mkdir(join(root, "assets/generated"), { recursive: true });
    await writeFile(outputFile, "manual-output");
    const recipeBefore = await readFile(join(root, workspace.recipePath), "utf8");
    const specBefore = await readFile(join(root, "content/generators/prop.radio.sculpt-spec.json"), "utf8");
    const result = await dispatchAuthoringOperation({ args: { generatorId: "prop.radio", output: workspace.output, overwritePolicy: "manual", recipePath: workspace.recipePath }, name: "generator.record_img2threejs", projectPath: root });
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((item) => item.code === "TN_GENERATOR_OUTPUT_CONFLICT"), true);
    assert.equal(await readFile(outputFile, "utf8"), "manual-output");
    assert.equal(await readFile(join(root, workspace.recipePath), "utf8"), recipeBefore);
    assert.equal(await readFile(join(root, "content/generators/prop.radio.sculpt-spec.json"), "utf8"), specBefore);
    await assert.rejects(readFile(join(root, "content/generators/prop.radio.generator.json")));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unknown Blender recipe operation", async () => {
  const root = await createRegistryProject();
  try {
    const result = await dispatchAuthoringOperation({ args: { generatorId: "prop.crate", output: "assets/generated/prop.crate.glb", recipe: validBlenderRecipe({ operations: [{ kind: "execute" }] }) }, name: "generator.record_blender", projectPath: root });
    const diagnostic = result.diagnostics.find((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_OPERATION_UNSUPPORTED");
    assert.equal(result.ok, false);
    assert.equal(diagnostic?.path, "/operations/0/kind");
    assert.deepEqual(diagnostic?.fix?.allowed, ["join", "parent"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject traversal and generated bundle output paths", async () => {
  const root = await createRegistryProject();
  const outsideName = `${basename(root)}.recipe.json`;
  const outsidePath = join(root, "..", outsideName);
  try {
    await writeFile(outsidePath, "not json", "utf8");
    const traversal = await dispatchAuthoringOperation({ args: { generatorId: "prop.crate", output: "assets/generated/prop.crate.glb", recipePath: `../${outsideName}` }, name: "generator.record_blender", projectPath: root });
    const generated = await dispatchAuthoringOperation({ args: { generatorId: "prop.crate", output: "dist/game.bundle/prop.crate.glb", recipe: validBlenderRecipe() }, name: "generator.record_blender", projectPath: root });
    assert.equal(traversal.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_PATH_INVALID"), true);
    assert.equal(traversal.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_READ_FAILED"), false);
    assert.equal(generated.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_OUTPUT_PATH_INVALID"), true);
    await assert.rejects(readFile(join(root, "content/generators/prop.crate.generator.json")));
  } finally {
    await rm(root, { force: true, recursive: true });
    await rm(outsidePath, { force: true });
  }
});

test("should reject Blender recipe symlinks that escape the project", async () => {
  const root = await createRegistryProject();
  const outside = await mkdtemp(join(tmpdir(), "tn-blender-recipe-outside-"));
  try {
    await mkdir(join(root, "content/generators"), { recursive: true });
    await writeFile(join(outside, "escaped.recipe.json"), `${JSON.stringify(validBlenderRecipe())}\n`);
    await symlink(join(outside, "escaped.recipe.json"), join(root, "content/generators/prop.crate.recipe.json"));
    const result = await dispatchAuthoringOperation({ args: { generatorId: "prop.crate", output: "assets/generated/prop.crate.glb", recipePath: "content/generators/prop.crate.recipe.json" }, name: "generator.record_blender", projectPath: root });
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_PATH_INVALID"), true);
    await assert.rejects(readFile(join(root, "content/generators/prop.crate.generator.json")));
  } finally {
    await rm(root, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
  }
});

test("should reject contradictory Blender recipe metadata and polygon estimates", async () => {
  const root = await createRegistryProject();
  try {
    const metadata = await dispatchAuthoringOperation({
      args: { generatorId: "prop.crate", output: "assets/generated/prop.crate.glb", recipe: validBlenderRecipe({ schema: "wrong.schema", version: "9.9.9", id: "other.asset" }) },
      name: "generator.record_blender",
      projectPath: root,
    });
    const polygons = await dispatchAuthoringOperation({
      args: { generatorId: "dense", output: "assets/generated/dense.glb", recipe: validBlenderRecipe({ id: "dense", budgets: { maxOutputBytes: 1024 * 1024, maxPolygons: 100 }, parts: [{ id: "body", primitive: "sphere", segments: 32, rings: 16 }] }) },
      name: "generator.record_blender",
      projectPath: root,
    });
    assert.equal(metadata.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_SCHEMA_INVALID"), true);
    assert.equal(metadata.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_VERSION_INVALID"), true);
    assert.equal(metadata.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_ID_MISMATCH"), true);
    assert.equal(polygons.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_BUDGET_EXCEEDED" && item.path === "/budgets/maxPolygons"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should validate bounded articulated animation and post-operation references", async () => {
  const root = await createRegistryProject();
  try {
    const generatorId = "robot.wave";
    const accepted = await dispatchAuthoringOperation({
      args: {
        generatorId,
        output: "assets/generated/robot.wave.glb",
        recipe: validBlenderRecipe({
          id: generatorId,
          parts: [{ id: "torso", primitive: "cube" }, { id: "arm", primitive: "cube" }, { id: "hand", primitive: "sphere" }],
          operations: [{ kind: "parent", parent: "torso", child: "arm" }, { kind: "parent", parent: "arm", child: "hand" }],
          animations: [{ id: "wave", duration: 1, loop: true, tracks: [{ node: "arm", property: "rotation", keyframes: [{ time: 0, value: [0, 0, -0.5] }, { time: 0.5, value: [0, 0, 0.5] }, { time: 1, value: [0, 0, -0.5] }] }] }],
        }),
      },
      name: "generator.record_blender",
      projectPath: root,
    });
    const cycle = await dispatchAuthoringOperation({
      args: { generatorId: "robot.cycle", output: "assets/generated/robot.cycle.glb", recipe: validBlenderRecipe({ id: "robot.cycle", parts: [{ id: "a", primitive: "cube" }, { id: "b", primitive: "cube" }], operations: [{ kind: "parent", parent: "a", child: "b" }, { kind: "parent", parent: "b", child: "a" }] }) },
      name: "generator.record_blender",
      projectPath: root,
    });
    const consumed = await dispatchAuthoringOperation({
      args: { generatorId: "robot.join", output: "assets/generated/robot.join.glb", recipe: validBlenderRecipe({ id: "robot.join", parts: [{ id: "a", primitive: "cube" }, { id: "b", primitive: "cube" }], operations: [{ kind: "join", id: "joined", inputs: ["a", "b"] }], animations: [{ id: "bad", duration: 1, tracks: [{ node: "a", property: "position", keyframes: [{ time: 0, value: [0, 0, 0] }] }] }] }) },
      name: "generator.record_blender",
      projectPath: root,
    });
    assert.equal(accepted.ok, true, JSON.stringify(accepted.diagnostics));
    assert.equal(cycle.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_PARENT_CYCLE"), true);
    assert.equal(consumed.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_REFERENCE_INVALID" && item.path?.endsWith("/node")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should roll back both Blender generator documents when the second write fails", async () => {
  const root = await createRegistryProject();
  const recipePath = join(root, "content/generators/robot.wave.recipe.json");
  const provenancePath = join(root, "content/generators/robot.wave.generator.json");
  try {
    const initial = await recordBlenderGenerator({
      generatorId: "robot.wave",
      output: "assets/generated/robot.wave.glb",
      projectPath: root,
      providerVersion: "4.5.11",
      recipe: validBlenderRecipe({ id: "robot.wave" }),
    });
    assert.equal(initial.ok, true, JSON.stringify(initial.diagnostics));
    const beforeRecipe = await readFile(recipePath, "utf8");
    const beforeProvenance = await readFile(provenancePath, "utf8");
    let writes = 0;
    const failed = await recordBlenderGenerator({
      generatorId: "robot.wave",
      output: "assets/generated/robot.changed.glb",
      projectPath: root,
      providerVersion: "4.5.11",
      recipe: validBlenderRecipe({ id: "robot.wave", parts: [{ id: "changed", primitive: "sphere" }] }),
    }, {
      writeDocument: async ({ data, file }) => {
        writes += 1;
        if (writes === 2) throw new Error("injected provenance failure");
        await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      },
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECORD_WRITE_FAILED"), true);
    assert.equal(await readFile(recipePath, "utf8"), beforeRecipe);
    assert.equal(await readFile(provenancePath, "utf8"), beforeProvenance);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject Python and remote recipe fields", async () => {
  const root = await createRegistryProject();
  try {
    const recipe = validBlenderRecipe({ code: "import bpy", source: "https://example.com/model.glb" });
    const result = await dispatchAuthoringOperation({ args: { generatorId: "prop.crate", output: "assets/generated/prop.crate.glb", recipe }, name: "generator.record_blender", projectPath: root });
    assert.equal(result.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_CODE_FORBIDDEN" && item.path === "/code"), true);
    assert.equal(result.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_REMOTE_URL_FORBIDDEN" && item.path === "/source"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should enforce part material modifier and segment budgets", async () => {
  const root = await createRegistryProject();
  try {
    const recipe = validBlenderRecipe({
      materials: Array.from({ length: 65 }, (_, index) => ({ id: `mat-${index}`, baseColor: [0.2, 0.3, 0.4, 1] })),
      parts: Array.from({ length: 129 }, (_, index) => ({ id: `part-${index}`, primitive: "sphere", segments: 129, modifiers: Array.from({ length: 17 }, () => ({ kind: "mirror" })) })),
    });
    const result = await dispatchAuthoringOperation({ args: { generatorId: "prop.crate", output: "assets/generated/prop.crate.glb", recipe }, name: "generator.record_blender", projectPath: root });
    const requested = await dispatchAuthoringOperation({ args: { generatorId: "prop.small", output: "assets/generated/prop.small.glb", requestedBudgets: { maxParts: 1 }, recipe: validBlenderRecipe({ parts: [{ id: "a", primitive: "cube" }, { id: "b", primitive: "cube" }] }) }, name: "generator.record_blender", projectPath: root });
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_BUDGET_EXCEEDED" && item.path === "/parts"), true);
    assert.equal(result.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_BUDGET_EXCEEDED" && item.path === "/materials"), true);
    assert.equal(result.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_BUDGET_EXCEEDED" && item.path === "/parts/0/modifiers"), true);
    assert.equal(result.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_BUDGET_INVALID" && item.path === "/parts/0/segments"), true);
    assert.equal(requested.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_BUDGET_EXCEEDED" && item.path === "/parts"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should enforce operation join animation track and keyframe budgets", async () => {
  const root = await createRegistryProject();
  const run = (generatorId: string, recipe: Record<string, unknown>) => dispatchAuthoringOperation({
    args: { generatorId, output: `assets/generated/${generatorId}.glb`, recipe },
    name: "generator.record_blender",
    projectPath: root,
  });
  try {
    const operations = await run("limit.operations", validBlenderRecipe({ id: "limit.operations", operations: Array.from({ length: 257 }, () => ({ kind: "parent", child: "body", parent: "body" })) }));
    const join = await run("limit.join", validBlenderRecipe({ id: "limit.join", operations: [{ kind: "join", id: "joined", inputs: Array.from({ length: 129 }, () => "body") }] }));
    const animations = await run("limit.animations", validBlenderRecipe({ id: "limit.animations", animations: Array.from({ length: 17 }, (_, index) => ({ id: `clip-${index}`, duration: 1, tracks: [] })) }));
    const tracks = await run("limit.tracks", validBlenderRecipe({ id: "limit.tracks", animations: [{ id: "clip", duration: 1, tracks: Array.from({ length: 129 }, () => ({ node: "body", property: "position", keyframes: [{ time: 0, value: [0, 0, 0] }] })) }] }));
    const keyframes = await run("limit.keys", validBlenderRecipe({ id: "limit.keys", animations: [{ id: "clip", duration: 3, tracks: [{ node: "body", property: "position", keyframes: Array.from({ length: 257 }, (_, index) => ({ time: index / 100, value: [0, 0, 0] })) }] }] }));
    assert.equal(operations.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_BUDGET_EXCEEDED" && item.path === "/operations"), true);
    assert.equal(join.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_BUDGET_EXCEEDED" && item.path === "/operations/0/inputs"), true);
    assert.equal(animations.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_BUDGET_EXCEEDED" && item.path === "/animations"), true);
    assert.equal(tracks.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_BUDGET_EXCEEDED" && item.path === "/animations/0/tracks"), true);
    assert.equal(keyframes.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_BUDGET_EXCEEDED" && item.path === "/animations/0/tracks/0/keyframes"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept bounded source GLB animation recipes and reject mixed generation fields", async () => {
  const root = await createRegistryProject();
  const sourceRecipe = validBlenderRecipe({
    id: "aircraft",
    materials: [{ id: "Paint", metallic: 0, roughness: 0.65 }],
    operations: [{
      axis: "x",
      kind: "split-by-axis",
      negative: "aileron.left",
      node: "Ailerons",
      positive: "aileron.right",
      threshold: 0,
    }],
    parts: undefined,
    source: "assets/source/aircraft.glb",
    animations: [{
      id: "propeller.spin",
      duration: 1,
      loop: true,
      tracks: [{
        node: "Propeller",
        pivot: [0, 0.1, 0.8],
        property: "rotation",
        keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [0, 0, 360] }],
      }],
    }],
  });
  try {
    await mkdir(join(root, "assets", "source"), { recursive: true });
    await writeFile(join(root, "assets", "source", "aircraft.glb"), "source-glb");
    const accepted = await dispatchAuthoringOperation({
      args: { generatorId: "aircraft", output: "assets/generated/aircraft.glb", recipe: sourceRecipe },
      name: "generator.record_blender",
      projectPath: root,
    });
    assert.equal(accepted.ok, true, JSON.stringify(accepted.diagnostics));

    const mixed = await dispatchAuthoringOperation({
      args: {
        generatorId: "aircraft.mixed",
        output: "assets/generated/aircraft.mixed.glb",
        recipe: { ...sourceRecipe, id: "aircraft.mixed", parts: [{ id: "body", primitive: "cube" }] },
      },
      name: "generator.record_blender",
      projectPath: root,
    });
    assert.equal(mixed.ok, false);
    assert.equal(mixed.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_SOURCE_MODE_INVALID" && item.path === "/parts"), true);

    const unsupportedOperation = await dispatchAuthoringOperation({
      args: {
        generatorId: "aircraft.unsupported-operation",
        output: "assets/generated/aircraft.unsupported-operation.glb",
        recipe: {
          ...sourceRecipe,
          id: "aircraft.unsupported-operation",
          operations: [{ kind: "join", id: "joined", inputs: ["Ailerons", "Propeller"] }],
        },
      },
      name: "generator.record_blender",
      projectPath: root,
    });
    assert.equal(unsupportedOperation.ok, false);
    assert.equal(unsupportedOperation.diagnostics.some((item) => item.code === "TN_AUTHORING_COMPONENT_VALUE_INVALID" && item.path === "/operations/0/kind"), true);

    const traversal = await dispatchAuthoringOperation({
      args: {
        generatorId: "aircraft.escape",
        output: "assets/generated/aircraft.escape.glb",
        recipe: { ...sourceRecipe, id: "aircraft.escape", source: "../aircraft.glb" },
      },
      name: "generator.record_blender",
      projectPath: root,
    });
    assert.equal(traversal.ok, false);
    assert.equal(traversal.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_SOURCE_PATH_INVALID" && item.path === "/source"), true);

    const nonRotationPivot = await dispatchAuthoringOperation({
      args: {
        generatorId: "aircraft.bad-pivot",
        output: "assets/generated/aircraft.bad-pivot.glb",
        recipe: {
          ...sourceRecipe,
          id: "aircraft.bad-pivot",
          animations: [{
            id: "bad",
            duration: 1,
            tracks: [{
              node: "Propeller",
              pivot: [0, 0.1, 0.8],
              property: "position",
              keyframes: [{ time: 0, value: [0, 0, 0] }],
            }],
          }],
        },
      },
      name: "generator.record_blender",
      projectPath: root,
    });
    assert.equal(nonRotationPivot.ok, false);
    assert.equal(nonRotationPivot.diagnostics.some((item) => item.code === "TN_AUTHORING_BLENDER_RECIPE_ANIMATION_PIVOT_INVALID" && item.path === "/animations/0/tracks/0/pivot"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept every bounded Blender primitive and modifier at its boundary", async () => {
  const root = await createRegistryProject();
  const modifiers: Record<string, unknown>[] = [
    { kind: "array", count: 32, offset: [1, 0, 0] },
    { kind: "bevel", width: 0.01, segments: 128 },
    { kind: "boolean", target: "target", operation: "difference" },
    { kind: "mirror", axis: "z" },
    { kind: "solidify", thickness: 0.01 },
  ];
  try {
    for (const [index, primitive] of ["cube", "sphere", "cylinder", "cone", "torus"].entries()) {
      const generatorId = `boundary-${index}`;
      const result = await dispatchAuthoringOperation({
        args: {
          generatorId,
          output: `assets/generated/boundary-${index}.glb`,
          recipe: validBlenderRecipe({ id: generatorId, budgets: { maxOutputBytes: 64 * 1024 * 1024, maxPolygons: 500_000 }, parts: [{ id: "target", primitive: "cube" }, { id: "body", primitive, rings: 128, segments: 128 }] }),
        },
        name: "generator.record_blender",
        projectPath: root,
      });
      assert.equal(result.ok, true, `${primitive}: ${JSON.stringify(result.diagnostics)}`);
    }
    for (const [index, modifier] of modifiers.entries()) {
      const generatorId = `modifier-${index}`;
      const result = await dispatchAuthoringOperation({
        args: {
          generatorId,
          output: `assets/generated/modifier-${index}.glb`,
          recipe: validBlenderRecipe({ id: generatorId, budgets: { maxOutputBytes: 64 * 1024 * 1024, maxPolygons: 500_000 }, parts: [{ id: "target", primitive: "cube" }, { id: "body", primitive: "cube", modifiers: [modifier] }] }),
        },
        name: "generator.record_blender",
        projectPath: root,
      });
      assert.equal(result.ok, true, `${String(modifier.kind)}: ${JSON.stringify(result.diagnostics)}`);
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should dispatch existing structured source operations through the registry", async () => {
  const root = await createRegistryProject();
  try {
    const operations = [
      await dispatchAuthoringOperation({ args: { assetId: "model.player", path: "assets/player.glb", type: "model" }, name: "asset.add", projectPath: root }),
      await dispatchAuthoringOperation({ args: { assetId: "rt.minimap", format: "rgba16f", height: 256, type: "render-target", usage: "color", width: 512 }, name: "asset.add", projectPath: root }),
      await dispatchAuthoringOperation({ args: { audioDocId: "arena" }, name: "audio.create", projectPath: root }),
      await dispatchAuthoringOperation({ args: { asset: "sound.hit", audioDocId: "arena", soundId: "hit" }, name: "audio.add_sound", projectPath: root }),
      await dispatchAuthoringOperation({ args: { environmentId: "arena" }, name: "environment.create", projectPath: root }),
      await dispatchAuthoringOperation({ args: { asset: "tex.sky", environmentId: "arena", mode: "equirect" }, name: "environment.set_skybox", projectPath: root }),
      await dispatchAuthoringOperation({ args: { asset: "tex.env", environmentId: "arena" }, name: "environment.set_map", projectPath: root }),
      await dispatchAuthoringOperation({ args: { environmentId: "arena", heightmap: "tex.height", heightMode: "heightmap", terrainId: "terrain.arena" }, name: "environment.set_terrain", projectPath: root }),
      await dispatchAuthoringOperation({ args: { environmentId: "arena", path: { id: "path.main", points: [[0, 0, 0], [1, 0, 1]] } }, name: "environment.set_path", projectPath: root }),
      await dispatchAuthoringOperation({ args: { environmentId: "arena", walkability: { terrain: { height: 0, surface: "terrain.arena" } } }, name: "environment.set_walkability", projectPath: root }),
      await dispatchAuthoringOperation({ args: { environmentId: "arena", probe: { bounds: { max: [3, 4, 3], min: [-3, 0, -3] }, influenceRadius: 5, source: { asset: "tex.env", mode: "equirect" } }, probeId: "probe.center" }, name: "environment.set_light_probe", projectPath: root }),
      await dispatchAuthoringOperation({ args: { exportName: "generateArena", generatorId: "arena.layout", inputHash: "sha256:inputs", modulePath: "src/generators/arena.ts", outputHash: "sha256:outputs", outputs: ["content/scenes/arena.scene.json"], overwritePolicy: "manual" }, name: "generator.record", projectPath: root }),
      await dispatchAuthoringOperation({ args: { renderProfile: "parity", runtimeId: "desktop" }, name: "runtime.create", projectPath: root }),
      await dispatchAuthoringOperation({
        args: {
          ambientOcclusionEnabled: true,
          ambientOcclusionIntensity: 1.2,
          ambientOcclusionMode: "screen-space",
          ambientOcclusionQuality: "medium",
          ambientOcclusionRadius: 3,
          motionBlurEnabled: true,
          motionBlurShutterAngle: 0.5,
          renderLookContrast: 0.1,
          renderLookExposure: 1.1,
          renderLookShadowQuality: "high",
          renderProfile: "balanced",
          runtimeId: "desktop",
          screenSpaceGlobalIlluminationEnabled: false,
          screenSpaceGlobalIlluminationIntensity: 1.25,
          screenSpaceGlobalIlluminationQuality: "high",
          screenSpaceGlobalIlluminationRadius: 16,
          screenSpaceReflectionsEnabled: true,
          screenSpaceReflectionsQuality: "medium",
          screenSpaceReflectionsRoughnessLimit: 0.45,
        },
        name: "runtime.set_rendering",
        projectPath: root,
      }),
      await dispatchAuthoringOperation({ args: { sceneId: "scene.generated" }, name: "scene.create", projectPath: root }),
      await dispatchAuthoringOperation({ args: { materialId: "mat.player" }, name: "material.create", projectPath: root }),
      await dispatchAuthoringOperation({
        args: {
          alphaMode: "mask",
          baseColorTexture: "tex.player.albedo",
          color: "#fff",
          emissive: "#33ccff",
          materialId: "mat.player",
          metalness: 0.2,
          normalTexture: "tex.player.normal",
          roughness: 0.4,
        },
        name: "material.set",
        projectPath: root,
      }),
      await dispatchAuthoringOperation({ args: { materialId: "mat.shader" }, name: "material.create", projectPath: root }),
      await dispatchAuthoringOperation({
        args: {
          materialId: "mat.shader",
          shader: {
            inputs: ["uv0"],
            outputs: ["baseColor"],
            program: {
              fragment: {
                outputs: {
                  baseColor: { kind: "uniform", uniform: "tint" },
                },
              },
            },
            uniforms: [{ default: "#00ffaa", name: "tint", type: "color" }],
          },
        },
        name: "material.set",
        projectPath: root,
      }),
      await dispatchAuthoringOperation({ args: { uiDocId: "hud" }, name: "ui.create", projectPath: root }),
      await dispatchAuthoringOperation({ args: { text: "Score", nodeId: "score", uiDocId: "hud" }, name: "ui.add_text", projectPath: root }),
      await dispatchAuthoringOperation({ args: { action: "pause", label: "Pause", nodeId: "pause", type: "button", uiDocId: "hud" }, name: "ui.add_node", projectPath: root }),
      await dispatchAuthoringOperation({ args: { backgroundColor: "#101820", color: "#ffffff", fontSize: 18, nodeId: "pause", uiDocId: "hud", wrap: true }, name: "ui.set_style", projectPath: root }),
      await dispatchAuthoringOperation({ args: { keys: ["Space"], actionId: "jump", inputDocId: "arena" }, name: "input.add_action", projectPath: root }),
      await dispatchAuthoringOperation({ args: { axisId: "MoveX", inputDocId: "arena", negativeKeys: ["A"], positiveKeys: ["D"], value: "gamepad.leftStickX" }, name: "input.add_axis", projectPath: root }),
      await dispatchAuthoringOperation({ args: { kind: "box", meshId: "mesh.player" }, name: "mesh.create_primitive", projectPath: root }),
      await dispatchAuthoringOperation({ args: { file: "content/meshes/mesh.player.meshes.json", kind: "sphere", meshId: "mesh.player" }, name: "mesh.create_primitive", projectPath: root }),
      await dispatchAuthoringOperation({ args: { prefabId: "player" }, name: "prefab.create", projectPath: root }),
      await dispatchAuthoringOperation({ args: { componentKind: "RigidBody", prefabId: "player", value: { kind: "dynamic" } }, name: "prefab.add_component", projectPath: root }),
      await dispatchAuthoringOperation({ args: { componentKind: "Collider", prefabId: "player", value: { kind: "box", size: [1, 1, 1] } }, name: "prefab.set_defaults", projectPath: root }),
      await dispatchAuthoringOperation({ args: { buildTargets: ["web"], projectId: "kart", sourceRoots: ["content", "src"] }, name: "project.create", projectPath: root }),
      await dispatchAuthoringOperation({ args: { budgets: { maxBundleBytes: 1048576, supportedTextureFormats: ["png"] }, targetProfileId: "desktop", targets: ["desktop"] }, name: "target.set_profile", projectPath: root }),
      await dispatchAuthoringOperation({ args: { color: "#2f80ed", prefabId: "prefab.player", primitive: "box", sceneId: "scene.arena" }, name: "scene.add_prefab", projectPath: root }),
      await dispatchAuthoringOperation({ args: { components: { Marker: { value: 1 } }, instanceId: "prefab-player.01", position: [1, 0, 2], prefabId: "prefab.player", sceneId: "scene.arena" }, name: "scene.add_prefab_instance", projectPath: root }),
      await dispatchAuthoringOperation({ args: { origin: [0, 0.6, 0], prefabId: "prefab.player", prefix: "rack", sceneId: "scene.arena", spacing: 0.52 }, name: "scene.layout_ten_pin", projectPath: root }),
      await dispatchAuthoringOperation({ args: { asset: "assets/player.glb", color: "#00ffaa", prefabId: "prefab.player", primitive: "sphere", sceneId: "scene.arena" }, name: "scene.set_prefab", projectPath: root }),
      await dispatchAuthoringOperation({ args: { groupId: "group.lane.red", name: "Red Lane", position: [-2, 0, 0], sceneId: "scene.arena" }, name: "scene.add_group", projectPath: root }),
      await dispatchAuthoringOperation({ args: { entityId: "player", sceneId: "scene.arena", tag: "LaneRed" }, name: "scene.add_tag", projectPath: root }),
      await dispatchAuthoringOperation({ args: { componentKind: "Light", entityId: "player", sceneId: "scene.arena", value: { color: "#ffffff", intensity: 1, kind: "point" } }, name: "scene.set_component", projectPath: root }),
      await dispatchAuthoringOperation({ args: { color: "#ffeeaa", entityId: "player", intensity: 2, kind: "spot", range: 12, angle: 0.6, sceneId: "scene.arena", shadowBias: -0.001, shadowNormalBias: 0.02 }, name: "scene.set_light", projectPath: root }),
      await dispatchAuthoringOperation({ args: { entityId: "player", layers: ["gameplay", "minimap"], sceneId: "scene.arena" }, name: "scene.set_render_layers", projectPath: root }),
      await dispatchAuthoringOperation({ args: { entityId: "player", sceneId: "scene.arena", kind: "dynamic", mass: 3 }, name: "scene.set_rigid_body", projectPath: root }),
      await dispatchAuthoringOperation({ args: { entityId: "player", sceneId: "scene.arena", visible: false }, name: "scene.set_visibility", projectPath: root }),
      await dispatchAuthoringOperation({ args: { activation: "exclusive", initial: true, kind: "level", sceneId: "scene.arena" }, name: "scene.set_lifecycle", projectPath: root }),
    ];
    const material = JSON.parse(await readFile(join(root, "content", "materials", "mat.player.materials.json"), "utf8")) as {
      materials: Array<Record<string, unknown>>;
    };
    const shaderMaterial = JSON.parse(await readFile(join(root, "content", "materials", "mat.shader.materials.json"), "utf8")) as {
      materials: Array<Record<string, unknown>>;
    };
    const asset = JSON.parse(await readFile(join(root, "content", "assets", "model.player.assets.json"), "utf8")) as {
      assets: Array<{ id: string; path: string; type: string }>;
    };
    const renderTargetAsset = JSON.parse(await readFile(join(root, "content", "assets", "rt.minimap.assets.json"), "utf8")) as {
      assets: Array<{ format: string; height: number; id: string; type: string; usage: string; width: number }>;
    };
    const audio = JSON.parse(await readFile(join(root, "content", "audio", "arena.audio.json"), "utf8")) as {
      sounds: Array<{ asset: string; id: string }>;
    };
    const environment = JSON.parse(await readFile(join(root, "content", "environment", "arena.environment.json"), "utf8")) as {
      environmentMap?: Record<string, unknown>;
      path?: unknown;
      lightProbes?: Array<Record<string, unknown>>;
      skybox?: Record<string, unknown>;
      terrain?: Record<string, unknown>;
      walkability?: unknown;
    };
    const generator = JSON.parse(await readFile(join(root, "content", "generators", "arena.layout.generator.json"), "utf8")) as Record<string, unknown>;
    const ui = JSON.parse(await readFile(join(root, "content", "ui", "hud.ui.json"), "utf8")) as {
      nodes: Array<{ action?: string; id: string; label?: string; style?: Record<string, unknown>; text?: string; type: string }>;
    };
    const input = JSON.parse(await readFile(join(root, "content", "input", "arena.input.json"), "utf8")) as {
      actions: Array<{ bindings: string[]; id: string }>;
      axes: Array<{ id: string; negative: string[]; positive: string[]; value?: string }>;
    };
    const mesh = JSON.parse(await readFile(join(root, "content", "meshes", "mesh.player.meshes.json"), "utf8")) as {
      meshes: Array<Record<string, unknown>>;
    };
    const prefab = JSON.parse(await readFile(join(root, "content", "prefabs", "player.prefab.json"), "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string }>;
    };
    const target = JSON.parse(await readFile(join(root, "content", "targets", "desktop.target.json"), "utf8")) as {
      budgets?: Record<string, unknown>;
      targets: string[];
    };
    const runtime = JSON.parse(await readFile(join(root, "content", "runtime", "desktop.runtime.json"), "utf8")) as {
      renderer?: Record<string, unknown>;
    };
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      activation?: string;
      entities: Array<{ components?: Record<string, unknown>; id: string; transform?: { position?: number[] } }>;
      initial?: boolean;
      instances?: Array<{ components?: Record<string, unknown>; id: string; prefab: string; transform?: { position?: number[] } }>;
      kind?: string;
      prefabs: Array<{ asset?: string; color?: string; id: string; primitive?: string }>;
    };

    assert.deepEqual(operations.map((operation) => operation.ok), Array.from({ length: operations.length }, () => true));
    assert.deepEqual(asset.assets, [{ id: "model.player", path: "assets/player.glb", type: "model" }]);
    assert.deepEqual(renderTargetAsset.assets, [{ format: "rgba16f", height: 256, id: "rt.minimap", type: "render-target", usage: "color", width: 512 }]);
    assert.deepEqual(audio.sounds, [{ asset: "sound.hit", id: "hit" }]);
    assert.deepEqual(environment.skybox, { asset: "tex.sky", mode: "equirect" });
    assert.deepEqual(environment.environmentMap, { asset: "tex.env" });
    assert.deepEqual(environment.terrain, { heightMode: "heightmap", heightmap: "tex.height", id: "terrain.arena" });
    assert.deepEqual(environment.path, { id: "path.main", points: [[0, 0, 0], [1, 0, 1]] });
    assert.deepEqual(environment.walkability, { terrain: { height: 0, surface: "terrain.arena" } });
    assert.deepEqual(environment.lightProbes, [{ bounds: { max: [3, 4, 3], min: [-3, 0, -3] }, id: "probe.center", influenceRadius: 5, source: { asset: "tex.env", mode: "equirect" } }]);
    assert.deepEqual(generator, { export: "generateArena", id: "arena.layout", inputHash: "sha256:inputs", module: "src/generators/arena.ts", outputHash: "sha256:outputs", outputs: ["content/scenes/arena.scene.json"], overwritePolicy: "manual", schema: "threenative.generator-provenance", version: "0.1.0" });
    assert.deepEqual(material.materials, [{ alphaMode: "mask", baseColorTexture: "tex.player.albedo", color: "#fff", emissive: "#33ccff", id: "mat.player", metalness: 0.2, normalTexture: "tex.player.normal", roughness: 0.4 }]);
    assert.deepEqual(shaderMaterial.materials, [
      {
        id: "mat.shader",
        inputs: ["uv0"],
        kind: "shader",
        outputs: ["baseColor"],
        program: { fragment: { outputs: { baseColor: { kind: "uniform", uniform: "tint" } } } },
        uniforms: [{ default: "#00ffaa", name: "tint", type: "color" }],
      },
    ]);
    assert.deepEqual(ui.nodes, [
      { id: "score", text: "Score", type: "text" },
      { action: "pause", id: "pause", label: "Pause", style: { backgroundColor: "#101820", color: "#ffffff", fontSize: 18, wrap: true }, type: "button" },
    ]);
    assert.deepEqual(input.actions, [{ bindings: ["keyboard.Space"], id: "jump" }]);
    assert.deepEqual(input.axes, [{ id: "MoveX", negative: ["keyboard.KeyA"], positive: ["keyboard.KeyD"], value: "gamepad.leftStickX" }]);
    assert.deepEqual(mesh.meshes, [{ id: "mesh.player", kind: "primitive", primitive: "sphere" }]);
    assert.deepEqual(prefab.entities[0]?.components, { Collider: { kind: "box", size: [1, 1, 1] }, RigidBody: { kind: "dynamic" } });
    assert.deepEqual(target.targets, ["desktop"]);
    assert.deepEqual(target.budgets, { maxBundleBytes: 1048576, supportedTextureFormats: ["png"] });
    assert.deepEqual(runtime.renderer?.renderLook, { version: 1, profile: "balanced", overrides: { contrast: 0.1, exposure: 1.1, shadowQuality: "high" } });
    assert.deepEqual(runtime.renderer?.ambientOcclusion, { enabled: true, intensity: 1.2, mode: "screen-space", quality: "medium", radius: 3 });
    assert.deepEqual(runtime.renderer?.screenSpaceReflections, { enabled: true, quality: "medium", roughnessLimit: 0.45 });
    assert.deepEqual(runtime.renderer?.motionBlur, { enabled: true, shutterAngle: 0.5 });
    assert.deepEqual(runtime.renderer?.screenSpaceGlobalIllumination, { enabled: false, intensity: 1.25, quality: "high", radius: 16 });
    assert.deepEqual(scene.prefabs, [{ asset: "assets/player.glb", color: "#00ffaa", id: "prefab.player", primitive: "sphere" }]);
    assert.deepEqual(scene.instances?.map((instance) => instance.id), ["prefab-player.01", "rack.01", "rack.02", "rack.03", "rack.04", "rack.05", "rack.06", "rack.07", "rack.08", "rack.09", "rack.10"]);
    assert.deepEqual(scene.instances?.find((instance) => instance.id === "prefab-player.01")?.transform?.position, [1, 0, 2]);
    assert.equal(scene.instances?.some((instance) => instance.id.startsWith("rack.") && instance.components !== undefined), false);
    assert.deepEqual(scene.instances?.find((instance) => instance.id === "rack.10")?.transform?.position, [0.78, 0.6, -1.56]);
    assert.deepEqual(scene.entities.find((entity) => entity.id === "group.lane.red"), {
      components: { SceneContainer: { kind: "group", name: "Red Lane" } },
      id: "group.lane.red",
      transform: { position: [-2, 0, 0] },
    });
    assert.deepEqual(scene.entities.find((entity) => entity.id === "player")?.components?.LaneRed, {});
    assert.deepEqual(scene.entities.find((entity) => entity.id === "player")?.components?.Light, { angle: 0.6, color: "#ffeeaa", intensity: 2, kind: "spot", range: 12, shadowBias: -0.001, shadowNormalBias: 0.02 });
    assert.deepEqual(scene.entities.find((entity) => entity.id === "player")?.components?.RenderLayers, { layers: ["gameplay", "minimap"] });
    assert.deepEqual(scene.entities.find((entity) => entity.id === "player")?.components?.RigidBody, { kind: "dynamic", mass: 3 });
    assert.deepEqual(scene.entities.find((entity) => entity.id === "player")?.components?.Visibility, { visible: false });
    assert.equal(scene.kind, "level");
    assert.equal(scene.activation, "exclusive");
    assert.equal(scene.initial, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should dispatch file-targeted system metadata operations through the registry", async () => {
  const root = await createRegistryProject();
  try {
    await mkdir(join(root, "content", "systems"), { recursive: true });
    await writeFile(join(root, "spin.ts"), "export function spin() {}\n");
    await writeFile(
      join(root, "content", "systems", "arena.systems.json"),
      `${JSON.stringify({ schema: "threenative.systems", version: "0.1.0", id: "arena", systems: [{ id: "spin", schedule: "update", script: { module: "spin.ts", export: "spin" }, writes: ["Velocity"] }] }, null, 2)}\n`,
    );

    const script = await dispatchAuthoringOperation({
      args: { exportName: "spin", file: "content/systems/arena.systems.json", modulePath: "spin.ts", systemId: "spin" },
      name: "system.attach_script",
      projectPath: root,
    });
    const metadata = await dispatchAuthoringOperation({
      args: { file: "content/systems/arena.systems.json", reads: ["Transform"], schedule: "fixedUpdate", systemId: "spin", writes: ["Velocity", "AngularVelocity"] },
      name: "system.set_metadata",
      projectPath: root,
    });
    const systems = JSON.parse(await readFile(join(root, "content", "systems", "arena.systems.json"), "utf8")) as {
      systems: Array<{ id: string; reads?: string[]; schedule?: string; script?: Record<string, unknown>; writes?: string[] }>;
    };
    const spin = systems.systems.find((system) => system.id === "spin");

    assert.equal(script.ok, true);
    assert.equal(metadata.ok, true);
    assert.deepEqual(spin?.script, { export: "spin", module: "spin.ts" });
    assert.deepEqual(spin?.reads, ["Transform"]);
    assert.equal(spin?.schedule, "fixedUpdate");
    assert.deepEqual(spin?.writes, ["AngularVelocity", "Velocity"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should dispatch stylized nature defaults from the shared contract", async () => {
  const root = await createRegistryProject();
  try {
    const contract = JSON.parse(await readFile(join(process.cwd(), "../ir/fixtures/stylized-nature-contract.json"), "utf8")) as {
      authoredDefaults: Record<string, unknown>;
      densityDefaults: Record<"high", { grassCount: number; treeCount: number }>;
    };
    const result = await dispatchAuthoringOperation({
      args: {
        density: "high",
        entityId: "player",
        sceneId: "scene.arena",
      },
      name: "scene.set_stylized_nature",
      projectPath: root,
    });
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string }>;
    };
    const nature = scene.entities.find((entity) => entity.id === "player")?.components?.StylizedNature as Record<string, unknown> | undefined;

    assert.equal(result.ok, true);
    assert.deepEqual(nature, {
      ...contract.authoredDefaults,
      density: "high",
      grassCount: contract.densityDefaults.high.grassCount,
      treeCount: contract.densityDefaults.high.treeCount,
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should expose operation metadata and registry diagnostics", async () => {
  const descriptors = listAuthoringOperationDescriptors();
  const transform = getAuthoringOperationDescriptor("scene.set_transform");
  const camera = getAuthoringOperationDescriptor("scene.set_camera");
  const missing = await dispatchAuthoringOperation({ args: { entityId: "player" }, name: "scene.set_transform", projectPath: "/project" });
  const invalidEnum = await dispatchAuthoringOperation({ args: { cameraId: "camera", mode: "fisheye", sceneId: "scene", targetId: "player" }, name: "scene.set_camera", projectPath: "/project" });
  const unsupported = await dispatchAuthoringOperation({ args: {}, name: "scene.delete_entity", projectPath: "/project" });

  assert.deepEqual(AUTHORING_OPERATION_NAMES, [
    "distribution.set_app",
    "distribution.set_target",
    "archetype.apply",
    "archetype.update",
    "archetype.list",
    "asset.add",
    "audio.create",
    "audio.add_sound",
    "environment.create",
    "environment.set_skybox",
    "environment.set_map",
    "environment.set_volumetrics",
    "environment.set_light_probe",
    "environment.set_path",
    "environment.set_terrain",
    "environment.set_walkability",
    "environment.set_source_asset_lod",
    "generator.record",
    "generator.record_blender",
    "generator.record_img2threejs",
    "scene.create",
    "scene.placement_add",
    "scene.placement_inspect",
    "scene.placement_migrate",
    "scene.placement_apply",
    "input.add_action",
    "input.add_axis",
    "input.set_controls",
    "input.set_override",
    "material.create",
    "material.set",
    "mesh.create_primitive",
    "mesh.create_custom",
    "prefab.create",
    "prefab.add_component",
    "prefab.set_defaults",
    "project.create",
    "resources.create",
    "resources.add",
    "resources.set",
    "flow.create",
    "flow.add_state",
    "flow.add_transition",
    "sequence.create",
    "sequence.add_track",
    "sequence.add_key",
    "schema.create",
    "schema.set",
    "runtime.create",
    "runtime.set_window",
    "runtime.set_rendering",
    "target.set_profile",
    "scene.add_entity",
    "scene.remove_entity",
    "scene.remove_ui_node",
    "scene.remove_resource",
    "scene.add_prefab_instance",
    "scene.add_prefab_instances",
    "scene.layout_ten_pin",
    "scene.add_group",
    "scene.add_prefab",
    "scene.add_tag",
    "scene.add_resource",
    "scene.add_ui_node",
    "scene.set_transform",
    "scene.set_camera",
    "scene.set_component",
    "scene.set_stylized_nature",
    "scene.set_stylized_sparkles",
    "scene.set_ripple_water",
    "scene.set_camera_component",
    "scene.set_light",
    "scene.set_lifecycle",
    "scene.set_prefab",
    "scene.set_mesh_renderer",
    "scene.set_render_layers",
    "scene.set_rigid_body",
    ...["compound", "wheel", "vehicle", "aerodynamics", "joint", "destructible"].flatMap((family) => ["add", "set", "remove", "inspect", "validate"].map((action) => `physics.${family}.${action}`)),
    "physics.wind.add",
    "physics.wind.inspect",
    "physics.wind.validate",
    "scene.set_spawner",
    "scene.set_collider",
    "scene.set_character_controller",
    "scene.set_visibility",
    "scene.remove_component",
    "scene.set_resource",
    "scene.attach_script",
    "scene.bind_ui",
    "ui.create",
    "ui.add_text",
    "ui.add_node",
    "ui.add_component",
    "ui.apply_recipe",
    "ui.remove_component",
    "ui.set_layout",
    "ui.bind",
    "ui.set_style",
    "system.create",
    "system.attach_script",
    "system.set_metadata",
  ]);
  assert.equal(descriptors.length, AUTHORING_OPERATION_NAMES.length);
  assert.equal(transform?.pathPolicy, "source-document");
  assert.equal(transform?.sourceFamily, "scene");
  assert.deepEqual(transform?.adapters?.cli?.path, ["scene", "set-transform"]);
  assert.equal(camera?.arguments.find((argument) => argument.name === "mode")?.constraints?.enumValues?.includes("third-person-follow"), true);
  assert.equal(renderAuthoringOperationCliUsage("material.set")?.includes("--shader-json <json>"), true);
  assert.equal(renderAuthoringOperationCliUsage("runtime.set_rendering")?.includes("--bloom <true|false>"), true);
  assert.equal(renderAuthoringOperationCliUsage("runtime.set_rendering")?.includes("--ambient-occlusion <true|false>"), true);
  assert.equal(renderAuthoringOperationCliUsage("runtime.set_rendering")?.includes("--screen-space-reflections-roughness-limit <n>"), true);
  assert.equal(renderAuthoringOperationCliUsage("runtime.set_rendering")?.includes("--screen-space-global-illumination-intensity <n>"), true);
  assert.equal(renderAuthoringOperationCliUsage("runtime.set_rendering")?.includes("--screen-space-global-illumination-radius <n>"), true);
  assert.deepEqual(
    buildAuthoringOperationCliArgv("scene.set_transform", { entityId: "player", sceneId: "scene.arena", transform: { position: [1, 2, 3] } }, { projectPath: "/project" }),
    ["scene", "set-transform", "scene.arena", "player", "--position", "1,2,3", "--project", "/project", "--json"],
  );
  assert.throws(
    () => buildAuthoringOperationCliArgv("scene.add_entity", { entityId: "player", sceneId: "scene.arena" }, { projectPath: "/project" }),
    /missing CLI adapter metadata/,
  );
  assert.equal("dispatch" in (transform ?? {}), false);
  for (const descriptor of descriptors) {
    const namespace = descriptor.name.split(".")[0];
    assert.equal(descriptor.sourceFamily, namespace, `${descriptor.name} source family should match its namespace`);
    assert.equal("dispatch" in descriptor, false, `${descriptor.name} descriptor should not expose dispatch`);
  }
  descriptors[0]?.arguments.push({ name: "mutated", required: false, type: "string" });
  assert.equal(getAuthoringOperationDescriptor("asset.add")?.arguments.some((argument) => argument.name === "mutated"), false);
  assert.equal(missing.ok, false);
  assert.equal(missing.diagnostics[0]?.code, "TN_AUTHORING_OPERATION_ARG_MISSING");
  assert.equal(missing.diagnostics[0]?.path, "/sceneId");
  assert.equal(invalidEnum.ok, false);
  assert.equal(invalidEnum.diagnostics[0]?.code, "TN_AUTHORING_OPERATION_ARG_INVALID");
  assert.equal(invalidEnum.diagnostics[0]?.path, "/mode");
  assert.equal(unsupported.diagnostics[0]?.code, "TN_AUTHORING_OPERATION_UNSUPPORTED");
});

async function createRegistryProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-operation-registry-"));
  await mkdir(join(root, "content", "scenes"), { recursive: true });
  await writeFile(
    join(root, "content", "scenes", "arena.scene.json"),
    `${JSON.stringify(
      {
        schema: "threenative.scene",
        version: "0.1.0",
        id: "scene.arena",
        entities: [{ id: "player", transform: { position: [0, 0, 0] } }],
        prefabs: [],
        resources: [],
        systems: [],
        ui: { nodes: [] },
      },
      null,
      2,
    )}\n`,
  );
  return root;
}

function validBlenderRecipe(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: "threenative.blender-recipe",
    version: "0.1.0",
    id: "prop.crate",
    budgets: { maxOutputBytes: 8 * 1024 * 1024, maxPolygons: 20_000 },
    materials: [{ id: "paint", baseColor: [0.08, 0.32, 0.8, 1], metallic: 0.1, roughness: 0.42 }],
    parts: [{ id: "body", primitive: "cube", material: "paint", scale: [1, 1, 1], modifiers: [{ kind: "bevel", width: 0.08, segments: 3 }] }],
    ...overrides,
  };
}

async function createReviewedImg2ThreejsWorkspace(root: string): Promise<{ output: string; recipePath: string }> {
  const recipePath = "content/generators/prop.radio.img2threejs.json";
  const output = "assets/generated/prop.radio.glb";
  await mkdir(join(root, "content/generators"), { recursive: true });
  await mkdir(join(root, "content/references"), { recursive: true });
  await mkdir(join(root, "src/generators"), { recursive: true });
  await mkdir(join(root, "artifacts/img2threejs/prop.radio"), { recursive: true });
  await writeFile(join(root, "content/references/prop.radio.png"), "reference-image");
  await writeFile(join(root, "content/references/prop.radio-albedo.png"), "albedo-texture");
  await writeFile(join(root, "src/generators/createPropRadioModel.ts"), "export function createPropRadioModel() { return {}; }\n");
  await writeFile(join(root, "artifacts/img2threejs/prop.radio/blockout.png"), "blockout-render");
  await writeFile(join(root, "artifacts/img2threejs/prop.radio/blockout-comparison.png"), "blockout-comparison");
  const visualEvidence = {
    referenceScreenshot: "content/references/prop.radio.png",
    renderScreenshot: "artifacts/img2threejs/prop.radio/blockout.png",
    comparisonImage: "artifacts/img2threejs/prop.radio/blockout-comparison.png",
    cameraView: "three-quarter",
    notes: "accepted",
    aiVisionNotes: "accepted",
  };
  const buildPasses = [
    { id: "blockout", goal: "Match silhouette", componentRefs: ["root"], acceptance: ["Silhouette accepted"] },
    { id: "structural-pass", goal: "Confirm structure", componentRefs: ["root"], acceptance: ["Structure accepted"] },
    { id: "material-pass", goal: "Confirm material", componentRefs: ["root"], acceptance: ["Material accepted"] },
    { id: "optimization-pass", goal: "Confirm budgets", componentRefs: ["root"], acceptance: ["Budgets accepted"] },
  ];
  const featureReviewTarget = { id: "body", name: "Radio body", tier: "critical", mustPass: true, passIds: ["blockout", "structural-pass", "material-pass"], componentRefs: ["root"], evidenceRefs: ["full-object"], minimumScore: 0.85 };
  const acceptedVisualReview = (passId: string, timestamp: string) => ({ timestamp, passId, estimatedFidelity: 0.92, aiVisionScore: 0.93, visualAcceptanceThreshold: 0.7, layerScores: { silhouette: 0.94 }, featureReviews: [{ id: "body", score: 0.92, visible: true }], action: "continue", summary: "accepted", matched: [], mismatches: [], specFixes: [], codeFixes: [], evidence: [], visualEvidence });
  const spec = {
    targetName: "Radio",
    targetId: "prop.radio",
    schemaVersion: "2.0",
    sourceImage: "content/references/prop.radio.png",
    suitability: "pass",
    coordinateFrame: { up: "+Y" },
    silhouette: { primary: "rounded box" },
    preSpecAssessment: {
      objectClass: { primaryType: "portable radio", primaryDomain: "object", formLanguage: ["rectilinear"], structureKind: ["enclosure"], motionPotential: ["static"], materialFamilies: ["plastic"] },
      complexity: { tier: "simple", scores: {}, estimatedCounts: { macroComponents: 1, materialLayers: 1 }, reasoning: ["One primary enclosure"] },
      specDepthDecision: { requiredDepth: "simple", minimumComponentLevels: ["macro"], needsRepetitionSystems: false, needsMaterialLocalOverrides: false, needsMultipleReviewViews: false, needsActionReadyHierarchy: false },
      unknownsToResolveBeforeImplementation: [],
      detailInventory: { targetMinDetails: 0, details: [] },
    },
    componentTree: [{ id: "root", level: "macro", primitive: "box", material: "paint" }],
    materials: [{ id: "paint", colorVariation: { palette: ["#333333", "#666666"] }, roughness: { base: 0.6, variation: 0.1, map: "independent-roughness" }, dirt: { amount: 0.1 }, referencePbr: { maps: { albedo: { path: "content/references/prop.radio-albedo.png" }, roughness: { path: "content/references/prop.radio-albedo.png" }, height: { path: "content/references/prop.radio-albedo.png" }, normal: { path: "content/references/prop.radio-albedo.png" }, ao: { path: "content/references/prop.radio-albedo.png" } } } }],
    proceduralStrategy: ["Build blockout"],
    qualityContract: {
      qualityBar: "simple",
      definitionOfDone: ["The reviewed radio matches the reference."],
      minimumSpecDepth: { macroComponents: 1, mesoComponents: 0, microFeatureGroups: 0, materialLayers: 1, repetitionSystems: 0, reviewViewpoints: 0 },
      featureGroups: [
        { id: "silhouette", name: "Silhouette", required: true, qualityCriteria: ["Match silhouette"] },
        { id: "structure", name: "Structure", required: true, qualityCriteria: ["Match structure"] },
        { id: "material", name: "Material", required: true, qualityCriteria: ["Match material"] },
      ],
      visualDeltaChecks: ["Compare silhouette"],
      antiShallowSpecRules: ["Require all passes"],
    },
    lookDevTargets: { qualityPriority: "standard" },
    lightingFromPhoto: ["key light with exposure", "fill light with filmic tone mapping", "environment light with contact shadow"],
    selfCorrectLoop: { visualAcceptance: { threshold: 0.7, layerScoresRequired: true, requiredLayerScores: ["silhouette"], featureReviewPolicy: { enabled: true, criticalDefaultThreshold: 0.8 } } },
    featureReviewTargets: [featureReviewTarget],
    buildPasses,
    reviewHistory: [
      acceptedVisualReview("blockout", "2026-07-21T00:00:00.000Z"),
      acceptedVisualReview("structural-pass", "2026-07-21T00:01:00.000Z"),
      acceptedVisualReview("material-pass", "2026-07-21T00:02:00.000Z"),
      { timestamp: "2026-07-21T00:03:00.000Z", passId: "optimization-pass", estimatedFidelity: 0.92, aiVisionScore: null, visualAcceptanceThreshold: 0.7, layerScores: {}, featureReviews: [], action: "continue", summary: "accepted", matched: [], mismatches: [], specFixes: [], codeFixes: [], evidence: [] },
    ],
    sculptPipeline: { passGateMode: "locked-sequential", passOrder: buildPasses.map((pass) => pass.id), currentPass: "complete", completedPasses: buildPasses.map((pass) => pass.id), lastCompletedPass: "optimization-pass", blockedReason: "all build passes completed", nextRequiredEvidence: [] },
  };
  const recipe = {
    schema: "threenative.img2threejs-generator",
    version: "0.1.0",
    id: "prop.radio",
    sourceImage: "content/references/prop.radio.png",
    sculptSpec: "content/generators/prop.radio.sculpt-spec.json",
    validationReport: "content/generators/prop.radio.validation.json",
    factory: { module: "src/generators/createPropRadioModel.ts", export: "createPropRadioModel" },
    upstream: { repository: "https://github.com/hoainho/img2threejs", commit: "e8ff28a6ae0cb534c7b2ebc15cb3f06709262d5b", skillVersion: "1.2.0" },
    export: { rootNode: "prop.radio", embedTextures: true, includeRuntimeExtras: true },
    budgets: { maxOutputBytes: 33_554_432, maxTriangles: 250_000, maxMaterials: 64, maxTextures: 64, timeoutMs: 120_000 },
  };
  const specBytes = `${JSON.stringify(spec, null, 2)}\n`;
  const specHash = `sha256:${createHash("sha256").update(specBytes).digest("hex")}`;
  const validationReport = {
    schema: "threenative.img2threejs-validation",
    version: "0.1.0",
    validator: {
      repository: "https://github.com/hoainho/img2threejs",
      commit: "e8ff28a6ae0cb534c7b2ebc15cb3f06709262d5b",
      skillVersion: "1.2.0",
      command: "python3 forge/stage2_spec/validate_sculpt_spec.py content/generators/prop.radio.sculpt-spec.json --strict-quality --json",
    },
    sculptSpecHash: specHash,
    result: {
      ok: true,
      errors: [],
      warnings: [
        "missing terminologyProfile; descriptions may drift into vague non-3D language",
        "missing scores block; image validation evidence will be weaker",
        "missing qualityTargets; self-correction loop has no explicit fidelity bar",
        "missing actionReadiness; generated model may not be ready for animation/transformation/destruction",
        "selfCorrectLoop.screenshotPolicy is missing; visual review may drift without screenshots",
        "missing viewEvidence; local visual claims cannot be traced back to image regions",
        "component 'root' is missing actionProfile; future animation/destruction may require refactor",
        "only one component found; this is likely still blockout quality",
      ],
      summary: { targetName: "Radio", suitability: "pass", components: 1, materials: 1 },
    },
  };
  await writeFile(join(root, "content/generators/prop.radio.sculpt-spec.json"), specBytes);
  await writeFile(join(root, "content/generators/prop.radio.validation.json"), `${JSON.stringify(validationReport, null, 2)}\n`);
  await writeFile(join(root, recipePath), `${JSON.stringify(recipe, null, 2)}\n`);
  return { output, recipePath };
}
