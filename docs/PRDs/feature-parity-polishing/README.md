# Feature Parity Polishing PRD Bundle

This bundle turns the current `Gap side` rows in
`docs/bevy-feature-parity.md` into focused implementation PRDs. It does not
reopen rows that are already marked as product boundaries or completed
diagnostic boundaries unless a PRD explicitly narrows a promotable subset.

## Gap-Side Map

| PRD | Gap side covered | Parity rows |
| --- | ---------------- | ----------- |
| [PRD-001 Shared Contract Residuals](../done/feature-parity-polishing/PRD-001-shared-contract-residuals.md) (done) | Shared SDK/IR/compiler contract | Geometry, materials, rendering, window/platform policy |
| [PRD-002 Cross-Adapter Visual Calibration](../done/feature-parity-polishing/PRD-002-cross-adapter-visual-calibration.md) (done) | Both adapters | Lights/shadows, material rendering, post-processing, dense-scene visual proof |
| [PRD-003 Native UI Text Accessibility](../done/feature-parity-polishing/PRD-003-native-ui-text-accessibility.md) (done) | Bevy/native plus both adapters for world-attached/effect parity | UI, text, accessibility |
| [PRD-004 Physics Navigation Native Depth](PRD-004-physics-navigation-native-depth.md) | Bevy/native proof depth plus shared boundaries | Physics, character movement, navigation |
| [PRD-005 Audio Platform Runtime Polish](PRD-005-audio-platform-runtime-polish.md) | Both adapters plus shared platform policy | Audio, window/platform runtime |

## Shared Conventions

- New `verify:feature-parity-*` gates are focused gates: register them in
  `FOCUSED_GATES` in `tools/verify/src/cli/run.ts` (and in
  `RELEASE_FOCUSED_GATES` in `tools/verify/src/release.ts` if release-gated),
  then invoke them as `pnpm verify:focused verify:feature-parity-<name>`.
  Do not add a root `package.json` alias unless the gate joins the everyday
  local loop.

  Registration template (matches the existing entry shape in `run.ts`):

  ```ts
  "verify:feature-parity-<name>": {
    commands: [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["pnpm", "--filter", "@threenative/verify-tools", "build"],
      ["node", "scripts/verify-feature-parity-<name>.mjs"],
    ],
    description: "<one-line gate purpose>.",
    metadata: {
      owner: "tools/verify feature-parity-<name> gate",
      profile: "focused",
      reason: "<why this gate exists>.",
      protects: "<claims this gate keeps honest>.",
    },
  },
  ```

  If the gate becomes release-gated, also append to `RELEASE_FOCUSED_GATES`
  in `tools/verify/src/release.ts`:

  ```ts
  { name: "verify feature parity <name>",
    reportPath: "tools/verify/artifacts/feature-parity-<name>/verification-report.json",
    script: "verify:feature-parity-<name>" },
  ```
- Aggregate gate reports and screenshots live under
  `tools/verify/artifacts/<gate>/`; native-only captures live under
  `runtime-bevy/artifacts/`. Example-scoped scenario evidence may also live
  under `examples/<name>/artifacts/<gate>/` when a fixture is example-owned.
- Native runtime code lives in `runtime-bevy/crates/threenative_runtime/src`
  (with `threenative_components` and `threenative_loader` as siblings), and
  native integration tests in
  `runtime-bevy/crates/threenative_runtime/tests/<area>.rs` with
  `<area>_should_<behavior>` test function names, e.g.:

  ```rust
  // runtime-bevy/crates/threenative_runtime/tests/light_profile.rs
  #[test]
  fn light_profile_should_report_selected_shadow_profile() {
      // build fixture app, run schedule, assert emitted report fields
  }
  ```
- `tools/verify/src` test files use camelCase (`adapterSurfaceDrift.test.ts`);
  `packages/*/src` test files may use kebab-case.

## Resolved Grounding Bugs

- PRD-001 fixed stale `docs/bevy-feature-parity.md` citations for `pnpm verify:rendering-residuals`,
  `pnpm verify:input-ui-polish`, `pnpm verify:persistence-reload`,
  `pnpm verify:production-hardening`, `pnpm verify:animation-physics-residuals`,
  and `pnpm verify:v10:visual-calibration` as direct commands, but none are
  root `package.json` scripts; they only exist as focused gates. Every cited
  command failed as written. They now use
  `pnpm verify:focused verify:<gate>` (the editor row already uses this form)
  or by adding root aliases, and pick one convention.
- PRD-001 extended `tools/verify/src/docs.ts` to catch that drift; previously it checked a hand-picked
  set of strings, not that every `pnpm verify:*` command cited in docs resolves
  to a root script or a registered `FOCUSED_GATES` entry. PRD-001 Phase 2 adds
  this check so the class of bug stays fixed. Suggested shape:

  ```ts
  import { FOCUSED_GATES } from "./cli/run.js";

  const CITED_COMMAND = /pnpm (verify:[a-z0-9:-]+)/g;
  const FOCUSED_INVOCATION = /pnpm verify:focused (verify:[a-z0-9:-]+)/g;

  function checkCitedVerifyCommands(
    path: string,
    content: string,
    rootScripts: Record<string, string>,
    push: (diagnostic: VerificationDiagnostic) => void,
  ): void {
    const focusedTargets = new Set(
      [...content.matchAll(FOCUSED_INVOCATION)].map((match) => match[1]),
    );
    for (const match of content.matchAll(CITED_COMMAND)) {
      const script = match[1];
      if (script === "verify:focused" || rootScripts[script]) {
        continue;
      }
      if (focusedTargets.has(script) && FOCUSED_GATES[script]) {
        continue;
      }
      push({
        code: "docs.verify-command-drift",
        message:
          `${path} cites 'pnpm ${script}' but package.json has no such ` +
          `script; use 'pnpm verify:focused ${script}' or add a root alias.`,
      });
    }
  }
  ```

  And the parity-doc rewrite it enforces, for example on the audio row:

  ```diff
  -| `pnpm verify:production-hardening`, conformance fixtures |
  +| `pnpm verify:focused verify:production-hardening`, conformance fixtures |
  ```

## Execution Order

1. Start with `PRD-001` so schemas, diagnostics, and capability boundaries are
   stable before adapter work.
2. Run `PRD-002` and `PRD-003` independently; both rely on the shared contract
   decisions but touch different runtime surfaces.
3. Run `PRD-004` after any contract changes that affect collider/nav metadata.
4. Run `PRD-005` last unless an audio or platform bug blocks a shipped game.

Each PRD must update `docs/bevy-feature-parity.md`, the relevant
`docs/status/capabilities/*.md` page, and the one-line index in
`docs/STATUS.md` when it changes a capability or release-gate claim.
