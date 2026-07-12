# CLAUDE.md

Use `AGENTS.md` as the authoritative local instructions. Project skills in
`.claude/skills/` (`threenative-workflow`, `threenative-authoring`,
`threenative-game-quality`, `threenative-verify`) carry the shared workflow
detail; load them on demand.

In short: prefer `tn ... --json` for authoring, edit durable source under
`content/**` and `src/scripts/**`, and do not repair generated bundle files.
