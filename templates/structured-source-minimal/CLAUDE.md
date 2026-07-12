# CLAUDE.md

Use `AGENTS.md` as the authoritative local instructions. Project skills in
`.claude/skills/` carry the detail; load them on demand:

- `threenative-workflow` - plan -> author -> iterate loop and source boundary.
- `threenative-authoring` - CLI-first structured source and script editing.
- `threenative-game-quality` - asset sourcing and the visual quality bar.
- `threenative-verify` - iterate diagnostics, playtests, release gates.

In short: check `tn cookbook list --json` before inventing patterns, prefer
`tn ... --json` commands over hand-editing JSON, keep durable edits in
`content/**` and `src/scripts/**`, never repair generated bundle files, and
run `tn iterate --project . --json` after changes.
