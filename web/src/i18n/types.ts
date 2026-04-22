export type Locale = "en" | "zh";

export interface Translations {
  // ── Common ──
  common: {
    save: string;
    saving: string;
    cancel: string;
    close: string;
    delete: string;
    refresh: string;
    retry: string;
    search: string;
    loading: string;
    create: string;
    creating: string;
    set: string;
    replace: string;
    clear: string;
    live: string;
    off: string;
    enabled: string;
    disabled: string;
    active: string;
    inactive: string;
    unknown: string;
    untitled: string;
    none: string;
    form: string;
    noResults: string;
    of: string;
    page: string;
    msgs: string;
    tools: string;
    match: string;
    other: string;
    configured: string;
    removed: string;
    failedToToggle: string;
    failedToRemove: string;
    failedToReveal: string;
    deleted: string;
    failedToDelete: string;
    updated: string;
    failedToUpdate: string;
    success: string;
    collapse: string;
    expand: string;
    general: string;
    messaging: string;
    optional: string;
    messages: string;
  };

  // ── App shell ──
  app: {
    brand: string;
    brandShort: string;
    webUi: string;
    footer: {
      name: string;
      org: string;
    };
    nav: {
      status: string;
      chat: string;
      sessions: string;
      analytics: string;
      logs: string;
      cron: string;
      skills: string;
      config: string;
      keys: string;
      performance: string;
      settings: string;
    };
  };

  // ── Status page ──
  status: {
    agent: string;
    gateway: string;
    activeSessions: string;
    recentSessions: string;
    connectedPlatforms: string;
    running: string;
    starting: string;
    failed: string;
    stopped: string;
    connected: string;
    disconnected: string;
    error: string;
    notRunning: string;
    startFailed: string;
    pid: string;
    runningRemote: string;
    noneRunning: string;
    gatewayFailedToStart: string;
    lastUpdate: string;
    platformError: string;
    platformDisconnected: string;
  };

  // ── Sessions page ──
  sessions: {
    title: string;
    searchPlaceholder: string;
    noSessions: string;
    noMatch: string;
    startConversation: string;
    noMessages: string;
    untitledSession: string;
    deleteSession: string;
    previousPage: string;
    nextPage: string;
    roles: {
      user: string;
      assistant: string;
      system: string;
      tool: string;
    };
  };

  // ── Analytics page ──
  analytics: {
    period: string;
    totalTokens: string;
    totalSessions: string;
    apiCalls: string;
    dailyTokenUsage: string;
    dailyBreakdown: string;
    perModelBreakdown: string;
    input: string;
    output: string;
    total: string;
    noUsageData: string;
    startSession: string;
    date: string;
    model: string;
    tokens: string;
    perDayAvg: string;
    acrossModels: string;
    inOut: string;
  };

  // ── Logs page ──
  logs: {
    title: string;
    autoRefresh: string;
    file: string;
    level: string;
    component: string;
    lines: string;
    noLogLines: string;
    applicationLogs?: string;
    autoScroll?: string;
  };

  // ── Cron page ──
  cron: {
    newJob: string;
    nameOptional: string;
    namePlaceholder: string;
    prompt: string;
    promptPlaceholder: string;
    schedule: string;
    schedulePlaceholder: string;
    deliverTo: string;
    scheduledJobs: string;
    noJobs: string;
    last: string;
    next: string;
    pause: string;
    resume: string;
    triggerNow: string;
    delivery: {
      local: string;
      telegram: string;
      discord: string;
      slack: string;
      email: string;
    };
  };

  // ── Skills page ──
  skills: {
    title: string;
    searchPlaceholder: string;
    enabledOf: string;
    all: string;
    noSkills: string;
    noSkillsMatch: string;
    skillCount: string;
    resultCount: string;
    noDescription: string;
    toolsets: string;
    toolsetLabel: string;
    noToolsetsMatch: string;
    setupNeeded: string;
    disabledForCli: string;
    more: string;
    installNewSkill: string;
    editDescription: string;
    install: {
      title: string;
      tabs: {
        onlineSearch: string;
        uploadZip: string;
      };
      onlineSearch: {
        placeholder: string;
        searchPlaceholder: string;
        noResults: string;
        offlineMode: string;
        offlineDescription: string;
        installed: string;
        install: string;
        source: string;
        selectSource: string;
      };
      uploadZip: {
        placeholder: string;
        dropzoneText: string;
        selectFile: string;
        uploading: string;
        validating: string;
        maxSize: string;
        invalidFile: string;
        fileTooLarge: string;
        requirements: string;
        trustedOnly: string;
        selectCategory: string;
        categoryDescription: string;
        rootCategory: string;
        newCategory: string;
        enterCategoryName: string;
        categoryPlaceholder: string;
      };
      progress: {
        pending: string;
        queued: string;
        inProgress: string;
        completed: string;
        failed: string;
        cancelled: string;
      };
      errors: {
        downloadFailed: string;
        validationFailed: string;
        securityThreat: string;
        networkError: string;
        unknownError: string;
      };
    };
  };

