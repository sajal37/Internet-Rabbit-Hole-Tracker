if (typeof importScripts === "function") {
  importScripts("categories.js");
  importScripts("shared.js");
}

const STORAGE_KEY = "irht_state";
const SETTINGS_KEY = "irht_settings";
const SYNC_STATE_KEY = "irht_state_sync";
const DAILY_SESSION_RESET_KEY = "irht_daily_session_reset_v4";
const SCHEMA_VERSION = 4;
const MAX_EVENTS = 5000;
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
  ollamaEndpoint: "http://localhost:3010/analyze",
  ollamaModel: "llama3",
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
const DELETED_RETENTION_DAYS = 7;
const DELETED_RETENTION_MS = DELETED_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const SESSION_EVENT_RETENTION_DAYS = 14;
const SESSION_EVENT_RETENTION_MS =
  SESSION_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const DELETED_PRUNE_INTERVAL_MS = 30 * 60 * 1000;
const USER_IDLE_ALARM_NAME = "user_idle_check";
const ACTIVE_FLUSH_ALARM_NAME = "active_time_flush";
const TRAP_DOOR_MIN_POST_DURATION_MS = 20 * 60 * 1000;
const TRAP_DOOR_MIN_POST_DEPTH = 6;
const TRAP_DOOR_MAX_RESULTS = 3;
const DISTRACTION_LATE_NIGHT_START = 23;
const DISTRACTION_LATE_NIGHT_END = 6;
const DISTRACTION_ACTIVE_WEIGHT_CAP = 1.6;
const DISTRACTION_LATE_NIGHT_WEIGHT = 0.6;
const PERSIST_DEBOUNCE_MS = 1200;
const PERSIST_MAX_WAIT_MS = 5000;
const NAV_EVENT_COALESCE_MS = 350;
const NAV_EVENT_COALESCE_MIN_MS = 150;
const NAV_EVENT_COALESCE_MAX_MS = 900;
const URL_META_CACHE_LIMIT = 2000;
const SESSION_FULL_DETAIL_LIMIT = 5;
const SESSION_TRIM_NODE_LIMIT = 60;
const SESSION_TRIM_EDGE_LIMIT = 120;
const SESSION_TRIM_EVENT_LIMIT = 350;
const SESSION_KEEP_RECENT = 60;
const SESSION_KEEP_HIGH_VALUE = 20;
const TRIVIAL_ACTIVE_MS = 2 * 60 * 1000;
const TRIVIAL_NAV_COUNT = 3;
const TRIVIAL_NODE_COUNT = 4;
const INTENT_GAP_MIN_MS = 4 * 60 * 1000;
const REALTIME_MIN_BATCH_MS = 250;
const REALTIME_MAX_BATCH_MS = 500;
const REALTIME_DEFAULT_BATCH_MS = 350;

const CATEGORY_RULES = globalThis.IRHTCategories?.CATEGORY_RULES || [];
const CATEGORY_LIST = globalThis.IRHTCategories?.CATEGORY_LIST || [];
const CATEGORY_MULTIPLIERS = globalThis.IRHTCategories?.CATEGORY_MULTIPLIERS || {};

const runtime = {
  activeTabId: null,
  activeUrl: null,
  activeTitle: null,
  activeEdgeKey: null,
  activeSince: null,
  lastInteractionAt: null,
  lastActivityType: null,
  userIdle: true,
  lastInactiveAt: null,
  sessionIdleEndedAt: null,
  windowFocused: true,
  idleState: "active",
  settings: { ...DEFAULT_SETTINGS },
  urlMetaCache: new Map(),
  normalizedUrlCache: new Map(),
};

let state = null;
let lastDeletedPruneAt = 0;
let persistTimer = null;
let persistPendingSince = null;
let analysisTimer = null;
let analysisSessionId = null;
let analysisTimestamp = null;
let activeSessionCache = null;
let activeSessionIdCache = null;
let realtimeBroadcastTimer = null;
let realtimeBroadcastPendingSince = null;
const livePorts = new Set();
const livePortMeta = new Map();

const IS_TEST =
  typeof globalThis !== "undefined" && globalThis.__IRHT_TEST__ === true;

if (!IS_TEST) {
  init();
}

async function init() {
  state = await loadState();
  await applyDailySessionResetIfNeeded();
  primeStateForDashboard();
  pruneDeletedSessionsIfNeeded();
  hydrateRuntimeFromState();
  getActiveSession();
  await loadSettings();
  chrome.idle.setDetectionInterval(60);
  chrome.alarms.create(USER_IDLE_ALARM_NAME, { periodInMinutes: 1 });
  chrome.alarms.create(ACTIVE_FLUSH_ALARM_NAME, { periodInMinutes: 0.25 });
  await refreshWindowFocus();
  await refreshIdleState();
  await refreshActiveTab();
  registerListeners();
  persistState();
}

function registerListeners() {
  chrome.runtime.onConnect.addListener(handlePortConnect);
  chrome.tabs.onActivated.addListener(handleTabActivated);
  chrome.tabs.onUpdated.addListener(handleTabUpdated);
  chrome.tabs.onRemoved.addListener(handleTabRemoved);
  chrome.tabs.onCreated.addListener(handleTabCreated);
  chrome.windows.onFocusChanged.addListener(handleWindowFocusChanged);
  chrome.idle.onStateChanged.addListener(handleIdleStateChanged);
  chrome.webNavigation.onCommitted.addListener(handleNavigationCommitted, {
    url: [{ schemes: ["http", "https"] }],
  });
  chrome.webNavigation.onHistoryStateUpdated.addListener(
    handleHistoryStateUpdated,
    {
      url: [{ schemes: ["http", "https"] }],
    },
  );
  chrome.webNavigation.onCreatedNavigationTarget.addListener(
    handleCreatedNavigationTarget,
    {
      url: [{ schemes: ["http", "https"] }],
    },
  );
  chrome.webNavigation.onReferenceFragmentUpdated.addListener(
    handleReferenceFragmentUpdated,
    {
      url: [{ schemes: ["http", "https"] }],
    },
  );
  chrome.alarms.onAlarm.addListener(handleAlarm);
  chrome.storage.onChanged.addListener(handleStorageChanged);
  chrome.runtime.onMessage.addListener(handleMessage);
}

function handlePortConnect(port) {
  if (!port || port.name !== "irht_live") {
    return;
  }
  livePorts.add(port);
  livePortMeta.set(port, {
    lastSessionId: null,
    lastSessionUpdatedAt: null,
    lastEventCursor: null,
    lastTrackingActiveSince: null,
    lastSessionFingerprints: {},
    lastSessionOrderKey: "",
  });
  port.onDisconnect.addListener(() => {
    livePorts.delete(port);
    livePortMeta.delete(port);
  });
  port.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type === "request_snapshot" || message.type === "request_full") {
      sendPortStateSnapshot(port, "request");
    }
  });
  sendPortStateSnapshot(port, "connect");
}

function now() {
  return Date.now();
}

function getDayStart(timestamp) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function getDayEnd(timestamp) {
  const date = new Date(timestamp);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

function isSameDay(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return false;
  }
  return getDayStart(a) === getDayStart(b);
}

function createSession(startedAt) {
  return {
    id: crypto.randomUUID(),
    startedAt,
    updatedAt: startedAt,
    endedAt: null,
    endReason: null,
    firstActivityAt: null,
    lastActivityAt: null,
    navigationCount: 0,
    nodes: {},
    edges: {},
    events: [],
    eventCursor: 0,
    eventCount: 0,
    metrics: null,
    trapDoors: [],
    categoryTotals: {},
    distractionAverage: 0,
    distractionNormalized: 0,
    distractionLabel: "Focused",
    label: null,
    labelDetail: null,
    intentDriftScore: 0,
    intentDriftLabel: "Unknown",
    intentDriftReason: "Not enough data yet.",
    intentDriftConfidence: "low",
    intentDriftDrivers: [],
    archived: false,
    archivedAt: null,
    deleted: false,
    deletedAt: null,
    favorite: false,
    favoriteAt: null,
  };
}

function createNewState() {
  const timestamp = now();
  const session = createSession(getDayStart(timestamp));
  return {
    schemaVersion: SCHEMA_VERSION,
    sessions: {
      [session.id]: session,
    },
    sessionOrder: [session.id],
    activeSessionId: session.id,
    tabs: {},
    tracking: {
      activeTabId: null,
      activeUrl: null,
      activeEdgeKey: null,
      activeSince: null,
      lastInteractionAt: null,
      userIdle: true,
      lastInactiveAt: null,
    },
  };
}

function hydrateRuntimeFromState() {
  if (!state || !state.tracking) {
    return;
  }
  runtime.activeTabId = state.tracking.activeTabId;
  runtime.activeUrl = state.tracking.activeUrl;
  runtime.activeEdgeKey = state.tracking.activeEdgeKey;
  runtime.activeSince = state.tracking.activeSince;
  runtime.lastInteractionAt = state.tracking.lastInteractionAt || null;
  runtime.userIdle = state.tracking.userIdle ?? true;
  runtime.lastInactiveAt = state.tracking.lastInactiveAt || null;
}

function syncTrackingToState() {
  state.tracking = {
    activeTabId: runtime.activeTabId,
    activeUrl: runtime.activeUrl,
    activeEdgeKey: runtime.activeEdgeKey,
    activeSince: runtime.activeSince,
    lastInteractionAt: runtime.lastInteractionAt,
    userIdle: runtime.userIdle,
    lastInactiveAt: runtime.lastInactiveAt,
  };
}

function trimTabsForStorage(tabs) {
  const trimmed = {};
  Object.entries(tabs || {}).forEach(([id, tab]) => {
    if (!tab) {
      return;
    }
    trimmed[id] = {
      lastUrl: tab.lastUrl || null,
      lastEdgeKey: tab.lastEdgeKey || null,
      pendingSourceUrl: tab.pendingSourceUrl || null,
    };
  });
  return trimmed;
}

function trimEventsForStorage(events, limit) {
  if (!Array.isArray(events)) {
    return [];
  }
  if (events.length <= limit) {
    return events.slice();
  }
  const lowValueTypes = new Set([
    "idle_state_changed",
    "user_active",
    "user_inactive",
  ]);
  const lowValueIndexes = [];
  events.forEach((event, index) => {
    if (event && lowValueTypes.has(event.type)) {
      lowValueIndexes.push(index);
    }
  });
  const kept = events.filter(
    (event) => event && !lowValueTypes.has(event.type),
  );
  if (kept.length >= limit) {
    return kept.slice(-limit);
  }
  const remaining = limit - kept.length;
  const keepLowIndexes = new Set(lowValueIndexes.slice(-remaining));
  return events.filter(
    (event, index) =>
      event &&
      (!lowValueTypes.has(event.type) || keepLowIndexes.has(index)),
  );
}

function getSessionActiveMs(session) {
  return globalThis.IRHTShared?.getSessionActiveMs
    ? globalThis.IRHTShared.getSessionActiveMs(session, null, {
        preferMetrics: true,
      })
    : 0;
}

function scoreSessionValue(session) {
  const activeMs = getSessionActiveMs(session);
  const navCount = session.navigationCount || 0;
  const nodeCount = Object.keys(session.nodes || {}).length;
  const distraction = normalizeDistractionScore(session.distractionAverage || 0);
  return (
    activeMs +
    navCount * 15000 +
    nodeCount * 10000 +
    distraction * 1000
  );
}

function isTrivialSession(session) {
  const activeMs = getSessionActiveMs(session);
  const navCount = session.navigationCount || 0;
  const nodeCount = Object.keys(session.nodes || {}).length;
  return (
    activeMs < TRIVIAL_ACTIVE_MS &&
    navCount < TRIVIAL_NAV_COUNT &&
    nodeCount < TRIVIAL_NODE_COUNT
  );
}

function scoreNodeForTrim(node, session, signals) {
  if (!node) {
    return 0;
  }
  if (!node.category) {
    node.category = classifyUrl(node.url);
  }
  if (node._lateNight === undefined) {
    node._lateNight = isLateNight(node.firstSeen);
  }
  const scoreData = computeDistractionScoreCached(node, session, signals);
  const distraction = Math.max(0, scoreData.score || 0);
  const activeMs = node.activeMs || 0;
  const weight = 1 + Math.min(2.5, distraction);
  return activeMs * weight;
}

function scoreEdgeForTrim(edge, nodeScores, maxNodeScore) {
  if (!edge) {
    return 0;
  }
  const activeMs = edge.activeMs || 0;
  if (!maxNodeScore) {
    return activeMs;
  }
  const fromScore = nodeScores.get(edge.from) || 0;
  const toScore = nodeScores.get(edge.to) || 0;
  const normalized = (fromScore + toScore) / (2 * maxNodeScore);
  return activeMs * (1 + Math.min(1, Math.max(0, normalized)));
}

