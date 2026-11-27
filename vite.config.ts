import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";


// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mcpPlugin(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  esbuild: mode === "production" ? { drop: ["console", "debugger"] } : undefined,
  build: {
    sourcemap: false,
    cssCodeSplit: true,
    // Modern browsers (our baseline) support <link rel="modulepreload"> natively.
    // Skipping the polyfill shaves ~2KB off the entry chunk.
    modulePreload: { polyfill: false },
    // Slightly higher warning threshold — pdf/docx route chunks are intentionally large
    // but lazy-loaded only on export, so they don't affect first paint.
    // Pdf/docx/recharts route chunks are intentionally large but lazy-loaded only on
    // export, so they don't affect first paint. Bumped to 1500 to silence noise while
    // still flagging genuinely runaway chunks.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Split heavy vendor libs into their own chunks for better caching + parallel download.
        // Each group changes infrequently, so users keep them cached across deploys.
        // NOTE: lucide-react intentionally excluded — letting Rollup tree-shake it per-route
        // is significantly smaller than bundling every icon into a single vendor chunk.
        manualChunks(id) {
          // Vite/Rollup runtime helpers (`__vitePreload`, CJS interop). Without
          // pinning them, Rollup can park them inside a heavy lazy chunk
          // (jspdf/docx), which forces that 1.4 MB chunk to load on first paint.
          if (
            id.includes("vite/preload-helper") ||
            id.includes("commonjsHelpers") ||
            id.includes("vite/modulepreload-polyfill")
          ) {
            return "vendor-react";
          }
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
          // NOTE: do NOT split recharts/d3 into a separate chunk — its internal
          // circular deps cause "Cannot access 'X' before initialization" TDZ
          // errors at runtime when Rollup splits them across chunks.
          if (/[\\/]@sentry[\\/]/.test(id)) return "vendor-sentry";
          if (/[\\/]@stripe[\\/]/.test(id)) return "vendor-stripe";
          if (/[\\/](date-fns|dayjs)[\\/]/.test(id)) return "vendor-date";
          if (/[\\/](zod|react-hook-form|@hookform)[\\/]/.test(id)) return "vendor-forms";
          if (/[\\/]framer-motion[\\/]/.test(id)) return "vendor-motion";
        },
      },
    },
  },
}));
