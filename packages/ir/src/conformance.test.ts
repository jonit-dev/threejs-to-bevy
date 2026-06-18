import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { listConformanceFixtures } from "./conformance.js";
import { validateBundle } from "./validate.js";

const cwd = process.cwd();
const packageRoot = cwd.endsWith("/packages/ir") ? cwd : resolve(cwd, "packages/ir");
const repoRoot = cwd.endsWith("/packages/ir") ? resolve(cwd, "../..") : cwd;

test("should validate every conformance fixture", async () => {
  const fixtures = await listConformanceFixtures();

  assert.ok(fixtures.length > 0);

  for (const fixture of fixtures) {
    const result = await validateBundle(fixture.bundlePath);
    assert.deepEqual(result.diagnostics, [], fixture.name);
    assert.equal(result.ok, true, fixture.name);
  }
});

test("should define V7 conformance fixture categories before runtime claims", async () => {
  const catalog = JSON.parse(await readFile(resolve(packageRoot, "fixtures/conformance/v7-fixture-catalog.json"), "utf8"));

  assert.equal(catalog.schema, "threenative.conformance.v7-fixture-catalog");
  assert.equal(catalog.version, "0.1.0");
  assert.equal(catalog.categories.length, 8);

  const tickets = new Set<string>();
  for (const category of catalog.categories) {
    assert.match(category.id, /^v7-/);
    assert.match(category.ticket, /^V7-0[2-9]$/);
    assert.equal(typeof category.baselineBundlePath, "string", category.id);
    assert.ok(category.baselineBundlePath.endsWith("/game.bundle") || category.baselineBundlePath.includes("/dist/"), category.id);
    assert.ok(category.acceptedBundlePath.endsWith("/game.bundle"), category.id);
    assert.ok(category.rejectedBundlePath.endsWith("/game.bundle"), category.id);
    assert.ok(category.acceptedFixtureId.startsWith("v7-"), category.id);
    assert.ok(category.rejectedFixtureId.startsWith("v7-rejected-"), category.id);
    assert.ok(category.targetCapabilities.length > 0, category.id);
    assert.deepEqual(category.targetCapabilities, [...category.targetCapabilities].sort(), category.id);
    assert.equal(category.reportArtifacts.length >= 2, true, category.id);
    assert.ok(category.reportArtifacts.every((path: string) => path.startsWith(`artifacts/conformance/${category.acceptedFixtureId}/`)), category.id);
    assert.ok(category.rejectedDiagnosticCodes.length > 0, category.id);
    assert.ok(category.rejectedDiagnosticCodes.every((code: string) => code.startsWith("TN_V7_")), category.id);
    tickets.add(category.ticket);
  }

  assert.deepEqual([...tickets].sort(), ["V7-02", "V7-03", "V7-04", "V7-05", "V7-06", "V7-07", "V7-08", "V7-09"]);
});

