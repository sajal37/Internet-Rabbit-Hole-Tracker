const STORAGE_KEY = "irht_state";
const SETTINGS_KEY = "irht_settings";
const SYNC_STATE_KEY = "irht_state_sync";
const FORCE_REFRESH_KEY = "irht_force_summary_refresh";
const UNDO_SETTINGS_KEY = "irht_settings_undo";
const GRAPH_SETTINGS_KEY = "irht_graph_settings";
const MAX_GRAPH_NODES = 80;
const GRAPH_INITIAL_NODE_CAP = 40;
const SUMMARY_DEBOUNCE_MS = 400;
const WORKER_TASK_TIMEOUT_MS = 4000;
const OLLAMA_REQUEST_TIMEOUT_MS = 20000;
const SUMMARY_REFRESH_TIMEOUT_MS = 25000;
const MAX_EVENTS = 5000;
const SESSION_LIST_ITEM_ESTIMATE = 76;
const SESSION_LIST_BUFFER = 4;
const GRAPH_DEFAULTS = {
  mode: "domain",
  nodeCap: 80,
  minNodeMinutes: 0,
  minEdgeCount: 1,
  showLabels: true,
  hideIsolates: false,
  freeze: false,
  colorBy: "activity",
  search: "",
};
const OLLAMA_ENDPOINT = "http://localhost:3010/analyze";
const OLLAMA_MODEL = "llama3";
const DIRECT_OLLAMA_ENDPOINT = "http://localhost:11434/api/generate";
const PALETTE = [
  "#c84c37",
  "#2a9d8f",
  "#e9c46a",
  "#8f5d3a",
  "#3d5a80",
  "#f4a261",
  "#6d6875",
  "#b56576",
  "#457b9d",
  "#4d908e",
];
const DIRECT_CALLOUTS_STORAGE_KEY = "rabbit_shame_enabled";
const DEFAULT_SETTINGS = {
  sessionTimeoutMinutes: 15,
  userIdleMinutes: 3,
  theme: "warm",
  syncEnabled: false,
  trackingPaused: false,
  categoryOverrides: {},
  tone: "neutral",
  directCallouts: false,
  intentDriftAlerts: true,
  intentDriftSensitivity: "balanced",
  productiveSites: [],
  distractingSites: [],
  summaryAutoRefresh: false,
  dashboardFocusNote: "",
  popupNote: "",
  dashboardButtonLabel: "Open dashboard",
  uiDensity: "comfortable",
  reduceMotion: false,
  sessionListLimit: 12,
  ollamaEndpoint: OLLAMA_ENDPOINT,
  ollamaModel: OLLAMA_MODEL,
  popupLayout: "stack",
  popupDensity: "roomy",
  popupQuickGlance: [],
  popupPrimaryAction: "open_dashboard",
  popupMicroNote: "",
  popupMood: "",
  dashboardSections: {
    overview: true,
    sessions: false,
    timeline: false,
    graph: false,
    stats: false,
    honesty: false,
    callouts: false,
  },
  dashboardStoryMode: false,
  sessionListStyle: "cards",
  pinActiveSession: true,
  focusPrompts: [],
  showOutcomeHighlights: false,
  accentColor: "",
  typographyStyle: "calm",
  summaryPersonality: "balanced",
  summaryEmojis: "low",
  summaryFormatting: "plain",
  summaryBullets: false,
  summaryMetaphors: false,
  summaryLength: "medium",
  summaryVerbosity: "standard",
  summaryTechnicality: "neutral",
  summaryVoice: "mentor",
  summaryRefreshCooldownMinutes: 0,
  summaryCacheMinutes: 0,
  realtimeStreamEnabled: false,
  realtimeDeltaSync: false,
  realtimePortPush: true,
  realtimeLiveTimers: false,
  realtimeBatchUpdates: false,
  realtimeBatchWindowMs: 350,
  realtimePriorityUpdates: false,
  realtimeOptimisticUi: false,
  realtimeWorkerOffload: false,
  realtimeFrameAligned: false,
};
const DISTRACTION_ACTIVE_WEIGHT_CAP = 1.6;
const DISTRACTION_LATE_NIGHT_WEIGHT = 0.6;
const DISTRACTION_LATE_NIGHT_START = 23;
const DISTRACTION_LATE_NIGHT_END = 6;
const IS_TEST =
  typeof globalThis !== "undefined" && globalThis.__IRHT_TEST__ === true;

const CATEGORY_RULES = globalThis.IRHTCategories?.CATEGORY_RULES || [];
const CATEGORY_MULTIPLIERS = globalThis.IRHTCategories?.CATEGORY_MULTIPLIERS || {};
const CATEGORY_LIST = globalThis.IRHTCategories?.CATEGORY_LIST || [];
const THEME_LIST = ["warm", "ink", "forest", "retro", "paper", "noir"];
const POPUP_LAYOUTS = ["stack", "cards", "focus"];
const POPUP_DENSITIES = ["compact", "roomy"];
const POPUP_ACTIONS = [
  "open_dashboard",
  "pause_tracking",
  "copy_summary",
  "start_focus",
  "adaptive",
];
const POPUP_QUICK_GLANCE_KEYS = [
  "activeTime",
  "topDomain",
  "distractionScore",
  "sessionLabel",
  "lastAction",
];
const SESSION_LIST_STYLES = ["cards", "list", "minimal"];
const TYPOGRAPHY_STYLES = ["calm", "bold", "technical"];
const SUMMARY_PERSONALITIES = ["gentle", "balanced", "direct"];
const SUMMARY_EMOJI_LEVELS = ["none", "low", "medium", "high"];
const SUMMARY_FORMATTING = ["plain", "markdown"];
const SUMMARY_LENGTHS = ["short", "medium", "long"];
const SUMMARY_VERBOSITY = ["brief", "standard", "detailed"];
const SUMMARY_TECHNICALITY = ["soft", "neutral", "technical"];
const SUMMARY_VOICES = ["mentor", "analyst", "friend"];

const elements = {
  sessionSelect: document.getElementById("session-select"),
  sessionList: document.getElementById("session-list"),
  sessionListEmpty: document.getElementById("session-list-empty"),
  sessionDelete: document.getElementById("session-delete"),
  sessionFilterFavorites: document.getElementById("session-filter-favorites"),
  sessionFavoritesToggle: document.getElementById("session-favorites-toggle"),
  sessionCalendar: document.getElementById("session-calendar"),
  sessionDatePicker: document.getElementById("session-date-picker"),
  liveIndicator: document.getElementById("live-indicator"),
  liveLabel: document.getElementById("live-label"),
  viewTabs: document.querySelectorAll(".view-tab"),
  viewPanels: document.querySelectorAll("[data-view-panel]"),
  deepTabs: document.querySelectorAll(".deep-tab"),
  deepPanels: document.querySelectorAll("[data-deep-panel]"),
  deepDive: document.getElementById("deep-dive"),
  briefSummary: document.getElementById("brief-summary"),
  summaryStatus: document.getElementById("summary-status"),
  summaryRefresh: document.getElementById("summary-refresh"),
  openSettings: document.getElementById("open-settings"),
  openDashboard: document.getElementById("open-dashboard"),
  detailedSummary: document.getElementById("detailed-summary"),
  overviewSummary: document.getElementById("overview-summary"),
  overviewOrigin: document.getElementById("overview-origin"),
  overviewInsights: document.getElementById("overview-insights"),
  overviewInsightsEmpty: document.getElementById("overview-insights-empty"),
  overviewActions: document.getElementById("overview-actions"),
  overviewActionsEmpty: document.getElementById("overview-actions-empty"),
  overviewPanel: document.getElementById("overview-panel"),
  summaryCard: document.querySelector(".summary-card"),
  detailCard: document.querySelector(".detail-card"),
  sessionPanel: document.querySelector(".session-panel"),
  focusNote: document.getElementById("focus-note"),
  sessionRange: document.getElementById("session-range"),
  totalActive: document.getElementById("total-active"),
  pageCount: document.getElementById("page-count"),
  edgeCount: document.getElementById("edge-count"),
  timelineTrack: document.getElementById("timeline-track"),
  timelineLegend: document.getElementById("timeline-legend"),
  timelineStart: document.getElementById("timeline-start"),
  timelineEnd: document.getElementById("timeline-end"),
  graphCanvas: document.getElementById("graph-canvas"),
  graphEmpty: document.getElementById("graph-empty"),
  graphSearch: document.getElementById("graph-search"),
  graphNodeCap: document.getElementById("graph-node-cap"),
  graphNodeCapValue: document.getElementById("graph-node-cap-value"),
  graphMinActive: document.getElementById("graph-min-active"),
  graphMinActiveValue: document.getElementById("graph-min-active-value"),
  graphMinEdge: document.getElementById("graph-min-edge"),
  graphMinEdgeValue: document.getElementById("graph-min-edge-value"),
  graphColorBy: document.getElementById("graph-color-by"),
  graphShowLabels: document.getElementById("graph-show-labels"),
  graphHideIsolates: document.getElementById("graph-hide-isolates"),
  graphFreeze: document.getElementById("graph-freeze"),
  graphReset: document.getElementById("graph-reset"),
  graphStats: document.getElementById("graph-stats"),
  graphLegend: document.getElementById("graph-legend"),
  deepestChain: document.getElementById("deepest-chain"),
  deepestChainDetail: document.getElementById("deepest-chain-detail"),
  commonStart: document.getElementById("common-start"),
  commonStartDetail: document.getElementById("common-start-detail"),
  trapDoor: document.getElementById("trap-door"),
  trapDoorDetail: document.getElementById("trap-door-detail"),
  sessionLabel: document.getElementById("session-label"),
  sessionLabelDetail: document.getElementById("session-label-detail"),
  topDomains: document.getElementById("top-domains"),
  topPages: document.getElementById("top-pages"),
  topDistractions: document.getElementById("top-distractions"),
  damageReceipts: document.getElementById("damage-receipts"),
  pathStart: document.getElementById("path-start"),
  pathTrap: document.getElementById("path-trap"),
  pathEnd: document.getElementById("path-end"),
  pathMeta: document.getElementById("path-meta"),
  calloutsList: document.getElementById("callouts-list"),
  settingsForm: document.getElementById("settings-form"),
  settingSessionTimeout: document.getElementById("setting-session-timeout"),
  settingIdleTimeout: document.getElementById("setting-idle-timeout"),
  settingTheme: document.getElementById("setting-theme"),
  settingTone: document.getElementById("setting-tone"),
  settingTrackingPaused: document.getElementById("setting-tracking-paused"),
  settingProductiveSites: document.getElementById("setting-productive-sites"),
  settingDistractingSites: document.getElementById("setting-distracting-sites"),
  settingCategoryOverrides: document.getElementById(
    "setting-category-overrides",
  ),
  settingSync: document.getElementById("setting-sync"),
  settingDirectCallouts: document.getElementById("setting-direct-callouts"),
  settingIntentDriftAlerts: document.getElementById(
    "setting-intent-drift-alerts",
  ),
  settingIntentDriftSensitivity: document.getElementById(
    "setting-intent-drift-sensitivity",
  ),
  settingSummaryAutoRefresh: document.getElementById(
    "setting-summary-auto-refresh",
  ),
  settingSummaryPersonality: document.getElementById(
    "setting-summary-personality",
  ),
  settingSummaryEmojis: document.getElementById("setting-summary-emojis"),
  settingSummaryFormatting: document.getElementById("setting-summary-formatting"),
  settingSummaryBullets: document.getElementById("setting-summary-bullets"),
  settingSummaryMetaphors: document.getElementById("setting-summary-metaphors"),
  settingSummaryLength: document.getElementById("setting-summary-length"),
  settingSummaryVerbosity: document.getElementById("setting-summary-verbosity"),
  settingSummaryTechnicality: document.getElementById(
    "setting-summary-technicality",
  ),
  settingSummaryVoice: document.getElementById("setting-summary-voice"),
  settingSummaryCooldown: document.getElementById("setting-summary-cooldown"),
  settingSummaryCache: document.getElementById("setting-summary-cache"),
  settingOllamaEndpoint: document.getElementById("setting-ollama-endpoint"),
  settingOllamaModel: document.getElementById("setting-ollama-model"),
  settingRealtimeStreamEnabled: document.getElementById("setting-realtime-stream"),
  settingRealtimeDeltaSync: document.getElementById("setting-realtime-delta"),
  settingRealtimePortPush: document.getElementById("setting-realtime-push"),
  settingRealtimeLiveTimers: document.getElementById(
    "setting-realtime-live-timers",
  ),
  settingRealtimeBatching: document.getElementById("setting-realtime-batching"),
  settingRealtimeBatchWindow: document.getElementById(
    "setting-realtime-batch-window",
  ),
  settingRealtimePriorityUpdates: document.getElementById(
    "setting-realtime-priority",
  ),
  settingRealtimeOptimisticUi: document.getElementById(
    "setting-realtime-optimistic",
  ),
  settingRealtimeWorkerOffload: document.getElementById(
    "setting-realtime-worker",
  ),
  settingRealtimeFrameAligned: document.getElementById("setting-realtime-raf"),
  settingDashboardNote: document.getElementById("setting-dashboard-note"),
  settingPopupNote: document.getElementById("setting-popup-note"),
  settingDashboardButtonLabel: document.getElementById(
    "setting-dashboard-button-label",
  ),
  settingPopupLayout: document.getElementById("setting-popup-layout"),
  settingPopupDensity: document.getElementById("setting-popup-density"),
  settingPopupAction: document.getElementById("setting-popup-action"),
  settingPopupMicroNote: document.getElementById("setting-popup-micro-note"),
  settingPopupMood: document.getElementById("setting-popup-mood"),
  settingPopupShowActiveTime: document.getElementById(
    "setting-popup-show-active-time",
  ),
  settingPopupShowTopDomain: document.getElementById(
    "setting-popup-show-top-domain",
  ),
  settingPopupShowDistraction: document.getElementById(
    "setting-popup-show-distraction",
  ),
  settingPopupShowSessionLabel: document.getElementById(
    "setting-popup-show-session-label",
  ),
  settingPopupShowLastAction: document.getElementById(
    "setting-popup-show-last-action",
  ),
  settingDashboardStoryMode: document.getElementById(
    "setting-dashboard-story-mode",
  ),
  settingSessionListStyle: document.getElementById("setting-session-list-style"),
  settingPinActiveSession: document.getElementById("setting-pin-active-session"),
    settingFocusPrompts: document.getElementById("setting-focus-prompts"),
    settingOutcomeHighlights: document.getElementById(
      "setting-outcome-highlights",
    ),
  settingDashboardShowOverview: document.getElementById(
    "setting-dashboard-show-overview",
  ),
  settingDashboardShowSessions: document.getElementById(
    "setting-dashboard-show-sessions",
  ),
  settingDashboardShowTimeline: document.getElementById(
    "setting-dashboard-show-timeline",
  ),
  settingDashboardShowGraph: document.getElementById(
    "setting-dashboard-show-graph",
  ),
  settingDashboardShowStats: document.getElementById(
    "setting-dashboard-show-stats",
  ),
  settingDashboardShowHonesty: document.getElementById(
    "setting-dashboard-show-honesty",
  ),
  settingDashboardShowCallouts: document.getElementById(
    "setting-dashboard-show-callouts",
  ),
  settingAccentColor: document.getElementById("setting-accent-color"),
  settingTypographyStyle: document.getElementById("setting-typography-style"),
  settingUiDensity: document.getElementById("setting-ui-density"),
  settingReduceMotion: document.getElementById("setting-reduce-motion"),
  settingSessionListLimit: document.getElementById(
    "setting-session-list-limit",
  ),
  settingsPreview: document.getElementById("settings-preview"),
  previewThemeLabel: document.getElementById("preview-theme-label"),
  previewDensityLabel: document.getElementById("preview-density-label"),
  previewTypographyLabel: document.getElementById("preview-typography-label"),
  previewAccentLabel: document.getElementById("preview-accent-label"),
  resetSettings: document.getElementById("reset-settings"),
  undoSettings: document.getElementById("undo-settings"),
  settingsStatus: document.getElementById("settings-status"),
  exportData: document.getElementById("export-data"),
  deleteAllSessions: document.getElementById("delete-all-sessions"),
  resetState: document.getElementById("reset-state"),
  tooltip: document.getElementById("graph-tooltip"),
  graphToggles: document.querySelectorAll(".graph-toggle"),
  app: document.querySelector(".app"),
  toast: document.getElementById("toast"),
  toastMessage: document.getElementById("toast-message"),
  toastAction: document.getElementById("toast-action"),
};

const app = {
  state: null,
  session: null,
  followActiveSession: true,
  mode: "domain",
  graph: null,
  settings: { ...DEFAULT_SETTINGS },
  graphSettings: { ...GRAPH_DEFAULTS },
  liveState: "offline",
  view: "overview",
  deepTab: "timeline",
  sessionFilterFavoritesOnly: false,
  graphReady: false,
  graphWarm: false,
  forceSummaryRefresh: false,
  summaryState: {
    brief: "",
    detailed: "",
    updating: false,
    lastSessionId: null,
    requestId: 0,
    lastRefreshAt: 0,
    lastSessionUpdatedAt: 0,
    errorMessage: "",
  },
  cache: {
    sessionDerived: new Map(),
    sessionListKey: "",
    sessionListData: null,
    overviewInsights: new Map(),
    sessionListAutoScrollId: null,
    sessionListAutoScrollDone: false,
    realtimeFrameQueue: new Map(),
    realtimeWorkerCache: new Map(),
    commonStart: null,
    commonStartRevision: 0,
  },
  liveActiveBase: 0,
  liveActiveSessionId: null,
  stateRevision: 0,
};

const CACHE_LIMITS = {
  sessionDerived: 200,
  overviewInsights: 200,
  realtimeFrameQueue: 50,
  realtimeWorkerCache: 100,
};
const MAX_WORKER_PENDING = 80;

let toastTimer = null;
let toastActionHandler = null;
let settingsSaveTimer = null;
let summaryRefreshTimer = null;
let sessionListRenderTimer = null;
let sessionListScrollBound = false;
let realtimePort = null;
let realtimeBatchTimer = null;
let realtimePendingDelta = null;
let realtimeLiveTimer = null;
let realtimeDeferredRenderTimer = null;
let realtimePollTimer = null;
let realtimeReconcileTimer = null;
let realtimeWorker = null;
let realtimeWorkerRequestId = 0;
let realtimeWorkerPending = new Map();

function enforceMapLimit(map, limit) {
  if (!map || !Number.isFinite(limit) || limit <= 0) {
    return;
  }
  while (map.size > limit) {
    const oldestKey = map.keys().next().value;
    map.delete(oldestKey);
  }
}

function getBoundedCache(map, key, limit) {
  if (!map) {
    return null;
  }
  const entry = map.get(key);
  if (!entry) {
    return null;
  }
  if (Number.isFinite(limit) && limit > 0) {
    map.delete(key);
    map.set(key, entry);
  }
  return entry;
}

function setBoundedCache(map, key, value, limit) {
  if (!map) {
    return;
  }
  if (map.has(key)) {
    map.delete(key);
  }
  map.set(key, value);
  enforceMapLimit(map, limit);
}

function clearRealtimeWorkerPending() {
  realtimeWorkerPending.forEach((pending) => {
    clearTimeout(pending.timeoutId);
    pending.resolve(null);
  });
  realtimeWorkerPending.clear();
}

function shouldShowGraphForSession(session) {
  if (!session) {
    return false;
  }
  return true;
}

function formatSummaryForDisplay(text) {
  if (!text || typeof text !== "string") {
    return "";
  }
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "";
  }
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (!sentences.length) {
    return cleaned;
  }
  if (sentences.length === 1 && cleaned.length <= 60) {
    return cleaned;
  }
  return `• ${sentences.join(" • ")}`;
}

function buildInsightSettingsKey(settings) {
  const productive = Array.isArray(settings?.productiveSites)
    ? [...settings.productiveSites].sort().join(",")
    : "";
  const distracting = Array.isArray(settings?.distractingSites)
    ? [...settings.distractingSites].sort().join(",")
    : "";
  const overrides = settings?.categoryOverrides || {};
  const overridesKey = Object.entries(overrides)
    .map(([pattern, category]) => `${pattern}=${category}`)
    .sort()
    .join("|");
  return [productive, distracting, overridesKey].join("::");
}

function getInsightSettingsKey() {
  if (!app.cache.insightSettingsKey) {
    app.cache.insightSettingsKey = buildInsightSettingsKey(app.settings);
  }
  return app.cache.insightSettingsKey;
}

function classifyCalloutTone(message) {
  const lower = message.toLowerCase();
  if (
    lower.includes("focus") ||
    lower.includes("steady") ||
    lower.includes("productive") ||
    lower.includes("study") ||
    lower.includes("calm")
  ) {
    return "focus";
  }
  if (
    lower.includes("distraction") ||
    lower.includes("wander") ||
    lower.includes("loop") ||
    lower.includes("drift") ||
    lower.includes("scroll") ||
    lower.includes("rabbit")
  ) {
    return "distraction";
  }
  return "neutral";
}

function handleToastAction() {
  if (typeof toastActionHandler === "function") {
    toastActionHandler();
  }
}

function toastActionNoop() {}

function consumeForceRefreshFlag() {
  try {
    const value = localStorage.getItem(FORCE_REFRESH_KEY);
    if (!value) {
      return false;
    }
    localStorage.removeItem(FORCE_REFRESH_KEY);
    return true;
  } catch (error) {
    return false;
  }
}

