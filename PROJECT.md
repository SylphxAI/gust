# Gust Project

Gust is a high-performance HTTP framework for Bun and Node.js. It owns the
portable app framework, Rust/WASM routing core, native server bindings,
middleware, examples, benchmarks, documentation, and npm package release path.

## Lifecycle

- Lifecycle: `production`
- Layer: `foundation`
- Doctrine source of truth: [SylphxAI/doctrine](https://github.com/SylphxAI/doctrine)
- Machine manifest: `.doctrine/project.json`

## Goals

- Provide a fast, type-safe HTTP framework with portable app primitives and
  native server acceleration.
- Keep `@sylphx/gust`, `@sylphx/gust-app`, `@sylphx/gust-server`,
  `@sylphx/gust-core`, WASM, and NAPI platform packages aligned.
- Publish package changes through the central release workflow with registry
  proof and native-binding evidence when relevant.

## Non-Goals

- Do not own downstream application domain behavior, deployment policy, or
  product-specific middleware semantics.
- Do not make benchmark claims without reproducible benchmark context.
- Do not treat source revert as complete recovery after npm/native package
  publication.

## Boundaries

Gust owns the framework core, app/server packages, Rust/WASM/NAPI internals,
middleware utilities, examples, docs, benchmarks, and release workflow. Product
apps consume Gust only through documented package exports.

## Public Surfaces

- Package exports: `packages/*/package.json` and `crates/gust-napi/package.json`
- Public docs: `README.md`, `packages/*/README.md`, and `website/content/docs/`
- ADR-29 workflow contexts: `risk-classification/pass`, `trunk-admission/pass`
- Native build/release workflow: `.github/workflows/napi.yml`

## Delivery

PRs use ADR-29 admission plus self-hosted CI. Main pushes use the central
release workflow, with NAPI publish delegated to the native workflow when
requested. Package publication is forward-fix-only and requires npm readback.

