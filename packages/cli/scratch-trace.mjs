import { resolve } from "node:path";
import { buildProject, loadProjectConfig, validateBundle } from "@threenative/compiler";
import { startWebPreview } from "@threenative/runtime-web-three";
import { chromium } from "playwright";

const projectPath = resolve("/home/joao/projects/threejs-to-bevy/examples/humanoid-physics-course");

async function ensureBundle() {
  const config = await loadProjectConfig(projectPath);
  const bundlePath = resolve(projectPath, config.outDir);
  await buildProject(projectPath);
  const report = await validateBundle(bundlePath);
  if (!report.ok) {
    throw new Error(report.diagnostics[0]?.message ?? "Bundle validation failed.");
  }
  return bundlePath;
}

async function dispatchKey(page, type, code, key) {
  await page.evaluate(({ code, key, type }) => {
    globalThis.dispatchEvent(new KeyboardEvent(type, { bubbles: true, code, key }));
  }, { code, key, type });
}

// Frame-by-frame script: [ [holdKeys[], frames], ... ]
const SCRIPT = [
  [["KeyW"], 90],
  [["KeyW", "KeyD"], 60],
  [["KeyD"], 60],
  [[], 40],
];

const KEY_MAP = { KeyA: "a", KeyD: "d", KeyS: "s", KeyW: "w" };

async function main() {
  const bundlePath = await ensureBundle();
  const server = await startWebPreview({ bundlePath, silent: true });
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });
    await page.goto(server.url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction("Boolean(globalThis.__THREENATIVE_READY__?.ok)", undefined, { timeout: 10000 });
    await page.waitForTimeout(150);

    let held = [];
    for (const [keys, frames] of SCRIPT) {
      const toPress = keys.filter((k) => !held.includes(k));
      const toRelease = held.filter((k) => !keys.includes(k));
      for (const k of toPress) await dispatchKey(page, "keydown", k, KEY_MAP[k]);
      for (const k of toRelease) await dispatchKey(page, "keyup", k, KEY_MAP[k]);
      held = keys;
      await page.waitForTimeout(frames * (1000 / 60));
    }
    for (const k of held) await dispatchKey(page, "keyup", k, KEY_MAP[k]);
    await page.waitForTimeout(500);

    const log = await page.evaluate(() => globalThis.__THREENATIVE_EFFECT_LOG__);
    const entries = (log?.entries ?? [])
      .filter((e) => e.kind === "patch" && e.command === "setComponent" && e.entity === "player")
      .sort((a, b) => (a.frame - b.frame) || (a.tick - b.tick));

    const rows = [];
    let lastYaw = null;
    let lastPos = null;
    for (const e of entries) {
      if (e.component === "Transform" && Array.isArray(e.value?.position)) {
        lastPos = e.value.position;
      }
      if (e.component === "CoursePlayer") {
        lastYaw = e.value?.yaw;
      }
      if (lastPos) {
        rows.push({ frame: e.frame, tick: e.tick, x: lastPos[0], z: lastPos[2], yaw: lastYaw });
      }
    }
    // Dedup consecutive identical frames, print every row.
    console.log("frame,tick,x,z,yaw_deg");
    for (const r of rows) {
      console.log(`${r.frame},${r.tick},${r.x.toFixed(4)},${r.z.toFixed(4)},${r.yaw == null ? "" : (r.yaw * 180 / Math.PI).toFixed(2)}`);
    }
  } finally {
    await browser?.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
