import { useState, useMemo, useEffect } from 'react';
import { Check, Sparkles, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useSkillSelectionStore, type Skill } from '@/stores/useSkillSelectionStore';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

interface SkillSelectorProps {
  onApply?: () => void;
}

export function SkillSelector({ onApply }: SkillSelectorProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Keyboard shortcut: Ctrl/Cmd+K to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k' && !e.shiftKey) {
        // Prevent default browser behavior
        const target = e.target as HTMLElement;
        // Only trigger if not already focused on an input/textarea
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          setOpen(prev => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const {
    skills,
    selectedSkills,
    toggleSkill,
    clearSelection,
    setSkills,
    loading,
  } = useSkillSelectionStore();

  // Load skills on mount
  useEffect(() => {
    const loadSkills = async () => {
      try {
        const response = await fetch('/api/skills');
        if (!response.ok) throw new Error('Failed to load skills');
        const data = await response.json();
        setSkills(data);
      } catch (error) {
        console.error('Failed to load skills:', error);
      }
    };
    loadSkills();
  }, [setSkills]);

  // Group skills by category
  const groupedSkills = useMemo(() => {
    const filtered = skills.filter((skill) =>
      skill.name.toLowerCase().includes(search.toLowerCase()) ||
      skill.description?.toLowerCase().includes(search.toLowerCase())
    );

    const groups: Record<string, Skill[]> = {};
    filtered.forEach((skill) => {
      const category = skill.category || 'other';
      if (!groups[category]) groups[category] = [];
      groups[category].push(skill);
    });

    return groups;
  }, [skills, search]);

  const handleApply = () => {
    setOpen(false);
    onApply?.();
  };

  const toggleCategory = (category: string) => {
    const categorySkills = groupedSkills[category] || [];
    const allSelected = categorySkills.every((s) => selectedSkills.includes(s.name));

    if (allSelected) {
      // Deselect all in category
      categorySkills.forEach((s) => toggleSkill(s.name));
    } else {
      // Select all in category
      categorySkills.forEach((s) => {
        if (!selectedSkills.includes(s.name)) {
          toggleSkill(s.name);
        }
      });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          title={t.chat.skillSelector.title}
        >
          <Sparkles className="h-4 w-4" />
          {selectedSkills.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-4 w-4 flex items-center justify-center">
              {selectedSkills.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="flex flex-col h-96">
          {/* Header */}
          <div className="p-3 border-b">
            <h3 className="font-semibold text-sm mb-2">{t.chat.skillSelector.title}</h3>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t.chat.skillSelector.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </div>

          {/* Skills list */}
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                {t.common.loading}
              </div>
            ) : Object.keys(groupedSkills).length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                {skills.length === 0 ? t.chat.skillSelector.noSkills : t.common.noResults}
              </div>
            ) : (
              Object.entries(groupedSkills).map(([category, categorySkills]) => (
                <div key={category} className="mb-3">
                  {/* Category header */}
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className="uppercase">{category}</span>
                    <span className="text-xs">
                      {categorySkills.filter((s) => selectedSkills.includes(s.name)).length}/
                      {categorySkills.length}
                    </span>
                  </button>

                  {/* Skills in category */}
                  {categorySkills.map((skill) => {
                    const isSelected = selectedSkills.includes(skill.name);
                    return (
                      <button
                        key={skill.name}
                        onClick={() => toggleSkill(skill.name)}
                        className={cn(
                          'w-full flex items-start gap-2 px-2 py-2 rounded text-sm hover:bg-accent transition-colors',
                          isSelected && 'bg-accent'
                        )}
                        title={skill.description}
                      >
                        <div
                          className={cn(
                            'flex-shrink-0 h-4 w-4 border rounded mt-0.5',
                            isSelected
                              ? 'bg-primary border-primary'
                              : 'border-muted-foreground'
                          )}
                        >
                          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        <div className="flex-1 text-left">
                          <div className="font-medium">{skill.name}</div>
                          {skill.description && (
                            <div className="text-xs text-muted-foreground line-clamp-2">
                              {skill.description}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {selectedSkills.length} {t.chat.skillSelector.selected}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                {t.chat.skillSelector.clearAll}
              </Button>
              <Button size="sm" onClick={handleApply}>
                {t.chat.skillSelector.apply}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
