import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import vm from "node:vm";

import { bundleSystemScripts, probeQuickJsLoadability, resolveSystemScriptSources, type ICompilerDiagnostic, type ISystemScriptSource } from "@threenative/compiler";

import type { VerificationDiagnostic } from "./runner.js";

const GATE_SCHEMA = "threenative.verify.script-local-modules" as const;
const GATE_VERSION = "0.1.0" as const;

export interface ScriptLocalModulesGateResult {
  diagnostics: VerificationDiagnostic[];
  reportPath: string;
  ok: boolean;
}

export interface ScriptLocalModulesEvidence {
  bundleHash: string;
  deterministic: boolean;
  expected: Record<string, unknown>;
  nativeBundleEntry: string;
  quickJsLoadable: boolean;
  sharedModuleOccurrences: number;
  systems: Record<string, unknown>;
}

export function validateScriptLocalModulesEvidence(evidence: ScriptLocalModulesEvidence): VerificationDiagnostic[] {
  const diagnostics: VerificationDiagnostic[] = [];
  if (!evidence.deterministic) {
    diagnostics.push(failure("TN_VERIFY_SCRIPT_MODULES_NONDETERMINISTIC", "Repeated graph resolution and bundling produced different output."));
  }
  if (!evidence.quickJsLoadable) {
    diagnostics.push(failure("TN_VERIFY_SCRIPT_MODULES_QUICKJS_FAILED", "The local-module bundle is not loadable by the native-compatible QuickJS probe."));
  }
  if (evidence.sharedModuleOccurrences !== 1) {
    diagnostics.push(failure("TN_VERIFY_SCRIPT_MODULES_SHARED_DUPLICATED", "The shared helper module must be emitted once in the combined bundle."));
  }
  if (evidence.nativeBundleEntry !== "scripts.bundle.js") {
    diagnostics.push(failure("TN_VERIFY_SCRIPT_MODULES_NATIVE_ENTRY_DRIFT", "Native and web must consume the canonical scripts.bundle.js entry."));
  }
  for (const [name, expected] of Object.entries(evidence.expected)) {
    if (JSON.stringify(evidence.systems[name]) !== JSON.stringify(expected)) {
      diagnostics.push(failure("TN_VERIFY_SCRIPT_MODULES_RUNTIME_RESULT", `System '${name}' did not produce the expected portable result.`));
    }
  }
  if (!/^sha256-[0-9a-f]{64}$/.test(evidence.bundleHash)) {
    diagnostics.push(failure("TN_VERIFY_SCRIPT_MODULES_BUNDLE_HASH", "The local-module bundle evidence must include a stable SHA-256 hash."));
  }
  return diagnostics;
}

export async function runScriptLocalModulesGate(options: { reportPath?: string; root?: string } = {}): Promise<ScriptLocalModulesGateResult> {
  const root = resolve(options.root ?? process.cwd());
  const fixtureRoot = resolve(root, "packages/ir/fixtures/conformance/script-local-modules");
  const reportPath = options.reportPath ?? resolve(root, "tools/verify/artifacts/script-local-modules/verification-report.json");
  const expected = JSON.parse(await readFile(resolve(fixtureRoot, "expected.json"), "utf8")) as Record<string, unknown>;
  const systems: ISystemScriptSource[] = [
    sourceSystem("collect", "system_collect", "collect.ts"),
    sourceSystem("updateHud", "system_updateHud", "hud.ts"),
  ];
  const first = resolveSystemScriptSources(systems, fixtureRoot);
  const second = resolveSystemScriptSources(systems, fixtureRoot);
  const firstBundle = bundleSystemScripts(first.systems);
  const secondBundle = bundleSystemScripts(second.systems);
  const bundleCode = firstBundle.code ?? "";
  const secondCode = secondBundle.code ?? "";
  const systemsResult = runSystems(bundleCode);
  const quickJs = await probeQuickJsLoadability(bundleCode);
  const nativeBundleEntry = await readNativeBundleEntry(root);
  const evidence: ScriptLocalModulesEvidence = {
    bundleHash: sha256(bundleCode),
    deterministic: JSON.stringify(first.systems) === JSON.stringify(second.systems)
      && bundleCode === secondCode
      && JSON.stringify(firstBundle.manifest) === JSON.stringify(secondBundle.manifest),
    expected,
    nativeBundleEntry,
    quickJsLoadable: quickJs.ok,
    sharedModuleOccurrences: (bundleCode.match(/const __tn_local_module_/g) ?? []).length === 3 ? 1 : 0,
    systems: systemsResult,
  };
  const diagnostics = [
    ...first.diagnostics.map(toVerificationDiagnostic),
    ...firstBundle.diagnostics.map(toVerificationDiagnostic),
    ...quickJs.diagnostics.map(toVerificationDiagnostic),
    ...validateScriptLocalModulesEvidence(evidence),
  ];
  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({
    code: ok ? "TN_VERIFY_SCRIPT_MODULES_OK" : "TN_VERIFY_SCRIPT_MODULES_FAILED",
    diagnostics,
    evidence: {
      ...evidence,
      manifest: firstBundle.manifest,
      moduleGraphs: first.systems.flatMap((system) => system.script?.localModuleGraph === undefined ? [] : [system.script.localModuleGraph]),
      quickJsDiagnostics: quickJs.diagnostics,
    },
    generatedBy: "@threenative/verify-tools scriptLocalModulesGate",
    ok,
    schema: GATE_SCHEMA,
    status: ok ? "pass" : "fail",
    version: GATE_VERSION,
  }, null, 2)}\n`, "utf8");
  return { diagnostics, ok, reportPath };
}

function sourceSystem(name: string, exportName: string, module: string): ISystemScriptSource {
  return {
    name,
    script: {
      exportName,
      sourceRef: {
        export: name,
        module: `src/scripts/${module}`,
        systemId: name,
      },
    },
  };
}

function toVerificationDiagnostic(diagnostic: ICompilerDiagnostic): VerificationDiagnostic {
  return {
    code: diagnostic.code,
    message: diagnostic.message,
    path: diagnostic.path,
    severity: diagnostic.severity === "error" ? "error" : "warning",
    suggestedFix: diagnostic.suggestion,
  };
}

function runSystems(code: string): Record<string, unknown> {
  const executable = code.replace(/^export const /gm, "const ");
  const context = vm.createContext(Object.create(null));
  return vm.runInContext(`(() => {\n${executable}\nreturn { collect: systems.system_collect({}), updateHud: systems.system_updateHud({}) };\n})()`, context) as Record<string, unknown>;
}

async function readNativeBundleEntry(root: string): Promise<string> {
  const source = await readFile(resolve(root, "runtime-bevy/crates/threenative_runtime/tests/game_loop_contract.rs"), "utf8");
  return source.includes('"scripts": "scripts.bundle.js"') ? "scripts.bundle.js" : "";
}

function sha256(value: string): string {
  return `sha256-${createHash("sha256").update(value).digest("hex")}`;
}

function failure(code: string, message: string): VerificationDiagnostic {
  return { code, message, severity: "error", suggestedFix: "Run the focused script-local-modules gate and inspect its report artifact." };
}

if (process.argv[1]?.endsWith("scriptLocalModulesGate.js")) {
  const result = await runScriptLocalModulesGate();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
