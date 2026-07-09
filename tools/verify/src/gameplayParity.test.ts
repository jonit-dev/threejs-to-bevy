import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
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
  assert.deepEqual(report.duration.perCase, [{ durationMs: 25, id: "soldier-glb", kind: "assetProbe", mode: "enforced", status: "pass" }]);
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
  const report = await runGameplayParityGate({
    manifest: {
      schemaVersion: 1,
      entries: [
        {
          assert: { assets: [{ animations: ["Idle"], id: "model.soldier", loaded: true, type: "gltf" }] },
          id: "asset-probe",
          kind: "assetProbe",
          project: "examples/humanoid-physics-course",
          targets: ["web", "desktop"],
        },
      ],
    },
    root: process.cwd(),
    reportPath: join(root, "verification-report.json"),
  });

  assert.equal(report.status, "pass");
  assert.match(report.artifacts.targetReports["asset-probe.web"] ?? "", /probes\/asset-probe\/web\.json$/);
  assert.match(report.artifacts.targetReports["asset-probe.desktop"] ?? "", /probes\/asset-probe\/desktop\.json$/);
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
  assert.deepEqual(report.duration.perCase, [{ durationMs: 1, id: "report-only-failure", kind: "playtestScenario", mode: "report-only", status: "warning" }]);
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
  assert.equal(report.assertionResults[0]?.diagnostic?.code, "TN_GAMEPLAY_PARITY_REPORT_ONLY_FAILED");
  assert.equal(report.duration.perCase[0]?.status, "warning");
});

test("should keep slow scenarios out of smoke profile", () => {
  const manifest = defaultGameplayParityManifest();
  const smokeEntries = manifest.entries.filter((entry) => entry.profile === "smoke" || entry.profile === undefined);
  assert.equal(smokeEntries.some((entry) => entry.id.includes("stairs")), false);
  assert.equal(smokeEntries.some((entry) => entry.id.includes("hazard-hit")), false);
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
  assert.deepEqual(report.artifacts.targetReports, { desktop: "desktop/summary.json", web: "web/summary.json" });
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
