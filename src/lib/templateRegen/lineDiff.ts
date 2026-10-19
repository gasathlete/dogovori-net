/** Минимален line-based unified diff (LCS) — за per-template сравнение оригинал/кандидат. */
export function lineDiff(a: string, b: string): string {
  const x = a.split("\n"), y = b.split("\n");
  const n = x.length, m = y.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const out: string[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { out.push(`  ${x[i]}`); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push(`- ${x[i++]}`);
    else out.push(`+ ${y[j++]}`);
  }
  while (i < n) out.push(`- ${x[i++]}`);
  while (j < m) out.push(`+ ${y[j++]}`);
  return out.join("\n");
}
