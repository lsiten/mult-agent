import { useState, useEffect } from "react";
import { useI18n } from "@/i18n";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PROVIDER_CONFIGS } from "@/lib/providers";

// API base URL for Electron environment
const API_BASE = typeof window !== 'undefined' && (window as any).electronAPI
  ? 'http://localhost:8642'
  : '';

interface OptionalFeaturesStepProps {
  selectedProvider: string;
  formData: Record<string, string>;
  configuredKeys?: Set<string>;
  onFieldChange: (key: string, value: string) => void;
}

type BrowserMode = "plugin" | "local" | "cdp" | "browserbase" | null;

export function OptionalFeaturesStep({
  selectedProvider,
  formData,
  configuredKeys = new Set(),
  onFieldChange,
}: OptionalFeaturesStepProps) {
  const { t } = useI18n();

  const provider = PROVIDER_CONFIGS.find((p) => p.id === selectedProvider);
  const providerSupportsVision = provider?.supportsVision || false;

  const [visionEnabled, setVisionEnabled] = useState(
    !!formData.FAL_KEY || configuredKeys.has("FAL_KEY")
  );
  const [browserMode, setBrowserMode] = useState<BrowserMode>(
    formData.BROWSER_CDP_URL || configuredKeys.has("BROWSER_CDP_URL") ? "cdp" :
    formData.BROWSERBASE_API_KEY || configuredKeys.has("BROWSERBASE_API_KEY") ? "browserbase" :
    "plugin" // Default to browser plugin
  );
  const [exaEnabled, setExaEnabled] = useState(
    !!formData.EXA_API_KEY || configuredKeys.has("EXA_API_KEY")
  );
  const [firecrawlEnabled, setFirecrawlEnabled] = useState(
    !!formData.FIRECRAWL_API_KEY || configuredKeys.has("FIRECRAWL_API_KEY")
  );

  // CDP configuration states
  const [cdpHost, setCdpHost] = useState("localhost");
  const [cdpPort, setCdpPort] = useState("9222");
  const [detectingChrome, setDetectingChrome] = useState(false);
  const [cdpStatus, setCdpStatus] = useState<{ type: "success" | "error" | "info", message: string } | null>(null);

  const handleBrowserModeChange = (mode: BrowserMode) => {
    setBrowserMode(mode);
    // Clear other browser config when changing mode
    if (mode !== "cdp") {
      onFieldChange("BROWSER_CDP_URL", "");
      setCdpStatus(null);
    }
    if (mode !== "browserbase") {
      onFieldChange("BROWSERBASE_API_KEY", "");
      onFieldChange("BROWSERBASE_PROJECT_ID", "");
    }
    if (mode !== "local") {
      onFieldChange("EXTENSION_BRIDGE_ENABLED", "");
    }
  };

  // Poll for new CDP configuration when in CDP mode
  useEffect(() => {
    if (browserMode !== "cdp") return;

    let intervalId: ReturnType<typeof setInterval>;

    const checkForNewCDP = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/browser/latest-cdp`);
        const data = await response.json();

        if (data.ok && data.wsUrl && data.wsUrl !== formData.BROWSER_CDP_URL) {
          // New CDP configuration detected!
          onFieldChange("BROWSER_CDP_URL", data.wsUrl);
          setCdpHost(data.host || "localhost");
          setCdpPort(String(data.port || 9222));
          setCdpStatus({
            type: "success",
            message: `✓ 自动检测成功！\n已从配置向导中获取连接信息\n主机: ${data.host}:${data.port}`
          });
        }
      } catch (error) {
        // Silently fail, don't disturb the user
        console.debug("Failed to check for new CDP:", error);
      }
    };

    // Check immediately and then every 2 seconds
    checkForNewCDP();
    intervalId = setInterval(checkForNewCDP, 2000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [browserMode, formData.BROWSER_CDP_URL, onFieldChange]);

  const testCdpConnection = async () => {
    if (!cdpHost || !cdpPort) {
      setCdpStatus({
        type: "error",
        message: "请填写主机和端口"
      });
      return;
    }

    setDetectingChrome(true);
    setCdpStatus({
      type: "info",
      message: "正在测试连接..."
    });

    try {
      // Test connection to Chrome DevTools Protocol
      const response = await fetch(`http://${cdpHost}:${cdpPort}/json/version`, {
        signal: AbortSignal.timeout(3000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const wsUrl = data.webSocketDebuggerUrl;

      if (!wsUrl) {
        throw new Error("未找到 WebSocket 调试端点");
      }

      // Connection successful
      onFieldChange("BROWSER_CDP_URL", wsUrl);
      setCdpStatus({
        type: "success",
        message: `✓ 连接成功！\n版本: ${data.Browser || "Unknown"}`
      });
    } catch (error: any) {
      console.error("CDP connection test failed:", error);
      setCdpStatus({
        type: "error",
        message: `连接失败: ${error.message || "请确保 Chrome 已启动并开启远程调试"}`
      });
    } finally {
      setDetectingChrome(false);
    }
  };


  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-2">
          {t.onboarding.step3.title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t.onboarding.step3.subtitle}
        </p>
      </div>

      <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full">
        <p className="text-sm text-muted-foreground text-center">
          💡 {t.onboarding.step3.skipNote}
        </p>

        {/* Vision/Image Generation Section */}
        <div className="border border-border p-4 rounded-lg flex flex-col gap-3">
          <div className="font-semibold">
            🎨 {t.onboarding.step3.visionSection}
          </div>
          <p className="text-xs text-muted-foreground">
            {t.onboarding.step3.visionDescription}
          </p>

          {providerSupportsVision ? (
            <div className="ml-2 p-3 bg-green-500/10 text-green-600 dark:text-green-400 rounded text-sm">
              ✓ {t.onboarding.step3.visionSupported || `The selected provider (${provider?.name}) has built-in vision/multimodal support. No additional configuration needed.`}
            </div>
          ) : (
            <div className="ml-2 flex flex-col gap-3">
              <div className="p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded text-xs">
                ℹ️ {t.onboarding.step3.visionNotSupported || `The selected provider does not support vision. You can configure FAL.ai for image generation, or the system will automatically use fallback vision providers.`}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="vision-enabled"
                  checked={visionEnabled}
                  onCheckedChange={(checked) => {
                    setVisionEnabled(!!checked);
                    if (!checked) onFieldChange("FAL_KEY", "");
                  }}
                />
                <Label htmlFor="vision-enabled" className="cursor-pointer">
                  {t.onboarding.step3.falKeyLabel}
                </Label>
              </div>
              {visionEnabled && (
                <div className="ml-6 flex flex-col gap-2">
                  <Input
                    id="fal-key"
                    type="password"
                    placeholder={t.onboarding.step3.falKeyPlaceholder}
                    value={formData.FAL_KEY || ""}
                    onChange={(e) => onFieldChange("FAL_KEY", e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Browser Automation Section */}
        <div className="border border-border p-4 rounded-lg flex flex-col gap-3">
          <div className="font-semibold">
            🖥️ {t.onboarding.step3.browserSection}
          </div>
          <p className="text-xs text-muted-foreground">
            {t.onboarding.step3.browserDescription}
          </p>

          {/* Browser Mode Selection */}
          <div className="flex flex-col gap-3 ml-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="browser-mode"
                checked={browserMode === "plugin"}
                onChange={() => handleBrowserModeChange("plugin")}
              />
              <span className="text-sm">{t.onboarding.step3.browserModePlugin || "浏览器插件（推荐）"}</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="browser-mode"
                checked={browserMode === "local"}
                onChange={() => handleBrowserModeChange("local")}
              />
              <span className="text-sm">{t.onboarding.step3.browserModeLocal}</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="browser-mode"
                checked={browserMode === "cdp"}
                onChange={() => handleBrowserModeChange("cdp")}
              />
              <span className="text-sm">{t.onboarding.step3.browserModeCdp}</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="browser-mode"
                checked={browserMode === "browserbase"}
                onChange={() => handleBrowserModeChange("browserbase")}
              />
              <span className="text-sm">{t.onboarding.step3.browserModeBrowserbase}</span>
            </label>
          </div>

          {/* Browser Plugin Installation Guide */}
          {browserMode === "plugin" && (
            <div className="ml-6 flex flex-col gap-3 bg-muted/30 p-3 rounded">
              <div className="text-xs bg-blue-500/10 border border-blue-500/30 p-3 rounded">
                <p className="font-medium mb-2 text-blue-700 dark:text-blue-400">📦 浏览器插件安装指南</p>
                <p className="text-muted-foreground mb-2">
                  请按照以下步骤安装浏览器插件：
                </p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>打开浏览器扩展商店</li>
                  <li>搜索并安装 'Page Agent Browser Plugin'</li>
                  <li>安装完成后刷新页面</li>
                  <li>点击浏览器工具栏中的插件图标，授予所需的页面访问权限</li>
                </ol>
                <p className="mt-2 text-green-600 dark:text-green-400">
                  ✓ 验证: 在浏览器扩展列表中看到 'Page Agent Browser Plugin' 且状态为'已启用'
                </p>
              </div>
            </div>
          )}

          {/* Extension Bridge Configuration (Legacy) */}
          {browserMode === "local" && (
            <div className="ml-6 flex flex-col gap-3 bg-muted/30 p-3 rounded">
              <div className="text-xs bg-amber-500/10 border border-amber-500/30 p-3 rounded">
                <p className="font-medium mb-2 text-amber-700 dark:text-amber-400">⚠️ 扩展桥接模式（旧版）</p>
                <p className="text-muted-foreground mb-2">
                  此模式需要额外的桥接服务器。推荐使用浏览器插件模式。
                </p>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="extension-bridge-enabled"
                    checked={formData.EXTENSION_BRIDGE_ENABLED === "true"}
                    onCheckedChange={(checked) => {
                      onFieldChange("EXTENSION_BRIDGE_ENABLED", checked ? "true" : "");
                    }}
                  />
                  <Label htmlFor="extension-bridge-enabled" className="cursor-pointer text-xs">
                    启用扩展桥接 (EXTENSION_BRIDGE_ENABLED=true)
                  </Label>
                </div>
              </div>
            </div>
          )}

          {/* CDP Configuration */}
          {browserMode === "cdp" && (
            <div className="ml-6 flex flex-col gap-3 bg-muted/30 p-3 rounded">
              {/* Guided Setup Option */}
              <div className="text-xs bg-green-500/10 border border-green-500/30 p-3 rounded">
                <p className="font-medium mb-2 text-green-700 dark:text-green-400">✨ 推荐：使用引导式配置</p>
                <p className="text-muted-foreground mb-2">
                  点击下方按钮在您的默认浏览器中打开配置向导，自动检测并完成配置
                </p>
                <button
                  onClick={() => {
                    const url = "http://localhost:8642/setup-cdp";
                    if ((window as any).electronAPI?.openExternal) {
                      (window as any).electronAPI.openExternal(url);
                    } else {
                      window.open(url, "_blank");
                    }
                  }}
                  className="inline-block bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors cursor-pointer"
                >
                  🚀 在浏览器中打开配置向导
                </button>
              </div>

              {/* Manual Setup Option */}
              <details className="text-xs">
                <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                  或者手动配置（高级用户）
                </summary>
                <div className="mt-2 text-muted-foreground bg-blue-500/10 p-2 rounded">
                  <p className="font-medium mb-1">💡 手动配置步骤：</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>关闭所有 Chrome 窗口</li>
                    <li>在终端运行：<code className="bg-background px-1 rounded">chrome --remote-debugging-port=9222</code></li>
                    <li>填写下方连接信息并点击"测试连接"</li>
                  </ol>
                </div>
              </details>

              {/* Host and Port Input */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor="cdp-host" className="text-xs">主机</Label>
                  <Input
                    id="cdp-host"
                    type="text"
                    placeholder="localhost"
                    value={cdpHost}
                    onChange={(e) => setCdpHost(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="w-24">
                  <Label htmlFor="cdp-port" className="text-xs">端口</Label>
                  <Input
                    id="cdp-port"
                    type="text"
                    placeholder="9222"
                    value={cdpPort}
                    onChange={(e) => setCdpPort(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Test Connection Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={testCdpConnection}
                disabled={detectingChrome}
              >
                {detectingChrome ? "测试中..." : "测试连接"}
              </Button>

              {/* Status Message */}
              {cdpStatus && (
                <div className={`text-xs p-2 rounded whitespace-pre-wrap ${
                  cdpStatus.type === "success" ? "bg-green-500/10 text-green-600" :
                  cdpStatus.type === "error" ? "bg-destructive/10 text-destructive" :
                  "bg-blue-500/10 text-blue-600"
                }`}>
                  {cdpStatus.message}
                </div>
              )}

              {/* Connected Status */}
              {formData.BROWSER_CDP_URL && cdpStatus?.type === "success" && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-green-600">✓ 已连接</span>
                  <code className="text-xs bg-background p-1 rounded flex-1 truncate">
                    {cdpHost}:{cdpPort}
                  </code>
                </div>
              )}
            </div>
          )}

          {/* Browserbase Configuration */}
          {browserMode === "browserbase" && (
            <div className="ml-6 flex flex-col gap-3 bg-muted/30 p-3 rounded">
              <div className="flex flex-col gap-2">
                <Label htmlFor="browserbase-key">{t.onboarding.step3.browserbaseApiKeyLabel}</Label>
                <Input
                  id="browserbase-key"
                  type="password"
                  placeholder="bb_..."
                  value={formData.BROWSERBASE_API_KEY || ""}
                  onChange={(e) => onFieldChange("BROWSERBASE_API_KEY", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="browserbase-project">{t.onboarding.step3.browserbaseProjectIdLabel}</Label>
                <Input
                  id="browserbase-project"
                  type="text"
                  placeholder="project_..."
                  value={formData.BROWSERBASE_PROJECT_ID || ""}
                  onChange={(e) => onFieldChange("BROWSERBASE_PROJECT_ID", e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Web Search Section */}
        <div className="border border-border p-4 rounded-lg flex flex-col gap-3">
          <div className="font-semibold">
            🌐 {t.onboarding.step3.searchSection}
          </div>
          <p className="text-xs text-muted-foreground">
            {t.onboarding.step3.searchDescription}
          </p>

          {/* Exa */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="exa-enabled"
                checked={exaEnabled}
                onCheckedChange={(checked) => {
                  setExaEnabled(!!checked);
                  if (!checked) onFieldChange("EXA_API_KEY", "");
                }}
              />
              <Label htmlFor="exa-enabled" className="cursor-pointer">
                {t.onboarding.step3.exaLabel}
              </Label>
            </div>
            {exaEnabled && (
              <Input
                type="password"
                placeholder={t.onboarding.step3.exaPlaceholder}
                value={formData.EXA_API_KEY || ""}
                onChange={(e) => onFieldChange("EXA_API_KEY", e.target.value)}
                className="ml-6"
              />
            )}
          </div>

          {/* Firecrawl */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="firecrawl-enabled"
                checked={firecrawlEnabled}
                onCheckedChange={(checked) => {
                  setFirecrawlEnabled(!!checked);
                  if (!checked) onFieldChange("FIRECRAWL_API_KEY", "");
                }}
              />
              <Label htmlFor="firecrawl-enabled" className="cursor-pointer">
                {t.onboarding.step3.firecrawlLabel}
              </Label>
            </div>
            {firecrawlEnabled && (
              <Input
                type="password"
                placeholder={t.onboarding.step3.firecrawlPlaceholder}
                value={formData.FIRECRAWL_API_KEY || ""}
                onChange={(e) => onFieldChange("FIRECRAWL_API_KEY", e.target.value)}
                className="ml-6"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
