---
id: portable-feedback
goal: Add bounded pickup feedback without hand-integrating presentation state.
category: gameplay
scriptPath: src/scripts/player.ts
surfaces:
  - feedback
  - tween
  - camera-shake
  - world-text
keywords:
  - feedback
  - pickup
  - tween
  - camera shake
  - world text
  - juice
  - polish
---

## commands
```bash
tn authoring validate --project . --json
```

## source-delta
```json
{"content/systems/arena.systems.json":"Declare pickup-sparkle in feedbackPresets and enroll tween, worldText, camera.shake, and effects.play on the collecting system."}
```

## script
```ts
import { defineBehavior, type ScriptContext } from "@threenative/script-stdlib";

type FeedbackContext = ScriptContext & {
  cameras: { shake(options: { amplitude: number; duration: number; frequency: number; seed?: number | string }): unknown };
  commands: {
    tween(entity: string, options: { duration: number; easing: "ease-out"; property: "scale"; to: [number, number, number] }): unknown;
    worldText(entity: string, options: { fade: boolean; floatDistance: number; lifetime: number; target: string; text: string }): unknown;
  };
  effects: { play(preset: string, options?: { entity?: string; seed?: number | string }): unknown };
};

export const movePlayerToGoal = defineBehavior(
  {
    commands: [
      { entity: "player", kind: "tween", property: "scale" },
      { entity: "pickup-text", kind: "worldText" },
    ],
    schedule: "update",
    services: ["camera.shake", "effects.play"],
  },
  (context: FeedbackContext): void => {
    context.commands.tween("player", { duration: 0.16, easing: "ease-out", property: "scale", to: [1.15, 1.15, 1.15] });
    context.cameras.shake({ amplitude: 0.05, duration: 0.12, frequency: 24, seed: "pickup" });
    context.effects.play("pickup-sparkle", { entity: "player", seed: "pickup" });
    context.commands.worldText("pickup-text", { fade: true, floatDistance: 0.5, lifetime: 0.8, target: "player", text: "+1" });
  },
);
```

## proof
```bash
pnpm verify:focused verify:portable-feedback
```
