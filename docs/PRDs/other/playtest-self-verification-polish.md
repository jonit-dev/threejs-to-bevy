# PRD: Playtest Self-Verification Polish

## Status

Proposed. `tn playtest` is a foundational agent self-verification primitive:
fast enough for edit loops, structured enough for automated repair, and narrow
enough to stay separate from full production QA.

## Context

Agents use `tn playtest` to prove that authored gameplay responds to input
before they claim a game works. The command is already useful, but it currently
answers only a narrow question: did one entity move after one keyboard input?

The next version should answer the questions agents actually need during game
development:

- What entity, input, camera, resource, or HUD target should I test?
- Did a sequence of inputs produce the expected state change?
- Did camera framing, contacts/triggers, animation, velocity, rotation,
  visibility, HUD text, resources, and runtime diagnostics behave correctly?
- Can I rerun the proof while editing without losing or confusing artifacts?
- Can templates and `tn game qa` reuse focused playtest evidence without making
  broad gates slow?
- Can the same scenario contract later run against native/desktop proof?

Core `tn playtest` must stay game-agnostic. Racing, platformer, collector, and
third-person conventions belong in scenario presets/templates, not hardcoded
flags such as `--expect-lap-complete`.

## Current Behavior Evidence

From `packages/cli/src/commands/playtest.ts` and
`packages/cli/src/commands/playtest.test.ts`:

- The command requires `--entity` and `--press`/`--input`; missing arguments
  return `TN_PLAYTEST_USAGE` with exit code 2.
- Supported flags are `--project`, `--entity`, `--press`/`--input`, `--frames`,
  `--movement-threshold`, `--expect-moved`, `--expect-axis`,
  `--follow`, `--follow-within`, `--debug`/`--debug-colliders`, and `--json`.
- The runner is web-only. It builds the project, validates the bundle, starts a
  web preview, launches Playwright Chromium, waits for
  `globalThis.__THREENATIVE_READY__?.ok`, dispatches keyboard events, samples
  transforms, captures one screenshot, and closes the server/browser.
- Transform evidence comes from
  `globalThis.__THREENATIVE_RUNTIME__.entityWorldPosition(id)` and the latest
  `Transform` patch in `globalThis.__THREENATIVE_EFFECT_LOG__`.
- Debug collider evidence is limited to
  `globalThis.__THREENATIVE_RUNTIME__?.debugColliderCount`.
- The artifact path is a single PNG:
  `artifacts/playtest/<entity>-<press>.png`.
- JSON output includes `proofMetadata` from `buildProofArtifactMetadata`.
- Current stable diagnostics include:
  `TN_PLAYTEST_USAGE`, `TN_PLAYTEST_EXPECT_AXIS_INVALID`,
  `TN_PLAYTEST_BROWSER_UNAVAILABLE`, `TN_PLAYTEST_RUNTIME_NOT_READY`,
  `TN_PLAYTEST_SCREENSHOT_EMPTY`, `TN_PLAYTEST_ENTITY_NOT_FOUND`,
  `TN_PLAYTEST_INPUT_NO_EFFECT`, `TN_PLAYTEST_AXIS_NO_EFFECT`,
  `TN_PLAYTEST_FOLLOW_ENTITY_NOT_FOUND`, `TN_PLAYTEST_FOLLOW_STATIC`, and
  `TN_PLAYTEST_FOLLOW_SEPARATION`.
- Existing tests cover pass/fail movement, signed axis parsing, follow
  assertions, debug collider flag propagation, invalid axis usage, and required
  entity/input arguments.

These behaviors are the compatibility baseline. Scenario support must preserve
the one-shot flag path by translating it into an equivalent scenario internally.

## Product Boundaries

- Durable game source remains `content/**/*.json` plus
  `src/scripts/**/*.ts`; generated bundles and `dist/**` are not edited by this
  command.
- CLI input and output must be JSON-friendly and agent-safe.
- Runtime observation may use stable public debug globals, effect logs, source
  documents, screenshots, and future native trace reports.
- Raw Three.js objects, Playwright page objects, Bevy ECS handles, renderer
  handles, DOM handles, filesystem handles, and native runtime handles are not
  public playtest contract.
