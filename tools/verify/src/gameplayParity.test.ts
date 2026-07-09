import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { defaultGameplayParityManifest, runGameplayParityGate, type GameplayParityRunner } from "./gameplayParity.js";
import { type GameplayParityManifest } from "./gameplayParityManifest.js";

test("should write a passing gameplay parity report when all enrolled cases pass", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-gameplay-parity-pass-"));
  const manifest: GameplayParityManifest = {
    schemaVersion: 1,
    entries: [
      {
        id: "forward-smoke",
        kind: "playtestScenario",
        mode: "enforced",
        project: "examples/humanoid-physics-course",
        scenario: "playtests/humanoid-course-forward-movement.playtest.json",
        targets: ["web", "desktop"],
      },
    ],
  };
  const runner: GameplayParityRunner = {
    async run(entry) {
      return {
        assertionResults: [
          {
            id: `${entry.id}.movement`,
            kind: "movementDistance",
            pass: true,
            surface: "entities:player",
            target: "all",
          },
        ],
        artifactLinks: { "forward-smoke.web": "artifacts/web/summary.json", "forward-smoke.desktop": "artifacts/desktop/summary.json" },
        diagnostics: [],
        durationMs: 12,
        entryId: entry.id,
        status: "pass",
      };
    },
  };

  const report = await runGameplayParityGate({ manifest, root, runner });
  const written = JSON.parse(await readFile(join(root, "tools/verify/artifacts/gameplay-parity/verification-report.json"), "utf8")) as typeof report;

  assert.equal(report.status, "pass");
  assert.equal(written.status, "pass");
  assert.equal(written.artifacts.reportPath, "tools/verify/artifacts/gameplay-parity/verification-report.json");
  assert.equal(written.artifacts.targetReports["forward-smoke.web"], "artifacts/web/summary.json");
});

test("should include duration budget fields in the gameplay parity report", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-gameplay-parity-duration-"));
  const manifest: GameplayParityManifest = {
    schemaVersion: 1,
    entries: [
      {
        assert: { assets: [{ id: "model.soldier", loaded: true, type: "gltf" }] },
        id: "soldier-glb",
        kind: "assetProbe",
        targets: ["web", "desktop"],
      },
    ],
  };
  const runner: GameplayParityRunner = {
    async run(entry) {
      return { assertionResults: [], diagnostics: [], durationMs: 25, entryId: entry.id, status: "pass" };
    },
  };

  const report = await runGameplayParityGate({ manifest, root, runner });

  assert.equal(report.duration.budgetMs, 60_000);
  assert.ok(Number.isFinite(report.duration.totalMs));
  assert.deepEqual(report.duration.perCase, [{
    durationMs: 25,
    id: "soldier-glb",
    kind: "assetProbe",
    lastTimingSampleMs: 25,
    mode: "enforced",
    profile: "smoke",
    state: "enforced",
    status: "pass",
  }]);
});

test("should support non-action probe enrollment", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-gameplay-parity-probes-"));
  const manifest: GameplayParityManifest = {
    schemaVersion: 1,
    entries: [
      {
        assert: { assets: [{ animations: ["Idle"], id: "model.soldier", loaded: true, type: "gltf" }] },
        id: "asset-probe",
        kind: "assetProbe",
        targets: ["web", "desktop"],
      },
      {
        assert: { textures: [{ id: "tex.surface.ue-grid", loaded: true, repeat: [24, 24], role: "baseColor" }] },
        id: "texture-probe",
        kind: "textureProbe",
        targets: ["web", "desktop"],
      },
      {
        assert: { materials: [{ baseColorTexture: "tex.surface.ue-grid", id: "mat.floor.ue-grid" }] },
        id: "material-probe",
        kind: "materialProbe",
        targets: ["web", "desktop"],
      },
    ],
  };

  const report = await runGameplayParityGate({
    manifest,
    root,
    runner: {
      async run(entry) {
        return {
          assertionResults: [{
            id: `${entry.id}.enrolled`,
            kind: entry.kind,
            pass: true,
            surface: `${entry.kind}:${entry.id}`,
            target: "all",
          }],
          diagnostics: [],
          durationMs: 0,
          entryId: entry.id,
          status: "pass",
        };
      },
    },
  });

  assert.equal(report.status, "pass");
  assert.deepEqual(report.duration.perCase.map((entry) => entry.kind), ["assetProbe", "textureProbe", "materialProbe"]);
  assert.equal(report.assertionResults.length, 3);
});

