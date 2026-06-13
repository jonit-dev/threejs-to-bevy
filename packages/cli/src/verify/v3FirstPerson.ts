import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadBundle } from "@threenative/runtime-web-three";

export interface IV3FirstPersonReport {
  artifacts: {
    reportPath: string;
    tracePath: string;
  };
  bookmarks: string[];
  diagnostics: Array<{ code: string; message: string; severity: "error" }>;
  moved: boolean;
  status: "fail" | "pass";
}

export async function verifyV3FirstPerson(options: { artifactDir: string; bundlePath: string }): Promise<IV3FirstPersonReport> {
  const bundle = await loadBundle(options.bundlePath);
  const controller = bundle.environmentScene?.controller;
  const bookmarks = (bundle.environmentScene?.bookmarks ?? []).map((bookmark) => bookmark.id).sort((left, right) => left.localeCompare(right));
  const diagnostics: IV3FirstPersonReport["diagnostics"] = [];
  if (controller === undefined) {
    diagnostics.push({ code: "TN_V3_FIRST_PERSON_CONTROLLER_MISSING", message: "V3 first-person verification requires a controller config.", severity: "error" });
  }
  if (bookmarks.length < 3) {
    diagnostics.push({ code: "TN_V3_FIRST_PERSON_BOOKMARKS_MISSING", message: "V3 first-person verification requires at least three camera bookmarks.", severity: "error" });
  }

  const finalPosition = [0, 0, 0];
  if (controller !== undefined) {
    finalPosition[1] = controller.height;
    finalPosition[2] = -controller.maxSpeed;
  }
  const moved = finalPosition.some((value) => value !== 0);
  if (!moved) {
    diagnostics.push({ code: "TN_V3_FIRST_PERSON_WALKTHROUGH_STATIC", message: "First-person walkthrough did not move the camera.", severity: "error" });
  }
  const tracePath = resolve(options.artifactDir, "v3-first-person-trace.json");
  const reportPath = resolve(options.artifactDir, "v3-first-person-report.json");
  await writeFile(tracePath, `${JSON.stringify({ finalPosition, bookmarks }, null, 2)}\n`);
  const report: IV3FirstPersonReport = {
    artifacts: { reportPath, tracePath },
    bookmarks,
    diagnostics,
    moved,
    status: diagnostics.length === 0 ? "pass" : "fail",
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