function pickSessionBase(session) {
  return {
    id: session.id,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    endedAt: session.endedAt,
    endReason: session.endReason,
    firstActivityAt: session.firstActivityAt || null,
    lastActivityAt: session.lastActivityAt,
    navigationCount: session.navigationCount,
    trapDoors: session.trapDoors || [],
    categoryTotals: session.categoryTotals || {},
    distractionAverage: session.distractionAverage || 0,
    distractionNormalized: session.distractionNormalized || 0,
    distractionLabel: session.distractionLabel || "Focused",
    label: session.label,
    labelDetail: session.labelDetail,
    intentDriftScore: session.intentDriftScore ?? 0,
    intentDriftLabel: session.intentDriftLabel || "Unknown",
    intentDriftReason: session.intentDriftReason || "Not enough data yet.",
    intentDriftConfidence: session.intentDriftConfidence || "low",
    intentDriftDrivers: Array.isArray(session.intentDriftDrivers)
      ? session.intentDriftDrivers.slice(0, 3)
      : [],
    summaryBrief: session.summaryBrief || "",
    summaryDetailed: session.summaryDetailed || "",
    summaryUpdatedAt: session.summaryUpdatedAt || 0,
    archived: !!session.archived,
    archivedAt: session.archivedAt || null,
    deleted: !!session.deleted,
    deletedAt: session.deletedAt || null,
    favorite: !!session.favorite,
    favoriteAt: session.favoriteAt || null,
  };
}

function trimSessionDetails(session, keepFull) {
  const base = pickSessionBase(session);
  const events = getSessionEvents(session);
  if (keepFull) {
    return {
      ...base,
      nodes: session.nodes || {},
      edges: session.edges || {},
      events,
      eventCursor: events.length % MAX_EVENTS,
      eventCount: Math.min(events.length, MAX_EVENTS),
      metrics: session.metrics || null,
    };
  }

  const signals = computeSessionSignals(session);
  const nodeScores = new Map();
  let maxNodeScore = 0;
  Object.values(session.nodes || {}).forEach((node) => {
    const score = scoreNodeForTrim(node, session, signals);
    nodeScores.set(node.url, score);
    if (score > maxNodeScore) {
      maxNodeScore = score;
    }
  });
  const nodes = Object.values(session.nodes || {})
    .sort((a, b) => (nodeScores.get(b.url) || 0) - (nodeScores.get(a.url) || 0))
    .slice(0, SESSION_TRIM_NODE_LIMIT);
  const nodeSet = new Set(nodes.map((node) => node.url));
  const edges = Object.values(session.edges || {})
    .filter((edge) => nodeSet.has(edge.from) && nodeSet.has(edge.to))
    .sort(
      (a, b) =>
        scoreEdgeForTrim(b, nodeScores, maxNodeScore) -
        scoreEdgeForTrim(a, nodeScores, maxNodeScore),
    )
    .slice(0, SESSION_TRIM_EDGE_LIMIT);
  const trimmedEvents = trimEventsForStorage(events, SESSION_TRIM_EVENT_LIMIT);

  return {
    ...base,
    nodes: nodes.reduce((acc, node) => {
      acc[node.url] = node;
      return acc;
    }, {}),
    edges: edges.reduce((acc, edge) => {
      acc[edge.id] = edge;
      return acc;
    }, {}),
    events: trimmedEvents,
    eventCursor: trimmedEvents.length % MAX_EVENTS,
    eventCount: Math.min(trimmedEvents.length, MAX_EVENTS),
    metrics: null,
  };
}

function trimStateForStorage(sourceState) {
  const sessions = sourceState.sessions || {};
  const order = sourceState.sessionOrder || Object.keys(sessions);
  const ordered = order
    .map((id) => sessions[id])
    .filter(Boolean)
    .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
  const keepIds = new Set();
  ordered.slice(-SESSION_KEEP_RECENT).forEach((session) => {
    keepIds.add(session.id);
  });
  if (sourceState.activeSessionId) {
    keepIds.add(sourceState.activeSessionId);
  }
  ordered.forEach((session) => {
    if (session.archived || session.deleted) {
      keepIds.add(session.id);
    }
  });
  const highValue = ordered
    .filter((session) => !keepIds.has(session.id) && !session.deleted)
    .map((session) => ({ id: session.id, score: scoreSessionValue(session) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, SESSION_KEEP_HIGH_VALUE);
  highValue.forEach((entry) => keepIds.add(entry.id));
  const fullIds = new Set(
    ordered.slice(-SESSION_FULL_DETAIL_LIMIT).map((session) => session.id),
  );
  if (sourceState.activeSessionId) {
    fullIds.add(sourceState.activeSessionId);
  }
  const trimmedSessions = {};
  ordered.forEach((session) => {
    if (
      !keepIds.has(session.id) &&
      !session.archived &&
      !session.deleted &&
      isTrivialSession(session)
    ) {
      return;
    }
    trimmedSessions[session.id] = trimSessionDetails(
      session,
      fullIds.has(session.id),
    );
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    sessions: trimmedSessions,
    sessionOrder: ordered
      .map((session) => session.id)
      .filter((id) => trimmedSessions[id]),
    activeSessionId: sourceState.activeSessionId,
    tabs: trimTabsForStorage(sourceState.tabs || {}),
    tracking: sourceState.tracking || {},
  };
}

function compactStateForStorage(sourceState) {
  const urlTable = [];
  const urlIds = new Map();

  const getUrlId = (url) => {
    if (!url) {
      return null;
    }
    if (urlIds.has(url)) {
      return urlIds.get(url);
    }
    const id = urlTable.length;
    urlTable.push(url);
    urlIds.set(url, id);
    return id;
  };

  const compactSessions = {};
  Object.values(sourceState.sessions || {}).forEach((session) => {
    const compact = { ...session };
    compact.nodes = Object.values(session.nodes || {}).map((node) => ({
      urlId: getUrlId(node.url),
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
    }));
    compact.edges = Object.values(session.edges || {}).map((edge) => ({
      fromId: getUrlId(edge.from),
      toId: getUrlId(edge.to),
      visitCount: edge.visitCount || 0,
      activeMs: edge.activeMs || 0,
      firstSeen: edge.firstSeen || 0,
      lastSeen: edge.lastSeen || 0,
    }));
    compact.trapDoors = (session.trapDoors || []).map((trap) => ({
      ...trap,
      urlId: getUrlId(trap.url),
      url: undefined,
    }));
    compactSessions[session.id] = compact;
  });

  return {
    ...sourceState,
    compactTables: true,
    urlTable,
    sessions: compactSessions,
  };
}

function encodeStateForStorage(sourceState) {
  const trimmed = trimStateForStorage(sourceState);
  return compactStateForStorage(trimmed);
}

function decodeStoredState(raw) {
  if (!raw) {
    return null;
  }
  if (raw.schemaVersion === SCHEMA_VERSION && raw.compactTables && raw.urlTable) {
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
          _lateNight: null,
          _scoreCache: null,
        };
      });
      const edges = {};
      (session.edges || []).forEach((edge) => {
        const from = urlTable[edge.fromId] || edge.from;
        const to = urlTable[edge.toId] || edge.to;
        if (!from || !to) {
          return;
        }
        const id = edgeKey(from, to);
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
            ? session.events.length % MAX_EVENTS
            : 0;
      decoded.eventCount =
        typeof session.eventCount === "number"
          ? session.eventCount
          : Array.isArray(session.events)
            ? Math.min(session.events.length, MAX_EVENTS)
            : 0;
      decoded.metrics = session.metrics || null;
      sessions[session.id] = decoded;
    });
    return upgradeState({
      schemaVersion: SCHEMA_VERSION,
      sessions,
      sessionOrder: raw.sessionOrder || [],
      activeSessionId: raw.activeSessionId || null,
      tabs: raw.tabs || {},
      tracking: raw.tracking || {},
    });
  }
  return null;
}

async function loadState() {
  const stored = await storageGet(STORAGE_KEY);
  const raw = stored && stored[STORAGE_KEY];
  if (raw && raw.schemaVersion === SCHEMA_VERSION) {
    const decoded = decodeStoredState(raw);
    if (decoded) {
      return decoded;
    }
    return upgradeState(raw);
  }
  if (raw && raw.schemaVersion === 3) {
    return upgradeState(raw);
  }
  if (raw && raw.schemaVersion === 2) {
    return upgradeState(raw);
  }
  if (raw && raw.schemaVersion === 1) {
    return migrateState(raw);
  }
  return createNewState();
}

async function applyDailySessionResetIfNeeded() {
  const stored = await storageGet(DAILY_SESSION_RESET_KEY);
  if (stored && stored[DAILY_SESSION_RESET_KEY]) {
    return false;
  }
  const timestamp = now();
  state = createNewState();
  activeSessionCache = state.sessions[state.activeSessionId];
  activeSessionIdCache = state.activeSessionId;
  await storageSet({
    [DAILY_SESSION_RESET_KEY]: timestamp,
    [STORAGE_KEY]: encodeStateForStorage(state),
  }, "daily_reset");
  await storageSyncSet({ [SYNC_STATE_KEY]: null }, "daily_reset_sync");
  return true;
}

function primeStateForDashboard() {
  if (!state || !state.sessions) {
    return;
  }
  const sessions = state.sessionOrder
    ? state.sessionOrder.map((id) => state.sessions[id]).filter(Boolean)
    : Object.values(state.sessions);
  sessions
    .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0))
    .slice(-3)
    .forEach((session) => {
        if (!session) {
          return;
        }
      if (!session.label || !session.categoryTotals) {
        computeSessionInsights(session);
      } else {
        ensureSessionMetrics(session);
      }
    });
}

function upgradeState(existingState) {
  const upgraded = {
    ...existingState,
    schemaVersion: SCHEMA_VERSION,
    sessions: existingState.sessions || {},
    sessionOrder: existingState.sessionOrder || [],
    tracking: {
      activeTabId: existingState.tracking?.activeTabId || null,
      activeUrl: existingState.tracking?.activeUrl || null,
      activeEdgeKey: existingState.tracking?.activeEdgeKey || null,
      activeSince: existingState.tracking?.activeSince || null,
      lastInteractionAt: existingState.tracking?.lastInteractionAt || null,
      userIdle: existingState.tracking?.userIdle ?? true,
      lastInactiveAt: existingState.tracking?.lastInactiveAt || null,
    },
  };
  Object.values(upgraded.sessions).forEach((session) => {
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
    if (!session.categoryTotals) {
      session.categoryTotals = {};
    }
    if (session.distractionAverage === undefined) {
      session.distractionAverage = 0;
    }
    if (session.distractionNormalized === undefined) {
      session.distractionNormalized = normalizeDistractionScore(
        session.distractionAverage || 0,
      );
    }
    if (session.distractionLabel === undefined) {
      session.distractionLabel = getDistractionLabel(
        session.distractionNormalized,
      );
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
      session.firstActivityAt =
        session.lastActivityAt || session.startedAt || session.updatedAt || null;
    }
    if (session.eventCursor === undefined) {
      session.eventCursor = Array.isArray(session.events)
        ? session.events.length % MAX_EVENTS
        : 0;
    }
    if (session.eventCount === undefined) {
      session.eventCount = Array.isArray(session.events)
        ? Math.min(session.events.length, MAX_EVENTS)
        : 0;
    }
    if (session.metrics === undefined) {
      session.metrics = null;
    }
  });
  if (!upgraded.sessionOrder.length) {
    upgraded.sessionOrder = Object.values(upgraded.sessions)
      .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0))
      .map((session) => session.id);
  }
  if (!upgraded.activeSessionId && upgraded.sessionOrder.length) {
    upgraded.activeSessionId =
      upgraded.sessionOrder[upgraded.sessionOrder.length - 1];
  }
  return upgraded;
}

function migrateState(oldState) {
  const timestamp = now();
  const oldSession = oldState.session || createSession(timestamp);
  const navigationCount = Object.values(oldSession.edges || {}).reduce(
    (sum, edge) => sum + (edge.visitCount || 0),
    0,
  );

  Object.values(oldSession.nodes || {}).forEach((node) => {
    if (node.firstNavigationIndex === undefined) {
      node.firstNavigationIndex = null;
    }
    if (node.lastNavigationIndex === undefined) {
      node.lastNavigationIndex = null;
    }
    if (!node.category) {
      node.category = classifyUrl(node.url);
    }
    if (node.distractionScore === undefined) {
      node.distractionScore = 0;
    }
  });

  const session = {
    ...oldSession,
    endedAt: null,
    endReason: null,
    firstActivityAt:
      oldSession.startedAt || oldSession.updatedAt || timestamp,
    lastActivityAt: oldSession.updatedAt || oldSession.startedAt || timestamp,
    navigationCount,
    trapDoors: [],
    categoryTotals: oldSession.categoryTotals || {},
    distractionAverage: oldSession.distractionAverage || 0,
    label: oldSession.label || null,
    labelDetail: oldSession.labelDetail || null,
    deleted: false,
    deletedAt: null,
  };

  computeSessionInsights(session);

  return upgradeState({
    schemaVersion: 2,
    sessions: { [session.id]: session },
    sessionOrder: [session.id],
    activeSessionId: session.id,
    tabs: oldState.tabs || {},
    tracking: {
      activeTabId: oldState.tracking?.activeTabId || null,
      activeUrl: oldState.tracking?.activeUrl || null,
      activeEdgeKey: oldState.tracking?.activeEdgeKey || null,
      activeSince: oldState.tracking?.activeSince || null,
      lastInteractionAt: null,
      userIdle: true,
      lastInactiveAt: null,
    },
  });
}

