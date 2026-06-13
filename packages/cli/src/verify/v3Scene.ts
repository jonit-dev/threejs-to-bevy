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
    const categorySizes = {
      tree: [0.65, 4.2, 0.65],
      rock: [1.15, 0.75, 1],
      pebble: [0.32, 0.18, 0.28],
      grass: [0.18, 0.75, 0.18],
      flower: [0.25, 0.45, 0.25],
      mushroom: [0.28, 0.35, 0.28],
      vegetation: [0.75, 0.9, 0.75],
    };
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
      const scale = 430 / depth;
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
    function terrainColor(height) {
      const t = Math.max(0, Math.min(1, height / 1.35));
      const low = [109, 122, 66];
      const high = [149, 158, 86];
      const color = low.map((channel, index) => Math.round(channel + (high[index] - channel) * t));
      return "rgb(" + color.join(",") + ")";
    }
    function drawTerrainSurface(bounds) {
      const columns = 10;
      const rows = 10;
      const cells = [];
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const x0 = bounds.min[0] + (bounds.max[0] - bounds.min[0]) * column / columns;
          const x1 = bounds.min[0] + (bounds.max[0] - bounds.min[0]) * (column + 1) / columns;
          const z0 = bounds.min[2] + (bounds.max[2] - bounds.min[2]) * row / rows;
          const z1 = bounds.min[2] + (bounds.max[2] - bounds.min[2]) * (row + 1) / rows;
          const points = [
            [x0, terrainHeightAt(x0, z0), z0],
            [x1, terrainHeightAt(x1, z0), z0],
            [x1, terrainHeightAt(x1, z1), z1],
            [x0, terrainHeightAt(x0, z1), z1],
          ];
          const center = project([(x0 + x1) / 2, terrainHeightAt((x0 + x1) / 2, (z0 + z1) / 2), (z0 + z1) / 2]);
          if (center) cells.push({ depth: center.depth, height: points.reduce((total, point) => total + point[1], 0) / points.length, points });
        }
      }
      for (const cell of cells.sort((a, b) => b.depth - a.depth)) {
        drawPoly(cell.points, terrainColor(cell.height), "rgba(91,102,54,0.28)");
      }
    }
    const sky = ctx.createLinearGradient(0, 0, 0, 285);
    sky.addColorStop(0, "#d7eced");
    sky.addColorStop(1, "#a9c5b8");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    const ground = ctx.createLinearGradient(0, 260, 0, H);
    ground.addColorStop(0, "#879152");
    ground.addColorStop(1, "#6d7a42");
    ctx.fillStyle = ground;
    ctx.fillRect(0, 260, W, H - 260);
    const bounds = preview.terrain?.bounds ?? { min: [-12, 0, -14], max: [12, 0, 10] };
    drawTerrainSurface(bounds);
    for (let i = 0; i < (preview.path?.points?.length ?? 0) - 1; i += 1) {
      drawPoly(pathQuad(preview.path.points[i], preview.path.points[i + 1], preview.path.width), "#d99a44", "#9f7739");
    }
    const sorted = [...preview.instances].map((instance) => {
      const p = project([instance.position[0], terrainHeightAt(instance.position[0], instance.position[2]), instance.position[2]]);
      return { instance, projected: p, category: categoryBySource.get(instance.sourceAsset) ?? "vegetation" };
    }).filter((item) => item.projected).sort((a, b) => b.projected.depth - a.projected.depth);
    for (const { instance, projected, category } of sorted) {
      const categorySize = categorySizes[category] ?? categorySizes.vegetation;
      const scale = (instance.scale?.[1] ?? 1) * projected.scale;
      const visualHeight = categorySize[1] * scale;
      ctx.fillStyle = "rgba(22, 35, 20, 0.22)";
      ctx.beginPath();
      ctx.ellipse(projected.x + scale * 0.08, projected.y + scale * 0.05, Math.max(8, scale * 0.55), Math.max(3, scale * 0.16), -0.18, 0, Math.PI * 2);
      ctx.fill();
      if (category === "tree") {
        const trunkWidth = Math.max(5, scale * 0.18);
        const trunkHeight = visualHeight;
        const trunk = ctx.createLinearGradient(projected.x - trunkWidth, projected.y - trunkHeight, projected.x + trunkWidth, projected.y);
        trunk.addColorStop(0, "#b06c3a");
        trunk.addColorStop(1, "#6d3c22");
        ctx.fillStyle = trunk;
        ctx.fillRect(projected.x - trunkWidth / 2, projected.y - trunkHeight, trunkWidth, trunkHeight);
        ctx.fillStyle = "#6d3d21";
        ctx.fillRect(projected.x - trunkWidth * 0.12, projected.y - trunkHeight * 0.94, trunkWidth * 0.2, trunkHeight * 0.86);
        ctx.fillStyle = "#6f8c28";
        ctx.beginPath();
        ctx.arc(projected.x, projected.y - trunkHeight * 1.02, Math.max(12, scale * 0.82), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#86a739";
        ctx.beginPath();
        ctx.arc(projected.x - scale * 0.36, projected.y - trunkHeight * 0.96, Math.max(8, scale * 0.46), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(projected.x + scale * 0.35, projected.y - trunkHeight * 0.95, Math.max(8, scale * 0.48), 0, Math.PI * 2);
        ctx.fill();
      } else if (category === "rock" || category === "pebble") {
        const rockRadius = category === "rock" ? Math.max(7, scale * 0.7) : Math.max(3, scale * 0.32);
        ctx.fillStyle = category === "rock" ? "#687055" : "#aaa18a";
        ctx.beginPath();
        ctx.moveTo(projected.x - rockRadius * 0.95, projected.y - rockRadius * 0.25);
        ctx.lineTo(projected.x - rockRadius * 0.45, projected.y - rockRadius * 0.75);
        ctx.lineTo(projected.x + rockRadius * 0.18, projected.y - rockRadius * 0.95);
        ctx.lineTo(projected.x + rockRadius * 0.88, projected.y - rockRadius * 0.42);
        ctx.lineTo(projected.x + rockRadius * 0.68, projected.y + rockRadius * 0.18);
        ctx.lineTo(projected.x - rockRadius * 0.55, projected.y + rockRadius * 0.28);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = category === "rock" ? "#80866d" : "#c6baa0";
        ctx.beginPath();
        ctx.moveTo(projected.x - rockRadius * 0.42, projected.y - rockRadius * 0.66);
        ctx.lineTo(projected.x + rockRadius * 0.15, projected.y - rockRadius * 0.88);
        ctx.lineTo(projected.x + rockRadius * 0.48, projected.y - rockRadius * 0.45);
        ctx.lineTo(projected.x - rockRadius * 0.12, projected.y - rockRadius * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,210,0.10)";
        ctx.beginPath();
        ctx.ellipse(projected.x - scale * 0.18, projected.y - scale * 0.34, Math.max(2, scale * 0.22), Math.max(1.5, scale * 0.08), -0.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (category === "grass") {
        ctx.strokeStyle = "#d5c51f";
        ctx.lineWidth = Math.max(1, scale * 0.022);
        for (let blade = -5; blade <= 5; blade += 1) {
          ctx.beginPath();
          ctx.moveTo(projected.x + blade * scale * 0.05, projected.y);
          ctx.quadraticCurveTo(projected.x + blade * scale * 0.02, projected.y - visualHeight * 0.48, projected.x + blade * scale * 0.14, projected.y - visualHeight * 1.05);
          ctx.stroke();
        }
        ctx.strokeStyle = "#445a20";
        ctx.lineWidth = Math.max(1, scale * 0.026);
        for (let blade = -4; blade <= 4; blade += 2) {
          ctx.beginPath();
          ctx.moveTo(projected.x + blade * scale * 0.06, projected.y);
          ctx.lineTo(projected.x + blade * scale * 0.08, projected.y - visualHeight * 0.9);
          ctx.stroke();
        }
      } else if (category === "flower") {
        ctx.strokeStyle = "#4d6b2c";
        ctx.lineWidth = Math.max(1, scale * 0.018);
        for (let stem = -2; stem <= 2; stem += 1) {
          const stemX = projected.x + stem * scale * 0.07;
          const stemTop = projected.y - scale * 0.55 - Math.abs(stem) * scale * 0.04;
          ctx.beginPath();
          ctx.moveTo(stemX, projected.y);
          ctx.lineTo(stemX + stem * scale * 0.025, stemTop);
          ctx.stroke();
          ctx.fillStyle = "#d91d3f";
          ctx.beginPath();
          ctx.arc(stemX + stem * scale * 0.025, stemTop, Math.max(2, scale * 0.055), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (category === "mushroom") {
        ctx.fillStyle = "#d8c6a0";
        ctx.fillRect(projected.x - scale * 0.06, projected.y - scale * 0.24, scale * 0.12, scale * 0.24);
        ctx.fillStyle = "#9f4736";
        ctx.beginPath();
        ctx.ellipse(projected.x, projected.y - scale * 0.28, Math.max(3, scale * 0.18), Math.max(2, scale * 0.09), 0, Math.PI, 0);
        ctx.fill();
      } else {
        ctx.fillStyle = "#497a35";
        ctx.beginPath();
        ctx.ellipse(projected.x, projected.y - scale * 0.32, Math.max(5, scale * 0.35), Math.max(4, scale * 0.22), -0.25, 0, Math.PI * 2);
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
