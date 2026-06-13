# threejs-to-benvy

Initial design documentation for a Three.js-like TypeScript game SDK that emits
portable ECS/UI/scene IR and runs through native Bevy plus web Three.js runtime
adapters.

The working product direction:

```txt
TypeScript authoring
  -> Three.js-like scene API, ECS systems, React-style UI
  -> validated IR bundle
  -> Bevy native runtime for desktop/mobile
  -> Three.js web runtime for preview/distribution
```

Key decisions:

- Users write TypeScript, not Bevy Rust.
- Bevy is an internal native runtime adapter.
- TypeScript systems are hosted and return ECS patches/commands; they do not
  compile to Rust in V1.
- React-style game UI compiles to `ui.ir.json`; native runtimes recreate it with
  Bevy UI or another native UI renderer.
- The project supports a useful Three.js/R3F-like subset, not arbitrary Three.js
  applications.
- The IR is the stable platform contract.

Start with [docs/README.md](docs/README.md).
