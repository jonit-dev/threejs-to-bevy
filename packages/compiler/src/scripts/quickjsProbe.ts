import type { ICompilerDiagnostic } from "../diagnostics.js";

export interface IQuickJsProbeResult {
  diagnostics: ICompilerDiagnostic[];
  nativeQuickJsBinding: "not-configured";
  ok: boolean;
}

const forbiddenNativeHostPatterns: Array<{ code: string; pattern: RegExp; suggestion: string }> = [
  {
    code: "TN_SCRIPT_QUICKJS_HOST_GLOBAL_UNSUPPORTED",
    pattern: /\b(?:document|window|Worker|require|process)\b|node:/,
    suggestion: "Portable script bundles must not depend on browser, worker, or Node globals.",
  },
  {
    code: "TN_SCRIPT_QUICKJS_DYNAMIC_IMPORT_UNSUPPORTED",
    pattern: /\bimport\s*\(/,
    suggestion: "Use compiler-emitted static bundle exports instead of dynamic imports.",
  },
];

export async function probeQuickJsLoadability(code: string): Promise<IQuickJsProbeResult> {
  const diagnostics: ICompilerDiagnostic[] = forbiddenNativeHostPatterns.flatMap((rule) =>
    rule.pattern.test(code)
      ? [
          {
            code: rule.code,
            message: "Script bundle uses syntax or globals outside the V4 native QuickJS loadability subset.",
            path: "scripts.bundle.js",
            severity: "error" as const,
            suggestion: rule.suggestion,
          },
        ]
      : [],
  );
  if (diagnostics.length === 0) {
    diagnostics.push(...(await parseAsEsm(code)));
  }
  return {
    diagnostics,
    nativeQuickJsBinding: "not-configured",
    ok: diagnostics.length === 0,
  };
}

async function parseAsEsm(code: string): Promise<ICompilerDiagnostic[]> {
  try {
    const encoded = Buffer.from(`${code}\n//# sourceURL=tn-quickjs-probe.mjs\n`, "utf8").toString("base64");
    await import(`data:text/javascript;base64,${encoded}`);
    return [];
  } catch (error) {
    return [
      {
        code: "TN_SCRIPT_QUICKJS_PARSE_FAILED",
        message: `Script bundle failed ESM parse/load probe: ${error instanceof Error ? error.message : String(error)}`,
        path: "scripts.bundle.js",
        severity: "error",
        suggestion: "Keep portable system bundles as deterministic ESM without host globals or dynamic imports.",
      },
    ];
  }
}
