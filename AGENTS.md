# Project architecture rules

- Sector packages are curated browse-only compositions over canonical catalog templates; never duplicate legal document text or create a purchase path from browser-provided content.
- Featured kit lifecycle metadata must reference every existing kit item exactly once; missing closing artifacts stay explicitly planned and unlinked.
- Home must not import the full catalog (templateIndex/CATALOG); use declared metadata guarded by a test against the canonical catalog — keeps the home bundle small without silent count drift.
- The hero LCP poster lives in public/hero with a path-scoped preload in index.html; keep component srcset and preload identical so the image is discovered before JS.
