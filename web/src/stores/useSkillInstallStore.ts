/**
 * Zustand store for skill installation state management.
 *
 * IMPORTANT: This store must be initialized BEFORE React Query,
 * as React Query hooks depend on this state.
 */

import { create } from 'zustand';

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TaskState {
  task_id: string;
  status: TaskStatus;
  skill_id: string | null;
  skill_name: string | null;
  source: 'online' | 'upload';
  progress: number; // 0-100
  current_step: string;
  error_message: string | null;
  error_details: Record<string, unknown> | null; // Threat detection details
  queue_position: number | null;
  created_at: number;
  updated_at: number;
  started_at: number | null;
  completed_at: number | null;
}

export interface ConflictResolution {
  task_id: string;
  existing_skill: string;
  action: 'overwrite' | 'keep_both' | 'cancel' | null;
}

interface SkillInstallStore {
  // Active installation tasks
  tasks: Record<string, TaskState>;

  // Conflict resolution state
  conflicts: Record<string, ConflictResolution>;

  // WebSocket connection status
  wsConnected: boolean;

  // Actions
  updateTask: (taskId: string, updates: Partial<TaskState>) => void;
  setTask: (task: TaskState) => void;
  removeTask: (taskId: string) => void;
  clearCompletedTasks: () => void;

  setConflict: (taskId: string, conflict: ConflictResolution) => void;
  resolveConflict: (taskId: string, action: 'overwrite' | 'keep_both' | 'cancel') => void;
  clearConflict: (taskId: string) => void;

  setWsConnected: (connected: boolean) => void;
}

export const useSkillInstallStore = create<SkillInstallStore>((set, _get) => ({
  tasks: {},
  conflicts: {},
  wsConnected: false,

  updateTask: (taskId, updates) => {
    set((state) => ({
      tasks: {
        ...state.tasks,
        [taskId]: {
          ...state.tasks[taskId],
          ...updates,
          updated_at: Date.now() / 1000,
        },
      },
    }));
  },

  setTask: (task) => {
    set((state) => ({
      tasks: {
        ...state.tasks,
        [task.task_id]: task,
      },
    }));
  },

  removeTask: (taskId) => {
    set((state) => {
      const { [taskId]: _, ...rest } = state.tasks;
      return { tasks: rest };
    });
  },

  clearCompletedTasks: () => {
    set((state) => {
      const activeTasks: Record<string, TaskState> = {};
      Object.entries(state.tasks).forEach(([id, task]) => {
        if (task.status !== 'completed' && task.status !== 'failed' && task.status !== 'cancelled') {
          activeTasks[id] = task;
        }
      });
      return { tasks: activeTasks };
    });
  },

  setConflict: (taskId, conflict) => {
    set((state) => ({
      conflicts: {
        ...state.conflicts,
        [taskId]: conflict,
      },
    }));
  },

  resolveConflict: (taskId, action) => {
    set((state) => ({
      conflicts: {
        ...state.conflicts,
        [taskId]: {
          ...state.conflicts[taskId],
          action,
        },
      },
    }));
  },

  clearConflict: (taskId) => {
    set((state) => {
      const { [taskId]: _, ...rest } = state.conflicts;
      return { conflicts: rest };
    });
  },

  setWsConnected: (connected) => {
    set({ wsConnected: connected });
  },
}));

// Selectors for easier access
export const selectTaskById = (taskId: string) => (state: SkillInstallStore) =>
  state.tasks[taskId];

export const selectActiveTask = (state: SkillInstallStore) =>
  Object.values(state.tasks).find(
    (task) => task.status === 'in_progress' || task.status === 'queued'
  );

export const selectHasConflict = (taskId: string) => (state: SkillInstallStore) =>
  !!state.conflicts[taskId];

export const selectAllTasks = (state: SkillInstallStore) =>
  Object.values(state.tasks);
