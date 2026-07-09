import type { IPlaytestSummary } from "./playtestArtifacts.js";
import type { PlaytestTarget } from "./playtestScenario.js";

type Axis = "x" | "y" | "z";

export interface IPlaytestParityCompareConfig {
  animation?: Array<{ clip?: string; entity: string; requiredOn?: PlaytestTarget[] }>;
  axisDelta?: Partial<Record<Axis, number>>;
  contacts?: { minSharedCount?: number };
  movementDistance?: { maxDelta: number };
  resources?: string[];
}

export interface IPlaytestParityDiagnostic {
  code:
    | "TN_GAMEPLAY_PARITY_CONTACT_DRIFT"
    | "TN_GAMEPLAY_PARITY_MOVEMENT_DRIFT"
    | "TN_GAMEPLAY_PARITY_RESOURCE_DRIFT"
    | "TN_GAMEPLAY_PARITY_ANIMATION_DRIFT"
    | "TN_GAMEPLAY_PARITY_RUNTIME_DIAGNOSTIC";
  expected?: unknown;
  message: string;
  observed?: unknown;
  severity: "error" | "warning";
}

export interface IPlaytestParityCompareResult {
  diagnostics: IPlaytestParityDiagnostic[];
  pass: boolean;
}

export type ComparablePlaytestSummary = Partial<IPlaytestSummary> & {
  observations?: {
    resources?: Record<string, { after?: unknown; before?: unknown }>;
    runtimeDiagnostics?: unknown;
  };
};

export function comparePlaytestParity(
  web: ComparablePlaytestSummary,
  desktop: ComparablePlaytestSummary,
  config: IPlaytestParityCompareConfig,
): IPlaytestParityCompareResult {
  const diagnostics: IPlaytestParityDiagnostic[] = [];
  diagnostics.push(...compareMovementDistance(web, desktop, config.movementDistance));
  diagnostics.push(...compareAxisDeltas(web, desktop, config.axisDelta));
  diagnostics.push(...compareResources(web, desktop, config.resources ?? []));
  diagnostics.push(...compareContacts(web, desktop, config.contacts));
  diagnostics.push(...compareAnimations(web, desktop, config.animation ?? []));
  diagnostics.push(...compareRuntimeDiagnostics(web, desktop));
  return {
    diagnostics,
    pass: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
  };
}

function compareMovementDistance(
  web: ComparablePlaytestSummary,
  desktop: ComparablePlaytestSummary,
  config: IPlaytestParityCompareConfig["movementDistance"],
): IPlaytestParityDiagnostic[] {
  if (config === undefined || typeof web.distance !== "number" || typeof desktop.distance !== "number") {
    return [];
  }
  const delta = Math.abs(web.distance - desktop.distance);
  if (delta <= config.maxDelta) {
    return [];
  }
  return [{
    code: "TN_GAMEPLAY_PARITY_MOVEMENT_DRIFT",
    expected: { maxDelta: config.maxDelta },
    message: `Movement distance drift ${delta.toFixed(6)} exceeded tolerance ${config.maxDelta}.`,
    observed: { desktop: desktop.distance, delta, web: web.distance },
    severity: "error",
  }];
}

function compareAxisDeltas(
  web: ComparablePlaytestSummary,
  desktop: ComparablePlaytestSummary,
  config: IPlaytestParityCompareConfig["axisDelta"],
): IPlaytestParityDiagnostic[] {
  if (config === undefined) {
    return [];
  }
  const diagnostics: IPlaytestParityDiagnostic[] = [];
  for (const [axis, maxDelta] of Object.entries(config) as Array<[Axis, number | undefined]>) {
    if (maxDelta === undefined) {
      continue;
    }
    const webValue = axisValue(web.movementDelta, axis);
    const desktopValue = axisValue(desktop.movementDelta, axis);
    if (webValue === undefined || desktopValue === undefined) {
      continue;
    }
    const delta = Math.abs(webValue - desktopValue);
    if (delta > maxDelta) {
      diagnostics.push({
        code: "TN_GAMEPLAY_PARITY_MOVEMENT_DRIFT",
        expected: { axis, maxDelta },
        message: `Movement ${axis}-axis drift ${delta.toFixed(6)} exceeded tolerance ${maxDelta}.`,
        observed: { desktop: desktopValue, delta, web: webValue },
        severity: "error",
      });
    }
  }
  return diagnostics;
}

