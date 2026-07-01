# Input Binding Contract

ThreeNative input IR stores keyboard bindings as browser `KeyboardEvent.code`
values. Canonical values include `KeyW`, `Digit1`, `ArrowUp`, `Space`,
`Escape`, `Enter`, modifier-side codes such as `ShiftLeft`, and function keys
`F1` through `F24`.

Structured source may use ergonomic keyboard aliases while projects migrate:

- `keyboard.w` -> `keyboard.KeyW`
- `keyboard.1` -> `keyboard.Digit1`
- `keyboard.arrow-up` -> `keyboard.ArrowUp`
- `keyboard.space` -> `keyboard.Space`
- `keyboard.esc` -> `keyboard.Escape`

The compiler normalizes supported aliases before emitting `input.ir.json`.
`tn authoring validate --json` reports `TN_INPUT_KEYBOARD_CODE_NORMALIZED`
warnings with the source file and JSON pointer so durable source can be updated.

Emitted IR is strict. Non-canonical or unknown keyboard codes fail validation
with `TN_INPUT_KEYBOARD_CODE_INVALID` and, when possible, a suggested canonical
replacement. This applies to action bindings, axis negative/positive/value
bindings, controls-settings default bindings, and persisted keyboard overrides.

Pointer, touch, and gamepad binding syntax is unchanged. Gamepad bindings remain
optional unless the target runtime promotes required gamepad support.
