import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validateBundle } from "../packages/ir/dist/validate.js";
import { createWebPersistenceService, loadBundle } from "../packages/runtime-web-three/dist/index.js";
import { resolveArtifactTargets } from "./artifact-paths.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = resolve(root, "packages/ir/fixtures/conformance/persistence-reload/game.bundle");
const targets = resolveArtifactTargets({ gate: "persistence-reload", owner: { kind: "aggregate", name: "persistence-reload" }, root });
const artifactRoot = targets.absoluteDir;
const storageRoot = resolve(artifactRoot, "native-profile");
const nativeSlotPath = resolve(storageRoot, "persistence-reload", "web+desktop", "slot.main.json");
const nativeSettingsPath = resolve(storageRoot, "persistence-reload", "web+desktop", "settings.json");

export function assessColdRestart(writer, reader) {
  const mismatches = [];
  if (writer.process !== "write") mismatches.push({ key: "writer.process", expected: "write", actual: writer.process });
  if (reader.process !== "read") mismatches.push({ key: "reader.process", expected: "read", actual: reader.process });
  if (reader.persistence?.restore?.resourceValue !== 7) mismatches.push({ key: "progress", expected: 7, actual: reader.persistence?.restore?.resourceValue });
  if (reader.persistence?.restore?.settingValue !== 0.75) mismatches.push({ key: "settings", expected: 0.75, actual: reader.persistence?.restore?.settingValue });
  if (reader.persistence?.storage?.backend !== "native-atomic-json") mismatches.push({ key: "backend", expected: "native-atomic-json", actual: reader.persistence?.storage?.backend });
  if (reader.persistence?.storage?.atomicCommit !== true) mismatches.push({ key: "atomicCommit", expected: true, actual: reader.persistence?.storage?.atomicCommit });
  return { mismatches, ok: mismatches.length === 0 };
}

export function compareReports(web, native) {
  const mismatches = [];
  if (web.persistence?.restore?.resourceValue !== native.persistence?.restore?.resourceValue) {
    mismatches.push({ key: "progress", native: native.persistence?.restore?.resourceValue, web: web.persistence?.restore?.resourceValue });
  }
  if (web.persistence?.restore?.settingValue !== native.persistence?.restore?.settingValue) {
    mismatches.push({ key: "settings", native: native.persistence?.restore?.settingValue, web: web.persistence?.restore?.settingValue });
  }
  for (const key of ["schema", "version", "schemaVersion", "appVersion", "slot"]) {
    if (web.persistence?.savedRecord?.[key] !== native.persistence?.savedRecord?.[key]) {
      mismatches.push({ key: `savedRecord.${key}`, native: native.persistence?.savedRecord?.[key], web: web.persistence?.savedRecord?.[key] });
    }
  }
  for (const key of ["components", "resources", "settings"]) {
    if (JSON.stringify(web.persistence?.savedRecord?.[key]) !== JSON.stringify(native.persistence?.savedRecord?.[key])) {
      mismatches.push({ key: `savedRecord.${key}`, native: native.persistence?.savedRecord?.[key], web: web.persistence?.savedRecord?.[key] });
    }
  }
  return { mismatches, ok: mismatches.length === 0 };
}