function compareResources(
  web: ComparablePlaytestSummary,
  desktop: ComparablePlaytestSummary,
  resources: readonly string[],
): IPlaytestParityDiagnostic[] {
  const diagnostics: IPlaytestParityDiagnostic[] = [];
  for (const resourcePath of resources) {
    const webValue = resourceValue(web, resourcePath);
    const desktopValue = resourceValue(desktop, resourcePath);
    if (!jsonEqual(webValue, desktopValue)) {
      diagnostics.push({
        code: "TN_GAMEPLAY_PARITY_RESOURCE_DRIFT",
        expected: { resource: resourcePath, relation: "equal" },
        message: `Resource parity drift for '${resourcePath}'.`,
        observed: { desktop: desktopValue, web: webValue },
        severity: "error",
      });
    }
  }
  return diagnostics;
}

function compareContacts(
  web: ComparablePlaytestSummary,
  desktop: ComparablePlaytestSummary,
  config: IPlaytestParityCompareConfig["contacts"],
): IPlaytestParityDiagnostic[] {
  if (config === undefined) {
    return [];
  }
  const shared = sharedPassingAssertionCount(web, desktop, "contact.");
  const minSharedCount = config.minSharedCount ?? 1;
  return shared >= minSharedCount
    ? []
    : [{
        code: "TN_GAMEPLAY_PARITY_CONTACT_DRIFT",
        expected: { minSharedCount },
        message: `Shared contact evidence count ${shared} was below required ${minSharedCount}.`,
        observed: { shared },
        severity: "error",
      }];
}

function compareAnimations(
  web: ComparablePlaytestSummary,
  desktop: ComparablePlaytestSummary,
  animations: readonly NonNullable<IPlaytestParityCompareConfig["animation"]>[number][],
): IPlaytestParityDiagnostic[] {
  const diagnostics: IPlaytestParityDiagnostic[] = [];
  for (const animation of animations) {
    const required = animation.requiredOn ?? ["web", "desktop"];
    const webPass = required.includes("web") ? matchingAssertionPasses(web, `animation.${animation.entity}`, animation.clip) : true;
    const desktopPass = required.includes("desktop") ? matchingAssertionPasses(desktop, `animation.${animation.entity}`, animation.clip) : true;
    if (!webPass || !desktopPass) {
      diagnostics.push({
        code: "TN_GAMEPLAY_PARITY_ANIMATION_DRIFT",
        expected: animation,
        message: `Animation parity evidence missing for '${animation.entity}'${animation.clip === undefined ? "" : ` clip '${animation.clip}'`}.`,
        observed: { desktop: desktopPass, web: webPass },
        severity: "error",
      });
    }
  }
  return diagnostics;
}

function compareRuntimeDiagnostics(web: ComparablePlaytestSummary, desktop: ComparablePlaytestSummary): IPlaytestParityDiagnostic[] {
  const errors = [
    ...((web.diagnostics ?? []).filter((diagnostic) => diagnostic.severity === "error").map((diagnostic) => ({ diagnostic, target: "web" }))),
    ...((desktop.diagnostics ?? []).filter((diagnostic) => diagnostic.severity === "error").map((diagnostic) => ({ diagnostic, target: "desktop" }))),
  ];
  return errors.map(({ diagnostic, target }) => ({
    code: "TN_GAMEPLAY_PARITY_RUNTIME_DIAGNOSTIC",
    message: `Runtime diagnostic on ${target}: ${diagnostic.message}`,
    observed: diagnostic,
    severity: "error",
  }));
}

function axisValue(value: unknown, axis: Axis): number | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const index = axis === "x" ? 0 : axis === "y" ? 1 : 2;
  const item = value[index];
  return typeof item === "number" && Number.isFinite(item) ? item : undefined;
}

function resourceValue(summary: ComparablePlaytestSummary, resourcePath: string): unknown {
  const [resourceId, ...path] = resourcePath.split(".");
  if (resourceId === undefined) {
    return undefined;
  }
  return readPath(summary.observations?.resources?.[resourceId]?.after, path);
}

function readPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function sharedPassingAssertionCount(web: ComparablePlaytestSummary, desktop: ComparablePlaytestSummary, prefix: string): number {
  const desktopPassing = new Set((desktop.assertions ?? []).filter((assertion) => assertion.pass && assertion.id.startsWith(prefix)).map((assertion) => assertion.id));
  return (web.assertions ?? []).filter((assertion) => assertion.pass && assertion.id.startsWith(prefix) && desktopPassing.has(assertion.id)).length;
}

function matchingAssertionPasses(summary: ComparablePlaytestSummary, id: string, clip: string | undefined): boolean {
  return (summary.assertions ?? []).some((assertion) =>
    assertion.id === id
    && assertion.pass
    && (clip === undefined || (isRecord(assertion.details) && assertion.details.clip === clip)),
  );
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
