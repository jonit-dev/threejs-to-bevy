import assert from "node:assert/strict";
import test from "node:test";

import { editorPackageArtifactPaths } from "./editorPackage.js";

test("should describe editor package smoke artifacts", () => {
  assert.deepEqual(editorPackageArtifactPaths("/repo"), {
    report: "/repo/tools/verify/artifacts/editor-package/editor-package-report.json",
    screenshot: "/repo/tools/verify/artifacts/editor-package/editor-package-smoke.png",
  });
});
