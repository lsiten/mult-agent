#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '../..');
const RESOURCES_DIR = path.join(__dirname, '../resources');

console.log('🔧 Setting up development environment...\n');

// 1. 创建 resources 目录
if (!fs.existsSync(RESOURCES_DIR)) {
  fs.mkdirSync(RESOURCES_DIR, { recursive: true });
  console.log('✓ Created resources/ directory');
} else {
  console.log('✓ resources/ directory exists');
}

// 2. 清理旧的符号链接或目录
const pythonLink = path.join(RESOURCES_DIR, 'python');
if (fs.existsSync(pythonLink)) {
  const stats = fs.lstatSync(pythonLink);
  if (stats.isSymbolicLink()) {
    fs.unlinkSync(pythonLink);
    console.log('✓ Removed old python symlink');
  } else if (stats.isDirectory()) {
    // 如果是真实目录（从生产模式遗留），警告用户
    console.warn('⚠ Warning: resources/python is a directory, not a symlink');
    console.warn('  This is normal if you ran production build before');
    console.warn('  Removing it...');
    fs.rmSync(pythonLink, { recursive: true, force: true });
  }
}

// 3. 创建 Python 目录结构（用于符号链接）
fs.mkdirSync(pythonLink, { recursive: true });

// 4. 为每个 Python 包创建符号链接
const pythonPackages = [
  'gateway',
  'agent',
  'tools',
  'hermes_cli',
  'cron',
  'environments'
];

const pythonFiles = [
  'cli.py',
  'run_agent.py',
  'mcp_serve.py',
  'hermes_constants.py',
  'hermes_logging.py',
  'hermes_state.py',
  'hermes_time.py',
  'utils.py',
  'toolsets.py',
  'toolset_distributions.py'
];

console.log('\n📦 Linking Python packages...');
pythonPackages.forEach(pkg => {
  const src = path.join(PROJECT_ROOT, pkg);
  const dest = path.join(pythonLink, pkg);

  if (fs.existsSync(src)) {
    if (fs.existsSync(dest)) {
      fs.unlinkSync(dest);
    }
    try {
      fs.symlinkSync(src, dest, 'dir');
      console.log(`  ✓ Linked ${pkg}/`);
    } catch (error) {
      console.error(`  ✗ Failed to link ${pkg}/: ${error.message}`);
    }
  } else {
    console.warn(`  ⚠ Warning: ${pkg}/ not found`);
  }
});

console.log('\n📄 Linking Python files...');
pythonFiles.forEach(file => {
  const src = path.join(PROJECT_ROOT, file);
  const dest = path.join(pythonLink, file);

  if (fs.existsSync(src)) {
    if (fs.existsSync(dest)) {
      fs.unlinkSync(dest);
    }
    try {
      fs.symlinkSync(src, dest, 'file');
      console.log(`  ✓ Linked ${file}`);
    } catch (error) {
      console.error(`  ✗ Failed to link ${file}: ${error.message}`);
    }
  } else {
    console.warn(`  ⚠ Warning: ${file} not found`);
  }
});

// 5. Python Runtime（符号链接或真实目录）
console.log('\n🐍 Setting up Python runtime...');
const pythonRuntimeSrc = path.join(PROJECT_ROOT, 'app/python-runtime');
const pythonRuntimeDest = path.join(RESOURCES_DIR, 'python-runtime');

if (fs.existsSync(pythonRuntimeSrc)) {
  if (fs.existsSync(pythonRuntimeDest)) {
    const stats = fs.lstatSync(pythonRuntimeDest);
    if (stats.isSymbolicLink() || stats.isDirectory()) {
      fs.rmSync(pythonRuntimeDest, { recursive: true, force: true });
    }
  }
  try {
    fs.symlinkSync(pythonRuntimeSrc, pythonRuntimeDest, 'dir');
    console.log('  ✓ Linked python-runtime/');
  } catch (error) {
    console.error(`  ✗ Failed to link python-runtime: ${error.message}`);
  }
} else {
  console.warn('  ⚠ Warning: python-runtime not found at app/python-runtime');
  console.warn('  Please create Python venv:');
  console.warn('    python3 -m venv app/python-runtime');
  console.warn('    app/python-runtime/bin/pip install -r requirements.txt');
}

// 6. Web 前端不需要符号链接（开发时使用 dev server）
console.log('\n🌐 Web frontend setup');
console.log('  ℹ  Web will use Vite dev server: http://localhost:5173');
console.log('  ℹ  Run: cd ../web && npm run dev');

// 7. 验证符号链接
console.log('\n✅ Verifying setup...');
const verifications = [
  { name: 'Python packages', path: path.join(pythonLink, 'gateway') },
  { name: 'Python runtime', path: pythonRuntimeDest }
];

let allGood = true;
verifications.forEach(({ name, path: checkPath }) => {
  if (fs.existsSync(checkPath)) {
    const stats = fs.lstatSync(checkPath);
    if (stats.isSymbolicLink()) {
      console.log(`  ✓ ${name}: symlink OK`);
    } else if (stats.isDirectory()) {
      console.warn(`  ⚠ ${name}: real directory (should be symlink in dev mode)`);
      allGood = false;
    }
  } else {
    console.error(`  ✗ ${name}: not found`);
    allGood = false;
  }
});

if (allGood) {
  console.log('\n✅ Development environment ready!');
} else {
  console.log('\n⚠ Development environment setup completed with warnings');
}

console.log('\n📝 Next steps:');
console.log('  1. Start Vite dev server:  cd ../web && npm run dev');
console.log('  2. Start Electron:         npm run dev:electron');
console.log('\n💡 Tips:');
console.log('  • Python changes take effect on Electron restart (Cmd+R)');
console.log('  • React changes take effect immediately (HMR)');
console.log('  • TypeScript changes trigger auto-restart');
