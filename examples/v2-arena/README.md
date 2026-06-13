# V2 Arena

Canonical V2 arena demo covering R3F scene capture, ECS gameplay declarations,
input/time, physics, UI, audio assets, web preview, and native loading.

```bash
pnpm tn -- build --project examples/v2-arena
pnpm tn -- verify --project examples/v2-arena --profile v2-arena
```

Supported edits should stay within `@threenative/sdk`, `@threenative/r3f`, and
`@threenative/ui` declarations. Runtime, DOM, Three.js renderer, Bevy, and
physics-backend APIs are intentionally outside this portable example.
