# Dogovori Icons

Custom icon set built to match the corporate-minimalist theme of dogovori.net. 100% API-compatible with `lucide-react`.

## Design tokens
- 24×24 viewBox, `stroke="currentColor"`, `fill="none"`
- Default `strokeWidth = 1.75` (finer than Lucide's 2 for a legal/premium feel)
- `strokeLinecap`/`strokeLinejoin` = `round`
- Accepts every Lucide prop: `size`, `color`, `strokeWidth`, `absoluteStrokeWidth`, `className`

## Migration (zero-risk)
Change the import path only:

```diff
- import { Sparkles, ShieldCheck } from "lucide-react";
+ import { Sparkles, ShieldCheck } from "@/icons";
```

Icons that we have not yet redrawn fall through to `lucide-react`, so a partial
migration never breaks the build or the UI.

## Adding a new icon
1. Create `src/icons/MyIcon.tsx` using `createIcon("my-icon", <>…</>)`.
2. Re-export it from `src/icons/index.ts` **after** the `export * from "lucide-react"` line so it overrides the fallback.
