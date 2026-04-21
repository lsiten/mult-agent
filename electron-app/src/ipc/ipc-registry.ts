/**
 * IPC Registry
 *
 * 类型安全的 IPC 处理器注册表
 * - Zod 验证输入
 * - 自动错误处理
 * - 限流支持
 * - 统一响应格式
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { ZodSchema } from 'zod';

/**
 * IPC 响应格式
 */
export type IpcResponse<T = any> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

/**
 * IPC 处理器类型
 */
export type IpcHandler<TInput = any, TOutput = any> = (
  event: IpcMainInvokeEvent,
  input: TInput
) => Promise<TOutput> | TOutput;

/**
 * 限流配置
 */
export interface RateLimitConfig {
  maxAttempts: number;  // 最大尝试次数
  windowMs: number;     // 时间窗口（毫秒）
}

/**
 * IPC 处理器配置
 */
export interface IpcHandlerConfig<TInput = any, TOutput = any> {
  channel: string;                    // IPC 频道名
  schema?: ZodSchema<TInput>;         // 输入验证 schema（可选）
  handler: IpcHandler<TInput, TOutput>;
  rateLimit?: RateLimitConfig;        // 限流配置（可选）
}

/**
 * 限流记录
 */
interface RateLimitRecord {
  attempts: number[];  // 尝试时间戳
}

/**
 * IPC Registry 类
 */
export class IpcRegistry {
  private handlers = new Map<string, IpcHandlerConfig>();
  private rateLimits = new Map<string, RateLimitRecord>();

  /**
   * 注册 IPC 处理器
   */
  register<TInput = any, TOutput = any>(
    config: IpcHandlerConfig<TInput, TOutput>
  ): void {
    if (this.handlers.has(config.channel)) {
      throw new Error(`IPC handler already registered: ${config.channel}`);
    }

    this.handlers.set(config.channel, config);

    // 注册到 Electron IPC
    ipcMain.handle(config.channel, async (event, input) => {
      return this.handleRequest(config, event, input);
    });

    console.log(`[IpcRegistry] Registered handler: ${config.channel}`);
  }

  /**
   * 批量注册
   */
  registerAll(configs: IpcHandlerConfig[]): void {
    for (const config of configs) {
      this.register(config);
    }
  }

  /**
   * 处理 IPC 请求
   */
  private async handleRequest<TInput, TOutput>(
    config: IpcHandlerConfig<TInput, TOutput>,
    event: IpcMainInvokeEvent,
    input: any
  ): Promise<IpcResponse<TOutput>> {
    try {
      // 1. 限流检查
      if (config.rateLimit) {
        const rateLimitError = this.checkRateLimit(
          config.channel,
          config.rateLimit
        );
        if (rateLimitError) {
          return {
            ok: false,
            error: rateLimitError,
            code: 'RATE_LIMITED',
          };
        }
      }

      // 2. 输入验证
      let validatedInput: TInput;
      if (config.schema) {
        const result = config.schema.safeParse(input);
        if (!result.success) {
          const errors = result.error.errors
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join('; ');
          return {
            ok: false,
            error: `Invalid input: ${errors}`,
            code: 'VALIDATION_ERROR',
          };
        }
        validatedInput = result.data;
      } else {
        validatedInput = input;
      }

      // 3. 执行处理器
      const data = await config.handler(event, validatedInput);

      return { ok: true, data };
    } catch (error) {
      console.error(`[IpcRegistry] Error in ${config.channel}:`, error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'HANDLER_ERROR',
      };
    }
  }

  /**
   * 检查限流
   */
  private checkRateLimit(
    channel: string,
    config: RateLimitConfig
  ): string | null {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // 获取或创建限流记录
    let record = this.rateLimits.get(channel);
    if (!record) {
      record = { attempts: [] };
      this.rateLimits.set(channel, record);
    }

    // 清理过期记录
    record.attempts = record.attempts.filter((time) => time > windowStart);

    // 检查是否超过限制
    if (record.attempts.length >= config.maxAttempts) {
      const oldestAttempt = record.attempts[0];
      const remainingMs = oldestAttempt + config.windowMs - now;
      const remainingSec = Math.ceil(remainingMs / 1000);
      return `Rate limit exceeded. Please wait ${remainingSec}s`;
    }

    // 记录本次尝试
    record.attempts.push(now);

    return null;
  }

  /**
   * 重置限流记录（用于测试）
   */
  resetRateLimit(channel: string): void {
    this.rateLimits.delete(channel);
  }

  /**
   * 获取已注册的处理器列表
   */
  getHandlers(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * 清除所有处理器（用于测试）
   */
  clear(): void {
    for (const channel of this.handlers.keys()) {
      ipcMain.removeHandler(channel);
    }
    this.handlers.clear();
    this.rateLimits.clear();
    console.log('[IpcRegistry] All handlers cleared');
  }
}
