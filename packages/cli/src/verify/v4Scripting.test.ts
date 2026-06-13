import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyV4Scripting } from "./v4Scripting.js";

test("v4Scripting should include web patch log path", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v4-scripting-"));
  try {
    const projectPath = join(root, "project");
    const artifactDir = join(root, "artifacts/v4");
    await writeProject(projectPath);

    const report = await verifyV4Scripting({
      artifactDir,
      previewVerifier: async ({ artifactDir: verifierArtifactDir, previewUrl }) => ({
        artifacts: {
          effectLogPath: join(verifierArtifactDir, "web-effect-log.json"),
          reportPath: join(verifierArtifactDir, "verification-report.json"),
          screenshots: [join(verifierArtifactDir, "frame-01.png")],
        },
        checks: {
          canvas: { height: 720, ok: true, width: 1280 },
          frameDiff: {
            averageBrightnessDelta: 0.01,
            averageColorDelta: { blue: 0.01, green: 0.01, red: 0.01 },
            changedPixelRatio: 0.02,
            expectedMotion: true,
            ok: true,
            threshold: 0.001,
          },
          nonblank: { changedPixelRatio: 1, ok: true, threshold: 0.002 },
        },
        debug: { browserLogs: [], pageErrors: [], requestFailures: [], runtimeReady: { ok: true } },
        diagnostics: [],
        previewUrl,
        status: "pass",
        thresholds: { diffChangedPixelRatio: 0.001, nonblankChangedPixelRatio: 0.002 },
      }),
      projectPath,
    });

    const saved = JSON.parse(await readFile(report.artifacts.reportPath, "utf8")) as typeof report;
    const webReport = JSON.parse(await readFile(report.artifacts.webReportPath, "utf8")) as { status: string };
    assert.equal(report.status, "pass");
    assert.match(report.artifacts.reportPath, /artifacts\/v4\/v4-scripting-report\.json$/);
    assert.match(report.artifacts.effectLogPath ?? "", /artifacts\/v4\/web-effect-log\.json$/);
    assert.equal(saved.artifacts.effectLogPath, report.artifacts.effectLogPath);
    assert.equal(webReport.status, "pass");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeProject(projectPath: string): Promise<void> {
  await mkdir(join(projectPath, "src"), { recursive: true });
  await writeFile(
    join(projectPath, "threenative.config.json"),
    `${JSON.stringify({ entry: "src/game.ts", outDir: "dist/game.bundle", schema: "threenative.project", version: "0.1.0" }, null, 2)}\n`,
  );
  await writeFile(
    join(projectPath, "src/game.ts"),
    `
      import { BoxGeometry, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, World, defineComponent, defineQuery, defineSystem } from "@threenative/sdk";
      const Transform = defineComponent("Transform", {
        position: { kind: "vec3", required: false },
        rotation: { kind: "quat", required: false },
        scale: { kind: "vec3", required: false },
      });
      const scene = new Scene({ id: "scene.v4-test" });
      const cube = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: "#44ccff", id: "mat.cube" }), { id: "cube" });
      const camera = new PerspectiveCamera({ far: 100, fovY: 60, id: "camera", near: 0.1, position: [0, 0, 4] });
      scene.add(cube);
      scene.add(camera);
      scene.setActiveCamera(camera);
      const world = new World();
      world.addSystem(defineSystem(
        { id: "rotate", queries: [defineQuery({ with: [Transform] })], reads: [Transform], stage: "fixedUpdate", writes: [Transform] },
        (ctx) => {
          for (const entity of ctx.query()) {
            entity.patch(Transform, { rotation: [0, 0.1, 0, 0.99] });
          }
        }
      ));
      export default { scene, world };
    `,
  );
}
