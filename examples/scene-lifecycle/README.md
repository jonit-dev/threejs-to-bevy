# Scene Lifecycle

Canonical multi-scene lifecycle example for menu -> loading -> level -> pause
overlay -> credits flow. It proves modular scene authoring, `scenes.ir.json`
emission, scene service declarations, and deterministic transition/readiness
traces.

```bash
pnpm --filter @threenative/compiler test -- --test-name-pattern scene.lifecycle
```
