import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { captureCandidate } from "./capture.js";
import { preparedObservationRouteText } from "./prepare.js";

test("should report TN_BENCH_NO_CANVAS when page has no canvas", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-no-canvas-"));
  await writeFile(join(root, "index.html"), "<!doctype html><p>No canvas</p>");
  const result = await captureCandidate({ candidate: root, outDir: join(root, "artifacts") });
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_NO_CANVAS"), true);
});

test("should autostart or click before probing keyboard movement", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-autostart-"));
  await writeFile(
    join(root, "index.html"),
    `<!doctype html>
<canvas width="1280" height="720"></canvas>
<script>
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");
let started = new URL(location.href).searchParams.get("tn-benchmark-autostart") === "1";
let x = 40;
function draw() {
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "white";
  ctx.fillRect(x, 220, 320, 260);
}
window.addEventListener("click", () => {
  started = true;
  document.body.focus();
});

window.addEventListener("keydown", () => {
  if (started) {
    x = 820;
    draw();
  }
});

document.body.tabIndex = 0;
document.body.focus();
draw();
</script>`,
  );

  const result = await captureCandidate({ candidate: root, outDir: join(root, "artifacts") });

  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_NO_MOVEMENT"), false);
  assert.equal(result.metrics !== undefined && result.metrics.movementDelta.changedPixelRatio > result.metrics.movementDelta.threshold, true);
});

test("should reject drift in the prepared scorer-owned observation route", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-route-drift-"));
  await writeFile(join(root, "index.html"), `<!doctype html><canvas width="1280" height="720"></canvas><script>
const canvas=document.querySelector("canvas");const ctx=canvas.getContext("2d");let x=40;
function draw(){ctx.fillStyle="black";ctx.fillRect(0,0,1280,720);ctx.fillStyle="white";ctx.fillRect(x,200,300,300)}
addEventListener("keydown",()=>{x=800;draw()});draw();
</script>`);
  const route = JSON.parse(preparedObservationRouteText("grid-push-puzzle")) as { routes: Array<{ actions: Array<{ key?: string }> }> };
  route.routes[1]!.actions[1]!.key = "ArrowLeft";
  await writeFile(join(root, "benchmark-observation-route.json"), `${JSON.stringify(route, null, 2)}\n`);

  const result = await captureCandidate({ candidate: root, observePromptId: "grid-push-puzzle", outDir: join(root, "artifacts") });

  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_OBSERVATION_ROUTE_DRIFT"), true);
});

test("should activate a visible start button before probing keyboard movement", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-start-button-"));
  await writeFile(
    join(root, "index.html"),
    `<!doctype html>
<canvas width="1280" height="720"></canvas>
<button style="position:fixed;left:20px;top:20px">Start</button>
<script>
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");
let started = false;
let x = 40;
function draw() {
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "white";
  ctx.fillRect(x, 220, 320, 260);
}
document.querySelector("button").addEventListener("click", (event) => {
  started = true;
  event.currentTarget.remove();
});
window.addEventListener("keydown", () => {
  if (started) {
    x = 820;
    draw();
  }
});
draw();
</script>`,
  );

  const result = await captureCandidate({ candidate: root, outDir: join(root, "artifacts") });

  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_NO_MOVEMENT"), false);
});

test("should accept pinned vanilla Three.js WebGL canvas candidate", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-three-webgl-"));
  await writeFile(join(root, "package.json"), `${JSON.stringify({ dependencies: { three: "^0.181.2" } })}\n`);
  const threeBuildDir = join(process.cwd(), process.cwd().endsWith("tools/agent-benchmark") ? "../../packages/runtime-web-three/node_modules/three/build" : "packages/runtime-web-three/node_modules/three/build");
  const threeModule = await readFile(join(threeBuildDir, "three.module.js"));
  const threeCore = await readFile(join(threeBuildDir, "three.core.js"));
  await writeFile(join(root, "three.module.js"), threeModule);
  await writeFile(join(root, "three.core.js"), threeCore);
  await writeFile(join(root, "index.html"), `<!doctype html>
<script type="importmap">{"imports":{"three":"./three.module.js"}}</script>
<script type="module">
import * as THREE from "three";
const renderer = new THREE.WebGLRenderer(); renderer.setSize(1280, 720); document.body.append(renderer.domElement);
globalThis.__THREE_BENCHMARK_RENDERER__ = renderer;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x102030);
const camera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0.1, 10); camera.position.z = 2;
const actor = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ color: 0xffffff })); scene.add(actor);
function draw(){ renderer.render(scene, camera); } renderer.setAnimationLoop(draw);
addEventListener("keydown", () => { actor.position.x = 5; });
</script>`);

  const result = await captureCandidate({ candidate: root, condition: "vanilla", outDir: join(root, "artifacts") });

  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === "error"), false, JSON.stringify(result.diagnostics));
  assert.equal(result.metrics !== undefined, true);
});

