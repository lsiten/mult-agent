import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Package,
  Search,
  Wrench,
  ChevronRight,
  X,
  Cpu,
  Globe,
  Shield,
  Eye,
  Paintbrush,
  Brain,
  Blocks,
  Code,
  Zap,
  Plus,
  Trash2,
  Loader2,
  CheckCircle,
  XCircle,
  FolderOpen,
  Edit,
} from "lucide-react";
import { api, fetchJSON } from "@/lib/api";
import type { SkillInfo, ToolsetInfo } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { Toast } from "@/components/Toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { SkillInstallModal } from "@/components/skills/SkillInstallModal";
// import { InstallationProgressList } from "@/components/skills/InstallationProgress";
import { useSkillInstallStore, type TaskState } from "@/stores/useSkillInstallStore";

/* ------------------------------------------------------------------ */
/*  Types & helpers                                                    */
/* ------------------------------------------------------------------ */

const CATEGORY_LABELS: Record<string, string> = {
  mlops: "MLOps",
  "mlops/cloud": "MLOps / Cloud",
  "mlops/evaluation": "MLOps / Evaluation",
  "mlops/inference": "MLOps / Inference",
  "mlops/models": "MLOps / Models",
  "mlops/training": "MLOps / Training",
  "mlops/vector-databases": "MLOps / Vector DBs",
  mcp: "MCP",
  "red-teaming": "Red Teaming",
  ocr: "OCR",
  p5js: "p5.js",
  ai: "AI",
  ux: "UX",
  ui: "UI",
};

