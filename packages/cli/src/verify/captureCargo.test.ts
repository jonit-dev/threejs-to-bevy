import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { resolveCaptureBinaryPath } from "./captureCargo.js";

test("resolveCaptureBinaryPath should prefer freshly built debug capture binary", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-capture-binary-"));
  try {
    const release = join(root, "runtime-bevy/target/release/threenative_capture");
    const debug = join(root, "runtime-bevy/target/debug/threenative_capture");
    await mkdir(join(root, "runtime-bevy/target/release"), { recursive: true });
    await mkdir(join(root, "runtime-bevy/target/debug"), { recursive: true });
    await writeFile(release, "");
    await writeFile(debug, "");

    assert.equal(resolveCaptureBinaryPath(root), debug);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
