# Workflow Docs

Workflow docs cover contributor, asset, and automation practices.

- [Developer Workflow](developer-workflow.md)
- [AI Workflows](ai-workflows.md)
- [Agent Game Creation](agent-game-creation.md)
- [Conventions](conventions.md)
- [Compact Scene Source](compact-scene-source.md)
- [Asset Pipeline](asset-pipeline.md)
- [Open Source 3D Asset Kits](open-source-3d-asset-kits.md)

Asset sourcing automation starts with `tn asset source search`, backed by the
local or hosted asset catalog. The local SQLite artifact path is
`packages/cli/data/asset-sources.sqlite`, but large generated catalog artifacts
are not tracked in Git. Use
[Asset Pipeline](asset-pipeline.md) for the catalog-to-download-to-inspect loop
and [Open Source 3D Asset Kits](open-source-3d-asset-kits.md) for policy,
license cautions, and fallback human review.
