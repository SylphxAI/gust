#!/bin/bash
# Fair Framework Comparison - Separated by Route Type
# Static Routes vs Dynamic Routes

set -e

PORT=3456
DURATION=10
CONNECTIONS=500

echo "========================================"
echo "  Fair Framework Comparison Benchmark"
echo "========================================"
echo ""
echo "Settings:"
echo "  Duration: ${DURATION}s"
echo "  Connections: ${CONNECTIONS}"
echo ""

# Results arrays
declare -a STATIC_BUN
declare -a DYNAMIC_BUN
declare -a DYNAMIC_NODE

run_benchmark() {
    local name="$1"
    local runtime="$2"
    local file="$3"
    local category="$4"

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
        return 1
    fi

    # Run benchmark
    RESULT=$(bombardier -c $CONNECTIONS -d ${DURATION}s -p r http://localhost:$PORT/ 2>&1)

    # Extract req/sec
    REQS=$(echo "$RESULT" | grep "Reqs/sec" | awk '{print $2}')
    LATENCY=$(echo "$RESULT" | grep "Latency" | head -1 | awk '{print $2}')

    echo "  ✅ $REQS req/s (${LATENCY})"

    # Store result in appropriate category
    if [ "$category" = "static_bun" ]; then
        STATIC_BUN+=("$name|$REQS|$LATENCY")
    elif [ "$category" = "dynamic_bun" ]; then
        DYNAMIC_BUN+=("$name|$REQS|$LATENCY")
    elif [ "$category" = "dynamic_node" ]; then
        DYNAMIC_NODE+=("$name|$REQS|$LATENCY")
    fi

    # Kill server
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
    sleep 1
}

# Change to benchmarks directory
cd "$(dirname "$0")"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  STATIC ROUTES (Bun Runtime)         ║"
echo "║  Pre-determined responses, no logic  ║"
echo "╚══════════════════════════════════════╝"
echo ""

run_benchmark "Gust Turbo" "bun" "gust-turbo.ts" "static_bun"
run_benchmark "Bun.serve" "bun" "bun-static.ts" "static_bun"
run_benchmark "Elysia" "bun" "elysia-static.ts" "static_bun"
run_benchmark "Hono" "bun" "hono-static.ts" "static_bun"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  DYNAMIC ROUTES (Bun Runtime)        ║"
echo "║  JS handler callbacks per request    ║"
echo "╚══════════════════════════════════════╝"
echo ""

run_benchmark "Gust Native" "bun" "gust-native.ts" "dynamic_bun"
run_benchmark "Bun.serve" "bun" "bun-native.ts" "dynamic_bun"
run_benchmark "Elysia" "bun" "elysia.ts" "dynamic_bun"
run_benchmark "Hono" "bun" "hono.ts" "dynamic_bun"
run_benchmark "Express" "bun" "express.ts" "dynamic_bun"
run_benchmark "Fastify" "bun" "fastify.ts" "dynamic_bun"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  DYNAMIC ROUTES (Node.js Runtime)    ║"
echo "║  JS handler callbacks per request    ║"
echo "╚══════════════════════════════════════╝"
echo ""

run_benchmark "Gust Native" "node" "gust-native.ts" "dynamic_node"
run_benchmark "Hono" "node" "hono.ts" "dynamic_node"
run_benchmark "Express" "node" "express.ts" "dynamic_node"
run_benchmark "Fastify" "node" "fastify.ts" "dynamic_node"

echo ""
echo "========================================"
echo "  RESULTS SUMMARY"
echo "========================================"

echo ""
echo "┌────────────────────────────────────────┐"
echo "│  STATIC ROUTES (Bun) - Pure Speed      │"
echo "│  Response is pre-determined, no JS     │"
echo "└────────────────────────────────────────┘"
printf "%-15s %15s %12s\n" "Framework" "Req/sec" "Latency"
printf "%-15s %15s %12s\n" "---------" "-------" "-------"

for result in "${STATIC_BUN[@]}"; do
    IFS='|' read -r name reqs latency <<< "$result"
    printf "%-15s %15s %12s\n" "$name" "$reqs" "$latency"
done

echo ""
echo "┌────────────────────────────────────────┐"
echo "│  DYNAMIC ROUTES (Bun) - Real World     │"
echo "│  JS handler callback per request       │"
echo "└────────────────────────────────────────┘"
printf "%-15s %15s %12s\n" "Framework" "Req/sec" "Latency"
printf "%-15s %15s %12s\n" "---------" "-------" "-------"

for result in "${DYNAMIC_BUN[@]}"; do
    IFS='|' read -r name reqs latency <<< "$result"
    printf "%-15s %15s %12s\n" "$name" "$reqs" "$latency"
done

echo ""
echo "┌────────────────────────────────────────┐"
echo "│  DYNAMIC ROUTES (Node.js)              │"
echo "│  JS handler callback per request       │"
echo "└────────────────────────────────────────┘"
printf "%-15s %15s %12s\n" "Framework" "Req/sec" "Latency"
printf "%-15s %15s %12s\n" "---------" "-------" "-------"

for result in "${DYNAMIC_NODE[@]}"; do
    IFS='|' read -r name reqs latency <<< "$result"
    printf "%-15s %15s %12s\n" "$name" "$reqs" "$latency"
done

echo ""
echo "Benchmark complete!"
echo ""
echo "Note: Static routes compare raw throughput capability."
echo "      Dynamic routes compare real-world framework performance."