- Unsupported APIs and targets must fail with explicit diagnostics.

## Scenario Contract

Add a project-owned scenario document format. Default committed location:
`playtests/**/*.playtest.json`. `.threenative/playtests/**/*.json` is allowed
for local/generated scratch scenarios.

Schema version 1:

```json
{
  "schemaVersion": 1,
  "name": "smoke-movement",
  "target": "web",
  "viewport": { "width": 1280, "height": 720 },
  "subject": "player",
  "warmupFrames": 5,
  "steps": [
    {
      "label": "move-forward",
      "press": "KeyW",
      "holdFrames": 45,
      "release": true,
      "waitFrames": 10
    },
    {
      "label": "turn-right",
      "press": "KeyD",
      "holdFrames": 20,
      "release": true
    }
  ],
  "assert": {
    "movement": {
      "entity": "player",
      "minDistance": 0.5,
      "axis": "-z",
      "minVelocity": 0.01,
      "rotationChanged": true
    },
    "camera": {
      "entity": "camera.main",
      "follows": "player",
      "within": 8,
      "targetInViewport": true
    },
    "resources": [
      { "id": "game", "path": "started", "equals": true },
      { "id": "score", "path": "value", "gte": 1 }
    ],
    "hud": [
      { "id": "hud.score", "textIncludes": "1" },
      { "id": "hud.status", "changed": true }
    ],
    "contacts": [
      { "entity": "player", "with": "pickup.zone", "kind": "trigger", "minCount": 1 }
    ],
    "animation": [
      { "entity": "player", "clip": "Run", "entered": true, "advancedFrames": 10 }
    ],
    "visibility": [
      {
        "entity": "player",
        "minProjectedPixels": 1200,
        "maxOffscreenRatio": 0.05
      }
    ],
    "diagnostics": {
      "runtimeReady": true,
      "noConsoleErrors": true,
      "noNetworkErrors": true,
      "noRuntimeDiagnostics": true
    }
  },
  "artifacts": {
    "screenshots": "before-after",
    "contactSheet": true,
    "effectLog": "focused",
    "console": true,
    "network": true,
    "runtimeTrace": true
  }
}
```

Validation rules:

- `schemaVersion` must be `1`.
- `name` must be a stable file-safe identifier.
- `target` defaults to `web`; `desktop`/`bevy` are accepted values but return
  `TN_PLAYTEST_TARGET_UNSUPPORTED` until a native runner exists.
- `subject` is the default entity for assertions that omit `entity`.
- `steps[]` must be non-empty. Each step must define at least one of `press` or
  `waitFrames`. `holdFrames` and `waitFrames` must be positive integers when
  present. `release` defaults to true for `press` steps.
- Assertion paths are logical resource/UI paths, not JS expressions.
- Scenario files must not contain raw scripts, DOM selectors, renderer handles,
  or target-specific code.

CLI compatibility:

```bash
tn playtest --project . --entity player --press KeyW --frames 45 --expect-moved --expect-axis -z --follow camera.main --json
tn playtest --project . --scenario playtests/smoke-movement.playtest.json --json
```

## Diagnostic Catalog

Keep existing codes stable. Add new codes only when the failure is actionable
and machine-distinguishable:

