import type {
  AgentActivity,
  AgentStatus,
  ExecutionResult,
  HistoricalEvent,
  SupportedLanguage,
} from '@page-agent/core'
import { useCallback, useEffect, useRef, useState } from 'react'

import { MCPMultiPageAgent, type MCPConfig } from './MCPMultiPageAgent'

export type LanguagePreference = SupportedLanguage | undefined

export interface AdvancedConfig {
  maxSteps?: number
  systemInstruction?: string
  experimentalLlmsTxt?: boolean
  experimentalIncludeAllTabs?: boolean
  disableNamedToolChoice?: boolean
}

export interface MCPConfigInput extends AdvancedConfig {
  language?: LanguagePreference
  mcpConfig: MCPConfig
}

export interface UseMCPAgentResult {
  status: AgentStatus
  history: HistoricalEvent[]
  activity: AgentActivity | null
  currentTask: string
  config: MCPConfigInput | null
  execute: (task: string) => Promise<ExecutionResult>
  stop: () => void
  configure: (config: MCPConfigInput) => Promise<void>
}

export function useMCPAgent(): UseMCPAgentResult {
  const agentRef = useRef<MCPMultiPageAgent | null>(null)
  const [status, setStatus] = useState<AgentStatus>('idle')
  const [history, setHistory] = useState<HistoricalEvent[]>([])
  const [activity, setActivity] = useState<AgentActivity | null>(null)
  const [currentTask, setCurrentTask] = useState('')
  const [config, setConfig] = useState<MCPConfigInput | null>(null)

  useEffect(() => {
    chrome.storage.local.get(['mcpConfig', 'language', 'advancedConfig']).then((result) => {
      const mcpConfig = result.mcpConfig as MCPConfig | undefined
      const language = (result.language as SupportedLanguage) || undefined
      const advancedConfig = (result.advancedConfig as AdvancedConfig) ?? {}

      if (mcpConfig) {
        setConfig({ ...mcpConfig, ...advancedConfig, language })
      }
    })
  }, [])

  useEffect(() => {
    if (!config) return

    const { systemInstruction, mcpConfig, ...agentConfig } = config
    const agent = new MCPMultiPageAgent({
      ...agentConfig,
      mcpConfig: mcpConfig,
      instructions: systemInstruction ? { system: systemInstruction } : undefined,
    })
    agentRef.current = agent

    const handleStatusChange = (e: Event) => {
      const newStatus = agent.status as AgentStatus
      setStatus(newStatus)
      if (newStatus === 'idle' || newStatus === 'completed' || newStatus === 'error') {
        setActivity(null)
      }
    }

    const handleHistoryChange = (e: Event) => {
      setHistory([...agent.history])
    }

    const handleActivity = (e: Event) => {
      const newActivity = (e as CustomEvent).detail as AgentActivity
      setActivity(newActivity)
    }

    agent.addEventListener('statuschange', handleStatusChange)
    agent.addEventListener('historychange', handleHistoryChange)
    agent.addEventListener('activity', handleActivity)

    return () => {
      agent.removeEventListener('statuschange', handleStatusChange)
      agent.removeEventListener('historychange', handleHistoryChange)
      agent.removeEventListener('activity', handleActivity)
      agent.dispose()
    }
  }, [config])

  const execute = useCallback(async (task: string) => {
    const agent = agentRef.current
    console.log('🚀 [useMCPAgent] start executing task:', task)
    if (!agent) throw new Error('Agent not initialized')

    setCurrentTask(task)
    setHistory([])
    return agent.execute(task)
  }, [])

  const stop = useCallback(() => {
    agentRef.current?.stop()
  }, [])

  const configure = useCallback(
    async ({
      language,
      maxSteps,
      systemInstruction,
      experimentalLlmsTxt,
      experimentalIncludeAllTabs,
      disableNamedToolChoice,
      mcpConfig,
    }: MCPConfigInput) => {
      await chrome.storage.local.set({ mcpConfig })
      if (language) {
        await chrome.storage.local.set({ language })
      } else {
        await chrome.storage.local.remove('language')
      }
      const advancedConfig: AdvancedConfig = {
        maxSteps,
        systemInstruction,
        experimentalLlmsTxt,
        experimentalIncludeAllTabs,
        disableNamedToolChoice,
      }
      await chrome.storage.local.set({ advancedConfig })
      setConfig({ ...{ mcpConfig }, ...advancedConfig, language })
    },
    []
  )

  return {
    status,
    history,
    activity,
    currentTask,
    config,
    execute,
    stop,
    configure,
  }
}
