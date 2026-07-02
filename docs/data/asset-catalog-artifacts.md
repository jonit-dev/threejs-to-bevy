# Asset Catalog Artifacts

The generated asset source catalog is intentionally not tracked in Git:

- `packages/cli/data/asset-sources.sqlite`
- `docs/data/objaverse-glb-asset-sources.snapshot.json`

Both files exceed GitHub's normal blob limit once the catalog includes the
large Objaverse GLB slice. Keep them in external artifact storage, a local
backup, or the hosted asset catalog API.

To rebuild a local catalog from tracked sources:

```bash
node scripts/build-asset-source-catalog.mjs
```

If `docs/data/objaverse-glb-asset-sources.snapshot.json` is present locally,
the builder includes the Objaverse records. If it is absent, the builder creates
the smaller tracked-source catalog.

