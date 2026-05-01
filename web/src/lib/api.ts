// In Electron, always use Gateway (Pure Gateway architecture on 8642).
// In standalone web development, use relative paths through the dev server proxy.
const GATEWAY_BASE = 'http://127.0.0.1:8642';

// Ephemeral session token for protected endpoints.
// Injected into index.html by the server — never fetched via API.
declare global {
  interface Window {
    __HERMES_SESSION_TOKEN__?: string;
    electronAPI?: {
      getOnboardingStatus?: () => Promise<{ needsOnboarding: boolean }>;
      onOnboardingStatus?: (callback: (status: { needsOnboarding: boolean }) => void) => void;
      markOnboardingComplete?: () => Promise<{ ok: boolean }>;
      resetOnboarding?: () => Promise<{ ok: boolean }>;
      getPythonStatus?: (options?: { includeMetrics?: boolean }) => Promise<any>;
      restartPython?: (reason?: string) => Promise<{ ok: boolean }>;
      openExternal?: (url: string) => Promise<void>;
      getGatewayAuthToken?: () => Promise<{ data?: { token?: string }; token?: string } | null>;
      subAgent?: {
        getOrStart?: (agentId: number) => Promise<{ ok?: boolean; data?: { port?: number; success?: boolean; agentId?: number }; error?: string }>;
        stop?: (agentId: number) => Promise<{ ok?: boolean; data?: { success?: boolean }; error?: string }>;
        getPort?: (agentId: number) => Promise<{ ok?: boolean; data?: { port?: number | null; found?: boolean }; error?: string }>;
        getAllMetrics?: () => Promise<{ ok?: boolean; data?: { metrics?: any[] }; error?: string }>;
        syncFromMaster?: (agentId: number) => Promise<{ ok?: boolean; data?: { success?: boolean; message?: string; port?: number }; error?: string }>;
      };
      electron?: {
        getServices?: () => Promise<{ ok: boolean; data?: { services: Array<{ id: string; name: string; status: string; dependencies: string[] }> }; error?: string }>;
        getIPCHandlers?: () => Promise<{ ok: boolean; data?: { handlers: Array<{ channel: string; description: string | null }> }; error?: string }>;
      };
    };
  }
}
let _sessionToken: string | null = null;
let _gatewayAuthToken: string | null = null;
let _subAgentPorts: Map<number, number> = new Map(); // Cache sub-agent ports
let _cachedRequestBase: string | null = null; // Cache computed request base
let _cachedRequestBaseAgentId: number | null = null; // Track which agentId the cache is for
/**
 * Tracks the currently active sub-agent id (mirrors the ``agentId`` URL
 * query parameter).  Populated by ``useAgentSwitcher`` and consumed by
 * ``fetchJSON`` so that every profile-scoped request carries a
 * ``X-Hermes-Agent-Id`` header — the Gateway can then resolve the request
 * against the sub-agent's Profile workspace instead of ``HERMES_HOME``.
 */
let _activeAgentId: number | null = null;

export function setActiveAgentId(id: number | null): void {
  // Clear request base cache when agentId changes
  if (_activeAgentId !== id) {
    console.log(`[API] Clearing request base cache (${_activeAgentId} → ${id})`);
    _cachedRequestBase = null;
    _cachedRequestBaseAgentId = null;
  }
  _activeAgentId = id;
  console.log(`[API] activeAgentId set to ${id}`);
}

export function getActiveAgentId(): number | null {
  return _activeAgentId;
}

function isElectronRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI);
}

/**
 * Get Sub Agent Gateway port via IPC
 */