test("should link per-target probe observation artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-gameplay-parity-probe-links-"));
  const project = join(root, "example");
  await mkdir(join(project, "content/assets"), { recursive: true });
  await mkdir(join(project, "content/materials"), { recursive: true });
  await mkdir(join(project, "artifacts/runtime-observations"), { recursive: true });
  await writeFile(join(project, "content/assets/arena.assets.json"), JSON.stringify({
    assets: [{ animations: ["Idle"], id: "model.soldier", path: "soldier.glb", type: "gltf" }],
  }), "utf8");
  await writeFile(join(project, "content/materials/arena.materials.json"), JSON.stringify({ materials: [] }), "utf8");
  for (const target of ["web", "desktop"]) {
    await writeFile(join(project, `artifacts/runtime-observations/${target}.json`), JSON.stringify({
      observations: {
        assets: {
          "model.soldier": { animations: ["Idle"], loaded: true },
        },
      },
    }), "utf8");
  }

  const report = await runGameplayParityGate({
    manifest: {
      schemaVersion: 1,
      entries: [
        {
          assert: { assets: [{ animations: ["Idle"], id: "model.soldier", loaded: true, type: "gltf" }] },
          id: "asset-probe",
          kind: "assetProbe",
          observationSidecars: {
            desktop: "artifacts/runtime-observations/desktop.json",
            web: "artifacts/runtime-observations/web.json",
          },
          project: "example",
          targets: ["web", "desktop"],
        },
      ],
    },
    root,
    reportPath: join(root, "verification-report.json"),
  });

  assert.equal(report.status, "pass");
  assert.equal(report.artifacts.targetReports["asset-probe.web"], "artifacts/runtime-observations/web.json");
  assert.equal(report.artifacts.targetReports["asset-probe.desktop"], "artifacts/runtime-observations/desktop.json");
});

test("should prefer runtime observation sidecars over source-backed probes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-gameplay-parity-runtime-sidecars-"));
  const project = join(root, "example");
  await mkdir(join(project, "content/assets"), { recursive: true });
  await mkdir(join(project, "content/materials"), { recursive: true });
  await mkdir(join(project, "artifacts/runtime-observations"), { recursive: true });
  await writeFile(join(project, "content/assets/arena.assets.json"), JSON.stringify({
    assets: [{ id: "tex.grid.floor", path: "textures/fallback.png", repeat: [1, 1], type: "texture" }],
  }), "utf8");
  await writeFile(join(project, "content/materials/arena.materials.json"), JSON.stringify({ materials: [] }), "utf8");
  for (const target of ["web", "desktop"]) {
    await writeFile(join(project, `artifacts/runtime-observations/${target}.json`), JSON.stringify({
      observations: {
        textures: {
          "tex.grid.floor": { loaded: true, repeat: [8, 12] },
        },
      },
    }), "utf8");
  }

  const report = await runGameplayParityGate({
    manifest: {
      schemaVersion: 1,
      entries: [
        {
          assert: { textures: [{ id: "tex.grid.floor", loaded: true, repeat: [8, 12] }] },
          id: "floor-texture",
          kind: "textureProbe",
          observationSidecars: {
            desktop: "artifacts/runtime-observations/desktop.json",
            web: "artifacts/runtime-observations/web.json",
          },
          project: "example",
          targets: ["web", "desktop"],
        },
      ],
    },
    root,
  });

  assert.equal(report.status, "pass");
  assert.equal(report.assertionResults.every((assertion) => assertion.source === "runtime-observation"), true);
});

