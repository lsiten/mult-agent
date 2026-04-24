/**
 * Sub Agent 启动集成测试
 *
 * 验证完整流程：
 * 1. 创建 Sub Agent profile 目录结构
 * 2. 生成 config.yaml（从主 Agent 继承）
 * 3. 同步 runtime token
 * 4. 启动 Gateway subprocess（管道通信）
 * 5. 健康检查通过
 */

import { SubAgentGatewayService } from '../../src/services/sub-agent-gateway.service';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('Sub Agent 启动流程', () => {
  let testProfileHome: string;
  let testMainHome: string;
  let service: SubAgentGatewayService;

  beforeEach(() => {
    // 创建临时测试目录
    testMainHome = path.join(os.tmpdir(), `hermes-test-main-${Date.now()}`);
    testProfileHome = path.join(os.tmpdir(), `hermes-test-profile-${Date.now()}`);

    fs.mkdirSync(testMainHome, { recursive: true });
    fs.mkdirSync(testProfileHome, { recursive: true });

    // 创建主 Agent 的 runtime token
    fs.writeFileSync(
      path.join(testMainHome, '.runtime_token'),
      '3f511149bb50a08c588ae6fbf3fec8640625a204df8beecab8a58af6abc5d6d1',
      { mode: 0o600 }
    );

    // 创建主 Agent 的 config.yaml
    const mainConfig = `
model: volcengine/ark-code-latest
providers: {}
toolsets:
  - hermes-cli
agent:
  max_turns: 90
terminal:
  backend: local
`;
    fs.writeFileSync(path.join(testMainHome, 'config.yaml'), mainConfig);
  });

  afterEach(async () => {
    if (service) {
      await service.stop();
    }

    // 清理测试目录
    fs.rmSync(testMainHome, { recursive: true, force: true });
    fs.rmSync(testProfileHome, { recursive: true, force: true });
  });

  test('应该成功创建 profile 目录结构', async () => {
    service = new SubAgentGatewayService({
      agentId: 1,
      profileHome: testProfileHome,
      mainHermesHome: testMainHome,
      pythonPath: process.env.PYTHON_PATH || 'python3',
      pythonRuntimePath: path.resolve(__dirname, '../../../'),
      port: 9999,
      gatewayToken: 'test-token-32-characters-long123',
    });

    await service.start();

    // 验证目录结构
    expect(fs.existsSync(testProfileHome)).toBe(true);
    expect(fs.existsSync(path.join(testProfileHome, 'config.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(testProfileHome, '.runtime_token'))).toBe(true);
    expect(fs.existsSync(path.join(testProfileHome, 'logs'))).toBe(true);
    expect(fs.existsSync(path.join(testProfileHome, 'sessions'))).toBe(true);
    expect(fs.existsSync(path.join(testProfileHome, 'memories'))).toBe(true);
  });

  test('应该正确同步 runtime token', async () => {
    service = new SubAgentGatewayService({
      agentId: 1,
      profileHome: testProfileHome,
      mainHermesHome: testMainHome,
      pythonPath: process.env.PYTHON_PATH || 'python3',
      pythonRuntimePath: path.resolve(__dirname, '../../../'),
      port: 9999,
      gatewayToken: 'test-token-32-characters-long123',
    });

    await service.start();

    const profileToken = fs.readFileSync(
      path.join(testProfileHome, '.runtime_token'),
      'utf-8'
    ).trim();

    const mainToken = fs.readFileSync(
      path.join(testMainHome, '.runtime_token'),
      'utf-8'
    ).trim();

    expect(profileToken).toBe(mainToken);
    expect(profileToken).toBe('3f511149bb50a08c588ae6fbf3fec8640625a204df8beecab8a58af6abc5d6d1');
  });

  test('应该正确继承主 Agent 配置', async () => {
    service = new SubAgentGatewayService({
      agentId: 1,
      profileHome: testProfileHome,
      mainHermesHome: testMainHome,
      pythonPath: process.env.PYTHON_PATH || 'python3',
      pythonRuntimePath: path.resolve(__dirname, '../../../'),
      port: 9999,
      gatewayToken: 'test-token-32-characters-long123',
    });

    await service.start();

    const configContent = fs.readFileSync(
      path.join(testProfileHome, 'config.yaml'),
      'utf-8'
    );

    // 验证继承的核心配置
    expect(configContent).toContain('model: volcengine/ark-code-latest');
    expect(configContent).toContain('toolsets:');
    expect(configContent).toContain('- hermes-cli');
    expect(configContent).toContain('agent:');
    expect(configContent).toContain('max_turns: 90');

    // 验证独立的端口配置
    expect(configContent).toContain('port: 9999');

    // 验证独立的日志目录
    expect(configContent).toContain('logging:');
    expect(configContent).toContain(`directory: ${testProfileHome}/logs`);
  });

  test('应该成功启动 Gateway 并通过健康检查', async () => {
    service = new SubAgentGatewayService({
      agentId: 1,
      profileHome: testProfileHome,
      mainHermesHome: testMainHome,
      pythonPath: process.env.PYTHON_PATH || 'python3',
      pythonRuntimePath: path.resolve(__dirname, '../../../'),
      port: 9999,
      gatewayToken: 'test-token-32-characters-long123',
    });

    await service.start();

    // 验证进程正在运行
    expect(service.isRunning()).toBe(true);

    // 验证端口可访问
    const port = service.getPort();
    expect(port).toBe(9999);

    // 尝试健康检查
    const http = require('http');
    const healthCheckResponse = await new Promise<string>((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/health`, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => (data += chunk));
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Health check timeout'));
      });
    });

    const health = JSON.parse(healthCheckResponse);
    expect(health.status).toBe('ok');
  }, 30000); // 30 秒超时
});
