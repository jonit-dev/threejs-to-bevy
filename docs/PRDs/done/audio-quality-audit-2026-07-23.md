# PRD: Automated Audio Intensity And Loop Audit

## Objective

Add a project-scoped verification gate that prevents inaudible, unresolved,
clipping-prone, or incorrectly looping audio from reaching release evidence.
The owning inputs remain structured audio documents, asset manifests, script
audio calls, and generation provenance; the verifier must not maintain a
second sound list.

## Commands

```bash
pnpm --filter @threenative/verify-tools build
node tools/verify/dist/audioQualityGate.js \
  --project examples/battle-of-pacific
pnpm --filter @threenative/verify-tools test -- --run "audio quality"
pnpm verify:focused verify:audio-quality
```

## Project Structure

- `tools/verify/src/audioQualityGate.ts`: project discovery, PCM measurement,
  diagnostics, and report emission.
- `tools/verify/src/audioQualityGate.test.ts`: threshold and drift controls.
- `tools/verify/src/gateDescriptors.ts`: focused/release enrollment.
- `tools/verify/artifacts/audio-quality/verification-report.json`: generated
  evidence.
- `content/audio/*.audio.json`: canonical sound IDs and asset bindings.
- `content/assets/*.assets.json`: canonical audio asset paths.
- `content/assets/*.sfx-generation.json`: generated-loop intent.
- `src/scripts/**/*.ts`: literal playback IDs, loop intent, and gain.

## Contract And Thresholds

- Every literal `context.audio.play` sound ID must resolve through a structured
  audio document and audio asset manifest to a project-local file.
- Dynamic sound IDs fail with an actionable diagnostic because they cannot be
  audited deterministically.
- Decoded source audio fails when RMS is below -36 dBFS or peak is below
  -18 dBFS.
- Each literal playback gain is combined with source peak. Effective peak
  below -18 dBFS fails as inaudible; source peaks at or above -0.1 dBFS warn
  about clipping risk without weakening the audibility gate.
- `music.*` cues and calls with `loop: true` are loop-intent cues. Generated
  provenance must agree with that intent.
- Loop-intent cues must be at least one second long, keep first/last 50 ms RMS
  within 12 dB, and avoid an end-to-start sample discontinuity above 0.25.
- Provenance marked `loop: true` without structured/script loop intent fails,
  preventing accidental one-shot/loop drift.

## Testing Strategy

- Pure unit tests inject measured PCM metrics and prove each diagnostic without
  external processes.
- One focused real-project run decodes declared assets through `ffmpeg` and
  writes the release artifact.
- Negative controls cover quiet source audio, quiet effective playback,
  unresolved sound IDs, loop-provenance mismatch, short loops, and bad seams.

## Boundaries

- Always derive sound inventory from source documents and scripts.
- Always fail closed when `ffmpeg` cannot decode a declared audio asset.
- Never inspect runtime adapter handles or generated bundle files as the source
  of truth.
- Never normalize or rewrite audio from inside the gate; diagnostics point back
  to the authored asset or playback gain.

## Success Criteria

- The focused gate passes for Battle of Pacific after the flak cue is
  normalized.
- Lowering the flak source or playback level triggers a stable intensity
  diagnostic.
- Marking a non-looping generated cue as a runtime loop, or introducing a
  discontinuous loop, triggers a stable loop diagnostic.
- The descriptor enrolls the report in focused and release verification.