async function main() {
  await mkdir(artifactRoot, { recursive: true });
  await rm(storageRoot, { force: true, recursive: true });
  const validation = await validateBundle(fixture);
  if (!validation.ok) return fail("fixture validation failed", { diagnostics: validation.diagnostics });

  const bundle = await loadBundle(fixture);
  const web = runWebColdRecreation(bundle.localData, bundle.world);
  await writeJson(resolve(artifactRoot, "web-report.json"), web);

  const write = runNative("write", resolve(artifactRoot, "native-write-report.json"));
  if (write.status !== 0) return fail("first native persistence process failed", { commands: [commandResult("write", write)] });
  const read = runNative("read", resolve(artifactRoot, "native-report.json"));
  if (read.status !== 0) return fail("second native persistence process could not restore progress/settings", { commands: [commandResult("write", write), commandResult("read", read)] });

  const writer = JSON.parse(await readFile(resolve(artifactRoot, "native-write-report.json"), "utf8"));
  const reader = JSON.parse(await readFile(resolve(artifactRoot, "native-report.json"), "utf8"));
  const coldRestart = assessColdRestart(writer, reader);
  const parity = compareReports(web, reader);
  const negativeControls = await runNegativeControls();
  const interrupted = spawnSync("cargo", ["test", "-p", "threenative_runtime", "--test", "persistence_storage", "should_preserve_the_old_record_when_migration_commit_is_interrupted", "--", "--exact"], {
    cwd: resolve(root, "runtime-bevy"), encoding: "utf8", timeout: 120_000,
  });
  negativeControls.push({ control: "interrupted-migration-commit", ok: interrupted.status === 0, stderr: interrupted.stderr.trim() });
  const autosave = spawnSync("cargo", ["test", "-p", "threenative_runtime", "--test", "persistence_storage", "should_durably_autosave_checkpoint_debounce_and_interval_then_cold_restore", "--", "--exact"], {
    cwd: resolve(root, "runtime-bevy"), encoding: "utf8", timeout: 120_000,
  });
  const diff = { coldRestart, parity, negativeControls, ok: coldRestart.ok && parity.ok && autosave.status === 0 && negativeControls.every((control) => control.ok) };
  await writeJson(resolve(artifactRoot, "diff.json"), diff);
  await writeReport({
    artifacts: {
      diff: "tools/verify/artifacts/persistence-reload/diff.json",
      native: "tools/verify/artifacts/persistence-reload/native-report.json",
      nativeWrite: "tools/verify/artifacts/persistence-reload/native-write-report.json",
      profileRoot: "tools/verify/artifacts/persistence-reload/native-profile",
      report: "tools/verify/artifacts/persistence-reload/verification-report.json",
      web: "tools/verify/artifacts/persistence-reload/web-report.json",
    },
    commands: [commandResult("write", write), commandResult("read", read), { command: "cargo test ... should_preserve_the_old_record_when_migration_commit_is_interrupted -- --exact", status: interrupted.status === 0 ? "pass" : "fail" }, { command: "cargo test ... should_durably_autosave_checkpoint_debounce_and_interval_then_cold_restore -- --exact", status: autosave.status === 0 ? "pass" : "fail" }],
    deferred: ["cloud save", "account-bound storage", "arbitrary portable filesystem APIs", "manual packaged desktop relaunch"],
    negativeControls,
    ok: diff.ok,
    promoted: ["web/native exact-envelope semantic parity", "two-process native progress restore", "two-process native settings restore", "bounded atomic target-profile storage", "durable checkpoint/debounce/interval autosave", "save/settings corruption, forward, undeclared, and interrupted-migration fail-closed controls"],
    status: diff.ok ? "passed" : "failed",
  });
  if (!diff.ok) process.exitCode = 1;
}

