const assert = require("node:assert/strict");
const { test } = require("node:test");
const vm = require("node:vm");
const {
  createChromeMock,
  createContext,
  createDom,
  loadScript,
  loadHtmlFixture,
  rootPath,
} = require("./test-helpers");

function loadPopup({ dom, chrome, extraGlobals = {} }) {
  const context = createContext({
    dom,
    chrome,
    extraGlobals,
  });
  loadScript(rootPath("shared.js"), context);
  loadScript(rootPath("popup.js"), context);
  return { context, hooks: context.__IRHT_TEST_HOOKS__.popup, chrome };
}

function loadPopupWithShared({ dom, chrome, extraGlobals = {} }) {
  return loadPopup({ dom, chrome, extraGlobals });
}

test("popup init wires button", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const { hooks, context } = loadPopup({ dom, chrome });

  hooks.initPopup();
  hooks.elements.dashboardButton.dispatchEvent(new dom.window.Event("click"));
  assert.equal(chrome._sentMessages.length, 1);
  assert.equal(chrome._sentMessages[0].type, "tab_create");
  assert.ok(dom.window.localStorage.getItem("irht_force_summary_refresh"));
});

test("popup loads shared helpers when included", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const { context } = loadPopupWithShared({ dom, chrome });

  assert.ok(context.IRHTShared);
  assert.equal(
    context.normalizeDistractionScore(1.2),
    context.IRHTShared.normalizeDistractionScore(1.2),
  );
  assert.equal(
    context.getDistractionLabel(42),
    context.IRHTShared.getDistractionLabel(42),
  );
});

test("popup openDashboard uses runtime URL", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const { hooks, context } = loadPopup({ dom, chrome });
  hooks.openDashboard();
  assert.equal(chrome._sentMessages[0].type, "tab_create");
  assert.equal(
    chrome._sentMessages[0].payload.url,
    "chrome-extension://test/dashboard/index.html",
  );
});

test("popup openDashboard uses tab fallback", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  chrome.runtime.getURL = null;
  const { hooks, context } = loadPopup({ dom, chrome });
  hooks.openDashboard();
  assert.equal(chrome._sentMessages[0].payload.url, "dashboard/index.html");
});

test("popup openDashboard uses window fallback", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  let opened = false;
  chrome.tabs.create = null;
  dom.window.open = () => {
    opened = true;
  };
  const { hooks, context } = loadPopup({ dom, chrome });
  const storageStub = {
    setItem: () => {
      throw new Error("blocked");
    },
  };
  Object.defineProperty(dom.window, "localStorage", {
    value: storageStub,
    configurable: true,
  });
  context.localStorage = storageStub;
  hooks.openDashboard();
  assert.equal(opened, true);
});

test("popup openDashboard handles missing chrome tabs", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  chrome.tabs = null;
  let opened = false;
  dom.window.open = () => {
    opened = true;
  };
  const { hooks } = loadPopup({ dom, chrome });
  hooks.openDashboard();
  assert.equal(opened, true);
});

test("popup openDashboard handles missing localStorage", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const { hooks, context } = loadPopup({ dom, chrome });
  delete context.localStorage;
  hooks.openDashboard();
});

test("popup openDashboard ignores storage errors with chrome tabs", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const { hooks, context } = loadPopup({ dom, chrome });
  const storageStub = {
    setItem: () => {
      throw new Error("blocked");
    },
  };
  Object.defineProperty(dom.window, "localStorage", {
    value: storageStub,
    configurable: true,
  });
  context.localStorage = storageStub;
  hooks.openDashboard();
  assert.equal(chrome._sentMessages[0].type, "tab_create");
});

test("popup init with missing button", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const { hooks } = loadPopup({ dom, chrome });
  hooks.elements.dashboardButton = null;
  hooks.initPopup();
});

