/**
 * Hook for monitoring skill installation progress
 *
 * Polls /api/skills/install/{task_id} every 500ms to track progress
 * Updates Zustand store with latest task state
 */

import { useEffect, useRef } from 'react';
import { useSkillInstallStore } from '@/stores/useSkillInstallStore';
import type { TaskState } from '@/stores/useSkillInstallStore';
import { fetchJSON } from '@/lib/api';

export function useInstallProgress(taskId: string | null) {
  const { updateTask, tasks } = useSkillInstallStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!taskId) return;

    const task = tasks[taskId];
    if (!task) return;

    // Don't poll if task is in terminal state
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return;
    }

    // Start polling
    const pollStatus = async () => {
      try {
        const data = await fetchJSON<TaskState>(`/api/skills/install/${taskId}`, {
          method: 'GET',
        });

        // Update store
        updateTask(taskId, {
          status: data.status,
          progress: data.progress,
          current_step: data.current_step,
          queue_position: data.queue_position,
          error_message: data.error_message,
          error_details: data.error_details,
          started_at: data.started_at,
          completed_at: data.completed_at,
        });

        // Stop polling if reached terminal state
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
          clearInterval(intervalRef.current!);
        }
      } catch (err: any) {
        console.error('[useInstallProgress] Failed to fetch installation status:', err);

        // Stop polling on 404 (task not found)
        if (err?.message?.includes('404') || err?.status === 404) {
          clearInterval(intervalRef.current!);
          return;
        }

        // Don't stop polling on other errors, retry next interval
      }
    };

    // Initial poll
    pollStatus();

    // Set up interval (500ms)
    intervalRef.current = setInterval(pollStatus, 500);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [taskId, tasks, updateTask]);
}

/**
 * Hook for monitoring all active installation tasks
 */
export function useActiveInstallations() {
  const { tasks } = useSkillInstallStore();

  const activeTasks = Object.values(tasks).filter(
    (task) =>
      task.status === 'pending' ||
      task.status === 'queued' ||
      task.status === 'in_progress'
  );

  // Monitor each active task
  activeTasks.forEach((task) => {
    useInstallProgress(task.task_id);
  });

  return activeTasks;
}
