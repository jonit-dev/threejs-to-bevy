import { access } from "node:fs/promises";
import type { IV3EnvironmentReport } from "./v3Environment.js";

export async function verifyV3VisualPerformance(report: IV3EnvironmentReport): Promise<IV3EnvironmentReport> {
  await access(report.artifacts.metricsPath);
  await access(report.artifacts.rawSamplesPath);
  return report;
}
