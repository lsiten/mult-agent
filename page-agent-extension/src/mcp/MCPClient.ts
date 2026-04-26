export interface MCPToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

export interface MCPConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface MCPClientOptions {
  mcpServers: Record<string, MCPConfig>
  timeout?: number
}

export class MCPClient extends EventTarget {
  private ws: WebSocket | null = null
  private mcpServers: Record<string, MCPConfig>
  private timeout: number
  private connected = false
  private pendingRequests: Map<string, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }> = new Map()
  private tools: Map<string, { name: string; description?: string; inputSchema?: unknown }> = new Map()

  constructor(options: MCPClientOptions) {
    super()
    this.mcpServers = options.mcpServers
    this.timeout = options.timeout ?? 60000
  }

  async connect(mcpServerUrl: string): Promise<void> {
    if (this.connected) return

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(mcpServerUrl)

        this.ws.onopen = () => {
          console.log('[MCP] WebSocket connected')
          this.connected = true
          this.dispatchEvent(new Event('connected'))
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            this.handleMessage(message)
          } catch (error) {
            console.error('[MCP] Failed to parse message:', error)
          }
        }

        this.ws.onerror = (error) => {
          console.error('[MCP] WebSocket error:', error)
          reject(error)
        }

        this.ws.onclose = () => {
          console.log('[MCP] WebSocket disconnected')
          this.connected = false
          this.dispatchEvent(new Event('disconnected'))
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  private handleMessage(message: unknown): void {
    const msg = message as { id?: string; method?: string; result?: unknown; error?: unknown }

    if (msg.id) {
      const pending = this.pendingRequests.get(msg.id)
      if (pending) {
        if (msg.error) {
          pending.reject(msg.error)
        } else {
          pending.resolve(msg.result)
        }
        this.pendingRequests.delete(msg.id)
      }
    }

    if (msg.method === 'tools/list') {
      const result = msg.result as { tools?: Array<{ name: string; description?: string; inputSchema?: unknown }> }
      if (result?.tools) {
        this.tools.clear()
        for (const tool of result.tools) {
          this.tools.set(tool.name, tool)
        }
      }
    }
  }

  private async sendRequest(method: string, params?: unknown): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }

    const id = crypto.randomUUID()

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error('Request timeout'))
      }, this.timeout)

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timeoutId)
          resolve(value)
        },
        reject: (reason) => {
          clearTimeout(timeoutId)
          reject(reason)
        },
      })

      this.ws!.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
    })
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.connected = false
    this.pendingRequests.clear()
    this.tools.clear()
    this.dispatchEvent(new Event('disconnected'))
  }

  getTools(): Array<{ name: string; description?: string; inputSchema?: unknown }> {
    return Array.from(this.tools.values())
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    try {
      const result = await this.sendRequest('tools/call', {
        name,
        arguments: args,
      }) as MCPToolResult

      return result
    } catch (error) {
      console.error(`[MCP] Tool call failed for ${name}:`, error)
      throw error
    }
  }

  async listTools(): Promise<Array<{ name: string; description?: string; inputSchema?: unknown }>> {
    await this.sendRequest('tools/list', {})
    return this.getTools()
  }

  isConnected(): boolean {
    return this.connected
  }
}

export type { Tool } from './types'
