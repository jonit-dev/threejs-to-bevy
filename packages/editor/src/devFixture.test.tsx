import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { EditorApp } from "./EditorApp.js";
import { devFixtureModel } from "./devFixtureModel.js";

test("should render static editor fixture", () => {
  const html = renderToStaticMarkup(<EditorApp model={devFixtureModel} />);

  assert.match(html, /structured-source-starter/);
  assert.match(html, /arena.scene.json/);
  assert.match(html, /player/);
  assert.match(html, /model.level/);
  assert.match(html, /Static editor fixture loaded/);
});
