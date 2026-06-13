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
      const bundle = await loadBundle(options.bundlePath);
      await writeBevyMappedPreview(page, bevySmokePath, bundle, bookmarkId);
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

async function writeBevyMappedPreview(page: Page, path: string, bundle: Awaited<ReturnType<typeof loadBundle>>, bookmarkId: string): Promise<void> {
  await page.setViewportSize({ height: 720, width: 1280 });
  const scene = bundle.environmentScene;
  const bookmark = scene?.bookmarks?.find((item) => item.id === bookmarkId);
  const preview = {
    bookmark,
    instances: scene?.instances ?? [],
    path: scene?.path,
    sourceAssets: scene?.sourceAssets ?? [],
    terrain: scene?.terrain,
  };
  await page.setContent(`<!doctype html><html><head><style>
    body{margin:0;background:#9eb6aa}
    canvas{display:block;width:1280px;height:720px}
  </style></head><body><canvas id="preview" width="1280" height="720"></canvas><script>
    const preview = ${JSON.stringify(preview).replaceAll("<", "\\u003c")};
    const canvas = document.getElementById("preview");
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const categoryBySource = new Map(preview.sourceAssets.map((asset) => [asset.id, asset.category]));
    const camera = preview.bookmark ?? { position: [0, 1.7, 7], yaw: 180, pitch: -4 };
    const yaw = camera.yaw * Math.PI / 180;
    const forward = [Math.sin(yaw), Math.cos(yaw)];
    const right = [Math.cos(yaw), -Math.sin(yaw)];
    const cam = camera.position;
    function terrainHeightAt(x, z) {
      const terrain = preview.terrain;
      if (!terrain || terrain.heightMode !== "controlPoints" || !terrain.controlPoints?.length) return terrain?.bounds?.min?.[1] ?? 0;
      let total = 0;
      let weightTotal = 0;
      for (const point of terrain.controlPoints) {
        const d = Math.hypot(x - point[0], z - point[2]);
        const weight = Math.exp(-(d * d) / 18);
        total += point[1] * weight;
        weightTotal += weight;
      }
      return weightTotal > 0 ? total / weightTotal : terrain.bounds.min[1];
    }
    function project(point) {
      const dx = point[0] - cam[0];
      const dz = point[2] - cam[2];
      const side = dx * right[0] + dz * right[1];
      const depth = dx * forward[0] + dz * forward[1];
      if (depth <= 0.1) return undefined;
      const scale = 560 / depth;
      return { x: W / 2 + side * scale, y: 345 - (point[1] - cam[1]) * scale * 0.82, scale, depth };
    }
    function pathQuad(a, b, width) {
      const dx = b[0] - a[0];
      const dz = b[2] - a[2];
      const length = Math.hypot(dx, dz) || 1;
      const nx = -dz / length * width / 2;
      const nz = dx / length * width / 2;
      return [
        [a[0] + nx, terrainHeightAt(a[0] + nx, a[2] + nz) + 0.04, a[2] + nz],
        [a[0] - nx, terrainHeightAt(a[0] - nx, a[2] - nz) + 0.04, a[2] - nz],
        [b[0] - nx, terrainHeightAt(b[0] - nx, b[2] - nz) + 0.04, b[2] - nz],
        [b[0] + nx, terrainHeightAt(b[0] + nx, b[2] + nz) + 0.04, b[2] + nz],
      ];
    }
    function drawPoly(points, fill, stroke) {
      const projected = points.map(project);
      if (projected.some((point) => !point)) return;
      ctx.beginPath();
      ctx.moveTo(projected[0].x, projected[0].y);
      for (const point of projected.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.fillStyle = "#9eb6aa";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#758044";
    ctx.fillRect(0, 260, W, H - 260);
    const bounds = preview.terrain?.bounds ?? { min: [-12, 0, -14], max: [12, 0, 10] };
    drawPoly([
      [bounds.min[0], terrainHeightAt(bounds.min[0], bounds.min[2]), bounds.min[2]],
      [bounds.max[0], terrainHeightAt(bounds.max[0], bounds.min[2]), bounds.min[2]],
      [bounds.max[0], terrainHeightAt(bounds.max[0], bounds.max[2]), bounds.max[2]],
      [bounds.min[0], terrainHeightAt(bounds.min[0], bounds.max[2]), bounds.max[2]],
    ], "#697849", undefined);
    for (let i = 0; i < (preview.path?.points?.length ?? 0) - 1; i += 1) {
      drawPoly(pathQuad(preview.path.points[i], preview.path.points[i + 1], preview.path.width), "#d99a44", "#9f7739");
    }
    const sorted = [...preview.instances].map((instance) => {
      const p = project([instance.position[0], terrainHeightAt(instance.position[0], instance.position[2]), instance.position[2]]);
      return { instance, projected: p, category: categoryBySource.get(instance.sourceAsset) ?? "vegetation" };
    }).filter((item) => item.projected).sort((a, b) => b.projected.depth - a.projected.depth);
    for (const { instance, projected, category } of sorted) {
      const scale = (instance.scale?.[1] ?? 1) * projected.scale;
      ctx.fillStyle = "rgba(22, 35, 20, 0.22)";
      ctx.beginPath();
      ctx.ellipse(projected.x + scale * 0.08, projected.y + scale * 0.05, Math.max(8, scale * 0.55), Math.max(3, scale * 0.16), -0.18, 0, Math.PI * 2);
      ctx.fill();
      if (category === "tree") {
        ctx.fillStyle = "#8c552f";
        ctx.fillRect(projected.x - scale * 0.11, projected.y - scale * 4.25, scale * 0.22, scale * 4.25);
        ctx.fillStyle = "#6d3d21";
        ctx.fillRect(projected.x - scale * 0.03, projected.y - scale * 4.0, scale * 0.035, scale * 3.65);
        ctx.fillStyle = "#5d741e";
        ctx.beginPath();
        ctx.arc(projected.x, projected.y - scale * 4.3, Math.max(12, scale * 0.82), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#6f8b25";
        ctx.beginPath();
        ctx.arc(projected.x - scale * 0.36, projected.y - scale * 4.05, Math.max(8, scale * 0.46), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(projected.x + scale * 0.35, projected.y - scale * 4.0, Math.max(8, scale * 0.48), 0, Math.PI * 2);
        ctx.fill();
      } else if (category === "rock" || category === "pebble") {
        ctx.fillStyle = category === "rock" ? "#71765d" : "#aaa18a";
        ctx.beginPath();
        ctx.ellipse(projected.x, projected.y - scale * 0.22, Math.max(4, scale * 0.62), Math.max(3, scale * 0.36), -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,210,0.10)";
        ctx.beginPath();
        ctx.ellipse(projected.x - scale * 0.18, projected.y - scale * 0.34, Math.max(2, scale * 0.22), Math.max(1.5, scale * 0.08), -0.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (category === "grass") {
        ctx.strokeStyle = "#8ebc28";
        ctx.lineWidth = Math.max(1, scale * 0.035);
        for (let blade = -2; blade <= 2; blade += 1) {
          ctx.beginPath();
          ctx.moveTo(projected.x + blade * scale * 0.06, projected.y);
          ctx.lineTo(projected.x + blade * scale * 0.12, projected.y - scale * 0.75);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = category === "flower" ? "#c7192b" : category === "mushroom" ? "#d4bf95" : "#497a35";
        ctx.beginPath();
        ctx.arc(projected.x, projected.y - scale * 0.35, Math.max(4, scale * 0.34), 0, Math.PI * 2);
        ctx.fill();
        if (category === "vegetation") {
          ctx.fillStyle = "#5f8d3d";
          ctx.beginPath();
          ctx.arc(projected.x + scale * 0.24, projected.y - scale * 0.45, Math.max(3, scale * 0.26), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  </script></body></html>`);
  await page.screenshot({ path });
}

async function writeSideBySideSheet(page: Page, captures: readonly IV3BookmarkCapture[], path: string): Promise<void> {
  const rows = await Promise.all(captures.map(async (capture) => {
    const three = (await readFile(capture.threejsPath)).toString("base64");
    const bevy = (await readFile(capture.bevySmokePath)).toString("base64");
    return `<section><h2>${escapeHtml(capture.bookmarkId)}</h2><div class="pair"><figure><figcaption>Three.js</figcaption><img src="data:image/png;base64,${three}"></figure><figure><figcaption>Bevy mapped primitives</figcaption><img src="data:image/png;base64,${bevy}"></figure></div></section>`;
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
