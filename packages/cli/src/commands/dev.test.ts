import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import type { BevyRuntimeProcess } from "../native/bevy.js";

import { devCommand } from "./dev.js";

test("should start web dev server for valid bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-dev-"));
  try {
    await cp("../../templates/v1", root, { recursive: true });
    const result = await devCommand(["--target", "web", "--json"], root);
    try {
      const payload = JSON.parse(result.stdout) as { code: string; url: string };
      assert.equal(result.exitCode, 0);
      assert.equal(payload.code, "TN_DEV_WEB_READY");
      assert.match(payload.url, /^http:\/\/127\.0\.0\.1:/);
      const response = await fetch(payload.url);
      assert.equal(response.ok, true);
    } finally {
      await result.server?.close();
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should invoke bevy runtime for desktop target", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-dev-desktop-"));
  const invocations: string[] = [];
  try {
    await cp("../../templates/v1", root, { recursive: true });
    const result = await devCommand(["--target", "desktop", "--json"], root, {
      bevyRunner: ({ bundlePath }) => {
        invocations.push(bundlePath);
        return {} as BevyRuntimeProcess;
      },
    });

    const payload = JSON.parse(result.stdout) as { bundlePath: string; code: string };
    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_DEV_DESKTOP_READY");
    assert.equal(payload.bundlePath, resolve(root, "dist/game.bundle"));
    assert.deepEqual(invocations, [resolve(root, "dist/game.bundle")]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should rebuild when v2 source changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-dev-watch-v2-"));
  try {
    await cp("../../templates/v2-arena", root, { recursive: true });
    const result = await devCommand(["--target", "desktop", "--watch", "--json"], root);
    try {
      const payload = JSON.parse(result.stdout) as { code: string; initialReport: { status: string } };
      assert.equal(result.exitCode, 0);
      assert.equal(payload.code, "TN_DEV_WATCH_READY");
      assert.equal(payload.initialReport.status, "pass");

      const sourcePath = join(root, "src", "game.tsx");
      const source = await readFile(sourcePath, "utf8");
      await writeFile(sourcePath, `${source}\n`);
      const report = await result.watcher?.rebuild();

      assert.equal(report?.status, "pass");
      assert.equal(report?.code, "TN_DEV_WATCH_REBUILD_OK");
      assert.match(report?.bundlePath ?? "", /dist\/game\.bundle$/);
    } finally {
      result.watcher?.close();
      await result.server?.close();
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should surface validation diagnostics during watch", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-dev-watch-diagnostic-"));
  try {
    await cp("../../templates/v2-arena", root, { recursive: true });
    const sourcePath = join(root, "src", "game.tsx");
    const source = await readFile(sourcePath, "utf8");
    await writeFile(sourcePath, `${source}\nconsole.log(window.location.href);\n`);

    const result = await devCommand(["--target", "desktop", "--watch", "--json"], root);
    try {
      const payload = JSON.parse(result.stdout) as {
        initialReport: { diagnostics: Array<{ code: string; file: string; severity: string; suggestedFix?: string }>; status: string };
      };
      const diagnostic = payload.initialReport.diagnostics[0];

      assert.equal(result.exitCode, 0);
      assert.equal(payload.initialReport.status, "fail");
      assert.equal(diagnostic?.code, "TN_COMPILER_R3F_BROWSER_API");
      assert.equal(diagnostic?.severity, "error");
      assert.equal(diagnostic?.file, sourcePath);
      assert.match(diagnostic?.suggestedFix ?? "", /portable SDK data|runtime adapter/);
    } finally {
      result.watcher?.close();
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
