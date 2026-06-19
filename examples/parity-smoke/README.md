# parity-smoke

Single-scene web↔Bevy visual smoke fixture for git hooks and fast parity checks.

Covers in one capture:

- perspective camera and standard materials
- ambient + directional lighting (common game setup)
- v1-style cube/floor/marker primitives
- emissive color probes
- dark rough surface fill (underexposure guard)

Used by `pnpm verify:parity:smoke` (pre-commit hook).
