import type { IGameWorkflowReport } from "@threenative/authoring";

export interface IProductionPanelRow {
  action?: {
    command: string;
    kind: "cli-json";
    safe: boolean;
  };
  artifactPath?: string;
  code?: string;
  command?: string;
  id: string;
  message: string;
  score: number;
  status: "blocked" | "pass" | "warning";
}

export interface IProductionPanelTaskGraph {
  diagnostics?: Array<{ code?: string; message?: string; severity?: string }>;
  recommendations?: Array<{ command?: string; expectedProof?: string; id?: string; summary?: string }>;
}

export interface IProductionPanelProofFreshness {
  diagnostics?: Array<{ code?: string; message?: string; severity?: string }>;
  fresh?: boolean;
  recommendations?: Array<{ command?: string; id?: string; reason?: string }>;
}

export interface IProductionPanelModel {
  blocked: number;
  proofFresh: boolean | null;
  rows: IProductionPanelRow[];
  status: "blocked" | "pass" | "warning";
  summary: string;
}

export function createProductionPanelModel(
  report: IGameWorkflowReport,
  options: { proofFreshness?: IProductionPanelProofFreshness; taskGraph?: IProductionPanelTaskGraph } = {},
): IProductionPanelModel {
  const rows: IProductionPanelRow[] = report.phaseLedgers.map((phase) => {
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
  rows.push(...taskGraphRows(options.taskGraph));
  rows.push(...proofRows(options.proofFreshness));
  const blocked = rows.filter((row) => row.status === "blocked").length;
  return {
    blocked,
    proofFresh: options.proofFreshness?.fresh ?? null,
    rows,
    status: blocked > 0 ? "blocked" : rows.some((row) => row.status === "warning") ? "warning" : "pass",
    summary: `${report.summary.phasesPassed}/${report.summary.totalPhases} phases passed, ${report.summary.uiStatesCovered} UI states covered`,
  };
}

function taskGraphRows(taskGraph: IProductionPanelTaskGraph | undefined): IProductionPanelRow[] {
  if (taskGraph === undefined) {
    return [];
  }
  return (taskGraph.recommendations ?? []).slice(0, 5).map((recommendation) => ({
    ...(recommendation.command === undefined ? {} : { action: safeCliAction(recommendation.command) }),
    artifactPath: recommendation.expectedProof,
    command: recommendation.command,
    id: recommendation.id ?? "task.next",
    message: recommendation.summary ?? recommendation.command ?? "Next production task",
    score: 0,
    status: (taskGraph.diagnostics ?? []).some((diagnostic) => diagnostic.severity === "error") ? "blocked" : "warning",
  }));
}

function proofRows(proofFreshness: IProductionPanelProofFreshness | undefined): IProductionPanelRow[] {
  if (proofFreshness === undefined || proofFreshness.fresh === true) {
    return [];
  }
  if ((proofFreshness.recommendations ?? []).length === 0 && (proofFreshness.diagnostics ?? []).length === 0) {
    return [];
  }
  return (proofFreshness.recommendations ?? []).slice(0, 5).map((recommendation) => ({
    ...(recommendation.command === undefined ? {} : { action: safeCliAction(recommendation.command) }),
    command: recommendation.command,
    id: recommendation.id ?? "proof.changed",
    message: recommendation.reason ?? recommendation.command ?? "Refresh stale proof",
    score: 0,
    status: "warning",
  }));
}

function safeCliAction(command: string): IProductionPanelRow["action"] {
  return {
    command,
    kind: "cli-json",
    safe: command.startsWith("tn ") && command.includes("--json"),
  };
}
