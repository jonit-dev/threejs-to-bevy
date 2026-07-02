# Open Source 3D Asset Kits

Use this reference when choosing third-party 3D assets, textures, HDRIs,
materials, examples, fixtures, demos, and starter-project content.

## Automation Catalog

For automated asset selection, query the local or hosted asset catalog before browsing
this human guide or researching externally:

```bash
tn asset source search --game-category <category> --format glb --direct-only --json
tn asset source search --file-role material-index --json
tn asset source get <asset-source-id> --json
```

The local catalog artifact path is `packages/cli/data/asset-sources.sqlite`.
It is generated from reviewed metadata in `docs/data/asset-sources.seed.jsonl`
and snapshot inputs with `scripts/build-asset-source-catalog.mjs`. Large
generated artifacts are not tracked in Git; see
`docs/data/asset-catalog-artifacts.md`. The catalog is the direct-link
automation index for agents and tooling. This Markdown document remains the
policy/reference guide for source selection, license cautions, category routing,
and fallback research.

Use the catalog before creating generated games, adding example assets, making
visual fixtures, using primitives as fallback, or starting broad web search. Do
not query it when editing an existing local project asset, when the user
explicitly provides an asset, or when the task is runtime mapping rather than
asset selection.

When selecting a catalog record, report the catalog ID, origin name, origin URL,
source URL, provenance URL, license evidence, review status, direct URL when
present, downloaded date, and conversion notes. Direct GLB/glTF records are
preferred. Pack-page, material-index, texture-index, HDRI-index, and other typed
source records are fallback/research pointers unless they include a direct
download URL.

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

## Generated Game Priority

When building generated games, examples, or starter content, try sources in
this order:

1. Use a coherent pack from this curated list when a suitable one exists.
2. If this list has no fit, research GitHub/open-source repositories for a
   compatible pack with a consistent style and clear redistribution terms.
3. If no pack is usable, create a consistent set of custom meshes.
4. Use primitives only as the final fallback or prototype state, not as the
   default finished look.

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

## Genre Coverage Target

This document aims to cover at least 90% of common 3D game genre families with
one or more viable open-source or free-redistributable 3D asset sources.
"Covered" means the table below names a usable first-choice source or a clear
fallback path. It does not mean every subgenre has a complete production art
pack.

| Coverage set | Count | Status |
| --- | ---: | --- |
| Covered by direct coherent packs | 36 | Racing, platformer, city builder, nature/terrain, cozy/interiors, RPG/adventure, dungeon crawler, shooter, survival/horror, stealth spaces, fighting/beat-em-up animation, RTS, tower defense, tactics, tycoon/management, factory automation, restaurant/cooking management, farming/life sim, base building, puzzle, tabletop/board/card, sports/minigames, golf, bowling, arcade/space shooter, party/co-op, space exploration/combat, trains, naval/boats, underwater, walking simulator/exploration, open-world traversal, WebXR/VR fixtures, PBR/material tests, animation/skinning, loader/conformance. |
| Covered by fallback-only sources | 4 | Flight/aircraft, rhythm/music, realistic sports venues, museum/scan-heavy real-world genres. |
| Known weak spots | 3 | Full flight-sim aircraft packs, licensed professional sports stadium/player sets, instrument/rhythm packs. Use per-asset review rather than treating marketplace search results as curated sources. |

## Use-Case Shortlist

Use this routing table before browsing broadly. Prefer the first-choice sources
when a source fits the game genre or verification job.

