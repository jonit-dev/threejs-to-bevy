import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

async function main(): Promise<void> {
  const tempPath = await mkdtemp(join(tmpdir(), "tn-blender-package-"));
  const reportPath = resolve("tools/verify/artifacts/blender-tool/package-contents-report.json");
  try {
    const packed = spawnSync("pnpm", ["--filter", "@threenative/cli", "pack", "--pack-destination", tempPath], { cwd: resolve("."), encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
    if (packed.status !== 0) throw new Error(`TN_VERIFY_BLENDER_PACKAGE_FAILED: ${packed.stderr || packed.stdout}`);
    const tarball = packed.stdout.trim().split(/\r?\n/u).at(-1);
    if (tarball === undefined || tarball === "") throw new Error("TN_VERIFY_BLENDER_PACKAGE_FAILED: pnpm pack did not report a tarball.");
    const tarballPath = resolve(tarball);
    const listed = spawnSync("tar", ["-tf", tarballPath], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
    if (listed.status !== 0) throw new Error(`TN_VERIFY_BLENDER_PACKAGE_FAILED: ${listed.stderr}`);
    const entries = listed.stdout.split(/\r?\n/u).filter(Boolean);
    const forbidden = entries.filter((entry) => /(?:^|\/)(?:\.cache|cache)(?:\/|$)|\.(?:dmg|zip|tar\.xz)$|(?:^|\/)blender(?:\.exe)?$/iu.test(entry));
    if (!entries.includes("package/dist/blender/runner.py") || forbidden.length > 0) throw new Error(`TN_VERIFY_BLENDER_PACKAGE_FAILED: runner missing or forbidden Blender payload present: ${forbidden.join(", ")}`);
    const report = { code: "TN_VERIFY_BLENDER_PACKAGE_OK", entries: entries.length, forbidden, inventorySha256: createHash("sha256").update(`${entries.join("\n")}\n`).digest("hex"), ok: true, packedBytes: (await stat(tarballPath)).size, runner: "package/dist/blender/runner.py", schema: "threenative.verify.blender-package", version: "0.1.0" };
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({ ...report, reportPath }, null, 2)}\n`);
  } finally {
    await rm(tempPath, { force: true, recursive: true });
  }
}

void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