function bindControls() {
  bindHelpIcons();
  bindRankToggles();
  if (elements.sessionSelect) {
    elements.sessionSelect.addEventListener("change", () => {
      const sessionId = elements.sessionSelect.value;
      selectSession(sessionId, { forceRefresh: true, userInitiated: true });
    });
  }

  if (elements.toastAction) {
    elements.toastAction.addEventListener("click", handleToastAction);
  }



  if (elements.sessionDelete) {
    elements.sessionDelete.addEventListener("click", () => {
      const sessionId = app.session?.id;
      if (!sessionId) {
        return;
      }
      if (typeof confirm === "function" && !confirm("Delete this session?")) {
        return;
      }
      if (app.settings.realtimeOptimisticUi) {
        applyOptimisticDelete(sessionId);
      }
      sendSessionAction("session_delete", sessionId);
      scheduleRealtimeReconcile();
      showToast(
        "Session deleted.",
        "Undo",
        () => {
          if (app.settings.realtimeOptimisticUi) {
            applyOptimisticRestore(sessionId);
          }
          sendSessionAction("session_restore", sessionId);
          scheduleRealtimeReconcile();
          showToast("Delete undone.");
        },
      );
    });
  }
  if (elements.sessionFilterFavorites) {
    elements.sessionFilterFavorites.addEventListener("change", () => {
      app.sessionFilterFavoritesOnly =
        elements.sessionFilterFavorites.checked;
      populateSessionList();
    });
  }
  if (elements.sessionDatePicker) {
    elements.sessionDatePicker.addEventListener("change", () => {
      const key = elements.sessionDatePicker.value;
      if (!key) {
        return;
      }
      const session = findSessionByDateKey(key);
      if (!session) {
        showToast(`No session for ${formatDateKeyForDisplay(key)}.`);
        return;
      }
      if (app.sessionFilterFavoritesOnly && !session.favorite) {
        app.sessionFilterFavoritesOnly = false;
        if (elements.sessionFilterFavorites) {
          elements.sessionFilterFavorites.checked = false;
        }
        populateSessionList();
      }
      selectSession(session.id, { forceRefresh: true, userInitiated: true });
    });
  }
  if (elements.sessionList) {
    elements.sessionList.addEventListener("keydown", handleSessionListKeydown);
  }
  if (elements.settingsForm) {
    elements.settingsForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveSettings();
    });
    elements.settingsForm.addEventListener("input", () => {
      updateSettingsPreview(collectSettingsFromForm());
      scheduleSettingsSave();
    });
    elements.settingsForm.addEventListener("change", () => {
      scheduleSettingsSave();
    });
  }

  if (elements.graphToggles && elements.graphToggles.length) {
    elements.graphToggles.forEach((button) => {
      button.addEventListener("click", () => {
        elements.graphToggles.forEach((btn) => btn.classList.remove("active"));
        button.classList.add("active");
        app.mode = button.dataset.mode || "domain";
        applyGraphSettings({ ...app.graphSettings, mode: app.mode });
        scheduleFrameRender("graph", renderGraph);
      });
    });
  }

  if (elements.graphSearch) {
    elements.graphSearch.addEventListener("input", () => {
      applyGraphSettings({
        ...app.graphSettings,
        search: elements.graphSearch.value || "",
      });
    });
  }
  if (elements.graphNodeCap) {
    elements.graphNodeCap.addEventListener("input", () => {
      applyGraphSettings({
        ...app.graphSettings,
        nodeCap: Number(elements.graphNodeCap.value),
      });
    });
  }
  if (elements.graphMinActive) {
    elements.graphMinActive.addEventListener("input", () => {
      applyGraphSettings({
        ...app.graphSettings,
        minNodeMinutes: Number(elements.graphMinActive.value),
      });
    });
  }
  if (elements.graphMinEdge) {
    elements.graphMinEdge.addEventListener("input", () => {
      applyGraphSettings({
        ...app.graphSettings,
        minEdgeCount: Number(elements.graphMinEdge.value),
      });
    });
  }
  if (elements.graphColorBy) {
    elements.graphColorBy.addEventListener("change", () => {
      applyGraphSettings({
        ...app.graphSettings,
        colorBy: elements.graphColorBy.value,
      });
    });
  }
  if (elements.graphShowLabels) {
    elements.graphShowLabels.addEventListener("change", () => {
      applyGraphSettings({
        ...app.graphSettings,
        showLabels: elements.graphShowLabels.checked,
      });
    });
  }
  if (elements.graphHideIsolates) {
    elements.graphHideIsolates.addEventListener("change", () => {
      applyGraphSettings({
        ...app.graphSettings,
        hideIsolates: elements.graphHideIsolates.checked,
      });
    });
  }
  if (elements.graphFreeze) {
    elements.graphFreeze.addEventListener("change", () => {
      applyGraphSettings({
        ...app.graphSettings,
        freeze: elements.graphFreeze.checked,
      });
      if (app.graph) {
        app.graph.setFreeze(!!app.graphSettings.freeze);
        app.graph.draw();
      }
    });
  }
  if (elements.graphReset) {
    elements.graphReset.addEventListener("click", () => {
      if (app.graph) {
        app.graph.resetView();
        app.graph.run();
      }
    });
  }

  if (elements.summaryRefresh) {
    elements.summaryRefresh.addEventListener("click", () => {
      refreshSummaries({ force: true });
    });
  }

  if (elements.openSettings) {
    elements.openSettings.addEventListener("click", () => {
      if (chrome?.runtime?.openOptionsPage) {
        chrome.runtime.openOptionsPage();
        return;
      }
      if (chrome?.tabs?.create) {
        const url = chrome.runtime?.getURL
          ? chrome.runtime.getURL("dashboard/settings.html")
          : "dashboard/settings.html";
        chrome.tabs.create({ url });
      }
    });
  }

  if (elements.openDashboard) {
    elements.openDashboard.addEventListener("click", () => {
      if (chrome?.tabs?.create) {
        const url = chrome.runtime?.getURL
          ? chrome.runtime.getURL("dashboard/index.html")
          : "dashboard/index.html";
        chrome.tabs.create({ url });
      }
    });
  }

  if (elements.viewTabs && elements.viewTabs.length) {
    elements.viewTabs.forEach((button) => {
      button.addEventListener("click", () => {
        const nextView = button.dataset.view || "overview";
        setView(nextView);
      });
    });
  }

  if (elements.deepTabs && elements.deepTabs.length) {
    elements.deepTabs.forEach((button) => {
      button.addEventListener("click", () => {
        const nextTab = button.dataset.deep || "timeline";
        setDeepDiveTab(nextTab);
      });
    });
  }

  if (elements.exportData) {
    elements.exportData.addEventListener("click", () => {
      exportSessionData();
    });
  }

  if (elements.deleteAllSessions) {
    elements.deleteAllSessions.addEventListener("click", () => {
      if (!confirm("Delete all sessions? This cannot be undone.")) {
        return;
      }
      if (app.settings.realtimeOptimisticUi) {
        applyOptimisticDeleteAll();
      }
      sendSessionAction("session_delete_all");
      scheduleRealtimeReconcile();
      showToast("All sessions deleted.");
    });
  }

  if (elements.resetState) {
    elements.resetState.addEventListener("click", () => {
      if (!confirm("Reset tracker state? This clears all saved sessions.")) {
        return;
      }
      sendSessionAction("reset_state");
      showToast("Tracker reset.");
    });
  }

  if (elements.resetSettings) {
    elements.resetSettings.addEventListener("click", () => {
      resetSettingsToDefault();
    });
  }

  if (elements.undoSettings) {
    elements.undoSettings.addEventListener("click", () => {
      restoreUndoSettings();
    });
  }
}

function sanitizeGraphSettings(settings) {
  const next = { ...GRAPH_DEFAULTS, ...(settings || {}) };
  next.mode = next.mode === "page" ? "page" : "domain";
  next.nodeCap = clampNumber(next.nodeCap, 20, 200, GRAPH_DEFAULTS.nodeCap);
  next.minNodeMinutes = clampNumber(
    next.minNodeMinutes,
    0,
    60,
    GRAPH_DEFAULTS.minNodeMinutes,
  );
  next.minEdgeCount = clampNumber(
    next.minEdgeCount,
    1,
    12,
    GRAPH_DEFAULTS.minEdgeCount,
  );
  next.showLabels = !!next.showLabels;
  next.hideIsolates = !!next.hideIsolates;
  next.freeze = !!next.freeze;
  next.colorBy = ["activity", "category", "domain"].includes(next.colorBy)
    ? next.colorBy
    : GRAPH_DEFAULTS.colorBy;
  next.search = typeof next.search === "string" ? next.search.trim() : "";
  return next;
}

function loadGraphSettings() {
  try {
    const raw = localStorage.getItem(GRAPH_SETTINGS_KEY);
    if (!raw) {
      return sanitizeGraphSettings(GRAPH_DEFAULTS);
    }
    return sanitizeGraphSettings(JSON.parse(raw));
  } catch (error) {
    return sanitizeGraphSettings(GRAPH_DEFAULTS);
  }
}

function saveGraphSettings(settings) {
  try {
    localStorage.setItem(GRAPH_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    // Ignore storage errors.
  }
}

function applyGraphSettings(settings) {
  const sanitized = sanitizeGraphSettings(settings);
  app.graphSettings = sanitized;
  app.mode = sanitized.mode;
  saveGraphSettings(sanitized);
  updateGraphControls();
  scheduleFrameRender("graph", renderGraph);
}

function updateGraphControls() {
  const settings = app.graphSettings || GRAPH_DEFAULTS;
  if (elements.graphSearch) {
    elements.graphSearch.value = settings.search || "";
  }
  if (elements.graphNodeCap) {
    elements.graphNodeCap.value = String(settings.nodeCap);
  }
  if (elements.graphNodeCapValue) {
    elements.graphNodeCapValue.textContent = String(settings.nodeCap);
  }
  if (elements.graphMinActive) {
    elements.graphMinActive.value = String(settings.minNodeMinutes);
  }
  if (elements.graphMinActiveValue) {
    elements.graphMinActiveValue.textContent = `${settings.minNodeMinutes}m`;
  }
  if (elements.graphMinEdge) {
    elements.graphMinEdge.value = String(settings.minEdgeCount);
  }
  if (elements.graphMinEdgeValue) {
    elements.graphMinEdgeValue.textContent = String(settings.minEdgeCount);
  }
  if (elements.graphColorBy) {
    elements.graphColorBy.value = settings.colorBy;
  }
  if (elements.graphShowLabels) {
    elements.graphShowLabels.checked = settings.showLabels;
  }
  if (elements.graphHideIsolates) {
    elements.graphHideIsolates.checked = settings.hideIsolates;
  }
  if (elements.graphFreeze) {
    elements.graphFreeze.checked = settings.freeze;
  }
  if (elements.graphToggles && elements.graphToggles.length) {
    elements.graphToggles.forEach((toggle) => {
      toggle.classList.toggle("active", toggle.dataset.mode === settings.mode);
    });
  }
}

function bindRankToggles() {
  document.querySelectorAll(".rank-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.target;
      if (!targetId) {
        return;
      }
      const list = document.getElementById(targetId);
      if (!list) {
        return;
      }
      const collapsed = list.dataset.collapsed !== "false";
      list.dataset.collapsed = collapsed ? "false" : "true";
      updateRankListVisibility(list);
    });
  });
}

function bindHelpIcons() {
  const helpIcons = Array.from(document.querySelectorAll(".help-icon"));
  if (!helpIcons.length) {
    return;
  }

  const closeAll = (except) => {
    helpIcons.forEach((button) => {
      if (button === except) {
        return;
      }
      button.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
    });
  };

  helpIcons.forEach((button) => {
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const willOpen = !button.classList.contains("is-open");
      closeAll(button);
      button.classList.toggle("is-open", willOpen);
      button.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
    button.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }
      button.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
      button.blur();
    });
  });

  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest(".help-icon")) {
      return;
    }
    closeAll();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindControls);
} else {
  bindControls();
}

function normalizeState(raw) {
  if (!raw) {
    return null;
  }
  if (raw.schemaVersion === 4 && raw.compactTables && raw.urlTable) {
    const decoded = decodeCompactState(raw);
    applyStateDefaults(decoded);
    return decoded;
  }
  if (raw.schemaVersion === 4 && raw.sessions) {
    applyStateDefaults(raw);
    return raw;
  }
  if (raw.schemaVersion === 3 && raw.sessions) {
    applyStateDefaults(raw);
    return raw;
  }
  if (raw.schemaVersion === 2 && raw.sessions) {
    applyStateDefaults(raw);
    return raw;
  }
  if (raw.schemaVersion === 1 && raw.session) {
    return migrateState(raw);
  }
  if (raw.sessions) {
    raw.schemaVersion = 3;
    applyStateDefaults(raw);
    return raw;
  }
  if (raw.session) {
    return migrateState({
      schemaVersion: 1,
      session: raw.session,
      tabs: raw.tabs,
      tracking: raw.tracking,
    });
  }
  return null;
}

function decodeCompactState(raw) {
  const urlTable = Array.isArray(raw.urlTable) ? raw.urlTable : [];
  const sessions = {};
  Object.values(raw.sessions || {}).forEach((session) => {
    const decoded = { ...session };
    const nodes = {};
    (session.nodes || []).forEach((node) => {
      const url = urlTable[node.urlId] || node.url || "";
      if (!url) {
        return;
      }
      nodes[url] = {
        id: url,
        url,
        title: node.title || "",
        category: node.category || "Random",
        visitCount: node.visitCount || 0,
        activeMs: node.activeMs || 0,
        firstNavigationIndex: node.firstNavigationIndex ?? null,
        lastNavigationIndex: node.lastNavigationIndex ?? null,
        firstSeen: node.firstSeen || 0,
        lastSeen: node.lastSeen || 0,
        distractionScore: node.distractionScore || 0,
        distractionComponents: node.distractionComponents || null,
      };
    });
    const edges = {};
    (session.edges || []).forEach((edge) => {
      const from = urlTable[edge.fromId] || edge.from;
      const to = urlTable[edge.toId] || edge.to;
      if (!from || !to) {
        return;
      }
      const id = `${from} -> ${to}`;
      edges[id] = {
        id,
        from,
        to,
        visitCount: edge.visitCount || 0,
        activeMs: edge.activeMs || 0,
        firstSeen: edge.firstSeen || 0,
        lastSeen: edge.lastSeen || 0,
      };
    });
    const trapDoors = (session.trapDoors || []).map((trap) => ({
      ...trap,
      url: urlTable[trap.urlId] || trap.url || null,
    }));
    decoded.nodes = nodes;
    decoded.edges = edges;
    decoded.trapDoors = trapDoors;
    decoded.eventCursor =
      typeof session.eventCursor === "number"
        ? session.eventCursor
        : Array.isArray(session.events)
          ? session.events.length
          : 0;
    decoded.eventCount =
      typeof session.eventCount === "number"
        ? session.eventCount
        : Array.isArray(session.events)
          ? session.events.length
          : 0;
    sessions[session.id] = decoded;
  });
  return {
    schemaVersion: 4,
    sessions,
    sessionOrder: raw.sessionOrder || [],
    activeSessionId: raw.activeSessionId || null,
    tabs: raw.tabs || {},
    tracking: raw.tracking || {},
    syncMeta: raw.syncMeta,
  };
}

function migrateState(oldState) {
  const timestamp = Date.now();
  const session = {
    ...oldState.session,
    endedAt: null,
    endReason: null,
    lastActivityAt:
      oldState.session?.updatedAt || oldState.session?.startedAt || timestamp,
    navigationCount: Object.values(oldState.session?.edges || {}).reduce(
      (sum, edge) => sum + (edge.visitCount || 0),
      0,
    ),
    trapDoors: [],
  };

  if (!session.id) {
    session.id = crypto.randomUUID();
  }

  Object.values(session.nodes || {}).forEach((node) => {
    if (node.firstNavigationIndex === undefined) {
      node.firstNavigationIndex = null;
    }
    if (node.lastNavigationIndex === undefined) {
      node.lastNavigationIndex = null;
    }
  });

  const state = {
    schemaVersion: 4,
    sessions: { [session.id]: session },
    sessionOrder: [session.id],
    activeSessionId: session.id,
    tabs: oldState.tabs || {},
    tracking: { ...createDefaultTracking(), ...(oldState.tracking || {}) },
  };
  applyStateDefaults(state);
  return state;
}

function applyStateDefaults(state) {
  if (!state.sessions || typeof state.sessions !== "object") {
    state.sessions = {};
  }
  if (!Array.isArray(state.sessionOrder)) {
    state.sessionOrder = [];
  }
  if (!state.sessionOrder.length) {
    const sessions = Object.values(state.sessions || {});
    sessions.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
    state.sessionOrder = sessions.map((session) => session.id);
  }
  if (!state.activeSessionId && state.sessionOrder.length > 0) {
    state.activeSessionId = state.sessionOrder[state.sessionOrder.length - 1];
  }
  state.tracking = { ...createDefaultTracking(), ...(state.tracking || {}) };
  Object.values(state.sessions || {}).forEach((session) =>
    applySessionDefaults(session),
  );
}

function createDefaultTracking() {
  return {
    activeTabId: null,
    activeUrl: null,
    activeEdgeKey: null,
    activeSince: null,
    lastInteractionAt: null,
    userIdle: true,
    lastInactiveAt: null,
  };
}

function applySessionDefaults(session) {
  if (!session || typeof session !== "object") {
    return;
  }
  if (session.archived === undefined) {
    session.archived = false;
  }
  if (session.archivedAt === undefined) {
    session.archivedAt = null;
  }
  if (session.deleted === undefined) {
    session.deleted = false;
  }
  if (session.deletedAt === undefined) {
    session.deletedAt = null;
  }
  if (session.favorite === undefined) {
    session.favorite = false;
  }
  if (session.favoriteAt === undefined) {
    session.favoriteAt = null;
  }
  if (!Array.isArray(session.events)) {
    session.events = [];
  }
  if (session.eventCursor === undefined) {
    session.eventCursor = session.events.length;
  }
  if (session.eventCount === undefined) {
    session.eventCount = session.events.length;
  }
  if (!session.nodes || typeof session.nodes !== "object") {
    session.nodes = {};
  }
  if (!session.edges || typeof session.edges !== "object") {
    session.edges = {};
  }
  if (!session.trapDoors) {
    session.trapDoors = [];
  }
  if (!session.categoryTotals) {
    session.categoryTotals = {};
  }
  if (session.distractionAverage === undefined) {
    session.distractionAverage = 0;
  }
  if (session.label === undefined) {
    session.label = null;
  }
  if (session.labelDetail === undefined) {
    session.labelDetail = null;
  }
  if (session.intentDriftScore === undefined) {
    session.intentDriftScore = 0;
  }
  if (session.intentDriftLabel === undefined) {
    session.intentDriftLabel = "Unknown";
  }
  if (session.intentDriftReason === undefined) {
    session.intentDriftReason = "Not enough data yet.";
  }
  if (session.intentDriftConfidence === undefined) {
    session.intentDriftConfidence = "low";
  }
  if (session.intentDriftDrivers === undefined) {
    session.intentDriftDrivers = [];
  }
  if (session.firstActivityAt === undefined) {
    session.firstActivityAt = null;
  }
  if (session.summaryBrief === undefined) {
    session.summaryBrief = "";
  }
  if (session.summaryDetailed === undefined) {
    session.summaryDetailed = "";
  }
  if (session.summaryUpdatedAt === undefined) {
    session.summaryUpdatedAt = 0;
  }
  if (
    session.navigationCount === undefined ||
    session.navigationCount === null
  ) {
    session.navigationCount = Object.values(session.edges || {}).reduce(
      (sum, edge) => sum + (edge.visitCount || 0),
      0,
    );
  }
  Object.values(session.nodes || {}).forEach((node) => {
    if (node.firstNavigationIndex === undefined) {
      node.firstNavigationIndex = null;
    }
    if (node.lastNavigationIndex === undefined) {
      node.lastNavigationIndex = null;
    }
  });
}

function populateSessionSelect() {
  if (!elements.sessionSelect) {
    return;
  }
  elements.sessionSelect.innerHTML = "";
  const sessions = app.state?.sessionOrder
    ? app.state.sessionOrder.map((id) => app.state.sessions[id]).filter(Boolean)
    : [];
  const visible = sessions.filter((session) => session && !session.deleted);

  if (!visible.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No sessions yet";
    elements.sessionSelect.appendChild(option);
    return;
  }

  visible.forEach((session) => {
    const option = document.createElement("option");
    option.value = session.id;
    option.textContent = formatSessionLabel(session);
    elements.sessionSelect.appendChild(option);
  });
}

function populateSessionList() {
  if (!elements.sessionList) {
    return;
  }
  const data = getSessionListData();
  if (!data.ordered.length) {
    elements.sessionList.innerHTML = "";
    app.cache.sessionListRenderKey = null;
    if (elements.sessionListEmpty) {
      elements.sessionListEmpty.hidden = false;
    }
    return;
  }
  if (elements.sessionListEmpty) {
    elements.sessionListEmpty.hidden = true;
  }
  elements.sessionList.dataset.style = data.listStyle;
  const pinActiveSession =
    app.settings?.pinActiveSession ?? DEFAULT_SETTINGS.pinActiveSession;
  const activeId = app.state?.activeSessionId || data.ordered.find((session) => !session.endedAt)?.id || null;
  if (pinActiveSession && app.cache.sessionListAutoScrollId !== activeId) {
    app.cache.sessionListAutoScrollId = activeId;
    app.cache.sessionListAutoScrollDone = false;
  }
  if (!pinActiveSession) {
    app.cache.sessionListAutoScrollId = null;
    app.cache.sessionListAutoScrollDone = false;
  }
  renderSessionListWindow();
  // Session list renders fully; no scroll-window virtualization.
}

function getSessionListData() {
  const listStyle = app.settings?.sessionListStyle || "cards";
  const limit =
    app.settings?.sessionListLimit || DEFAULT_SETTINGS.sessionListLimit;
  const pinActiveSession =
    app.settings?.pinActiveSession ?? DEFAULT_SETTINGS.pinActiveSession;
  const favoritesOnly = !!app.sessionFilterFavoritesOnly;
  const resolvedActiveId = app.state?.activeSessionId || "";
  const sessions = app.state?.sessionOrder
    ? app.state.sessionOrder.map((id) => app.state.sessions[id]).filter(Boolean)
    : [];
  const visible = sessions.filter(
    (session) =>
      session &&
      !session.deleted &&
      (!favoritesOnly || session.favorite === true),
  );
  if (resolvedActiveId && app.state?.sessions?.[resolvedActiveId]) {
    const activeSession = app.state.sessions[resolvedActiveId];
    if (
      !visible.some((session) => session.id === resolvedActiveId) &&
      (!favoritesOnly || activeSession.favorite === true)
    ) {
      visible.push(activeSession);
    }
  }
  const ordered = [...visible].sort(
    (a, b) => (b.startedAt || 0) - (a.startedAt || 0),
  );
  let activeId = resolvedActiveId;
  if (!activeId) {
    const activeSession = ordered.find((session) => !session.endedAt) || null;
    activeId = activeSession?.id || "";
  }
  if (activeId && pinActiveSession) {
    const activeIndex = ordered.findIndex(
      (session) => session.id === activeId,
    );
    if (activeIndex > 0) {
      const [active] = ordered.splice(activeIndex, 1);
      ordered.unshift(active);
    }
  }
  const trimmed = ordered.slice(0, limit).map((session) => {
    if (session.id !== activeId && !session.endedAt) {
      return {
        ...session,
        _displayEndAt:
          session.lastActivityAt || session.updatedAt || session.startedAt || 0,
      };
    }
    return { ...session, _displayEndAt: session.endedAt || null };
  });
  const renderKey = trimmed
    .map(
      (session) =>
        `${session.id}:${session._displayEndAt || 0}:${
          session.favorite ? 1 : 0
        }`,
    )
    .join("|");
  const key = [
    listStyle,
    limit,
    activeId,
    favoritesOnly ? "fav" : "all",
    renderKey,
  ].join("|");
  if (app.cache.sessionListKey === key && app.cache.sessionListData) {
    return app.cache.sessionListData;
  }
  const data = { ordered: trimmed, listStyle, renderKey, favoritesOnly };
  app.cache.sessionListKey = key;
  app.cache.sessionListData = data;
  return data;
}

