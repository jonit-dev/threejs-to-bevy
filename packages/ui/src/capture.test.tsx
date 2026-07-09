/** @jsxImportSource @threenative/ui */
import assert from "node:assert/strict";
import test from "node:test";

import { Button, Component, Slider, TextInput, Ui, captureUi } from "./index.js";

test("captureUi should author textInput and component instances from TSX", () => {
  const captured = captureUi(
    <Ui id="hud">
      <TextInput id="player-name" label="Player name" action="SetPlayerName" text="Hero" />
      <Slider id="volume" accessibilityLabel="Volume" action="SetVolume" min={0} max={1} value={0.5} step={0.05} />
      <Component id="slot.potion" component={{ ref: "inventorySlot", props: { label: "Potion" } }} />
      <Button id="start" label="Start" action="StartGame" />
    </Ui>,
  );

  assert.deepEqual(
    captured.root.children?.map((node) => node.kind),
    ["textInput", "slider", "component", "button"],
  );
  assert.equal(captured.root.children?.[0]?.action, "SetPlayerName");
  assert.deepEqual(captured.root.children?.[1], {
    accessibilityLabel: "Volume",
    action: "SetVolume",
    children: [],
    id: "volume",
    kind: "slider",
    max: 1,
    min: 0,
    step: 0.05,
    value: 0.5,
  });
  assert.deepEqual(captured.root.children?.[2]?.component, {
    props: { label: "Potion" },
    ref: "inventorySlot",
  });
});
