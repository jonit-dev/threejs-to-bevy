# Neon Harbor Rescue Friction Log

## Summary

This example exercises a web-first mid-size slice: menu flow, settings, two
gameplay phases, HUD, audio metadata, saved-progress metadata, fail/retry, and
committed playtest scenarios. It remains build-only until source art,
persistence, and release evidence are promoted.

## Events

| Category | Command or artifact | Expected behavior | Outcome | Follow-up |
| --- | --- | --- | --- | --- |
| command gap | `pnpm exec tn ...` from repo root | Root workspace exposes `tn` for planning. | `tn` was not on the root exec path. | Use local CLI path in example scripts; consider a root workspace bin alias if more examples need direct root invocation. |
| asset gap | `tn asset source search --game-category urban-rescue --format glb --direct-only --json` | Catalog-first hero/environment assets selected for high-value surfaces. | Deferred for this first build-only slice; source-authored primitives are recorded as placeholders. | Promote only after catalog/open-source or authored custom meshes replace placeholder surfaces. |
| proof gap | `GameState.savedProgress` | Saved state is visible and asserted. | Passing web scenarios assert `slot.main` saved-progress metadata; full local-data persistence is not wired. | Add a bounded starter operation for local-data persistence source before release enrollment. |
| docs/API-card gap | `docs/API-CARD.md` | Agents can stay within ScriptContext APIs. | Existing card was sufficient for resources, input, state, and transforms. | None for this slice. |
| proof gap | `playtests/settings.playtest.json` | Settings proof toggles KeyM and observes high-contrast mode. | KeyM did not reach the action map in the proof scenario, so the committed settings scenario asserts declared/default settings state instead. | Add a focused input-action playtest fixture before promoting interactive settings toggles. |
| runtime environment | `pnpm run iterate` | Web-first iterate runs all committed scenarios. | Initial scaffold still included a native smoke scenario, which failed without `DISPLAY`; the web-first example now removes that native-only playtest and passes iterate. | Keep this example web-first unless a shipped-game native need is documented. |
| proof pass | `pnpm run iterate` | Movement, progression, settings, and retry pass committed playtests. | Passed with seven web scenarios: archetype, camera, fail-retry, HUD resource, progression, settings, and smoke movement. | None for this slice. |

## Follow-Ups

- Add reusable local-data persistence authoring for saved progress and settings.
- Replace placeholder primitives with catalog/open-source or custom authored
  meshes before release enrollment.
- Add visual-quality screenshot and contact-sheet evidence before promoting
  this example beyond build-only.
