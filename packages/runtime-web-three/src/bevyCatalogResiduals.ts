import { diagnoseBevyCatalogResidualDeclarations, targetProfileOutputDiagnostic, type BevyCatalogTargetProfileOutput, type IIrDiagnostic, type IRuntimeDiagnostic, type IWorldEntity, type IWorldIr } from "@threenative/ir";

export interface IWebQueryCombinationObservation {
  a: string;
  b: string;
  order: number;
}

export interface IWebDisabledEntityQueryParticipationReport {
  entity: string;
  participatesInQueries: boolean;
  policy: "portable-participation-state";
  rendererVisibility: "unchanged";
  schema: "threenative.bevy-catalog.ecs";
  version: "0.1.0";
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
  schema: "threenative.bevy-catalog.window";
  version: "0.1.0";
}

export interface IWebGeneratedAssetPolicyReport {
  assetId: string;
  path: string;
  schema: string;
  status: "bundle-artifact";
}

export interface IWebGltfMetadataTransformPolicyReport {
  extension: string;
  processor: "metadata";
  schema: "threenative.bevy-catalog.assets.gltf-metadata-transform";
  transform: "AnimationGraph";
  version: "0.1.0";
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

export function reportWebDisabledEntityQueryParticipation(entity: string, participatesInQueries: boolean): IWebDisabledEntityQueryParticipationReport {
  return {
    entity,
    participatesInQueries,
    policy: "portable-participation-state",
    rendererVisibility: "unchanged",
    schema: "threenative.bevy-catalog.ecs",
    version: "0.1.0",
  };
}

export function traceWebTextInputEvents(values: readonly string[]): IWebTextInputEvent[] {
  return values.map((value, index) => ({
    action: index === values.length - 1 ? "commit" : "input",
    order: index + 1,
    value,
  }));
}

export function reportWebWindowCatalogPolicy(width: number, height: number, scaleFactor: number): IWebWindowPolicyReport {
  const diagnostics = diagnoseBevyCatalogResidualDeclarations({
    uiWindow: {
      windowPolicy: {
        clearColorRuntimeUpdate: true,
        cursorImage: "assets/cursor.png",
        lowPowerPresentMode: true,
        multiWindow: true,
      },
    },
  }).map((diagnostic) => ({ ...diagnostic, severity: diagnostic.severity ?? "error" } as IRuntimeDiagnostic));
  return {
    diagnostics,
    resize: { height, scaleFactor, width },
    schema: "threenative.bevy-catalog.window",
    version: "0.1.0",
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

export function reportWebGltfMetadataTransformPolicy(extension: string, transform: "AnimationGraph"): IWebGltfMetadataTransformPolicyReport {
  return {
    extension,
    processor: "metadata",
    schema: "threenative.bevy-catalog.assets.gltf-metadata-transform",
    transform,
    version: "0.1.0",
  };
}

export function reportWebTargetProfileOutputDiagnostic(output: BevyCatalogTargetProfileOutput, targets: readonly string[], path = "target.profile.json/targets"): IIrDiagnostic {
  return targetProfileOutputDiagnostic(output, output === "web" ? "web" : "desktop", targets, path);
}

function hasComponent(entity: IWorldEntity, component: string): boolean {
  return Object.prototype.hasOwnProperty.call(entity.components, component);
}