function prettyCategory(raw: string | null | undefined, generalLabel: string): string {
  if (!raw) return generalLabel;
  if (CATEGORY_LABELS[raw]) return CATEGORY_LABELS[raw];
  return raw
    .split(/[-_/]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const TOOLSET_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  computer: Cpu,
  web: Globe,
  security: Shield,
  vision: Eye,
  design: Paintbrush,
  ai: Brain,
  integration: Blocks,
  code: Code,
  automation: Zap,
};

function toolsetIcon(name: string): React.ComponentType<{ className?: string }> {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(TOOLSET_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return Wrench;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [toolsets, setToolsets] = useState<ToolsetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"skills" | "toolsets">("skills");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [togglingSkills, setTogglingSkills] = useState<Set<string>>(new Set());
  const [skillsPath, setSkillsPath] = useState<string>("$HERMES_HOME/skills/"); // Dynamic path from HERMES_HOME
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const { toast, showToast } = useToast();
  const { t } = useI18n();

  // Fetch skills data
  const fetchSkills = useCallback(async () => {
    try {
      const [s, tsets, status] = await Promise.all([
        api.getSkills(),
        api.getToolsets(),
        api.getStatus()
      ]);
      setSkills(s);
      setToolsets(tsets);
      if (status.hermes_home) {
        setSkillsPath(`${status.hermes_home}/skills/`);
      }
    } catch (err) {
      showToast(t.common.loading, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast, t.common.loading]);

  // Initial load
  useEffect(() => {
    fetchSkills();
  }, []);

  // Monitor installation progress and refresh on completion
  const tasks = useSkillInstallStore((state) => state.tasks);

  // Start polling for all active tasks
  useEffect(() => {
    const activeTasks = Object.values(tasks).filter(
      (task) => task.status === 'pending' || task.status === 'queued' || task.status === 'in_progress'
    );

    const intervalMap = new Map<string, ReturnType<typeof setInterval>>();

    activeTasks.forEach((task) => {
      let failureCount = 0;
      const MAX_FAILURES = 3;

      // Start polling for each active task
      const pollTask = async () => {
        try {
          const response = await fetch(`/api/skills/install/${task.task_id}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('sessionToken') || ''}`,
            },
          });

          if (response.status === 404) {
            // Task not found - stop polling
            console.warn(`[SkillsPage] Task ${task.task_id} not found (404), stopping poll`);
            const interval = intervalMap.get(task.task_id);
            if (interval) {
              clearInterval(interval);
              intervalMap.delete(task.task_id);
            }
            // Remove from store
            const { removeTask } = useSkillInstallStore.getState();
            removeTask(task.task_id);
            return;
          }

          if (response.ok) {
            failureCount = 0; // Reset on success
            const data = await response.json();
            const { updateTask } = useSkillInstallStore.getState();
            updateTask(task.task_id, {
              status: data.status,
              progress: data.progress,
              current_step: data.current_step,
              error_message: data.error_message,
              error_details: data.error_details,
              completed_at: data.completed_at,
            });

            // Stop polling if task reached terminal state
            if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
              const interval = intervalMap.get(task.task_id);
              if (interval) {
                clearInterval(interval);
                intervalMap.delete(task.task_id);
              }
            }
          } else {
            failureCount++;
            if (failureCount >= MAX_FAILURES) {
              console.error(`[SkillsPage] Too many failures for task ${task.task_id}, stopping poll`);
              const interval = intervalMap.get(task.task_id);
              if (interval) {
                clearInterval(interval);
                intervalMap.delete(task.task_id);
              }
            }
          }
        } catch (err) {
          failureCount++;
          console.error(`Failed to poll task ${task.task_id}:`, err);
          if (failureCount >= MAX_FAILURES) {
            const interval = intervalMap.get(task.task_id);
            if (interval) {
              clearInterval(interval);
              intervalMap.delete(task.task_id);
            }
          }
        }
      };

      // Poll immediately
      pollTask();

      // Set up interval polling
      const interval = setInterval(pollTask, 500);
      intervalMap.set(task.task_id, interval);
    });

    // Cleanup function
    return () => {
      intervalMap.forEach((interval) => clearInterval(interval));
      intervalMap.clear();
    };
  }, [tasks]);

  useEffect(() => {
    const activeTasks = Object.values(tasks);

    // Check if any task just completed
    const hasCompletedTasks = activeTasks.some(
      (task) => task.status === 'completed'
    );

    if (hasCompletedTasks) {
      // Refresh skills list after a short delay
      const timer = setTimeout(() => {
        fetchSkills();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [tasks, fetchSkills]);

  /* ---- Toggle skill ---- */
  const handleToggleSkill = async (skill: SkillInfo) => {
    setTogglingSkills((prev) => new Set(prev).add(skill.name));
    try {
      await api.toggleSkill(skill.name, !skill.enabled);
      setSkills((prev) =>
        prev.map((s) =>
          s.name === skill.name ? { ...s, enabled: !s.enabled } : s
        )
      );
      showToast(
        `${skill.name} ${skill.enabled ? t.common.disabled : t.common.enabled}`,
        "success"
      );
    } catch {
      showToast(`${t.common.failedToToggle} ${skill.name}`, "error");
    } finally {
      setTogglingSkills((prev) => {
        const next = new Set(prev);
        next.delete(skill.name);
        return next;
      });
    }
  };

  const handleDeleteSkill = async (skillName: string) => {
    try {
      await api.deleteSkill(skillName);
      setSkills((prev) => prev.filter((s) => s.name !== skillName));
      showToast(`${skillName} ${t.common.deleted || 'deleted'}`, "success");
    } catch (err) {
      showToast(`${t.common.failedToDelete || 'Failed to delete'} ${skillName}`, "error");
    }
  };

  const handleOpenSkillDirectory = async (skillPath: string) => {
    try {
      await fetchJSON('/api/skills/open-directory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: skillPath }),
      });
      showToast(t.common.success || 'Directory opened', 'success');
    } catch (err) {
      showToast(t.common.failedToReveal, 'error');
    }
  };

  const handleEditDescription = async (skillName: string, currentDescription: string) => {
    // Use a simple input dialog since prompt() is not supported in Electron
    const newDescription = await new Promise<string | null>((resolve) => {
      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999';

      const dialog = document.createElement('div');
      dialog.style.cssText = 'background:#1a2332;padding:24px;border-radius:8px;min-width:400px;max-width:600px;box-shadow:0 10px 40px rgba(0,0,0,0.5);border:1px solid #2d3748';

      const title = document.createElement('h3');
      title.textContent = t.skills.editDescription || 'Edit skill description';
      title.style.cssText = 'margin:0 0 16px;font-size:16px;font-weight:600;color:#e2e8f0';

      const textarea = document.createElement('textarea');
      textarea.value = currentDescription;
      textarea.style.cssText = 'width:100%;min-height:100px;padding:12px;border:1px solid #4a5568;border-radius:6px;font-family:inherit;resize:vertical;background:#0f1419;color:#e2e8f0;font-size:14px';

      const buttons = document.createElement('div');
      buttons.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:16px';

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = t.common.cancel;
      cancelBtn.style.cssText = 'padding:8px 16px;border:1px solid #4a5568;background:#2d3748;color:#e2e8f0;border-radius:6px;cursor:pointer;font-size:14px';
      cancelBtn.onmouseover = () => cancelBtn.style.background = '#374151';
      cancelBtn.onmouseout = () => cancelBtn.style.background = '#2d3748';
      cancelBtn.onclick = () => { document.body.removeChild(modal); resolve(null); };

      const saveBtn = document.createElement('button');
      saveBtn.textContent = t.common.save;
      saveBtn.style.cssText = 'padding:8px 16px;border:none;background:#3b82f6;color:white;border-radius:6px;cursor:pointer;font-size:14px;font-weight:500';
      saveBtn.onmouseover = () => saveBtn.style.background = '#2563eb';
      saveBtn.onmouseout = () => saveBtn.style.background = '#3b82f6';
      saveBtn.onclick = () => { document.body.removeChild(modal); resolve(textarea.value); };

      buttons.appendChild(cancelBtn);
      buttons.appendChild(saveBtn);
      dialog.appendChild(title);
      dialog.appendChild(textarea);
      dialog.appendChild(buttons);
      modal.appendChild(dialog);
      document.body.appendChild(modal);
      textarea.focus();
      textarea.select();
    });

    if (newDescription === null) return; // User cancelled

    try {
      const baseUrl = window.location.hostname === 'localhost' && window.location.port === '5173'
        ? 'http://localhost:8642'
        : '';

      const response = await fetch(`${baseUrl}/api/skills/update-description`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('sessionToken') || ''}`,
        },
        body: JSON.stringify({
          skill_name: skillName,
          description: newDescription,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update description');
      }

      // Update local state
      setSkills((prev) =>
        prev.map((s) =>
          s.name === skillName ? { ...s, description: newDescription } : s
        )
      );

      showToast(t.common.updated || 'Updated', 'success');
    } catch (err) {
      showToast(t.common.failedToUpdate || 'Failed to update', 'error');
    }
  };

  /* ---- Derived data ---- */
  const lowerSearch = search.toLowerCase();
  const isSearching = search.trim().length > 0;

  // Parse nested skills: extract category from path (e.g., "software-development/web-access" → "software-development")
  const skillsWithParsedCategory = useMemo(() => {
    return skills.map(skill => {
      // If skill name contains "/", it's a nested skill
      if (skill.name.includes("/")) {
        const parts = skill.name.split("/");
        const categoryFromPath = parts[0]; // First part is the category
        const displayName = parts.slice(1).join("/"); // Rest is the actual skill name
        return {
          ...skill,
          categoryFromPath,
          displayName,
          isNested: true,
        };
      }
      return {
        ...skill,
        categoryFromPath: skill.category || "__none__",
        displayName: skill.name,
        isNested: false,
      };
    });
  }, [skills]);

  const searchMatchedSkills = useMemo(() => {
    if (!isSearching) return [];
    return skillsWithParsedCategory.filter(
      (s) =>
        s.name.toLowerCase().includes(lowerSearch) ||
        s.displayName.toLowerCase().includes(lowerSearch) ||
        s.description.toLowerCase().includes(lowerSearch) ||
        (s.categoryFromPath ?? "").toLowerCase().includes(lowerSearch)
    );
  }, [skillsWithParsedCategory, isSearching, lowerSearch]);

  const activeSkills = useMemo(() => {
    if (isSearching) return [];
    if (!activeCategory) return [...skillsWithParsedCategory].sort((a, b) => a.displayName.localeCompare(b.displayName));
    return skillsWithParsedCategory
      .filter((s) =>
        activeCategory === "__none__" ? s.categoryFromPath === "__none__" : s.categoryFromPath === activeCategory
      )
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [skillsWithParsedCategory, activeCategory, isSearching]);

  const allCategories = useMemo(() => {
    const cats = new Map<string, number>();
    for (const s of skillsWithParsedCategory) {
      const key = s.categoryFromPath;
      cats.set(key, (cats.get(key) || 0) + 1);
    }
    return [...cats.entries()]
      .sort((a, b) => {
        if (a[0] === "__none__") return -1;
        if (b[0] === "__none__") return 1;
        return a[0].localeCompare(b[0]);
      })
      .map(([key, count]) => ({ key, name: prettyCategory(key === "__none__" ? null : key, t.common.general), count }));
  }, [skillsWithParsedCategory, t]);

  const enabledCount = skills.filter((s) => s.enabled).length;

  const filteredToolsets = useMemo(() => {
    return toolsets.filter(
      (ts) =>
        !search ||
        ts.name.toLowerCase().includes(lowerSearch) ||
        ts.label.toLowerCase().includes(lowerSearch) ||
        ts.description.toLowerCase().includes(lowerSearch)
    );
  }, [toolsets, search, lowerSearch]);

  // Check for failed tasks in store (using tasks from line 130)
  // const failedTasks = useMemo(() => {
  //   return Object.values(tasks).filter((t) => t.status === 'failed');
  // }, [tasks]);

  /* ---- Loading ---- */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Toast toast={toast} />

      {/* ═══════════════ Header ═══════════════ */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-base font-semibold">{t.skills.title}</h1>
          <span className="text-xs text-muted-foreground">
            {t.skills.enabledOf.replace("{enabled}", String(enabledCount)).replace("{total}", String(skills.length))}
          </span>
        </div>
        <Button
          onClick={() => setInstallModalOpen(true)}
          size="sm"
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          {t.skills.installNewSkill}
        </Button>
      </div>

      {/* ═══════════════ Install Modal ═══════════════ */}
      <SkillInstallModal
        open={installModalOpen}
        onOpenChange={setInstallModalOpen}
      />

      {/* Installation progress is now shown inline on skill cards */}

      {/* ═══════════════ Sidebar + Content ═══════════════ */}
      <div className="flex flex-col sm:flex-row gap-4" style={{ minHeight: "calc(100vh - 180px)" }}>
        {/* ---- Sidebar ---- */}
        <div className="sm:w-52 sm:shrink-0">
          <div className="sm:sticky sm:top-[72px] flex flex-col gap-1">
            {/* Search */}
            <div className="relative mb-2 hidden sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-xs"
                placeholder={t.common.search}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearch("")}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Top-level nav */}
            <div className="flex sm:flex-col gap-1 overflow-x-auto sm:overflow-x-visible scrollbar-none pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => { setView("skills"); setActiveCategory(null); setSearch(""); }}
                className={`group flex items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                  view === "skills" && !isSearching
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Package className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 truncate">{t.skills.all} ({skills.length})</span>
                {view === "skills" && !isSearching && <ChevronRight className="h-3 w-3 text-primary/50 shrink-0" />}
              </button>

              {/* Skill categories (nested under All Skills) */}
              {view === "skills" && !isSearching && allCategories.map(({ key, name, count }) => {
                const isActive = activeCategory === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveCategory(activeCategory === key ? null : key)}
                    className={`group flex items-center gap-2 px-2.5 py-1 pl-7 text-left text-[11px] transition-colors cursor-pointer ${
                      isActive
                        ? "text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <span className="flex-1 truncate">{name}</span>
                    <span className={`text-[10px] tabular-nums ${isActive ? "text-primary/60" : "text-muted-foreground/50"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => { setView("toolsets"); setSearch(""); }}
                className={`group flex items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                  view === "toolsets"
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Wrench className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 truncate">{t.skills.toolsets} ({toolsets.length})</span>
                {view === "toolsets" && <ChevronRight className="h-3 w-3 text-primary/50 shrink-0" />}
              </button>
            </div>
          </div>
        </div>

        {/* ---- Content ---- */}
        <div className="flex-1 min-w-0">
          {isSearching ? (
            /* Search results */
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    {t.skills.title}
                  </CardTitle>
                  <Badge variant="secondary" className="text-[10px]">
                    {t.skills.resultCount.replace("{count}", String(searchMatchedSkills.length)).replace("{s}", searchMatchedSkills.length !== 1 ? "s" : "")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {searchMatchedSkills.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {t.skills.noSkillsMatch}
                  </p>
                ) : (
                  <div className="grid gap-1">
                    {searchMatchedSkills.map((skill) => (
                      <SkillRow
                        key={skill.name}
                        skill={skill}
                        toggling={togglingSkills.has(skill.name)}
                        onToggle={() => handleToggleSkill(skill)}
                        onDelete={() => handleDeleteSkill(skill.name)}
                        onOpenDirectory={() => skill.path && handleOpenSkillDirectory(skill.path)}
                        onEditDescription={() => handleEditDescription(skill.name, skill.description || '')}
                        noDescriptionLabel={t.skills.noDescription}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : view === "skills" ? (
            /* Skills list */
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    {activeCategory
                      ? prettyCategory(activeCategory === "__none__" ? null : activeCategory, t.common.general)
                      : t.skills.all}
                  </CardTitle>
                  <Badge variant="secondary" className="text-[10px]">
                    {activeSkills.length} {t.skills.skillCount.replace("{count}", String(activeSkills.length)).replace("{s}", activeSkills.length !== 1 ? "s" : "")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {activeSkills.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {skills.length === 0
                      ? t.skills.noSkills.replace('$HERMES_HOME/skills/', skillsPath)
                      : t.skills.noSkillsMatch}
                  </p>
                ) : (
                  <div className="grid gap-1">
                    {activeSkills.map((skill) => (
                      <SkillRow
                        key={skill.name}
                        skill={skill}
                        toggling={togglingSkills.has(skill.name)}
                        onToggle={() => handleToggleSkill(skill)}
                        onDelete={() => handleDeleteSkill(skill.name)}
                        onOpenDirectory={() => skill.path && handleOpenSkillDirectory(skill.path)}
                        onEditDescription={() => handleEditDescription(skill.name, skill.description || '')}
                        noDescriptionLabel={t.skills.noDescription}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            /* Toolsets grid */
            <>
              {filteredToolsets.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    {t.skills.noToolsetsMatch}
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredToolsets.map((ts) => {
                    const TsIcon = toolsetIcon(ts.name);
                    const labelText = ts.label.replace(/^[\p{Emoji}\s]+/u, "").trim() || ts.name;

                    return (
                      <Card key={ts.name} className="relative">
                        <CardContent className="py-4">
                          <div className="flex items-start gap-3">
                            <TsIcon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-sm">{labelText}</span>
                                <Badge
                                  variant={ts.enabled ? "success" : "outline"}
                                  className="text-[10px]"
                                >
                                  {ts.enabled ? t.common.active : t.common.inactive}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mb-2">
                                {ts.description}
                              </p>
                              {ts.enabled && !ts.configured && (
                                <p className="text-[10px] text-amber-300/80 mb-2">
                                  {t.skills.setupNeeded}
                                </p>
                              )}
                              {ts.tools.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {ts.tools.map((tool) => (
                                    <Badge
                                      key={tool}
                                      variant="secondary"
                                      className="text-[10px] font-mono"
                                    >
                                      {tool}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {ts.tools.length === 0 && (
                                <span className="text-[10px] text-muted-foreground/60">
                                  {ts.enabled ? t.skills.toolsetLabel.replace("{name}", ts.name) : t.skills.disabledForCli}
                                </span>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SkillRow({
  skill,
  toggling,
  onToggle,
  onDelete,
  onOpenDirectory,
  onEditDescription,
  noDescriptionLabel,
}: SkillRowProps & {
  onOpenDirectory?: () => void;
  onEditDescription?: () => void;
}) {
  const { tasks } = useSkillInstallStore();
  const [deleting, setDeleting] = useState(false);

  // Find task for this skill - match by skill name (last component of skill_id)
  // e.g., task.skill_id = "official/security/1password" should match skill.name = "1password"
  const matchesSkill = (task: TaskState) => {
    if (task.skill_name === skill.name) return true;
    if (task.skill_id && task.skill_id.endsWith(`/${skill.name}`)) return true;
    if (task.skill_id && task.skill_id.split('/').pop() === skill.name) return true;
    return false;
  };

  const activeTask = Object.values(tasks).find(
    (task) =>
      matchesSkill(task) &&
      (task.status === 'pending' || task.status === 'queued' || task.status === 'in_progress')
  );

  const completedTask = Object.values(tasks).find(
    (task) => matchesSkill(task) && task.status === 'completed'
  );

  const failedTask = Object.values(tasks).find(
    (task) => matchesSkill(task) && task.status === 'failed'
  );

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="group flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40">
      <div className="pt-0.5 shrink-0">
        <Switch
          checked={skill.enabled}
          onCheckedChange={onToggle}
          disabled={toggling || !!activeTask}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={`font-mono-ui text-sm ${
              skill.enabled ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {(skill as any).displayName || skill.name}
          </span>
          {(skill as any).isNested && (
            <Badge variant="outline" className="text-[10px]">
              {(skill as any).categoryFromPath}
            </Badge>
          )}
          {activeTask && (
            <Badge variant="default" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {activeTask.progress}%
            </Badge>
          )}
          {completedTask && (
            <Badge variant="success" className="gap-1">
              <CheckCircle className="h-3 w-3" />
              Installed
            </Badge>
          )}
          {failedTask && (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="h-3 w-3" />
              Failed
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {skill.description || noDescriptionLabel}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {onEditDescription && (
          <button
            onClick={onEditDescription}
            disabled={!!activeTask}
            className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-50"
            title="Edit description"
          >
            <Edit className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        )}
        {onOpenDirectory && (
          <button
            onClick={onOpenDirectory}
            disabled={!!activeTask}
            className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-50"
            title="Open directory"
          >
            <FolderOpen className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={deleting || !!activeTask}
          className="p-1 rounded hover:bg-destructive/10 transition-colors disabled:opacity-50"
          title="Delete skill"
        >
          {deleting ? (
            <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
          )}
        </button>
      </div>
    </div>
  );
}

interface SkillRowProps {
  skill: SkillInfo;
  toggling: boolean;
  onToggle: () => void;
  onDelete: () => Promise<void>;
  noDescriptionLabel: string;
}
