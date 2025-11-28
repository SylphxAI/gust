# Gust Benchmarks

Benchmark results comparing Gust against popular HTTP server frameworks.

## Test Setup

- **Tool**: wrk
- **Duration**: 10 seconds
- **Threads**: 4
- **Connections**: 100
- **Endpoint**: `GET /` (JSON response)

## Results

### Bun Runtime

| Rank | Framework | Requests/sec | Latency (avg) | vs Gust |
|------|-----------|-------------|---------------|---------|
| 1 | Elysia | 185,512 | 538µs | 1.17x faster |
| 2 | Bun.serve | 177,035 | 564µs | 1.12x faster |
| 3 | **Gust** | **158,176** | 638µs | baseline |
| 4 | Hono | 154,431 | 649µs | 1.02x slower |
| 5 | Fastify | 139,327 | 1.14ms | 1.14x slower |
| 6 | H3 | 122,618 | 806µs | 1.29x slower |
| 7 | Express | 98,257 | 1.02ms | 1.61x slower |

### Node.js Runtime

| Rank | Framework | Requests/sec | Latency (avg) | vs Gust |
|------|-----------|-------------|---------------|---------|
| 🥇 | **Gust** | **129,767** | 840µs | baseline |
| 2 | Fastify | 125,959 | 0.89ms | 1.03x slower |
| 3 | H3 | 117,435 | 0.98ms | 1.11x slower |
| 4 | Hono | 72,657 | 2.62ms | 1.79x slower |
| 5 | Express | 69,893 | 1.69ms | 1.86x slower |

## Analysis

### Why Gust is fast

1. **Native Rust Server** - HTTP parsing and routing in Rust via napi-rs
2. **WASM Fallback** - When native isn't available, uses optimized WASM
3. **Radix Trie Router** - O(k) route matching where k is path length
4. **Zero-copy Parsing** - Minimal allocations in hot path

### Why Elysia/Bun.serve are faster on Bun

Elysia and Bun.serve use Bun's internal APIs (Zig-based HTTP server) which have:
- Direct access to Bun's event loop
- Zero JS overhead for request/response
- Bun-specific optimizations

Gust uses a runtime-agnostic approach (napi-rs + WASM) which works on both Bun and Node.js but has slightly more overhead on Bun.

### Cross-Runtime Performance

Gust is the **only framework** that:
- Is fastest on Node.js
- Performs competitively on Bun
- Uses the same codebase for both runtimes

## Running Benchmarks

```bash
# Install dependencies
cd benchmarks
bun install

# Run with Bun
bun run bench.ts

# Run with Node.js
node --experimental-strip-types bench.ts
```

## Hardware

Results may vary based on hardware. These benchmarks were run on:
- Apple Silicon (M-series)
- macOS
