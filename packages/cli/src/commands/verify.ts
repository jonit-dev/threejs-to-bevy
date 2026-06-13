import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildProject, loadProjectConfig, validateBundle } from "@threenative/compiler";
import { startWebPreview, type IWebPreviewServer } from "@threenative/runtime-web-three";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { verifyWebPreview } from "../verify/playwright.js";
import { type IVerificationReport } from "../verify/report.js";

export interface IVerifyResult extends ICommandResult {
  server?: IWebPreviewServer;
}

export interface IVerifyCommandOptions {
  previewVerifier?: (options: {
    artifactDir: string;
    expectedMotion: boolean;
    frames: number;
    previewUrl: string;
  }) => Promise<IVerificationReport>;
}

export async function verifyCommand(
  argv: readonly string[],
  cwd = process.env.INIT_CWD ?? process.cwd(),
  options: IVerifyCommandOptions = {},
): Promise<IVerifyResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const expectedMotion = normalizedArgv.includes("--expect-motion");
  const frames = readNumberFlag(normalizedArgv, "--frames", 2);
  const url = readStringFlag(normalizedArgv, "--url");
  const projectPath = resolve(cwd, readStringFlag(normalizedArgv, "--project") ?? ".");
  const artifactDir = resolve(projectPath, "artifacts/verify");

  let server: IWebPreviewServer | undefined;

  try {
    let previewUrl = url;
    if (previewUrl === undefined) {
      const config = await loadProjectConfig(projectPath);
      const build = await buildProject(projectPath);
      const bundlePath = resolve(projectPath, config.outDir);
      const report = await validateBundle(build.bundlePath);
      if (!report.ok) {
        throw new Error(report.diagnostics[0]?.message ?? "Bundle validation failed.");
      }

      server = await startWebPreview({ bundlePath });
      previewUrl = server.url;
    }

    const verifier = options.previewVerifier ?? verifyWebPreview;
    const report = await verifier({
      artifactDir,
      expectedMotion,
      frames,
      previewUrl,
    });

    await mkdir(artifactDir, { recursive: true });
    await writeFile(report.artifacts.reportPath, `${JSON.stringify(report, null, 2)}\n`);

    const payload = {
      code: report.status === "pass" ? "TN_VERIFY_OK" : "TN_VERIFY_FAILED",
      ...report,
    };

    return {
      exitCode: report.status === "pass" ? 0 : 1,
      server,
      stdout: json
        ? `${JSON.stringify(payload, null, 2)}\n`
        : `${report.status === "pass" ? "Visual verification passed." : "Visual verification failed."}\nReport: ${report.artifacts.reportPath}\n`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return diagnosticResult({ code: "TN_VERIFY_FAILED", message }, { exitCode: 1, json, stderr: true });
  } finally {
    await server?.close();
  }
}

function readStringFlag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function readNumberFlag(argv: readonly string[], name: string, fallback: number): number {
  const raw = readStringFlag(argv, name);
  if (raw === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