test("should include capability tags for each conformance fixture", async () => {
  const fixtures = await listConformanceFixtures();
  const byName = new Map(fixtures.map((fixture) => [fixture.name, fixture]));

  for (const fixture of fixtures) {
    assert.ok(fixture.capabilityTags.length > 0, fixture.name);
    assert.deepEqual(fixture.capabilityTags, [...fixture.capabilityTags].sort(), fixture.name);
  }

  assertFixtureCapabilities(byName, "basic-scene", [
    "rendering:mesh.primitive.box",
    "rendering:mesh.primitive.capsule",
    "rendering:mesh.primitive.cylinder",
    "rendering:material.standard",
    "rendering:light.directional",
    "rendering:camera.perspective",
    "transform:hierarchy",
  ]);
  assertFixtureCapabilities(byName, "primitive-mapping", [
    "rendering:mesh.primitive.annulus",
    "rendering:mesh.primitive.box",
    "rendering:mesh.primitive.capsule",
    "rendering:mesh.primitive.circle",
    "rendering:mesh.primitive.cone",
    "rendering:mesh.primitive.conicalFrustum",
    "rendering:mesh.primitive.cylinder",
    "rendering:mesh.primitive.extrudedRectangle",
    "rendering:mesh.primitive.plane",
    "rendering:mesh.primitive.regularPolygon",
    "rendering:mesh.primitive.sphere",
    "rendering:mesh.primitive.torus",
    "rendering:material.standard",
    "rendering:light.directional",
    "rendering:camera.perspective",
    "transform:hierarchy",
  ]);
  assertFixtureCapabilities(byName, "procedural-mesh", [
    "asset:mesh.generated",
    "ecs:resources",
    "rendering:camera.active",
    "rendering:camera.orthographic",
    "rendering:light.ambient",
    "rendering:light.directional",
    "rendering:material.standard",
    "rendering:mesh-renderer",
    "rendering:mesh.primitive.custom",
  ]);
  assertFixtureCapabilities(byName, "v5-drift-surface", [
    "asset:model.gltf",
    "asset:texture.png",
    "environment:atmosphere",
    "environment:camera-bookmarks",
    "rendering:camera.active",
    "rendering:camera.orthographic",
    "rendering:fog.exponential",
    "rendering:light.angle",
    "rendering:light.point",
    "rendering:light.range",
    "rendering:light.spot",
    "rendering:material.texture.base-color",
    "rendering:shadows",
    "rendering:visibility",
    "scripting:script-bundle",
  ]);
  assertFixtureCapabilities(byName, "v6-resources-events", [
    "ecs:event-schemas",
    "ecs:events",
    "ecs:resource-schemas",
    "ecs:resources",
    "scripting:event-reads",
    "scripting:event-writes",
    "scripting:resource-reads",
    "scripting:resource-writes",
    "scripting:schedule.startup",
    "scripting:schedule.update",
    "scripting:script-bundle",
    "scripting:systems",
  ]);
  assertFixtureCapabilities(byName, "v6-physics-events", [
    "physics:collider.box",
    "physics:collider.sphere",
    "physics:collision-events",
    "physics:rigid-body.kinematic",
    "physics:rigid-body.static",
    "physics:trigger-collider",
  ]);
  assertFixtureCapabilities(byName, "v6-animation-clips", [
    "animation:clip-metadata",
    "animation:playback-service",
    "asset:model.glb",
    "scripting:schedule.update",
    "scripting:script-bundle",
    "scripting:systems",
  ]);
  assertFixtureCapabilities(byName, "v6-audio-playback", [
    "asset:audio.ogg",
    "asset:audio.wav",
    "audio:autoplay",
    "audio:loop",
    "audio:one-shot",
    "audio:volume",
    "ecs:events",
  ]);
  assertFixtureCapabilities(byName, "v6-retained-ui", [
    "ui:action",
    "ui:binding.resource",
    "ui:focusable",
    "ui:node.bar",
    "ui:node.button",
    "ui:node.column",
    "ui:node.stack",
    "ui:node.text",
    "ui:runtime",
  ]);
  assertFixtureCapabilities(byName, "v7-advanced-physics-character", [
    "character:blocking",
    "character:controller",
    "character:grounding",
    "input:axes",
    "physics:collider.box",
    "physics:collider.sphere",
    "physics:contact-filtering",
    "physics:query.overlap",
    "physics:query.shape-cast",
    "physics:rigid-body.kinematic",
    "physics:rigid-body.static",
    "scripting:schedule.fixedUpdate",
    "scripting:script-bundle",
    "scripting:service.physics.overlap",
    "scripting:service.physics.shapeCast",
    "scripting:systems",
  ]);
  assertFixtureCapabilities(byName, "v7-animation-graphs-particles", [
    "animation:clip-metadata",
    "animation:events",
    "animation:graph",
    "animation:state-machine",
    "asset:model.glb",
    "particles:bounded-emitter",
  ]);
  assertFixtureCapabilities(byName, "v7-rich-ui-navigation", [
    "ui:action",
    "ui:focus-order",
    "ui:input-actions",
    "ui:navigation",
    "ui:node.button",
    "ui:node.column",
    "ui:node.stack",
    "ui:runtime",
    "ui:safe-area",
  ]);
  assertFixtureCapabilities(byName, "v7-spatial-audio-buses", [
    "asset:audio.ogg",
    "asset:audio.wav",
    "audio:autoplay",
    "audio:bus",
    "audio:listener",
    "audio:loop",
    "audio:music",
    "audio:one-shot",
    "audio:spatial-emitter",
    "audio:volume",
    "audio:volume-routing",
    "ecs:events",
  ]);
  assertFixtureCapabilities(byName, "v7-renderer-dense-content", [
    "asset:imported-transform",
    "asset:model.gltf",
    "environment:camera-bookmarks",
    "environment:instances",
    "environment:lod",
    "environment:path",
    "environment:scatter-instances",
    "environment:scene",
    "environment:source-assets",
    "environment:terrain",
    "rendering:instancing-observation",
    "rendering:runtime-lod",
  ]);
  assertFixtureCapabilities(byName, "v7-scripting-lifecycle", [
    "ecs:component-hooks",
    "ecs:component-reflection",
    "ecs:component-schemas",
    "ecs:event-schemas",
    "ecs:events",
    "ecs:observer-propagation",
    "ecs:plugin-composition",
    "ecs:resource-schemas",
    "ecs:resources",
    "scripting:channels",
    "scripting:command.despawn",
    "scripting:command.spawn",
    "scripting:component-hooks",
    "scripting:component-reflection",
    "scripting:event-reads",
    "scripting:event-writes",
    "scripting:hot-reload.invalidate",
    "scripting:larger-fixtures",
    "scripting:plugin-composition",
    "scripting:replay.fixed-trace",
    "scripting:resource-reads",
    "scripting:resource-writes",
    "scripting:schedule.fixedUpdate",
    "scripting:schedule.postUpdate",
    "scripting:schedule.startup",
    "scripting:schedule.update",
    "scripting:script-bundle",
    "scripting:service.animation.play",
    "scripting:observer-propagation",
    "scripting:state.app",
    "scripting:state.computed",
    "scripting:state.substate",
    "scripting:state.system-local-disallowed",
    "scripting:systems",
    "scripting:tasks",
  ]);
  assertFixtureCapabilities(byName, "v7-packaging-target-profiles", [
    "diagnostics:platform",
    "packaging:bundle-loading",
    "packaging:desktop",
    "packaging:target-profile",
    "rendering:camera.perspective",
    "rendering:light.directional",
    "rendering:material.standard",
    "rendering:mesh.primitive.box",
    "rendering:mesh.primitive.capsule",
    "rendering:mesh.primitive.cylinder",
    "transform:hierarchy",
  ]);
  assertFixtureCapabilities(byName, "v7-performance-budgets", [
    "performance:asset-load-budget",
    "performance:draw-instance-budget",
    "performance:entity-budget",
    "performance:frame-budget",
    "performance:package-size-budget",
    "rendering:camera.perspective",
    "rendering:light.directional",
    "rendering:material.standard",
    "rendering:mesh.primitive.box",
    "transform:hierarchy",
  ]);
  assertFixtureCapabilities(byName, "v8-overlay-webview", [
    "overlay:bridge",
    "overlay:input.none",
    "overlay:target.desktop",
    "overlay:target.web",
    "overlay:transparent",
    "overlay:webview",
  ]);
  assertFixtureCapabilities(byName, "v9-animation-state", [
    "scripting:schedule.update",
    "scripting:script-bundle",
    "scripting:service.animation.play",
    "scripting:service.animation.query",
    "scripting:service.animation.stop",
    "scripting:systems",
  ]);
  assertFixtureCapabilities(byName, "v9-animation-blending", [
    "animation:blend.crossfade",
    "animation:clip-metadata",
    "animation:graph",
    "asset:model.glb",
    "scripting:schedule.update",
    "scripting:script-bundle",
    "scripting:service.animation.play",
    "scripting:service.animation.query",
    "scripting:systems",
  ]);
  assertFixtureCapabilities(byName, "v9-physics-character-solver", [
    "physics:collider.box",
    "physics:collider.capsule",
    "physics:primitive-solver-v2",
    "physics:rigid-body.dynamic",
    "physics:rigid-body.kinematic",
    "physics:rigid-body.static",
  ]);
  assertFixtureCapabilities(byName, "v10-ecs-tags-groups", [
    "ecs:component-schemas",
    "ecs:tags",
    "rendering:material.standard",
    "rendering:mesh-renderer",
    "rendering:mesh.primitive.box",
    "scripting:queries",
    "scripting:schedule.fixedUpdate",
    "scripting:systems",
    "transform:hierarchy",
    "transform:scene-container",
  ]);
});