test("popup reacts to storage changes", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock({
    syncData: { irht_settings: { popupQuickGlance: ["activeTime"] } }
  });
  const { hooks } = loadPopup({ dom, chrome });

  hooks.initPopup();
  const state = {
    activeSessionId: "s1",
    sessionOrder: ["s1"],
    sessions: {
      s1: {
        id: "s1",
        label: "Session label",
        summaryBrief: "Brief summary",
        distractionAverage: 0,
        nodes: {
          "https://example.com/": {
            url: "https://example.com/",
            activeMs: 30000
          }
        },
        events: []
      }
    }
  };
  chrome._events.storageChanged.emit(
    { irht_state: { newValue: state } },
    "local"
  );
  assert.ok(
    hooks.elements.popupGlance.textContent.includes("Active time"),
  );

  chrome._events.storageChanged.emit(
    { irht_settings: { newValue: { popupMood: "🔥" } } },
    "sync"
  );
  assert.equal(hooks.elements.popupMood.textContent, "🔥");

  hooks.handleStorageChanged(
    { irht_settings: { newValue: { popupMood: "🌙" } } },
    "sync"
  );
  assert.equal(hooks.elements.popupMood.textContent, "🌙");

  hooks.handleStorageChanged(
    { irht_settings: { newValue: null } },
    "sync"
  );
});

test("popup loadPopupSettings handles missing storage", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  chrome.storage = null;
  const { hooks } = loadPopup({ dom, chrome });
  hooks.loadPopupSettings();
  const popupNote = dom.window.document.getElementById("popup-note");
  assert.equal(popupNote.textContent, "");
  assert.equal(popupNote.hidden, true);
});

test("popup loadPopupSettings handles runtime error", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  chrome.runtime.lastError = { message: "fail" };
  const { hooks } = loadPopup({ dom, chrome });
  hooks.loadPopupSettings();
  const popupNote = dom.window.document.getElementById("popup-note");
  assert.equal(popupNote.textContent, "");
  assert.equal(popupNote.hidden, true);
});

test("popup loadPopupSettings falls back for invalid density", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock({
    syncData: {
      irht_settings: {
        theme: "bad-theme",
        popupDensity: "wide",
        popupMicroNote: "Note",
        popupMood: "Chill",
        dashboardButtonLabel: "Label",
      },
    },
  });
  const { hooks } = loadPopup({ dom, chrome });
  hooks.loadPopupSettings();
  assert.equal(dom.window.document.body.classList.contains("popup-compact"), false);
});

test("popup applyPopupCopy uses fallback button text", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const { hooks } = loadPopup({ dom, chrome });
  hooks.elements.dashboardButton.innerHTML = "Dashboard";
  hooks.applyPopupCopy({
    dashboardButtonLabel: "Launch",
    popupNote: "Custom note",
  });
  assert.equal(hooks.elements.dashboardButton.textContent.trim(), "Launch");
  hooks.applyPopupCopy({
    dashboardButtonLabel: "Launch",
    popupNote: 123,
  });
  hooks.applyPopupCopy({
    dashboardButtonLabel: "",
    popupNote: "Note",
  });
});