function closeStaleSessions(timestamp) {
  const dayStart = getDayStart(timestamp);
  Object.values(state.sessions || {}).forEach((session) => {
    if (!session || session.deleted || session.endedAt) {
      return;
    }
    if (!Number.isFinite(session.startedAt)) {
      return;
    }
    if (getDayStart(session.startedAt) < dayStart) {
      endSession(session, getDayEnd(session.startedAt), "day_end");
    }
  });
}

function getActiveSession(timestamp = now()) {
  closeStaleSessions(timestamp);
  if (
    activeSessionCache &&
    activeSessionIdCache === state.activeSessionId &&
    !activeSessionCache.deleted &&
    !activeSessionCache.endedAt &&
    isSameDay(activeSessionCache.startedAt, timestamp)
  ) {
    return activeSessionCache;
  }
  let activeSession = state.activeSessionId
    ? state.sessions[state.activeSessionId]
    : null;
  if (activeSession && (activeSession.deleted || activeSession.endedAt)) {
    activeSession = null;
    state.activeSessionId = null;
  }
  const activeCandidates = Object.values(state.sessions || {}).filter(
    (session) => session && !session.deleted && !session.endedAt,
  );
  if (!activeSession) {
    if (activeCandidates.length) {
      activeSession = activeCandidates.sort((a, b) => {
        const aKey = a.lastActivityAt || a.updatedAt || a.startedAt || 0;
        const bKey = b.lastActivityAt || b.updatedAt || b.startedAt || 0;
        return bKey - aKey;
      })[0];
      state.activeSessionId = activeSession.id;
    } else {
      const session = startNewSession(getDayStart(timestamp), "day_start");
      activeSession = session;
    }
  }
  if (activeSession) {
    activeCandidates.forEach((session) => {
      if (session.id !== activeSession.id && !session.endedAt) {
        endSession(session, getDayEnd(session.startedAt || timestamp), "superseded");
      }
    });
  }
  activeSessionIdCache = state.activeSessionId;
  activeSessionCache = state.sessions[state.activeSessionId];
  return activeSessionCache;
}

function resetTabSessionState() {
  Object.values(state.tabs).forEach((tab) => {
    tab.lastUrl = null;
    tab.lastEdgeKey = null;
    tab.pendingSourceUrl = null;
  });
}

function startNewSession(startedAt, reason) {
  const sessionStart = Number.isFinite(startedAt) ? startedAt : now();
  const session = createSession(sessionStart);
  state.sessions[session.id] = session;
  state.sessionOrder.push(session.id);
  state.activeSessionId = session.id;
  activeSessionCache = session;
  activeSessionIdCache = session.id;
  resetTabSessionState();
  runtime.activeEdgeKey = null;
  runtime.activeSince = null;
  appendEvent(session, {
    ts: sessionStart,
    type: "session_started",
    reason,
  });
  return session;
}

function endSession(session, endedAt, reason) {
  if (!session || session.endedAt) {
    return;
  }
  session.endedAt = endedAt;
  session.endReason = reason || null;
  session.updatedAt = endedAt;
  evaluateTrapDoors(session, endedAt);
  computeSessionInsights(session);
  appendEvent(session, {
    ts: endedAt,
    type: "session_ended",
    reason,
  });
  if (state.activeSessionId === session.id) {
    state.activeSessionId = null;
    activeSessionCache = null;
    activeSessionIdCache = null;
  }
}

function ensureSessionForActivity(timestamp, reason) {
  const session = getActiveSession(timestamp);
  if (runtime.lastInactiveAt) {
    runtime.lastInactiveAt = null;
  }
  if (!session.firstActivityAt) {
    session.firstActivityAt = timestamp;
  }
  session.lastActivityAt = timestamp;
  session.updatedAt = timestamp;
  return session;
}

function shouldSplitSessionForIntent(session, url, timestamp) {
  if (!session || !url) {
    return false;
  }
  const lastActivityAt = session.lastActivityAt || session.updatedAt || session.startedAt;
  if (!lastActivityAt) {
    return false;
  }
  const gap = timestamp - lastActivityAt;
  if (gap < INTENT_GAP_MIN_MS) {
    return false;
  }
  const dominantCategory = pickDominantCategory(session.categoryTotals || {});
  if (!dominantCategory) {
    return false;
  }
  const currentCategory = classifyUrl(url);
  if (!currentCategory || currentCategory === dominantCategory) {
    return false;
  }
  const dominantGroup = isEntertainmentCategory(dominantCategory)
    ? "entertainment"
    : isProductiveCategory(dominantCategory)
      ? "productive"
      : "neutral";
  const currentGroup = isEntertainmentCategory(currentCategory)
    ? "entertainment"
    : isProductiveCategory(currentCategory)
      ? "productive"
      : "neutral";
  if (dominantGroup === "neutral" || currentGroup === "neutral") {
    return false;
  }
  return dominantGroup !== currentGroup;
}

function getSessionEvents(session) {
  if (!session || !Array.isArray(session.events)) {
    return [];
  }
  if (typeof session.eventCursor !== "number" || session.eventCount === 0) {
    return session.events.slice();
  }
  const total = Math.min(session.eventCount, session.events.length);
  if (total <= 0) {
    return [];
  }
  if (total < session.events.length) {
    return session.events.slice(0, total);
  }
  const cursor = session.eventCursor % session.events.length;
  return session.events.slice(cursor).concat(session.events.slice(0, cursor));
}

function getLatestEvent(session) {
  return globalThis.IRHTShared?.getLatestEvent
    ? globalThis.IRHTShared.getLatestEvent(session)
    : null;
}

function getNavigationCoalesceMs(session, timestamp) {
  const last = getLatestEvent(session);
  if (!last || last.type !== "navigation") {
    return NAV_EVENT_COALESCE_MS;
  }
  const delta = timestamp - last.ts;
  if (delta <= 1200) {
    return NAV_EVENT_COALESCE_MIN_MS;
  }
  if (delta <= 4000) {
    return NAV_EVENT_COALESCE_MS;
  }
  return NAV_EVENT_COALESCE_MAX_MS;
}

function appendEvent(session, event) {
  if (!session.events) {
    session.events = [];
  }
  if (typeof session.eventCursor !== "number") {
    session.eventCursor = session.events.length % MAX_EVENTS;
  }
  if (typeof session.eventCount !== "number") {
    session.eventCount = session.events.length;
  }
  if (session.eventCount < MAX_EVENTS) {
    session.events.push(event);
    session.eventCount = session.events.length;
    session.eventCursor = session.eventCount % MAX_EVENTS;
    return;
  }
  const cursor = session.eventCursor % MAX_EVENTS;
  session.events[cursor] = event;
  session.eventCursor = (cursor + 1) % MAX_EVENTS;
  session.eventCount = Math.min(session.eventCount + 1, MAX_EVENTS);
}

function evaluateTrapDoors(session, timestamp) {
  if (!session) {
    return;
  }
  const sessionDuration = Math.max(0, timestamp - session.startedAt);
  const navigationCount = session.navigationCount || 0;
  const candidates = Object.values(session.nodes || {})
    .map((node) => {
      const seenAt =
        typeof node.firstSeen === "number" ? node.firstSeen : session.startedAt;
      const firstNavigationIndex =
        node.firstNavigationIndex === null ||
        node.firstNavigationIndex === undefined
          ? 0
          : node.firstNavigationIndex;
      const postVisitDurationMs = Math.max(
        0,
        timestamp - (seenAt || session.startedAt),
      );
      const postVisitDepth = Math.max(
        0,
        navigationCount - firstNavigationIndex,
      );
      const durationShare =
        sessionDuration > 0 ? postVisitDurationMs / sessionDuration : 0;
      const depthShare =
        navigationCount > 0 ? postVisitDepth / navigationCount : 0;
      // Score favors time after visit, with depth as a secondary signal.
      const score = durationShare * 0.7 + depthShare * 0.3;
      const durationHit = postVisitDurationMs >= TRAP_DOOR_MIN_POST_DURATION_MS;
      const depthHit = postVisitDepth >= TRAP_DOOR_MIN_POST_DEPTH;

      return {
        url: node.url,
        firstSeenAt: seenAt || session.startedAt,
        postVisitDurationMs,
        postVisitDepth,
        score,
        qualifies: durationHit || depthHit,
        reasons: {
          durationHit,
          depthHit,
        },
      };
    })
    .filter((candidate) => candidate.qualifies)
    .sort((a, b) => b.score - a.score)
    .slice(0, TRAP_DOOR_MAX_RESULTS);

  session.trapDoors = candidates;
}

// Debounce expensive analysis when navigation is rapid.
function scheduleSessionAnalysis(session, timestamp) {
  if (!session?.id) {
    return;
  }
  analysisSessionId = session.id;
  analysisTimestamp = timestamp || now();
  if (analysisTimer) {
    clearTimeout(analysisTimer);
  }
  analysisTimer = setTimeout(() => {
    analysisTimer = null;
    const target = state?.sessions?.[analysisSessionId];
    if (!target) {
      return;
    }
    evaluateTrapDoors(target, analysisTimestamp || now());
    const metrics = ensureSessionMetrics(target);
    if (metrics) {
      const nodeCount = Object.keys(target.nodes || {}).length;
      if (metrics.nodesCount !== nodeCount) {
        metrics.nodesCount = nodeCount;
      }
    }
    const shouldRecompute =
      !metrics ||
      metrics.maxDirty ||
      !target.label ||
      !target.categoryTotals;
    if (shouldRecompute) {
      computeSessionInsights(target);
    }
  }, 400);
}

// Batch storage writes to avoid spiking the service worker on rapid events.
function schedulePersistState(reason) {
  scheduleRealtimeBroadcast(reason || "persist");
  const nowTs = now();
  if (!persistPendingSince) {
    persistPendingSince = nowTs;
  }
  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  if (
    persistPendingSince &&
    nowTs - persistPendingSince >= PERSIST_MAX_WAIT_MS
  ) {
    flushPersistState(reason || "max_wait");
    return;
  }
  persistTimer = setTimeout(() => {
    flushPersistState(reason || "debounced");
  }, PERSIST_DEBOUNCE_MS);
}

function flushPersistState(reason) {
  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  persistTimer = null;
  persistPendingSince = null;
  persistState(reason);
}

function persistState(reason) {
  if (!state) {
    return;
  }
  syncTrackingToState();
  pruneDeletedSessionsIfNeeded();
  const payload = encodeStateForStorage(state);
  storageSet({ [STORAGE_KEY]: payload }, reason || "persist").then(() => {});
  if (runtime.settings?.syncEnabled) {
    persistSyncState(reason);
  }
}

function shouldBroadcastRealtime() {
  return (
    !!runtime.settings?.realtimeStreamEnabled &&
    !!runtime.settings?.realtimePortPush &&
    livePorts.size > 0
  );
}

function scheduleRealtimeBroadcast(reason) {
  if (!shouldBroadcastRealtime()) {
    return;
  }
  const windowMs = runtime.settings?.realtimeBatchUpdates
    ? clampNumber(
        runtime.settings?.realtimeBatchWindowMs,
        REALTIME_MIN_BATCH_MS,
        REALTIME_MAX_BATCH_MS,
        REALTIME_DEFAULT_BATCH_MS,
      )
    : 0;
  if (!windowMs) {
    broadcastRealtime(reason || "immediate");
    return;
  }
  const nowTs = now();
  if (!realtimeBroadcastPendingSince) {
    realtimeBroadcastPendingSince = nowTs;
  }
  if (realtimeBroadcastTimer) {
    clearTimeout(realtimeBroadcastTimer);
  }
  if (
    realtimeBroadcastPendingSince &&
    nowTs - realtimeBroadcastPendingSince >= windowMs
  ) {
    realtimeBroadcastPendingSince = null;
    broadcastRealtime(reason || "max_wait");
    return;
  }
  realtimeBroadcastTimer = setTimeout(() => {
    realtimeBroadcastTimer = null;
    realtimeBroadcastPendingSince = null;
    broadcastRealtime(reason || "batch");
  }, windowMs);
}

function broadcastRealtime(reason) {
  if (!state || livePorts.size === 0) {
    return;
  }
  livePorts.forEach((port) => {
    const meta = livePortMeta.get(port);
    if (!meta) {
      return;
    }
    if (runtime.settings?.realtimeDeltaSync) {
      const delta = buildStateDelta(meta);
      if (delta) {
        safePortPost(port, { type: "state_delta", reason, ...delta });
      }
      return;
    }
    sendPortStateSnapshot(port, reason || "snapshot");
  });
}

function sendPortStateSnapshot(port, reason) {
  if (!port || !state) {
    return;
  }
  safePortPost(port, { type: "state_snapshot", reason, state });
  const meta = livePortMeta.get(port);
  if (meta) {
    meta.lastSessionId = state.activeSessionId || null;
    const session = state.activeSessionId
      ? state.sessions?.[state.activeSessionId]
      : null;
    meta.lastSessionUpdatedAt = session?.updatedAt || null;
    meta.lastEventCursor =
      typeof session?.eventCursor === "number" ? session.eventCursor : null;
    meta.lastTrackingActiveSince = state.tracking?.activeSince || null;
    meta.lastSessionFingerprints = {};
    Object.values(state.sessions || {}).forEach((item) => {
      if (!item || !item.id) {
        return;
      }
      meta.lastSessionFingerprints[item.id] = buildSessionFingerprint(item);
    });
    meta.lastSessionOrderKey = buildSessionOrderKey(state.sessionOrder || []);
  }
}

