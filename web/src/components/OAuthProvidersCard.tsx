import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleOff,
  KeyRound,
  Power,
  RefreshCw,
  Settings2,
  Zap,
} from "lucide-react";
import { api, type EnvVarInfo, type ModelInfoResponse, type OAuthProvider } from "@/lib/api";
import { PROVIDER_CONFIGS, type ProviderConfig } from "@/lib/providers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";

interface Props {
  onError?: (msg: string) => void;
  onSuccess?: (msg: string) => void;
}

interface ProviderStatus {
  id: string;
  name: string;
  emoji: string;
  authType: "api_key" | "oauth";
  configuredKeys: string[];
  isCurrent: boolean;
  model: string;
  sourceLabel?: string | null;
  tokenPreview?: string | null;
}

const PROVIDER_ALIASES: Record<string, string> = {
  "kimi-coding": "kimi",
  "ollama-cloud": "ollama",
  "qwen-oauth": "qwen",
  "google-gemini-cli": "gemini",
};

const OAUTH_PROVIDER_ALIASES: Record<string, string> = {
  anthropic: "anthropic",
  "qwen-oauth": "qwen",
  "google-gemini-cli": "gemini",
};

function normalizeProviderId(provider: string | undefined): string {
  const id = (provider || "").trim();
  return PROVIDER_ALIASES[id] || id;
}

function providerConfigById(providerId: string) {
  return PROVIDER_CONFIGS.find((provider) => provider.id === providerId);
}

function requiredFields(provider: ProviderConfig) {
  return provider.fields.filter((field) => field.required);
}

function isApiKeyProviderConfigured(provider: ProviderConfig, envVars: Record<string, EnvVarInfo>) {
  const required = requiredFields(provider);
  return required.length > 0 && required.every((field) => envVars[field.key]?.is_set);
}

