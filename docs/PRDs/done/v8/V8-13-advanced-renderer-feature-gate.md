# V8-13 Advanced Renderer Feature Gate

Complexity: 6 -> MEDIUM mode

## Context

**Problem:** Advanced renderer features such as volumetrics, atmospheric
scattering, SSR, deferred rendering, GI/lightmaps, custom postprocess, storage
buffers, and shader render phases are visible in the Bevy-derived backlog but
do not yet have portable contracts.

**Files Analyzed:** `docs/bevy-feature-parity.md`,
`docs/advanced-features-roadmap.md`, `docs/STATUS.md`,
`docs/PRDs/v8/V8-11-rendering-atmosphere-post-processing-parity.md`, and
`docs/PRDs/v8/V8-12-lights-shadows-environment-probes.md`.

## Integration Points

**How will this feature be reached?**

- [x] Entry point identified: IR validation, compiler diagnostics, docs guards,
  and future PRD promotion criteria.
- [x] Caller file identified: IR validator, compiler validation, docs check
  scripts, and advanced roadmap docs.
- [x] Registration/wiring needed: unsupported diagnostic codes, docs guard
  rules, roadmap states, and parity tracker updates.

**Is this user-facing?** Indirectly. Authors should get explicit diagnostics
instead of silent no-ops when declaring advanced renderer features.

## Solution

**Approach:**

- Add stable unsupported diagnostics for advanced renderer declarations.
- Document minimum promotion criteria for shaders, postprocess, GI, and
  volumetrics.
- Add docs guards so parity docs cannot mark advanced features complete without
  PRD and evidence anchors.

**Data Changes:** Diagnostic taxonomy and docs guard metadata only.

## Execution Phases

#### Phase 1: Unsupported Advanced Renderer Diagnostics - Non-portable features fail loudly

**Implementation:**

- [ ] Reject volumetrics, atmospheric scattering, deferred rendering, SSR/GI,
  storage buffers, and raw render phases when authored.
- [ ] Use stable diagnostic codes and suggestions.

**Verification Plan:** Rejected fixtures and diagnostic shape tests.

#### Phase 2: Future Contract Criteria - Promotion standards are documented

**Implementation:**

- [ ] Define minimum SDK/IR/runtime/conformance/visual evidence for each class.
- [ ] Separate shader, postprocess, GI, and volumetric prerequisites.

**Verification Plan:** Docs review and check-docs coverage.

#### Phase 3: Docs Guard and Roadmap Sync - Parity state cannot drift silently

**Implementation:**

- [ ] Fail docs checks if advanced features are marked complete without anchors.
- [ ] Sync `docs/advanced-features-roadmap.md` and parity tracker states.

**Verification Plan:** `pnpm check:docs:v8` or focused docs guard.

## Acceptance Criteria

- [ ] Unsupported advanced renderer surfaces produce stable diagnostics.
- [ ] Future promotion criteria are explicit and checked by docs tooling.
