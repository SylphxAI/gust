#!/usr/bin/env bash
# Rust-First gate: packages/server must not implement parallel HTTP server logic.
# Allowed: FFI bridge to @sylphx/gust-napi / gust-wasm (native.ts, type re-exports).
# Forbidden: in-process HTTP/1.1 or HTTP/2 servers, WASM HTTP parse loops, socket accept loops,
#            Bun.serve wrappers (turboServe), and public turboServe export.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_SRC="${ROOT}/packages/server/src"

if [[ ! -d "${SERVER_SRC}" ]]; then
  echo "check-no-ts-backend: missing ${SERVER_SRC}"
  exit 1
fi

# Files that may contain only FFI bridge / handler helpers (no socket servers).
# turbo.ts is allowlisted for turboRouter/turboJson helpers only — Bun.serve/turboServe
# are still forbidden via the global hot-path scan below.
ALLOWED=(
  native.ts
  index.ts
  health.ts
  otel.ts
  circuitBreaker.ts
  static.ts
  range.ts
  stream.ts
  sse.ts
  websocket.ts
  turbo.ts
  cluster.ts
)

is_allowed() {
  local base="$1"
  for allowed in "${ALLOWED[@]}"; do
    if [[ "${base}" == "${allowed}" ]]; then
      return 0
    fi
  done
  return 1
}

violations=0

report_violation() {
  local file="$1"
  local pattern="$2"
  local detail="$3"
  echo "VIOLATION: ${file}: ${pattern} — ${detail}"
  violations=$((violations + 1))
}

scan_file() {
  local file="$1"
  local base
  base="$(basename "${file}")"

  if is_allowed "${base}"; then
    return 0
  fi

  if grep -qE "from 'node:net'|from \"node:net\"" "${file}"; then
    report_violation "${base}" "node:net import" "parallel TCP HTTP server surface"
  fi

  if grep -qE "from 'node:tls'|from \"node:tls\"" "${file}"; then
    report_violation "${base}" "node:tls import" "parallel TLS HTTP server surface"
  fi

  if grep -qE "from 'node:http2'|from \"node:http2\"" "${file}"; then
    report_violation "${base}" "node:http2 import" "parallel HTTP/2 server surface"
  fi

  if grep -qE '\bcreateServer\b' "${file}"; then
    report_violation "${base}" "createServer" "in-process HTTP listener"
  fi

  if grep -qE '\bparse_http\b' "${file}"; then
    report_violation "${base}" "parse_http" "WASM HTTP parse loop (backend authority)"
  fi

  if grep -qE '\bserveJs\b|\bhandleConnection\b' "${file}"; then
    report_violation "${base}" "serveJs/handleConnection" "JS HTTP accept/parse loop"
  fi
}

# Global hot-path bans — apply even to allowlisted files.
# Match code (export/const/call), not documentation comments.
scan_hot_path_bans() {
  local file="$1"
  local base
  base="$(basename "${file}")"
  # Strip // and /* */ comments before matching so docs can name the ban.
  local code
  code="$(sed -E 's|//.*$||g; s|/\*.*\*/||g' "${file}")"

  if printf '%s\n' "${code}" | grep -qE '(export[[:space:]]+\{[^}]*\bturboServe\b|export[[:space:]]+(const|function|async function)[[:space:]]+turboServe\b|const[[:space:]]+turboServe[[:space:]]*=)'; then
    report_violation "${base}" "turboServe" "public/parallel Bun HTTP serve bypass of gust-core native authority"
  fi

  if printf '%s\n' "${code}" | grep -qE '\bBun\.serve\s*\('; then
    report_violation "${base}" "Bun.serve" "parallel in-process HTTP server (must use serve() → gust-napi)"
  fi
}

echo "check-no-ts-backend: scanning ${SERVER_SRC}"
for ts_file in "${SERVER_SRC}"/*.ts; do
  [[ -f "${ts_file}" ]] || continue
  scan_file "${ts_file}"
  scan_hot_path_bans "${ts_file}"
done

if [[ "${violations}" -gt 0 ]]; then
  echo ""
  echo "FAIL: ${violations} parallel HTTP backend pattern(s) in packages/server."
  echo "Authority must remain crates/gust-core via @sylphx/gust-napi FFI bridge (native.ts)."
  exit 1
fi

echo "PASS: no parallel TS HTTP backend logic detected in packages/server."