  // ── Config page ──
  config: {
    configPath: string;
    exportConfig: string;
    importConfig: string;
    resetDefaults: string;
    reopenSetup: string;
    setupReopened: string;
    rawYaml: string;
    searchResults: string;
    fields: string;
    noFieldsMatch: string;
    configSaved: string;
    yamlConfigSaved: string;
    failedToSave: string;
    failedToSaveYaml: string;
    failedToLoadRaw: string;
    configImported: string;
    invalidJson: string;
    categories: {
      general: string;
      agent: string;
      terminal: string;
      display: string;
      delegation: string;
      memory: string;
      compression: string;
      security: string;
      browser: string;
      voice: string;
      tts: string;
      stt: string;
      logging: string;
      discord: string;
      auxiliary: string;
    };
  };

  // ── Env / Keys page ──
  env: {
    description: string;
    changesNote: string;
    hideAdvanced: string;
    showAdvanced: string;
    llmProviders: string;
    providersConfigured: string;
    getKey: string;
    notConfigured: string;
    notSet: string;
    keysCount: string;
    enterValue: string;
    replaceCurrentValue: string;
    showValue: string;
    hideValue: string;
  };

  // ── OAuth ──
  oauth: {
    title: string;
    providerLogins: string;
    description: string;
    connected: string;
    expired: string;
    notConnected: string;
    runInTerminal: string;
    noProviders: string;
    login: string;
    disconnect: string;
    managedExternally: string;
    copied: string;
    cli: string;
    copyCliCommand: string;
    connect: string;
    sessionExpires: string;
    initiatingLogin: string;
    exchangingCode: string;
    connectedClosing: string;
    loginFailed: string;
    sessionExpired: string;
    reOpenAuth: string;
    reOpenVerification: string;
    submitCode: string;
    pasteCode: string;
    waitingAuth: string;
    enterCodePrompt: string;
    pkceStep1: string;
    pkceStep2: string;
    pkceStep3: string;
    flowLabels: {
      pkce: string;
      device_code: string;
      external: string;
    };
    expiresIn: string;
  };

  // ── Chat page ──
  chat: {
    title: string;
    subtitle: string;
    emptyState: string;
    placeholder: string;
    roles: {
      user: string;
      assistant: string;
      system: string;
      tool: string;
      tool_use: string;
      skill_use: string;
    };
    newChat: string;
    searchPlaceholder: string;
    today: string;
    yesterday: string;
    thisWeek: string;
    earlier: string;
    editTitle: string;
    deleteSession: string;
    deleteConfirm: string;
    collapseSidebar: string;
    expandSidebar: string;
    loadMore: string;
    loadingMore: string;
    attachFile: string;
    attachImage: string;
    voiceInput: string;
    attachFolder: string;
    uploading: string;
    streamingResponse: string;
    sessionCreated: string;
    sessionDeleted: string;
    waitForUpload: string;
    stopTask: string;
    noSessions: string;
    stopRecording: string;
    cancelRecording: string;
    processing: string;
    errors: {
      sessionLoadFailed: string;
      messageSendFailed: string;
      uploadFailed: string;
      streamingFailed: string;
      deleteSessionFailed: string;
      sttFailed: string;
      invalidSkills: string;
    };
    skillSelector: {
      title: string;
      placeholder: string;
      noSkills: string;
      searchPlaceholder: string;
      selected: string;
      clearAll: string;
      apply: string;
    };
    toolInvocation: {
      executing: string;
      completed: string;
      failed: string;
      showDetails: string;
      hideDetails: string;
      parameters: string;
      result: string;
      duration: string;
      hideToolCalls: string;
      showToolCalls: string;
    };
    skillInvocation: {
      loaded: string;
      failed: string;
      unavailable: string;
      tools: string;
      usedTimes: string;
    };
  };