test("popup mood, micro note, theme, and layout", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const { hooks } = loadPopup({ dom, chrome });
  hooks.applyPopupMood({ popupMood: "" });
  assert.equal(hooks.elements.popupMood.hidden, true);
  hooks.applyPopupMood({ popupMood: 123 });
  hooks.applyPopupMicroNote({ popupMicroNote: "Tiny note" });
  assert.equal(hooks.elements.popupMicroNote.hidden, false);
  hooks.applyPopupMicroNote({ popupMicroNote: "" });
  assert.equal(hooks.elements.popupMicroNote.hidden, true);
  hooks.applyPopupMicroNote({ popupMicroNote: 123 });
  hooks.elements.popupMood = null;
  hooks.applyPopupMood({ popupMood: "Hidden" });
  hooks.applyPopupTheme({
    theme: "ink",
    popupDensity: "compact",
    accentColor: "#123456",
  });
  assert.equal(dom.window.document.body.classList.contains("theme-ink"), true);
  assert.equal(
    dom.window.document.body.classList.contains("popup-compact"),
    true,
  );
  hooks.applyPopupTheme({
    theme: "warm",
    popupDensity: "roomy",
    accentColor: "bad",
  });
  assert.equal(dom.window.document.body.style.getPropertyValue("--accent"), "");
  hooks.applyPopupTheme({ theme: "invalid-theme" });
  hooks.applyPopupTheme({});
  hooks.applyPopupTheme({ theme: "warm", popupDensity: "roomy" });
  hooks.applyPopupLayout({ popupLayout: "focus" });
  assert.equal(
    hooks.elements.popupCard.classList.contains("layout-focus"),
    true,
  );
  hooks.applyPopupLayout({ popupLayout: "unknown" });
  assert.equal(
    hooks.elements.popupCard.classList.contains("layout-stack"),
    true,
  );
  hooks.elements.popupMicroNote = null;
  hooks.applyPopupMicroNote({ popupMicroNote: "Hidden" });
  const bodyBackup = dom.window.document.body;
  Object.defineProperty(dom.window.document, "body", {
    value: null,
    configurable: true,
  });
  hooks.applyPopupTheme({ theme: "ink" });
  Object.defineProperty(dom.window.document, "body", {
    value: bodyBackup,
    configurable: true,
  });
  hooks.elements.popupCard = null;
  hooks.applyPopupLayout({ popupLayout: "cards" });
});

