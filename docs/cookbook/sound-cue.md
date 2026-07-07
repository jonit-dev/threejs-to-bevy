---
id: sound-cue
goal: Declare a portable sound cue from a source-backed audio asset.
category: audio
scriptPath: src/scripts/player.ts
surfaces:
  - audio
  - feedback
---

## commands
```bash
tn audio create arena-audio --project . --json
tn audio add-sound arena-audio goal.ping --asset asset.goal-ping --project . --json
```

## source-delta
```json
{"content/audio/arena-audio.audio.json":"goal.ping points at the starter goal-ping.wav asset."}
```

## script
```ts
import { Vec3, type ScriptContext } from "@threenative/script-stdlib";

export function movePlayerToGoal(context: ScriptContext): void {
  for (const entity of context.query()) {
    const transform = entity.transform();
    transform.position = Vec3.add(transform.position, [context.input.getAxis("MoveX") * context.time.fixedDelta * 2.4, 0, 0]);
  }
}

export function soundCue(context: ScriptContext): void {
  context.audio?.play?.("goal.ping");
}
```

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
```
