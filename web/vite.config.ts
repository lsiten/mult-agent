import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import os from "os";
import path from "path";

function defaultHermesHome() {
  if (process.env.HERMES_HOME) return process.env.HERMES_HOME;
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "hermes-agent-electron");
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || os.homedir(), "hermes-agent-electron");
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "hermes-agent-electron");
}

function readGatewayToken() {
  try {
    return fs.readFileSync(path.join(defaultHermesHome(), ".gateway-token"), "utf-8").trim();
  } catch {
    return "";
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "inject-hermes-session-token",
      transformIndexHtml(html) {
        const token = readGatewayToken();
        if (!token) return html;
        const snippet = `<script>window.__HERMES_SESSION_TOKEN__=${JSON.stringify(token)};</script>`;
        return html.includes("</head>") ? html.replace("</head>", `  ${snippet}\n</head>`) : `${snippet}\n${html}`;
      },
    },
  ],

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
      "/api": {
        target: "http://127.0.0.1:8642",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (proxyReq) => {
            const token = readGatewayToken();
            if (token && !proxyReq.hasHeader("Authorization")) {
              proxyReq.setHeader("Authorization", `Bearer ${token}`);
            }
          });
        },
      },
    },
  },
});
