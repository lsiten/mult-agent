import { useState } from "react";
import { ChevronDown, ChevronRight, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

interface ToolCallDisplayProps {
  toolCalls: ToolCall[];
}

export function ToolCallDisplay({ toolCalls }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false);

  if (toolCalls.length === 0) return null;

  return (
    <div className="mt-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setExpanded(!expanded)}
        className="h-auto p-2 hover:bg-background/50"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 mr-1" />
        ) : (
          <ChevronRight className="h-3 w-3 mr-1" />
        )}
        <Wrench className="h-3 w-3 mr-1" />
        <span className="text-xs">
          {toolCalls.length} 个工具调用
        </span>
      </Button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {toolCalls.map((toolCall, idx) => {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(toolCall.function.arguments);
            } catch {
              // Ignore parse errors
            }

            return (
              <div
                key={idx}
                className="bg-background/50 rounded-lg p-3 border border-border"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Wrench className="h-4 w-4 text-primary" />
                  <span className="font-mono text-sm font-semibold">
                    {toolCall.function.name}
                  </span>
                </div>

                {Object.keys(args).length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground font-semibold">
                      参数:
                    </div>
                    <pre className="text-xs bg-background/50 rounded p-2 overflow-x-auto font-mono">
                      {JSON.stringify(args, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
