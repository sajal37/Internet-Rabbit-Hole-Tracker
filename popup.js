const IS_TEST = typeof globalThis !== "undefined" && globalThis.__IRHT_TEST__ === true;
const SETTINGS_KEY = "irht_settings";
const STORAGE_KEY = "irht_state";
const FORCE_REFRESH_KEY = "irht_force_summary_refresh";
const DEFAULT_LABEL = "Open dashboard";
const DEFAULT_NOTE = "";
const DEFAULT_MOOD = "";
const POPUP_LAYOUTS = ["stack", "cards", "focus"];
const POPUP_DENSITIES = ["roomy", "compact"];
const POPUP_ACTIONS = [
  "open_dashboard",
  "pause_tracking",
  "copy_summary",
  "start_focus",
  "adaptive",
];
const THEME_NAMES = ["warm", "ink", "forest", "retro", "paper", "noir"];
const DEFAULT_POPUP_SETTINGS = {
  theme: "warm",
  accentColor: "",
  reduceMotion: false,
  popupNote: DEFAULT_NOTE,
  popupLayout: "stack",
  popupDensity: "roomy",
  popupQuickGlance: [],
  popupPrimaryAction: "open_dashboard",
  popupMicroNote: "",
  popupMood: "",
  dashboardButtonLabel: DEFAULT_LABEL,
};

const QUICK_GLANCE_LABELS = {
  activeTime: "Active time",
  topDomain: "Top domain",
  distractionScore: "Distraction score",
  sessionLabel: "Session label",
  lastAction: "Last action"
};

const ACTION_LABELS = {
  open_dashboard: "Open dashboard",
  pause_tracking: "Pause tracking",
  copy_summary: "Copy summary",
  start_focus: "Start focus"
};

const GLANCE_PRIORITY = ["activeTime", "distractionScore", "lastAction"];

const elements = {
  dashboardButton: document.getElementById("dashboard-button"),
  popupNote: document.getElementById("popup-note"),
  popupCard: document.getElementById("popup-card"),
  popupGlance: document.getElementById("popup-glance"),
  popupMicroNote: document.getElementById("popup-micro-note"),
  popupMood: document.getElementById("popup-mood")
};

let popupSettings = {};
let popupMetrics = null;

function normalizePopupSettings(raw = {}) {
  const settings = typeof raw === "object" && raw ? raw : {};
  const next = { ...DEFAULT_POPUP_SETTINGS };

  const theme =
    typeof settings.theme === "string" ? settings.theme.trim() : "";
  next.theme = THEME_NAMES.includes(theme) ? theme : DEFAULT_POPUP_SETTINGS.theme;

  next.accentColor = sanitizeColor(settings.accentColor);
  next.reduceMotion = !!settings.reduceMotion;

  next.popupNote =
    typeof settings.popupNote === "string" ? settings.popupNote.trim() : "";
  next.popupMicroNote =
    typeof settings.popupMicroNote === "string"
      ? settings.popupMicroNote.trim()
      : "";
  next.popupMood =
    typeof settings.popupMood === "string" ? settings.popupMood.trim() : "";

  const layout =
    typeof settings.popupLayout === "string" ? settings.popupLayout.trim() : "";
  next.popupLayout = POPUP_LAYOUTS.includes(layout)
    ? layout
    : DEFAULT_POPUP_SETTINGS.popupLayout;

  const density =
    typeof settings.popupDensity === "string" ? settings.popupDensity.trim() : "";
  next.popupDensity = POPUP_DENSITIES.includes(density)
    ? density
    : DEFAULT_POPUP_SETTINGS.popupDensity;

  const action =
    typeof settings.popupPrimaryAction === "string"
      ? settings.popupPrimaryAction.trim()
      : "";
  next.popupPrimaryAction = POPUP_ACTIONS.includes(action)
    ? action
    : DEFAULT_POPUP_SETTINGS.popupPrimaryAction;

  const label =
    typeof settings.dashboardButtonLabel === "string"
      ? settings.dashboardButtonLabel.trim()
      : "";
  next.dashboardButtonLabel = label || DEFAULT_LABEL;

  if (Array.isArray(settings.popupQuickGlance)) {
    const filtered = settings.popupQuickGlance.filter(
      (key) => QUICK_GLANCE_LABELS[key],
    );
    next.popupQuickGlance = Array.from(new Set(filtered));
  }

  return next;
}

