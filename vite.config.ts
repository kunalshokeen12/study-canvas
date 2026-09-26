import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Vite `base` must be '/study-canvas/' for GitHub Pages project hosting
// (see PLAN.md section 8). Overridable via VITE_BASE for local dev/preview.
const base = process.env["VITE_BASE"] ?? "/";

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Study Canvas",
        short_name: "Study Canvas",
        description: "Handwriting notebook with an Ask Claude tool, for S Pen tablets.",
        display: "fullscreen",
        display_override: ["fullscreen", "standalone"],
        orientation: "any",
        theme_color: "#1a1a2e",
        background_color: "#1a1a2e",
        start_url: base,
        scope: base,
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
      },
    }),
  ],
});
