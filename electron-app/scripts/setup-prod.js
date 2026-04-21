#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '../..');
const RESOURCES_DIR = path.join(__dirname, '../resources');

console.log('📦 Setting up production build...\n');

// 1. 清理旧文件
if (fs.existsSync(RESOURCES_DIR)) {
  console.log('🗑️  Cleaning old resources...');
  fs.removeSync(RESOURCES_DIR);
  console.log('  ✓ Cleaned\n');
}

fs.mkdirSync(RESOURCES_DIR, { recursive: true });

// 2. 复制 Python 源码
console.log('📋 Copying Python source code...');
const pythonDest = path.join(RESOURCES_DIR, 'python');
fs.mkdirSync(pythonDest);

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

pythonPackages.forEach(pkg => {
  const src = path.join(PROJECT_ROOT, pkg);
  const dest = path.join(pythonDest, pkg);

  if (fs.existsSync(src)) {
    fs.copySync(src, dest, {
      filter: (src) => {
        // 排除缓存和测试
        const relativePath = path.relative(PROJECT_ROOT, src);
        return !relativePath.includes('__pycache__') &&
               !relativePath.includes('.pytest_cache') &&
               !relativePath.includes('tests/') &&
               !relativePath.endsWith('.pyc') &&
               !relativePath.endsWith('.pyo');
      }
    });
    console.log(`  ✓ Copied ${pkg}/`);
  } else {
    console.warn(`  ⚠ Warning: ${pkg}/ not found`);
  }
});

pythonFiles.forEach(file => {
  const src = path.join(PROJECT_ROOT, file);
  const dest = path.join(pythonDest, file);

  if (fs.existsSync(src)) {
    fs.copySync(src, dest);
    console.log(`  ✓ Copied ${file}`);
  } else {
    console.warn(`  ⚠ Warning: ${file} not found`);
  }
});

// 3. 复制 Python Runtime
console.log('\n🐍 Copying Python runtime...');
const pythonRuntimeSrc = path.join(PROJECT_ROOT, 'app/python-runtime');
const pythonRuntimeDest = path.join(RESOURCES_DIR, 'python-runtime');

if (fs.existsSync(pythonRuntimeSrc)) {
  fs.copySync(pythonRuntimeSrc, pythonRuntimeDest, {
    filter: (src) => {
      // 排除缓存
      return !src.includes('__pycache__') && !src.endsWith('.pyc');
    }
  });
  console.log('  ✓ Copied python-runtime/');

  // 清理不需要的文件
  console.log('  🧹 Cleaning runtime...');
  const cleanPatterns = [
    path.join(pythonRuntimeDest, 'lib/python*/site-packages/pip'),
    path.join(pythonRuntimeDest, 'lib/python*/site-packages/setuptools'),
    path.join(pythonRuntimeDest, 'lib/python*/site-packages/wheel')
  ];

  const glob = require('glob');
  cleanPatterns.forEach(pattern => {
    const matches = glob.sync(pattern);
    matches.forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.removeSync(dir);
        console.log(`    ✓ Cleaned ${path.basename(dir)}`);
      }
    });
  });

  // 显示最终大小
  const sizeInMB = (getDirSize(pythonRuntimeDest) / (1024 * 1024)).toFixed(1);
  console.log(`  ℹ  Runtime size: ${sizeInMB} MB`);
} else {
  console.error('  ✗ Error: python-runtime not found at app/python-runtime');
  console.error('  Please create Python venv first:');
  console.error('    python3 -m venv app/python-runtime');
  console.error('    app/python-runtime/bin/pip install -r requirements.txt');
  process.exit(1);
}

// 4. 构建并复制 Web 前端
console.log('\n🌐 Building web frontend...');

try {
  // 构建前端
  console.log('  • Running: npm run build:electron');
  execSync('npm run build:electron', {
    stdio: 'inherit',
    cwd: path.join(PROJECT_ROOT, 'web')
  });

  // 复制构建产物
  const webSrc = path.join(PROJECT_ROOT, 'web/dist');
  const webDest = path.join(RESOURCES_DIR, 'web');

  if (fs.existsSync(webSrc)) {
    fs.copySync(webSrc, webDest);
    const sizeInMB = (getDirSize(webDest) / (1024 * 1024)).toFixed(1);
    console.log(`  ✓ Copied web build (${sizeInMB} MB)`);
  } else {
    console.error('  ✗ Error: web/dist not found');
    process.exit(1);
  }
} catch (error) {
  console.error('  ✗ Failed to build web frontend:', error.message);
  process.exit(1);
}

// 5. 复制配置示例
console.log('\n📋 Copying config examples...');
const configDest = path.join(RESOURCES_DIR, 'config');
fs.mkdirSync(configDest);

const configFiles = [
  '.env.example',
  'cli-config.yaml.example'
];

configFiles.forEach(file => {
  const src = path.join(PROJECT_ROOT, file);
  const dest = path.join(configDest, file);

  if (fs.existsSync(src)) {
    fs.copySync(src, dest);
    console.log(`  ✓ Copied ${file}`);
  } else {
    console.warn(`  ⚠ Warning: ${file} not found`);
  }
});

// 6. 复制 skills
console.log('\n🎯 Copying skills...');
const skillsSrc = path.join(PROJECT_ROOT, 'skills');
const skillsDest = path.join(RESOURCES_DIR, 'skills');

if (fs.existsSync(skillsSrc)) {
  fs.copySync(skillsSrc, skillsDest, {
    filter: (src) => {
      return !src.includes('__pycache__') && !src.endsWith('.pyc');
    }
  });
  const sizeInMB = (getDirSize(skillsDest) / (1024 * 1024)).toFixed(1);
  console.log(`  ✓ Copied skills/ (${sizeInMB} MB)`);
} else {
  console.warn('  ⚠ Warning: skills/ directory not found');
}

// 7. 总结
console.log('\n📊 Production build summary:');
const totalSize = getDirSize(RESOURCES_DIR);
const totalMB = (totalSize / (1024 * 1024)).toFixed(1);
console.log(`  Total size: ${totalMB} MB`);

// 分项大小
const items = [
  { name: 'Python code', path: pythonDest },
  { name: 'Python runtime', path: pythonRuntimeDest },
  { name: 'Web frontend', path: path.join(RESOURCES_DIR, 'web') },
  { name: 'Skills', path: skillsDest }
];

items.forEach(({ name, path: itemPath }) => {
  if (fs.existsSync(itemPath)) {
    const sizeMB = (getDirSize(itemPath) / (1024 * 1024)).toFixed(1);
    console.log(`  • ${name}: ${sizeMB} MB`);
  }
});

console.log('\n✅ Production build ready!');
console.log('\nResources directory:');
console.log(`  ${RESOURCES_DIR}`);
console.log('\n📝 Next step:');
console.log('  npm run package:mac');

// Helper function to get directory size
function getDirSize(dirPath) {
  let size = 0;

  if (!fs.existsSync(dirPath)) {
    return 0;
  }

  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      size += getDirSize(filePath);
    } else {
      size += stats.size;
    }
  });

  return size;
}
