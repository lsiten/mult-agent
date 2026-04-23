// In Electron, use Gateway (Pure Gateway architecture on 8642);
// in web, use relative path (proxied by server)
const BASE = typeof window !== 'undefined' && (window as any).electronAPI
  ? 'http://127.0.0.1:8642'
  : '';

// Ephemeral session token for protected endpoints.
// Injected into index.html by the server — never fetched via API.
declare global {
  interface Window {
    __HERMES_SESSION_TOKEN__?: string;
  }
}
let _sessionToken: string | null = null;
let _gatewayAuthToken: string | null = null;

function isViteDevPage(): boolean {
  if (typeof window === "undefined") return false;
  const { hostname, port, protocol } = window.location;
  return protocol.startsWith("http") && (hostname === "localhost" || hostname === "127.0.0.1") && port.startsWith("517");
}

async function getGatewayAuthToken(): Promise<string | null> {
  // 缓存 token 避免重复 IPC 调用
  if (_gatewayAuthToken !== null) {
    return _gatewayAuthToken;
  }

  // 仅在 Electron 环境中获取 Gateway auth token
  if (typeof window !== 'undefined' && (window as any).electronAPI?.getGatewayAuthToken) {
    try {
      const result = await (window as any).electronAPI.getGatewayAuthToken();

      const token = result?.data?.token ?? result?.token;
      if (token) {
        _gatewayAuthToken = token;
        return _gatewayAuthToken;
      } else {
        console.error('[API] IPC returned invalid token:', result);
        return null;
      }
    } catch (error) {
      console.error('[API] Failed to get Gateway auth token:', error);
      // IPC 失败不应该缓存空值，应该重试
      return null;
    }
  }

  // 非 Electron 环境，返回空（开发模式）
  _gatewayAuthToken = '';
  return _gatewayAuthToken;
}

export async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  let requestBase = isViteDevPage() ? "" : BASE;

  // 1. Inject Gateway auth token for all Gateway requests (Electron only)
  if (!headers.has("Authorization") && requestBase.includes('8642')) {
    const gatewayToken = await getGatewayAuthToken();
    if (gatewayToken) {
      headers.set("Authorization", `Bearer ${gatewayToken}`);
    } else {
      throw new Error("Gateway auth token unavailable");
    }
  }

  // 2. Inject session token for protected /api/ requests
  const token = window.__HERMES_SESSION_TOKEN__;
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${requestBase}${url}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

async function getSessionToken(): Promise<string> {
  if (_sessionToken) return _sessionToken;
  const injected = window.__HERMES_SESSION_TOKEN__;
  if (injected) {
    _sessionToken = injected;
    return _sessionToken;
  }
  throw new Error("Session token not available — page must be served by the Hermes dashboard server");
}

