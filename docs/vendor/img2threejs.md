# img2threejs Internal Fork

ThreeNative uses a minimal private integration fork of img2threejs for the
agent-guided source-authoring stages. Binary GLB export remains owned by the
ThreeNative CLI and is not implemented in this fork.

## Reviewed Source

- Upstream repository: <https://github.com/hoainho/img2threejs>
- Internal fork: <https://github.com/jonit-dev/img2threejs-internal> (private
  mirror preserving upstream Git history; GitHub reports `fork=false` because
  a public network fork cannot be private)
- Upstream base: `e8ff28a6ae0cb534c7b2ebc15cb3f06709262d5b`
- Reviewed upstream base tree: `75f7d805630d4819a8957643d3969232187d339c`
- Supported integration commit: `c4eb8059e1304884386c86c7cf7448228887da81`
- Supported integration tree: `3f410de76c9a7ae53875abe7b47f99edf3beb2a6`
- Supported skill version: `1.2.0`
- License: MIT; the upstream `LICENSE` is preserved at blob
  `97f66605397b3c505f6867cfb47dbcf537de06f6`.
- Last sync review: 2026-07-22 UTC (2026-07-21 America/Vancouver)

The private mirror retains the unmodified upstream commit on `upstream/main` and
uses `threenative/integration` for bounded integration patches. The supported
patch adds only these seven paths:

- `SKILL.md` and `grimoire/integrations/threenative.md` for the explicit,
  object-only ThreeNative finalization branch
- `forge/stage3_build/orchestrate_passes.py` and
  `forge/stage5_export/new_threenative_recipe.py` for fail-closed completion and
  deterministic structured recipe emission
- `forge/tests/test_pipeline.py` and `forge/tests/test_threenative_recipe.py`
  for generic-default and integration contract proof
- `CONTRIBUTING.md` for complete test discovery

## Sync Procedure

1. In a local clone, configure `upstream` as
   `https://github.com/hoainho/img2threejs.git`, then fetch an explicit upstream
   tag or commit onto `upstream/main` without
   rewriting history.
2. Review its license, skill version, scripts, schemas, rubrics, and pipeline
   tests. Record the candidate commit and tree hashes.
3. Rebase or merge the minimal `threenative/integration` patch list, preserving
   generic upstream behavior.
4. Run the complete upstream test suite, deterministic ThreeNative recipe
   fixtures, visual golden proof, and the ThreeNative img2threejs provider gate.
5. Advance the supported commit/tree in the provider registry and this record
   together. Recipes naming any other commit must fail closed with the upgrade
   instructions.

Input-image and generated-model rights are separate from the MIT license of
the fork. Asset registration must retain the user-supplied source, license, and
attribution metadata without embedding the reference image in the GLB.