| Code | Severity | Meaning |
| --- | --- | --- |
| `TN_PLAYTEST_SCENARIO_NOT_FOUND` | error | `--scenario` path cannot be read. |
| `TN_PLAYTEST_SCENARIO_INVALID` | error | Scenario JSON is malformed or violates schema-level rules. |
| `TN_PLAYTEST_SCENARIO_STEP_INVALID` | error | A step has invalid input/wait/release timing. |
| `TN_PLAYTEST_TARGET_UNSUPPORTED` | error | Target is recognized but no runner exists yet. |
| `TN_PLAYTEST_ENTITY_REQUIRED` | error | No subject/entity was provided and discovery did not select one. |
| `TN_PLAYTEST_INPUT_REQUIRED` | error | No input step was provided and discovery did not select one. |
| `TN_PLAYTEST_RESOURCE_ASSERTION_FAILED` | error | Resource path comparison failed. |
| `TN_PLAYTEST_HUD_ASSERTION_FAILED` | error | HUD text/change assertion failed. |
| `TN_PLAYTEST_CAMERA_FRAMING_FAILED` | error | Follow separation or projected target framing failed. |
| `TN_PLAYTEST_CONTACT_NOT_OBSERVED` | error | Expected contact/trigger event was not observed. |
| `TN_PLAYTEST_ANIMATION_NOT_OBSERVED` | error | Expected clip/state entry or frame advance was not observed. |
| `TN_PLAYTEST_VELOCITY_ASSERTION_FAILED` | error | Velocity threshold failed. |
| `TN_PLAYTEST_ROTATION_ASSERTION_FAILED` | error | Rotation/yaw change failed. |
| `TN_PLAYTEST_VISIBILITY_FAILED` | error | Projected bounds/pixel footprint assertion failed. |
| `TN_PLAYTEST_CONSOLE_ERROR` | error | Browser console error was captured while forbidden. |
| `TN_PLAYTEST_NETWORK_ERROR` | error | Failed request was captured while forbidden. |
| `TN_PLAYTEST_RUNTIME_DIAGNOSTIC` | error | Runtime/effect-log diagnostic was captured while forbidden. |
| `TN_PLAYTEST_DISCOVERY_EMPTY` | warning | Discovery found no strong candidates. |
| `TN_PLAYTEST_ARTIFACT_WRITE_FAILED` | error | Proof artifact bundle could not be written. |
| `TN_PLAYTEST_WATCH_LIMIT_REACHED` | info | Bounded watch mode stopped after `--max-runs`. |

Each diagnostic must include `code`, `severity`, `message`, and, when repair is
clear, `suggestion`. JSON output must include all diagnostics even when text
mode prints only the top failure.

## Artifact Bundle

Replace the single screenshot path with a proof directory while preserving a
legacy `artifact` field for one-shot consumers during migration.

Default layout:

```txt
artifacts/playtest/<scenario-name>/<run-id>/
  summary.json
  manifest.json
  before.png
  after.png
  contact-sheet.png
  effect-log.json
  console.json
  network.json
  runtime-trace.json
  observations.json
```

`--stable-artifacts` writes to:

```txt
artifacts/playtest/<scenario-name>/latest/
```

`--out <dir>` overrides the run directory. `summary.json` is the primary
machine-readable report and includes:

- `code`, `pass`, `scenario`, `target`, `runtime`, and `durationMs`.
- `diagnostics[]`.
- `assertions[]` with per-assertion pass/fail details.
- `observations` for sampled transforms, resource values, HUD text, contacts,
  animation state, projected bounds, console entries, network failures, runtime
  diagnostics, and debug collider count.
- `artifacts` with relative paths and byte sizes.
- `reproduceCommand`.
- `proofMetadata` from `buildProofArtifactMetadata`.

Text mode should print a concise one-line result plus artifact directory. JSON
mode should print the full report.

## Discovery And Suggestions

Add discovery so agents stop guessing entity/input pairs.

Commands:

```bash
tn playtest --project . --discover --json
tn playtest --project . --suggest-scenario smoke-movement --json
```

Discovery sources:

- Structured source documents under `content/**/*.json`.
- Emitted bundle metadata when source docs are insufficient.
- Script/system references under `src/scripts/**/*.ts` only through existing
  compiler/source-document metadata, not ad hoc behavior inference.

Discovery result should include ranked candidates:

- controllable entities with reasons such as `CharacterController`,
  `RigidBody`, `Transform`, input binding, script reference, or camera target;
- likely `KeyboardEvent.code` values;
- cameras and follow targets;
- resource IDs and logical paths;
- HUD element IDs/text nodes;
- scenario presets/templates applicable to observed source, e.g.
  `smoke-movement`, `camera-follow`, `hud-resource`, `trigger-pickup`.

When `--entity` or `--press` is missing outside `--discover`, return
`TN_PLAYTEST_ENTITY_REQUIRED` or `TN_PLAYTEST_INPUT_REQUIRED` with top
suggestions instead of only generic usage. `--suggest-scenario <name>` prints a
valid scenario JSON document and does not run the game.

## Watch / Iterate Mode

Add bounded watch mode for agent edit loops:

