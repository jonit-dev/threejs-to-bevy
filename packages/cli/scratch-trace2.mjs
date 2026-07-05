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
  if (!report.ok) throw new Error(report.diagnostics[0]?.message ?? "Bundle validation failed.");
  return bundlePath;
}

async function dispatchKey(page, type, code, key) {
  await page.evaluate(({ code, key, type }) => {
    globalThis.dispatchEvent(new KeyboardEvent(type, { bubbles: true, code, key }));
  }, { code, key, type });
}

async function main() {
  const bundlePath = await ensureBundle();
  const server = await startWebPreview({ bundlePath, silent: true });
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });
    await page.goto(server.url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction("Boolean(globalThis.__THREENATIVE_READY__?.ok)", undefined, { timeout: 10000 });
    await page.waitForTimeout(50);

    await dispatchKey(page, "keydown", "KeyW", "w");
    await page.waitForTimeout(40 * (1000/60));
    await dispatchKey(page, "keyup", "KeyW", "w");
    await page.waitForTimeout(300);

    const log = await page.evaluate(() => globalThis.__THREENATIVE_EFFECT_LOG__);
    const entries = (log?.entries ?? [])
      .filter((e) => e.entity === "player")
      .sort((a, b) => (a.frame - b.frame) || (a.tick - b.tick));
    console.log(JSON.stringify(entries, null, 2));
  } finally {
    await browser?.close();
    await server.close();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
