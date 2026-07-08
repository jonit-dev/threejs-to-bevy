# Dense World Benchmark

This example is a maintained efficient-scale fixture. It keeps a dense authored
grid of repeated scenery around the starter player path so performance proof
can measure frame cadence, draw calls, visible instances, texture bytes, and
entity counts against a target profile.

Useful commands:

```bash
pnpm run build
pnpm run performance:proof
pnpm verify:efficient-scale
```

Durable source lives in `content/**/*.json` and `src/scripts/**/*.ts`.
`dist/**` and `artifacts/**` are generated proof outputs.