async function getSubAgentPort(agentId: number): Promise<number | null> {
  // Check cache
  if (_subAgentPorts.has(agentId)) {
    console.log(`[API] Using cached port for Sub Agent ${agentId}: ${_subAgentPorts.get(agentId)}`);
    return _subAgentPorts.get(agentId)!;
  }

  // Get or start sub-agent via IPC
  if (typeof window !== 'undefined' && window.electronAPI?.subAgent?.getOrStart) {
    try {
      const startTime = performance.now();
      console.log(`[API] IPC call: subAgent.getOrStart(${agentId}) starting...`);

      const result = await window.electronAPI.subAgent.getOrStart(agentId);

      const elapsed = performance.now() - startTime;
      console.log(`[API] IPC call completed in ${elapsed.toFixed(2)}ms`);

      const port = result?.data?.port;
      if (port && typeof port === 'number') {
        _subAgentPorts.set(agentId, port);
        console.log(`[API] Sub Agent ${agentId} port: ${port}`);
        return port;
      } else {
        console.error('[API] IPC returned invalid sub-agent port:', result);
        return null;
      }
    } catch (error) {
      console.error(`[API] Failed to get sub-agent ${agentId} port:`, error);
      // 抛出错误而不是返回 null，让上层处理
      throw new Error(`Sub Agent ${agentId} 启动失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return null;
}

async function getRequestBase(): Promise<string> {
  // Return cached result if agentId hasn't changed
  if (_cachedRequestBase !== null && _cachedRequestBaseAgentId === _activeAgentId) {
    return _cachedRequestBase;
  }
  let result: string;

  // If sub-agent is active, use sub-agent port
  if (_activeAgentId !== null && isElectronRuntime()) {
    try {
      const port = await getSubAgentPort(_activeAgentId);
      if (port) {
        result = `http://127.0.0.1:${port}`;
      } else {
        // 不再回退到主 Gateway，抛出错误
        throw new Error(`Sub Agent ${_activeAgentId} 端口获取失败`);
      }
    } catch (error) {
      // 抛出错误，不再静默回退
      console.error(`[API] Sub Agent ${_activeAgentId} 不可用:`, error);
      throw error;
    }
  } else {
    result = isElectronRuntime() ? GATEWAY_BASE : '';
  }

  // Cache the result
  _cachedRequestBase = result;
  _cachedRequestBaseAgentId = _activeAgentId;

  return result;
}

