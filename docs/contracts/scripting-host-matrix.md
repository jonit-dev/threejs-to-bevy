# Scripting Host Matrix

This matrix is the documented compatibility surface for promoted portable
script services. The source-of-truth service IDs live in
`packages/ir/src/scriptingHost.ts`; SDK declarations, IR validation, web
runtime service logging, Bevy host support, and this document must stay aligned.

Unsupported services remain outside the matrix until they have SDK/IR entries,
compiler diagnostics, web runtime behavior, Bevy host behavior, and conformance
evidence. Portable scripts must not use DOM, worker, Node, filesystem, network,
timer, dynamic import/eval, arbitrary npm, raw Three.js, or raw Bevy APIs.

## State and Ambient API Policy

Portable system state must be represented as declared resources, components,
events, local-data records, or promoted services. Mutable module-local variables
are not portable state because runtimes may recreate the script host during
reload, validation, preview, or native scheduling. Source-referenced script
modules therefore reject hidden mutable module state with
`TN_SCRIPT_MODULE_STATE_UNSUPPORTED`; use declared resources or components for
state that must survive between ticks or runtimes.

Forbidden ambient APIs are rejected by compiler diagnostics and remain absent
from the native QuickJS bridge as defense in depth. Portable scripts must not
depend on `window`, `document`, workers, `fetch`, websockets, timers, `process`,
`require`, dynamic imports, `eval`, or `Function`.

| Service | Context API | Web | Bevy | Notes |
| --- | --- | --- | --- | --- |
| `animation.play` | `ctx.animation.play` | implemented | implemented | Playback command service. |
| `animation.query` | `ctx.animation.query` | implemented | implemented | Playback state query. |
| `animation.stop` | `ctx.animation.stop` | implemented | implemented | Playback stop command. |
| `assets.load` | `ctx.assets.load` | implemented | implemented | Bundle-local asset load result. |
| `audio.play` | `ctx.audio.play` | implemented | implemented | Declared script audio playback. |
| `audio.query` | `ctx.audio.query` | implemented | implemented | Script audio playback query. |
| `audio.stop` | `ctx.audio.stop` | implemented | implemented | Script audio playback stop. |
| `character.move` | `ctx.character.move` | implemented | implemented | Bounded character movement observation. |
| `navigation.path` | `ctx.navigation.path` | implemented | implemented | Static navigation path query. |
| `persistence.delete` | `ctx.persistence.delete` | implemented | implemented | Declared save-slot delete. |
| `persistence.listSlots` | `ctx.persistence.listSlots` | implemented | implemented | Save-slot listing. |
| `persistence.load` | `ctx.persistence.load` | implemented | implemented | Declared save-slot load. |
| `persistence.save` | `ctx.persistence.save` | implemented | implemented | Declared save-slot save. |
| `physics.overlap` | `ctx.physics.overlap` | implemented | implemented | Primitive overlap query. |
| `physics.raycast` | `ctx.physics.raycast` | implemented | implemented | Primitive raycast query. |
| `physics.sensor` | `ctx.physics.sensor` | implemented | implemented | Primitive sensor snapshot. |
| `physics.shapeCast` | `ctx.physics.shapeCast` | implemented | implemented | Primitive shape cast query. |
| `picking.mesh` | `ctx.picking.mesh` | implemented | implemented | Mesh picking query. |
| `picking.pointerRay` | `ctx.picking.pointerRay` | implemented | implemented | Pointer ray construction. |
| `scene.change` | `ctx.scenes.change` | implemented | implemented | Scene lifecycle change effect. |
| `scene.current` | `ctx.scenes.current` | implemented | implemented | Current scene query. |
| `scene.loadAdditive` | `ctx.scenes.loadAdditive` | implemented | implemented | Additive scene load effect. |
| `scene.pop` | `ctx.scenes.pop` | implemented | implemented | Scene stack pop effect. |
| `scene.push` | `ctx.scenes.push` | implemented | implemented | Scene stack push effect. |
| `scene.unload` | `ctx.scenes.unload` | implemented | implemented | Scene unload effect. |
| `settings.export` | `ctx.settings.export` | implemented | implemented | Structured settings export. |
| `settings.get` | `ctx.settings.get` | implemented | implemented | Structured settings read. |
| `settings.import` | `ctx.settings.import` | implemented | implemented | Structured settings import. |
| `settings.set` | `ctx.settings.set` | implemented | implemented | Structured settings write. |
| `ui.activate` | `ctx.ui.activate` | implemented | implemented | Retained UI activation. |
| `ui.focus` | `ctx.ui.focus` | implemented | implemented | Retained UI focus. |
| `ui.read` | `ctx.ui.read` | implemented | implemented | Retained UI state read. |
| `ui.setDisabled` | `ctx.ui.setDisabled` | implemented | implemented | Retained UI disabled-state write. |
| `ui.setValue` | `ctx.ui.setValue` | implemented | implemented | Retained UI value write. |
