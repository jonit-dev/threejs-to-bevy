import assert from "node:assert/strict";
import { cp, mkdtemp, rm } from "node:fs/promises";
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
