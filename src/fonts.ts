/**
 * Self-hosted fonts (replaces Google Fonts CDN).
 * Vite bundles the WOFF2 files into /assets and serves them gzipped from our own origin.
 * Removes 2 external requests + DNS/TLS to fonts.googleapis.com & fonts.gstatic.com (~100-200ms).
 *
 * Subsets:
 * - IBM Plex Sans: cyrillic + latin (Bulgarian UI body text)
 * - Libre Baskerville: latin only (no Cyrillic subset exists; Bulgarian headings fall back to Georgia)
 */

/* IBM Plex Sans — cyrillic */
import "@fontsource/ibm-plex-sans/cyrillic-300.css";
import "@fontsource/ibm-plex-sans/cyrillic-400.css";
import "@fontsource/ibm-plex-sans/cyrillic-500.css";
import "@fontsource/ibm-plex-sans/cyrillic-600.css";
import "@fontsource/ibm-plex-sans/cyrillic-700.css";

/* IBM Plex Sans — latin */
import "@fontsource/ibm-plex-sans/latin-300.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";

/* Libre Baskerville — latin only */
import "@fontsource/libre-baskerville/latin-400.css";
import "@fontsource/libre-baskerville/latin-400-italic.css";
import "@fontsource/libre-baskerville/latin-700.css";