| Use case / genre | First-choice sources | Best fit | Notes |
| --- | --- | --- | --- |
| Racing / driving | Kenney Racing Kit, Kenney Starter Kit Racing, Kenney Car Kit, Kenney City Kit Roads | Tracks, vehicles, road networks, race props | Best default for starter templates and vehicle examples. |
| 3D platformer | Kenney Starter Kit 3D Platformer, Kenney Platformer Kit, Quaternius characters | Platforms, grass, clouds, simple character movement fixtures | Good for camera, collision, jump arcs, and animated-player examples. |
| City builder / town | Kenney Starter Kit City Builder, Kenney City Kit Suburban, KayKit City Builder Bits, Kenney Fantasy Town Kit | Roads, buildings, trees, city props, tile placement | Use for placement, hierarchy, instancing, and scene-composition examples. |
| Nature / terrain | KayKit Medieval Hexagon Pack, Quaternius nature packs, Poly Haven models, PolygonalMind releases | Hex terrain, rocks, rivers, trees, mountains, stylized outdoor sets | Prefer GLB/glTF packs; convert larger source packs through a documented step. |
| Cozy / interiors | Tiny Treats, KayKit interiors, Poly Pizza CC0/CC BY props | Compact props and rooms | Good when examples need readable art without high asset weight. |
| RPG / third-person adventure | KayKit Adventurers, Quaternius Modular Character Outfits - Fantasy, Quaternius Ultimate Fantasy RPG, KayKit RPG Tools | Rigged characters, weapons, tools, fantasy props, traversal characters | Record free/source tier used; pair character packs with modular environment kits. |
| Dungeon crawler / roguelite | KayKit Dungeon Remastered, Kenney Modular Dungeon Kit, Quaternius Modular Dungeon Pack, KayKit Skeletons | Modular rooms, doors, traps, chests, enemies, grid arenas | Good for tactical interiors, spawn tests, doors, collision, and item pickup examples. |
| FPS / TPS shooter | Quaternius Toon Shooter Game Kit, Quaternius Sci-Fi Essentials Kit, Quaternius Animated Guns Pack, Kenney Blaster Kit | Guns, enemies, props, animated shooter characters, sci-fi set dressing | Older gun packs may need FBX/OBJ to GLB conversion. Keep gameplay systems portable. |
| Stealth / sci-fi interiors | Quaternius Modular Sci-Fi Megakit, Kenney Modular Space Kit, Kenney Space Station Kit | Corridors, rooms, doors, screens, crates, lighting-readable stealth layouts | These are level kits, not stealth AI packages. Author stealth behavior in scripts. |
| Survival / horror | Kenney Survival Kit, Quaternius Zombie Apocalypse Kit, Kenney Graveyard Kit, KayKit Halloween Bits, Quaternius Survival Pack | Zombies, spooky props, camping/survival props, ruined or outdoor scene dressing | Stylized by default; use scan-heavy horror assets only after per-object license review. |
| Fighting / beat-em-up | Quaternius Universal Animation Library 2, Quaternius Universal Base Characters, KayKit Character Animations | Melee combos, recoveries, hit reactions, retargetable humanoid animation | Animation packs are not full scene packs; pair with characters and arena props. |
| RTS / empire builder | KayKit Medieval Hexagon Pack, KayKit Medieval Builder Pack, Quaternius Medieval Village MegaKit, Kenney Hexagon Kit | Hex terrain, walls, roads, villages, buildings, resource placement | Downselect large packs for fixtures; preserve atlas and tier provenance. |
| Tower defense | Kenney Tower Defense Kit, KayKit Medieval Hexagon Pack, Quaternius Ultimate Fantasy RTS | Towers, modular defenses, path tiles, enemies, castle props | Kenney Tower Defense Kit is the first-choice compact CC0 source. |
| Tactics / turn-based strategy | Kenney Hexagon Kit, KayKit Dungeon Remastered, KayKit Medieval Hexagon Pack, KayKit Adventurers, KayKit Skeletons | Grid/hex maps, dungeon arenas, units, enemies, props | Use fixed-size tiles and explicit authored transforms for deterministic tests. |
| Factory / automation | Kenney Factory Kit, KayKit Resource Bits, Kenney City Kit Industrial | Conveyors, crates, machines, resources, warehouse props | Useful for transform animation, item-flow, placement, and simple management examples. |
| Tycoon / management | KayKit City Builder Bits, Kenney Factory Kit, KayKit Restaurant Bits, Kenney City Kits | Buildings, interiors, production props, restaurants, roads | Use small representative slices instead of entire catalogs in examples. |
| Farming / life sim | Quaternius LowPoly Farm Buildings, Quaternius Farm Animal Pack, KayKit Resource Bits, Tiny Treats cozy packs | Farm buildings, animated animals, crops/resources, cozy interiors | Some older farm packs need format conversion; keep authored scale notes. |
| Base building / colony | KayKit Space Base Bits, Quaternius Medieval Village MegaKit, Kenney Space Kit, Kenney Space Station Kit | Modular base pieces, colony props, space structures, resource nodes | Strong for construction and placement workflows; verify free/source tier contents. |
| Restaurant / cooking co-op | KayKit Restaurant Bits, Quaternius Sushi Restaurant Kit, Tiny Treats kitchen/interior packs | Food, dishes, counters, restaurant rooms, animated staff/characters | Good for party/co-op, management, and interactable-prop examples. |
| Puzzle / logic | Kenney Sokoban, KayKit Prototype Bits, Chilly Durango 3D Retro Plumbing Wiring & Machinery, Comigo Fantasy Puzzle Voxel Set | Boxes, switches, gates, pipes, wires, voxel puzzle rooms | Some puzzle packs are OBJ or `.blend` source; commit converted GLB with notes. |
| Tabletop / board / card | KayKit Board Game Bits, Quaternius 3D Card Kit - Fantasy, Kenney board/puzzle packs | Dice, meeples, tokens, cards, chess/checkers pieces, board props | Strong source for deterministic UI/picking and drag/drop interaction fixtures. |
| Sports / minigames | KayKit Mini-Game Variety Pack, Kenney Minigolf Kit, CC0 bowling ball/pin packs | Goals, gates, rings, balls, pickups, golf tiles, bowling physics props | Realistic sports venues and licensed team/player art are weak; avoid unclear marketplace models. |
| Arcade / space shooter | Quaternius Ultimate Spaceships Pack, Quaternius Ultimate Space Kit, Majadroid CC0 low-poly spaceship packs, Kenney Space Kit | Ships, missiles, space props, modular sci-fi gameplay pieces | Verify exact license on non-primary mirrors; prefer Quaternius/Kenney when possible. |
| Party / mini-game collection | KayKit Mini-Game Variety Pack, KayKit Board Game Bits, Quaternius Sushi Restaurant Kit | Simple arenas, pickups, goals, tabletop pieces, co-op restaurant props | Good for starter examples that need many compact interactables. |
| Trains / rail | Kenney Train Kit, Quaternius Modular Train Pack | Trains, trams, tracks, rail props, spline/path fixtures | Convert Quaternius source formats when glTF is not included. |
| Naval / boats | Kenney Watercraft Kit, Kenney Pirate Kit, Quaternius Ships Pack | Boats, ships, sails, pirate/island props, water traversal examples | Stylized rather than simulator-realistic; record water material assumptions separately. |
| Flight / aircraft | NASA 3D Resources, NASA aircraft model pages, Babylon.js Assets, Sketchfab/OpenGameArt only after per-asset license review | Aircraft scans/models and aerospace fixtures | No first-choice coherent CC0 flight-sim pack is curated here. Treat flight as fallback-only until a clear-license pack is found. |
| Underwater | Quaternius Animated Fish Pack, 3TD Tropical Environment Pack, Babylon.js Assets underwater demos, Poly Haven/ambientCG water and seabed materials | Animated fish, reef/tropical props, underwater materials | Older packs often need DAE/FBX conversion and material cleanup; Babylon assets require attribution unless a folder says otherwise. |
| Walking simulator / exploration | Quaternius Stylized Nature MegaKit, KayKit Medieval Hexagon Pack, Poly Haven models/HDRIs, Smithsonian/Met scans after review | Outdoor paths, villages, props, scanned objects, mood lighting | Use scan sources only for opt-in examples because assets are large and metadata-heavy. |
| Open-world traversal | Quaternius Stylized Nature MegaKit, KayKit Medieval Hexagon Pack, Kenney Nature Kit, Poly Haven models/materials | Repeated vegetation, rocks, terrain tiles, landmarks | Keep examples small; prove instancing and streaming separately from asset sourcing. |
| VR / WebXR | PolygonalMind OpenSource Initiative, A-Frame sample assets, Babylon.js Assets controller meshes, pmndrs/assets, Poly Pizza CC0 models | Browser-friendly props, controller meshes, metaverse scenes, WebXR fixture assets | A-Frame, Babylon, and marketplace assets are mixed or attribution licenses; verify manifest/model/folder license per asset. |
| Rhythm / music | Smithsonian 3D instrument objects, museum/open-access scans, Poly Pizza CC0 instruments | Instrument props and stage dressing | Fallback-only; preserve object metadata and decimate scans before runtime use. |
| Skyboxes / HDRI / IBL | Poly Haven HDRIs, pmndrs/assets HDRIs, Google Filament environments, Bevy example environments | Environment lighting, skybox orientation, color-space checks | Downsample or prefilter before putting assets in normal CI. |
| PBR materials / textures | ambientCG, Poly Haven Textures, Google Filament textures, Babylon.js Assets shader/material fixtures, VeraVisions nuclide-pbr, Calinou blue-noise textures | Albedo/normal/roughness/metal/AO, shader balls, noise textures, material parity | Record exact source URL and map packing conventions. |
| Animation / skinning | Khronos glTF Sample Assets, Babylon.js Assets, Three.js examples, raylib glTF examples, Bevy example models | Clips, skeletal animation, animation blending, morph targets, loader coverage | Preserve per-model metadata; do not assume repo license covers every media file. |
| glTF conformance / edge cases | Khronos glTF Sample Assets, Khronos Asset Generator, Khronos glTF Test Assets Interactivity, assimp glTF2 tests, Microsoft glTF-SDK resources | Parser, validator, extension, and unsupported-feature tests | Use exact upstream SHAs and per-model license records. |
| Prototype / placeholders | Kenney, The Base Mesh, M3 base-meshes, teccheck prototype textures, GradientSkybox | Greybox meshes, debug textures, generated skyboxes | Prefer deterministic generated assets for test fixtures. |
| Space / science | NASA 3D Resources, Cesium SkyBox, Milky Way Skybox for Unity, matusnovak space-3d | Spacecraft, planets, starfields, science terrain | NASA and ESO assets have usage/attribution rules; record them explicitly. |

