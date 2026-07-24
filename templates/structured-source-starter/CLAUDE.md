# CLAUDE.md

Use `AGENTS.md` as the authoritative local instructions. Project skills in
`.claude/skills/` carry the detail; load them on demand:

- `threenative-workflow` - plan -> author -> iterate loop and source boundary.
- `threenative-authoring` - CLI-first structured source and script editing.
- `threenative-game-quality` - asset sourcing and the visual quality bar.
- `threenative-verify` - iterate diagnostics, playtests, release gates.

In short: use `tn cookbook search <query> --json` (or
`tn cookbook list --json` to browse) before inventing patterns, then load a
match with `tn cookbook show <id> --json`. Prefer `tn ... --json` commands over
hand-editing JSON. When no bounded command covers the change, direct durable
`content/**` editing is supported; preserve schema/version fields and stable
IDs, then run authoring validation. Read `docs/API-CARD.md` for the generated
ScriptContext capability and absence boundary, keep behavior in
`src/scripts/**`, never repair generated bundle files, and run the narrow
proof selected by `threenative-verify`.
