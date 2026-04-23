/**
 * Skill Installation Modal
 *
 * Two-tab interface for installing skills:
 * 1. Online Search - Search and install from skill registry
 * 2. Upload ZIP - Upload local skill package
 */

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { fetchJSON } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OnlineSearchTab } from './OnlineSearchTab';
import { ZipUploadTab } from './ZipUploadTab';
import { useSkillInstallStore } from '@/stores/useSkillInstallStore';

interface SkillInstallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh?: () => void; // Callback to refresh skills list
}

export function SkillInstallModal({ open, onOpenChange, onRefresh }: SkillInstallModalProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'online' | 'upload'>('online');
  const [refreshKey, setRefreshKey] = useState(0);
  const { setTask } = useSkillInstallStore();

  // Refresh search results when dialog opens
  useEffect(() => {
    if (open) {
      setRefreshKey(prev => prev + 1);
    }
  }, [open]);

  // Refresh skills list when dialog closes (if there were any installations)
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && onRefresh) {
      // Dialog is closing, refresh the parent skills list after a short delay
      console.log('[SkillInstallModal] Dialog closing, triggering parent refresh');
      setTimeout(() => {
        onRefresh();
      }, 500);
    }
    onOpenChange(newOpen);
  };

  const handleOnlineInstall = async (skillId: string, skillName: string, category?: string, sourceId?: string) => {
    console.log('[SkillInstallModal] Starting installation:', { skillId, skillName, category, sourceId });
    try {
      const data = await fetchJSON<{ task_id: string }>('/api/skills/install', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          skill_id: skillId,
          source: 'online',
          source_id: sourceId || 'hermes', // Pass the selected registry source
          category: category || undefined,
        }),
      });

      console.log('[SkillInstallModal] Installation task created:', data.task_id);

      // Add task to store with real task_id from server
      setTask({
        task_id: data.task_id,
        status: 'pending',
        skill_id: skillId,
        skill_name: skillName,
        source: 'online',
        progress: 0,
        current_step: 'Initializing...',
        error_message: null,
        error_details: null,
        queue_position: null,
        created_at: Date.now() / 1000,
        updated_at: Date.now() / 1000,
        started_at: null,
        completed_at: null,
      });
    } catch (err) {
      console.error('[SkillInstall] Failed to start installation:', err);
      // Show error to user (could use toast or alert)
      alert(`Failed to start installation: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleUploadComplete = (taskId: string, skillName: string) => {
    // Close modal immediately to show progress panel
    onOpenChange(false);

    // Add task to store
    setTask({
      task_id: taskId,
      status: 'pending',
      skill_id: null,
      skill_name: skillName,
      source: 'upload',
      progress: 0,
      current_step: 'Initializing...',
      error_message: null,
      error_details: null,
      queue_position: null,
      created_at: Date.now() / 1000,
      updated_at: Date.now() / 1000,
      started_at: null,
      completed_at: null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{t.skills.install.title}</span>
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">{t.common.close}</span>
            </button>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Install skills from online sources or upload ZIP packages
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as 'online' | 'upload')}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="online">
              {t.skills.install.tabs.onlineSearch}
            </TabsTrigger>
            <TabsTrigger value="upload">
              {t.skills.install.tabs.uploadZip}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="online" className="flex-1 overflow-auto mt-4">
            <OnlineSearchTab key={refreshKey} onInstall={handleOnlineInstall} />
          </TabsContent>

          <TabsContent value="upload" className="flex-1 overflow-auto mt-4">
            <ZipUploadTab onUploadComplete={handleUploadComplete} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
