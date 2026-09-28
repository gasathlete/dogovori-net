/**
 * Self-hosted variable fonts (replaces Google Fonts CDN).
 * Vite bundles the WOFF2 files into /assets and serves them from our own origin.
 *
 * One variable file per required script/style covers every real weight used by
 * the UI (400/500/600/700), instead of one request per weight.
 *
 * Subsets:
 * - IBM Plex Sans: cyrillic + latin (Bulgarian UI body text)
 * - Libre Baskerville: latin only (no Cyrillic subset exists; Bulgarian headings fall back to Georgia)
 */

/* Unicode ranges make browsers fetch only Cyrillic + Latin on Bulgarian pages. */
import "@fontsource-variable/ibm-plex-sans/wght.css";

/* Headings use normal and italic styles (the emphasized hero word is italic). */
import "@fontsource-variable/libre-baskerville/wght.css";
import "@fontsource-variable/libre-baskerville/wght-italic.css";
