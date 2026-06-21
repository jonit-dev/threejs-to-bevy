import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { validatePreviewBundleRoute } from "../server/previewRoutes.js";
import { PreviewHost } from "./PreviewHost.js";

test("should render build error diagnostics", () => {
  const html = renderToStaticMarkup(<PreviewHost state={{ diagnostics: [{ code: "TN_TEST", message: "Build failed.", severity: "error" }], status: "error" }} />);

  assert.match(html, /Build failed/);
  assert.doesNotMatch(html, /Ready:/);
});

test("should render ready state with bundle path", () => {
  const html = renderToStaticMarkup(<PreviewHost state={{ bundlePath: "dist/game.bundle", status: "ready" }} />);

  assert.match(html, /Runtime Preview/);
  assert.match(html, /dist\/game.bundle/);
});

test("should reject preview paths outside the project", () => {
  const result = validatePreviewBundleRoute({ bundlePath: "../outside/game.bundle", projectPath: "/project" });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0]?.code, "TN_EDITOR_PREVIEW_BUNDLE_REJECTED");
});