async function getGatewayAuthToken(): Promise<string | null> {
  // 缓存 token 避免重复 IPC 调用
  if (_gatewayAuthToken !== null) {
    return _gatewayAuthToken;
  }

  // 仅在 Electron 环境中获取 Gateway auth token
  if (typeof window !== 'undefined' && window.electronAPI?.getGatewayAuthToken) {
    try {
      const result = await window.electronAPI.getGatewayAuthToken();

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

async function getEventSourceToken(): Promise<string | null> {
  const gatewayToken = await getGatewayAuthToken();
  if (gatewayToken) {
    return gatewayToken;
  }
  return window.__HERMES_SESSION_TOKEN__ ?? null;
}

/**
 * 判断URL是否属于组织架构相关的API（不随Agent切换）
 */
function isOrgRelatedAPI(url: string): boolean {
  const orgAPIPrefixes = [
    '/api/org/',
    '/api/agents',
    '/api/companies',
    '/api/departments',
    '/api/positions',
    '/api/workspaces',
    '/api/recruit/',
  ];
  return orgAPIPrefixes.some(prefix => url.startsWith(prefix));
}

export async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const forceMaster = headers.get("X-Hermes-Force-Master") === "true";
  headers.delete("X-Hermes-Force-Master");

  // ⛔ 路由策略：
  // 1. 组织架构API（/api/org/、/api/agents/等）始终走主Gateway
  // 2. 会话数据API（/api/chat/、/api/sessions/等）根据activeAgentId路由
  let requestBase: string;
  if (forceMaster || isOrgRelatedAPI(url)) {
    // 组织架构API：强制使用主Gateway（8642）
    requestBase = isElectronRuntime() ? GATEWAY_BASE : '';
  } else {
    // 会话数据API：根据activeAgentId路由
    requestBase = await getRequestBase().catch((error) => {
      console.error("[API] Failed to get request base:", error);
      // Sub Agent 端口获取失败时，清空缓存并抛出错误（不回退到主 Gateway）
      _cachedRequestBase = null;
      _cachedRequestBaseAgentId = null;
      throw new Error(`Sub Agent 不可用: ${error.message}`);
    });
  }

  // 1. Inject Gateway auth token for all Gateway requests (Electron only)
  // Applies to both main Gateway (8642) and Sub Agent Gateways (9000+)
  if (!headers.has("Authorization") && (requestBase.includes('127.0.0.1') || requestBase.includes('localhost'))) {
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

  // 3. Stamp every request with the active sub-agent id so backend handlers
  // can scope themselves to the sub-agent's Profile workspace.  We only
  // send the header when it's set and when the caller did not already
  // specify one (e.g. when explicitly targeting a different agent).
  if (!forceMaster && !headers.has("X-Hermes-Agent-Id") && _activeAgentId != null) {
    headers.set("X-Hermes-Agent-Id", String(_activeAgentId));
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
  getMasterSessionMessages: (id: string) =>
    fetchJSON<SessionMessagesResponse>(`/api/sessions/${encodeURIComponent(id)}/messages`, {
      headers: { "X-Hermes-Force-Master": "true" },
    }),
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
  testProvider: (payload: { provider: string; credentials: Record<string, string>; model?: string }) =>
    fetchJSON<{ ok: boolean; message?: string; error?: string }>("/api/provider/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
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
  createSession: (data: { source: string; user_id: string; title?: string; agent_id?: number }) =>
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
  getRecruitWorkspace: () =>
    fetchJSON<RecruitWorkspaceResponse>("/api/recruit/workspace"),
  createRecruitWorkspaceSession: () =>
    fetchJSON<{ session: SessionInfo }>("/api/recruit/workspace/session", {
      method: "POST",
    }),
  ensureRecruitWorkspaceSession: () =>
    fetchJSON<{ session: SessionInfo }>("/api/recruit/workspace/session", {
      method: "POST",
    }),
  listRecruitPostings: (params: { limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.offset) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return fetchJSON<RecruitPostingsResponse>(`/api/recruit/postings${query ? `?${query}` : ""}`);
  },
  listRecruitCandidates: (params: { limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.offset) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return fetchJSON<RecruitCandidatesResponse>(`/api/recruit/candidates${query ? `?${query}` : ""}`);
  },
  getRecruitPosting: (postingId: number) =>
    fetchJSON<RecruitPostingDetailResponse>(`/api/recruit/postings/${encodeURIComponent(String(postingId))}`),
  upsertRecruitPostings: (payload: Record<string, unknown>) =>
    fetchJSON<{ ok: boolean; database_path: string; table: string; count: number; ids: number[] }>("/api/recruit/postings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  createRecruitScore: (
    postingId: number,
    payload: {
      score_json: Record<string, unknown>;
      summary_json?: Record<string, unknown>;
      mode?: "正式权重" | "预览权重";
    },
  ) =>
    fetchJSON<{
      ok: boolean;
      database_path: string;
      table: string;
      job_posting_id: number;
      score_id: number;
      mode: "正式权重" | "预览权重";
      status_at_scoring: string;
      revision: number;
    }>(`/api/recruit/postings/${encodeURIComponent(String(postingId))}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  sendMessage: (sessionId: string, data: { content: string; attachments?: AttachmentInfo[] }) =>
    fetchJSON<SendMessageResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  getStreamUrl: async (
    sessionId: string,
    message: string,
    attachments?: Array<{id: string, name: string, type: string, size: number, url: string}>,
    selectedSkills?: string[],
    agentId?: number | null,
    forceMaster = false,
  ) => {
    const params = new URLSearchParams({ message });
    if (attachments && attachments.length > 0) {
      params.append('attachments', JSON.stringify(attachments));
    }
    if (selectedSkills && selectedSkills.length > 0) {
      params.append('selected_skills', JSON.stringify(selectedSkills));
    }
    if (agentId != null) {
      params.append('agent_id', String(agentId));
    }

    // Add Gateway token as URL parameter for EventSource (cannot use headers)
    const eventSourceToken = await getEventSourceToken();
    if (eventSourceToken) {
      params.append('token', eventSourceToken);
    }

    const requestBase = forceMaster
      ? (isElectronRuntime() ? GATEWAY_BASE : '')
      : (isElectronRuntime() ? await getRequestBase() : GATEWAY_BASE);
    return `${requestBase}/api/sessions/${encodeURIComponent(sessionId)}/stream?${params.toString()}`;
  },
  getResumeStreamUrl: async (
    sessionId: string,
    agentId?: number | null,
    forceMaster = false,
  ) => {
    const params = new URLSearchParams({ resume: "1" });
    if (agentId != null) {
      params.append("agent_id", String(agentId));
    }

    const eventSourceToken = await getEventSourceToken();
    if (eventSourceToken) {
      params.append("token", eventSourceToken);
    }

    const requestBase = forceMaster
      ? (isElectronRuntime() ? GATEWAY_BASE : '')
      : (isElectronRuntime() ? await getRequestBase() : GATEWAY_BASE);
    return `${requestBase}/api/sessions/${encodeURIComponent(sessionId)}/stream?${params.toString()}`;
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
    const requestBase = await getRequestBase();

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
      xhr.open("POST", `${requestBase}/api/attachments/upload`);

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
  getOrgCompanyTree: (companyId: number) => 
    fetchJSON<{ company: OrgCompany }>(`/api/org/companies/${companyId}/tree`),
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
  deleteCompany: (id: number) =>
    fetchJSON<{ deleted: number }>(`/api/companies/${id}`, {
      method: "DELETE",
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
  deleteDepartment: (id: number) =>
    fetchJSON<{ deleted: number }>(`/api/departments/${id}`, {
      method: "DELETE",
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
  deletePosition: (id: number) =>
    fetchJSON<{ deleted: number }>(`/api/positions/${id}`, {
      method: "DELETE",
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
  deleteAgent: (id: number) =>
    fetchJSON<{ deleted: number }>(`/api/agents/${id}`, {
      method: "DELETE",
    }),
  provisionAgentProfile: (id: number) =>
    fetchJSON<OrgProfileAgent>(`/api/agents/${id}/provision-profile`, { method: "POST" }),
  getWorkspace: (ownerType: OrgOwnerType, ownerId: number) =>
    fetchJSON<OrgWorkspace>(`/api/workspaces/${ownerType}/${ownerId}`),

  // Quick Actions
  getRecommendedManager: (agentId: number) =>
    fetchJSON<OrgAgent | null>(`/api/agents/${agentId}/recommended-manager`).catch((err) => {
      if (err.message?.includes('404')) return null;
      throw err;
    }),
  setAgentAsLeader: (agentId: number, leadershipRole: 'primary' | 'deputy' | 'none') =>
    fetchJSON<OrgAgent>(`/api/agents/${agentId}/set-leader`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadership_role: leadershipRole }),
    }),
  setPositionAsManagement: (positionId: number, isManagement: boolean) =>
    fetchJSON<OrgPosition>(`/api/positions/${positionId}/set-management`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_management: isManagement }),
    }),
  setDepartmentAsManagement: (departmentId: number, isManagement: boolean) =>
    fetchJSON<OrgDepartment>(`/api/departments/${departmentId}/set-management-department`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_management: isManagement }),
    }),
  setManagingDepartment: (departmentId: number, managingDepartmentId: number | null) =>
    fetchJSON<OrgDepartment>(`/api/departments/${departmentId}/set-managing-department`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ managing_department_id: managingDepartmentId }),
    }),

  // Master-agent asset inheritance (per-provider Public/Private toggle lives here)
  refreshMasterAssets: () =>
    fetchJSON<MasterAssetRefreshReport>("/api/org/assets/refresh", { method: "POST" }),
  listMasterAssets: (params?: {
    asset_type?: string;
    visibility?: "public" | "private";
    inheritable_only?: boolean;
  }) => {
    const qs = new URLSearchParams();
    if (params?.asset_type) qs.set("asset_type", params.asset_type);
    if (params?.visibility) qs.set("visibility", params.visibility);
    if (params?.inheritable_only) qs.set("inheritable_only", "true");
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return fetchJSON<MasterAsset[]>(`/api/org/assets${suffix}`);
  },
  setProviderVisibility: (providerId: string, visibility: "public" | "private") =>
    fetchJSON<MasterAsset>(
      `/api/org/assets/env-provider/${encodeURIComponent(providerId)}/visibility`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility }),
      }
    ),

  // ── Director Office APIs ─────────────────────────────────────
  initDirectorOffice: (data: { companyId: number; agentCount?: number }) =>
    fetchJSON<{ department_id: number; office_id: number; agents: any[] }>(
      `/api/org/companies/${data.companyId}/init-director-office`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_count: data.agentCount || 3 }),
      }
    ),

  startDirectorDiscussion: (companyId: number) =>
    fetchJSON<{ session_id: string; messages: any[] }>(
      `/api/org/companies/${companyId}/start-discussion`,
      {
        method: "POST",
      }
    ),
};

/** Row from ``master_agent_assets`` exposed by ``GET /api/org/assets``. */
export interface MasterAsset {
  id: number;
  asset_type: string;
  asset_key: string;
  asset_name: string | null;
  source_path: string | null;
  source_format: string | null;
  visibility: "public" | "private";
  inherit_mode: string;
  target_path_template: string | null;
  content_checksum: string | null;
  is_runtime_required: number | boolean;
  is_bootstrap_required: number | boolean;
  inherit_ready: number | boolean;
  validation_status: string;
  validation_message: string | null;
  last_validated_at: number | null;
  version: number | null;
  description: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface MasterAssetRefreshReport {
  scanned: number;
  created: number;
  updated: number;
  deactivated: number;
  missing_sources: string[];
}

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
  leadership_role: 'primary' | 'deputy' | 'none';
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
  is_management_position: number | boolean;
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
  managing_department_id: number | null;
  is_management_department: number | boolean;
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
  manager_agent_id?: number | null;
  leadership_role?: 'primary' | 'deputy' | 'none';
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
  has_active_stream?: boolean;
}

export interface PaginatedSessions {
  sessions: SessionInfo[];
  total: number;
  limit: number;
  offset: number;
}

export interface RecruitJobPosting {
  id: number;
  record_uid: string | null;
  record_id: string | null;
  schema_version: string | null;
  source: {
    type: string | null;
    format: string | null;
    platform: string | null;
    file_name: string | null;
    document_title: string | null;
  };
  status: "待编辑" | "待评分" | "待发布" | "已完成" | "已暂停";
  company_name: string | null;
  position_title: string | null;
  position_category: string | null;
  city: string | null;
  district: string | null;
  salary: {
    min: number | null;
    max: number | null;
    unit: string | null;
    months: number | null;
  };
  skills: unknown[];
  must_have: unknown[];
  responsibilities: unknown[];
  benefits: unknown[];
  source_json: Record<string, unknown>;
  extraction_meta: Record<string, unknown>;
  raw_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  active_score?: {
    id: number;
    mode: "正式权重" | "预览权重";
    revision: number;
    created_at: string;
  } | null;
}

export interface RecruitJobScore {
  id: number;
  job_posting_id: number;
  mode: "正式权重" | "预览权重";
  status_at_scoring: string | null;
  score_json: Record<string, unknown>;
  summary_json: Record<string, unknown> | null;
  is_active: boolean;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface RecruitCandidateRecord {
  id: number;
  candidate_uid: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  current_role: string | null;
  current_company: string | null;
  experience_years: number | null;
  status: string | null;
  skills: unknown[];
  summary: string | null;
  source_json: Record<string, unknown>;
  raw_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RecruitWorkspaceResponse {
  workspace_session: SessionInfo;
  workspace_sessions: SessionInfo[];
  postings: RecruitJobPosting[];
  candidates: RecruitCandidateRecord[];
  database_path: string;
}

export interface RecruitPostingsResponse {
  postings: RecruitJobPosting[];
  total: number;
  limit: number;
  offset: number;
  database_path: string;
}

export interface RecruitPostingDetailResponse {
  posting: RecruitJobPosting;
  scores: RecruitJobScore[];
  database_path: string;
}

export interface RecruitCandidatesResponse {
  candidates: RecruitCandidateRecord[];
  total: number;
  limit: number;
  offset: number;
  database_path: string;
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
  sender_agent_role?: string;
  sender_agent_name?: string;
  sender_agent_id?: number;
  type?: string;
  mermaid_code?: string;
  architecture_version?: number;
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

// ── Workflow API ──
// Types are defined in pages/WorkflowsPage/types.ts and re-exported here
export type {
  Workflow,
  WorkflowEdge,
  WorkflowInstance,
  WorkflowApiResponse,
} from "@/pages/WorkflowsPage/types";

export async function getWorkflow(companyId: number): Promise<Workflow | null> {
  const token = await getGatewayAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(
    `${GATEWAY_BASE}/api/org/companies/${companyId}/workflow`,
    { headers }
  );
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Failed to fetch workflow: ${res.statusText}`);
  }
  const data: WorkflowApiResponse = await res.json();
  return data.workflow;
}

export async function generateWorkflow(companyId: number): Promise<Workflow> {
  const token = await getGatewayAuthToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(
    `${GATEWAY_BASE}/api/org/companies/${companyId}/workflow/generate`,
    { method: "POST", headers }
  );
  if (!res.ok) throw new Error(`Failed to generate workflow: ${res.statusText}`);
  const data: WorkflowApiResponse = await res.json();
  return data.workflow!;
}

export async function createWorkflow(data: {
  company_id: number;
  name: string;
  description?: string;
}): Promise<Workflow> {
  const token = await getGatewayAuthToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${GATEWAY_BASE}/api/org/workflows`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create workflow: ${res.statusText}`);
  return await res.json();
}

export async function updateWorkflow(
  id: number,
  data: {
    name?: string;
    description?: string;
    status?: string;
    edges?: Array<{
      source_department_id: number;
      target_department_id: number;
      action_description: string;
      trigger_condition?: string;
      sort_order?: number;
    }>;
  }
): Promise<Workflow> {
  const token = await getGatewayAuthToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${GATEWAY_BASE}/api/org/workflows/${id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update workflow: ${res.statusText}`);
  return await res.json();
}

export async function deleteWorkflow(id: number): Promise<void> {
  const token = await getGatewayAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${GATEWAY_BASE}/api/org/workflows/${id}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(`Failed to delete workflow: ${res.statusText}`);
}

export interface DirectorOffice {
  id: number;
  company_id: number;
  department_id: number;
  director_agent_id: number | null;
  office_name: string;
  responsibilities: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface ArchitectureMessage {
  type: 'architecture';
  mermaid_code: string;
  sender_agent_role: string;
  architecture_version: number;
  role: string;
  content: string;
  timestamp: number;
}
