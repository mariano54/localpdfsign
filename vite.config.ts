import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
  server: { host: "127.0.0.1", port: 5178, strictPort: true },
  preview: { host: "127.0.0.1", port: 4178, strictPort: true },
  // Discover worker-only dependencies before a PDF is selected. Late
  // optimization otherwise reloads the page during the first export.
  optimizeDeps: { include: ["@libpdf/core", "asn1js", "pkijs"] },
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
