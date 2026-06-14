import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { bevyRuntimeArgs } from "./bevy.js";

test("should select threenative runtime binary", () => {
  const repoRoot = "/repo";
  const bundlePath = "/project/dist/game.bundle";

  assert.deepEqual(bevyRuntimeArgs(repoRoot, { bundlePath }), [
    "run",
    "--manifest-path",
    resolve(repoRoot, "runtime-bevy/Cargo.toml"),
    "-p",
    "threenative_runtime",
    "--bin",
    "threenative_runtime",
    "--",
    bundlePath,
  ]);
});
