import type { IGameWorkflowReport } from "@threenative/authoring";

export interface IProductionPanelRow {
  artifactPath?: string;
  code?: string;
  id: string;
  message: string;
  score: number;
  status: "blocked" | "pass" | "warning";
}

export interface IProductionPanelModel {
  blocked: number;
  rows: IProductionPanelRow[];
  status: "blocked" | "pass" | "warning";
  summary: string;
}

export function createProductionPanelModel(report: IGameWorkflowReport): IProductionPanelModel {
  const rows = report.phaseLedgers.map((phase) => {
    const diagnostic = phase.diagnostics[0];
    const evidence = phase.evidence[0];
    return {
      artifactPath: evidence?.path,
      code: diagnostic?.code,
      id: phase.id,
      message: diagnostic?.message ?? phase.summary,
      score: phase.score,
      status: phase.status,
    };
  });
  const blocked = rows.filter((row) => row.status === "blocked").length;
  return {
    blocked,
    rows,
    status: blocked > 0 ? "blocked" : rows.some((row) => row.status === "warning") ? "warning" : "pass",
    summary: `${report.summary.phasesPassed}/${report.summary.totalPhases} phases passed, ${report.summary.uiStatesCovered} UI states covered`,
  };
}
