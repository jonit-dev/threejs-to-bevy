import assert from "node:assert/strict";
import test from "node:test";

import { editorPackageArtifactPaths } from "./editorPackage.js";

test("should describe editor package smoke artifacts", () => {
  assert.deepEqual(editorPackageArtifactPaths("/repo"), {
    editedScreenshot: "/repo/tools/verify/artifacts/editor-package/editor-package-edited.png",
    report: "/repo/tools/verify/artifacts/editor-package/editor-package-report.json",
    sourceScene: "/repo/tools/verify/artifacts/editor-package/arena.scene.after-edit.json",
    smokeScreenshot: "/repo/tools/verify/artifacts/editor-package/editor-package-smoke.png",
    worldIr: "/repo/tools/verify/artifacts/editor-package/world.after-edit.ir.json",
  });
});
