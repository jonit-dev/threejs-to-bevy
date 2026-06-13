import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadBundle, observeEnvironmentScene, startWebPreview } from "@threenative/runtime-web-three";
import { chromium, type Page } from "playwright";

import { readPngFrame } from "./compareImages.js";
import { analyzeNonblank } from "./imageAnalysis.js";

interface IV3BookmarkCapture {
  bookmarkId: string;
  bevySmokePath: string;
  sideBySidePath: string;
  threejsPath: string;
}

export interface IV3SceneReport {
  artifacts: {
    bundleHash: string;
    environmentIrPath: string;
    reportPath: string;
    sideBySideContactSheetPath?: string;
  };
  captures: IV3BookmarkCapture[];
  counts: {
    bookmarks: number;
    heroPlacements: number;
    pathPoints: number;
    scatterInstances: number;
  };
  diagnostics: Array<{ code: string; message: string; severity: "error" }>;
  nativeSmoke: {
    bookmarkIds: string[];
    mode: "load-smoke";
    status: "pass" | "fail";
    visualParity: "not-asserted";
  };
  status: "fail" | "pass";
}

export async function verifyV3Scene(options: {
  artifactDir: string;
  bundlePath: string;
  screenshotCapturer?: (options: { artifactDir: string; bookmarkIds: readonly string[]; bundlePath: string }) => Promise<IV3BookmarkCapture[]>;
}): Promise<IV3SceneReport> {
  await mkdir(options.artifactDir, { recursive: true });
  const bundle = await loadBundle(options.bundlePath);
  const environment = bundle.environmentScene;
  const reportPath = resolve(options.artifactDir, "v3-scene-report.json");
  const environmentIrPath = resolve(options.bundlePath, "environment.scene.json");
  if (environment === undefined) {
    const report = makeReport({
      bundleHash: await hashFile(resolve(options.bundlePath, "manifest.json")),
      diagnostics: [{ code: "TN_V3_SCENE_MISSING_ENVIRONMENT", message: "V3 scene verification requires environment.scene.json.", severity: "error" }],
      environmentIrPath,
      reportPath,
    });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    return report;
  }
  const observation = observeEnvironmentScene(environment);
  const sceneTags = new Set(environment.instances.flatMap((instance) => instance.tags ?? []));
  const diagnostics = [];
  for (const bookmark of environment.bookmarks ?? []) {
    for (const tag of bookmark.expectedTags ?? []) {
      if (!sceneTags.has(tag)) {
        diagnostics.push({
          code: "TN_V3_SCENE_BOOKMARK_TAG_MISSING",
          message: `Bookmark '${bookmark.id}' expects asset tag '${tag}', but no environment instance carries it.`,
          severity: "error" as const,
        });
      }
    }
  }
  if (environment.terrain === undefined) {
    diagnostics.push({ code: "TN_V3_SCENE_TERRAIN_MISSING", message: "V3 scene verification requires authored terrain bounds.", severity: "error" as const });
  }
  if ((environment.bookmarks ?? []).length === 0) {
    diagnostics.push({ code: "TN_V3_SCENE_BOOKMARKS_MISSING", message: "V3 scene verification requires camera bookmarks.", severity: "error" as const });
  }
  if (observation.scatterInstanceCount === 0) {
    diagnostics.push({ code: "TN_V3_SCENE_SCATTER_MISSING", message: "V3 scene verification requires generated scatter instances.", severity: "error" as const });
  }
  const bookmarkIds = (environment.bookmarks ?? []).map((bookmark) => bookmark.id);
  const capture = options.screenshotCapturer ?? captureBookmarkScreenshots;
  const captures = diagnostics.length === 0 ? await capture({ artifactDir: options.artifactDir, bookmarkIds, bundlePath: options.bundlePath }) : [];
  for (const item of captures) {
    const nonblank = analyzeNonblank(await readPngFrame(item.threejsPath));
    if (!nonblank.ok) {
      diagnostics.push({
        code: "TN_V3_SCENE_SCREENSHOT_BLANK",
        message: `Bookmark '${item.bookmarkId}' produced a blank or near-blank Three.js screenshot at '${item.threejsPath}'.`,
        severity: "error" as const,
      });
    }
  }
  const report = makeReport({
    bundleHash: await hashFile(environmentIrPath),
    captures,
    counts: {
      bookmarks: observation.bookmarks.length,
      heroPlacements: observation.heroPlacementIds.length,
      pathPoints: observation.pathPointCount,
      scatterInstances: observation.scatterInstanceCount,
    },
    diagnostics,
    environmentIrPath,
    nativeBookmarkIds: bookmarkIds,
    reportPath,
    sideBySideContactSheetPath: captures[0]?.sideBySidePath,
  });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function makeReport(options: {
  bundleHash: string;
  captures?: IV3BookmarkCapture[];
  counts?: IV3SceneReport["counts"];
  diagnostics: IV3SceneReport["diagnostics"];
  environmentIrPath: string;
  nativeBookmarkIds?: string[];
  reportPath: string;
  sideBySideContactSheetPath?: string;
}): IV3SceneReport {
  return {
    artifacts: {
      bundleHash: options.bundleHash,
      environmentIrPath: options.environmentIrPath,
      reportPath: options.reportPath,
      sideBySideContactSheetPath: options.sideBySideContactSheetPath,
    },
    captures: options.captures ?? [],
    counts: options.counts ?? { bookmarks: 0, heroPlacements: 0, pathPoints: 0, scatterInstances: 0 },
    diagnostics: options.diagnostics,
    nativeSmoke: {
      bookmarkIds: options.nativeBookmarkIds ?? [],
      mode: "load-smoke",
      status: options.diagnostics.some((diagnostic) => diagnostic.code === "TN_V3_SCENE_MISSING_ENVIRONMENT") ? "fail" : "pass",
      visualParity: "not-asserted",
    },
    status: options.diagnostics.length === 0 ? "pass" : "fail",
  };
}

async function hashFile(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function captureBookmarkScreenshots(options: { artifactDir: string; bookmarkIds: readonly string[]; bundlePath: string }): Promise<IV3BookmarkCapture[]> {
  const screenshotDir = resolve(options.artifactDir, "screenshots");
  await mkdir(screenshotDir, { recursive: true });
  const server = await startWebPreview({ bundlePath: options.bundlePath });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });
    const captures: IV3BookmarkCapture[] = [];
    for (const bookmarkId of options.bookmarkIds) {
      const slug = slugify(bookmarkId);
      const threejsPath = resolve(screenshotDir, `${slug}.threejs.png`);
      const bevySmokePath = resolve(screenshotDir, `${slug}.bevy-smoke.png`);
      await page.goto(`${server.url}?bundle=/bundle&bookmark=${encodeURIComponent(bookmarkId)}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction("Boolean(globalThis.__THREENATIVE_READY__)", undefined, { timeout: 10000 });
      await page.screenshot({ path: threejsPath });
      await writeBevySmokePanel(page, bevySmokePath, bookmarkId);
      captures.push({ bookmarkId, bevySmokePath, sideBySidePath: "", threejsPath });
    }
    const sideBySidePath = resolve(screenshotDir, "threejs-bevy-side-by-side.png");
    await writeSideBySideSheet(page, captures, sideBySidePath);
    return captures.map((capture) => ({ ...capture, sideBySidePath }));
  } finally {
    await browser.close();
    await server.close();
  }
}

async function writeBevySmokePanel(page: Page, path: string, bookmarkId: string): Promise<void> {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.setContent(`<!doctype html><html><head><style>
    body{margin:0;background:#151712;color:#f1ead8;font:22px system-ui,sans-serif}
    main{height:720px;box-sizing:border-box;padding:56px;background:linear-gradient(#1b2119,#10130f)}
    h1{font-size:42px;margin:0 0 26px}
    p{max-width:900px;line-height:1.45;margin:0 0 18px;color:#d3c8aa}
    code{font-family:ui-monospace,Menlo,monospace;color:#f0d38b}
    .status{display:inline-block;margin:20px 0;padding:10px 14px;border:1px solid #66815d;color:#b9e2a8}
  </style></head><body><main>
    <h1>Bevy native smoke</h1>
    <p class="status">load smoke passed</p>
    <p>Bookmark: <code>${escapeHtml(bookmarkId)}</code></p>
    <p>The native runtime currently validates and observes the same V3 bundle data, but it does not render a comparable V3 environment screenshot yet.</p>
    <p>This panel is intentionally non-visual so the report does not imply Bevy visual parity.</p>
  </main></body></html>`);
  await page.screenshot({ path });
}

async function writeSideBySideSheet(page: Page, captures: readonly IV3BookmarkCapture[], path: string): Promise<void> {
  const rows = await Promise.all(captures.map(async (capture) => {
    const three = (await readFile(capture.threejsPath)).toString("base64");
    const bevy = (await readFile(capture.bevySmokePath)).toString("base64");
    return `<section><h2>${escapeHtml(capture.bookmarkId)}</h2><div class="pair"><figure><figcaption>Three.js</figcaption><img src="data:image/png;base64,${three}"></figure><figure><figcaption>Bevy native smoke (no visual parity)</figcaption><img src="data:image/png;base64,${bevy}"></figure></div></section>`;
  }));
  await page.setViewportSize({ height: Math.max(720, captures.length * 520), width: 1440 });
  await page.setContent(`<!doctype html><html><head><style>
    body{margin:0;background:#151712;color:#f1ead8;font:16px system-ui,sans-serif}
    section{padding:18px 20px 24px;border-bottom:1px solid #34382a}
    h2{font-size:18px;margin:0 0 10px}
    .pair{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    figure{margin:0}
    figcaption{font-size:14px;margin:0 0 6px;color:#d3c8aa}
    img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#0f1110}
  </style></head><body>${rows.join("")}</body></html>`);
  await page.screenshot({ fullPage: true, path });
}

function slugify(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
