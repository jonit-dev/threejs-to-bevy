# Feature Parity Polishing PRD Bundle

This bundle turns the current `Gap side` rows in
`docs/bevy-feature-parity.md` into focused implementation PRDs. It does not
reopen rows that are already marked as product boundaries or completed
diagnostic boundaries unless a PRD explicitly narrows a promotable subset.

## Gap-Side Map

| PRD | Gap side covered | Parity rows |
| --- | ---------------- | ----------- |
| [PRD-001 Shared Contract Residuals](PRD-001-shared-contract-residuals.md) | Shared SDK/IR/compiler contract | Geometry, materials, rendering, window/platform policy |
| [PRD-002 Cross-Adapter Visual Calibration](PRD-002-cross-adapter-visual-calibration.md) | Both adapters | Lights/shadows, material rendering, post-processing, dense-scene visual proof |
| [PRD-003 Native UI Text Accessibility](PRD-003-native-ui-text-accessibility.md) | Bevy/native plus both adapters for world-attached/effect parity | UI, text, accessibility |
| [PRD-004 Physics Navigation Native Depth](PRD-004-physics-navigation-native-depth.md) | Bevy/native proof depth plus shared boundaries | Physics, character movement, navigation |
| [PRD-005 Audio Platform Runtime Polish](PRD-005-audio-platform-runtime-polish.md) | Both adapters plus shared platform policy | Audio, window/platform runtime |

## Execution Order

1. Start with `PRD-001` so schemas, diagnostics, and capability boundaries are
   stable before adapter work.
2. Run `PRD-002` and `PRD-003` independently; both rely on the shared contract
   decisions but touch different runtime surfaces.
3. Run `PRD-004` after any contract changes that affect collider/nav metadata.
4. Run `PRD-005` last unless an audio or platform bug blocks a shipped game.

Each PRD must update `docs/bevy-feature-parity.md`, the relevant
`docs/status/capabilities/*.md` page, and the one-line index in
`docs/STATUS.md` when it changes a capability or release-gate claim.
