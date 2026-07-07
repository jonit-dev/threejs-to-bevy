# CLAUDE.md

Use `AGENTS.md` as the authoritative local instructions.

In short: prefer `tn ... --json` for authoring, edit durable source under
`content/**` and `src/scripts/**`, and do not repair generated bundle files.
For gameplay verification, run `tn iterate --project . --json` first; do not
run validate/build/playtest separately unless its compact diagnostic asks for
deeper proof.
