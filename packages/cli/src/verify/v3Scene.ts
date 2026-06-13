import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadBundle, observeEnvironmentScene } from "@threenative/runtime-web-three";

export interface IV3SceneReport {
  artifacts: {
    bundleHash: string;
    environmentIrPath: string;
    reportPath: string;
  };
  counts: {
    bookmarks: number;
    heroPlacements: number;
    pathPoints: number;
    scatterInstances: number;
  };
  diagnostics: Array<{ code: string; message: string; severity: "error" }>;
  status: "fail" | "pass";
}

export async function verifyV3Scene(options: { artifactDir: string; bundlePath: string }): Promise<IV3SceneReport> {
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
  const report = makeReport({
    bundleHash: await hashFile(environmentIrPath),
    counts: {
      bookmarks: observation.bookmarks.length,
      heroPlacements: observation.heroPlacementIds.length,
      pathPoints: observation.pathPointCount,
      scatterInstances: observation.scatterInstanceCount,
    },
    diagnostics,
    environmentIrPath,
    reportPath,
  });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function makeReport(options: {
  bundleHash: string;
  counts?: IV3SceneReport["counts"];
  diagnostics: IV3SceneReport["diagnostics"];
  environmentIrPath: string;
  reportPath: string;
}): IV3SceneReport {
  return {
    artifacts: {
      bundleHash: options.bundleHash,
      environmentIrPath: options.environmentIrPath,
      reportPath: options.reportPath,
    },
    counts: options.counts ?? { bookmarks: 0, heroPlacements: 0, pathPoints: 0, scatterInstances: 0 },
    diagnostics: options.diagnostics,
    status: options.diagnostics.length === 0 ? "pass" : "fail",
  };
}

async function hashFile(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