## Kenney Shortlist

Use these Kenney packs before reaching for less consistent sources.

| Source | License posture | Best fit | Notes |
| --- | --- | --- | --- |
| [Racing Kit](https://kenney.nl/assets/racing-kit) | CC0 | Racing tracks, vehicle demos, tile-based road layouts | Canonical source for racing fixtures and examples. |
| [Car Kit](https://kenney.nl/assets/car-kit) | CC0 | Vehicle selection, kart racers, debris, transport props | Pair with Racing Kit when a demo needs vehicle variety. |
| [City Kit (Roads)](https://kenney.nl/assets/city-kit-roads) | CC0 | Road networks, city-driving layouts, navigation tests | Useful for larger driveable scenes and pathing examples. |
| [City Kit (Suburban)](https://kenney.nl/assets/city-kit-suburban) | CC0 | Neighborhood props, buildings, road-side dressing | Good companion pack for racing or driving scenes. |
| [Tower Defense Kit](https://kenney.nl/assets/tower-defense-kit) | CC0 | Tower defense, pathing, modular defense layouts | First-choice tower-defense pack; includes 3D tiles, towers, weapons, and enemies. |
| [Survival Kit](https://kenney.nl/assets/survival-kit) | CC0 | Survival, crafting, camping, outdoor props | Good compact prop source for survival loops and interactable pickups. |
| [Factory Kit](https://kenney.nl/assets/factory-kit) | CC0 | Conveyors, industrial props, animation fixtures | Useful for transform animation, moving parts, and gameplay props. |
| [Platformer Kit](https://kenney.nl/assets/platformer-kit) | CC0 | Platformer demos, animated characters, level pieces | Good for character movement and collision examples. |
| [Nature Kit](https://kenney.nl/assets/nature-kit) | CC0 | Trees, rocks, foliage, outdoor traversal scenes | Useful as a consistent low-poly vegetation fallback. |
| [Minigolf Kit](https://kenney.nl/assets/minigolf-kit) | CC0 | Golf and physics minigames | First-choice golf source; inspect scale/collision after import. |
| [Train Kit](https://kenney.nl/assets/train-kit) | CC0 | Rail traversal, train scenes, path/spline fixtures | Includes trains/trams/trolleys and track pieces. |
| [Watercraft Kit](https://kenney.nl/assets/watercraft-kit) | CC0 | Boats, ships, water traversal | Use before marketplace boat models. Pair with water materials separately. |
| [Modular Dungeon Kit](https://kenney.nl/assets/modular-dungeon-kit) | CC0 | Modular interior scenes, doors, props, dungeon layouts | Useful for scene hierarchy, occlusion, and modular placement tests. |
| [Modular Space Kit](https://kenney.nl/assets/modular-space-kit) | CC0 | Sci-fi corridors, station interiors, modular tile scenes | Useful for material, lighting, and indoor navigation examples. |
| [Space Kit](https://kenney.nl/assets/space-kit) | CC0 on Kenney asset pages; verify page at download | Spaceports, ships, galactic structures, space props | Broad low-poly space source with many object types. |
| [Space Station Kit](https://kenney-assets.itch.io/space-station-kit) | CC0 on Kenney itch page; verify page at download | Space stations, ship interiors, sci-fi base scenes | Useful for modular sci-fi/base-building examples. |
| [Fantasy Town Kit](https://kenney.nl/assets/fantasy-town-kit) | CC0 on Kenney asset pages; verify page at download | Town buildings, fantasy props, outdoors | Good low-poly town dressing when examples need a village/town theme. |
| [Graveyard Kit](https://kenney.nl/assets/graveyard-kit) | CC0 on Kenney asset pages; verify page at download | Graveyard props, outdoor scene dressing | Useful for moody outdoor fixtures without custom art direction. |
| [Pirate Kit](https://kenney.nl/assets/pirate-kit) | CC0 on Kenney asset pages; verify page at download | Pirate props, islands, boats, themed scenes | Good stylized props and simple environment examples. |
| [Blaster Kit](https://kenney.nl/assets/blaster-kit) | CC0 on Kenney asset pages; verify page at download | Weapons, sci-fi props, shooter tests | Useful for item/prefab tests. |
| [Cube Pets](https://kenney.nl/assets/cube-pets) | CC0 on Kenney asset pages; verify page at download | Simple characters and collectible props | Useful for small animated or character-like examples. |
| [Starter Kit Racing](https://github.com/KenneyNL/Starter-Kit-Racing) | Code MIT, included assets CC0 | Curated racing starter project | Useful as a reference for Racing Kit usage, not as a full catalog replacement. |
| [Starter Kit City Builder](https://github.com/KenneyNL/Starter-Kit-City-Builder) | Code MIT, included assets CC0 | Curated city-builder starter project | Useful for city-scene composition examples. |
| [Starter Kit 3D Platformer](https://github.com/KenneyNL/Starter-Kit-3D-Platformer) | Code MIT, included assets CC0 | Outdoor platformer starter project | In-repo GLBs include grass, clouds, and platform pieces for compact movement/collision examples. |
| [Starter Kit Basic Scene](https://github.com/KenneyNL/Starter-Kit-Basic-Scene) | Code MIT, included assets CC0 | Tiny arena/environment smoke tests | Useful for minimal lighting, camera, and material checks. |

## Genre-Specific Pack Shortlist

Use these when the broad Kenney/Quaternius/KayKit catalog links are not precise
enough. These entries are still pointers; verify the source page and exact
download tier at asset-add time.

| Source | License posture | Best fit | Notes |
| --- | --- | --- | --- |
| [KayKit Adventurers](https://kaylousberg.itch.io/kaykit-adventurers) | CC0 on source page; verify tier | RPG parties, third-person adventure characters, weapons | Pair with KayKit Dungeon Remastered or Medieval Hexagon for complete scenes. |
| [KayKit Character Pack: Skeletons](https://godotengine.org/asset-library/asset/2566) | Godot listing says CC0; prefer canonical download when available | Dungeon enemies, horror combat, tactics units | Use a canonical KayKit/GitHub/itch URL in final asset records when possible. |
| [KayKit Restaurant Bits](https://kaylousberg.itch.io/restaurant-bits) | CC0 on source page; verify tier | Restaurant management, cooking co-op, food props | Free/source tiers differ; record which one was downloaded. |
| [KayKit Resource Bits](https://kaylousberg.itch.io/resource-bits) | CC0 on source page; verify tier | Farming, crafting, resource-management props | Useful for wood, stone, ore, textiles, fuel, and other compact item assets. |
| [KayKit Board Game Bits](https://kaylousberg.itch.io/board-game-bits) | CC0 on source page; verify tier | Tabletop, board games, card games, dice/token interaction | Strong source for picking and drag/drop fixtures. |
| [KayKit Space Base Bits](https://kaylousberg.itch.io/space-base-bits) | CC0 on source page; verify tier | Colony/base building, space management | Modular base pieces and vehicles; good for placement examples. |
| [KayKit Mini-Game Variety Pack](https://kaylousberg.itch.io/kay-kit-mini-game-variety-pack) | CC0 on source page; legacy pack | Sports, party games, general minigames | Legacy pack; verify whether a remastered pack supersedes it before new examples. |
| [Quaternius Toon Shooter Game Kit](https://quaternius.com/packs/toonshootergamekit.html) | CC0 on source page | FPS/TPS shooter, animated enemies, weapon props | Includes characters, enemies, environment assets, and glTF/Blend/FBX/OBJ formats. |
| [Quaternius Sci-Fi Essentials Kit](https://quaternius.com/packs/scifiessentialskit.html) | CC0 on source page | Sci-fi shooter props, robot enemies, guns | Useful companion for modular sci-fi level kits. |
| [Quaternius Modular Sci-Fi Megakit](https://quaternius.com/packs/modularscifimegakit.html) | CC0 on source page | Stealth interiors, sci-fi corridors, grid-based rooms | Large pack; downselect examples and record subassets used. |
| [Quaternius Zombie Apocalypse Kit](https://quaternius.com/packs/zombieapocalypsekit.html) | CC0 on source page | Survival/horror, zombie game kits, animated enemies | Includes characters, enemies, animals, vehicles, and environment props. |
| [Quaternius Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) | CC0 on source page | Retargetable humanoid locomotion and action animation | Good for animation parity; not a standalone art pack. |
| [Quaternius Universal Animation Library 2](https://quaternius.com/packs/universalanimationlibrary2.html) | CC0 on source page | Combat combos, parkour, farming, zombie locomotion | Pair with Quaternius base characters or KayKit characters. |
| [Quaternius Ultimate Space Kit](https://quaternius.com/packs/ultimatespacekit.html) | CC0 on source page | Space exploration, planets, rovers, bases, ships | Broad source; record exact subassets used. |
| [Quaternius Ultimate Spaceships Pack](https://quaternius.com/packs/ultimatespaceships.html) | CC0 on source page | Space combat craft and ship variants | Stronger for ship-focused examples than full space environments. |
| [Quaternius Animated Fish Pack](https://quaternius.com/packs/animatedfish.html) | CC0 on source page | Underwater animation and aquatic examples | Convert and validate animation import where glTF is not available. |
| [Quaternius Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html) | CC0 on source page; verify tier | Open-world traversal, walking simulators, nature scenes | Use free/source tier notes and downselect for fixtures. |
| [Quaternius Survival Pack](https://quaternius.com/packs/survival.html) | CC0 on source page | Camping, outdoor survival props | Prop pack; pair with nature terrain. |
| [Quaternius 3D Card Kit - Fantasy](https://quaternius.com/packs/3dcardkitfantasy.html) | CC0 on source page; verify tier | Board/card tabletop, fantasy card scenes | Good compact test for many small textured card-like props. |
| [Quaternius Sushi Restaurant Kit](https://quaternius.com/packs/sushirestaurantkit.html) | CC0 on source page; verify tier | Party/cooking co-op, restaurant interiors | Includes animated characters and modular food/restaurant props. |
| [Quaternius LowPoly Farm Buildings](https://quaternius.itch.io/lowpoly-farm-buildings) | CC0 on source page | Farming/life sim buildings | Pair with Quaternius Farm Animal Pack. |
| [Quaternius Farm Animal Pack](https://quaternius.com/packs/farmanimal.html) | CC0 on source page | Farming/life sim animals | Older formats may need conversion. |
| [Chilly Durango 3D Retro Plumbing, Wiring & Machinery](https://chilly-durango.itch.io/3d-retro-plumbing-wiring) | CC0 on source page | Mechanical puzzle props | `.blend` source; export/convert to GLB and preserve texture provenance. |
| [Comigo Fantasy Puzzle Voxel Set](https://comigo.itch.io/puzzle-set) | CC0 on source page | Voxel puzzle rooms and props | OBJ/MagicaVoxel workflow; document conversion and palette texture setup. |
| [3TD Tropical Environment Pack v2.0](https://opengameart.org/content/3td-tropical-environment-pack-v20) | OpenGameArt page states CC0/public domain; verify files | Underwater/tropical exploration props | DAE-oriented legacy pack; optimize before runtime use. |
| [Bowling Ball and Pins](https://deplorablemountaineer.itch.io/bowling-ball-and-pins) | Asset CC0; code MIT on source page | Bowling and simple physics minigames | Not a full alley; pair with simple authored lane/venue props. |

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
| [KayKit Medieval Hexagon Pack](https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0) | CC0; confirm repo license at download | Hex terrain, rivers, coasts, rocks, hills, mountains, trees | Strong coherent nature/terrain source with GLTF included. |
| [KayKit City Builder Bits](https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0) | CC0; confirm repo license at download | City props and layout fixtures | Small atlas-textured pack with OBJ, FBX, and GLTF formats. |
| [M3-org/base-meshes](https://github.com/M3-org/base-meshes) | CC0-1.0 | Base Mesh-derived binary glTF models | Greybox/base meshes rather than finished art; useful placeholders. |
| [pmndrs/assets](https://github.com/pmndrs/assets) | CC0-1.0 | Optimized web assets importable via npm | Web-friendly but transformed/packed as JS modules, not normal foldered GLBs. |
| [pmndrs/market](https://github.com/pmndrs/market) | App code MIT; marketed assets CC0 | Web-ready models/textures/HDRIs | Verify license split between market code and assets before reuse. |
| [pmndrs/market-assets](https://github.com/pmndrs/market-assets) | Marketed assets intended as CC0; verify per asset | Asset backing repo for pmndrs market | Useful for Three.js-adjacent assets with explicit per-asset records. |
| [Google Filament environments and textures](https://github.com/google/filament/tree/main/third_party) | Repo Apache-2.0; `third_party/environments` and many texture test assets are marked CC0 | PBR/IBL renderer parity fixtures | Good source for environment maps, texture-map edge cases, and original-source `URL.txt` provenance. |
| [Bevy example assets](https://github.com/bevyengine/bevy/tree/main/assets) | Bevy code dual MIT/Apache-2.0; verify third-party asset credits | Native Bevy compatibility and loader checks | Useful because the assets are already exercised by Bevy examples; keep per-file provenance. |
| [Babylon.js Assets index](https://github.com/BabylonJS/Assets/blob/master/Assets.md) | Repo README says CC BY 4.0 unless an asset folder says otherwise | Cross-engine GLB/glTF fixtures, WebXR controller meshes, shader balls, underwater demos, animation/morph/material tests | Useful for finding exact Babylon-hosted assets such as `aerobatic_plane`, controller meshes, underwater scenes, shader balls, and test meshes; attribution required unless folder-level terms differ. |
| [PolygonalMind/initiative-opensource-release](https://github.com/PolygonalMind/initiative-opensource-release) | CC0-oriented releases | Stylized metaverse/game environments, avatars, props | Verify individual pack format and convert to GLB as needed. |
| [Quaternius/quaternius.github.io](https://github.com/Quaternius/quaternius.github.io) | Website/index for CC0 Quaternius assets | Quaternius source/reference | Use the official Quaternius asset pages for canonical downloads. |
| [madjin/awesome-cc0](https://github.com/madjin/awesome-cc0) | CC0-oriented index | Discovery of public-domain 3D model repositories | Use only as a discovery index; verify final source license and format. |
| [devanshutak25/3d-resources](https://github.com/devanshutak25/3d-resources) | CC0-1.0 index repo | Broad discovery index for 3D, VFX, and game-dev resources | Links only; use as a search front door and verify final asset terms. |
| [Miziziziz/Retro3DGraphicsCollection](https://github.com/Miziziziz/Retro3DGraphicsCollection) | Curated commercially usable/no-attribution/no-share-alike links | PSX/retro low-poly art sources | Link collection, not a uniform asset pack. Record final asset page and license. |
| [madjin/vrm-samples](https://github.com/madjin/vrm-samples) | Mixed; some CC0, some special conditions | VRM/glTF-adjacent avatar samples | Separate CC0 models from models with special usage conditions. |
| [raylib glTF example models](https://github.com/raysan5/raylib/tree/master/examples/models/resources/models/gltf) | raylib repo zlib/libpng; folder marks selected glTF assets such as `robot.glb` and `greenman*.glb` as CC0 | Compact animation and skinning fixtures | Good for lightweight skeletal animation, blending, and bone socket examples. |
| [Godot demo project 3D assets](https://github.com/godotengine/godot-demo-projects/tree/master/3d) | Repo MIT; check demo-level asset credits | Engine-authored gameplay fixtures | Useful for small character, prop, and scene workflow examples; preserve `.blend` source notes where present. |
| [Defold third-person playground](https://github.com/defold/sample-third-person-playground) | MIT project; third-party art credited separately | Playable third-person sample assets and workflow reference | Record Mesh2Motion/KayKit/Kenney and audio credits before copying any asset. |
| [VeraVisions/nuclide-pbr](https://github.com/VeraVisions/nuclide-pbr) | Repo states content assets are CC0; code follows Nuclide SDK licensing | Compact PBR material/map/model example | Useful for MRA texture packing and game-style PBR material tests. |
| [Calinou/free-blue-noise-textures](https://github.com/Calinou/free-blue-noise-textures) | CC0-1.0 | Noise textures and sampler fixtures | Direct 2D/3D/4D texture files for deterministic texture-loading and shader tests. |
| [teccheck/prototype_textures](https://github.com/teccheck/prototype_textures) | CC0, derived from Kenney prototype textures | Prototype/debug texture fixtures | Includes SVG templates and generation scripts for controlled colors. |
| [niivue/matcaps](https://github.com/niivue/matcaps) | CC0-1.0 | Small matcap texture set | Useful for editor preview/material UI fixtures when a compact, clearly licensed set is enough. |
| [nidorx/matcaps](https://github.com/nidorx/matcaps) | No repo license detected; source provenance is mixed | Large matcap discovery source | Treat as needs-license-confirmation before vendoring; useful for finding candidate matcap looks. |
| [pmndrs/env](https://github.com/pmndrs/env) | MIT app | Environment-map generation workflow reference | Tooling reference for generated HDR/lightformers, not a source of reusable checked-in art by itself. |
| [GradientSkybox](https://github.com/greg-kennedy/GradientSkybox) | CC0-1.0 | Deterministic generated skybox/cubemap placeholders | Good for generated sky gradients and cubemap-orientation tests. |
| [matusnovak/space-3d](https://github.com/matusnovak/space-3d) | Unlicense; archived | Procedural space skybox generation | Generates seeded star/nebulosity cubemaps; use as reference or regenerate through documented tooling. |
| [Milky Way Skybox for Unity](https://github.com/dyrdadev/milky-way-skybox-for-unity) | MIT project; Milky Way panorama is CC BY 4.0 from ESO/S. Brunier | Space skybox fixture | Attribution required; large textures need downsampling before normal fixtures. |
| [Cesium SkyBox textures](https://github.com/CesiumGS/cesium/tree/main/packages/engine/Source/Assets/Textures/SkyBox) | Cesium repo Apache-2.0; verify asset-specific notices | Space/starfield cubemap fixture | Small six-face Tycho skybox useful for cubemap orientation tests. |
| [A-Frame sample assets](https://github.com/aframevr/sample-assets) | Mixed; manifest includes license IDs | Browser/WebXR texture and model fixtures | Use manifest metadata and verify exact asset license before vendoring. |
| [JackLuguibin/GameAssets](https://github.com/JackLuguibin/GameAssets) | MIT index repo | Broad game-asset discovery with licensing reminders | Links only; useful as a checklist, not final provenance. |
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
| [Three.js examples glTF models](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf) | Three.js repo is MIT; example media can have incomplete or mixed per-file license metadata | Three.js-adjacent GLB loader, animation, skinning, and material fixtures | Useful candidates include [`Soldier.glb`](https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/Soldier.glb). Verify per-file provenance/license before vendoring, and record the upstream URL plus commit SHA. |
| [Three.js example textures](https://github.com/mrdoob/three.js/tree/dev/examples/textures) | Three.js repo is MIT; example textures/cubemaps can have mixed third-party terms | Three.js-adjacent texture, cubemap, and loader fixtures | Verify per-texture provenance; some historical cubemaps have separate redistribution/commercial terms. |
| [Khronos glTF Test Assets Interactivity](https://github.com/KhronosGroup/glTF-Test-Assets-Interactivity) | CC BY 4.0 with per-model license summaries | KHR_interactivity sample and test assets | Good for unsupported-extension diagnostics and future interactivity parser tests; attribution required. |
| [PlayCanvas engine example models](https://github.com/playcanvas/engine/tree/main/examples/assets/models) | Engine MIT; many models have adjacent attribution/license files | PBR/material extension and scene-scale GLBs | Useful for anisotropy, clearcoat, sheen, transmission, variants, morph stress, and lighting/collision examples. |
| [assimp glTF2 test models](https://github.com/assimp/assimp/tree/master/test/models/glTF2) | assimp repo BSD-style; model provenance can be mixed | Importer/exporter regression cases | Prefer for test-only parser behavior with exact upstream SHA and per-file license review. |
| [Microsoft glTF-SDK test resources](https://github.com/microsoft/glTF-SDK/tree/master/GLTFSDK.Test/Resources) | MIT repo; verify resource folders before copying binaries | Parser and binary GLB edge cases | Better for structural tests than art direction. |
| [CesiumJS SampleData](https://github.com/CesiumGS/cesium) | Repo Apache-2.0; verify third-party sample data | Large-world transforms, CZML/glTF integrations, sample models | Avoid Cesium ion datasets unless terms are compatible. |
| [Cesium 3D Tiles Samples](https://github.com/CesiumGS/3d-tiles-samples) | Verify per sample | 3D Tiles containers with glTF payloads | Useful for asset-pipeline stress, not pure glTF loader tests. |
| [bertt/cesium_3dtiles_samples](https://github.com/bertt/cesium_3dtiles_samples) | MIT | Forest/tree instancing and geospatial terrain stress | Useful for 3D Tiles/glTF extension tests, not simple standalone GLB fixtures. |
| [Babylon.js Assets](https://github.com/BabylonJS/Assets) and [Assets.md index](https://github.com/BabylonJS/Assets/blob/master/Assets.md) | CC-BY-4.0 unless folder says otherwise | Cross-engine regression fixtures, GLB/glTF smoke tests, WebXR controllers, shader/material fixtures | Attribution required; verify folder-level terms and use the generated index to find exact asset paths. |

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
