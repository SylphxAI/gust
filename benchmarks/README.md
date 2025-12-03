# Gust Benchmarks

Benchmark results comparing Gust against popular HTTP server frameworks.

## Test Setup

- **Tool**: bombardier
- **Duration**: 10 seconds
- **Connections**: 500
- **Endpoint**: `GET /` (JSON response)

## Results

### Dynamic Routes (Bun Runtime)

Real-world benchmark with JS handler callbacks per request:

| Rank | Framework | Requests/sec | Latency (avg) | vs Gust |
|------|-----------|-------------|---------------|---------|
| 🥇 | **Gust (Native)** | **141,266** | 3.54ms | baseline |
| 2 | Bun.serve | 136,313 | 3.67ms | 0.96x |
| 3 | Elysia | 129,224 | 3.87ms | 0.91x |
| 4 | Hono | 125,000 | 4.0ms | 0.88x |
| 5 | Express | 47,343 | 10.5ms | 0.34x |

### Static Routes (Bun Runtime)

Maximum throughput with pre-computed responses (no handler callback):

| Rank | Framework | Requests/sec | Latency (avg) | vs Gust |
|------|-----------|-------------|---------------|---------|
| 🥇 | **Gust (Turbo)** | **232,704** | 2.1ms | baseline |
| 2 | Elysia | 192,386 | 2.6ms | 0.83x |
| 3 | Bun.serve | 183,716 | 2.7ms | 0.79x |
| 4 | Hono | 157,729 | 3.2ms | 0.68x |

## Analysis

### Why Gust is fast

1. **Native Rust Server** - HTTP parsing and routing in Rust via napi-rs
2. **ArcSwap Lock-free Reads** - Zero contention on hot path for handler dispatch
3. **Sucrose-style Optimization** - Skip header collection for simple GET/HEAD routes
4. **Radix Trie Router** - O(k) route matching where k is path length
5. **Zero-copy Parsing** - Minimal allocations in hot path

### Optimization Techniques

Gust implements several Elysia-inspired optimizations:

- **Skip body reading** for GET/HEAD requests (no request body)
- **Skip header collection** for routes without path parameters
- **Lock-free atomic reads** via ArcSwap (vs RwLock contention)
- **Pre-allocated buffers** for response construction

### Cross-Runtime Performance

Gust is the **only framework** that:
- Is fastest on both Bun and Node.js with dynamic routes
- Performs competitively against Bun-native frameworks
- Uses the same codebase for both runtimes

## Running Benchmarks

```bash
# Install dependencies
cd benchmarks
bun install

# Run fair comparison (both static and dynamic)
./compare-fair.sh

# Individual server benchmarks
bun run servers/gust-native.ts   # Dynamic routes
bun run servers/gust-turbo.ts    # Static routes (pre-computed)
```

## Hardware

Results may vary based on hardware. These benchmarks were run on:
- Apple Silicon (M3 Max)
- macOS
- bombardier v1.2.6
