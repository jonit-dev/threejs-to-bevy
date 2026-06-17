import type { IAssetReloadReportIr } from "@threenative/ir";

export function observeWebAssetReload(report: IAssetReloadReportIr): IAssetReloadReportIr {
  return {
    ...report,
    changedAssets: [...report.changedAssets].sort((left, right) => left.assetId.localeCompare(right.assetId)),
    diagnostics: [...report.diagnostics].sort((left, right) => left.code.localeCompare(right.code)),
    impactedHandles: [...report.impactedHandles].sort((left, right) => left.localeCompare(right)),
  };
}
