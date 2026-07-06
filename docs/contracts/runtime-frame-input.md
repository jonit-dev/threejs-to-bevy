# Runtime Frame Input And Script Reads

This contract covers per-frame input values and script-visible transform reads
that must match between the web Three.js runtime and the native Bevy runtime.

## Pointer Delta Axes

Input bindings that read `pointer.deltaX` or `pointer.deltaY` produce raw
per-frame pointer-motion pixels. Runtimes must not normalize or clamp these
values to the `[-1, 1]` digital/gamepad axis range. Digital keyboard axes,
gamepad axes, and touch axes remain normalized unless their own contract says
otherwise.

## Variable-Schedule Transform Reads

When fixed-step transform interpolation is active, scripts running on
`update` or `postUpdate` observe the same interpolated `Transform` pose that
the renderer will display for fixed-step entities on that frame. This keeps
camera rigs, UI markers, and other variable-schedule consumers aligned with
the visual pose.

Variable-schedule `Transform` writes remain authoritative. If an `update` or
`postUpdate` script writes a transform, that written value is preserved and the
entity is removed from fixed-step interpolation until a later fixed step owns
the transform again.
