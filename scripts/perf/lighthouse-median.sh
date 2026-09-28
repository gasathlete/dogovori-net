#!/usr/bin/env bash
# Reproducible local Lighthouse baseline: production build served by `vite preview`.
# Usage: LH=/path/to/lighthouse scripts/perf/lighthouse-median.sh <label> [routes...]
# Needs a running `bunx vite preview --port 4173 --strictPort` over dist/.
set -euo pipefail
if [ "$#" -lt 1 ]; then
  echo "usage: $0 <label> [routes...]" >&2
  exit 2
fi
LABEL="$1"; shift
ROUTES=("${@:-/}")
LH="${LH:-lighthouse}"
OUT="reports/perf/$LABEL"
mkdir -p "$OUT"
RUNS="$OUT/runs.jsonl"
: > "$RUNS"
TMP_DIR="$(mktemp -d "/tmp/dogovori-lighthouse-${LABEL//[^a-zA-Z0-9_-]/_}.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT
for route in "${ROUTES[@]}"; do
  for form in mobile desktop; do
    for run in 1 2 3; do
      name="$(echo "$route" | tr '/' '_')_${form}_$run"
      extra=(); [ "$form" = desktop ] && extra=(--preset=desktop)
      json="$TMP_DIR/$name.json"
      CHROME_PATH="${CHROME_PATH:-/bin/chromium}" "$LH" "http://localhost:4173$route" "${extra[@]}" \
        --only-categories=performance --chrome-flags="--headless=new --no-sandbox" \
        --output=json --output-path="$json" --quiet
      node -e '
const r=require(process.argv[1]);const a=r.audits;
if (!r?.categories?.performance || !a?.["first-contentful-paint"] || !a?.["largest-contentful-paint"] || !a?.["total-blocking-time"] || !a?.["cumulative-layout-shift"]) {
  throw new Error(`incomplete Lighthouse result: ${process.argv[1]}`);
}
const bytes=t=>(a["resource-summary"]?.details?.items||[]).find(i=>i.resourceType===t)?.transferSize||0;
console.log(JSON.stringify({route:process.argv[2],form:process.argv[3],run:+process.argv[4],
score:Math.round(r.categories.performance.score*100),
fcp:Math.round(a["first-contentful-paint"].numericValue),lcp:Math.round(a["largest-contentful-paint"].numericValue),
tbt:Math.round(a["total-blocking-time"].numericValue),cls:+a["cumulative-layout-shift"].numericValue.toFixed(3),
si:Math.round(a["speed-index"].numericValue),jsKB:Math.round(bytes("script")/1024),imgKB:Math.round(bytes("image")/1024),
totalKB:Math.round(bytes("total")/1024)}))' "$json" "$route" "$form" "$run" >> "$RUNS"
    done
  done
done
echo "wrote clean labeled run: $RUNS"
