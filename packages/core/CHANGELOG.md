# Changelog

## 0.1.8 (2025-12-03)

### ✨ Features

- **errors:** standardize error response format across codebase ([d77372a](https://github.com/SylphxAI/gust/commit/d77372a37ff5bb8aa2e30cf1c5bf406a0b8e339d))

### 📦 Build

- add per-package tsconfig.json for isolated typecheck ([eebc220](https://github.com/SylphxAI/gust/commit/eebc22034ad93eb6e26ec95f71f3a2435cc5304d))

## 0.1.7 (2025-11-29)

### 🐛 Bug Fixes

- **core:** add WASM files to git for CI builds ([ced601d](https://github.com/SylphxAI/gust/commit/ced601daa63c0badff0c6c7bdfb9bc9a3ad504f7))

### ⚡️ Performance

- **wasm:** optimize HTTP parser with SIMD and single-pass parsing ([4c5777c](https://github.com/SylphxAI/gust/commit/4c5777c95bbba4009454d77748a42d65e974f9f7))

### ♻️ Refactoring

- consolidate WASM code into crates/gust-wasm ([3c3fbb9](https://github.com/SylphxAI/gust/commit/3c3fbb92bb54a8d7054d010e78d23679fd070428))

## 0.1.7 (2025-11-29)

### ⚡️ Performance

- **wasm:** optimize HTTP parser with SIMD and single-pass parsing ([4c5777c](https://github.com/SylphxAI/gust/commit/4c5777c95bbba4009454d77748a42d65e974f9f7))

### ♻️ Refactoring

- consolidate WASM code into crates/gust-wasm ([3c3fbb9](https://github.com/SylphxAI/gust/commit/3c3fbb92bb54a8d7054d010e78d23679fd070428))

## 0.1.6 (2025-11-28)

### ✨ Features

- **streaming:** add AsyncIterable-based streaming support ([b52a96f](https://github.com/SylphxAI/gust/commit/b52a96fecdd4a905a7b0c11d62f964d2046c117a))

## 0.1.5 (2025-11-28)

### ✨ Features

- **streaming:** add AsyncIterable-based streaming support ([b52a96f](https://github.com/SylphxAI/gust/commit/b52a96fecdd4a905a7b0c11d62f964d2046c117a))

## 0.1.4 (2025-11-28)

### ✨ Features

- **streaming:** add AsyncIterable-based streaming support ([b52a96f](https://github.com/SylphxAI/gust/commit/b52a96fecdd4a905a7b0c11d62f964d2046c117a))

## 0.1.3 (2025-11-28)

### ✨ Features

- **streaming:** add AsyncIterable-based streaming support ([b52a96f](https://github.com/SylphxAI/gust/commit/b52a96fecdd4a905a7b0c11d62f964d2046c117a))

## 0.1.2 (2025-11-27)

### 🐛 Bug Fixes

- **build:** compile TypeScript to JavaScript before publishing ([2ef1667](https://github.com/SylphxAI/gust/commit/2ef16670ce02e87daeb2400721920b0f99c0b459))

## 0.1.1 (2025-11-27)

### ✨ Features

- **router:** type-safe routing with path param inference ([a03f0ca](https://github.com/SylphxAI/gust/commit/a03f0ca353ae896fb8ddae7ee6c58fce280fba0b))
- initial implementation with WASM HTTP parser and router ([60dfac6](https://github.com/SylphxAI/gust/commit/60dfac6883ad4b3632fb42b400f541705f436765))

### 🐛 Bug Fixes

- **core:** include WASM files in npm package ([a08969c](https://github.com/SylphxAI/gust/commit/a08969c2cffcc45e779e529bad03e09d15d7d686))

### 📚 Documentation

- update READMEs with correct API examples ([d85f2e0](https://github.com/SylphxAI/gust/commit/d85f2e06c0d7ecd1a141ce06cf76b0e839cca104))