function safePortPost(port, payload) {
  try {
    port.postMessage(payload);
  } catch (error) {
    livePorts.delete(port);
    livePortMeta.delete(port);
  }
}

function buildStateDelta(meta) {
  if (!state) {
    return null;
  }
  const sessionId = state.activeSessionId;
  const session = sessionId ? state.sessions?.[sessionId] : null;
  const tracking = state.tracking ? { ...state.tracking } : null;
  const delta = {
    sessionId,
    tracking,
    sessionPatch: session ? buildSessionPatch(session) : null,
    sessionsPatch: [],
    sessionOrder: null,
    nodePatch: null,
    edgePatch: null,
    eventPatch: null,
  };
  if (session && tracking?.activeUrl && session.nodes?.[tracking.activeUrl]) {
    delta.nodePatch = buildNodePatch(session.nodes[tracking.activeUrl]);
  }
  if (session && tracking?.activeEdgeKey && session.edges?.[tracking.activeEdgeKey]) {
    delta.edgePatch = buildEdgePatch(session.edges[tracking.activeEdgeKey]);
  }
  const latestEvent = session ? getLatestSessionEvent(session) : null;
  if (
    session &&
    typeof session.eventCursor === "number" &&
    session.eventCursor !== meta.lastEventCursor
  ) {
    delta.eventPatch = latestEvent;
    meta.lastEventCursor = session.eventCursor;
  }
  const fingerprints = meta.lastSessionFingerprints || {};
  Object.values(state.sessions || {}).forEach((item) => {
    if (!item || !item.id) {
      return;
    }
    const fingerprint = buildSessionFingerprint(item);
    if (fingerprints[item.id] !== fingerprint) {
      delta.sessionsPatch.push(buildSessionPatch(item));
      fingerprints[item.id] = fingerprint;
    }
  });
  meta.lastSessionFingerprints = fingerprints;
  const orderKey = buildSessionOrderKey(state.sessionOrder || []);
  if (orderKey !== meta.lastSessionOrderKey) {
    delta.sessionOrder = (state.sessionOrder || []).slice();
    meta.lastSessionOrderKey = orderKey;
  }
  meta.lastSessionId = sessionId || null;
  meta.lastSessionUpdatedAt = session?.updatedAt || null;
  meta.lastTrackingActiveSince = tracking?.activeSince || null;
  return delta;
}

function buildSessionPatch(session) {
  return {
    id: session.id,
    updatedAt: session.updatedAt || 0,
    startedAt: session.startedAt || 0,
    endedAt: session.endedAt || null,
    endReason: session.endReason || null,
    lastActivityAt: session.lastActivityAt || null,
    firstActivityAt: session.firstActivityAt || null,
    navigationCount: session.navigationCount || 0,
    label: session.label || "",
    labelDetail: session.labelDetail || "",
    metrics: session.metrics || null,
    categoryTotals: session.categoryTotals || null,
    trapDoors: session.trapDoors || null,
    distractionAverage: session.distractionAverage || 0,
    distractionNormalized: session.distractionNormalized || 0,
    distractionLabel: session.distractionLabel || "",
    intentDriftScore: session.intentDriftScore ?? 0,
    intentDriftLabel: session.intentDriftLabel || "Unknown",
    intentDriftReason: session.intentDriftReason || "Not enough data yet.",
    intentDriftConfidence: session.intentDriftConfidence || "low",
    intentDriftDrivers: Array.isArray(session.intentDriftDrivers)
      ? session.intentDriftDrivers.slice(0, 3)
      : [],
    summaryBrief: session.summaryBrief || "",
    summaryDetailed: session.summaryDetailed || "",
    summaryUpdatedAt: session.summaryUpdatedAt || null,
    favorite: !!session.favorite,
    favoriteAt: session.favoriteAt || null,
    deleted: !!session.deleted,
    deletedAt: session.deletedAt || null,
    archived: !!session.archived,
    archivedAt: session.archivedAt || null,
  };
}

function buildSessionFingerprint(session) {
  return [
    session.updatedAt || 0,
    session.summaryUpdatedAt || 0,
    session.favorite ? 1 : 0,
    session.deleted ? 1 : 0,
    session.archived ? 1 : 0,
    session.navigationCount || 0,
    session.eventCursor || 0,
    session.intentDriftLabel || "",
    session.intentDriftScore || 0,
    Array.isArray(session.intentDriftDrivers)
      ? session.intentDriftDrivers.join(",")
      : "",
  ].join("|");
}

function buildSessionOrderKey(order) {
  if (!Array.isArray(order)) {
    return "";
  }
  const length = order.length;
  if (!length) {
    return "0";
  }
  const first = order[0];
  const last = order[length - 1];
  return `${length}:${first}:${last}`;
}

function buildNodePatch(node) {
  return {
    id: node.id,
    url: node.url,
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
}

function buildEdgePatch(edge) {
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    visitCount: edge.visitCount || 0,
    activeMs: edge.activeMs || 0,
    firstSeen: edge.firstSeen || 0,
    lastSeen: edge.lastSeen || 0,
  };
}

function getLatestSessionEvent(session) {
  const events = Array.isArray(session.events) ? session.events : [];
  if (!events.length) {
    return null;
  }
  if (typeof session.eventCursor !== "number") {
    return events[events.length - 1];
  }
  const cursor = session.eventCursor % events.length;
  const index = (cursor - 1 + events.length) % events.length;
  return events[index];
}

function persistSyncState(reason) {
  const syncState = buildSyncState(state);
  storageSyncSet({ [SYNC_STATE_KEY]: syncState }, reason || "sync_persist").then(
    () => {},
  );
}

function buildSyncState(sourceState) {
  const sessions = sourceState.sessions || {};
  const ordered = (sourceState.sessionOrder || [])
    .map((id) => sessions[id])
    .filter((session) => session && !session.deleted)
    .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));

  const keepSessions = ordered.slice(-3);
  const slimSessions = {};
  const sessionOrder = [];
  keepSessions.forEach((session) => {
    const trimmedEvents = trimEventsForStorage(getSessionEvents(session), 800);
    slimSessions[session.id] = {
      ...session,
      events: trimmedEvents,
      eventCursor: trimmedEvents.length % MAX_EVENTS,
      eventCount: Math.min(trimmedEvents.length, MAX_EVENTS),
    };
    sessionOrder.push(session.id);
  });

  const trimmedState = {
    schemaVersion: sourceState.schemaVersion || SCHEMA_VERSION,
    sessions: slimSessions,
    sessionOrder,
    activeSessionId: sourceState.activeSessionId,
    tracking: sourceState.tracking,
    tabs: sourceState.tabs || {},
    syncMeta: {
      syncedAt: now(),
      trimmed: true,
    },
  };
  return compactStateForStorage(trimStateForStorage(trimmedState));
}

function pruneDeletedSessionsIfNeeded() {
  const timestamp = now();
  if (timestamp - lastDeletedPruneAt < DELETED_PRUNE_INTERVAL_MS) {
    return;
  }
  pruneDeletedSessions(timestamp);
  lastDeletedPruneAt = timestamp;
}

function pruneDeletedSessions(timestamp) {
  if (!state || !state.sessions) {
    return;
  }
  const cutoff = timestamp - DELETED_RETENTION_MS;
  const removeIds = new Set();
  Object.entries(state.sessions).forEach(([id, session]) => {
    if (session?.deleted && session.deletedAt && session.deletedAt < cutoff) {
      removeIds.add(id);
    }
  });

  if (!removeIds.size) {
    pruneOldEvents(timestamp);
    return;
  }

  removeIds.forEach((id) => {
    delete state.sessions[id];
  });
  state.sessionOrder = (state.sessionOrder || []).filter(
    (id) => !removeIds.has(id),
  );
  if (state.activeSessionId && removeIds.has(state.activeSessionId)) {
    state.activeSessionId = null;
  }
  pruneOldEvents(timestamp);
}

function pruneOldEvents(timestamp) {
  if (!state || !state.sessions) {
    return;
  }
  const cutoff = timestamp - SESSION_EVENT_RETENTION_MS;
  Object.values(state.sessions).forEach((session) => {
    if (!session || !session.endedAt || session.endedAt >= cutoff) {
      return;
    }
    if (session.events && session.events.length) {
      session.events = [];
      session.eventCursor = 0;
      session.eventCount = 0;
    }
  });
}

function storageGet(key) {
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

function recordStorageError(type, error, reason) {
  const message =
    typeof error?.message === "string" && error.message
      ? error.message
      : "Unknown storage error";
  if (state && state.sessions) {
    recordEvent(type, { message, reason });
  } else {
    console.error(`${type}: ${message}`, reason || "");
  }
  return message;
}

function storageSet(payload, reason = "storage_set") {
  return new Promise((resolve) =>
    chrome.storage.local.set(payload, () => {
      if (chrome.runtime.lastError) {
        const message = recordStorageError(
          "storage_error",
          chrome.runtime.lastError,
          reason,
        );
        resolve({ ok: false, error: message });
        return;
      }
      resolve({ ok: true });
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

function storageSyncSet(payload, reason = "sync_set") {
  return new Promise((resolve) =>
    chrome.storage.sync.set(payload, () => {
      if (chrome.runtime.lastError) {
        const message = recordStorageError(
          "sync_error",
          chrome.runtime.lastError,
          reason,
        );
        resolve({ ok: false, error: message });
        return;
      }
      resolve({ ok: true });
    }),
  );
}

async function loadSettings() {
  const stored = await storageSyncGet(SETTINGS_KEY);
  const wasPaused = runtime.settings?.trackingPaused;
  runtime.settings = sanitizeSettings(stored[SETTINGS_KEY]);
  resetUrlMetaCache();
  invalidateScoreCaches();
  if (wasPaused !== runtime.settings.trackingPaused) {
    applyTrackingPauseState(runtime.settings.trackingPaused);
  }
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
  next.theme =
    typeof next.theme === "string" ? next.theme : DEFAULT_SETTINGS.theme;
  next.tone = next.tone === "direct" ? "direct" : "neutral";
  next.syncEnabled = !!next.syncEnabled;
  next.trackingPaused = !!next.trackingPaused;
  next.directCallouts = !!next.directCallouts;
  next.intentDriftAlerts = !!next.intentDriftAlerts;
  next.intentDriftSensitivity = ["low", "balanced", "high"].includes(
    next.intentDriftSensitivity,
  )
    ? next.intentDriftSensitivity
    : "balanced";
  next.realtimeStreamEnabled = !!next.realtimeStreamEnabled;
  next.realtimeDeltaSync = !!next.realtimeDeltaSync;
  next.realtimePortPush = !!next.realtimePortPush;
  next.realtimeLiveTimers = !!next.realtimeLiveTimers;
  next.realtimeBatchUpdates = !!next.realtimeBatchUpdates;
  next.realtimeBatchWindowMs = clampNumber(
    next.realtimeBatchWindowMs,
    REALTIME_MIN_BATCH_MS,
    REALTIME_MAX_BATCH_MS,
    REALTIME_DEFAULT_BATCH_MS,
  );
  next.realtimePriorityUpdates = !!next.realtimePriorityUpdates;
  next.realtimeOptimisticUi = !!next.realtimeOptimisticUi;
  next.realtimeWorkerOffload = !!next.realtimeWorkerOffload;
  next.realtimeFrameAligned = !!next.realtimeFrameAligned;
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
  return next;
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
    return value
      .split(/\r?\n|,/)
      .map((entry) => normalizeDomainPattern(entry))
      .filter(Boolean);
  }
  return [];
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, num));
}

function getSessionIdleThresholdMs() {
  return (
    (runtime.settings?.sessionTimeoutMinutes ||
      DEFAULT_SETTINGS.sessionTimeoutMinutes) *
    60 *
    1000
  );
}

function getUserIdleTimeoutMs() {
  return (
    (runtime.settings?.userIdleMinutes || DEFAULT_SETTINGS.userIdleMinutes) *
    60 *
    1000
  );
}

function getAdaptiveIdleTimeoutMs() {
  const base = getUserIdleTimeoutMs();
  const activityType = runtime.lastActivityType || "";
  if (["keydown", "mousedown", "pointerdown", "touchstart"].includes(activityType)) {
    return Math.max(30 * 1000, Math.round(base * 0.6));
  }
  if (["scroll", "wheel", "mousemove"].includes(activityType)) {
    return Math.min(10 * 60 * 1000, Math.round(base * 1.6));
  }
  return base;
}

function resetUrlMetaCache() {
  runtime.urlMetaCache = new Map();
  runtime.normalizedUrlCache = new Map();
}

function cacheSet(map, key, value, limit) {
  if (map.has(key)) {
    map.delete(key);
  }
  map.set(key, value);
  if (map.size <= limit) {
    return;
  }
  const firstKey = map.keys().next().value;
  map.delete(firstKey);
}

function normalizeUrl(url) {
  if (!url || typeof url !== "string") {
    return null;
  }
  if (runtime.normalizedUrlCache.has(url)) {
    return runtime.normalizedUrlCache.get(url);
  }
  if (!/^(https?:|chrome-extension:)/i.test(url)) {
    cacheSet(runtime.normalizedUrlCache, url, null, URL_META_CACHE_LIMIT);
    return null;
  }
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const normalized = parsed.toString();
    cacheSet(runtime.normalizedUrlCache, url, normalized, URL_META_CACHE_LIMIT);
    return normalized;
  } catch (error) {
    cacheSet(runtime.normalizedUrlCache, url, null, URL_META_CACHE_LIMIT);
    return null;
  }
}

function getUrlMeta(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) {
    return { normalized: null, domain: null, category: "Random" };
  }
  const cached = runtime.urlMetaCache.get(normalized);
  if (cached) {
    return cached;
  }
  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.toLowerCase();

    const override = getCategoryOverride(host);
    if (override) {
      const meta = { normalized, domain: host, category: override };
      cacheSet(runtime.urlMetaCache, normalized, meta, URL_META_CACHE_LIMIT);
      return meta;
    }

    let category = "Random";
    if (host.endsWith(".edu") || host.includes(".edu.")) {
      category = "Study";
    } else if (host.endsWith(".gov") || host.includes(".gov.")) {
      category = "News";
    } else if (host.startsWith("news.")) {
      category = "News";
    } else if (host.includes("google.") && path.startsWith("/search")) {
      category = "Study";
    } else {
      for (const rule of CATEGORY_RULES) {
        if (rule.domains.some((domain) => matchesDomain(host, domain))) {
          category = rule.category;
          break;
        }
      }
    }

    const aiCategory = globalThis.IRHTShared?.resolveCategoryWithAI
      ? globalThis.IRHTShared.resolveCategoryWithAI(normalized, "Random")
      : null;
    if (aiCategory && CATEGORY_LIST.includes(aiCategory)) {
      category = aiCategory;
    }

    const meta = { normalized, domain: host, category };
    cacheSet(runtime.urlMetaCache, normalized, meta, URL_META_CACHE_LIMIT);
    return meta;
  } catch (error) {
    return { normalized, domain: null, category: "Random" };
  }
}

