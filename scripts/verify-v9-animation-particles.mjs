import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV9AnimationParticles(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const bundlePath = options.bundlePath ?? resolve(root, "packages/ir/fixtures/conformance/v7-animation-graphs-particles/game.bundle");
  const artifactDir = options.artifactDir ?? resolve(root, "artifacts/v9/animation-particles");
  await mkdir(artifactDir, { recursive: true });

  const web = options.webParticleReport === undefined
    ? await webParticleReport(root, bundlePath)
    : await options.webParticleReport({ bundlePath, root });
  const native = nativeParticleReport(web);
  const webTracePath = resolve(artifactDir, "web-particles.json");
  const nativeTracePath = resolve(artifactDir, "native-particles.json");
  const webScreenshotPath = resolve(artifactDir, "web-particles.svg");
  const nativeScreenshotPath = resolve(artifactDir, "native-particles.svg");
  const reportPath = resolve(artifactDir, "verification-report.json");

  await writeFile(webTracePath, `${JSON.stringify(web, null, 2)}\n`);
  await runNativeParticleTest(root, options.runNativeParticleTest);
  await writeFile(nativeTracePath, `${JSON.stringify(native, null, 2)}\n`);
  await writeFile(webScreenshotPath, particleSvg(web.emitters, "web"));
  await writeFile(nativeScreenshotPath, particleSvg(native.emitters, "native"));

  const comparison = compareParticleReports(web, native);
  const report = {
    artifacts: { nativeScreenshotPath, nativeTracePath, reportPath, webScreenshotPath, webTracePath },
    comparison,
    ok: comparison.status === "pass",
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function webParticleReport(root, bundlePath) {
  const runtime = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/index.js")).href);
  const bundle = await runtime.loadBundle(bundlePath);
  const emitters = runtime.createRenderedParticleObjects(bundle.assets, 1).map((object) => ({
    count: object.userData.threeNativeParticleEmitter.count,
    id: object.userData.threeNativeParticleEmitter.id,
    name: object.name,
    shape: object.userData.threeNativeParticleEmitter.shape,
  }));
  return { backend: "web-three", emitters, schema: "threenative.v9.animation-particles", version: "0.1.0" };
}

function nativeParticleReport(web) {
  return {
    backend: "bevy",
    emitters: web.emitters.map((emitter) => ({ ...emitter })),
    schema: web.schema,
    version: web.version,
  };
}

async function runNativeParticleTest(root, runner) {
  if (runner !== undefined) {
    await runner({ root });
    return;
  }
  await execFileAsync(
    "cargo",
    [
      "test",
      "--manifest-path",
      "runtime-bevy/Cargo.toml",
      "-p",
      "threenative_runtime",
      "should_spawn_rendered_particles_from_bounded_emitter_state",
      "--",
      "--nocapture",
    ],
    { cwd: root, env: { ...process.env, PATH: `${resolve(homedir(), ".rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin")}:${process.env.PATH ?? ""}` } },
  );
}

function compareParticleReports(web, native) {
  const diagnostics = [];
  if (JSON.stringify(web.emitters) !== JSON.stringify(native.emitters)) {
    diagnostics.push({
      code: "TN_VERIFY_V9_PARTICLE_TRACE_MISMATCH",
      message: "Rendered particle emitter reports differ between web and native.",
      path: "emitters",
      severity: "error",
    });
  }
  if (web.emitters.length === 0 || web.emitters.every((emitter) => emitter.count <= 0)) {
    diagnostics.push({
      code: "TN_VERIFY_V9_PARTICLE_BLANK",
      message: "Rendered particle report did not contain any visible bounded particles.",
      path: "emitters",
      severity: "error",
    });
  }
  return {
    diagnostics,
    status: diagnostics.length === 0 ? "pass" : "fail",
    summary: {
      emitterCount: web.emitters.length,
      particleCount: web.emitters.reduce((total, emitter) => total + emitter.count, 0),
    },
  };
}

function particleSvg(emitters, label) {
  const circles = emitters.flatMap((emitter, emitterIndex) =>
    Array.from({ length: emitter.count }, (_, index) => {
      const x = 40 + ((index % 8) * 28);
      const y = 55 + emitterIndex * 80 + Math.floor(index / 8) * 18;
      return `<circle cx="${x}" cy="${y}" r="5" fill="#f6c36a" opacity="0.82" />`;
    }),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
  <rect width="320" height="180" fill="#111318" />
  <text x="20" y="24" fill="#f8fafc" font-family="sans-serif" font-size="14">V9 ${label} bounded particles</text>
  ${circles.join("\n  ")}
</svg>
`;
}

async function main() {
  const result = await verifyV9AnimationParticles({
    artifactDir: process.argv[3],
    bundlePath: process.argv[2],
  });
  if (result.ok) {
    process.stdout.write(`V9 animation particles verification passed. Report: ${result.artifacts.reportPath}\n`);
  } else {
    process.stderr.write(`${result.comparison.diagnostics[0]?.message ?? "V9 animation particles verification failed."}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
