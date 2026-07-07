# Authoring Cookbook Format

Each cookbook entry is a compact, validated worked example for agents. Entries
must fit this shape:

~~~md
---
id: player-move-wasd
goal: Add horizontal keyboard movement to the player.
category: gameplay
scriptPath: src/scripts/player.ts
surfaces:
  - player
  - input
---

## commands
```bash
tn input add-axis arena MoveX --negative-keys KeyA,ArrowLeft --positive-keys KeyD,ArrowRight --project . --json
```

## source-delta
```json
{"content/input/arena.input.json":"MoveX axis maps A/Left to D/Right."}
```

## script
```ts
export function movePlayerToGoal(context: any): void {}
```

## proof
```bash
tn playtest --project . --scenario playtests/smoke-movement.playtest.json --stable-artifacts --json
```
~~~

The four sections are required and must stay in this order: `commands`,
`source-delta`, `script`, `proof`. Commands are copied into a fresh
`structured-source-starter` project by `pnpm verify:cookbook`, then the script
block is written to `scriptPath`, followed by authoring validation and build.

Typed-spec cookbook entries should use `tn authoring compile-typed-spec --json`
after `src/game.spec.ts` exists. Set `authoring: typed-spec` and
`scriptPath: src/game.spec.ts` in frontmatter to have the gate write the script
block as the spec, compile it into canonical `content/**/*.json`, then run the
normal authoring validation and build checks.