function classifyUrl(url) {
  return getUrlMeta(url).category || "Random";
}

function getCategoryOverride(host) {
  const overrides = runtime.settings?.categoryOverrides;
  if (!overrides || typeof overrides !== "object") {
    return null;
  }
  for (const [pattern, category] of Object.entries(overrides)) {
    if (!pattern || !category) {
      continue;
    }
    if (matchesDomain(host, pattern)) {
      return category;
    }
  }
  return null;
}

function matchesDomain(host, pattern) {
  return globalThis.IRHTShared?.matchesDomain
    ? globalThis.IRHTShared.matchesDomain(host, pattern)
    : false;
}

function isLateNight(timestamp) {
  return globalThis.IRHTShared?.isLateNight
    ? globalThis.IRHTShared.isLateNight(
        timestamp,
        DISTRACTION_LATE_NIGHT_START,
        DISTRACTION_LATE_NIGHT_END,
      )
    : false;
}

function isTechnicalUrl(url) {
  return globalThis.IRHTShared?.isTechnicalUrl
    ? globalThis.IRHTShared.isTechnicalUrl(url)
    : false;
}

function computeSessionSignals(session) {
  return globalThis.IRHTShared?.computeSessionSignals
    ? globalThis.IRHTShared.computeSessionSignals(session)
    : {
        totalActiveMs: 0,
        totalMinutes: 0,
        navCount: 0,
        avgDwellMs: 0,
        topShare: 0,
        revisitShare: 0,
        hopRate: 0,
        feedLike: false,
      };
}

function normalizeDistractionScore(score) {
  return globalThis.IRHTShared?.normalizeDistractionScore
    ? globalThis.IRHTShared.normalizeDistractionScore(score)
    : 0;
}

function getDistractionLabel(normalizedScore) {
  return globalThis.IRHTShared?.getDistractionLabel
    ? globalThis.IRHTShared.getDistractionLabel(normalizedScore)
    : "Focused";
}

function computeIntentDrift(session, signals) {
  if (!globalThis.IRHTShared?.computeIntentDrift) {
    return {
      score: 0,
      label: "Unknown",
      reason: "Not enough data yet.",
      confidence: "low",
      drivers: [],
    };
  }
  return globalThis.IRHTShared.computeIntentDrift(session, signals, {
    settings: runtime.settings,
    matchDomain: matchesDomain,
  });
}

function applyIntentDrift(session, signals) {
  if (!session) {
    return;
  }
  const result = computeIntentDrift(session, signals);
  session.intentDriftScore = Number.isFinite(result?.score) ? result.score : 0;
  session.intentDriftLabel = result?.label || "Unknown";
  session.intentDriftReason = result?.reason || "Not enough data yet.";
  session.intentDriftConfidence = result?.confidence || "low";
  session.intentDriftDrivers = Array.isArray(result?.drivers)
    ? result.drivers.slice(0, 3)
    : [];
}

function buildSessionInsightsKey(session, metrics) {
  const nodesCount =
    metrics?.nodesCount ?? Object.keys(session?.nodes || {}).length;
  const activeBucket = Math.round((metrics?.totalActiveMs || 0) / 60000);
  const navBucket = Math.round((session?.navigationCount || 0) / 5);
  const topCategory = pickDominantCategory(
    metrics?.categoryTotals || session?.categoryTotals || {},
  );
  const distractionBucket = Math.round(
    normalizeDistractionScore(session?.distractionAverage || 0) / 5,
  );
  return [
    nodesCount,
    navBucket,
    activeBucket,
    topCategory || "",
    distractionBucket,
  ].join("|");
}

function computeDistractionScore(node, session, signals = null, overrides = null) {
  if (!globalThis.IRHTShared?.computeDistractionScore) {
    return {
      score: 0,
      components: {
        activeTimeWeight: 0,
        chainDepthWeight: 0,
        lateNightWeight: 0,
      },
    };
  }
  return globalThis.IRHTShared.computeDistractionScore(node, session, {
    signals,
    settings: runtime.settings,
    categoryMultipliers: CATEGORY_MULTIPLIERS,
    activeWeightCap: DISTRACTION_ACTIVE_WEIGHT_CAP,
    lateNightWeight: DISTRACTION_LATE_NIGHT_WEIGHT,
    isLateNight: overrides?.isLateNight || isLateNight,
    matchDomain: matchesDomain,
  });
}

function computeDistractionScoreCached(node, session, signals) {
  if (!node) {
    return { score: 0, components: null };
  }
  const cacheKey = [
    node.activeMs || 0,
    node.visitCount || 0,
    node.category || "",
    node.firstNavigationIndex ?? "",
    session?.navigationCount || 0,
    signals?.revisitShare || 0,
    signals?.hopRate || 0,
    signals?.feedLike ? 1 : 0,
    runtime.settings?.productiveSites?.length || 0,
    runtime.settings?.distractingSites?.length || 0,
  ].join("|");
  if (node._scoreCache && node._scoreCache.key === cacheKey) {
    return node._scoreCache.data;
  }
  const scoreData = computeDistractionScore(node, session, signals, {
    isLateNight: () => !!node._lateNight,
  });
  node._scoreCache = { key: cacheKey, data: scoreData };
  return scoreData;
}

function invalidateScoreCaches() {
  if (!state || !state.sessions) {
    return;
  }
  Object.values(state.sessions).forEach((session) => {
    Object.values(session?.nodes || {}).forEach((node) => {
      if (node) {
        node._scoreCache = null;
      }
    });
    if (session) {
      session.metrics = null;
      session._insightsKey = null;
    }
  });
}

function ensureSessionMetrics(session) {
  if (!session) {
    return null;
  }
  if (session.metrics && session.metrics.version === 1) {
    return session.metrics;
  }
  const nodes = Object.values(session.nodes || {});
  const metrics = {
    version: 1,
    totalActiveMs: 0,
    nodesCount: nodes.length,
    maxNodeActiveMs: 0,
    revisitCount: 0,
    weightedScore: 0,
    categoryTotals: {},
    maxDirty: false,
  };
  const signals = computeSessionSignals(session);

  nodes.forEach((node) => {
    if (!node.category) {
      node.category = classifyUrl(node.url);
    }
    if (node._lateNight === undefined) {
      node._lateNight = isLateNight(node.firstSeen);
    }
    const scoreData = computeDistractionScoreCached(node, session, signals);
    node.distractionScore = scoreData.score;
    node.distractionComponents = scoreData.components;
    const activeMs = node.activeMs || 0;
    metrics.totalActiveMs += activeMs;
    metrics.weightedScore += activeMs * scoreData.score;
    metrics.maxNodeActiveMs = Math.max(metrics.maxNodeActiveMs, activeMs);
    if ((node.visitCount || 0) > 1) {
      metrics.revisitCount += 1;
    }
    metrics.categoryTotals[node.category] =
      (metrics.categoryTotals[node.category] || 0) + activeMs;
  });

  session.metrics = metrics;
  session.categoryTotals = metrics.categoryTotals;
  session.distractionAverage = metrics.totalActiveMs
    ? metrics.weightedScore / metrics.totalActiveMs
    : 0;
  session.distractionNormalized = normalizeDistractionScore(
    session.distractionAverage,
  );
  session.distractionLabel = getDistractionLabel(
    session.distractionNormalized,
  );
  applyIntentDrift(session, signals);
  return metrics;
}

function updateSessionInsightsForNode(session, node, prevSnapshot = null) {
  if (!session || !node) {
    return;
  }
  const metrics = ensureSessionMetrics(session);
  if (!metrics) {
    return;
  }
  const prevActiveMs = prevSnapshot?.activeMs ?? node.activeMs ?? 0;
  const prevScore = prevSnapshot?.score ?? node.distractionScore ?? 0;
  const prevCategory = prevSnapshot?.category ?? node.category ?? "Random";
  const prevVisitCount = prevSnapshot?.visitCount ?? node.visitCount ?? 0;

  if (!node.category) {
    node.category = classifyUrl(node.url);
  }
  if (node._lateNight === undefined) {
    node._lateNight = isLateNight(node.firstSeen);
  }

  if (metrics.nodesCount === 0 && Object.keys(session.nodes || {}).length) {
    metrics.nodesCount = Object.keys(session.nodes).length;
  }

  const nextActiveMs = node.activeMs || 0;
  metrics.totalActiveMs += nextActiveMs - prevActiveMs;

  const wasRevisit = prevVisitCount > 1;
  const isRevisit = (node.visitCount || 0) > 1;
  if (wasRevisit !== isRevisit) {
    metrics.revisitCount += isRevisit ? 1 : -1;
  }

  if (nextActiveMs >= metrics.maxNodeActiveMs) {
    metrics.maxNodeActiveMs = nextActiveMs;
  } else if (prevActiveMs === metrics.maxNodeActiveMs) {
    metrics.maxDirty = true;
  }

  const signals = computeSessionSignals(session);
  const scoreData = computeDistractionScoreCached(node, session, signals);
  node.distractionScore = scoreData.score;
  node.distractionComponents = scoreData.components;
  const nextScore = node.distractionScore || 0;

  metrics.weightedScore += nextActiveMs * nextScore - prevActiveMs * prevScore;

  metrics.categoryTotals[prevCategory] =
    (metrics.categoryTotals[prevCategory] || 0) - prevActiveMs;
  if (metrics.categoryTotals[prevCategory] <= 0) {
    delete metrics.categoryTotals[prevCategory];
  }
  metrics.categoryTotals[node.category] =
    (metrics.categoryTotals[node.category] || 0) + nextActiveMs;

  session.distractionAverage = metrics.totalActiveMs
    ? metrics.weightedScore / metrics.totalActiveMs
    : 0;
  session.distractionNormalized = normalizeDistractionScore(
    session.distractionAverage,
  );
  session.distractionLabel = getDistractionLabel(
    session.distractionNormalized,
  );

  const summary = buildSessionLabel(
    session,
    Object.values(session.nodes || {}),
    metrics.categoryTotals,
    session.distractionAverage,
  );
  const nextKey = buildSessionInsightsKey(session, metrics);
  if (session._insightsKey !== nextKey || !session.label) {
    session.label = summary.text;
    session.labelDetail = summary.detail;
    session._insightsKey = nextKey;
  }
  applyIntentDrift(session, signals);
}

