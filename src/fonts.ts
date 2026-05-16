/**
 * Self-hosted fonts (replaces Google Fonts CDN).
 * Vite bundles the WOFF2 files into /assets and serves them gzipped from our own origin.
 *
 * Trimmed to weights actually used in the UI (audited via grep of font-* utilities):
 *   - 400 (default body)
 *   - 500 (medium — used by `font-medium` utility)
 *   - 600 (semibold — used by `font-semibold` utility, most CTAs/labels)
 *   - 700 (bold — used by `font-bold` utility, headings)
 * Removed 300 (no `font-light` usage in the codebase).
 *
 * Subsets:
 * - IBM Plex Sans: cyrillic + latin (Bulgarian UI body text)
 * - Libre Baskerville: latin only (no Cyrillic subset exists; Bulgarian headings fall back to Georgia)
 */

/* IBM Plex Sans — cyrillic */
import "@fontsource/ibm-plex-sans/cyrillic-400.css";
import "@fontsource/ibm-plex-sans/cyrillic-500.css";
import "@fontsource/ibm-plex-sans/cyrillic-600.css";
import "@fontsource/ibm-plex-sans/cyrillic-700.css";

/* IBM Plex Sans — latin */
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";

/* Libre Baskerville — latin only */
import "@fontsource/libre-baskerville/latin-400.css";
import "@fontsource/libre-baskerville/latin-700.css";
