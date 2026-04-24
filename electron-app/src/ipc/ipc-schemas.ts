/**
 * IPC Schemas
 *
 * 使用 Zod 定义所有 IPC 处理器的输入验证 schema
 */

import { z } from 'zod';

/**
 * shell:openExternal
 * 在系统默认浏览器中打开 URL
 */
export const ShellOpenExternalSchema = z.object({
  url: z.string().url('Invalid URL format').refine(
    (url) => {
      // 白名单协议
      const allowedProtocols = ['http:', 'https:', 'mailto:'];
      try {
        const parsed = new URL(url);
        return allowedProtocols.includes(parsed.protocol);
      } catch {
        return false;
      }
    },
    { message: 'Only http, https, and mailto protocols are allowed' }
  ),
});

/**
 * python:restart
 * 重启 Python Gateway
 */
export const PythonRestartSchema = z.object({
  reason: z.string().optional(), // 重启原因（用于日志）
});

/**
 * diagnostic:retry
 * 重试启动流程
 */
export const DiagnosticRetrySchema = z.object({
  force: z.boolean().optional(), // 是否强制重试（跳过冷却期）
});

/**
 * python:getStatus
 * 获取 Python Gateway 状态
 */
export const PythonGetStatusSchema = z.object({
  includeMetrics: z.boolean().optional(), // 是否包含详细指标
});

/**
 * vite:getStatus
 * 获取 Vite Dev Server 状态
 */
export const ViteGetStatusSchema = z.object({
  includeUrl: z.boolean().optional(), // 是否包含 URL
});

/**
 * config:get
 * 获取配置项
 */
export const ConfigGetSchema = z.object({
  key: z.string().min(1, 'Config key cannot be empty'),
  defaultValue: z.any().optional(), // 默认值
});

/**
 * config:set
 * 设置配置项
 */
export const ConfigSetSchema = z.object({
  key: z.string().min(1, 'Config key cannot be empty'),
  value: z.any(), // 配置值
});

/**
 * env:getAll
 * 获取所有环境变量（仅开发模式）
 */
export const EnvGetAllSchema = z.object({
  sanitize: z.boolean().optional(), // 是否脱敏（默认 true）
});

/**
 * window:minimize
 * 最小化窗口
 */
export const WindowMinimizeSchema = z.object({
  // 无参数
});

/**
 * window:close
 * 关闭窗口
 */
export const WindowCloseSchema = z.object({
  force: z.boolean().optional(), // 是否强制关闭（跳过确认）
});

/**
 * gateway:getAuthToken
 * 获取 Gateway 认证 token
 */
export const GatewayGetAuthTokenSchema = z.object({
  // 无参数
});

/**
 * onboarding:getStatus
 * 获取引导状态
 */
export const OnboardingGetStatusSchema = z.object({
  // 无参数
});

/**
 * onboarding:markComplete
 * 标记引导完成
 */
export const OnboardingMarkCompleteSchema = z.object({
  // 无参数
});

/**
 * onboarding:reset
 * 重置引导状态
 */
export const OnboardingResetSchema = z.object({
  // 无参数
});

/**
 * app:getPath
 * 获取应用路径
 */
export const AppGetPathSchema = z.object({
  name: z.enum(['home', 'appData', 'userData', 'temp', 'exe', 'desktop', 'documents', 'downloads']).optional(),
});

/**
 * diagnostic:getDependencies
 * 获取依赖检查结果
 */
export const DiagnosticGetDependenciesSchema = z.object({
  refresh: z.boolean().optional(), // 是否刷新检查结果
});

/**
 * diagnostic:getLogs
 * 获取日志内容
 */
export const DiagnosticGetLogsSchema = z.object({
  lines: z.number().int().min(1).max(1000).optional(), // 读取行数（默认 100）
  offset: z.number().int().min(0).optional(), // 偏移量
});

/**
 * diagnostic:getLogsPath
 * 获取日志文件路径
 */
export const DiagnosticGetLogsPathSchema = z.object({
  // 无参数
});

// 导出所有 schema 的类型
export type ShellOpenExternalInput = z.infer<typeof ShellOpenExternalSchema>;
export type PythonRestartInput = z.infer<typeof PythonRestartSchema>;
export type DiagnosticRetryInput = z.infer<typeof DiagnosticRetrySchema>;
export type PythonGetStatusInput = z.infer<typeof PythonGetStatusSchema>;
export type ViteGetStatusInput = z.infer<typeof ViteGetStatusSchema>;
export type ConfigGetInput = z.infer<typeof ConfigGetSchema>;
export type ConfigSetInput = z.infer<typeof ConfigSetSchema>;
export type EnvGetAllInput = z.infer<typeof EnvGetAllSchema>;
export type WindowMinimizeInput = z.infer<typeof WindowMinimizeSchema>;
export type WindowCloseInput = z.infer<typeof WindowCloseSchema>;
export type GatewayGetAuthTokenInput = z.infer<typeof GatewayGetAuthTokenSchema>;
export type OnboardingGetStatusInput = z.infer<typeof OnboardingGetStatusSchema>;
export type OnboardingMarkCompleteInput = z.infer<typeof OnboardingMarkCompleteSchema>;
export type OnboardingResetInput = z.infer<typeof OnboardingResetSchema>;
export type AppGetPathInput = z.infer<typeof AppGetPathSchema>;
export type DiagnosticGetDependenciesInput = z.infer<typeof DiagnosticGetDependenciesSchema>;
export type DiagnosticGetLogsInput = z.infer<typeof DiagnosticGetLogsSchema>;
export type DiagnosticGetLogsPathInput = z.infer<typeof DiagnosticGetLogsPathSchema>;

/**
 * sub-agent:getOrStart
 * 获取或启动 Sub Agent Gateway
 */
export const SubAgentGetOrStartSchema = z.object({
  agentId: z.number().int().positive('Agent ID must be positive'),
});

/**
 * sub-agent:stop
 * 停止 Sub Agent Gateway
 */
export const SubAgentStopSchema = z.object({
  agentId: z.number().int().positive('Agent ID must be positive'),
});

/**
 * sub-agent:getPort
 * 获取 Sub Agent Gateway 端口
 */
export const SubAgentGetPortSchema = z.object({
  agentId: z.number().int().positive('Agent ID must be positive'),
});

/**
 * sub-agent:getAllMetrics
 * 获取所有 Sub Agent Gateway 指标
 */
export const SubAgentGetAllMetricsSchema = z.object({});

/**
 * electron:getServices
 * 获取 Electron 服务状态
 */
export const ElectronGetServicesSchema = z.object({});

/**
 * electron:getIPCHandlers
 * 获取已注册的 IPC 处理器列表
 */
export const ElectronGetIPCHandlersSchema = z.object({});

export type SubAgentGetOrStartInput = z.infer<typeof SubAgentGetOrStartSchema>;
export type SubAgentStopInput = z.infer<typeof SubAgentStopSchema>;
export type SubAgentGetPortInput = z.infer<typeof SubAgentGetPortSchema>;
export type SubAgentGetAllMetricsInput = z.infer<typeof SubAgentGetAllMetricsSchema>;
