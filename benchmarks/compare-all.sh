#!/bin/bash
# Comprehensive Framework Comparison
# Gust vs Hono vs Elysia vs Express vs Fastify vs Bun.serve

set -e

PORT=3456
DURATION=10
CONNECTIONS=500

echo "========================================"
echo "  Framework Comparison Benchmark"
echo "========================================"
echo ""
echo "Settings:"
echo "  Duration: ${DURATION}s"
echo "  Connections: ${CONNECTIONS}"
echo ""

# Results array
declare -a RESULTS

run_benchmark() {
    local name="$1"
    local runtime="$2"
    local file="$3"

    echo "Testing: $name ($runtime)..."

    # Start server
    if [ "$runtime" = "bun" ]; then
        PORT=$PORT bun run "servers/$file" > /dev/null 2>&1 &
    else
        PORT=$PORT node --experimental-strip-types "servers/$file" > /dev/null 2>&1 &
    fi
    SERVER_PID=$!

    # Wait for server to start
    sleep 2

    # Check if server is running
    if ! kill -0 $SERVER_PID 2>/dev/null; then
        echo "  ❌ Server failed to start"
        RESULTS+=("$name|$runtime|FAILED|N/A")
        return 1
    fi

    # Run benchmark
    RESULT=$(bombardier -c $CONNECTIONS -d ${DURATION}s -p r http://localhost:$PORT/ 2>&1)

    # Extract req/sec
    REQS=$(echo "$RESULT" | grep "Reqs/sec" | awk '{print $2}')
    LATENCY=$(echo "$RESULT" | grep "Latency" | head -1 | awk '{print $2}')

    echo "  ✅ $REQS req/s (${LATENCY})"

    # Store result
    RESULTS+=("$name|$runtime|$REQS|$LATENCY")

    # Kill server
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
    sleep 1
}

# Change to benchmarks directory
cd "$(dirname "$0")"

echo ""
echo "=== Bun Runtime ==="
echo ""

run_benchmark "Gust Turbo" "bun" "gust-turbo.ts"
run_benchmark "Gust Native" "bun" "gust-native.ts"
run_benchmark "Gust WASM" "bun" "gust-wasm.ts"
run_benchmark "Bun.serve" "bun" "bun-native.ts"
run_benchmark "Elysia" "bun" "elysia.ts"
run_benchmark "Hono" "bun" "hono.ts"
run_benchmark "Express" "bun" "express.ts"
run_benchmark "Fastify" "bun" "fastify.ts"

echo ""
echo "=== Node.js Runtime ==="
echo ""

run_benchmark "Gust Native" "node" "gust-native.ts"
run_benchmark "Gust WASM" "node" "gust-wasm.ts"
run_benchmark "Hono" "node" "hono.ts"
run_benchmark "Express" "node" "express.ts"
run_benchmark "Fastify" "node" "fastify.ts"

echo ""
echo "========================================"
echo "  RESULTS SUMMARY"
echo "========================================"
echo ""

# Sort and display Bun results
echo "=== Bun Runtime ==="
printf "%-15s %15s %12s\n" "Framework" "Req/sec" "Latency"
printf "%-15s %15s %12s\n" "---------" "-------" "-------"

for result in "${RESULTS[@]}"; do
    IFS='|' read -r name runtime reqs latency <<< "$result"
    if [ "$runtime" = "bun" ]; then
        printf "%-15s %15s %12s\n" "$name" "$reqs" "$latency"
    fi
done

echo ""
echo "=== Node.js Runtime ==="
printf "%-15s %15s %12s\n" "Framework" "Req/sec" "Latency"
printf "%-15s %15s %12s\n" "---------" "-------" "-------"

for result in "${RESULTS[@]}"; do
    IFS='|' read -r name runtime reqs latency <<< "$result"
    if [ "$runtime" = "node" ]; then
        printf "%-15s %15s %12s\n" "$name" "$reqs" "$latency"
    fi
done

echo ""
echo "Benchmark complete!"
