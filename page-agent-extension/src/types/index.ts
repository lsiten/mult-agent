import type { AgentStatus } from './types'
import type { SupportedLanguage } from './types'

export type { AgentStatus, SupportedLanguage }

export interface AgentActivity {
  type: 'thinking' | 'executing' | 'executed' | 'retrying' | 'error'
  tool?: string
  input?: unknown
  output?: string
  duration?: number
  message?: string
  attempt?: number
  maxAttempts?: number
}

export interface HistoricalEvent {
  type: 'step' | 'observation' | 'user_takeover' | 'retry' | 'error'
  stepIndex?: number
  reflection?: {
    evaluation_previous_goal?: string
    memory?: string
    next_goal?: string
  }
  action?: {
    name: string
    input: unknown
    output: string
  }
  content?: string
  message?: string
  attempt?: number
  maxAttempts?: number
  rawResponse?: unknown
  rawRequest?: unknown
}

export interface ExecutionResult {
  success: boolean
  data: string
  history: HistoricalEvent[]
}
