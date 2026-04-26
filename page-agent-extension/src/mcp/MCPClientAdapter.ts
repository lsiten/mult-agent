import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod/v4'

export interface MacroToolInput {
  evaluation_previous_goal?: string
  memory?: string
  next_goal?: string
  action: Record<string, unknown>
}

export interface MacroToolResult {
  input: MacroToolInput
  output: string
}

export interface LLMResponse {
  toolResult: MacroToolResult
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    cachedTokens?: number
    reasoningTokens?: number
  }
  rawResponse?: unknown
  rawRequest?: unknown
}

export interface MCPMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface MCPInvokeOptions {
  timeout?: number
  signal?: AbortSignal
}

export class MCPInvokeError extends Error {
  rawResponse?: unknown

  constructor(message: string, rawResponse?: unknown) {
    super(message)
    this.name = 'InvokeError'
    this.rawResponse = rawResponse
  }
}

export class MCPClientAdapter {
  private mcpClient: import('./MCPClient').MCPClient
  private tools: Map<string, Tool> = new Map()

  constructor(mcpClient: import('./MCPClient').MCPClient) {
    this.mcpClient = mcpClient
  }

  async initialize(): Promise<void> {
    await this.mcpClient.connect()
    const tools = await this.mcpClient.listTools()
    for (const tool of tools) {
      this.tools.set(tool.name, tool)
    }
  }

  async invoke(
    messages: MCPMessage[],
    macroTool: Tool<MacroToolInput, MacroToolResult>,
    signal?: AbortSignal,
    options?: { toolChoiceName?: string; normalizeResponse?: (res: unknown) => unknown }
  ): Promise<LLMResponse> {
    const lastMessage = messages[messages.length - 1]
    const userContent = typeof lastMessage?.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage?.content)

    const toolSchemas = Array.from(this.tools.values()).map(tool => {
      const inputSchema = tool.inputSchema as z.ZodType
      return z.object({ [tool.name]: inputSchema }).describe(tool.description || '')
    })

    const actionSchema = z.union(toolSchemas as unknown as [z.ZodType, z.ZodType, ...z.ZodType[]])

    const macroToolSchema = z.object({
      evaluation_previous_goal: z.string().optional(),
      memory: z.string().optional(),
      next_goal: z.string().optional(),
      action: actionSchema,
    })

    const parsed = macroToolSchema.safeParse(
      typeof userContent === 'string' ? JSON.parse(userContent) : userContent
    )

    if (!parsed.success) {
      throw new MCPInvokeError(`Failed to parse LLM response: ${parsed.error.message}`)
    }

    const input = parsed.data
    const actionName = Object.keys(input.action)[0]
    const actionInput = input.action[actionName]

    const tool = this.tools.get(actionName)
    if (!tool) {
      throw new MCPInvokeError(`Tool ${actionName} not found`)
    }

    let output = ''
    try {
      const result = await this.mcpClient.callTool(actionName, actionInput as Record<string, unknown>)
      output = typeof result.content === 'string'
        ? result.content
        : JSON.stringify(result.content)
    } catch (error) {
      output = `Error: ${error instanceof Error ? error.message : String(error)}`
    }

    const macroResult: MacroToolResult = {
      input,
      output,
    }

    return {
      toolResult: macroResult,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      rawResponse: { actionName, actionInput, output },
      rawRequest: messages,
    }
  }

  addEventListener(type: 'retry' | 'error', listener: (event: CustomEvent) => void): void {
    this.mcpClient.addEventListener(type, listener)
  }

  removeEventListener(type: 'retry' | 'error', listener: (event: CustomEvent) => void): void {
    this.mcpClient.removeEventListener(type, listener)
  }

  dispose(): void {
    this.mcpClient.disconnect()
  }
}
