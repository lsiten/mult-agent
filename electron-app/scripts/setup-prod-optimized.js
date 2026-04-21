#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { execSync, exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const PROJECT_ROOT = path.join(__dirname, '../..');
const RESOURCES_DIR = path.join(__dirname, '../resources');

console.log('📦 Setting up production build (optimized)...\n');

// 计时开始
const startTime = Date.now();

// 并行任务队列
const tasks = [];

// Task 1: 复制 Python 源码
tasks.push((async () => {
  console.log('📋 Copying Python source code...');
  const pythonDest = path.join(RESOURCES_DIR, 'python');

  // 创建目标目录
  await fs.ensureDir(pythonDest);

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

  // 使用 rsync 增量复制 (如果可用)
  try {
    // 检查 rsync 是否可用
    execSync('which rsync', { stdio: 'ignore' });

    // 使用 rsync 增量复制
    for (const pkg of pythonPackages) {
      const src = path.join(PROJECT_ROOT, pkg);
      if (fs.existsSync(src)) {
        execSync(
          `rsync -a --delete --exclude='__pycache__' --exclude='*.pyc' --exclude='tests/' "${src}/" "${path.join(pythonDest, pkg)}/"`
        );
        console.log(`  ✓ Synced ${pkg}/ (rsync)`);
      }
    }

    // 复制文件
    for (const file of pythonFiles) {
      const src = path.join(PROJECT_ROOT, file);
      if (fs.existsSync(src)) {
        await fs.copy(src, path.join(pythonDest, file));
        console.log(`  ✓ Copied ${file}`);
      }
    }
  } catch (error) {
    // rsync 不可用，回退到 fs.copy
    console.log('  ⚠ rsync not available, using fs.copy');

    for (const pkg of pythonPackages) {
      const src = path.join(PROJECT_ROOT, pkg);
      if (fs.existsSync(src)) {
        await fs.copy(src, path.join(pythonDest, pkg), {
          filter: (src) => {
            const relativePath = path.relative(PROJECT_ROOT, src);
            return !relativePath.includes('__pycache__') &&
                   !relativePath.includes('.pytest_cache') &&
                   !relativePath.includes('tests/') &&
                   !relativePath.endsWith('.pyc');
          }
        });
        console.log(`  ✓ Copied ${pkg}/`);
      }
    }

    for (const file of pythonFiles) {
      const src = path.join(PROJECT_ROOT, file);
      if (fs.existsSync(src)) {
        await fs.copy(src, path.join(pythonDest, file));
        console.log(`  ✓ Copied ${file}`);
      }
    }
  }

  return { name: 'Python code', path: pythonDest };
})());

// Task 2: 复制 Python Runtime
tasks.push((async () => {
  console.log('\n🐍 Copying Python runtime...');
  const pythonRuntimeSrc = path.join(PROJECT_ROOT, 'app/python-runtime');
  const pythonRuntimeDest = path.join(RESOURCES_DIR, 'python-runtime');

  if (!fs.existsSync(pythonRuntimeSrc)) {
    throw new Error('python-runtime not found');
  }

  await fs.copy(pythonRuntimeSrc, pythonRuntimeDest, {
    filter: (src) => !src.includes('__pycache__') && !src.endsWith('.pyc')
  });

  console.log('  ✓ Copied python-runtime/');

  // 清理不需要的包
  console.log('  🧹 Cleaning runtime...');
  const glob = require('glob');
  const cleanPatterns = [
    path.join(pythonRuntimeDest, 'lib/python*/site-packages/pip'),
    path.join(pythonRuntimeDest, 'lib/python*/site-packages/setuptools'),
    path.join(pythonRuntimeDest, 'lib/python*/site-packages/wheel'),
    path.join(pythonRuntimeDest, 'lib/python*/site-packages/*/tests'),
    path.join(pythonRuntimeDest, 'lib/python*/site-packages/*/*.so.dSYM')
  ];

  for (const pattern of cleanPatterns) {
    const matches = glob.sync(pattern);
    for (const dir of matches) {
      if (fs.existsSync(dir)) {
        await fs.remove(dir);
        console.log(`    ✓ Cleaned ${path.basename(dir)}`);
      }
    }
  }

  const sizeInMB = (await getDirSize(pythonRuntimeDest) / (1024 * 1024)).toFixed(1);
  console.log(`  ℹ  Runtime size: ${sizeInMB} MB`);

  return { name: 'Python runtime', path: pythonRuntimeDest };
})());

