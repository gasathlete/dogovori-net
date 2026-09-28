#!/usr/bin/env bash
# Reproducible local Lighthouse baseline: production build served by `vite preview`.
# Usage: LH=/path/to/lighthouse scripts/perf/lighthouse-median.sh <label> [routes...]
# Needs a running `bunx vite preview --port 4173 --strictPort` over dist/.
set -euo pipefail
LABEL="$1"; shift
ROUTES=("${@:-/}")
LH="${LH:-lighthouse}"
OUT="reports/perf/$LABEL"; mkdir -p "$OUT"
for route in "${ROUTES[@]}"; do
  for form in mobile desktop; do
    for run in 1 2 3; do
      name="$(echo "$route" | tr '/' '_')_${form}_$run"
      extra=(); [ "$form" = desktop ] && extra=(--preset=desktop)
      CHROME_PATH="${CHROME_PATH:-/bin/chromium}" "$LH" "http://localhost:4173$route" "${extra[@]}" \
        --only-categories=performance --chrome-flags="--headless=new --no-sandbox" \
        --output=json --output-path="/tmp/lh_$name.json" --quiet || true
      node -e '
const r=require(process.argv[1]);const a=r.audits;
const bytes=t=>(a["resource-summary"]?.details?.items||[]).find(i=>i.resourceType===t)?.transferSize||0;
console.log(JSON.stringify({route:process.argv[2],form:process.argv[3],run:+process.argv[4],
score:Math.round((r.categories.performance.score||0)*100),
fcp:Math.round(a["first-contentful-paint"].numericValue),lcp:Math.round(a["largest-contentful-paint"].numericValue),
tbt:Math.round(a["total-blocking-time"].numericValue),cls:+a["cumulative-layout-shift"].numericValue.toFixed(3),
si:Math.round(a["speed-index"].numericValue),jsKB:Math.round(bytes("script")/1024),imgKB:Math.round(bytes("image")/1024),
totalKB:Math.round(bytes("total")/1024)}))' "/tmp/lh_$name.json" "$route" "$form" "$run" >> "$OUT/runs.jsonl"
    done
  done
done
echo "wrote $OUT/runs.jsonl"
