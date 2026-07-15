# gust — local agent notes only

Doctrine and fleet delivery law live in the **host always-on constitution**
(`~/.grok/AGENTS.md` / Doctrine template). This file must **not** restate,
weaken, or fork that law (including PR-vs-direct-trunk delivery).

Local truth: `PROJECT.md`, `.doctrine/project.json` when present.

## Boundary hazards

- Gust is a public HTTP framework package family. Routing, middleware, auth,
- Rust/WASM/NAPI outputs and platform packages are release artifacts. Published
- Keep portable app, server/native, and core WASM boundaries separate; do not

## Local commands

- `bun install` - install dependencies.
- `bun run lint` - Biome check.
- `bun run build` - build packages.
- `bun run typecheck` - TypeScript type check.
- `bun run test` - run package tests.
- `bun run build:napi` - build native bindings when touching NAPI/Rust code.
- Prefer the **narrowest** affected check before full workspace runs.
- Report layers honestly: local diff · trunk FF · deploy · prod proof (do not collapse).

## Validation notes

- Prefer the **narrowest** affected check before full workspace runs.
- Report layers honestly: local diff · trunk FF · deploy · prod proof (do not collapse).