function scheduleSessionListRender() {
  if (sessionListRenderTimer) {
    return;
  }
  sessionListRenderTimer = requestAnimationFrame(() => {
    sessionListRenderTimer = null;
    renderSessionListWindow();
  });
}

function renderSessionListWindow() {
  if (!elements.sessionList || !app.cache.sessionListData) {
    return;
  }
  if (app.cache.sessionListRenderKey === app.cache.sessionListData.renderKey) {
    updateSessionListSelection();
    return;
  }
  const { ordered, listStyle } = app.cache.sessionListData;
  if (elements.sessionListEmpty) {
    elements.sessionListEmpty.hidden = ordered.length > 0;
  }
  const container = elements.sessionList;
  if (!app.cache.sessionListAutoScrollDone && app.cache.sessionListAutoScrollId) {
    const activeIndex = ordered.findIndex(
      (session) => session.id === app.cache.sessionListAutoScrollId,
    );
    if (activeIndex >= 0) {
      container.scrollTop = Math.max(0, activeIndex * SESSION_LIST_ITEM_ESTIMATE);
      app.cache.sessionListAutoScrollDone = true;
    }
  }

  container.innerHTML = "";
  const fragment = document.createDocumentFragment();
  ordered.forEach((session, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "session-card";
    button.dataset.sessionId = session.id;
    button.style.setProperty("--i", String(index));
    button.setAttribute("role", "option");
    const title = document.createElement("span");
    title.className = "session-title";
    title.textContent = formatSessionLabel(session);
    const favorite = document.createElement("button");
    favorite.type = "button";
    favorite.className = "session-favorite";
    favorite.dataset.favorite = session.favorite ? "true" : "false";
    favorite.setAttribute(
      "aria-pressed",
      session.favorite ? "true" : "false",
    );
    favorite.setAttribute(
      "aria-label",
      session.favorite ? "Remove from favorites" : "Save to favorites",
    );
    favorite.textContent = session.favorite ? "★" : "☆";
    const head = document.createElement("div");
    head.className = "session-card-head";
    head.appendChild(title);
    head.appendChild(favorite);
    button.appendChild(head);
    const metaText = buildSessionMeta(session);
    if (metaText) {
      const meta = document.createElement("span");
      meta.className = "session-meta";
      meta.textContent = metaText;
      button.appendChild(meta);
    }
    favorite.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nextFavorite = !session.favorite;
      sendSessionAction("session_favorite_toggle", session.id);
      scheduleRealtimeReconcile();
      if (!app.settings.realtimeOptimisticUi) {
        return;
      }
      session.favorite = nextFavorite;
      session.favoriteAt = nextFavorite ? Date.now() : null;
      if (app.state?.sessions?.[session.id]) {
        app.state.sessions[session.id].favorite = nextFavorite;
        app.state.sessions[session.id].favoriteAt = session.favoriteAt;
      }
      if (app.sessionFilterFavoritesOnly && !nextFavorite) {
        app.cache.sessionListRenderKey = null;
        populateSessionList();
        return;
      }
      favorite.dataset.favorite = nextFavorite ? "true" : "false";
      favorite.setAttribute(
        "aria-pressed",
        nextFavorite ? "true" : "false",
      );
      favorite.setAttribute(
        "aria-label",
        nextFavorite ? "Remove from favorites" : "Save to favorites",
      );
      favorite.textContent = nextFavorite ? "★" : "☆";
    });
    button.addEventListener("click", () =>
      selectSession(session.id, { forceRefresh: true, userInitiated: true }),
    );
    fragment.appendChild(button);
  });
  container.appendChild(fragment);
  app.cache.sessionListRenderKey = app.cache.sessionListData.renderKey;

  updateSessionListSelection();
}

function updateSessionListSelection() {
  if (!elements.sessionList) {
    return;
  }
  const activeId = app.session?.id;
  elements.sessionList.querySelectorAll("[data-session-id]").forEach((node) => {
    const isActive = node.dataset.sessionId === activeId;
    node.classList.toggle("active", isActive);
    node.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

function handleSessionListKeydown(event) {
  const key = event.key;
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(key)) {
    return;
  }
  if (!app.cache.sessionListData || !app.cache.sessionListData.ordered.length) {
    return;
  }
  const ordered = app.cache.sessionListData.ordered;
  const currentId = app.session?.id || ordered[0].id;
  let index = ordered.findIndex((session) => session.id === currentId);
  if (index < 0) {
    index = 0;
  }
  if (key === "ArrowDown") {
    index = Math.min(ordered.length - 1, index + 1);
  } else if (key === "ArrowUp") {
    index = Math.max(0, index - 1);
  } else if (key === "Home") {
    index = 0;
  } else if (key === "End") {
    index = ordered.length - 1;
  }
  const next = ordered[index];
  if (next) {
    selectSession(next.id, { forceRefresh: false, userInitiated: true });
    const target = elements.sessionList.querySelector(
      `[data-session-id="${next.id}"]`,
    );
    if (target) {
      target.focus();
    }
    event.preventDefault();
  }
}

function selectSession(sessionId, options = {}) {
  if (!app.state) {
    return;
  }
  const forceRefresh = !!options.forceRefresh;
  const userInitiated = !!options.userInitiated;
  const previousId = app.session?.id || null;
  const resolvedId = sessionId || app.state.activeSessionId;
  let session = resolvedId ? app.state.sessions[resolvedId] : null;
  if (session?.deleted) {
    session = null;
  }
  if (!session) {
    const fallback = app.state.sessionOrder
      .map((id) => app.state.sessions[id])
      .find((item) => item && !item.deleted);
    session = fallback || null;
  }
  if (!session) {
    app.session = null;
    renderEmptyDashboard();
    return;
  }
  app.session = session;
  updateLiveActiveBase(session);
  if (userInitiated) {
    app.followActiveSession = session.id === app.state.activeSessionId;
  }
  if (previousId !== session.id) {
    app.graphWarm = false;
  }
  if (elements.sessionSelect) {
    elements.sessionSelect.value = session.id;
  }
  if (forceRefresh) {
    app.forceSummaryRefresh = true;
  }
  updateSessionListSelection();
  renderDashboard();
}

function applyState(nextState, source) {
  const normalized = normalizeState(nextState);
  if (!normalized || !hasSessions(normalized)) {
    app.state = null;
    app.session = null;
    setLiveIndicator(source === "sync" ? "sync" : "offline");
    renderEmptyDashboard();
    return;
  }
  const previousSelectionId = app.session?.id || null;
  app.state = normalized;
  if (realtimeReconcileTimer) {
    clearTimeout(realtimeReconcileTimer);
    realtimeReconcileTimer = null;
  }
  app.stateRevision += 1;
  app.cache.sessionListKey = "";
  populateSessionSelect();
  populateSessionList();
  let targetSessionId = normalized.activeSessionId;
  if (app.followActiveSession === false && previousSelectionId) {
    const previousSession = normalized.sessions?.[previousSelectionId];
    if (previousSession && !previousSession.deleted) {
      targetSessionId = previousSelectionId;
    } else {
      app.followActiveSession = true;
    }
  }
  selectSession(targetSessionId, { forceRefresh: false });
  setLiveIndicator(source === "sync" ? "sync" : "live");
}

function renderEmptyDashboard() {
  renderOverviewEmpty();
  if (elements.sessionList) {
    elements.sessionList.innerHTML = "";
  }
  if (elements.sessionListEmpty) {
    const hasSessions = !!app.state?.sessionOrder?.length;
    elements.sessionListEmpty.hidden = hasSessions;
  }
  if (elements.sessionRange) {
    elements.sessionRange.textContent = "-";
  }
  if (elements.totalActive) {
    elements.totalActive.textContent = "-";
  }
  if (elements.pageCount) {
    elements.pageCount.textContent = "-";
  }
  if (elements.edgeCount) {
    elements.edgeCount.textContent = "-";
  }
  if (elements.timelineStart) {
    elements.timelineStart.textContent = "-";
  }
  if (elements.timelineEnd) {
    elements.timelineEnd.textContent = "-";
  }
  if (elements.timelineTrack) {
    elements.timelineTrack.innerHTML =
      '<div class="timeline-empty">No live data yet.</div>';
  }
  if (elements.timelineLegend) {
    elements.timelineLegend.innerHTML = "";
  }
  if (elements.graphEmpty) {
    elements.graphEmpty.style.display = "grid";
  }
  if (app.graph) {
    app.graph.setData({ nodes: [], edges: [] });
  }
  if (elements.deepestChain) {
    elements.deepestChain.textContent = "-";
  }
  if (elements.deepestChainDetail) {
    elements.deepestChainDetail.textContent = "";
  }
  if (elements.commonStart) {
    elements.commonStart.textContent = "-";
  }
  if (elements.commonStartDetail) {
    elements.commonStartDetail.textContent = "";
  }
  if (elements.trapDoor) {
    elements.trapDoor.textContent = "-";
  }
  if (elements.trapDoorDetail) {
    elements.trapDoorDetail.textContent = "";
  }
  if (elements.sessionLabel) {
    elements.sessionLabel.textContent = "-";
  }
  if (elements.sessionLabelDetail) {
    elements.sessionLabelDetail.textContent = "";
  }
  renderRankList(elements.topDomains, []);
  renderRankList(elements.topPages, []);
  renderRankList(elements.topDistractions, []);
  if (elements.damageReceipts) {
    elements.damageReceipts.innerHTML = "";
    const item = document.createElement("li");
    item.textContent = "No moments yet.";
    elements.damageReceipts.appendChild(item);
  }
  if (elements.pathStart) {
    elements.pathStart.textContent = "-";
    elements.pathStart.classList.add("dim");
  }
  if (elements.pathTrap) {
    elements.pathTrap.textContent = "-";
    elements.pathTrap.classList.add("dim");
  }
  if (elements.pathEnd) {
    elements.pathEnd.textContent = "-";
    elements.pathEnd.classList.add("dim");
  }
  if (elements.pathMeta) {
    elements.pathMeta.textContent = "";
  }
  if (elements.calloutsList) {
    elements.calloutsList.innerHTML = "";
    const item = document.createElement("li");
    item.textContent = "No notes yet.";
    elements.calloutsList.appendChild(item);
  }
}

function renderDashboard() {
  if (!document.body.classList.contains("dashboard-page")) {
    return;
  }
  applyDashboardVisibility(app.settings);
  const sections =
    app.settings?.dashboardSections || DEFAULT_SETTINGS.dashboardSections;
  if (sections.overview) {
    renderOverview();
  } else {
    renderOverviewEmpty();
  }
  renderStatus();
  if (sections.timeline) {
    scheduleFrameRender("timeline", renderTimeline);
  }
  if (sections.graph && app.deepTab === "graph") {
    scheduleFrameRender("graph", renderGraph);
  }
  if (sections.stats) {
    scheduleFrameRender("stats", renderStats);
  }
  if (sections.honesty) {
    renderHonesty();
  }
}

function setView(nextView) {
  app.view = nextView;
  elements.viewTabs.forEach((tab) => {
    const isActive = tab.dataset.view === nextView;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  elements.viewPanels.forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== nextView;
  });
}

function setDeepDiveTab(nextTab) {
  app.deepTab = nextTab;
  elements.deepTabs.forEach((tab) => {
    const isActive = tab.dataset.deep === nextTab;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
    tab.setAttribute("tabindex", isActive ? "0" : "-1");
  });
  elements.deepPanels.forEach((panel) => {
    panel.hidden = panel.dataset.deepPanel !== nextTab;
  });
  if (nextTab === "graph") {
    app.graphReady = true;
    if (app.graph) {
      app.graph.resize();
    }
    scheduleFrameRender("graph", renderGraph);
  }
}

function renderOverview() {
  if (!app.session) {
    renderSummaryEmpty();
    return;
  }
  ensureSessionInsights(app.session);
  loadCachedSummaries(app.session);
  renderSummaryState();
  renderFocusNote();
  renderOverviewSummary(app.session);
  renderOverviewInsights(app.session);
  renderOverviewActions(app.session);
  const shouldForce = app.forceSummaryRefresh;
  const shouldAutoRefresh = !!app.settings.summaryAutoRefresh;
  app.forceSummaryRefresh = false;
  if (shouldForce) {
    scheduleSummaryRefresh({ force: true });
    return;
  }
  if (shouldAutoRefresh) {
    scheduleSummaryRefresh({ force: false });
  }
}

function loadCachedSummaries(session) {
  if (!session) {
    return;
  }
  if (app.summaryState.lastSessionId === session.id) {
    return;
  }
  const cacheMinutes = clampNumber(
    app.settings.summaryCacheMinutes,
    0,
    1440,
    0,
  );
  const ageMs = session.summaryUpdatedAt
    ? Date.now() - session.summaryUpdatedAt
    : 0;
  const expired = cacheMinutes > 0 && ageMs > cacheMinutes * 60 * 1000;
  app.summaryState.brief = expired ? "" : session.summaryBrief || "";
  app.summaryState.detailed = expired ? "" : session.summaryDetailed || "";
  app.summaryState.brief = coerceSummaryText(
    app.summaryState.brief,
    "brief",
    session,
  );
  app.summaryState.detailed = coerceSummaryText(
    app.summaryState.detailed,
    "detailed",
    session,
  );
  app.summaryState.lastSessionUpdatedAt =
    session.updatedAt || session.startedAt || 0;
}

function renderSummaryState() {
  if (elements.briefSummary) {
    const brief = app.summaryState.brief || "Gathering summary...";
    const formatted =
      brief === "Gathering summary..." || brief === "No session yet."
        ? brief
        : brief;
    elements.briefSummary.textContent = formatted;
  }
  if (elements.detailedSummary) {
    const detailed =
      app.summaryState.detailed || "Gathering detailed summary...";
    const formatted =
      detailed === "Gathering detailed summary..." ||
      detailed === "No detailed summary yet."
        ? detailed
        : detailed;
    elements.detailedSummary.textContent = formatted;
  }
  if (elements.summaryStatus) {
    elements.summaryStatus.textContent = app.summaryState.updating
      ? "Updating summary..."
      : app.summaryState.errorMessage || "";
  }
}

function renderSummaryEmpty() {
  app.summaryState.brief = "";
  app.summaryState.detailed = "";
  app.summaryState.updating = false;
  app.summaryState.lastSessionId = null;
  app.summaryState.errorMessage = "";
  if (elements.briefSummary) {
    elements.briefSummary.textContent = "No session yet.";
  }
  if (elements.detailedSummary) {
    elements.detailedSummary.textContent = "No detailed summary yet.";
  }
  if (elements.focusNote) {
    elements.focusNote.textContent = "";
    elements.focusNote.hidden = true;
  }
  if (elements.summaryStatus) {
    elements.summaryStatus.textContent = "";
  }
}

function renderOverviewSummary(session) {
  if (!elements.overviewSummary) {
    return;
  }
  if (!session) {
    elements.overviewSummary.textContent = "Session summary unavailable.";
    if (elements.overviewOrigin) {
      elements.overviewOrigin.textContent = "";
    }
    return;
  }
  const tracking = app.state?.tracking;
  const mirror = globalThis.IRHTInsights?.buildSessionMirror
    ? globalThis.IRHTInsights.buildSessionMirror(session, app.state || {}, {
        tone: app.settings.tone,
        tracking,
      })
    : null;
  if (mirror?.summary) {
    elements.overviewSummary.textContent = mirror.summary;
  } else if (session.label) {
    elements.overviewSummary.textContent = session.label;
  } else {
    elements.overviewSummary.textContent = "Session summary unavailable.";
  }
  if (elements.overviewOrigin) {
    elements.overviewOrigin.textContent = mirror?.origin || "";
  }
}

function renderOverviewInsights(session) {
  if (!elements.overviewInsights) {
    return;
  }
  elements.overviewInsights.innerHTML = "";
  if (!session || !session.nodes || !Object.keys(session.nodes).length) {
    if (elements.overviewInsightsEmpty) {
      elements.overviewInsightsEmpty.hidden = false;
      elements.overviewInsightsEmpty.textContent = "No insights yet.";
    }
    return;
  }
  const allInsights = getOverviewInsights(session, app.state || {});
  if (!allInsights || !allInsights.length) {
    if (elements.overviewInsightsEmpty) {
      elements.overviewInsightsEmpty.hidden = false;
      elements.overviewInsightsEmpty.textContent = "No insights yet.";
    }
    return;
  }
  if (elements.overviewInsightsEmpty) {
    elements.overviewInsightsEmpty.hidden = true;
  }
  const fragment = document.createDocumentFragment();
  allInsights.slice(0, 3).forEach((insight) => {
    const item = document.createElement("li");
    item.textContent = insight;
    fragment.appendChild(item);
  });
  elements.overviewInsights.appendChild(fragment);
}

function getOverviewInsights(session, state) {
  const insightKey = [
    session.updatedAt || 0,
    Object.keys(session.nodes || {}).length,
    getInsightSettingsKey(),
    app.settings.tone || "neutral",
    app.settings.showOutcomeHighlights ? "highlights" : "plain",
    app.settings.intentDriftAlerts ? "drift:on" : "drift:off",
  ].join("|");
  const cached = getBoundedCache(
    app.cache.overviewInsights,
    session.id,
    CACHE_LIMITS.overviewInsights,
  );
  if (cached && cached.key === insightKey) {
    return cached.data;
  }
  const derived = getDerivedSessionData(session);
  const priority = [];
  const topDomain = derived.topDomains[0];
  if (topDomain?.domain) {
    priority.push(
      `Top domain: ${topDomain.domain} - ${formatDuration(topDomain.activeMs)}.`,
    );
  }
  if (derived.deepestChain?.length > 1) {
    priority.push(`Deepest chain: ${derived.deepestChain.length} steps.`);
  }
  if (Number.isFinite(session.distractionAverage)) {
    priority.push(
      `Distraction score: ${formatScore(session.distractionAverage)}.`,
    );
  }
  if (app.settings.intentDriftAlerts) {
    const label = session.intentDriftLabel || "Unknown";
    if (label === "High" || label === "Medium") {
      const reason = session.intentDriftReason || "Intent drift detected.";
      const confidence = session.intentDriftConfidence || "low";
      const drivers = Array.isArray(session.intentDriftDrivers)
        ? session.intentDriftDrivers
        : [];
      const driverText = drivers.length ? ` Drivers: ${drivers.join(" ")}` : "";
      priority.push(
        `Intent drift: ${label} (${confidence} confidence) — ${reason}${driverText}`,
      );
    }
  }
  const hop = computeDomainHops(session);
  if (hop) {
    priority.push(hop);
  }
  const insights = globalThis.IRHTInsights?.generateInsights
    ? globalThis.IRHTInsights.generateInsights(session, state || {}, {
        tone: app.settings.tone,
      }).map((item) => (typeof item === "string" ? item : item?.text || ""))
    : [];
  const highlights = app.settings.showOutcomeHighlights
    ? buildOutcomeHighlights(session, state || {})
    : [];
  const allInsights = [...priority, ...insights, ...highlights]
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index);
  setBoundedCache(
    app.cache.overviewInsights,
    session.id,
    {
      key: insightKey,
      data: allInsights,
    },
    CACHE_LIMITS.overviewInsights,
  );
  return allInsights;
}

function computeDomainHops(session) {
  const events = getSessionEvents(session);
  if (!events.length) {
    return "";
  }
  const nowTs = Date.now();
  const windowMs = 10 * 60 * 1000;
  const cutoff = nowTs - windowMs;
  const recent = events.filter((event) => (event.ts || 0) >= cutoff);
  if (!recent.length) {
    return "";
  }
  const domains = new Set();
  recent.forEach((event) => {
    const url = event.toUrl || event.url || event.fromUrl;
    const domain = getDomain(url);
    if (domain) {
      domains.add(domain);
    }
  });
  if (domains.size >= 4) {
    return `Domain hopping: ${domains.size} sites / 10 min.`;
  }
  return "";
}

function buildOutcomeHighlights(session, state) {
  const previous = findPreviousSession(state, session);
  if (!previous) {
    return [];
  }
  const highlights = [];
  const currentActive = getSessionActiveMs(session, state?.tracking);
  const prevActive = getSessionActiveMs(previous, null);
  const delta = currentActive - prevActive;
  if (Math.abs(delta) >= 5 * 60 * 1000) {
    const direction = delta > 0 ? "up" : "down";
    highlights.push(
      `Active time is ${direction} ${formatDuration(Math.abs(delta))} from last session.`,
    );
  }
  const currentTop = getDerivedSessionData(session).topDomains[0]?.domain;
  const previousTop = getDerivedSessionData(previous).topDomains[0]?.domain;
  if (currentTop && previousTop && currentTop !== previousTop) {
    highlights.push(`Top domain shifted to ${currentTop}.`);
  } else if (currentTop && !previousTop) {
    highlights.push(`Top domain holds at ${currentTop}.`);
  }
  if (
    session.distractionAverage !== undefined &&
    previous.distractionAverage !== undefined
  ) {
    const diff = session.distractionAverage - previous.distractionAverage;
    if (Math.abs(diff) >= 0.3) {
      const direction = diff > 0 ? "higher" : "lower";
      highlights.push(`Distraction average is ${direction} this time.`);
    }
  }
  return highlights.slice(0, 3);
}

function buildRecommendedActions(session) {
  if (!session || !session.nodes) {
    return [];
  }
  const actions = [];
  const topDomain = getDerivedSessionData(session).topDomains[0]?.domain;
  if (topDomain) {
    actions.push({
      label: `Copy top domain: ${topDomain}`,
      onClick: async () => {
        try {
          await navigator.clipboard?.writeText?.(topDomain);
        } catch (error) {
          // Clipboard is optional.
        }
      },
    });
  }
  const range = formatSessionRange(session);
  actions.push({
    label: "Copy session range",
    onClick: async () => {
      try {
        await navigator.clipboard?.writeText?.(range);
      } catch (error) {
        // Clipboard is optional.
      }
    },
  });
  actions.push({
    label: "Refresh summaries",
    onClick: () => refreshSummaries({ force: true }),
  });
  return actions;
}

function renderOverviewActions(session) {
  if (!elements.overviewActions) {
    return;
  }
  elements.overviewActions.innerHTML = "";
  const actions = buildRecommendedActions(session);
  if (!actions.length) {
    if (elements.overviewActionsEmpty) {
      elements.overviewActionsEmpty.hidden = false;
      elements.overviewActionsEmpty.textContent = "No actions yet.";
    }
    return;
  }
  if (elements.overviewActionsEmpty) {
    elements.overviewActionsEmpty.hidden = true;
  }
  const fragment = document.createDocumentFragment();
  actions.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    button.addEventListener("click", action.onClick);
    fragment.appendChild(button);
  });
  elements.overviewActions.appendChild(fragment);
}

