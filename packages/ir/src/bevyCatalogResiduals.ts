import type { IIrDiagnostic } from "./validate.js";

export type BevyCatalogResidualArea = "assets" | "ecs" | "ui-window";
export type BevyCatalogResidualStatus = "diagnostic-only" | "promoted" | "watchlist";

export interface IBevyCatalogResidualRow {
  area: BevyCatalogResidualArea;
  baseline: "bevy-0.14.2" | "upstream-unverified";
  diagnosticCodes: readonly string[];
  id: string;
  promotionCriteria: readonly string[];
  reportEvidence: readonly string[];
  status: BevyCatalogResidualStatus;
}

export interface IBevyCatalogCallbackComponentDeclaration {
  callback: string;
  component: string;
  path?: string;
  permissions?: readonly string[];
}

export interface IBevyCatalogImeDeclaration {
  targetProfile: "bevy-native" | "web" | "web-no-composition";
  path?: string;
}

export interface IBevyCatalogUiRoutingDeclaration {
  deterministic: boolean;
  path?: string;
}

export interface IBevyCatalogCustomUiMaterialDeclaration {
  id: string;
  path?: string;
  shader: "custom" | "preset";
}

export interface IBevyCatalogWindowPolicyDeclaration {
  clearColorRuntimeUpdate?: boolean;
  cursorImage?: string;
  lowPowerPresentMode?: boolean;
  multiWindow?: boolean;
  path?: string;
}

export interface IBevyCatalogAssetExportDeclaration {
  artifactRoot: string;
  id: string;
  path: string;
}

export interface IBevyCatalogGltfExtensionDeclaration {
  extension: string;
  path?: string;
  processor: "executable" | "metadata";
}

export interface IBevyCatalogResidualDeclarations {
  assets?: {
    exports?: readonly IBevyCatalogAssetExportDeclaration[];
    gltfExtensions?: readonly IBevyCatalogGltfExtensionDeclaration[];
  };
  ecs?: {
    callbackComponents?: readonly IBevyCatalogCallbackComponentDeclaration[];
    delayedCommands?: readonly { kind: "closure" | "fixed-trace-task"; path?: string }[];
    entityDisabling?: readonly { mode: "portable-participation-state" | "raw-bevy-disabled"; path?: string }[];
  };
  uiWindow?: {
    customMaterials?: readonly IBevyCatalogCustomUiMaterialDeclaration[];
    dragDropNodes?: IBevyCatalogUiRoutingDeclaration;
    ime?: IBevyCatalogImeDeclaration;
    viewportNodes?: IBevyCatalogUiRoutingDeclaration;
    windowPolicy?: IBevyCatalogWindowPolicyDeclaration;
  };
}

export const BEVY_CATALOG_RESIDUAL_ROWS: readonly IBevyCatalogResidualRow[] = [
  row("ecs.callback-components", "ecs", "diagnostic-only", [
    "callbacks are named instead of closure-valued",
    "component access permissions are declared",
    "schedule order is deterministic",
  ], ["TN_CATALOG_ECS_CALLBACK_PERMISSION_MISSING"]),
  row("ecs.delayed-commands", "ecs", "promoted", [
    "commands are represented by fixed-trace tasks and channels",
    "arbitrary deferred closures are rejected",
  ], ["TN_CATALOG_ECS_DELAYED_COMMAND_UNSUPPORTED"], ["systems.fixed-trace-tasks-and-channels"]),
  row("ecs.query-combinations", "ecs", "watchlist", [
    "pairwise iteration uses deterministic entity-id ordering",
    "iteration limits are explicit",
  ], [], ["web.query-combination-order"]),
  row("ecs.entity-disabling", "ecs", "diagnostic-only", [
    "portable participation state is distinct from renderer visibility",
    "raw Bevy Disabled component semantics are not exposed directly",
  ], ["TN_CATALOG_ECS_ENTITY_DISABLE_UNSUPPORTED"], ["bevy.disabled-entity-query-participation"]),
  row("ui.editable-text", "ui-window", "watchlist", [
    "value and action events preserve order",
    "IME composition support is target-profile explicit",
  ], [], ["web.text-input-event-order"]),
  row("ui.ime-composition", "ui-window", "diagnostic-only", [
    "unsupported text composition targets fail with target-profile diagnostics",
  ], ["TN_CATALOG_UI_IME_TARGET_UNSUPPORTED"]),
  row("ui.viewport-nodes", "ui-window", "watchlist", [
    "picking and input routing are deterministic in web and native reports",
  ], ["TN_CATALOG_UI_VIEWPORT_ROUTING_UNSUPPORTED"]),
  row("ui.drag-drop-nodes", "ui-window", "watchlist", [
    "node drag payloads are separate from world picking drags",
  ], ["TN_CATALOG_UI_DRAG_DROP_ROUTING_UNSUPPORTED"]),
  row("ui.custom-materials", "ui-window", "diagnostic-only", [
    "custom shaders remain rejected unless bounded presets exist in both runtimes",
  ], ["TN_CATALOG_UI_CUSTOM_MATERIAL_UNSUPPORTED"]),
  row("window.policy", "ui-window", "diagnostic-only", [
    "resize and scale-factor observations are reportable",
    "cursor, power, clear-color, and multi-window policies are explicit diagnostics",
  ], [
    "TN_CATALOG_WINDOW_CLEAR_COLOR_RUNTIME_UNSUPPORTED",
    "TN_CATALOG_WINDOW_CURSOR_UNSUPPORTED",
    "TN_CATALOG_WINDOW_MULTI_WINDOW_UNSUPPORTED",
    "TN_CATALOG_WINDOW_POWER_POLICY_UNSUPPORTED",
  ], ["web.window-resize-scale", "bevy.window-resize-scale"]),
  row("assets.runtime-export", "assets", "diagnostic-only", [
    "exports stay under declared bundle artifact roots",
    "arbitrary filesystem writes are rejected",
  ], ["TN_CATALOG_ASSET_EXPORT_ROOT_UNSUPPORTED"]),
  row("assets.generated-persistence", "assets", "watchlist", [
    "generated asset payloads are schema-backed",
    "manifest entries identify generated asset ids and schemas",
  ], [], ["compiler.generated-asset-manifest-entry", "web.generated-asset-policy", "bevy.generated-asset-policy"]),
  row("assets.gltf-extension-processing", "assets", "diagnostic-only", [
    "metadata transforms may be declared",
    "executable/custom processors are rejected",
  ], ["TN_CATALOG_GLTF_EXTENSION_PROCESSOR_UNSUPPORTED"]),
];

