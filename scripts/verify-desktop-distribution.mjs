import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DISTRIBUTION_TARGET_REGISTRY } from "../packages/ir/dist/distribution.js";
import { resolveArtifactTargets } from "./artifact-paths.mjs";

export async function verifyDesktopDistribution({
  lifecycle = "promoted",
  registry = DISTRIBUTION_TARGET_REGISTRY,
  rows,
  workspaceRoot = process.cwd(),
}) {
  const required = registry.filter((row) =>
    ["windows", "macos", "linux"].includes(row.platform) &&
    (lifecycle === "implemented" ? ["implemented", "promoted"].includes(row.promotion) : row.promotion === "promoted"),
  );
  const byKey = new Map(rows.map((row) => [`${row.platform}/${row.runtime}`, row]));
  const diagnostics = [];
  for (const target of required) {
    const key = `${target.platform}/${target.runtime}`;
    const report = byKey.get(key);
    if (report === undefined) {
      diagnostics.push(`${key}:missing-report`);
      continue;
    }
    if (!target.eligibleHosts.includes(report.host)) diagnostics.push(`${key}:wrong-host`);
    const requiredSigningStatus = target.signable ? "signed" : "not-applicable";
    if (report.signingStatus !== requiredSigningStatus) diagnostics.push(`${key}:signing-status`);
    await verifyFileReference(report.launchEvidence, undefined, undefined, `${key}:launch-evidence`, workspaceRoot, diagnostics);
    const verifiedHashes = [];
    for (const formatName of target.formats) {
      const format = report.formats?.[formatName];
      if (format === undefined) {
        diagnostics.push(`${key}:${formatName}:missing-format`);
        continue;
      }
      await verifyFileReference(
        format.path,
        format.sha256,
        format.bytes,
        `${key}:${formatName}`,
        workspaceRoot,
        diagnostics,
      );
      verifiedHashes.push(format.sha256);
      await verifyProductionReport(format.packageReport, { formatName, key, report, target }, workspaceRoot, diagnostics);
      if (format.repeatSha256 !== undefined && format.repeatSha256 !== format.sha256) {
        diagnostics.push(`${key}:${formatName}:reproducibility`);
      }
    }
    if (!verifiedHashes.includes(report.artifactSha256)) diagnostics.push(`${key}:artifact-hash`);
    for (const proofName of target.proofRequirements) {
      if (report.proof?.requirements?.[proofName] !== "passed") diagnostics.push(`${key}:proof:${proofName}`);
    }
    if (typeof report.proof?.inputAction !== "string" || report.proof.inputAction.length === 0) {
      diagnostics.push(`${key}:proof:inputAction`);
    }
  }
  if (diagnostics.length > 0) throw new Error(`Desktop distribution verification failed: ${diagnostics.join(", ")}`);
  return {
    code: "TN_VERIFY_DESKTOP_DISTRIBUTION_OK",
    lifecycle,
    requiredRows: required.map(({ platform, runtime }) => `${platform}/${runtime}`),
    rows,
    schema: "threenative.desktop-distribution-verification",
    version: "0.1.0",
  };
}

async function verifyProductionReport(path, context, workspaceRoot, diagnostics) {
  const diagnostic = `${context.key}:${context.formatName}:package-report`;
  if (typeof path !== "string" || path.length === 0) {
    diagnostics.push(diagnostic);
    return;
  }
  try {
    const productionReportPath = resolve(workspaceRoot, path);
    const production = JSON.parse(await readFile(productionReportPath, "utf8"));
    if (production.schema !== "threenative.package-report" || production.version !== "0.1.0") diagnostics.push(`${diagnostic}:schema`);
    if ((production.platform ?? production.target) !== context.target.platform) diagnostics.push(`${diagnostic}:platform`);
    if (production.runtime !== context.target.runtime) diagnostics.push(`${diagnostic}:runtime`);
    if (production.format !== context.formatName) diagnostics.push(`${diagnostic}:format`);
    if (!context.target.architectures.includes(production.architecture)) diagnostics.push(`${diagnostic}:architecture`);
    if (typeof production.sourceHash !== "string" || !/^[a-f0-9]{64}$/.test(production.sourceHash)) diagnostics.push(`${diagnostic}:source-hash`);
    if (production.toolchain === null || typeof production.toolchain !== "object") diagnostics.push(`${diagnostic}:toolchain`);
    if (production.signing?.status !== context.report.signingStatus) diagnostics.push(`${diagnostic}:signing`);
    if (production.artifact?.bytes !== context.report.formats[context.formatName].bytes) diagnostics.push(`${diagnostic}:artifact-bytes`);
    if (production.artifact?.sha256 !== context.report.formats[context.formatName].sha256) diagnostics.push(`${diagnostic}:artifact-hash`);
    const productionArtifactPath = typeof production.artifact?.path === "string"
      ? resolve(dirname(productionReportPath), production.artifact.path)
      : undefined;
    const aggregateArtifactPath = resolve(workspaceRoot, context.report.formats[context.formatName].path);
    if (productionArtifactPath !== aggregateArtifactPath) diagnostics.push(`${diagnostic}:artifact-path`);
  } catch (error) {
    if (error?.code === "ENOENT") diagnostics.push(`${diagnostic}:missing-file`);
    else if (error instanceof SyntaxError) diagnostics.push(`${diagnostic}:json`);
    else throw error;
  }
}

async function verifyFileReference(path, expectedHash, expectedBytes, diagnostic, workspaceRoot, diagnostics) {
  if (typeof path !== "string" || path.length === 0) {
    diagnostics.push(diagnostic);
    return;
  }
  const absolutePath = resolve(workspaceRoot, path);
  try {
    const file = await stat(absolutePath);
    if (!file.isFile()) {
      diagnostics.push(`${diagnostic}:not-file`);
      return;
    }
    if (expectedBytes !== undefined && file.size !== expectedBytes) diagnostics.push(`${diagnostic}:bytes`);
    if (expectedHash !== undefined) {
      if (typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedHash)) {
        diagnostics.push(`${diagnostic}:hash`);
      } else if (await sha256File(absolutePath) !== expectedHash) {
        diagnostics.push(`${diagnostic}:hash-mismatch`);
      }
    }
  } catch (error) {
    if (error?.code === "ENOENT") diagnostics.push(`${diagnostic}:missing-file`);
    else throw error;
  }
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function main() {
  const input = flagValue("--input");
  if (input === undefined) throw new Error("Usage: node scripts/verify-desktop-distribution.mjs --input <proof.json> [--lifecycle promoted|implemented]");
  const lifecycle = flagValue("--lifecycle") ?? "promoted";
  if (!["implemented", "promoted"].includes(lifecycle)) throw new Error(`Unsupported lifecycle '${lifecycle}'.`);
  const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
  const source = JSON.parse(await readFile(resolve(input), "utf8"));
  const report = await verifyDesktopDistribution({ lifecycle, rows: source.rows ?? [], workspaceRoot: root });
  const output = resolveArtifactTargets({
    gate: "distribution-desktop",
    owner: { kind: "aggregate", name: "distribution/desktop" },
    root,
  }).reportPath;
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`Desktop distribution gate passed. Report: ${output}\n`);
}

function flagValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
