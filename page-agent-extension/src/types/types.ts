export type SupportedLanguage = 'en-US' | 'zh-CN'

export type AgentStatus = 'idle' | 'running' | 'completed' | 'error'

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

export interface AgentReflection {
  evaluation_previous_goal: string
  memory: string
  next_goal: string
}

export interface MacroToolInput extends Partial<AgentReflection> {
  action: Record<string, unknown>
}

export interface MacroToolResult {
  input: MacroToolInput
  output: string
}

export interface AgentStepEvent {
  type: 'step'
  stepIndex: number
  reflection: Partial<AgentReflection>
  action: {
    name: string
    input: unknown
    output: string
  }
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  rawResponse?: unknown
  rawRequest?: unknown
}

export interface ObservationEvent {
  type: 'observation'
  content: string
}

export interface UserTakeoverEvent {
  type: 'user_takeover'
}

export interface RetryEvent {
  type: 'retry'
  message: string
  attempt: number
  maxAttempts: number
}

export interface AgentErrorEvent {
  type: 'error'
  message: string
  rawResponse?: unknown
}

export type HistoricalEvent =
  | AgentStepEvent
  | ObservationEvent
  | UserTakeoverEvent
  | RetryEvent
  | AgentErrorEvent

export interface ExecutionResult {
  success: boolean
  data: string
  history: HistoricalEvent[]
}