async function runNegativeControls() {
  const original = await readFile(nativeSlotPath);
  const cases = [
    { control: "corrupt-record", bytes: Buffer.from("{not-json"), expected: /CORRUPT/ },
    { control: "forward-version", mutate: (record) => { record.schemaVersion = 999; }, expected: /FORWARD_INCOMPATIBLE/ },
    { control: "undeclared-field", mutate: (record) => { record.resources.Undeclared = { value: 1 }; }, expected: /not declared/ },
  ];
  const results = [];
  for (const testCase of cases) {
    let bytes = testCase.bytes;
    if (bytes === undefined) {
      const record = JSON.parse(original.toString("utf8"));
      testCase.mutate(record);
      bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
    }
    await writeFile(nativeSlotPath, bytes);
    const run = runNative("read", resolve(artifactRoot, `negative-${testCase.control}.json`));
    const preserved = Buffer.compare(await readFile(nativeSlotPath), bytes) === 0;
    results.push({ control: testCase.control, ok: run.status !== 0 && testCase.expected.test(run.stderr) && preserved, preserved, stderr: run.stderr.trim() });
  }
  await writeFile(nativeSlotPath, original);
  const originalSettings = await readFile(nativeSettingsPath);
  const settingsCases = [
    { control: "corrupt-settings", bytes: Buffer.from("{not-json"), expected: /CORRUPT/ },
    { control: "forward-settings", bytes: Buffer.from(JSON.stringify({ schema: "threenative.persistence-settings", settings: {}, version: "0.2.0" })), expected: /unsupported settings envelope/ },
    { control: "undeclared-settings", bytes: Buffer.from(JSON.stringify({ schema: "threenative.persistence-settings", settings: { "secret.handle": 7 }, version: "0.1.0" })), expected: /not declared/ },
  ];
  for (const testCase of settingsCases) {
    await writeFile(nativeSettingsPath, testCase.bytes);
    const run = runNative("read", resolve(artifactRoot, `negative-${testCase.control}.json`));
    const preserved = Buffer.compare(await readFile(nativeSettingsPath), testCase.bytes) === 0;
    results.push({ control: testCase.control, ok: run.status !== 0 && testCase.expected.test(run.stderr) && preserved, preserved, stderr: run.stderr.trim() });
  }
  await writeFile(nativeSettingsPath, originalSettings);
  return results;
}

function runWebColdRecreation(localData, initialWorld) {
  const records = new Map();
  const storage = {
    getItem: (key) => records.get(key) ?? null,
    removeItem: (key) => { records.delete(key); },
    setItem: (key, value) => { records.set(key, value); },
  };
  const world = structuredClone(initialWorld);
  world.resources.Progress.level = 7;
  const writer = createWebPersistenceService(localData, { storage, storageKey: "persistence-reload" });
  if (!writer.setSetting("audio.master", 0.25)) throw new Error("web writer could not commit initial audio.master");
  if (!writer.setSetting("accessibility.contrast", "highContrast")) throw new Error("web writer could not commit accessibility.contrast");
  const saved = writer.save("slot.main", world);
  if (!saved.accepted) throw new Error(`web writer failed: ${saved.status}`);
  if (!writer.setSetting("audio.master", 0.75)) throw new Error("web writer could not commit newer audio.master");
  const reader = createWebPersistenceService(localData, { storage, storageKey: "persistence-reload" });
  const loaded = reader.load("slot.main", initialWorld);
  if (!loaded.accepted) throw new Error(`web cold recreation failed: ${loaded.status}`);
  return {
    diagnostics: reader.diagnostics,
    persistence: {
      restore: { resourceValue: loaded.world.resources.Progress.level, settingValue: reader.getSetting("audio.master"), slot: "slot.main", status: "loaded" },
      savedRecord: loaded.record,
      settings: reader.exportSettings(),
      storage: { backend: "injected-map", namespace: "persistence-reload", pathPolicy: "adapter-key-only", slot: "slot.main" },
    },
    process: "recreated-service",
    schema: "threenative.persistence-reload-web",
    version: "0.1.0",
  };
}

function runNative(mode, output) {
  return spawnSync("cargo", ["run", "-p", "threenative_runtime", "--bin", "threenative_persistence_reload_trace", "--", mode, fixture, storageRoot, output], {
    cwd: resolve(root, "runtime-bevy"), encoding: "utf8", timeout: 120_000,
  });
}

function commandResult(mode, result) {
  return { command: `cargo run -p threenative_runtime --bin threenative_persistence_reload_trace -- ${mode} <fixture> <profile> <report>`, status: result.status === 0 ? "pass" : "fail", stderr: result.stderr.trim(), stdout: result.stdout.trim() };
}

async function fail(reason, extra = {}) {
  await writeReport({ ...extra, ok: false, reason, status: "failed" });
  process.exitCode = 1;
}

async function writeReport(report) {
  await writeJson(targets.reportPath, {
    generatedBy: "scripts/verify-persistence-reload.mjs",
    prd: "docs/PRDs/done/other/systems-code-quality-remediation-2026-07-14/PRD-002-durable-persistence-settings-local-data.md",
    schema: "threenative.persistence-reload-verification",
    ...report,
  });
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
