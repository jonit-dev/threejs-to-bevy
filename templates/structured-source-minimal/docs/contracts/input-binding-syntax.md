# Input Binding Syntax

Bindings use the portable string form `device.control[.axis]`.

- Keyboard controls use canonical codes such as `keyboard.KeyW`, `keyboard.ArrowUp`, and `keyboard.Space`.
- Pointer buttons are zero-based: `pointer.0` is primary, `pointer.1` is middle, and `pointer.2` is secondary.
- Pointer axes include `pointer.x`, `pointer.y`, `pointer.deltaX`, `pointer.deltaY`, and `pointer.wheel`.
- Gamepad bindings use `gamepad.<control>`, with an axis selector when the control exposes multiple axes.

Example:

```json
{"actions":[{"id":"Select","bindings":["pointer.0","keyboard.Enter"]}]}
```

Bindings are strings, not device descriptor objects. Canonical keyboard codes keep durable source portable across web and native adapters.

