import assert from "node:assert/strict";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

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