test("popup metrics, glance, and actions", async () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock({ syncData: { irht_settings: {} } });
  const { hooks, context } = loadPopup({ dom, chrome });
  const state = {
    activeSessionId: "s1",
    sessionOrder: ["s1"],
    sessions: {
      s1: {
        id: "s1",
        label: "Session label",
        summaryBrief: "Brief summary",
        distractionAverage: NaN,
        nodes: {
          "https://example.com/": {
            url: "https://example.com/",
            activeMs: 30000,
          },
          "not-a-url": { url: "not-a-url", activeMs: 1000 },
          "empty-url": { url: null, activeMs: 500 },
          "https://example.com/next": { url: "https://example.com/next" },
        },
        events: [{ type: "URL_CHANGED" }],
      },
    },
  };
  const metrics = hooks.buildPopupMetrics(state);
  assert.equal(metrics.topDomain, "example.com");
  assert.equal(context.normalizeDistractionScore(10), 0);
  assert.equal(context.getDistractionLabel(10), "Focused");
  assert.equal(context.titleCase(""), "");
  assert.equal(context.formatEventLabel({ type: "navigation" }), "Navigation");
  const sharedBackup = context.IRHTShared;
  context.IRHTShared = {
    normalizeDistractionScore: () => 42,
    getDistractionLabel: () => "Custom",
  };
  assert.equal(context.normalizeDistractionScore(10), 42);
  assert.equal(context.getDistractionLabel(10), "Custom");
  context.IRHTShared = sharedBackup;
  const liveState = {
    ...state,
    tracking: {
      activeSince: Date.now() - 2000,
      activeUrl: "https://example.com/",
      userIdle: false,
    },
  };
  const liveMetrics = hooks.buildPopupMetrics(liveState);
  assert.ok(liveMetrics.activeTime);
  const liveDomainState = {
    activeSessionId: "s1",
    sessionOrder: ["s1"],
    tracking: {
      activeSince: Date.now() - 1000,
      activeUrl: "https://example.com/",
      userIdle: false,
    },
    sessions: {
      s1: {
        id: "s1",
        label: "Live domain",
        summaryBrief: "",
        distractionAverage: 0,
        nodes: {
          "https://example.com/": { url: "bad", activeMs: 0 },
        },
        events: [],
      },
    },
  };
  const liveDomainMetrics = hooks.buildPopupMetrics(liveDomainState);
  assert.equal(liveDomainMetrics.topDomain, "example.com");
  hooks.renderPopupGlance(
    { popupQuickGlance: ["sessionLabel"] },
    { sessionLabel: "" }
  );
  assert.ok(hooks.elements.popupGlance.textContent.includes("-"));
  const missingMetrics = hooks.buildPopupMetrics({
    activeSessionId: "missing",
    sessionOrder: ["missing"],
    sessions: {},
  });
  assert.equal(missingMetrics, null);
  const missingOrderMetrics = hooks.buildPopupMetrics({
    activeSessionId: null,
    sessions: {},
  });
  assert.equal(missingOrderMetrics, null);
  const orderOnlyMetrics = hooks.buildPopupMetrics({
    sessionOrder: ["s3"],
    sessions: {
      s3: {
        id: "s3",
        label: "Order only",
        nodes: {},
        events: [],
      },
    },
  });
  assert.equal(orderOnlyMetrics.sessionLabel, "Order only");
  const noSessionMetrics = hooks.buildPopupMetrics({
    sessionOrder: [],
    sessions: {},
  });
  assert.equal(noSessionMetrics, null);
  const missingNodesMetrics = hooks.buildPopupMetrics({
    sessionOrder: ["s4"],
    sessions: {
      s4: {
        id: "s4",
        label: "Missing nodes",
        events: [],
      },
    },
  });
  assert.equal(missingNodesMetrics.topDomain, "");
  const fallbackMetrics = hooks.buildPopupMetrics({
    activeSessionId: "s2",
    sessionOrder: ["s2"],
    sessions: {
      s2: {
        id: "s2",
        label: "",
        summaryBrief: "",
        distractionAverage: null,
        nodes: {},
        events: undefined,
      },
    },
  });
  assert.equal(fallbackMetrics.distractionScore, "Focused (0/100)");
  const stateMinutes = {
    activeSessionId: "s2",
    sessionOrder: ["s2"],
    sessions: {
      s2: {
        id: "s2",
        label: "Session long",
        summaryBrief: "",
        distractionAverage: 1.2,
        nodes: {
          "https://example.com/": {
            url: "https://example.com/",
            activeMs: 120000,
          },
        },
        events: [],
      },
    },
  };
  const metricsMinutes = hooks.buildPopupMetrics(stateMinutes);
  assert.ok(metricsMinutes.activeTime.includes("m"));
  hooks.renderPopupGlance(
    { popupQuickGlance: ["activeTime", "topDomain", "sessionLabel"] },
    metrics,
  );
  assert.equal(
    hooks.elements.popupGlance.querySelectorAll(".glance-item").length,
    3,
  );
  const scoreMetrics = {
    ...metrics,
    distractionScoreValue: 2,
    distractionScore: "Zoned out (2/100)",
  };
  hooks.renderPopupGlance(
    { popupQuickGlance: ["distractionScore"] },
    scoreMetrics,
  );
  hooks.renderPopupGlance(
    { popupQuickGlance: ["distractionScore"] },
    { ...metrics, distractionScoreValue: null, distractionScore: "Steady (0/100)" },
  );
  hooks.renderPopupGlance(
    { popupQuickGlance: ["distractionScore"] },
    { ...metrics, distractionScoreValue: 1, distractionScore: "Wobbly (1/100)" },
  );
  hooks.renderPopupGlance(
    { popupQuickGlance: ["distractionScore"] },
    { ...metrics, distractionScoreValue: 0.2, distractionScore: "Steady (0/100)" },
  );
  hooks.renderPopupGlance(
    { popupQuickGlance: ["topDomain", "activeTime"] },
    metrics,
  );
  hooks.renderPopupGlance({ popupQuickGlance: ["unknown"] }, metrics);
  assert.equal(
    hooks.elements.popupGlance.querySelectorAll(".glance-item").length,
    0,
  );
  hooks.renderPopupGlance({ popupQuickGlance: [] }, null);
  assert.equal(
    hooks.elements.popupGlance.querySelectorAll(".glance-item").length,
    0,
  );

  chrome._storage.local.irht_state = state;
  hooks.loadPopupState();
  hooks.applyPopupAction({ popupPrimaryAction: "open_dashboard", dashboardButtonLabel: "" });
  assert.ok(hooks.elements.dashboardButton.textContent.includes("Open dashboard"));
  hooks.applyPopupAction({
    popupPrimaryAction: "open_dashboard",
    dashboardButtonLabel: "Go",
  });
  hooks.applyPopupAction({ popupPrimaryAction: "pause_tracking" });
  hooks.elements.dashboardButton.dispatchEvent(new dom.window.Event("click"));
  assert.equal(chrome._storage.sync.irht_settings.trackingPaused, true);

  hooks.applyPopupAction({ popupPrimaryAction: "start_focus" });
  hooks.elements.dashboardButton.dispatchEvent(new dom.window.Event("click"));
  assert.equal(chrome._sentMessages.length >= 1, true);

  dom.window.navigator.clipboard = { writeText: async () => {} };
  hooks.applyPopupAction({ popupPrimaryAction: "copy_summary" });
  await hooks.elements.dashboardButton.dispatchEvent(new dom.window.Event("click"));
});

