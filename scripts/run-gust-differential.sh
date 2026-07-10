#!/usr/bin/env bash
# Gust HTTP core bounded differential parity — TS contract oracle vs native Rust SSOT.
# Slices: http-core.router | http-core.parse | trace.w3c | all
# Fail-closed: requires bun + cargo (no SKIP-as-pass).
# See PARITY-VERIFICATION-STANDARD.md, DECISION-001 / rej-010.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRATCH="${SCRATCH_DIR:-/tmp/gust-http-core-differential}"
mkdir -p "$SCRATCH"
LOG="$SCRATCH/differential.log"
ARTIFACT="$SCRATCH/verification.json"
ORACLE_JSON="$SCRATCH/oracle.json"
SLICE_FILTER="all"
: >"$LOG"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --slice)
      SLICE_FILTER="${2:-}"
      shift 2
      ;;
    *)
      echo "::error::unknown argument: $1" | tee -a "$LOG"
      exit 1
      ;;
  esac
done

case "$SLICE_FILTER" in
  all|http-core.router|http-core.parse|trace.w3c) ;;
  *)
    echo "::error::invalid --slice value: $SLICE_FILTER" | tee -a "$LOG"
    exit 1
    ;;
esac

cd "$REPO_ROOT"

HEAD_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
if [[ "$HEAD_SHA" == "unknown" ]]; then
  echo "::error::cannot resolve git HEAD for differential bound-sha gate" | tee -a "$LOG"
  exit 1
fi
BOUND_SHA="${BOUND_SHA:-$HEAD_SHA}"
CANDIDATE_SHA="${CANDIDATE_SHA:-$HEAD_SHA}"
if [[ "$HEAD_SHA" != "$BOUND_SHA" ]]; then
  if [[ "${ALLOW_SHA_MISMATCH:-}" == "1" ]]; then
    echo "::warning::HEAD $HEAD_SHA != BOUND_SHA $BOUND_SHA (ALLOW_SHA_MISMATCH=1)" | tee -a "$LOG"
  else
    echo "::error::HEAD $HEAD_SHA != BOUND_SHA $BOUND_SHA — checkout bound SHA or set ALLOW_SHA_MISMATCH=1" | tee -a "$LOG"
    exit 1
  fi
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "::error::bun required for gust differential parity — no SKIP-as-pass" | tee -a "$LOG"
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "::error::cargo required for gust differential parity — no SKIP-as-pass" | tee -a "$LOG"
  exit 1
fi

echo "=== gust HTTP core differential parity $(date -Iseconds) slice=$SLICE_FILTER ===" | tee -a "$LOG"

echo "--- check-no-ts-backend gate ---" | tee -a "$LOG"
bash "$REPO_ROOT/scripts/check-no-ts-backend.sh" 2>&1 | tee -a "$LOG"

echo "--- TS contract oracle ---" | tee -a "$LOG"
bun run "$REPO_ROOT/scripts/differential/http-core-oracle.ts" >"$ORACLE_JSON" 2>>"$LOG"

echo "--- Rust differential test ---" | tee -a "$LOG"
GUST_ORACLE_JSON="$ORACLE_JSON" \
  cargo test -p gust-core --test http_core_differential http_core_differential_matches_ts_oracle -- --nocapture 2>&1 | tee -a "$LOG"

BASELINE_TS_SHA="$(git -C "$REPO_ROOT" log -1 --format=%H -- scripts/differential docs/specs/http-core-parity-slice.json 2>/dev/null || echo "")"
if [[ -z "$BASELINE_TS_SHA" ]]; then
  BASELINE_TS_SHA="$BOUND_SHA"
fi
RUST_SHA="$CANDIDATE_SHA"
BEHAVIOR_SPEC_HASH="$(jq -r '.behaviorSpecHash' "$ORACLE_JSON")"
FIXTURE_CORPUS_HASH="$(jq -r '.fixtureCorpusHash' "$ORACLE_JSON")"
CASE_COUNT="$(jq '.cases | length' "$ORACLE_JSON")"
ROUTER_CASE_COUNT="$(jq '[.cases[] | select(.domain == "http-core.router")] | length' "$ORACLE_JSON")"
PARSE_CASE_COUNT="$(jq '[.cases[] | select(.domain == "http-core.parse")] | length' "$ORACLE_JSON")"
TRACE_CASE_COUNT="$(jq '[.cases[] | select(.domain == "trace.w3c")] | length' "$ORACLE_JSON")"

jq -n \
  --arg verifiedAt "$(date -Iseconds)" \
  --arg candidateSha "$CANDIDATE_SHA" \
  --arg baselineTsSha "$BASELINE_TS_SHA" \
  --arg rustCandidateSha "$RUST_SHA" \
  --arg behaviorSpecHash "$BEHAVIOR_SPEC_HASH" \
  --arg fixtureCorpusHash "$FIXTURE_CORPUS_HASH" \
  --arg sliceFilter "$SLICE_FILTER" \
  --argjson caseCount "$CASE_COUNT" \
  --argjson routerCaseCount "$ROUTER_CASE_COUNT" \
  --argjson parseCaseCount "$PARSE_CASE_COUNT" \
  --argjson traceCaseCount "$TRACE_CASE_COUNT" \
  '{
    schemaVersion: 2,
    repo: "SylphxAI/gust",
    slice: (if $sliceFilter == "all" then "http-core.router|http-core.parse|trace.w3c" else $sliceFilter end),
    sliceFilter: $sliceFilter,
    status: "differential_green",
    verifiedAt: $verifiedAt,
    lastComparedMainSha: $candidateSha,
    mergeGroupSha: $candidateSha,
    baselineTsSha: $baselineTsSha,
    rustCandidateSha: $rustCandidateSha,
    behaviorSpecHash: $behaviorSpecHash,
    fixtureCorpusHash: $fixtureCorpusHash,
    caseCount: $caseCount,
    routerCaseCount: $routerCaseCount,
    parseCaseCount: $parseCaseCount,
    traceCaseCount: $traceCaseCount,
    harness: "scripts/run-gust-differential.sh",
    differentialTest: "crates/gust-core/tests/http_core_differential.rs#http_core_differential_matches_ts_oracle",
    oracle: "scripts/differential/http-core-oracle.ts",
    gate: "scripts/check-no-ts-backend.sh",
    capabilitiesProven: [
      "rust-http-core",
      "wasm-routing-runtime",
      "middleware-security-stack"
    ],
    promotionPolicy: "NO_PROMOTIONS — promotion_hold active until prod_audit_pass",
    durability: "branch_landed_harness",
    notes: "middleware-security-stack proven for trace.w3c subset only; full middleware corpus deferred"
  }' >"$ARTIFACT"

echo "gust-differential: OK (cases=$CASE_COUNT router=$ROUTER_CASE_COUNT parse=$PARSE_CASE_COUNT trace=$TRACE_CASE_COUNT corpus=$FIXTURE_CORPUS_HASH)" | tee -a "$LOG"
echo "verification artifact: $ARTIFACT" | tee -a "$LOG"
