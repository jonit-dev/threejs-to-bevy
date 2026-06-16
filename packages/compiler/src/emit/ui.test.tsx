/** @jsxImportSource @threenative/ui */
import assert from "node:assert/strict";
import test from "node:test";

import { Bar, Button, Column, Text, Ui } from "@threenative/ui";

import { emitUi } from "./ui.js";

test("ui should emit hud and pause ui ir", () => {
  const emitted = emitUi(
    <Ui id="hud">
      <Column id="hud.stack">
        <Text id="hud.health.label" text="Health" />
        <Bar id="hud.health" max={100} binding={{ kind: "resource", name: "Health", field: "current" }} />
        <Button id="hud.pause" label="Pause" action="Pause" focusable />
        <Button id="hud.locked" label="Locked" action="Locked" disabled />
      </Column>
    </Ui>,
  );

  assert.equal(emitted.schema, "threenative.ui");
  assert.equal(emitted.root.children?.[0]?.kind, "column");
  assert.deepEqual(
    emitted.root.children?.[0]?.children?.map((node) => node.kind),
    ["text", "bar", "button", "button"],
  );
  assert.equal(emitted.root.children?.[0]?.children?.[2]?.action, "Pause");
  assert.equal(emitted.root.children?.[0]?.children?.[3]?.disabled, true);
});