export const api = {
  getStatus: () => fetchJSON<StatusResponse>("/api/status"),
  getSessions: (limit = 20, offset = 0) =>
    fetchJSON<PaginatedSessions>(`/api/sessions?limit=${limit}&offset=${offset}`),
  getSessionMessages: (id: string) =>
    fetchJSON<SessionMessagesResponse>(`/api/sessions/${encodeURIComponent(id)}/messages`),
  deleteSession: (id: string) =>
    fetchJSON<{ ok: boolean }>(`/api/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  getLogs: (params: { file?: string; lines?: number; level?: string; component?: string }) => {
    const qs = new URLSearchParams();
    if (params.file) {
      // Ensure .log extension
      const filename = params.file.endsWith('.log') ? params.file : `${params.file}.log`;
      qs.set("file", filename);
    }
    if (params.lines) qs.set("lines", String(params.lines));
    if (params.level && params.level !== "ALL") qs.set("level", params.level);
    if (params.component && params.component !== "all") qs.set("component", params.component);
    return fetchJSON<LogsResponse>(`/api/logs?${qs.toString()}`);
  },
  getAnalytics: (days: number) =>
    fetchJSON<AnalyticsResponse>(`/api/analytics/usage?days=${days}`),
  getConfig: () => fetchJSON<Record<string, unknown>>("/api/config"),
  getDefaults: () => fetchJSON<Record<string, unknown>>("/api/config/defaults"),
  getSchema: () => fetchJSON<{ fields: Record<string, unknown>; category_order: string[] }>("/api/config/schema"),
  getModelInfo: () => fetchJSON<ModelInfoResponse>("/api/model/info"),
  saveConfig: (config: Record<string, unknown>) =>
    fetchJSON<{ ok: boolean }>("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    }),
  getConfigRaw: () => fetchJSON<{ yaml: string }>("/api/config/raw"),
  saveConfigRaw: (yaml_text: string) =>
    fetchJSON<{ ok: boolean }>("/api/config/raw", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yaml_text }),
    }),
  getEnvVars: () => fetchJSON<Record<string, EnvVarInfo>>("/api/env"),
  setEnvVar: (key: string, value: string) =>
    fetchJSON<{ ok: boolean }>("/api/env", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    }),
  deleteEnvVar: (key: string) =>
    fetchJSON<{ ok: boolean }>("/api/env", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    }),
  revealEnvVar: async (key: string) => {
    const token = await getSessionToken();
    return fetchJSON<{ key: string; value: string }>("/api/env/reveal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ key }),
    });
  },

  // Cron jobs
  getCronJobs: () => fetchJSON<CronJob[]>("/api/cron/jobs"),
  createCronJob: (job: { prompt: string; schedule: string; name?: string; deliver?: string }) =>
    fetchJSON<CronJob>("/api/cron/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job),
    }),
  pauseCronJob: (id: string) =>
    fetchJSON<{ ok: boolean }>(`/api/cron/jobs/${id}/pause`, { method: "POST" }),
  resumeCronJob: (id: string) =>
    fetchJSON<{ ok: boolean }>(`/api/cron/jobs/${id}/resume`, { method: "POST" }),
  triggerCronJob: (id: string) =>
    fetchJSON<{ ok: boolean }>(`/api/cron/jobs/${id}/trigger`, { method: "POST" }),
  deleteCronJob: (id: string) =>
    fetchJSON<{ ok: boolean }>(`/api/cron/jobs/${id}`, { method: "DELETE" }),

  // Skills & Toolsets
  getSkills: () => fetchJSON<SkillInfo[]>(`/api/skills?_t=${Date.now()}`),
  toggleSkill: (name: string, enabled: boolean) =>
    fetchJSON<{ ok: boolean }>("/api/skills/toggle", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, enabled }),
    }),

  deleteSkill: (name: string) =>
    fetchJSON<{ ok: boolean }>(`/api/skills/${encodeURIComponent(name)}`, {
      method: "DELETE",
    }),

  getToolsets: () => fetchJSON<{toolsets: ToolsetInfo[]}>("/api/tools/toolsets").then(resp => resp.toolsets),

  // Session search (FTS5)
  searchSessions: (q: string) =>
    fetchJSON<SessionSearchResponse>(`/api/sessions/search?q=${encodeURIComponent(q)}`),

  // Unified chat interface APIs
  createSession: (data: { source: string; user_id: string; title?: string }) =>
    fetchJSON<CreateSessionResponse>("/api/chat/sessions/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  updateSession: (id: string, data: { title: string }) =>
    fetchJSON<{ ok: boolean; session: SessionInfo }>(`/api/sessions/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  listSessions: (params: { limit?: number; offset?: number; source?: string }) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.offset) qs.set("offset", String(params.offset));
    if (params.source) qs.set("source", params.source);
    return fetchJSON<SessionListResponse>(`/api/chat/sessions?${qs.toString()}`);
  },
  sendMessage: (sessionId: string, data: { content: string; attachments?: AttachmentInfo[] }) =>
    fetchJSON<SendMessageResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  getStreamUrl: async (sessionId: string, message: string, attachments?: Array<{id: string, name: string, type: string, size: number, url: string}>, selectedSkills?: string[]) => {
    const params = new URLSearchParams({ message });
    if (attachments && attachments.length > 0) {
      params.append('attachments', JSON.stringify(attachments));
    }
    if (selectedSkills && selectedSkills.length > 0) {
      params.append('selected_skills', JSON.stringify(selectedSkills));
    }

    // Add Gateway token as URL parameter for EventSource (cannot use headers)
    const gatewayToken = await getGatewayAuthToken();
    if (gatewayToken) {
      params.append('token', gatewayToken);
    }

    return `${BASE}/api/sessions/${encodeURIComponent(sessionId)}/stream?${params.toString()}`;
  },
  stopStream: (sessionId: string) =>
    fetchJSON<{ ok: boolean; message: string }>(`/api/sessions/${encodeURIComponent(sessionId)}/stop`, {
      method: "POST",
    }),
  uploadAttachment: async (file: File, sessionId: string, onProgress?: (progress: number) => void) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("session_id", sessionId);

    // Get appropriate auth token for the environment
    const gatewayToken = await getGatewayAuthToken();

    return new Promise<UploadAttachmentResponse>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress((e.loaded / e.total) * 100);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error("Network error"));
      xhr.open("POST", `${BASE}/api/attachments/upload`);

      // In Electron mode, use Gateway auth token; otherwise use session token
      if (gatewayToken) {
        xhr.setRequestHeader("Authorization", `Bearer ${gatewayToken}`);
      } else {
        const token = window.__HERMES_SESSION_TOKEN__;
        if (token) {
          xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        }
      }

      xhr.send(formData);
    });
  },

  // OAuth provider management
  getOAuthProviders: () =>
    fetchJSON<OAuthProvidersResponse>("/api/providers/oauth"),
  disconnectOAuthProvider: async (providerId: string) => {
    const token = await getSessionToken();
    return fetchJSON<{ ok: boolean; provider: string }>(
      `/api/providers/oauth/${encodeURIComponent(providerId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
  },
  startOAuthLogin: async (providerId: string) => {
    const token = await getSessionToken();
    return fetchJSON<OAuthStartResponse>(
      `/api/providers/oauth/${encodeURIComponent(providerId)}/start`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: "{}",
      },
    );
  },
  submitOAuthCode: async (providerId: string, sessionId: string, code: string) => {
    const token = await getSessionToken();
    return fetchJSON<OAuthSubmitResponse>(
      `/api/providers/oauth/${encodeURIComponent(providerId)}/submit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ session_id: sessionId, code }),
      },
    );
  },
  pollOAuthSession: (providerId: string, sessionId: string) =>
    fetchJSON<OAuthPollResponse>(
      `/api/providers/oauth/${encodeURIComponent(providerId)}/poll/${encodeURIComponent(sessionId)}`,
    ),
  cancelOAuthSession: async (sessionId: string) => {
    const token = await getSessionToken();
    return fetchJSON<{ ok: boolean }>(
      `/api/providers/oauth/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
  },

  // Dashboard themes
  getThemes: () =>
    fetchJSON<ThemeListResponse>("/api/dashboard/themes"),
  setTheme: (name: string) =>
    fetchJSON<{ ok: boolean; theme: string }>("/api/dashboard/theme", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),

  // Dashboard plugins
  getPlugins: () =>
    fetchJSON<PluginManifestResponse[]>("/api/dashboard/plugins"),
  rescanPlugins: () =>
    fetchJSON<{ ok: boolean; count: number }>("/api/dashboard/plugins/rescan"),

  // Organization orchestration
  getOrgTree: () => fetchJSON<OrganizationTreeResponse>("/api/org/tree"),
  createCompany: (data: CompanyPayload) =>
    fetchJSON<OrgCompany>("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  updateCompany: (id: number, data: Partial<CompanyPayload & { status: string }>) =>
    fetchJSON<OrgCompany>(`/api/companies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  createDepartment: (data: DepartmentPayload) =>
    fetchJSON<OrgDepartment>("/api/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  updateDepartment: (id: number, data: Partial<DepartmentPayload & { status: string }>) =>
    fetchJSON<OrgDepartment>(`/api/departments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  createPosition: (data: PositionPayload) =>
    fetchJSON<OrgPosition>("/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  updatePosition: (id: number, data: Partial<PositionPayload & { status: string }>) =>
    fetchJSON<OrgPosition>(`/api/positions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  createAgent: (data: AgentPayload) =>
    fetchJSON<OrgAgent>("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  getAgent: (id: number) => fetchJSON<OrgAgent>(`/api/agents/${id}`),
  updateAgent: (id: number, data: Partial<AgentPayload & { enabled: boolean; status: string; employment_status: string }>) =>
    fetchJSON<OrgAgent>(`/api/agents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  provisionAgentProfile: (id: number) =>
    fetchJSON<OrgProfileAgent>(`/api/agents/${id}/provision-profile`, { method: "POST" }),
  getWorkspace: (ownerType: OrgOwnerType, ownerId: number) =>
    fetchJSON<OrgWorkspace>(`/api/workspaces/${ownerType}/${ownerId}`),
};

export type OrgOwnerType = "company" | "department" | "position" | "agent";

export interface OrgWorkspace {
  id: number;
  owner_type: OrgOwnerType;
  owner_id: number;
  name: string;
  root_path: string;
  visibility: string;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface OrgProfileAgent {
  id: number;
  agent_id: number;
  profile_name: string;
  profile_home: string;
  soul_path: string | null;
  config_path: string | null;
  profile_status: string;
  template_key: string | null;
  last_provisioned_at: number | null;
  last_sync_at: number | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

export interface OrgAgent {
  id: number;
  company_id: number;
  department_id: number;
  position_id: number;
  employee_no: string | null;
  name: string;
  display_name: string | null;
  avatar_url: string | null;
  manager_agent_id: number | null;
  employment_status: string;
  role_summary: string;
  service_goal: string | null;
  accent_color: string | null;
  workspace_path: string | null;
  enabled: number | boolean;
  status: string;
  created_at: number;
  updated_at: number;
  profile_agent?: OrgProfileAgent | null;
  workspace?: OrgWorkspace | null;
}

export interface OrgPosition {
  id: number;
  department_id: number;
  code: string;
  name: string;
  goal: string | null;
  responsibilities: string;
  icon: string | null;
  accent_color: string | null;
  headcount: number | null;
  template_key: string | null;
  workspace_path: string | null;
  sort_order: number;
  status: string;
  created_at: number;
  updated_at: number;
  agents?: OrgAgent[];
  agent_count?: number;
}

export interface OrgDepartment {
  id: number;
  company_id: number;
  parent_id: number | null;
  code: string;
  name: string;
  goal: string;
  description: string | null;
  icon: string | null;
  accent_color: string | null;
  leader_agent_id: number | null;
  workspace_path: string | null;
  sort_order: number;
  status: string;
  created_at: number;
  updated_at: number;
  positions?: OrgPosition[];
  position_count?: number;
  agent_count?: number;
}

export interface OrgCompany {
  id: number;
  code: string;
  name: string;
  goal: string;
  description: string | null;
  icon: string | null;
  accent_color: string | null;
  status: string;
  workspace_path: string | null;
  created_at: number;
  updated_at: number;
  departments?: OrgDepartment[];
  department_count?: number;
  position_count?: number;
  agent_count?: number;
}

export interface OrganizationTreeResponse {
  companies: OrgCompany[];
}

export interface CompanyPayload {
  name: string;
  goal: string;
  description?: string;
  icon?: string;
  accent_color?: string;
}

export interface DepartmentPayload {
  company_id: number;
  name: string;
  goal: string;
  description?: string;
  icon?: string;
  accent_color?: string;
}

export interface PositionPayload {
  department_id: number;
  name: string;
  goal?: string;
  responsibilities: string;
  icon?: string;
  accent_color?: string;
  headcount?: number | null;
  template_key?: string;
}

export interface AgentPayload {
  position_id: number;
  name: string;
  role_summary: string;
  service_goal?: string;
  employee_no?: string;
  display_name?: string;
  avatar_url?: string;
  accent_color?: string;
}

export interface PlatformStatus {
  error_code?: string;
  error_message?: string;
  state: string;
  updated_at: string;
}

export interface StatusResponse {
  active_sessions: number;
  config_path: string;
  config_version: number;
  env_path: string;
  gateway_exit_reason: string | null;
  gateway_health_url: string | null;
  gateway_pid: number | null;
  gateway_platforms: Record<string, PlatformStatus>;
  gateway_running: boolean;
  gateway_state: string | null;
  gateway_updated_at: string | null;
  hermes_home: string;
  latest_config_version: number;
  release_date: string;
  version: string;
}

export interface SessionInfo {
  id: string;
  source: string | null;
  model: string | null;
  title: string | null;
  started_at: number;
  ended_at: number | null;
  last_active: number;
  is_active: boolean;
  message_count: number;
  tool_call_count: number;
  input_tokens: number;
  output_tokens: number;
  preview: string | null;
}

export interface PaginatedSessions {
  sessions: SessionInfo[];
  total: number;
  limit: number;
  offset: number;
}

export interface EnvVarInfo {
  is_set: boolean;
  redacted_value: string | null;
  description: string;
  url: string | null;
  category: string;
  is_password: boolean;
  tools: string[];
  advanced: boolean;
}

export interface SessionMessage {
  role: "user" | "assistant" | "system" | "tool" | "tool_use" | "skill_use" | "authorization_request";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    function: { name: string; arguments: string };
  }>;
  tool_name?: string;
  tool_call_id?: string;
  timestamp?: number;
  attachments?: Array<{
    id: string;
    name: string;
    type: "file" | "image";
    size: number;
    url: string;
  }>;
  metadata?: {
    authorization?: {
      type: "oauth" | "permission" | "confirmation";
      url?: string;
      title?: string;
      message?: string;
      action?: string;
    };
    tool_invocations?: Array<{
      id: string;
      tool: string;
      args: Record<string, unknown>;
      result?: string;
      status: "pending" | "success" | "error";
      duration?: number;
    }>;
    skills?: Array<{
      name: string;
      category?: string;
      toolCount?: number;
      status: "loaded" | "failed" | "unavailable";
      error?: string;
    }>;
  };
}

export interface SessionMessagesResponse {
  session_id: string;
  messages: SessionMessage[];
}

export interface LogsResponse {
  file: string;
  lines: string[];
}

export interface AnalyticsDailyEntry {
  day: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  reasoning_tokens: number;
  estimated_cost: number;
  actual_cost: number;
  sessions: number;
}

export interface AnalyticsModelEntry {
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  sessions: number;
}

export interface AnalyticsResponse {
  daily: AnalyticsDailyEntry[];
  by_model: AnalyticsModelEntry[];
  totals: {
    total_input: number;
    total_output: number;
    total_cache_read: number;
    total_reasoning: number;
    total_estimated_cost: number;
    total_actual_cost: number;
    total_sessions: number;
  };
}

export interface CronJob {
  id: string;
  name?: string;
  prompt: string;
  schedule: { kind: string; expr: string; display: string };
  schedule_display: string;
  enabled: boolean;
  state: string;
  deliver?: string;
  last_run_at?: string | null;
  next_run_at?: string | null;
  last_error?: string | null;
}

export interface SkillInfo {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  path?: string;
}

export interface ToolsetInfo {
  name: string;
  label: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  tools: string[];
}

export interface SessionSearchResult {
  session_id: string;
  snippet: string;
  role: string | null;
  source: string | null;
  model: string | null;
  session_started: number | null;
}

export interface SessionSearchResponse {
  results: SessionSearchResult[];
}

// ── Model info types ──────────────────────────────────────────────────

export interface ModelInfoResponse {
  model: string;
  provider: string;
  auto_context_length: number;
  config_context_length: number;
  effective_context_length: number;
  capabilities: {
    supports_tools?: boolean;
    supports_vision?: boolean;
    supports_reasoning?: boolean;
    context_window?: number;
    max_output_tokens?: number;
    model_family?: string;
  };
}

// ── OAuth provider types ────────────────────────────────────────────────

export interface OAuthProviderStatus {
  logged_in: boolean;
  source?: string | null;
  source_label?: string | null;
  token_preview?: string | null;
  expires_at?: string | null;
  has_refresh_token?: boolean;
  last_refresh?: string | null;
  error?: string;
}

export interface OAuthProvider {
  id: string;
  name: string;
  /** "pkce" (browser redirect + paste code), "device_code" (show code + URL),
   *  or "external" (delegated to a separate CLI like Claude Code or Qwen). */
  flow: "pkce" | "device_code" | "external";
  cli_command: string;
  docs_url: string;
  status: OAuthProviderStatus;
}

export interface OAuthProvidersResponse {
  providers: OAuthProvider[];
}

/** Discriminated union — the shape of /start depends on the flow. */
export type OAuthStartResponse =
  | {
      session_id: string;
      flow: "pkce";
      auth_url: string;
      expires_in: number;
    }
  | {
      session_id: string;
      flow: "device_code";
      user_code: string;
      verification_url: string;
      expires_in: number;
      poll_interval: number;
    };

export interface OAuthSubmitResponse {
  ok: boolean;
  status: "approved" | "error";
  message?: string;
}

export interface OAuthPollResponse {
  session_id: string;
  status: "pending" | "approved" | "denied" | "expired" | "error";
  error_message?: string | null;
  expires_at?: number | null;
}

// ── Dashboard theme types ──────────────────────────────────────────────

export interface ThemeListResponse {
  themes: Array<{ name: string; label: string; description: string }>;
  active: string;
}

// ── Dashboard plugin types ─────────────────────────────────────────────

export interface PluginManifestResponse {
  name: string;
  label: string;
  description: string;
  icon: string;
  version: string;
  tab: { path: string; position: string };
  entry: string;
  css?: string | null;
  has_api: boolean;
  source: string;
}

// ── Unified Chat Interface types ─────────────────────────────────────────

export interface CreateSessionResponse {
  session_id: string;
  created_at: number;
  title: string;
}

export interface SessionListResponse {
  sessions: SessionInfo[];
  total: number;
  has_more: boolean;
}

export interface AttachmentInfo {
  id: string;
  type: "file" | "image";
  name: string;
  path: string;
  size?: number;
}

export interface SendMessageResponse {
  message_id: string;
  created_at: number;
}

export interface UploadAttachmentResponse {
  attachment_id: string;
  path: string;
  url: string;
  name: string;
  size: number;
  mime_type: string;
}

export interface StreamEvent {
  type: "content" | "tool_call" | "done" | "error";
  chunk?: string;
  tool?: string;
  args?: Record<string, unknown>;
  message_id?: string;
  error?: string;
}
