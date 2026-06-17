# V9 Skeletal Animation

Focused proof scene for cross-runtime glTF skeletal animation deformation.

## Asset Provenance

- Source URL: https://github.com/KhronosGroup/glTF-Sample-Models/tree/main/2.0/Fox
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- File: `assets/hero.glb` (Khronos Fox sample model)
- SHA256: `d97044e701822bac5a62696459b27d7b375aada5de8574ed4362edbba94771f7`
- Clip inventory: `Armature|Idle`, `Armature|Walk`, `Armature|Run`

The sample plays `Run` on load and declares idle/walk/run clip metadata for compiler
and runtime clip discovery evidence.

Verification:

```bash
pnpm verify:v9:skeletal-animation
```
