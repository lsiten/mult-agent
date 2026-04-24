import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Settings, KeyRound, Settings2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { useToast } from '@/hooks/useToast';
import { Toast } from '@/components/Toast';
import { useAgent } from '@/contexts/AgentContext';
import ConfigPage from './ConfigPage';
import EnvPage from './EnvPage';

export default function SettingsPage() {
  const { t } = useI18n();
  const { toast, showToast } = useToast();
  const { activeAgentId } = useAgent();
  const [activeTab, setActiveTab] = useState('config');
  const [isSyncing, setIsSyncing] = useState(false);

  const handleReopenSetup = async () => {
    console.log('[SettingsPage] handleReopenSetup called');

    if (window.electronAPI?.resetOnboarding) {
      try {
        console.log('[SettingsPage] Calling resetOnboarding...');
        const result = await window.electronAPI.resetOnboarding();
        console.log('[SettingsPage] resetOnboarding result:', result);
        showToast(t.config.setupReopened, "success");
      } catch (error) {
        console.error('[SettingsPage] Failed to reopen setup:', error);
        showToast('Failed to reopen setup: ' + error, "error");
      }
    } else {
      console.warn('[SettingsPage] resetOnboarding not available');
      showToast('Setup wizard not available in browser mode', "error");
    }
  };

  const handleSyncFromMaster = async () => {
    if (!activeAgentId) {
      showToast("当前为主 Agent，无需同步", "error");
      return;
    }

    if (!window.electronAPI?.subAgent?.syncFromMaster) {
      showToast("同步功能不可用", "error");
      return;
    }

    setIsSyncing(true);
    try {
      console.log(`[SettingsPage] Syncing Sub Agent ${activeAgentId} from master...`);
      const result = await window.electronAPI.subAgent.syncFromMaster(activeAgentId);
      console.log('[SettingsPage] Sync result:', result);

      if (result?.data?.success) {
        showToast("配置已从主 Agent 同步，Sub Agent 已重启", "success");
        // Wait 2 seconds for Sub Agent to restart
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        showToast(`同步失败: ${result?.error || '未知错误'}`, "error");
      }
    } catch (error) {
      console.error('[SettingsPage] Sync failed:', error);
      showToast(`同步失败: ${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {toast && <Toast toast={toast} />}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">{t.app.nav.settings}</h1>
          {activeAgentId && window.electronAPI?.subAgent?.syncFromMaster && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncFromMaster}
              disabled={isSyncing}
              className="h-8"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isSyncing ? 'animate-spin' : ''}`} />
              从主 Agent 同步配置
            </Button>
          )}
          {window.electronAPI?.resetOnboarding && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReopenSetup}
              className="h-8"
            >
              <Settings2 className="h-3.5 w-3.5 mr-1.5" />
              {t.config.reopenSetup}
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-sm">{t.settings.subtitle}</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-12 bg-transparent p-0">
          <TabsTrigger
            value="config"
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
          >
            <Settings className="w-4 h-4 mr-2" />
            {t.app.nav.config}
          </TabsTrigger>
          <TabsTrigger
            value="keys"
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
          >
            <KeyRound className="w-4 h-4 mr-2" />
            {t.app.nav.keys}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-6">
          <ConfigPage />
        </TabsContent>
        <TabsContent value="keys" className="mt-6">
          <EnvPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