function buildProviderStatuses(
  envVars: Record<string, EnvVarInfo>,
  modelInfo: ModelInfoResponse | null,
  oauthProviders: OAuthProvider[],
): ProviderStatus[] {
  const activeProviderId = normalizeProviderId(modelInfo?.provider);
  const activeModel = modelInfo?.model || "";
  const rows = new Map<string, ProviderStatus>();

  for (const provider of PROVIDER_CONFIGS) {
    if (provider.isOAuth || !isApiKeyProviderConfigured(provider, envVars)) continue;
    rows.set(provider.id, {
      id: provider.id,
      name: provider.name,
      emoji: provider.emoji,
      authType: "api_key",
      configuredKeys: requiredFields(provider).map((field) => field.key),
      isCurrent: activeProviderId === provider.id,
      model: activeProviderId === provider.id ? activeModel : "",
    });
  }

  for (const oauth of oauthProviders) {
    if (!oauth.status.logged_in) continue;
    const mappedId = OAUTH_PROVIDER_ALIASES[oauth.id] || oauth.id;
    const providerConfig = providerConfigById(mappedId);
    rows.set(mappedId, {
      id: mappedId,
      name: providerConfig?.name || oauth.name,
      emoji: providerConfig?.emoji || "",
      authType: "oauth",
      configuredKeys: [],
      isCurrent: activeProviderId === mappedId || modelInfo?.provider === oauth.id,
      model: activeProviderId === mappedId || modelInfo?.provider === oauth.id ? activeModel : "",
      sourceLabel: oauth.status.source_label,
      tokenPreview: oauth.status.token_preview,
    });
  }

  return Array.from(rows.values()).sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function nextModelConfig(
  config: Record<string, unknown>,
  providerId: string,
  currentModel: string,
) {
  const previous = typeof config.model === "object" && config.model !== null
    ? config.model as Record<string, unknown>
    : {};
  return {
    ...config,
    model: {
      ...previous,
      provider: providerId,
      default: currentModel || String(previous.default || ""),
    },
  };
}

function stoppedModelConfig(config: Record<string, unknown>) {
  const previous = typeof config.model === "object" && config.model !== null
    ? config.model as Record<string, unknown>
    : {};
  return {
    ...config,
    model: {
      ...previous,
      provider: "auto",
    },
  };
}

export function OAuthProvidersCard({ onError, onSuccess }: Props) {
  const [envVars, setEnvVars] = useState<Record<string, EnvVarInfo> | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfoResponse | null>(null);
  const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [openingSetup, setOpeningSetup] = useState(false);
  const { t } = useI18n();

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.allSettled([api.getEnvVars(), api.getModelInfo(), api.getOAuthProviders()])
      .then(([envResult, modelResult, oauthResult]) => {
        if (envResult.status === "fulfilled") {
          setEnvVars(envResult.value);
        } else {
          onErrorRef.current?.(`${t.oauth.loadFailed}: ${envResult.reason}`);
        }
        setModelInfo(modelResult.status === "fulfilled" ? modelResult.value : null);
        setOauthProviders(oauthResult.status === "fulfilled" ? oauthResult.value.providers : []);
      })
      .finally(() => setLoading(false));
  }, [t.oauth.loadFailed]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const configuredProviders = useMemo(
    () => buildProviderStatuses(envVars || {}, modelInfo, oauthProviders),
    [envVars, modelInfo, oauthProviders],
  );
  const currentProvider = configuredProviders.find((provider) => provider.isCurrent);

  const saveModelSelection = async (providerId: string) => {
    setActionId(providerId);
    try {
      const config = await api.getConfig();
      await api.saveConfig(nextModelConfig(config, providerId, modelInfo?.model || ""));
      onSuccess?.(t.oauth.switchedProvider.replace("{provider}", providerConfigById(providerId)?.name || providerId));
      refresh();
    } catch (error) {
      onError?.(`${t.oauth.switchFailed}: ${error}`);
    } finally {
      setActionId(null);
    }
  };

  const stopCurrentProvider = async () => {
    if (!currentProvider) return;
    setActionId(currentProvider.id);
    try {
      const config = await api.getConfig();
      await api.saveConfig(stoppedModelConfig(config));
      onSuccess?.(t.oauth.stoppedUsing.replace("{provider}", currentProvider.name));
      refresh();
    } catch (error) {
      onError?.(`${t.oauth.stopFailed}: ${error}`);
    } finally {
      setActionId(null);
    }
  };

  const handleOpenSetup = async () => {
    if (!window.electronAPI?.resetOnboarding) {
      onError?.(t.oauth.setupUnavailable);
      return;
    }
    setOpeningSetup(true);
    try {
      await window.electronAPI.resetOnboarding();
      onSuccess?.(t.oauth.setupOpened);
    } catch (error) {
      onError?.(`${t.oauth.setupUnavailable}: ${error}`);
    } finally {
      setOpeningSetup(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">{t.oauth.providerLogins}</CardTitle>
            </div>
            <CardDescription className="mt-1">
              {t.oauth.configuredDescription
                .replace("{configured}", String(configuredProviders.length))
                .replace("{current}", currentProvider?.name || t.oauth.none)}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {t.common.refresh}
          </Button>
        </div>

        {currentProvider && (
          <div className="mt-4 border border-border bg-secondary/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default">{t.oauth.inUse}</Badge>
                  <span className="text-sm font-medium">
                    {currentProvider.emoji && <span className="mr-1">{currentProvider.emoji}</span>}
                    {currentProvider.name}
                  </span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {currentProvider.model ? (
                    <span>
                      {t.oauth.currentModel}:{" "}
                      <code className="text-foreground">{currentProvider.model}</code>
                    </span>
                  ) : (
                    <span>{t.oauth.modelUnset}</span>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={stopCurrentProvider}
                disabled={actionId === currentProvider.id}
              >
                {actionId === currentProvider.id ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Power className="h-3.5 w-3.5" />
                )}
                {t.oauth.stopUsing}
              </Button>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {loading && envVars === null && (
          <div className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}

        {!loading && configuredProviders.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
            <CircleOff className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t.oauth.noConfiguredProviders}</p>
            {window.electronAPI?.resetOnboarding && (
              <Button size="sm" onClick={handleOpenSetup} disabled={openingSetup}>
                {openingSetup ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Settings2 className="h-3.5 w-3.5" />
                )}
                {t.oauth.openSetup}
              </Button>
            )}
          </div>
        )}

        {configuredProviders.length > 0 && (
          <div className="grid gap-0">
            {configuredProviders.map((provider) => (
              <div
                key={provider.id}
                className="grid gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="text-sm font-medium">
                      {provider.emoji && <span className="mr-1">{provider.emoji}</span>}
                      {provider.name}
                    </span>
                    <Badge variant={provider.isCurrent ? "default" : "outline"} className="text-[11px]">
                      {provider.isCurrent ? t.oauth.inUse : t.oauth.available}
                    </Badge>
                    <Badge variant="outline" className="text-[11px]">
                      {provider.authType === "oauth" ? t.oauth.oauthAuth : t.oauth.apiKeyAuth}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {provider.configuredKeys.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <KeyRound className="h-3 w-3" />
                        {provider.configuredKeys.join(", ")}
                      </span>
                    )}
                    {provider.tokenPreview && <code className="text-foreground">{provider.tokenPreview}</code>}
                    {provider.sourceLabel && <span>{provider.sourceLabel}</span>}
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  {!provider.isCurrent && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => saveModelSelection(provider.id)}
                      disabled={actionId === provider.id}
                    >
                      {actionId === provider.id && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                      {t.oauth.useProvider}
                    </Button>
                  )}
                  {provider.isCurrent && (
                    <Button variant="secondary" size="sm" disabled>
                      {t.oauth.inUse}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
