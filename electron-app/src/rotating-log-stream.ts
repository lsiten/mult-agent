import * as fs from 'fs';
import * as path from 'path';
import { createWriteStream, WriteStream } from 'fs';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';

export interface RotatingLogStreamConfig {
  path: string;              // 日志目录
  filename: string;          // 基础文件名 (如 gateway.log)
  maxSize: number;           // 单个文件最大大小 (字节)
  maxFiles: number;          // 保留文件数量
  compress: boolean;         // 是否压缩旧日志
}

export class RotatingLogStream {
  private config: RotatingLogStreamConfig;
  private currentStream: WriteStream | null = null;
  private currentSize = 0;
  private currentFilePath: string;

  constructor(config: Partial<RotatingLogStreamConfig>) {
    this.config = {
      maxSize: 10 * 1024 * 1024,  // 默认 10MB
      maxFiles: 7,                 // 默认保留 7 个文件
      compress: true,              // 默认压缩
      ...config
    } as RotatingLogStreamConfig;

    // 确保目录存在
    if (!fs.existsSync(this.config.path)) {
      fs.mkdirSync(this.config.path, { recursive: true });
    }

    this.currentFilePath = path.join(this.config.path, this.config.filename);
    this.openStream();
  }

  private openStream(): void {
    // 获取当前文件大小
    if (fs.existsSync(this.currentFilePath)) {
      const stats = fs.statSync(this.currentFilePath);
      this.currentSize = stats.size;
    } else {
      this.currentSize = 0;
    }

    // 创建写入流
    this.currentStream = createWriteStream(this.currentFilePath, {
      flags: 'a',  // 追加模式
      encoding: 'utf8'
    });
  }

  public write(data: string): void {
    if (!this.currentStream) {
      this.openStream();
    }

    const buffer = Buffer.from(data, 'utf8');
    this.currentSize += buffer.length;

    // 检查是否需要轮转
    if (this.currentSize > this.config.maxSize) {
      this.rotate();
    }

    this.currentStream!.write(data);
  }

  private rotate(): void {
    // 关闭当前流
    if (this.currentStream) {
      this.currentStream.end();
      this.currentStream = null;
    }

    // 轮转文件
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedName = `${this.config.filename}.${timestamp}`;
    const rotatedPath = path.join(this.config.path, rotatedName);

    // 重命名当前文件
    fs.renameSync(this.currentFilePath, rotatedPath);

    // 异步压缩
    if (this.config.compress) {
      this.compressFile(rotatedPath).catch(err => {
        console.error('[RotatingLogStream] Failed to compress log:', err);
      });
    }

    // 清理旧文件
    this.cleanOldFiles();

    // 打开新流
    this.currentSize = 0;
    this.openStream();
  }

  private async compressFile(filePath: string): Promise<void> {
    const gzipPath = `${filePath}.gz`;
    const source = fs.createReadStream(filePath);
    const destination = fs.createWriteStream(gzipPath);
    const gzip = createGzip();

    await pipeline(source, gzip, destination);

    // 删除原文件
    fs.unlinkSync(filePath);
  }

  private cleanOldFiles(): void {
    try {
      // 列出所有日志文件
      const files = fs.readdirSync(this.config.path);

      // 过滤出当前基础文件名的轮转文件
      const rotatedFiles = files
        .filter(f => f.startsWith(this.config.filename) && f !== this.config.filename)
        .map(f => ({
          name: f,
          path: path.join(this.config.path, f),
          time: fs.statSync(path.join(this.config.path, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time); // 按时间倒序

      // 删除超出保留数量的文件
      if (rotatedFiles.length > this.config.maxFiles) {
        const filesToDelete = rotatedFiles.slice(this.config.maxFiles);
        filesToDelete.forEach(file => {
          fs.unlinkSync(file.path);
          console.log(`[RotatingLogStream] Deleted old log: ${file.name}`);
        });
      }
    } catch (error) {
      console.error('[RotatingLogStream] Failed to clean old files:', error);
    }
  }

  public close(): void {
    if (this.currentStream) {
      this.currentStream.end();
      this.currentStream = null;
    }
  }
}
