# Changelog

## 0.1.7 (2025-12-03)

### ✨ Features

- **benchmarks:** add fair comparison with static/dynamic route separation ([bcb1b91](https://github.com/SylphxAI/gust/commit/bcb1b91d50883c2b1276647d5bfea481acb78b3b))
- **errors:** standardize error response format across codebase ([d77372a](https://github.com/SylphxAI/gust/commit/d77372a37ff5bb8aa2e30cf1c5bf406a0b8e339d))
- **logging:** add warnings when native/WASM bindings unavailable ([e65f799](https://github.com/SylphxAI/gust/commit/e65f7994d74809b6712a396dbb28233d1d09b805))
- **app:** auto-detect handler signature for seamless fetch integration ([2638987](https://github.com/SylphxAI/gust/commit/2638987985843a01f4911dfb5a4cff1b5689eb9c))
- **app:** add fetchHandler for seamless external handler integration ([b2f6349](https://github.com/SylphxAI/gust/commit/b2f63493d10dbb164154041da5a2c1044de01aff))
- **app:** add request delegation support for external handlers ([21b663c](https://github.com/SylphxAI/gust/commit/21b663cdf6eac365689c1f4c30b79948a386fb7e))
- split into @sylphx/gust-app and @sylphx/gust-server packages ([1d2a4e1](https://github.com/SylphxAI/gust/commit/1d2a4e154af29eedd6a551fc3c7e3a409af36ed8))

### 🐛 Bug Fixes

- **types:** add explicit type annotation to FETCH_HANDLER_MARKER ([238b49a](https://github.com/SylphxAI/gust/commit/238b49a9b585764ac93fe2d026bf2d558c9c3eb8))
- **types:** resolve TypeScript strict mode errors ([e0adf5f](https://github.com/SylphxAI/gust/commit/e0adf5fb209232a764d9db845bf0ebb437617f15))
- **build:** ensure native binding and WASM load correctly ([83fcf20](https://github.com/SylphxAI/gust/commit/83fcf2088555ce9aa2f485a5d221fcd2dbe8f8fd))
- **wasm:** add Node.js crypto fallbacks for ID generation ([e03b23c](https://github.com/SylphxAI/gust/commit/e03b23cb2ce1e3db318db515328c7f8f20a9c030))
- **resources:** add cleanup methods and fix socket null check ([81245b3](https://github.com/SylphxAI/gust/commit/81245b38a93280db617172895708f6ba00a2d4c8))
- **types:** replace Function type with proper handler typing ([ca269dd](https://github.com/SylphxAI/gust/commit/ca269dd8c4a12b61093d4a800fb4e28c33207321))

### ♻️ Refactoring

- clean architecture and remove 14k lines of duplicate code ([8f3bb35](https://github.com/SylphxAI/gust/commit/8f3bb354ddced99a829b15807b143f919577a429))

### 📚 Documentation

- add external handler integration documentation ([bb8532d](https://github.com/SylphxAI/gust/commit/bb8532d91a02578d63fc019854bfe0169b659c55))
- add READMEs for gust-app and gust-server packages ([d94fa00](https://github.com/SylphxAI/gust/commit/d94fa00e1e55498a669a4646d39350e46812099e))

### 📦 Build

- add per-package tsconfig.json for isolated typecheck ([eebc220](https://github.com/SylphxAI/gust/commit/eebc22034ad93eb6e26ec95f71f3a2435cc5304d))

### 🔧 Chores

- cleanup unused files and folders ([0940733](https://github.com/SylphxAI/gust/commit/0940733391c443db8baa5a76d26e0a25a57590eb))

## 0.1.7 (2025-12-03)

### ✨ Features

- **benchmarks:** add fair comparison with static/dynamic route separation ([bcb1b91](https://github.com/SylphxAI/gust/commit/bcb1b91d50883c2b1276647d5bfea481acb78b3b))
- **errors:** standardize error response format across codebase ([d77372a](https://github.com/SylphxAI/gust/commit/d77372a37ff5bb8aa2e30cf1c5bf406a0b8e339d))
- **logging:** add warnings when native/WASM bindings unavailable ([e65f799](https://github.com/SylphxAI/gust/commit/e65f7994d74809b6712a396dbb28233d1d09b805))
- **app:** auto-detect handler signature for seamless fetch integration ([2638987](https://github.com/SylphxAI/gust/commit/2638987985843a01f4911dfb5a4cff1b5689eb9c))
- **app:** add fetchHandler for seamless external handler integration ([b2f6349](https://github.com/SylphxAI/gust/commit/b2f63493d10dbb164154041da5a2c1044de01aff))
- **app:** add request delegation support for external handlers ([21b663c](https://github.com/SylphxAI/gust/commit/21b663cdf6eac365689c1f4c30b79948a386fb7e))
- split into @sylphx/gust-app and @sylphx/gust-server packages ([1d2a4e1](https://github.com/SylphxAI/gust/commit/1d2a4e154af29eedd6a551fc3c7e3a409af36ed8))

### 🐛 Bug Fixes

- **types:** add explicit type annotation to FETCH_HANDLER_MARKER ([238b49a](https://github.com/SylphxAI/gust/commit/238b49a9b585764ac93fe2d026bf2d558c9c3eb8))
- **types:** resolve TypeScript strict mode errors ([e0adf5f](https://github.com/SylphxAI/gust/commit/e0adf5fb209232a764d9db845bf0ebb437617f15))
- **build:** ensure native binding and WASM load correctly ([83fcf20](https://github.com/SylphxAI/gust/commit/83fcf2088555ce9aa2f485a5d221fcd2dbe8f8fd))
- **wasm:** add Node.js crypto fallbacks for ID generation ([e03b23c](https://github.com/SylphxAI/gust/commit/e03b23cb2ce1e3db318db515328c7f8f20a9c030))
- **resources:** add cleanup methods and fix socket null check ([81245b3](https://github.com/SylphxAI/gust/commit/81245b38a93280db617172895708f6ba00a2d4c8))
- **types:** replace Function type with proper handler typing ([ca269dd](https://github.com/SylphxAI/gust/commit/ca269dd8c4a12b61093d4a800fb4e28c33207321))

### ♻️ Refactoring

- clean architecture and remove 14k lines of duplicate code ([8f3bb35](https://github.com/SylphxAI/gust/commit/8f3bb354ddced99a829b15807b143f919577a429))

### 📚 Documentation

- add external handler integration documentation ([bb8532d](https://github.com/SylphxAI/gust/commit/bb8532d91a02578d63fc019854bfe0169b659c55))
- add READMEs for gust-app and gust-server packages ([d94fa00](https://github.com/SylphxAI/gust/commit/d94fa00e1e55498a669a4646d39350e46812099e))

### 📦 Build

- add per-package tsconfig.json for isolated typecheck ([eebc220](https://github.com/SylphxAI/gust/commit/eebc22034ad93eb6e26ec95f71f3a2435cc5304d))

### 🔧 Chores

- cleanup unused files and folders ([0940733](https://github.com/SylphxAI/gust/commit/0940733391c443db8baa5a76d26e0a25a57590eb))
