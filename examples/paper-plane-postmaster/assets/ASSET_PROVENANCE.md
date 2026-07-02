# Asset Provenance

Game: Paper Plane Postmaster

Planning and sourcing:

- Plan command: `tn game plan --goal "paper plane postmaster rooftop stamp delivery arcade game" --project examples/paper-plane-postmaster --json`
- SQLite direct GLB search: `tn asset source search --game-category arcade --format glb --direct-only --json`
  - Result: `TN_ASSET_SOURCE_NO_MATCH`; no direct GLB records.
- SQLite direct GLB search: `tn asset source search --game-category flight --format glb --direct-only --json`
  - Result: no direct records.
  - Fallback record inspected with `tn asset source get workflow-github-hosted-sources-babylon-js-assets-index --json`.
  - Catalog ID: `workflow-github-hosted-sources-babylon-js-assets-index`
  - Source URL: https://github.com/BabylonJS/Assets/blob/master/Assets.md
  - Provenance URL: `docs/workflows/open-source-3d-asset-kits.md#github-hosted-sources`
  - Origin: Babylon.js Assets index, imported from `docs/workflows/open-source-3d-asset-kits.md`, line 266.
  - License posture: `permissive-attribution`, repo README says CC BY 4.0 unless an asset folder says otherwise.
  - Review status: reviewed.
  - Decision: not selected because it is a non-direct index source and would require exact subasset review/download before use.

Committed/runtime assets:

- `assets/paper-chime.wav`
  - Local generated PCM WAV cue, copied from prior generated-game local tooling output.
  - Purpose: audio-feedback surface for stamp collect, mailbox delivery, hazard, and landing moments.

Custom authored structured-source kit:

- `player-hero`: composed paper plane silhouette using primitive wings/body/nose/tail panels.
- `obstacle-enemy`: animated gust fans and wind rings.
- `reward-interactable`: stamp tokens and mailbox targets.
- `world-environment`: rooftop desk, rails, envelopes, chimneys, landing mat, sky-blue paper backdrop.
- `ui-hud`: retained source UI states in `content/ui/hud.ui.json`.
- `audio-feedback`: local WAV cue above.

Fallback reason:

The catalog did not provide a direct, cohesive GLB kit for this tiny paper-plane rooftop game. The finished default uses a coherent authored low-poly paper craft kit rather than unrelated catalog assets or bare placeholder blocks.