function titleCase(value) {
  if (!value) {
    return "";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatEventLabel(event) {
  if (!event?.type) {
    return "No recent action";
  }
  const key = String(event.type).toLowerCase();
  const map = {
    navigation: "Navigation",
    tab_activated: "Tab switched",
    tab_active: "Tab active",
    user_active: "User active",
    user_inactive: "User idle",
    idle_state_changed: "Idle state changed",
    session_started: "Session started",
    session_ended: "Session ended",
    active_time_flushed: "Active time recorded",
  };
  if (map[key]) {
    return map[key];
  }
  const cleaned = key.replace(/_/g, " ");
  return titleCase(cleaned);
}

function openDashboard() {
  try {
    localStorage.setItem(FORCE_REFRESH_KEY, Date.now().toString());
  } catch (error) {
    // Ignore storage errors in restricted contexts.
  }
  const url = chrome.runtime?.getURL
    ? chrome.runtime.getURL("dashboard/index.html")
    : "dashboard/index.html";
  if (chrome.tabs?.create) {
    chrome.tabs.create({ url });
    return;
  }
  window.open(url, "_blank", "noopener");
}

function applyPopupCopy(settings = {}) {
  if (elements.dashboardButton) {
    const label = typeof settings.dashboardButtonLabel === "string" && settings.dashboardButtonLabel.trim()
      ? settings.dashboardButtonLabel.trim()
      : DEFAULT_LABEL;
    const labelSpan = elements.dashboardButton.querySelector("span");
    if (labelSpan) {
      labelSpan.textContent = label;
    } else {
      elements.dashboardButton.textContent = label;
    }
  }
  if (elements.popupNote) {
    const note = typeof settings.popupNote === "string" ? settings.popupNote.trim() : "";
    const finalNote = note || DEFAULT_NOTE;
    elements.popupNote.textContent = finalNote;
    elements.popupNote.hidden = !finalNote;
  }
}

function applyPopupMood(settings = {}) {
  if (!elements.popupMood) {
    return;
  }
  const mood = typeof settings.popupMood === "string" ? settings.popupMood.trim() : "";
  const finalMood = mood || DEFAULT_MOOD;
  elements.popupMood.textContent = finalMood ? `${finalMood}` : "";
  elements.popupMood.hidden = !finalMood;
}

function applyPopupMicroNote(settings = {}) {
  if (!elements.popupMicroNote) {
    return;
  }
  const note = typeof settings.popupMicroNote === "string" ? settings.popupMicroNote.trim() : "";
  elements.popupMicroNote.textContent = note ? `${note}` : "";
  elements.popupMicroNote.hidden = !note;
}

function sanitizeColor(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return "";
}

function applyPopupTheme(settings = {}) {
  if (!document.body) {
    return;
  }
  const theme = settings.theme || "warm";
  THEME_NAMES.forEach((name) => {
    document.body.classList.toggle(`theme-${name}`, theme === name);
  });
  const density = settings.popupDensity === "compact" ? "compact" : "roomy";
  document.body.classList.toggle("popup-compact", density === "compact");
  document.body.classList.toggle("reduce-motion", !!settings.reduceMotion);
  const accent = sanitizeColor(settings.accentColor);
  if (accent) {
    document.body.style.setProperty("--accent", accent);
  } else {
    document.body.style.removeProperty("--accent");
  }
}

function applyPopupLayout(settings = {}) {
  if (!elements.popupCard) {
    return;
  }
  const layout = POPUP_LAYOUTS.includes(settings.popupLayout)
    ? settings.popupLayout
    : "stack";
  elements.popupCard.classList.remove("layout-stack", "layout-cards", "layout-focus");
  elements.popupCard.classList.add(`layout-${layout}`);
}

function formatDuration(ms) {
  return globalThis.IRHTShared?.formatDuration
    ? globalThis.IRHTShared.formatDuration(ms)
    : `${Math.max(0, Math.floor(ms / 1000))}s`;
}

function formatScore(score) {
  if (!Number.isFinite(score)) {
    return "-";
  }
  const normalized = normalizeDistractionScore(score);
  const label = getDistractionLabel(normalized);
  return `${label} (${normalized}/100)`;
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

function getDomain(url) {
  return globalThis.IRHTShared?.getDomain
    ? globalThis.IRHTShared.getDomain(url)
    : null;
}

function getLatestEvent(session) {
  return globalThis.IRHTShared?.getLatestEvent
    ? globalThis.IRHTShared.getLatestEvent(session)
    : null;
}

function buildPopupMetrics(state) {
  if (!state || !state.sessions) {
    return null;
  }
  const sessionId = state.activeSessionId || state.sessionOrder?.[state.sessionOrder.length - 1];
  const session = sessionId ? state.sessions[sessionId] : null;
  if (!session) {
    return null;
  }
  const nodes = Object.values(session.nodes || {});
  let activeMs = nodes.reduce((sum, node) => sum + (node.activeMs || 0), 0);
  const domainTotals = nodes.reduce((acc, node) => {
    const domain = getDomain(node.url);
    if (!domain) {
      return acc;
    }
    acc[domain] = (acc[domain] || 0) + (node.activeMs || 0);
    return acc;
  }, {});
  const tracking = state.tracking || {};
  if (
    tracking.activeSince &&
    tracking.activeUrl &&
    session.nodes &&
    tracking.activeUrl in session.nodes
  ) {
    const live = Math.max(0, Date.now() - tracking.activeSince);
    if (live > 0) {
      activeMs += live;
      const liveDomain = getDomain(tracking.activeUrl);
      if (liveDomain) {
        domainTotals[liveDomain] = (domainTotals[liveDomain] || 0) + live;
      }
    }
  }
  const topDomain = Object.entries(domainTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const lastEvent = getLatestEvent(session);
  const lastAction = formatEventLabel(lastEvent);
  const scoreValue = Number.isFinite(session.distractionAverage) ? session.distractionAverage : 0;
  return {
    activeTime: formatDuration(activeMs),
    topDomain,
    distractionScore: formatScore(scoreValue),
    distractionScoreValue: scoreValue,
    sessionLabel: session.label || "Recent session",
    lastAction,
    summary: session.summaryBrief || session.label || "",
    sessionEnded: !!session.endedAt,
    isIdle: !!tracking.userIdle
  };
}

function renderPopupGlance(settings = {}, metrics) {
  if (!elements.popupGlance) {
    return;
  }
  elements.popupGlance.innerHTML = "";
  const quickGlance = Array.isArray(settings.popupQuickGlance)
    ? settings.popupQuickGlance.filter((key) => QUICK_GLANCE_LABELS[key])
    : [];
  if (!quickGlance.length) {
    elements.popupGlance.hidden = true;
    return;
  }
  elements.popupGlance.hidden = false;
  elements.popupGlance.classList.remove("collapsed", "expanded");
  if (!metrics) {
    const item = document.createElement("div");
    item.className = "glance-item";
    item.innerHTML = "<strong>No session yet</strong><span>Start tracking to see stats.</span>";
    elements.popupGlance.appendChild(item);
    return;
  }
  const ordered = [...quickGlance].sort((a, b) => {
    const aIndex = GLANCE_PRIORITY.indexOf(a);
    const bIndex = GLANCE_PRIORITY.indexOf(b);
    if (aIndex === -1 && bIndex === -1) {
      return quickGlance.indexOf(a) - quickGlance.indexOf(b);
    }
    if (aIndex === -1) {
      return 1;
    }
    if (bIndex === -1) {
      return -1;
    }
    return aIndex - bIndex;
  });
  const visibleKeys = ordered.filter((key) => {
    const value = metrics[key];
    return value !== undefined && value !== null;
  });
  if (!visibleKeys.length) {
    elements.popupGlance.hidden = true;
    return;
  }
  const maxVisible = 3;
  visibleKeys.forEach((key, index) => {
    const label = QUICK_GLANCE_LABELS[key];
    const value = metrics[key];
    const item = document.createElement("div");
    const classes = ["glance-item"];
    if (key === "activeTime") {
      classes.push("glance-item--primary");
    }
    if (key === "lastAction") {
      classes.push("glance-item--secondary");
    }
    item.className = classes.join(" ");
    const valueLabel = value || "-";
    if (key === "distractionScore") {
      const score = Number(metrics.distractionScoreValue ?? 0);
      const level = score >= 1.6 ? "level-high" : score >= 0.8 ? "level-mid" : "level-low";
      const labelSpan = document.createElement("span");
      labelSpan.textContent = label;
      const valueStrong = document.createElement("strong");
      valueStrong.className = `glance-badge ${level}`;
      valueStrong.textContent = String(valueLabel);
      item.append(labelSpan, valueStrong);
    } else {
      const labelSpan = document.createElement("span");
      labelSpan.textContent = label;
      const valueStrong = document.createElement("strong");
      valueStrong.textContent = String(valueLabel);
      item.append(labelSpan, valueStrong);
    }
    elements.popupGlance.appendChild(item);
    if (index === maxVisible - 1 && visibleKeys.length > maxVisible) {
      elements.popupGlance.classList.add("collapsed");
    }
  });
  if (visibleKeys.length > maxVisible) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "glance-toggle";
    toggle.setAttribute("aria-controls", "popup-glance");
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "More";
    toggle.addEventListener("click", () => {
      const expanded = elements.popupGlance.classList.toggle("expanded");
      elements.popupGlance.classList.toggle("collapsed", !expanded);
      toggle.textContent = expanded ? "Less" : "More";
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    });
    elements.popupGlance.appendChild(toggle);
  }
}

function updateTrackingPaused(nextValue, callback) {
  if (!chrome?.storage?.sync?.get) {
    if (callback) {
      callback(false);
    }
    return;
  }
  chrome.storage.sync.get(SETTINGS_KEY, (result) => {
    if (chrome.runtime?.lastError) {
      if (callback) {
        callback(false);
      }
      return;
    }
    const settings = result[SETTINGS_KEY] || {};
    settings.trackingPaused = !!nextValue;
    chrome.storage.sync.set({ [SETTINGS_KEY]: settings }, () => {
      if (callback) {
        callback(true);
      }
    });
  });
}

function applyPopupAction(settings = {}) {
  if (!elements.dashboardButton) {
    return;
  }
  const preferred = POPUP_ACTIONS.includes(settings.popupPrimaryAction)
    ? settings.popupPrimaryAction
    : DEFAULT_POPUP_SETTINGS.popupPrimaryAction;
  let action = preferred;
  if (preferred === "adaptive") {
    if (popupMetrics?.isIdle) {
      action = "pause_tracking";
    } else if (popupMetrics?.sessionEnded) {
      action = "copy_summary";
    } else {
      action = "open_dashboard";
    }
  }
  const label =
    action === "open_dashboard" &&
    typeof settings.dashboardButtonLabel === "string" &&
    settings.dashboardButtonLabel.trim()
      ? settings.dashboardButtonLabel.trim()
      : ACTION_LABELS[action] || "Quick action";
  const labelSpan = elements.dashboardButton.querySelector("span");
  if (labelSpan) {
    labelSpan.textContent = label;
  } else {
    elements.dashboardButton.textContent = label;
  }
  elements.dashboardButton.onclick = async () => {
    if (action === "pause_tracking") {
      updateTrackingPaused(true);
      return;
    }
    if (action === "start_focus") {
      updateTrackingPaused(false, () => openDashboard());
      return;
    }
    if (action === "copy_summary") {
      const text = popupMetrics?.summary || "";
      if (!text) {
        return;
      }
      try {
        await navigator.clipboard?.writeText?.(text);
      } catch (error) {
        // Clipboard is optional.
      }
      return;
    }
    if (action === "open_dashboard") {
      openDashboard();
    }
  };
}

function applyPopupSettings(settings = {}) {
  popupSettings = normalizePopupSettings(settings);
  applyPopupCopy(popupSettings);
  applyPopupMood(popupSettings);
  applyPopupMicroNote(popupSettings);
  applyPopupTheme(popupSettings);
  applyPopupLayout(popupSettings);
  applyPopupAction(popupSettings);
}

function loadPopupState() {
  if (!chrome?.storage?.local?.get) {
    renderPopupGlance(popupSettings, null);
    return;
  }
  chrome.storage.local.get(STORAGE_KEY, (result) => {
    if (chrome.runtime?.lastError) {
      renderPopupGlance(popupSettings, null);
      return;
    }
    popupMetrics = buildPopupMetrics(result[STORAGE_KEY]);
    renderPopupGlance(popupSettings, popupMetrics);
    applyPopupAction(popupSettings);
  });
}

function loadPopupSettings() {
  if (!chrome?.storage?.sync?.get) {
    applyPopupSettings();
    loadPopupState();
    return;
  }
  chrome.storage.sync.get(SETTINGS_KEY, (result) => {
    if (chrome.runtime?.lastError) {
      applyPopupSettings();
      loadPopupState();
      return;
    }
    applyPopupSettings(result[SETTINGS_KEY] || {});
    loadPopupState();
  });
}

function handleStorageChanged(changes, area) {
  if (area === "sync" && changes[SETTINGS_KEY]) {
    applyPopupSettings(changes[SETTINGS_KEY].newValue || {});
    renderPopupGlance(popupSettings, popupMetrics);
    return;
  }
  if (area === "local" && changes[STORAGE_KEY]) {
    popupMetrics = buildPopupMetrics(changes[STORAGE_KEY].newValue);
    renderPopupGlance(popupSettings, popupMetrics);
    applyPopupAction(popupSettings);
  }
}

function initPopup() {
  loadPopupSettings();
  if (chrome?.storage?.onChanged?.addListener) {
    chrome.storage.onChanged.addListener(handleStorageChanged);
  }
}

if (!IS_TEST) {
  initPopup();
} else {
  globalThis.__IRHT_TEST_HOOKS__ = globalThis.__IRHT_TEST_HOOKS__ || {};
  globalThis.__IRHT_TEST_HOOKS__.popup = {
    elements,
    initPopup,
    openDashboard,
    applyPopupCopy,
    applyPopupMood,
    applyPopupMicroNote,
    applyPopupTheme,
    applyPopupLayout,
    buildPopupMetrics,
    renderPopupGlance,
    loadPopupSettings,
    loadPopupState,
    applyPopupAction,
    updateTrackingPaused,
    handleStorageChanged,
    normalizeDistractionScore,
    getDistractionLabel,
    formatScore,
    formatDuration,
    formatEventLabel,
    getDomain,
    getLatestEvent
  };
}
