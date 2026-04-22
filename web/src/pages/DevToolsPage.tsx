import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Activity,
  Server,
  Terminal,
  Zap,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import StatusPage from './StatusPage';
import PerformancePage from './PerformancePage';
import AnalyticsPage from './AnalyticsPage';

interface ServiceStatus {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'error';
  dependencies: string[];
  metrics?: Record<string, any>;
}

interface IPCHandler {
  channel: string;
  schema?: string;
  description?: string;
}

const FILES = ["agent", "errors", "gateway"] as const;
const LEVELS = ["ALL", "DEBUG", "INFO", "WARNING", "ERROR"] as const;
const COMPONENTS = ["all", "gateway", "agent", "tools", "cli", "cron"] as const;
const LINE_COUNTS = [50, 100, 200, 500] as const;

function classifyLine(line: string): "error" | "warning" | "info" | "debug" {
  const upper = line.toUpperCase();
  if (upper.includes("ERROR") || upper.includes("CRITICAL") || upper.includes("FATAL")) return "error";
  if (upper.includes("WARNING") || upper.includes("WARN")) return "warning";
  if (upper.includes("DEBUG")) return "debug";
  return "info";
}

const LINE_COLORS: Record<string, string> = {
  error: "text-red-500",
  warning: "text-yellow-500",
  info: "text-foreground",
  debug: "text-muted-foreground/60",
};

