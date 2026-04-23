import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, Activity, Clock, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { useI18n } from '@/i18n';

interface GatewayStatus {
  running: boolean;
  pid?: number;
  healthy: boolean;
  consecutiveFailures: number;
  restartInProgress?: boolean;
  circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  // Optional extended metrics (if available)
  gatewayStartupTime?: number;
  gatewayStartAttempts?: number;
  errorRate?: string;
  uptimeFormatted?: string;
  restartCount?: number;
  healthCheckSuccesses?: number;
  healthCheckFailures?: number;
  totalHealthChecks?: number;
  lastError?: string | null;
  lastErrorTime?: number;
}

export default function PerformancePage() {
  const { t } = useI18n();
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState(false);

  const fetchStatus = async () => {
    try {
      if (window.electronAPI) {
        const response = await (window.electronAPI.getPythonStatus as any)({ includeMetrics: true });
        console.log('[PerformancePage] Received response:', response);

        // IPC Registry wraps responses in { ok, data }
        if (response && typeof response === 'object' && 'data' in response) {
          const data = (response as any).data;
          console.log('[PerformancePage] Unwrapped data:', data);
          console.log('[PerformancePage] data.running =', data.running);
          console.log('[PerformancePage] data.pid =', data.pid);
          setStatus(data as GatewayStatus);
        } else {
          // Fallback for direct response
          setStatus(response as GatewayStatus);
        }
      }
    } catch (error) {
      console.error('Failed to fetch status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // 每 5 秒刷新
    return () => clearInterval(interval);
  }, []);

  const handleRestart = async () => {
    if (!window.electronAPI) return;

    setRestarting(true);
    const oldPid = status?.pid;

    try {
      await window.electronAPI.restartPython();

      // Poll status until PID changes or 20 seconds timeout
      let attempts = 0;
      const maxAttempts = 40; // 40 * 500ms = 20 seconds

      const pollInterval = setInterval(async () => {
        attempts++;
        await fetchStatus();

        // Get latest status from state
        const response = await (window.electronAPI?.getPythonStatus as any)?.({ includeMetrics: true });
        const newStatus = response?.data || response;

        // Stop polling if PID changed (restart successful) or max attempts reached
        if (newStatus.pid !== oldPid || !newStatus.running || attempts >= maxAttempts) {
          clearInterval(pollInterval);
          setRestarting(false);
        }
      }, 500);
    } catch (error) {
      console.error('Failed to restart:', error);
      setRestarting(false);
    }
  };

  const getCircuitBreakerBadge = (state: string) => {
    switch (state) {
      case 'CLOSED':
        return <Badge variant="default" className="bg-green-500 flex items-center gap-1"><CheckCircle className="w-3 h-3" />{t.performance.circuitBreaker.closed}</Badge>;
      case 'OPEN':
        return <Badge variant="destructive" className="flex items-center gap-1"><XCircle className="w-3 h-3" />{t.performance.circuitBreaker.open}</Badge>;
      case 'HALF_OPEN':
        return <Badge variant="secondary" className="flex items-center gap-1"><AlertCircle className="w-3 h-3" />{t.performance.circuitBreaker.halfOpen}</Badge>;
      default:
        return <Badge variant="outline">{t.performance.circuitBreaker.unknown}</Badge>;
    }
  };

  const getStatusBadge = (running: boolean, restartInProgress: boolean) => {
    if (restartInProgress) {
      return <Badge variant="secondary" className="flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" />{t.performance.status.restarting}</Badge>;
    }
    if (running) {
      return <Badge variant="default" className="bg-green-500 flex items-center gap-1"><Activity className="w-3 h-3" />{t.performance.status.running}</Badge>;
    }
    return <Badge variant="destructive" className="flex items-center gap-1"><XCircle className="w-3 h-3" />{t.performance.status.stopped}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t.performance.statusUnavailable}</CardTitle>
            <CardDescription>{t.performance.failedToLoad}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t.performance.title}</h1>
          <p className="text-muted-foreground">{t.performance.subtitle}</p>
        </div>
        <Button
          onClick={handleRestart}
          disabled={restarting || status.restartInProgress}
          variant="outline"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${(restarting || status.restartInProgress) ? 'animate-spin' : ''}`} />
          {t.performance.restartGateway}
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{t.devTools.metrics.startupTime}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {status.gatewayStartupTime ? `${(status.gatewayStartupTime / 1000).toFixed(2)}s` : '~2.5s'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t.devTools.metrics.startupTarget}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{t.devTools.metrics.p95Latency}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {status.p95Latency}ms
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t.devTools.metrics.latencyTarget}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{t.devTools.metrics.errorRate}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${status.errorRate === '0%' || status.consecutiveFailures === 0 ? 'text-green-500' : 'text-yellow-500'}`}>
              {status.errorRate || '0%'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t.devTools.metrics.errorTarget}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Status Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{t.performance.status.title}</CardTitle>
          </CardHeader>
          <CardContent>
            {getStatusBadge(status.running ?? false, status.restartInProgress ?? false)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{t.performance.uptime.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Clock className="w-5 h-5 text-muted-foreground" />
              {status.uptimeFormatted || '0s'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{t.performance.circuitBreaker.title}</CardTitle>
          </CardHeader>
          <CardContent>
            {getCircuitBreakerBadge(status.circuitState)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{t.performance.restartCount.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {status.restartCount ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Startup Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>{t.performance.startup.title}</CardTitle>
          <CardDescription>{t.performance.startup.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-sm font-medium text-muted-foreground">{t.performance.startup.time}</div>
              <div className="text-2xl font-bold">{status.gatewayStartupTime ?? 0}ms</div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">{t.performance.startup.attempts}</div>
              <div className="text-2xl font-bold">{status.gatewayStartAttempts ?? 0}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Health Check Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>{t.performance.healthCheck.title}</CardTitle>
          <CardDescription>{t.performance.healthCheck.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="text-sm font-medium text-muted-foreground">{t.performance.healthCheck.avgLatency}</div>
              <div className="text-2xl font-bold">{status.avgLatency ?? 0}ms</div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">{t.performance.healthCheck.p95Latency}</div>
              <div className="text-2xl font-bold">{status.p95Latency ?? 0}ms</div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">{t.performance.healthCheck.p99Latency}</div>
              <div className="text-2xl font-bold">{status.p99Latency ?? 0}ms</div>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="text-sm font-medium text-muted-foreground">{t.performance.healthCheck.totalChecks}</div>
              <div className="text-xl font-bold">{status.totalHealthChecks ?? 0}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">{t.performance.healthCheck.success}</div>
              <div className="text-xl font-bold text-green-500">{status.healthCheckSuccesses ?? 0}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">{t.performance.healthCheck.failures}</div>
              <div className="text-xl font-bold text-red-500">{status.healthCheckFailures ?? 0}</div>
            </div>
          </div>

          <Separator />

          <div>
            <div className="text-sm font-medium text-muted-foreground mb-2">{t.performance.healthCheck.errorRate}</div>
            <div className="flex items-center gap-4">
              <div className="text-2xl font-bold">{status.errorRate ?? '0%'}</div>
              <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="bg-red-500 h-full transition-all"
                  style={{ width: status.errorRate ?? '0%' }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Information */}
      {status.lastError && (
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="flex items-center text-red-500 gap-2">
              <AlertCircle className="w-5 h-5" />
              {t.performance.lastError.title}
            </CardTitle>
            <CardDescription>
              {status.lastErrorTime ? new Date(status.lastErrorTime).toLocaleString() : 'N/A'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-sm bg-muted p-4 rounded overflow-x-auto">
              {status.lastError}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Consecutive Failures Warning */}
      {status.consecutiveFailures > 0 && (
        <Card className="border-yellow-500">
          <CardHeader>
            <CardTitle className="flex items-center text-yellow-500 gap-2">
              <AlertCircle className="w-5 h-5" />
              {t.performance.healthIssues.title}
            </CardTitle>
            <CardDescription>
              {t.performance.healthIssues.consecutiveFailures.replace('{count}', status.consecutiveFailures.toString())}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t.performance.healthIssues.description}
              {status.consecutiveFailures >= 3 && ` ${t.performance.healthIssues.autoRestart}`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
