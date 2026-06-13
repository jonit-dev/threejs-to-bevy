import type { ICompilerDiagnostic } from "../diagnostics.js";

export interface IPortableSystemSource {
  commands?: ReadonlyArray<string>;
  eventWrites?: ReadonlyArray<string>;
  file?: string;
  services?: ReadonlyArray<string>;
  source: string;
  systemName: string;
  writes?: ReadonlyArray<string>;
}

const unsupportedPatterns: Array<{ code: string; label: string; pattern: RegExp; suggestion: string }> = [
  {
    code: "TN_SCRIPT_DOM_API_UNSUPPORTED",
    label: "DOM, worker, or browser globals",
    pattern: /\b(?:document|window|HTMLElement|localStorage|navigator|sessionStorage|SharedWorker|Worker)\b/,
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
  {
    code: "TN_SCRIPT_NPM_DEPENDENCY_UNSUPPORTED",
    label: "arbitrary npm dependencies",
    pattern: /\bfrom\s+["'](?!@threenative\/sdk["']|[./])/,
    suggestion: "Portable systems may import the SDK only; pass other data through declared resources, events, or services.",
  },
];

export function diagnosePortableSystem(source: IPortableSystemSource): ICompilerDiagnostic[] {
  const diagnostics: ICompilerDiagnostic[] = unsupportedPatterns.flatMap((rule) => {
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
  diagnostics.push(...diagnoseDeclaredAccess(source));
  return diagnostics;
}

function diagnoseDeclaredAccess(source: IPortableSystemSource): ICompilerDiagnostic[] {
  const diagnostics: ICompilerDiagnostic[] = [];
  const writes = new Set(source.writes ?? []);
  const commands = new Set(source.commands ?? []);
  const eventWrites = new Set(source.eventWrites ?? []);
  const services = new Set(source.services ?? []);

  for (const component of uniqueMatches(source.source, /\b(?:patch|set)\s*\(\s*([A-Z][A-Za-z0-9_]*)/g)) {
    if (!writes.has(component)) {
      diagnostics.push({
        code: "TN_SCRIPT_WRITE_UNDECLARED",
        file: source.file,
        message: `System '${source.systemName}' writes component '${component}' without declaring it in writes.`,
        path: `systems/${source.systemName}/writes/${component}`,
        severity: "error",
        suggestion: `Add '${component}' to the system writes list or remove the mutation.`,
      });
    }
  }

  for (const command of uniqueMatches(source.source, /\bcommands\.(spawn|despawn|addComponent|removeComponent|setComponent)\s*\(/g)) {
    if (!commands.has(command)) {
      diagnostics.push({
        code: "TN_SCRIPT_COMMAND_UNDECLARED",
        file: source.file,
        message: `System '${source.systemName}' uses command '${command}' without declaring it.`,
        path: `systems/${source.systemName}/commands/${command}`,
        severity: "error",
        suggestion: `Add '${command}' to the system command permissions or remove the command call.`,
      });
    }
  }

  for (const event of uniqueMatches(source.source, /\bevents\.emit\s*\(\s*([A-Z][A-Za-z0-9_]*)/g)) {
    if (!eventWrites.has(event)) {
      diagnostics.push({
        code: "TN_SCRIPT_EVENT_WRITE_UNDECLARED",
        file: source.file,
        message: `System '${source.systemName}' emits event '${event}' without declaring it in eventWrites.`,
        path: `systems/${source.systemName}/eventWrites/${event}`,
        severity: "error",
        suggestion: `Add '${event}' to eventWrites or remove the event emission.`,
      });
    }
  }

  for (const service of [
    ...uniqueMatches(source.source, /\bphysics\.raycast\s*\(/g).map(() => "physics.raycast"),
    ...uniqueMatches(source.source, /\banimation\.play\s*\(/g).map(() => "animation.play"),
  ]) {
    if (!services.has(service)) {
      diagnostics.push({
        code: "TN_SCRIPT_SERVICE_UNDECLARED",
        file: source.file,
        message: `System '${source.systemName}' calls service '${service}' without declaring it.`,
        path: `systems/${source.systemName}/services/${service}`,
        severity: "error",
        suggestion: `Add '${service}' to the system services list or remove the service call.`,
      });
    }
  }

  return diagnostics;
}

function uniqueMatches(source: string, pattern: RegExp): string[] {
  return [...new Set([...source.matchAll(pattern)].map((match) => match[1] ?? match[0]))];
}