function renderFocusNote() {
  if (!elements.focusNote) {
    return;
  }
  const note =
    typeof app.settings.dashboardFocusNote === "string"
      ? app.settings.dashboardFocusNote.trim()
      : "";
  if (note) {
    elements.focusNote.textContent = note;
    elements.focusNote.hidden = false;
    return;
  }
  const prompt = pickFocusPrompt(
    app.settings.focusPrompts,
    app.session?.id || app.state?.activeSessionId || "",
  );
  if (prompt) {
    elements.focusNote.textContent = prompt;
    elements.focusNote.hidden = false;
    return;
  }
  elements.focusNote.textContent = "";
  elements.focusNote.hidden = true;
}

function pickFocusPrompt(prompts, seed) {
  const list = normalizeTextList(prompts, 10, 120);
  if (!list.length) {
    return "";
  }
  const base = seed ? String(seed) : list.join("|");
  const index = Math.abs(hashString(base)) % list.length;
  return list[index];
}

function renderOverviewEmpty() {
  renderSummaryEmpty();
  if (elements.overviewSummary) {
    elements.overviewSummary.textContent = "Session summary unavailable.";
  }
  if (elements.overviewOrigin) {
    elements.overviewOrigin.textContent = "";
  }
  if (elements.overviewInsights) {
    elements.overviewInsights.innerHTML = "";
  }
  if (elements.overviewInsightsEmpty) {
    elements.overviewInsightsEmpty.hidden = false;
    elements.overviewInsightsEmpty.textContent = "No insights yet.";
  }
  if (elements.overviewActions) {
    elements.overviewActions.innerHTML = "";
  }
  if (elements.overviewActionsEmpty) {
    elements.overviewActionsEmpty.hidden = false;
    elements.overviewActionsEmpty.textContent = "No actions yet.";
  }
}

function scheduleSummaryRefresh({ force }) {
  if (force) {
    if (summaryRefreshTimer) {
      clearTimeout(summaryRefreshTimer);
      summaryRefreshTimer = null;
    }
    refreshSummaries({ force: true });
    return;
  }
  if (summaryRefreshTimer) {
    clearTimeout(summaryRefreshTimer);
  }
  summaryRefreshTimer = setTimeout(() => {
    summaryRefreshTimer = null;
    refreshSummaries({ force: false });
  }, SUMMARY_DEBOUNCE_MS);
}

async function refreshSummaries({ force }) {
  if (!app.session) {
    renderSummaryEmpty();
    return;
  }
  const cooldownMinutes = clampNumber(
    app.settings.summaryRefreshCooldownMinutes,
    0,
    120,
    0,
  );
  if (app.summaryState.updating && !force) {
    return;
  }
  const sessionId = app.session.id;
  const sessionUpdatedAt = app.session.updatedAt || app.session.startedAt || 0;
  if (
    !force &&
    app.session.summaryUpdatedAt &&
    sessionUpdatedAt &&
    app.session.summaryUpdatedAt >= sessionUpdatedAt
  ) {
    return;
  }
  if (
    !force &&
    app.summaryState.lastSessionId === sessionId &&
    app.summaryState.lastSessionUpdatedAt === sessionUpdatedAt &&
    app.summaryState.brief &&
    app.summaryState.detailed
  ) {
    return;
  }
  if (
    !force &&
    cooldownMinutes > 0 &&
    app.summaryState.lastSessionId === sessionId &&
    Date.now() - (app.summaryState.lastRefreshAt || 0) <
      cooldownMinutes * 60 * 1000
  ) {
    return;
  }
  const requestId = ++app.summaryState.requestId;
  app.summaryState.updating = true;
  app.summaryState.lastSessionId = sessionId;
  app.summaryState.lastRefreshAt = Date.now();
  app.summaryState.lastSessionUpdatedAt = sessionUpdatedAt;
  app.summaryState.errorMessage = "";
  renderSummaryState();

  if (
    !app.summaryState.brief ||
    app.summaryState.brief === SUMMARY_PLACEHOLDER_BRIEF
  ) {
    app.summaryState.brief = buildLocalSummary("brief", app.session);
  }
  if (
    !app.summaryState.detailed ||
    app.summaryState.detailed === SUMMARY_PLACEHOLDER_DETAILED
  ) {
    app.summaryState.detailed = buildLocalSummary("detailed", app.session);
  }
  renderSummaryState();

  let refreshTimeoutId = setTimeout(() => {
    if (app.summaryState.requestId !== requestId) {
      return;
    }
    _refreshSummariesCatch(requestId, sessionId);
    app.summaryState.errorMessage = "Summary refresh timed out.";
    app.summaryState.updating = false;
    renderSummaryState();
  }, SUMMARY_REFRESH_TIMEOUT_MS);

  try {
    const briefPrompt = await buildSummaryPromptAsync(app.session, "brief");
    const detailedPrompt = await buildSummaryPromptAsync(app.session, "detailed");
    const sendPrompt = getSendPromptToOllama();
    const [brief, detailed] = await Promise.all([
      sendPrompt(briefPrompt),
      sendPrompt(detailedPrompt),
    ]);
    if (app.summaryState.requestId !== requestId) {
      return;
    }
    app.summaryState.brief = coerceSummaryText(
      brief,
      "brief",
      app.session,
    );
    app.summaryState.detailed = coerceSummaryText(
      detailed,
      "detailed",
      app.session,
    );
    app.summaryState.errorMessage = "";
    getPersistSessionSummaries()(
      sessionId,
      app.summaryState.brief,
      app.summaryState.detailed,
    );
  } catch (error) {
    _refreshSummariesCatch(requestId, sessionId);
    app.summaryState.errorMessage = "Summary refresh failed.";
  } finally {
    clearTimeout(refreshTimeoutId);
    if (app.summaryState.requestId !== requestId) {
      return;
    }
    app.summaryState.updating = false;
    renderSummaryState();
  }
}

function getPersistSessionSummaries() {
  return typeof app.persistSessionSummaries === "function"
    ? app.persistSessionSummaries
    : persistSessionSummaries;
}

function _refreshSummariesCatch(requestId, sessionId) {
  if (app.summaryState.requestId !== requestId) {
    return true;
  }
  app.summaryState.brief = coerceSummaryText(
    app.summaryState.brief,
    "brief",
    app.session,
  );
  app.summaryState.detailed = coerceSummaryText(
    app.summaryState.detailed,
    "detailed",
    app.session,
  );
  getPersistSessionSummaries()(
    sessionId,
    app.summaryState.brief,
    app.summaryState.detailed,
  );
  return false;
}

function getSendPromptToOllama() {
  return typeof app.sendPromptToOllama === "function"
    ? app.sendPromptToOllama
    : sendPromptToOllama;
}

const SUMMARY_PLACEHOLDER_BRIEF = "Summary unavailable.";
const SUMMARY_PLACEHOLDER_DETAILED = "Detailed summary unavailable.";

function coerceSummaryText(text, detailLevel, session) {
  const placeholder =
    detailLevel === "brief"
      ? SUMMARY_PLACEHOLDER_BRIEF
      : SUMMARY_PLACEHOLDER_DETAILED;
  if (
    !text ||
    text === placeholder ||
    text === "Gathering summary..." ||
    text === "Gathering detailed summary..."
  ) {
    return buildLocalSummary(detailLevel, session);
  }
  return text;
}

function buildLocalSummary(detailLevel, session) {
  if (!session) {
    return detailLevel === "brief"
      ? SUMMARY_PLACEHOLDER_BRIEF
      : SUMMARY_PLACEHOLDER_DETAILED;
  }
  let dataLines = [];
  try {
    dataLines = buildSummaryDataLines(app.state, session);
  } catch (error) {
    dataLines = [];
  }
  if (!dataLines.length) {
    return detailLevel === "brief"
      ? SUMMARY_PLACEHOLDER_BRIEF
      : SUMMARY_PLACEHOLDER_DETAILED;
  }
  if (detailLevel === "brief") {
    return dataLines.slice(0, 3).join(" ");
  }
  return dataLines.join("\n");
}

function persistSessionSummaries(sessionId, brief, detailed) {
  if (!sessionId || !app.state?.sessions?.[sessionId]) {
    return;
  }
  const timestamp = Date.now();
  app.state.sessions[sessionId].summaryBrief = brief || "";
  app.state.sessions[sessionId].summaryDetailed = detailed || "";
  app.state.sessions[sessionId].summaryUpdatedAt = timestamp;
  if (sendSummaryUpdate(sessionId, brief, detailed, timestamp)) {
    return;
  }
  if (canUseChromeStorage()) {
    chrome.storage.local.set({ [STORAGE_KEY]: app.state });
  }
}

function updateSessionSummaries(sessionId, brief, detailed, summaryUpdatedAt) {
  if (!sessionId || !app.state?.sessions?.[sessionId]) {
    return;
  }
  const session = app.state.sessions[sessionId];
  session.summaryBrief = typeof brief === "string" ? brief : "";
  session.summaryDetailed = typeof detailed === "string" ? detailed : "";
  session.summaryBrief = coerceSummaryText(
    session.summaryBrief,
    "brief",
    session,
  );
  session.summaryDetailed = coerceSummaryText(
    session.summaryDetailed,
    "detailed",
    session,
  );
  session.summaryUpdatedAt = Number.isFinite(summaryUpdatedAt)
    ? summaryUpdatedAt
    : Date.now();
  if (app.session?.id === sessionId) {
    app.summaryState.brief = session.summaryBrief;
    app.summaryState.detailed = session.summaryDetailed;
    renderSummaryState();
  }
}

function buildSummaryDataLines(state, session) {
  const tracking = state?.tracking;
  const mirror = globalThis.IRHTInsights?.buildSessionMirror
    ? globalThis.IRHTInsights.buildSessionMirror(session, state, {
        tone: app.settings.tone,
        tracking,
      })
    : null;
  const categoryTotals = session.categoryTotals || {};
  const topDomains = getDerivedSessionData(session).topDomains.slice(0, 5);
  const trapDoor = (session.trapDoors || [])[0];
  const sessionStartUrl = findSessionStartUrl(session);
  const sessionStartDomain = getDomain(sessionStartUrl);
  const shared = globalThis.IRHTSummaryShared?.buildSummaryDataLinesShared;
  if (typeof shared !== "function") {
    return [];
  }
  return shared({
    session,
    tracking,
    mirrorSummary: mirror?.summary || "Unavailable",
    mirrorOrigin: mirror?.origin || "Unavailable",
    categoryTotals,
    topDomains,
    trapDoor,
    sessionStartUrl,
    sessionStartDomain,
    formatSessionRange,
    formatDuration,
    getSessionActiveMs,
    getDomain,
    truncate,
  });
}

async function buildSummaryDataLinesAsync(state, session) {
  if (!session) {
    return [];
  }
  if (!realtimeWorker) {
    return buildSummaryDataLines(state, session);
  }
  const tracking = state?.tracking;
  const mirror = globalThis.IRHTInsights?.buildSessionMirror
    ? globalThis.IRHTInsights.buildSessionMirror(session, state, {
        tone: app.settings.tone,
        tracking,
      })
    : null;
  const payload = {
    session,
    tracking,
    mirrorSummary: mirror?.summary || "Unavailable",
    mirrorOrigin: mirror?.origin || "Unavailable",
  };
  const result = await requestWorkerTask("derive_summary", payload);
  if (!result || !Array.isArray(result.lines)) {
    return buildSummaryDataLines(state, session);
  }
  return result.lines;
}

function buildSummaryStyleLines(detailLevel) {
  const lines = [];
  lines.push(buildSummaryToneLine(detailLevel));
  lines.push(buildSummaryVoiceLine(detailLevel));
  lines.push(buildSummaryPersonalityLine(detailLevel));
  lines.push(buildSummaryTechnicalityLine());
  lines.push(buildSummaryEmojiLine(detailLevel));
  lines.push(buildSummaryFormattingLine());
  lines.push(
    app.settings.summaryBullets
      ? "Use bullet points where helpful."
      : "Avoid bullet points unless asked.",
  );
  lines.push(
    app.settings.summaryMetaphors
      ? "Light metaphors are welcome if they stay short and grammatically natural."
      : "Avoid metaphors.",
  );
  const length = ensureChoice(
    app.settings.summaryLength,
    SUMMARY_LENGTHS,
    DEFAULT_SETTINGS.summaryLength,
  );
  const verbosity = ensureChoice(
    app.settings.summaryVerbosity,
    SUMMARY_VERBOSITY,
    DEFAULT_SETTINGS.summaryVerbosity,
  );
  lines.push(`Length preference: ${length}.`);
  lines.push(`Verbosity: ${verbosity}, for the ${detailLevel} summary.`);
  return lines;
}

function buildSummaryToneLine(detailLevel) {
  const tone = app.settings.tone === "direct" ? "direct" : "neutral";
  if (detailLevel === "brief") {
    return tone === "direct"
      ? "Tone: direct, candid, and honest."
      : "Tone: warm, casual, and honest.";
  }
  return tone === "direct"
    ? "Tone: direct, grounded, and honest."
    : "Tone: warm, human, and gently honest.";
}

function buildSummaryVoiceLine(detailLevel) {
  const voice = ensureChoice(
    app.settings.summaryVoice,
    SUMMARY_VOICES,
    DEFAULT_SETTINGS.summaryVoice,
  );
  const voiceMap = {
    friend: {
      brief: "smart friend who explains things simply",
      detailed: "smart friend who noticed patterns and is explaining them back clearly",
    },
    mentor: {
      brief: "supportive mentor who explains things simply",
      detailed: "thoughtful mentor who noticed patterns and is explaining them back clearly",
    },
    analyst: {
      brief: "clear analyst who explains things simply",
      detailed: "observant analyst who noticed patterns and is explaining them back clearly",
    },
  };
  const label = voiceMap[voice] || voiceMap.friend;
  return `Voice: ${detailLevel === "brief" ? label.brief : label.detailed}.`;
}

function buildSummaryPersonalityLine(detailLevel) {
  const personality = ensureChoice(
    app.settings.summaryPersonality,
    SUMMARY_PERSONALITIES,
    DEFAULT_SETTINGS.summaryPersonality,
  );
  const personalityMap = {
    gentle: {
      brief: "human, encouraging, and gentle",
      detailed: "encouraging, patient, and gentle (not formal, not corporate)",
    },
    direct: {
      brief: "candid, confident, and straight to the point (still kind)",
      detailed: "candid, observant, and straightforward (not harsh)",
    },
    balanced: {
      brief: "human, encouraging, and a little playful when it fits",
      detailed: "encouraging, observant, and casual (not formal, not corporate)",
    },
  };
  const label = personalityMap[personality] || personalityMap.balanced;
  return `Personality: ${detailLevel === "brief" ? label.brief : label.detailed}.`;
}

function buildSummaryTechnicalityLine() {
  const technicality = ensureChoice(
    app.settings.summaryTechnicality,
    SUMMARY_TECHNICALITY,
    DEFAULT_SETTINGS.summaryTechnicality,
  );
  if (technicality === "soft") {
    return "Technicality: soft and simple; avoid jargon.";
  }
  if (technicality === "technical") {
    return "Technicality: technical when it helps clarity; use precise terms.";
  }
  return "Technicality: grounded (use technical details only if they help explain what happened).";
}

function buildSummaryEmojiLine(detailLevel) {
  const emojiLevel = ensureChoice(
    app.settings.summaryEmojis,
    SUMMARY_EMOJI_LEVELS,
    DEFAULT_SETTINGS.summaryEmojis,
  );
  if (emojiLevel === "none") {
    return "Emoji level: none.";
  }
  if (emojiLevel === "low") {
    return "Emoji level: low (use sparingly).";
  }
  if (emojiLevel === "high") {
    return "Emoji level: high (use often, but not every sentence).";
  }
  if (detailLevel === "detailed") {
    return "Emoji level: medium (used sparingly to set tone 🙂).";
  }
  return "Emoji level: medium (use naturally, not every sentence).";
}

function buildSummaryFormattingLine() {
  const formatting = ensureChoice(
    app.settings.summaryFormatting,
    SUMMARY_FORMATTING,
    DEFAULT_SETTINGS.summaryFormatting,
  );
  return formatting === "markdown"
    ? "Use markdown formatting."
    : "Use plain text only.";
}

function buildSummaryLengthInstruction(detailLevel) {
  const length = ensureChoice(
    app.settings.summaryLength,
    SUMMARY_LENGTHS,
    DEFAULT_SETTINGS.summaryLength,
  );
  if (detailLevel === "brief") {
    if (length === "short") {
      return "Write 1-2 sentences.";
    }
    if (length === "long") {
      return "Write 3-5 sentences.";
    }
    return "Write 2-3 sentences.";
  }
  if (length === "short") {
    return "Write 1 short, readable paragraph.";
  }
  if (length === "long") {
    return "Write 3-5 short, readable paragraphs.";
  }
  return "Write 2-3 short, readable paragraphs.";
}

function getSummaryBaseLines(detailLevel) {
  return detailLevel === "brief"
    ? [
        "You are a friendly, observant assistant reflecting back what you noticed about the user’s browsing session.",
        "",
        ...buildSummaryStyleLines("brief"),
        "",
        buildSummaryLengthInstruction("brief"),
        "Start by clearly naming the main pattern of the session (focused, drifting, looping, exploring, etc.).",
        "Then explain why it went that way in very simple words, like you’re explaining to a kid — what pulled attention, what kept it going, or where it shifted.",
        "",
        "Speak directly to the user (“you”).",
        "Use session data as clues, not something to list.",
        "If a turning point exists, mention it naturally as “this is where things changed.”",
        "Only mention specific domains or sites that appear in the session data section.",
        "If a start point or turning point is unknown, say it’s unclear rather than guessing.",
        "",
        "Do not mention scores, ratings, or productivity.",
        "Do not dump metrics.",
        "",
        "Session data (use only as evidence):",
      ]
    : [
        "You are a friendly, thoughtful assistant helping the user understand how their browsing session unfolded.",
        "",
        ...buildSummaryStyleLines("detailed"),
        "",
        buildSummaryLengthInstruction("detailed"),
        "Walk through the session in order: how it started, what pulled attention next, and what ended up defining it.",
        "Explain cause → effect in simple language (“this happened, so then this happened”).",
        "If one site, category, or loop dominated, weave it into the explanation naturally instead of listing it.",
        "If there was a turning point, clearly call out that moment as the shift.",
        "Only mention specific domains or sites that appear in the session data section.",
        "If a start point or turning point is unknown, say it’s unclear rather than guessing.",
        "",
        "Speak directly to the user and help them notice their habits, not judge them.",
        "Keep the tone encouraging, like “nothing wrong here — just interesting to see.”",
        "",
        "Avoid scores, ratings, productivity talk, or metric dumps.",
        "Use the session data only as evidence for insight.",
        "",
        "Session data (use only as evidence):",
      ];
}

function buildSummaryPrompt(session, detailLevel) {
  const baseLines = getSummaryBaseLines(detailLevel);
  return [...baseLines, ...buildSummaryDataLines(app.state, session)].join("\n");
}

async function buildSummaryPromptAsync(session, detailLevel) {
  if (!app.settings.realtimeWorkerOffload || !realtimeWorker) {
    return buildSummaryPrompt(session, detailLevel);
  }
  const baseLines = getSummaryBaseLines(detailLevel);
  const dataLines = await buildSummaryDataLinesAsync(app.state, session);
  return [...baseLines, ...dataLines].join("\n");
}

async function requestOllama(endpoint, model, prompt) {
  const headers = { "Content-Type": "application/json" };
  let timeoutId = null;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Ollama request failed (timeout)."));
    }, OLLAMA_REQUEST_TIMEOUT_MS);
  });
  try {
    const response = await Promise.race([
      fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
        }),
      }),
      timeout,
    ]);
    if (!response.ok) {
      throw new Error(`Ollama request failed (${response.status}).`);
    }
    const data = await response.json();
    return typeof data.response === "string" ? data.response.trim() : "";
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeOllamaError(error) {
  if (error && /Ollama request failed/i.test(error.message || "")) {
    return error;
  }
  return new Error("Ollama request failed (network).");
}

async function sendPromptToOllama(prompt) {
  const endpoint = app.settings?.ollamaEndpoint || OLLAMA_ENDPOINT;
  const model = app.settings?.ollamaModel || OLLAMA_MODEL;
  try {
    return await requestOllama(endpoint, model, prompt);
  } catch (error) {
    if (endpoint !== DIRECT_OLLAMA_ENDPOINT) {
      try {
        return await requestOllama(DIRECT_OLLAMA_ENDPOINT, model, prompt);
      } catch (fallbackError) {
        throw normalizeOllamaError(fallbackError);
      }
    }
    throw normalizeOllamaError(error);
  }
}

