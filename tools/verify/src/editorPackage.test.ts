import assert from "node:assert/strict";
import test from "node:test";

import { editorPackageArtifactPaths } from "./editorPackage.js";

test("should describe editor package smoke artifacts", () => {
  assert.deepEqual(editorPackageArtifactPaths("/repo"), {
    assetsManifest: "/repo/tools/verify/artifacts/editor-package/assets.after-edit.manifest.json",
    editedScreenshot: "/repo/tools/verify/artifacts/editor-package/editor-package-edited.png",
    environmentScene: "/repo/tools/verify/artifacts/editor-package/environment.after-edit.scene.json",
    report: "/repo/tools/verify/artifacts/editor-package/editor-package-report.json",
    sourceScene: "/repo/tools/verify/artifacts/editor-package/arena.scene.after-edit.json",
    smokeScreenshot: "/repo/tools/verify/artifacts/editor-package/editor-package-smoke.png",
    worldIr: "/repo/tools/verify/artifacts/editor-package/world.after-edit.ir.json",
  });
});
