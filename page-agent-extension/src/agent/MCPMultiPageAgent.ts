import { MCPPageAgentCore, type PageAgentCoreConfig } from './MCPPageAgentCore'

import { RemotePageController } from './RemotePageController'
import { TabsController } from './TabsController'
import SYSTEM_PROMPT from './system_prompt.md?raw'
import { createTabTools } from './tabTools'

function detectLanguage(): 'en-US' | 'zh-CN' {
  const lang = navigator.language || navigator.languages?.[0] || 'en-US'
  return lang.startsWith('zh') ? 'zh-CN' : 'en-US'
}

export interface MCPConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface MCPMultiPageAgentConfig extends Omit<PageAgentCoreConfig, 'mcpConfig'> {
  includeInitialTab?: boolean
  experimentalIncludeAllTabs?: boolean
  mcpConfig: MCPConfig
}

export class MCPMultiPageAgent extends MCPPageAgentCore {
  constructor(config: MCPMultiPageAgentConfig) {
    const tabsController = new TabsController()
    const pageController = new RemotePageController(tabsController)
    const customTools = createTabTools(tabsController)

    const language = config.language ?? detectLanguage()
    const targetLanguage = language === 'zh-CN' ? '中文' : 'English'
    const systemPrompt = SYSTEM_PROMPT.replace(
      /Default working language: \*\*.*?\*\*/,
      `Default working language: **${targetLanguage}**`
    )

    const includeInitialTab = config.includeInitialTab ?? true
    const experimentalIncludeAllTabs = config.experimentalIncludeAllTabs ?? false

    let heartBeatInterval: null | number = null

    super({
      ...config,
      pageController: pageController as any,
      customTools: customTools,
      customSystemPrompt: systemPrompt,
      mcpConfig: config.mcpConfig,

      onBeforeTask: async (agent) => {
        await tabsController.init(agent.task, { includeInitialTab, experimentalIncludeAllTabs })

        heartBeatInterval = window.setInterval(() => {
          chrome.storage.local.set({
            agentHeartbeat: Date.now(),
          })
        }, 1_000)

        await chrome.storage.local.set({
          isAgentRunning: true,
        })
      },

      onAfterTask: async () => {
        if (heartBeatInterval) {
          window.clearInterval(heartBeatInterval)
          heartBeatInterval = null
        }

        await chrome.storage.local.set({
          isAgentRunning: false,
        })
      },

      onBeforeStep: async (agent) => {
        if (!tabsController.currentTabId) return
        await tabsController.waitUntilTabLoaded(tabsController.currentTabId!)
      },

      onDispose: () => {
        if (heartBeatInterval) {
          window.clearInterval(heartBeatInterval)
          heartBeatInterval = null
        }

        chrome.storage.local.set({
          isAgentRunning: false,
        })

        tabsController.dispose()
      },
    })
  }
}
