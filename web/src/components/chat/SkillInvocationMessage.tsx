import { Sparkles, CheckCircle2, XCircle, Wrench } from 'lucide-react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

interface SkillInfo {
  name: string;
  category?: string;
  toolCount?: number;
  status: 'loaded' | 'failed' | 'unavailable';
  error?: string;
}

interface SkillInvocationMessageProps {
  skills: SkillInfo[];
  className?: string;
}

const categoryColors: Record<string, string> = {
  coding: 'text-blue-600 dark:text-blue-400',
  search: 'text-green-600 dark:text-green-400',
  browser: 'text-purple-600 dark:text-purple-400',
  data: 'text-orange-600 dark:text-orange-400',
  other: 'text-gray-600 dark:text-gray-400',
};

export function SkillInvocationMessage({ skills, className }: SkillInvocationMessageProps) {
  const { t } = useI18n();

  if (skills.length === 0) return null;

  const loadedSkills = skills.filter(s => s.status === 'loaded');
  const failedSkills = skills.filter(s => s.status === 'failed');
  const unavailableSkills = skills.filter(s => s.status === 'unavailable');

  return (
    <div className={cn('my-2 border border-border/50 rounded-lg bg-card/30 px-3 py-2', className)}>
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">
          {t.chat.skillInvocation.loaded} ({loadedSkills.length}/{skills.length})
        </span>
      </div>

      {/* Loaded skills */}
      {loadedSkills.length > 0 && (
        <div className="space-y-1">
          {loadedSkills.map((skill) => {
            const colorClass = categoryColors[skill.category || 'other'] || categoryColors.other;
            return (
              <div key={skill.name} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                <span className={cn('font-medium', colorClass)}>{skill.name}</span>
                {skill.category && (
                  <span className="text-xs text-muted-foreground">({skill.category})</span>
                )}
                {skill.toolCount !== undefined && skill.toolCount > 0 && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Wrench className="h-3 w-3" />
                    {skill.toolCount} {t.chat.skillInvocation.tools}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Failed skills */}
      {failedSkills.length > 0 && (
        <div className="mt-2 space-y-1">
          {failedSkills.map((skill) => (
            <div key={skill.name} className="flex items-center gap-2 text-sm">
              <XCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
              <span className="font-medium text-red-600 dark:text-red-400">{skill.name}</span>
              <span className="text-xs text-muted-foreground">
                {t.chat.skillInvocation.failed}
              </span>
              {skill.error && (
                <span className="text-xs text-red-600/80 truncate max-w-xs" title={skill.error}>
                  {skill.error}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Unavailable skills */}
      {unavailableSkills.length > 0 && (
        <div className="mt-2 space-y-1">
          {unavailableSkills.map((skill) => (
            <div key={skill.name} className="flex items-center gap-2 text-sm">
              <XCircle className="h-3.5 w-3.5 text-orange-600 flex-shrink-0" />
              <span className="font-medium text-orange-600 dark:text-orange-400">{skill.name}</span>
              <span className="text-xs text-muted-foreground">
                {t.chat.skillInvocation.unavailable}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
