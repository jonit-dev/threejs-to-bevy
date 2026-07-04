# Render Look Profiles

Render look profiles are the portable selector for default renderer character.
They choose semantic renderer policy without exposing Three.js passes, Bevy
components, native renderer handles, or arbitrary post-processing chains.

The source-backed field lives on runtime config:

```json
{
  "schema": "threenative.runtime-config",
  "version": "0.1.0",
  "renderer": {
    "antialias": "msaa4",
    "renderLook": {
      "version": 1,
      "profile": "balanced",
      "overrides": {
        "exposure": 1.1,
        "contrast": 0.1,
        "saturation": 1.15,
        "bloomIntensity": 0.4,
        "shadowQuality": "high",
        "environmentIntensity": 1.2
      }
    }
  },
  "time": { "fixedDelta": 0.016666666666666666, "paused": false },
  "window": { "width": 1280, "height": 720 }
}
```

## Profiles

`parity` is the deterministic profile for conformance, migration, regression
debugging, and fixtures that need stable visual comparisons. Existing runtime
configs without `renderer.renderLook` behave as `parity` until an author or
migration explicitly opts in.

`balanced` is the promoted quality profile for new game defaults. It may map to
portable sRGB color management, tone mapping, exposure, antialiasing, bloom
intent, shadow quality, and environment intensity where a target supports those
semantics.

`cinematic` and `stylized` are reserved profile names. They are rejected by IR
validation until web and Bevy mappings plus screenshot evidence prove the
semantics.

## Overrides

Overrides are bounded semantic controls:

| Field | Range |
| --- | --- |
| `exposure` | `0.25..4` |
| `contrast` | `-0.5..0.5` |
| `saturation` | `0..2` |
| `bloomIntensity` | `0..2` |
| `environmentIntensity` | `0..4` |
| `shadowQuality` | `off`, `low`, `medium`, `high` |

Targets must report requested and applied profile values. If a promoted
semantic cannot be applied, the target reports a fallback diagnostic instead of
silently substituting renderer-specific behavior.

## Diagnostics

`TN_RENDER_PROFILE_UNSUPPORTED` rejects unknown, reserved, malformed, or
backend-specific profile payloads.

`TN_RENDER_LOOK_OUT_OF_RANGE` rejects bounded overrides outside their portable
range.

`TN_VISUAL_PARITY_PROFILE_MISMATCH` is reserved for verification gates when a
strict parity fixture requests a non-parity profile.

`TN_RENDER_PROFILE_FALLBACK_USED` is reserved for runtime and verification
reports when a target degrades a requested semantic effect.

## Parity Rules

Visual parity gates use `parity` and must not inherit quality effects from game
defaults. Quality profiles are allowed to be visibly richer, but the proof is
metric and artifact based rather than pixel-perfect matching between web and
Bevy.
