import type { IRuntimeDiagnostic, IWorldEntity, IWorldIr } from "@threenative/ir";

export interface IWebQueryCombinationObservation {
  a: string;
  b: string;
  order: number;
}

export interface IWebTextInputEvent {
  action: "commit" | "input";
  order: number;
  value: string;
}

export interface IWebWindowPolicyReport {
  diagnostics: IRuntimeDiagnostic[];
  resize: {
    height: number;
    scaleFactor: number;
    width: number;
  };
}

export interface IWebGeneratedAssetPolicyReport {
  assetId: string;
  path: string;
  schema: string;
  status: "bundle-artifact";
}

export function traceWebQueryCombinations(world: IWorldIr, component: string, limit = Number.POSITIVE_INFINITY): IWebQueryCombinationObservation[] {
  const entities = world.entities
    .filter((entity) => hasComponent(entity, component))
    .map((entity) => entity.id)
    .sort();
  const observations: IWebQueryCombinationObservation[] = [];
  for (let left = 0; left < entities.length; left += 1) {
    for (let right = left + 1; right < entities.length; right += 1) {
      if (observations.length >= limit) {
        return observations;
      }
      observations.push({ a: entities[left] ?? "", b: entities[right] ?? "", order: observations.length + 1 });
    }
  }
  return observations;
}

export function traceWebTextInputEvents(values: readonly string[]): IWebTextInputEvent[] {
  return values.map((value, index) => ({
    action: index === values.length - 1 ? "commit" : "input",
    order: index + 1,
    value,
  }));
}

export function reportWebWindowCatalogPolicy(width: number, height: number, scaleFactor: number): IWebWindowPolicyReport {
  return {
    diagnostics: [
      {
        code: "TN_CATALOG_WINDOW_MULTI_WINDOW_UNSUPPORTED",
        message: "Portable runtime bundles are single-window; per-window targets remain diagnostic-only.",
        path: "runtime.config.json/window/multiWindow",
        severity: "error",
        suggestion: "Use one declared primary window and route additional surfaces through portable UI or overlays.",
      },
    ],
    resize: { height, scaleFactor, width },
  };
}

export function reportWebGeneratedAssetPolicy(assetId: string, schema: string): IWebGeneratedAssetPolicyReport {
  return {
    assetId,
    path: `artifacts/generated/${assetId}.json`,
    schema,
    status: "bundle-artifact",
  };
}

function hasComponent(entity: IWorldEntity, component: string): boolean {
  return Object.prototype.hasOwnProperty.call(entity.components, component);
}
