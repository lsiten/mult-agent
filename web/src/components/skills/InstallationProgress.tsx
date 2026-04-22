/**
 * Installation Progress Component
 *
 * Displays real-time progress for skill installation tasks
 */

import { useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSkillInstallStore } from '@/stores/useSkillInstallStore';
// import type { TaskState } from '@/stores/useSkillInstallStore';
import { useInstallProgress } from '@/hooks/useInstallProgress';

interface InstallationProgressProps {
  taskId: string;
  onClose?: () => void;
  autoCloseOnSuccess?: boolean;
}

export function InstallationProgress({
  taskId,
  onClose,
  autoCloseOnSuccess = true,
}: InstallationProgressProps) {
  const { t } = useI18n();
  const { tasks, removeTask } = useSkillInstallStore();
  const task = tasks[taskId];

  // Start monitoring progress
  useInstallProgress(taskId);

  // Auto-close on success (2s) or failure (5s)
  useEffect(() => {
    if (task?.status === 'completed' && autoCloseOnSuccess) {
      const timer = setTimeout(() => {
        removeTask(taskId);
        onClose?.();
      }, 2000);
      return () => clearTimeout(timer);
    }

    // Auto-close failed tasks after 5 seconds (longer so user can read error)
    if (task?.status === 'failed') {
      const timer = setTimeout(() => {
        removeTask(taskId);
        onClose?.();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [task?.status, autoCloseOnSuccess, taskId, removeTask, onClose]);

  if (!task) {
    return null;
  }

  const handleCancel = async () => {
    try {
      await fetch(`/api/skills/install/${taskId}/cancel`, {
        method: 'POST',
        headers: {
          // Authorization auto-added by fetchJSON
        },
      });
    } catch (err) {
      console.error('Failed to cancel installation:', err);
    }
  };

  const handleClose = () => {
    removeTask(taskId);
    onClose?.();
  };

  return (
    <Card className="border-2 border-primary/30 bg-card shadow-2xl">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Status Icon */}
          <div className="shrink-0 mt-1">
            {task.status === 'completed' && (
              <CheckCircle className="h-5 w-5 text-green-500" />
            )}
            {task.status === 'failed' && (
              <XCircle className="h-5 w-5 text-destructive" />
            )}
            {task.status === 'cancelled' && (
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
            )}
            {(task.status === 'pending' ||
              task.status === 'queued' ||
              task.status === 'in_progress') && (
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Skill Name & Status Badge */}
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-medium text-sm truncate">{task.skill_name}</h4>
              <Badge
                variant={
                  task.status === 'completed'
                    ? 'success'
                    : task.status === 'failed'
                    ? 'destructive'
                    : 'default'
                }
                className="text-[10px]"
              >
                {getStatusText(task.status, t)}
              </Badge>
            </div>

            {/* Progress Bar */}
            {(task.status === 'in_progress' || task.status === 'queued') && (
              <div className="mb-2">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Current Step / Queue Position */}
            <p className="text-xs text-muted-foreground mb-2">
              {task.status === 'queued' && task.queue_position
                ? t.skills.install.progress.queued.replace(
                    '{position}',
                    String(task.queue_position)
                  )
                : task.current_step}
            </p>

            {/* Error Message */}
            {task.error_message && (
              <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded">
                <p className="text-xs text-destructive">{task.error_message}</p>
                {task.error_details && (
                  <details className="mt-1">
                    <summary className="text-[10px] text-destructive/80 cursor-pointer">
                      Details
                    </summary>
                    <pre className="mt-1 text-[10px] text-destructive/70 overflow-auto">
                      {JSON.stringify(task.error_details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {(task.status === 'pending' ||
              task.status === 'queued' ||
              task.status === 'in_progress') && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancel}
                className="h-7 px-2"
              >
                {t.common.cancel}
              </Button>
            )}
            {(task.status === 'completed' ||
              task.status === 'failed' ||
              task.status === 'cancelled') && (
              <button
                onClick={handleClose}
                className="p-1 rounded hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Container component that shows all active installation tasks
 */
export function InstallationProgressList({ onClose }: { onClose?: () => void }) {
  const { tasks } = useSkillInstallStore();
  // Show tasks that are running OR just finished (for brief notification)
  // Failed/completed/cancelled tasks will auto-remove after timeout
  const activeTasks = Object.values(tasks).filter(
    (task) =>
      task.status === 'pending' ||
      task.status === 'queued' ||
      task.status === 'in_progress' ||
      task.status === 'failed' ||
      task.status === 'completed'
  );

  if (activeTasks.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 max-w-[calc(100vw-2rem)] z-[9999] space-y-2 pointer-events-none">
      <div className="pointer-events-auto space-y-2">
        {activeTasks.map((task) => (
          <InstallationProgress
            key={task.task_id}
            taskId={task.task_id}
            onClose={onClose}
          />
        ))}
      </div>
    </div>
  );
}

function getStatusText(status: string, t: any): string {
  switch (status) {
    case 'pending':
      return t.skills.install.progress.pending;
    case 'queued':
      return t.skills.install.progress.queued.split(' ')[0]; // Just "排队中" without position
    case 'in_progress':
      return t.skills.install.progress.inProgress;
    case 'completed':
      return t.skills.install.progress.completed;
    case 'failed':
      return t.skills.install.progress.failed;
    case 'cancelled':
      return t.skills.install.progress.cancelled;
    default:
      return status;
  }
}
