---
id: sound-cue
goal: Declare a portable sound cue from a source-backed audio asset.
category: audio
providerBoundary: mock-only
scriptPath: src/scripts/player.ts
surfaces:
  - audio
  - feedback
keywords:
  - sound
  - audio
  - sfx
  - music
  - cue
---

## commands
```bash
# Copy .env.example to .env and set ELEVENLABS_API_KEY only in that ignored,
# project-local file. Probe first; local tn tooling consumes it, runtimes do not.
tn game providers --project . --json
# When ElevenLabs is available, make exactly one explicit paid generation call:
tn audio generate-sfx goal-ping --prompt "Bright arcade goal chime" --audio-doc arena-audio --sound-id goal.ping --project . --json
# Offline fallback: keep or source a local audio file, then use these bounded edits:
tn audio create arena-audio --project . --json
tn audio add-sound arena-audio goal.ping --asset asset.goal-ping --project . --json
```

## source-delta
```json
{"assets/generated/audio/goal-ping.mp3":"Optional authoring-time provider output; the cookbook gate does not make a live request.","content/audio/arena-audio.audio.json":"goal.ping points at a normal bundle-local audio asset."}
```

## script
```ts
import { Vector3, type ScriptContext } from "@threenative/script-stdlib";

export function movePlayerToGoal(context: ScriptContext): void {
  for (const entity of context.query()) {
    const transform = entity.transform();
    transform.position = Vector3.add(transform.position, [context.input.getAxis("MoveX") * context.time.fixedDelta * 2.4, 0, 0]);
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

For continuous control of a playing loop, see
[`vehicle-audio-modulation`](vehicle-audio-modulation.md).
