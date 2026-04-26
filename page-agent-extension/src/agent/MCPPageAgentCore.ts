import type { BrowserState, PageController } from '@page-agent/page-controller'
import * as z from 'zod/v4'

import SYSTEM_PROMPT from './system_prompt.md?raw'
import { tools } from './tools'
import type {
  AgentActivity,
  AgentConfig,
  AgentReflection,
  AgentStatus,
  AgentStepEvent,
  ExecutionResult,
  HistoricalEvent,
  MacroToolInput,
  MacroToolResult,
} from './types'
import { assert, fetchLlmsTxt, normalizeResponse, uid, waitFor } from './utils'
import { MCPClient } from '../mcp/MCPClient'

export { tool, type PageAgentTool } from './tools'
export type * from './types'

export type PageAgentCoreConfig = Omit<AgentConfig, 'model' | 'apiKey' | 'baseURL'> & {
  pageController: PageController
  mcpConfig?: {
    command: string
    args?: string[]
    env?: Record<string, string>
  }
}

export class MCPPageAgentCore extends EventTarget {
  readonly id = uid()
  readonly config: PageAgentCoreConfig & { maxSteps: number }
  readonly tools: typeof tools
  readonly pageController: PageController

  task = ''
  taskId = ''
  history: HistoricalEvent[] = []
  disposed = false

  onAskUser?: (question: string) => Promise<string>

  #status: AgentStatus = 'idle'
  #mcpClient: MCPClient | null = null
  #abortController = new AbortController()
  #observations: string[] = []

