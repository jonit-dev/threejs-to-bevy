import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildProject, loadProjectConfig, validateBundle } from "@threenative/compiler";
import { startWebPreview, type IWebPreviewServer } from "@threenative/runtime-web-three";

import { verifyWebPreview, type IPlaywrightVerifyOptions } from "./playwright.js";
import type { IVerificationReport } from "./report.js";

export interface IV4ScriptingReport {
  artifacts: {
    effectLogPath?: string;
    reportPath: string;
    webReportPath: string;
  };
  diagnostics: IVerificationReport["diagnostics"];
  status: IVerificationReport["status"];
  visual: IVerificationReport["checks"];
}

export interface IV4ScriptingVerifyOptions {
  artifactDir: string;
  expectedMotion?: boolean;
  frames?: number;
  previewVerifier?: (options: IPlaywrightVerifyOptions) => Promise<IVerificationReport>;
  projectPath: string;
}

export async function verifyV4Scripting(options: IV4ScriptingVerifyOptions): Promise<IV4ScriptingReport> {
  const artifactDir = resolve(options.artifactDir);
  await mkdir(artifactDir, { recursive: true });
  let server: IWebPreviewServer | undefined;
  try {
    const config = await loadProjectConfig(options.projectPath);
    const build = await buildProject(options.projectPath);
    const bundlePath = resolve(options.projectPath, config.outDir);
    const validation = await validateBundle(build.bundlePath);
    if (!validation.ok) {
      throw new Error(validation.diagnostics[0]?.message ?? "V4 scripting bundle validation failed.");
    }
    server = await startWebPreview({ bundlePath });
    const verifier = options.previewVerifier ?? verifyWebPreview;
    const webReport = await verifier({
      artifactDir,
      expectedMotion: options.expectedMotion ?? true,
      frames: options.frames ?? 3,
      previewUrl: server.url,
    });
    await writeFile(webReport.artifacts.reportPath, `${JSON.stringify(webReport, null, 2)}\n`);
    const report: IV4ScriptingReport = {
      artifacts: {
        effectLogPath: webReport.artifacts.effectLogPath,
        reportPath: resolve(artifactDir, "v4-scripting-report.json"),
        webReportPath: webReport.artifacts.reportPath,
      },
      diagnostics: webReport.diagnostics,
      status: webReport.status,
      visual: webReport.checks,
    };
    await writeFile(report.artifacts.reportPath, `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } finally {
    await server?.close();
  }
}