test("should discover runtime observation sidecars from paired playtest artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-gameplay-parity-discovered-sidecars-"));
  const project = join(root, "example");
  const artifactDir = join(root, "tools/verify/artifacts/gameplay-parity/playtests/forward/web");
  await mkdir(join(project, "content/assets"), { recursive: true });
  await mkdir(join(project, "content/materials"), { recursive: true });
  await mkdir(artifactDir, { recursive: true });
  await writeFile(join(project, "content/assets/arena.assets.json"), JSON.stringify({
    assets: [{ id: "tex.grid.floor", path: "textures/fallback.png", repeat: [1, 1], type: "texture" }],
  }), "utf8");
  await writeFile(join(project, "content/materials/arena.materials.json"), JSON.stringify({ materials: [] }), "utf8");
  await writeFile(join(artifactDir, "runtime-observations.json"), JSON.stringify({
    observations: {
      textures: {
        "tex.grid.floor": { loaded: true, repeat: [8, 12] },
      },
    },
  }), "utf8");

  const report = await runGameplayParityGate({
    manifest: {
      schemaVersion: 1,
      entries: [
        {
          assert: { textures: [{ id: "tex.grid.floor", loaded: true, repeat: [8, 12] }] },
          id: "floor-texture",
          kind: "textureProbe",
          project: "example",
          targets: ["web"],
        },
      ],
    },
    root,
  });

  assert.equal(report.status, "pass");
  assert.equal(report.assertionResults.every((assertion) => assertion.source === "runtime-observation"), true);
  assert.equal(report.artifacts.targetReports["floor-texture.web"]?.endsWith("runtime-observations.json"), true);
});

test("should include humanoid forward movement in enforced smoke set", () => {
  const manifest = defaultGameplayParityManifest();
  const forward = manifest.entries.find((entry) => entry.id === "humanoid-forward-movement-smoke");

  assert.equal(forward?.kind, "playtestScenario");
  assert.equal(forward?.mode, "enforced");
  assert.equal(forward?.profile, "smoke");
});

test("should preserve report-only scenarios without failing the gate", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-gameplay-parity-report-only-"));
  const report = await runGameplayParityGate({
    manifest: {
      schemaVersion: 1,
      entries: [
        {
          id: "report-only-failure",
          kind: "playtestScenario",
          mode: "report-only",
          profile: "full",
          project: "examples/humanoid-physics-course",
          reason: "Native contact tolerance still needs desktop timing samples.",
          scenario: "playtests/humanoid-course-stairs.playtest.json",
          targets: ["web", "desktop"],
        },
      ],
    },
    profile: "full",
    root,
    runner: {
      async run(entry) {
        return {
          assertionResults: [{
            diagnostic: { code: "TN_GAMEPLAY_PARITY_TARGET_FAILED", message: "failed", severity: "error" },
            id: `${entry.id}.paired-targets`,
            kind: "playtestScenario",
            pass: false,
            surface: `playtestScenario:${entry.id}`,
            target: "all",
          }],
          diagnostics: [{ code: "TN_GAMEPLAY_PARITY_TARGET_FAILED", message: "failed", severity: "error" }],
          durationMs: 1,
          entryId: entry.id,
          status: "fail",
        };
      },
    },
  });

  assert.equal(report.status, "pass");
  assert.equal(report.diagnostics[0]?.severity, "warning");
  assert.equal(report.assertionResults[0]?.diagnostic?.severity, "warning");
  assert.deepEqual(report.duration.perCase, [{
    durationMs: 1,
    id: "report-only-failure",
    kind: "playtestScenario",
    lastTimingSampleMs: 1,
    mode: "report-only",
    profile: "full",
    state: "report-only",
    status: "warning",
  }]);
});

