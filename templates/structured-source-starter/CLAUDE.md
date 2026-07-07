# CLAUDE.md

Use `AGENTS.md` as the authoritative local instructions.

In short: prefer `tn ... --json` for authoring, especially `tn scene`,
`tn ui`, `tn prefab set-material`, and `tn add` mechanic-block commands. Edit
durable source under `content/**` and `src/scripts/**` only when no command
covers the change, and do not repair generated bundle files.
Use `tn scene inspect arena --node <id> --project . --json` for one entity,
resource, system, prefab, or UI node before opening the full scene JSON.
For gameplay verification, run `tn iterate --project . --json` first; do not
run validate/build/playtest separately unless its compact diagnostic asks for
deeper proof.
