import { useMemo, lazy, Suspense, useState, useEffect } from "react";
import { Routes, Route, NavLink, Navigate, useNavigate } from "react-router-dom";
import {
  Activity, BarChart3, Clock, FileText, KeyRound,
  MessageSquare, Package, Settings, Puzzle,
  Sparkles, Terminal, Globe, Database, Shield,
  Wrench, Zap, Heart, Star, Code, Eye, MessagesSquare,
  Loader2, AlertTriangle, Gauge,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OnboardingModal } from "@/components/OnboardingModal";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { usePlugins } from "@/plugins";
import { api } from "@/lib/api";
import { PROVIDER_CONFIGS } from "@/lib/providers";
import type { RegisteredPlugin } from "@/plugins";

// Type definition for Electron API
declare global {
  interface Window {
    electronAPI?: {
      getOnboardingStatus: () => Promise<{ needsOnboarding: boolean }>;
      onOnboardingStatus: (callback: (status: { needsOnboarding: boolean }) => void) => void;
      markOnboardingComplete: () => Promise<{ ok: boolean }>;
      resetOnboarding: () => Promise<{ ok: boolean }>;
      getPythonStatus: () => Promise<any>;
      restartPython: () => Promise<{ ok: boolean }>;
      getGatewayAuthToken: () => Promise<{ token: string | null }>;
    };
  }
}

// Lazy load non-critical pages
const CronPage = lazy(() => import("@/pages/CronPage"));
const SkillsPage = lazy(() => import("@/pages/SkillsPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const ChatPage = lazy(() => import("@/pages/ChatPage").then(m => ({ default: m.ChatPage })));
const DevToolsPage = lazy(() => import("@/pages/DevToolsPage"));

// ---------------------------------------------------------------------------
// Built-in nav items
// ---------------------------------------------------------------------------

interface NavItem {
  path: string;
  label: string;
  labelKey?: string;
  icon: React.ComponentType<{ className?: string }>;
}

const BUILTIN_NAV: NavItem[] = [
  { path: "/", labelKey: "chat", label: "Chat", icon: MessagesSquare },
  { path: "/cron", labelKey: "cron", label: "Cron", icon: Clock },
  { path: "/skills", labelKey: "skills", label: "Skills", icon: Package },
  { path: "/settings", labelKey: "settings", label: "Settings", icon: Settings },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map of icon names plugins can use. Covers common choices without importing all of lucide. */
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Activity, BarChart3, Clock, FileText, KeyRound,
  MessageSquare, MessagesSquare, Package, Settings, Puzzle,
  Sparkles, Terminal, Globe, Database, Shield,
  Wrench, Zap, Heart, Star, Code, Eye, Gauge,
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

export default function App() {
  const { t } = useI18n();
  const { plugins } = usePlugins();
  const navigate = useNavigate();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showConfigWarning, setShowConfigWarning] = useState(false);

  const navItems = useMemo(
    () => buildNavItems(BUILTIN_NAV, plugins),
    [plugins],
  );

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
        const envVars = await api.getEnvVars();

        // Check if any provider is configured
        let hasConfiguredProvider = false;
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
      } catch (error) {
        // Don't show warning if API fails
        console.error("Failed to check configuration:", error);
      }
    };

    // Only check after onboarding is complete
    if (!showOnboarding) {
      checkConfiguration();
    }
  }, [showOnboarding]);

  const handleOnboardingComplete = async () => {
    if (window.electronAPI?.markOnboardingComplete) {
      await window.electronAPI.markOnboardingComplete();
    }
    setShowOnboarding(false);
    // Re-check configuration
    setShowConfigWarning(false);
  };

  const handleOnboardingSkip = async () => {
    if (window.electronAPI?.markOnboardingComplete) {
      await window.electronAPI.markOnboardingComplete();
    }
    setShowOnboarding(false);
  };

  const handleCompleteSetup = () => {
    setShowOnboarding(true);
    setShowConfigWarning(false);
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground overflow-x-hidden">
      <div className="noise-overlay" />
      <div className="warm-glow" />

      <header className="fixed top-0 left-0 right-0 z-40 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-12 max-w-[1400px] items-stretch">
          <div className="flex items-center border-r border-border px-3 sm:px-5 shrink-0">
            <span className="font-collapse text-lg sm:text-xl font-bold tracking-wider uppercase blend-lighter">
              H<span className="hidden sm:inline">ermes </span>A<span className="hidden sm:inline">gent</span>
            </span>
          </div>

          <nav className="flex items-stretch overflow-x-auto scrollbar-none">
            {navItems.map(({ path, label, labelKey, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
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
            <ThemeSwitcher />
            <LanguageSwitcher />
            <span className="hidden sm:inline font-display text-[0.7rem] tracking-[0.15em] uppercase opacity-50">
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

      <main className={`relative z-2 mx-auto w-full max-w-[1400px] flex-1 px-3 sm:px-6 pb-4 sm:pb-8 overflow-y-auto ${
        showConfigWarning ? "pt-24 sm:pt-28" : "pt-16 sm:pt-20"
      }`}>
        <ErrorBoundary>
          <Suspense fallback={
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          }>
            <Routes>
              <Route path="/" element={<ChatPage />} />
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
    </div>
  );
}
