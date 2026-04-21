import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export class DataMigration {
  private oldPaths = [
    // 可能的旧版本路径（按优先级排序）
    path.join(app.getPath('home'), 'Library/Application Support/hermes-electron/config'),
    path.join(app.getPath('home'), 'Library/Application Support/hermes-agent-electron'),
  ];

  private newPath = app.getPath('userData');

  private criticalFiles = [
    'state.db',
    'state.db-shm',
    'state.db-wal',
    'config.yaml',
    '.env',
    'gateway_state.json',
    'channel_directory.json',
    'environments.yaml',
    'gateway_config.yaml',
    'models_dev_cache.json',
    'permissions.db',
    'response_store.db',
    'response_store.db-shm',
    'response_store.db-wal',
    'SOUL.md',
    '.skills_prompt_snapshot.json',
  ];

  private criticalDirs = [
    'skills',
    'cron',
    'logs',
    'sessions',
    'memories',
    'platforms',
    'sandboxes',
    'screenshots',
    'workspace',
    'bin',
    'tmp',
  ];

  /**
   * 检查是否需要迁移
   */
  public needsMigration(): { needed: boolean; oldPath?: string; reason?: string } {
    // 如果新路径已有 state.db 且有数据，说明已经初始化或迁移过
    const stateDbPath = path.join(this.newPath, 'state.db');
    if (fs.existsSync(stateDbPath)) {
      try {
        const stats = fs.statSync(stateDbPath);
        // 如果 state.db 大于 100KB，认为有数据
        if (stats.size > 100 * 1024) {
          return { needed: false, reason: 'New path already has data' };
        }
      } catch (error) {
        console.error('[DataMigration] Error checking new state.db:', error);
      }
    }

    // 检查旧路径是否有数据
    for (const oldPath of this.oldPaths) {
      if (!fs.existsSync(oldPath)) {
        continue;
      }

      const oldStateDb = path.join(oldPath, 'state.db');
      if (fs.existsSync(oldStateDb)) {
        try {
          const stats = fs.statSync(oldStateDb);
          // 如果旧 state.db 大于 100KB，说明有历史数据需要迁移
          if (stats.size > 100 * 1024) {
            return {
              needed: true,
              oldPath,
              reason: `Found data in old path (${(stats.size / 1024).toFixed(0)}KB)`
            };
          }
        } catch (error) {
          console.error(`[DataMigration] Error checking old state.db at ${oldPath}:`, error);
        }
      }
    }

    return { needed: false, reason: 'No old data found' };
  }

  /**
   * 执行迁移
   */
  public async migrate(): Promise<{ success: boolean; error?: string; migrated?: number }> {
    try {
      const check = this.needsMigration();

      console.log(`[DataMigration] Migration check: ${check.reason}`);

      if (!check.needed || !check.oldPath) {
        return { success: true, migrated: 0 };
      }

      console.log(`[DataMigration] Starting migration from ${check.oldPath} to ${this.newPath}`);

      // 确保新路径存在
      if (!fs.existsSync(this.newPath)) {
        fs.mkdirSync(this.newPath, { recursive: true });
      }

      let migratedCount = 0;

      // 复制关键文件
      for (const file of this.criticalFiles) {
        const srcPath = path.join(check.oldPath, file);
        const dstPath = path.join(this.newPath, file);

        if (fs.existsSync(srcPath)) {
          // 如果目标文件已存在，比较大小，保留较大的
          if (fs.existsSync(dstPath)) {
            const srcStats = fs.statSync(srcPath);
            const dstStats = fs.statSync(dstPath);

            if (srcStats.size > dstStats.size) {
              fs.copyFileSync(srcPath, dstPath);
              console.log(`[DataMigration] Replaced ${file} (src: ${srcStats.size}, dst: ${dstStats.size})`);
              migratedCount++;
            } else {
              console.log(`[DataMigration] Skipped ${file} (dst is larger or equal)`);
            }
          } else {
            fs.copyFileSync(srcPath, dstPath);
            console.log(`[DataMigration] Copied ${file}`);
            migratedCount++;
          }
        }
      }

      // 复制关键目录
      for (const dir of this.criticalDirs) {
        const srcDir = path.join(check.oldPath, dir);
        const dstDir = path.join(this.newPath, dir);

        if (fs.existsSync(srcDir)) {
          if (!fs.existsSync(dstDir)) {
            this.copyDirRecursive(srcDir, dstDir);
            console.log(`[DataMigration] Copied ${dir}/`);
            migratedCount++;
          } else {
            // 目录已存在，合并内容
            const merged = this.mergeDirs(srcDir, dstDir);
            if (merged > 0) {
              console.log(`[DataMigration] Merged ${merged} files from ${dir}/`);
              migratedCount += merged;
            }
          }
        }
      }

      // 创建迁移标记文件
      const migrationMarker = path.join(this.newPath, '.migrated_from');
      const migrationInfo = {
        from: check.oldPath,
        to: this.newPath,
        timestamp: new Date().toISOString(),
        filesCount: migratedCount,
      };
      fs.writeFileSync(migrationMarker, JSON.stringify(migrationInfo, null, 2));

      console.log(`[DataMigration] Migration completed: ${migratedCount} items migrated`);
      return { success: true, migrated: migratedCount };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[DataMigration] Migration failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * 递归复制目录
   */
  private copyDirRecursive(src: string, dst: string): void {
    if (!fs.existsSync(dst)) {
      fs.mkdirSync(dst, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const dstPath = path.join(dst, entry.name);

      try {
        if (entry.isDirectory()) {
          this.copyDirRecursive(srcPath, dstPath);
        } else {
          fs.copyFileSync(srcPath, dstPath);
        }
      } catch (error) {
        console.error(`[DataMigration] Error copying ${srcPath}:`, error);
      }
    }
  }

  /**
   * 合并两个目录（只复制目标目录中不存在的文件）
   */
  private mergeDirs(src: string, dst: string): number {
    let mergedCount = 0;

    try {
      const entries = fs.readdirSync(src, { withFileTypes: true });

      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const dstPath = path.join(dst, entry.name);

        if (entry.isDirectory()) {
          if (!fs.existsSync(dstPath)) {
            this.copyDirRecursive(srcPath, dstPath);
            mergedCount++;
          } else {
            mergedCount += this.mergeDirs(srcPath, dstPath);
          }
        } else {
          if (!fs.existsSync(dstPath)) {
            fs.copyFileSync(srcPath, dstPath);
            mergedCount++;
          }
        }
      }
    } catch (error) {
      console.error(`[DataMigration] Error merging ${src}:`, error);
    }

    return mergedCount;
  }

  /**
   * 获取迁移状态信息
   */
  public getMigrationInfo(): { migrated: boolean; info?: any } {
    const marker = path.join(this.newPath, '.migrated_from');
    if (fs.existsSync(marker)) {
      try {
        const content = fs.readFileSync(marker, 'utf-8');
        const info = JSON.parse(content);
        return { migrated: true, info };
      } catch (error) {
        // 旧格式（纯文本路径）
        const oldPath = fs.readFileSync(marker, 'utf-8');
        return { migrated: true, info: { from: oldPath } };
      }
    }
    return { migrated: false };
  }
}