  #states = {
    totalWaitTime: 0,
    lastURL: '',
    browserState: null as BrowserState | null,
  }

  constructor(config: PageAgentCoreConfig) {
    super()

    this.config = { ...config, maxSteps: config.maxSteps ?? 40 }

    this.tools = new Map(tools)
    this.pageController = config.pageController

    if (config.mcpConfig) {
      this.#mcpClient = new MCPClient({
        mcpServers: { default: config.mcpConfig },
      })
    }

    if (this.config.customTools) {
      for (const [name, tool] of Object.entries(this.config.customTools)) {
        if (tool === null) {
          this.tools.delete(name)
          continue
        }
        this.tools.set(name, tool)
      }
    }

    if (!this.config.experimentalScriptExecutionTool) {
      this.tools.delete('execute_javascript')
    }
  }

  get status(): AgentStatus {
    return this.#status
  }

  #emitStatusChange(): void {
    this.dispatchEvent(new Event('statuschange'))
  }

  #emitHistoryChange(): void {
    this.dispatchEvent(new Event('historychange'))
  }

  #emitActivity(activity: AgentActivity): void {
    this.dispatchEvent(new CustomEvent('activity', { detail: activity }))
  }

  #setStatus(status: AgentStatus): void {
    if (this.#status !== status) {
      this.#status = status
      this.#emitStatusChange()
    }
  }

  pushObservation(content: string): void {
    this.#observations.push(content)
  }

  stop() {
    this.pageController.cleanUpHighlights()
    this.pageController.hideMask()
    this.#abortController.abort()
  }

  async connectMCP(): Promise<void> {
    if (this.#mcpClient) {
      await this.#mcpClient.connect()
    }
  }

  async execute(task: string): Promise<ExecutionResult> {
    if (this.disposed) throw new Error('PageAgent has been disposed. Create a new instance.')
    if (!task) throw new Error('Task is required')
    this.task = task
    this.taskId = uid()

    if (!this.onAskUser) {
      this.tools.delete('ask_user')
    }

    const onBeforeStep = this.config.onBeforeStep
    const onAfterStep = this.config.onAfterStep
    const onBeforeTask = this.config.onBeforeTask
    const onAfterTask = this.config.onAfterTask

    await onBeforeTask?.(this)

    await this.pageController.showMask()

    if (this.#abortController) {
      this.#abortController.abort()
      this.#abortController = new AbortController()
    }

    this.history = []
    this.#setStatus('running')
    this.#emitHistoryChange()
    this.#observations = []

    this.#states = { totalWaitTime: 0, lastURL: '', browserState: null }

    if (this.#mcpClient && !this.#mcpClient.isConnected()) {
      try {
        await this.#mcpClient.connect()
      } catch (error) {
        console.error('[MCPPageAgentCore] Failed to connect MCP:', error)
      }
    }

    let step = 0

    while (true) {
      try {
        console.group(`step: ${step}`)

        await onBeforeStep?.(this, step)

        console.log('👀 Observing...')

        this.#states.browserState = await this.pageController.getBrowserState()
        await this.#handleObservations(step)

        const userPrompt = await this.#assembleUserPrompt()
        const macroTool = { AgentOutput: this.#packMacroTool() }

        console.log('🧠 Thinking...')
        this.#emitActivity({ type: 'thinking' })

        const result = await this.#invokeMCPAgent(
          userPrompt,
          macroTool,
          this.#abortController.signal
        )

        const macroResult = result.toolResult as MacroToolResult
        const input = macroResult.input
        const output = macroResult.output
        const reflection: Partial<AgentReflection> = {
          evaluation_previous_goal: input.evaluation_previous_goal,
          memory: input.memory,
          next_goal: input.next_goal,
        }
        const actionName = Object.keys(input.action)[0]
        const action: AgentStepEvent['action'] = {
          name: actionName,
          input: input.action[actionName],
          output: output,
        }

        this.history.push({
          type: 'step',
          stepIndex: step,
          reflection,
          action,
          usage: result.usage,
          rawResponse: result.rawResponse,
          rawRequest: result.rawRequest,
        } as AgentStepEvent)
        this.#emitHistoryChange()

        await onAfterStep?.(this, this.history)

        console.groupEnd()

        if (actionName === 'done') {
          const success = action.input?.success ?? false
          const text = action.input?.text || 'no text provided'
          console.log('Task completed', success, text)
          this.#onDone(success)
          const result: ExecutionResult = {
            success,
            data: text,
            history: this.history,
          }
          await onAfterTask?.(this, result)
          return result
        }
      } catch (error: unknown) {
        console.groupEnd()
        const isAbortError = (error as any)?.name === 'AbortError'

        console.error('Task failed', error)
        const errorMessage = isAbortError ? 'Task stopped' : String(error)
        this.#emitActivity({ type: 'error', message: errorMessage })
        this.history.push({ type: 'error', message: errorMessage, rawResponse: error })
        this.#emitHistoryChange()
        this.#onDone(false)
        const result: ExecutionResult = {
          success: false,
          data: errorMessage,
          history: this.history,
        }
        await onAfterTask?.(this, result)
        return result
      }

      step++
      if (step > this.config.maxSteps) {
        const errorMessage = 'Step count exceeded maximum limit'
        this.history.push({ type: 'error', message: errorMessage })
        this.#emitHistoryChange()
        this.#onDone(false)
        const result: ExecutionResult = {
          success: false,
          data: errorMessage,
          history: this.history,
        }
        await onAfterTask?.(this, result)
        return result
      }

      await waitFor(this.config.stepDelay ?? 0.4)
    }
  }

  async #invokeMCPAgent(
    userPrompt: string,
    macroTool: { AgentOutput: any },
    signal: AbortSignal
  ): Promise<{
    toolResult: MacroToolResult
    usage: { promptTokens: number; completionTokens: number; totalTokens: number }
    rawResponse?: unknown
    rawRequest?: unknown
  }> {
    const actionSchemas = Array.from(this.tools.entries()).map(([toolName, tool]) => {
      return z.object({ [toolName]: tool.inputSchema }).describe(tool.description)
    })

    const actionSchema = z.union(actionSchemas as unknown as [z.ZodType, z.ZodType, ...z.ZodType[]])

    const reflectionSchema = z.object({
      evaluation_previous_goal: z.string().optional(),
      memory: z.string().optional(),
      next_goal: z.string().optional(),
      action: actionSchema,
    })

    const reflection = reflectionSchema.safeParse(
      this.#parseJSONP(userPrompt)
    )

    let input: MacroToolInput
    if (reflection.success) {
      input = reflection.data
    } else {
      const defaultReflection: Partial<AgentReflection> = {
        evaluation_previous_goal: 'Initial step',
        memory: '',
        next_goal: this.task,
      }
      input = {
        ...defaultReflection,
        action: { done: { success: false, text: 'Failed to parse reflection' } },
      }
    }

    const toolName = Object.keys(input.action)[0]
    const toolInput = input.action[toolName]

    const tool = this.tools.get(toolName)
    if (!tool) {
      input = {
        ...input,
        action: { done: { success: false, text: `Tool ${toolName} not found` } },
      }
    } else {
      try {
        const result = await tool.execute.bind(this)(toolInput)
        input = {
          ...input,
          action: { [toolName]: toolInput },
        }
      } catch (toolError) {
        input = {
          ...input,
          action: { done: { success: false, text: String(toolError) } },
        }
      }
    }

    return {
      toolResult: {
        input,
        output: typeof input.action === 'object' ? JSON.stringify(input.action) : String(input.action),
      },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    }
  }

  #parseJSONP(content: string): unknown {
    try {
      const match = content.match(/<reflection>([\s\S]*?)<\/reflection>/)
      if (match) {
        return JSON.parse(match[1])
      }
      const jsonMatch = content.match(/\{[\s\S]*"action"[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    } catch {
    }
    return {}
  }

  #packMacroTool(): any {
    const tools = this.tools

    const actionSchemas = Array.from(tools.entries()).map(([toolName, tool]) => {
      return z.object({ [toolName]: tool.inputSchema }).describe(tool.description)
    })

    const actionSchema = z.union(actionSchemas as unknown as [z.ZodType, z.ZodType, ...z.ZodType[]])

    const macroToolSchema = z.object({
      evaluation_previous_goal: z.string().optional(),
      memory: z.string().optional(),
      next_goal: z.string().optional(),
      action: actionSchema,
    })

    return {
      description: 'Agent action tool',
      inputSchema: macroToolSchema as z.ZodType<MacroToolInput>,
      execute: async (input: MacroToolInput): Promise<MacroToolResult> => {
        if (this.#abortController.signal.aborted) throw new Error('AbortError')

        console.log('MacroTool input', input)
        const action = input.action

        const toolName = Object.keys(action)[0]
        const toolInput = action[toolName]

        const reflectionLines: string[] = []
        if (input.evaluation_previous_goal)
          reflectionLines.push(`✅: ${input.evaluation_previous_goal}`)
        if (input.memory) reflectionLines.push(`💾: ${input.memory}`)
        if (input.next_goal) reflectionLines.push(`🎯: ${input.next_goal}`)

        const reflectionText = reflectionLines.length > 0 ? reflectionLines.join('\n') : ''

        if (reflectionText) {
          console.log(reflectionText)
        }

        const tool = tools.get(toolName)
        assert(tool, `Tool ${toolName} not found`)

        console.log(`Executing tool: ${toolName}`, toolInput)

        this.#emitActivity({ type: 'executing', tool: toolName, input: toolInput })

        const startTime = Date.now()

        const result = await tool.execute.bind(this)(toolInput)

        const duration = Date.now() - startTime
        console.log(`Tool (${toolName}) executed for ${duration}ms`, result)

        this.#emitActivity({
          type: 'executed',
          tool: toolName,
          input: toolInput,
          output: result,
          duration,
        })

        if (toolName === 'wait') {
          this.#states.totalWaitTime += toolInput?.seconds || 0
        } else {
          this.#states.totalWaitTime = 0
        }

        return {
          input,
          output: result,
        }
      },
    }
  }

  #getSystemPrompt(): string {
    if (this.config.customSystemPrompt) {
      return this.config.customSystemPrompt
    }

    const targetLanguage = this.config.language === 'zh-CN' ? '中文' : 'English'
    const systemPrompt = SYSTEM_PROMPT.replace(
      /Default working language: \*\*.*?\*\*/,
      `Default working language: **${targetLanguage}**`
    )

    return systemPrompt
  }

  async #getInstructions(): Promise<string> {
    const { instructions, experimentalLlmsTxt } = this.config

    const systemInstructions = instructions?.system?.trim()
    let pageInstructions: string | undefined

    const url = this.#states.browserState?.url || ''
    if (instructions?.getPageInstructions && url) {
      try {
        pageInstructions = instructions.getPageInstructions(url)?.trim()
      } catch (error) {
        console.error('[PageAgent] Failed to execute getPageInstructions callback:', error)
      }
    }

    const llmsTxt = experimentalLlmsTxt && url ? await fetchLlmsTxt(url) : undefined

    if (!systemInstructions && !pageInstructions && !llmsTxt) return ''

    let result = '<instructions>\n'

    if (systemInstructions) {
      result += `<system_instructions>\n${systemInstructions}\n</system_instructions>\n`
    }

    if (pageInstructions) {
      result += `<page_instructions>\n${pageInstructions}\n</page_instructions>\n`
    }

    if (llmsTxt) {
      result += `<llms_txt>\n${llmsTxt}\n</llms_txt>\n`
    }

    result += '</instructions>\n\n'

    return result
  }

  async #handleObservations(step: number): Promise<void> {
    if (this.#states.totalWaitTime >= 3) {
      this.pushObservation(
        `You have waited ${this.#states.totalWaitTime} seconds accumulatively. ` +
          `DO NOT wait any longer unless you have a good reason.`
      )
    }

    const currentURL = this.#states.browserState?.url || ''
    if (currentURL !== this.#states.lastURL) {
      this.pushObservation(`Page navigated to → ${currentURL}`)
      this.#states.lastURL = currentURL
      await waitFor(0.5)
    }

    const remaining = this.config.maxSteps - step
    if (remaining === 5) {
      this.pushObservation(
        `⚠️ Only ${remaining} steps remaining. ` +
          `Consider wrapping up or calling done with partial results.`
      )
    } else if (remaining === 2) {
      this.pushObservation(
        `⚠️ Critical: Only ${remaining} steps left! You must finish the task or call done immediately.`
      )
    }

    if (this.#observations.length > 0) {
      for (const content of this.#observations) {
        this.history.push({ type: 'observation', content })
        console.log('Observation:', content)
      }
      this.#observations = []
      this.#emitHistoryChange()
    }
  }

  async #assembleUserPrompt(): Promise<string> {
    const browserState = this.#states.browserState!

    let prompt = ''

    prompt += await this.#getInstructions()

    const stepCount = this.history.filter((e) => e.type === 'step').length

    prompt += '<agent_state>\n'
    prompt += '<user_request>\n'
    prompt += `${this.task}\n`
    prompt += '</user_request>\n'
    prompt += '<step_info>\n'
    prompt += `Step ${stepCount + 1} of ${this.config.maxSteps} max possible steps\n`
    prompt += `Current time: ${new Date().toLocaleString()}\n`
    prompt += '</step_info>\n'
    prompt += '</agent_state>\n\n'

    prompt += '<agent_history>\n'

    let stepIndex = 0
    for (const event of this.history) {
      if (event.type === 'step') {
        stepIndex++
        prompt += `<step_${stepIndex}>\n`
        prompt += `Evaluation of Previous Step: ${event.reflection.evaluation_previous_goal}\n`
        prompt += `Memory: ${event.reflection.memory}\n`
        prompt += `Next Goal: ${event.reflection.next_goal}\n`
        prompt += `Action Results: ${event.action.output}\n`
        prompt += `</step_${stepIndex}>\n`
      } else if (event.type === 'observation') {
        prompt += `<sys>${event.content}</sys>\n`
      } else if (event.type === 'user_takeover') {
        prompt += `<sys>User took over control and made changes to the page</sys>\n`
      } else if (event.type === 'error') {
      }
    }

    prompt += '</agent_history>\n\n'

    let pageContent = browserState.content
    if (this.config.transformPageContent) {
      pageContent = await this.config.transformPageContent(pageContent)
    }

    prompt += '<browser_state>\n'
    prompt += browserState.header + '\n'
    prompt += pageContent + '\n'
    prompt += browserState.footer + '\n\n'
    prompt += '</browser_state>\n\n'

    return prompt
  }

  #onDone(success = true) {
    this.pageController.cleanUpHighlights()
    this.pageController.hideMask()
    this.#setStatus(success ? 'completed' : 'error')
    this.#abortController.abort()
  }

  async dispose() {
    console.log('Disposing PageAgent...')
    this.disposed = true
    this.pageController.dispose()
    this.#abortController.abort()

    if (this.#mcpClient) {
      await this.#mcpClient.disconnect()
    }

    this.dispatchEvent(new Event('dispose'))

    this.config.onDispose?.(this)
  }
}