function renderStatus() {
  if (!app.session) {
    return;
  }
  const totalActiveMs = getLiveActiveMs(app.session, app.state?.tracking);
  const pageCount = Object.keys(app.session.nodes || {}).length;
  const edgeCount = Object.keys(app.session.edges || {}).length;
  const rangeText = formatSessionRange(app.session);

  elements.sessionRange.textContent = rangeText;
  elements.totalActive.textContent = formatDuration(totalActiveMs);
  elements.pageCount.textContent = pageCount.toString();
  elements.edgeCount.textContent = edgeCount.toString();
}

function renderTimeline() {
  if (!app.session) {
    return;
  }
  if (app.settings.realtimeWorkerOffload && realtimeWorker) {
    const sessionId = app.session.id;
    const tracking = app.state?.tracking || null;
    const isActiveSession = app.state?.activeSessionId === sessionId;
    requestWorkerTask("derive_timeline", {
      session: app.session,
      tracking,
      isActiveSession,
    }).then((result) => {
      if (!app.session || app.session.id !== sessionId) {
        return;
      }
      if (!result || !Array.isArray(result.segments)) {
        const fallback = buildTimelineSegments(
          app.session,
          app.state?.tracking,
          app.state?.activeSessionId === sessionId,
        );
        renderTimelineWithSegments(fallback);
        return;
      }
      renderTimelineWithSegments(result.segments);
    });
    return;
  }
  const segments = buildTimelineSegments(
    app.session,
    app.state?.tracking,
    app.state?.activeSessionId === app.session.id,
  );
  renderTimelineWithSegments(segments);
}

function renderTimelineWithSegments(segments) {
  elements.timelineTrack.innerHTML = "";
  elements.timelineLegend.innerHTML = "";

  if (!segments.length) {
    elements.timelineStart.textContent = "-";
    elements.timelineEnd.textContent = "-";
    const empty = document.createElement("div");
    empty.className = "timeline-empty";
    const totalActiveMs = getLiveActiveMs(app.session, app.state?.tracking);
    empty.textContent =
      totalActiveMs > 0
        ? "Active time is building… stay on a page to form a timeline."
        : "No active time captured yet.";
    elements.timelineTrack.appendChild(empty);
    return;
  }

  const minStart = Math.min(...segments.map((segment) => segment.start));
  const maxEnd = Math.max(...segments.map((segment) => segment.end));
  const span = Math.max(1, maxEnd - minStart);

  elements.timelineStart.textContent = formatTime(minStart);
  elements.timelineEnd.textContent = formatTime(maxEnd);

  const trackFragment = document.createDocumentFragment();
  segments.forEach((segment) => {
    const left = ((segment.start - minStart) / span) * 100;
    const width = ((segment.end - segment.start) / span) * 100;
    const block = document.createElement("div");
    block.className = "segment";
    block.style.left = `${left}%`;
    block.style.width = `${Math.max(width, 0.5)}%`;
    block.style.background = colorFor(segment.domain);
    block.title = `${segment.title} (${formatDuration(segment.duration)})`;
    trackFragment.appendChild(block);
  });
  elements.timelineTrack.appendChild(trackFragment);

  const topSegments = [...segments]
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 5);

  const legendFragment = document.createDocumentFragment();
  topSegments.forEach((segment) => {
    const row = document.createElement("div");
    row.className = "legend-item";
    const label = document.createElement("span");
    label.textContent = truncate(segment.domain, 28);
    const value = document.createElement("span");
    value.textContent = formatDuration(segment.duration);
    row.appendChild(label);
    row.appendChild(value);
    legendFragment.appendChild(row);
  });
  elements.timelineLegend.appendChild(legendFragment);
}

function renderGraph() {
  if (!app.session || !app.graph || !app.graphReady) {
    return;
  }
  const graphSettings = app.graphSettings || GRAPH_DEFAULTS;
  const hasFilters =
    !!graphSettings.search ||
    (graphSettings.minNodeMinutes || 0) > 0 ||
    (graphSettings.minEdgeCount || 1) > 1 ||
    !!graphSettings.hideIsolates;
  if (!shouldShowGraphForSession(app.session)) {
    app.graph.setData({ nodes: [], edges: [] }, { preserveLayout: false });
    app.graph.lastKey = null;
    app.graphWarm = false;
    return;
  }
  const cap = app.graphWarm
    ? graphSettings.nodeCap
    : Math.min(graphSettings.nodeCap, GRAPH_INITIAL_NODE_CAP);
  const minNodeMs = graphSettings.minNodeMinutes * 60 * 1000;
  const renderGraphFallback = () => {
    const graphData = buildGraphData(
      app.session,
      app.mode,
      app.graphWarm ? null : cap,
    );
    const trimmed = trimGraph(graphData, cap);
    const filtered = filterGraphData(trimmed, {
      nodeCap: cap,
      minNodeMs,
      minEdgeCount: graphSettings.minEdgeCount,
      search: graphSettings.search,
      hideIsolates: graphSettings.hideIsolates,
    });
    let graph = filtered;
    if (
      !hasFilters &&
      graph.nodes.length === 0 &&
      Object.keys(app.session.nodes || {}).length
    ) {
      const fallback = buildGraphData(app.session, "page", cap);
      graph = filterGraphData(fallback, {
        nodeCap: cap,
        minNodeMs,
        minEdgeCount: graphSettings.minEdgeCount,
        search: graphSettings.search,
        hideIsolates: graphSettings.hideIsolates,
      });
    }
    renderGraphWithData(graph, app.mode, app.session.id, graphSettings);
  };
  if (app.settings.realtimeWorkerOffload && realtimeWorker) {
    const sessionId = app.session.id;
    const mode = app.mode;
    requestWorkerTask("derive_graph", {
      session: app.session,
      mode,
      maxNodes: cap,
      graphSettings: {
        nodeCap: cap,
        minNodeMinutes: graphSettings.minNodeMinutes,
        minEdgeCount: graphSettings.minEdgeCount,
        search: graphSettings.search,
        hideIsolates: graphSettings.hideIsolates,
      },
      warm: app.graphWarm,
    }).then((result) => {
      if (!app.session || app.session.id !== sessionId || app.mode !== mode) {
        return;
      }
      if (!result || !result.graph) {
        renderGraphFallback();
        return;
      }
      let graph = result.graph;
      if (
        !hasFilters &&
        graph &&
        Array.isArray(graph.nodes) &&
        graph.nodes.length === 0 &&
        Object.keys(app.session.nodes || {}).length
      ) {
        const fallback = buildGraphData(app.session, "page", cap);
        graph = filterGraphData(fallback, {
          nodeCap: cap,
          minNodeMs,
          minEdgeCount: graphSettings.minEdgeCount,
          search: graphSettings.search,
          hideIsolates: graphSettings.hideIsolates,
        });
      }
      renderGraphWithData(graph, mode, sessionId, graphSettings);
    });
    return;
  }
  renderGraphFallback();
}

function renderGraphWithData(graph, mode, sessionId, graphSettings) {
  if (!graph || !graph.nodes || !graph.edges) {
    return;
  }
  if (
    !graph.nodes.length &&
    app.session &&
    Object.keys(app.session.nodes || {}).length
  ) {
    const cap = graphSettings?.nodeCap || GRAPH_DEFAULTS.nodeCap;
    const minNodeMs = (graphSettings?.minNodeMinutes || 0) * 60 * 1000;
    const fallback = buildGraphData(app.session, "page", cap);
    graph = filterGraphData(fallback, {
      nodeCap: cap,
      minNodeMs,
      minEdgeCount: graphSettings?.minEdgeCount || 1,
      search: graphSettings?.search || "",
      hideIsolates: !!graphSettings?.hideIsolates,
    });
  }
  if (
    !graph.nodes.length &&
    app.session &&
    Object.keys(app.session.nodes || {}).length
  ) {
    const keys = Object.keys(app.session.nodes || {});
    const cap = graphSettings?.nodeCap || GRAPH_DEFAULTS.nodeCap;
    const nodes = keys.slice(0, cap).map((url) => {
      const node = app.session.nodes?.[url] || {};
      return {
        id: url,
        label: node.title || url,
        url,
        domain: getDomainForGraph(url) || "",
        category: node.category || "Random",
        activeMs: node.activeMs || 0,
        visitCount: node.visitCount || 0,
      };
    });
    graph = { nodes, edges: [] };
  }
  if (!graph.nodes.length) {
    if (elements.graphEmpty) {
      elements.graphEmpty.style.display = "grid";
      elements.graphEmpty.textContent = graph?.emptyReason || "No graph yet.";
    }
    app.graph.setData({ nodes: [], edges: [] }, { preserveLayout: false });
    updateGraphStats({ nodes: [], edges: [] });
    return;
  }
  if (elements.graphEmpty) {
    elements.graphEmpty.style.display = "none";
  }
  const key = buildGraphKey(graph, mode, sessionId);
  const preserveLayout = app.graph.lastKey === key;
  app.graph.setData(graph, {
    preserveLayout,
    colorBy: graphSettings?.colorBy || "activity",
    showLabels: graphSettings?.showLabels ?? true,
  });
  app.graph.lastKey = key;
  app.graphWarm = true;
  updateGraphStats(graph);
  updateGraphLegend(graphSettings || GRAPH_DEFAULTS, graph);
}

function renderStats() {
  if (!app.session) {
    return;
  }
  ensureSessionInsights(app.session);
  const totalActiveMs = getLiveActiveMs(app.session, app.state?.tracking);
  const renderStatsFallback = () => {
    const derived = getDerivedSessionData(app.session);
    const chain = derived.deepestChain;
    let start = app.cache.commonStart;
    if (!start || app.cache.commonStartRevision !== app.stateRevision) {
      start = computeCommonStart(app.state);
      app.cache.commonStart = start;
      app.cache.commonStartRevision = app.stateRevision;
    }
    const trapDoor = (app.session.trapDoors || [])[0];
    renderStatsWithData(
      {
        chain,
        start,
        trapDoor,
        topDomains: derived.topDomains,
        topPages: derived.topPages,
        topDistractions: derived.topDistractions,
      },
      totalActiveMs,
    );
  };
  if (app.settings.realtimeWorkerOffload && realtimeWorker) {
    const sessionId = app.session.id;
    requestWorkerTask("derive_stats", {
      session: app.session,
      state: app.state,
    }).then((result) => {
      if (!app.session || app.session.id !== sessionId) {
        return;
      }
      if (!result || !result.stats) {
        renderStatsFallback();
        return;
      }
      renderStatsWithData(result.stats, totalActiveMs);
    });
    return;
  }
  renderStatsFallback();
}

function renderStatsWithData(stats, totalActiveMs) {
  const chain = stats.chain || { length: 0, label: "" };
  const start = stats.start || { domain: null, detail: "" };
  const trapDoor = stats.trapDoor || null;
  const topDomains = stats.topDomains || [];
  const topPages = stats.topPages || [];
  const topDistractions = stats.topDistractions || [];

  elements.deepestChain.textContent = chain.length
    ? `${chain.length} steps`
    : "-";
  elements.deepestChainDetail.textContent = chain.label || "";

  elements.commonStart.textContent = start.domain || "-";
  elements.commonStartDetail.textContent = start.detail || "";

  if (trapDoor) {
    elements.trapDoor.textContent = truncate(getDomain(trapDoor.url), 28);
    elements.trapDoorDetail.textContent = `${formatDuration(
      trapDoor.postVisitDurationMs,
    )} after entry, ${trapDoor.postVisitDepth} steps`;
  } else {
    elements.trapDoor.textContent = "-";
    elements.trapDoorDetail.textContent = "";
  }

  if (elements.sessionLabel) {
    elements.sessionLabel.textContent = app.session?.label || "-";
    elements.sessionLabelDetail.textContent = app.session?.labelDetail || "";
  }

  renderRankList(
    elements.topDomains,
    topDomains.slice(0, 5),
    (item) => item.domain,
  );
  renderRankList(
    elements.topPages,
    topPages.slice(0, 5),
    (item) => item.url,
  );
  renderRankList(
    elements.topDistractions,
    topDistractions.slice(0, 5),
    (item) => item.url,
    (item) => formatDuration(item.activeMs),
  );

  if (elements.totalActive) {
    elements.totalActive.textContent = formatDuration(totalActiveMs);
  }
}

function renderHonesty() {
  if (!app.session) {
    return;
  }
  ensureSessionInsights(app.session);

  renderDamageReceipts(app.session);
  renderReturnPath(app.session);
  renderCallouts(app.session, app.state);
}

function renderDamageReceipts(session) {
  if (!elements.damageReceipts) {
    return;
  }
  const receipts = getDerivedSessionData(session).damageReceipts;
  elements.damageReceipts.innerHTML = "";
  if (!receipts.length) {
    const item = document.createElement("li");
    item.textContent = "No moments yet.";
    elements.damageReceipts.appendChild(item);
    return;
  }
  receipts.forEach((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    elements.damageReceipts.appendChild(item);
  });
}

function renderReturnPath(session) {
  if (!elements.pathStart || !elements.pathTrap || !elements.pathEnd) {
    return;
  }
  const startUrl = findSessionStartUrl(session);
  const endUrl = findSessionEndUrl(session);
  const trap = (session.trapDoors || [])[0];

  const startLabel = formatPathNode(startUrl);
  const endLabel = formatPathNode(endUrl);
  const trapLabel = trap ? formatPathNode(trap.url) : "No turning point";

  elements.pathStart.textContent = startLabel;
  elements.pathEnd.textContent = endLabel;
  elements.pathTrap.textContent = trapLabel;

  elements.pathStart.classList.toggle("dim", !startUrl);
  elements.pathEnd.classList.toggle("dim", !endUrl);
  elements.pathTrap.classList.toggle("dim", !trap);

  if (elements.pathMeta) {
    const hops = session.navigationCount || 0;
    const duration = getSessionActiveMs(session, app.state?.tracking);
    elements.pathMeta.textContent = `${formatDuration(duration)} and ${hops} steps total.`;
  }
}

function renderCalloutItem(message) {
  if (!elements.calloutsList) {
    return;
  }
  const item = document.createElement("li");
  const tone = classifyCalloutTone(message);
  item.className = `active callout-${tone}`;
  item.textContent = message;
  elements.calloutsList.appendChild(item);
}

function renderCallouts(session, state) {
  if (!elements.calloutsList) {
    return;
  }
  const showCallouts =
    app.settings?.dashboardSections?.callouts ??
    DEFAULT_SETTINGS.dashboardSections.callouts;
  if (!showCallouts) {
    elements.calloutsList.innerHTML = "";
    return;
  }
  const enabled = !!app.settings.directCallouts;
  elements.calloutsList.innerHTML = "";

  if (!enabled) {
    const item = document.createElement("li");
    item.textContent =
      "Honesty callouts are off. Enable them in Settings > Personalization.";
    elements.calloutsList.appendChild(item);
    return;
  }

  const messages = buildCalloutMessages(session, state, app.settings.tone);
  if (!messages.length) {
    const item = document.createElement("li");
    item.textContent = "No notes yet.";
    elements.calloutsList.appendChild(item);
    return;
  }

  messages.forEach(renderCalloutItem);
}

function hasSessions(state) {
  if (!state || !state.sessions) {
    return false;
  }
  return Object.values(state.sessions).some(
    (session) => session && !session.deleted,
  );
}

function isStateEmpty(state) {
  if (!state || !state.sessions) {
    return true;
  }
  const sessions = Object.values(state.sessions).filter(
    (session) => session && !session.deleted,
  );
  if (!sessions.length) {
    return true;
  }
  return sessions.every(
    (session) => !session.nodes || Object.keys(session.nodes).length === 0,
  );
}

function canUseChromeStorage() {
  return (
    typeof chrome !== "undefined" && chrome.storage && chrome.storage.local
  );
}

function setLiveIndicator(state) {
  if (!elements.liveIndicator || !elements.liveLabel) {
    return;
  }
  app.liveState = state;
  elements.liveIndicator.classList.remove("sync", "offline", "paused");
  if (app.settings?.trackingPaused) {
    elements.liveIndicator.classList.add("paused");
    elements.liveLabel.textContent = "Tracking paused";
    return;
  }
  if (state === "sync") {
    elements.liveIndicator.classList.add("sync");
    elements.liveLabel.textContent = "Sync snapshot";
    return;
  }
  if (state === "offline") {
    elements.liveIndicator.classList.add("offline");
    elements.liveLabel.textContent = "Open from extension";
    return;
  }
  elements.liveLabel.textContent = "Live data";
}

async function initLiveDashboard() {
  if (!canUseChromeStorage()) {
    setLiveIndicator("offline");
    renderEmptyDashboard();
    return;
  }

  if (!app.graph && elements.graphCanvas && elements.tooltip) {
    app.graph = new ForceGraph(elements.graphCanvas, elements.tooltip);
    app.graph.setFreeze(!!app.graphSettings.freeze);
  }
  setView(app.view);
  setDeepDiveTab(app.deepTab);

  app.forceSummaryRefresh = consumeForceRefreshFlag();
  app.settings = await loadSettingsFromStorage();
  app.graphSettings = loadGraphSettings();
  app.mode = app.graphSettings.mode || app.mode;
  applyTheme(app.settings.theme);
  applyUiSettings(app.settings);
  renderSettings();
  updateGraphControls();
  renderFocusNote();
  configureRealtimeFeatures(null, app.settings);

  const result = await loadStateFromStorage();
  if (!result.state) {
    setLiveIndicator("live");
    renderEmptyDashboard();
  } else {
    applyState(result.state, result.source);
  }

  chrome.storage.onChanged.addListener(handleStorageChanged);
}

function configureRealtimeFeatures(previousSettings, nextSettings) {
  const prev = previousSettings || {};
  const next = nextSettings || {};
  if (
    prev.realtimeStreamEnabled !== next.realtimeStreamEnabled ||
    prev.realtimePortPush !== next.realtimePortPush
  ) {
    setupRealtimePort(next);
  }
  if (prev.realtimeStreamEnabled !== next.realtimeStreamEnabled) {
    setupRealtimePolling(next);
  }
  setupLiveTimer(next);
  if (prev.realtimeWorkerOffload !== next.realtimeWorkerOffload) {
    setupRealtimeWorker(next);
  }
}

function setupRealtimePort(settings) {
  if (realtimePort) {
    realtimePort.disconnect();
    realtimePort = null;
  }
  if (!settings?.realtimeStreamEnabled) {
    setupRealtimePolling(settings);
    return;
  }
  if (!chrome?.runtime?.connect) {
    setupRealtimePolling(settings);
    return;
  }
  try {
    realtimePort = chrome.runtime.connect({ name: "irht_live" });
  } catch (error) {
    realtimePort = null;
    setupRealtimePolling(settings);
    return;
  }
  if (!realtimePort) {
    setupRealtimePolling(settings);
    return;
  }
  realtimePort.onMessage.addListener(handleRealtimeMessage);
  realtimePort.onDisconnect.addListener(() => {
    if (realtimePort) {
      realtimePort = null;
    }
    setLiveIndicator("offline");
    setupRealtimePolling(app.settings);
  });
  try {
    realtimePort.postMessage({ type: "request_snapshot" });
  } catch (error) {
    realtimePort.disconnect();
    realtimePort = null;
    setupRealtimePolling(settings);
  }
}

function setupRealtimePolling(settings) {
  if (realtimePollTimer) {
    clearInterval(realtimePollTimer);
    realtimePollTimer = null;
  }
  if (!settings?.realtimeStreamEnabled || realtimePort) {
    return;
  }
  if (!canUseChromeStorage()) {
    return;
  }
  realtimePollTimer = setInterval(() => {
    requestLiveStateSnapshot();
  }, 1000);
  requestLiveStateSnapshot();
}

function requestLiveStateSnapshot() {
  if (!canUseChromeStorage()) {
    return;
  }
  if (chrome?.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type: "get_state" }, (response) => {
      if (chrome.runtime.lastError) {
        return;
      }
      if (response?.state) {
        applyState(response.state, "live");
      }
    });
    return;
  }
  if (chrome?.storage?.local?.get) {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (chrome.runtime?.lastError) {
        return;
      }
      const stored = normalizeState(result?.[STORAGE_KEY]);
      if (stored) {
        applyState(stored, "local");
      }
    });
  }
}

function handleRealtimeMessage(message) {
  if (!message || typeof message !== "object") {
    return;
  }
  if (message.type === "state_snapshot") {
    applyState(message.state, "live");
    return;
  }
  if (message.type === "state_delta") {
    queueRealtimeDelta(message);
  }
}

function queueRealtimeDelta(delta) {
  if (!delta) {
    return;
  }
  if (!app.settings.realtimeBatchUpdates) {
    applyStateDelta(delta);
    return;
  }
  const windowMs = clampNumber(
    app.settings.realtimeBatchWindowMs,
    250,
    500,
    DEFAULT_SETTINGS.realtimeBatchWindowMs,
  );
  realtimePendingDelta = mergeRealtimeDelta(realtimePendingDelta, delta);
  if (realtimeBatchTimer) {
    return;
  }
  realtimeBatchTimer = setTimeout(() => {
    realtimeBatchTimer = null;
    const pending = realtimePendingDelta;
    realtimePendingDelta = null;
    applyStateDelta(pending);
  }, windowMs);
}

function mergeRealtimeDelta(base, next) {
  if (!base) {
    return next;
  }
  return {
    sessionId: next.sessionId ?? base.sessionId,
    tracking: { ...(base.tracking || {}), ...(next.tracking || {}) },
    sessionPatch: { ...(base.sessionPatch || {}), ...(next.sessionPatch || {}) },
    sessionsPatch: [
      ...(base.sessionsPatch || []),
      ...(next.sessionsPatch || []),
    ],
    sessionOrder: next.sessionOrder || base.sessionOrder || null,
    nodePatch: next.nodePatch || base.nodePatch || null,
    edgePatch: next.edgePatch || base.edgePatch || null,
    eventPatch: next.eventPatch || base.eventPatch || null,
  };
}