```bash
tn playtest --project . --scenario playtests/smoke-movement.playtest.json --watch --max-runs 20 --stable-artifacts --json
```

Behavior:

- Watch `content/**/*.json`, `src/scripts/**/*.ts`, `package.json`, project
  config, and the selected scenario file.
- Debounce changes before rerun.
- Rebuild/revalidate through the same path as a normal playtest.
- Support `--max-runs <n>`, `--fail-fast`, and `--pass-once`.
- Use stable artifact paths by default in watch mode unless `--out` provides a
  run-specific directory.
- Text mode prints run number, changed files, pass/fail, top diagnostic, and
  artifact directory.
- JSON mode is newline-delimited events:
  `watch-start`, `run-start`, `run-result`, `watch-error`, and `watch-stop`.

Watch mode must not mutate source, commit files, or run broad gates. It is a
focused proof loop only.

## Phased Implementation

### Phase 1: Scenario Runner And Artifacts

Files:

- Modify `packages/cli/src/commands/playtest.ts`.
- Create `packages/cli/src/commands/playtestScenario.ts`.
- Create `packages/cli/src/commands/playtestArtifacts.ts`.
- Modify `packages/cli/src/commands/playtest.test.ts`.
- Update CLI help in `packages/cli/src/index.ts`.

Tasks:

- Parse `--scenario`, `--out`, `--stable-artifacts`, `--target`, and
  `--viewport`.
- Validate scenario JSON with the diagnostic codes above.
- Convert current one-shot flags into an internal scenario.
- Execute multi-step key press/wait/release sequences in one browser session.
- Write the artifact bundle and include `reproduceCommand`.
- Preserve existing JSON fields where practical: `entity`, `input`, `distance`,
  `movementDelta`, `artifact`, `debugColliderCount`, and `proofMetadata`.

Tests:

- One-shot flags convert to an equivalent scenario.
- Scenario steps load from JSON and preserve order.
- Invalid scenario files return stable diagnostics and exit code 2.
- Artifact manifest includes summary path, screenshots, and reproduce command.
- Existing movement/follow/axis tests keep passing.

Verification:

```bash
pnpm --filter @threenative/cli test -- --run playtest
pnpm --filter @threenative/cli typecheck
pnpm --filter @threenative/cli build
```

Acceptance:

- Existing `tn playtest --entity ... --press ...` commands remain compatible.
- A two-step scenario runs in one browser session.
- JSON output includes a proof directory, diagnostics, assertions, and
  reproduction command.

### Phase 2: Discovery And Scenario Suggestions

Files:

- Modify `packages/cli/src/commands/playtest.ts`.
- Create `packages/cli/src/commands/playtestDiscovery.ts`.
- Reuse or extend source-document readers near
  `packages/compiler/src/scene-document.ts` only if existing metadata is
  insufficient.
- Modify `packages/cli/src/commands/playtest.test.ts`.

Tasks:

- Implement `--discover --json`.
- Implement `--suggest-scenario <preset> --json`.
- Add suggestion payloads to missing entity/input diagnostics.
- Keep preset output genre-aware, but keep core runner generic.

Tests:

- Discovery lists controllable entities and key codes from fixture source docs.
- Missing entity/input diagnostics include ranked suggestions.
- Suggested scenario JSON parses and can be passed to the scenario validator.

Verification:

```bash
pnpm --filter @threenative/cli test -- --run playtest
pnpm --filter @threenative/compiler test -- --run scene-document
```

Acceptance:

- An agent can discover likely playtest targets in one command.
- A suggested scenario can be saved and run without manual restructuring.

### Phase 3: Rich Assertions

Files:

- Modify `packages/cli/src/commands/playtest.ts`.
- Create `packages/cli/src/commands/playtestAssertions.ts`.
- Modify `packages/cli/src/commands/playtest.test.ts`.
- Modify `packages/runtime-web-three/src/render.ts` only if a stable
  observation surface is missing.
- Modify runtime debug/diagnostic helpers only to expose stable observation
  data, not raw handles.

Tasks:

- Implement resource/HUD assertions.
- Implement camera framing using follow separation and projected bounds.
- Implement contact/trigger assertions from effect logs or stable runtime trace.
- Implement animation entered/advanced assertions.
- Implement velocity and rotation/yaw assertions.
- Implement visibility/projected-bounds assertions and screenshot non-empty
  checks.
