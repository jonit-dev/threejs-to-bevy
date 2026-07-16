---
id: checkpoint-race-progress
goal: Plan checkpoint race progress with the maintained vehicle recipe metadata.
category: gameplay
surfaces:
  - checkpoint
  - vehicle
  - recipe
keywords:
  - race
  - checkpoint
  - lap
  - vehicle
  - kart
  - car
  - boat
blocks:
  - objective.checkpoint-lap
---

## commands
```bash
tn recipe apply vehicle-checkpoint --scene arena --vehicle player --camera camera.main --project . --json
```

## source-delta
```json
{"recipe":"Apply is transactional, adopts existing vehicle/camera entities without replacing their authored pose, creates five ordered checkpoint gates, owns RaceState timer/progress/finish/retry fields, binds the retained HUD, emits completion and retry scenarios, scaffolds the required script export, and is a no-op when retried unchanged."}
```

## proof
```bash
tn iterate --project . --json
```

Use the compact game-plan match as the front door: run `tn game plan`, show
this cookbook entry from its emitted `cookbookId`, apply the bounded recipe,
then run `tn iterate` once against the recipe-emitted completion and retry
scenarios. Do not open the planning worksheet, sibling agent skills, generated
source, or deep artifacts unless the plan/iterate diagnostic says a required
field or repair path is missing.
