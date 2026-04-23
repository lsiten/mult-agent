import { useState } from 'react';
import { ExternalLink, Copy, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

interface AuthorizationInfo {
  type: 'oauth' | 'permission' | 'confirmation';
  url?: string;
  title?: string;
  message?: string;
  action?: string;
}

interface AuthorizationRequestMessageProps {
  authorization: AuthorizationInfo;
  className?: string;
}

export function AuthorizationRequestMessage({ authorization, className }: AuthorizationRequestMessageProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopyUrl = async () => {
    if (!authorization.url) return;

    try {
      await navigator.clipboard.writeText(authorization.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  const handleOpenUrl = () => {
    if (!authorization.url) return;
    window.open(authorization.url, '_blank', 'noopener,noreferrer');
  };

  const icon = {
    oauth: <ExternalLink className="h-4 w-4 text-blue-600 dark:text-blue-400" />,
    permission: <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />,
    confirmation: <Info className="h-4 w-4 text-purple-600 dark:text-purple-400" />,
  }[authorization.type];

  const typeTitle = {
    oauth: t.chat.authorizationRequest.oauthTitle,
    permission: t.chat.authorizationRequest.permissionTitle,
    confirmation: t.chat.authorizationRequest.confirmationTitle,
  }[authorization.type];

  const borderColor = {
    oauth: 'border-blue-600/20 dark:border-blue-400/20',
    permission: 'border-orange-600/20 dark:border-orange-400/20',
    confirmation: 'border-purple-600/20 dark:border-purple-400/20',
  }[authorization.type];

  return (
    <div className={cn('my-2 border rounded-lg bg-card/30 overflow-hidden', borderColor, className)}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-border/50 flex items-center gap-2">
        {icon}
        <span className="font-medium text-sm">{authorization.title || typeTitle}</span>
      </div>

      {/* Content */}
      <div className="px-3 py-2 space-y-2">
        {/* Message */}
        {authorization.message && (
          <div className="text-sm text-muted-foreground whitespace-pre-wrap">
            {authorization.message}
          </div>
        )}

        {/* URL (for OAuth) */}
        {authorization.url && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">
              {t.chat.authorizationRequest.instructions}:
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleOpenUrl}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                {t.chat.authorizationRequest.openUrl}
              </button>
              <button
                onClick={handleCopyUrl}
                className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition-colors"
                title={authorization.url}
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    {t.chat.authorizationRequest.urlCopied}
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    {t.chat.authorizationRequest.copyUrl}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Action (for confirmation/permission) */}
        {authorization.action && !authorization.url && (
          <div className="text-sm font-medium text-muted-foreground">
            {authorization.action}
          </div>
        )}

        {/* Waiting indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
          {t.chat.authorizationRequest.waiting}
        </div>
      </div>
    </div>
  );
}