- Capture and assert console errors, failed network requests, runtime
  diagnostics, and repeated script exceptions.

Tests:

- Each assertion type has pass/fail tests with stable diagnostic codes.
- Console/network/runtime diagnostic capture fails only when requested by
  scenario diagnostics policy.
- Visibility assertions fail when projected bounds are missing and include a
  suggestion to expose stable observation data.

Verification:

```bash
pnpm --filter @threenative/cli test -- --run playtest
pnpm --filter @threenative/runtime-web-three test
pnpm --filter @threenative/runtime-web-three typecheck
```

Acceptance:

- A scenario can prove input, movement, camera, resource/HUD, contact/trigger,
  animation, visibility, and runtime diagnostic outcomes.
- No assertion exposes backend runtime handles as public contract.

### Phase 4: Watch Mode

Files:

- Modify `packages/cli/src/commands/playtest.ts`.
- Create `packages/cli/src/commands/playtestWatch.ts`.
- Modify `packages/cli/src/commands/playtest.test.ts`.

Tasks:

- Implement bounded file watching with debounce.
- Emit stable line-delimited JSON events in `--json` mode.
- Support `--max-runs`, `--fail-fast`, and `--pass-once`.
- Keep artifact paths stable and summaries concise.

Tests:

- `--watch --max-runs 2 --json` emits stable event shapes.
- Debounced source changes trigger one rerun in the test harness.
- `--pass-once` exits after the first passing run.

Verification:

```bash
pnpm --filter @threenative/cli test -- --run playtest
pnpm --filter @threenative/cli typecheck
```

Acceptance:

- Agents can run a bounded self-verification loop without broad gates or manual
  reruns.

### Phase 5: QA And Template Integration

Files:

- Modify `packages/cli/src/commands/gameQaProof.ts`.
- Modify `packages/cli/src/commands/game.ts` only for help/default wiring.
- Modify `tools/verify/src/gameProductionGate.ts` only if the gate consumes
  playtest scenario summaries.
- Modify `templates/structured-source-starter/`.
- Modify `templates/racing-kit-rally-starter/`.
- Modify related CLI/template/verify tests.

Tasks:

- Add starter scenarios where source has matching entities:
  `playtests/smoke-movement.playtest.json`,
  `playtests/camera-follow.playtest.json`, and
  `playtests/hud-resource.playtest.json`.
- Let `tn game qa --run-proof` discover and run a small smoke scenario set when
  scenarios exist.
- Add `--playtest-scenarios <glob>` to QA proof commands.
- Keep expensive video/contact-sheet capture opt-in for broad gates.
- Record playtest summaries as evidence anchors in QA reports.

Tests:

- Template generation includes runnable playtest scenario files.
- `tn game qa --run-proof` includes playtest scenario summaries when present.
- Broad gates do not enable expensive artifacts by default.

Verification:

```bash
pnpm --filter @threenative/cli test
pnpm verify:template-playability
pnpm verify:game-production
```

Acceptance:

- New projects ship with minimal focused scenarios.
- QA can reuse playtest evidence without becoming a full visual proof gate.

### Phase 6: Native / Desktop Bridge

Files:

- Modify `packages/cli/src/commands/playtest.ts`.
- Create `packages/cli/src/commands/playtestTargets.ts`.
- Add native trace tests only when a Bevy runner exists.
- Update `docs/bevy-feature-parity.md` and `docs/STATUS.md` only when actual
  native evidence lands.

Tasks:

- Add a target runner abstraction.
- Keep `web` implemented.
- Make `desktop`/`bevy` return `TN_PLAYTEST_TARGET_UNSUPPORTED` until native
  trace capture exists.
- Define native trace shape:
  transforms, resource snapshots, HUD text snapshots, contact/trigger events,
  animation states, projected bounds or screenshot evidence, runtime
  diagnostics, and artifact paths.

Tests:

- `--target desktop` fails explicitly with `TN_PLAYTEST_TARGET_UNSUPPORTED`
  until implemented.
- Future native trace tests produce the same assertion result shape as web.

