# Changelog

## 0.1.6 (2025-11-28)

### ✨ Features

- **streaming:** add AsyncIterable-based streaming support ([b52a96f](https://github.com/SylphxAI/gust/commit/b52a96fecdd4a905a7b0c11d62f964d2046c117a))

## 0.1.5 (2025-11-28)

### ✨ Features

- **streaming:** add AsyncIterable-based streaming support ([b52a96f](https://github.com/SylphxAI/gust/commit/b52a96fecdd4a905a7b0c11d62f964d2046c117a))

## 0.1.4 (2025-11-28)

### ✨ Features

- **streaming:** add AsyncIterable-based streaming support ([b52a96f](https://github.com/SylphxAI/gust/commit/b52a96fecdd4a905a7b0c11d62f964d2046c117a))

## 0.1.3 (2025-11-27)

### 🐛 Bug Fixes

- **build:** disable code splitting to fix duplicate exports ([ab72899](https://github.com/SylphxAI/gust/commit/ab728993f5158abe0eb65f40d828ee4b906127b2))

## 0.1.2 (2025-11-27)

### 🐛 Bug Fixes

- **types:** use correct PreloadResource type ([25840cc](https://github.com/SylphxAI/gust/commit/25840cc35b67c0cd22ca010ed12a1aafefb723d8))
- **types:** add explicit return types for bundler compatibility ([7eefbf9](https://github.com/SylphxAI/gust/commit/7eefbf9cbb7d8824395fa2c45ae867f6618cbe88))
- **build:** compile TypeScript to JavaScript before publishing ([2ef1667](https://github.com/SylphxAI/gust/commit/2ef16670ce02e87daeb2400721920b0f99c0b459))

### ♻️ Refactoring

- optimize code quality and consistency ([4f33bf5](https://github.com/SylphxAI/gust/commit/4f33bf589a30513476e4da70bc8d6c269c2f917d))

### 💅 Styles

- format websocket.ts ([bc78fa4](https://github.com/SylphxAI/gust/commit/bc78fa4ddce63eebcdbad69595ab4a3222b5d99b))

## 0.1.1 (2025-11-27)

### ✨ Features

- **router:** type-safe routing with path param inference ([a03f0ca](https://github.com/SylphxAI/gust/commit/a03f0ca353ae896fb8ddae7ee6c58fce280fba0b))
- **serve:** add OpenTelemetry and HTTP/2 support ([b6206fc](https://github.com/SylphxAI/gust/commit/b6206fc8762a8f0f57adba7d54c6e3b31dedbaa9))
- **serve:** add enterprise production features ([5d73f0d](https://github.com/SylphxAI/gust/commit/5d73f0d70e531bcc05f5878ab905348725c847b4))
- **serve:** add streaming and range request support ([100d487](https://github.com/SylphxAI/gust/commit/100d487f8b079e4e46ea6c65f995041e44d0c736))
- **serve:** add graceful shutdown ([2806382](https://github.com/SylphxAI/gust/commit/2806382357dbb5a9c07a218471a42b008062bd2c))
- **serve:** add production-ready features ([0e99704](https://github.com/SylphxAI/gust/commit/0e99704887f06d0988c098db3bcaaf24b3fb9499))
- **serve:** add WebSocket support ([cc574dd](https://github.com/SylphxAI/gust/commit/cc574dd17444260003c2e32f5b65914251587397))
- **serve:** add HTTPS/TLS support ([e0337ba](https://github.com/SylphxAI/gust/commit/e0337ba0cfc8e445e360443e45c5b9ad695877db))
- **serve:** add response compression ([3a9506d](https://github.com/SylphxAI/gust/commit/3a9506de9265adeb4a7a00e6d67bcd75e7b84e00))
- **serve:** add cookie parsing and serialization ([9018cd2](https://github.com/SylphxAI/gust/commit/9018cd28624535a0f5993d7816273ee4cdf00dfa))
- **serve:** add CORS support ([111be2a](https://github.com/SylphxAI/gust/commit/111be2a208dc41992ef93901e67b7aac74b6256d))
- **serve:** add static file serving ([c1bdc71](https://github.com/SylphxAI/gust/commit/c1bdc710d5079e818d979193b8ca351e50b4d151))
- **serve:** add request timeout and header size limits ([8cb0437](https://github.com/SylphxAI/gust/commit/8cb043714158bd886de00f6e71192cfd300583ce))
- **serve:** add HTTP Keep-Alive support ([913c8b0](https://github.com/SylphxAI/gust/commit/913c8b027e5fd57f752c9e6d1192860a543bc854))
- initial implementation with WASM HTTP parser and router ([60dfac6](https://github.com/SylphxAI/gust/commit/60dfac6883ad4b3632fb42b400f541705f436765))

### 🐛 Bug Fixes

- **serve:** correct response() function signature across modules ([c571fe3](https://github.com/SylphxAI/gust/commit/c571fe3c62962165a9584dbe8f2566a51a54f2b2))

### 📚 Documentation

- update READMEs with correct API examples ([d85f2e0](https://github.com/SylphxAI/gust/commit/d85f2e06c0d7ecd1a141ce06cf76b0e839cca104))

### ✅ Tests

- **serve:** enhance rateLimit and body test coverage ([21a8fb3](https://github.com/SylphxAI/gust/commit/21a8fb355ce97f2a2f35a9e04e6828275c7c6ffc))
- **serve:** enhance auth, cache, and validate test coverage ([a7cc9ae](https://github.com/SylphxAI/gust/commit/a7cc9ae1500e512ce08e6d593aa28509aa868bce))
- **serve:** enhance test coverage for range, csrf, cookie, circuitBreaker ([d10b23e](https://github.com/SylphxAI/gust/commit/d10b23eb994e3f6972230121bd62bf4d550a39ab))
- **serve:** add comprehensive tests for remaining modules ([c01f8da](https://github.com/SylphxAI/gust/commit/c01f8da8c24cfff3a48b89731f2272e96e93442b))
- **serve:** add comprehensive tests for middleware modules ([44ae467](https://github.com/SylphxAI/gust/commit/44ae467175bb583be8c9f302bbe61a75c3c5d5b8))
- **serve:** add comprehensive unit tests ([ca857cd](https://github.com/SylphxAI/gust/commit/ca857cdc016b880d0386d583ed93bf199a48f9c7))