function applyStateDelta(delta) {
  if (!delta) {
    return;
  }
  if (!app.state || !app.state.sessions) {
    if (delta.state) {
      applyState(delta.state, "live");
    }
    return;
  }
  if (delta.tracking) {
    app.state.tracking = { ...app.state.tracking, ...delta.tracking };
  }
  if (realtimeReconcileTimer) {
    clearTimeout(realtimeReconcileTimer);
    realtimeReconcileTimer = null;
  }
  let listNeedsRefresh = false;
  if (Array.isArray(delta.sessionsPatch) && delta.sessionsPatch.length) {
    delta.sessionsPatch.forEach((patch) => {
      if (!patch?.id) {
        return;
      }
      if (!app.state.sessions[patch.id]) {
        app.state.sessions[patch.id] = {
          id: patch.id,
          nodes: {},
          edges: {},
          events: [],
        };
        listNeedsRefresh = true;
      }
      Object.assign(app.state.sessions[patch.id], patch);
    });
    listNeedsRefresh = true;
  }
  if (Array.isArray(delta.sessionOrder) && delta.sessionOrder.length) {
    app.state.sessionOrder = delta.sessionOrder.slice();
    listNeedsRefresh = true;
  }
  const sessionId = delta.sessionId;
  if (sessionId && app.state.sessions[sessionId]) {
    const session = app.state.sessions[sessionId];
    if (delta.sessionPatch) {
      Object.assign(session, delta.sessionPatch);
    }
    if (delta.nodePatch && delta.nodePatch.url) {
      const url = delta.nodePatch.url;
      session.nodes = session.nodes || {};
      session.nodes[url] = { ...(session.nodes[url] || {}), ...delta.nodePatch };
    }
    if (delta.edgePatch && delta.edgePatch.id) {
      session.edges = session.edges || {};
      session.edges[delta.edgePatch.id] = {
        ...(session.edges[delta.edgePatch.id] || {}),
        ...delta.edgePatch,
      };
    }
    if (delta.eventPatch) {
      if (!Array.isArray(session.events)) {
        session.events = [];
      }
      if (typeof session.eventCursor !== "number") {
        session.eventCursor = session.events.length % MAX_EVENTS;
      }
      if (typeof session.eventCount !== "number") {
        session.eventCount = session.events.length;
      }
      if (session.eventCount < MAX_EVENTS) {
        session.events.push(delta.eventPatch);
        session.eventCount = session.events.length;
        session.eventCursor = session.eventCount % MAX_EVENTS;
      } else {
        const cursor = session.eventCursor % MAX_EVENTS;
        session.events[cursor] = delta.eventPatch;
        session.eventCursor = (cursor + 1) % MAX_EVENTS;
        session.eventCount = Math.min(session.eventCount + 1, MAX_EVENTS);
      }
      if (
        delta.eventPatch.type === "active_time_flushed" &&
        delta.eventPatch.url &&
        delta.eventPatch.durationMs
      ) {
        session.nodes = session.nodes || {};
        const url = delta.eventPatch.url;
        const node = session.nodes[url] || { url, title: url };
        node.activeMs = (node.activeMs || 0) + delta.eventPatch.durationMs;
        node.lastSeen = delta.eventPatch.ts || Date.now();
        if (!node.id) {
          node.id = url;
        }
        if (!node.url) {
          node.url = url;
        }
        if (!node.title) {
          node.title = url;
        }
        if (!node.category) {
          node.category = "Random";
        }
        if (!node.visitCount) {
          node.visitCount = 0;
        }
        session.nodes[url] = node;
        const eventTs = delta.eventPatch.ts || Date.now();
        session.updatedAt = Math.max(session.updatedAt || 0, eventTs);
        session.lastActivityAt = Math.max(session.lastActivityAt || 0, eventTs);
      }
    }
    if (app.session?.id === sessionId) {
      app.session = session;
      updateLiveActiveBase(session);
    }
  }
  if (listNeedsRefresh) {
    scheduleSessionListRefresh();
  }
  if (app.settings.realtimePriorityUpdates) {
    applyPriorityUpdate();
    scheduleDeferredRender();
  } else {
    renderDashboard();
  }
  setLiveIndicator("live");
}

function scheduleSessionListRefresh() {
  if (app.settings.realtimePriorityUpdates) {
    if (realtimeDeferredRenderTimer) {
      return;
    }
    realtimeDeferredRenderTimer = setTimeout(() => {
      realtimeDeferredRenderTimer = null;
      app.cache.sessionListKey = "";
      populateSessionList();
      populateSessionSelect();
    }, 150);
    return;
  }
  app.cache.sessionListKey = "";
  populateSessionList();
  populateSessionSelect();
}

function applyPriorityUpdate() {
  const session = app.session;
  if (!session) {
    return;
  }
  const tracking = app.state?.tracking;
  if (elements.sessionRange) {
    elements.sessionRange.textContent = formatSessionRange(session);
  }
  if (elements.totalActive) {
    const totalActiveMs = getLiveActiveMs(session, tracking);
    elements.totalActive.textContent = formatDuration(totalActiveMs);
  }
  if (elements.pageCount) {
    elements.pageCount.textContent = String(
      Object.keys(session.nodes || {}).length,
    );
  }
  if (elements.edgeCount) {
    elements.edgeCount.textContent = String(
      Object.keys(session.edges || {}).length,
    );
  }
  if (elements.sessionLabel) {
    elements.sessionLabel.textContent = session.label || "-";
  }
  if (elements.sessionLabelDetail) {
    elements.sessionLabelDetail.textContent = session.labelDetail || "";
  }
}

function scheduleDeferredRender() {
  if (realtimeDeferredRenderTimer) {
    return;
  }
  realtimeDeferredRenderTimer = setTimeout(() => {
    realtimeDeferredRenderTimer = null;
    renderDashboard();
  }, 120);
}

function scheduleFrameRender(key, renderFn) {
  if (!app.settings?.realtimeFrameAligned || typeof requestAnimationFrame !== "function") {
    renderFn();
    return;
  }
  if (app.cache.realtimeFrameQueue.has(key)) {
    return;
  }
  setBoundedCache(
    app.cache.realtimeFrameQueue,
    key,
    renderFn,
    CACHE_LIMITS.realtimeFrameQueue,
  );
  requestAnimationFrame(() => {
    const task = app.cache.realtimeFrameQueue.get(key);
    app.cache.realtimeFrameQueue.delete(key);
    if (task) {
      task();
    }
  });
}

function setupLiveTimer(settings) {
  if (realtimeLiveTimer) {
    clearInterval(realtimeLiveTimer);
    realtimeLiveTimer = null;
  }
  realtimeLiveTimer = setInterval(() => {
    if (!app.session || !app.state?.tracking) {
      return;
    }
    const tracking = app.state.tracking;
    if (!tracking.activeSince || !tracking.activeUrl) {
      return;
    }
    const total = getLiveActiveMs(app.session, tracking);
    if (elements.totalActive) {
      elements.totalActive.textContent = formatDuration(total);
    }
  }, 1000);
}

function updateLiveActiveBase(session) {
  if (!session) {
    app.liveActiveBase = 0;
    app.liveActiveSessionId = null;
    return;
  }
  const total = Object.values(session.nodes || {}).reduce(
    (sum, node) => sum + (node.activeMs || 0),
    0,
  );
  app.liveActiveBase = total;
  app.liveActiveSessionId = session.id;
}

function getLiveActiveMs(session, tracking) {
  if (!session) {
    return 0;
  }
  const isActiveSession = app.state?.activeSessionId === session.id;
  const base =
    app.liveActiveSessionId === session.id
      ? app.liveActiveBase
      : Object.values(session.nodes || {}).reduce(
          (sum, node) => sum + (node.activeMs || 0),
          0,
        );
  if (isActiveSession && tracking?.activeSince && tracking.activeUrl) {
    return base + Math.max(0, Date.now() - tracking.activeSince);
  }
  return base;
}

function applyOptimisticDelete(sessionId) {
  if (!sessionId || !app.state?.sessions?.[sessionId]) {
    return;
  }
  const session = app.state.sessions[sessionId];
  session.deleted = true;
  session.deletedAt = Date.now();
  if (app.session?.id === sessionId) {
    const next = app.state.sessionOrder
      .map((id) => app.state.sessions[id])
      .find((item) => item && !item.deleted);
    app.session = next || null;
  }
  app.cache.sessionListKey = "";
  populateSessionSelect();
  populateSessionList();
  if (app.session) {
    renderDashboard();
  } else {
    renderEmptyDashboard();
  }
}

function applyOptimisticRestore(sessionId) {
  if (!sessionId || !app.state?.sessions?.[sessionId]) {
    return;
  }
  const session = app.state.sessions[sessionId];
  session.deleted = false;
  session.deletedAt = null;
  if (!app.session) {
    app.session = session;
  }
  app.cache.sessionListKey = "";
  populateSessionSelect();
  populateSessionList();
  renderDashboard();
}

function applyOptimisticDeleteAll() {
  if (!app.state?.sessions) {
    return;
  }
  Object.values(app.state.sessions).forEach((session) => {
    session.deleted = true;
    session.deletedAt = Date.now();
  });
  app.session = null;
  app.cache.sessionListKey = "";
  populateSessionSelect();
  populateSessionList();
  renderEmptyDashboard();
}

function scheduleRealtimeReconcile() {
  if (realtimeReconcileTimer) {
    clearTimeout(realtimeReconcileTimer);
  }
  realtimeReconcileTimer = setTimeout(() => {
    realtimeReconcileTimer = null;
    if (realtimePort) {
      try {
        realtimePort.postMessage({ type: "request_snapshot" });
      } catch (error) {
        requestLiveStateSnapshot();
      }
      return;
    }
    requestLiveStateSnapshot();
  }, 1000);
}

function setupRealtimeWorker(settings) {
  if (realtimeWorker) {
    realtimeWorker.terminate();
    realtimeWorker = null;
  }
  clearRealtimeWorkerPending();
  if (!settings?.realtimeWorkerOffload) {
    return;
  }
  if (typeof Worker !== "function") {
    return;
  }
  let workerUrl = "realtime-worker.js";
  if (chrome?.runtime?.getURL) {
    workerUrl = chrome.runtime.getURL("dashboard/realtime-worker.js");
  }
  try {
    realtimeWorker = new Worker(workerUrl);
  } catch (error) {
    realtimeWorker = null;
    return;
  }
  realtimeWorker.onerror = () => {
    if (realtimeWorker) {
      realtimeWorker.terminate();
      realtimeWorker = null;
    }
    clearRealtimeWorkerPending();
  };
  realtimeWorker.onmessage = (event) => {
    const payload = event.data;
    if (!payload || typeof payload !== "object") {
      return;
    }
    const pending = realtimeWorkerPending.get(payload.requestId);
    if (pending) {
      realtimeWorkerPending.delete(payload.requestId);
      clearTimeout(pending.timeoutId);
      pending.resolve(payload);
    }
  };
}

function requestWorkerTask(type, payload) {
  if (!realtimeWorker) {
    return Promise.resolve(null);
  }
  if (realtimeWorkerPending.size >= MAX_WORKER_PENDING) {
    const oldestKey = realtimeWorkerPending.keys().next().value;
    const oldest = realtimeWorkerPending.get(oldestKey);
    if (oldest) {
      clearTimeout(oldest.timeoutId);
      oldest.resolve(null);
    }
    realtimeWorkerPending.delete(oldestKey);
  }
  const requestId = ++realtimeWorkerRequestId;
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      if (!realtimeWorkerPending.has(requestId)) {
        return;
      }
      realtimeWorkerPending.delete(requestId);
      resolve(null);
    }, WORKER_TASK_TIMEOUT_MS);
    realtimeWorkerPending.set(requestId, { resolve, timeoutId });
    try {
      realtimeWorker.postMessage({ type, requestId, payload });
    } catch (error) {
      clearTimeout(timeoutId);
      realtimeWorkerPending.delete(requestId);
      resolve(null);
    }
  });
}

function handleStorageChanged(changes, area) {
  if (area === "local" && changes[STORAGE_KEY]) {
    applyState(changes[STORAGE_KEY].newValue, "local");
    return;
  }
  if (area === "sync") {
    if (changes[SETTINGS_KEY]) {
      applySettings(changes[SETTINGS_KEY].newValue);
    }
    if (
      changes[SYNC_STATE_KEY] &&
      app.settings.syncEnabled &&
      isStateEmpty(app.state)
    ) {
      applyState(changes[SYNC_STATE_KEY].newValue, "sync");
    }
  }
}

async function loadStateFromStorage() {
  const warm = await loadStateFromBackground();
  if (warm && !isStateEmpty(warm)) {
    const normalized = normalizeState(warm);
    if (normalized && !isStateEmpty(normalized)) {
      return { state: normalized, source: "live" };
    }
  }
  const stored = await storageLocalGet(STORAGE_KEY);
  const localState = normalizeState(stored[STORAGE_KEY]);
  if (localState && !isStateEmpty(localState)) {
    return { state: localState, source: "local" };
  }
  if (app.settings.syncEnabled) {
    const syncStored = await storageSyncGet(SYNC_STATE_KEY);
    const syncState = normalizeState(syncStored[SYNC_STATE_KEY]);
    if (syncState && !isStateEmpty(syncState)) {
      return { state: syncState, source: "sync" };
    }
  }
  return { state: localState || null, source: "offline" };
}

async function loadStateFromBackground() {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return null;
  }
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (resolved) {
        return;
      }
      resolved = true;
      resolve(null);
    }, 80);
    chrome.runtime.sendMessage({ type: "get_state" }, (response) => {
      if (resolved) {
        return;
      }
      clearTimeout(timer);
      resolved = true;
      resolve(response?.state || null);
    });
  });
}

async function loadSettingsFromStorage() {
  const stored = await storageSyncGet(SETTINGS_KEY);
  return sanitizeSettings(stored[SETTINGS_KEY]);
}

function hasSummaryUi() {
  return !!(
    elements.briefSummary ||
    elements.detailedSummary ||
    elements.overviewSummary
  );
}

function shouldForceSummaryRefresh(prevSettings, nextSettings) {
  if (!prevSettings || !nextSettings) {
    return false;
  }
  const summaryKeys = [
    "tone",
    "summaryPersonality",
    "summaryVoice",
    "summaryTechnicality",
    "summaryEmojis",
    "summaryFormatting",
    "summaryBullets",
    "summaryMetaphors",
    "summaryLength",
    "summaryVerbosity",
  ];
  return summaryKeys.some(
    (key) => prevSettings[key] !== nextSettings[key],
  );
}

function applySettings(settings) {
  const previous = app.settings;
  const sanitized = sanitizeSettings(settings);
  if (shouldForceSummaryRefresh(previous, sanitized) && hasSummaryUi()) {
    app.forceSummaryRefresh = true;
  }
  app.settings = sanitized;
  app.cache.insightSettingsKey = buildInsightSettingsKey(app.settings);
  applyTheme(app.settings.theme);
  applyUiSettings(app.settings);
  renderSettings();
  renderFocusNote();
  configureRealtimeFeatures(previous, sanitized);
  populateSessionList();
  setLiveIndicator(app.liveState || "offline");
  if (app.session) {
    renderDashboard();
  }
  void hydrateSyncStateIfEnabled(previous, sanitized);
}

async function hydrateSyncStateIfEnabled(previousSettings, nextSettings) {
  if (!nextSettings?.syncEnabled || previousSettings?.syncEnabled) {
    return;
  }
  if (!isStateEmpty(app.state)) {
    return;
  }
  const syncStored = await storageSyncGet(SYNC_STATE_KEY);
  const syncState = normalizeState(syncStored[SYNC_STATE_KEY]);
  if (syncState && !isStateEmpty(syncState)) {
    applyState(syncState, "sync");
  }
}

function renderSettings() {
  if (!elements.settingsForm) {
    return;
  }
  if (elements.settingSessionTimeout) {
    elements.settingSessionTimeout.value = app.settings.sessionTimeoutMinutes;
  }
  if (elements.settingIdleTimeout) {
    elements.settingIdleTimeout.value = app.settings.userIdleMinutes;
  }
  if (elements.settingTheme) {
    elements.settingTheme.value = app.settings.theme;
  }
  if (elements.settingTone) {
    elements.settingTone.value = app.settings.tone;
  }
  if (elements.settingTrackingPaused) {
    elements.settingTrackingPaused.checked = !!app.settings.trackingPaused;
  }
  if (elements.settingProductiveSites) {
    elements.settingProductiveSites.value = formatSiteList(
      app.settings.productiveSites,
    );
  }
  if (elements.settingDistractingSites) {
    elements.settingDistractingSites.value = formatSiteList(
      app.settings.distractingSites,
    );
  }
  if (elements.settingCategoryOverrides) {
    elements.settingCategoryOverrides.value = formatCategoryOverrides(
      app.settings.categoryOverrides,
    );
  }
  if (elements.settingSync) {
    elements.settingSync.checked = !!app.settings.syncEnabled;
  }
  if (elements.settingDirectCallouts) {
    elements.settingDirectCallouts.checked = !!app.settings.directCallouts;
  }
  if (elements.settingIntentDriftAlerts) {
    elements.settingIntentDriftAlerts.checked =
      !!app.settings.intentDriftAlerts;
  }
  if (elements.settingIntentDriftSensitivity) {
    elements.settingIntentDriftSensitivity.value =
      app.settings.intentDriftSensitivity || "balanced";
  }
  if (elements.settingSummaryAutoRefresh) {
    elements.settingSummaryAutoRefresh.checked =
      !!app.settings.summaryAutoRefresh;
  }
  if (elements.settingSummaryPersonality) {
    elements.settingSummaryPersonality.value =
      app.settings.summaryPersonality || DEFAULT_SETTINGS.summaryPersonality;
  }
  if (elements.settingSummaryEmojis) {
    elements.settingSummaryEmojis.value =
      app.settings.summaryEmojis || DEFAULT_SETTINGS.summaryEmojis;
  }
  if (elements.settingSummaryFormatting) {
    elements.settingSummaryFormatting.value =
      app.settings.summaryFormatting || DEFAULT_SETTINGS.summaryFormatting;
  }
  if (elements.settingSummaryBullets) {
    elements.settingSummaryBullets.checked = !!app.settings.summaryBullets;
  }
  if (elements.settingSummaryMetaphors) {
    elements.settingSummaryMetaphors.checked = !!app.settings.summaryMetaphors;
  }
  if (elements.settingSummaryLength) {
    elements.settingSummaryLength.value =
      app.settings.summaryLength || DEFAULT_SETTINGS.summaryLength;
  }
  if (elements.settingSummaryVerbosity) {
    elements.settingSummaryVerbosity.value =
      app.settings.summaryVerbosity || DEFAULT_SETTINGS.summaryVerbosity;
  }
  if (elements.settingSummaryTechnicality) {
    elements.settingSummaryTechnicality.value =
      app.settings.summaryTechnicality || DEFAULT_SETTINGS.summaryTechnicality;
  }
  if (elements.settingSummaryVoice) {
    elements.settingSummaryVoice.value =
      app.settings.summaryVoice || DEFAULT_SETTINGS.summaryVoice;
  }
  if (elements.settingSummaryCooldown) {
    elements.settingSummaryCooldown.value =
      app.settings.summaryRefreshCooldownMinutes ??
      DEFAULT_SETTINGS.summaryRefreshCooldownMinutes;
  }
  if (elements.settingSummaryCache) {
    elements.settingSummaryCache.value =
      app.settings.summaryCacheMinutes ?? DEFAULT_SETTINGS.summaryCacheMinutes;
  }
  if (elements.settingOllamaEndpoint) {
    elements.settingOllamaEndpoint.value =
      app.settings.ollamaEndpoint || OLLAMA_ENDPOINT;
  }
  if (elements.settingOllamaModel) {
    elements.settingOllamaModel.value =
      app.settings.ollamaModel || OLLAMA_MODEL;
  }
  if (elements.settingRealtimeStreamEnabled) {
    elements.settingRealtimeStreamEnabled.checked =
      !!app.settings.realtimeStreamEnabled;
  }
  if (elements.settingRealtimeDeltaSync) {
    elements.settingRealtimeDeltaSync.checked =
      !!app.settings.realtimeDeltaSync;
  }
  if (elements.settingRealtimePortPush) {
    elements.settingRealtimePortPush.checked =
      !!app.settings.realtimePortPush;
  }
  if (elements.settingRealtimeLiveTimers) {
    elements.settingRealtimeLiveTimers.checked =
      !!app.settings.realtimeLiveTimers;
  }
  if (elements.settingRealtimeBatching) {
    elements.settingRealtimeBatching.checked =
      !!app.settings.realtimeBatchUpdates;
  }
  if (elements.settingRealtimeBatchWindow) {
    elements.settingRealtimeBatchWindow.value =
      app.settings.realtimeBatchWindowMs ?? DEFAULT_SETTINGS.realtimeBatchWindowMs;
  }
  if (elements.settingRealtimePriorityUpdates) {
    elements.settingRealtimePriorityUpdates.checked =
      !!app.settings.realtimePriorityUpdates;
  }
  if (elements.settingRealtimeOptimisticUi) {
    elements.settingRealtimeOptimisticUi.checked =
      !!app.settings.realtimeOptimisticUi;
  }
  if (elements.settingRealtimeWorkerOffload) {
    elements.settingRealtimeWorkerOffload.checked =
      !!app.settings.realtimeWorkerOffload;
  }
  if (elements.settingRealtimeFrameAligned) {
    elements.settingRealtimeFrameAligned.checked =
      !!app.settings.realtimeFrameAligned;
  }
  if (elements.settingDashboardNote) {
    elements.settingDashboardNote.value = app.settings.dashboardFocusNote || "";
  }
  if (elements.settingPopupNote) {
    elements.settingPopupNote.value = app.settings.popupNote || "";
  }
  if (elements.settingDashboardButtonLabel) {
    elements.settingDashboardButtonLabel.value =
      app.settings.dashboardButtonLabel || "";
  }
  if (elements.settingPopupLayout) {
    elements.settingPopupLayout.value =
      app.settings.popupLayout || DEFAULT_SETTINGS.popupLayout;
  }
  if (elements.settingPopupDensity) {
    elements.settingPopupDensity.value =
      app.settings.popupDensity || DEFAULT_SETTINGS.popupDensity;
  }
  if (elements.settingPopupAction) {
    elements.settingPopupAction.value =
      app.settings.popupPrimaryAction || DEFAULT_SETTINGS.popupPrimaryAction;
  }
  if (elements.settingPopupMicroNote) {
    elements.settingPopupMicroNote.value = app.settings.popupMicroNote || "";
  }
  if (elements.settingPopupMood) {
    elements.settingPopupMood.value =
      app.settings.popupMood || DEFAULT_SETTINGS.popupMood;
  }
  if (elements.settingPopupShowActiveTime) {
    elements.settingPopupShowActiveTime.checked =
      app.settings.popupQuickGlance?.includes("activeTime") ?? false;
  }
  if (elements.settingPopupShowTopDomain) {
    elements.settingPopupShowTopDomain.checked =
      app.settings.popupQuickGlance?.includes("topDomain") ?? false;
  }
  if (elements.settingPopupShowDistraction) {
    elements.settingPopupShowDistraction.checked =
      app.settings.popupQuickGlance?.includes("distractionScore") ?? false;
  }
  if (elements.settingPopupShowSessionLabel) {
    elements.settingPopupShowSessionLabel.checked =
      app.settings.popupQuickGlance?.includes("sessionLabel") ?? false;
  }
  if (elements.settingPopupShowLastAction) {
    elements.settingPopupShowLastAction.checked =
      app.settings.popupQuickGlance?.includes("lastAction") ?? false;
  }
  if (elements.settingDashboardStoryMode) {
    elements.settingDashboardStoryMode.checked =
      !!app.settings.dashboardStoryMode;
  }
  if (elements.settingSessionListStyle) {
    elements.settingSessionListStyle.value =
      app.settings.sessionListStyle || DEFAULT_SETTINGS.sessionListStyle;
  }
  if (elements.settingPinActiveSession) {
    elements.settingPinActiveSession.checked = !!app.settings.pinActiveSession;
  }
  if (elements.settingFocusPrompts) {
    elements.settingFocusPrompts.value = formatTextList(
      app.settings.focusPrompts,
    );
  }
    if (elements.settingOutcomeHighlights) {
      elements.settingOutcomeHighlights.checked =
        !!app.settings.showOutcomeHighlights;
    }
    if (elements.settingDashboardShowOverview) {
      elements.settingDashboardShowOverview.checked =
        !!app.settings.dashboardSections?.overview;
    }
  if (elements.settingDashboardShowSessions) {
    elements.settingDashboardShowSessions.checked =
      !!app.settings.dashboardSections?.sessions;
  }
  if (elements.settingDashboardShowTimeline) {
    elements.settingDashboardShowTimeline.checked =
      !!app.settings.dashboardSections?.timeline;
  }
  if (elements.settingDashboardShowGraph) {
    elements.settingDashboardShowGraph.checked =
      !!app.settings.dashboardSections?.graph;
  }
  if (elements.settingDashboardShowStats) {
    elements.settingDashboardShowStats.checked =
      !!app.settings.dashboardSections?.stats;
  }
  if (elements.settingDashboardShowHonesty) {
    elements.settingDashboardShowHonesty.checked =
      !!app.settings.dashboardSections?.honesty;
  }
  if (elements.settingDashboardShowCallouts) {
    elements.settingDashboardShowCallouts.checked =
      !!app.settings.dashboardSections?.callouts;
  }
  if (elements.settingAccentColor) {
    if (app.settings.accentColor) {
      elements.settingAccentColor.value = app.settings.accentColor;
    } else if (document.body) {
      const computed = getComputedStyle(document.body)
        .getPropertyValue("--accent")
        .trim();
      if (computed) {
        elements.settingAccentColor.value = computed;
      }
    }
  }
  if (elements.settingTypographyStyle) {
    elements.settingTypographyStyle.value =
      app.settings.typographyStyle || DEFAULT_SETTINGS.typographyStyle;
  }
  if (elements.settingUiDensity) {
    elements.settingUiDensity.value = app.settings.uiDensity || "comfortable";
  }
  if (elements.settingReduceMotion) {
    elements.settingReduceMotion.checked = !!app.settings.reduceMotion;
  }
  if (elements.settingSessionListLimit) {
    elements.settingSessionListLimit.value =
      app.settings.sessionListLimit || DEFAULT_SETTINGS.sessionListLimit;
  }
  updateSettingsPreview(app.settings);
  updateUndoButtonState();
}

