"""Capture the real rendered Header + Hero of "/" from a production preview
(`bunx vite preview --port 4173`) into scripts/generated/home-shell.html.

scripts/prerender.ts injects it into dist/index.html so the first paint is the
same header/hero React renders a moment later (createRoot replaces it with an
identical tree). Re-run after changing Header/Hero; src/test/homeShell.test.tsx
fails when the stored headline/CTA drift from the live components.
Usage: python3 scripts/perf/capture-home-shell.py [base_url]
"""
import asyncio, re, sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173"
OUT = Path(__file__).resolve().parents[1] / "generated" / "home-shell.html"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, reduced_motion="reduce")
        pg = await ctx.new_page()
        await pg.goto(BASE + "/", wait_until="networkidle")
        html = await pg.evaluate("""() => {
          const header = document.querySelector('header').cloneNode(true);
          const hero = document.querySelector('main > section').cloneNode(true);
          // Session/state-dependent bits are never baked in: no video, no account menu state.
          hero.querySelectorAll('video, button[aria-pressed]').forEach((e) => e.remove());
          return header.outerHTML + '\\n<!--hero-->\\n' + hero.outerHTML;
        }""")
        await b.close()
    html = re.sub(r'\s(data-state|aria-expanded|aria-controls|data-radix[\w-]*)="[^"]*"', "", html)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html + "\n", encoding="utf-8")
    print("wrote", OUT, len(html), "chars")

asyncio.run(main())