  // ── Language switcher ──
  language: {
    switchTo: string;
  };

  // ── Theme switcher ──
  theme: {
    title: string;
    switchTheme: string;
  };

  // ── Onboarding ──
  onboarding: {
    step1: {
      title: string;
      subtitle: string;
      languageLabel: string;
      languagePlaceholder: string;
      note: string;
    };
    step2: {
      title: string;
      subtitle: string;
      providerLabel: string;
      providerPlaceholder: string;
      modelNameLabel: string;
      modelNamePlaceholder: string;
      modelNameHint: string;
      apiKeyLabel: string;
      apiKeyPlaceholder: string;
      baseUrlLabel: string;
      baseUrlPlaceholder: string;
      baseUrlHint: string;
      oauthNote: string;
      oauthInstruction: string;
      oauthCommand: string;
      openTerminal: string;
      getKey: string;
      testConnection: string;
      testing: string;
      connectionSuccess: string;
      connectionFailed: string;
    };
    step3: {
      title: string;
      subtitle: string;
      skipNote: string;
      visionSection: string;
      visionDescription: string;
      visionSupported: string;
      visionNotSupported: string;
      falKeyLabel: string;
      falKeyPlaceholder: string;
      browserSection: string;
      browserDescription: string;
      browserModeLocal: string;
      browserModeCdp: string;
      browserModeBrowserbase: string;
      cdpUrlLabel: string;
      cdpUrlPlaceholder: string;
      cdpInstructions: string;
      cdpInspectUrl: string;
      browserbaseApiKeyLabel: string;
      browserbaseProjectIdLabel: string;
      searchSection: string;
      searchDescription: string;
      exaLabel: string;
      exaPlaceholder: string;
      firecrawlLabel: string;
      firecrawlPlaceholder: string;
    };
    step4: {
      title: string;
      subtitle: string;
      summaryTitle: string;
      summaryLanguage: string;
      summaryProvider: string;
      summaryOptional: string;
      summaryOptionalCount: string;
      readyMessage: string;
      startButton: string;
    };
    common: {
      skipGuide: string;
      previous: string;
      next: string;
      skip: string;
      saveAndComplete: string;
      stepProgress: string;
      requiredField: string;
      invalidUrl: string;
      invalidWebSocketUrl: string;
      configurationSaved: string;
      saveFailed: string;
    };
  };

  // ── Providers ──
  providers: {
    [key: string]: {
      name: string;
      description: string;
    };
  };

  // ── Settings ──
  settings: {
    subtitle: string;
  };

  // ── Performance ──
  performance: {
    title: string;
    subtitle: string;
    restartGateway: string;
    statusUnavailable: string;
    failedToLoad: string;
    status: {
      title: string;
      running: string;
      stopped: string;
      restarting: string;
    };
    uptime: {
      title: string;
    };
    circuitBreaker: {
      title: string;
      closed: string;
      open: string;
      halfOpen: string;
      unknown: string;
    };
    restartCount: {
      title: string;
    };
    startup: {
      title: string;
      subtitle: string;
      time: string;
      attempts: string;
    };
    healthCheck: {
      title: string;
      subtitle: string;
      avgLatency: string;
      p95Latency: string;
      p99Latency: string;
      totalChecks: string;
      success: string;
      failures: string;
      errorRate: string;
    };
    lastError: {
      title: string;
    };
    healthIssues: {
      title: string;
      consecutiveFailures: string;
      description: string;
      autoRestart: string;
    };
  };

  // ── DevTools ──
  devTools: {
    title: string;
    subtitle: string;
    refresh: string;
    status: {
      title: string;
    };
    performance: {
      title: string;
    };
    analytics: {
      title: string;
    };
    services: {
      title: string;
      status: string;
      running: string;
      stopped: string;
      error: string;
      dependencies: string;
      none: string;
    };
    logs: {
      title: string;
      applicationLogs?: string;
      autoScroll?: string;
    };
    ipc: {
      title: string;
      registered: string;
      registeredStatus: string;
    };
    metrics: {
      title: string;
      startupTime: string;
      startupTarget: string;
      p95Latency: string;
      latencyTarget: string;
      errorRate: string;
      errorTarget: string;
    };
  };
}