test("popup copy summary fallback branches", async () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const { hooks } = loadPopup({ dom, chrome });

  chrome._storage.local.irht_state = {
    activeSessionId: "s1",
    sessionOrder: ["s1"],
    sessions: {
      s1: {
        id: "s1",
        label: "",
        summaryBrief: "",
        distractionAverage: 0,
        nodes: {},
        events: [],
      },
    },
  };
  hooks.loadPopupState();
  let copied = false;
  dom.window.navigator.clipboard = {
    writeText: async () => {
      copied = true;
    },
  };
  hooks.applyPopupAction({ popupPrimaryAction: "copy_summary" });
  hooks.elements.dashboardButton.dispatchEvent(new dom.window.Event("click"));
  assert.equal(copied, false);

  chrome._storage.local.irht_state.sessions.s1.summaryBrief = "Now copied";
  hooks.loadPopupState();
  dom.window.navigator.clipboard = {
    writeText: async () => {
      throw new Error("blocked");
    },
  };
  hooks.applyPopupAction({ popupPrimaryAction: "copy_summary" });
  hooks.elements.dashboardButton.dispatchEvent(new dom.window.Event("click"));
  await new Promise((resolve) => setImmediate(resolve));
});

test("popup applyPopupAction handles missing element", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const { hooks } = loadPopup({ dom, chrome });
  hooks.elements.dashboardButton = null;
  hooks.applyPopupAction({ popupPrimaryAction: "pause_tracking" });
});

test("popup updateTrackingPaused handles empty settings", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const { hooks } = loadPopup({ dom, chrome });
  let updated = null;
  hooks.updateTrackingPaused(true, (ok) => {
    updated = ok;
  });
  assert.equal(updated, true);
  assert.equal(chrome._storage.sync.irht_settings.trackingPaused, true);
});

test("popup applyPopupAction uses default label for unknown action", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const { hooks, context } = loadPopup({ dom, chrome });
  hooks.applyPopupAction({ popupPrimaryAction: "unknown_action" });
  assert.ok(hooks.elements.dashboardButton.textContent.includes("Open dashboard"));
  vm.runInContext("ACTION_LABELS.open_dashboard = ''", context);
  hooks.applyPopupAction({ popupPrimaryAction: "open_dashboard" });
  vm.runInContext("ACTION_LABELS.open_dashboard = 'Open dashboard'", context);
});

