import { ArrowLeft, Check, Loader2, AlertCircle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Separator } from './ui/separator'
import { Spinner } from './ui/spinner'
import { Textarea } from './ui/textarea'
import type { MCPConfigInput } from '../../agent/useMCPAgent'

interface ConfigPanelProps {
  config: MCPConfigInput | null
  onSave: (config: MCPConfigInput) => Promise<void>
  onClose: () => void
}

export function ConfigPanel({ config, onSave, onClose }: ConfigPanelProps) {
  const [mcpCommand, setMcpCommand] = useState('npx')
  const [mcpArgs, setMcpArgs] = useState('-y @modelcontextprotocol/server-filesystem ./')
  const [systemInstruction, setSystemInstruction] = useState('')
  const [maxSteps, setMaxSteps] = useState('40')
  const [language, setLanguage] = useState<'en-US' | 'zh-CN'>('en-US')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (config) {
      setMcpCommand(config.mcpConfig?.command || 'npx')
      setMcpArgs(config.mcpConfig?.args?.join(' ') || '-y @modelcontextprotocol/server-filesystem ./')
      setSystemInstruction(config.systemInstruction || '')
      setMaxSteps(String(config.maxSteps || 40))
      setLanguage(config.language || 'en-US')
    }
  }, [config])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    setError(null)

    try {
      const newConfig: MCPConfigInput = {
        language,
        maxSteps: parseInt(maxSteps, 10) || 40,
        systemInstruction: systemInstruction || undefined,
        mcpConfig: {
          command: mcpCommand,
          args: mcpArgs.split(' ').filter(Boolean),
        },
      }

      await onSave(newConfig)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration')
    } finally {
      setIsSaving(false)
    }
  }, [mcpCommand, mcpArgs, systemInstruction, maxSteps, language, onSave])

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="cursor-pointer"
          aria-label="Back"
        >
          <ArrowLeft className="size-3.5" />
        </Button>
        <span className="text-sm font-medium">Settings</span>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>MCP Server Configuration</CardTitle>
            <CardDescription>
              Configure the MCP server to use for AI operations. The MCP server provides tools and capabilities for browser automation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mcpCommand">MCP Command</Label>
              <Input
                id="mcpCommand"
                value={mcpCommand}
                onChange={(e) => setMcpCommand(e.target.value)}
                placeholder="npx"
              />
              <p className="text-[10px] text-muted-foreground">
                Command to run the MCP server (e.g., npx, node, python)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mcpArgs">MCP Arguments</Label>
              <Input
                id="mcpArgs"
                value={mcpArgs}
                onChange={(e) => setMcpArgs(e.target.value)}
                placeholder="-y @modelcontextprotocol/server-filesystem ./"
              />
              <p className="text-[10px] text-muted-foreground">
                Arguments passed to the MCP command
              </p>
            </div>

            <div className="space-y-2">
              <Label>Common MCP Servers</Label>
              <div className="space-y-2 text-xs">
                <div className="p-2 border rounded bg-muted/30">
                  <div className="font-medium">Filesystem Server</div>
                  <div className="text-muted-foreground">Command: npx</div>
                  <div className="text-muted-foreground">Args: -y @modelcontextprotocol/server-filesystem ./</div>
                </div>
                <div className="p-2 border rounded bg-muted/30">
                  <div className="font-medium">Brave Search Server</div>
                  <div className="text-muted-foreground">Command: npx</div>
                  <div className="text-muted-foreground">Args: -y @modelcontextprotocol/server-brave-search</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agent Settings</CardTitle>
            <CardDescription>Configure agent behavior and capabilities</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="maxSteps">Maximum Steps</Label>
              <Input
                id="maxSteps"
                type="number"
                value={maxSteps}
                onChange={(e) => setMaxSteps(e.target.value)}
                min="1"
                max="100"
              />
              <p className="text-[10px] text-muted-foreground">
                Maximum number of steps the agent can take per task (default: 40)
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="language">Language</Label>
              <div className="flex gap-2">
                <Button
                  variant={language === 'en-US' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setLanguage('en-US')}
                  className="cursor-pointer"
                >
                  English
                </Button>
                <Button
                  variant={language === 'zh-CN' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setLanguage('zh-CN')}
                  className="cursor-pointer"
                >
                  中文
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="systemInstruction">System Instructions (Optional)</Label>
              <Textarea
                id="systemInstruction"
                value={systemInstruction}
                onChange={(e) => setSystemInstruction(e.target.value)}
                placeholder="Additional instructions to guide the agent's behavior..."
                rows={4}
              />
              <p className="text-[10px] text-muted-foreground">
                Optional system-level instructions to customize agent behavior
              </p>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="flex items-center gap-2 p-3 border border-destructive/50 rounded bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="size-4" />
            <span>{error}</span>
          </div>
        )}
      </main>

      <footer className="border-t p-3">
        <Button
          onClick={handleSave}
          disabled={isSaving || !mcpCommand}
          className="w-full cursor-pointer"
        >
          {isSaving ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Check className="size-3.5" />
              <span>Save Configuration</span>
            </>
          )}
        </Button>
      </footer>
    </div>
  )
}