function computeSessionInsights(session) {
  if (!session) {
    return;
  }
  if (session.metrics && !session.metrics.maxDirty) {
    const nodeCount = Object.keys(session.nodes || {}).length;
    if (session.metrics.nodesCount === nodeCount) {
      const cachedKey = buildSessionInsightsKey(session, session.metrics);
      const hasIntentDrift =
        session.intentDriftLabel !== undefined &&
        session.intentDriftReason !== undefined &&
        session.intentDriftConfidence !== undefined;
      if (session._insightsKey === cachedKey && session.label && hasIntentDrift) {
        return;
      }
    }
  }
  const nodes = Object.values(session.nodes || {});
  if (!nodes.length) {
    session.label = "No activity captured.";
    session.labelDetail = null;
    session.categoryTotals = {};
    session.distractionAverage = 0;
    session.distractionNormalized = 0;
    session.distractionLabel = "Focused";
    session.metrics = {
      version: 1,
      totalActiveMs: 0,
      nodesCount: 0,
      maxNodeActiveMs: 0,
      revisitCount: 0,
      weightedScore: 0,
      categoryTotals: {},
      maxDirty: false,
    };
    applyIntentDrift(session, computeSessionSignals(session));
    session._insightsKey = buildSessionInsightsKey(session, session.metrics);
    return;
  }

  const categoryTotals = {};
  let totalActive = 0;
  let weightedScore = 0;
  const signals = computeSessionSignals(session);

  nodes.forEach((node) => {
    if (!node.category) {
      node.category = classifyUrl(node.url);
    }
    if (node._lateNight === undefined) {
      node._lateNight = isLateNight(node.firstSeen);
    }
    const scoreData = computeDistractionScoreCached(node, session, signals);
    node.distractionScore = scoreData.score;
    node.distractionComponents = scoreData.components;

    const activeMs = node.activeMs || 0;
    totalActive += activeMs;
    weightedScore += activeMs * scoreData.score;
    categoryTotals[node.category] =
      (categoryTotals[node.category] || 0) + activeMs;
  });

  session.categoryTotals = categoryTotals;
  session.distractionAverage = totalActive ? weightedScore / totalActive : 0;
  session.distractionNormalized = normalizeDistractionScore(
    session.distractionAverage,
  );
  session.distractionLabel = getDistractionLabel(
    session.distractionNormalized,
  );
  session.metrics = {
    version: 1,
    totalActiveMs: totalActive,
    nodesCount: nodes.length,
    maxNodeActiveMs: nodes.reduce(
      (max, node) => Math.max(max, node.activeMs || 0),
      0,
    ),
    revisitCount: nodes.filter((node) => (node.visitCount || 0) > 1).length,
    weightedScore,
    categoryTotals,
    maxDirty: false,
  };

  const summary = buildSessionLabel(
    session,
    nodes,
    categoryTotals,
    session.distractionAverage,
  );
  session.label = summary.text;
  session.labelDetail = summary.detail;
  applyIntentDrift(session, signals);
  session._insightsKey = buildSessionInsightsKey(session, session.metrics);
}

function buildSessionLabel(session, nodes, categoryTotals, avgScore) {
  const signals = computeSessionSignals(session);
  const shortSession = signals.totalActiveMs < 90 * 1000;
  const focus =
    signals.topShare >= 0.6 &&
    signals.avgDwellMs >= 120000 &&
    signals.hopRate <= 1.5;
  const wandering =
    (signals.avgDwellMs > 0 && signals.avgDwellMs <= 45000) ||
    signals.hopRate >= 3;
  const looping = signals.revisitShare >= 0.35 && nodes.length >= 4;
  const lateNight = isLateNight(
    session.firstActivityAt || session.startedAt,
  );
  const dominantCategory = pickDominantCategory(categoryTotals || {});

  let text = "Mixed pace";
  let detail = "Some focus with intermittent drift.";
  if (shortSession) {
    text = "Just starting";
    detail = "Not enough data yet to label the flow.";
  } else if (focus) {
    text = "Steady focus";
    detail = "Long dwell on one thread with minimal hopping.";
  } else if (wandering && looping) {
    text = "Looping jumps";
    detail = "Revisiting the same places while switching fast.";
  } else if (wandering) {
    text = "Quick hops";
    detail = "Short visits with frequent switches.";
  } else if (looping) {
    text = "Repeat loop";
    detail = "Revisiting a few sites again and again.";
  } else if (lateNight) {
    text = "Late-night drift";
    detail = "Late hours tend to loosen attention.";
  }

  if (dominantCategory) {
    detail = `${detail} Mostly ${dominantCategory} sites.`;
  }

  return { text, detail };
}

function pickDominantCategory(categoryTotals) {
  let topCategory = null;
  let topValue = -1;
  Object.entries(categoryTotals || {}).forEach(([category, value]) => {
    if (value > topValue) {
      topValue = value;
      topCategory = category;
    }
  });
  return topCategory;
}

function pickEarlyCategory(nodes, session) {
  if (!nodes.length) {
    return null;
  }
  const sorted = [...nodes].sort(
    (a, b) => (a.firstSeen || 0) - (b.firstSeen || 0),
  );
  const baseline =
    session.firstActivityAt || session.startedAt || sorted[0].firstSeen || now();
  const cutoff = baseline + 10 * 60 * 1000;
  let earlyNodes = sorted.filter((node) => (node.firstSeen || 0) <= cutoff);
  if (earlyNodes.length < 3) {
    earlyNodes = sorted.slice(0, 3);
  }
  const earlyTotals = {};
  earlyNodes.forEach((node) => {
    const category = node.category || classifyUrl(node.url);
    earlyTotals[category] = (earlyTotals[category] || 0) + (node.activeMs || 0);
  });
  return pickDominantCategory(earlyTotals);
}

function isEntertainmentCategory(category) {
  return (
    category === "Video" ||
    category === "Social" ||
    category === "Shopping" ||
    category === "Random"
  );
}

function isProductiveCategory(category) {
  return category === "Study" || category === "News";
}

function getDomain(url) {
  return globalThis.IRHTShared?.getDomain
    ? globalThis.IRHTShared.getDomain(url)
    : null;
}

function ensureTabState(tabId) {
  if (!state.tabs[tabId]) {
    state.tabs[tabId] = {
      lastUrl: null,
      lastTitle: null,
      lastEdgeKey: null,
      pendingSourceUrl: null,
    };
  }
  return state.tabs[tabId];
}

function ensureNode(url, title, session = getActiveSession()) {
  if (!session.nodes) {
    session.nodes = {};
  }
  if (!session.nodes[url]) {
    const meta = getUrlMeta(url);
    session.nodes[url] = {
      id: url,
      url,
      title: title || "",
      category: meta.category || classifyUrl(url),
      visitCount: 0,
      activeMs: 0,
      firstNavigationIndex: null,
      lastNavigationIndex: null,
      firstSeen: now(),
      lastSeen: now(),
      distractionScore: 0,
      distractionComponents: null,
      _lateNight: null,
      _scoreCache: null,
    };
    session.nodes[url]._lateNight = isLateNight(session.nodes[url].firstSeen);
  }
  if (title && session.nodes[url].title !== title) {
    session.nodes[url].title = title;
  }
  if (!session.nodes[url].category) {
    session.nodes[url].category = classifyUrl(url);
  }
  if (session.nodes[url]._lateNight === null) {
    session.nodes[url]._lateNight = isLateNight(session.nodes[url].firstSeen);
  }
  return session.nodes[url];
}

function edgeKey(fromUrl, toUrl) {
  return `${fromUrl} -> ${toUrl}`;
}

function ensureEdge(fromUrl, toUrl, session = getActiveSession()) {
  const key = edgeKey(fromUrl, toUrl);
  if (!session.edges[key]) {
    session.edges[key] = {
      id: key,
      from: fromUrl,
      to: toUrl,
      visitCount: 0,
      activeMs: 0,
      firstSeen: now(),
      lastSeen: now(),
    };
  }
  return session.edges[key];
}

function recordEvent(type, payload, options = {}) {
  const timestamp = now();
  const session =
    options.session ||
    (options.activity
      ? ensureSessionForActivity(timestamp, options.reason)
      : getActiveSession());
  if (!session) {
    return;
  }
  if (!session.firstActivityAt) {
    session.firstActivityAt = timestamp;
  }
  if (type === "navigation") {
    const last = getLatestEvent(session);
    if (
      last &&
      last.type === "navigation" &&
      last.tabId === payload?.tabId &&
      timestamp - last.ts <= getNavigationCoalesceMs(session, timestamp)
    ) {
      last.ts = timestamp;
      last.toUrl = payload?.toUrl || last.toUrl;
      last.transitionType = payload?.transitionType || last.transitionType;
      last.transitionQualifiers =
        payload?.transitionQualifiers || last.transitionQualifiers;
      last.source = payload?.source || last.source;
      last.coalescedCount = (last.coalescedCount || 1) + 1;
      session.updatedAt = timestamp;
      return;
    }
  }
  const event = {
    ts: timestamp,
    type,
    sessionId: session.id,
    ...payload,
  };
  appendEvent(session, event);
  session.updatedAt = timestamp;
}

function markNodeNavigation(node, navigationIndex) {
  if (
    node.firstNavigationIndex === null ||
    node.firstNavigationIndex === undefined
  ) {
    node.firstNavigationIndex = navigationIndex;
  }
  node.lastNavigationIndex = navigationIndex;
}

function isTrackingActive() {
  return (
    !isTrackingPaused() &&
    runtime.windowFocused &&
    runtime.idleState === "active"
  );
}

function isTrackingPaused() {
  return !!runtime.settings?.trackingPaused;
}

function isUserIdle() {
  if (runtime.idleState && runtime.idleState !== "active") {
    return true;
  }
  if (runtime.activeSince && runtime.windowFocused && runtime.idleState === "active") {
    return false;
  }
  if (!runtime.lastInteractionAt) {
    return false;
  }
  return now() - runtime.lastInteractionAt >= getAdaptiveIdleTimeoutMs();
}

function markUserActive(reason, tabId, options = {}) {
  if (isTrackingPaused() && !options.force) {
    return;
  }
  const timestamp = options.timestamp || now();
  const wasIdle = runtime.userIdle || isUserIdle();
  runtime.lastInteractionAt = timestamp;
  runtime.lastActivityType = reason || "activity";
  runtime.userIdle = false;
  runtime.sessionIdleEndedAt = null;
  if (wasIdle && !options.silent) {
    recordEvent(
      "user_active",
      {
        tabId: tabId ?? runtime.activeTabId,
        reason,
      },
      { activity: true, reason: "user_active" },
    );
  }
  if (!options.deferStart && isTrackingActive()) {
    startActiveTiming();
  }
  schedulePersistState("user_activity");
}

function evaluateUserIdle(reason) {
  if (isTrackingPaused()) {
    return;
  }
  if (!runtime.lastInteractionAt) {
    return;
  }
  const timestamp = now();
  const idleNow = isUserIdle();
  if (idleNow && !runtime.userIdle) {
    runtime.userIdle = true;
    flushActiveTime("user_inactive");
    runtime.lastInactiveAt = timestamp;
    recordEvent(
      "user_inactive",
      {
        tabId: runtime.activeTabId,
        reason,
      },
      { activity: false },
    );
    schedulePersistState("idle_state");
    return;
  }
  if (!idleNow && runtime.userIdle) {
    runtime.userIdle = false;
    recordEvent(
      "user_active",
      {
        tabId: runtime.activeTabId,
        reason,
      },
      { activity: true, reason: "user_active" },
    );
    if (isTrackingActive()) {
      startActiveTiming();
    }
    schedulePersistState("idle_state");
  }
  // Note: Idle timeout no longer splits sessions per PROJECT.md spec.
  // Idle only gates active-time tracking; sessions align to calendar days.
}

function applyTrackingPauseState(nextPaused) {
  if (nextPaused) {
    pauseTracking();
    return null;
  }
  return resumeTracking();
}

function pauseTracking() {
  flushActiveTime("tracking_paused");
  runtime.activeSince = null;
  runtime.userIdle = true;
  runtime.lastInactiveAt = null;
  schedulePersistState("pause_tracking");
}

async function resumeTracking() {
  runtime.lastInactiveAt = null;
  await refreshWindowFocus();
  await refreshIdleState();
  await refreshActiveTab();
  schedulePersistState("resume_tracking");
}

function startActiveTiming() {
  if (!runtime.activeTabId || !runtime.activeUrl) {
    return;
  }
  if (!isTrackingActive() || runtime.activeSince) {
    return;
  }
  runtime.activeSince = now();
  schedulePersistState("active_start");
}

function flushActiveTime(reason) {
  if (!runtime.activeSince || !runtime.activeUrl) {
    return;
  }
  const timestamp = now();
  const duration = timestamp - runtime.activeSince;
  runtime.activeSince = null;
  if (duration > 0) {
    const session = getActiveSession();
    const node = ensureNode(runtime.activeUrl, runtime.activeTitle, session);
      const prevSnapshot = {
      activeMs: node.activeMs || 0,
      score: node.distractionScore || 0,
        category: node.category || "Random",
      visitCount: node.visitCount || 0,
    };
    node.activeMs += duration;
    node.lastSeen = timestamp;
    if (runtime.activeEdgeKey && session.edges[runtime.activeEdgeKey]) {
      const edge = session.edges[runtime.activeEdgeKey];
      edge.activeMs += duration;
      edge.lastSeen = timestamp;
    }
    session.updatedAt = timestamp;
    updateSessionInsightsForNode(session, node, prevSnapshot);
  }
  recordEvent("active_time_flushed", {
    reason,
    tabId: runtime.activeTabId,
    url: runtime.activeUrl,
    durationMs: Math.max(0, duration),
  });
  schedulePersistState("active_flush");
}

function switchActiveTab(tabId, url, title) {
  if (tabId === runtime.activeTabId && url === runtime.activeUrl) {
    runtime.activeTitle = title || runtime.activeTitle;
    return;
  }
  flushActiveTime("tab_switch");
  runtime.activeTabId = tabId;
  runtime.activeUrl = url;
  runtime.activeTitle = title || null;
  runtime.activeEdgeKey = state.tabs[tabId]?.lastEdgeKey || null;
  runtime.activeSince = null;
  schedulePersistState("tab_switch");
  startActiveTiming();
}