test("popup normalizePopupSettings covers defaults", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const { context } = loadPopup({ dom, chrome });
  const normalized = context.normalizePopupSettings({
    theme: "ink",
    accentColor: "#abcdef",
    popupNote: "Note",
    popupMicroNote: "Micro",
    popupMood: "Mood",
    popupLayout: "cards",
    popupDensity: "compact",
    popupPrimaryAction: "copy_summary",
    dashboardButtonLabel: "Label",
    popupQuickGlance: ["activeTime", "unknown", "activeTime"],
  });
  assert.equal(normalized.popupDensity, "compact");
  const fallback = context.normalizePopupSettings({
    theme: 123,
    accentColor: "bad",
    popupNote: 456,
    popupMicroNote: null,
    popupMood: {},
    popupLayout: "invalid",
    popupDensity: "invalid",
    popupPrimaryAction: "invalid",
    dashboardButtonLabel: 789,
    popupQuickGlance: "bad",
  });
  assert.equal(fallback.popupDensity, "roomy");
  const empty = context.normalizePopupSettings(null);
  assert.equal(empty.popupDensity, "roomy");
});

test("popup renderPopupGlance handles missing element", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const { hooks } = loadPopup({ dom, chrome });
  hooks.elements.popupGlance = null;
  hooks.renderPopupGlance(
    { popupQuickGlance: ["activeTime"] },
    { activeTime: "1m" },
  );
});

