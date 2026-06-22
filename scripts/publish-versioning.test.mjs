import { strict as assert } from "node:assert";
import { test } from "node:test";

import { nextPatchVersion, resolvePublishVersions } from "./publish-versioning.mjs";

const packages = [
  { name: "@threenative/sdk", version: "0.1.9" },
  { name: "@threenative/cli", version: "0.1.9" },
];

test("should keep unpublished aligned package versions", async () => {
  const result = await resolvePublishVersions(packages, async () => false);

  assert.equal(result.bumped, false);
  assert.equal(result.targetVersion, "0.1.9");
  assert.deepEqual([...result.versions.entries()], [
    ["@threenative/sdk", "0.1.9"],
    ["@threenative/cli", "0.1.9"],
  ]);
});

test("should bump all packages to the next unpublished patch when current version exists", async () => {
  const published = new Set(["@threenative/sdk@0.1.9", "@threenative/cli@0.1.10"]);
  const result = await resolvePublishVersions(packages, async (name, version) => published.has(`${name}@${version}`));

  assert.equal(result.bumped, true);
  assert.equal(result.targetVersion, "0.1.11");
  assert.deepEqual([...result.versions.entries()], [
    ["@threenative/sdk", "0.1.11"],
    ["@threenative/cli", "0.1.11"],
  ]);
});

test("should bump unaligned package versions to one common next patch", async () => {
  const result = await resolvePublishVersions([
    { name: "@threenative/sdk", version: "0.1.8" },
    { name: "@threenative/cli", version: "0.1.9" },
  ], async () => false);

  assert.equal(result.bumped, true);
  assert.equal(result.targetVersion, "0.1.10");
});

test("should reject non-semver package versions", () => {
  assert.throws(() => nextPatchVersion("0.1"), /Expected semver version/);
});
