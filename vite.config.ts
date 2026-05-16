import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    sourcemap: false,
    cssCodeSplit: true,
    // Modern browsers (our baseline) support <link rel="modulepreload"> natively.
    // Skipping the polyfill shaves ~2KB off the entry chunk.
    modulePreload: { polyfill: false },
    // Slightly higher warning threshold — pdf/docx route chunks are intentionally large
    // but lazy-loaded only on export, so they don't affect first paint.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Split heavy vendor libs into their own chunks for better caching + parallel download.
        // Each group changes infrequently, so users keep them cached across deploys.
        // NOTE: lucide-react intentionally excluded — letting Rollup tree-shake it per-route
        // is significantly smaller than bundling every icon into a single vendor chunk.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return "vendor-react";
          }
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("@tanstack")) return "vendor-query";
          if (id.includes("@radix-ui")) return "vendor-radix";
          // Heavy export libs — only loaded inside src/lib/exporters.ts &
          // templateExporter.ts, which themselves live behind lazy routes.
          if (/[\\/](jspdf|pdfjs-dist|mammoth)[\\/]/.test(id)) return "vendor-pdf";
          if (/[\\/](docx|file-saver)[\\/]/.test(id)) return "vendor-docx";
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
          if (/[\\/]@sentry[\\/]/.test(id)) return "vendor-sentry";
          if (/[\\/]@stripe[\\/]/.test(id)) return "vendor-stripe";
        },
      },
    },
  },
}));
