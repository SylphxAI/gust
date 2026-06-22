# Agent Instructions

Engineering doctrine: https://github.com/SylphxAI/doctrine

Before changing behavior, read:

1. `PROJECT.md` for this repository's goal, lifecycle, boundary, public
   surfaces, delivery proof, and package release posture.
2. `.doctrine/project.json` for the machine-readable project manifest.
3. `README.md`, package READMEs, and relevant workflow files for local facts.
4. The central doctrine entry points and triggered standards.

This file is a thin runtime adapter. Keep enterprise policy in doctrine; keep
repo-local commands, hazards, and validation notes here.

## Local Commands

- `bun install` - install dependencies.
- `bun run lint` - Biome check.
- `bun run build` - build packages.
- `bun run typecheck` - TypeScript type check.
- `bun run test` - run package tests.
- `bun run build:napi` - build native bindings when touching NAPI/Rust code.

## Local Hazards

- Gust is a public HTTP framework package family. Routing, middleware, auth,
  validation, streaming, WebSocket, SSE, native bindings, and benchmark claims
  are public contracts.
- Rust/WASM/NAPI outputs and platform packages are release artifacts. Published
  npm versions are forward-fix-only.
- Keep portable app, server/native, and core WASM boundaries separate; do not
  put product-specific app behavior into the framework core.

## Reporting

Separate local diff, PR state, CI/admission state, merge state, npm release
state, native-binding publish state, and package registry proof.