test("should downgrade report-only assertion failures without diagnostics", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-gameplay-parity-report-only-bare-"));
  const report = await runGameplayParityGate({
    manifest: {
      schemaVersion: 1,
      entries: [
        {
          id: "bare-report-only-failure",
          kind: "playtestScenario",
          mode: "report-only",
          profile: "full",
          project: "examples/humanoid-physics-course",
          reason: "Native ramp tolerance still needs desktop timing samples.",
          scenario: "playtests/humanoid-course-ramp-traverse.playtest.json",
          targets: ["web", "desktop"],
        },
      ],
    },
    profile: "full",
    root,
    runner: {
      async run(entry) {
        return {
          assertionResults: [{
            id: `${entry.id}.paired-targets`,
            kind: "playtestScenario",
            pass: false,
            surface: `playtestScenario:${entry.id}`,
            target: "all",
          }],
          diagnostics: [],
          durationMs: 1,
          entryId: entry.id,
          status: "fail",
        };
      },
    },
  });

  assert.equal(report.status, "pass");
  assert.equal(report.assertionResults[0]?.diagnostic?.code, "TN_GAMEPLAY_PARITY_NON_PASSING_STATE_FAILED");
  assert.equal(report.duration.perCase[0]?.status, "warning");
});

test("should require reasons for non-passing parity states", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-gameplay-parity-state-reason-"));
  const report = await runGameplayParityGate({
    manifest: {
      schemaVersion: 1,
      entries: [
        {
          id: "report-only-without-reason",
          kind: "playtestScenario",
          project: "examples/humanoid-physics-course",
          scenario: "playtests/humanoid-course-stairs.playtest.json",
          state: "report-only",
          targets: ["web", "desktop"],
        },
        {
          id: "calibrating-without-criteria",
          kind: "playtestScenario",
          project: "examples/humanoid-physics-course",
          scenario: "playtests/humanoid-course-ramp-traverse.playtest.json",
          state: "calibrating",
          targets: ["web", "desktop"],
        },
      ],
    },
    profile: "full",
    root,
    runner: {
      async run(entry) {
        return { assertionResults: [], diagnostics: [], durationMs: 1, entryId: entry.id, status: "pass" };
      },
    },
  });

  assert.equal(report.status, "fail");
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAMEPLAY_PARITY_STATE_REASON_MISSING"), true);
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAMEPLAY_PARITY_PROMOTION_CRITERIA_MISSING"), true);
});

test("should exclude calibrating cases from pass claims", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-gameplay-parity-calibrating-"));
  const report = await runGameplayParityGate({
    manifest: {
      schemaVersion: 1,
      entries: [
        {
          id: "calibrating-failure",
          kind: "playtestScenario",
          profile: "full",
          project: "examples/humanoid-physics-course",
          promotionCriteria: "Promote after three paired desktop/web samples pass within contact tolerance.",
          scenario: "playtests/humanoid-course-ball-push.playtest.json",
          state: "calibrating",
          targets: ["web", "desktop"],
        },
      ],
    },
    profile: "full",
    root,
    runner: {
      async run(entry) {
        return {
          assertionResults: [{
            diagnostic: { code: "TN_GAMEPLAY_PARITY_TARGET_FAILED", message: "failed", severity: "error" },
            id: `${entry.id}.paired-targets`,
            kind: "playtestScenario",
            pass: false,
            surface: `playtestScenario:${entry.id}`,
            target: "all",
          }],
          diagnostics: [{ code: "TN_GAMEPLAY_PARITY_TARGET_FAILED", message: "failed", severity: "error" }],
          durationMs: 2,
          entryId: entry.id,
          status: "fail",
        };
      },
    },
  });

  assert.equal(report.status, "pass");
  assert.equal(report.manifest.stateCounts.calibrating, 1);
  assert.equal(report.assertionResults[0]?.diagnostic?.severity, "warning");
  assert.equal(report.duration.perCase[0]?.state, "calibrating");
});

test("should flag smoke entries that exceed the timing budget", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-gameplay-parity-smoke-budget-"));
  const report = await runGameplayParityGate({
    manifest: {
      schemaVersion: 1,
      entries: [
        {
          id: "slow-smoke",
          kind: "playtestScenario",
          profile: "smoke",
          project: "examples/humanoid-physics-course",
          scenario: "playtests/humanoid-course-forward-movement.playtest.json",
          state: "enforced",
          targets: ["web", "desktop"],
        },
      ],
    },
    root,
    runner: {
      async run(entry) {
        return { assertionResults: [], diagnostics: [], durationMs: 60_001, entryId: entry.id, status: "pass" };
      },
    },
  });

  assert.equal(report.status, "fail");
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAMEPLAY_PARITY_SMOKE_BUDGET_EXCEEDED"), true);
});

