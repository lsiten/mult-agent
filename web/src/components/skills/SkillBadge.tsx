import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SkillBadgeProps {
  name: string;
  category?: string;
  unavailable?: boolean;
  onRemove: () => void;
}

const categoryColors: Record<string, string> = {
  coding: 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-300',
  search: 'bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-300',
  browser: 'bg-purple-500/10 text-purple-700 border-purple-500/20 dark:text-purple-300',
  data: 'bg-orange-500/10 text-orange-700 border-orange-500/20 dark:text-orange-300',
  other: 'bg-gray-500/10 text-gray-700 border-gray-500/20 dark:text-gray-300',
};

export function SkillBadge({ name, category = 'other', unavailable = false, onRemove }: SkillBadgeProps) {
  const colorClass = unavailable
    ? 'bg-orange-500/10 text-orange-700 border-orange-500/20 dark:text-orange-300'
    : (categoryColors[category] || categoryColors.other);

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-colors',
        colorClass
      )}
    >
      <span>{name}</span>
      {unavailable && (
        <span className="text-[10px] opacity-75">⚠️</span>
      )}
      <button
        onClick={onRemove}
        className="hover:bg-black/10 dark:hover:bg-white/10 rounded-sm p-0.5 transition-colors"
        title={`移除 ${name}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