Verification:

```bash
pnpm --filter @threenative/cli test -- --run playtest
pnpm verify:conformance
```

Acceptance:

- Scenario files are target-neutral.
- Native/desktop support is not overclaimed before evidence exists.

## Output Contract

Passing JSON:

```json
{
  "code": "TN_PLAYTEST_OK",
  "pass": true,
  "scenario": "smoke-movement",
  "target": "web",
  "runtime": "web",
  "summary": "player moved 1.42 units; camera.main followed within 6.3 units; no console errors",
  "assertions": [
    { "id": "movement", "pass": true },
    { "id": "camera", "pass": true }
  ],
  "artifacts": {
    "directory": "artifacts/playtest/smoke-movement/latest",
    "summary": "artifacts/playtest/smoke-movement/latest/summary.json",
    "beforeScreenshot": "artifacts/playtest/smoke-movement/latest/before.png",
    "afterScreenshot": "artifacts/playtest/smoke-movement/latest/after.png",
    "effectLog": "artifacts/playtest/smoke-movement/latest/effect-log.json",
    "console": "artifacts/playtest/smoke-movement/latest/console.json",
    "network": "artifacts/playtest/smoke-movement/latest/network.json"
  },
  "diagnostics": [],
  "reproduceCommand": "tn playtest --project . --scenario playtests/smoke-movement.playtest.json --out artifacts/playtest/smoke-movement/latest --json",
  "proofMetadata": {}
}
```

Failing JSON:

```json
{
  "code": "TN_PLAYTEST_FAILED",
  "pass": false,
  "scenario": "smoke-movement",
  "summary": "player did not move after KeyW.",
  "diagnostics": [
    {
      "code": "TN_PLAYTEST_INPUT_NO_EFFECT",
      "severity": "error",
      "message": "Entity 'player' moved 0.000000 units after 'KeyW', below threshold 0.01.",
      "suggestion": "Check input bindings, script action names, and fixed/update schedule wiring."
    }
  ],
  "artifacts": {
    "directory": "artifacts/playtest/smoke-movement/latest"
  }
}
```

## Non-Goals

- Do not replace `tn game qa`, visual parity gates, production release gates, or
  manual design review.
- Do not make screenshot existence the proof of gameplay correctness.
- Do not hardcode genre-specific command flags in core `tn playtest`.
- Do not expose raw Three.js, Bevy, DOM, Playwright, renderer, or native runtime
  handles.
- Do not infer durable game behavior from generated bundles when structured
  source is available.
- Do not edit generated `dist/**`, emitted bundle JSON, or
  `scripts.bundle.js`.
- Do not make broad gates slow by default.
- Do not claim native/desktop support before a Bevy trace runner produces
  evidence.

## Documentation Updates

- `docs/PRDs/README.md` should link this PRD under Runtime And Gameplay Parity.
- CLI help must document `--scenario`, `--discover`, `--suggest-scenario`,
  `--target`, `--out`, `--stable-artifacts`, and `--watch`.
- Template docs should mention generated `playtests/*.playtest.json` only after
  templates include them.
- `docs/STATUS.md` and `docs/bevy-feature-parity.md` should change only when
  implementation changes release/status claims.

## Final Verification For This PRD

Documentation-only validation:

```bash
npx -y pnpm@10.25.0 check:docs
git diff --check -- docs/PRDs/other/playtest-self-verification-polish.md docs/PRDs/README.md
```

Implementation PRs should run the narrowest matching commands from each phase,
then broaden only when runtime observation, templates, QA, or native parity are
changed.

## Success Criteria

- An agent can discover a valid playtest target/input and generate a runnable
  scenario without guessing.
- Existing one-shot playtest commands remain compatible.
- Scenario runs produce stable diagnostics, suggestions, and artifact bundles.
- Rich assertions catch common false positives: no movement, wrong direction,
  missing camera follow, stale HUD/resource state, missing trigger/contact,
  idle animation, invisible subject, console errors, and network/runtime
  failures.
- Watch mode supports a bounded edit-test-repair loop.
- Templates and QA consume focused scenarios without slowing broad gates.
- Native support has a target-neutral contract and explicit unsupported
  diagnostics until implemented.