export function diagnoseBevyCatalogResidualDeclarations(
  declarations: IBevyCatalogResidualDeclarations,
  path = "bevy-catalog-residuals.json",
): IIrDiagnostic[] {
  const diagnostics: IIrDiagnostic[] = [];
  declarations.ecs?.callbackComponents?.forEach((callback, index) => {
    const permissions = callback.permissions ?? [];
    if (permissions.length === 0) {
      diagnostics.push({
        code: "TN_CATALOG_ECS_CALLBACK_PERMISSION_MISSING",
        message: `Callback component '${callback.component}.${callback.callback}' must declare portable permissions.`,
        path: callback.path ?? `${path}/ecs/callbackComponents/${index}/permissions`,
        severity: "error",
        suggestion: "Declare read/write/event permissions or replace the callback with a scheduled system.",
      });
    }
  });
  declarations.ecs?.delayedCommands?.forEach((command, index) => {
    if (command.kind === "closure") {
      diagnostics.push({
        code: "TN_CATALOG_ECS_DELAYED_COMMAND_UNSUPPORTED",
        message: "Delayed command closures are outside the portable ECS schedule contract.",
        path: command.path ?? `${path}/ecs/delayedCommands/${index}/kind`,
        severity: "error",
        suggestion: "Use fixed-trace tasks and channels for bounded delayed behavior.",
      });
    }
  });
  declarations.ecs?.entityDisabling?.forEach((declaration, index) => {
    if (declaration.mode === "raw-bevy-disabled") {
      diagnostics.push({
        code: "TN_CATALOG_ECS_ENTITY_DISABLE_UNSUPPORTED",
        message: "Raw Bevy entity disabling is not exposed directly in portable IR.",
        path: declaration.path ?? `${path}/ecs/entityDisabling/${index}/mode`,
        severity: "error",
        suggestion: "Use a portable participation component/tag or scene activation state.",
      });
    }
  });

  const ime = declarations.uiWindow?.ime;
  if (ime !== undefined && ime.targetProfile === "web-no-composition") {
    diagnostics.push({
      code: "TN_CATALOG_UI_IME_TARGET_UNSUPPORTED",
      message: "IME composition requires a target profile with text composition support.",
      path: ime.path ?? `${path}/uiWindow/ime/targetProfile`,
      severity: "error",
      suggestion: "Gate IME composition behind a supported web/native profile or use ordered value/action events only.",
      target: ime.targetProfile,
    });
  }
  diagnoseRouting(declarations.uiWindow?.viewportNodes, "TN_CATALOG_UI_VIEWPORT_ROUTING_UNSUPPORTED", "UI viewport nodes require deterministic picking and input routing before promotion.", `${path}/uiWindow/viewportNodes`, diagnostics);
  diagnoseRouting(declarations.uiWindow?.dragDropNodes, "TN_CATALOG_UI_DRAG_DROP_ROUTING_UNSUPPORTED", "UI drag-and-drop nodes require deterministic payload and target routing before promotion.", `${path}/uiWindow/dragDropNodes`, diagnostics);
  declarations.uiWindow?.customMaterials?.forEach((material, index) => {
    if (material.shader === "custom") {
      diagnostics.push({
        code: "TN_CATALOG_UI_CUSTOM_MATERIAL_UNSUPPORTED",
        message: `Custom UI material '${material.id}' requires a bounded cross-runtime preset before promotion.`,
        path: material.path ?? `${path}/uiWindow/customMaterials/${index}/shader`,
        severity: "error",
        suggestion: "Use promoted UI material presets or keep custom shaders behind target-specific adapters.",
      });
    }
  });
  const windowPolicy = declarations.uiWindow?.windowPolicy;
  if (windowPolicy?.cursorImage !== undefined) {
    diagnostics.push(policyDiagnostic("TN_CATALOG_WINDOW_CURSOR_UNSUPPORTED", "Custom cursor images and cursor animation are diagnostic-only until a portable cursor policy exists.", windowPolicy.path ?? `${path}/uiWindow/windowPolicy/cursorImage`));
  }
  if (windowPolicy?.lowPowerPresentMode === true) {
    diagnostics.push(policyDiagnostic("TN_CATALOG_WINDOW_POWER_POLICY_UNSUPPORTED", "Low-power present mode and background throttling are host policies outside the portable runtime contract.", windowPolicy.path ?? `${path}/uiWindow/windowPolicy/lowPowerPresentMode`));
  }
  if (windowPolicy?.clearColorRuntimeUpdate === true) {
    diagnostics.push(policyDiagnostic("TN_CATALOG_WINDOW_CLEAR_COLOR_RUNTIME_UNSUPPORTED", "Runtime clear-color/window background mutation is not promoted without shared web/native observation evidence.", windowPolicy.path ?? `${path}/uiWindow/windowPolicy/clearColorRuntimeUpdate`));
  }
  if (windowPolicy?.multiWindow === true) {
    diagnostics.push(policyDiagnostic("TN_CATALOG_WINDOW_MULTI_WINDOW_UNSUPPORTED", "Portable runtime bundles are single-window; per-window targets remain diagnostic-only.", windowPolicy.path ?? `${path}/uiWindow/windowPolicy/multiWindow`));
  }

  declarations.assets?.exports?.forEach((assetExport, index) => {
    if (!isUnderRoot(assetExport.path, assetExport.artifactRoot)) {
      diagnostics.push({
        code: "TN_CATALOG_ASSET_EXPORT_ROOT_UNSUPPORTED",
        message: `Asset export '${assetExport.id}' must stay under declared artifact root '${assetExport.artifactRoot}'.`,
        path: `${path}/assets/exports/${index}/path`,
        severity: "error",
        suggestion: "Write generated artifacts inside the emitted bundle artifact root.",
      });
    }
  });

  declarations.assets?.gltfExtensions?.forEach((extension, index) => {
    if (extension.processor === "executable") {
      diagnostics.push({
        code: "TN_CATALOG_GLTF_EXTENSION_PROCESSOR_UNSUPPORTED",
        message: `glTF extension '${extension.extension}' uses an executable processor outside the portable import policy.`,
        path: extension.path ?? `${path}/assets/gltfExtensions/${index}/processor`,
        severity: "error",
        suggestion: "Use schema-backed metadata transforms such as declared AnimationGraph import metadata.",
      });
    }
  });

  return diagnostics;
}

function diagnoseRouting(
  declaration: IBevyCatalogUiRoutingDeclaration | undefined,
  code: string,
  message: string,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (declaration !== undefined && !declaration.deterministic) {
    diagnostics.push({
      code,
      message,
      path: declaration.path ?? path,
      severity: "error",
      suggestion: "Keep the feature diagnostic-only until web and native reports prove identical routing.",
    });
  }
}

function policyDiagnostic(code: string, message: string, path: string): IIrDiagnostic {
  return {
    code,
    message,
    path,
    severity: "error",
    suggestion: "Use the portable primary-window runtime configuration or a target-specific adapter.",
  };
}

function row(
  id: string,
  area: BevyCatalogResidualArea,
  status: BevyCatalogResidualStatus,
  promotionCriteria: readonly string[],
  diagnosticCodes: readonly string[] = [],
  reportEvidence: readonly string[] = [],
): IBevyCatalogResidualRow {
  return { area, baseline: "bevy-0.14.2", diagnosticCodes, id, promotionCriteria, reportEvidence, status };
}

function isUnderRoot(path: string, root: string): boolean {
  const normalizedPath = path.replaceAll("\\", "/").replace(/^\.\/+/, "");
  const normalizedRoot = root.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}
