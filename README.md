# ThreeNative

![ThreeNative SDK mascot riding from Three.js to Bevy](three-native-sdk.png)

Initial design documentation for a Three.js-like TypeScript game SDK that emits
portable ECS/UI/scene IR and runs through native Bevy plus web Three.js runtime
adapters.

The project goal is to make it faster for an AI agent or TypeScript developer to
build a small playable 3D game here than with raw Three.js, R3F, Godot, Unity,
or Bevy, using ECS-compatible abstractions that keep native-like performance in
reach.

The working product direction:

```txt
TypeScript authoring
  -> Three.js-like scene API and ECS systems
  -> validated IR bundle
  -> Bevy native runtime for desktop
  -> Three.js web runtime for preview/distribution
```

Key decisions:

- Users write TypeScript, not Bevy Rust.
- Bevy is an internal native runtime adapter.
- TypeScript systems are hosted and return ECS patches/commands; they do not
  compile to Rust in V1.
- React-style game UI and mobile packaging are post-V1 goals; V1 proves the
  world bundle across web and desktop runtimes first.
- The project supports a useful Three.js/R3F-like subset, not arbitrary Three.js
  applications.
- The IR is the stable platform contract.

Start with [docs/README.md](docs/README.md).
