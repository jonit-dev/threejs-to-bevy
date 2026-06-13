# V1-02 Project Scaffold and Template

Complexity: 5 -> MEDIUM mode

## Context

**Problem:** V1 requires `tn create` to produce a predictable starter project
that can validate, build, preview, and run native commands.

**Files Analyzed:** `docs/ROADMAP.md`, `docs/developer-workflow.md`,
`docs/ai-workflows.md`.

**Current Behavior:**

- Docs require a scaffolded project and clean-checkout commands.
- No template files exist.
- CLI command behavior is only described in docs.

## Solution

**Approach:**

- Add one maintained V1 template.
- Keep starter source minimal: scene, camera, light, primitive mesh, config.
- Generate scripts that call local `tn` commands.
- Include a README that matches V1 commands exactly.

**Data Changes:** None.

## Integration Points

**How will this feature be reached?**

- Entry point identified: `tn create my-game`.
- Caller file identified: `packages/cli/src/commands/create.ts`.
- Registration/wiring needed: CLI command registration and template copy path.

**Is this user-facing?** Yes.

**Full user flow:**

1. User runs `tn create my-game`.
2. CLI copies the V1 template into `my-game/`.
3. User runs documented scripts inside the generated project.
4. The starter scene becomes the input for compiler/runtime tickets.

## Execution Phases

#### Phase 1: Static Template - Generated project has predictable files

**Files (max 5):**

- `templates/v1/package.json` - generated project scripts.
- `templates/v1/threenative.config.json` - starter config.
- `templates/v1/src/game.ts` - starter scene entry.
- `templates/v1/README.md` - generated project commands.
- `templates/v1/.gitignore` - generated ignores.

**Implementation:**

- [ ] Add starter scene with supported SDK imports only.
- [ ] Add scripts for `validate`, `build`, `dev:web`, `dev:desktop`, `verify`.
- [ ] Document expected generated bundle path.

**Tests Required:**

| Test File | Test Name | Assertion |
| --- | --- | --- |
| `packages/cli/src/commands/create.test.ts` | `should create v1 template files` | Generated directory contains config, source, scripts, README. |

**User Verification:**

- Action: Run `tn create my-game`.
- Expected: `my-game` contains the V1 template layout.

#### Phase 2: Create Command - CLI can copy and validate destination

**Files (max 5):**

- `packages/cli/src/commands/create.ts` - create command.
- `packages/cli/src/index.ts` - command registration.
- `packages/cli/src/diagnostics.ts` - structured CLI result helper.

**Implementation:**

- [ ] Reject existing non-empty destinations.
- [ ] Support default template `v1`.
- [ ] Emit machine-readable success with project path when `--json` is passed.

**Tests Required:**

| Test File | Test Name | Assertion |
| --- | --- | --- |
| `packages/cli/src/commands/create.test.ts` | `should reject non-empty destination` | Command exits nonzero with stable diagnostic. |

**User Verification:**

- Action: Run `tn create my-game --json`.
- Expected: JSON includes project path and next commands.

## Verification Strategy

- `pnpm test -- --run create`
- `pnpm tn -- create /tmp/tn-v1-smoke`
- `cd /tmp/tn-v1-smoke && pnpm run validate`

## Acceptance Criteria

- [ ] `tn create` creates a project from the V1 template.
- [ ] Generated project has starter scene and config.
- [ ] Generated scripts match V1 PRD command names.
- [ ] Errors are structured enough for AI repair.
