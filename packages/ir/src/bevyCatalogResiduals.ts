import type { IIrDiagnostic } from "./validate.js";

export type BevyCatalogResidualArea = "assets" | "ecs" | "geometry" | "materials" | "rendering" | "ui-window";
export type BevyCatalogResidualStatus = "diagnostic-only" | "promoted" | "watchlist";
export type BevyCatalogTargetProfileOutput = "offline" | "package" | "web" | "native";

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
  transform?: string;
}

export interface IBevyCatalogTargetProfileDeclaration {
  output: BevyCatalogTargetProfileOutput;
  path?: string;
  targets: readonly string[];
}

export interface IBevyCatalogResidualDeclarations {
  assets?: {
    exports?: readonly IBevyCatalogAssetExportDeclaration[];
    gltfExtensions?: readonly IBevyCatalogGltfExtensionDeclaration[];
    targetProfiles?: readonly IBevyCatalogTargetProfileDeclaration[];
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

export const SHARED_RESIDUAL_CONTRACT_ROWS: readonly IBevyCatalogResidualRow[] = [
  row("ecs.callback-components", "ecs", "diagnostic-only", [
    "callbacks are named instead of closure-valued",
    "component access permissions are declared",
    "schedule order is deterministic",
  ], ["TN_CATALOG_ECS_CALLBACK_PERMISSION_MISSING"]),
  row("ecs.delayed-commands", "ecs", "promoted", [
    "commands are represented by fixed-trace tasks and channels",
    "arbitrary deferred closures are rejected",
  ], ["TN_CATALOG_ECS_DELAYED_COMMAND_UNSUPPORTED"], ["systems.fixed-trace-tasks-and-channels"]),
  row("ecs.query-combinations", "ecs", "promoted", [
    "pairwise iteration uses deterministic entity-id ordering",
    "iteration limits are explicit",
  ], [], ["web.query-combination-order", "bevy.query-combination-order"]),
  row("ecs.entity-disabling", "ecs", "promoted", [
    "portable participation state is distinct from renderer visibility",
    "raw Bevy Disabled component semantics are not exposed directly",
  ], ["TN_CATALOG_ECS_ENTITY_DISABLE_UNSUPPORTED"], ["web.disabled-entity-query-participation", "bevy.disabled-entity-query-participation"]),
  row("ui.editable-text", "ui-window", "watchlist", [
    "value and action events preserve order",
    "IME composition support is target-profile explicit",
  ], [], ["web.text-input-event-order"]),
  row("ui.ime-composition", "ui-window", "diagnostic-only", [
    "unsupported text composition targets fail with target-profile diagnostics",
  ], ["TN_CATALOG_UI_IME_TARGET_UNSUPPORTED"]),
  row("ui.viewport-nodes", "ui-window", "diagnostic-only", [
    "picking and input routing are deterministic in web and native reports",
  ], ["TN_CATALOG_UI_VIEWPORT_ROUTING_UNSUPPORTED"]),
  row("ui.drag-drop-nodes", "ui-window", "diagnostic-only", [
    "node drag payloads are separate from world picking drags",
  ], ["TN_CATALOG_UI_DRAG_DROP_ROUTING_UNSUPPORTED"]),
  row("ui.custom-materials", "ui-window", "diagnostic-only", [
    "custom shaders remain rejected unless bounded presets exist in both runtimes",
  ], ["TN_CATALOG_UI_CUSTOM_MATERIAL_UNSUPPORTED"]),
  row("window.resize-scale", "ui-window", "promoted", [
    "web runtime reports resize width, height, and scale factor",
    "Bevy runtime reports resize width, height, and scale factor",
    "multi-window policy remains a separate diagnostic boundary",
  ], [], ["web.window-resize-scale", "bevy.window-resize-scale"]),
  row("window.policy", "ui-window", "diagnostic-only", [
    "cursor, power, clear-color, and multi-window policies are explicit diagnostics",
  ], [
    "TN_CATALOG_WINDOW_CLEAR_COLOR_RUNTIME_UNSUPPORTED",
    "TN_CATALOG_WINDOW_CURSOR_UNSUPPORTED",
    "TN_CATALOG_WINDOW_MULTI_WINDOW_UNSUPPORTED",
    "TN_CATALOG_WINDOW_POWER_POLICY_UNSUPPORTED",
  ]),
  row("geometry.advanced-deformation-csg", "geometry", "diagnostic-only", [
    "deformation and boolean operations use a bounded shared geometry declaration",
    "web and native adapters report matching generated topology and bounds",
  ], ["TN_IR_RENDERER_PLUGIN_UNSUPPORTED"]),
  row("geometry.storage-buffer", "geometry", "diagnostic-only", [
    "storage layout and mutation timing are portable across web and native runtimes",
  ], ["TN_IR_RENDERER_PLUGIN_UNSUPPORTED"]),
  row("materials.lightmaps", "materials", "diagnostic-only", [
    "static lightmap metadata and mixed-lighting policy have matching adapter evidence",
  ], ["TN_IR_MATERIAL_LIGHTMAP_UNSUPPORTED"]),
  row("materials.parallax", "materials", "diagnostic-only", [
    "height/depth texture semantics and tangent requirements are shared and bounded",
  ], ["TN_IR_MATERIAL_PARALLAX_UNSUPPORTED"]),
  row("materials.advanced-pbr", "materials", "diagnostic-only", [
    "the promoted PBR subset maps to both adapters with material probe evidence",
  ], ["TN_IR_MATERIAL_ADVANCED_PBR_UNSUPPORTED"]),
  row("rendering.advanced-features", "rendering", "diagnostic-only", [
    "the feature has a bounded renderer intent and matching web/native observations",
  ], ["TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED"]),
  row("rendering.ssgi-color-bleed", "rendering", "watchlist", [
    "web proves on-screen indirect diffuse and color-bleed hue",
    "Bevy reports an SSAO plus ambient/environment irradiance approximation",
    "native emissive-bleed hue remains a classified residual",
  ], [], ["web.ssgi-color-bleed", "bevy.ssgi-ambient-approximation"]),
  row("rendering.custom-post", "rendering", "diagnostic-only", [
    "post effects use a shared preset with matching cross-adapter evidence",
  ], ["TN_IR_RENDERER_POST_EFFECT_UNSUPPORTED"]),
  row("assets.runtime-export", "assets", "diagnostic-only", [
    "exports stay under declared bundle artifact roots",
    "arbitrary filesystem writes are rejected",
  ], ["TN_CATALOG_ASSET_EXPORT_ROOT_UNSUPPORTED"]),
  row("assets.generated-persistence", "assets", "promoted", [
    "generated asset payloads are schema-backed",
    "manifest entries identify generated asset ids and schemas",
  ], [], ["compiler.generated-asset-manifest-entry", "web.generated-asset-policy", "bevy.generated-asset-policy"]),
  row("assets.gltf-extension-processing", "assets", "diagnostic-only", [
    "known metadata transforms may be declared",
    "executable/custom processors are rejected",
  ], ["TN_CATALOG_GLTF_EXTENSION_PROCESSOR_UNSUPPORTED", "TN_CATALOG_GLTF_METADATA_TRANSFORM_UNSUPPORTED"], ["web.gltf-metadata-transform-policy", "bevy.gltf-metadata-transform-policy"]),
  row("assets.target-profile-diagnostics", "assets", "promoted", [
    "web outputs require a web target profile",
    "offline, native, and package outputs require a desktop target profile",
    "diagnostics preserve output target and profile path",
  ], ["TN_CATALOG_TARGET_PROFILE_OUTPUT_UNSUPPORTED"], ["ir.target-profile-output-diagnostics", "web.target-profile-output-diagnostics", "bevy.target-profile-output-diagnostics", "cli.package-target-profile-diagnostics"]),
];

// Compatibility name for the original upstream-catalog audit surface.
export const BEVY_CATALOG_RESIDUAL_ROWS = SHARED_RESIDUAL_CONTRACT_ROWS;

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
    if (extension.processor === "metadata" && extension.transform !== undefined && !isKnownGltfMetadataTransform(extension.transform)) {
      diagnostics.push({
        code: "TN_CATALOG_GLTF_METADATA_TRANSFORM_UNSUPPORTED",
        message: `glTF extension '${extension.extension}' declares unknown metadata transform '${extension.transform}'.`,
        path: extension.path ?? `${path}/assets/gltfExtensions/${index}/transform`,
        severity: "error",
        suggestion: "Use the promoted AnimationGraph metadata transform or keep the import target-specific.",
      });
    }
  });

  declarations.assets?.targetProfiles?.forEach((profile, index) => {
    const requiredTarget = requiredTargetForOutput(profile.output);
    if (!profile.targets.includes(requiredTarget)) {
      diagnostics.push(targetProfileOutputDiagnostic(profile.output, requiredTarget, profile.targets, profile.path ?? `${path}/assets/targetProfiles/${index}/targets`));
    }
  });

  return diagnostics;
}

