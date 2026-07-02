# AGENTS.md

Paper Plane Postmaster is a structured-source ThreeNative example.

- Durable source lives in `content/**/*.json` and `src/scripts/**/*.ts`.
- Do not edit `dist/**`; rebuild with `tn build --project . --json`.
- Keep gameplay behavior in `src/scripts/player.ts` and reference exported systems from `content/systems/arena.systems.json`.
- Preserve the custom low-poly paper rooftop kit provenance in `assets/ASSET_PROVENANCE.md` when changing surfaces.
- Before calling the game done, run authoring validation, build, nonblank screenshot or verify, and input playtest proof.

