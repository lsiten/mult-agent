import { defineConfig } from 'wxt'

export default defineConfig({
  extensionApi: 'chrome',
  react: true,
  manifest: {
    name: 'Page Agent (MCP)',
    version: '1.0.0',
    description: 'AI-powered browser automation with MCP integration',
    permissions: ['storage', 'tabs', 'activeTab', 'scripting', 'sidePanel'],
    host_permissions: ['<all_urls>'],
    action: {
      default_popup: 'popup.html',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    background: {
      service_worker: 'background.js',
      type: 'module',
    },
  },
  build: {
    outDir: './dist',
    sourcemap: true,
    minify: true,
  },
})
