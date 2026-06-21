import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const packageContracts = [
  packageContract("@threenative/sdk", "packages/sdk"),
  packageContract("@threenative/ir", "packages/ir", {
    exports: [
      jsExport(".", "./dist/index.d.ts"),
      jsExport("./bundlePaths", "./dist/bundlePaths.d.ts"),
      jsExport("./conformance", "./dist/conformance.d.ts"),
      jsExport("./input", "./dist/input.d.ts"),
      jsExport("./reflection", "./dist/reflection.d.ts"),
      jsExport("./runtimeDiagnostics", "./dist/runtimeDiagnostics.d.ts"),
      staticExport("./schemas/*"),
    ],
    files: ["dist", "schemas"],
  }),
  packageContract("@threenative/authoring", "packages/authoring"),
  packageContract("@threenative/ui", "packages/ui", {
    exports: [jsExport(".", "./dist/index.d.ts"), jsExport("./jsx-runtime", "./dist/jsx-runtime.d.ts")],
  }),
  packageContract("@threenative/r3f", "packages/r3f", {
    exports: [jsExport(".", "./dist/index.d.ts"), jsExport("./jsx-runtime", "./dist/jsx-runtime.d.ts")],
  }),
  packageContract("@threenative/compiler", "packages/compiler"),
  packageContract("@threenative/runtime-web-three", "packages/runtime-web-three", { files: ["dist", "index.html"] }),
  packageContract("@threenative/cli", "packages/cli", { files: ["dist", "templates"] }),
];

export async function checkDistributionContract(options = {}) {
  const root = options.root ?? repoRoot;
  const contracts = options.contracts ?? packageContracts;
  const diagnostics = [];
  const baseTsconfig = await readJson(root, "tsconfig.base.json", diagnostics);
  if (baseTsconfig !== undefined) {
    if (baseTsconfig.compilerOptions?.declaration !== true) {
      diagnostics.push(distributionDiagnostic("TN_DISTRIBUTION_DECLARATION_DISABLED", "tsconfig.base.json", "Shared TypeScript config must emit declarations.", "Set compilerOptions.declaration to true."));
    }
    if (baseTsconfig.compilerOptions?.declarationMap !== true) {
      diagnostics.push(distributionDiagnostic("TN_DISTRIBUTION_DECLARATION_MAP_DISABLED", "tsconfig.base.json", "Shared TypeScript config must emit declaration maps.", "Set compilerOptions.declarationMap to true."));
    }
  }

  for (const contract of contracts) {
    const manifestPath = `${contract.packagePath}/package.json`;
    const manifest = await readJson(root, manifestPath, diagnostics);
    if (manifest === undefined) {
      continue;
    }
    diagnostics.push(...validatePackageManifest(contract, manifest, manifestPath));
  }

  return { diagnostics, ok: diagnostics.length === 0 };
}

export function validatePackageManifest(contract, manifest, manifestPath = `${contract.packagePath}/package.json`) {
  const diagnostics = [];
  if (manifest.name !== contract.name) {
    diagnostics.push(distributionDiagnostic("TN_DISTRIBUTION_PACKAGE_NAME_MISMATCH", manifestPath, `Package manifest must be named '${contract.name}'.`, "Keep the distribution contract package list and package.json name aligned."));
  }
  if (manifest.publishConfig?.access !== "public") {
    diagnostics.push(distributionDiagnostic("TN_DISTRIBUTION_PUBLIC_ACCESS_MISSING", manifestPath, "Published ThreeNative packages must use public npm access.", "Set publishConfig.access to public."));
  }
  if (manifest.types !== "./dist/index.d.ts") {
    diagnostics.push(distributionDiagnostic("TN_DISTRIBUTION_TYPES_MISSING", manifestPath, "Public package must expose root TypeScript declarations.", "Set package.json types to ./dist/index.d.ts."));
  }

  for (const entry of contract.files) {
    if (!Array.isArray(manifest.files) || !manifest.files.includes(entry)) {
      diagnostics.push(distributionDiagnostic("TN_DISTRIBUTION_FILES_ENTRY_MISSING", manifestPath, `Package files must include '${entry}'.`, `Add '${entry}' to package.json files.`));
    }
  }

  for (const entry of contract.exports) {
    const exported = manifest.exports?.[entry.subpath];
    if (exported === undefined) {
      diagnostics.push(distributionDiagnostic("TN_DISTRIBUTION_EXPORT_MISSING", manifestPath, `Package exports must include '${entry.subpath}'.`, `Add an exports entry for '${entry.subpath}'.`));
      continue;
    }
    if (entry.kind === "static") {
      continue;
    }
    if (typeof exported !== "object" || exported === null || Array.isArray(exported)) {
      diagnostics.push(distributionDiagnostic("TN_DISTRIBUTION_EXPORT_TYPES_MISSING", manifestPath, `Export '${entry.subpath}' must include a types condition.`, "Use an export object with types and default conditions."));
      continue;
    }
    if (exported.types !== entry.types) {
      diagnostics.push(distributionDiagnostic("TN_DISTRIBUTION_EXPORT_TYPES_MISSING", manifestPath, `Export '${entry.subpath}' must resolve types to '${entry.types}'.`, `Set exports['${entry.subpath}'].types to '${entry.types}'.`));
    }
    if (typeof exported.default !== "string" || !exported.default.startsWith("./dist/")) {
      diagnostics.push(distributionDiagnostic("TN_DISTRIBUTION_EXPORT_DEFAULT_MISSING", manifestPath, `Export '${entry.subpath}' must include a dist default condition.`, `Set exports['${entry.subpath}'].default to the built JavaScript file.`));
    }
  }

  return diagnostics;
}

function packageContract(name, packagePath, overrides = {}) {
  return {
    exports: overrides.exports ?? [jsExport(".", "./dist/index.d.ts")],
    files: overrides.files ?? ["dist"],
    name,
    packagePath,
  };
}

function jsExport(subpath, types) {
  return { kind: "js", subpath, types };
}

function staticExport(subpath) {
  return { kind: "static", subpath };
}

function distributionDiagnostic(code, path, message, suggestedFix) {
  return { code, message, path, severity: "error", suggestedFix };
}

async function readJson(root, path, diagnostics) {
  try {
    return JSON.parse(await readFile(resolve(root, path), "utf8"));
  } catch (error) {
    diagnostics.push(distributionDiagnostic("TN_DISTRIBUTION_JSON_READ_FAILED", path, `Could not read distribution contract JSON '${path}'.`, error instanceof Error ? error.message : String(error)));
    return undefined;
  }
}

async function main() {
  const result = await checkDistributionContract();
  const payload = {
    code: result.ok ? "TN_DISTRIBUTION_CONTRACT_OK" : "TN_DISTRIBUTION_CONTRACT_FAILED",
    diagnostics: result.diagnostics,
    status: result.ok ? "pass" : "fail",
  };
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write("Distribution contract check passed.\n");
  } else {
    process.stderr.write(
      `Distribution contract check failed with ${result.diagnostics.length} issue(s).\n${result.diagnostics
        .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
        .join("\n")}\n`,
    );
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
