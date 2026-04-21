/**
 * 日志脱敏工具
 * 移除 API keys、Bearer tokens、密码、邮箱、JWTs 等敏感信息
 */

export interface SanitizeOptions {
  /** 保留 API key 的前 N 个字符 (默认: 7) */
  apiKeyPrefix?: number;
  /** 保留 API key 的后 N 个字符 (默认: 4) */
  apiKeySuffix?: number;
  /** 保留 JWT 的前 N 个字符 (默认: 10) */
  jwtPrefix?: number;
  /** 保留 JWT 的后 N 个字符 (默认: 10) */
  jwtSuffix?: number;
  /** 保留邮箱的前 N 个字符 (默认: 2) */
  emailPrefix?: number;
}

const DEFAULT_OPTIONS: Required<SanitizeOptions> = {
  apiKeyPrefix: 7,
  apiKeySuffix: 4,
  jwtPrefix: 10,
  jwtSuffix: 10,
  emailPrefix: 2,
};

/**
 * 脱敏日志消息
 *
 * @param message - 原始日志消息
 * @param options - 脱敏选项
 * @returns 脱敏后的消息
 *
 * @example
 * ```typescript
 * sanitizeLog('API key: sk-ant-1234567890abcdef')
 * // 'API key: sk-ant-...cdef'
 *
 * sanitizeLog('Authorization: Bearer abc123xyz')
 * // 'Authorization: Bearer ***'
 *
 * sanitizeLog('password="secret123"')
 * // 'password="***"'
 *
 * sanitizeLog('user@example.com')
 * // 'us***@example.com'
 * ```
 */
export function sanitizeLog(message: string, options: SanitizeOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let sanitized = message;

  // 1. 脱敏 API keys (sk-ant-xxx, sk-proj-xxx 等)
  sanitized = sanitized.replace(
    /\b(sk-[a-z]+-[\w-]{8,})\b/gi,
    (match) => {
      const prefix = match.slice(0, opts.apiKeyPrefix);
      const suffix = match.slice(-opts.apiKeySuffix);
      return `${prefix}...${suffix}`;
    }
  );

  // 2. 脱敏 Bearer tokens
  sanitized = sanitized.replace(
    /\bBearer\s+[\w-]+/gi,
    'Bearer ***'
  );

  // 3. 脱敏密码字段 (password="xxx", password: "xxx", password='xxx')
  sanitized = sanitized.replace(
    /(password\s*[:=]\s*)["']([^"']+)["']/gi,
    '$1"***"'
  );

  // 4. 脱敏邮箱
  sanitized = sanitized.replace(
    /\b([\w._%+-]{2,})@([\w.-]+\.[a-z]{2,})\b/gi,
    (_match, local, domain) => {
      const prefix = local.slice(0, opts.emailPrefix);
      return `${prefix}***@${domain}`;
    }
  );

  // 5. 脱敏 JWTs (eyJ 开头的 base64 字符串，包含 . 分隔符)
  sanitized = sanitized.replace(
    /\beyJ[\w.-]{20,}\b/g,
    (match) => {
      const prefix = match.slice(0, opts.jwtPrefix);
      const suffix = match.slice(-opts.jwtSuffix);
      return `${prefix}...${suffix}`;
    }
  );

  // 6. 脱敏其他常见密钥格式 (token=xxx, api_key=xxx)
  sanitized = sanitized.replace(
    /\b(token|api_key|secret|access_token|refresh_token)\s*[:=]\s*["']?[\w-]+["']?/gi,
    (_match, field) => `${field}=***`
  );

  return sanitized;
}

/**
 * 创建一个自动脱敏的日志函数
 *
 * @param logger - 原始日志函数 (如 console.log)
 * @param options - 脱敏选项
 * @returns 包装后的日志函数
 *
 * @example
 * ```typescript
 * const safeLog = createSafeLogger(console.log);
 * safeLog('API key: sk-ant-1234567890abcdef');
 * // 输出: 'API key: sk-ant-...cdef'
 * ```
 */
export function createSafeLogger(
  logger: (...args: any[]) => void,
  options: SanitizeOptions = {}
): (...args: any[]) => void {
  return (...args: any[]) => {
    const sanitizedArgs = args.map((arg) => {
      if (typeof arg === 'string') {
        return sanitizeLog(arg, options);
      }
      // 对象和数组递归处理
      if (typeof arg === 'object' && arg !== null) {
        return sanitizeObject(arg, options);
      }
      return arg;
    });
    logger(...sanitizedArgs);
  };
}

/**
 * 递归脱敏对象
 */
function sanitizeObject(obj: any, options: SanitizeOptions): any {
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, options));
  }

  if (typeof obj === 'object' && obj !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizeLog(value, options);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeObject(value, options);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  return obj;
}
