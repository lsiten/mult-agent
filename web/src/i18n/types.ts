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
    operationFailed: string;
    collapse: string;
    expand: string;
    general: string;
    messaging: string;
    optional: string;
    messages: string;
    details: string;
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
      organization: string;
      workflows: string;
    };
  };

  // ── Work Selector ──
  workSelector: {
    selectWork: string;
    masterAgent: string;
    masterAgentHint: string;
    noCompanies: string;
    loadingCompanies: string;
    agents: string;
  };

  // ── RecruitAI candidate preview ──
  recruitCandidate: {
    brand: string;
    systemLabel: string;
    breadcrumb: string;
    recruiterInitials: string;
    nav: {
      dashboard: string;
      workspace: string;
      requirements: string;
      talent: string;
      settings: string;
    };
    mobileNav: {
      home: string;
      workspace: string;
      talent: string;
      settings: string;
    };
    actions: {
      back: string;
      publishRequirement: string;
      shareProfile: string;
      downloadResume: string;
      markCommunicated: string;
      markAdvanced: string;
      markRejected: string;
    };
    candidate: {
      initials: string;
      badge: string;
      name: string;
      email: string;
      phone: string;
      location: string;
    };
    stats: {
      experienceLabel: string;
      experienceValue: string;
      currentRoleLabel: string;
      currentRoleValue: string;
      currentCompanyLabel: string;
      currentCompanyValue: string;
      matchLabel: string;
      matchValue: string;
    };
    status: {
      label: string;
      value: string;
    };
    communication: {
      methods: string[];
    };
    resume: {
      title: string;
      educationLabel: string;
      school: string;
      degreePeriod: string;
      skillsLabel: string;
      skills: string[];
      summaryLabel: string;
      summary: string;
    };
    timeline: {
      title: string;
      items: Array<{
        time: string;
        title: string;
        description: string;
        pending?: boolean;
      }>;
    };
    note: {
      placeholder: string;
      save: string;
    };
    sql: {
      emptyTitle: string;
      emptyDescription: string;
      noValue: string;
      candidateRecords: string;
      jobRecords: string;
      databasePath: string;
      candidateStatus: string;
      email: string;
      phone: string;
      location: string;
      skillsEmpty: string;
      summaryEmpty: string;
      createdAt: string;
      updatedAt: string;
    };
  };

  // ── RecruitAI requirement detail preview ──
  recruitRequirement: {
    brand: string;
    nav: {
      dashboard: string;
      workspace: string;
      requirements: string;
      talent: string;
      settings: string;
    };
    header: {
      title: string;
      tabs: string[];
      notifications: string;
      avatarInitials: string;
    };
    actions: {
      publishRequirement: string;
      shareJob: string;
    };
    requirement: {
      status: string;
      title: string;
    };
    description: {
      title: string;
      body: string;
      requirements: string[];
    };
    stats: {
      title: string;
      foundLabel: string;
      foundValue: string;
      change: string;
      screened: string;
      hired: string;
    };
    sources: {
      title: string;
      items: string[];
    };
    panel: {
      tabs: {
        details: string;
        automation: string;
      };
    };
    config: {
      title: string;
      rows: Array<{
        label: string;
        value: string;
        highlight?: boolean;
      }>;
    };
    task: {
      title: string;
      status: string;
      progressLabel: string;
      progressValue: string;
      runNow: string;
      edit: string;
      stop: string;
    };
    history: {
      title: string;
      viewAll: string;
      items: Array<{
        time: string;
        status: string;
        result: string;
      }>;
    };
    footer: {
      prefix: string;
      highlight: string;
      suffix: string;
    };
    sql: {
      emptyTitle: string;
      emptyDescription: string;
      noValue: string;
      databasePath: string;
      postingCount: string;
      scoreCount: string;
      noRequirements: string;
      noSources: string;
      noHistory: string;
      company: string;
      location: string;
      salary: string;
      activeScore: string;
    };
  };

  // ── RecruitAI workspace preview ──
  recruitWorkspace: {
    brand: string;
    nav: {
      dashboard: string;
      workspace: string;
      requirements: string;
      talent: string;
      settings: string;
    };
    header: {
      searchPlaceholder: string;
      avatarInitials: string;
    };
    actions: {
      newRequirement: string;
      newChat: string;
    };
    history: {
      title: string;
      empty: string;
      fallbackTitle: string;
    };
    chat: {
      title: string;
      idleStatus: string;
      processingStatus: string;
      userMessage: string;
      assistantMessage: string;
      inputPlaceholder: string;
    };
    sqlPreview: {
      title: string;
      description: string;
      tableName: string;
      close: string;
    };
    draft: {
      label: string;
      status: string;
      title: string;
      fields: Array<{
        label: string;
        value?: string;
        tags?: string[];
        full?: boolean;
        highlight?: boolean;
      }>;
      descriptionLabel: string;
      description: string;
      modify: string;
      confirm: string;
    };
    skills: {
      title: string;
      subtitle: string;
      actions: Array<{
        skillName: string;
        title: string;
        description: string;
        prompt: string;
        cta: string;
        tone: "extract" | "score";
      }>;
    };
    requirements: {
      title: string;
      activeCount: string;
      activeCountLabel: string;
      searchPlaceholder: string;
      fallbackCompany: string;
      fallbackTitle: string;
      fallbackSalary: string;
      empty: string;
      groups: Array<{
        company: string;
        items: Array<{
          title: string;
          status: string;
          statusTone: "success" | "pending" | "closed";
          salary: string;
          people: string;
          muted?: boolean;
          active?: boolean;
        }>;
      }>;
    };
    footer: {
      successRateLabel: string;
      successRateValue: string;
      cycleLabel: string;
      cycleValue: string;
    };
  };

  recruitPlaceholder: {
    brand: string;
    nav: {
      dashboard: string;
      workspace: string;
      requirements: string;
      talent: string;
      settings: string;
    };
    dashboard: {
      title: string;
      subtitle: string;
      cards: Array<{
        label: string;
        value: string;
        detail: string;
      }>;
    };
    settings: {
      title: string;
      subtitle: string;
      cards: Array<{
        label: string;
        value: string;
        detail: string;
      }>;
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
    failedToLoad: string;
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
      forceInstall: string;
      forceCopied: string;
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
    // Per-provider Public / Private inheritance toggle (master agent only)
    visibilityPublic: string;
    visibilityPrivate: string;
    visibilityPublicTooltip: string;
    visibilityPrivateTooltip: string;
    visibilityUnavailableTooltip: string;
    visibilityToggleFailed: string;
    visibilityMasterHint: string;
  };

  // ── OAuth ──
  oauth: {
    title: string;
    providerLogins: string;
    description: string;
    configuredDescription: string;
    connected: string;
    expired: string;
    notConnected: string;
    notConnectedElectron: string;
    notConnectedExternal: string;
    runInTerminal: string;
    noProviders: string;
    noConfiguredProviders: string;
    login: string;
    disconnect: string;
    managedExternally: string;
    copied: string;
    cli: string;
    copyCliCommand: string;
    apiKeyAuth: string;
    oauthAuth: string;
    inUse: string;
    available: string;
    currentModel: string;
    none: string;
    openSetup: string;
    setupOpened: string;
    setupUnavailable: string;
    loadFailed: string;
    useProvider: string;
    stopUsing: string;
    switchedProvider: string;
    switchFailed: string;
    stoppedUsing: string;
    stopFailed: string;
    modelUnset: string;
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
      authorization_request: string;
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
    masterAgent: string;
    masterAgentSubtitle: string;
    masterAgentHint: string;
    subAgentBadge: string;
    switchAgent: string;
    chattingAs: string;
    noSubAgents: string;
    loadingAgents: string;
    profileStatus: string;
    profileNotReady: string;
    openChat: string;
    openChatHint: string;
    scopeBannerPrefix: string;
    scopeBannerSuffix: string;
    scopeBannerBackToMaster: string;
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
    authorizationRequest: {
      title: string;
      oauthTitle: string;
      permissionTitle: string;
      confirmationTitle: string;
      openUrl: string;
      copyUrl: string;
      urlCopied: string;
      instructions: string;
      grantPermission: string;
      cancel: string;
      waiting: string;
    };
  };

  // ── Organization page ──
  organization: {
    title: string;
    subtitle: string;
    emptyTitle: string;
    emptyDescription: string;
    tree: string;
    details: string;
    editor: string;
    createCompany: string;
    createDepartment: string;
    createPosition: string;
    createAgent: string;
    switchCompany: string;
    chart: string;
    icon: string;
    color: string;
    colorHex: string;
    avatarUrl: string;
    addChild: string;
    editSelected: string;
    refresh: string;
    provisionProfile: string;
    provisioning: string;
    noSelection: string;
    selectNode: string;
    company: string;
    department: string;
    position: string;
    agent: string;
    departments: string;
    positions: string;
    agents: string;
    profile: string;
    workspace: string;
    status: string;
    goal: string;
    description: string;
    responsibilities: string;
    role: string;
    serviceGoal: string;
    headcount: string;
    templateKey: string;
    employeeNo: string;
    displayName: string;
    name: string;
    enabled: string;
    disabled: string;
    companySpace: string;
    companySpaceDescription: string;
    personalSpace: string;
    personalSpaceDescription: string;
    profileStatus: string;
    profileHome: string;
    soulPath: string;
    configPath: string;
    lastSync: string;
    errorMessage: string;
    rootGoal: string;
    targetChain: string;
    delete: string;
    deleteConfirmWithName: string;
    deleteFailedWithReason: string;
    deleted: string;
    saveFailed: string;
    saveFailedWithReason: string;
    loadFailed: string;
    profileFailed: string;
    profileFailedWithReason: string;
    saved: string;
    profileQueued: string;
    form: {
      mode: string;
      editMode: string;
      parentCompany: string;
      parentDepartment: string;
      parentPosition: string;
      optional: string;
    };
    leadershipRole: string;
    primaryLeader: string;
    deputyLeader: string;
    normalEmployee: string;
    setPrimaryLeader: string;
    setDeputyLeader: string;
    removeLeader: string;
    managementPosition: string;
    setManagementPosition: string;
    removeManagementPosition: string;
    managementDepartment: string;
    setManagementDepartment: string;
    removeManagementDepartment: string;
    managingDepartment: string;
    setManagingDepartment: string;
    changeManagingDepartment: string;
    managedBy: string;
    recommendedManager: string;
    directManager: string;
    autoRecommend: string;
    recommended: string;
    recommendedManagerHint: string;
    primaryLeaderConflict: string;
    agentNotFound: string;
    leaderRoleUpdated: string;
    managementPositionUpdated: string;
    managementDepartmentUpdated: string;
    managingDepartmentUpdated: string;
    setDirectManager: string;
    setLeadershipRole: string;
    selectManager: string;
    currentManager: string;
    noAvailableManagers: string;
    directManagerUpdated: string;
    positionLeader: string;
    departmentLeader: string;
    managingDepartmentLeader: string;
    otherDepartmentLeader: string;
    // Mention extension for chat input
    mentionSearchPlaceholder: string;
    noAgentsFound: string;
    agentCount: string;
    selectedCompany: string;
    noCompanies: string;
    directorOffice: {
      title: string;
      subtitle: string;
      initDirectorOffice: string;
      createDirectorOffice: string;
      editDirectorOffice: string;
      agentCount: string;
      initializing: string;
      directorOfficeCreated: string;
      startDiscussion: string;
      architecture: string;
      confirmArchitecture: string;
      continueDiscussion: string;
    };
  };

  // ── Workflows page ──
  workflows: {
    title: string;
    subtitle: string;
    emptyTitle: string;
    emptyDescription: string;
    emptyNoDepartments: string;
    generateWorkflow: string;
    generating: string;
    viewMode: string;
    editMode: string;
    save: string;
    saving: string;
    cancel: string;
    delete: string;
    deleteConfirm: string;
    deleted: string;
    deleteFailed: string;
    saved: string;
    saveFailed: string;
    generated: string;
    generateFailed: string;
    loadFailed: string;
    addConnection: string;
    editConnection: string;
    sourceDepartment: string;
    targetDepartment: string;
    actionDescription: string;
    triggerCondition: string;
    triggerConditionOptional: string;
    selectDepartment: string;
    departmentsRequired: string;
    departmentsHint: string;
    noWorkflow: string;
    noWorkflowDescription: string;
    edgeDeleteConfirm: string;
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
      browserModePlugin: string;
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
