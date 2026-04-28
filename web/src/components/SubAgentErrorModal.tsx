interface SubAgentErrorModalProps {
  agentId: number;
  error: string;
  onRetry: () => void;
  onCancel: () => void;
}

/**
 * Sub Agent 启动失败错误弹窗
 *
 * 显示详细错误信息并提供重试/取消选项
 */
export function SubAgentErrorModal({
  agentId,
  error,
  onRetry,
  onCancel,
}: SubAgentErrorModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-[#1a1a1a] border border-red-500/30 p-6 shadow-xl">
        {/* 标题 */}
        <div className="flex items-center gap-2 mb-4">
          <svg
            className="w-6 h-6 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h2 className="text-lg font-semibold text-red-500">
            Sub Agent 启动失败
          </h2>
        </div>

        {/* 错误信息 */}
        <div className="mb-6 space-y-2">
          <p className="text-sm text-gray-300">
            无法启动 <span className="font-mono text-white">Agent #{agentId}</span>
          </p>

          <div className="rounded bg-black/40 p-3 border border-red-500/20">
            <p className="text-xs text-red-400 font-mono break-words">
              {error}
            </p>
          </div>

          <p className="text-xs text-gray-500 mt-3">
            可能的原因：
          </p>
          <ul className="text-xs text-gray-500 list-disc list-inside space-y-1">
            <li>Gateway 进程启动失败</li>
            <li>端口被占用（检查 9000-9010 端口）</li>
            <li>配置文件错误</li>
            <li>审计令牌验证失败</li>
          </ul>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3">
          <button
            onClick={onRetry}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            🔄 重试启动
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            ✕ 取消
          </button>
        </div>

        {/* 底部提示 */}
        <p className="text-xs text-gray-600 mt-4 text-center">
          查看控制台（Cmd+Shift+D）获取详细日志
        </p>
      </div>
    </div>
  );
}
