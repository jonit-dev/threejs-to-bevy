# Performance Proof Contract

Performance proof sidecars are machine-checkable runtime budget evidence. They
are emitted by proof commands and consumed by verification gates; they are not
durable authoring source.

Generate the web runtime proof with:

```bash
tn performance proof --project . --json
```

Use `--url <preview-url>` to measure an already-running web preview, `--frames`
to set the frame sample count, and `--out <file>` to change the sidecar path.

## Sidecar

The current sidecar schema is `threenative.performance-proof` version `0.1.0`.

```json
{
  "schema": "threenative.performance-proof",
  "version": "0.1.0",
  "status": "pass",
  "generatedBy": "@threenative/verify-tools performanceProof",
  "targetProfile": "desktop-balanced",
  "runtime": {
    "target": "web",
    "adapter": "web-three"
  },
  "budgets": {
    "frameTimeMsP95": 16.7,
    "frameTimeMsP99": 33.4,
    "drawCalls": 240,
    "drawGroups": 120,
    "visibleInstances": 1400,
    "activeLodBands": 4,
    "loadedTextureBytes": 96000000,
    "textureVariantBytes": 96000000,
    "entityCount": 2400
  },
  "metrics": {
    "frameTimeMs": {
      "status": "measured",
      "value": {
        "p50": 8.4,
        "p95": 14.8,
        "p99": 22.1,
        "sampleCount": 600
      }
    },
    "drawCalls": { "status": "measured", "value": 180 },
    "drawGroups": { "status": "measured", "value": 64 },
    "visibleInstances": { "status": "measured", "value": 980 },
    "activeLodBands": { "status": "measured", "value": ["near", "mid", "far"] },
    "loadedTextureBytes": { "status": "measured", "value": 72000000 },
    "textureVariants": {
      "status": "measured",
      "value": {
        "loadedBytes": 72000000,
        "selectedVariantCount": 18
      }
    },
    "entityCount": { "status": "measured", "value": 1800 }
  }
}
```

`runtime.target` is one of `web`, `desktop`, or `native`. `runtime.adapter` is
one of `web-three`, `webview`, or `bevy`.

## Required Metrics

Every sidecar must include these metric keys:

- `frameTimeMs`: measured `p50`, `p95`, `p99`, and `sampleCount`.
- `drawCalls`: measured draw-call count.
- `drawGroups`: measured draw-group count.
- `visibleInstances`: measured visible instance count.
- `activeLodBands`: measured string IDs for active LOD bands.
- `loadedTextureBytes`: measured loaded texture bytes.
- `textureVariants`: measured selected variant count and loaded bytes.
- `entityCount`: measured runtime entity count.

When a runtime cannot emit a non-promoted counter yet, it must still include
the metric key with `status: "unsupported"` and a stable diagnostic:

```json
{
  "status": "unsupported",
  "diagnostic": {
    "code": "TN_PERFORMANCE_DRAW_GROUPS_UNSUPPORTED",
    "severity": "warning",
    "message": "Native draw-group counting is not promoted for this adapter."
  }
}
```

Unsupported metrics are not compared against numeric budgets. Missing metrics,
malformed unsupported diagnostics, and malformed numeric values are verifier
errors.

The current web command emits measured values for all required fields. Native
runtime emission is tracked separately and must use the same sidecar shape.

## Budget Semantics

Budgets are copied from the target profile into the proof sidecar so later
verification is deterministic. The verifier compares measured values to the
budget fields in the same sidecar:

- `frameTimeMs.p95` <= `budgets.frameTimeMsP95`
- `frameTimeMs.p99` <= `budgets.frameTimeMsP99`
- `drawCalls` <= `budgets.drawCalls`
- `drawGroups` <= `budgets.drawGroups`
- `visibleInstances` <= `budgets.visibleInstances`
- `activeLodBands.length` <= `budgets.activeLodBands`
- `loadedTextureBytes` <= `budgets.loadedTextureBytes`
- `textureVariants.loadedBytes` <= `budgets.textureVariantBytes`
- `entityCount` <= `budgets.entityCount`

If any measured value exceeds its budget, the verifier emits
`TN_PERFORMANCE_PROOF_BUDGET_EXCEEDED`. A sidecar with `status: "pass"` and any
schema or budget error also emits `TN_PERFORMANCE_PROOF_STATUS_MISMATCH`.
