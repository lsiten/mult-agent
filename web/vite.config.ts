import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Electron environment adaptation: file:// protocol requires relative paths
  base: process.env.ELECTRON ? './' : '/',

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  build: {
    outDir: process.env.ELECTRON
      ? '../electron-app/dist/renderer'
      : '../hermes_cli/web_dist',
    emptyOutDir: true,
  },

  server: {
    proxy: {
      "/api": "http://127.0.0.1:8642",
    },
  },
});
