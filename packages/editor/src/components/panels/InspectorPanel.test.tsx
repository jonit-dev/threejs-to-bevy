import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { InspectorPanel } from "./InspectorPanel.js";

test("should render generated rows read-only", () => {
  const html = renderToStaticMarkup(
    <InspectorPanel rows={[{ access: "inspectableOnly", id: "generated", label: "Generated row", readOnly: true, value: "inspect" }]} />,
  );

  assert.match(html, /data-readonly="true"/);
  assert.match(html, /readOnly=""/);
});
