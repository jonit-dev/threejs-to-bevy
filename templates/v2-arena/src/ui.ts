import { Bar, Button, Column, Text, TouchControl, Ui } from "@threenative/ui";

export const arenaUi = Ui({
  id: "hud",
  children: Column({
    id: "hud.stack",
    children: [
      Text({ id: "hud.health.label", text: "Health" }),
      Bar({ id: "hud.health", max: 100, binding: { kind: "component", entity: "player", component: "Health", field: "current" } }),
      Button({ id: "hud.pause", label: "Pause", action: "Pause", focusable: true }),
      TouchControl({ id: "hud.attack", label: "Attack", action: "Attack" }),
    ],
  }),
});
