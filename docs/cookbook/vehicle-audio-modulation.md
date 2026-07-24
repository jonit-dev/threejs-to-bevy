---
id: vehicle-audio-modulation
goal: Modulate one active engine loop from a portable throttle value.
category: audio
providerBoundary: mock-only
scriptPath: src/scripts/player.ts
surfaces:
  - audio
  - scripting
keywords:
  - engine
  - throttle
  - pitch
  - volume
---

## commands
```bash
tn audio create arena-audio --project . --json
tn audio add-sound arena-audio engine.loop --asset asset.goal-ping --project . --json
```

## source-delta
```json
{"content/audio/arena-audio.audio.json":"engine.loop points at a bundle-local audio asset; replace the starter cue with the project's loop source.","content/systems/arena.systems.json":"The system declares audio.play, audio.update, and audio.stop."}
```

## script
```ts
import { Vector3, type ScriptContext } from "@threenative/script-stdlib";

export function movePlayerToGoal(context: ScriptContext): void {
  for (const entity of context.query()) {
    const transform = entity.transform();
    transform.position = Vector3.add(transform.position, [
      context.input.getAxis("MoveX") * context.time.fixedDelta * 2.4,
      0,
      0,
    ]);
  }
}

export function updateEngineAudio(context: ScriptContext): void {
  const state = context.state("engine-audio", { playbackId: "" });
  const throttle = Math.max(0, Math.min(1, context.input.getAxis("Throttle")));
  if (state.playbackId === "") {
    const playback = context.audio.play("engine.loop", { loop: true });
    if (playback.accepted) state.playbackId = playback.playbackId;
  }
  if (state.playbackId !== "") {
    context.audio.update(state.playbackId, {
      pitch: 0.85 + throttle * 0.35,
      rampSeconds: 0.08,
      volume: 0.45 + throttle * 0.35,
    });
  }
}
```

`volume` and `pitch` are absolute logical targets. Volume is bounded to
`0..4`, pitch to `0.25..4`, and `rampSeconds` to `0..10`. Empty, invalid,
missing, and stopped-playback updates return stable non-success results.

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
```
