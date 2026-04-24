import { contextBridge, ipcRenderer } from 'electron';

// 定义 electronAPI 接口
export interface ElectronAPI {
  // Python 日志
  onPythonLog: (callback: (log: string) => void) => void;
  onPythonError: (callback: (error: { message: string; timestamp: string }) => void) => void;

  // Python 状态和控制
  getPythonStatus: (options?: { includeMetrics?: boolean }) => Promise<{
    running: boolean;
    consecutiveFailures: number;
    restartInProgress: boolean;
    circuitState: string;
    metrics: any;
  }>;
  restartPython: (reason?: string) => Promise<{ ok: boolean }>;

  // Gateway Auth Token
  getGatewayAuthToken: () => Promise<{ token: string | null }>;

  // App 信息
  getAppPath: () => Promise<string>;

  // Onboarding
  getOnboardingStatus: () => Promise<{ needsOnboarding: boolean }>;
  markOnboardingComplete: () => Promise<{ ok: boolean }>;
  resetOnboarding: () => Promise<{ ok: boolean }>;
  onOnboardingStatus: (callback: (status: { needsOnboarding: boolean }) => void) => void;

  // 外部链接
  openExternal: (url: string) => Promise<void>;

  // 诊断接口
  getDependencies?: () => Promise<any>;
  getLogs?: () => Promise<string>;
  getLogsPath?: () => Promise<string>;
  retryStartup?: () => Promise<void>;

  // Sub Agent 管理
  subAgent?: {
    getOrStart: (agentId: number) => Promise<{ ok: boolean; data?: { success: boolean; port: number; agentId: number }; error?: string }>;
    stop: (agentId: number) => Promise<{ ok: boolean; data?: { success: boolean }; error?: string }>;
    getPort: (agentId: number) => Promise<{ ok: boolean; data?: { found: boolean; port: number | null }; error?: string }>;
    getAllMetrics: () => Promise<{ ok: boolean; data?: { metrics: any[] }; error?: string }>;
    syncFromMaster: (agentId: number) => Promise<{ ok: boolean; data?: { success: boolean; message: string; port: number }; error?: string }>;
  };

  // Electron 内部状态
  electron?: {
    getServices: () => Promise<{ ok: boolean; data?: { services: Array<{ id: string; name: string; status: string; dependencies: string[] }> }; error?: string }>;
    getIPCHandlers: () => Promise<{ ok: boolean; data?: { handlers: Array<{ channel: string; description: string | null }> }; error?: string }>;
  };
}

// 暴露安全的 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // Python 日志监听
  onPythonLog: (callback: (log: string) => void) => {
    ipcRenderer.on('python:log', (_event, log: string) => callback(log));
  },

  // Python 错误监听
  onPythonError: (callback: (error: { message: string; timestamp: string }) => void) => {
    ipcRenderer.on('python:error', (_event, error) => callback(error));
  },

  // Python 状态查询
  getPythonStatus: (options?: { includeMetrics?: boolean }) =>
    ipcRenderer.invoke('python:getStatus', options || {}),

  // Python 重启
  restartPython: (reason?: string) => ipcRenderer.invoke('python:restart', { reason }),

  // Gateway Auth Token
  getGatewayAuthToken: () => ipcRenderer.invoke('gateway:getAuthToken', {}),

  // 获取 app 路径
  getAppPath: () => ipcRenderer.invoke('app:getPath', {}),

  // Onboarding 状态
  getOnboardingStatus: () => ipcRenderer.invoke('onboarding:getStatus', {}),
  markOnboardingComplete: () => ipcRenderer.invoke('onboarding:markComplete', {}),
  resetOnboarding: () => ipcRenderer.invoke('onboarding:reset', {}),
  onOnboardingStatus: (callback: (status: { needsOnboarding: boolean }) => void) => {
    ipcRenderer.on('onboarding:status', (_event, status) => callback(status));
  },

  // 在系统默认浏览器中打开 URL
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // 诊断接口 (仅在诊断页面可用)
  getDependencies: () => ipcRenderer.invoke('diagnostic:getDependencies', {}),
  getLogs: (options?: { lines?: number; offset?: number }) =>
    ipcRenderer.invoke('diagnostic:getLogs', options || {}),
  getLogsPath: () => ipcRenderer.invoke('diagnostic:getLogsPath', {}),
  retryStartup: () => ipcRenderer.invoke('diagnostic:retry', {}),

  // Sub Agent 管理
  subAgent: {
    getOrStart: (agentId: number) => ipcRenderer.invoke('sub-agent:getOrStart', { agentId }),
    stop: (agentId: number) => ipcRenderer.invoke('sub-agent:stop', { agentId }),
    getPort: (agentId: number) => ipcRenderer.invoke('sub-agent:getPort', { agentId }),
    getAllMetrics: () => ipcRenderer.invoke('sub-agent:getAllMetrics', {}),
    syncFromMaster: (agentId: number) => ipcRenderer.invoke('sub-agent:syncFromMaster', { agentId }),
  },

  // Electron 内部状态
  electron: {
    getServices: () => ipcRenderer.invoke('electron:getServices', {}),
    getIPCHandlers: () => ipcRenderer.invoke('electron:getIPCHandlers', {}),
  },
} as ElectronAPI);

console.log('[Preload] electronAPI injected successfully');