test("should require every V9 catalog fixture to have a bundle and owner PRD", async () => {
  const catalog = JSON.parse(await readFile(resolve(packageRoot, "fixtures/conformance/v9-fixture-catalog.json"), "utf8"));

  assert.equal(catalog.schema, "threenative.conformance.v9-fixture-catalog");
  assert.equal(catalog.version, "0.1.0");
  assert.ok(catalog.fixtures.length > 0);

  for (const fixture of catalog.fixtures) {
    assert.match(fixture.id, /^v9-/);
    assert.ok(fixture.ownerPrd?.startsWith("docs/PRDs/v9/"), fixture.id);
    assert.equal(fixture.aggregateGate, "verify:v9", fixture.id);
    assert.ok(fixture.bundlePath.endsWith("/game.bundle"), fixture.id);
    await access(resolve(repoRoot, fixture.bundlePath));
    assert.ok((fixture.promotedCapabilities ?? []).length > 0, fixture.id);
  }
});

function assertFixtureCapabilities(
  byName: ReadonlyMap<string, { capabilityTags: string[] }>,
  fixtureName: string,
  expectedTags: string[],
): void {
  const fixture = byName.get(fixtureName);
  assert.ok(fixture, fixtureName);
  for (const tag of expectedTags) {
    assert.ok(fixture.capabilityTags.includes(tag), `${fixtureName} ${tag}`);
  }
}
