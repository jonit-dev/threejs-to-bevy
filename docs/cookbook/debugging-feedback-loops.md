---
id: debugging-feedback-loops
goal: Choose the narrowest trustworthy feedback loop and triage a proof that is not reacting to source changes.
category: workflow
surfaces:
  - verification
  - scripts
  - physics
  - visuals
keywords:
  - debug
  - feedback
  - loop
  - trace
  - stale
  - freshness
  - physics
---

Use one focused loop while repairing a local change:

- visual presentation: keep `tn dev --target web` alive and recapture with
  `tn screenshot --url <preview-url>` or `tn parity visual --url <preview-url>`;
- physics/input: run one committed scenario and open its runtime trace only
  when the compact diagnostic names it;
- script/type changes: typecheck or run `tn authoring script check`, then run
  the one scenario that invokes the export;
- integrated milestones: run `tn iterate`.

If before/after traces are identical, confirm input, script attachment,
schedule, and the observed entity/resource owner. If served and local bundle
hashes or source mtimes differ, restart the stale preview before capturing
evidence. If the authored mass/force/thrust/drag/collider budget is physically
impossible, repair that source instead of weakening the proof.

Assign one owner per scene document. Independent content and script files may
be edited concurrently only after their stable IDs agree. One agent owns the
preview; do not run build, dev, or iterate concurrently in one project.

## commands
```bash
tn authoring validate --project . --json
```

## source-delta
```json
{}
```

## script
```ts

```

## proof
```bash

```
