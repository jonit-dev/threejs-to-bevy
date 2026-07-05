# Humanoid Physics Course Asset Provenance

## Player Hero

- Asset: `assets/models/Soldier.glb`
- Role: humanoid player hero
- Source URL: `https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/Soldier.glb`
- Download URL: `https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Soldier.glb`
- Upstream ref checked: `87ca874c6aedc26800dbd7903736da739e8a40f5 refs/heads/dev`
- SHA-256: `dfb230fc1f942f259dd00281a1186953ad602fc5d69067ce63e24b2aa439736b`
- Animation clips inspected with `pnpm exec gltf-transform inspect`: `Idle`, `Run`, `TPose`, `Walk`.
- Declared clips in `content/assets/arena.assets.json`: `idle`, `run`, `walk`.
- License evidence: Three.js repository is MIT. The repo workflow cautions that example media can have mixed per-file metadata, so this example preserves the exact upstream URL and ref.

## Catalog Search Evidence

- Required first sourcing action run: `tn asset source search --game-category rpg-adventure --format glb --direct-only --json`.
- Selected catalog record for workflow evidence: `kenney-basic-scene-character-soldier-glb`.
- Record source URL: `https://github.com/KenneyNL/Starter-Kit-Basic-Scene/tree/main/sample/Mini%20Arena/Models/GLB%20format`
- Record provenance URL: `https://github.com/KenneyNL/Starter-Kit-Basic-Scene/blob/main/sample/Mini%20Arena/Models/GLB%20format/character-soldier.glb`
- Origin: Kenney Starter Kit Basic Scene, reviewed by repo curation, CC0-1.0.
- Decision: not used for the hero because the user explicitly requested the Three.js Soldier GLB.

## Surface Texture

- Asset: `assets/textures/ue-test-surface.png`
- Role: repeated surface texture for floor, stairs, ramp, ledge, and course platforms
- Source file supplied by user: `/home/joao/.codex/attachments/5d27ef25-9cad-4b31-88b9-69fcdc91d272/image-1.png`
- SHA-256: `95252dd4c9b17283b17bfd6b42a58217f5f68f386e11a231ad74dcec6e5f3d2b`
- Dimensions: 1254 x 1254 PNG RGB.

## Skybox Texture

- Asset: `assets/textures/DaySkyHDRI003B_2K_TONEMAPPED.jpg`
- Role: local equirectangular skybox and reflection environment for the test course
- Catalog ID: `ambientcg-dayskyhdri003b-2k`
- Source URL: `https://ambientcg.com/a/DaySkyHDRI003B`
- Download URL: `https://ambientcg.com/get?file=DaySkyHDRI003B_2K.zip`
- Provenance URL: `/home/joao/projects/threejs-to-bevy/docs/data/ambientcg-asset-sources.snapshot.json`
- Origin: ambientCG HDRI API snapshot, reviewed by repo curation, CC0-1.0.
- Selected file from ZIP: `DaySkyHDRI003B_2K_TONEMAPPED.jpg`
- SHA-256: `d023979efb82bd30107ade7a43005277e6ec3b16cb607ee20caed7796f5d0bbb`
- Dimensions: 2048 x 1024 JPEG sRGB.

## Authored Course Geometry

- Stairs, ramp, platform, walls, sweep hazards, push crates, checkpoint pads, and finish markers are authored structured-source primitives.
- These are not claimed as imported art. They are custom obstacle-course test geometry with deliberate scale, materials, physics metadata, and the supplied surface texture.

## Course PBR Texture Sets (ambientCG, CC0-1.0)

All three sets downloaded 2026-07-05 from ambientCG (CC0-1.0, no attribution
required). Selected files from each ZIP: `*_Color.jpg`, `*_NormalGL.jpg`,
`*_Roughness.jpg`, renamed to lowercase set-prefixed names.

### Concrete042A (floor)

- Assets: `assets/textures/concrete042a_{color,normal,roughness}.jpg`
- Role: course floor surface (`mat.course.surface`)
- Source URL: `https://ambientcg.com/a/Concrete042A`
- Download URL: `https://ambientcg.com/get?file=Concrete042A_2K-JPG.zip`
- Color map SHA-256: `0625a9d04eb59e6b90fb668a3ffb656701199a70383af341dae7f6ac36f29f5f`
- Dimensions: 2048 x 2048 JPEG.

### Concrete034 (walls, edges)

- Assets: `assets/textures/concrete034_{color,normal,roughness}.jpg`
- Role: wall and edge surfaces (`mat.course.dark`, `mat.course.edge`)
- Source URL: `https://ambientcg.com/a/Concrete034`
- Download URL: `https://ambientcg.com/get?file=Concrete034_1K-JPG.zip`
- Color map SHA-256: `8ceb9186d990b31fce785e06fdc6974c160f1d27c43f6160266f164deba713aa`
- Dimensions: 1024 x 1024 JPEG.

### Planks037B (crates)

- Assets: `assets/textures/planks037b_{color,normal,roughness}.jpg`
- Role: pushable crate surfaces (`mat.crate`)
- Source URL: `https://ambientcg.com/a/Planks037B`
- Download URL: `https://ambientcg.com/get?file=Planks037B_1K-JPG.zip`
- Color map SHA-256: `462bb92babb5ecd248525020e5bd20f1abffaa27313c57c88c68388f0c2aa5b1`
- Dimensions: 1024 x 1024 JPEG.