test("popup coverage extras", async () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const { hooks, context } = loadPopup({ dom, chrome });

  assert.equal(context.formatDuration(61000), "1m 1s");
  assert.equal(context.formatScore(Number.NaN), "-");

  const sharedBackup = context.IRHTShared;
  context.IRHTShared = null;
  assert.equal(context.normalizeDistractionScore(5), 0);
  assert.equal(context.getDistractionLabel(50), "Focused");
  context.IRHTShared = {
    normalizeDistractionScore: (score) => score * 2,
    getDistractionLabel: () => "Custom",
  };
  assert.equal(context.normalizeDistractionScore(5), 10);
  assert.equal(context.getDistractionLabel(50), "Custom");
  context.IRHTShared = sharedBackup;

  const metrics = {
    activeTime: "1m",
    topDomain: "example.com",
    distractionScore: "High",
    distractionScoreValue: 2.0,
    sessionLabel: "Label",
    lastAction: "clicked",
  };
  const sortBackup = Array.prototype.sort;
  Array.prototype.sort = function (compareFn) {
    if (typeof compareFn === "function") {
      compareFn("x", "y");
      compareFn("x", "activeTime");
      compareFn("activeTime", "x");
      compareFn("activeTime", "distractionScore");
    }
    return sortBackup.call(this, compareFn);
  };
  hooks.renderPopupGlance(
    {
      popupQuickGlance: [
        "unknown",
        "lastAction",
        "activeTime",
        "distractionScore",
        "sessionLabel",
        "topDomain",
      ],
    },
    metrics,
  );
  Array.prototype.sort = sortBackup;

  assert.ok(hooks.elements.popupGlance.classList.contains("collapsed"));
  assert.ok(
    hooks.elements.popupGlance.querySelector(".glance-item--secondary"),
  );
  assert.ok(hooks.elements.popupGlance.querySelector(".level-high"));
  const toggle = hooks.elements.popupGlance.querySelector(".glance-toggle");
  toggle.dispatchEvent(new dom.window.Event("click"));
  assert.ok(hooks.elements.popupGlance.classList.contains("expanded"));
  toggle.dispatchEvent(new dom.window.Event("click"));
  assert.ok(hooks.elements.popupGlance.classList.contains("collapsed"));

  hooks.elements.popupGlance.innerHTML = "";
  hooks.renderPopupGlance(
    { popupQuickGlance: ["distractionScore"] },
    { distractionScore: "Mid", distractionScoreValue: 1.0 },
  );
  assert.ok(hooks.elements.popupGlance.querySelector(".level-mid"));

  hooks.elements.popupGlance.innerHTML = "";
  hooks.renderPopupGlance(
    { popupQuickGlance: ["distractionScore"] },
    { distractionScore: "Low", distractionScoreValue: 0.2 },
  );
  assert.ok(hooks.elements.popupGlance.querySelector(".level-low"));

  hooks.elements.popupGlance.innerHTML = "";
  hooks.renderPopupGlance(
    { popupQuickGlance: ["activeTime"] },
    { activeTime: null },
  );
  assert.equal(hooks.elements.popupGlance.hidden, true);

  chrome._storage.local.irht_state = {
    activeSessionId: "idle-session",
    sessionOrder: ["idle-session"],
    tracking: { userIdle: true },
    sessions: {
      "idle-session": {
        id: "idle-session",
        label: "Idle",
        summaryBrief: "Summary",
        distractionAverage: 0,
        nodes: {},
        events: [],
      },
    },
  };
  hooks.loadPopupState();
  hooks.applyPopupAction({ popupPrimaryAction: "adaptive" });
  hooks.elements.dashboardButton.dispatchEvent(new dom.window.Event("click"));
  assert.equal(chrome._storage.sync.irht_settings.trackingPaused, true);

  chrome._storage.local.irht_state = {
    activeSessionId: "ended-session",
    sessionOrder: ["ended-session"],
    tracking: { userIdle: false },
    sessions: {
      "ended-session": {
        id: "ended-session",
        label: "",
        summaryBrief: "Copied",
        endedAt: Date.now(),
        distractionAverage: 0,
        nodes: {},
        events: [],
      },
    },
  };
  hooks.loadPopupState();
  dom.window.navigator.clipboard = {
    writeText: async () => {
      throw new Error("blocked");
    },
  };
  hooks.applyPopupAction({ popupPrimaryAction: "adaptive" });
  hooks.elements.dashboardButton.dispatchEvent(new dom.window.Event("click"));
  await new Promise((resolve) => setImmediate(resolve));

  chrome._storage.local.irht_state = {
    activeSessionId: "active-session",
    sessionOrder: ["active-session"],
    tracking: { userIdle: false },
    sessions: {
      "active-session": {
        id: "active-session",
        label: "",
        summaryBrief: "Open me",
        distractionAverage: 0,
        nodes: {},
        events: [],
      },
    },
  };
  hooks.loadPopupState();
  hooks.applyPopupAction({ popupPrimaryAction: "adaptive" });
  hooks.elements.dashboardButton.dispatchEvent(new dom.window.Event("click"));
  assert.ok(
    chrome._sentMessages.some((msg) => msg.type === "tab_create"),
  );

  hooks.elements.dashboardButton.innerHTML = "Button";
  hooks.applyPopupAction({ popupPrimaryAction: "unknown_action" });
  assert.ok(hooks.elements.dashboardButton.textContent.includes("Open dashboard"));

  hooks.elements.dashboardButton.innerHTML = "<span></span>";
  hooks.applyPopupAction({
    popupPrimaryAction: "open_dashboard",
    dashboardButtonLabel: " Launch ",
  });
  assert.ok(hooks.elements.dashboardButton.textContent.includes("Launch"));

  hooks.applyPopupAction({ popupPrimaryAction: "start_focus" });
  hooks.elements.dashboardButton.dispatchEvent(new dom.window.Event("click"));
  assert.ok(chrome._sentMessages.length >= 1);

  chrome._storage.local.irht_state = {
    activeSessionId: "empty-summary",
    sessionOrder: ["empty-summary"],
    sessions: {
      "empty-summary": {
        id: "empty-summary",
        label: "",
        summaryBrief: "",
        distractionAverage: 0,
        nodes: {},
        events: [],
      },
    },
  };
  hooks.loadPopupState();
  hooks.applyPopupAction({ popupPrimaryAction: "copy_summary" });
  hooks.elements.dashboardButton.dispatchEvent(new dom.window.Event("click"));
});

test("popup loadPopupState handles missing storage and runtime error", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const { hooks } = loadPopup({ dom, chrome });
  chrome.storage.local = null;
  hooks.loadPopupState();
  let updated = null;
  chrome.storage = null;
  hooks.updateTrackingPaused(true, (ok) => {
    updated = ok;
  });
  assert.equal(updated, false);
  chrome.storage = createChromeMock().storage;
  chrome.runtime.lastError = { message: "fail" };
  hooks.updateTrackingPaused(true, (ok) => {
    updated = ok;
  });
  assert.equal(updated, false);
  chrome.storage.local = { get: (key, cb) => cb({}) };
  hooks.loadPopupState();
  chrome.runtime.lastError = null;
});

