import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createProject } from "./create.js";

test("should create v1 template files", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-"));
  try {
    const result = await createProject(["my-game", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; path: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_CREATE_OK");

    const files = await readdir(payload.path);
    assert.equal(files.includes(".gitignore"), true);
    assert.equal(files.includes("README.md"), true);
    assert.equal(files.includes("package.json"), true);
    assert.equal(files.includes("src"), true);
    assert.equal(files.includes("threenative.config.json"), true);

    const source = await readFile(join(payload.path, "src", "game.ts"), "utf8");
    assert.match(source, /new Scene/);
    assert.match(source, /DirectionalLight/);

    const packageJson = JSON.parse(await readFile(join(payload.path, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    assert.equal(packageJson.scripts.validate, "tn validate");
    assert.equal(packageJson.scripts.build, "tn build");
    assert.equal(packageJson.scripts["dev:web"], "tn dev --target web");
    assert.equal(packageJson.scripts["dev:desktop"], "tn dev --target desktop");
    assert.equal(packageJson.scripts.verify, "tn verify");
    assert.match(packageJson.dependencies["@threenative/sdk"] ?? "", /^file:/);
    assert.match(packageJson.devDependencies["@threenative/cli"] ?? "", /^file:/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject non-empty destination", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-"));
  try {
    const destination = join(root, "existing");
    await mkdir(destination);
    await writeFile(join(destination, "keep.txt"), "do not overwrite");

    const result = await createProject(["existing", "--json"], { cwd: root });
    const payload = JSON.parse(result.stderr ?? "{}") as { code: string };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_CREATE_DESTINATION_NOT_EMPTY");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
