import { prescriptiveFixForCode } from "@threenative/authoring";

import type { ICompilerDiagnostic } from "../diagnostics.js";
import { maskStringAndCommentText } from "./lexical.js";

export interface IPortableSystemSource {
  commands?: ReadonlyArray<string>;
  eventWrites?: ReadonlyArray<string>;
  exportName?: string;
  file?: string;
  queries?: ReadonlyArray<{ with: ReadonlyArray<string>; without: ReadonlyArray<string> }>;
  resourceWrites?: ReadonlyArray<string>;
  services?: ReadonlyArray<string>;
  source: string;
  systemName: string;
  writes?: ReadonlyArray<string>;
}

const unsupportedPatterns: Array<{
  code: string;
  label: string;
  pattern: RegExp;
  scan?: "code" | "source";
  suggestion: string;
}> = [
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
    pattern: /\b(?:Buffer|__dirname|__filename|process|require)\b/,
    suggestion: "Portable systems cannot use filesystem, process, or Node runtime APIs.",
  },
  {
    code: "TN_SCRIPT_NODE_API_UNSUPPORTED",
    label: "Node.js APIs",
    pattern: /(?:\bfrom\s+|\bimport\s*(?:\([^)]*\)\s*)?)["']node:[^"']+["']/,
    scan: "source",
    suggestion: "Portable systems cannot use filesystem, process, or Node runtime APIs.",
  },
  {
    code: "TN_SCRIPT_DYNAMIC_CODE_UNSUPPORTED",
    label: "dynamic code evaluation",
    pattern: /\b(?:eval|Function)\s*\(|\bimport\s*\(/,
    suggestion: "Use statically declared portable system modules without eval, Function constructors, or dynamic imports.",
  },
  {
    code: "TN_SCRIPT_ASYNC_UNSUPPORTED",
    label: "async or promise scheduling",
    pattern: /\b(?:async|await|Promise)\b/,
    suggestion: "Keep portable systems deterministic and frame-bounded; use resources, events, and fixed schedules instead of async work.",
  },
  {
    code: "TN_SCRIPT_TIMER_API_UNSUPPORTED",
    label: "timer or scheduler APIs",
    pattern: /\b(?:cancelAnimationFrame|clearInterval|clearTimeout|queueMicrotask|requestAnimationFrame|setInterval|setTimeout)\b/,
    suggestion: "Use ctx.time and the portable schedule instead of timers or browser schedulers.",
  },
  {
    code: "TN_SCRIPT_RUNTIME_IMPORT_UNSUPPORTED",
    label: "runtime adapter imports",
    pattern: /(?:\bfrom\s+|\bimport\s*(?:\([^)]*\)\s*)?)["'](?:@threenative\/runtime-[^"']*|three(?:\/[^"']*)?|bevy(?:\/[^"']*)?)["']/,
    scan: "source",
    suggestion: "Keep systems independent of web and native runtime adapter internals.",
  },
  {
    code: "TN_SCRIPT_NPM_DEPENDENCY_UNSUPPORTED",
    label: "arbitrary npm dependencies",
    pattern: /\bfrom\s+["'](?!@threenative\/sdk["']|[./])/,
    scan: "source",
    suggestion: "Portable systems may import the SDK only; pass other data through declared resources, events, or services.",
  },
];

export function diagnosePortableSystem(source: IPortableSystemSource): ICompilerDiagnostic[] {
  const codeOnlySource = maskStringAndCommentText(source.source);
  const diagnostics: ICompilerDiagnostic[] = unsupportedPatterns.flatMap((rule) => {
    const scannedSource = rule.scan === "source" ? source.source : codeOnlySource;
    if (!rule.pattern.test(scannedSource)) {
      return [];
    }
    return [
      {
        code: rule.code,
        file: source.file,
        fix: prescriptiveFixForCode(rule.code),
        message: `System '${source.systemName}' uses unsupported ${rule.label}.`,
        path: `systems/${source.systemName}`,
        severity: "error" as const,
        suggestion: rule.suggestion,
        target: source.exportName,
      },
    ];
  });
  diagnostics.push(...diagnoseLegacyIdioms(source, codeOnlySource));
  diagnostics.push(...diagnoseDeclaredAccess(source));
  return diagnostics;
}

function diagnoseLegacyIdioms(source: IPortableSystemSource, codeOnlySource: string): ICompilerDiagnostic[] {
  const diagnostics: ICompilerDiagnostic[] = [];
  if (/\b(?:context|ctx)\.input\.axis1\s*\(/.test(codeOnlySource) || /\.input\.axis1\s*\(/.test(codeOnlySource)) {
    diagnostics.push({
      code: "TN_SCRIPT_LEGACY_AXIS1",
      file: source.file,
      fix: {
        docs: "docs/contracts/script-context-conventions.md",
        instruction: "Declare the axis action mapping in content/input/*.input.json and read the signed value with getAxis.",
        snippet: 'const moveX = context.input.getAxis("MoveX");',
      },
      message: `System '${source.systemName}' uses legacy input.axis1; use input.getAxis with source-authored axis mappings.`,
      path: `systems/${source.systemName}/input/getAxis`,
      severity: "error",
      suggestion: "Replace input.axis1(...) with input.getAxis(...) and move negative/positive actions into the input source document.",
      target: source.exportName,
    });
  }
  if (/\.positionOr\s*\(/.test(codeOnlySource)) {
    diagnostics.push({
      code: "TN_SCRIPT_LEGACY_POSITION_OR",
      file: source.file,
      fix: {
        docs: "docs/contracts/script-context-conventions.md",
        instruction: "Read the authored/live transform position through the position property.",
        snippet: "const position = entity.transform().position;",
      },
      message: `System '${source.systemName}' uses legacy transform.positionOr; use transform.position.`,
      path: `systems/${source.systemName}/transform/position`,
      severity: "error",
      suggestion: "Replace transform.positionOr(fallback) with transform.position.",
      target: source.exportName,
    });
  }
  if (/\b(?:context|ctx)\.time\.fixedDelta\s*\(/.test(codeOnlySource) || /\.time\.fixedDelta\s*\(/.test(codeOnlySource)) {
    diagnostics.push({
      code: "TN_SCRIPT_LEGACY_FIXED_DELTA_OPTIONS",
      file: source.file,
      fix: {
        docs: "docs/contracts/script-context-conventions.md",
        instruction: "Read fixedDelta as a readonly number; configure clamps in runtime source data instead of script options.",
        snippet: "const delta = context.time.fixedDelta;",
      },
      message: `System '${source.systemName}' calls legacy time.fixedDelta(...); use the fixedDelta property.`,
      path: `systems/${source.systemName}/time/fixedDelta`,
      severity: "error",
      suggestion: "Replace time.fixedDelta(...) with time.fixedDelta.",
      target: source.exportName,
    });
  }
  return diagnostics;
}

function diagnoseDeclaredAccess(source: IPortableSystemSource): ICompilerDiagnostic[] {
  const diagnostics: ICompilerDiagnostic[] = [];
  const writes = new Set(source.writes ?? []);
  const resourceWrites = new Set(source.resourceWrites ?? []);
  const commands = new Set(source.commands ?? []);
  const eventWrites = new Set(source.eventWrites ?? []);
  const services = new Set(source.services ?? []);
  const declaredQueries = new Set((source.queries ?? []).map(queryKey));

  for (const component of uniqueMatches(source.source, /(?<!resources\.)\b(?:patch|set|setComponent)\s*\(\s*([A-Z][A-Za-z0-9_]*)/g)) {
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

  for (const resource of uniqueMatches(source.source, /\bresources\.(?:set|patch)\s*\(\s*([A-Z][A-Za-z0-9_]*)/g)) {
    if (!resourceWrites.has(resource)) {
      diagnostics.push({
        code: "TN_SCRIPT_RESOURCE_WRITE_UNDECLARED",
        file: source.file,
        message: `System '${source.systemName}' writes resource '${resource}' without declaring it in resourceWrites.`,
        path: `systems/${source.systemName}/resourceWrites/${resource}`,
        severity: "error",
        suggestion: `Add '${resource}' to the system resourceWrites list or remove the mutation.`,
      });
    }
  }

  for (const resource of uniqueMatches(source.source, /\b(?:context|ctx)\.state\s*\(\s*["']([^"']+)["']/g)) {
    if (!resourceWrites.has(resource)) {
      diagnostics.push({
        code: "TN_SCRIPT_RESOURCE_WRITE_UNDECLARED",
        file: source.file,
        message: `System '${source.systemName}' writes resource '${resource}' without declaring it in resourceWrites.`,
        path: `systems/${source.systemName}/resourceWrites/${resource}`,
        severity: "error",
        suggestion: `Add '${resource}' to the system resourceWrites list or remove the state helper mutation.`,
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
    ...uniqueMatches(source.source, /\bphysics\.overlap\s*\(/g).map(() => "physics.overlap"),
    ...uniqueMatches(source.source, /\bphysics\.raycast\s*\(/g).map(() => "physics.raycast"),
    ...uniqueMatches(source.source, /\bphysics\.shapeCast\s*\(/g).map(() => "physics.shapeCast"),
    ...uniqueMatches(source.source, /\bpicking\.mesh\s*\(/g).map(() => "picking.mesh"),
    ...uniqueMatches(source.source, /\bpicking\.pointerRay\s*\(/g).map(() => "picking.pointerRay"),
    ...uniqueMatches(source.source, /\banimation\.play\s*\(/g).map(() => "animation.play"),
    ...uniqueMatches(source.source, /\banimation\.query\s*\(/g).map(() => "animation.query"),
    ...uniqueMatches(source.source, /\banimation\.stop\s*\(/g).map(() => "animation.stop"),
    ...uniqueMatches(source.source, /\bassets\.load\s*\(/g).map(() => "assets.load"),
    ...uniqueMatches(source.source, /\bcharacter\.move\s*\(/g).map(() => "character.move"),
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

  for (const query of literalQueries(source.source)) {
    if (declaredQueries.size > 0 && !declaredQueries.has(queryKey(query))) {
      diagnostics.push({
        code: "TN_SCRIPT_QUERY_UNDECLARED",
        file: source.file,
        message: `System '${source.systemName}' calls context.query(${formatQuery(query)}) without declaring it in queries.`,
        path: `systems/${source.systemName}/queries/${formatQuery(query)}`,
        severity: "error",
        suggestion: `Add defineQuery(${formatQuery(query)}) to the system queries list or use context.query() for the default query.`,
      });
    }
  }

  return diagnostics;
}

function uniqueMatches(source: string, pattern: RegExp): string[] {
  return [...new Set([...source.matchAll(pattern)].map((match) => match[1] ?? match[0]))];
}

function literalQueries(source: string): Array<{ with: string[]; without: string[] }> {
  return [...source.matchAll(/\b(?:context|ctx)\.query\s*\(\s*\{\s*with\s*:\s*\[([^\]]*)\]\s*,\s*without\s*:\s*\[([^\]]*)\]/g)].map((match) => ({
    with: stringArrayValues(match[1] ?? ""),
    without: stringArrayValues(match[2] ?? ""),
  }));
}

function stringArrayValues(source: string): string[] {
  return [...source.matchAll(/["']([^"']+)["']/g)].flatMap((match) => (match[1] === undefined ? [] : [match[1]])).sort();
}

function queryKey(query: { with: ReadonlyArray<string>; without: ReadonlyArray<string> }): string {
  return JSON.stringify({ with: [...query.with].sort(), without: [...query.without].sort() });
}

function formatQuery(query: { with: ReadonlyArray<string>; without: ReadonlyArray<string> }): string {
  return `{ with: ${JSON.stringify([...query.with].sort())}, without: ${JSON.stringify([...query.without].sort())} }`;
}
