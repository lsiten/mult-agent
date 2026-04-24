/**
 * PipeClient - stdin/stdout 管道通信客户端
 *
 * 替代 HTTP 请求，通过管道与 Python Gateway 通信。
 * 每个请求/响应是单行 JSON，通过请求 ID 匹配。
 */

import { EventEmitter } from 'events';
// 使用 Node.js 原生 crypto 模块生成 UUID v4
import { randomBytes } from 'crypto';

// 简单的 UUID v4 生成函数
function uuidv4(): string {
  const bytes = randomBytes(16);
  // 设置版本号 (4) 和变体 (RFC4122)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
import { ChildProcessWithoutNullStreams } from 'child_process';

interface PipeRequest {
  id: string;
  method: string; // "GET /api/sessions"
  headers: Record<string, string>;
  body?: any;
}

interface PipeResponse {
  id: string;
  status: number;
  headers: Record<string, string>;
  body: any;
}

interface PendingRequest {
  resolve: (response: PipeResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

/**
 * PipeClient 类
 *
 * 管理与 Gateway 的双向管道通信：
 * - 请求 ID 匹配（支持并发请求）
 * - 超时处理
 * - 自动重连（TODO）
 */
export class PipeClient extends EventEmitter {
  private process: ChildProcessWithoutNullStreams;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private lineBuffer: string = '';
  private readonly DEFAULT_TIMEOUT_MS = 30000; // 30 秒

  constructor(process: ChildProcessWithoutNullStreams) {
    super();
    this.process = process;
    this.setupListeners();
  }

  /**
   * 设置 stdout/stderr 监听器
   */
  private setupListeners(): void {
    // 监听 stdout（响应数据）
    this.process.stdout.on('data', (chunk: Buffer) => {
      this.handleStdoutData(chunk);
    });

    // 监听 stderr（日志数据）
    this.process.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) {
        this.emit('log', text);
      }
    });

    // 监听进程退出
    this.process.on('close', (code: number | null) => {
      console.log(`[PipeClient] Process exited with code ${code}`);
      this.emit('close', code);

      // 取消所有待处理的请求
      for (const pending of this.pendingRequests.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(`Process exited with code ${code}`));
      }
      this.pendingRequests.clear();
    });
  }

  /**
   * 处理 stdout 数据（逐行解析）
   */
  private handleStdoutData(chunk: Buffer): void {
    this.lineBuffer += chunk.toString();

    // 按换行符分割
    const lines = this.lineBuffer.split('\n');

    // 保留最后一个不完整的行
    this.lineBuffer = lines.pop() || '';

    // 处理每一行
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const response: PipeResponse = JSON.parse(trimmed);
        this.handleResponse(response);
      } catch (error) {
        console.error('[PipeClient] Failed to parse response:', trimmed, error);
      }
    }
  }

  /**
   * 处理单个响应（匹配请求 ID）
   */
  private handleResponse(response: PipeResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      console.warn(`[PipeClient] No pending request for ID: ${response.id}`);
      return;
    }

    // 清理超时定时器
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.id);

    // 响应请求
    if (response.status >= 200 && response.status < 300) {
      pending.resolve(response);
    } else {
      pending.reject(
        new Error(
          `Request failed: ${response.status} ${JSON.stringify(response.body)}`
        )
      );
    }
  }

  /**
   * 发送请求（返回 Promise）
   *
   * @param method HTTP 方法 + 路径，如 "GET /api/sessions"
   * @param headers 请求头
   * @param body 请求体（可选）
   * @param timeoutMs 超时时间（毫秒）
   */
  request(
    method: string,
    headers: Record<string, string> = {},
    body?: any,
    timeoutMs: number = this.DEFAULT_TIMEOUT_MS
  ): Promise<PipeResponse> {
    const requestId = uuidv4();

    const request: PipeRequest = {
      id: requestId,
      method,
      headers,
      body,
    };

    return new Promise((resolve, reject) => {
      // 设置超时
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout after ${timeoutMs}ms: ${method}`));
      }, timeoutMs);

      // 保存待处理请求
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout,
      });

      // 写入 stdin（单行 JSON + '\n'）
      const requestJson = JSON.stringify(request);
      this.process.stdin.write(requestJson + '\n');
    });
  }

  /**
   * 便捷方法：GET 请求
   */
  async get(
    path: string,
    headers: Record<string, string> = {}
  ): Promise<PipeResponse> {
    return this.request(`GET ${path}`, headers);
  }

  /**
   * 便捷方法：POST 请求
   */
  async post(
    path: string,
    body: any,
    headers: Record<string, string> = {}
  ): Promise<PipeResponse> {
    return this.request(`POST ${path}`, headers, body);
  }

  /**
   * 优雅关闭
   */
  close(): void {
    // 取消所有待处理的请求
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Client closed'));
    }
    this.pendingRequests.clear();

    // 关闭 stdin（通知 Gateway 退出）
    this.process.stdin.end();
  }
}
