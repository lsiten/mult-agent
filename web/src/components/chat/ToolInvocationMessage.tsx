import { useState } from 'react';
import { ChevronDown, ChevronRight, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

interface ToolInvocation {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  result?: string;
  status: 'pending' | 'success' | 'error';
  duration?: number;
}

interface ToolInvocationMessageProps {
  invocation: ToolInvocation;
}

export function ToolInvocationMessage({ invocation }: ToolInvocationMessageProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  const statusIcon = {
    pending: <Clock className="h-4 w-4 animate-spin text-muted-foreground" />,
    success: <CheckCircle2 className="h-4 w-4 text-green-600" />,
    error: <XCircle className="h-4 w-4 text-red-600" />,
  }[invocation.status];

  const statusText = {
    pending: t.chat.toolInvocation.executing,
    success: t.chat.toolInvocation.completed,
    error: t.chat.toolInvocation.failed,
  }[invocation.status];

  return (
    <div className="my-2 border border-border/50 rounded-lg bg-card/30 overflow-hidden">
      {/* Header - Always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {statusIcon}
          <span className="font-medium text-sm truncate">{invocation.tool}</span>
          <span className="text-xs text-muted-foreground">{statusText}</span>
          {invocation.duration && (
            <span className="text-xs text-muted-foreground">
              ({invocation.duration}ms)
            </span>
          )}
        </div>
        <div className="flex-shrink-0">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border/50 px-3 py-2 space-y-2">
          {/* Parameters */}
          {Object.keys(invocation.args).length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1">
                {t.chat.toolInvocation.parameters}:
              </div>
              <pre className="text-xs bg-muted/30 rounded p-2 overflow-x-auto">
                {JSON.stringify(invocation.args, null, 2)}
              </pre>
            </div>
          )}

          {/* Result */}
          {invocation.result && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1">
                {t.chat.toolInvocation.result}:
              </div>
              <pre className="text-xs bg-muted/30 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">
                {invocation.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ToolInvocationGroupProps {
  invocations: ToolInvocation[];
  className?: string;
}

export function ToolInvocationGroup({ invocations, className }: ToolInvocationGroupProps) {
  if (invocations.length === 0) return null;

  return (
    <div className={cn('space-y-1', className)}>
      {invocations.map((inv) => (
        <ToolInvocationMessage key={inv.id} invocation={inv} />
      ))}
    </div>
  );
}