test("popup test hooks init branch", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const context = createContext({
    dom,
    chrome,
    extraGlobals: { __IRHT_TEST_HOOKS__: undefined },
  });
  loadScript(rootPath("popup.js"), context);
  assert.ok(context.__IRHT_TEST_HOOKS__.popup);
});

test("popup auto init branch", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const context = createContext({
    dom,
    chrome,
    extraGlobals: { __IRHT_TEST__: false },
  });
  loadScript(rootPath("shared.js"), context);
  loadScript(rootPath("popup.js"), context);
});

test("popup format helpers fall back without shared helpers", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const { hooks, context } = loadPopup({ dom, chrome });

  const sharedBackup = context.IRHTShared;
  context.IRHTShared = null;
  assert.equal(hooks.normalizeDistractionScore(3.2), 0);
  assert.equal(hooks.getDistractionLabel(20), "Focused");
  assert.equal(hooks.formatDuration(1000), "1s");
  assert.equal(hooks.getLatestEvent({ events: [] }), null);
  assert.equal(hooks.getDomain("not a url"), null);
  context.IRHTShared = sharedBackup;
});

test("popup last action uses ring buffer cursor", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const { hooks } = loadPopup({ dom, chrome });
  const state = {
    activeSessionId: "s1",
    sessionOrder: ["s1"],
    sessions: {
      s1: {
        id: "s1",
        nodes: {},
        events: [
          { type: "tab_activated" },
          { type: "navigation" },
          { type: "user_active" },
        ],
        eventCursor: 1,
        eventCount: 3,
      },
    },
    tracking: {},
  };
  const metrics = hooks.buildPopupMetrics(state);
  assert.equal(metrics.lastAction, "Tab switched");
});

test("popup latest event non-ring buffer path", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const { hooks } = loadPopup({ dom, chrome });
  const session = {
    events: [{ id: 1 }, { id: 2 }, { id: 3 }],
    eventCursor: 0,
    eventCount: 0,
  };
  const event = hooks.getLatestEvent(session);
  assert.equal(event.id, 3);
});

test("popup getLatestEvent handles ring buffer index", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const { hooks } = loadPopup({ dom, chrome });
  const session = {
    events: [{ id: "first" }, { id: "second" }, { id: "third" }],
    eventCursor: 2,
    eventCount: 3,
  };
  const event = hooks.getLatestEvent(session);
  assert.equal(event.id, "second");
});

test("popup getLatestEvent returns null for missing entries", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const { hooks } = loadPopup({ dom, chrome });
  const missingLast = {
    events: [{ id: 1 }, undefined],
    eventCursor: "na",
    eventCount: 2,
  };
  assert.equal(hooks.getLatestEvent(missingLast), null);

  const missingIndex = {
    events: [{ id: "first" }, undefined, { id: "third" }],
    eventCursor: 2,
    eventCount: 3,
  };
  assert.equal(hooks.getLatestEvent(missingIndex), null);
});

test("popup normalize helpers use shared functions when available", () => {
  const html = loadHtmlFixture(rootPath("popup.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const { hooks, context } = loadPopup({ dom, chrome });
  const backup = context.IRHTShared;
  context.IRHTShared = {};
  assert.equal(hooks.normalizeDistractionScore(10), 0);
  assert.equal(hooks.getDistractionLabel(10), "Focused");
  context.IRHTShared = {
    normalizeDistractionScore: () => 88,
    getDistractionLabel: () => "Custom",
  };
  assert.equal(hooks.normalizeDistractionScore(10), 88);
  assert.equal(hooks.getDistractionLabel(10), "Custom");
  context.IRHTShared = backup;
});
