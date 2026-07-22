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

Frontmatter also accepts two optional list fields that power discovery:

- `keywords:` free-text tokens an agent goal or query might use (synonyms the
  `goal` line does not contain, e.g. `coin`, `pickup` on `collectible-respawn`).
  `tn cookbook search <query>` and the `tn game plan` goal-to-cookbook match
  score these above goal text.
- `blocks:` gameplay block ids (`objective.collectible`) or `prefix.*`
  patterns (`controller.*`) this entry serves. `tn game plan` derives its
  mechanic-row cookbook references from these instead of a hardcoded map, so
  a new entry becomes recommendable by declaring the blocks it covers.

Reviewed local-provider entries may also declare:

- `providerBoundary: local-reviewed-source` to run the `proof` commands during
  normal `pnpm verify:cookbook` execution. Use
  `providerBoundary: installed-tool-opt-in` only when proof needs a separately
  installed external authoring tool.
- `fixtureManifest: <repo-relative-path>` to materialize bounded fixture files
  into the fresh starter before commands run. The manifest uses schema
  `threenative.cookbook-fixture` version `0.1.0`; each file declares one of
  `text`, `base64`, or `json`. Paths must remain inside the project, file and
  aggregate byte budgets are enforced, duplicates are rejected, and an
  optional `sha256` verifies exact bytes. A JSON/string value of
  `{{sha256:earlier/file}}` resolves to the prefixed SHA-256 of an earlier
  manifest file, allowing validation and provenance documents to bind their
  inputs without a handwritten setup script.

Typed-spec cookbook entries should use `tn authoring compile-typed-spec --json`
after `src/game.spec.ts` exists. Set `authoring: typed-spec` and
`scriptPath: src/game.spec.ts` in frontmatter to have the gate write the script
block as the spec, compile it into canonical `content/**/*.json`, then run the
normal authoring validation and build checks.