// Task 3: 构建 Web 前端
tasks.push((async () => {
  console.log('\n🌐 Building web frontend...');

  const webSrc = path.join(PROJECT_ROOT, 'web/dist');
  const webDest = path.join(RESOURCES_DIR, 'web');

  // 构建前端
  console.log('  • Running: npm run build:electron');
  await execAsync('npm run build:electron', {
    cwd: path.join(PROJECT_ROOT, 'web')
  });

  // 复制构建产物
  if (fs.existsSync(webSrc)) {
    await fs.copy(webSrc, webDest);
    const sizeInMB = (await getDirSize(webDest) / (1024 * 1024)).toFixed(1);
    console.log(`  ✓ Copied web build (${sizeInMB} MB)`);
  } else {
    throw new Error('web/dist not found');
  }

  return { name: 'Web frontend', path: webDest };
})());

// Task 4: 复制 Skills
tasks.push((async () => {
  console.log('\n🎯 Copying skills...');
  const skillsSrc = path.join(PROJECT_ROOT, 'skills');
  const skillsDest = path.join(RESOURCES_DIR, 'skills');

  if (fs.existsSync(skillsSrc)) {
    await fs.copy(skillsSrc, skillsDest, {
      filter: (src) => !src.includes('__pycache__') && !src.endsWith('.pyc')
    });
    const sizeInMB = (await getDirSize(skillsDest) / (1024 * 1024)).toFixed(1);
    console.log(`  ✓ Copied skills/ (${sizeInMB} MB)`);
    return { name: 'Skills', path: skillsDest };
  } else {
    console.warn('  ⚠ Warning: skills/ directory not found');
    return { name: 'Skills', path: null };
  }
})());

// 执行所有任务并行
(async () => {
  try {
    // 清理旧文件
    if (fs.existsSync(RESOURCES_DIR)) {
      console.log('🗑️  Cleaning old resources...');
      await fs.remove(RESOURCES_DIR);
      console.log('  ✓ Cleaned\n');
    }

    await fs.ensureDir(RESOURCES_DIR);

    // 并行执行所有任务
    const results = await Promise.all(tasks);

    // 复制配置示例
    console.log('\n📋 Copying config examples...');
    const configDest = path.join(RESOURCES_DIR, 'config');
    await fs.ensureDir(configDest);

    const configFiles = ['.env.example', 'cli-config.yaml.example'];
    for (const file of configFiles) {
      const src = path.join(PROJECT_ROOT, file);
      if (fs.existsSync(src)) {
        await fs.copy(src, path.join(configDest, file));
        console.log(`  ✓ Copied ${file}`);
      }
    }

    // 总结
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n📊 Production build summary:');
    console.log(`  Build time: ${elapsed}s`);

    const totalSize = await getDirSize(RESOURCES_DIR);
    const totalMB = (totalSize / (1024 * 1024)).toFixed(1);
    console.log(`  Total size: ${totalMB} MB`);

    // 分项大小
    for (const result of results) {
      if (result.path && fs.existsSync(result.path)) {
        const sizeMB = (await getDirSize(result.path) / (1024 * 1024)).toFixed(1);
        console.log(`  • ${result.name}: ${sizeMB} MB`);
      }
    }

    console.log('\n✅ Production build ready!');
    console.log(`\n📝 Next step: npm run package:mac`);

  } catch (error) {
    console.error('\n✗ Build failed:', error.message);
    process.exit(1);
  }
})();

// Helper function to get directory size
async function getDirSize(dirPath) {
  let size = 0;

  if (!fs.existsSync(dirPath)) {
    return 0;
  }

  const files = await fs.readdir(dirPath);

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = await fs.stat(filePath);

    if (stats.isDirectory()) {
      size += await getDirSize(filePath);
    } else {
      size += stats.size;
    }
  }

  return size;
}
