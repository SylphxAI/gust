#!/bin/bash
# Comprehensive Gust Benchmark
# Tests: Native vs WASM, Bun vs Node

set -e

PORT=3456
DURATION=10
CONNECTIONS=500

echo "========================================"
echo "  Gust Comprehensive Benchmark"
echo "========================================"
echo ""
echo "Settings:"
echo "  Duration: ${DURATION}s"
echo "  Connections: ${CONNECTIONS}"
echo "  Port: ${PORT}"
echo ""

# Results array
declare -a RESULTS

run_benchmark() {
    local name="$1"
    local runtime="$2"
    local file="$3"

    echo "----------------------------------------"
    echo "Testing: $name ($runtime)"
    echo "----------------------------------------"

    # Start server
    if [ "$runtime" = "bun" ]; then
        PORT=$PORT bun run "servers/$file" &
    else
        PORT=$PORT node --experimental-strip-types "servers/$file" &
    fi
    SERVER_PID=$!

    # Wait for server to start
    sleep 2

    # Check if server is running
    if ! kill -0 $SERVER_PID 2>/dev/null; then
        echo "❌ Server failed to start"
        return 1
    fi

    # Run benchmark
    echo "Running bombardier..."
    RESULT=$(bombardier -c $CONNECTIONS -d ${DURATION}s -p r http://localhost:$PORT/ 2>&1)

    # Extract req/sec
    REQS=$(echo "$RESULT" | grep "Reqs/sec" | awk '{print $2}')
    LATENCY=$(echo "$RESULT" | grep "Latency" | head -1 | awk '{print $2}')

    echo "Result: $REQS req/s (latency: $LATENCY)"
    echo ""

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
echo "========================================"
echo "  1. Gust Native + Bun"
echo "========================================"
run_benchmark "Gust Native" "bun" "gust-native.ts"

echo ""
echo "========================================"
echo "  2. Gust Native + Node"
echo "========================================"
run_benchmark "Gust Native" "node" "gust-native.ts"

echo ""
echo "========================================"
echo "  3. Gust WASM + Bun"
echo "========================================"
run_benchmark "Gust WASM" "bun" "gust-wasm.ts"

echo ""
echo "========================================"
echo "  4. Gust WASM + Node"
echo "========================================"
run_benchmark "Gust WASM" "node" "gust-wasm.ts"

echo ""
echo "========================================"
echo "  RESULTS SUMMARY"
echo "========================================"
echo ""
printf "%-20s %-10s %-15s %-15s\n" "Mode" "Runtime" "Req/sec" "Latency"
printf "%-20s %-10s %-15s %-15s\n" "----" "-------" "-------" "-------"

for result in "${RESULTS[@]}"; do
    IFS='|' read -r name runtime reqs latency <<< "$result"
    printf "%-20s %-10s %-15s %-15s\n" "$name" "$runtime" "$reqs" "$latency"
done

echo ""
echo "Benchmark complete!"
