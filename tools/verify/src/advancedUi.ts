import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface IAdvancedUiArtifactReport {
  fitViolations: IAdvancedUiFitViolation[];
  missing: string[];
  ok: boolean;
  parityViolations: IAdvancedUiParityViolation[];
  required: string[];
}

export interface IAdvancedUiFitViolation {
  category: "clipping" | "missingFocus" | "overlap" | "unsafeArea";
  file: string;
  node?: string;
}

export interface IAdvancedUiParityViolation {
  category: "artifact" | "metric" | "status";
  file: string;
  message: string;
}

const requiredAdvancedUiArtifacts = [
  "artifacts/advanced-ui/screenshots/desktop.png",
  "artifacts/advanced-ui/screenshots/mobile.png",
  "artifacts/advanced-ui/accessibility/desktop.json",
  "artifacts/advanced-ui/accessibility/mobile.json",
  "artifacts/advanced-ui/fit/desktop.json",
  "artifacts/advanced-ui/fit/mobile.json",
  "artifacts/advanced-ui/visual-parity/effects.json",
  "artifacts/advanced-ui/visual-parity/attachments.json",
];

export async function verifyAdvancedUiArtifacts(projectPath: string): Promise<IAdvancedUiArtifactReport> {
  const missing: string[] = [];
  const fitViolations: IAdvancedUiFitViolation[] = [];
  const parityViolations: IAdvancedUiParityViolation[] = [];
  for (const artifact of requiredAdvancedUiArtifacts) {
    try {
      await access(join(projectPath, artifact));
    } catch {
      missing.push(artifact);
    }
  }
  for (const artifact of requiredAdvancedUiArtifacts.filter((item) => item.includes("/fit/") && !missing.includes(item))) {
    fitViolations.push(...(await readFitViolations(projectPath, artifact)));
  }
  for (const artifact of requiredAdvancedUiArtifacts.filter((item) => item.includes("/visual-parity/") && !missing.includes(item))) {
    parityViolations.push(...(await readParityViolations(projectPath, artifact)));
  }
  return { fitViolations, missing, ok: missing.length === 0 && fitViolations.length === 0 && parityViolations.length === 0, parityViolations, required: [...requiredAdvancedUiArtifacts] };
}

async function readFitViolations(projectPath: string, artifact: string): Promise<IAdvancedUiFitViolation[]> {
  const raw = await readFile(join(projectPath, artifact), "utf8");
  const report = JSON.parse(raw) as unknown;
  if (!isRecord(report)) {
    return [{ category: "clipping", file: artifact }];
  }
  const violations: IAdvancedUiFitViolation[] = [];
  for (const category of ["clipping", "missingFocus", "overlap", "unsafeArea"] as const) {
    for (const node of readViolationNodes(report[category])) {
      violations.push({ category, file: artifact, ...(node === undefined ? {} : { node }) });
    }
  }
  return violations;
}

function readViolationNodes(value: unknown): Array<string | undefined> {
  if (!Array.isArray(value)) {
    return value === undefined ? [] : [undefined];
  }
  return value.length === 0 ? [] : value.map((item) => (isRecord(item) && typeof item.node === "string" ? item.node : typeof item === "string" ? item : undefined));
}

async function readParityViolations(projectPath: string, artifact: string): Promise<IAdvancedUiParityViolation[]> {
  const raw = await readFile(join(projectPath, artifact), "utf8");
  const report = JSON.parse(raw) as unknown;
  if (!isRecord(report)) {
    return [{ category: "status", file: artifact, message: "Visual parity report must be an object." }];
  }
  const violations: IAdvancedUiParityViolation[] = [];
  if (report.status !== "pass") {
    violations.push({ category: "status", file: artifact, message: "Visual parity report status must be pass." });
  }
  if (report.visualParity !== "asserted") {
    violations.push({ category: "status", file: artifact, message: "Visual parity must be asserted, not report-only." });
  }
  const artifacts = isRecord(report.artifacts) ? report.artifacts : {};
  for (const key of ["webScreenshot", "bevyScreenshot", "contactSheet"]) {
    const value = artifacts[key];
    if (typeof value !== "string" || value.trim() === "") {
      violations.push({ category: "artifact", file: artifact, message: `Visual parity report must include artifacts.${key}.` });
    } else {
      try {
        await access(join(projectPath, value));
      } catch {
        violations.push({ category: "artifact", file: artifact, message: `Visual parity artifact does not exist: ${value}.` });
      }
    }
  }
  const metrics = isRecord(report.metrics) ? report.metrics : {};
  const thresholds = isRecord(report.thresholds) ? report.thresholds : {};
  for (const key of ["changedPixelRatio", "averageBrightnessDelta", "p95ChannelDelta"]) {
    const metric = metrics[key];
    const threshold = thresholds[key];
    if (typeof metric !== "number" || !Number.isFinite(metric) || typeof threshold !== "number" || !Number.isFinite(threshold)) {
      violations.push({ category: "metric", file: artifact, message: `Visual parity report must include finite metrics.${key} and thresholds.${key}.` });
    } else if (metric > threshold) {
      violations.push({ category: "metric", file: artifact, message: `Visual parity metric ${key}=${metric} exceeds threshold ${threshold}.` });
    }
  }
  return violations;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
