# Input Binding Syntax

ThreeNative input bindings use portable strings in structured input documents:

```txt
device.control[.axis]
```

- `keyboard.<KeyboardEvent.code>` uses canonical browser code names such as
  `keyboard.KeyW`, `keyboard.ArrowUp`, `keyboard.Space`, and `keyboard.Escape`.
- `pointer.<button>` uses zero-based pointer buttons: `pointer.0` is primary,
  `pointer.1` is middle, and `pointer.2` is secondary.
- Pointer axes use `pointer.x`, `pointer.y`, `pointer.deltaX`,
  `pointer.deltaY`, and `pointer.wheel` where the consuming input declaration
  supports an axis.
- Gamepad bindings use `gamepad.<control>` and may add an axis selector when
  the device control exposes multiple axes.

Bindings are strings, not device descriptor objects. For example:

```json
{
  "actions": [
    { "id": "Select", "bindings": ["pointer.0", "keyboard.Enter"] }
  ],
  "axes": [
    { "id": "MoveX", "negative": ["keyboard.KeyA"], "positive": ["keyboard.KeyD"] }
  ]
}
```

Use canonical keyboard codes so the same durable source works in web and
native adapters without layout-dependent key-name translation.
