import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { REQUIRED_BOUNDARY_FIXTURES, verifyBoundaryDiagnosticsCatalog } from "./boundaryDiagnostics.js";

test("should require negative fixtures for external boundary diagnostics", async () => {
  const result = await verifyBoundaryDiagnosticsCatalog();

  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.length, 0);
  assert.ok(result.fixtureCount >= Object.keys(REQUIRED_BOUNDARY_FIXTURES).length);
});

test("should fail when a required boundary fixture is missing", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "tn-boundary-fixtures-"));
  await mkdir(resolve(root, "packages/ir/fixtures/rejected/v10-boundaries"), { recursive: true });
  await mkdir(resolve(root, "docs/PRDs/proof-first-engine-loop-2026-07-05"), { recursive: true });
  await writeFile(
    resolve(root, "docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-003-external-services-media-boundaries.md"),
    "# PRD\n",
    "utf8",
  );
  await writeFile(
    resolve(root, "packages/ir/fixtures/rejected/v10-boundaries/catalog.json"),
    `${JSON.stringify({
      fixtures: [
        {
          expectedDiagnostic: "TN_IR_CLOUD_STORAGE_UNSUPPORTED",
          id: "cloud-account-storage",
          ownerPrd: "docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-003-external-services-media-boundaries.md",
          requiredCapabilities: { persistence: ["cloud-save.account-bound"] },
        },
      ],
      schema: "threenative.rejected-fixtures.v10-boundaries",
      version: "0.1.0",
    }, null, 2)}\n`,
    "utf8",
  );

  const result = await verifyBoundaryDiagnosticsCatalog(root);

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BOUNDARY_FIXTURE_MISSING"), true);
});
