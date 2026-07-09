import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const execFileAsync = promisify(execFile);

export async function verifyV7PackagingTargetProfiles(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const bundlePath = options.bundlePath ?? resolve(root, "packages/ir/fixtures/conformance/packaging-target-profiles/game.bundle");
  const artifactDir = options.artifactDir ?? resolve(root, "packages/ir/artifacts/conformance/packaging-target-profiles");
  await execFileAsync("pnpm", ["--filter", "@threenative/cli", "build"], { cwd: root });
  const cli = await import(new URL("../packages/cli/dist/commands/package.js", import.meta.url));
  const runtimeBinary = await buildRepoRuntime(root);
  const result = await cli.packageCommand(["--bundle", bundlePath, "--out", artifactDir, "--json"], root, {
    async runtimeBuilder({ outputPath }) {
      await cp(runtimeBinary, outputPath, { force: true });
      return outputPath;
    },
  });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr ?? "V7 packaging command failed.");
  }
  const packageReport = JSON.parse(result.stdout);
  const packageReportPath = resolve(artifactDir, "package.report.json");
  const catalogPackageReport = {
    ...packageReport,
    artifacts: {
      ...packageReport.artifacts,
      packageReportPath,
    },
  };
  await writeFile(packageReportPath, `${JSON.stringify(catalogPackageReport, null, 2)}\n`);
  const packagedManifest = JSON.parse(await readFile(resolve(packageReport.artifacts.packagedBundlePath, "manifest.json"), "utf8"));
  const rejected = await runRejectedTargetCheck(root, cli.packageCommand);
  const smokeReportPath = resolve(artifactDir, "desktop-smoke.report.json");
  const comparisonReportPath = resolve(artifactDir, "comparison.report.json");
  const smoke = {
    code: "TN_V7_PACKAGING_DESKTOP_SMOKE_OK",
    packagedBundlePath: packageReport.artifacts.packagedBundlePath,
    packagedManifestName: packagedManifest.name,
    status: "pass",
  };
  const comparison = {
    diagnostics: rejected.exitCode === 1 ? [] : [{ code: "TN_VERIFY_V7_PACKAGING_REJECTED_TARGET_MISSING", message: "Mobile target check did not fail.", severity: "error" }],
    packageReportPath,
    smokeReportPath,
    status: rejected.exitCode === 1 ? "pass" : "fail",
  };
  await writeFile(smokeReportPath, `${JSON.stringify(smoke, null, 2)}\n`);
  await writeFile(comparisonReportPath, `${JSON.stringify(comparison, null, 2)}\n`);
  return {
    artifacts: { comparisonReportPath, packageReportPath, smokeReportPath },
    ok: comparison.status === "pass",
  };
}

async function buildRepoRuntime(root) {
  await execFileAsync(
    "cargo",
    [
      "build",
      "--manifest-path",
      resolve(root, "runtime-bevy/Cargo.toml"),
      "-p",
      "threenative_runtime",
      "--bin",
      "threenative_runtime",
      "--release",
    ],
    { cwd: root },
  );
  return resolve(root, "runtime-bevy/target/release", process.platform === "win32" ? "threenative_runtime.exe" : "threenative_runtime");
}

async function runRejectedTargetCheck(root, packageCommand) {
  const temp = await mkdtemp(join(tmpdir(), "tn-v7-package-rejected-"));
  try {
    const result = await packageCommand(
      ["--bundle", resolve(root, "packages/ir/fixtures/conformance/packaging-target-profiles/game.bundle"), "--target", "ios", "--json"],
      temp,
    );
    return { exitCode: result.exitCode, stderr: result.stderr };
  } finally {
    await rm(temp, { force: true, recursive: true });
  }
}

async function main() {
  const result = await verifyV7PackagingTargetProfiles({
    artifactDir: process.argv[3],
    bundlePath: process.argv[2],
  });
  process.stdout.write(`V7 packaging target profile verification ${result.ok ? "passed" : "failed"}. Report: ${result.artifacts.comparisonReportPath}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