function transitionActiveUrl(url, title, edgeKeyValue) {
  if (url === runtime.activeUrl) {
    runtime.activeTitle = title || runtime.activeTitle;
    return;
  }
  flushActiveTime("url_change");
  runtime.activeUrl = url;
  runtime.activeTitle = title || null;
  runtime.activeEdgeKey = edgeKeyValue || null;
  runtime.activeSince = null;
  schedulePersistState("url_change");
  startActiveTiming();
}

function safeGetLastFocusedWindow() {
  return new Promise((resolve) => {
    chrome.windows.getLastFocused((win) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(win || null);
    });
  });
}

function safeQueryIdleState() {
  return new Promise((resolve) => {
    chrome.idle.queryState(60, (stateValue) => {
      if (chrome.runtime.lastError) {
        resolve("active");
        return;
      }
      resolve(stateValue);
    });
  });
}

function safeTabsQuery(query) {
  return new Promise((resolve) => {
    chrome.tabs.query(query, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve([]);
        return;
      }
      resolve(tabs || []);
    });
  });
}

function safeTabsGet(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(tab || null);
    });
  });
}

async function refreshWindowFocus() {
  if (!chrome?.windows?.getLastFocused) {
    runtime.windowFocused = true;
    return;
  }
  const focusedWindow = await safeGetLastFocusedWindow();
  runtime.windowFocused =
    !!focusedWindow && focusedWindow.id !== chrome.windows.WINDOW_ID_NONE;
}

async function refreshIdleState() {
  const idleState = await safeQueryIdleState();
  runtime.idleState = idleState;
}

async function refreshActiveTab() {
  if (isTrackingPaused()) {
    return;
  }
  const tabs = await safeTabsQuery({ active: true, lastFocusedWindow: true });
  if (!tabs || tabs.length === 0) {
    return;
  }
  const timestamp = now();
  const session = ensureSessionForActivity(timestamp, "startup");
  const tab = tabs[0];
  const url = normalizeUrl(tab.url);
  const tabState = ensureTabState(tab.id);
  tabState.lastTitle = tab.title || tabState.lastTitle;
  if (url) {
    tabState.lastUrl = url;
    const node = ensureNode(url, tab.title || "", session);
    const prevSnapshot = {
      activeMs: node.activeMs || 0,
      score: node.distractionScore || 0,
        category: node.category || "Random",
      visitCount: node.visitCount || 0,
    };
    node.visitCount += 1;
    node.lastSeen = timestamp;
    markNodeNavigation(node, session.navigationCount);
    updateSessionInsightsForNode(session, node, prevSnapshot);
    recordEvent(
      "TAB_ACTIVE",
      {
        tabId: tab.id,
        windowId: tab.windowId,
        url,
      },
      { session },
    );
  }
  if (runtime.windowFocused && runtime.idleState === "active") {
    markUserActive("startup", tab.id, {
      deferStart: true,
      silent: true,
      timestamp,
    });
  }
  switchActiveTab(tab.id, url, tab.title || "");
  if (runtime.windowFocused && runtime.idleState === "active") {
    startActiveTiming();
  }
}

async function handleTabActivated(activeInfo) {
  if (isTrackingPaused()) {
    return;
  }
  const tab = await safeTabsGet(activeInfo.tabId);
  if (!tab) {
    return;
  }
  const timestamp = now();
  const session = ensureSessionForActivity(timestamp, "tab_activated");
  const url = normalizeUrl(tab.url);
  const tabState = ensureTabState(tab.id);
  tabState.lastTitle = tab.title || tabState.lastTitle;
  if (tab.id === runtime.activeTabId && url === runtime.activeUrl) {
    return;
  }
  if (url) {
    tabState.lastUrl = url;
    const node = ensureNode(url, tab.title || "", session);
    const prevSnapshot = {
      activeMs: node.activeMs || 0,
      score: node.distractionScore || 0,
      category: node.category || "Random",
      visitCount: node.visitCount || 0,
    };
    node.visitCount += 1;
    node.lastSeen = timestamp;
    markNodeNavigation(node, session.navigationCount);
    updateSessionInsightsForNode(session, node, prevSnapshot);
  }
  markUserActive("tab_activated", tab.id, { deferStart: true, timestamp });
  recordEvent(
    "tab_activated",
    {
      tabId: tab.id,
      windowId: tab.windowId,
      url,
    },
    { session },
  );
  if (url) {
    recordEvent(
      "TAB_ACTIVE",
      {
        tabId: tab.id,
        windowId: tab.windowId,
        url,
      },
      { session },
    );
  }
  switchActiveTab(tab.id, url, tab.title || "");
  if (runtime.windowFocused && runtime.idleState === "active") {
    startActiveTiming();
  }
}

function handleTabCreated(tab) {
  if (isTrackingPaused()) {
    return;
  }
  const tabState = ensureTabState(tab.id);
  const normalized = normalizeUrl(tab.url);
  tabState.lastUrl = normalized || null;
  if (tab.title) {
    tabState.lastTitle = tab.title;
  }
  recordEvent("tab_created", {
    tabId: tab.id,
    windowId: tab.windowId,
    url: normalized,
  });
  schedulePersistState("tab_created");
}

function handleTabUpdated(tabId, changeInfo, tab) {
  if (isTrackingPaused()) {
    return;
  }
  const tabState = ensureTabState(tabId);
  let changed = false;
  if (changeInfo.title && tab && tab.url) {
    const url = normalizeUrl(tab.url);
    if (url) {
      const titleChanged = tabState.lastTitle !== changeInfo.title;
      const urlChanged = tabState.lastUrl !== url;
      if (titleChanged || urlChanged) {
        ensureNode(url, changeInfo.title);
      }
      if (titleChanged) {
        tabState.lastTitle = changeInfo.title;
        changed = true;
        if (tabId === runtime.activeTabId) {
          recordEvent("TITLE_CHANGED", {
            tabId,
            windowId: tab.windowId,
            url,
            title: changeInfo.title,
          });
        }
      }
      if (urlChanged) {
        tabState.lastUrl = url;
        changed = true;
      }
    }
  }

  if (changeInfo.url) {
    const url = normalizeUrl(changeInfo.url);
    if (!url) {
      if (!tabState.lastUrl && !changed) {
        return;
      }
      tabState.lastUrl = null;
      tabState.lastEdgeKey = null;
      changed = true;
      if (tabId === runtime.activeTabId) {
        flushActiveTime("url_untrackable");
        runtime.activeUrl = null;
        runtime.activeEdgeKey = null;
        runtime.activeTitle = null;
        runtime.activeSince = null;
        schedulePersistState("url_untrackable");
      }
      recordEvent("url_untrackable", {
        tabId,
        url: changeInfo.url,
      });
    } else if (url === tabState.lastUrl) {
      if (!changed) {
        return;
      }
    } else {
      tabState.lastUrl = url;
      changed = true;
    }
  }
  if (!changed) {
    return;
  }
  schedulePersistState("tab_updated");
}

function handleTabRemoved(tabId, removeInfo) {
  if (isTrackingPaused()) {
    delete state.tabs[tabId];
    schedulePersistState("tab_removed");
    return;
  }
  if (tabId === runtime.activeTabId) {
    flushActiveTime("tab_removed");
    runtime.activeTabId = null;
    runtime.activeUrl = null;
    runtime.activeEdgeKey = null;
    runtime.activeTitle = null;
    runtime.activeSince = null;
  }
  delete state.tabs[tabId];
  recordEvent("tab_closed", {
    tabId,
    windowId: removeInfo.windowId,
  });
  schedulePersistState("tab_removed");
}

function handleWindowFocusChanged(windowId) {
  if (isTrackingPaused()) {
    return;
  }
  const wasFocused = runtime.windowFocused;
  const nextFocused = windowId !== chrome.windows.WINDOW_ID_NONE;
  if (wasFocused === nextFocused) {
    return;
  }
  runtime.windowFocused = nextFocused;
  if (wasFocused && !runtime.windowFocused) {
    flushActiveTime("window_blur");
    runtime.lastInactiveAt = now();
    flushPersistState("window_blur");
  } else if (!wasFocused && runtime.windowFocused) {
    const timestamp = now();
    const session = ensureSessionForActivity(timestamp, "window_focus");
    markUserActive("window_focus", runtime.activeTabId, {
      deferStart: true,
      timestamp,
    });
    startActiveTiming();
    recordEvent(
      "window_focus_changed",
      {
        windowId,
        focused: runtime.windowFocused,
      },
      { session },
    );
    schedulePersistState("window_focus");
    return;
  }
  recordEvent("window_focus_changed", {
    windowId,
    focused: runtime.windowFocused,
  });
  schedulePersistState("window_focus");
}

function handleIdleStateChanged(newState) {
  if (isTrackingPaused()) {
    return;
  }
  if (newState === runtime.idleState) {
    return;
  }
  const wasActive = runtime.idleState === "active";
  runtime.idleState = newState;
  if (wasActive && newState !== "active") {
    flushActiveTime("idle");
    runtime.lastInactiveAt = now();
    flushPersistState("idle_state");
  } else if (!wasActive && newState === "active") {
    const timestamp = now();
    const session = ensureSessionForActivity(timestamp, "idle_active");
    markUserActive("idle_active", runtime.activeTabId, {
      deferStart: true,
      timestamp,
    });
    startActiveTiming();
    recordEvent(
      "idle_state_changed",
      {
        state: newState,
      },
      { session },
    );
    schedulePersistState("idle_state");
    return;
  }
  recordEvent("idle_state_changed", {
    state: newState,
  });
  schedulePersistState("idle_state");
}

function handleAlarm(alarm) {
  if (!alarm) {
    return;
  }
  const timestamp = now();
  if (alarm.name === USER_IDLE_ALARM_NAME) {
    getActiveSession(timestamp);
    evaluateUserIdle("inactivity_timer");
    return;
  }
  if (alarm.name === ACTIVE_FLUSH_ALARM_NAME) {
    if (isTrackingActive() && runtime.activeSince) {
      flushActiveTime("heartbeat");
      startActiveTiming();
    }
  }
}

function handleNavigationCommitted(details) {
  if (details.frameId !== 0) {
    return;
  }
  handleNavigation(details, "committed");
}

function handleHistoryStateUpdated(details) {
  if (details.frameId !== 0) {
    return;
  }
  handleNavigation(details, "history_state");
}

function handleReferenceFragmentUpdated(details) {
  if (isTrackingPaused()) {
    return;
  }
  if (details.frameId !== 0) {
    return;
  }
  const url = normalizeUrl(details.url);
  if (!url) {
    return;
  }
  const timestamp = now();
  const session =
    details.tabId === runtime.activeTabId
      ? ensureSessionForActivity(timestamp, "hash_change")
      : getActiveSession();
  const tabState = ensureTabState(details.tabId);
  tabState.lastUrl = url;

  recordEvent(
    "HASH_CHANGED",
    {
      tabId: details.tabId,
      windowId: details.windowId,
      url,
      rawUrl: details.url,
    },
    { session },
  );
  schedulePersistState("hash_change");
}

function handleCreatedNavigationTarget(details) {
  if (isTrackingPaused()) {
    return;
  }
  if (!details || details.tabId === undefined) {
    return;
  }
  const timestamp = now();
  const isActiveSource =
    details.sourceTabId !== undefined &&
    details.sourceTabId === runtime.activeTabId &&
    runtime.windowFocused &&
    runtime.idleState === "active";
  const session = isActiveSource
    ? ensureSessionForActivity(timestamp, "navigation_target")
    : getActiveSession();
  const targetUrl = normalizeUrl(details.url);
  const fromUrl =
    details.sourceTabId === undefined
      ? null
      : ensureTabState(details.sourceTabId).lastUrl;
  const targetTabState = ensureTabState(details.tabId);

  targetTabState.pendingSourceUrl = fromUrl || null;

  recordEvent(
    "navigation_target_created",
    {
      tabId: details.tabId,
      sourceTabId: details.sourceTabId,
      sourceUrl: fromUrl,
      targetUrl,
    },
    { session },
  );
  schedulePersistState("nav_target");
}

function handleNavigation(details, source) {
  if (isTrackingPaused()) {
    return;
  }
  const url = normalizeUrl(details.url);
  if (!url) {
    return;
  }

  const timestamp = now();
  const isActiveNavigation =
    details.tabId === runtime.activeTabId &&
    runtime.windowFocused &&
    runtime.idleState === "active";
  const session = isActiveNavigation
    ? ensureSessionForActivity(timestamp, "navigation")
    : getActiveSession();
  const tabState = ensureTabState(details.tabId);
  if (tabState.lastUrl === url && !tabState.pendingSourceUrl) {
    return;
  }
  let fromUrl = tabState.lastUrl;
  if (!fromUrl && tabState.pendingSourceUrl) {
    fromUrl = tabState.pendingSourceUrl;
    tabState.pendingSourceUrl = null;
  }
  session.navigationCount += 1;
  const navIndex = session.navigationCount;
  const node = ensureNode(url, tabState.lastTitle || "", session);
  const prevSnapshot = {
    activeMs: node.activeMs || 0,
    score: node.distractionScore || 0,
    category: node.category || "Random",
    visitCount: node.visitCount || 0,
  };
  node.visitCount += 1;
  node.lastSeen = timestamp;
  markNodeNavigation(node, navIndex);

  let newEdgeKey = null;
  if (fromUrl && fromUrl !== url) {
    const edge = ensureEdge(fromUrl, url, session);
    edge.visitCount += 1;
    edge.lastSeen = timestamp;
    newEdgeKey = edge.id;
  }

  tabState.lastUrl = url;
  tabState.lastEdgeKey = newEdgeKey;

  recordEvent(
    "navigation",
    {
      tabId: details.tabId,
      windowId: details.windowId,
      fromUrl,
      toUrl: url,
      transitionType: details.transitionType,
      transitionQualifiers: details.transitionQualifiers,
      source,
    },
    { session },
  );

  if (details.tabId === runtime.activeTabId) {
    markUserActive("navigation", details.tabId, {
      deferStart: true,
      timestamp,
    });
    recordEvent(
      "URL_CHANGED",
      {
        tabId: details.tabId,
        windowId: details.windowId,
        url,
        fromUrl,
      },
      { session },
    );
    transitionActiveUrl(url, tabState.lastTitle || "", newEdgeKey);
  }

  updateSessionInsightsForNode(session, node, prevSnapshot);
  scheduleSessionAnalysis(session, timestamp);
  schedulePersistState("navigation");
}

