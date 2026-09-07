import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "local-development-csp",
      apply: "serve",
      // Vite's development-only refresh preamble is inline. Keep the strict
      // CSP in the production build; let the local dev server inject HMR.
      transformIndexHtml: {
        order: "pre",
        handler: (html) =>
          html.replace(
            /<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/,
            "",
          ),
      },
    },
  ],
});