test("should include timing samples in the aggregate report", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-gameplay-parity-timing-samples-"));
  const report = await runGameplayParityGate({
    manifest: {
      schemaVersion: 1,
      entries: [
        {
          id: "timed-smoke",
          kind: "playtestScenario",
          profile: "smoke",
          project: "examples/humanoid-physics-course",
          scenario: "playtests/humanoid-course-forward-movement.playtest.json",
          targets: ["web", "desktop"],
        },
      ],
    },
    root,
    runner: {
      async run(entry) {
        return { assertionResults: [], diagnostics: [], durationMs: 42, entryId: entry.id, status: "pass" };
      },
    },
  });

  assert.equal(report.duration.perCase[0]?.durationMs, 42);
  assert.equal(report.duration.perCase[0]?.lastTimingSampleMs, 42);
  assert.equal(report.duration.perCase[0]?.profile, "smoke");
});

test("should keep slow scenarios out of smoke profile", () => {
  const manifest = defaultGameplayParityManifest();
  const smokeEntries = manifest.entries.filter((entry) => entry.profile === "smoke" || entry.profile === undefined);
  assert.equal(smokeEntries.some((entry) => entry.id.includes("stairs")), false);
  assert.equal(smokeEntries.some((entry) => entry.id.includes("hazard-hit")), false);
});

test("should include promoted humanoid scenarios in the full profile", () => {
  const manifest = defaultGameplayParityManifest();
  const fullEntries = manifest.entries.filter((entry) => entry.profile === "full");
  const push = fullEntries.find((entry) => entry.id === "humanoid-course-ball-push-enforced");

  assert.equal(push?.state, "enforced");
  assert.equal(push?.timingSamplesMs?.[0], 1448);
});

test("should keep unpromoted humanoid scenarios non-passing", () => {
  const manifest = defaultGameplayParityManifest();
  const ramp = manifest.entries.find((entry) => entry.id === "humanoid-course-ramp-traverse-quarantined");
  const stairs = manifest.entries.find((entry) => entry.id === "humanoid-course-stairs-calibrating");
  const hazard = manifest.entries.find((entry) => entry.id === "humanoid-course-hazard-hit-quarantined");

  assert.equal(ramp?.state, "quarantined");
  assert.equal(ramp?.mode, "report-only");
  assert.match(ramp?.reason ?? "", /desktop paired target/);
  assert.equal(ramp?.artifactLinks?.latestSummary, "examples/humanoid-physics-course/artifacts/playtest/humanoid-course-ramp-traverse/latest/summary.json");
  assert.equal(stairs?.state, "calibrating");
  assert.equal(stairs?.mode, "report-only");
  assert.equal(typeof stairs?.promotionCriteria, "string");
  assert.equal(hazard?.state, "quarantined");
  assert.equal(hazard?.mode, "report-only");
  assert.equal(typeof hazard?.reason, "string");
});

test("should enroll humanoid test-instrument features only in the full profile by default", () => {
  const manifest = defaultGameplayParityManifest();
  const featureEntries = manifest.entries.filter((entry) => entry.featureSurfaces !== undefined);

  assert.equal(featureEntries.length, 1);
  assert.equal(featureEntries.every((entry) => entry.profile === "full"), true);
  assert.equal(featureEntries.every((entry) => entry.state !== "enforced"), true);
});