function SidebarItem<T extends string>({
  label,
  value,
  current,
  onChange,
}: {
  label: string;
  value: T;
  current: T;
  onChange: (v: T) => void;
}) {
  const isActive = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`group flex items-center gap-2 px-2.5 py-1 text-left text-xs transition-colors cursor-pointer rounded ${
        isActive
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}
    >
      <span className="flex-1 truncate">{label}</span>
      {isActive && <ChevronRight className="h-3 w-3 text-primary/50 shrink-0" />}
    </button>
  );
}

export default function DevToolsPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState("status");
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [ipcHandlers, setIPCHandlers] = useState<IPCHandler[]>([]);

  // Log state
  const [file, setFile] = useState<(typeof FILES)[number]>("agent");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("ALL");
  const [component, setComponent] = useState<(typeof COMPONENTS)[number]>("all");
  const [lineCount, setLineCount] = useState<(typeof LINE_COUNTS)[number]>(100);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadServices();
    loadIPCHandlers();
  }, []);

  const loadServices = async () => {
    // Mock data
    const mockServices: ServiceStatus[] = [
      {
        id: 'env',
        name: 'Environment Service',
        status: 'running',
        dependencies: [],
      },
      {
        id: 'config',
        name: 'Configuration Service',
        status: 'running',
        dependencies: ['env'],
      },
      {
        id: 'gateway',
        name: 'Gateway Service',
        status: 'running',
        dependencies: ['env', 'config'],
      },
      {
        id: 'vite-dev',
        name: 'Vite Dev Server',
        status: 'running',
        dependencies: [],
      },
      {
        id: 'window',
        name: 'Window Service',
        status: 'running',
        dependencies: ['vite-dev'],
      },
    ];
    setServices(mockServices);
  };

  const loadIPCHandlers = () => {
    const handlers: IPCHandler[] = [
      { channel: 'shell:openExternal', description: 'Open external URL' },
      { channel: 'python:getStatus', description: 'Get Gateway status' },
      { channel: 'python:restart', description: 'Restart Gateway' },
      { channel: 'gateway:getAuthToken', description: 'Get auth token' },
      { channel: 'vite:getStatus', description: 'Get Vite server status' },
      { channel: 'window:minimize', description: 'Minimize window' },
      { channel: 'window:close', description: 'Close window' },
      { channel: 'onboarding:getStatus', description: 'Get onboarding status' },
      { channel: 'onboarding:markComplete', description: 'Mark onboarding complete' },
      { channel: 'onboarding:reset', description: 'Reset onboarding' },
      { channel: 'app:getPath', description: 'Get app path' },
      { channel: 'diagnostic:getDependencies', description: 'Get dependencies' },
      { channel: 'diagnostic:getLogs', description: 'Get logs' },
      { channel: 'diagnostic:getLogsPath', description: 'Get logs path' },
      { channel: 'diagnostic:retry', description: 'Retry startup' },
    ];
    setIPCHandlers(handlers);
  };

  const fetchLogs = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getLogs({ file, lines: lineCount, level, component })
      .then((resp) => {
        setLines(resp.lines);
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        }, 50);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [file, lineCount, level, component]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const getServiceBadge = (status: ServiceStatus['status']) => {
    switch (status) {
      case 'running':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />{t.devTools.services.running}</Badge>;
      case 'stopped':
        return <Badge variant="secondary"><XCircle className="w-3 h-3 mr-1" />{t.devTools.services.stopped}</Badge>;
      case 'error':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />{t.devTools.services.error}</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t.devTools.title}</h1>
          <p className="text-muted-foreground">{t.devTools.subtitle}</p>
        </div>
        <Button onClick={loadServices} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          {t.devTools.refresh}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="status">
            <Activity className="w-4 h-4 mr-2" />
            {t.devTools.status.title}
          </TabsTrigger>
          <TabsTrigger value="performance">
            <Zap className="w-4 h-4 mr-2" />
            {t.devTools.performance.title}
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <Activity className="w-4 h-4 mr-2" />
            {t.devTools.analytics.title}
          </TabsTrigger>
          <TabsTrigger value="services">
            <Server className="w-4 h-4 mr-2" />
            {t.devTools.services.title}
          </TabsTrigger>
          <TabsTrigger value="logs">
            <Terminal className="w-4 h-4 mr-2" />
            {t.devTools.logs.title}
          </TabsTrigger>
          <TabsTrigger value="ipc">
            <Zap className="w-4 h-4 mr-2" />
            {t.devTools.ipc.title}
          </TabsTrigger>
        </TabsList>

        {activeTab === "status" && (
              <div className="mt-4">
                <StatusPage />
              </div>
            )}

            {activeTab === "performance" && (
              <div className="mt-4">
                <PerformancePage />
              </div>
            )}

            {activeTab === "analytics" && (
              <div className="mt-4">
                <AnalyticsPage />
              </div>
            )}

            {activeTab === "services" && (
              <div className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>{t.devTools.services.status}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {services.map((service) => (
                        <div key={service.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div>
                            <h3 className="font-medium">{service.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {t.devTools.services.dependencies}: {service.dependencies.length > 0 ? service.dependencies.join(', ') : t.devTools.services.none}
                            </p>
                          </div>
                          {getServiceBadge(service.status)}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "logs" && (
              <div className="flex flex-col sm:flex-row gap-4 mt-4">
                {/* Sidebar */}
                <div className="sm:w-44 sm:shrink-0">
                  <div className="flex flex-col gap-2 p-2 border rounded-lg">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                      {t.logs.file}
                    </span>
                    {FILES.map((f) => (
                      <SidebarItem key={f} label={f} value={f} current={file} onChange={setFile} />
                    ))}

                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mt-2">
                      {t.logs.level}
                    </span>
                    {LEVELS.map((l) => (
                      <SidebarItem key={l} label={l} value={l} current={level} onChange={setLevel} />
                    ))}

                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mt-2">
                      {t.logs.component}
                    </span>
                    {COMPONENTS.map((c) => (
                      <SidebarItem key={c} label={c} value={c} current={component} onChange={setComponent} />
                    ))}

                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mt-2">
                      {t.logs.lines}
                    </span>
                    {LINE_COUNTS.map((n) => (
                      <SidebarItem
                        key={n}
                        label={String(n)}
                        value={String(n)}
                        current={String(lineCount)}
                        onChange={(v) => setLineCount(Number(v) as (typeof LINE_COUNTS)[number])}
                      />
                    ))}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between py-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Terminal className="h-4 w-4" />
                        {file}.log
                        {loading && (
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        )}
                      </CardTitle>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                          <Label htmlFor="auto-refresh" className="text-xs">{t.logs.autoRefresh}</Label>
                        </div>
                        <Button variant="outline" size="sm" onClick={fetchLogs} className="h-7">
                          <RefreshCw className="h-3 w-3 mr-1" />
                          {t.common.refresh}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      {error && (
                        <div className="bg-destructive/10 border-b border-destructive/20 p-3">
                          <p className="text-sm text-destructive">{error}</p>
                        </div>
                      )}

                      <div
                        ref={scrollRef}
                        className="p-4 font-mono text-xs leading-5 overflow-auto max-h-[600px] min-h-[400px]"
                      >
                        {lines.length === 0 && !loading && (
                          <p className="text-muted-foreground text-center py-8">{t.logs.noLogLines}</p>
                        )}
                        {lines.map((line, i) => {
                          const cls = classifyLine(line);
                          return (
                            <div key={i} className={`${LINE_COLORS[cls]} hover:bg-secondary/20 px-1 -mx-1`}>
                              {line}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {activeTab === "ipc" && (
              <div className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>{t.devTools.ipc.registered} ({ipcHandlers.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {ipcHandlers.map((handler) => (
                        <div key={handler.channel} className="flex items-center justify-between p-3 border rounded">
                          <div>
                            <code className="text-sm font-mono">{handler.channel}</code>
                            {handler.description && (
                              <p className="text-xs text-muted-foreground mt-1">{handler.description}</p>
                            )}
                          </div>
                          <Badge variant="outline">{t.devTools.ipc.registeredStatus}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
      </Tabs>
    </div>
  );
}
