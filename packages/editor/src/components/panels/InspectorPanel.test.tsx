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

test("should render typed inspector controls from field metadata", () => {
  const html = renderToStaticMarkup(
    <InspectorPanel
      rows={[
        { access: "sourcePersistable", component: "Camera", fieldKind: "enum", id: "mode", label: "Mode", options: ["perspective", "orthographic"], readOnly: false, value: "perspective" },
        { access: "sourcePersistable", component: "Light", fieldKind: "number", id: "intensity", label: "Intensity", readOnly: true, readOnlyReason: "unsupported", value: "1" },
        { access: "sourcePersistable", component: "Script", fieldKind: "script", id: "script", label: "Script", readOnly: false, value: "./spin.ts#spin" },
        { access: "sourcePersistable", component: "Input", fieldKind: "stringList", id: "bindings", label: "Bindings", readOnly: false, value: "keyboard.Space" },
      ]}
    />,
  );

  assert.match(html, /<select/);
  assert.match(html, /<option value="orthographic"/);
  assert.match(html, /type="number"/);
  assert.match(html, /Script module/);
  assert.match(html, /Bindings/);
  assert.match(html, /title="unsupported"/);
});

test("should edit script references as module and export fields", () => {
  const html = renderToStaticMarkup(
    <InspectorPanel
      rows={[
        {
          access: "sourcePersistable",
          component: "Script",
          fieldKind: "script",
          id: "script",
          label: "spin Script",
          operation: {
            args: { exportName: "spin", file: "content/systems/arena.systems.json", systemId: "spin" },
            name: "system.attach_script",
            valueArg: "modulePath",
          },
          readOnly: false,
          sourceFamily: "system",
          value: "src/scripts/spin.ts#spin",
        },
      ]}
    />,
  );

  assert.match(html, /spin Script module/);
  assert.match(html, /spin Script export/);
  assert.match(html, /src\/scripts\/spin\.ts/);
  assert.match(html, /value="spin"/);
  assert.doesNotMatch(html, /textarea/);
  assert.doesNotMatch(html, /script body/i);
});
