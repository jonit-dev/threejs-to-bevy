# V1-00 Docs and Schema Alignment

Complexity: 5 -> MEDIUM mode

## Context

**Problem:** The current docs mostly agree on the product direction, but a few
V1-relevant names and boundaries conflict.

**Files Analyzed:** `README.md`, `docs/README.md`, `docs/ROADMAP.md`,
`docs/architecture.md`, `docs/tech-stack.md`, `docs/developer-workflow.md`,
`docs/ai-workflows.md`, `docs/sdk.md`, `docs/ecs.md`, `docs/ir.md`,
`docs/runtime-adapters.md`, `docs/scripting.md`, `docs/ui.md`.

**Current Behavior:**

- Roadmap V1 is a narrow end-to-end proof.
- Some docs describe MVP/V1 as a broader arena/mobile/UI/scripting milestone.
- Bundle names vary between `scene.ir.json`, `ecs.ir.json`, and
  `world.ir.json`.
- Schedule stage lists and capability fields differ across docs.
- `runtime-bevy` placement differs between docs.

## Solution

**Approach:**

- Treat `docs/ROADMAP.md` V1 as the source of truth for V1 tickets.
- Add a single consistency patch before implementation starts.
- Standardize bundle, CLI, layout, and capability vocabulary.
- Document explicit V1 deferrals instead of deleting future-facing guidance.

**Data Changes:** None.

## Integration Points

**How will this feature be reached?**

- Entry point identified: documentation links from `docs/PRDs/v1/README.md`.
- Caller file identified: future implementation PRDs reference these decisions.
- Registration/wiring needed: link `docs/PRDs/v1/README.md` from docs index if
  desired.

**Is this user-facing?** Yes, documentation-facing.

**Full user flow:**

1. Developer reads V1 PRDs.
2. They see the controlling roadmap scope and naming decisions.
3. Implementation tickets use one consistent vocabulary.
4. Reviewers can reject implementation drift against one source.

## Execution Phases

#### Phase 1: V1 Naming Alignment - Docs use one vocabulary for implementation

**Files (max 5):**

- `docs/ir.md` - standardize bundle references on `world.ir.json`.
- `docs/runtime-adapters.md` - align version/capability wording with IR.
- `docs/ecs.md` - align V1 schedule wording with runtime adapter docs.
- `docs/tech-stack.md` - confirm top-level `runtime-bevy/` layout.
- `docs/developer-workflow.md` - mark mobile arena MVP details as post-V1.

**Implementation:**

- [ ] Replace V1 bundle examples that imply `scene.ir.json`/`ecs.ir.json`.
- [ ] Decide where `requiredCapabilities` lives for V1.
- [ ] Normalize schedule stage list for V1.
- [ ] Clarify that UI, MCP, and mobile are post-V1 unless promoted.

**Tests Required:**

| Test File | Test Name | Assertion |
| --- | --- | --- |
| `docs/PRDs/v1/V1-00-docs-and-schema-alignment.md` | `should keep v1 vocabulary consistent` | Manual grep finds no conflicting V1 bundle names. |

**User Verification:**

- Action: Read V1 PRDs and referenced docs.
- Expected: V1 scope, commands, layout, and bundle names are consistent.

#### Phase 2: PRD Cross-Link Check - V1 tickets are navigable

**Files (max 5):**

- `docs/PRDs/v1/README.md` - ticket index and release order.
- `docs/README.md` - optional link to V1 PRDs.

**Implementation:**

- [ ] Verify each ticket link resolves.
- [ ] Verify each ticket names dependencies and acceptance criteria.

**Tests Required:**

| Test File | Test Name | Assertion |
| --- | --- | --- |
| `docs/PRDs/v1/README.md` | `should list every v1 ticket` | Every `V1-*.md` file is linked. |

**User Verification:**

- Action: Open `docs/PRDs/v1/README.md`.
- Expected: All V1 tickets are linked in dependency order.

## Verification Strategy

- `find docs/PRDs/v1 -name '*.md' | sort`
- `rg 'scene.ir.json|ecs.ir.json|world.ir.json|requiredCapabilities|formatVersion' docs`
- Manual review against `docs/ROADMAP.md`.

## Acceptance Criteria

- [ ] V1 PRDs use `world.ir.json`.
- [ ] V1 PRDs use the normalized CLI command set.
- [ ] Post-V1 features are explicitly deferred.
- [ ] Remaining open decisions are isolated and named.