test("should accept exact pinned Three.js and discover obvious source under a relative candidate path", async () => {
  const base = await mkdtemp(join(process.cwd(), ".tn-agent-benchmark-three-relative-"));
  const root = join(base, "artifacts", "candidate");
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "package.json"), `${JSON.stringify({ dependencies: { three: "0.181.2" } })}\n`);
    await writeFile(join(root, "src", "main.js"), `import * as THREE from "three";\nconst renderer = new THREE.WebGLRenderer();\n`);

    const result = await captureCandidate({ candidate: relative(process.cwd(), root), condition: "vanilla", outDir: join(root, "artifacts") });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_VANILLA_THREE_DEPENDENCY_INVALID"), false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_VANILLA_THREE_IMPORT_MISSING"), false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_VANILLA_WEBGL_RENDERER_MISSING"), false);
  } finally {
    await rm(base, { force: true, recursive: true });
  }
});

test("should reject a Three.js dependency range that does not include the repository pin", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-three-version-mismatch-"));
  try {
    await writeFile(join(root, "package.json"), `${JSON.stringify({ dependencies: { three: "^0.180.0" } })}\n`);
    await writeFile(join(root, "index.js"), `import * as THREE from "three";\nconst renderer = new THREE.WebGLRenderer();\n`);

    const result = await captureCandidate({ candidate: root, condition: "vanilla", outDir: join(root, "artifacts") });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_VANILLA_THREE_DEPENDENCY_INVALID"), true);
    assert.equal(result.artifacts.beforeScreenshot, undefined);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject DOM canvas and dependency-only impostors", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-three-impostor-"));
  await writeFile(join(root, "package.json"), `${JSON.stringify({ dependencies: { three: "^0.181.2" } })}\n`);
  await writeFile(join(root, "index.html"), "<!doctype html><canvas></canvas><script>document.querySelector('canvas').getContext('2d').fillRect(0,0,10,10)</script>");

  const result = await captureCandidate({ candidate: root, condition: "vanilla", outDir: join(root, "artifacts") });

  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_VANILLA_THREE_IMPORT_MISSING"), true);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_VANILLA_WEBGL_RENDERER_MISSING"), true);
  assert.equal(result.artifacts.beforeScreenshot, undefined);
});

test("should reject a real Three.js renderer disconnected from the scored canvas", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-three-disconnected-"));
  await writeFile(join(root, "package.json"), `${JSON.stringify({ dependencies: { three: "^0.181.2" } })}\n`);
  const threeBuildDir = join(process.cwd(), process.cwd().endsWith("tools/agent-benchmark") ? "../../packages/runtime-web-three/node_modules/three/build" : "packages/runtime-web-three/node_modules/three/build");
  await writeFile(join(root, "three.module.js"), await readFile(join(threeBuildDir, "three.module.js")));
  await writeFile(join(root, "three.core.js"), await readFile(join(threeBuildDir, "three.core.js")));
  await writeFile(join(root, "index.html"), `<!doctype html>
<canvas id="raw" width="1280" height="720"></canvas>
<script type="importmap">{"imports":{"three":"./three.module.js"}}</script>
<script type="module">
import * as THREE from "three";
const raw = document.querySelector("#raw");
const gl = raw.getContext("webgl");
gl.clearColor(0.1, 0.2, 0.3, 1); gl.clear(gl.COLOR_BUFFER_BIT);
const renderer = new THREE.WebGLRenderer(); renderer.setSize(16, 16);
globalThis.__THREE_BENCHMARK_RENDERER__ = renderer;
const scene = new THREE.Scene(); const camera = new THREE.Camera(); renderer.render(scene, camera);
</script>`);

  const result = await captureCandidate({ candidate: root, condition: "vanilla", outDir: join(root, "artifacts") });

  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_VANILLA_RENDERER_CANVAS_MISMATCH"), true);
  assert.equal(result.artifacts.beforeScreenshot, undefined);
});

test("should reject a renderer-shaped handle around a raw WebGL canvas", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-three-fake-handle-"));
  await writeFile(join(root, "package.json"), `${JSON.stringify({ dependencies: { three: "^0.181.2" } })}\n`);
  const threeBuildDir = join(process.cwd(), process.cwd().endsWith("tools/agent-benchmark") ? "../../packages/runtime-web-three/node_modules/three/build" : "packages/runtime-web-three/node_modules/three/build");
  await writeFile(join(root, "three.module.js"), await readFile(join(threeBuildDir, "three.module.js")));
  await writeFile(join(root, "three.core.js"), await readFile(join(threeBuildDir, "three.core.js")));
  await writeFile(join(root, "index.html"), `<!doctype html>
<canvas id="raw" width="1280" height="720"></canvas>
<script type="importmap">{"imports":{"three":"./three.module.js"}}</script>
<script type="module">
import * as THREE from "three";
const raw = document.querySelector("#raw");
const gl = raw.getContext("webgl");
gl.clearColor(0.1, 0.2, 0.3, 1); gl.clear(gl.COLOR_BUFFER_BIT);
const unusedRenderer = new THREE.WebGLRenderer();
globalThis.__THREE_BENCHMARK_RENDERER__ = { domElement: raw, getContext: () => gl, info: { render: { calls: 1 } }, render() {} };
</script>`);

  const result = await captureCandidate({ candidate: root, condition: "vanilla", outDir: join(root, "artifacts") });

  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_VANILLA_RENDERER_REQUIRED"), true);
  assert.equal(result.artifacts.beforeScreenshot, undefined);
});
