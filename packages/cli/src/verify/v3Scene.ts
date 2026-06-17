import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { promisify } from "node:util";
import { loadBundle, observeEnvironmentScene, startWebPreview } from "@threenative/runtime-web-three";
import { chromium, type Page } from "playwright";

import { readPngFrame } from "./compareImages.js";
import { analyzeNonblank } from "./imageAnalysis.js";

const execFileAsync = promisify(execFile);

interface IV3BookmarkCapture {
  bookmarkId: string;
  bevyGltfPath: string;
  sideBySidePath: string;
  threejsPath: string;
}

interface IV3ScreenshotCaptureResult {
  captures: IV3BookmarkCapture[];
  targetVsOutputContactSheetPath?: string;
}

interface IV3TargetReferenceEvidence {
  artifactPath: string;
  assetId: string;
  bundleRelativePath: string;
  sha256: string;
  sourcePath: string;
  status: "found";
}

interface IV3MissingTargetReferenceEvidence {
  reason: string;
  status: "missing";
}

type V3TargetReferenceEvidence = IV3MissingTargetReferenceEvidence | IV3TargetReferenceEvidence;

export interface IV3SceneReport {
  artifacts: {
    bundleHash: string;
    environmentIrPath: string;
    reportPath: string;
    sideBySideContactSheetPath?: string;
    targetReferencePath?: string;
    targetVsOutputContactSheetPath?: string;
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
  visualReview: {
    manualReview: {
      required: true;
      status: "not-recorded";
      summary: string;
    };
    targetReference: V3TargetReferenceEvidence;
    targetVsOutput: {
      contactSheetPath?: string;
      status: "captured" | "not-captured";
    };
    visualParity: {
      targetReference: "manual-review-required" | "reference-missing";
      threeJsVsBevy: "not-asserted";
    };
  };
}

type V3ScreenshotCapturer = (options: {
  artifactDir: string;
  bookmarkIds: readonly string[];
  bundlePath: string;
  targetReferencePath?: string;
}) => Promise<IV3BookmarkCapture[] | IV3ScreenshotCaptureResult>;

export async function verifyV3Scene(options: {
  artifactDir: string;
  bundlePath: string;
  screenshotCapturer?: V3ScreenshotCapturer;
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
      targetReference: { reason: "environment.scene.json is missing, so Preview_2 target evidence cannot be resolved.", status: "missing" },
    });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    return report;
  }
  const targetReference = await resolveTargetReferenceEvidence({ artifactDir: options.artifactDir, bundlePath: options.bundlePath, bundle });
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
  const captureResult =
    diagnostics.length === 0
      ? normalizeCaptureResult(await capture({
        artifactDir: options.artifactDir,
        bookmarkIds,
        bundlePath: options.bundlePath,
        targetReferencePath: targetReference.status === "found" ? targetReference.artifactPath : undefined,
      }))
      : { captures: [] };
  const captures = captureResult.captures;
  for (const item of captures) {
    const nonblank = analyzeNonblank(await readPngFrame(item.threejsPath));
    if (!nonblank.ok) {
      diagnostics.push({
        code: "TN_V3_SCENE_SCREENSHOT_BLANK",
        message: `Bookmark '${item.bookmarkId}' produced a blank or near-blank Three.js screenshot at '${item.threejsPath}'.`,
        severity: "error" as const,
      });
    }
    const bevyNonblank = analyzeNonblank(await readPngFrame(item.bevyGltfPath));
    if (!bevyNonblank.ok) {
      diagnostics.push({
        code: "TN_V3_SCENE_BEVY_SCREENSHOT_BLANK",
        message: `Bookmark '${item.bookmarkId}' produced a blank or near-blank Bevy GLTF screenshot at '${item.bevyGltfPath}'.`,
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
    targetReference,
    targetVsOutputContactSheetPath: captureResult.targetVsOutputContactSheetPath,
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
  targetReference: V3TargetReferenceEvidence;
  targetVsOutputContactSheetPath?: string;
}): IV3SceneReport {
  return {
    artifacts: {
      bundleHash: options.bundleHash,
      environmentIrPath: options.environmentIrPath,
      reportPath: options.reportPath,
      sideBySideContactSheetPath: options.sideBySideContactSheetPath,
      targetReferencePath: options.targetReference.status === "found" ? options.targetReference.artifactPath : undefined,
      targetVsOutputContactSheetPath: options.targetVsOutputContactSheetPath,
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
    visualReview: {
      manualReview: {
        required: true,
        status: "not-recorded",
        summary: "Automated verification captures target/output evidence, but a human Preview_2 close-match review has not been recorded in this report.",
      },
      targetReference: options.targetReference,
      targetVsOutput: {
        contactSheetPath: options.targetVsOutputContactSheetPath,
        status: options.targetVsOutputContactSheetPath === undefined ? "not-captured" : "captured",
      },
      visualParity: {
        targetReference: options.targetReference.status === "found" ? "manual-review-required" : "reference-missing",
        threeJsVsBevy: "not-asserted",
      },
    },
  };
}

async function hashFile(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function normalizeCaptureResult(result: IV3BookmarkCapture[] | IV3ScreenshotCaptureResult): IV3ScreenshotCaptureResult {
  return Array.isArray(result) ? { captures: result } : result;
}

async function resolveTargetReferenceEvidence(options: {
  artifactDir: string;
  bundle: Awaited<ReturnType<typeof loadBundle>>;
  bundlePath: string;
}): Promise<V3TargetReferenceEvidence> {
  const referenceImage = options.bundle.environmentScene?.referenceImage;
  if (referenceImage === undefined) {
    return { reason: "environment.scene.json does not declare referenceImage.", status: "missing" };
  }
  const asset = options.bundle.assets.assets.find((candidate) => candidate.id === referenceImage);
  if (asset === undefined || asset.kind !== "texture") {
    return { reason: `referenceImage '${referenceImage}' does not resolve to a texture asset.`, status: "missing" };
  }
  if (asset.path === undefined) {
    return { reason: `referenceImage '${referenceImage}' does not resolve to a bundle-local texture asset.`, status: "missing" };
  }

  const sourcePath = resolve(options.bundlePath, asset.path);
  const screenshotDir = resolve(options.artifactDir, "screenshots");
  const artifactPath = resolve(screenshotDir, basename(asset.path));
  try {
    await mkdir(screenshotDir, { recursive: true });
    await copyFile(sourcePath, artifactPath);
    return {
      artifactPath,
      assetId: asset.id,
      bundleRelativePath: asset.path,
      sha256: await hashFile(sourcePath),
      sourcePath,
      status: "found",
    };
  } catch (error) {
    return {
      reason: `Failed to copy reference image '${asset.path}' from the bundle: ${error instanceof Error ? error.message : String(error)}`,
      status: "missing",
    };
  }
}

async function captureBookmarkScreenshots(options: {
  artifactDir: string;
  bookmarkIds: readonly string[];
  bundlePath: string;
  targetReferencePath?: string;
}): Promise<IV3ScreenshotCaptureResult> {
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
      const bevyGltfPath = resolve(screenshotDir, `${slug}.bevy-gltf.png`);
      await page.goto(`${server.url}?bundle=/bundle&bookmark=${encodeURIComponent(bookmarkId)}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction("Boolean(globalThis.__THREENATIVE_READY__)", undefined, { timeout: 10000 });
      await page.screenshot({ path: threejsPath });
      await writeBevyGltfCapture(bevyGltfPath, options.bundlePath, bookmarkId);
      captures.push({ bookmarkId, bevyGltfPath, sideBySidePath: "", threejsPath });
    }
    const sideBySidePath = resolve(screenshotDir, "threejs-bevy-side-by-side.png");
    await writeSideBySideSheet(page, captures, sideBySidePath);
    const capturesWithSheet = captures.map((capture) => ({ ...capture, sideBySidePath }));
    if (options.targetReferencePath === undefined) {
      return { captures: capturesWithSheet };
    }
    const targetVsOutputContactSheetPath = resolve(screenshotDir, "preview2-target-vs-output.png");
    await writeTargetVsOutputSheet(page, capturesWithSheet, options.targetReferencePath, targetVsOutputContactSheetPath);
    return { captures: capturesWithSheet, targetVsOutputContactSheetPath };
  } finally {
    await browser.close();
    await server.close();
  }
}

async function writeBevyGltfCapture(path: string, bundlePath: string, bookmarkId: string): Promise<void> {
  await execFileAsync(
    "cargo",
    ["run", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_capture", "--", bundlePath, bookmarkId, path],
    {
      cwd: resolve(process.cwd(), "runtime-bevy"),
      timeout: 180_000,
    },
  );
}
async function writeSideBySideSheet(page: Page, captures: readonly IV3BookmarkCapture[], path: string): Promise<void> {
  const rows = await Promise.all(captures.map(async (capture) => {
    const three = (await readFile(capture.threejsPath)).toString("base64");
    const bevy = (await readFile(capture.bevyGltfPath)).toString("base64");
    return `<section><h2>${escapeHtml(capture.bookmarkId)}</h2><div class="pair"><figure><figcaption>Three.js</figcaption><img src="data:image/png;base64,${three}"></figure><figure><figcaption>Bevy GLTF model mapping</figcaption><img src="data:image/png;base64,${bevy}"></figure></div></section>`;
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

async function writeTargetVsOutputSheet(page: Page, captures: readonly IV3BookmarkCapture[], targetReferencePath: string, path: string): Promise<void> {
  const target = (await readFile(targetReferencePath)).toString("base64");
  const targetMime = mimeForImagePath(targetReferencePath);
  const rows = await Promise.all(captures.map(async (capture) => {
    const three = (await readFile(capture.threejsPath)).toString("base64");
    const bevy = (await readFile(capture.bevyGltfPath)).toString("base64");
    return `<section><h2>${escapeHtml(capture.bookmarkId)}</h2><div class="trio"><figure><figcaption>Preview_2 target</figcaption><img src="data:${targetMime};base64,${target}"></figure><figure><figcaption>Three.js output</figcaption><img src="data:image/png;base64,${three}"></figure><figure><figcaption>Bevy GLTF output</figcaption><img src="data:image/png;base64,${bevy}"></figure></div></section>`;
  }));
  await page.setViewportSize({ height: Math.max(720, captures.length * 430), width: 1680 });
  await page.setContent(`<!doctype html><html><head><style>
    body{margin:0;background:#151712;color:#f1ead8;font:16px system-ui,sans-serif}
    section{padding:18px 20px 24px;border-bottom:1px solid #34382a}
    h2{font-size:18px;margin:0 0 10px}
    .trio{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
    figure{margin:0}
    figcaption{font-size:14px;margin:0 0 6px;color:#d3c8aa}
    img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#0f1110}
  </style></head><body>${rows.join("")}</body></html>`);
  await page.screenshot({ fullPage: true, path });
}

function slugify(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function mimeForImagePath(path: string): "image/jpeg" | "image/png" {
  const extension = extname(path).toLowerCase();
  return extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
