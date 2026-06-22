import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import {
  packageOrder,
  requiredAiDocFiles,
  requiredIrMetadataFiles,
  validateInstalledDistributionArtifacts,
  writeConsumerTypecheckFixture,
} from "./verify-distribution-release.mjs";

test("should fail when a packed package omits AI docs or metadata", async () => {
  const projectDir = await createInstalledConsumer();
  try {
    await writeInstalledPackages(projectDir);
    await writeInstalledIrMetadata(projectDir, {
      skip: new Set(["capabilities/threenative.capabilities.json"]),
    });
    await writeInstalledAiDocs(projectDir, {
      skip: new Set(["examples/ai-reference/README.md"]),
    });

    const diagnostics = await validateInstalledDistributionArtifacts(projectDir);
    assertDiagnosticsInclude(diagnostics, "TN_DISTRIBUTION_PACKED_METADATA_MISSING", "capabilities/threenative.capabilities.json");
    assertDiagnosticsInclude(diagnostics, "TN_DISTRIBUTION_AI_DOC_MISSING", "examples/ai-reference/README.md");
  } finally {
    await rm(projectDir, { force: true, recursive: true });
  }
});

test("should prove clean consumers can resolve exported schemas capabilities and diagnostics", async () => {
  const projectDir = await createInstalledConsumer();
  try {
    await writeInstalledPackages(projectDir);
    await writeInstalledIrMetadata(projectDir);
    await writeInstalledAiDocs(projectDir);

    const diagnostics = await validateInstalledDistributionArtifacts(projectDir);
    assert.deepEqual(diagnostics, []);

    await writeConsumerTypecheckFixture(projectDir);
    const fixture = await readFile(join(projectDir, "threenative-contract.mts"), "utf8");
    assert.match(fixture, /@threenative\/ir\/capabilities\/threenative\.capabilities\.json/);
    assert.match(fixture, /@threenative\/ir\/diagnostics\/diagnostics\.catalog\.json/);
    assert.match(fixture, /@threenative\/ir\/bundlePaths/);
    assert.match(fixture, /@threenative\/ir\/runtimeDiagnostics/);
    assert.match(fixture, /@threenative\/compiler/);
  } finally {
    await rm(projectDir, { force: true, recursive: true });
  }
});

async function createInstalledConsumer() {
  return await mkdtemp(join(tmpdir(), "threenative-distribution-test-"));
}

async function writeInstalledPackages(projectDir) {
  for (const [name] of packageOrder) {
    const packageRoot = join(projectDir, "node_modules", ...name.split("/"));
    await writeJson(join(packageRoot, "package.json"), {
      name,
      version: "0.0.0-test",
    });
    await writeText(join(packageRoot, "dist", "index.d.ts"), "export {};\n");
    await writeText(join(packageRoot, "dist", "index.d.ts.map"), "{}\n");
    await writeText(join(packageRoot, "dist", "index.js"), "export {};\n");
  }
}

async function writeInstalledIrMetadata(projectDir, options = {}) {
  const irRoot = join(projectDir, "node_modules", "@threenative", "ir");
  for (const file of requiredIrMetadataFiles) {
    if (options.skip?.has(file)) {
      continue;
    }
    await writeJson(join(irRoot, file), {
      schema: "threenative.test",
      version: "0.0.0-test",
    });
  }
}

async function writeInstalledAiDocs(projectDir, options = {}) {
  const aiRoot = join(projectDir, "node_modules", "@threenative", "cli", "dist", "ai");
  for (const file of requiredAiDocFiles) {
    if (options.skip?.has(file)) {
      continue;
    }
    await writeText(join(aiRoot, file), "ThreeNative AI distribution test fixture.\n");
  }
}

async function writeJson(path, value) {
  await writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(path, text) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, { encoding: "utf8", flush: false });
}

function assertDiagnosticsInclude(diagnostics, code, pathFragment) {
  assert.ok(
    diagnostics.some((diagnostic) => diagnostic.code === code && diagnostic.path.includes(pathFragment)),
    `Expected ${code} diagnostic for ${pathFragment}, got ${JSON.stringify(diagnostics, null, 2)}`,
  );
}
