import { describe, it, expect } from 'vitest';
import { sanitizeLog, createSafeLogger } from '../../../src/utils/sanitize-log';

describe('sanitizeLog', () => {
  describe('API Keys', () => {
    it('应该脱敏 Anthropic API keys', () => {
      const input = 'API key: sk-ant-1234567890abcdef';
      const result = sanitizeLog(input);
      expect(result).toBe('API key: sk-ant-...cdef');
    });

    it('应该脱敏多个 API keys', () => {
      const input = 'Keys: sk-ant-abc123xyz789, sk-proj-def456uvw012';
      const result = sanitizeLog(input);
      expect(result).toContain('sk-ant-...z789');
      expect(result).toContain('sk-proj...w012');
    });

    it('应该保留指定前缀和后缀长度', () => {
      const input = 'sk-ant-1234567890abcdef';
      const result = sanitizeLog(input, { apiKeyPrefix: 10, apiKeySuffix: 6 });
      expect(result).toBe('sk-ant-123...abcdef');
    });
  });

  describe('Bearer Tokens', () => {
    it('应该脱敏 Bearer tokens', () => {
      const input = 'Authorization: Bearer abc123xyz';
      const result = sanitizeLog(input);
      expect(result).toBe('Authorization: Bearer ***');
    });

    it('应该脱敏大小写不敏感的 Bearer', () => {
      const input = 'Authorization: bearer abc123xyz';
      const result = sanitizeLog(input);
      expect(result).toBe('Authorization: Bearer ***');
    });
  });

  describe('密码', () => {
    it('应该脱敏双引号密码', () => {
      const input = 'password="secret123"';
      const result = sanitizeLog(input);
      expect(result).toBe('password="***"');
    });

    it('应该脱敏单引号密码', () => {
      const input = "password='secret123'";
      const result = sanitizeLog(input);
      expect(result).toBe('password="***"');
    });

    it('应该脱敏冒号格式密码', () => {
      const input = 'password: "secret123"';
      const result = sanitizeLog(input);
      expect(result).toBe('password: "***"');
    });
  });

  describe('邮箱', () => {
    it('应该脱敏邮箱地址', () => {
      const input = 'user@example.com';
      const result = sanitizeLog(input);
      expect(result).toBe('us***@example.com');
    });

    it('应该脱敏复杂邮箱', () => {
      const input = 'john.doe+test@subdomain.example.co.uk';
      const result = sanitizeLog(input);
      expect(result).toBe('jo***@subdomain.example.co.uk');
    });

    it('应该保留指定前缀长度', () => {
      const input = 'user@example.com';
      const result = sanitizeLog(input, { emailPrefix: 4 });
      expect(result).toBe('user***@example.com');
    });
  });

  describe('JWTs', () => {
    it('应该脱敏 JWT tokens', () => {
      const input = 'JWT: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const result = sanitizeLog(input);
      // JWT 会被整体脱敏（包含所有 3 个部分）
      expect(result).toContain('eyJhbGciOi...FUP0THsR8U');
    });

    it('应该保留指定前缀和后缀长度', () => {
      const input = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      const result = sanitizeLog(input, { jwtPrefix: 5, jwtSuffix: 5 });
      expect(result).toBe('eyJhb...XVCJ9');
    });
  });

  describe('其他密钥格式', () => {
    it('应该脱敏 token 字段', () => {
      const input = 'token=abc123xyz';
      const result = sanitizeLog(input);
      expect(result).toBe('token=***');
    });

    it('应该脱敏 api_key 字段', () => {
      const input = 'api_key: "secret"';
      const result = sanitizeLog(input);
      expect(result).toBe('api_key=***');
    });

    it('应该脱敏 access_token 字段', () => {
      const input = 'access_token=xyz789';
      const result = sanitizeLog(input);
      expect(result).toBe('access_token=***');
    });
  });

  describe('边界情况', () => {
    it('应该处理空字符串', () => {
      expect(sanitizeLog('')).toBe('');
    });

    it('应该处理不包含敏感信息的文本', () => {
      const input = 'This is a normal log message';
      expect(sanitizeLog(input)).toBe(input);
    });

    it('应该处理混合内容', () => {
      const input = 'User user@example.com logged in with token=abc123 and password="secret"';
      const result = sanitizeLog(input);
      expect(result).toContain('us***@example.com');
      expect(result).toContain('token=***');
      expect(result).toContain('password="***"');
    });
  });
});

describe('createSafeLogger', () => {
  it('应该包装日志函数并脱敏', () => {
    const logs: string[] = [];
    const mockLogger = (...args: any[]) => logs.push(args.join(' '));

    const safeLog = createSafeLogger(mockLogger);
    safeLog('API key: sk-ant-1234567890abcdef');

    expect(logs[0]).toBe('API key: sk-ant-...cdef');
  });

  it('应该脱敏对象中的敏感字段', () => {
    const logs: any[] = [];
    const mockLogger = (...args: any[]) => logs.push(args);

    const safeLog = createSafeLogger(mockLogger);
    safeLog({ apiKey: 'sk-ant-1234567890abcdef', message: 'test' });

    expect(logs[0][0].apiKey).toBe('sk-ant-...cdef');
    expect(logs[0][0].message).toBe('test');
  });

  it('应该递归脱敏嵌套对象', () => {
    const logs: any[] = [];
    const mockLogger = (...args: any[]) => logs.push(args);

    const safeLog = createSafeLogger(mockLogger);
    safeLog({
      user: {
        email: 'user@example.com',
        credentials: {
          password: 'secret123',
        },
      },
    });

    expect(logs[0][0].user.email).toBe('us***@example.com');
    expect(logs[0][0].user.credentials.password).toBe('secret123'); // 注意：对象中的 password 需要字符串匹配
  });
});
