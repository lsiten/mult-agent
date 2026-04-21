/**
 * IPC Validators
 *
 * @deprecated 已废弃，请使用新的 IPC Registry + Zod schemas 替代
 *
 * 验证 IPC 输入，防止滥用
 * - URL 协议白名单
 * - 域名白名单
 * - 用户确认对话框
 *
 * 迁移指南：
 * ```typescript
 * // 旧代码
 * await IpcValidators.validateAndOpenUrl(url);
 *
 * // 新代码
 * // 1. 在 ipc-schemas.ts 定义 schema
 * export const OpenUrlSchema = z.object({
 *   url: z.string().url().refine(...)
 * });
 *
 * // 2. 在 ipc-handlers.ts 使用
 * {
 *   channel: 'shell:openExternal',
 *   schema: schemas.OpenUrlSchema,
 *   handler: async (_event, input) => {
 *     await shell.openExternal(input.url);
 *   }
 * }
 * ```
 *
 * @see {IpcRegistry} src/ipc/ipc-registry.ts
 * @see {OpenUrlSchema} src/ipc/ipc-schemas.ts
 */

import { shell, dialog } from 'electron';

/**
 * @deprecated 使用 IPC Registry + Zod schemas 替代
 */
export class IpcValidators {
  private static readonly ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:'];

  private static readonly TRUSTED_DOMAINS = [
    'github.com',
    'anthropic.com',
    'docs.python.org',
    'pypi.org',
    'stackoverflow.com',
    'mozilla.org',
    'w3.org',
    'wikipedia.org',
    // 开发环境
    'localhost',
    '127.0.0.1'
  ];

  /**
   * 验证并打开外部 URL
   */
  static async validateAndOpenUrl(url: string): Promise<void> {
    // 1. 基本验证
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL: must be a non-empty string');
    }

    // 防止过长 URL (可能是攻击)
    if (url.length > 2048) {
      throw new Error('Invalid URL: too long (max 2048 characters)');
    }

    // 2. 解析 URL
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (error) {
      throw new Error('Invalid URL format');
    }

    // 3. 协议白名单
    if (!this.ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      throw new Error(
        `Protocol not allowed: ${parsed.protocol}. ` +
        `Allowed: ${this.ALLOWED_PROTOCOLS.join(', ')}`
      );
    }

    // 4. localhost 直接通过 (开发环境)
    if (this.isLocalhost(parsed.hostname)) {
      console.log(`[IpcValidators] Opening localhost URL: ${url}`);
      await shell.openExternal(url);
      return;
    }

    // 5. 域名白名单检查
    const isTrusted = this.isTrustedDomain(parsed.hostname);

    if (!isTrusted) {
      // 不在白名单，显示确认对话框
      const confirmed = await this.confirmExternalUrl(url);
      if (!confirmed) {
        console.log(`[IpcValidators] User cancelled opening: ${url}`);
        return;
      }
    }

    // 6. 打开 URL
    console.log(`[IpcValidators] Opening external URL: ${url}`);
    await shell.openExternal(url);
  }

  /**
   * 检查是否是 localhost
   */
  private static isLocalhost(hostname: string): boolean {
    return hostname === 'localhost' ||
           hostname === '127.0.0.1' ||
           hostname === '::1' ||
           hostname === '[::1]' ||
           // IPv4 映射的 IPv6 地址
           hostname === '[::ffff:127.0.0.1]' ||
           // 回环地址范围
           /^127\.\d+\.\d+\.\d+$/.test(hostname);
  }

  /**
   * 检查域名是否在白名单
   */
  private static isTrustedDomain(hostname: string): boolean {
    return this.TRUSTED_DOMAINS.some(domain => {
      // 精确匹配
      if (hostname === domain) {
        return true;
      }
      // 子域名匹配 (如 api.github.com 匹配 github.com)
      // 修复：防止 evil.github.com.attacker.com 绕过
      if (hostname.endsWith('.' + domain)) {
        const prefix = hostname.slice(0, -(domain.length + 1));
        // 确保前缀是有效的子域名（不包含域名分隔符后的内容）
        return prefix.length > 0 && /^[a-zA-Z0-9-_.]+$/.test(prefix);
      }
      return false;
    });
  }

  /**
   * 显示确认对话框
   */
  private static async confirmExternalUrl(url: string): Promise<boolean> {
    const result = await dialog.showMessageBox({
      type: 'question',
      title: 'Open External Link',
      message: 'Open this link in your default browser?',
      detail: url,
      buttons: ['Cancel', 'Open'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    });

    return result.response === 1;
  }

  /**
   * 添加可信域名 (运行时动态添加)
   */
  static addTrustedDomain(domain: string): void {
    if (!this.TRUSTED_DOMAINS.includes(domain)) {
      this.TRUSTED_DOMAINS.push(domain);
      console.log(`[IpcValidators] Added trusted domain: ${domain}`);
    }
  }

  /**
   * 获取白名单配置 (用于调试)
   */
  static getConfig(): {
    allowedProtocols: string[];
    trustedDomains: string[];
  } {
    return {
      allowedProtocols: [...this.ALLOWED_PROTOCOLS],
      trustedDomains: [...this.TRUSTED_DOMAINS]
    };
  }
}
