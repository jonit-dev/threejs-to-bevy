import { defineUiModule } from "@threenative/sdk";
import { Bar, Button, Column, Text, TouchControl, Ui } from "@threenative/ui";

export const raceHud = defineUiModule({
  bindings: ["action.Attack", "action.Pause", "component.Health"],
  id: "ui.race-hud",
  source: { sourcePath: "src/ui/race-hud.ts" },
  ui: Ui({
    id: "hud",
    children: Column({
      id: "hud.stack",
      children: [
        Text({ id: "hud.title", text: "V7 Functional" }),
        Bar({ id: "hud.health", accessibilityLabel: "Health", binding: { kind: "component", component: "Health", entity: "player", field: "current" }, max: 100 }),
        Button({ action: "Pause", focusable: true, id: "hud.pause", label: "Pause" }),
        TouchControl({ action: "Attack", id: "hud.attack", label: "Attack" }),
      ],
    }),
  }),
});
