#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');

const ELECTRON_APP_ROOT = path.join(__dirname, '..');

const itemsToClean = [
  { name: 'TypeScript build', path: path.join(ELECTRON_APP_ROOT, 'dist') },
  { name: 'Resources', path: path.join(ELECTRON_APP_ROOT, 'resources') },
  { name: 'Release builds', path: path.join(ELECTRON_APP_ROOT, 'release') },
  { name: 'Web dist', path: path.join(ELECTRON_APP_ROOT, '../web/dist') }
];

console.log('🧹 Cleaning Electron app...\n');

let cleaned = 0;
let failed = 0;

itemsToClean.forEach(({ name, path: itemPath }) => {
  if (fs.existsSync(itemPath)) {
    try {
      fs.removeSync(itemPath);
      console.log(`✓ Cleaned ${name}`);
      cleaned++;
    } catch (error) {
      console.error(`✗ Failed to clean ${name}: ${error.message}`);
      failed++;
    }
  } else {
    console.log(`· ${name} does not exist`);
  }
});

console.log(`\n✅ Done: ${cleaned} cleaned, ${failed} failed`);

if (cleaned > 0) {
  console.log('\n💡 Next steps:');
  console.log('  • For development: npm run setup:dev && npm run dev');
  console.log('  • For production:  npm run build:all && npm run package:mac');
}
