# Open Source 3D Asset Kits

Use this reference when choosing third-party 3D assets, textures, HDRIs,
materials, examples, fixtures, demos, and starter-project content.

## Selection Rules

- Prefer CC0/public-domain assets for examples and reusable templates.
- Use CC BY assets only when attribution can be preserved in source,
  bundled artifacts, and user-facing distribution notes.
- Treat "free" as a price, not a license. Verify the license on the asset page
  at download time.
- Marketplaces, indexes, and GitHub lists can mix licenses across packs,
  creators, and individual files. Record the final asset URL, not only the
  catalog URL.
- Prefer GLB or glTF. FBX, OBJ, STL, USDZ, and `.blend` are acceptable source
  imports only when the converted GLB/glTF is committed or generated through a
  documented step.
- Keep the original asset URL, creator, license, downloaded version/date, and
  any conversion notes next to the committed asset or fixture.
- Run `tn asset inspect` before placing a model in a scene, then use
  `tn model-test` when scale, bounds, materials, or dependencies are uncertain.
- Do not tune runtime adapters to make third-party art look right. Preserve
  authored IR values and fix import, color-space, material, lighting, camera,
  or asset metadata issues instead.

## Recommended Defaults

Use these first for repo examples and starter content.

| Source | License posture | Best fit | Notes |
| --- | --- | --- | --- |
| [Kenney Racing Kit](https://kenney.nl/assets/racing-kit) | CC0 | Racing demos, road tiles, vehicles, track examples | First-choice racing source. The source page lists this as a 3D pack with 110 files. |
| [Kenney 3D Assets](https://kenney.nl/assets/category%3A3D) | CC0/public domain assets | Prototypes, vehicles, buildings, modular levels, mini-game examples | Broad, consistent game-ready catalog. Good default for starter content and deterministic examples. |
| [Quaternius](https://quaternius.com/) | CC0 | Low-poly characters, props, buildings, nature, vehicles, animations | Strong fit for lightweight web/native runtime parity scenes. Use glTF/GLB where available. |
| [KayKit / Kay Lousberg](https://kaylousberg.com/game-assets) | Many packs are CC0; confirm per pack | Low-poly themed kits, city builders, dungeons, character packs, modular scenes | Style-cohesive and atlas-textured. Check each itch.io pack page or GitHub repo license. |
| [Tiny Treats](https://tinytreats.itch.io/) | Many packs are CC0; confirm per pack | Cute/cozy low-poly interiors, parks, props, scenes | Good compact stylized fixtures. Often includes OBJ, FBX, and GLTF. |
| [Poly Haven](https://polyhaven.com/) | CC0 | HDRIs, PBR materials, realistic props | Excellent for environment lighting and physically based material tests. Downsample high-resolution assets for CI. |
| [ambientCG](https://ambientcg.com/) | CC0 | PBR materials, HDRIs, terrain, some models | Good material-map coverage source. Prefer 512/1K/2K variants for fixtures. |
| [TextureCan](https://www.texturecan.com/) | CC0 for listed PBR textures/models | PBR materials and selected CC0 models | Useful for material-map coverage tests; downsample 4K assets. |
| [3DTextures.me](https://3dtextures.me/) | CC0/public-domain style terms | Lightweight PBR material fixtures | Many free downloads are 1K; useful for small test assets. |
| [Open Source 3D Assets / OS3A](https://www.opensource3dassets.com/) | CC0 stated; verify per asset | GLB-first asset discovery, web-friendly models | Technically useful for Three.js/Bevy because assets are GLB-oriented. |

## Kenney Shortlist

Use these Kenney packs before reaching for less consistent sources.

| Source | License posture | Best fit | Notes |
| --- | --- | --- | --- |
| [Racing Kit](https://kenney.nl/assets/racing-kit) | CC0 | Racing tracks, vehicle demos, tile-based road layouts | Canonical source for racing fixtures and examples. |
| [Car Kit](https://kenney.nl/assets/car-kit) | CC0 | Vehicle selection, kart racers, debris, transport props | Pair with Racing Kit when a demo needs vehicle variety. |
| [City Kit (Roads)](https://kenney.nl/assets/city-kit-roads) | CC0 | Road networks, city-driving layouts, navigation tests | Useful for larger driveable scenes and pathing examples. |
| [City Kit (Suburban)](https://kenney.nl/assets/city-kit-suburban) | CC0 | Neighborhood props, buildings, road-side dressing | Good companion pack for racing or driving scenes. |
| [Factory Kit](https://kenney.nl/assets/factory-kit) | CC0 | Conveyors, industrial props, animation fixtures | Useful for transform animation, moving parts, and gameplay props. |
| [Platformer Kit](https://kenney.nl/assets/platformer-kit) | CC0 | Platformer demos, animated characters, level pieces | Good for character movement and collision examples. |
| [Modular Dungeon Kit](https://kenney.nl/assets/modular-dungeon-kit) | CC0 | Modular interior scenes, doors, props, dungeon layouts | Useful for scene hierarchy, occlusion, and modular placement tests. |
| [Modular Space Kit](https://kenney.nl/assets/modular-space-kit) | CC0 | Sci-fi corridors, station interiors, modular tile scenes | Useful for material, lighting, and indoor navigation examples. |
| [Fantasy Town Kit](https://kenney.nl/assets/fantasy-town-kit) | CC0 on Kenney asset pages; verify page at download | Town buildings, fantasy props, outdoors | Good low-poly town dressing when examples need a village/town theme. |
| [Graveyard Kit](https://kenney.nl/assets/graveyard-kit) | CC0 on Kenney asset pages; verify page at download | Graveyard props, outdoor scene dressing | Useful for moody outdoor fixtures without custom art direction. |
| [Pirate Kit](https://kenney.nl/assets/pirate-kit) | CC0 on Kenney asset pages; verify page at download | Pirate props, islands, boats, themed scenes | Good stylized props and simple environment examples. |
| [Blaster Kit](https://kenney.nl/assets/blaster-kit) | CC0 on Kenney asset pages; verify page at download | Weapons, sci-fi props, shooter tests | Useful for item/prefab tests. |
| [Cube Pets](https://kenney.nl/assets/cube-pets) | CC0 on Kenney asset pages; verify page at download | Simple characters and collectible props | Useful for small animated or character-like examples. |
| [Starter Kit Racing](https://github.com/KenneyNL/Starter-Kit-Racing) | Code MIT, included assets CC0 | Curated racing starter project | Useful as a reference for Racing Kit usage, not as a full catalog replacement. |
| [Starter Kit City Builder](https://github.com/KenneyNL/Starter-Kit-City-Builder) | Code MIT, included assets CC0 | Curated city-builder starter project | Useful for city-scene composition examples. |

## Game-Ready 3D Libraries

| Source | License posture | Best fit | Notes |
| --- | --- | --- | --- |
| [itch.io CC0 3D assets](https://itch.io/game-assets/assets-cc0/tag-3d) | Filtered CC0 listings; verify per page | Independent packs, themed prototypes, one-off kits | Marketplace metadata is helpful but not enough; confirm creator license text on the pack page. |
| [itch.io free low-poly assets](https://itch.io/game-assets/free/tag-low-poly) | Mixed; verify per asset | Low-poly discovery | Use only when license is explicit and compatible. |
| [OpenGameArt](https://opengameart.org/) | Mixed open licenses, including CC0 and CC BY | Community game assets, niche props, legacy formats | Filter and record the exact license per asset. Avoid unclear uploads. |
| [OpenGameArt CC0 low-poly collection](https://opengameart.org/content/cc0-assets-3d-low-poly) | CC0-focused collection; verify linked assets | Terrain, vehicles, buildings, crates, modular pieces | Useful but uneven; check formats and source pages. |
| [Poly Pizza](https://poly.pizza/) | Free models with per-asset Creative Commons terms | Individual low-poly props and quick scene fillers | Preserve license metadata and attribution requirements for each model. |
| [Sketchfab free models](https://sketchfab.com/features/free-3d-models) | Mixed Creative Commons / royalty-free | Huge model discovery corpus | Prefer CC0 or compatible CC BY. Avoid NC, ND, and SA for redistributable fixtures unless explicitly acceptable. |
| [Sketchfab CC0 collection](https://sketchfab.com/nebulousflynn/collections/cc0-9e9b8c5442ab4b59ba16b6fa5e43b8da) | CC0 collection; verify model page | Public-domain objects and scans | Often scan-heavy; optimize before runtime use. |
| [Blend Swap CC0](https://blendswap.com/blends/blicense/CC-0) | CC0 filter; verify per asset | Blender models, rigs, scenes | Treat `.blend` as source; export/convert to GLB for runtime use. |
| [The Base Mesh](https://www.thebasemesh.com/) | CC0 | Prototyping meshes, greybox placeholders | Useful for authoring/prototyping, less for polished examples. |
| [CGTrader Free](https://www.cgtrader.com/free-3d-models) | Mixed/free marketplace; verify per asset | Broad props, characters, architecture, vehicles | Not preferred for checked-in examples due license variability. |
| [Free3D](https://free3d.com/) | Mixed/free marketplace; verify per asset | Broad free model discovery | Use cautiously; check provenance and convert to GLB. |
| [BlenderKit Free](https://www.blenderkit.com/?query=category_subtree%3Amodel+is_free%3Atrue) | Free/RF/custom licenses; verify per asset | Blender-native models, materials, HDRIs | Useful through Blender workflows; document exact license before committing assets. |

## Textures, Materials, HDRIs

| Source | License posture | Best fit | Notes |
| --- | --- | --- | --- |
| [Poly Haven Textures](https://polyhaven.com/textures) | CC0 | PBR materials with diffuse/albedo, roughness, normal, displacement, AO, metalness where applicable | Strong default for visual parity and material tests. |
| [Poly Haven HDRIs](https://polyhaven.com/hdris) | CC0 | IBL, environment maps, lighting fixtures | Use low-resolution or preprocessed environment maps in CI. |
| [ambientCG](https://ambientcg.com/) | CC0 | PBR materials, atlases, decals, photos, HDRIs, terrain, models | API-backed metadata is useful for reproducible downloads. |
| [TextureCan](https://www.texturecan.com/) | CC0 for listed content | PBR textures, graphics, photos, selected models | Watch branded/logotype content; user is responsible for trademark issues. |
| [3DTextures.me](https://3dtextures.me/) | CC0/public-domain style terms | Seamless PBR material fixtures | Free variants are often 1K, which is useful for compact tests. |
| [ShareTextures](https://www.sharetextures.com/) | Custom CC0-based license with redistribution restrictions | PBR textures, atlases, 3D models | Avoid vendoring raw assets into an open repo unless terms are cleared. Good optional/manual source. |
| [CC0 Textures](https://cc0-textures.com/) | CC0 stated | CC0 PBR texture discovery | Verify each selected asset and avoid duplicates from upstream libraries. |
| [MaterialX official examples](https://materialx.org/) | Apache-2.0 project | Material graph and shader import tests | Good for `.mtlx` parser/translation tests, not a bitmap texture library. Preserve notices. |
| [AMD GPUOpen MaterialX Library](https://matlib.gpuopen.com/) | Creative Commons variant must be verified per asset | MaterialX PBR material library | Treat as optional until exact asset license and attribution terms are captured. |
| [Physically Based database](https://physicallybased.info/) | CC0 database; related render assets may differ | Scalar PBR reference values | Useful for material defaults, color/roughness sanity checks, and physically plausible examples. |

## GitHub-Hosted Sources

GitHub repositories can be convenient for repeatable sourcing, but treat each
repository as a pointer to source material unless the repo itself carries the
asset license clearly.

| Source | License posture | Best fit | Notes |
| --- | --- | --- | --- |
| [ToxSam/open-source-3D-assets](https://github.com/toxsam/open-source-3D-assets) | Registry includes CC0 and CC BY metadata | GLB asset discovery, API-friendly asset browser fixtures | Use registry metadata to find assets, then verify the referenced asset license and source URL. |
| [ToxSam/os3a-gallery](https://github.com/ToxSam/os3a-gallery) | Gallery for freely available CC0 GLB assets | Browsable GLB discovery UI | Useful as a UI/index companion to OS3A. |
| [KayKit-Game-Assets](https://github.com/KayKit-Game-Assets) | Individual repos commonly CC0; confirm `LICENSE.txt` | Character packs, dungeon packs, themed low-poly kits | Good when repo-pinned source files are easier than marketplace downloads. |
| [TinyTreats-Game-Assets](https://github.com/TinyTreats-Game-Assets) | Individual repos commonly CC0; confirm `LICENSE.txt` | Small stylized low-poly interior/exterior packs | Useful for compact fixtures and cozy props. |
| [M3-org/base-meshes](https://github.com/M3-org/base-meshes) | CC0-1.0 | Base Mesh-derived binary glTF models | Greybox/base meshes rather than finished art; useful placeholders. |
| [pmndrs/assets](https://github.com/pmndrs/assets) | CC0-1.0 | Optimized web assets importable via npm | Web-friendly but transformed/packed as JS modules, not normal foldered GLBs. |
| [pmndrs/market](https://github.com/pmndrs/market) | App code MIT; marketed assets CC0 | Web-ready models/textures/HDRIs | Verify license split between market code and assets before reuse. |
| [pmndrs/market-assets](https://github.com/pmndrs/market-assets) | Marketed assets intended as CC0; verify per asset | Asset backing repo for pmndrs market | Useful for Three.js-adjacent assets with explicit per-asset records. |
| [PolygonalMind/initiative-opensource-release](https://github.com/PolygonalMind/initiative-opensource-release) | CC0-oriented releases | Stylized metaverse/game environments, avatars, props | Verify individual pack format and convert to GLB as needed. |
| [Quaternius/quaternius.github.io](https://github.com/Quaternius/quaternius.github.io) | Website/index for CC0 Quaternius assets | Quaternius source/reference | Use the official Quaternius asset pages for canonical downloads. |
| [madjin/awesome-cc0](https://github.com/madjin/awesome-cc0) | CC0-oriented index | Discovery of public-domain 3D model repositories | Use only as a discovery index; verify final source license and format. |
| [Miziziziz/Retro3DGraphicsCollection](https://github.com/Miziziziz/Retro3DGraphicsCollection) | Curated commercially usable/no-attribution/no-share-alike links | PSX/retro low-poly art sources | Link collection, not a uniform asset pack. Record final asset page and license. |
| [madjin/vrm-samples](https://github.com/madjin/vrm-samples) | Mixed; some CC0, some special conditions | VRM/glTF-adjacent avatar samples | Separate CC0 models from models with special usage conditions. |
| [webaverse/loot-assets](https://github.com/webaverse/loot-assets) | License not clearly surfaced | Loot-themed wearable GLBs | Treat as needs-license-confirmation before reuse. |
| [Smithsonian/OpenAccess](https://github.com/Smithsonian/OpenAccess) | CC0-1.0 metadata repo | Smithsonian open access metadata | Metadata/index, not a direct model pack. Use Smithsonian APIs/3D pages for files. |
| [Smithsonian/dpo-voyager](https://github.com/Smithsonian/dpo-voyager) | Apache-2.0 software | Smithsonian 3D viewer/authoring workflow reference | Tooling/reference, not an asset repository. |

## glTF And Loader Test Sources

Use these for conformance, loader, renderer, material, animation, and
asset-pipeline tests. They are not always suitable as general art libraries.

| Source | License posture | Best fit | Notes |
| --- | --- | --- | --- |
| [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) | Per-asset license, commonly CC0 or CC BY | Primary glTF loader coverage | Covers materials, extensions, animation, morph targets, skinning, cameras, lights, buffers, embedded/external variants. Preserve per-model attribution. |
| [Khronos glTF Sample Assets index](https://github.khronos.org/glTF-Assets/) | Mirrors sample asset metadata | Browsing sample assets by feature | Useful for choosing exact fixtures. |
| [Khronos glTF Sample Models](https://github.com/KhronosGroup/glTF-Sample-Models) | Mixed per-model licenses | Legacy sample model source | Archived; prefer `glTF-Sample-Assets` for new work. |
| [Khronos glTF Asset Generator](https://github.com/KhronosGroup/glTF-Asset-Generator) | MIT | Synthetic positive/negative conformance cases | Great for deterministic validation; not art-realistic. |
| [Khronos glTF Tutorials](https://github.com/KhronosGroup/glTF-Tutorials) | CC-BY-4.0 | Minimal repro fixtures and parser examples | Attribution required. |
| [Google model-viewer shared assets](https://github.com/google/model-viewer/tree/master/packages/shared-assets) | Mixed per-asset licenses | PBR/material comparison, web/AR render parity, animation examples | Filter out NC/SA assets for redistributable tests. Check `ATTRIBUTIONS.md`. |
| [CesiumJS SampleData](https://github.com/CesiumGS/cesium) | Repo Apache-2.0; verify third-party sample data | Large-world transforms, CZML/glTF integrations, sample models | Avoid Cesium ion datasets unless terms are compatible. |
| [Cesium 3D Tiles Samples](https://github.com/CesiumGS/3d-tiles-samples) | Verify per sample | 3D Tiles containers with glTF payloads | Useful for asset-pipeline stress, not pure glTF loader tests. |
| [Babylon.js Assets](https://github.com/BabylonJS/Assets) | CC-BY-4.0 unless folder says otherwise | Cross-engine regression fixtures | Attribution required; verify folder-level terms. |

## Museum, Space, And Scan Sources

These are useful for real-world scan stress tests, but they are often large and
must be filtered per object.

| Source | License posture | Best fit | Notes |
| --- | --- | --- | --- |
| [Smithsonian 3D](https://3d.si.edu/) | Open access / often CC0; verify per object | Cultural/science scans, artifacts, vehicles, specimens | High-poly; decimate and downsample for runtime fixtures. |
| [Smithsonian Open Access](https://www.si.edu/openaccess) | Open-access media is generally CC0 where marked | Public-domain cultural/science media | Preserve object metadata and usage conditions. |
| [Smithsonian Sketchfab](https://sketchfab.com/Smithsonian) | Smithsonian profile uses CC0 for many models; verify page | Downloadable museum scans | Record Sketchfab model metadata and source object URL. |
| [The Met Open Access](https://www.metmuseum.org/hubs/open-access) | Open Access / CC0 for public-domain works; verify per object | High-quality cultural scans and public-domain objects | Newer 3D coverage; verify download path and object license. |
| [Cleveland Museum of Art Open Access](https://www.clevelandart.org/open-access) | CC0 for open-access public-domain artworks | Photogrammetry and cultural artifact scans | Files may be hosted through Sketchfab; keep object metadata. |
| [NASA 3D Resources](https://science.nasa.gov/3d-resources/) | Free to download/use, subject to NASA media guidelines | Spacecraft, terrain, mission objects, science models | Often OBJ/STL/source formats; convert to GLB and avoid implying endorsement. |
| [NASA-3D-Resources GitHub](https://github.com/nasa/NASA-3D-Resources) | Free/no copyright with NASA media guideline caveats | Repo-backed NASA models and textures | Good conversion stress source; glTF is not guaranteed. |
| [Scan the World](https://www.myminifactory.com/scantheworld) | Varies; many Creative Commons variants | Sculpture/object scan discovery | Strong license caveat; avoid NC/SA/unclear assets for bundled tests. |
| [Scan the World on Sketchfab](https://sketchfab.com/scantheworld) | Varies per model | Downloadable scan discovery | Verify model page license and attribution. |

## Asset Record Template

When adding a third-party asset, record:

```txt
Source:
Creator:
Asset or pack:
Original URL:
License:
Downloaded on:
Original format:
Committed/runtime format:
Conversion command or tool:
Scale notes:
Texture notes:
Attribution required:
Redistribution allowed:
```

## ThreeNative Fit Checks

- Bundle-local dependencies: external `.bin` and texture files must be copied
  or embedded through the asset pipeline.
- Bounds: prefer assets with valid glTF accessor `min`/`max` data so
  `tn asset inspect` can report scale reliably.
- Materials: use authored PBR maps and color-space metadata; avoid screenshot
  matching by changing adapter defaults.
- Size: keep fixtures small enough for normal verification gates. Use large
  photogrammetry assets only in opt-in performance or visual-fidelity tests.
- Portability: choose assets that render in both web Three.js and native Bevy
  without runtime-specific extensions unless the test is explicitly about an
  unsupported-extension diagnostic.
- Attribution: when attribution is required, keep it in source metadata,
  generated artifact notes, and any redistributable example docs.
- Redistribution: do not vendor assets whose terms prohibit redistribution in
  open repositories, plugins, or asset collections.

