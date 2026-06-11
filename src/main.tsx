import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./fonts.ts";
import "./index.css";
import "./i18n";

// Strip prerendered JSON-LD blocks before React/Helmet mounts its own copies.
// Without this, /shablon, /kategoria, /ai, /karta etc. would emit duplicate
// structured data (the SSG copy + the runtime copy) and Google Search Console
// flags it as "Duplicate field FAQPage" — disqualifying the page from rich results.
document
  .querySelectorAll('script[type="application/ld+json"][data-prerendered="true"]')
  .forEach((el) => el.remove());

createRoot(document.getElementById("root")!).render(<App />);
