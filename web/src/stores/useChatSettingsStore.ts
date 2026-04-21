import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ChatSettingsState {
  // Display settings
  hideToolCalls: boolean;

  // Actions
  setHideToolCalls: (hide: boolean) => void;
  toggleToolCallsVisibility: () => void;
}

export const useChatSettingsStore = create<ChatSettingsState>()(
  persist(
    (set) => ({
      hideToolCalls: false,

      setHideToolCalls: (hide) => set({ hideToolCalls: hide }),

      toggleToolCallsVisibility: () =>
        set((state) => ({ hideToolCalls: !state.hideToolCalls })),
    }),
    {
      name: 'chat-settings',
    }
  )
);
