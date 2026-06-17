import type { SchemaVersion } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";

export type AssetReloadSchema = "threenative.asset-reload";
export type AssetReloadClassification = "reloadable" | "rebuildRequired" | "statePreservingReload" | "unsupported";
export type AssetReloadStatePolicy = "preserve" | "rebuild" | "restart";
export type AssetReloadChangeKind =
  | "changed"
  | "groupBarrierFailed"
  | "integrityMismatch"
  | "malformed"
  | "missing"
  | "networkUnavailable"
  | "unsupportedExtension";

export interface IAssetReloadChangeIr {
  assetId: string;
  change: AssetReloadChangeKind;
  path: string;
}

export interface IAssetReloadReportIr {
  changedAssets: readonly IAssetReloadChangeIr[];
  classification: AssetReloadClassification;
  diagnostics: readonly IIrDiagnostic[];
  impactedHandles: readonly string[];
  schema: AssetReloadSchema;
  statePolicy: AssetReloadStatePolicy;
  version: SchemaVersion;
}

export function validateAssetReloadReport(report: IAssetReloadReportIr, path = "asset-reload.json"): IIrDiagnostic[] {
  const diagnostics: IIrDiagnostic[] = [];
  if (report.schema !== "threenative.asset-reload") {
    diagnostics.push({ code: "TN_IR_ASSET_RELOAD_SCHEMA_INVALID", message: "Asset reload report schema must be threenative.asset-reload.", path: `${path}/schema`, severity: "error" });
  }
  if (report.version !== "0.1.0") {
    diagnostics.push({ code: "TN_IR_ASSET_RELOAD_VERSION_INVALID", message: "Asset reload report version must be 0.1.0.", path: `${path}/version`, severity: "error" });
  }
  if (!["reloadable", "rebuildRequired", "statePreservingReload", "unsupported"].includes(report.classification)) {
    diagnostics.push({ code: "TN_IR_ASSET_RELOAD_CLASSIFICATION_INVALID", message: "Asset reload classification is unsupported.", path: `${path}/classification`, severity: "error" });
  }
  if (!["preserve", "rebuild", "restart"].includes(report.statePolicy)) {
    diagnostics.push({ code: "TN_IR_ASSET_RELOAD_STATE_POLICY_INVALID", message: "Asset reload statePolicy must be preserve, rebuild, or restart.", path: `${path}/statePolicy`, severity: "error" });
  }
  if (!Array.isArray(report.changedAssets) || report.changedAssets.length === 0) {
    diagnostics.push({ code: "TN_IR_ASSET_RELOAD_CHANGED_ASSETS_INVALID", message: "Asset reload report must include at least one changed asset.", path: `${path}/changedAssets`, severity: "error" });
  } else {
    report.changedAssets.forEach((asset, index) => validateChangedAsset(asset, `${path}/changedAssets/${index}`, diagnostics));
  }
  if (!Array.isArray(report.impactedHandles)) {
    diagnostics.push({ code: "TN_IR_ASSET_RELOAD_HANDLES_INVALID", message: "Asset reload impactedHandles must be an array.", path: `${path}/impactedHandles`, severity: "error" });
  } else if (report.impactedHandles.some((handle) => typeof handle !== "string" || handle.trim() === "")) {
    diagnostics.push({ code: "TN_IR_ASSET_RELOAD_HANDLE_INVALID", message: "Asset reload impactedHandles must contain non-empty handle ids.", path: `${path}/impactedHandles`, severity: "error" });
  }
  if (!Array.isArray(report.diagnostics)) {
    diagnostics.push({ code: "TN_IR_ASSET_RELOAD_DIAGNOSTICS_INVALID", message: "Asset reload diagnostics must be an array.", path: `${path}/diagnostics`, severity: "error" });
  }
  return diagnostics;
}

function validateChangedAsset(asset: IAssetReloadChangeIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof asset.assetId !== "string" || asset.assetId.trim() === "") {
    diagnostics.push({ code: "TN_IR_ASSET_RELOAD_ASSET_ID_INVALID", message: "Asset reload changed asset id must be non-empty.", path: `${path}/assetId`, severity: "error" });
  }
  if (typeof asset.path !== "string" || asset.path.trim() === "") {
    diagnostics.push({ code: "TN_IR_ASSET_RELOAD_PATH_INVALID", message: "Asset reload changed asset path must be non-empty.", path: `${path}/path`, severity: "error" });
  }
  if (!["changed", "groupBarrierFailed", "integrityMismatch", "malformed", "missing", "networkUnavailable", "unsupportedExtension"].includes(asset.change)) {
    diagnostics.push({ code: "TN_IR_ASSET_RELOAD_CHANGE_INVALID", message: "Asset reload changed asset kind is unsupported.", path: `${path}/change`, severity: "error" });
  }
}
