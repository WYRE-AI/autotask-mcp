import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Bundles ui/index.html + ui/ticket-card.ts into a single self-contained
// HTML file at ui/dist/index.html, which scripts/embed-ui.mjs then embeds as
// src/generated/ticket-card-html.ts. Single-file is required: the MCP Apps
// host fetches one HTML string via resources/read, so all JS/CSS must be
// inlined.
export default defineConfig({
  root: "ui",
  plugins: [viteSingleFile()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
    assetsInlineLimit: 100000000,
  },
});
