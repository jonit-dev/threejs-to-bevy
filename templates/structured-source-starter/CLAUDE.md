# CLAUDE.md

Use `AGENTS.md` as the authoritative local instructions.

In short: prefer `tn ... --json` for authoring, especially `tn actor`,
`tn scene`, `tn flow`, `tn sequence`, `tn ui`, `tn prefab set-material`, and
`tn add` mechanic-block commands. Use actor archetypes first for characters,
vehicles, pickups, camera booms, and static props. Edit
durable source under `content/**` and `src/scripts/**` only when no command
covers the change, and do not repair generated bundle files.
Use flow/sequence/spawner source for macro game state, waves, and cutscene or
feedback beats before adding script-owned state flags or timers.
Use generated `ProjectContext` types in script entrypoints; refresh them with
`tn types generate --project . --json` after structured source shape changes.
Use `defineBehavior(metadata, fn)` for new systems so access lists live next to
script code; leave systems JSON as script attachments when possible.
Use `tn scene inspect arena --node <id> --project . --json` for one entity,
resource, system, prefab, or UI node before opening the full scene JSON.
For gameplay verification, run `tn iterate --project . --json` first; do not
run validate/build/playtest separately unless its compact diagnostic asks for
deeper proof.
