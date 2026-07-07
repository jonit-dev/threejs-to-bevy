# Mutation Surface Audit - 2026-07-07

Raw `content/**` edits observed or implied by the scaffold/off-recipe benchmark
rounds are mapped to bounded command surfaces below. The intent is to keep
future agents on schema-aware commands and reserve direct JSON edits for shapes
with no command coverage.

| Edit Shape | Evidence | Command Surface | Status |
| --- | --- | --- | --- |
| Move, rotate, or scale scene entities for layout and camera proof. | Off-recipe sessions authored repeated scene transform changes while repairing playable movement and screenshots. Raw data: `tools/verify/artifacts/agent-benchmark/off-recipe-2026-07-07/candidates/**/codex-events.jsonl`. | `tn scene set-transform <scene-id> <entity-id> --position ... --rotation ... --scale ... --json` | Covered before this PRD; keep using this instead of editing scene JSON. |
| Add scene-local prefabs and prefab-backed entities or instances. | Scaffold and off-recipe sessions repeatedly added obstacles, goals, pickups, and checkpoints. Raw data: `tools/verify/artifacts/agent-benchmark/off-recipe-2026-07-07/candidates/**/codex-events.jsonl`. | `tn scene add-prefab`, `tn scene set-prefab`, `tn scene add-entity`, `tn scene add-prefab-instance`, `tn scene layout ten-pin` | Covered before this PRD; PRD-003 `tn add spawner` covers common repeated placement. |
| Bind HUD text to score, status, or timer resources. | Scaffold-first games and PRD-003 blocks need score/status/timer HUD binding without hand-editing UI JSON. Raw data: `tools/verify/artifacts/agent-benchmark/scaffold-first-token-rerun-2026-07-07b/` and PRD-003 block tests. | `tn ui bind <ui-doc-id> <node-id> --resource <resource.path> --json` | Covered before this PRD. |
| Add score, timer, trigger, projectile, and follow-camera mechanics. | Off-recipe prompts `checkpoint-race` and `physics-knockdown` paid high raw-edit/tool costs for reusable mechanics. Raw data: `tools/verify/artifacts/agent-benchmark/off-recipe-2026-07-07/REPORT.md`. | `tn add spawner|timer|trigger-sequence|score|projectile|follow-camera --json` | Covered by PRD-003. |
| Assign prefab visual material by stable material id. | Common generated-game repair path: bind visual prefab defaults to authored material records without constructing generic component JSON by hand. | `tn prefab set-material <prefab-id> --material <material-id> --json` | Added in PRD-004; rejects unknown material ids with available ids. |
| Override arbitrary unsupported nested fields. | No stable repeated transcript shape yet. | Deferred. Use specific commands or add a command backed by a transcript example. | Explicitly not covered; no generic JSON-pointer setter. |

Follow-up benchmark ratchet: future benchmark reviews should flag raw
`content/**` edit calls when one of the covered command surfaces exists.
