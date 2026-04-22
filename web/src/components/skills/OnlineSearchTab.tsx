/**
 * Online Search Tab - Search and install skills from online repository
 */

import { useState, useEffect } from 'react';
import { Search, Download, Check, AlertCircle, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useSkillInstallStore } from '@/stores/useSkillInstallStore';
import { CategorySelector } from './CategorySelector';
import { fetchJSON, api } from '@/lib/api';

interface OnlineSkill {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  download_url: string;
  sha256?: string;
  installed: boolean;
}

interface SkillSource {
  id: string;
  name: string;
  repo: string;
}

interface OnlineSearchTabProps {
  onInstall: (skillId: string, skillName: string, category?: string) => void;
}

export function OnlineSearchTab({ onInstall }: OnlineSearchTabProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('hermes');
  const [sources, setSources] = useState<SkillSource[]>([]);
  const [skills, setSkills] = useState<OnlineSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [existingCategories, setExistingCategories] = useState<string[]>([]);

  // Fetch existing categories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const skills = await api.getSkills();
        const categories = new Set<string>();
        skills.forEach((skill: any) => {
          if (skill.name.includes('/')) {
            const category = skill.name.split('/')[0];
            categories.add(category);
          }
        });
        const categoriesArray = Array.from(categories).sort();
        setExistingCategories(categoriesArray);
      } catch (err) {
        console.error('[OnlineSearchTab] Failed to fetch categories:', err);
      }
    };
    fetchCategories();
  }, []);

  // Fetch sources on mount
  useEffect(() => {
    fetchSources();
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchSkills(query, source);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, source]);

  // Refresh when installation completes
  const tasks = useSkillInstallStore((state) => state.tasks);
  useEffect(() => {
    const completedTasks = Object.values(tasks).filter(
      (task) => task.status === 'completed' && task.source === 'online'
    );

    if (completedTasks.length > 0) {
      // Refresh search results to update installed status
      searchSkills(query, source);
    }
  }, [tasks, query, source]);

  const fetchSources = async () => {
    try {
      const data = await fetchJSON<{ sources: Array<{ name: string; url: string }> }>('/api/skills/sources');
      const sourcesWithId = (data.sources || []).map((s, idx) => ({
        id: `source-${idx}`,
        name: s.name,
        repo: s.url
      }));
      setSources(sourcesWithId);
    } catch (err) {
      console.error('Failed to fetch sources:', err);
    }
  };

  const searchSkills = async (searchQuery: string, selectedSource: string) => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchJSON<{ skills?: any[]; offline_mode?: boolean }>(
        `/api/skills/search?q=${encodeURIComponent(searchQuery)}&source=${encodeURIComponent(selectedSource)}`
      );
      setSkills(data.skills || []);
      setOfflineMode(data.offline_mode || false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search skills');
      setSkills([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Category Selector */}
      <CategorySelector
        value={selectedCategory}
        onChange={setSelectedCategory}
        existingCategories={existingCategories}
      />

      {/* Source Selector and Search Input */}
      <div className="flex gap-2">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="px-3 py-2 rounded-md border border-input bg-background text-sm"
        >
          {sources.map((src) => (
            <option key={src.id} value={src.id}>
              {src.name}
            </option>
          ))}
        </select>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t.skills.install.onlineSearch.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Offline Mode Banner */}
      {offlineMode && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-md">
          <CloudOff className="h-4 w-4 text-amber-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-500">
              {t.skills.install.onlineSearch.offlineMode}
            </p>
            <p className="text-xs text-amber-500/80">
              {t.skills.install.onlineSearch.offlineDescription}
            </p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-md">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {/* Skills List */}
      {!loading && skills.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Cloud className="h-12 w-12 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            {query ? t.skills.install.onlineSearch.noResults : t.skills.install.onlineSearch.placeholder}
          </p>
        </div>
      )}

      {!loading && skills.length > 0 && (
        <div className="grid gap-3 max-h-[500px] overflow-y-auto pr-2">
          {skills.map((skill) => (
            <Card key={skill.id} className="hover:bg-muted/50 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Skill Name & Status */}
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-sm truncate">{skill.name}</h3>
                      {skill.installed && (
                        <Badge variant="outline" className="gap-1">
                          <Check className="h-3 w-3" />
                          {t.skills.install.onlineSearch.installed}
                        </Badge>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                      {skill.description}
                    </p>

                    {/* Metadata */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>v{skill.version}</span>
                      <span>•</span>
                      <span>{skill.author}</span>
                    </div>

                    {/* Tags */}
                    {skill.tags && skill.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {skill.tags.slice(0, 3).map((tag, idx) => (
                          <Badge key={`${skill.id}-tag-${idx}`} variant="secondary" className="text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                        {skill.tags.length > 3 && (
                          <Badge variant="secondary" className="text-[10px]">
                            +{skill.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Install Button - show progress if installing */}
                  <InstallButton
                    skillId={skill.id}
                    skillName={skill.name}
                    installed={skill.installed}
                    offlineMode={offlineMode}
                    onInstall={(id, name) => onInstall(id, name, selectedCategory)}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * InstallButton - Shows skill-specific installation progress
 */
interface InstallButtonProps {
  skillId: string;
  skillName: string;
  installed: boolean;
  offlineMode: boolean;
  onInstall: (skillId: string, skillName: string) => void;
}

function InstallButton({ skillId, skillName, installed, offlineMode, onInstall }: InstallButtonProps) {
  const { t } = useI18n();

  // Subscribe to tasks and removeTask separately to ensure reactivity
  const tasks = useSkillInstallStore((state) => state.tasks);
  const removeTask = useSkillInstallStore((state) => state.removeTask);

  // Find any task for this skill (active or recently failed)
  const task = Object.values(tasks).find((task) => task.skill_id === skillId);

  // Show in-progress state
  if (task && (task.status === 'pending' || task.status === 'queued' || task.status === 'in_progress')) {
    return (
      <Button size="sm" disabled className="shrink-0 gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        {task.progress}%
      </Button>
    );
  }

  // Show failed state (briefly, with retry option)
  if (task && task.status === 'failed') {
    return (
      <div className="flex gap-2 items-center">
        <Button
          size="sm"
          variant="destructive"
          onClick={() => removeTask(task.task_id)}
          className="shrink-0 gap-1"
          title={task.error_message || 'Installation failed'}
        >
          <AlertCircle className="h-3 w-3" />
          Failed
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            removeTask(task.task_id);
            onInstall(skillId, skillName);
          }}
          className="shrink-0"
        >
          Retry
        </Button>
      </div>
    );
  }

  // Default: show install button
  return (
    <Button
      size="sm"
      onClick={() => onInstall(skillId, skillName)}
      disabled={installed || offlineMode}
      className="shrink-0 gap-1"
    >
      {installed ? (
        <>
          <Check className="h-3 w-3" />
          {t.skills.install.onlineSearch.installed}
        </>
      ) : (
        <>
          <Download className="h-3 w-3" />
          {t.skills.install.onlineSearch.install}
        </>
      )}
    </Button>
  );
}
