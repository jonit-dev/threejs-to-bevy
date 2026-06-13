import type { ICompilerDiagnostic } from "../diagnostics.js";

export interface IPortableSystemSource {
  file?: string;
  source: string;
  systemName: string;
}

const unsupportedPatterns: Array<{ code: string; label: string; pattern: RegExp; suggestion: string }> = [
  {
    code: "TN_SCRIPT_DOM_API_UNSUPPORTED",
    label: "DOM or browser globals",
    pattern: /\b(?:document|window|HTMLElement|localStorage|sessionStorage)\b/,
    suggestion: "Use the portable system context instead of browser globals.",
  },
  {
    code: "TN_SCRIPT_NETWORK_API_UNSUPPORTED",
    label: "network APIs",
    pattern: /\b(?:fetch|WebSocket|XMLHttpRequest|EventSource)\b/,
    suggestion: "Pass data through resources or events instead of direct network access.",
  },
  {
    code: "TN_SCRIPT_NODE_API_UNSUPPORTED",
    label: "Node.js APIs",
    pattern: /\b(?:require|process|Buffer|__dirname|__filename)\b|node:/,
    suggestion: "Portable systems cannot use filesystem, process, or Node runtime APIs.",
  },
  {
    code: "TN_SCRIPT_RUNTIME_IMPORT_UNSUPPORTED",
    label: "runtime adapter imports",
    pattern: /@threenative\/runtime-|three\b|bevy\b/,
    suggestion: "Keep systems independent of web and native runtime adapter internals.",
  },
];

export function diagnosePortableSystem(source: IPortableSystemSource): ICompilerDiagnostic[] {
  return unsupportedPatterns.flatMap((rule) => {
    if (!rule.pattern.test(source.source)) {
      return [];
    }
    return [
      {
        code: rule.code,
        file: source.file,
        message: `System '${source.systemName}' uses unsupported ${rule.label}.`,
        path: `systems/${source.systemName}`,
        severity: "error" as const,
        suggestion: rule.suggestion,
      },
    ];
  });
}