test("should require a risk rationale before promoting a humanoid feature", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-gameplay-parity-feature-rationale-"));
  const report = await runGameplayParityGate({
    manifest: {
      schemaVersion: 1,
      entries: [
        {
          artifactLinks: { summary: "artifacts/summary.json" },
          featureSurfaces: { triggers: ["checkpoint.trigger"] },
          id: "feature-without-rationale",
          kind: "playtestScenario",
          profile: "full",
          promotionCriteria: "Promote after paired trigger sidecars match.",
          project: "examples/humanoid-physics-course",
          scenario: "playtests/humanoid-course-hazard-hit.playtest.json",
          state: "enforced",
          targets: ["web", "desktop"],
          toleranceRationale: "Trigger counts must match exactly.",
        },
      ],
    },
    profile: "full",
    root,
    runner: {
      async run(entry) {
        return { assertionResults: [], diagnostics: [], durationMs: 1, entryId: entry.id, status: "pass" };
      },
    },
  });

  assert.equal(report.status, "fail");
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAMEPLAY_PARITY_FEATURE_RATIONALE_MISSING"), true);
});

test("should include cheap asset probe in smoke profile", () => {
  const manifest = defaultGameplayParityManifest();
  const probe = manifest.entries.find((entry) => entry.id === "humanoid-soldier-glb-loading");

  assert.equal(probe?.kind, "assetProbe");
  assert.equal(probe?.profile, "smoke");
});

test("should require high-value humanoid surfaces to be asserted", () => {
  const manifest = defaultGameplayParityManifest();
  const coverage = manifest.entries.find((entry) => entry.id === "humanoid-course-scene-coverage");

  assert.equal(coverage?.kind, "sceneCoverage");
  if (coverage?.kind !== "sceneCoverage") {
    return;
  }
  assert.deepEqual(coverage.requiredSurfaces.assets, ["model.soldier"]);
  assert.deepEqual(coverage.requiredSurfaces.resources, ["GameState"]);
  assert.equal(coverage.assertions.some((assertion) => assertion.surface === "ui:hud.status"), true);
});

test("should invoke the paired playtest command for playtest scenario entries", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-gameplay-parity-paired-command-"));
  const calls: Array<{ args: readonly string[]; command: string; cwd: string }> = [];
  const manifest: GameplayParityManifest = {
    schemaVersion: 1,
    entries: [
      {
        id: "forward-smoke",
        kind: "playtestScenario",
        project: "examples/humanoid-physics-course",
        scenario: "playtests/humanoid-course-forward-movement.playtest.json",
        targets: ["web", "desktop"],
      },
    ],
  };

  const report = await runGameplayParityGate({
    commandRunner: async (command) => {
      calls.push({ args: command.args, command: command.command, cwd: command.cwd });
      return {
        durationMs: 33,
        exitCode: 0,
        stderr: "",
        stdout: `${JSON.stringify({
          artifacts: { targets: { desktop: "desktop/summary.json", web: "web/summary.json" } },
          diagnostics: [],
          pass: true,
        })}\n`,
      };
    },
    manifest,
    root,
  });

  assert.equal(report.status, "pass");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.command, process.execPath);
  assert.deepEqual(calls[0]?.args.slice(1, 6), ["parity", "playtest", "--project", join(root, "examples/humanoid-physics-course"), "--scenario"]);
  assert.equal(calls[0]?.args.includes("--stable-artifacts"), true);
  assert.deepEqual(report.artifacts.targetReports, {
    "forward-smoke.desktop": "desktop/summary.json",
    "forward-smoke.web": "web/summary.json",
  });
});

test("should fail when a required scene surface has no assertion", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-gameplay-parity-coverage-gap-"));
  const manifest: GameplayParityManifest = {
    schemaVersion: 1,
    entries: [
      {
        assertions: [{ kind: "entityVisible", surface: { id: "player", type: "entities" } }],
        id: "humanoid-coverage",
        kind: "sceneCoverage",
        requiredSurfaces: {
          entities: ["player"],
          textures: ["tex.surface.ue-grid"],
        },
        scene: "arena",
        targets: ["web", "desktop"],
      },
    ],
  };

  const report = await runGameplayParityGate({ manifest, root });

  assert.equal(report.status, "fail");
  assert.equal(report.coverage["humanoid-coverage"]?.coverageStatus, "fail");
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_RUNTIME_PARITY_COVERAGE_GAP"), true);
});