function handleMessage(message, sender, sendResponse) {
  if (!message || !message.type) {
    return false;
  }
  const respond = (payload) => {
    try {
      sendResponse(payload);
    } catch (error) {
      // Message channel may already be closed.
    }
  };
  if (message.type === "get_state") {
    respond({ state });
    return false;
  }
  if (message.type === "user_activity") {
    handleUserActivity(message, sender);
    return false;
  }
  if (message.type === "reset_state") {
    resetState()
      .then(() => respond({ ok: true }))
      .catch(() => respond({ ok: false }));
    return true;
  }
  if (message.type === "session_reset") {
    resetActiveSession();
    respond({ ok: true });
    return true;
  }
  if (message.type === "session_archive") {
    archiveSession(message.sessionId);
    respond({ ok: true });
    return true;
  }
  if (message.type === "session_unarchive") {
    unarchiveSession(message.sessionId);
    respond({ ok: true });
    return true;
  }
  if (message.type === "session_delete") {
    deleteSessionById(message.sessionId);
    respond({ ok: true });
    return true;
  }
  if (message.type === "session_restore") {
    restoreDeletedSession(message.sessionId);
    respond({ ok: true });
    return true;
  }
  if (message.type === "session_favorite_toggle") {
    toggleSessionFavorite(message.sessionId);
    respond({ ok: true });
    return true;
  }
  if (message.type === "session_delete_all") {
    deleteAllSessions();
    respond({ ok: true });
    return true;
  }
  if (message.type === "session_summary_update") {
    updateSessionSummaries(
      message.sessionId,
      message.summaryBrief,
      message.summaryDetailed,
      message.summaryUpdatedAt,
    );
    respond({ ok: true });
    return true;
  }
  return false;
}

function handleStorageChanged(changes, area) {
  if (area !== "sync" || !changes[SETTINGS_KEY]) {
    return;
  }
  const wasPaused = runtime.settings?.trackingPaused;
  const wasSyncEnabled = runtime.settings?.syncEnabled;
  runtime.settings = sanitizeSettings(changes[SETTINGS_KEY].newValue);
  resetUrlMetaCache();
  invalidateScoreCaches();
  if (wasPaused !== runtime.settings.trackingPaused) {
    applyTrackingPauseState(runtime.settings.trackingPaused);
  }
  if (!wasSyncEnabled && runtime.settings.syncEnabled) {
    persistSyncState();
  }
  evaluateUserIdle("settings_change");
}

function handleUserActivity(message, sender) {
  const tabId = sender?.tab?.id;
  if (!tabId || tabId !== runtime.activeTabId) {
    return;
  }
  const timestamp =
    message?.ts && Number.isFinite(message.ts) ? message.ts : now();
  markUserActive(message?.activityType || "input", tabId, { timestamp });
}

async function resetState() {
  state = createNewState();
  activeSessionCache = state.sessions[state.activeSessionId];
  activeSessionIdCache = state.activeSessionId;
  runtime.activeTabId = null;
  runtime.activeUrl = null;
  runtime.activeTitle = null;
  runtime.activeEdgeKey = null;
  runtime.activeSince = null;
  runtime.lastInteractionAt = null;
  runtime.userIdle = true;
  runtime.lastInactiveAt = null;
  runtime.sessionIdleEndedAt = null;
  runtime.windowFocused = true;
  runtime.idleState = "active";
  await refreshWindowFocus();
  await refreshIdleState();
  await refreshActiveTab();
  const result = await storageSet(
    { [STORAGE_KEY]: encodeStateForStorage(state) },
    "reset_state",
  );
  if (!result.ok) {
    throw new Error(result.error || "Storage reset failed");
  }
  if (runtime.settings?.syncEnabled) {
    persistSyncState("reset_state");
  }
  broadcastRealtime("reset_state");
}

function resetActiveSession() {
  const timestamp = now();
  const current = getActiveSession();
  endSession(current, timestamp, "manual_reset");
  startNewSession(timestamp, "manual_reset");
  flushPersistState("manual_reset");
}

function updateSessionSummaries(sessionId, brief, detailed, summaryUpdatedAt) {
  if (!sessionId || !state?.sessions?.[sessionId]) {
    return;
  }
  const session = state.sessions[sessionId];
  session.summaryBrief = typeof brief === "string" ? brief : "";
  session.summaryDetailed = typeof detailed === "string" ? detailed : "";
  session.summaryUpdatedAt = Number.isFinite(summaryUpdatedAt)
    ? summaryUpdatedAt
    : now();
  schedulePersistState("summary_update");
}

function archiveSession(sessionId) {
  if (!sessionId || !state.sessions[sessionId]) {
    return;
  }
  const session = state.sessions[sessionId];
  if (session.deleted) {
    return;
  }
  const timestamp = now();
  session.archived = true;
  session.archivedAt = timestamp;
  session.updatedAt = timestamp;
  if (state.activeSessionId === sessionId) {
    resetActiveSession();
  } else {
    flushPersistState("archive_session");
  }
}

function unarchiveSession(sessionId) {
  if (!sessionId || !state.sessions[sessionId]) {
    return;
  }
  const session = state.sessions[sessionId];
  if (session.deleted) {
    return;
  }
  session.archived = false;
  session.archivedAt = null;
  session.updatedAt = now();
  flushPersistState("unarchive_session");
}

function deleteSessionById(sessionId) {
  if (!sessionId || !state.sessions[sessionId]) {
    return;
  }
  const timestamp = now();
  const session = state.sessions[sessionId];
  if (session.deleted) {
    return;
  }
  session.deleted = true;
  session.deletedAt = timestamp;
  session.updatedAt = timestamp;
  if (state.activeSessionId === sessionId) {
    endSession(session, timestamp, "manual_delete");
    startNewSession(timestamp, "manual_delete");
  }
  flushPersistState("delete_session");
}

function restoreDeletedSession(sessionId) {
  if (!sessionId || !state.sessions[sessionId]) {
    return;
  }
  const session = state.sessions[sessionId];
  if (!session.deleted) {
    return;
  }
  session.deleted = false;
  session.deletedAt = null;
  session.updatedAt = now();
  flushPersistState("restore_session");
}

function toggleSessionFavorite(sessionId) {
  if (!sessionId || !state.sessions[sessionId]) {
    return;
  }
  const session = state.sessions[sessionId];
  if (session.deleted) {
    return;
  }
  const timestamp = now();
  const nextFavorite = !session.favorite;
  session.favorite = nextFavorite;
  session.favoriteAt = nextFavorite ? timestamp : null;
  session.updatedAt = timestamp;
  flushPersistState("favorite_toggle");
}

function deleteAllSessions() {
  const timestamp = now();
  const activeId = state.activeSessionId;
  Object.values(state.sessions).forEach((session) => {
    if (session.id === activeId && !session.endedAt) {
      endSession(session, timestamp, "manual_delete");
    }
    session.deleted = true;
    session.deletedAt = timestamp;
    session.updatedAt = timestamp;
  });
  const session = startNewSession(timestamp, "delete_all");
  state.activeSessionId = session.id;
  flushPersistState("delete_all");
}

if (IS_TEST) {
  globalThis.__IRHT_TEST_HOOKS__ = globalThis.__IRHT_TEST_HOOKS__ || {};
  globalThis.__IRHT_TEST_HOOKS__.background = {
    STORAGE_KEY,
    SETTINGS_KEY,
    SYNC_STATE_KEY,
    DAILY_SESSION_RESET_KEY,
    SCHEMA_VERSION,
    MAX_EVENTS,
    DEFAULT_SETTINGS,
    DELETED_RETENTION_MS,
    DELETED_PRUNE_INTERVAL_MS,
    USER_IDLE_ALARM_NAME,
    ACTIVE_FLUSH_ALARM_NAME,
    TRAP_DOOR_MIN_POST_DURATION_MS,
    TRAP_DOOR_MIN_POST_DEPTH,
    TRAP_DOOR_MAX_RESULTS,
    DISTRACTION_LATE_NIGHT_START,
    DISTRACTION_LATE_NIGHT_END,
    DISTRACTION_ACTIVE_WEIGHT_CAP,
    DISTRACTION_LATE_NIGHT_WEIGHT,
    CATEGORY_RULES,
    CATEGORY_LIST,
    CATEGORY_MULTIPLIERS,
    NAV_EVENT_COALESCE_MS,
    NAV_EVENT_COALESCE_MIN_MS,
    NAV_EVENT_COALESCE_MAX_MS,
    INTENT_GAP_MIN_MS,
    REALTIME_MIN_BATCH_MS,
    REALTIME_MAX_BATCH_MS,
    REALTIME_DEFAULT_BATCH_MS,
    runtime,
    livePorts,
    livePortMeta,
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    setRuntime: (patch) => Object.assign(runtime, patch),
    init,
    registerListeners,
    now,
    createSession,
    createNewState,
    hydrateRuntimeFromState,
    syncTrackingToState,
    applyDailySessionResetIfNeeded,
    trimTabsForStorage,
    trimStateForStorage,
    compactStateForStorage,
    encodeStateForStorage,
    decodeStoredState,
    primeStateForDashboard,
    loadState,
    upgradeState,
    migrateState,
    getActiveSession,
    resetTabSessionState,
    startNewSession,
    endSession,
    ensureSessionForActivity,
      getSessionEvents,
      getLatestEvent,
      getNavigationCoalesceMs,
      appendEvent,
    evaluateTrapDoors,
    scheduleSessionAnalysis,
    persistState,
    schedulePersistState,
    flushPersistState,
    persistSyncState,
    shouldBroadcastRealtime,
    scheduleRealtimeBroadcast,
    broadcastRealtime,
    sendPortStateSnapshot,
    handlePortConnect,
    buildStateDelta,
    buildSessionPatch,
    buildNodePatch,
    buildEdgePatch,
    buildSessionOrderKey,
    getLatestSessionEvent,
    buildSyncState,
    pruneDeletedSessionsIfNeeded,
    pruneDeletedSessions,
    pruneOldEvents,
    storageGet,
    storageSet,
    storageSyncGet,
    storageSyncSet,
    loadSettings,
    sanitizeSettings,
    normalizeSiteList,
    clampNumber,
    getSessionIdleThresholdMs,
    getUserIdleTimeoutMs,
    getAdaptiveIdleTimeoutMs,
    shouldSplitSessionForIntent,
    resetUrlMetaCache,
    cacheSet,
    normalizeUrl,
    classifyUrl,
    getUrlMeta,
    getCategoryOverride,
    matchesDomain,
    isLateNight,
    isTechnicalUrl,
    computeSessionSignals,
    computeDistractionScore,
    computeDistractionScoreCached,
    applyIntentDrift,
    ensureSessionMetrics,
    updateSessionInsightsForNode,
    invalidateScoreCaches,
    computeSessionInsights,
    buildSessionLabel,
    pickDominantCategory,
    pickEarlyCategory,
    isEntertainmentCategory,
    isProductiveCategory,
    getDomain,
    ensureTabState,
    ensureNode,
    edgeKey,
    ensureEdge,
    recordEvent,
    markNodeNavigation,
    isTrackingActive,
    isTrackingPaused,
    isUserIdle,
    markUserActive,
    evaluateUserIdle,
    applyTrackingPauseState,
    pauseTracking,
    resumeTracking,
    startActiveTiming,
    flushActiveTime,
    switchActiveTab,
    transitionActiveUrl,
    safeGetLastFocusedWindow,
    safeQueryIdleState,
    safeTabsQuery,
    safeTabsGet,
    refreshWindowFocus,
    refreshIdleState,
    refreshActiveTab,
    handleTabActivated,
    handleTabUpdated,
    handleTabRemoved,
    handleTabCreated,
    handleWindowFocusChanged,
    handleIdleStateChanged,
    handleAlarm,
    handleNavigationCommitted,
    handleHistoryStateUpdated,
    handleReferenceFragmentUpdated,
    handleCreatedNavigationTarget,
    handleNavigation,
    handleMessage,
    handleStorageChanged,
    handleUserActivity,
    resetState,
    resetActiveSession,
    updateSessionSummaries,
    archiveSession,
    unarchiveSession,
    deleteSessionById,
    restoreDeletedSession,
    toggleSessionFavorite,
    deleteAllSessions,
  };
}