function scheduleSettingsSave() {
  if (!canUseChromeStorage()) {
    return;
  }
  if (settingsSaveTimer) {
    clearTimeout(settingsSaveTimer);
  }
  settingsSaveTimer = setTimeout(() => {
    settingsSaveTimer = null;
    saveSettings({ silent: true });
  }, 250);
}

function settingsEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (error) {
    return false;
  }
}

function getUndoSnapshot() {
  try {
    const raw = localStorage.getItem(UNDO_SETTINGS_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function setUndoSnapshot(settings) {
  try {
    localStorage.setItem(UNDO_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    // Ignore storage errors.
  }
  updateUndoButtonState();
}

function getPreviewLabel(value, fallback) {
  if (!value) {
    return fallback;
  }
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function updateSettingsPreview(settings) {
  if (!elements.settingsPreview) {
    return;
  }
  const previewSettings = sanitizeSettings(settings);
  const theme = previewSettings.theme || DEFAULT_SETTINGS.theme;
  const density = previewSettings.uiDensity || DEFAULT_SETTINGS.uiDensity;
  const typography =
    previewSettings.typographyStyle || DEFAULT_SETTINGS.typographyStyle;
  const accent = previewSettings.accentColor || "";

  elements.settingsPreview.dataset.theme = theme;
  elements.settingsPreview.dataset.density = density;
  elements.settingsPreview.dataset.typography = typography;
  if (accent) {
    elements.settingsPreview.style.setProperty("--preview-accent", accent);
    const ink = accentInkColor(accent);
    if (ink) {
      elements.settingsPreview.style.setProperty("--preview-accent-ink", ink);
    }
  } else {
    elements.settingsPreview.style.removeProperty("--preview-accent");
    elements.settingsPreview.style.removeProperty("--preview-accent-ink");
  }

  if (elements.previewThemeLabel) {
    elements.previewThemeLabel.textContent = getPreviewLabel(theme, "Theme");
  }
  if (elements.previewDensityLabel) {
    elements.previewDensityLabel.textContent = getPreviewLabel(
      density,
      "Density",
    );
  }
  if (elements.previewTypographyLabel) {
    elements.previewTypographyLabel.textContent = getPreviewLabel(
      typography,
      "Type",
    );
  }
  if (elements.previewAccentLabel) {
    elements.previewAccentLabel.textContent = accent ? "Accent" : "Accent";
  }
}

function updateUndoButtonState() {
  if (!elements.undoSettings) {
    return;
  }
  const hasSnapshot = !!getUndoSnapshot();
  elements.undoSettings.disabled = !hasSnapshot;
  elements.undoSettings.classList.toggle("is-visible", hasSnapshot);
}

async function restoreUndoSettings() {
  if (!canUseChromeStorage()) {
    return;
  }
  const snapshot = getUndoSnapshot();
  if (!snapshot) {
    return;
  }
  setUndoSnapshot(app.settings);
  const sanitized = sanitizeSettings(snapshot);
  localStorage.setItem(
    DIRECT_CALLOUTS_STORAGE_KEY,
    sanitized.directCallouts ? "true" : "false",
  );
  await storageSyncSet({ [SETTINGS_KEY]: sanitized });
  applySettings(sanitized);
  setSettingsStatus("Undo applied.");
}

async function resetSettingsToDefault() {
  if (!canUseChromeStorage()) {
    return;
  }
  if (
    typeof confirm === "function" &&
    !confirm("Reset all settings to defaults?")
  ) {
    return;
  }
  setUndoSnapshot(app.settings);
  const sanitized = sanitizeSettings({ ...DEFAULT_SETTINGS });
  localStorage.setItem(
    DIRECT_CALLOUTS_STORAGE_KEY,
    sanitized.directCallouts ? "true" : "false",
  );
  await storageSyncSet({ [SETTINGS_KEY]: sanitized });
  applySettings(sanitized);
  setSettingsStatus("Defaults restored.");
}

function collectSettingsFromForm() {
  const draft = { ...app.settings };
  if (elements.settingSessionTimeout) {
    draft.sessionTimeoutMinutes = Number(elements.settingSessionTimeout.value);
  }
  if (elements.settingIdleTimeout) {
    draft.userIdleMinutes = Number(elements.settingIdleTimeout.value);
  }
  if (elements.settingTheme) {
    draft.theme = elements.settingTheme.value;
  }
  if (elements.settingTone) {
    draft.tone = elements.settingTone.value;
  }
  if (elements.settingTrackingPaused) {
    draft.trackingPaused = elements.settingTrackingPaused.checked;
  }
  if (elements.settingProductiveSites) {
    draft.productiveSites = parseSiteList(elements.settingProductiveSites.value);
  }
  if (elements.settingDistractingSites) {
    draft.distractingSites = parseSiteList(
      elements.settingDistractingSites.value,
    );
  }
  if (elements.settingCategoryOverrides) {
    draft.categoryOverrides = parseCategoryOverrides(
      elements.settingCategoryOverrides.value,
    );
  }
  if (elements.settingSync) {
    draft.syncEnabled = elements.settingSync.checked;
  }
  if (elements.settingDirectCallouts) {
    draft.directCallouts = elements.settingDirectCallouts.checked;
  }
  if (elements.settingIntentDriftAlerts) {
    draft.intentDriftAlerts = elements.settingIntentDriftAlerts.checked;
  }
  if (elements.settingIntentDriftSensitivity) {
    draft.intentDriftSensitivity =
      elements.settingIntentDriftSensitivity.value;
  }
  if (elements.settingSummaryAutoRefresh) {
    draft.summaryAutoRefresh = elements.settingSummaryAutoRefresh.checked;
  }
  if (elements.settingSummaryPersonality) {
    draft.summaryPersonality = elements.settingSummaryPersonality.value;
  }
  if (elements.settingSummaryEmojis) {
    draft.summaryEmojis = elements.settingSummaryEmojis.value;
  }
  if (elements.settingSummaryFormatting) {
    draft.summaryFormatting = elements.settingSummaryFormatting.value;
  }
  if (elements.settingSummaryBullets) {
    draft.summaryBullets = elements.settingSummaryBullets.checked;
  }
  if (elements.settingSummaryMetaphors) {
    draft.summaryMetaphors = elements.settingSummaryMetaphors.checked;
  }
  if (elements.settingSummaryLength) {
    draft.summaryLength = elements.settingSummaryLength.value;
  }
  if (elements.settingSummaryVerbosity) {
    draft.summaryVerbosity = elements.settingSummaryVerbosity.value;
  }
  if (elements.settingSummaryTechnicality) {
    draft.summaryTechnicality = elements.settingSummaryTechnicality.value;
  }
  if (elements.settingSummaryVoice) {
    draft.summaryVoice = elements.settingSummaryVoice.value;
  }
  if (elements.settingSummaryCooldown) {
    draft.summaryRefreshCooldownMinutes = Number(
      elements.settingSummaryCooldown.value,
    );
  }
  if (elements.settingSummaryCache) {
    draft.summaryCacheMinutes = Number(elements.settingSummaryCache.value);
  }
  if (elements.settingOllamaEndpoint) {
    draft.ollamaEndpoint = elements.settingOllamaEndpoint.value;
  }
  if (elements.settingOllamaModel) {
    draft.ollamaModel = elements.settingOllamaModel.value;
  }
  if (elements.settingRealtimeStreamEnabled) {
    draft.realtimeStreamEnabled = elements.settingRealtimeStreamEnabled.checked;
  }
  if (elements.settingRealtimeDeltaSync) {
    draft.realtimeDeltaSync = elements.settingRealtimeDeltaSync.checked;
  }
  if (elements.settingRealtimePortPush) {
    draft.realtimePortPush = elements.settingRealtimePortPush.checked;
  }
  if (elements.settingRealtimeLiveTimers) {
    draft.realtimeLiveTimers = elements.settingRealtimeLiveTimers.checked;
  }
  if (elements.settingRealtimeBatching) {
    draft.realtimeBatchUpdates = elements.settingRealtimeBatching.checked;
  }
  if (elements.settingRealtimeBatchWindow) {
    draft.realtimeBatchWindowMs = Number(
      elements.settingRealtimeBatchWindow.value,
    );
  }
  if (elements.settingRealtimePriorityUpdates) {
    draft.realtimePriorityUpdates =
      elements.settingRealtimePriorityUpdates.checked;
  }
  if (elements.settingRealtimeOptimisticUi) {
    draft.realtimeOptimisticUi = elements.settingRealtimeOptimisticUi.checked;
  }
  if (elements.settingRealtimeWorkerOffload) {
    draft.realtimeWorkerOffload =
      elements.settingRealtimeWorkerOffload.checked;
  }
  if (elements.settingRealtimeFrameAligned) {
    draft.realtimeFrameAligned = elements.settingRealtimeFrameAligned.checked;
  }
  if (elements.settingDashboardNote) {
    draft.dashboardFocusNote = elements.settingDashboardNote.value;
  }
  if (elements.settingPopupNote) {
    draft.popupNote = elements.settingPopupNote.value;
  }
  if (elements.settingDashboardButtonLabel) {
    draft.dashboardButtonLabel = elements.settingDashboardButtonLabel.value;
  }
  if (elements.settingPopupLayout) {
    draft.popupLayout = elements.settingPopupLayout.value;
  }
  if (elements.settingPopupDensity) {
    draft.popupDensity = elements.settingPopupDensity.value;
  }
  if (elements.settingPopupAction) {
    draft.popupPrimaryAction = elements.settingPopupAction.value;
  }
  if (elements.settingPopupMicroNote) {
    draft.popupMicroNote = elements.settingPopupMicroNote.value;
  }
  if (elements.settingPopupMood) {
    draft.popupMood = elements.settingPopupMood.value;
  }
  if (elements.settingDashboardStoryMode) {
    draft.dashboardStoryMode = elements.settingDashboardStoryMode.checked;
  }
  if (elements.settingSessionListStyle) {
    draft.sessionListStyle = elements.settingSessionListStyle.value;
  }
  if (elements.settingPinActiveSession) {
    draft.pinActiveSession = elements.settingPinActiveSession.checked;
  }
  if (elements.settingFocusPrompts) {
    draft.focusPrompts = elements.settingFocusPrompts.value;
  }
    if (elements.settingOutcomeHighlights) {
      draft.showOutcomeHighlights = elements.settingOutcomeHighlights.checked;
    }
    if (elements.settingAccentColor) {
      draft.accentColor = elements.settingAccentColor.value;
    }
  if (elements.settingTypographyStyle) {
    draft.typographyStyle = elements.settingTypographyStyle.value;
  }
  if (elements.settingUiDensity) {
    draft.uiDensity = elements.settingUiDensity.value;
  }
  if (elements.settingReduceMotion) {
    draft.reduceMotion = elements.settingReduceMotion.checked;
  }
  if (elements.settingSessionListLimit) {
    draft.sessionListLimit = Number(elements.settingSessionListLimit.value);
  }

  const quickGlanceFields = [
    elements.settingPopupShowActiveTime,
    elements.settingPopupShowTopDomain,
    elements.settingPopupShowDistraction,
    elements.settingPopupShowSessionLabel,
    elements.settingPopupShowLastAction,
  ];
  if (quickGlanceFields.some(Boolean)) {
    const popupQuickGlance = [];
    if (elements.settingPopupShowActiveTime?.checked) {
      popupQuickGlance.push("activeTime");
    }
    if (elements.settingPopupShowTopDomain?.checked) {
      popupQuickGlance.push("topDomain");
    }
    if (elements.settingPopupShowDistraction?.checked) {
      popupQuickGlance.push("distractionScore");
    }
    if (elements.settingPopupShowSessionLabel?.checked) {
      popupQuickGlance.push("sessionLabel");
    }
    if (elements.settingPopupShowLastAction?.checked) {
      popupQuickGlance.push("lastAction");
    }
    draft.popupQuickGlance = popupQuickGlance;
  }

  const sectionFields = {
    overview: elements.settingDashboardShowOverview,
    sessions: elements.settingDashboardShowSessions,
    timeline: elements.settingDashboardShowTimeline,
    graph: elements.settingDashboardShowGraph,
    stats: elements.settingDashboardShowStats,
    honesty: elements.settingDashboardShowHonesty,
    callouts: elements.settingDashboardShowCallouts,
  };
  if (Object.values(sectionFields).some(Boolean)) {
    const base =
      app.settings.dashboardSections || DEFAULT_SETTINGS.dashboardSections;
    draft.dashboardSections = {
      overview: sectionFields.overview
        ? sectionFields.overview.checked
        : base.overview,
      sessions: sectionFields.sessions
        ? sectionFields.sessions.checked
        : base.sessions,
      timeline: sectionFields.timeline
        ? sectionFields.timeline.checked
        : base.timeline,
      graph: sectionFields.graph ? sectionFields.graph.checked : base.graph,
      stats: sectionFields.stats ? sectionFields.stats.checked : base.stats,
      honesty: sectionFields.honesty
        ? sectionFields.honesty.checked
        : base.honesty,
      callouts: sectionFields.callouts
        ? sectionFields.callouts.checked
        : base.callouts,
    };
  }

  return draft;
}

async function saveSettings(options = {}) {
  if (!canUseChromeStorage()) {
    return;
  }
  if (!elements.settingsForm) {
    return;
  }
  const draft = collectSettingsFromForm();
  const sanitized = sanitizeSettings(draft);
  if (!settingsEqual(app.settings, sanitized)) {
    setUndoSnapshot(app.settings);
  }
  localStorage.setItem(
    DIRECT_CALLOUTS_STORAGE_KEY,
    sanitized.directCallouts ? "true" : "false",
  );
  applySettings(sanitized);
  await storageSyncSet({ [SETTINGS_KEY]: sanitized });
  if (!options.silent) {
    setSettingsStatus("Saved.");
  }
}

function setSettingsStatus(message) {
  if (!elements.settingsStatus) {
    return;
  }
  elements.settingsStatus.textContent = message;
  if (message) {
    setTimeout(() => {
      elements.settingsStatus.textContent = "";
    }, 2200);
  }
}

function showToast(message, actionLabel, actionFn) {
  if (!elements.toast || !elements.toastMessage) {
    return;
  }
  elements.toastMessage.textContent = message;
  if (elements.toastAction) {
    if (actionLabel && typeof actionFn === "function") {
      elements.toastAction.textContent = actionLabel;
      elements.toastAction.hidden = false;
      toastActionHandler = actionFn;
    } else {
      elements.toastAction.hidden = true;
      toastActionHandler = null;
    }
  }
  elements.toast.classList.add("show");
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(hideToast, 6000);
}

function hideToast() {
  if (!elements.toast) {
    return;
  }
  elements.toast.classList.remove("show");
  if (elements.toastAction) {
    toastActionHandler = null;
  }
}

async function exportSessionData() {
  if (!canUseChromeStorage()) {
    showToast("Storage unavailable.");
    return;
  }
  if (
    typeof Blob === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    showToast("Export unavailable in this environment.");
    return;
  }
  let payload = null;
  if (app.state && !isStateEmpty(app.state)) {
    payload = app.state;
  }
  if (!payload) {
    const warm = await loadStateFromBackground();
    if (warm && !isStateEmpty(warm)) {
      payload = warm;
    }
  }
  if (!payload) {
    const stored = await storageLocalGet(STORAGE_KEY);
    payload = stored[STORAGE_KEY] || null;
  }
  if (!payload && app.settings.syncEnabled) {
    const syncStored = await storageSyncGet(SYNC_STATE_KEY);
    payload = syncStored[SYNC_STATE_KEY] || null;
  }
  if (!payload) {
    showToast("No session data to export.");
    return;
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `rabbit-hole-sessions-${stamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast("Export ready.");
}

function sanitizeSettings(settings) {
  const next = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  next.sessionTimeoutMinutes = clampNumber(
    next.sessionTimeoutMinutes,
    3,
    120,
    15,
  );
  next.userIdleMinutes = clampNumber(next.userIdleMinutes, 1, 30, 3);
  next.theme = ensureChoice(next.theme, THEME_LIST, DEFAULT_SETTINGS.theme);
  next.tone = next.tone === "direct" ? "direct" : "neutral";
  next.syncEnabled = !!next.syncEnabled;
  next.trackingPaused = !!next.trackingPaused;
  next.summaryAutoRefresh = !!next.summaryAutoRefresh;
  if (settings?.directCallouts === undefined) {
    const legacy = localStorage.getItem(DIRECT_CALLOUTS_STORAGE_KEY);
    next.directCallouts = legacy === "true";
  } else {
    next.directCallouts = !!next.directCallouts;
  }
  next.intentDriftAlerts = !!next.intentDriftAlerts;
  next.intentDriftSensitivity = ensureChoice(
    next.intentDriftSensitivity,
    ["low", "balanced", "high"],
    "balanced",
  );
  next.productiveSites = normalizeSiteList(next.productiveSites);
  next.distractingSites = normalizeSiteList(next.distractingSites);
  if (!next.categoryOverrides || typeof next.categoryOverrides !== "object") {
    next.categoryOverrides = {};
  }
  const sanitizedOverrides = {};
  Object.entries(next.categoryOverrides).forEach(([pattern, category]) => {
    const normalizedPattern = normalizeDomainPattern(pattern);
    const normalizedCategory = canonicalizeCategory(category);
    if (!normalizedPattern || !normalizedCategory) {
      return;
    }
    sanitizedOverrides[normalizedPattern] = normalizedCategory;
  });
  next.categoryOverrides = sanitizedOverrides;
  next.dashboardFocusNote = sanitizeText(next.dashboardFocusNote, 160, "");
  next.popupNote = sanitizeText(next.popupNote, 160, "");
  next.dashboardButtonLabel = sanitizeText(
    next.dashboardButtonLabel,
    40,
    DEFAULT_SETTINGS.dashboardButtonLabel,
  );
  next.uiDensity = next.uiDensity === "compact" ? "compact" : "comfortable";
  next.reduceMotion = !!next.reduceMotion;
  next.sessionListLimit = clampNumber(
    next.sessionListLimit,
    3,
    40,
    DEFAULT_SETTINGS.sessionListLimit,
  );
  next.ollamaEndpoint = sanitizeEndpoint(next.ollamaEndpoint, OLLAMA_ENDPOINT);
  next.ollamaModel = sanitizeText(next.ollamaModel, 80, OLLAMA_MODEL);
  next.popupLayout = ensureChoice(
    next.popupLayout,
    POPUP_LAYOUTS,
    DEFAULT_SETTINGS.popupLayout,
  );
  next.popupDensity = ensureChoice(
    next.popupDensity,
    POPUP_DENSITIES,
    DEFAULT_SETTINGS.popupDensity,
  );
  next.popupPrimaryAction = ensureChoice(
    next.popupPrimaryAction,
    POPUP_ACTIONS,
    DEFAULT_SETTINGS.popupPrimaryAction,
  );
  next.popupMicroNote = sanitizeText(next.popupMicroNote, 90, "");
  next.popupMood = sanitizeText(next.popupMood, 12, DEFAULT_SETTINGS.popupMood);
  if (!Array.isArray(next.popupQuickGlance)) {
    next.popupQuickGlance = DEFAULT_SETTINGS.popupQuickGlance.slice();
  }
  next.popupQuickGlance = next.popupQuickGlance.filter((item) =>
    POPUP_QUICK_GLANCE_KEYS.includes(item),
  );
  next.dashboardStoryMode = !!next.dashboardStoryMode;
  next.sessionListStyle = ensureChoice(
    next.sessionListStyle,
    SESSION_LIST_STYLES,
    DEFAULT_SETTINGS.sessionListStyle,
  );
    next.pinActiveSession = !!next.pinActiveSession;
    next.focusPrompts = normalizeTextList(next.focusPrompts, 10, 120);
    next.showOutcomeHighlights = !!next.showOutcomeHighlights;
    const sectionDefaults = DEFAULT_SETTINGS.dashboardSections;
    const incomingSections =
      next.dashboardSections && typeof next.dashboardSections === "object"
      ? next.dashboardSections
      : {};
  next.dashboardSections = {
    overview: incomingSections.overview ?? sectionDefaults.overview,
    sessions: incomingSections.sessions ?? sectionDefaults.sessions,
    timeline: incomingSections.timeline ?? sectionDefaults.timeline,
    graph: incomingSections.graph ?? sectionDefaults.graph,
    stats: incomingSections.stats ?? sectionDefaults.stats,
    honesty: incomingSections.honesty ?? sectionDefaults.honesty,
    callouts: incomingSections.callouts ?? sectionDefaults.callouts,
  };
  next.accentColor = sanitizeColor(next.accentColor);
  next.typographyStyle = ensureChoice(
    next.typographyStyle,
    TYPOGRAPHY_STYLES,
    DEFAULT_SETTINGS.typographyStyle,
  );
  next.summaryPersonality = ensureChoice(
    next.summaryPersonality,
    SUMMARY_PERSONALITIES,
    DEFAULT_SETTINGS.summaryPersonality,
  );
  next.summaryEmojis = ensureChoice(
    next.summaryEmojis,
    SUMMARY_EMOJI_LEVELS,
    DEFAULT_SETTINGS.summaryEmojis,
  );
  next.summaryFormatting = ensureChoice(
    next.summaryFormatting,
    SUMMARY_FORMATTING,
    DEFAULT_SETTINGS.summaryFormatting,
  );
  next.summaryBullets = !!next.summaryBullets;
  next.summaryMetaphors = !!next.summaryMetaphors;
  next.summaryLength = ensureChoice(
    next.summaryLength,
    SUMMARY_LENGTHS,
    DEFAULT_SETTINGS.summaryLength,
  );
  next.summaryVerbosity = ensureChoice(
    next.summaryVerbosity,
    SUMMARY_VERBOSITY,
    DEFAULT_SETTINGS.summaryVerbosity,
  );
  next.summaryTechnicality = ensureChoice(
    next.summaryTechnicality,
    SUMMARY_TECHNICALITY,
    DEFAULT_SETTINGS.summaryTechnicality,
  );
  next.summaryVoice = ensureChoice(
    next.summaryVoice,
    SUMMARY_VOICES,
    DEFAULT_SETTINGS.summaryVoice,
  );
  next.summaryRefreshCooldownMinutes = clampNumber(
    next.summaryRefreshCooldownMinutes,
    0,
    120,
    DEFAULT_SETTINGS.summaryRefreshCooldownMinutes,
  );
  next.summaryCacheMinutes = clampNumber(
    next.summaryCacheMinutes,
    0,
    1440,
    DEFAULT_SETTINGS.summaryCacheMinutes,
  );
  next.realtimeStreamEnabled = !!next.realtimeStreamEnabled;
  next.realtimeDeltaSync = !!next.realtimeDeltaSync;
  next.realtimePortPush = !!next.realtimePortPush;
  next.realtimeLiveTimers = !!next.realtimeLiveTimers;
  next.realtimeBatchUpdates = !!next.realtimeBatchUpdates;
  next.realtimeBatchWindowMs = clampNumber(
    next.realtimeBatchWindowMs,
    250,
    500,
    DEFAULT_SETTINGS.realtimeBatchWindowMs,
  );
  next.realtimePriorityUpdates = !!next.realtimePriorityUpdates;
  next.realtimeOptimisticUi = !!next.realtimeOptimisticUi;
  next.realtimeWorkerOffload = !!next.realtimeWorkerOffload;
  next.realtimeFrameAligned = !!next.realtimeFrameAligned;
  return next;
}

function sanitizeText(value, maxLength, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function sanitizeEndpoint(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  try {
    const candidate = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `http://${trimmed}`;
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return fallback;
    }
    return url.toString();
  } catch (error) {
    return fallback;
  }
}

function canonicalizeCategory(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const normalized = trimmed.toLowerCase();
  const match = CATEGORY_LIST.find(
    (category) => category.toLowerCase() === normalized,
  );
  return match || "";
}

function normalizeDomainPattern(value) {
  if (typeof value !== "string") {
    return "";
  }
  let trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.startsWith("#")) {
    return "";
  }
  let prefix = "";
  if (trimmed.startsWith("*.")) {
    prefix = "*.";
    trimmed = trimmed.slice(2);
  } else if (trimmed.startsWith(".")) {
    prefix = ".";
    trimmed = trimmed.slice(1);
  }
  trimmed = trimmed.trim();
  if (!trimmed) {
    return "";
  }
  const parseHost = (input) => {
    try {
      return new URL(input).hostname.toLowerCase();
    } catch (error) {
      return "";
    }
  };
  const host = trimmed.includes("://")
    ? parseHost(trimmed)
    : trimmed.includes("/") || trimmed.includes(":")
      ? parseHost(`https://${trimmed}`)
      : trimmed;
  if (!host) {
    return "";
  }
  return `${prefix}${host}`;
}

function normalizeSiteList(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeDomainPattern(String(entry || "")))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return parseSiteList(value);
  }
  return [];
}

function parseSiteList(text) {
  if (!text) {
    return [];
  }
  return text
    .split(/\r?\n|,/)
    .map((entry) => normalizeDomainPattern(entry))
    .filter(Boolean);
}

function formatSiteList(list) {
  if (!Array.isArray(list) || !list.length) {
    return "";
  }
  return [...list].sort().join("\n");
}

function parseCategoryOverrides(text) {
  const overrides = {};
  if (!text) {
    return overrides;
  }
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    const [patternPart, categoryPart] = trimmed
      .split("=")
      .map((part) => part.trim());
    const pattern = normalizeDomainPattern(patternPart);
    const category = canonicalizeCategory(categoryPart);
    if (!pattern || !category) {
      return;
    }
    overrides[pattern] = category;
  });
  return overrides;
}

