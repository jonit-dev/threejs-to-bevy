import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { captureCandidate } from "./capture.js";

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
