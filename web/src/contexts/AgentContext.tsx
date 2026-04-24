import { createContext, useContext, type ReactNode } from "react";

interface AgentContextValue {
  isReady: boolean;
  activeAgentId: number | null;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children, value }: { children: ReactNode; value: AgentContextValue }) {
  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgent() {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error("useAgent must be used within AgentProvider");
  }
  return context;
}
