// SKELETON: Shared Vite, Tailwind, alias, and PWA configuration.
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // Keep the standard generated Workbox worker and add the shared push/click handlers.
      workbox: { importScripts: ["/clearflow-push-sw.js"] },
      includeAssets: ["icon.svg"],
      manifest: {
        name: "ClearFlow Workspace",
        short_name: "ClearFlow",
        description: "A reusable workspace platform with secure sign-in and modular features.",
        theme_color: "#020617",
        background_color: "#020617",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": projectRoot,
    },
  },
});
