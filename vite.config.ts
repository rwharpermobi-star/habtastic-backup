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
    allowedHosts: true,
    hmr: {
      overlay: false,
    },
  },
  preview: {
    host: "::",
    port: 8080,
    allowedHosts: true,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mode === "development" && {
      name: "habtastic-dev-iframe-preview",
      transformIndexHtml(html: string) {
        // Keep index.html clickjacking guard untouched in source & production builds,
        // while allowing embedded dev preview iframes during local development.
        return html.replace("if (window.top === window.self) return;", "return;");
      },
    },
    mcpPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Keep manual chunks explicit. Without this, Rollup may absorb shared
        // transitive dependencies into a manual vendor chunk. A shared helper
        // pulled into supabase-vendor can then make the entry chunk statically
        // import the entire Supabase client even though getSupabase() uses a
        // dynamic import. Explicit chunks preserve the post-first-paint split.
        onlyExplicitManualChunks: true,
        manualChunks: {
          // Shared className helpers used by the app shell AND by recharts.
          // Without their own chunk, Rollup parks `clsx` inside charts-vendor
          // and the entry chunk then statically imports the whole Recharts
          // bundle (~374 kB) on every cold start. Keep this group first.
          // Babel's tiny `_extends` helper is shared by the app shell and by
          // Recharts' animation deps; left alone, Rollup puts it in
          // charts-vendor and every cold start preloads all of Recharts.
          "utils-vendor": [
            "clsx",
            "tailwind-merge",
            "class-variance-authority",
            "@babel/runtime/helpers/esm/extends",
          ],
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          // The app shell needs tooltips, but dialogs, menus and form controls
          // can load with their routes instead of every cold start.
          "tooltip-vendor": ["@radix-ui/react-tooltip"],
          "ui-vendor": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-tabs",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
          ],
          "motion-vendor": ["framer-motion"],
          "supabase-vendor": ["@supabase/supabase-js"],
          "query-vendor": ["@tanstack/react-query"],
          "i18n-vendor": ["i18next", "react-i18next"],
          "charts-vendor": ["recharts"],
        },
      },
    },
  },
}));
