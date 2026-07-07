# Off-Recipe Direction

Date: 2026-07-07

The complete `off-recipe-2026-07-07` benchmark failed the PRD-001 `<= 2.0x`
raw-token gate on both prompts:

| Prompt | Vanilla median raw tokens | ThreeNative median raw tokens | Raw ratio | ThreeNative median steps |
| --- | ---: | ---: | ---: | ---: |
| checkpoint-race | 506,211 | 1,829,573.5 | 3.614x | 47 |
| physics-knockdown | 1,390,836 | 2,792,109 | 2.008x | 53 |

Raw evidence:

- `tools/verify/artifacts/agent-benchmark/off-recipe-2026-07-07/benchmark-report.json`
- `tools/verify/artifacts/agent-benchmark/off-recipe-2026-07-07/REPORT.md`
- `tools/verify/artifacts/agent-benchmark/off-recipe-2026-07-07/AGENT-LEARNINGS.md`

## Top Token Sinks

1. Preview/proof loop churn. The four ThreeNative sessions ran 62 total
   playtest commands with 13 failed playtest attempts before final proof. This
   repeatedly forced agents to inspect long proof JSON and tune scenarios.
2. CLI invocation and starter context mismatch. Agents still tried unavailable
   `tn`/`pnpm tn` forms or unsupported scaffold-first apply paths before using
   the monorepo CLI directly.
3. Structured-source repair overhead. Script import restrictions, component
   schemas, bundle validation, UI/resource wiring, and scenario assertions kept
   interrupting the game-specific mechanic work.
4. Unbounded source discovery. Four ThreeNative sessions produced 174,727 bytes
   of inspect output and 180,089 bytes of search output while rediscovering
   local conventions.

## Direction Before Fix Work

- Make benchmark starter commands unambiguous and local: the candidate should
  expose one working `tn` command path without requiring agents to discover the
  monorepo CLI.
- Add compact mechanic blocks for checkpoint progress, target knockdown, score,
  retry, and proof metadata before adding more prompt-shaped recipes.
- Collapse proof into one command response that reports movement, objective
  progress, HUD/resource state, screenshot paths, and first actionable failure.
- Build cookbook entries from these raw failed transcripts; the next agent
  should not need broad `rg` over examples to learn scripts, schema ownership,
  or scenario assertions.
