import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { chromium } from "playwright";

import { captureBrowserObservation, validateObservationRoute } from "./browser-observation.js";

test("should reject candidate-owned verdicts, code, assertion IDs, and unbounded work", () => {
  for (const route of [
    { actions: [{ key: "ArrowRight", type: "key-press" }], bindings: [], id: "movement", pass: true },
    { actions: [{ key: "ArrowRight", type: "key-press" }], bindings: [{ id: "player", selector: "canvas", source: "raw-snapshot", assertionId: "keyboard-movement" }], id: "movement" },
    { actions: [{ code: "globalThis.cheat()", type: "eval" }], bindings: [], id: "movement" },
    { actions: [{ durationMs: 10_001, type: "wait" }], bindings: [], id: "movement" },
  ]) {
    const result = validateObservationRoute(route, "collector");
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((item) => item.severity === "error"), true);
  }

  const valid = validateObservationRoute({
    actions: [{ checkpoint: "moved", key: "ArrowRight", type: "key-press" }, { checkpoint: "settled", durationMs: 20, type: "wait" }],
    bindings: [
      { id: "status", selector: "#status", source: "visible-text" },
      { id: "player", selector: "canvas", source: "raw-snapshot" },
    ],
    id: "movement-route",
  }, "collector");
  assert.equal(valid.ok, true);
  assert.ok(valid.route);

  const protocolNamedRoute = validateObservationRoute({
    actions: [
      { checkpoint: "start", durationMs: 0, type: "wait" },
      { checkpoint: "moved", key: "ArrowRight", type: "key-press" },
      { checkpoint: "blocked", key: "ArrowRight", type: "key-press" },
    ],
    bindings: [{ id: "player", selector: "canvas", source: "raw-snapshot" }],
    id: "grid-movement",
  }, "grid-push-puzzle");
  assert.equal(protocolNamedRoute.ok, true);

  const duplicateCheckpoints = validateObservationRoute({
    actions: [{ checkpoint: "same", key: "ArrowRight", type: "key-press" }, { checkpoint: "same", durationMs: 20, type: "wait" }],
    bindings: [],
    id: "duplicates",
  }, "collector");
  assert.equal(duplicateCheckpoints.ok, false);
});

test("should retain raw observations while rejecting hidden and passive-only correlations", async () => {
  const browser = await chromium.launch({ headless: true });
  const outDir = await mkdtemp(join(tmpdir(), "tn-browser-observation-"));
  try {
    const page = await browser.newPage({ viewport: { height: 240, width: 320 } });
    await page.setContent(`<!doctype html>
      <canvas width="160" height="120"></canvas>
      <p id="status">cell 0</p><p id="hidden" hidden>secret</p>
      <script>
        const canvas = document.querySelector('canvas');
        const context = canvas.getContext('2d');
        let cell = 0;
        const paint = () => { context.fillStyle = '#102030'; context.fillRect(0, 0, 160, 120); context.fillStyle = '#f4d35e'; context.fillRect(20 + cell * 20, 50, 12, 12); };
        paint();
        addEventListener('keydown', (event) => { if (event.key === 'ArrowRight') { cell += 1; document.querySelector('#status').textContent = 'cell ' + cell; paint(); } });
        globalThis.__TN_BENCHMARK_OBSERVE__ = () => ({ actors: [{ id: 'player', role: 'player', position: [cell, 0, 0], counters: { moves: cell }, pass: true }], metrics: { 'player.moveCount': cell } });
      </script>`);
    const interactive = validateObservationRoute({
      actions: [{ key: "ArrowRight", type: "key-press" }],
      bindings: [
        { id: "status", selector: "#status", source: "visible-text" },
        { id: "player", selector: "canvas", source: "raw-snapshot" },
        { id: "hidden", selector: "#hidden", source: "visible-text" },
      ],
      id: "interactive",
    }, "collector");
    assert.ok(interactive.route);
    const interactiveResult = await captureBrowserObservation({ canvas: page.locator("canvas"), outDir, page, promptId: "collector", route: interactive.route });
    assert.equal(interactiveResult.diagnostics.some((item) => item.code === "TN_BENCH_OBSERVATION_BINDING_NOT_VISIBLE"), true);
    assert.equal(interactiveResult.trace.routes[0]?.samples.some((sample) => sample.phase === "after" && sample.visibility.inputCorrelated), true);
    const actor = interactiveResult.trace.routes[0]?.samples.at(-1)?.actors.find((item) => item.id === "player");
    assert.deepEqual(actor?.position, [1, 0, 0]);
    assert.equal(interactiveResult.trace.routes[0]?.samples.at(-1)?.metrics["player.moveCount"], 1);
    assert.equal(Object.hasOwn(actor ?? {}, "pass"), false);

    await page.setContent(`<canvas width="160" height="120"></canvas><p id="status">unchanged</p><script>const c=document.querySelector('canvas').getContext('2d');c.fillStyle='#345';c.fillRect(0,0,160,120)</script>`);
    const staticRoute = validateObservationRoute({ actions: [{ key: "ArrowRight", type: "key-press" }], bindings: [{ id: "status", selector: "#status", source: "visible-text" }], id: "static" }, "collector");
    assert.ok(staticRoute.route);
    const staticResult = await captureBrowserObservation({ canvas: page.locator("canvas"), outDir, page, promptId: "collector", route: staticRoute.route });
    assert.equal(staticResult.trace.routes[0]?.samples.some((sample) => sample.visibility.inputCorrelated), false);

    await page.setContent(`<canvas width="160" height="120"></canvas><script>const c=document.querySelector('canvas'),x=c.getContext('2d');let n=0;setInterval(()=>{x.fillStyle='#123';x.fillRect(0,0,160,120);x.fillStyle='#fff';x.fillRect((n++%8)*20,40,10,10)},30)</script>`);
    const animationRoute = validateObservationRoute({ actions: [{ key: "ArrowRight", type: "key-press" }], bindings: [], id: "animation" }, "collector");
    assert.ok(animationRoute.route);
    const animationResult = await captureBrowserObservation({ canvas: page.locator("canvas"), outDir, page, promptId: "collector", route: animationRoute.route });
    assert.equal(animationResult.trace.routes[0]?.samples.some((sample) => sample.visibility.inputCorrelated), false);
  } finally {
    await browser.close();
    await rm(outDir, { force: true, recursive: true });
  }
});