function formatCategoryOverrides(overrides) {
  if (!overrides || !Object.keys(overrides).length) {
    return "";
  }
  return Object.entries(overrides)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([pattern, category]) => `${pattern}=${category}`)
    .join("\n");
}

function ensureChoice(value, options, fallback) {
  return options.includes(value) ? value : fallback;
}

function normalizeTextList(value, maxItems = 12, maxLength = 80) {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n/)
      : [];
  const cleaned = items
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item)
    .map((item) => item.slice(0, maxLength));
  const unique = Array.from(new Set(cleaned));
  return unique.slice(0, maxItems);
}

function formatTextList(list) {
  if (!Array.isArray(list)) {
    return "";
  }
  return list.join("\n");
}

function sanitizeColor(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [r, g, b] = trimmed.slice(1).split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return "";
}

function hexToRgb(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) {
    return null;
  }
  const value = match[1];
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex(rgb) {
  if (!rgb) {
    return "";
  }
  const toHex = (channel) =>
    Math.min(255, Math.max(0, Math.round(channel)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function mixHex(hex, mix, amount) {
  const base = hexToRgb(hex);
  const other = hexToRgb(mix);
  if (!base || !other) {
    return "";
  }
  const weight = Math.min(1, Math.max(0, amount));
  return rgbToHex({
    r: base.r + (other.r - base.r) * weight,
    g: base.g + (other.g - base.g) * weight,
    b: base.b + (other.b - base.b) * weight,
  });
}

function accentInkColor(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return "";
  }
  const luminance =
    (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance > 0.6 ? "#1f1a17" : "#fdf6ef";
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, num));
}

function applyTheme(theme) {
  if (!document.body) {
    return;
  }
  THEME_LIST.forEach((name) => {
    document.body.classList.toggle(`theme-${name}`, theme === name);
  });
}

function applyUiSettings(settings) {
  if (!document.body) {
    return;
  }
  const density = settings?.uiDensity === "compact" ? "compact" : "comfortable";
  document.body.classList.toggle("ui-compact", density === "compact");
  document.body.classList.toggle("reduce-motion", !!settings?.reduceMotion);
  document.body.classList.toggle(
    "story-mode",
    !!settings?.dashboardStoryMode,
  );
  document.body.classList.toggle(
    "typo-bold",
    settings?.typographyStyle === "bold",
  );
  document.body.classList.toggle(
    "typo-technical",
    settings?.typographyStyle === "technical",
  );
  document.body.classList.toggle(
    "typo-calm",
    settings?.typographyStyle === "calm",
  );
  applyAccentColor(settings);
  applyDashboardVisibility(settings);
}

function applyAccentColor(settings) {
  if (!document.body) {
    return;
  }
  const accent = sanitizeColor(settings?.accentColor);
  if (!accent) {
    document.body.style.removeProperty("--accent");
    document.body.style.removeProperty("--accent-2");
    document.body.style.removeProperty("--accent-ink");
    return;
  }
  document.body.style.setProperty("--accent", accent);
  const accent2 = mixHex(accent, "#ffffff", 0.2) || accent;
  document.body.style.setProperty("--accent-2", accent2);
  const accentInk = accentInkColor(accent) || "";
  if (accentInk) {
    document.body.style.setProperty("--accent-ink", accentInk);
  }
}

  function applyDashboardVisibility(settings) {
    const sections =
      settings?.dashboardSections || DEFAULT_SETTINGS.dashboardSections;
    const graphEnabled = !!sections.graph;
    if (elements.summaryCard) {
      elements.summaryCard.hidden = !sections.overview;
    }
    if (elements.detailCard) {
      elements.detailCard.hidden = !sections.overview;
    }
    if (elements.overviewPanel) {
      elements.overviewPanel.hidden = !sections.overview;
    }
  if (elements.sessionPanel) {
    elements.sessionPanel.hidden = !sections.sessions;
  }
  if (elements.sessionDelete) {
    elements.sessionDelete.hidden = !sections.sessions;
  }
  if (elements.sessionFavoritesToggle) {
    elements.sessionFavoritesToggle.hidden = !sections.sessions;
  }
  if (elements.sessionCalendar) {
    elements.sessionCalendar.hidden = !sections.sessions;
  }
  if (elements.sessionList) {
    elements.sessionList.classList.toggle("favorites-hidden", !sections.sessions);
  }
  if (elements.sessionFilterFavorites && !sections.sessions) {
    elements.sessionFilterFavorites.checked = false;
    if (app.sessionFilterFavoritesOnly) {
      app.sessionFilterFavoritesOnly = false;
      populateSessionList();
    }
  }
  if (elements.sessionDatePicker && !sections.sessions) {
    elements.sessionDatePicker.value = "";
  }
  if (elements.sessionList) {
    elements.sessionList.hidden = !sections.sessions;
  }
  if (elements.sessionListEmpty && !sections.sessions) {
    elements.sessionListEmpty.hidden = true;
  }
  if (elements.sessionSelect) {
    elements.sessionSelect.hidden = !sections.sessions;
  }
  if (elements.timelineTrack) {
    elements.timelineTrack.hidden = !sections.timeline;
  }
  if (elements.timelineLegend) {
    elements.timelineLegend.hidden = !sections.timeline;
  }
  if (elements.graphCanvas) {
    elements.graphCanvas.hidden = !graphEnabled;
  }
  if (elements.graphEmpty) {
    elements.graphEmpty.hidden = !graphEnabled;
  }
  if (!graphEnabled) {
    app.graphReady = false;
    app.graphWarm = false;
    if (app.graph) {
      app.graph.setData({ nodes: [], edges: [] }, { preserveLayout: false });
      app.graph.lastKey = null;
    }
  }
  if (elements.graphToggles) {
    elements.graphToggles.forEach((toggle) => {
      toggle.hidden = !graphEnabled;
    });
  }
  if (elements.calloutsList) {
    const calloutsBlock = elements.calloutsList.closest(".honesty-block");
    if (calloutsBlock) {
      calloutsBlock.hidden = !sections.callouts;
    } else {
      elements.calloutsList.hidden = !sections.callouts;
    }
  }
  if (elements.deepTabs) {
    const enabledTabs = [];
    elements.deepTabs.forEach((tab) => {
      const key = tab.dataset.deep === "honest" ? "honesty" : tab.dataset.deep;
      if (!key) {
        return;
      }
      tab.hidden = key === "graph" ? !graphEnabled : !sections[key];
      if (!tab.hidden) {
        enabledTabs.push(tab.dataset.deep);
      }
    });
    if (elements.deepDive) {
      elements.deepDive.hidden = enabledTabs.length === 0;
    }
    if (enabledTabs.length && !enabledTabs.includes(app.deepTab)) {
      setDeepDiveTab(enabledTabs[0]);
    }
  }
  if (elements.deepPanels) {
    elements.deepPanels.forEach((panel) => {
      const key =
        panel.dataset.deepPanel === "honest"
          ? "honesty"
          : panel.dataset.deepPanel;
      if (!key) {
        return;
      }
      panel.hidden = key === "graph" ? !graphEnabled : !sections[key];
    });
  }
}

function storageLocalGet(key) {
  return new Promise((resolve) =>
    chrome.storage.local.get(key, (result) => {
      if (chrome.runtime.lastError) {
        resolve({});
        return;
      }
      resolve(result);
    }),
  );
}

function storageSyncGet(key) {
  return new Promise((resolve) =>
    chrome.storage.sync.get(key, (result) => {
      if (chrome.runtime.lastError) {
        resolve({});
        return;
      }
      resolve(result);
    }),
  );
}

function storageSyncSet(payload) {
  return new Promise((resolve) =>
    chrome.storage.sync.set(payload, () => {
      resolve();
    }),
  );
}

function sendSessionAction(type, sessionId) {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return;
  }
  chrome.runtime.sendMessage({ type, sessionId }, () => {
    if (chrome.runtime.lastError) {
      setSettingsStatus("Action failed.");
    }
  });
}

function sendSummaryUpdate(sessionId, brief, detailed, summaryUpdatedAt) {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return false;
  }
  chrome.runtime.sendMessage(
    {
      type: "session_summary_update",
      sessionId,
      summaryBrief: brief,
      summaryDetailed: detailed,
      summaryUpdatedAt,
    },
    () => {
      if (chrome.runtime.lastError) {
        setSettingsStatus("Summary save failed.");
      }
    },
  );
  return true;
}

function buildTimelineSegments(session, tracking, isActiveSession) {
  const segments = [];
  const events = getSessionEvents(session);
  events.forEach((event) => {
    if (
      event.type !== "active_time_flushed" ||
      !event.url ||
      !event.durationMs
    ) {
      return;
    }
    const end = event.ts;
    const start = end - event.durationMs;
    segments.push({
      start,
      end,
      duration: event.durationMs,
      url: event.url,
      domain: getDomain(event.url),
      title: getDomain(event.url) || event.url,
    });
  });

  if (isActiveSession && tracking?.activeSince && tracking.activeUrl) {
    const end = Date.now();
    const start = tracking.activeSince;
    const duration = Math.max(0, end - start);
    if (duration > 0) {
      segments.push({
        start,
        end,
        duration,
        url: tracking.activeUrl,
        domain: getDomain(tracking.activeUrl),
        title: getDomain(tracking.activeUrl) || tracking.activeUrl,
      });
    }
  }

  return segments.sort((a, b) => a.start - b.start);
}

if (!IS_TEST) {
  initLiveDashboard();
} else {
  globalThis.__IRHT_TEST_HOOKS__ = globalThis.__IRHT_TEST_HOOKS__ || {};
  globalThis.__IRHT_TEST_HOOKS__.dashboard = {
    STORAGE_KEY,
    SETTINGS_KEY,
    SYNC_STATE_KEY,
    UNDO_SETTINGS_KEY,
    MAX_GRAPH_NODES,
    GRAPH_INITIAL_NODE_CAP,
    SUMMARY_DEBOUNCE_MS,
    SESSION_LIST_ITEM_ESTIMATE,
    SESSION_LIST_BUFFER,
    OLLAMA_ENDPOINT,
    OLLAMA_MODEL,
    PALETTE,
    DIRECT_CALLOUTS_STORAGE_KEY,
    DEFAULT_SETTINGS,
    DISTRACTION_ACTIVE_WEIGHT_CAP,
    DISTRACTION_LATE_NIGHT_WEIGHT,
    DISTRACTION_LATE_NIGHT_START,
    DISTRACTION_LATE_NIGHT_END,
    CATEGORY_RULES,
    CATEGORY_MULTIPLIERS,
    elements,
    app,
    bindControls,
    bindHelpIcons,
    normalizeState,
    migrateState,
    applyStateDefaults,
    decodeCompactState,
    createDefaultTracking,
    applySessionDefaults,
    populateSessionSelect,
    populateSessionList,
    renderSessionListWindow,
    scheduleSessionListRender,
    getSessionListData,
    selectSession,
    updateSessionListSelection,
    handleSessionListKeydown,
    applyState,
    renderEmptyDashboard,
    renderDashboard,
    setView,
    setDeepDiveTab,
    renderOverview,
    renderOverviewSummary,
    renderOverviewInsights,
    renderOverviewActions,
    loadCachedSummaries,
    renderSummaryState,
    renderSummaryEmpty,
    renderFocusNote,
    refreshSummaries,
    scheduleSummaryRefresh,
    _refreshSummariesCatch,
    buildRecommendedActions,
    buildSummaryDataLines,
    buildSummaryDataLinesAsync,
    buildSummaryPrompt,
    buildSummaryPromptAsync,
    buildSummaryStyleLines,
    persistSessionSummaries,
    updateSessionSummaries,
    applyOptimisticDelete,
    applyOptimisticRestore,
    applyOptimisticDeleteAll,
    renderOverviewEmpty,
    renderStatus,
    renderTimeline,
    renderGraph,
    renderStats,
    renderHonesty,
    renderDamageReceipts,
    renderReturnPath,
    renderCalloutItem,
    renderCallouts,
    hasSessions,
    isStateEmpty,
    canUseChromeStorage,
    setLiveIndicator,
    initLiveDashboard,
    handleStorageChanged,
    loadStateFromStorage,
    loadStateFromBackground,
    loadSettingsFromStorage,
    applySettings,
    configureRealtimeFeatures,
    setupRealtimePort,
    handleRealtimeMessage,
    mergeRealtimeDelta,
    applyStateDelta,
    setupLiveTimer,
    updateLiveActiveBase,
    applyPriorityUpdate,
    scheduleSessionListRefresh,
    scheduleDeferredRender,
    scheduleFrameRender,
    setupRealtimeWorker,
    requestWorkerTask,
    renderSettings,
    saveSettings,
    scheduleSettingsSave,
    settingsEqual,
    getUndoSnapshot,
    setUndoSnapshot,
    updateUndoButtonState,
    restoreUndoSettings,
    resetSettingsToDefault,
    collectSettingsFromForm,
    setSettingsStatus,
    showToast,
    handleToastAction,
    toastActionNoop,
    hideToast,
    exportSessionData,
    consumeForceRefreshFlag,
    sanitizeSettings,
    sanitizeText,
    sanitizeEndpoint,
    sanitizeColor,
    ensureChoice,
    hexToRgb,
    rgbToHex,
    mixHex,
    accentInkColor,
    normalizeTextList,
    formatTextList,
    normalizeSiteList,
    parseSiteList,
    formatSiteList,
    parseCategoryOverrides,
    formatCategoryOverrides,
    clampNumber,
    applyTheme,
    applyUiSettings,
    applyAccentColor,
    applyDashboardVisibility,
    storageLocalGet,
    storageSyncGet,
    storageSyncSet,
    sendSessionAction,
    sendSummaryUpdate,
    sendPromptToOllama,
    getSendPromptToOllama,
    buildTimelineSegments,
    buildGraphData,
    trimGraph,
    getSessionActiveMs,
    getSessionEvents,
    getSessionCacheKey,
    getDerivedSessionData,
    ensureSessionInsights,
    classifyUrl,
    getCategoryOverride,
    matchesDomain,
    isLateNight,
    isTechnicalUrl,
    computeSessionSignals,
    computeDistractionScore,
    buildSessionLabel,
    pickDominantCategory,
    pickEarlyCategory,
    isEntertainmentCategory,
    isProductiveCategory,
    computeDeepestChain,
    computeCommonStart,
    findSessionStartUrl,
    buildTopDomains,
    buildTopPages,
    buildTopDistractions,
    buildDamageReceipts,
    computeShortsTime,
    findSessionEndUrl,
    formatPathNode,
    buildCalloutMessages,
    buildOutcomeHighlights,
    findPreviousSession,
    pickFocusPrompt,
    renderRankList,
    formatSessionLabel,
    formatSessionDay,
    formatSessionRange,
    formatDate,
    formatTime,
    formatDuration,
    formatScore,
    getDomain,
    truncate,
    colorFor,
    hashString,
    ForceGraph,
  };
  if (elements.toastAction) {
    const toastOnclick = function () {
      handleToastAction();
    };
    elements.toastAction.onclick = toastOnclick;
    toastOnclick();
  }
}
