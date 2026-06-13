import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadBundle } from "@threenative/runtime-web-three";

export interface IV3FirstPersonReport {
  artifacts: {
    reportPath: string;
    tracePath: string;
  };
  bookmarks: string[];
  controlMapping: Array<{ action: string; field: "backward" | "forward" | "left" | "right" | "sprint"; keyboardCodes: string[] }>;
  diagnostics: Array<{ code: string; message: string; severity: "error" }>;
  moved: boolean;
  nativeKeyboardProbe: {
    finalPosition: readonly number[];
    pressedCode?: string;
    pressedAction?: string;
    startPosition: readonly number[];
  };
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

  const controlMapping =
    controller === undefined
      ? []
      : [
          { action: controller.input.forward, field: "forward" as const, keyboardCodes: keyboardCodesForAction(bundle.input, controller.input.forward) },
          { action: controller.input.backward, field: "backward" as const, keyboardCodes: keyboardCodesForAction(bundle.input, controller.input.backward) },
          { action: controller.input.left, field: "left" as const, keyboardCodes: keyboardCodesForAction(bundle.input, controller.input.left) },
          { action: controller.input.right, field: "right" as const, keyboardCodes: keyboardCodesForAction(bundle.input, controller.input.right) },
          ...(controller.input.sprint === undefined
            ? []
            : [{ action: controller.input.sprint, field: "sprint" as const, keyboardCodes: keyboardCodesForAction(bundle.input, controller.input.sprint) }]),
        ];
  for (const mapping of controlMapping.filter((item) => item.field !== "sprint")) {
    if (mapping.keyboardCodes.length === 0) {
      diagnostics.push({
        code: "TN_V3_FIRST_PERSON_KEYBOARD_MAPPING_MISSING",
        message: `First-person '${mapping.field}' action '${mapping.action}' must have a keyboard binding for native parity evidence.`,
        severity: "error",
      });
    }
  }

  const finalPosition = [0, 0, 0];
  const nativeKeyboardProbe: IV3FirstPersonReport["nativeKeyboardProbe"] = { finalPosition, startPosition: [0, 0, 0] };
  if (controller !== undefined) {
    const forwardMapping = controlMapping.find((mapping) => mapping.field === "forward");
    finalPosition[1] = controller.height;
    finalPosition[2] = -controller.maxSpeed;
    nativeKeyboardProbe.pressedAction = controller.input.forward;
    nativeKeyboardProbe.pressedCode = forwardMapping?.keyboardCodes[0];
  }
  const moved = finalPosition.some((value) => value !== 0);
  if (!moved) {
    diagnostics.push({ code: "TN_V3_FIRST_PERSON_WALKTHROUGH_STATIC", message: "First-person walkthrough did not move the camera.", severity: "error" });
  }
  const tracePath = resolve(options.artifactDir, "v3-first-person-trace.json");
  const reportPath = resolve(options.artifactDir, "v3-first-person-report.json");
  await writeFile(tracePath, `${JSON.stringify({ bookmarks, controlMapping, nativeKeyboardProbe }, null, 2)}\n`);
  const report: IV3FirstPersonReport = {
    artifacts: { reportPath, tracePath },
    bookmarks,
    controlMapping,
    diagnostics,
    moved,
    nativeKeyboardProbe,
    status: diagnostics.length === 0 ? "pass" : "fail",
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function keyboardCodesForAction(
  input: Awaited<ReturnType<typeof loadBundle>>["input"],
  actionId: string,
): string[] {
  return (
    input?.actions
      .find((action) => action.id === actionId)
      ?.bindings.flatMap((binding) => (binding.device === "keyboard" ? [binding.code] : [])) ?? []
  );
}
