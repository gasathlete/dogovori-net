# Security check: flagged package and site headers (read-only)

Nothing was changed. The publication check found no problems: the live site serves deployment a26860c8, the new script, and no `unsafe-eval`.

## 1. @lovable.dev/mcp-js 0.20.1 (flagged Medium)
- The scanner reports GHSA-67mh-4wv8-2f99: esbuild, moderate, affects esbuild <=0.24.2, fixed in versions above 0.24.2.
- That advisory does not apply to the installed copy. The project's package list pins this package's esbuild to **0.27.7**, which is newer than 0.24.2. The scanner seems to match only the declared range, not the installed version.
- The advisory that does apply to 0.27.7 is **GHSA-g7r4-m6w7-qqqr**: esbuild, low severity, affects >=0.27.3 and <0.28.1, fixed in 0.28.1. It only matters for a development server running on Windows.
- Where it is used: only in `vite.config.ts` (the `mcpPlugin` step that runs while building the site), plus the app's MCP tools and the `mcp` server function. esbuild itself is not shipped to visitors' browsers.
- No fix from the package maker: the newest mcp-js releases (3.0.4 and 0.29.0-rc.x) still require esbuild ^0.27.0. The only option is to force esbuild >=0.28.1 for this one package. That is untested; it needs a lock update, a build and the tests.

## 2. Security headers the live site actually sends (dogovori.net)
- Sent: `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`.
- Not sent: `Content-Security-Policy`, `X-Frame-Options`, `Permissions-Policy`.
- The content security policy exists only as a tag inside the page's HTML. A page tag cannot restrict framing (`frame-ancestors`), so framing protection is effectively missing.
- `public/_headers` is ignored by the hosting.

## Blockers
- Headers: I found no project setting or tool here that controls which headers the hosting sends. The missing headers need a hosting-level feature or a proxy in front of the site; source code cannot add them.
- Package: fixing it needs a package install and a build, which were not allowed in this check.
