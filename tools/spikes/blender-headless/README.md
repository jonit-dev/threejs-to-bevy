# Blender Headless Spike

This Linux x64-only prototype proves an optional Blender 4.5.11 LTS download,
checksum-verified cache, structured background job, and GLB export. It is not a
published `tn` command or production installer.

```bash
node tools/spikes/blender-headless/blender-tool.mjs status --json
node tools/spikes/blender-headless/blender-tool.mjs install --json
node tools/spikes/blender-headless/blender-tool.mjs generate \
  --input tools/spikes/blender-headless/example.crate.json \
  --output /tmp/threenative-crate.glb \
  --json
pnpm --filter @threenative/cli tn -- asset inspect \
  /tmp/threenative-crate.glb --json
```

Set `TN_BLENDER_CACHE` to isolate the prototype cache. The production design,
including explicit install consent and cross-platform support, is specified in
`docs/PRDs/other/optional-headless-blender-asset-generation.md`.
