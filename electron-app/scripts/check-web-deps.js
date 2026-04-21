#!/usr/bin/env node
/**
 * Check if web dependencies are installed
 * Used by npm start to ensure web/node_modules exists
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const webPath = path.join(__dirname, '..', '..', 'web');
const nodeModulesPath = path.join(webPath, 'node_modules');

console.log('[check-web-deps] Checking web dependencies...');

// Check if node_modules exists
if (!fs.existsSync(nodeModulesPath)) {
  console.log('[check-web-deps] node_modules not found, running npm install...');

  try {
    // Run npm install in web directory
    execSync('npm install', {
      cwd: webPath,
      stdio: 'inherit'
    });

    console.log('[check-web-deps] Web dependencies installed successfully');
  } catch (error) {
    console.error('[check-web-deps] Failed to install web dependencies:', error.message);
    process.exit(1);
  }
} else {
  console.log('[check-web-deps] Web dependencies already installed');
}
