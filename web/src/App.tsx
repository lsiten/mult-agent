import { useMemo, lazy, Suspense, useState, useEffect } from "react";
import { Routes, Route, NavLink, Navigate, useNavigate, useLocation } from "react-router-dom";
import {
  Activity, BarChart3, Clock, FileText, KeyRound,
  MessageSquare, Package, Settings, Puzzle,
  Sparkles, Terminal, Globe, Database, Shield,
  Wrench, Zap, Heart, Star, Code, Eye, MessagesSquare,
  Loader2, AlertTriangle, Gauge, Building2, GitBranch,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { AgentIdentitySwitcher } from "@/components/AgentIdentitySwitcher";
import { WorkSelector } from "@/components/WorkSelector";
import { useAgentSwitcher } from "@/hooks/useAgentSwitcher";
import { useWorkSelector } from "@/hooks/useWorkSelector";
import { SubAgentErrorModal } from "@/components/SubAgentErrorModal";
import { AgentProvider } from "@/contexts/AgentContext";
// import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OnboardingModal } from "@/components/OnboardingModal";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { usePlugins } from "@/plugins";
import { api } from "@/lib/api";
import { emitEnvRefresh } from "@/lib/envRefresh";
import { PROVIDER_CONFIGS } from "@/lib/providers";
import type { RegisteredPlugin } from "@/plugins";
import RecruitWorkspacePage from "@/pages/RecruitWorkspacePage";
import RecruitRequirementPage from "@/pages/RecruitRequirementPage";
import RecruitCandidatePage from "@/pages/RecruitCandidatePage";
import RecruitPlaceholderPage from "@/pages/RecruitPlaceholderPage";
import { useEntryShortcutManager } from "@/hooks/useEntryShortcutManager";
import type { RecruitPageId } from "@/pages/recruitNavigation";

// Lazy load non-critical pages
const CronPage = lazy(() => import("@/pages/CronPage"));
const SkillsPage = lazy(() => import("@/pages/SkillsPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const ChatPage = lazy(() => import("@/pages/ChatPage").then(m => ({ default: m.ChatPage })));
const DevToolsPage = lazy(() => import("@/pages/DevToolsPage"));
const OrganizationPage = lazy(() => import("@/pages/OrganizationPage/index"));
const WorkflowsPage = lazy(() => import("@/pages/WorkflowsPage"));

// ---------------------------------------------------------------------------
// Built-in nav items
// ---------------------------------------------------------------------------

interface NavItem {
  path: string;
  label: string;
  labelKey?: string;
  icon: React.ComponentType<{ className?: string }>;
  /** If true the nav item is only shown for the master agent. */
  masterOnly?: boolean;
}

const BUILTIN_NAV: NavItem[] = [
  { path: "/", labelKey: "chat", label: "Chat", icon: MessagesSquare },
  { path: "/organization", labelKey: "organization", label: "Organization", icon: Building2, masterOnly: true },
  { path: "/workflows", labelKey: "workflows", label: "Workflows", icon: GitBranch, masterOnly: true },
  { path: "/cron", labelKey: "cron", label: "Cron", icon: Clock },
  { path: "/skills", labelKey: "skills", label: "Skills", icon: Package },
  { path: "/settings", labelKey: "settings", label: "Settings", icon: Settings },
];

/**
 * Paths that may only be visited while the master agent is active.
 * Sub-agent sessions are confined to their own Profile workspace and any
 * attempt to navigate here while a sub-agent is selected is redirected to
 * the chat page for that agent.
 */
const MASTER_ONLY_PATHS = new Set<string>(["/organization", "/dev-tools", "/workflows"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map of icon names plugins can use. Covers common choices without importing all of lucide. */
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Activity, BarChart3, Clock, FileText, KeyRound,
  MessageSquare, MessagesSquare, Package, Settings, Puzzle,
  Sparkles, Terminal, Globe, Database, Shield,
  Wrench, Zap, Heart, Star, Code, Eye, Gauge, Building2,
};

/** Resolve a Lucide icon name to a component, fallback to Puzzle. */
function resolveIcon(name: string): React.ComponentType<{ className?: string }> {
  return ICON_MAP[name] ?? Puzzle;
}

/** Insert plugin nav items at the position specified in their manifest. */
function buildNavItems(builtIn: NavItem[], plugins: RegisteredPlugin[]): NavItem[] {
  const items = [...builtIn];

  for (const { manifest } of plugins) {
    const pluginItem: NavItem = {
      path: manifest.tab.path,
      label: manifest.label,
      icon: resolveIcon(manifest.icon),
    };

    const pos = manifest.tab.position ?? "end";
    if (pos === "end") {
      items.push(pluginItem);
    } else if (pos.startsWith("after:")) {
      const target = "/" + pos.slice(6);
      const idx = items.findIndex((i) => i.path === target);
      items.splice(idx >= 0 ? idx + 1 : items.length, 0, pluginItem);
    } else if (pos.startsWith("before:")) {
      const target = "/" + pos.slice(7);
      const idx = items.findIndex((i) => i.path === target);
      items.splice(idx >= 0 ? idx : items.length, 0, pluginItem);
    } else {
      items.push(pluginItem);
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function HermesApp() {
  const { t } = useI18n();
  const { plugins } = usePlugins();
  const navigate = useNavigate();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showConfigWarning, setShowConfigWarning] = useState(false);

  const {
    activeAgentId,
    activeAgent,
    availableAgents,
    agentsLoaded,
    loadAgents,
    switchToAgent,
    startupError,
    retryStartup,
    clearError,
    isReady,
  } = useAgentSwitcher();

  const {
    scope,
    companies,
    loaded: workLoaded,
    selectScope,
    agentsForScope,
  } = useWorkSelector();

  // Get agents for the current scope
  const scopedAgents = useMemo(() => {
    if (scope.type === "company") {
      return agentsForScope[scope.company.id] ?? [];
    }
    // Master scope: show all agents
    return availableAgents;
  }, [scope, agentsForScope, availableAgents]);

  // When switching to a company, auto-select the highest-ranking manager
  useEffect(() => {
    if (scope.type === "company" && scopedAgents.length > 0) {
      const managerOrder: Record<string, number> = { primary: 0, deputy: 1, none: 2 };
      const sorted = [...scopedAgents].sort((a, b) => {
        const aRank = managerOrder[a.leadership_role ?? 'none'] ?? 2;
        const bRank = managerOrder[b.leadership_role ?? 'none'] ?? 2;
        return aRank - bRank;
      });
      const topManager = sorted[0];
      if (topManager && activeAgentId !== topManager.id) {
        switchToAgent(topManager.id);
      }
    } else if (scope.type === "master" && activeAgentId !== null) {
      // When switching to master, clear the agentId
      switchToAgent(null);
    }
  }, [scope.type, scope.type === "company" && (scope as any).company?.id, scopedAgents]);

  const isSubAgent = activeAgentId != null;

  const navItems = useMemo(
    () => buildNavItems(BUILTIN_NAV, plugins).filter((item) => !(isSubAgent && item.masterOnly)),
    [plugins, isSubAgent],
  );

  // Route guard: sub-agents are confined to their Profile workspace, so any
  // attempt to visit a master-only path while a sub-agent is active routes
  // them back to the chat for that agent.  We keep the ``agentId`` query
  // parameter so the user does not lose their identity.
  const location = useLocation();
  useEffect(() => {
    if (!isSubAgent) return;
    if (MASTER_ONLY_PATHS.has(location.pathname)) {
      const params = new URLSearchParams(location.search);
      params.set("agentId", String(activeAgentId));
      navigate(`/?${params.toString()}`, { replace: true });
    }
  }, [isSubAgent, activeAgentId, location.pathname, location.search, navigate]);

  // Global keyboard shortcut: Cmd+Shift+D to open DevTools
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey && event.shiftKey && event.key === 'D') {
        event.preventDefault();
        navigate('/dev-tools');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  // Listen for onboarding status from Electron
  useEffect(() => {
    const checkOnboarding = async () => {
      if (window.electronAPI?.getOnboardingStatus) {
        try {
          const status = await window.electronAPI.getOnboardingStatus();
          console.log('[App] Initial onboarding status:', status);
          setShowOnboarding(status.needsOnboarding);
        } catch (error) {
          console.error('[App] Failed to get onboarding status:', error);
        }
      }
    };

    // Check status immediately on mount
    checkOnboarding();

    // Also listen for status changes
    if (window.electronAPI?.onOnboardingStatus) {
      console.log('[App] Setting up onOnboardingStatus listener');
      window.electronAPI.onOnboardingStatus((status) => {
        console.log('[App] Received onboarding status update:', status);
        console.log('[App] Current showOnboarding:', showOnboarding);
        console.log('[App] Setting showOnboarding to:', status.needsOnboarding);
        setShowOnboarding(status.needsOnboarding);
      });
    } else {
      console.warn('[App] onOnboardingStatus not available');
    }
  }, []);

  // Check if LLM provider is configured
  useEffect(() => {
    const checkConfiguration = async () => {
      try {
        // ⛔ 等待 Agent 就绪后再检查配置
        // 防止 Sub Agent 启动中时检查到错误配置
        if (!isReady) {
          console.log('[App] Agent not ready, skipping config check');
          return;
        }

        const [envResult, modelResult] = await Promise.allSettled([
          api.getEnvVars(),
          api.getModelInfo(),
        ]);

        if (envResult.status !== "fulfilled") {
          setShowConfigWarning(false);
          return;
        }

        const envVars = envResult.value;

        const hasRequiredFields = (providerId: string) => {
          const provider = PROVIDER_CONFIGS.find((p) => p.id === providerId);
          if (!provider || provider.isOAuth) return false;

          return provider.fields
            .filter((f) => f.required)
            .every((f) => envVars[f.key]?.is_set);
        };

        const activeProvider =
          modelResult.status === "fulfilled" ? modelResult.value.provider : "";
        const activeProviderId =
          activeProvider === "kimi-coding" ? "kimi" :
          activeProvider === "ollama-cloud" ? "ollama" :
          activeProvider;
        const activeModel =
          modelResult.status === "fulfilled" ? modelResult.value.model : "";

        const activeProviderConfigured =
          Boolean(activeModel) &&
          activeProviderId !== "" &&
          activeProviderId !== "auto" &&
          hasRequiredFields(activeProviderId);

        // Check if any provider is configured
        let hasConfiguredProvider = activeProviderConfigured;
        for (const provider of PROVIDER_CONFIGS) {
          if (provider.isOAuth) continue; // Skip OAuth for now

          const hasAllRequired = provider.fields
            .filter((f) => f.required)
            .every((f) => envVars[f.key]?.is_set);

          if (hasAllRequired) {
            hasConfiguredProvider = true;
            break;
          }
        }

        setShowConfigWarning(!hasConfiguredProvider);
        console.log(`[App] Config check complete (Agent ${activeAgentId ?? 'master'}): hasConfiguredProvider=${hasConfiguredProvider}`);
      } catch (error) {
        // Don't show warning if API fails
        console.error("Failed to check configuration:", error);
      }
    };

    // Only check after onboarding is complete
    if (!showOnboarding) {
      checkConfiguration();
    }
  }, [showOnboarding, activeAgentId, isReady]);

  const handleOnboardingComplete = async () => {
    if (window.electronAPI?.markOnboardingComplete) {
      await window.electronAPI.markOnboardingComplete();
    }
    setShowOnboarding(false);
    // Re-check configuration
    setShowConfigWarning(false);
    // The wizard just wrote fresh keys into ``.env``. Notify any cached
    // consumers (Env page, OAuth card, master visibility hook) so they
    // can re-read the file instead of showing stale "not configured" UI.
    emitEnvRefresh();
  };

  const handleOnboardingSkip = async () => {
    if (window.electronAPI?.markOnboardingComplete) {
      await window.electronAPI.markOnboardingComplete();
    }
    setShowOnboarding(false);
    // Skip still closes the wizard, but the user may have saved keys part
    // way through — refetch defensively so nothing is left stale.
    emitEnvRefresh();
  };

  const handleCompleteSetup = () => {
    setShowOnboarding(true);
    setShowConfigWarning(false);
  };

  return (
    <AgentProvider value={{ isReady, activeAgentId }}>
      <div className="flex h-screen flex-col bg-background text-foreground overflow-x-hidden">
        <div className="noise-overlay" />
        <div className="warm-glow" />

      <header className="fixed top-0 left-0 right-0 z-40 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-12 max-w-[1400px] items-stretch">
          <div className="flex items-center border-r border-border px-3 sm:px-5 shrink-0">
            <WorkSelector
              scope={scope}
              companies={companies}
              loaded={workLoaded}
              onSelectScope={selectScope}
              agentsForScope={agentsForScope}
            />
          </div>

          <nav className="flex items-stretch overflow-x-auto scrollbar-none">
            {navItems.map(({ path, label, labelKey, icon: Icon }) => (
              <NavLink
                key={path}
                // Preserve the active ``agentId`` across nav clicks so
                // switching tabs does not silently drop the user back to
                // the master agent.  NavLink's ``to`` accepts a partial
                // location object — the ``search`` field carries
                // ``?agentId=X`` when a sub-agent is active.
                to={{
                  pathname: path,
                  search: isSubAgent ? `?agentId=${activeAgentId}` : "",
                }}
                end={path === "/"}
                className={({ isActive }) =>
                  `group relative inline-flex items-center gap-1 sm:gap-1.5 border-r border-border px-2.5 sm:px-4 py-2 font-display text-[0.65rem] sm:text-[0.8rem] tracking-[0.12em] uppercase whitespace-nowrap transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className="h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0" />
                    <span className="hidden sm:inline">
                      {labelKey ? (t.app.nav as Record<string, string>)[labelKey] ?? label : label}
                    </span>
                    <span className="absolute inset-0 bg-foreground pointer-events-none transition-opacity duration-150 group-hover:opacity-5 opacity-0" />
                    {isActive && (
                      <span className="absolute bottom-0 left-0 right-0 h-px bg-foreground" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 px-2 sm:px-4">
            <AgentIdentitySwitcher
              activeAgentId={activeAgentId}
              activeAgent={activeAgent}
              availableAgents={availableAgents}
              agentsLoaded={agentsLoaded}
              onLoadAgents={loadAgents}
              onSwitchAgent={switchToAgent}
              hasError={!!startupError}
              companyAgents={scope.type === "company" ? scopedAgents : undefined}
            />
            <span className="hidden h-5 w-px bg-border/70 sm:block" />
            <LanguageSwitcher />
            <span className="hidden sm:inline text-[0.7rem] tracking-[0.15em] uppercase opacity-50">
              {t.app.webUi}
            </span>
          </div>
        </div>
      </header>

      {/* Configuration Warning Banner */}
      {showConfigWarning && !showOnboarding && (
        <div className="fixed top-12 left-0 right-0 z-30 border-b border-amber-500/20 bg-amber-500/10 backdrop-blur-sm">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between px-3 sm:px-6 py-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-xs sm:text-sm text-foreground">
                LLM provider not configured. Please complete the setup to use Hermes Agent.
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCompleteSetup}
              className="shrink-0 text-xs"
            >
              Complete Setup
            </Button>
          </div>
        </div>
      )}

      {/* Sub-agent scope banner: makes it explicit that everything the user
          does from this point on lives inside the selected sub-agent's
          Profile workspace. Clicking "回到主 Agent" drops the query param
          and returns to the master agent context. */}
      {isSubAgent && !showOnboarding && (
        <div
          className="fixed left-0 right-0 z-30 border-b border-primary/20 bg-primary/5 backdrop-blur-sm"
          style={{ top: showConfigWarning ? "5.5rem" : "3rem" }}
        >
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-3 sm:px-6 py-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: activeAgent?.accent_color || "#6366f1" }}
              />
              <span className="truncate text-[11px] sm:text-xs text-foreground/80">
                {t.chat.scopeBannerPrefix}
                <span className="mx-1 font-semibold text-foreground">
                  {activeAgent?.display_name || activeAgent?.name || `Agent #${activeAgentId}`}
                </span>
                {t.chat.scopeBannerSuffix}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => switchToAgent(null)}
              className="h-6 shrink-0 px-2 text-[11px]"
            >
              {t.chat.scopeBannerBackToMaster}
            </Button>
          </div>
        </div>
      )}

      <main className={`relative z-2 mx-auto w-full max-w-[1400px] flex-1 px-3 sm:px-6 pb-4 sm:pb-8 overflow-y-auto ${
        showConfigWarning && isSubAgent
          ? "pt-32 sm:pt-36"
          : showConfigWarning
            ? "pt-24 sm:pt-28"
            : isSubAgent
              ? "pt-24 sm:pt-28"
              : "pt-16 sm:pt-20"
      }`}>
        <ErrorBoundary>
          <Suspense fallback={
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          }>
            <Routes>
              <Route path="/" element={<ChatPage scope={scope} />} />
              <Route path="/organization" element={<OrganizationPage />} />
              <Route path="/workflows" element={<WorkflowsPage scope={scope} />} />
              <Route path="/cron" element={<CronPage />} />
              <Route path="/skills" element={<SkillsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/dev-tools" element={<DevToolsPage />} />

            {/* Plugin routes */}
            {plugins.map(({ manifest, component: PluginComponent }) => (
              <Route
                key={manifest.name}
                path={manifest.tab.path}
                element={<PluginComponent />}
              />
            ))}

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      <footer className="relative z-2 border-t border-border">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-3 sm:px-6 py-3">
          <span className="font-display text-[0.7rem] sm:text-[0.8rem] tracking-[0.12em] uppercase opacity-50">
            {t.app.footer.name}
          </span>
          <span className="font-display text-[0.6rem] sm:text-[0.7rem] tracking-[0.15em] uppercase text-foreground/40">
            {t.app.footer.org}
          </span>
        </div>
      </footer>

      {/* Onboarding Modal */}
      <ErrorBoundary fallback={null}>
        <OnboardingModal
          open={showOnboarding}
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      </ErrorBoundary>

      {/* Sub Agent Error Modal */}
      {startupError && (
        <SubAgentErrorModal
          agentId={startupError.agentId}
          error={startupError.error}
          onRetry={retryStartup}
          onCancel={clearError}
        />
      )}
      </div>
    </AgentProvider>
  );
}

export default function App() {
  const { mode } = useEntryShortcutManager();
  const [recruitPage, setRecruitPage] = useState<RecruitPageId>("workspace");

  if (mode === "recruit") {
    if (recruitPage === "requirements") {
      return <RecruitRequirementPage currentPage={recruitPage} onNavigate={setRecruitPage} />;
    }
    if (recruitPage === "talent") {
      return <RecruitCandidatePage currentPage={recruitPage} onNavigate={setRecruitPage} />;
    }
    if (recruitPage === "dashboard" || recruitPage === "settings") {
      return <RecruitPlaceholderPage currentPage={recruitPage} onNavigate={setRecruitPage} />;
    }
    return <RecruitWorkspacePage currentPage={recruitPage} onNavigate={setRecruitPage} />;
  }

  return <HermesApp />;
}
