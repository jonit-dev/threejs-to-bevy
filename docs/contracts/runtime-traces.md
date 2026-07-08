# Runtime Trace Contracts

Runtime traces are focused semantic observations used by conformance gates.
They are adapter output, not authored IR, and must not expose private Bevy,
Three.js, DOM, or renderer handles.

Trace bundles use:

```json
{
  "schema": "threenative.runtime-traces",
  "version": "0.1.0",
  "slices": {}
}
```

Required slices:

- `transformSnapshot`: frame number plus stable entity ids, parent ids,
  component names, position, rotation, and scale. Numeric comparisons use a
  `0.001` tolerance.
- `physicsContacts`: frame number plus stable entity id pairs and contact kind
  (`collision` or `trigger`).
- `uiTree`: frame number plus the retained UI tree using conformance UI node
  fields.
- `animationState`: frame number plus clip availability/playback state and
  weight.
- `renderObservation`: frame number, active camera, camera render targets, and
  visible entity ids.

Stable ids must be authored ids using letters, numbers, `.`, `:`, `_`, or `-`.
Generated runtime-local ids, pointer values, entity indices, DOM node ids, and
renderer object handles are invalid trace ids.

Conformance compares traces separately from broad runtime reports so runtime
parity failures point at the semantic slice that drifted.