export function targetProfileOutputDiagnostic(
  output: BevyCatalogTargetProfileOutput,
  requiredTarget: "desktop" | "web",
  targets: readonly string[],
  path: string,
): IIrDiagnostic {
  return {
    code: "TN_CATALOG_TARGET_PROFILE_OUTPUT_UNSUPPORTED",
    message: `Target profile for '${output}' output must include '${requiredTarget}'.`,
    path,
    severity: "error",
    suggestion: requiredTarget === "web"
      ? "Add 'web' to target.profile.json targets or choose a non-web output."
      : "Add 'desktop' to target.profile.json targets for offline, native, or package outputs.",
    target: output,
    value: targets.join(","),
  };
}

export function residualDiagnosticCode(rowId: string): string {
  const row = SHARED_RESIDUAL_CONTRACT_ROWS.find((candidate) => candidate.id === rowId);
  if (row === undefined) {
    throw new Error(`Unknown residual contract row '${rowId}'.`);
  }
  if (row.diagnosticCodes.length !== 1 || row.diagnosticCodes[0] === undefined) {
    throw new Error(`Residual contract row '${rowId}' must own exactly one diagnostic code.`);
  }
  return row.diagnosticCodes[0];
}

function requiredTargetForOutput(output: BevyCatalogTargetProfileOutput): "desktop" | "web" {
  return output === "web" ? "web" : "desktop";
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

function isKnownGltfMetadataTransform(transform: string): boolean {
  return transform === "AnimationGraph";
}
