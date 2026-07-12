import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveScriptModuleGraph } from "./moduleGraph.js";

test("should resolve a nested relative module graph deterministically", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-module-graph-"));
  try {
    await mkdir(join(root, "src/scripts/indexed"), { recursive: true });
    await mkdir(join(root, "src/scripts/nested"), { recursive: true });
    await writeFile(
      join(root, "src/scripts/main.ts"),
      `import { shared } from "./shared";\nimport { indexed } from "./indexed";\nexport const main = () => shared + indexed;\n`,
    );
    await writeFile(join(root, "src/scripts/shared.ts"), `import { value } from "./nested/value.ts";\nexport const shared = value + 1;\n`);
    await writeFile(join(root, "src/scripts/nested/value.ts"), `export const value = 2;\n`);
    await writeFile(join(root, "src/scripts/indexed/index.ts"), `export const indexed = 3;\n`);

    const first = resolveScriptModuleGraph({ entryModule: "src/scripts/main.ts", projectPath: root });
    const second = resolveScriptModuleGraph({ entryModule: "src/scripts/main.ts", projectPath: root });

    assert.deepEqual(first, second);
    assert.deepEqual(first.diagnostics, []);
    assert.deepEqual(first.graph?.order, [
      "src/scripts/indexed/index.ts",
      "src/scripts/nested/value.ts",
      "src/scripts/shared.ts",
      "src/scripts/main.ts",
    ]);
    assert.deepEqual(first.graph?.modules.map((module) => module.dependencies), [
      [],
      [],
      ["src/scripts/nested/value.ts"],
      ["src/scripts/indexed/index.ts", "src/scripts/shared.ts"],
    ]);
    assert.match(first.graph?.hash ?? "", /^sha256-[0-9a-f]{64}$/);
    assert.match(first.graph?.modules[0]?.hash ?? "", /^sha256-[0-9a-f]{64}$/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject an import that escapes src scripts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-module-graph-escape-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(join(root, "src/scripts/main.ts"), `import "../../outside";\nexport const main = 1;\n`);

    const result = resolveScriptModuleGraph({ entryModule: "src/scripts/main.ts", projectPath: root });

    assert.equal(result.graph, undefined);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.code, "TN_SCRIPT_MODULE_PATH_ESCAPE");
    assert.equal(result.diagnostics[0]?.file, "src/scripts/main.ts");
    assert.match(result.diagnostics[0]?.message ?? "", /src\/scripts\/main\.ts/);
    assert.match(result.diagnostics[0]?.message ?? "", /\.\.\/\.\.\/outside/);
    assert.match(result.diagnostics[0]?.message ?? "", /src\/scripts/);
    assert.match(result.diagnostics[0]?.fix?.instruction ?? "", /Keep the import inside/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should report missing, dynamic, and bare imports with stable diagnostics", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-module-graph-diagnostics-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(
      join(root, "src/scripts/main.ts"),
      `import "./missing";\nimport { external } from "some-package";\nconst load = () => import("./later");\nexport const main = () => [external, load];\n`,
    );

    const result = resolveScriptModuleGraph({ entryModule: "src/scripts/main.ts", projectPath: root });

    assert.equal(result.graph, undefined);
    assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
      "TN_SCRIPT_MODULE_NOT_FOUND",
      "TN_SCRIPT_BARE_IMPORT_UNSUPPORTED",
      "TN_SCRIPT_DYNAMIC_IMPORT_UNSUPPORTED",
    ]);
    assert.match(result.diagnostics[0]?.message ?? "", /\.\/missing/);
    assert.match(result.diagnostics[1]?.message ?? "", /some-package/);
    assert.match(result.diagnostics[2]?.message ?? "", /\.\/later/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should report the complete relative import cycle", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-module-graph-cycle-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(join(root, "src/scripts/a.ts"), `import { b } from "./b";\nexport const a = b;\n`);
    await writeFile(join(root, "src/scripts/b.ts"), `import { a } from "./a";\nexport const b = a;\n`);

    const result = resolveScriptModuleGraph({ entryModule: "src/scripts/a.ts", projectPath: root });

    assert.equal(result.graph, undefined);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.code, "TN_SCRIPT_MODULE_CYCLE");
    assert.match(
      result.diagnostics[0]?.message ?? "",
      /src\/scripts\/a\.ts -> src\/scripts\/b\.ts -> src\/scripts\/a\.ts/,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should ignore type-only imports and allow explicitly approved helper packages", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-script-module-graph-allowlist-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(
      join(root, "src/scripts/main.ts"),
      `import { type ScriptContext } from "@threenative/script-stdlib";\nimport { helper } from "@threenative/script-stdlib";\nimport type { ProjectContext } from "../../.threenative/types/project-context";\nexport const main = (context: ScriptContext) => [context, helper];\n`,
    );

    const result = resolveScriptModuleGraph({
      allowedBareImports: ["@threenative/script-stdlib"],
      entryModule: "src/scripts/main.ts",
      projectPath: root,
    });

    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.graph?.order, ["src/scripts/main.ts"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
