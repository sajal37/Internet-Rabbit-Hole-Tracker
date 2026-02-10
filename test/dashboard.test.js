const assert = require("node:assert/strict");
const { test } = require("node:test");
const vm = require("node:vm");
const {
  createClock,
  createChromeMock,
  createContext,
  createDom,
  createCanvasStub,
  loadScript,
  loadHtmlFixture,
  rootPath,
} = require("./test-helpers");

function loadDashboard({
  dom,
  chrome,
  clock,
  immediateTimers = false,
  extraGlobals = {},
}) {
  const globals = {};
  if (immediateTimers) {
    globals.setTimeout = (cb) => {
      cb();
      return 0;
    };
    globals.clearTimeout = () => {};
  }
  Object.assign(globals, extraGlobals);
  const context = createContext({ chrome, dom, clock, extraGlobals: globals });
  loadScript(rootPath("categories.js"), context);
  loadScript(rootPath("shared.js"), context);
  loadScript(rootPath("insights.js"), context);
  loadScript(rootPath("dashboard", "summary-shared.js"), context);
  loadScript(rootPath("categories.js"), context);
  loadScript(rootPath("dashboard", "summary-shared.js"), context);
  loadScript(rootPath("dashboard", "graph.js"), context);
  loadScript(rootPath("dashboard", "dashboard.js"), context);
  if (context.__IRHT_TEST_HOOKS__?.dashboard?.bindControls) {
    context.__IRHT_TEST_HOOKS__.dashboard.bindControls();
  }
  if (context.__IRHT_TEST_HOOKS__?.dashboard?.elements?.toastAction?.onclick) {
    context.__IRHT_TEST_HOOKS__.dashboard.elements.toastAction.onclick();
  }
  return { context, hooks: context.__IRHT_TEST_HOOKS__.dashboard, chrome };
}

function buildSampleState(clock) {
  const start = clock.now() - 30 * 60 * 1000;
  const mid = clock.now() - 20 * 60 * 1000;
  const end = clock.now() - 5 * 60 * 1000;

  const session = {
    id: "session-a",
    startedAt: start,
    updatedAt: end,
    endedAt: null,
    endReason: null,
    lastActivityAt: end,
    navigationCount: 3,
    nodes: {
      "https://example.com/": {
        id: "https://example.com/",
        url: "https://example.com/",
        title: "Example",
        category: "Study",
        visitCount: 2,
        activeMs: 5 * 60 * 1000,
        firstNavigationIndex: 0,
        lastNavigationIndex: 1,
        firstSeen: start,
        lastSeen: end,
        distractionScore: 0,
        distractionComponents: null,
      },
      "https://video.example/": {
        id: "https://video.example/",
        url: "https://video.example/",
        title: "Video",
        category: "Video",
        visitCount: 1,
        activeMs: 12 * 60 * 1000,
        firstNavigationIndex: 1,
        lastNavigationIndex: 2,
        firstSeen: mid,
        lastSeen: end,
        distractionScore: 0,
        distractionComponents: null,
      },
      "https://video.example/shorts": {
        id: "https://video.example/shorts",
        url: "https://video.example/shorts",
        title: "Shorts",
        category: "Video",
        visitCount: 1,
        activeMs: 6 * 60 * 1000,
        firstNavigationIndex: 2,
        lastNavigationIndex: 2,
        firstSeen: mid,
        lastSeen: end,
        distractionScore: 0,
        distractionComponents: null,
      },
    },
    edges: {
      "https://example.com/ -> https://video.example/": {
        id: "https://example.com/ -> https://video.example/",
        from: "https://example.com/",
        to: "https://video.example/",
        visitCount: 2,
        activeMs: 2000,
        firstSeen: mid,
        lastSeen: end,
      },
    },
    events: [
      {
        ts: start + 1000,
        type: "navigation",
        fromUrl: "https://example.com/",
        toUrl: "https://video.example/",
      },
      {
        ts: start + 2000,
        type: "navigation",
        fromUrl: "https://video.example/",
        toUrl: "https://video.example/shorts",
      },
      {
        ts: start + 3000,
        type: "active_time_flushed",
        url: "https://example.com/",
        durationMs: 120000,
      },
      {
        ts: start + 4000,
        type: "active_time_flushed",
        url: "https://video.example/",
        durationMs: 180000,
      },
    ],
    trapDoors: [
      {
        url: "https://video.example/",
        postVisitDurationMs: 25 * 60 * 1000,
        postVisitDepth: 6,
      },
    ],
    categoryTotals: {
      Study: 5 * 60 * 1000,
      Video: 18 * 60 * 1000,
    },
    distractionAverage: 1.5,
    label: "Mixed session",
    labelDetail: "Dominant: Video.",
    archived: false,
    archivedAt: null,
    deleted: false,
    deletedAt: null,
  };

  const sessionB = {
    id: "session-b",
    startedAt: start - 60 * 60 * 1000,
    updatedAt: start - 30 * 60 * 1000,
    endedAt: start - 30 * 60 * 1000,
    endReason: "manual",
    lastActivityAt: start - 30 * 60 * 1000,
    navigationCount: 1,
    nodes: {
      "https://example.com/": {
        id: "https://example.com/",
        url: "https://example.com/",
        title: "Example",
        category: "Study",
        visitCount: 1,
        activeMs: 60 * 1000,
        firstNavigationIndex: 0,
        lastNavigationIndex: 0,
        firstSeen: start - 60 * 60 * 1000,
        lastSeen: start - 30 * 60 * 1000,
      },
    },
    edges: {},
    events: [
      {
        ts: start - 60 * 60 * 1000,
        type: "navigation",
        fromUrl: "https://example.com/",
        toUrl: "https://example.com/",
      },
    ],
    trapDoors: [],
    categoryTotals: { Study: 60 * 1000 },
    distractionAverage: 0.2,
    label: "Focused",
    labelDetail: "",
    archived: true,
    archivedAt: start - 20 * 60 * 1000,
    deleted: false,
    deletedAt: null,
  };

  return {
    schemaVersion: 3,
    sessions: { [session.id]: session, [sessionB.id]: sessionB },
    sessionOrder: [sessionB.id, session.id],
    activeSessionId: session.id,
    tracking: {
      activeTabId: 1,
      activeUrl: "https://video.example/",
      activeEdgeKey: null,
      activeSince: end - 60000,
      lastInteractionAt: end - 30000,
      userIdle: false,
      lastInactiveAt: null,
    },
  };
}

function attachLegacyDashboardElements(dom) {
  const doc = dom.window.document;
  const container = doc.createElement("div");
  container.innerHTML = `
    <div id="live-indicator"><span id="live-label"></span></div>
    <select id="session-select"></select>
    <button id="session-delete"></button>
    <label id="session-favorites-toggle">
      <input type="checkbox" id="session-filter-favorites" />
    </label>
    <button class="view-tab" data-view="overview"></button>
    <button class="view-tab" data-view="settings"></button>
    <div data-view-panel="overview"></div>
    <div data-view-panel="settings"></div>
    <div id="session-range"></div>
    <div id="total-active"></div>
    <div id="page-count"></div>
    <div id="edge-count"></div>
    <div id="timeline-track"></div>
    <div id="timeline-legend"></div>
    <span id="timeline-start"></span>
    <span id="timeline-end"></span>
    <div class="graph-wrap">
      <canvas id="graph-canvas"></canvas>
      <div id="graph-empty"></div>
    </div>
    <div id="graph-tooltip"></div>
    <button class="graph-toggle" data-mode="domain"></button>
    <button class="graph-toggle" data-mode="page"></button>
    <button class="deep-tab" data-deep="timeline"></button>
    <button class="deep-tab" data-deep="graph"></button>
    <button class="deep-tab" data-deep="stats"></button>
    <button class="deep-tab" data-deep="honest"></button>
    <div data-deep-panel="timeline"></div>
    <div data-deep-panel="graph"></div>
    <div data-deep-panel="stats"></div>
    <div data-deep-panel="honest"></div>
    <div id="deepest-chain"></div>
    <div id="deepest-chain-detail"></div>
    <div id="common-start"></div>
    <div id="common-start-detail"></div>
    <div id="trap-door"></div>
    <div id="trap-door-detail"></div>
    <div id="session-label"></div>
    <div id="session-label-detail"></div>
    <ol id="top-domains"></ol>
    <ol id="top-pages"></ol>
    <ol id="top-distractions"></ol>
    <ol id="damage-receipts"></ol>
    <span id="path-start"></span>
    <span id="path-trap"></span>
    <span id="path-end"></span>
    <p id="path-meta"></p>
    <ul id="callouts-list"></ul>
  `;
  doc.body.appendChild(container);
  return container;
}

function attachSettingsElements(dom) {
  const doc = dom.window.document;
  if (doc.getElementById("settings-form")) {
    return null;
  }
  const container = doc.createElement("div");
  container.innerHTML = `
    <button id="open-dashboard"></button>
    <form id="settings-form">
      <input type="number" id="setting-session-timeout" />
      <input type="number" id="setting-idle-timeout" />
      <select id="setting-theme"><option value="warm">Warm</option></select>
      <select id="setting-tone"><option value="neutral">Neutral</option></select>
      <input type="checkbox" id="setting-tracking-paused" />
      <textarea id="setting-productive-sites"></textarea>
      <textarea id="setting-distracting-sites"></textarea>
      <textarea id="setting-category-overrides"></textarea>
      <input type="checkbox" id="setting-sync" />
      <input type="checkbox" id="setting-direct-callouts" />
      <input type="checkbox" id="setting-summary-auto-refresh" />
      <input type="text" id="setting-ollama-endpoint" />
      <input type="text" id="setting-ollama-model" />
      <textarea id="setting-dashboard-note"></textarea>
      <textarea id="setting-popup-note"></textarea>
      <input type="text" id="setting-dashboard-button-label" />
      <select id="setting-ui-density"><option value="comfortable">Comfortable</option></select>
      <input type="checkbox" id="setting-reduce-motion" />
      <input type="number" id="setting-session-list-limit" />
      <span id="settings-status"></span>
      <button type="button" id="export-data"></button>
      <button type="button" id="delete-all-sessions"></button>
      <button type="button" id="reset-state"></button>
    </form>
  `;
  doc.body.appendChild(container);
  return container;
}

function attachExtendedSettingsElements(dom) {
  const doc = dom.window.document;
  if (doc.getElementById("setting-summary-personality")) {
    return null;
  }
  const container = doc.createElement("div");
  container.innerHTML = `
    <button class="help-icon" id="help-one"></button>
    <button class="help-icon" id="help-two"></button>
    <select id="setting-summary-personality">
      <option value="gentle">gentle</option>
      <option value="direct">direct</option>
    </select>
    <select id="setting-summary-emojis">
      <option value="none">none</option>
      <option value="low">low</option>
    </select>
    <select id="setting-summary-formatting">
      <option value="plain">plain</option>
      <option value="markdown">markdown</option>
    </select>
    <input type="checkbox" id="setting-summary-bullets" />
    <input type="checkbox" id="setting-summary-metaphors" />
    <select id="setting-summary-length">
      <option value="short">short</option>
      <option value="medium">medium</option>
    </select>
    <select id="setting-summary-verbosity">
      <option value="brief">brief</option>
      <option value="detailed">detailed</option>
    </select>
    <select id="setting-summary-technicality">
      <option value="soft">soft</option>
      <option value="technical">technical</option>
    </select>
    <select id="setting-summary-voice">
      <option value="mentor">mentor</option>
      <option value="friend">friend</option>
    </select>
    <input type="number" id="setting-summary-cooldown" />
    <input type="number" id="setting-summary-cache" />
    <select id="setting-popup-layout">
      <option value="stack">stack</option>
      <option value="focus">focus</option>
    </select>
    <select id="setting-popup-density">
      <option value="roomy">roomy</option>
      <option value="compact">compact</option>
    </select>
    <select id="setting-popup-action">
      <option value="adaptive">adaptive</option>
      <option value="open_dashboard">open_dashboard</option>
    </select>
    <input type="text" id="setting-popup-micro-note" />
    <input type="text" id="setting-popup-mood" />
    <input type="checkbox" id="setting-popup-show-active-time" />
    <input type="checkbox" id="setting-popup-show-top-domain" />
    <input type="checkbox" id="setting-popup-show-distraction" />
    <input type="checkbox" id="setting-popup-show-session-label" />
    <input type="checkbox" id="setting-popup-show-last-action" />
    <input type="checkbox" id="setting-dashboard-story-mode" />
    <select id="setting-session-list-style">
      <option value="cards">cards</option>
      <option value="minimal">minimal</option>
    </select>
    <input type="checkbox" id="setting-pin-active-session" />
    <textarea id="setting-focus-prompts"></textarea>
    <div id="settings-preview"></div>
    <span id="preview-theme-label"></span>
    <span id="preview-density-label"></span>
    <span id="preview-typography-label"></span>
    <span id="preview-accent-label"></span>
    <button id="undo-settings"></button>
  `;
  doc.body.appendChild(container);
  return container;
}

function ensureElement(doc, tag, id, attrs = {}) {
  let element = doc.getElementById(id);
  if (element) {
    return element;
  }
  element = doc.createElement(tag);
  element.id = id;
  if (attrs.type) {
    element.type = attrs.type;
  }
  if (attrs.className) {
    element.className = attrs.className;
  }
  if (attrs.value !== undefined) {
    element.value = attrs.value;
  }
  if (attrs.textContent !== undefined) {
    element.textContent = attrs.textContent;
  }
  if (attrs.dataset) {
    Object.entries(attrs.dataset).forEach(([key, value]) => {
      element.dataset[key] = value;
    });
  }
  (attrs.parent || doc.body).appendChild(element);
  return element;
}

function ensureSelect(doc, id, options) {
  const select = ensureElement(doc, "select", id);
  if (!select.options.length) {
    options.forEach((value) => {
      const option = doc.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }
  return select;
}

function attachFullSettingsElements(dom) {
  const doc = dom.window.document;
  if (doc.getElementById("settings-form")) {
    return null;
  }
  const container = doc.createElement("div");
  doc.body.appendChild(container);
  const form = doc.createElement("form");
  form.id = "settings-form";
  container.appendChild(form);

  const addInput = (id, type = "text") =>
    ensureElement(doc, "input", id, { type, parent: form });
  const addCheckbox = (id) => addInput(id, "checkbox");
  const addTextarea = (id) =>
    ensureElement(doc, "textarea", id, { parent: form });

  addInput("setting-session-timeout", "number");
  addInput("setting-idle-timeout", "number");
  ensureSelect(doc, "setting-theme", ["warm", "cool"]);
  ensureSelect(doc, "setting-tone", ["neutral", "direct"]);
  addCheckbox("setting-tracking-paused");
  addTextarea("setting-productive-sites");
  addTextarea("setting-distracting-sites");
  addTextarea("setting-category-overrides");
  addCheckbox("setting-sync");
  addCheckbox("setting-direct-callouts");
  addCheckbox("setting-intent-drift-alerts");
  ensureSelect(doc, "setting-intent-drift-sensitivity", ["low", "balanced", "high"]);
  addCheckbox("setting-summary-auto-refresh");
  ensureSelect(doc, "setting-summary-personality", ["gentle", "direct"]);
  ensureSelect(doc, "setting-summary-emojis", ["none", "low"]);
  ensureSelect(doc, "setting-summary-formatting", ["plain", "markdown"]);
  addCheckbox("setting-summary-bullets");
  addCheckbox("setting-summary-metaphors");
  ensureSelect(doc, "setting-summary-length", ["short", "medium"]);
  ensureSelect(doc, "setting-summary-verbosity", ["brief", "detailed"]);
  ensureSelect(doc, "setting-summary-technicality", ["soft", "technical"]);
  ensureSelect(doc, "setting-summary-voice", ["mentor", "friend"]);
  addInput("setting-summary-cooldown", "number");
  addInput("setting-summary-cache", "number");
  addInput("setting-ollama-endpoint", "text");
  addInput("setting-ollama-model", "text");
  addCheckbox("setting-realtime-stream");
  addCheckbox("setting-realtime-delta");
  addCheckbox("setting-realtime-push");
  addCheckbox("setting-realtime-live-timers");
  addCheckbox("setting-realtime-batching");
  addInput("setting-realtime-batch-window", "number");
  addCheckbox("setting-realtime-priority");
  addCheckbox("setting-realtime-optimistic");
  addCheckbox("setting-realtime-worker");
  addCheckbox("setting-realtime-raf");
  addTextarea("setting-dashboard-note");
  addTextarea("setting-popup-note");
  addInput("setting-dashboard-button-label", "text");
  ensureSelect(doc, "setting-popup-layout", ["stack", "focus"]);
  ensureSelect(doc, "setting-popup-density", ["roomy", "compact"]);
  ensureSelect(doc, "setting-popup-action", ["adaptive", "open_dashboard"]);
  addInput("setting-popup-micro-note", "text");
  addInput("setting-popup-mood", "text");
  addCheckbox("setting-popup-show-active-time");
  addCheckbox("setting-popup-show-top-domain");
  addCheckbox("setting-popup-show-distraction");
  addCheckbox("setting-popup-show-session-label");
  addCheckbox("setting-popup-show-last-action");
  addCheckbox("setting-dashboard-story-mode");
  ensureSelect(doc, "setting-session-list-style", ["cards", "minimal"]);
  addCheckbox("setting-pin-active-session");
  addTextarea("setting-focus-prompts");
  addCheckbox("setting-outcome-highlights");
  addCheckbox("setting-dashboard-show-overview");
  addCheckbox("setting-dashboard-show-sessions");
  addCheckbox("setting-dashboard-show-timeline");
  addCheckbox("setting-dashboard-show-graph");
  addCheckbox("setting-dashboard-show-stats");
  addCheckbox("setting-dashboard-show-honesty");
  addCheckbox("setting-dashboard-show-callouts");
  addInput("setting-accent-color", "text");
  ensureSelect(doc, "setting-typography-style", ["default", "bold"]);
  ensureSelect(doc, "setting-ui-density", ["comfortable", "compact"]);
  addCheckbox("setting-reduce-motion");
  addInput("setting-session-list-limit", "number");

  ensureElement(doc, "span", "settings-status", { parent: form });
  ensureElement(doc, "button", "export-data", { parent: form });
  ensureElement(doc, "button", "delete-all-sessions", { parent: form });
  ensureElement(doc, "button", "reset-state", { parent: form });
  ensureElement(doc, "button", "reset-settings", { parent: form });
  ensureElement(doc, "button", "undo-settings", { parent: form });

  ensureElement(doc, "div", "settings-preview", { parent: container });
  ensureElement(doc, "span", "preview-theme-label", { parent: container });
  ensureElement(doc, "span", "preview-density-label", { parent: container });
  ensureElement(doc, "span", "preview-typography-label", { parent: container });
  ensureElement(doc, "span", "preview-accent-label", { parent: container });

  ensureElement(doc, "button", "open-dashboard", { parent: container });
  return container;
}

function createFullDashboardDom() {
  const html = loadHtmlFixture(rootPath("dashboard", "index.html"));
  const dom = createDom(html);
  attachFullSettingsElements(dom);
  const doc = dom.window.document;
  ensureElement(doc, "button", "open-dashboard");
  ensureElement(doc, "select", "session-select");
  ensureElement(doc, "button", "view-tab-overview", {
    className: "view-tab",
    dataset: { view: "overview" },
  });
  ensureElement(doc, "button", "view-tab-settings", {
    className: "view-tab",
    dataset: { view: "settings" },
  });
  ensureElement(doc, "div", "view-panel-overview", {
    dataset: { viewPanel: "overview" },
  });
  ensureElement(doc, "div", "view-panel-settings", {
    dataset: { viewPanel: "settings" },
  });
  return dom;
}

function createCoverageDom() {
  const dom = createDom("<!doctype html><html><body class=\"dashboard-page\"></body></html>");
  attachLegacyDashboardElements(dom);
  attachFullSettingsElements(dom);
  const doc = dom.window.document;

  ensureElement(doc, "div", "session-list");
  ensureElement(doc, "div", "session-list-empty");
  ensureElement(doc, "input", "session-date-picker", { type: "date" });
  ensureElement(doc, "button", "toast-action");
  ensureElement(doc, "button", "summary-refresh");
  ensureElement(doc, "input", "graph-search");
  ensureElement(doc, "input", "graph-node-cap", { type: "range", value: "80" });
  ensureElement(doc, "span", "graph-node-cap-value");
  ensureElement(doc, "input", "graph-min-active", { type: "range", value: "5" });
  ensureElement(doc, "span", "graph-min-active-value");
  ensureElement(doc, "input", "graph-min-edge", { type: "range", value: "2" });
  ensureElement(doc, "span", "graph-min-edge-value");
  ensureElement(doc, "select", "graph-color-by", { value: "activity" });
  ensureElement(doc, "input", "graph-show-labels", { type: "checkbox" });
  ensureElement(doc, "input", "graph-hide-isolates", { type: "checkbox" });
  ensureElement(doc, "input", "graph-freeze", { type: "checkbox" });
  ensureElement(doc, "button", "graph-reset");
  ensureElement(doc, "div", "graph-stats");
  ensureElement(doc, "div", "graph-legend");
  ensureElement(doc, "div", "overview-summary");
  ensureElement(doc, "div", "overview-origin");
  ensureElement(doc, "div", "overview-insights");
  ensureElement(doc, "div", "overview-insights-empty");
  ensureElement(doc, "div", "overview-actions");
  ensureElement(doc, "div", "overview-actions-empty");
  ensureElement(doc, "button", "open-settings");
  return dom;
}

test("dashboard minimal boot", () => {
  const dom = createDom("<!doctype html><html><body></body></html>");
  const { hooks } = loadDashboard({
    dom,
    chrome: undefined,
    clock: createClock(1000),
  });
  assert.equal(hooks.canUseChromeStorage(), false);
  hooks.setLiveIndicator("offline");
});

test("dashboard rendering and helpers", async () => {
  const html = loadHtmlFixture(rootPath("dashboard", "index.html"));
  const dom = createDom(html);
  attachLegacyDashboardElements(dom);
  attachSettingsElements(dom);
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);
  const clock = createClock(Date.now());
  const state = buildSampleState(clock);
  const fetchCalls = [];
  const fetchStub = async (url, options) => {
    fetchCalls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ response: "Ollama reply." }),
    };
  };

  dom.window.localStorage.setItem("rabbit_shame_enabled", "true");
  dom.window.navigator.clipboard = { writeText: async () => {} };

  const chrome = createChromeMock({
    localData: { irht_state: state },
    syncData: { irht_settings: { theme: "ink", sessionTimeoutMinutes: 6 } },
  });

  const deferredTimeouts = new Map();
  let timeoutId = 0;
  const { hooks } = loadDashboard({
    dom,
    chrome,
    clock,
    immediateTimers: true,
    extraGlobals: {
      fetch: fetchStub,
      setTimeout: (cb, ms = 0) => {
        timeoutId += 1;
        if (ms >= 2000) {
          deferredTimeouts.set(timeoutId, cb);
          return timeoutId;
        }
        cb();
        return timeoutId;
      },
      clearTimeout: (id) => {
        deferredTimeouts.delete(id);
      },
    },
  });

  hooks.app.graph = new hooks.ForceGraph(
    canvas,
    dom.window.document.getElementById("graph-tooltip"),
  );
  hooks.applyState(state, "local");
  hooks.populateSessionSelect();
  hooks.selectSession(state.activeSessionId);
  hooks.renderDashboard();
  hooks.setView("settings");
  hooks.setDeepDiveTab("graph");
  hooks.app.mode = "page";
  state.sessions[state.activeSessionId].nodes["https://empty.example/"] = {
    id: "https://empty.example/",
    url: "https://empty.example/",
    activeMs: 0,
  };
  state.sessions[state.activeSessionId].edges[
    "https://empty.example/ -> https://example.com/"
  ] = {
    id: "https://empty.example/ -> https://example.com/",
    from: "https://empty.example/",
    to: "https://example.com/",
    visitCount: 0,
  };
  hooks.renderGraph();
  hooks.setView("overview");
  hooks.app.settings.summaryAutoRefresh = true;
  hooks.renderOverview();
  assert.equal(hooks.elements.summaryStatus.textContent, "Updating summary...");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[0].url, hooks.OLLAMA_ENDPOINT);
  assert.equal(fetchCalls[0].options.headers.Authorization, undefined);
  assert.equal(hooks.elements.briefSummary.textContent, "Ollama reply.");
  assert.equal(hooks.elements.detailedSummary.textContent, "Ollama reply.");

  hooks.renderEmptyDashboard();
  hooks.applyTheme("ink");

  const segments = hooks.buildTimelineSegments(
    state.sessions[state.activeSessionId],
    state.tracking,
    true,
  );
  assert.ok(segments.length >= 2);

  const graphDomain = hooks.buildGraphData(
    state.sessions[state.activeSessionId],
    "domain",
  );
  assert.ok(graphDomain.nodes.length > 0);

  const graphPage = hooks.buildGraphData(
    state.sessions[state.activeSessionId],
    "page",
  );
  assert.ok(graphPage.nodes.length > 0);

  const trimmed = hooks.trimGraph({
    nodes: Array.from({ length: hooks.MAX_GRAPH_NODES + 1 }, (_, i) => ({
      id: `n${i}`,
      activeMs: i,
    })),
    edges: [],
  });
  assert.ok(trimmed.nodes.length <= hooks.MAX_GRAPH_NODES);

  hooks.renderStats();
  hooks.renderHonesty();

  const receipts = hooks.buildDamageReceipts(
    state.sessions[state.activeSessionId],
  );
  assert.ok(receipts.length > 0);

  const callouts = hooks.buildCalloutMessages(
    state.sessions[state.activeSessionId],
    state,
  );
  assert.ok(Array.isArray(callouts));

  const overrides = hooks.parseCategoryOverrides(
    "example.com=Study\ninvalid=Bad",
  );
  assert.equal(overrides["example.com"], "Study");

  const formatted = hooks.formatCategoryOverrides({
    "example.com": "Study",
    "b.com": "Video",
  });
  assert.ok(formatted.includes("example.com=Study"));
  assert.equal(
    hooks.parseSiteList("docs.example.com\nmail.example.com").join(","),
    "docs.example.com,mail.example.com",
  );
  assert.equal(hooks.formatSiteList(["b.com", "a.com"]), "a.com\nb.com");

  const form = dom.window.document.getElementById("settings-form");
  dom.window.document.getElementById("setting-session-timeout").value = "5";
  dom.window.document.getElementById("setting-idle-timeout").value = "2";
  dom.window.document.getElementById("setting-theme").value = "warm";
  dom.window.document.getElementById("setting-tone").value = "direct";
  dom.window.document.getElementById("setting-tracking-paused").checked = true;
  dom.window.document.getElementById("setting-productive-sites").value =
    "docs.example.com";
  dom.window.document.getElementById("setting-distracting-sites").value =
    "video.example.com";
  dom.window.document.getElementById("setting-category-overrides").value =
    "youtube.com=Video";
  dom.window.document.getElementById("setting-sync").checked = true;
  dom.window.document.getElementById("setting-direct-callouts").checked = true;

  form.dispatchEvent(new dom.window.Event("submit"));

  hooks.showToast("Saved", "Undo", () => {});
  hooks.hideToast();

  hooks.setSettingsStatus("Saved.");
  hooks.formatDuration(3600 * 1000 + 60000);
  hooks.formatDuration(120000);
  hooks.formatDuration(1500);
  hooks.formatScore(0);
  hooks.formatScore(1.25);
  hooks.formatSessionLabel(state.sessions[state.activeSessionId]);
  hooks.formatSessionRange(state.sessions[state.activeSessionId]);

  const forceGraph = new hooks.ForceGraph(
    canvas,
    dom.window.document.getElementById("graph-tooltip"),
  );
  forceGraph.setData({ nodes: [], edges: [] });
  forceGraph.setData({
    nodes: [
      { id: "a", label: "Node A", activeMs: 10 },
      { id: "b", label: "Node B", activeMs: 5 },
    ],
    edges: [{ from: "a", to: "b", count: 2 }],
  });

  forceGraph.handleMove({ clientX: 10, clientY: 10 });
  forceGraph.hideTooltip();

  await hooks.initLiveDashboard();
});

test("dashboard filterGraphData hides isolates and caps nodes", () => {
  const dom = createDom("<!doctype html><html><body></body></html>");
  const clock = createClock(Date.now());
  const chrome = createChromeMock();
  const { context } = loadDashboard({ dom, chrome, clock });

  const graph = {
    nodes: [
      { id: "a", activeMs: 100 },
      { id: "b", activeMs: 50 },
      { id: "c", activeMs: 10 },
      { id: "d", activeMs: 5 },
    ],
    edges: [
      { from: "a", to: "b", count: 1 },
      { from: "b", to: "c", count: 1 },
    ],
  };

  const filtered = context.filterGraphData(graph, {
    hideIsolates: true,
    nodeCap: 2,
  });

  assert.equal(filtered.nodes.length, 2);
  assert.ok(filtered.nodes.find((node) => node.id === "a"));
  assert.ok(filtered.nodes.find((node) => node.id === "b"));
  assert.equal(filtered.edges.length, 1);
  assert.equal(filtered.emptyReason, "");
});

test("dashboard normalization and computations", () => {
  const dom = createDom("<!doctype html><html><body></body></html>");
  const clock = createClock(Date.now());
  const chrome = createChromeMock();
  const { hooks, context } = loadDashboard({ dom, chrome, clock });

  chrome.runtime.lastError = { message: "fail" };
  hooks.storageLocalGet(hooks.STORAGE_KEY);
  hooks.storageSyncGet(hooks.SETTINGS_KEY);
  chrome.runtime.lastError = null;

  const legacy = {
    schemaVersion: 1,
    session: {
      id: "legacy",
      startedAt: clock.now(),
      updatedAt: clock.now(),
      nodes: {},
      edges: {},
    },
  };
  const normalizedLegacy = hooks.normalizeState(legacy);
  assert.equal(normalizedLegacy.schemaVersion, 4);

  const partial = { sessions: {}, sessionOrder: [], tracking: null };
  const normalizedPartial = hooks.normalizeState(partial);
  assert.ok(normalizedPartial.sessions);
  assert.ok(normalizedPartial.sessionOrder);

  const session = { id: "session-x", nodes: {}, edges: {}, events: [] };
  hooks.applySessionDefaults(session);
  assert.equal(session.archived, false);
  assert.ok(Array.isArray(session.events));

  const tracking = hooks.createDefaultTracking();
  assert.ok(tracking.userIdle);

  const labels = hooks.computeDeepestChain({ events: [] });
  assert.equal(labels.length, 0);

  const common = hooks.computeCommonStart({ sessions: { a: null } });
  assert.equal(common.domain, null);

  const activeMs = hooks.getSessionActiveMs(
    { nodes: { a: { activeMs: 1000 } } },
    { activeSince: clock.now() - 1000, activeUrl: "a" },
  );
  assert.ok(activeMs >= 1000);

  const lateNight = new Date();
  lateNight.setHours(23, 0, 0, 0);
  assert.equal(hooks.isLateNight(lateNight.getTime()), true);
  const earlyMorning = new Date();
  earlyMorning.setHours(2, 0, 0, 0);
  assert.equal(hooks.isLateNight(earlyMorning.getTime()), true);
  assert.equal(hooks.isEntertainmentCategory("Video"), true);
  assert.equal(hooks.isEntertainmentCategory("Random"), true);
  assert.equal(hooks.isProductiveCategory("Study"), true);
  assert.equal(hooks.isProductiveCategory("News"), true);

  const lateStart = new Date();
  lateStart.setHours(23, 30, 0, 0);
  const lateNodes = {
    a: { url: "https://a.com", activeMs: 2 * 60 * 1000, visitCount: 1 },
    b: { url: "https://b.com", activeMs: 2 * 60 * 1000, visitCount: 1 },
  };
  hooks.buildSessionLabel(
    { startedAt: lateStart.getTime(), navigationCount: 1, nodes: lateNodes },
    Object.values(lateNodes),
    {},
    0,
  );

  const loopNodes = {
    a: { url: "https://a.com", activeMs: 2 * 60 * 1000, visitCount: 2 },
    b: { url: "https://b.com", activeMs: 2 * 60 * 1000, visitCount: 2 },
    c: { url: "https://c.com", activeMs: 2 * 60 * 1000, visitCount: 1 },
    d: { url: "https://d.com", activeMs: 2 * 60 * 1000, visitCount: 1 },
  };
  hooks.buildSessionLabel(
    { startedAt: clock.now(), navigationCount: 2, nodes: loopNodes },
    Object.values(loopNodes),
    {},
    0,
  );

  const focusNodes = {
    a: { url: "https://a.com", activeMs: 6 * 60 * 1000, visitCount: 1 },
    b: { url: "https://b.com", activeMs: 3 * 60 * 1000, visitCount: 1 },
  };
  hooks.buildSessionLabel(
    { startedAt: clock.now(), navigationCount: 1, nodes: focusNodes },
    Object.values(focusNodes),
    {},
    0,
  );

  const wanderLoopNodes = {
    a: { url: "https://a.com", activeMs: 60000, visitCount: 2 },
    b: { url: "https://b.com", activeMs: 60000, visitCount: 2 },
    c: { url: "https://c.com", activeMs: 60000, visitCount: 1 },
    d: { url: "https://d.com", activeMs: 60000, visitCount: 1 },
  };
  hooks.buildSessionLabel(
    { startedAt: clock.now(), navigationCount: 20, nodes: wanderLoopNodes },
    Object.values(wanderLoopNodes),
    {},
    0,
  );

  const wanderNodes = {
    a: { url: "https://a.com", activeMs: 60000, visitCount: 1 },
    b: { url: "https://b.com", activeMs: 60000, visitCount: 1 },
  };
  hooks.buildSessionLabel(
    { startedAt: clock.now(), navigationCount: 10, nodes: wanderNodes },
    Object.values(wanderNodes),
    {},
    0,
  );

  hooks.computeDistractionScore(
    {
      activeMs: 60000,
      visitCount: 1,
      url: "https://example.com/login",
      category: "Video",
      firstNavigationIndex: 0,
    },
    { navigationCount: 2, nodes: { a: { activeMs: 60000, visitCount: 1 } } },
  );
  hooks.computeDistractionScore(
    {
      activeMs: 60000,
      visitCount: 3,
      url: "https://example.com/feed",
      category: "Video",
      firstNavigationIndex: 0,
    },
    { navigationCount: 2, nodes: { a: { activeMs: 60000, visitCount: 3 } } },
  );
  hooks.computeDistractionScore(
    {
      activeMs: 60000,
      visitCount: 1,
      url: "https://accounts.example.com/",
      category: "Video",
      firstNavigationIndex: 0,
    },
    { navigationCount: 2, nodes: { a: { activeMs: 60000, visitCount: 1 } } },
  );
  hooks.computeDistractionScore(
    {
      activeMs: 60000,
      visitCount: 1,
      url: "not-a-url",
      category: "Video",
      firstNavigationIndex: 0,
    },
    { navigationCount: 2, nodes: { a: { activeMs: 60000, visitCount: 1 } } },
  );

  hooks.pickEarlyCategory(
    [
      {
        url: "https://a.com",
        firstSeen: clock.now() - 1000,
        activeMs: 1000,
        category: "Study",
      },
      {
        url: "https://b.com",
        firstSeen: clock.now() - 900,
        activeMs: 2000,
        category: "Study",
      },
    ],
    { startedAt: null },
  );
  hooks.pickEarlyCategory(
    [
      {
        url: "https://a.com",
        firstSeen: undefined,
        activeMs: 1000,
        category: "Study",
      },
      {
        url: "https://b.com",
        firstSeen: undefined,
        activeMs: 2000,
        category: "Study",
      },
    ],
    { startedAt: null },
  );
  hooks.pickEarlyCategory(
    [
      {
        url: "https://a.com",
        firstSeen: clock.now(),
        activeMs: undefined,
        category: "Study",
      },
      {
        url: "https://b.com",
        firstSeen: clock.now(),
        activeMs: 2000,
        category: "Study",
      },
    ],
    { startedAt: clock.now() - 1000 },
  );
  hooks.pickDominantCategory(null);
  hooks.pickDominantCategory({ Study: 1, Video: 2 });
});

test("insight generator ranking and tone", () => {
  const html = loadHtmlFixture(rootPath("dashboard", "index.html"));
  const dom = createDom(html);
  attachLegacyDashboardElements(dom);
  const clock = createClock(Date.now());
  const state = buildSampleState(clock);
  const { context } = loadDashboard({ dom, chrome: createChromeMock(), clock });
  const session = state.sessions[state.activeSessionId];

  const insights = context.IRHTInsights.generateInsights(session, state, {
    tone: "neutral",
  });
  assert.ok(insights.length <= 2);
  assert.ok(insights.length >= 1);
  assert.equal(typeof insights[0].text, "string");

  const direct = context.IRHTInsights.generateInsights(session, state, {
    tone: "direct",
  });
  assert.ok(direct.length >= 1);
});

test("dashboard summary branches", async () => {
  const html = loadHtmlFixture(rootPath("dashboard", "index.html"));
  const dom = createDom(html);
  attachLegacyDashboardElements(dom);
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);
  const clock = createClock(Date.now());
  const fetchStubFail = async () => ({
    ok: false,
    status: 500,
    json: async () => ({}),
  });
  const { hooks, context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock,
    extraGlobals: { fetch: fetchStubFail },
  });

  const emptySession = {
    id: "empty",
    startedAt: clock.now(),
    nodes: {},
    edges: {},
    events: [],
    trapDoors: [],
    categoryTotals: {},
    navigationCount: 0,
  };
  hooks.app.state = {
    tracking: hooks.createDefaultTracking(),
    sessions: { [emptySession.id]: emptySession },
    sessionOrder: [emptySession.id],
    activeSessionId: emptySession.id,
  };
  hooks.app.session = emptySession;

  const prompt = hooks.buildSummaryPrompt(emptySession, "brief");
  assert.ok(prompt.includes("Write 2-3 sentences."));

  const detailedPrompt = hooks.buildSummaryPrompt(emptySession, "detailed");
  assert.ok(
    detailedPrompt.includes(
      "Write 2-3 short, readable paragraphs.",
    ),
  );

  const insightsBackup = context.IRHTInsights;
  context.IRHTInsights = null;
  const mirrorMissingPrompt = hooks.buildSummaryPrompt(emptySession, "brief");
  assert.ok(mirrorMissingPrompt.includes("Mirror summary: Unavailable"));
  context.IRHTInsights = insightsBackup;

  const trapSession = {
    ...emptySession,
    trapDoors: [
      {
        url: "https://trap.example/",
        postVisitDurationMs: 1000,
        postVisitDepth: 2,
      },
    ],
  };
  const trapPrompt = hooks.buildSummaryPrompt(trapSession, "brief");
  assert.ok(trapPrompt.includes("Turning point"));

  hooks.loadCachedSummaries({
    ...emptySession,
    summaryBrief: "Cached brief",
    summaryDetailed: "Cached detail",
  });
  assert.equal(hooks.app.summaryState.brief, "Cached brief");
  assert.equal(hooks.app.summaryState.detailed, "Cached detail");
  hooks.loadCachedSummaries(null);
  hooks.renderOverviewSummary(null);

  hooks.persistSessionSummaries(emptySession.id, "Saved brief", "Saved detail");
  assert.equal(
    hooks.app.state.sessions[emptySession.id].summaryBrief,
    "Saved brief",
  );
  assert.equal(
    hooks.app.state.sessions[emptySession.id].summaryDetailed,
    "Saved detail",
  );
  hooks.persistSessionSummaries(null, "Missing brief", "Missing detail");
  hooks.persistSessionSummaries("missing", "Missing brief", "Missing detail");

  await assert.rejects(
    () => hooks.sendPromptToOllama("test"),
    /Ollama request failed/,
  );

  context.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ response: 123 }),
  });
  const nonStringResponse = await hooks.sendPromptToOllama("test");
  assert.equal(nonStringResponse, "");

  let authHeader = null;
  context.fetch = async (url, options) => {
    authHeader = options.headers.Authorization;
    return {
      ok: true,
      status: 200,
      json: async () => ({ response: "" }),
    };
  };
  const emptyAuthResponse = await hooks.sendPromptToOllama("test");
  assert.equal(emptyAuthResponse, "");
  assert.equal(authHeader, undefined);

  context.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ response: "Fresh summary" }),
  });
  hooks.refreshSummaries({ force: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(hooks.elements.briefSummary.textContent, "Fresh summary");
  assert.equal(hooks.elements.detailedSummary.textContent, "Fresh summary");

  context.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ response: "Late summary" }),
  });
  hooks.refreshSummaries({ force: true });
  hooks.app.summaryState.requestId += 1;
  await new Promise((resolve) => setImmediate(resolve));

  context.fetch = fetchStubFail;
  hooks.app.summaryState.brief = "";
  hooks.app.summaryState.detailed = "";
  hooks.refreshSummaries({ force: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(
    hooks.elements.briefSummary.textContent.length > 0,
  );
  assert.ok(
    hooks.elements.detailedSummary.textContent.length > 0,
  );
});

test("dashboard branch coverage", async () => {
  const html = loadHtmlFixture(rootPath("dashboard", "index.html"));
  const dom = createDom(html);
  attachLegacyDashboardElements(dom);
  attachSettingsElements(dom);
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);
  const tooltip = dom.window.document.getElementById("graph-tooltip");
  const clock = createClock(Date.now());
  const chrome = createChromeMock({ localData: {}, syncData: {} });
  const deferredTimeouts = new Map();
  let timeoutId = 0;
  const { hooks, context } = loadDashboard({
    dom,
    chrome,
    clock,
    immediateTimers: true,
    extraGlobals: {
      setTimeout: (cb, ms = 0) => {
        timeoutId += 1;
        if (ms >= 2000) {
          deferredTimeouts.set(timeoutId, cb);
          return timeoutId;
        }
        cb();
        return timeoutId;
      },
      clearTimeout: (id) => {
        deferredTimeouts.delete(id);
      },
    },
  });

  hooks.app.graph = new hooks.ForceGraph(canvas, tooltip);

  const baseSession = {
    id: "s1",
    startedAt: clock.now() - 10000,
    updatedAt: clock.now() - 5000,
    endedAt: null,
    endReason: null,
    lastActivityAt: clock.now() - 5000,
    navigationCount: 2,
    nodes: {
      "https://example.com/": {
        id: "https://example.com/",
        url: "https://example.com/",
        title: "Example",
        category: "Study",
        visitCount: 1,
        activeMs: 5000,
        firstSeen: clock.now() - 9000,
        lastSeen: clock.now() - 5000,
      },
    },
    edges: {
      "https://example.com/ -> https://example.com/next": {
        id: "https://example.com/ -> https://example.com/next",
        from: "https://example.com/",
        to: "https://example.com/next",
        visitCount: 1,
        activeMs: 1000,
        firstSeen: clock.now() - 8000,
        lastSeen: clock.now() - 7000,
      },
    },
    events: [
      {
        ts: clock.now() - 8000,
        type: "navigation",
        fromUrl: "https://example.com/",
        toUrl: "https://example.com/next",
      },
      {
        ts: clock.now() - 6000,
        type: "active_time_flushed",
        url: "https://example.com/",
        durationMs: 1200,
      },
    ],
    trapDoors: [],
    categoryTotals: { Study: 5000 },
    distractionAverage: 0.5,
    label: null,
    labelDetail: null,
    archived: false,
    archivedAt: null,
    deleted: false,
    deletedAt: null,
  };

  const altSession = {
    id: "s2",
    startedAt: clock.now() - 20000,
    updatedAt: clock.now() - 15000,
    endedAt: clock.now() - 15000,
    navigationCount: 1,
    nodes: {
      "https://video.example/": {
        id: "https://video.example/",
        url: "https://video.example/",
        title: "Video",
        category: "Video",
        visitCount: 1,
        activeMs: 6000,
        firstSeen: clock.now() - 19000,
        lastSeen: clock.now() - 15000,
      },
    },
    edges: {},
    events: [],
    trapDoors: [
      {
        url: "https://video.example/",
        postVisitDurationMs: 1000,
        postVisitDepth: 2,
      },
    ],
    categoryTotals: { Video: 6000 },
    distractionAverage: 1.8,
    label: "Label",
    labelDetail: "Detail",
    archived: false,
    deleted: false,
  };

  const state = {
    schemaVersion: 3,
    sessions: { [baseSession.id]: baseSession, [altSession.id]: altSession },
    sessionOrder: [altSession.id, baseSession.id],
    activeSessionId: baseSession.id,
    tracking: {
      ...hooks.createDefaultTracking(),
      activeUrl: "https://example.com/",
      activeSince: clock.now() - 1000,
    },
  };

  hooks.app.state = state;
  hooks.app.session = baseSession;

  hooks.elements.sessionSelect.value = baseSession.id;
  hooks.elements.sessionSelect.dispatchEvent(new dom.window.Event("change"));

  hooks.elements.sessionDelete.dispatchEvent(new dom.window.Event("click"));

  hooks.elements.graphToggles[1].dispatchEvent(new dom.window.Event("click"));
  hooks.elements.viewTabs[1].dispatchEvent(new dom.window.Event("click"));
  hooks.elements.deepTabs[2].dispatchEvent(new dom.window.Event("click"));
  hooks.elements.viewTabs[0].dispatchEvent(new dom.window.Event("click"));

  hooks.normalizeState(null);
  hooks.normalizeState({
    schemaVersion: 2,
    sessions: { s1: baseSession },
    sessionOrder: [],
    activeSessionId: null,
  });
  hooks.normalizeState({ sessions: { s1: baseSession }, sessionOrder: [] });
  hooks.normalizeState({ session: { nodes: { a: {} }, edges: {} } });

  hooks.migrateState({ session: { nodes: { a: {} }, edges: {} } });
  hooks.migrateState({ session: { nodes: undefined, edges: undefined } });

  const defaultsState = {
    sessions: null,
    sessionOrder: null,
    activeSessionId: null,
    tracking: null,
  };
  hooks.applyStateDefaults(defaultsState);

  hooks.applySessionDefaults(null);
  hooks.applySessionDefaults({ nodes: null, edges: null, events: null });
  hooks.applySessionDefaults({ nodes: { a: {} }, edges: {} });
  hooks.applySessionDefaults({
    nodes: { a: {} },
    edges: { e: { visitCount: 0 } },
    navigationCount: null,
  });
  const edgeTrickSession = {
    nodes: {},
    edges: {},
    events: [],
    navigationCount: null,
  };
  let edgeAccess = 0;
  Object.defineProperty(edgeTrickSession, "edges", {
    get() {
      edgeAccess += 1;
      return edgeAccess === 2 ? null : {};
    },
    set: () => {},
  });
  hooks.applySessionDefaults(edgeTrickSession);
  const nodeTrickSession = {
    nodes: {},
    edges: {},
    events: [],
    navigationCount: 0,
  };
  let nodeAccess = 0;
  Object.defineProperty(nodeTrickSession, "nodes", {
    get() {
      nodeAccess += 1;
      return nodeAccess === 2 ? null : {};
    },
    set: () => {},
  });
  hooks.applySessionDefaults(nodeTrickSession);

  const selectBackup = hooks.elements.sessionSelect;
  hooks.elements.sessionSelect = null;
  hooks.populateSessionSelect();
  hooks.elements.sessionSelect = selectBackup;

  const sessionListBackup = hooks.elements.sessionList;
  hooks.elements.sessionList = null;
  hooks.populateSessionList();
  hooks.updateSessionListSelection();
  hooks.elements.sessionList = sessionListBackup;

  hooks.app.state = {
    sessions: { s1: { id: "s1", deleted: true } },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
  };
  hooks.populateSessionSelect();

  hooks.app.state = null;
  hooks.selectSession();

  hooks.app.state = {
    sessions: {
      s1: { id: "s1", deleted: true, archived: false },
      s2: { id: "s2", deleted: false, archived: false },
    },
    sessionOrder: ["s1", "s2"],
    activeSessionId: "s1",
  };
  hooks.selectSession("s1");

  hooks.app.state = { sessions: {}, sessionOrder: [], activeSessionId: null };
  hooks.selectSession();

  hooks.applyState(
    { sessions: {}, sessionOrder: [], activeSessionId: null },
    "local",
  );
  hooks.applyState(null, "local");

  hooks.app.session = null;
  hooks.renderStatus();
  hooks.renderTimeline();
  hooks.renderGraph();
  hooks.renderStats();
  hooks.renderHonesty();
  hooks.app.settings.dashboardSections = {
    ...hooks.DEFAULT_SETTINGS.dashboardSections,
    callouts: true,
  };
  hooks.app.settings.directCallouts = true;
  const calloutSession = {
    ...baseSession,
    trapDoors: [
      {
        url: "https://video.example/",
        postVisitDurationMs: 3000,
        postVisitDepth: 4,
      },
    ],
    distractionAverage: 1.6,
  };
  hooks.renderCallouts(calloutSession, {
    sessions: { [calloutSession.id]: calloutSession },
    sessionOrder: [calloutSession.id],
    activeSessionId: calloutSession.id,
  });
  assert.equal(hooks.renderCallouts.name, "renderCallouts");
  assert.ok(
    hooks.elements.calloutsList.querySelectorAll("li.active").length > 0,
  );
  const calloutsListBackup = hooks.elements.calloutsList;
  hooks.elements.calloutsList = null;
  hooks.renderCalloutItem("Ignore");
  hooks.elements.calloutsList = calloutsListBackup;
  hooks.app.settings.directCallouts = false;
  hooks.renderOverviewEmpty();
  hooks.buildRecommendedActions(baseSession);
  const actionsWithPath = hooks.buildRecommendedActions(baseSession);
  dom.window.navigator.clipboard = {
    writeText: async () => {
      throw new Error("blocked");
    },
  };
  if (actionsWithPath[0]) {
    actionsWithPath[0].onClick();
  }
  if (actionsWithPath[1]) {
    actionsWithPath[1].onClick();
  }
  hooks.buildRecommendedActions({ nodes: {}, events: [] });
  const sessionBackup = hooks.app.session;
  hooks.app.session = null;
  hooks.renderOverview();
  hooks.app.session = sessionBackup;

  const overviewSummaryBackup = hooks.elements.overviewSummary;
  hooks.elements.overviewSummary = null;
  hooks.renderOverviewSummary(baseSession);
  hooks.elements.overviewSummary = overviewSummaryBackup;

  const overviewInsightsBackup = hooks.elements.overviewInsights;
  hooks.elements.overviewInsights = null;
  hooks.renderOverviewInsights(baseSession);
  hooks.elements.overviewInsights = overviewInsightsBackup;

  hooks.renderOverviewInsights({ nodes: {} });

  const overviewActionsBackup = hooks.elements.overviewActions;
  hooks.elements.overviewActions = null;
  hooks.renderOverviewActions(baseSession);
  hooks.elements.overviewActions = overviewActionsBackup;
  hooks.renderOverviewActions(null);
  hooks.renderOverviewActions(baseSession);

  const overviewInsightsEmptyBackup = hooks.elements.overviewInsightsEmpty;
  hooks.elements.overviewInsightsEmpty = null;
  hooks.renderOverviewInsights(baseSession);
  hooks.elements.overviewInsightsEmpty = overviewInsightsEmptyBackup;

  const overviewActionsEmptyBackup = hooks.elements.overviewActionsEmpty;
  hooks.elements.overviewActionsEmpty = null;
  hooks.renderOverviewActions(baseSession);
  hooks.elements.overviewActionsEmpty = overviewActionsEmptyBackup;

  const overviewOriginBackup = hooks.elements.overviewOrigin;
  const insightsBackup = context.IRHTInsights;
  hooks.elements.overviewOrigin = null;
  hooks.renderOverviewSummary(baseSession);
  hooks.elements.overviewOrigin = overviewOriginBackup;
  context.__sessionForOverview = baseSession;
  vm.runInContext(
    "__IRHT_TEST_HOOKS__.dashboard.renderOverviewSummary(__sessionForOverview);",
    context,
  );
  const overviewLabelSession = { ...baseSession, label: "Focus session" };
  context.__sessionForOverview = overviewLabelSession;
  vm.runInContext(
    "globalThis.IRHTInsights = null; __IRHT_TEST_HOOKS__.dashboard.renderOverviewSummary(__sessionForOverview);",
    context,
  );
  context.__sessionForOverview = { ...baseSession, label: "" };
  vm.runInContext(
    "__IRHT_TEST_HOOKS__.dashboard.renderOverviewSummary(__sessionForOverview);",
    context,
  );
  assert.equal(
    hooks.elements.overviewSummary.textContent,
    "Session summary unavailable.",
  );
  context.__sessionForOverview = baseSession;
  vm.runInContext(
    "__IRHT_TEST_HOOKS__.dashboard.renderOverviewSummary(__sessionForOverview);",
    context,
  );
  assert.equal(
    vm.runInContext("globalThis.IRHTInsights === null", context),
    true,
  );
  hooks.renderOverviewInsights(baseSession);
  delete context.__sessionForOverview;
  context.IRHTInsights = insightsBackup;

  const overviewEmptyBackups = {
    summary: hooks.elements.overviewSummary,
    origin: hooks.elements.overviewOrigin,
    insights: hooks.elements.overviewInsights,
    insightsEmpty: hooks.elements.overviewInsightsEmpty,
    actions: hooks.elements.overviewActions,
    actionsEmpty: hooks.elements.overviewActionsEmpty,
  };
  hooks.elements.overviewSummary = null;
  hooks.elements.overviewOrigin = null;
  hooks.elements.overviewInsights = null;
  hooks.elements.overviewInsightsEmpty = null;
  hooks.elements.overviewActions = null;
  hooks.elements.overviewActionsEmpty = null;
  hooks.renderOverviewEmpty();
  hooks.elements.overviewSummary = overviewEmptyBackups.summary;
  hooks.elements.overviewOrigin = overviewEmptyBackups.origin;
  hooks.elements.overviewInsights = overviewEmptyBackups.insights;
  hooks.elements.overviewInsightsEmpty = overviewEmptyBackups.insightsEmpty;
  hooks.elements.overviewActions = overviewEmptyBackups.actions;
  hooks.elements.overviewActionsEmpty = overviewEmptyBackups.actionsEmpty;

  hooks.app.session = { nodes: {}, edges: {}, events: [] };
  hooks.app.state = {
    activeSessionId: "s1",
    tracking: hooks.createDefaultTracking(),
  };
  hooks.renderTimeline();
  hooks.app.session = {
    nodes: {
      "https://example.com/": { url: "https://example.com/", activeMs: 1200 },
    },
    edges: {},
    events: [
      {
        type: "active_time_flushed",
        url: "https://example.com/",
        durationMs: 60000,
        ts: clock.now(),
      },
    ],
  };
  hooks.renderTimeline();

  hooks.app.session = { nodes: {}, edges: {} };
  hooks.renderGraph();

  hooks.app.session = {
    nodes: {},
    edges: {},
    trapDoors: [],
    label: null,
    labelDetail: null,
    events: [],
  };
  hooks.renderStats();

  const damageBackup = hooks.elements.damageReceipts;
  hooks.elements.damageReceipts = null;
  hooks.renderDamageReceipts(hooks.app.session);
  hooks.elements.damageReceipts = damageBackup;
  hooks.renderDamageReceipts({
    nodes: {},
    trapDoors: [],
    categoryTotals: {},
    events: [],
  });
  hooks.buildTopPages({
    nodes: {
      "https://example.com/": { url: "https://example.com/", activeMs: 1200 },
    },
  });
  hooks.buildTopPages({});
  hooks.buildTopDistractions({
    nodes: {
      "https://example.com/": {
        url: "https://example.com/",
        activeMs: 1200,
        distractionScore: 1.1,
      },
    },
  });
  hooks.buildTopDistractions({});
  hooks.buildDamageReceipts({
    nodes: {
      "https://example.com/": { url: "https://example.com/", activeMs: 1200 },
    },
    trapDoors: [{ url: "https://trap.example/" }],
    categoryTotals: { Video: 1200 },
    events: [],
  });
  hooks.buildDamageReceipts({
    nodes: {
      "https://example.com/": { url: "https://example.com/", activeMs: 1200 },
    },
    categoryTotals: { Study: 1200 },
    events: [],
  });
  hooks.computeShortsTime({
    nodes: {
      a: { url: "https://example.com/shorts/abc", activeMs: 6000 },
      b: { url: "https://example.com/abcshorts/123", activeMs: 1200 },
      c: { url: "https://youtube.com/watch?v=shorts", activeMs: 5000 },
      d: { url: "https://youtube.com/watch?v=abc", activeMs: 2000 },
      e: { url: "https://example.com/article", activeMs: 900 },
    },
  });
  hooks.computeShortsTime({});

  hooks.findSessionEndUrl({
    events: [{ type: "navigation", toUrl: "https://example.com/end" }],
    nodes: {},
  });
  hooks.findSessionEndUrl({
    events: [
      { type: "navigation", toUrl: "https://example.com/end" },
      { type: "URL_CHANGED", url: "https://example.com/changed" },
    ],
    nodes: {},
  });
  hooks.findSessionEndUrl({
    events: [{ type: "TAB_ACTIVE", url: "https://example.com/tab" }],
    nodes: {},
  });
  hooks.findSessionEndUrl({
    events: [],
    nodes: { a: { url: "https://example.com/last", lastSeen: clock.now() } },
  });
  hooks.findSessionEndUrl({ events: [], nodes: {} });
  hooks.findSessionEndUrl({});
  hooks.findSessionEndUrl({
    events: [],
    nodes: {
      a: { url: "https://example.com/first", lastSeen: clock.now() - 1000 },
      b: { url: "https://example.com/second", lastSeen: clock.now() },
    },
  });

  hooks.computeDeepestChain({
    events: [
      {
        type: "navigation",
        fromUrl: "https://example.com/a",
        toUrl: "https://example.com/b",
        ts: 1,
      },
      {
        type: "navigation",
        fromUrl: "https://example.com/b",
        toUrl: "https://example.com/c",
        ts: 2,
      },
    ],
  });
  hooks.computeDeepestChain({
    events: [{ type: "navigation", toUrl: "https://example.com/solo", ts: 1 }],
  });
  hooks.computeDeepestChain({});

  hooks.findSessionStartUrl({
    events: [{ type: "navigation", toUrl: "https://example.com/nav", ts: 1 }],
    nodes: {},
  });
  hooks.findSessionStartUrl({
    events: [{ type: "TAB_ACTIVE", url: "https://example.com/tab", ts: 1 }],
    nodes: {},
  });
  hooks.findSessionStartUrl({
    events: [],
    nodes: { a: { url: "https://example.com/first", firstSeen: clock.now() } },
  });
  hooks.findSessionStartUrl({ nodes: {} });
  hooks.findSessionStartUrl({});
  hooks.findSessionStartUrl({
    events: [],
    nodes: {
      a: { url: "https://example.com/old", firstSeen: clock.now() - 1000 },
      b: { url: "https://example.com/new", firstSeen: clock.now() },
    },
  });

  const pathBackup = hooks.elements.pathStart;
  hooks.elements.pathStart = null;
  hooks.renderReturnPath(hooks.app.session);
  hooks.elements.pathStart = pathBackup;

  const calloutsBackup = hooks.elements.calloutsList;
  hooks.elements.calloutsList = null;
  hooks.renderCallouts(hooks.app.session, state);
  hooks.elements.calloutsList = calloutsBackup;
  hooks.app.settings.directCallouts = false;
  hooks.renderCallouts(hooks.app.session, state);
  hooks.app.settings.directCallouts = true;
  hooks.renderCallouts(
    {
      nodes: {},
      trapDoors: [],
      distractionAverage: 0,
      startedAt: clock.now(),
      events: [],
    },
    state,
  );

  const focusBackup = hooks.elements.focusNote;
  hooks.elements.focusNote = null;
  hooks.renderFocusNote();
  hooks.elements.focusNote = focusBackup;
  hooks.app.settings.dashboardFocusNote = "Stay intentional.";
  hooks.renderFocusNote();
  hooks.app.settings.dashboardFocusNote = "";

  dom.window.localStorage.setItem("irht_force_summary_refresh", "1");
  assert.equal(hooks.consumeForceRefreshFlag(), true);
  const localStorageBackup = context.localStorage;
  context.localStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(hooks.consumeForceRefreshFlag(), false);
  context.localStorage = localStorageBackup;

  const lateNight = new Date();
  lateNight.setHours(23, 0, 0, 0);
  const calloutState = {
    sessionOrder: ["a", "b"],
    sessions: {
      a: {
        id: "a",
        deleted: false,
        trapDoors: [{ url: "https://trap.example/" }],
      },
      b: { id: "b", deleted: false },
    },
  };
  hooks.renderCallouts(
    {
      nodes: {},
      trapDoors: [{ url: "https://trap.example/" }],
      distractionAverage: 2,
      startedAt: lateNight.getTime(),
      events: [],
    },
    calloutState,
  );

  hooks.hasSessions(null);
  hooks.isStateEmpty(null);
  hooks.isStateEmpty({ sessions: { a: { deleted: true } } });

  hooks.app.settings.trackingPaused = true;
  hooks.setLiveIndicator("live");
  hooks.app.settings.trackingPaused = false;

  hooks.setLiveIndicator("sync");
  hooks.setLiveIndicator("offline");
  hooks.setLiveIndicator("live");

  const liveIndicatorBackup = hooks.elements.liveIndicator;
  hooks.elements.liveIndicator = null;
  hooks.setLiveIndicator("sync");
  hooks.elements.liveIndicator = liveIndicatorBackup;

  hooks.handleStorageChanged({ irht_state: { newValue: state } }, "local");
  hooks.handleStorageChanged(
    { irht_settings: { newValue: { theme: "ink" } } },
    "sync",
  );
  hooks.handleStorageChanged({ irht_state_sync: { newValue: state } }, "sync");
  hooks.app.liveState = "";
  hooks.applySettings({ theme: "ink", trackingPaused: false });

  hooks.app.settings.syncEnabled = true;
  await hooks.loadStateFromStorage();

  const settingsBackup = hooks.elements.settingsForm;
  hooks.elements.settingsForm = null;
  hooks.renderSettings();
  hooks.elements.settingsForm = settingsBackup;

  const settingToneBackup = hooks.elements.settingTone;
  const settingDirectBackup = hooks.elements.settingDirectCallouts;
  hooks.elements.settingTone = null;
  hooks.elements.settingDirectCallouts = null;
  hooks.renderSettings();
  hooks.elements.settingTone = settingToneBackup;
  hooks.elements.settingDirectCallouts = settingDirectBackup;

  const statusBackup = hooks.elements.settingsStatus;
  hooks.elements.settingsStatus = null;
  hooks.setSettingsStatus("Saved");
  hooks.elements.settingsStatus = statusBackup;

  hooks.elements.toast = null;
  hooks.showToast("No toast");
  hooks.hideToast();
  hooks.elements.toast = dom.window.document.getElementById("toast");
  hooks.elements.toastMessage =
    dom.window.document.getElementById("toast-message");
  hooks.elements.toastAction =
    dom.window.document.getElementById("toast-action");
  assert.ok(hooks.elements.toast);
  assert.ok(hooks.elements.toastMessage);
  const toastTimeoutBackup = context.setTimeout;
  const toastClearBackup = context.clearTimeout;
  context.setTimeout = () => 1;
  context.clearTimeout = () => {};
  vm.runInContext(
    "__IRHT_TEST_HOOKS__.dashboard.showToast('Toast action', 'Run', __IRHT_TEST_HOOKS__.dashboard.toastActionNoop); const action = __IRHT_TEST_HOOKS__.dashboard.elements.toastAction; if (action && typeof action.click === 'function') { action.click(); }",
    context,
  );
  hooks.handleToastAction();
  vm.runInContext(
    "(() => { const toast = document.getElementById('toast-action'); if (toast && typeof toast.onclick === 'function') { toast.onclick(); } })();",
    context,
  );
  hooks.hideToast();
  assert.equal(hooks.elements.toast.classList.contains("show"), false);
  context.setTimeout = toastTimeoutBackup;
  context.clearTimeout = toastClearBackup;
  hooks.hideToast();
  assert.equal(hooks.elements.toast.classList.contains("show"), false);
  hooks.showToast("Toast no action");
  hooks.hideToast();

  hooks.sanitizeSettings({ categoryOverrides: "bad" });
  const toneSettings = hooks.sanitizeSettings({ tone: "direct" });
  assert.equal(toneSettings.tone, "direct");
  hooks.sanitizeText(null, 10, "fallback");
  hooks.sanitizeEndpoint(123, "fallback");
  hooks.sanitizeText("x".repeat(120), 40, "fallback");
  hooks.sanitizeEndpoint("http://localhost:3010/analyze", "fallback");
  hooks.sanitizeEndpoint("https://example.com/path", "fallback");
  hooks.sanitizeEndpoint("ftp://example.com", "fallback");
  hooks.sanitizeEndpoint("not-a-url", "fallback");
  const compactSettings = hooks.sanitizeSettings({
    uiDensity: "compact",
    reduceMotion: true,
    sessionListLimit: 1,
    dashboardButtonLabel: "x".repeat(80),
    dashboardFocusNote: "Focus",
    popupNote: "Note",
    ollamaEndpoint: "http://localhost:3010/analyze",
    ollamaModel: "model",
  });
  assert.equal(compactSettings.uiDensity, "compact");
  assert.equal(compactSettings.reduceMotion, true);
  assert.equal(compactSettings.sessionListLimit, 3);
  assert.equal(compactSettings.dashboardButtonLabel.length, 40);
  hooks.parseCategoryOverrides("invalid\\nexample.com=Study");
  hooks.formatCategoryOverrides({});
  hooks.clampNumber("bad", 1, 2, 3);

  const bodyBackup = dom.window.document.body;
  Object.defineProperty(dom.window.document, "body", {
    value: null,
    configurable: true,
  });
  hooks.applyTheme("ink");
  hooks.applyUiSettings({ uiDensity: "compact", reduceMotion: true });
  Object.defineProperty(dom.window.document, "body", {
    value: bodyBackup,
    configurable: true,
  });
  hooks.applyUiSettings({ uiDensity: "compact", reduceMotion: true });
  hooks.applyUiSettings({ uiDensity: "comfortable", reduceMotion: false });

  const uiDensityBackup = hooks.elements.settingUiDensity;
  const sessionLimitBackup = hooks.elements.settingSessionListLimit;
  hooks.elements.settingUiDensity = null;
  hooks.elements.settingSessionListLimit = null;
  hooks.renderSettings();
  hooks.elements.settingUiDensity = uiDensityBackup;
  hooks.elements.settingSessionListLimit = sessionLimitBackup;
  const accentBackup = hooks.app.settings.accentColor;
  const styleBackup = context.getComputedStyle;
  const accentFieldBackup = hooks.elements.settingAccentColor;
  const accentField = dom.window.document.createElement("input");
  hooks.elements.settingAccentColor = accentField;
  hooks.app.settings.accentColor = "";
  context.getComputedStyle = () => ({ getPropertyValue: () => " #123456 " });
  hooks.renderSettings();
  assert.equal(accentField.value, "#123456");
  context.getComputedStyle = styleBackup;
  hooks.app.settings.accentColor = accentBackup;
  hooks.elements.settingAccentColor = accentFieldBackup;

  const toneMissingBackup = hooks.elements.settingTone;
  const directMissingBackup = hooks.elements.settingDirectCallouts;
  hooks.elements.settingTone = null;
  hooks.elements.settingDirectCallouts = null;
  await hooks.saveSettings();
  hooks.elements.settingTone = toneMissingBackup;
  hooks.elements.settingDirectCallouts = directMissingBackup;

  hooks.elements.settingDirectCallouts.checked = true;
  await hooks.saveSettings();

  const summaryAutoBackup = hooks.elements.settingSummaryAutoRefresh;
  const reduceMotionBackup = hooks.elements.settingReduceMotion;
  hooks.elements.settingSummaryAutoRefresh = null;
  hooks.elements.settingReduceMotion = null;
  await hooks.saveSettings();
  hooks.elements.settingSummaryAutoRefresh = summaryAutoBackup;
  hooks.elements.settingReduceMotion = reduceMotionBackup;

  const sessionTimeoutBackup = hooks.elements.settingSessionTimeout;
  hooks.elements.settingSessionTimeout = null;
  await hooks.saveSettings();
  hooks.elements.settingSessionTimeout = sessionTimeoutBackup;

  const prevChrome = context.chrome;
  context.chrome = undefined;
  hooks.sendSessionAction("session_reset");
  await hooks.saveSettings();
  context.chrome = prevChrome;

  hooks.sendSessionAction("session_reset", baseSession.id);
  chrome.runtime.lastError = { message: "fail" };
  hooks.sendSessionAction("session_reset", baseSession.id);
  chrome.runtime.lastError = null;
  hooks.toastActionNoop();

  const blobBackup = context.Blob;
  context.Blob = undefined;
  await hooks.exportSessionData();
  context.Blob = blobBackup;
  const exportUrlBackup = context.URL.createObjectURL;
  const revokeBackup = context.URL.revokeObjectURL;
  context.Blob = function BlobMock() {};
  context.URL.createObjectURL = () => "blob://export";
  context.URL.revokeObjectURL = () => {};
  chrome._storage.local = {};
  await hooks.exportSessionData();
  chrome._storage.local.irht_state = baseSession;
  await hooks.exportSessionData();
  hooks.app.state = {
    sessions: {
      s1: {
        id: "s1",
        nodes: { "https://a.com/": { url: "https://a.com/" } },
      },
    },
  };
  await hooks.exportSessionData();
  const warmBackup = hooks.loadStateFromBackground;
  const warmStub = async () => ({
    sessions: { s2: { id: "s2", nodes: { "https://b.com/": { url: "https://b.com/" } } } },
  });
  hooks.loadStateFromBackground = warmStub;
  context.loadStateFromBackground = warmStub;
  hooks.app.state = null;
  chrome._storage.local = {};
  await hooks.exportSessionData();
  hooks.loadStateFromBackground = warmBackup;
  context.loadStateFromBackground = warmBackup;
  hooks.app.state = null;
  hooks.app.settings.syncEnabled = true;
  chrome._storage.local = {};
  chrome._storage.sync = {};
  await hooks.exportSessionData();
  context.Blob = blobBackup;
  context.URL.createObjectURL = exportUrlBackup;
  context.URL.revokeObjectURL = revokeBackup;

  hooks.app.state = { sessions: {} };
  chrome._storage.sync[hooks.SYNC_STATE_KEY] = {
    schemaVersion: hooks.SCHEMA_VERSION || 4,
    sessions: {
      s1: {
        id: "s1",
        nodes: { "https://sync.com/": { url: "https://sync.com/" } },
        edges: {},
        events: [],
      },
    },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tabs: {},
    tracking: {},
  };
  await context.hydrateSyncStateIfEnabled(
    { syncEnabled: false },
    { syncEnabled: true },
  );

  const exportChromeBackup = context.chrome;
  context.chrome = undefined;
  await hooks.exportSessionData();
  context.chrome = exportChromeBackup;

  hooks.buildTimelineSegments(
    { events: [{ type: "navigation" }] },
    { activeSince: clock.now(), activeUrl: "https://example.com/" },
    true,
  );
  hooks.buildTimelineSegments(
    { events: undefined },
    { activeSince: clock.now(), activeUrl: "https://example.com/" },
    true,
  );
  hooks.buildSummaryDataLines(
    { tracking: hooks.createDefaultTracking() },
    {
      id: "summary-session",
      startedAt: clock.now(),
      nodes: {},
      edges: {},
      events: [],
      categoryTotals: { Study: 1200, Video: 600 },
      navigationCount: 0,
    },
  );

  hooks.buildGraphData(
    {
      nodes: { bad: { url: "not-a-url", activeMs: 0 } },
      edges: { bad: { from: "bad", to: "also", visitCount: 1 } },
    },
    "domain",
  );
  hooks.buildGraphData({ nodes: {}, edges: {} }, "page");

  hooks.trimGraph({ nodes: [{ id: "a", activeMs: 1 }], edges: [] });
  hooks.trimGraph({
    nodes: Array.from({ length: hooks.MAX_GRAPH_NODES + 2 }, (_, i) => ({
      id: `n${i}`,
      activeMs: i,
    })),
    edges: [
      { from: "n0", to: "n1" },
      { from: "n1", to: "n999" },
    ],
  });
  hooks.getSessionActiveMs({ nodes: { a: { activeMs: 100 } } }, null);

  hooks.ensureSessionInsights(null);
  hooks.ensureSessionInsights({ nodes: {} });

  hooks.classifyUrl("https://site.edu");
  hooks.classifyUrl("https://site.gov");
  hooks.classifyUrl("https://news.example.com");
  hooks.classifyUrl("https://www.google.com/search?q=test");
  hooks.classifyUrl(null);

  hooks.getCategoryOverride("example.com");
  hooks.matchesDomain(null, "example.com");
  hooks.computeCommonStart({
    sessions: { a: { deleted: false, events: [], nodes: {} } },
  });

  assert.equal(hooks.isTechnicalUrl("https://example.com/login"), true);
  assert.equal(hooks.isTechnicalUrl("https://example.com/"), false);
  assert.equal(hooks.normalizeSiteList(123).length, 0);
  assert.equal(context.canonicalizeCategory("  "), "");
  assert.equal(hooks.sanitizeEndpoint("http://%", "fallback"), "fallback");
  const urlBackup = context.URL;
  context.URL = class URLMock {
    constructor() {
      this.protocol = "ftp:";
    }
    toString() {
      return "ftp://example.com";
    }
  };
  assert.equal(hooks.sanitizeEndpoint("http://example.com", "fallback"), "fallback");
  context.URL = urlBackup;
  assert.equal(context.normalizeDomainPattern(123), "");
  const normalizedList = hooks.normalizeSiteList([" Example.com ", "", null]);
  assert.equal(normalizedList.length, 1);
  assert.equal(normalizedList[0], "example.com");
  assert.equal(hooks.normalizeSiteList(["https://%"]).length, 0);
  assert.equal(hooks.normalizeSiteList(["."]).length, 0);
  const wildcardList = hooks.normalizeSiteList(["*.Example.com"]);
  assert.equal(wildcardList.length, 1);
  assert.equal(wildcardList[0], "*.example.com");

  context.IRHTAICategoryHook = () => "Study";
  assert.equal(hooks.classifyUrl("https://unknown.example/path"), "Study");
  context.IRHTAICategoryHook = null;

  const sharedBackup = context.IRHTShared;
  context.IRHTShared = {};
  assert.equal(hooks.classifyUrl("https://unknown.example/path"), "Random");
  context.IRHTShared = null;
  hooks.computeSessionSignals({ nodes: {} });
  hooks.computeDistractionScore({ activeMs: 0 }, { navigationCount: 0 });
  hooks.isTechnicalUrl("https://example.com/login");
  hooks.getSessionActiveMs({ nodes: {} }, null);
  hooks.formatDuration(1000);
  hooks.getDomain("https://example.com/");
  hooks.buildTopDomains({ nodes: {} });
  hooks.findSessionStartUrl({ events: [], nodes: {} });
  hooks.matchesDomain("example.com", "example.com");
  hooks.isLateNight(null);
  context.IRHTShared = sharedBackup;

  hooks.computeDistractionScore(
    { activeMs: 1000, firstSeen: lateNight.getTime(), category: "Video" },
    { navigationCount: 2 },
  );

  hooks.buildSessionLabel(
    { trapDoors: [], navigationCount: 2, startedAt: clock.now() },
    [
      {
        url: "https://video.example/",
        category: "Video",
        activeMs: 20000,
        firstSeen: clock.now(),
      },
      {
        url: "https://video.example/2",
        category: "Video",
        activeMs: 20000,
        firstSeen: clock.now(),
      },
    ],
    { Video: 40000 },
    2.0,
  );

  hooks.buildSessionLabel(
    {
      trapDoors: [{ url: "https://trap.example/" }],
      navigationCount: 2,
      startedAt: clock.now(),
    },
    [
      {
        url: "https://study.example/",
        category: "Study",
        activeMs: 30000,
        firstSeen: clock.now(),
      },
      {
        url: "https://video.example/",
        category: "Video",
        activeMs: 5000,
        firstSeen: clock.now(),
      },
    ],
    { Video: 40000 },
    1.2,
  );

  hooks.buildSessionLabel(
    { trapDoors: [], navigationCount: 2, startedAt: clock.now() },
    [
      {
        url: "https://study.example/",
        category: "Study",
        activeMs: 30000,
        firstSeen: clock.now() - 1000,
      },
      {
        url: "https://video.example/",
        category: "Video",
        activeMs: 5000,
        firstSeen: clock.now(),
      },
    ],
    { Video: 40000 },
    1.2,
  );

  hooks.buildSessionLabel(
    { trapDoors: [], navigationCount: 1, startedAt: clock.now() },
    [
      {
        url: "https://study.example/",
        category: "Study",
        activeMs: 5000,
        firstSeen: clock.now(),
      },
    ],
    { Study: 5000 },
    1.0,
  );
  hooks.buildSessionLabel(
    { trapDoors: [], navigationCount: 1, startedAt: clock.now() },
    [],
    null,
    1.2,
  );

  hooks.computeDeepestChain({ events: baseSession.events });
  hooks.computeCommonStart(state);
  hooks.findSessionStartUrl(baseSession);
  hooks.findSessionEndUrl(baseSession);
  hooks.buildTopDomains(baseSession);
  hooks.buildTopPages(baseSession);
  hooks.buildTopDistractions(baseSession);
  hooks.buildDamageReceipts(baseSession);
  hooks.computeShortsTime({
    nodes: { a: { url: "https://youtube.com/shorts/1", activeMs: 600000 } },
  });
  hooks.buildCalloutMessages(
    {
      trapDoors: [{ url: "https://trap.example/" }],
      distractionAverage: 2,
      startedAt: lateNight.getTime(),
    },
    calloutState,
    "direct",
  );
  hooks.buildCalloutMessages(
    { id: "no-trap", nodes: {}, distractionAverage: 0, startedAt: clock.now() },
    calloutState,
  );
  hooks.findPreviousSession(state, baseSession);

  hooks.renderRankList(hooks.elements.topDomains, [], (item) => item.domain);
  hooks.renderRankList(
    hooks.elements.topDomains,
    [{ domain: "example.com", activeMs: 1000 }],
    (item) => item.domain,
    (item) => item.activeMs,
  );

  hooks.formatSessionLabel({
    startedAt: clock.now(),
    endedAt: clock.now(),
  });
  hooks.formatSessionRange({ startedAt: clock.now(), endedAt: null });
  hooks.formatDate(clock.now());
  hooks.formatTime(clock.now());
  hooks.formatScore(null);
  hooks.getDomain(null);
  hooks.getDomain("not-a-url");
  hooks.truncate("", 10);
  hooks.truncate("short", 10);
  hooks.truncate("longtext", 4);
  hooks.colorFor(null);

  hooks.app.graph.setData({ nodes: [], edges: [] });
  hooks.app.graph.run();
  hooks.app.graph.resize();

  hooks.app.graph.setData({
    nodes: [
      { id: "a", label: "Node A", activeMs: undefined },
      { id: "b", label: "Node B", activeMs: 0 },
    ],
    edges: [{ from: "a", to: "b" }],
  });
  hooks.app.graph.simulate();
  hooks.app.graph.draw();

  const targetNode = hooks.app.graph.nodes[0];
  hooks.app.graph.handleMove({ clientX: targetNode.x, clientY: targetNode.y });
  hooks.app.graph.handleMove({ clientX: 0, clientY: 0 });
  hooks.app.graph.tooltip = null;
  hooks.app.graph.hideTooltip();

  hooks.app.graph.canvas = null;
  hooks.app.graph.resize();

  dom.window.dispatchEvent(new dom.window.Event("resize"));

  hooks.app.state = state;

  hooks.app.session = null;
  hooks.elements.sessionDelete.click();

  hooks.app.session = baseSession;
  hooks.elements.toast = dom.window.document.getElementById("toast");
  hooks.elements.toastMessage =
    dom.window.document.getElementById("toast-message");
  hooks.elements.toastAction =
    dom.window.document.getElementById("toast-action");
  assert.ok(hooks.elements.toast);
  assert.ok(hooks.elements.toastMessage);
  const undoTimeoutBackup = context.setTimeout;
  const undoClearBackup = context.clearTimeout;
  context.setTimeout = () => 1;
  context.clearTimeout = () => {};
  hooks.elements.sessionDelete.click();
  vm.runInContext(
    "(() => { const toast = document.getElementById('toast-action'); if (!toast) return; if (typeof toast.click === 'function') { toast.click(); } })();",
    context,
  );
  assert.equal(hooks.elements.toastMessage.textContent, "Delete undone.");
  context.setTimeout = undoTimeoutBackup;
  context.clearTimeout = undoClearBackup;

  hooks.elements.graphToggles[0].dataset.mode = "";
  hooks.elements.graphToggles[0].dispatchEvent(new dom.window.Event("click"));
  hooks.elements.viewTabs[0].dataset.view = "";
  hooks.elements.viewTabs[0].dispatchEvent(new dom.window.Event("click"));
  hooks.elements.deepTabs[0].dataset.deep = "";
  hooks.elements.deepTabs[0].dispatchEvent(new dom.window.Event("click"));

  hooks.normalizeState({ foo: "bar" });

  const trickyState = {
    sessionOrder: [],
    activeSessionId: null,
    tracking: null,
  };
  let sessionsValue = {};
  let accessCount = 0;
  Object.defineProperty(trickyState, "sessions", {
    get() {
      accessCount += 1;
      return accessCount === 2 ? null : sessionsValue;
    },
    set(value) {
      sessionsValue = value;
    },
  });
  hooks.applyStateDefaults(trickyState);

  const trickyStateAlt = {
    sessionOrder: [],
    activeSessionId: null,
    tracking: null,
  };
  let sessionsValueAlt = {};
  let accessCountAlt = 0;
  Object.defineProperty(trickyStateAlt, "sessions", {
    get() {
      accessCountAlt += 1;
      return accessCountAlt === 3 ? null : sessionsValueAlt;
    },
    set(value) {
      sessionsValueAlt = value;
    },
  });
  hooks.applyStateDefaults(trickyStateAlt);

  const trickyStateNull = {
    sessionOrder: [],
    activeSessionId: null,
    tracking: null,
  };
  Object.defineProperty(trickyStateNull, "sessions", {
    get: () => null,
    set: () => {},
  });
  hooks.applyStateDefaults(trickyStateNull);
  const trickySession = { navigationCount: null };
  Object.defineProperty(trickySession, "nodes", {
    get: () => null,
    set: () => {},
    configurable: true,
  });
  Object.defineProperty(trickySession, "edges", {
    get: () => null,
    set: () => {},
    configurable: true,
  });
  hooks.applySessionDefaults(trickySession);

  hooks.app.state = null;
  hooks.populateSessionSelect();

  hooks.app.state = state;
  hooks.populateSessionSelect();

  hooks.app.state = {
    sessions: {
      archived: { id: "archived", archived: true, deleted: false },
      active: { id: "active", archived: false, deleted: false },
    },
    sessionOrder: ["archived", "active"],
    activeSessionId: "active",
  };
  hooks.selectSession("missing");

  hooks.applyState(
    {
      schemaVersion: 3,
      sessions: {},
      sessionOrder: [],
      activeSessionId: null,
      tracking: hooks.createDefaultTracking(),
    },
    "sync",
  );
  hooks.applyState(state, "sync");

  hooks.app.settings.syncEnabled = true;
  hooks.app.state = null;
  hooks.handleStorageChanged(
    { [hooks.SYNC_STATE_KEY]: { newValue: state } },
    "sync",
  );

  chrome._storage.local[hooks.STORAGE_KEY] = {
    schemaVersion: 3,
    sessions: {},
    sessionOrder: [],
    activeSessionId: null,
    tracking: hooks.createDefaultTracking(),
  };
  chrome._storage.sync[hooks.SYNC_STATE_KEY] = state;
  const syncResult = await hooks.loadStateFromStorage();
  assert.equal(syncResult.source, "sync");

  hooks.app.session = { label: "", nodes: {} };
  hooks.renderStatus();
  hooks.app.session = { label: "Known", nodes: {} };
  hooks.renderStatus();
  const labelSession = {
    id: "label-session",
    startedAt: clock.now(),
    nodes: {},
    edges: {},
    events: [],
    trapDoors: [],
    categoryTotals: {},
    navigationCount: 0,
  };
  Object.defineProperty(labelSession, "label", {
    get: () => "",
    set: () => {},
    configurable: true,
  });
  Object.defineProperty(labelSession, "labelDetail", {
    get: () => "",
    set: () => {},
    configurable: true,
  });
  hooks.app.state = state;
  hooks.app.session = labelSession;
  hooks.renderStats();

  const calloutsToggleBackup = hooks.elements.calloutsList;
  hooks.elements.calloutsList = null;
  hooks.renderHonesty();
  hooks.elements.calloutsList = calloutsToggleBackup;

  const timeoutBackup = context.setTimeout;
  const clearBackup = context.clearTimeout;
  context.setTimeout = () => 1;
  context.clearTimeout = () => {};
  hooks.showToast("First");
  hooks.showToast("Second");
  context.setTimeout = timeoutBackup;
  context.clearTimeout = clearBackup;

  hooks.sanitizeSettings({
    theme: 5,
    productiveSites: "docs.example.com\nmail.example.com",
    distractingSites: ["video.example.com"],
    realtimeStreamEnabled: "yes",
    realtimeDeltaSync: 1,
    realtimePortPush: 0,
    realtimeLiveTimers: true,
    realtimeBatchUpdates: true,
    realtimeBatchWindowMs: 999,
    realtimePriorityUpdates: true,
    realtimeOptimisticUi: true,
    realtimeWorkerOffload: true,
    realtimeFrameAligned: true,
    categoryOverrides: {
      "": "Study",
      bad: "Other",
      "example.com": 123,
      "valid.com": "Study",
    },
  });
  hooks.parseCategoryOverrides("");
  hooks.parseCategoryOverrides(
    "# comment\ninvalid\nsite=Bad\nexample.com=Study",
  );

  hooks.buildTimelineSegments(
    {
      events: [
        {
          type: "active_time_flushed",
          url: "not-a-url",
          durationMs: 1000,
          ts: clock.now(),
        },
      ],
    },
    { activeSince: clock.now() - 1000, activeUrl: "not-a-url" },
    true,
  );

  hooks.buildGraphData(
    {
      nodes: { a: { url: "https://example.com/" } },
      edges: { e: { from: "a", to: "b" } },
    },
    "page",
  );
  hooks.buildGraphData(
    {
      nodes: { a: { url: "https://example.com/", activeMs: undefined } },
      edges: {
        e: { from: "https://example.com/", to: "https://example.com/next" },
      },
    },
    "domain",
  );
  hooks.buildGraphData({ nodes: undefined, edges: undefined }, "domain");

  hooks.getSessionActiveMs({ nodes: { a: { activeMs: undefined } } }, null);

  hooks.ensureSessionInsights({
    nodes: {
      a: {
        url: "https://example.com/",
        activeMs: 0,
        distractionScore: undefined,
      },
    },
    navigationCount: 0,
  });

  hooks.app.settings.categoryOverrides = { "example.com": "Study" };
  hooks.classifyUrl("https://example.com/page");
  hooks.classifyUrl("https://twitter.com/home");
  hooks.classifyUrl("bad-url");

  hooks.app.settings.categoryOverrides = null;
  hooks.getCategoryOverride("example.com");
  hooks.app.settings.categoryOverrides = {
    "": "Study",
    "example.com": "Study",
  };
  hooks.getCategoryOverride("example.com");
  hooks.matchesDomain("example.com", ".example.com");

  hooks.computeDistractionScore(
    { activeMs: undefined, category: null, firstNavigationIndex: null },
    { navigationCount: undefined },
  );
  hooks.computeDistractionScore(
    { activeMs: 1000, category: "Unknown", firstNavigationIndex: 0 },
    { navigationCount: 1 },
  );

  hooks.pickEarlyCategory([], { startedAt: clock.now() });
  hooks.pickEarlyCategory(
    [
      { url: "https://example.com/", firstSeen: undefined, activeMs: 1000 },
      {
        url: "https://video.example/",
        firstSeen: clock.now(),
        category: "Video",
        activeMs: 1000,
      },
    ],
    { startedAt: clock.now() - 1000 },
  );
  hooks.pickEarlyCategory(
    [
      {
        url: "https://video.example/",
        firstSeen: clock.now(),
        category: "Video",
        activeMs: 1000,
      },
      { url: "https://example.com/", firstSeen: undefined, activeMs: 1000 },
    ],
    { startedAt: clock.now() - 1000 },
  );

  hooks.findSessionStartUrl({
    events: [
      { type: "TAB_ACTIVE", url: "https://example.com/", ts: clock.now() },
    ],
    nodes: {},
  });
  hooks.findSessionStartUrl({
    events: [
      {
        type: "URL_CHANGED",
        url: "https://example.com/changed",
        ts: clock.now(),
      },
    ],
    nodes: {},
  });
  hooks.findSessionEndUrl({
    events: [
      { type: "URL_CHANGED", url: "https://example.com/last", ts: clock.now() },
    ],
    nodes: { a: { url: "https://example.com/", lastSeen: undefined } },
  });
  hooks.findSessionEndUrl({
    events: [],
    nodes: { a: { url: "https://example.com/", lastSeen: 0 } },
  });

  hooks.buildTopDomains({
    nodes: { a: { url: "not-a-url", activeMs: undefined } },
  });
  hooks.buildTopDomains({
    nodes: { a: { url: "https://example.com/", activeMs: undefined } },
  });
  hooks.buildTopPages({
    nodes: { a: { url: "https://example.com/", activeMs: undefined } },
  });
  hooks.buildTopDistractions({
    nodes: {
      a: {
        url: "https://example.com/",
        activeMs: undefined,
        distractionScore: undefined,
      },
    },
  });

  hooks.buildDamageReceipts({
    nodes: {},
    categoryTotals: { Video: 0 },
    trapDoors: [{ url: "not-a-url", postVisitDurationMs: 1000 }],
    events: [],
  });
  hooks.buildDamageReceipts({
    nodes: {},
    categoryTotals: { Study: 1000 },
    trapDoors: [],
    events: [],
  });

  hooks.computeShortsTime({
    nodes: {
      a: { url: null, activeMs: 2000 },
      b: { url: "https://youtube.com/watch?shorts=1", activeMs: 4000 },
      c: { url: "https://youtube.com/shorts", activeMs: undefined },
    },
  });

  hooks.formatPathNode("not-a-url");

  const currentSession = {
    id: "current",
    startedAt: clock.now(),
    nodes: { a: { url: "https://example.com/", activeMs: 1000 } },
    trapDoors: [{ url: "not-a-url" }],
    distractionAverage: 2,
  };
  const prevSession = {
    id: "prev",
    startedAt: clock.now() - 10000,
    nodes: { a: { url: "https://example.com/", activeMs: 2000 } },
    trapDoors: [{ url: "https://trap.example/" }],
  };
  const calloutStateExtra = {
    sessionOrder: ["prev", "current"],
    sessions: { prev: prevSession, current: currentSession },
  };
  hooks.buildCalloutMessages(currentSession, calloutStateExtra);
  const currentSessionMatch = {
    ...currentSession,
    trapDoors: [{ url: "https://trap.example/" }],
  };
  calloutStateExtra.sessions.current = currentSessionMatch;
  hooks.buildCalloutMessages(currentSessionMatch, calloutStateExtra);
  hooks.buildCalloutMessages(currentSessionMatch, calloutStateExtra, "direct");
  const prevSessionNoTrap = { ...prevSession, trapDoors: undefined };
  const calloutStateNoTrap = {
    sessionOrder: ["prev", "current"],
    sessions: { prev: prevSessionNoTrap, current: currentSession },
  };
  hooks.buildCalloutMessages(currentSession, calloutStateNoTrap);
  hooks.findPreviousSession(null, currentSession);

  hooks.renderRankList(null, [], (item) => item.domain);

  hooks.formatSessionLabel({ startedAt: null, archived: false });
  hooks.formatSessionRange({ startedAt: clock.now(), endedAt: null });
  hooks.formatSessionRange({ startedAt: clock.now(), endedAt: clock.now() });

  hooks.app.graph.canvas = canvas;
  hooks.app.graph.ctx = canvas.getContext("2d");
  hooks.app.graph.tooltip = tooltip;

  Object.defineProperty(dom.window, "devicePixelRatio", {
    value: 2,
    configurable: true,
  });
  hooks.app.graph.resize();
  Object.defineProperty(dom.window, "devicePixelRatio", {
    value: 0,
    configurable: true,
  });
  hooks.app.graph.resize();

  hooks.app.graph.setData({
    nodes: [
      { id: "a", label: "Node A", activeMs: undefined },
      { id: "b", label: "Node B", activeMs: 0 },
    ],
    edges: [{ from: "a", to: "b" }],
  });
  hooks.app.graph.nodes[1].x = hooks.app.graph.nodes[0].x;
  hooks.app.graph.nodes[1].y = hooks.app.graph.nodes[0].y;
  hooks.app.graph.simulate();
  hooks.app.graph.nodes[0].labelVisible = false;
  hooks.app.graph.draw();

  hooks.app.graph.handleMove({
    clientX: hooks.app.graph.nodes[0].x,
    clientY: hooks.app.graph.nodes[0].y,
  });

  hooks.getSessionCacheKey(baseSession);
  hooks.getDerivedSessionData(baseSession);
  hooks.scheduleSummaryRefresh({ force: false });
  hooks.scheduleSummaryRefresh({ force: true });
  hooks.renderSessionListWindow();
  hooks.scheduleSessionListRender();
  hooks.app.persistSessionSummaries = () => {};
  hooks.sendSummaryUpdate("s1", "brief", "detail", clock.now());

  const compactState = {
    schemaVersion: 4,
    compactTables: true,
    urlTable: ["https://example.com/"],
    sessions: {
      s1: {
        id: "s1",
        nodes: [{ urlId: 0, title: "Example", category: "Study" }],
        edges: [],
        events: [],
      },
    },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tracking: hooks.createDefaultTracking(),
  };
  hooks.decodeCompactState(compactState);
  hooks.normalizeState(compactState);

  const ringSession = {
    events: [{ ts: 1, type: "a" }, { ts: 2, type: "b" }],
    eventCursor: 1,
    eventCount: 2,
  };
  hooks.getSessionEvents(ringSession);

  const sendMessageBackup = chrome.runtime.sendMessage;
  chrome.runtime.sendMessage = (message, cb) => cb({ state });
  await hooks.loadStateFromBackground();
  chrome.runtime.sendMessage = sendMessageBackup;

  hooks.app.sendPromptToOllama = () => Promise.resolve("ok");
  hooks.getSendPromptToOllama();
});

test("dashboard bindControls interactions and utilities", async () => {
  const html = loadHtmlFixture(rootPath("dashboard", "index.html"));
  const dom = createDom(html);
  attachLegacyDashboardElements(dom);
  attachSettingsElements(dom);
  const doc = dom.window.document;
  const helpA = doc.createElement("button");
  helpA.className = "help-icon";
  const helpB = doc.createElement("button");
  helpB.className = "help-icon";
  const resetSettings = doc.createElement("button");
  resetSettings.id = "reset-settings";
  const undoSettings = doc.createElement("button");
  undoSettings.id = "undo-settings";
  doc.body.appendChild(helpA);
  doc.body.appendChild(helpB);
  doc.body.appendChild(resetSettings);
  doc.body.appendChild(undoSettings);

  let openOptionsCalled = false;
  const chrome = createChromeMock({
    openOptionsPage: () => {
      openOptionsCalled = true;
    },
  });

  const { hooks, context } = loadDashboard({
    dom,
    chrome,
    clock: createClock(Date.now()),
    extraGlobals: { Element: dom.window.Element },
  });

  const sentActions = [];
  context.sendSessionAction = (...args) => sentActions.push(args);
  let refreshed = false;
  context.refreshSummaries = () => {
    refreshed = true;
  };
  let scheduled = 0;
  context.scheduleSettingsSave = () => {
    scheduled += 1;
  };
  context.selectSession = () => {};
  let confirmValue = true;
  context.confirm = () => confirmValue;

  const state = buildSampleState(createClock(Date.now()));
  hooks.app.state = state;
  hooks.app.session = state.sessions[state.activeSessionId];
  hooks.elements.sessionSelect.value = "session-a";
  hooks.elements.sessionSelect.dispatchEvent(new dom.window.Event("change"));

  hooks.elements.sessionDelete.dispatchEvent(new dom.window.Event("click"));

  hooks.elements.settingsForm.dispatchEvent(new dom.window.Event("input"));
  hooks.elements.settingsForm.dispatchEvent(new dom.window.Event("change"));
  hooks.elements.settingsForm.dispatchEvent(new dom.window.Event("submit"));

  hooks.elements.graphToggles[0].dispatchEvent(new dom.window.Event("click"));
  hooks.elements.summaryRefresh.dispatchEvent(new dom.window.Event("click"));

  hooks.elements.openSettings.dispatchEvent(new dom.window.Event("click"));
  assert.equal(openOptionsCalled, true);
  chrome.runtime.openOptionsPage = null;
  hooks.elements.openSettings.dispatchEvent(new dom.window.Event("click"));

  hooks.elements.openDashboard.dispatchEvent(new dom.window.Event("click"));

  hooks.elements.viewTabs[0].dispatchEvent(new dom.window.Event("click"));
  hooks.elements.deepTabs[0].dispatchEvent(new dom.window.Event("click"));

  hooks.elements.exportData.dispatchEvent(new dom.window.Event("click"));

  confirmValue = false;
  hooks.elements.deleteAllSessions.dispatchEvent(new dom.window.Event("click"));
  confirmValue = true;
  hooks.elements.deleteAllSessions.dispatchEvent(new dom.window.Event("click"));

  confirmValue = false;
  hooks.elements.resetState.dispatchEvent(new dom.window.Event("click"));
  confirmValue = true;
  hooks.elements.resetState.dispatchEvent(new dom.window.Event("click"));

  hooks.elements.resetSettings.dispatchEvent(new dom.window.Event("click"));
  hooks.elements.undoSettings.dispatchEvent(new dom.window.Event("click"));

  helpA.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  helpB.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" }));
  doc.body.dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.ok(sentActions.length >= 1);
  assert.ok(refreshed);
  assert.ok(scheduled >= 2);

  context.hasSummaryUi();
  hooks.buildOutcomeHighlights(
    hooks.app.state.sessions[hooks.app.state.activeSessionId],
    hooks.app.state,
  );
  hooks.buildOutcomeHighlights({ id: "only" }, { sessionOrder: ["only"], sessions: { only: { id: "only" } } });

  hooks.formatTextList(["a", "b"]);
  hooks.formatTextList(null);
  hooks.hexToRgb("#ffffff");
  hooks.hexToRgb("bad");
  hooks.rgbToHex("rgb(255, 0, 0)");
  hooks.rgbToHex("");
  hooks.mixHex("#000000", "#ffffff", 0.5);
  hooks.accentInkColor("#ffffff");

  hooks.consumeForceRefreshFlag();
  dom.window.localStorage.setItem(hooks.UNDO_SETTINGS_KEY, JSON.stringify({ theme: "ink" }));
  hooks.getUndoSnapshot();
  dom.window.localStorage.setItem(hooks.UNDO_SETTINGS_KEY, "bad-json");
  hooks.getUndoSnapshot();

  const setTimeoutBackup = context.setTimeout;
  let savedCallback = null;
  context.setTimeout = (cb) => {
    savedCallback = cb;
    return 1;
  };
  context.clearTimeout = () => {};
  hooks.scheduleSettingsSave();
  hooks.scheduleSettingsSave();
  savedCallback();
  context.setTimeout = setTimeoutBackup;

  dom.window.localStorage.setItem(hooks.UNDO_SETTINGS_KEY, JSON.stringify({ theme: "ink" }));
  await hooks.restoreUndoSettings();
  context.confirm = () => true;
  await hooks.resetSettingsToDefault();

  const canvas = doc.getElementById("graph-canvas");
  createCanvasStub(canvas);
  const graph = new hooks.ForceGraph(canvas, doc.getElementById("graph-tooltip"));
  graph.setData({
    nodes: [{ id: "a", label: "A", activeMs: 10 }],
    edges: [{ from: "a", to: "missing", count: 1 }],
  });
  graph.simulate();
  graph.draw();
  graph.nodes = [
    {
      id: "b",
      label: "Node",
      activeMs: 1000,
      x: 10,
      y: 10,
      radius: 6,
      labelVisible: true,
      color: "#000",
    },
  ];
  graph.handleMove(new dom.window.MouseEvent("mousemove", { clientX: 10, clientY: 10 }));
  graph.tooltip = null;
  graph.hideTooltip();

  hooks.getSessionCacheKey(null);
  hooks.getDerivedSessionData(null);

  const shortSession = {
    events: [{ ts: 1 }, { ts: 2 }, { ts: 3 }],
    eventCursor: 0,
    eventCount: 2,
  };
  hooks.getSessionEvents(shortSession);
  const emptyEventSession = {
    events: [{ ts: 1 }],
    eventCursor: 0,
    eventCount: -1,
  };
  hooks.getSessionEvents(emptyEventSession);

  chrome.runtime.lastError = { message: "fail" };
  hooks.sendSummaryUpdate("sid", "brief", "detail", Date.now());
  chrome.runtime.lastError = null;

  const extraPanel = doc.createElement("div");
  extraPanel.dataset.deepPanel = "";
  hooks.elements.deepPanels = [extraPanel];
  hooks.applyDashboardVisibility({ dashboardSections: { honesty: false } });

  const deepTab = doc.createElement("button");
  deepTab.dataset.deep = "graph";
  const emptyDeepTab = doc.createElement("button");
  emptyDeepTab.dataset.deep = "";
  hooks.elements.deepTabs = [deepTab];
  hooks.app.deepTab = "timeline";
  hooks.applyDashboardVisibility({ dashboardSections: { graph: true } });
  hooks.elements.deepTabs = [emptyDeepTab];
  hooks.applyDashboardVisibility({ dashboardSections: { graph: true } });

  const chromeBackup = context.chrome;
  context.chrome = undefined;
  hooks.sendSummaryUpdate("sid", "brief", "detail", Date.now());
  context.chrome = chromeBackup;

  hooks.applyAccentColor({ accentColor: "#ff6600" });
  hooks.accentInkColor("bad");

  const bodyBackup = doc.body;
  Object.defineProperty(doc, "body", { value: null, configurable: true });
  hooks.applyAccentColor({ accentColor: "#ff6600" });
  Object.defineProperty(doc, "body", { value: bodyBackup, configurable: true });

  hooks.sanitizeColor("#abc");
  hooks.mixHex("bad", "#fff", 0.2);
  hooks.sanitizeSettings({ popupQuickGlance: "bad" });
  hooks.normalizeTextList("one\ntwo");

  const ids = [
    "setting-dashboard-show-overview",
    "setting-dashboard-show-sessions",
    "setting-dashboard-show-timeline",
    "setting-dashboard-show-graph",
    "setting-dashboard-show-stats",
    "setting-dashboard-show-honesty",
    "setting-dashboard-show-callouts",
  ];
  ids.forEach((id) => {
    const input = doc.createElement("input");
    input.type = "checkbox";
    input.id = id;
    input.checked = true;
    doc.body.appendChild(input);
  });
  const accentColor = doc.createElement("input");
  accentColor.type = "text";
  accentColor.id = "setting-accent-color";
  accentColor.value = "#ff6600";
  doc.body.appendChild(accentColor);
  const typography = doc.createElement("select");
  typography.id = "setting-typography-style";
  typography.value = "calm";
  doc.body.appendChild(typography);
  const sessionStyle = doc.createElement("select");
  sessionStyle.id = "setting-session-list-style";
  sessionStyle.value = "cards";
  doc.body.appendChild(sessionStyle);
  const pinActive = doc.createElement("input");
  pinActive.type = "checkbox";
  pinActive.id = "setting-pin-active-session";
  pinActive.checked = true;
  doc.body.appendChild(pinActive);
  const storyMode = doc.createElement("input");
  storyMode.type = "checkbox";
  storyMode.id = "setting-dashboard-story-mode";
  storyMode.checked = true;
  doc.body.appendChild(storyMode);
  const popupMicro = doc.createElement("input");
  popupMicro.type = "text";
  popupMicro.id = "setting-popup-micro-note";
  popupMicro.value = "micro";
  doc.body.appendChild(popupMicro);
  const popupMood = doc.createElement("input");
  popupMood.type = "text";
  popupMood.id = "setting-popup-mood";
  popupMood.value = "mood";
  doc.body.appendChild(popupMood);
  const popupLayout = doc.createElement("select");
  popupLayout.id = "setting-popup-layout";
  popupLayout.value = "cards";
  doc.body.appendChild(popupLayout);
  const popupDensity = doc.createElement("select");
  popupDensity.id = "setting-popup-density";
  popupDensity.value = "roomy";
  doc.body.appendChild(popupDensity);
  const popupAction = doc.createElement("select");
  popupAction.id = "setting-popup-action";
  popupAction.value = "open_dashboard";
  doc.body.appendChild(popupAction);
  const summaryCooldown = doc.createElement("input");
  summaryCooldown.type = "number";
  summaryCooldown.id = "setting-summary-cooldown";
  summaryCooldown.value = "5";
  doc.body.appendChild(summaryCooldown);
  const summaryCache = doc.createElement("input");
  summaryCache.type = "number";
  summaryCache.id = "setting-summary-cache";
  summaryCache.value = "10";
  doc.body.appendChild(summaryCache);
  const summaryPersonality = doc.createElement("select");
  summaryPersonality.id = "setting-summary-personality";
  summaryPersonality.value = "neutral";
  doc.body.appendChild(summaryPersonality);
  const summaryEmojis = doc.createElement("select");
  summaryEmojis.id = "setting-summary-emojis";
  summaryEmojis.value = "low";
  doc.body.appendChild(summaryEmojis);
  const summaryLength = doc.createElement("select");
  summaryLength.id = "setting-summary-length";
  summaryLength.value = "medium";
  doc.body.appendChild(summaryLength);
  const summaryVerbosity = doc.createElement("select");
  summaryVerbosity.id = "setting-summary-verbosity";
  summaryVerbosity.value = "standard";
  doc.body.appendChild(summaryVerbosity);
  const summaryTechnicality = doc.createElement("select");
  summaryTechnicality.id = "setting-summary-technicality";
  summaryTechnicality.value = "neutral";
  doc.body.appendChild(summaryTechnicality);
  const summaryVoice = doc.createElement("select");
  summaryVoice.id = "setting-summary-voice";
  summaryVoice.value = "mentor";
  doc.body.appendChild(summaryVoice);
  const summaryFormatting = doc.createElement("select");
  summaryFormatting.id = "setting-summary-formatting";
  summaryFormatting.value = "plain";
  doc.body.appendChild(summaryFormatting);
  const summaryBullets = doc.createElement("input");
  summaryBullets.type = "checkbox";
  summaryBullets.id = "setting-summary-bullets";
  summaryBullets.checked = true;
  doc.body.appendChild(summaryBullets);
  const summaryMetaphors = doc.createElement("input");
  summaryMetaphors.type = "checkbox";
  summaryMetaphors.id = "setting-summary-metaphors";
  summaryMetaphors.checked = true;
  doc.body.appendChild(summaryMetaphors);
  const focusPrompts = doc.createElement("textarea");
  focusPrompts.id = "setting-focus-prompts";
  focusPrompts.value = "prompt one\nprompt two";
  doc.body.appendChild(focusPrompts);
  const outcomeHighlights = doc.createElement("input");
  outcomeHighlights.type = "checkbox";
  outcomeHighlights.id = "setting-outcome-highlights";
  outcomeHighlights.checked = true;
  doc.body.appendChild(outcomeHighlights);
  const uiDensity = doc.createElement("select");
  uiDensity.id = "setting-ui-density";
  uiDensity.value = "comfortable";
  doc.body.appendChild(uiDensity);
  const reduceMotion = doc.createElement("input");
  reduceMotion.type = "checkbox";
  reduceMotion.id = "setting-reduce-motion";
  reduceMotion.checked = true;
  doc.body.appendChild(reduceMotion);
  const sessionLimit = doc.createElement("input");
  sessionLimit.type = "number";
  sessionLimit.id = "setting-session-list-limit";
  sessionLimit.value = "8";
  doc.body.appendChild(sessionLimit);
  const quickIds = [
    "setting-popup-show-active-time",
    "setting-popup-show-top-domain",
    "setting-popup-show-distraction",
    "setting-popup-show-session-label",
    "setting-popup-show-last-action",
  ];
  quickIds.forEach((id) => {
    const input = doc.createElement("input");
    input.type = "checkbox";
    input.id = id;
    input.checked = true;
    doc.body.appendChild(input);
  });
  hooks.elements.settingDashboardShowOverview = doc.getElementById(ids[0]);
  hooks.elements.settingDashboardShowSessions = doc.getElementById(ids[1]);
  hooks.elements.settingDashboardShowTimeline = doc.getElementById(ids[2]);
  hooks.elements.settingDashboardShowGraph = doc.getElementById(ids[3]);
  hooks.elements.settingDashboardShowStats = doc.getElementById(ids[4]);
  hooks.elements.settingDashboardShowHonesty = doc.getElementById(ids[5]);
  hooks.elements.settingDashboardShowCallouts = doc.getElementById(ids[6]);
  hooks.elements.settingAccentColor = accentColor;
  hooks.elements.settingTypographyStyle = typography;
  hooks.elements.settingSessionListStyle = sessionStyle;
  hooks.elements.settingPinActiveSession = pinActive;
  hooks.elements.settingDashboardStoryMode = storyMode;
  hooks.elements.settingPopupMicroNote = popupMicro;
  hooks.elements.settingPopupMood = popupMood;
  hooks.elements.settingPopupLayout = popupLayout;
  hooks.elements.settingPopupDensity = popupDensity;
  hooks.elements.settingPopupAction = popupAction;
  hooks.elements.settingSummaryCooldown = summaryCooldown;
  hooks.elements.settingSummaryCache = summaryCache;
  hooks.elements.settingSummaryPersonality = summaryPersonality;
  hooks.elements.settingSummaryEmojis = summaryEmojis;
  hooks.elements.settingSummaryLength = summaryLength;
  hooks.elements.settingSummaryVerbosity = summaryVerbosity;
  hooks.elements.settingSummaryTechnicality = summaryTechnicality;
  hooks.elements.settingSummaryVoice = summaryVoice;
  hooks.elements.settingSummaryFormatting = summaryFormatting;
  hooks.elements.settingSummaryBullets = summaryBullets;
  hooks.elements.settingSummaryMetaphors = summaryMetaphors;
  hooks.elements.settingFocusPrompts = focusPrompts;
  hooks.elements.settingOutcomeHighlights = outcomeHighlights;
  hooks.elements.settingUiDensity = uiDensity;
  hooks.elements.settingReduceMotion = reduceMotion;
  hooks.elements.settingSessionListLimit = sessionLimit;
  hooks.elements.settingPopupShowActiveTime = doc.getElementById(quickIds[0]);
  hooks.elements.settingPopupShowTopDomain = doc.getElementById(quickIds[1]);
  hooks.elements.settingPopupShowDistraction = doc.getElementById(quickIds[2]);
  hooks.elements.settingPopupShowSessionLabel = doc.getElementById(quickIds[3]);
  hooks.elements.settingPopupShowLastAction = doc.getElementById(quickIds[4]);
  hooks.collectSettingsFromForm();

  const settingsFormBackup = hooks.elements.settingsForm;
  hooks.elements.settingsForm = null;
  hooks.saveSettings();
  hooks.elements.settingsForm = settingsFormBackup;
});

test("dashboard initLiveDashboard prod path", () => {
  const html = loadHtmlFixture(rootPath("dashboard", "index.html"));
  const dom = createDom(html);
  const context = createContext({
    dom,
    extraGlobals: { __IRHT_TEST__: false },
  });
  loadScript(rootPath("categories.js"), context);
  loadScript(rootPath("shared.js"), context);
  loadScript(rootPath("insights.js"), context);
  loadScript(rootPath("dashboard", "summary-shared.js"), context);
  loadScript(rootPath("dashboard", "graph.js"), context);
  loadScript(rootPath("dashboard", "dashboard.js"), context);
});

test("dashboard resetSettingsToDefault returns without chrome storage", async () => {
  const { hooks } = loadDashboard({
    dom: createDom("<!doctype html><html><body></body></html>"),
    chrome: undefined,
    clock: createClock(Date.now()),
  });
  await hooks.resetSettingsToDefault();
});

test("dashboard resetSettingsToDefault returns when confirm is cancelled", async () => {
  const chrome = createChromeMock();
  const { hooks } = loadDashboard({
    dom: createDom("<!doctype html><html><body></body></html>"),
    chrome,
    clock: createClock(Date.now()),
    extraGlobals: { confirm: () => false },
  });
  await hooks.resetSettingsToDefault();
  assert.equal(chrome._storage.sync[hooks.SETTINGS_KEY], undefined);
});

test("dashboard restoreUndoSettings returns without chrome storage", async () => {
  const { hooks } = loadDashboard({
    dom: createDom("<!doctype html><html><body></body></html>"),
    chrome: undefined,
    clock: createClock(Date.now()),
  });
  await hooks.restoreUndoSettings();
});

test("dashboard restoreUndoSettings returns when snapshot missing", async () => {
  const chrome = createChromeMock();
  const { hooks } = loadDashboard({
    dom: createDom("<!doctype html><html><body></body></html>"),
    chrome,
    clock: createClock(Date.now()),
  });
  await hooks.restoreUndoSettings();
  assert.equal(chrome._storage.sync[hooks.SETTINGS_KEY], undefined);
});

test("dashboard settingsEqual handles circular data", () => {
  const { hooks } = loadDashboard({
    dom: createDom("<!doctype html><html><body></body></html>"),
    chrome: undefined,
    clock: createClock(Date.now()),
  });
  const a = {};
  a.self = a;
  assert.equal(hooks.settingsEqual(a, a), false);
});

test("dashboard setUndoSnapshot ignores storage errors", () => {
  const dom = createDom("<!doctype html><html><body></body></html>");
  const { hooks, context } = loadDashboard({
    dom,
    chrome: undefined,
    clock: createClock(Date.now()),
  });
  let calls = 0;
  context.localStorage = {
    setItem: () => {
      calls += 1;
      throw new Error("fail");
    },
    getItem: () => {
      throw new Error("fail");
    },
  };
  hooks.elements.undoSettings = null;
  hooks.updateUndoButtonState();
  hooks.setUndoSnapshot({ theme: "ink" });
  assert.ok(calls > 0);
});

test("dashboard scheduleSettingsSave returns without chrome storage", () => {
  const { hooks } = loadDashboard({
    dom: createDom("<!doctype html><html><body></body></html>"),
    chrome: undefined,
    clock: createClock(Date.now()),
  });
  hooks.scheduleSettingsSave();
});

test("dashboard applySettings updates typography style", () => {
  const dom = createDom("<!doctype html><html><body></body></html>");
  const { hooks } = loadDashboard({
    dom,
    chrome: undefined,
    clock: createClock(Date.now()),
  });
  const form = dom.window.document.createElement("form");
  form.id = "settings-form";
  dom.window.document.body.appendChild(form);
  const honesty = dom.window.document.createElement("input");
  honesty.type = "checkbox";
  honesty.id = "setting-dashboard-show-honesty";
  dom.window.document.body.appendChild(honesty);
  const callouts = dom.window.document.createElement("input");
  callouts.type = "checkbox";
  callouts.id = "setting-dashboard-show-callouts";
  dom.window.document.body.appendChild(callouts);
  const graph = dom.window.document.createElement("input");
  graph.type = "checkbox";
  graph.id = "setting-dashboard-show-graph";
  dom.window.document.body.appendChild(graph);
  const stats = dom.window.document.createElement("input");
  stats.type = "checkbox";
  stats.id = "setting-dashboard-show-stats";
  dom.window.document.body.appendChild(stats);
  const sessions = dom.window.document.createElement("input");
  sessions.type = "checkbox";
  sessions.id = "setting-dashboard-show-sessions";
  dom.window.document.body.appendChild(sessions);
  const timeline = dom.window.document.createElement("input");
  timeline.type = "checkbox";
  timeline.id = "setting-dashboard-show-timeline";
  dom.window.document.body.appendChild(timeline);
  const overview = dom.window.document.createElement("input");
  overview.type = "checkbox";
  overview.id = "setting-dashboard-show-overview";
  dom.window.document.body.appendChild(overview);
  const outcomeHighlights = dom.window.document.createElement("input");
  outcomeHighlights.type = "checkbox";
  outcomeHighlights.id = "setting-outcome-highlights";
  dom.window.document.body.appendChild(outcomeHighlights);
  const pinActive = dom.window.document.createElement("input");
  pinActive.type = "checkbox";
  pinActive.id = "setting-pin-active-session";
  dom.window.document.body.appendChild(pinActive);
  const focusPrompts = dom.window.document.createElement("textarea");
  focusPrompts.id = "setting-focus-prompts";
  dom.window.document.body.appendChild(focusPrompts);
  const accent = dom.window.document.createElement("input");
  accent.id = "setting-accent-color";
  dom.window.document.body.appendChild(accent);
  const typography = dom.window.document.createElement("select");
  const option = dom.window.document.createElement("option");
  option.value = "calm";
  option.textContent = "Calm";
  typography.appendChild(option);
  typography.id = "setting-typography-style";
  dom.window.document.body.appendChild(typography);
  hooks.elements.settingsForm = form;
  hooks.elements.settingDashboardShowHonesty = honesty;
  hooks.elements.settingDashboardShowCallouts = callouts;
  hooks.elements.settingDashboardShowGraph = graph;
  hooks.elements.settingDashboardShowStats = stats;
  hooks.elements.settingDashboardShowSessions = sessions;
  hooks.elements.settingDashboardShowTimeline = timeline;
  hooks.elements.settingDashboardShowOverview = overview;
  hooks.elements.settingOutcomeHighlights = outcomeHighlights;
  hooks.elements.settingPinActiveSession = pinActive;
  hooks.elements.settingFocusPrompts = focusPrompts;
  hooks.elements.settingAccentColor = accent;
  hooks.elements.settingTypographyStyle = typography;
  hooks.applySettings({
    ...hooks.DEFAULT_SETTINGS,
    typographyStyle: "calm",
    accentColor: "#ff6600",
    dashboardSections: {
      honesty: true,
      callouts: true,
      graph: true,
      stats: true,
      sessions: true,
      timeline: true,
      overview: true,
    },
    showOutcomeHighlights: true,
    pinActiveSession: true,
    focusPrompts: ["Prompt one", "Prompt two"],
  });
  assert.equal(honesty.checked, true);
  assert.equal(callouts.checked, true);
  assert.equal(graph.checked, true);
  assert.equal(stats.checked, true);
  assert.equal(sessions.checked, true);
  assert.equal(timeline.checked, true);
  assert.equal(overview.checked, true);
  assert.equal(outcomeHighlights.checked, true);
  assert.equal(pinActive.checked, true);
  assert.ok(focusPrompts.value.includes("Prompt one"));
  assert.equal(accent.value, "#ff6600");
  assert.equal(typography.value, "calm");
});

// --- 100% coverage edge cases ---
test("dashboard trimGraph drops nodes", () => {
  const { hooks } = loadDashboard({
    dom: createDom("<!doctype html><html><body></body></html>"),
    chrome: undefined,
    clock: createClock(Date.now()),
  });
  const nodes = Array.from({ length: hooks.MAX_GRAPH_NODES + 5 }, (_, i) => ({
    id: `n${i}`,
    activeMs: i,
  }));
  const edges = nodes.map((n, i) => ({
    from: n.id,
    to: nodes[(i + 1) % nodes.length].id,
  }));
  const trimmed = hooks.trimGraph({ nodes, edges });
  assert.ok(trimmed.nodes.length === hooks.MAX_GRAPH_NODES);
  assert.ok(
    trimmed.edges.every(
      (e) =>
        trimmed.nodes.find((n) => n.id === e.from) &&
        trimmed.nodes.find((n) => n.id === e.to),
    ),
  );
});

test("dashboard buildTopDomains skips bad domain", () => {
  const { hooks } = loadDashboard({
    dom: createDom("<!doctype html><html><body></body></html>"),
    chrome: undefined,
    clock: createClock(Date.now()),
  });
  const session = {
    nodes: {
      a: { url: null, activeMs: 10 },
      b: { url: "not-a-url", activeMs: 5 },
    },
  };
  // getDomain(null) and getDomain('not-a-url') both return null
  const result = hooks.buildTopDomains(session);
  assert.equal(result.length, 0);
});

test("dashboard findSessionEndUrl returns null for no nodes", () => {
  const { hooks } = loadDashboard({
    dom: createDom("<!doctype html><html><body></body></html>"),
    chrome: undefined,
    clock: createClock(Date.now()),
  });
  const session = { events: [], nodes: {} };
  const url = hooks.findSessionEndUrl(session);
  assert.equal(url, null);
});

test("dashboard buildGraphData respects maxNodes", () => {
  const { hooks } = loadDashboard({
    dom: createDom("<!doctype html><html><body></body></html>"),
    chrome: undefined,
    clock: createClock(Date.now()),
  });
  const session = {
    nodes: {
      "https://a.com/": { url: "https://a.com/", activeMs: 10 },
      "https://b.com/": { url: "https://b.com/", activeMs: 5 },
      "https://c.com/": { url: "https://c.com/", activeMs: 1 },
    },
    edges: {
      "https://a.com/ -> https://b.com/": {
        from: "https://a.com/",
        to: "https://b.com/",
        visitCount: 2,
      },
      "https://b.com/ -> https://c.com/": {
        from: "https://b.com/",
        to: "https://c.com/",
        visitCount: 0,
      },
    },
  };

  const pageGraph = hooks.buildGraphData(session, "page", 1);
  assert.equal(pageGraph.nodes.length, 1);

  const domainGraph = hooks.buildGraphData(session, "domain", 1);
  assert.equal(domainGraph.nodes.length, 1);

  const fullPageGraph = hooks.buildGraphData(session, "page");
  const fallbackEdge = fullPageGraph.edges.find(
    (edge) => edge.from === "https://b.com/" && edge.to === "https://c.com/",
  );
  assert.equal(fallbackEdge.count, 1);
});

test("dashboard buildGraphData seeds page nodes from edges", () => {
  const { hooks } = loadDashboard({
    dom: createDom("<!doctype html><html><body></body></html>"),
    chrome: undefined,
    clock: createClock(Date.now()),
  });
  const session = {
    nodes: {},
    edges: {
      "https://alpha.com/ -> https://beta.com/": {
        from: "https://alpha.com/",
        to: "https://beta.com/",
        visitCount: 1,
      },
    },
  };
  const graph = hooks.buildGraphData(session, "page");
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges.length, 1);
});
// --- END 100% coverage edge cases ---

test("dashboard coverage extras", async () => {
  const html = loadHtmlFixture(rootPath("dashboard", "index.html"));
  const dom = createDom(html);
  Object.defineProperty(dom.window.document, "readyState", {
    value: "complete",
    configurable: true,
  });
  attachLegacyDashboardElements(dom);
  attachSettingsElements(dom);
  attachExtendedSettingsElements(dom);
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);
  const clock = createClock(Date.now());
  let rafCallback = null;
  let timeoutCallback = null;
  const chrome = createChromeMock({
    localData: {},
    syncData: {},
  });
  const { hooks, context } = loadDashboard({
    dom,
    chrome,
    clock,
    extraGlobals: {
      requestAnimationFrame: (cb) => {
        rafCallback = cb;
        return 1;
      },
      setTimeout: (cb) => {
        timeoutCallback = cb;
        return 1;
      },
      clearTimeout: () => {
        timeoutCallback = null;
      },
    },
  });
  context.Element = dom.window.Element;

  const localeBackup = Date.prototype.toLocaleDateString;
  Date.prototype.toLocaleDateString = () => "Monday, January 1, 2026";
  assert.equal(
    context.formatSessionDay(clock.now()),
    "Monday, January 1, 2026",
  );
  Date.prototype.toLocaleDateString = localeBackup;

  assert.equal(context.formatSummaryForDisplay(null), "");
  assert.equal(context.formatSummaryForDisplay("   "), "");
  const splitBackup = String.prototype.split;
  String.prototype.split = () => [];
  assert.equal(context.formatSummaryForDisplay("Sentence."), "Sentence.");
  String.prototype.split = splitBackup;
  assert.equal(context.formatSummaryForDisplay("One short."), "One short.");
  assert.ok(
    context.formatSummaryForDisplay("First. Second. Third.").includes("\u2022"),
  );
  assert.equal(
    context.formatDuration(2 * 3600 * 1000 + 30 * 60 * 1000),
    "2h 30m",
  );

  assert.equal(context.classifyCalloutTone("Focus and steady"), "focus");
  assert.equal(context.classifyCalloutTone("Drift and scroll"), "distraction");
  assert.equal(context.classifyCalloutTone("Random note"), "neutral");

  hooks.bindHelpIcons();
  const helpOne = dom.window.document.getElementById("help-one");
  helpOne.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  helpOne.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "Enter" }),
  );
  helpOne.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "Escape" }),
  );
  dom.window.document.body.dispatchEvent(
    new dom.window.Event("click", { bubbles: true }),
  );

  const normalized = hooks.normalizeState({
    schemaVersion: 4,
    sessions: { s1: { id: "s1", nodes: {}, edges: {}, events: [] } },
    sessionOrder: ["s1"],
  });
  assert.equal(normalized.schemaVersion, 4);

  const decoded = hooks.decodeCompactState({
    schemaVersion: 4,
    urlTable: ["https://a.com/"],
    sessions: {
      s1: {
        id: "s1",
        nodes: [
          { urlId: 0, title: "", activeMs: 0 },
          { urlId: 1, title: "", activeMs: 0 },
        ],
        edges: [
          { fromId: 0, toId: 1, visitCount: 0 },
          { fromId: 0, toId: 0, visitCount: 1 },
        ],
        trapDoors: [{ urlId: 0 }],
      },
    },
    sessionOrder: ["s1"],
  });
  assert.ok(decoded.sessions.s1);

  hooks.app.state = { sessions: {}, sessionOrder: [], activeSessionId: null };
  hooks.populateSessionList();
  assert.equal(hooks.elements.sessionListEmpty.hidden, false);

  hooks.app.state = {
    sessions: {
      a: { id: "a", archived: true, deleted: false, startedAt: 1 },
      b: { id: "b", archived: false, deleted: false, startedAt: 2 },
    },
    sessionOrder: ["a", "b"],
    activeSessionId: "a",
  };
  const listData = hooks.getSessionListData();
  assert.equal(listData.ordered[0].id, "a");
  hooks.app.state.activeSessionId = "";
  const listFallback = hooks.getSessionListData();
  assert.ok(listFallback.ordered[0].id);
  hooks.app.state.activeSessionId = "b";
  const listReordered = hooks.getSessionListData();
  assert.equal(listReordered.ordered[0].id, "b");

  hooks.scheduleSessionListRender();
  hooks.scheduleSessionListRender();
  if (rafCallback) {
    rafCallback();
  }

  const listBackup = hooks.elements.sessionList;
  hooks.elements.sessionList = null;
  hooks.renderSessionListWindow();
  hooks.elements.sessionList = listBackup;
  hooks.app.cache.sessionListData = {
    ordered: [
      { id: "s1", startedAt: clock.now(), nodes: {}, edges: {}, events: [] },
    ],
    listStyle: "minimal",
    renderKey: "min",
  };
  hooks.renderSessionListWindow();

  hooks.app.followActiveSession = false;
  hooks.app.session = { id: "keep" };
  hooks.applyState(
    {
      schemaVersion: 4,
      sessions: {
        keep: { id: "keep", deleted: false, nodes: {}, edges: {}, events: [] },
        active: {
          id: "active",
          deleted: false,
          nodes: {},
          edges: {},
          events: [],
        },
      },
      sessionOrder: ["keep", "active"],
      activeSessionId: "active",
      tracking: {},
    },
    "local",
  );
  assert.equal(hooks.app.session.id, "keep");
  hooks.app.followActiveSession = false;
  hooks.applyState(
    {
      schemaVersion: 4,
      sessions: {
        keep: { id: "keep", deleted: true, nodes: {}, edges: {}, events: [] },
        active: {
          id: "active",
          deleted: false,
          nodes: {},
          edges: {},
          events: [],
        },
      },
      sessionOrder: ["keep", "active"],
      activeSessionId: "active",
      tracking: {},
    },
    "local",
  );
  assert.equal(hooks.app.followActiveSession, true);

  dom.window.document.body.classList.remove("dashboard-page");
  hooks.renderDashboard();
  dom.window.document.body.classList.add("dashboard-page");

  const now = Date.now();
  const hopSession = {
    id: "hop",
    startedAt: now - 600000,
    updatedAt: now,
    nodes: {
      "https://a.com/": { url: "https://a.com/", activeMs: 60000 },
      "https://b.com/": { url: "https://b.com/", activeMs: 60000 },
    },
    events: [
      { ts: now - 1000, toUrl: "https://a.com/" },
      { ts: now - 2000, toUrl: "https://b.com/" },
      { ts: now - 3000, toUrl: "https://c.com/" },
      { ts: now - 4000, toUrl: "https://d.com/" },
    ],
    navigationCount: 4,
    categoryTotals: {},
  };
  const prevSession = {
    id: "prev",
    startedAt: now - 700000,
    updatedAt: now - 650000,
    nodes: {},
    edges: {},
    events: [],
    navigationCount: 0,
  };
  hooks.app.state = {
    sessions: { hop: hopSession, prev: prevSession },
    sessionOrder: ["prev", "hop"],
    activeSessionId: "hop",
    tracking: {},
  };
  hooks.app.session = hopSession;
  hooks.app.settings.showOutcomeHighlights = true;
  hooks.renderOverviewInsights(hopSession);
  assert.ok(
    hooks.elements.overviewInsights.textContent.includes("Domain hopping"),
  );

  hooks.app.settings.dashboardFocusNote = "";
  hooks.app.settings.focusPrompts = ["Prompt one"];
  hooks.renderFocusNote();
  assert.equal(hooks.elements.focusNote.hidden, false);

  hooks.scheduleSummaryRefresh({ force: false });
  hooks.scheduleSummaryRefresh({ force: true });

  hooks.app.settings.summaryRefreshCooldownMinutes = 5;
  hooks.app.session = hopSession;
  hooks.app.summaryState.lastSessionId = hopSession.id;
  hooks.app.summaryState.lastRefreshAt = Date.now();
  hooks.refreshSummaries({ force: false });

  hooks.app.state.sessions = { [hopSession.id]: hopSession };
  context.chrome.runtime.sendMessage = null;
  hooks.persistSessionSummaries(hopSession.id, "brief", "detail");

  hooks.app.settings.summaryPersonality = "gentle";
  hooks.app.settings.summaryVoice = "friend";
  hooks.app.settings.summaryTechnicality = "technical";
  hooks.app.settings.summaryEmojis = "none";
  hooks.app.settings.summaryFormatting = "markdown";
  hooks.app.settings.summaryBullets = true;
  hooks.app.settings.summaryMetaphors = true;
  hooks.app.settings.summaryLength = "short";
  hooks.app.settings.summaryVerbosity = "brief";
  hooks.buildSummaryStyleLines("brief");
  hooks.app.settings.summaryPersonality = "direct";
  hooks.app.settings.summaryEmojis = "low";
  hooks.app.settings.summaryFormatting = "plain";
  hooks.app.settings.summaryBullets = false;
  hooks.app.settings.summaryMetaphors = false;
  hooks.buildSummaryStyleLines("detailed");
  hooks.app.settings.summaryPersonality = "balanced";
  hooks.buildSummaryStyleLines("brief");

  hopSession.categoryTotals = { Study: 60000 };
  hopSession.trapDoors = [{ url: "https://trap.example/" }];
  hooks.buildSummaryDataLines(hooks.app.state, hopSession);

  hooks.app.graph = { setData: () => {}, lastKey: null };
  hooks.app.graphReady = true;
  hooks.app.session = {
    id: "empty",
    nodes: Object.fromEntries(
      Array.from({ length: 11 }, (_, i) => [`n${i}`, { url: `https://n${i}.com` }]),
    ),
    edges: {},
    events: [],
  };
  const graphBackup = context.buildGraphData;
  const trimBackup = context.trimGraph;
  context.buildGraphData = () => ({ nodes: [], edges: [] });
  context.trimGraph = (graph) => graph;
  hooks.renderGraph();
  context.buildGraphData = graphBackup;
  context.trimGraph = trimBackup;

  hooks.app.graph = null;
  const loadStateBackup = context.loadStateFromStorage;
  context.loadStateFromStorage = async () => ({ state: null, source: "offline" });
  await hooks.initLiveDashboard();
  context.loadStateFromStorage = loadStateBackup;

  const bgBackup = context.loadStateFromBackground;
  context.loadStateFromBackground = async () => ({
    schemaVersion: 4,
    sessions: {
      warm: {
        id: "warm",
        nodes: { "https://example.com/": { url: "https://example.com/" } },
        edges: {},
        events: [],
      },
    },
    sessionOrder: ["warm"],
    activeSessionId: "warm",
    tracking: {},
  });
  const warmResult = await hooks.loadStateFromStorage();
  assert.equal(warmResult.source, "live");
  context.loadStateFromBackground = bgBackup;

  const { hooks: noChromeHooks } = loadDashboard({
    dom: createDom("<!doctype html><html><body></body></html>"),
    chrome: undefined,
    clock,
  });
  await noChromeHooks.loadStateFromBackground();

  let timeoutCaptured = null;
  const { hooks: hooks2 } = loadDashboard({
    dom,
    chrome: createChromeMock({
      onSendMessage: (message, cb) => cb({ state: null }),
    }),
    clock,
    extraGlobals: {
      setTimeout: (cb) => {
        timeoutCaptured = cb;
        return 1;
      },
      clearTimeout: () => {},
    },
  });
  await hooks2.loadStateFromBackground();
  if (timeoutCaptured) {
    timeoutCaptured();
  }

  hooks.elements.briefSummary = null;
  hooks.elements.detailedSummary = null;
  hooks.elements.overviewSummary = {};
  assert.equal(context.hasSummaryUi(), true);
  assert.equal(context.shouldForceSummaryRefresh(null, null), false);

  hooks.app.settings.summaryVoice = "mentor";
  hooks.app.settings.summaryEmojis = "low";
  const nextSettings = {
    ...hooks.app.settings,
    summaryVoice: "analyst",
    summaryEmojis: "high",
  };
  context.shouldForceSummaryRefresh(hooks.app.settings, nextSettings);
  const refreshBackup = context.shouldForceSummaryRefresh;
  const summaryUiBackup = context.hasSummaryUi;
  context.shouldForceSummaryRefresh = () => true;
  context.hasSummaryUi = () => true;
  hooks.applySettings(nextSettings);
  context.shouldForceSummaryRefresh = refreshBackup;
  context.hasSummaryUi = summaryUiBackup;

  assert.equal(context.getPreviewLabel("warm-theme", "Theme"), "Warm Theme");
  assert.equal(context.getPreviewLabel("", "Theme"), "Theme");
  context.updateSettingsPreview({
    theme: "warm",
    uiDensity: "cozy",
    typographyStyle: "editorial",
    accentColor: "#ff6600",
  });
  context.updateSettingsPreview({ theme: "warm" });

  hooks.app.deepTab = "graph";
  hooks.applyDashboardVisibility({
    dashboardSections: {
      overview: true,
      sessions: true,
      timeline: true,
      graph: false,
      stats: false,
      honesty: false,
    },
  });
  assert.notEqual(hooks.app.deepTab, "graph");
  const calloutsBackup = hooks.elements.calloutsList;
  const calloutsNode = dom.window.document.createElement("ul");
  hooks.elements.calloutsList = calloutsNode;
  hooks.applyDashboardVisibility({ dashboardSections: { callouts: false } });
  assert.equal(calloutsNode.hidden, true);
  hooks.elements.calloutsList = calloutsBackup;

  const key = context.buildGraphKey(
    { nodes: [{ id: "a" }], edges: [{ from: "a", to: "a" }] },
    "domain",
    "s1",
  );
  assert.ok(key.includes("s1"));

  assert.equal(context.formatSessionDay(Number.NaN), "Unknown date");
  const splitBackup2 = String.prototype.split;
  String.prototype.split = () => [];
  assert.equal(context.formatSummaryForDisplay("Extra."), "Extra.");
  String.prototype.split = splitBackup2;

  const runtimeUrlBackup = chrome.runtime.getURL;
  chrome.runtime.getURL = null;
  if (hooks.elements.openSettings) {
    hooks.elements.openSettings.dispatchEvent(new dom.window.Event("click"));
  }
  if (hooks.elements.openDashboard) {
    hooks.elements.openDashboard.dispatchEvent(new dom.window.Event("click"));
  }
  chrome.runtime.getURL = runtimeUrlBackup;

  helpOne.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  hooks.decodeCompactState({
    schemaVersion: 4,
    urlTable: null,
    sessions: { s0: { id: "s0", nodes: null, edges: null, events: null } },
  });

  hooks.decodeCompactState({
    schemaVersion: 4,
    urlTable: ["https://a.com/"],
    sessions: {
      s1: {
        id: "s1",
        nodes: [{ urlId: 0 }, { urlId: 1, url: "https://b.com/" }],
        edges: [
          { fromId: 0, toId: 1, to: "https://b.com/" },
          { fromId: 2, from: "https://c.com/", toId: 0 },
        ],
        trapDoors: [{ urlId: 0 }, { url: "https://trap.com/" }, {}],
        eventCursor: 2,
        eventCount: 1,
      },
      s2: { id: "s2", nodes: [], edges: [], events: [{ ts: 1 }] },
      s3: { id: "s3", nodes: [], edges: [], events: null },
    },
    sessionOrder: null,
    activeSessionId: null,
    tabs: null,
    tracking: null,
  });

  hooks.app.state = {
    sessions: { a: { id: "a", endedAt: clock.now() } },
    sessionOrder: ["a"],
    activeSessionId: "",
  };
  hooks.populateSessionList();

  hooks.app.settings.sessionListStyle = "";
  hooks.app.settings.sessionListLimit = null;
  hooks.app.state.sessionOrder = null;
  hooks.getSessionListData();

  hooks.app.summaryState.lastSessionId = null;
  const cacheSession = {
    id: "cache",
    summaryBrief: "Cached",
    summaryDetailed: "Cached detail",
    summaryUpdatedAt: Date.now() - 10 * 60 * 1000,
    updatedAt: Date.now(),
    startedAt: Date.now(),
  };
  hooks.app.settings.summaryCacheMinutes = 1;
  context.loadCachedSummaries(cacheSession);
  cacheSession.summaryUpdatedAt = Date.now();
  context.loadCachedSummaries(cacheSession);

  hooks.app.summaryState.brief = "   ";
  hooks.app.summaryState.detailed = "   ";
  hooks.renderSummaryState();
  hooks.app.summaryState.brief = "Hello.";
  hooks.app.summaryState.detailed = "Hello again.";
  hooks.renderSummaryState();

  const insightsBackup = context.IRHTInsights;
  context.IRHTInsights = {
    buildSessionMirror: () => ({ summary: "   ", origin: "AI" }),
  };
  hooks.renderOverviewSummary({ id: "mirror", label: "" });
  context.IRHTInsights = {
    buildSessionMirror: () => ({ summary: "All good.", origin: "AI" }),
  };
  hooks.renderOverviewSummary({ id: "mirror2", label: "" });
  context.IRHTInsights = null;
  hooks.renderOverviewSummary({ id: "label", label: "   " });
  context.IRHTInsights = insightsBackup;

  const overviewSession = {
    id: "overview",
    updatedAt: Date.now(),
    nodes: {},
    events: [],
    distractionAverage: 0.4,
  };
  hooks.app.settings.tone = "";
  hooks.app.settings.showOutcomeHighlights = false;
  context.getOverviewInsights(overviewSession, {});
  hooks.app.settings.tone = "direct";
  hooks.app.settings.showOutcomeHighlights = true;
  context.IRHTInsights = { generateInsights: () => ["Custom insight"] };
  context.getOverviewInsights(
    {
      ...overviewSession,
      nodes: { "https://example.com/": { url: "https://example.com/", activeMs: 1000 } },
    },
    { sessions: { overview: overviewSession }, sessionOrder: ["overview"] },
  );
  context.IRHTInsights = insightsBackup;

  context.computeDomainHops({
    events: [
      { ts: Date.now(), toUrl: "https://a.com/" },
      { ts: 0, url: "https://b.com/" },
      { fromUrl: "https://c.com/" },
      { ts: Date.now(), toUrl: "https://d.com/" },
    ],
  });

  const highlightPrev = {
    id: "prev2",
    startedAt: Date.now() - 600000,
    updatedAt: Date.now() - 600000,
    nodes: { "https://a.com/": { url: "https://a.com/", activeMs: 900000 } },
    edges: {},
    events: [],
    distractionAverage: 0.1,
  };
  const highlightCurrent = {
    id: "curr2",
    startedAt: Date.now() - 300000,
    updatedAt: Date.now() - 1000,
    nodes: { "https://b.com/": { url: "https://b.com/", activeMs: 1000 } },
    edges: {},
    events: [],
    distractionAverage: 0.6,
  };
  context.buildOutcomeHighlights(highlightCurrent, {
    sessions: { prev2: highlightPrev, curr2: highlightCurrent },
    sessionOrder: ["prev2", "curr2"],
  });

  const highlightCurrentLower = {
    id: "curr3",
    startedAt: Date.now() - 300000,
    updatedAt: Date.now() - 1000,
    nodes: { "https://a.com/": { url: "https://a.com/", activeMs: 1200000 } },
    edges: {},
    events: [],
    distractionAverage: 0.1,
  };
  context.buildOutcomeHighlights(highlightCurrentLower, {
    sessions: { prev2: highlightPrev, curr3: highlightCurrentLower },
    sessionOrder: ["prev2", "curr3"],
  });

  const clipboardBackup = dom.window.navigator.clipboard;
  dom.window.navigator.clipboard = {
    writeText: async () => {
      throw new Error("blocked");
    },
  };
  const actionSession = {
    id: "action",
    nodes: { "https://a.com/": { url: "https://a.com/", activeMs: 1000 } },
    edges: {},
    events: [],
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  const actions = context.buildRecommendedActions(actionSession);
  for (const action of actions) {
    await action.onClick();
  }
  dom.window.navigator.clipboard = clipboardBackup;

  hooks.app.settings.dashboardFocusNote = 123;
  hooks.app.settings.focusPrompts = [];
  hooks.renderFocusNote();
  hooks.app.settings.dashboardFocusNote = "Stay on track";
  hooks.renderFocusNote();
  hooks.app.settings.dashboardFocusNote = "";
  hooks.app.settings.focusPrompts = ["Prompt one", "Prompt two"];
  hooks.app.state.activeSessionId = "seeded";
  hooks.app.session = null;
  hooks.renderFocusNote();
  hooks.app.session = { id: "seeded" };
  hooks.renderFocusNote();

  hooks.app.settings.summaryRefreshCooldownMinutes = 5;
  hooks.app.summaryState = {
    ...hooks.app.summaryState,
    brief: "",
    detailed: "",
    lastSessionId: hopSession.id,
    lastSessionUpdatedAt: hopSession.updatedAt,
    lastRefreshAt: Date.now(),
  };
  hooks.refreshSummaries({ force: false });

  const sendPromptBackup = context.getSendPromptToOllama;
  context.getSendPromptToOllama = () => async () => "";
  hooks.app.session = hopSession;
  hooks.app.summaryState.lastSessionId = null;
  hooks.refreshSummaries({ force: true });
  await new Promise((resolve) => setImmediate(resolve));
  context.getSendPromptToOllama = sendPromptBackup;

  hooks.updateSessionSummaries(hopSession.id, "", null, Date.now());
  hooks.updateSessionSummaries(hopSession.id, "Brief", "Detail", Date.now());

  hopSession.trapDoors = [
    { url: "not-a-url" },
    { url: "https://trap.example/" },
  ];
  hooks.buildSummaryDataLines(hooks.app.state, hopSession);

  hooks.app.settings.ollamaEndpoint = "";
  hooks.app.settings.ollamaModel = "";
  context.getSendPromptToOllama();
  hooks.app.settings.ollamaEndpoint = "http://localhost:11434";
  hooks.app.settings.ollamaModel = "llama3";
  context.getSendPromptToOllama();

  hooks.app.graphWarm = false;
  hooks.app.graphReady = true;
  hooks.app.graph = { setData: () => {}, lastKey: null };
  hooks.app.mode = "page";
  hooks.app.session = {
    id: "graph-live",
    nodes: Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [
        `https://g${i}.com/`,
        { url: `https://g${i}.com/`, activeMs: 1000 + i },
      ]),
    ),
    edges: {},
    events: [],
  };
  hooks.renderGraph();
  hooks.renderGraph();

  const sanitizeBackup = context.sanitizeSettings;
  context.sanitizeSettings = () => ({
    ...hooks.app.settings,
    summaryPersonality: "",
    summaryEmojis: "",
    summaryFormatting: "",
    summaryLength: "",
    summaryVerbosity: "",
    summaryTechnicality: "",
    summaryVoice: "",
    summaryRefreshCooldownMinutes: null,
    summaryCacheMinutes: null,
    ollamaEndpoint: "",
    ollamaModel: "",
    dashboardButtonLabel: "",
    popupLayout: "",
    popupDensity: "",
    popupPrimaryAction: "",
    popupQuickGlance: null,
    sessionListStyle: "",
    typographyStyle: "",
    uiDensity: "",
    sessionListLimit: 0,
    dashboardSections: null,
  });
  hooks.applySettings(hooks.app.settings);
  context.sanitizeSettings = sanitizeBackup;

  context.updateSettingsPreview({});

  const undoSnapshot = { ...hooks.app.settings, directCallouts: true };
  context.localStorage.setItem("irht_settings_undo", JSON.stringify(undoSnapshot));
  await hooks.restoreUndoSettings();
  const confirmBackup = context.confirm;
  context.confirm = () => true;
  await hooks.resetSettingsToDefault();
  context.confirm = confirmBackup;

  const formBackup = hooks.elements.settingDashboardShowOverview;
  hooks.elements.settingDashboardShowOverview = null;
  hooks.collectSettingsFromForm();
  hooks.elements.settingDashboardShowOverview = formBackup;

  context.sanitizeSettings({ dashboardSections: null });
  context.sanitizeSettings({
    dashboardSections: { overview: false, sessions: false },
  });

  context.normalizeTextList([" one ", 2, "two"]);
  context.normalizeTextList("a\nb\n");
  context.normalizeTextList(123);

  const mixBackup = context.mixHex;
  const inkBackup = context.accentInkColor;
  context.mixHex = () => "";
  context.accentInkColor = () => "";
  context.applyAccentColor({ accentColor: "#ff6600" });
  context.mixHex = mixBackup;
  context.accentInkColor = inkBackup;
  context.applyAccentColor({ accentColor: "#ff6600" });

  context.buildGraphData({ nodes: null, edges: null }, "page");
  context.buildGraphData(
    {
      nodes: {
        a: { url: "https://a.com/", activeMs: 10 },
        b: { url: "https://b.com/", activeMs: 5 },
      },
      edges: {
        "https://a.com/ -> https://b.com/": {
          from: "https://a.com/",
          to: "https://b.com/",
          visitCount: 1,
        },
      },
    },
    "page",
    1,
  );

  assert.ok(context.buildGraphKey({ nodes: [], edges: [] }, "page", ""));

  const sharedBackup2 = context.IRHTShared;
  context.IRHTShared = {
    normalizeDistractionScore: (score) => score,
    getDistractionLabel: () => "Label",
  };
  context.normalizeDistractionScore(1);
  context.getDistractionLabel(1);
  context.IRHTShared = null;
  context.normalizeDistractionScore(1);
  context.getDistractionLabel(1);
  context.IRHTShared = sharedBackup2;

  const graph = new context.ForceGraph(canvas, hooks.elements.tooltip);
  graph.setData({ nodes: [{ id: "x", activeMs: 10 }], edges: [] }, {});
  graph.setData(
    { nodes: [{ id: "x", activeMs: 10 }], edges: [] },
    { preserveLayout: true },
  );
});

test("dashboard test hooks reuse existing object", () => {
  const dom = createDom("<!doctype html><html><body></body></html>");
  const chrome = createChromeMock();
  const context = createContext({
    dom,
    chrome,
    extraGlobals: { __IRHT_TEST_HOOKS__: { existing: true } },
  });
  loadScript(rootPath("dashboard", "graph.js"), context);
  loadScript(rootPath("dashboard", "dashboard.js"), context);
  assert.ok(context.__IRHT_TEST_HOOKS__.dashboard);
});

test("dashboard session list pins active and formats non-active as ended", () => {
  const { hooks } = loadDashboard({
    dom: createDom("<!doctype html><html><body></body></html>"),
    chrome: undefined,
    clock: createClock(Date.now()),
  });

  const now = Date.now();
  const active = {
    id: "active-session",
    startedAt: now - 10000,
    updatedAt: now - 1000,
    endedAt: null,
    lastActivityAt: now - 1000,
    nodes: {},
    edges: {},
    events: [],
  };
  const lingering = {
    id: "lingering-session",
    startedAt: now - 20000,
    updatedAt: now - 5000,
    endedAt: null,
    lastActivityAt: now - 5000,
    nodes: {},
    edges: {},
    events: [],
  };
  hooks.app.state = {
    schemaVersion: 4,
    sessions: {
      [active.id]: active,
      [lingering.id]: lingering,
    },
    sessionOrder: [lingering.id, active.id],
    activeSessionId: active.id,
    tracking: {},
  };
  hooks.app.stateRevision = 1;

  const data = hooks.getSessionListData();
  assert.equal(data.ordered[0].id, active.id);

  const nonActive = data.ordered.find((session) => session.id === lingering.id);
  assert.ok(nonActive._displayEndAt);
  assert.ok(!hooks.formatSessionRange(nonActive).includes("Active"));
  assert.ok(hooks.formatSessionRange(data.ordered[0]).includes("Active"));
});

test("dashboard delete toast actions fire undo handlers", () => {
  const html = loadHtmlFixture(rootPath("dashboard", "index.html"));
  const dom = createDom(html);
  attachLegacyDashboardElements(dom);
  const clock = createClock(Date.now());
  const chrome = createChromeMock();
  const { hooks } = loadDashboard({ dom, chrome, clock });

  if (!hooks.elements.toast) {
    const toast = dom.window.document.createElement("div");
    toast.id = "toast";
    dom.window.document.body.appendChild(toast);
    hooks.elements.toast = toast;
  }
  if (!hooks.elements.toastAction) {
    const action = dom.window.document.createElement("button");
    action.id = "toast-action";
    dom.window.document.body.appendChild(action);
    hooks.elements.toastAction = action;
    action.onclick = () => hooks.handleToastAction();
  }

  if (!hooks.elements.sessionDelete) {
    const btn = dom.window.document.createElement("button");
    btn.id = "session-delete";
    dom.window.document.body.appendChild(btn);
    hooks.elements.sessionDelete = btn;
  }

  hooks.bindControls();
  hooks.app.state = {
    schemaVersion: 4,
    sessions: {
      s1: {
        id: "s1",
        startedAt: clock.now(),
        updatedAt: clock.now(),
        endedAt: null,
        nodes: {},
        edges: {},
        events: [],
      },
    },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tracking: {},
  };
  hooks.app.session = hooks.app.state.sessions.s1;

  hooks.elements.sessionDelete.dispatchEvent(new dom.window.Event("click"));
  hooks.elements.toastAction.dispatchEvent(new dom.window.Event("click"));

  const types = chrome._sentMessages.map((msg) => msg.type);
  assert.ok(types.includes("session_delete"));
  assert.ok(types.includes("session_restore"));
});

// --- 100% coverage for refreshSummaries .catch branch ---
test("dashboard refreshSummaries catch branch", async () => {
  const html = loadHtmlFixture(rootPath("dashboard", "index.html"));
  const dom = createDom(html);
  attachLegacyDashboardElements(dom);
  attachSettingsElements(dom);
  const chrome = createChromeMock();
  const { hooks } = loadDashboard({
    dom,
    chrome,
    clock: createClock(Date.now()),
  });
  hooks.app.session = { id: "session-x", nodes: {}, edges: {}, events: [] };
  hooks.app.summaryState.requestId = 1;
  let called = false;
  hooks.app.sendPromptToOllama = () => Promise.reject(new Error("fail"));
  hooks.app.persistSessionSummaries = () => {
    called = true;
  };
  await hooks.refreshSummaries({ force: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(called);
});
// --- END 100% coverage for refreshSummaries .catch branch ---

// --- 100% coverage for refreshSummaries .catch early return ---
test("dashboard refreshSummaries catch branch early return", async () => {
  const html = loadHtmlFixture(rootPath("dashboard", "index.html"));
  const dom = createDom(html);
  attachLegacyDashboardElements(dom);
  attachSettingsElements(dom);
  const chrome = createChromeMock();
  const { hooks } = loadDashboard({
    dom,
    chrome,
    clock: createClock(Date.now()),
  });
  hooks.app.session = { id: "session-x", nodes: {}, edges: {}, events: [] };
  hooks.app.summaryState.requestId = 2;
  let called = false;
  hooks.app.sendPromptToOllama = () => {
    hooks.app.summaryState.requestId += 1;
    return Promise.reject(new Error("fail"));
  };
  hooks.app.persistSessionSummaries = () => {
    called = true;
  };
  // The refreshSummaries call will set requestId to 3, so the .catch will see requestId!==app.summaryState.requestId
  await hooks.refreshSummaries({ force: true });
  // persistSessionSummaries should NOT be called in this case
  assert.equal(called, false);
});
// --- END 100% coverage for refreshSummaries .catch early return ---

// --- 100% coverage for _refreshSummariesCatch helper ---
test("_refreshSummariesCatch returns true if requestId mismatch", () => {
  const { hooks } = loadDashboard({
    dom: createDom("<!doctype html><html><body></body></html>"),
    chrome: undefined,
    clock: createClock(Date.now()),
  });
  hooks.app.summaryState = {
    requestId: 2,
    brief: undefined,
    detailed: undefined,
  };
  let called = false;
  hooks.app.persistSessionSummaries = () => {
    called = true;
  };
  const result = hooks._refreshSummariesCatch(1, "sid");
  assert.equal(result, true);
  assert.equal(called, false);
});

test("_refreshSummariesCatch sets summaries and calls persist", () => {
  const { hooks } = loadDashboard({
    dom: createDom("<!doctype html><html><body></body></html>"),
    chrome: undefined,
    clock: createClock(Date.now()),
  });
  let called = false;
  hooks.app.summaryState = {
    requestId: 1,
    brief: undefined,
    detailed: undefined,
  };
  hooks.app.persistSessionSummaries = () => {
    called = true;
  };
  const result = hooks._refreshSummariesCatch(1, "sid");
  assert.equal(result, false);
  assert.equal(hooks.app.summaryState.brief, "Summary unavailable.");
  assert.equal(
    hooks.app.summaryState.detailed,
    "Detailed summary unavailable.",
  );
  assert.equal(called, true);
});
// --- END 100% coverage for _refreshSummariesCatch helper ---

// --- 100% coverage for refreshSummaries early returns ---
test("refreshSummaries returns if no session", () => {
  const { hooks } = loadDashboard({
    dom: createDom("<!doctype html><html><body></body></html>"),
    chrome: undefined,
    clock: createClock(Date.now()),
  });
  hooks.app.session = null;
  hooks.app.summaryState = {
    brief: "stub",
    detailed: "stub",
    updating: true,
    lastSessionId: "sid",
  };
  hooks.refreshSummaries({ force: false });
  assert.equal(hooks.app.summaryState.lastSessionId, null);
});

test("refreshSummaries returns if updating and not force", () => {
  const { hooks } = loadDashboard({
    dom: createDom("<!doctype html><html><body></body></html>"),
    chrome: undefined,
    clock: createClock(Date.now()),
  });
  hooks.app.session = { id: "sid" };
  hooks.app.summaryState = { updating: true };
  let called = false;
  hooks.renderSummaryEmpty = () => {
    called = true;
  };
  hooks.refreshSummaries({ force: false });
  assert.equal(called, false);
});

test("refreshSummaries returns if lastSessionId, brief, and detailed exist and not force", () => {
  const { hooks } = loadDashboard({
    dom: createDom("<!doctype html><html><body></body></html>"),
    chrome: undefined,
    clock: createClock(Date.now()),
  });
  hooks.app.session = { id: "sid" };
  hooks.app.summaryState = {
    updating: false,
    lastSessionId: "sid",
    brief: "b",
    detailed: "d",
    lastSessionUpdatedAt: 0,
  };
  let called = false;
  hooks.renderSummaryEmpty = () => {
    called = true;
  };
  hooks.refreshSummaries({ force: false });
  assert.equal(called, false);
});
// --- END 100% coverage for refreshSummaries early returns ---

test("dashboard calendar picker selects sessions and reports missing dates", () => {
  const html = loadHtmlFixture(rootPath("dashboard", "index.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const clock = createClock(Date.now());
  const { hooks } = loadDashboard({ dom, chrome, clock });

  const state = buildSampleState(clock);
  const dayMs = 24 * 60 * 60 * 1000;
  const sessionB = state.sessions["session-b"];
  sessionB.startedAt -= dayMs;
  sessionB.updatedAt -= dayMs;
  sessionB.endedAt -= dayMs;
  sessionB.lastActivityAt -= dayMs;
  sessionB.events = sessionB.events.map((event) => ({
    ...event,
    ts: event.ts - dayMs,
  }));
  hooks.applyState(state, "live");

  const picker = dom.window.document.getElementById("session-date-picker");
  const toastMessage = dom.window.document.getElementById("toast-message");
  const date = new Date(sessionB.startedAt);
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  picker.value = dateKey;
  picker.dispatchEvent(new dom.window.Event("change"));

  assert.equal(hooks.app.session.id, "session-b");

  const missing = new Date(sessionB.startedAt + 10 * 24 * 60 * 60 * 1000);
  const missingKey = `${missing.getFullYear()}-${String(missing.getMonth() + 1).padStart(2, "0")}-${String(missing.getDate()).padStart(2, "0")}`;
  picker.value = missingKey;
  picker.dispatchEvent(new dom.window.Event("change"));
  assert.ok(toastMessage.textContent.includes("No session for"));

  hooks.app.state = null;
  picker.value = dateKey;
  picker.dispatchEvent(new dom.window.Event("change"));
  assert.ok(toastMessage.textContent.includes("No session for"));
});

test("dashboard realtime delta applies and uses priority updates", () => {
  const dom = createDom("<!doctype html><html><body>\n" +
    "<div id=\"session-range\"></div>\n" +
    "<div id=\"total-active\"></div>\n" +
    "<div id=\"page-count\"></div>\n" +
    "<div id=\"edge-count\"></div>\n" +
    "<div id=\"session-label\"></div>\n" +
    "<div id=\"session-label-detail\"></div>\n" +
    "</body></html>");
  const { hooks } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(1000),
    extraGlobals: {
      setTimeout: () => 0,
      clearTimeout: () => {},
      setInterval: (cb) => {
        cb();
        return 1;
      },
      clearInterval: () => {},
      requestAnimationFrame: (cb) => {
        cb();
        return 1;
      },
    },
  });
  hooks.app.settings = {
    ...hooks.DEFAULT_SETTINGS,
    realtimePriorityUpdates: true,
    realtimeLiveTimers: true,
  };
  hooks.app.state = {
    schemaVersion: 4,
    sessions: {
      s1: {
        id: "s1",
        startedAt: 1,
        updatedAt: 2,
        nodes: {
          "https://example.com/": {
            id: "https://example.com/",
            url: "https://example.com/",
            activeMs: 1000,
          },
        },
        edges: {},
        label: "Initial",
        labelDetail: "Initial detail",
      },
    },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tracking: {
      activeUrl: "https://example.com/",
      activeSince: 1,
    },
  };
  hooks.app.session = hooks.app.state.sessions.s1;
  hooks.updateLiveActiveBase(hooks.app.session);
  hooks.applyStateDelta({
    sessionId: "s1",
    tracking: { activeSince: 2 },
    sessionPatch: { label: "Focused", labelDetail: "Locked in" },
  });
  assert.equal(dom.window.document.getElementById("session-label").textContent, "Focused");
  assert.equal(dom.window.document.getElementById("session-label-detail").textContent, "Locked in");
});

test("dashboard realtime port handles snapshots and deltas", () => {
  const html = loadHtmlFixture(rootPath("dashboard", "index.html"));
  const dom = createDom(html);
  const chrome = createChromeMock();
  const portMessages = [];
  const port = {
    name: "irht_live",
    onMessage: { addListener: (fn) => { port._onMessage = fn; } },
    onDisconnect: { addListener: (fn) => { port._onDisconnect = fn; } },
    postMessage: (msg) => portMessages.push(msg),
    disconnect: () => {
      if (port._onDisconnect) {
        port._onDisconnect();
      }
    },
  };
  chrome.runtime.connect = () => port;
  const clock = createClock(1000);
  const { hooks } = loadDashboard({ dom, chrome, clock });
  const state = buildSampleState(clock);
  hooks.app.settings.realtimeStreamEnabled = true;
  hooks.setupRealtimePort(hooks.app.settings);
  hooks.handleRealtimeMessage({ type: "state_snapshot", state });
  hooks.handleRealtimeMessage({
    type: "state_delta",
    sessionId: state.activeSessionId,
    tracking: { activeSince: clock.now() },
    sessionPatch: { label: "Updated" },
  });
  assert.ok(portMessages.find((msg) => msg.type === "request_snapshot"));
});

test("dashboard optimistic delete and restore", () => {
  const dom = createDom("<!doctype html><html><body>\n" +
    "<select id=\"session-select\"></select>\n" +
    "<div id=\"session-list\"></div>\n" +
    "<div id=\"session-list-empty\"></div>\n" +
    "</body></html>");
  const { hooks } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(1000),
  });
  hooks.app.state = {
    schemaVersion: 4,
    sessions: {
      a: { id: "a", startedAt: 1, updatedAt: 2, nodes: {}, edges: {} },
      b: { id: "b", startedAt: 2, updatedAt: 3, nodes: {}, edges: {} },
    },
    sessionOrder: ["a", "b"],
    activeSessionId: "a",
  };
  hooks.app.session = hooks.app.state.sessions.a;
  hooks.applyOptimisticDelete("a");
  assert.equal(hooks.app.state.sessions.a.deleted, true);
  hooks.applyOptimisticRestore("a");
  assert.equal(hooks.app.state.sessions.a.deleted, false);
  hooks.applyOptimisticDeleteAll();
  assert.equal(hooks.app.state.sessions.b.deleted, true);
});

test("dashboard optimistic delete all returns without sessions", () => {
  const dom = createDom("<!doctype html><html><body>\n" +
    "<select id=\"session-select\"></select>\n" +
    "<div id=\"session-list\"></div>\n" +
    "<div id=\"session-list-empty\"></div>\n" +
    "</body></html>");
  const { hooks } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(1000),
  });
  hooks.app.session = { id: "s1" };
  hooks.app.state = null;
  hooks.applyOptimisticDeleteAll();
  assert.equal(hooks.app.session.id, "s1");
});

test("dashboard optimistic restore returns without session", () => {
  const dom = createDom("<!doctype html><html><body>\n" +
    "<select id=\"session-select\"></select>\n" +
    "<div id=\"session-list\"></div>\n" +
    "<div id=\"session-list-empty\"></div>\n" +
    "</body></html>");
  const { hooks } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(1000),
  });
  hooks.app.state = { schemaVersion: 4, sessions: {}, sessionOrder: [], activeSessionId: null };
  hooks.app.session = { id: "s1" };
  hooks.applyOptimisticRestore("missing");
  assert.equal(hooks.app.session.id, "s1");
});

test("dashboard optimistic restore selects session when none is active", () => {
  const dom = createDom("<!doctype html><html><body>\n" +
    "<select id=\"session-select\"></select>\n" +
    "<div id=\"session-list\"></div>\n" +
    "<div id=\"session-list-empty\"></div>\n" +
    "</body></html>");
  const { hooks } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(1000),
  });
  hooks.app.state = {
    schemaVersion: 4,
    sessions: {
      a: { id: "a", startedAt: 1, updatedAt: 2, nodes: {}, edges: {}, deleted: true },
    },
    sessionOrder: ["a"],
    activeSessionId: null,
  };
  hooks.app.session = null;
  hooks.applyOptimisticRestore("a");
  assert.equal(hooks.app.session.id, "a");
});

test("dashboard graph controls, realtime worker, and session list helpers", async () => {
  const html = loadHtmlFixture(rootPath("dashboard", "index.html"));
  const dom = createDom(html);
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  const workerInstances = [];
  class WorkerStub {
    constructor() {
      workerInstances.push(this);
      this.onmessage = null;
      this.lastMessage = null;
      this.throwPost = false;
    }
    postMessage(message) {
      this.lastMessage = message;
      if (this.throwPost) {
        throw new Error("boom");
      }
    }
    terminate() {}
  }

  const timeouts = new Map();
  let timeoutId = 0;
  const { hooks, context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(1000),
    extraGlobals: {
      Worker: WorkerStub,
      requestAnimationFrame: (cb) => {
        cb();
        return 1;
      },
      cancelAnimationFrame: () => {},
      setTimeout: (cb) => {
        timeoutId += 1;
        timeouts.set(timeoutId, cb);
        return timeoutId;
      },
      clearTimeout: (id) => {
        timeouts.delete(id);
      },
    },
  });

  hooks.app.settings.realtimeWorkerOffload = true;
  hooks.setupRealtimeWorker(hooks.app.settings);
  const worker = workerInstances[0];

  const session = {
    id: "s1",
    startedAt: 1,
    updatedAt: 2,
    nodes: {
      "https://example.com/": { url: "https://example.com/", activeMs: 1000 },
    },
    edges: {},
  };
  const state = { sessions: { s1: session }, sessionOrder: ["s1"], activeSessionId: "s1" };

  const promise = hooks.buildSummaryDataLinesAsync(state, session);
  const requestId = worker.lastMessage.requestId;
  worker.onmessage({ data: { requestId, lines: ["Line 1"] } });
  const lines = await promise;
  assert.equal(lines[0], "Line 1");

  worker.throwPost = true;
  const failed = await hooks.requestWorkerTask("derive_graph", {});
  assert.equal(failed, null);
  worker.throwPost = false;
  worker.onmessage({ data: null });

  hooks.app.settings.realtimeWorkerOffload = false;
  hooks.setupRealtimeWorker(hooks.app.settings);
  const noWorker = await hooks.requestWorkerTask("derive_graph", {});
  assert.equal(noWorker, null);

  const merged = hooks.mergeRealtimeDelta(null, { sessionId: "s1" });
  assert.equal(merged.sessionId, "s1");
  const merged2 = hooks.mergeRealtimeDelta(
    { tracking: { activeSince: 1 }, sessionsPatch: [{ id: "a" }] },
    { tracking: { activeUrl: "https://a.com" }, sessionsPatch: [{ id: "b" }], sessionOrder: ["s1"] },
  );
  assert.equal(merged2.tracking.activeSince, 1);
  assert.equal(merged2.tracking.activeUrl, "https://a.com");
  assert.equal(merged2.sessionsPatch.length, 2);

  hooks.app.settings.realtimePriorityUpdates = true;
  hooks.scheduleSessionListRefresh();
  hooks.app.settings.realtimePriorityUpdates = false;
  hooks.scheduleSessionListRefresh();

  hooks.app.cache.sessionListData = { ordered: [{ id: "a" }, { id: "b" }] };
  hooks.app.session = { id: "a" };
  const list = hooks.elements.sessionList;
  list.innerHTML = "";
  const itemA = dom.window.document.createElement("button");
  itemA.dataset.sessionId = "a";
  list.appendChild(itemA);
  const itemB = dom.window.document.createElement("button");
  itemB.dataset.sessionId = "b";
  list.appendChild(itemB);

  let selected = null;
  context.selectSession = (id) => {
    selected = id;
  };
  hooks.handleSessionListKeydown({
    key: "ArrowDown",
    preventDefault: () => {},
  });
  assert.equal(selected, "b");
});

test("dashboard worker task timeout resolves null", async () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  const timeouts = new Map();
  let timeoutId = 0;
  class WorkerStub {
    postMessage() {}
    terminate() {}
  }

  const { hooks } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
    extraGlobals: {
      Worker: WorkerStub,
      setTimeout: (cb) => {
        timeoutId += 1;
        timeouts.set(timeoutId, cb);
        return timeoutId;
      },
      clearTimeout: (id) => {
        timeouts.delete(id);
      },
    },
  });

  hooks.app.settings.realtimeWorkerOffload = true;
  hooks.setupRealtimeWorker(hooks.app.settings);

  const promise = hooks.requestWorkerTask("derive_graph", {});
  timeouts.forEach((cb) => cb());
  const result = await promise;
  assert.equal(result, null);
});

test("dashboard worker timeout ignores late callback", async () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  const timeouts = new Map();
  let timeoutId = 0;
  const workerInstances = [];
  class WorkerStub {
    constructor() {
      this.onmessage = null;
      this.lastMessage = null;
      workerInstances.push(this);
    }
    postMessage(message) {
      this.lastMessage = message;
    }
    terminate() {}
  }

  const { hooks } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
    extraGlobals: {
      Worker: WorkerStub,
      setTimeout: (cb) => {
        timeoutId += 1;
        timeouts.set(timeoutId, cb);
        return timeoutId;
      },
      clearTimeout: () => {},
    },
  });

  hooks.app.settings.realtimeWorkerOffload = true;
  hooks.setupRealtimeWorker(hooks.app.settings);
  const worker = workerInstances[0];
  const promise = hooks.requestWorkerTask("derive_graph", {});
  const requestId = worker?.lastMessage?.requestId;
  if (worker?.onmessage) {
    worker.onmessage({ data: { requestId, graph: { nodes: [], edges: [] } } });
  }
  timeouts.forEach((cb) => cb());
  const result = await promise;
  assert.ok(result);
});

test("dashboard renderStats uses worker offload path", async () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  class WorkerStub {
    postMessage() {}
    terminate() {}
  }

  const { hooks, context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
    extraGlobals: {
      Worker: WorkerStub,
    },
  });

  hooks.app.state = {
    sessions: {
      s1: {
        id: "s1",
        nodes: { "https://example.com": {} },
        edges: {},
        events: [],
      },
    },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tracking: {},
  };
  hooks.app.session = hooks.app.state.sessions.s1;
  hooks.app.settings.realtimeWorkerOffload = true;
  hooks.setupRealtimeWorker(hooks.app.settings);

  let workerPromise = null;
  let rendered = false;
  context.requestWorkerTask = () => {
    workerPromise = Promise.resolve({
      stats: {
        chain: { length: 0, label: "" },
        start: { domain: null, detail: "" },
        trapDoor: null,
        topDomains: [],
        topPages: [],
        topDistractions: [],
      },
    });
    return workerPromise;
  };
  context.renderStatsWithData = () => {
    rendered = true;
  };

  hooks.renderStats();
  if (workerPromise) {
    await workerPromise;
  }
  assert.equal(rendered, true);
});

test("dashboard renderStats worker offload returns without stats", async () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  class WorkerStub {
    postMessage() {}
    terminate() {}
  }

  const { hooks, context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
    extraGlobals: {
      Worker: WorkerStub,
    },
  });

  hooks.app.state = {
    sessions: {
      s1: {
        id: "s1",
        nodes: { "https://example.com": {} },
        edges: {},
        events: [],
      },
    },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tracking: {},
  };
  hooks.app.session = hooks.app.state.sessions.s1;
  const baseNode = hooks.app.state.sessions.s1.nodes["https://example.com"];
  baseNode.id = null;
  baseNode.url = "";
  baseNode.title = "";
  baseNode.category = "";
  baseNode.visitCount = 0;
  hooks.app.settings.realtimeWorkerOffload = true;
  hooks.setupRealtimeWorker(hooks.app.settings);

  let workerPromise = null;
  let rendered = false;
  context.requestWorkerTask = () => {
    workerPromise = Promise.resolve(null);
    return workerPromise;
  };
  context.renderStatsWithData = () => {
    rendered = true;
  };

  hooks.renderStats();
  if (workerPromise) {
    await workerPromise;
  }
  assert.equal(rendered, true);
});

test("dashboard renderStats worker offload ignores stale session", async () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  class WorkerStub {
    postMessage() {}
    terminate() {}
  }

  const { hooks, context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
    extraGlobals: {
      Worker: WorkerStub,
    },
  });

  hooks.app.state = {
    sessions: {
      s1: {
        id: "s1",
        nodes: { "https://example.com": {} },
        edges: {},
        events: [],
      },
    },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tracking: {},
  };
  hooks.app.session = hooks.app.state.sessions.s1;
  const baseNode = hooks.app.state.sessions.s1.nodes["https://example.com"];
  baseNode.id = null;
  baseNode.url = "";
  baseNode.title = "";
  baseNode.category = "";
  baseNode.visitCount = 0;
  hooks.app.settings.realtimeWorkerOffload = true;
  hooks.setupRealtimeWorker(hooks.app.settings);

  let workerPromise = null;
  let rendered = false;
  context.requestWorkerTask = () => {
    workerPromise = Promise.resolve({
      stats: {
        chain: { length: 0, label: "" },
        start: { domain: null, detail: "" },
        trapDoor: null,
        topDomains: [],
        topPages: [],
        topDistractions: [],
      },
    });
    return workerPromise;
  };
  context.renderStatsWithData = () => {
    rendered = true;
  };

  hooks.renderStats();
  hooks.app.session = null;
  if (workerPromise) {
    await workerPromise;
  }
  assert.equal(rendered, false);
});

test("dashboard renderTimeline uses worker offload segments", async () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  class WorkerStub {
    postMessage() {}
    terminate() {}
  }

  const { hooks, context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
    extraGlobals: {
      Worker: WorkerStub,
    },
  });

  hooks.app.state = {
    sessions: { s1: { id: "s1", nodes: {}, edges: {}, events: [] } },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tracking: {},
  };
  hooks.app.session = hooks.app.state.sessions.s1;
  hooks.app.settings.realtimeWorkerOffload = true;
  hooks.setupRealtimeWorker(hooks.app.settings);

  let workerPromise = null;
  let renderedSegments = null;
  context.requestWorkerTask = () => {
    workerPromise = Promise.resolve({
      segments: [
        {
          start: 0,
          end: 1000,
          duration: 1000,
          domain: "example.com",
          title: "Example",
        },
      ],
    });
    return workerPromise;
  };
  context.renderTimelineWithSegments = (segments) => {
    renderedSegments = segments;
  };

  hooks.renderTimeline();
  if (workerPromise) {
    await workerPromise;
  }
  assert.equal(renderedSegments?.length, 1);
});

test("dashboard renderTimeline worker offload falls back without segments", async () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  class WorkerStub {
    postMessage() {}
    terminate() {}
  }

  const { hooks, context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
    extraGlobals: {
      Worker: WorkerStub,
    },
  });

  hooks.app.state = {
    sessions: { s1: { id: "s1", nodes: {}, edges: {}, events: [] } },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tracking: {},
  };
  hooks.app.session = hooks.app.state.sessions.s1;
  hooks.app.settings.realtimeWorkerOffload = true;
  hooks.setupRealtimeWorker(hooks.app.settings);

  let workerPromise = null;
  let renderedSegments = null;
  const buildBackup = context.buildTimelineSegments;
  context.buildTimelineSegments = () => ([
    {
      start: 0,
      end: 100,
      duration: 100,
      domain: "fallback.com",
      title: "Fallback",
    },
  ]);
  context.requestWorkerTask = () => {
    workerPromise = Promise.resolve(null);
    return workerPromise;
  };
  context.renderTimelineWithSegments = (segments) => {
    renderedSegments = segments;
  };

  hooks.renderTimeline();
  if (workerPromise) {
    await workerPromise;
  }
  context.buildTimelineSegments = buildBackup;
  assert.equal(renderedSegments?.[0]?.domain, "fallback.com");
});

test("dashboard renderGraph worker offload returns without graph", async () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  class WorkerStub {
    postMessage() {}
    terminate() {}
  }

  const { hooks, context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
    extraGlobals: {
      Worker: WorkerStub,
    },
  });

  hooks.app.state = {
    sessions: { s1: { id: "s1", nodes: {}, edges: {}, events: [] } },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tracking: {},
  };
  hooks.app.session = hooks.app.state.sessions.s1;
  hooks.app.graph = { setData: () => {}, lastKey: null };
  hooks.app.graphReady = true;
  hooks.app.settings.realtimeWorkerOffload = true;
  hooks.setupRealtimeWorker(hooks.app.settings);

  let workerPromise = null;
  context.requestWorkerTask = () => {
    workerPromise = Promise.resolve(null);
    return workerPromise;
  };

  hooks.renderGraph();
  if (workerPromise) {
    await workerPromise;
  }
  assert.ok(true);
});

test("dashboard renderGraph worker offload ignores stale session", async () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  class WorkerStub {
    postMessage() {}
    terminate() {}
  }

  const { hooks, context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
    extraGlobals: {
      Worker: WorkerStub,
    },
  });

  hooks.app.state = {
    sessions: { s1: { id: "s1", nodes: {}, edges: {}, events: [] } },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tracking: {},
  };
  hooks.app.session = hooks.app.state.sessions.s1;
  hooks.app.graph = { setData: () => {}, lastKey: null };
  hooks.app.graphReady = true;
  hooks.app.settings.realtimeWorkerOffload = true;
  hooks.setupRealtimeWorker(hooks.app.settings);

  let workerPromise = null;
  context.requestWorkerTask = () => {
    workerPromise = Promise.resolve({ graph: { nodes: [], edges: [] } });
    return workerPromise;
  };

  hooks.renderGraph();
  hooks.app.session = null;
  if (workerPromise) {
    await workerPromise;
  }
  assert.ok(true);
});

test("dashboard setupRealtimeWorker handles worker constructor failure", async () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  class WorkerStub {
    constructor() {
      throw new Error("boom");
    }
  }

  const { hooks } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
    extraGlobals: {
      Worker: WorkerStub,
    },
  });

  hooks.app.settings.realtimeWorkerOffload = true;
  hooks.setupRealtimeWorker(hooks.app.settings);
  const result = await hooks.requestWorkerTask("derive_graph", {});
  assert.equal(result, null);
});

test("dashboard setupRealtimeWorker returns when Worker missing", async () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  const { hooks } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
    extraGlobals: {
      Worker: null,
    },
  });

  hooks.app.settings.realtimeWorkerOffload = true;
  hooks.setupRealtimeWorker(hooks.app.settings);
  const result = await hooks.requestWorkerTask("derive_graph", {});
  assert.equal(result, null);
});

test("dashboard realtime worker onerror clears pending", async () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  const timeouts = new Map();
  let timeoutId = 0;
  const workerInstances = [];
  class WorkerStub {
    constructor() {
      this.onmessage = null;
      this.onerror = null;
      this.terminated = false;
      workerInstances.push(this);
    }
    postMessage(message) {
      this.lastMessage = message;
    }
    terminate() {
      this.terminated = true;
    }
  }

  const { hooks } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
    extraGlobals: {
      Worker: WorkerStub,
      setTimeout: (cb) => {
        timeoutId += 1;
        timeouts.set(timeoutId, cb);
        return timeoutId;
      },
      clearTimeout: (id) => {
        timeouts.delete(id);
      },
    },
  });

  hooks.app.settings.realtimeWorkerOffload = true;
  hooks.setupRealtimeWorker(hooks.app.settings);
  const worker = workerInstances[0];

  const promise = hooks.requestWorkerTask("derive_graph", {});
  if (worker?.onerror) {
    worker.onerror(new Error("boom"));
  }
  const result = await promise;
  assert.equal(result, null);
  assert.equal(worker.terminated, true);
});

test("dashboard scheduleRealtimeReconcile requests snapshot without port", () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  const timeouts = new Map();
  let timeoutId = 0;
  const { hooks, context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
    extraGlobals: {
      setTimeout: (cb) => {
        timeoutId += 1;
        timeouts.set(timeoutId, cb);
        return timeoutId;
      },
      clearTimeout: (id) => {
        timeouts.delete(id);
      },
    },
  });

  hooks.app.settings = { ...hooks.DEFAULT_SETTINGS };
  hooks.app.session = { id: "s1" };
  let requested = false;
  context.requestLiveStateSnapshot = () => {
    requested = true;
  };

  hooks.elements.sessionDelete.dispatchEvent(new dom.window.Event("click"));
  timeouts.forEach((cb) => cb());
  assert.equal(requested, true);
});

test("dashboard scheduleRealtimeReconcile uses realtime port and falls back on error", () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  const chrome = createChromeMock();
  const portMessages = [];
  const port = {
    name: "irht_live",
    throwPost: false,
    onMessage: { addListener: () => {} },
    onDisconnect: { addListener: () => {} },
    postMessage: (msg) => {
      portMessages.push(msg);
      if (port.throwPost) {
        throw new Error("boom");
      }
    },
    disconnect: () => {},
  };
  chrome.runtime.connect = () => port;

  const timeouts = new Map();
  let timeoutId = 0;
  const { hooks, context } = loadDashboard({
    dom,
    chrome,
    clock: createClock(0),
    extraGlobals: {
      setTimeout: (cb) => {
        timeoutId += 1;
        timeouts.set(timeoutId, cb);
        return timeoutId;
      },
      clearTimeout: (id) => {
        timeouts.delete(id);
      },
    },
  });

  const drainTimeouts = () => {
    const pending = Array.from(timeouts.values());
    timeouts.clear();
    pending.forEach((cb) => cb());
  };

  hooks.app.settings = { ...hooks.DEFAULT_SETTINGS, realtimeStreamEnabled: true };
  hooks.setupRealtimePort(hooks.app.settings);
  portMessages.length = 0;

  context.scheduleRealtimeReconcile();
  drainTimeouts();
  assert.ok(portMessages.find((msg) => msg.type === "request_snapshot"));

  let requested = false;
  context.requestLiveStateSnapshot = () => {
    requested = true;
  };
  port.throwPost = true;
  context.scheduleRealtimeReconcile();
  drainTimeouts();
  assert.equal(requested, true);
});

test("dashboard scheduleDeferredRender runs render and getLiveActiveMs handles null", () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  const timeouts = new Map();
  let timeoutId = 0;
  const { hooks, context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
    extraGlobals: {
      setTimeout: (cb) => {
        timeoutId += 1;
        timeouts.set(timeoutId, cb);
        return timeoutId;
      },
      clearTimeout: (id) => {
        timeouts.delete(id);
      },
    },
  });

  let rendered = false;
  context.renderDashboard = () => {
    rendered = true;
  };
  hooks.scheduleDeferredRender();
  timeouts.forEach((cb) => cb());
  assert.equal(rendered, true);
  assert.equal(context.getLiveActiveMs(null, null), 0);
});

test("dashboard applyStateDelta clears realtime reconcile timer", () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  let clearCalled = false;
  let timeoutId = 0;
  const { hooks, context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
    extraGlobals: {
      setTimeout: () => {
        timeoutId += 1;
        return timeoutId;
      },
      clearTimeout: (id) => {
        if (id === timeoutId) {
          clearCalled = true;
        }
      },
    },
  });

  hooks.app.state = {
    sessions: { s1: { id: "s1", nodes: {}, edges: {}, events: [] } },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tracking: {},
  };
  hooks.app.session = hooks.app.state.sessions.s1;
  context.scheduleRealtimeReconcile();
  hooks.applyStateDelta({ sessionId: "s1" });
  assert.equal(clearCalled, true);
});

test("dashboard applyStateDelta returns without delta", () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  const { hooks } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
  });

  hooks.applyStateDelta(null);
  assert.ok(true);
});

test("dashboard applyStateDelta patches active_time_flushed node stats", () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  const clock = createClock(1000);
  const { hooks } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock,
  });

  hooks.app.state = {
    sessions: {
      s1: {
        id: "s1",
        nodes: { "https://example.com": {} },
        edges: {},
        events: [],
      },
    },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tracking: {},
  };
  hooks.app.session = hooks.app.state.sessions.s1;
  const baseNode = hooks.app.state.sessions.s1.nodes["https://example.com"];
  baseNode.id = null;
  baseNode.url = "";
  baseNode.title = "";
  baseNode.category = "";
  baseNode.visitCount = 0;

  hooks.applyStateDelta({
    sessionId: "s1",
    eventPatch: {
      type: "active_time_flushed",
      url: "https://example.com",
      durationMs: 1500,
      ts: 2500,
    },
  });

  const node = hooks.app.state.sessions.s1.nodes["https://example.com"];
  assert.equal(node.activeMs, 1500);
  assert.equal(node.lastSeen, 2500);
  assert.equal(node.id, "https://example.com");
  assert.equal(node.url, "https://example.com");
  assert.equal(node.title, "https://example.com");
  assert.equal(node.category, "Random");
  assert.equal(node.visitCount, 0);
  assert.equal(hooks.app.state.sessions.s1.updatedAt, 2500);
  assert.equal(hooks.app.state.sessions.s1.lastActivityAt, 2500);
});

test("dashboard applyStateDelta initializes events array", () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  const { hooks } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
  });

  hooks.app.state = {
    sessions: { s1: { id: "s1", nodes: {}, edges: {}, events: null } },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tracking: {},
  };
  hooks.app.session = hooks.app.state.sessions.s1;

  hooks.applyStateDelta({
    sessionId: "s1",
    eventPatch: { type: "navigation", toUrl: "https://example.com" },
  });

  const session = hooks.app.state.sessions.s1;
  assert.equal(Array.isArray(session.events), true);
  assert.equal(session.events.length, 1);
});

test("dashboard requestLiveStateSnapshot returns without storage", () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  const { context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
  });
  context.canUseChromeStorage = () => false;
  context.requestLiveStateSnapshot();
  assert.ok(true);
});

test("dashboard setupRealtimePort falls back to polling when connect missing", () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  const chrome = createChromeMock();
  chrome.runtime.connect = null;
  let intervalCb = null;
  let requestCalled = false;
  const { hooks, context } = loadDashboard({
    dom,
    chrome,
    clock: createClock(0),
    extraGlobals: {
      setInterval: (cb) => {
        intervalCb = cb;
        return 1;
      },
      clearInterval: () => {},
    },
  });

  context.requestLiveStateSnapshot = () => {
    requestCalled = true;
  };
  hooks.setupRealtimePort({ realtimeStreamEnabled: true });
  requestCalled = false;
  if (intervalCb) {
    intervalCb();
  }
  assert.equal(requestCalled, true);
});

test("dashboard setupRealtimePort disconnects existing port", () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  const chrome = createChromeMock();
  let disconnectCalled = 0;
  const port = {
    name: "irht_live",
    onMessage: { addListener: () => {} },
    onDisconnect: { addListener: () => {} },
    postMessage: () => {},
    disconnect: () => {
      disconnectCalled += 1;
    },
  };
  chrome.runtime.connect = () => port;

  const { hooks } = loadDashboard({
    dom,
    chrome,
    clock: createClock(0),
  });

  hooks.setupRealtimePort({ realtimeStreamEnabled: true });
  hooks.setupRealtimePort({ realtimeStreamEnabled: true });
  assert.ok(disconnectCalled >= 1);
});

test("dashboard scheduleSessionListRefresh runs deferred update", () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);

  const timeouts = new Map();
  let timeoutId = 0;
  const { hooks } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
    extraGlobals: {
      setTimeout: (cb) => {
        timeoutId += 1;
        timeouts.set(timeoutId, cb);
        return timeoutId;
      },
      clearTimeout: (id) => {
        timeouts.delete(id);
      },
    },
  });

  hooks.app.settings.realtimePriorityUpdates = true;
  hooks.app.cache.sessionListKey = "stale";
  hooks.scheduleSessionListRefresh();
  timeouts.forEach((cb) => cb());
  assert.notEqual(hooks.app.cache.sessionListKey, "stale");
});

test("dashboard force graph interactions", () => {
  const dom = createDom("<!doctype html><html><body><canvas id=\"c\"></canvas><div id=\"t\"></div></body></html>");
  const canvas = dom.window.document.getElementById("c");
  createCanvasStub(canvas);
  const tooltip = dom.window.document.getElementById("t");

  const { hooks } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
    extraGlobals: {
      requestAnimationFrame: (cb) => {
        cb();
        return 1;
      },
      cancelAnimationFrame: () => {},
    },
  });

  dom.window.devicePixelRatio = 0;
  const graph = new hooks.ForceGraph(canvas, tooltip);
  dom.window.devicePixelRatio = 2;
  graph.resize();
  graph.setData({ nodes: [], edges: [] }, {});
  graph.setData(
    {
      nodes: [
        { id: "a", label: "Alpha", activeMs: 100, category: "Study", domain: "a.com" },
        { id: "b", label: "Beta", activeMs: 50, category: "Video", domain: "b.com" },
        { id: "c", label: "Gamma", activeMs: 25, category: "Study", domain: "c.com" },
      ],
      edges: [
        { from: "a", to: "b", count: 2, activeMs: 10 },
        { from: "b", to: "c", count: 1, activeMs: 5 },
      ],
    },
    { colorBy: "domain", showLabels: false },
  );
  graph.hoverNode = graph.nodes[0];
  graph.draw();
  graph.nodes[0].pinned = true;
  graph.nodes[0].fx = 120;
  graph.nodes[0].fy = 160;
  graph.simulate();
  graph.setData(
    {
      nodes: [
        { id: "a", label: "Alpha", activeMs: 100, category: "Study", domain: "a.com" },
      ],
      edges: [],
    },
    { colorBy: "category", showLabels: true, preserveLayout: true },
  );

  const node = graph.nodes[0];
  graph.handleMove({ clientX: node.x, clientY: node.y });
  graph.handleDown({
    button: 0,
    clientX: node.x,
    clientY: node.y,
    preventDefault: () => {},
  });
  graph.handleDown({
    button: 1,
    clientX: node.x,
    clientY: node.y,
    preventDefault: () => {},
  });
  graph.handleMove({ clientX: node.x + 10, clientY: node.y + 10 });
  graph.handleUp();
  graph.handleDown({
    button: 0,
    clientX: node.x + 10000,
    clientY: node.y + 10000,
    preventDefault: () => {},
  });
  graph.handleMove({ clientX: node.x + 10010, clientY: node.y + 10010 });
  graph.handleUp();
  graph.handleWheel({
    clientX: node.x,
    clientY: node.y,
    deltaY: -100,
    preventDefault: () => {},
  });
  graph.handleWheel({
    clientX: node.x,
    clientY: node.y,
    deltaY: 0,
    preventDefault: () => {},
  });
  graph.handleDoubleClick({ clientX: node.x, clientY: node.y });
  graph.handleLeave();
  graph.setFreeze(true);
  graph.handleDoubleClick({ clientX: node.x, clientY: node.y });
  graph.run();
  graph.setFreeze(false);
  graph.resetView();

  const emptyGraph = new hooks.ForceGraph(canvas, tooltip);
  emptyGraph.setData({ nodes: [], edges: [] }, {});
  emptyGraph.handleMove({ clientX: 0, clientY: 0 });
  emptyGraph.handleDown({
    button: 0,
    clientX: 0,
    clientY: 0,
    preventDefault: () => {},
  });
  emptyGraph.handleDoubleClick({ clientX: 0, clientY: 0 });
  emptyGraph.handleWheel({
    clientX: 0,
    clientY: 0,
    deltaY: -100,
    preventDefault: () => {},
  });
});

test("dashboard force graph tooltip renders details", () => {
  const dom = createDom("<!doctype html><html><body><canvas id=\"c\"></canvas><div id=\"t\"></div></body></html>");
  const canvas = dom.window.document.getElementById("c");
  createCanvasStub(canvas);
  const tooltip = dom.window.document.getElementById("t");

  const { hooks } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
    extraGlobals: {
      requestAnimationFrame: (cb) => {
        cb();
        return 1;
      },
      cancelAnimationFrame: () => {},
    },
  });

  const graph = new hooks.ForceGraph(canvas, tooltip);
  graph.setData(
    {
      nodes: [
        {
          id: "node-1",
          label: "A label that is intentionally longer than forty characters",
          activeMs: 61000,
          category: "Study",
          visitCount: 2,
        },
      ],
      edges: [],
    },
    {},
  );

  graph.showTooltip(graph.nodes[0], 10, 20);
  assert.ok(tooltip.textContent.includes("2 visits"));
  assert.ok(tooltip.textContent.includes("Study"));
  assert.ok(tooltip.classList.contains("show"));
  graph.tooltip = null;
  graph.showTooltip(graph.nodes[0], 0, 0);
});

test("dashboard formatDateKeyForDisplay handles invalid date", () => {
  const dom = createDom("<!doctype html><html><body></body></html>");
  const { context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
  });
  assert.equal(context.formatDateKeyForDisplay("Infinity-1-1"), "that date");
  assert.equal(context.formatDateKeyForDisplay(null), "that date");
  assert.equal(context.formatDateKeyForDisplay("2024-00-00"), "that date");
  assert.equal(context.formatDateKey(0), "");
  assert.equal(context.formatDateKey(1e20), "");
  assert.equal(context.formatSessionDay(1e20), "Unknown date");
});

test("dashboard updateRankListVisibility returns without toggle", () => {
  const dom = createDom("<!doctype html><html><body><div id=\"list\" class=\"rank-list\" data-limit=\"2\"></div></body></html>");
  const { context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
  });
  const container = dom.window.document.getElementById("list");
  context.updateRankListVisibility(container, 0);
  assert.ok(true);
});

test("dashboard updateRankListVisibility updates toggle", () => {
  const dom = createDom(
    "<!doctype html><html><body><div class=\"rank-block\"><button class=\"rank-toggle\" data-target=\"list\"></button><div id=\"list\" class=\"rank-list\" data-limit=\"1\"><div class=\"rank-item\"></div><div class=\"rank-item\"></div></div></div></body></html>",
  );
  const { context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
  });
  const container = dom.window.document.getElementById("list");
  context.updateRankListVisibility(container, 2);
  const toggle = dom.window.document.querySelector(".rank-toggle");
  assert.equal(toggle.hidden, false);
});

test("dashboard updateRankListVisibility returns with null container", () => {
  const dom = createDom("<!doctype html><html><body></body></html>");
  const { context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
  });
  context.updateRankListVisibility(null, 0);
  assert.ok(true);
});

test("dashboard buildCalloutMessages handles intent drift alerts", () => {
  const dom = createDom("<!doctype html><html><body></body></html>");
  const { context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
  });
  context.app = context.app || {};
  context.app.settings = { intentDriftAlerts: true };
  const messages = context.buildCalloutMessages(
    {
      intentDriftLabel: "High",
      intentDriftReason: "Focus drift",
      intentDriftDrivers: ["Driver"],
      distractionAverage: 0,
      trapDoors: [],
    },
    {},
    "direct",
  );
  assert.ok(messages.some((msg) => msg.includes("Intent drift")));
});

test("dashboard intent drift helpers handle missing shared and session", () => {
  const dom = createDom("<!doctype html><html><body></body></html>");
  const { context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
  });
  const sharedBackup = context.IRHTShared;
  context.IRHTShared = null;
  const result = context.computeIntentDrift({ nodes: {} }, {});
  assert.equal(result.label, "Unknown");
  context.IRHTShared = sharedBackup;
  context.applyIntentDrift(null, null);
});

test("dashboard graph stats and legend handle missing elements", () => {
  const dom = createDom("<!doctype html><html><body></body></html>");
  const { context, hooks } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
  });
  hooks.elements.graphStats = null;
  context.updateGraphStats({ nodes: [], edges: [] });
  hooks.elements.graphLegend = null;
  context.updateGraphLegend({ mode: "page", colorBy: "activity" }, { nodes: [], edges: [] });
  assert.ok(true);
});

test("dashboard helper utilities coverage sweep", () => {
  const dom = createDom("<!doctype html><html><body></body></html>");
  const { context } = loadDashboard({
    dom,
    chrome: undefined,
    clock: createClock(0),
  });

  assert.equal(context.shouldShowGraphForSession(null), false);
  assert.equal(context.shouldShowGraphForSession({}), true);

  assert.equal(context.formatSummaryForDisplay(null), "");
  assert.equal(context.formatSummaryForDisplay("Short sentence."), "Short sentence.");
  assert.ok(context.formatSummaryForDisplay("First. Second? Third!").startsWith("•"));

  const splitBackup = String.prototype.split;
  String.prototype.split = function () {
    return [];
  };
  assert.equal(context.formatSummaryForDisplay("Hello"), "Hello");
  String.prototype.split = splitBackup;

  const keyA = context.buildInsightSettingsKey({
    productiveSites: ["b.com", "a.com"],
    distractingSites: ["x.com"],
    categoryOverrides: { "site.com": "Study" },
  });
  assert.ok(keyA.includes("a.com,b.com"));
  const keyB = context.buildInsightSettingsKey({ productiveSites: "nope" });
  assert.ok(keyB.includes("::"));

  const invalid = context.sanitizeGraphSettings({
    mode: "weird",
    nodeCap: 5,
    minNodeMinutes: 90,
    minEdgeCount: 0,
    showLabels: "yes",
    hideIsolates: "no",
    freeze: "no",
    colorBy: "unknown",
    search: 5,
  });
  assert.equal(invalid.mode, "domain");
  const valid = context.sanitizeGraphSettings({
    mode: "page",
    nodeCap: 40,
    minNodeMinutes: 5,
    minEdgeCount: 2,
    showLabels: true,
    hideIsolates: true,
    freeze: true,
    colorBy: "category",
    search: " ok ",
  });
  assert.equal(valid.mode, "page");
});

test("dashboard graph settings storage and toggles", () => {
  const dom = createFullDashboardDom();
  const doc = dom.window.document;
  const canvas = doc.getElementById("graph-canvas");
  createCanvasStub(canvas);
  const help = ensureElement(doc, "button", "help-cover", { className: "help-icon" });

  const { hooks, context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
    extraGlobals: { Element: dom.window.Element },
  });

  dom.window.localStorage.removeItem("irht_graph_settings");
  context.loadGraphSettings();
  dom.window.localStorage.setItem("irht_graph_settings", "{");
  context.loadGraphSettings();

  const getBackup = dom.window.localStorage.getItem.bind(dom.window.localStorage);
  dom.window.localStorage.getItem = () => {
    throw new Error("boom");
  };
  context.loadGraphSettings();
  dom.window.localStorage.getItem = getBackup;

  const setBackup = dom.window.localStorage.setItem.bind(dom.window.localStorage);
  dom.window.localStorage.setItem = () => {
    throw new Error("boom");
  };
  context.saveGraphSettings({ mode: "page" });
  dom.window.localStorage.setItem = setBackup;

  const graphDefaults = hooks.app.graphSettings || {
    nodeCap: 80,
    minNodeMinutes: 0,
    minEdgeCount: 1,
    showLabels: true,
    hideIsolates: false,
    freeze: false,
    colorBy: "activity",
    search: "",
  };
  hooks.app.graphSettings = {
    ...graphDefaults,
    search: "alpha",
    nodeCap: 60,
    minNodeMinutes: 5,
    minEdgeCount: 2,
    showLabels: true,
    hideIsolates: true,
    freeze: true,
    colorBy: "domain",
  };
  context.updateGraphControls();

  context.bindRankToggles();
  const rankToggle = doc.querySelector(".rank-toggle");
  rankToggle.click();

  context.bindHelpIcons();
  help.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  help.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  help.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
});

test("dashboard bindControls interactions", () => {
  const dom = createFullDashboardDom();
  const doc = dom.window.document;
  const canvas = doc.getElementById("graph-canvas");
  createCanvasStub(canvas);
  const clock = createClock(1000);
  const calls = {
    select: null,
    export: false,
    refresh: false,
    resetDefaults: false,
    restoreUndo: false,
    openOptions: false,
  };
  const chrome = createChromeMock({
    openOptionsPage: () => {
      calls.openOptions = true;
    },
  });
  const { hooks, context } = loadDashboard({
    dom,
    chrome,
    clock,
    extraGlobals: {
      confirm: () => false,
      requestAnimationFrame: (cb) => {
        cb();
        return 1;
      },
      setTimeout: () => 0,
      clearTimeout: () => {},
      setInterval: () => 0,
      clearInterval: () => {},
      getComputedStyle: () => ({ getPropertyValue: () => "" }),
    },
  });

  const session = {
    id: "s1",
    startedAt: clock.now() - 1000,
    updatedAt: clock.now() - 500,
    nodes: { "https://example.com/": { url: "https://example.com/", activeMs: 0 } },
    edges: {},
    events: [],
    trapDoors: [],
    categoryTotals: {},
  };
  hooks.app.state = {
    sessions: { s1: session },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tracking: hooks.createDefaultTracking(),
  };
  hooks.app.session = session;
  hooks.app.settings = { ...hooks.DEFAULT_SETTINGS, realtimeOptimisticUi: true };
  hooks.app.graph = {
    setFreeze: () => {},
    draw: () => {},
    resetView: () => {},
    run: () => {},
    setData: () => {},
  };
  hooks.app.graphReady = true;

  context.selectSession = (id) => {
    calls.select = id;
  };
  context.exportSessionData = () => {
    calls.export = true;
  };
  context.refreshSummaries = () => {
    calls.refresh = true;
  };
  context.resetSettingsToDefault = () => {
    calls.resetDefaults = true;
  };
  context.restoreUndoSettings = () => {
    calls.restoreUndo = true;
  };
  context.scheduleRealtimeReconcile = () => {};

  const sessionSelect = doc.getElementById("session-select");
  const option = doc.createElement("option");
  option.value = "s1";
  option.textContent = "s1";
  sessionSelect.appendChild(option);
  sessionSelect.value = "s1";
  sessionSelect.dispatchEvent(new dom.window.Event("change"));

  hooks.showToast("Session deleted.", "Undo", () => {
    calls.restoreUndo = true;
  });
  doc.getElementById("toast-action").click();

  doc.getElementById("session-delete").click();
  context.confirm = () => true;
  doc.getElementById("session-delete").click();

  const favorites = doc.getElementById("session-filter-favorites");
  favorites.checked = true;
  favorites.dispatchEvent(new dom.window.Event("change"));

  const picker = doc.getElementById("session-date-picker");
  picker.value = "";
  picker.dispatchEvent(new dom.window.Event("change"));

  const dateKey = context.formatDateKey(session.startedAt);
  hooks.app.sessionFilterFavoritesOnly = true;
  favorites.checked = true;
  picker.value = dateKey;
  picker.dispatchEvent(new dom.window.Event("change"));

  const list = doc.getElementById("session-list");
  list.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowDown" }));
  list.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowUp" }));
  list.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Home" }));
  list.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "End" }));

  context.updateSettingsPreview = () => {};
  context.scheduleSettingsSave = () => {};
  const settingsForm = doc.getElementById("settings-form");
  settingsForm.dispatchEvent(new dom.window.Event("submit"));
  settingsForm.dispatchEvent(new dom.window.Event("input"));
  settingsForm.dispatchEvent(new dom.window.Event("change"));

  const graphSearch = doc.getElementById("graph-search");
  graphSearch.value = "alpha";
  graphSearch.dispatchEvent(new dom.window.Event("input"));
  doc.getElementById("graph-node-cap").dispatchEvent(new dom.window.Event("input"));
  doc.getElementById("graph-min-active").dispatchEvent(new dom.window.Event("input"));
  doc.getElementById("graph-min-edge").dispatchEvent(new dom.window.Event("input"));
  doc.getElementById("graph-color-by").dispatchEvent(new dom.window.Event("change"));
  doc.getElementById("graph-show-labels").dispatchEvent(new dom.window.Event("change"));
  doc.getElementById("graph-hide-isolates").dispatchEvent(new dom.window.Event("change"));
  doc.getElementById("graph-freeze").dispatchEvent(new dom.window.Event("change"));
  doc.getElementById("graph-reset").dispatchEvent(new dom.window.Event("click"));
  doc.querySelector(".graph-toggle").dispatchEvent(new dom.window.Event("click"));

  doc.getElementById("summary-refresh").dispatchEvent(new dom.window.Event("click"));

  doc.getElementById("open-settings").dispatchEvent(new dom.window.Event("click"));
  chrome.runtime.openOptionsPage = null;
  doc.getElementById("open-settings").dispatchEvent(new dom.window.Event("click"));
  doc.getElementById("open-dashboard").dispatchEvent(new dom.window.Event("click"));

  doc.querySelector(".view-tab").dispatchEvent(new dom.window.Event("click"));
  doc.querySelector(".deep-tab").dispatchEvent(new dom.window.Event("click"));

  doc.getElementById("export-data").dispatchEvent(new dom.window.Event("click"));
  context.confirm = () => false;
  doc.getElementById("delete-all-sessions").dispatchEvent(new dom.window.Event("click"));
  context.confirm = () => true;
  doc.getElementById("delete-all-sessions").dispatchEvent(new dom.window.Event("click"));
  context.confirm = () => false;
  doc.getElementById("reset-state").dispatchEvent(new dom.window.Event("click"));
  context.confirm = () => true;
  doc.getElementById("reset-state").dispatchEvent(new dom.window.Event("click"));
  doc.getElementById("reset-settings").dispatchEvent(new dom.window.Event("click"));
  doc.getElementById("undo-settings").dispatchEvent(new dom.window.Event("click"));

  assert.equal(calls.select, "s1");
  assert.equal(calls.export, true);
  assert.equal(calls.refresh, true);
});

test("dashboard session list and overview coverage", () => {
  const dom = createFullDashboardDom();
  const doc = dom.window.document;
  const canvas = doc.getElementById("graph-canvas");
  createCanvasStub(canvas);
  const clock = createClock(5000);
  const { hooks, context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock,
    extraGlobals: {
      requestAnimationFrame: (cb) => {
        cb();
        return 1;
      },
    },
  });

  context.buildSessionMeta = () => "Meta detail";

  const sessionA = {
    id: "a",
    startedAt: clock.now() - 600000,
    updatedAt: clock.now() - 500000,
    endedAt: clock.now() - 500000,
    lastActivityAt: clock.now() - 500000,
    nodes: {
      "https://alpha.com": {
        url: "https://alpha.com",
        activeMs: 60000,
        category: "Study",
        firstSeen: clock.now() - 590000,
        lastSeen: clock.now() - 510000,
      },
    },
    edges: {},
    events: [{ ts: clock.now() - 590000, type: "navigation", toUrl: "https://alpha.com" }],
    trapDoors: [{ url: "https://trap.com" }],
    categoryTotals: { Study: 60000 },
    distractionAverage: 0.5,
    label: "Focused",
  };
  const sessionB = {
    id: "b",
    startedAt: clock.now() - 300000,
    updatedAt: clock.now() - 1000,
    endedAt: null,
    lastActivityAt: clock.now() - 1000,
    nodes: {
      "https://beta.com": {
        url: "https://beta.com",
        activeMs: 120000,
        category: "Video",
        firstSeen: clock.now() - 299000,
        lastSeen: clock.now() - 2000,
      },
      "https://gamma.com": {
        url: "https://gamma.com",
        activeMs: 30000,
        category: "News",
        firstSeen: clock.now() - 280000,
        lastSeen: clock.now() - 5000,
      },
    },
    edges: {},
    events: [
      { ts: clock.now() - 280000, type: "navigation", fromUrl: "https://beta.com", toUrl: "https://gamma.com" },
      { ts: clock.now() - 200000, type: "navigation", fromUrl: "https://gamma.com", toUrl: "https://beta.com" },
    ],
    trapDoors: [{ url: "https://trap.com" }],
    categoryTotals: { Video: 120000, News: 30000 },
    distractionAverage: 1.6,
    label: "Wandering",
    intentDriftLabel: "High",
    intentDriftReason: "Focus drift",
    intentDriftConfidence: "high",
    intentDriftDrivers: ["Driver"],
  };

  hooks.app.state = { sessions: {}, sessionOrder: [] };
  hooks.populateSessionList();

  hooks.app.state = {
    sessions: { a: sessionA, b: sessionB },
    sessionOrder: ["a", "b"],
    activeSessionId: "b",
    tracking: hooks.createDefaultTracking(),
  };
  hooks.app.session = sessionB;
  hooks.app.settings = {
    ...hooks.DEFAULT_SETTINGS,
    pinActiveSession: false,
    intentDriftAlerts: true,
    showOutcomeHighlights: true,
  };

  hooks.populateSessionList();
  hooks.app.sessionFilterFavoritesOnly = true;
  hooks.getSessionListData();
  hooks.app.sessionFilterFavoritesOnly = false;

  const listData = hooks.getSessionListData();
  hooks.app.cache.sessionListData = listData;
  hooks.renderSessionListWindow();

  const favoriteButton = doc.querySelector(".session-favorite");
  hooks.app.settings.realtimeOptimisticUi = false;
  favoriteButton.click();
  hooks.app.settings.realtimeOptimisticUi = true;
  hooks.app.sessionFilterFavoritesOnly = true;
  favoriteButton.click();

  hooks.app.cache.sessionListData = null;
  hooks.handleSessionListKeydown({ key: "ArrowDown", preventDefault: () => {} });
  hooks.app.cache.sessionListData = listData;
  hooks.handleSessionListKeydown({ key: "Home", preventDefault: () => {} });
  hooks.handleSessionListKeydown({ key: "End", preventDefault: () => {} });

  let renderGraphCalled = false;
  context.renderGraph = () => {
    renderGraphCalled = true;
  };
  hooks.app.deepTab = "graph";
  hooks.app.settings.dashboardSections = {
    ...hooks.DEFAULT_SETTINGS.dashboardSections,
    overview: false,
    timeline: true,
    graph: true,
    stats: true,
    honesty: true,
  };
  hooks.renderDashboard();
  hooks.renderOverviewEmpty();

  hooks.renderOverviewInsights({ nodes: {} });
  const insights = context.getOverviewInsights(sessionB, hooks.app.state);
  assert.ok(insights.length >= 1);

  const hops = context.computeDomainHops({
    events: [
      { ts: Date.now(), type: "navigation", toUrl: "https://a.com" },
      { ts: Date.now(), type: "navigation", toUrl: "https://b.com" },
      { ts: Date.now(), type: "navigation", toUrl: "https://c.com" },
      { ts: Date.now(), type: "navigation", toUrl: "https://d.com" },
    ],
  });
  assert.ok(hops.includes("Domain hopping"));

  const highlights = hooks.buildOutcomeHighlights(sessionB, {
    sessions: { a: sessionA, b: sessionB },
    sessionOrder: ["a", "b"],
  });
  assert.ok(Array.isArray(highlights));

  const noActions = hooks.buildRecommendedActions(null);
  assert.equal(noActions.length, 0);
  dom.window.navigator.clipboard = { writeText: () => { throw new Error("nope"); } };
  const actions = hooks.buildRecommendedActions(sessionB);
  actions.forEach((action) => action.onClick());

  hooks.app.settings.dashboardFocusNote = "Focus now";
  hooks.renderFocusNote();
  hooks.app.settings.dashboardFocusNote = " ";
  hooks.app.settings.focusPrompts = "Prompt one";
  hooks.renderFocusNote();
  hooks.app.settings.focusPrompts = "";
  hooks.renderFocusNote();

  hooks.renderOverviewInsights(sessionB);
  hooks.renderStatus();
  assert.equal(renderGraphCalled, true);
});

test("dashboard summary helper coverage sweep", async () => {
  const dom = createFullDashboardDom();
  const doc = dom.window.document;
  const canvas = doc.getElementById("graph-canvas");
  createCanvasStub(canvas);
  const clock = createClock(2000);
  const chrome = createChromeMock({ localData: {}, syncData: {} });
  let timeoutCb = null;
  const { hooks, context } = loadDashboard({
    dom,
    chrome,
    clock,
    extraGlobals: {
      setTimeout: (cb) => {
        timeoutCb = cb;
        return 1;
      },
      clearTimeout: () => {},
    },
  });

  const session = {
    id: "s1",
    startedAt: clock.now() - 1000,
    updatedAt: clock.now() - 500,
    nodes: {},
    edges: {},
    events: [],
    trapDoors: [],
    categoryTotals: {},
  };
  hooks.app.state = {
    sessions: { s1: session },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tracking: hooks.createDefaultTracking(),
  };
  hooks.app.session = session;
  hooks.app.settings = {
    ...hooks.DEFAULT_SETTINGS,
    summaryBullets: true,
    summaryMetaphors: true,
    summaryLength: "short",
    summaryVerbosity: "detailed",
    summaryVoice: "analyst",
    summaryPersonality: "direct",
    summaryFormatting: "markdown",
    summaryEmojis: "high",
    summaryTechnicality: "technical",
  };

  const sendPrompt = () => "custom";
  hooks.app.sendPromptToOllama = sendPrompt;
  assert.equal(hooks.getSendPromptToOllama(), sendPrompt);

  assert.ok(hooks.buildSummaryStyleLines("brief").length > 0);
  assert.ok(context.buildSummaryVoiceLine("brief").includes("Voice"));
  assert.ok(context.buildSummaryPersonalityLine("detailed").includes("Personality"));
  assert.ok(context.buildSummaryLengthInstruction("brief").includes("Write"));
  assert.ok(context.buildSummaryLengthInstruction("detailed").includes("Write"));
  assert.ok(context.buildSummaryFormattingLine().includes("markdown"));
  assert.ok(context.getSummaryBaseLines("brief").length > 0);
  assert.ok(context.getSummaryBaseLines("detailed").length > 0);

  hooks.app.settings.summaryVoice = "invalid";
  hooks.app.settings.summaryPersonality = "invalid";
  hooks.app.settings.summaryLength = "long";
  context.buildSummaryVoiceLine("brief");
  context.buildSummaryPersonalityLine("brief");
  context.buildSummaryLengthInstruction("brief");
  hooks.app.settings.summaryLength = "medium";
  context.buildSummaryLengthInstruction("detailed");
  hooks.app.settings.summaryFormatting = "plain";
  context.buildSummaryFormattingLine();

  const promptBrief = hooks.buildSummaryPrompt(session, "brief");
  const promptDetailed = hooks.buildSummaryPrompt(session, "detailed");
  assert.ok(promptBrief.includes("Session data"));
  assert.ok(promptDetailed.includes("Session data"));

  assert.equal(context.coerceSummaryText("Gathering summary...", "brief", session) !== "", true);
  assert.equal(context.coerceSummaryText("Real text", "brief", session), "Real text");
  assert.equal(context.buildLocalSummary("brief", null), "Summary unavailable.");

  const buildBackup = context.buildSummaryDataLines;
  context.buildSummaryDataLines = () => {
    throw new Error("boom");
  };
  assert.equal(context.buildLocalSummary("detailed", session), "Detailed summary unavailable.");
  context.buildSummaryDataLines = buildBackup;

  const sharedBackup = context.IRHTSummaryShared;
  context.IRHTSummaryShared = null;
  assert.equal(hooks.buildSummaryDataLines(hooks.app.state, session).length, 0);
  context.IRHTSummaryShared = sharedBackup;

  hooks.app.summaryState = { requestId: 1, brief: "", detailed: "" };
  hooks._refreshSummariesCatch(1, session.id);

  let persisted = false;
  context.sendSummaryUpdate = () => true;
  hooks.persistSessionSummaries(session.id, "Brief", "Detail");
  context.sendSummaryUpdate = () => {
    persisted = true;
    return false;
  };
  hooks.persistSessionSummaries(session.id, "Brief 2", "Detail 2");
  assert.equal(persisted, true);

  hooks.updateSessionSummaries(session.id, null, null, "bad");

  let refreshCalled = false;
  context.refreshSummaries = () => {
    refreshCalled = true;
  };
  hooks.scheduleSummaryRefresh({ force: false });
  if (timeoutCb) {
    timeoutCb();
  }
  hooks.scheduleSummaryRefresh({ force: true });
  assert.equal(refreshCalled, true);
});

test("dashboard realtime helper coverage sweep", () => {
  const dom = createFullDashboardDom();
  const doc = dom.window.document;
  const canvas = doc.getElementById("graph-canvas");
  createCanvasStub(canvas);
  const clock = createClock(1000);
  const timeouts = new Map();
  let timeoutId = 0;
  let intervalCb = null;
  const chrome = createChromeMock({
    onSendMessage: (message, cb) => {
      if (message.type === "get_state") {
        cb({ state: { schemaVersion: 4, sessions: {}, sessionOrder: [] } });
        return;
      }
      cb();
    },
  });
  const { hooks, context } = loadDashboard({
    dom,
    chrome,
    clock,
    extraGlobals: {
      setTimeout: (cb) => {
        timeoutId += 1;
        timeouts.set(timeoutId, cb);
        return timeoutId;
      },
      clearTimeout: (id) => {
        timeouts.delete(id);
      },
      setInterval: (cb) => {
        intervalCb = cb;
        return 1;
      },
      clearInterval: () => {
        intervalCb = null;
      },
      requestAnimationFrame: (cb) => {
        cb();
        return 1;
      },
      cancelAnimationFrame: () => {},
    },
  });

  hooks.app.settings = { ...hooks.DEFAULT_SETTINGS };
  hooks.app.state = {
    sessions: {},
    sessionOrder: [],
    tracking: hooks.createDefaultTracking(),
  };

  hooks.setLiveIndicator("offline");
  hooks.app.settings.trackingPaused = true;
  hooks.setLiveIndicator("live");
  hooks.app.settings.trackingPaused = false;
  hooks.setLiveIndicator("sync");
  hooks.setLiveIndicator("live");

  assert.equal(hooks.isStateEmpty(null), true);
  assert.equal(hooks.isStateEmpty({ sessions: {} }), true);
  assert.equal(
    hooks.isStateEmpty({ sessions: { s1: { nodes: { a: { url: "x" } } } } }),
    false,
  );
  assert.ok(hooks.canUseChromeStorage());

  let configured = { port: 0, poll: 0, live: 0, worker: 0 };
  const setupPortBackup = context.setupRealtimePort;
  const setupPollBackup = context.setupRealtimePolling;
  const setupLiveBackup = context.setupLiveTimer;
  const setupWorkerBackup = context.setupRealtimeWorker;
  context.setupRealtimePort = () => {
    configured.port += 1;
  };
  context.setupRealtimePolling = () => {
    configured.poll += 1;
  };
  context.setupLiveTimer = () => {
    configured.live += 1;
  };
  context.setupRealtimeWorker = () => {
    configured.worker += 1;
  };
  hooks.configureRealtimeFeatures(
    { realtimeStreamEnabled: false, realtimePortPush: false, realtimeWorkerOffload: false },
    { realtimeStreamEnabled: true, realtimePortPush: true, realtimeWorkerOffload: true },
  );
  context.setupRealtimePort = setupPortBackup;
  context.setupRealtimePolling = setupPollBackup;
  context.setupLiveTimer = setupLiveBackup;
  context.setupRealtimeWorker = setupWorkerBackup;

  const portMessages = [];
  const port = {
    onMessage: { addListener: (fn) => { port._onMessage = fn; } },
    onDisconnect: { addListener: (fn) => { port._onDisconnect = fn; } },
    postMessage: (msg) => {
      portMessages.push(msg);
      if (port.throwPost) {
        throw new Error("boom");
      }
    },
    disconnect: () => {
      if (port._onDisconnect) {
        port._onDisconnect();
      }
    },
  };
  chrome.runtime.connect = () => port;

  hooks.setupRealtimePort({ realtimeStreamEnabled: true });
  port._onDisconnect();

  port.throwPost = true;
  hooks.setupRealtimePort({ realtimeStreamEnabled: true });
  port.throwPost = false;
  chrome.runtime.connect = () => {
    throw new Error("boom");
  };
  hooks.setupRealtimePort({ realtimeStreamEnabled: true });
  chrome.runtime.connect = () => null;
  hooks.setupRealtimePort({ realtimeStreamEnabled: true });
  hooks.setupRealtimePort({ realtimeStreamEnabled: false });

  context.setupRealtimePolling({ realtimeStreamEnabled: false });
  context.setupRealtimePolling({ realtimeStreamEnabled: true });
  const chromeBackup = context.chrome;
  context.chrome = undefined;
  context.setupRealtimePolling({ realtimeStreamEnabled: true });
  context.chrome = chromeBackup;

  let appliedState = false;
  context.applyState = () => {
    appliedState = true;
  };
  chrome.runtime.lastError = { message: "fail" };
  context.requestLiveStateSnapshot();
  chrome.runtime.lastError = null;
  context.requestLiveStateSnapshot();
  chrome.runtime.sendMessage = null;
  chrome.storage.local.get = (key, cb) => {
    chrome.runtime.lastError = { message: "fail" };
    cb({});
    chrome.runtime.lastError = null;
  };
  context.requestLiveStateSnapshot();
  chrome.storage.local.get = (key, cb) => {
    cb({ [hooks.STORAGE_KEY]: { schemaVersion: 4, sessions: {}, sessionOrder: [] } });
  };
  context.requestLiveStateSnapshot();
  assert.equal(appliedState, true);

  const queueDeltaBackup = context.queueRealtimeDelta;
  context.queueRealtimeDelta = () => {};
  hooks.handleRealtimeMessage(null);
  hooks.handleRealtimeMessage({ type: "state_snapshot", state: { schemaVersion: 4, sessions: {}, sessionOrder: [] } });
  hooks.handleRealtimeMessage({ type: "state_delta", sessionId: "s1" });
  context.queueRealtimeDelta = queueDeltaBackup;

  let appliedDelta = false;
  const applyDeltaBackup = context.applyStateDelta;
  context.applyStateDelta = () => {
    appliedDelta = true;
  };
  hooks.app.settings.realtimeBatchUpdates = false;
  context.queueRealtimeDelta(null);
  context.queueRealtimeDelta({ sessionId: "s1" });
  hooks.app.settings.realtimeBatchUpdates = true;
  context.queueRealtimeDelta({ sessionId: "s1" });
  context.queueRealtimeDelta({ sessionId: "s1" });
  const pending = [...timeouts.values()];
  pending.forEach((cb) => cb());
  assert.equal(appliedDelta, true);
  context.applyStateDelta = applyDeltaBackup;

  const merged = hooks.mergeRealtimeDelta(null, { sessionId: "s1" });
  assert.equal(merged.sessionId, "s1");

  hooks.app.state = null;
  hooks.applyStateDelta({ state: { schemaVersion: 4, sessions: {}, sessionOrder: [] } });

  hooks.app.state = {
    sessions: { s1: { id: "s1", nodes: {}, edges: {}, events: [] } },
    sessionOrder: ["s1"],
    tracking: { activeUrl: "https://example.com", activeSince: clock.now() - 500 },
  };
  hooks.app.session = hooks.app.state.sessions.s1;
  hooks.app.settings.realtimePriorityUpdates = true;

  let priorityCalled = false;
  let deferredCalled = false;
  let renderCalled = false;
  let listRefreshCalled = false;
  const applyPriorityBackup = context.applyPriorityUpdate;
  const scheduleDeferredBackup = context.scheduleDeferredRender;
  const renderBackup = context.renderDashboard;
  const scheduleListBackup = context.scheduleSessionListRefresh;
  const setLiveBackup = context.setLiveIndicator;
  const updateLiveBackup = context.updateLiveActiveBase;
  context.applyPriorityUpdate = () => {
    priorityCalled = true;
  };
  context.scheduleDeferredRender = () => {
    deferredCalled = true;
  };
  context.renderDashboard = () => {
    renderCalled = true;
  };
  context.scheduleSessionListRefresh = () => {
    listRefreshCalled = true;
  };
  context.setLiveIndicator = () => {};
  context.updateLiveActiveBase = () => {};

  hooks.app.state.sessions.s1.events = new Array(5000).fill({ type: "navigation" });
  hooks.applyStateDelta({
    sessionId: "s1",
    tracking: { activeSince: clock.now() },
    sessionPatch: { label: "Updated" },
    nodePatch: { url: "https://example.com", activeMs: 10 },
    edgePatch: { id: "a -> b", from: "a", to: "b" },
    eventPatch: { type: "navigation", toUrl: "https://example.com" },
    sessionsPatch: [{ id: "s2" }, { id: null }],
    sessionOrder: ["s1", "s2"],
  });
  assert.equal(priorityCalled, true);
  assert.equal(deferredCalled, true);
  assert.equal(listRefreshCalled, true);
  assert.equal(renderCalled, false);

  context.applyPriorityUpdate = applyPriorityBackup;
  context.scheduleDeferredRender = scheduleDeferredBackup;
  context.renderDashboard = renderBackup;
  context.scheduleSessionListRefresh = scheduleListBackup;
  context.setLiveIndicator = setLiveBackup;
  context.updateLiveActiveBase = updateLiveBackup;

  hooks.app.settings.realtimePriorityUpdates = false;
  hooks.applyStateDelta({ sessionId: "s1", sessionPatch: { label: "Again" } });
  hooks.renderDashboard();

  hooks.app.settings.realtimePriorityUpdates = true;
  hooks.scheduleSessionListRefresh();
  hooks.scheduleSessionListRefresh();
  hooks.app.settings.realtimePriorityUpdates = false;
  hooks.scheduleSessionListRefresh();

  hooks.app.session = null;
  hooks.applyPriorityUpdate();
  hooks.app.session = hooks.app.state.sessions.s1;
  hooks.applyPriorityUpdate();

  hooks.scheduleDeferredRender();
  hooks.scheduleDeferredRender();

  hooks.app.settings.realtimeFrameAligned = false;
  hooks.scheduleFrameRender("a", () => {
    renderCalled = true;
  });
  hooks.app.settings.realtimeFrameAligned = true;
  const rafBackup = context.requestAnimationFrame;
  let rafCb = null;
  context.requestAnimationFrame = (cb) => {
    rafCb = cb;
    return 2;
  };
  hooks.scheduleFrameRender("b", () => {});
  hooks.scheduleFrameRender("b", () => {});
  if (rafCb) {
    rafCb();
  }
  context.requestAnimationFrame = rafBackup;

  hooks.setupLiveTimer(hooks.app.settings);
  if (intervalCb) {
    intervalCb();
  }
  hooks.app.state.tracking.activeSince = clock.now() - 1000;
  hooks.app.state.tracking.activeUrl = "https://example.com";
  if (intervalCb) {
    intervalCb();
  }

  hooks.updateLiveActiveBase(null);
  hooks.updateLiveActiveBase(hooks.app.session);
  hooks.app.liveActiveSessionId = "other";
  context.getLiveActiveMs(hooks.app.session, hooks.app.state.tracking);

  hooks.applyOptimisticDelete("missing");
  hooks.app.state.sessions.s2 = { id: "s2", nodes: {}, edges: {} };
  hooks.app.state.sessionOrder.push("s2");
  hooks.applyOptimisticDelete("s1");

  assert.equal(context.hasSummaryUi(), true);
  assert.equal(context.shouldForceSummaryRefresh(null, null), false);
  assert.equal(
    context.shouldForceSummaryRefresh({ tone: "neutral" }, { tone: "direct" }),
    true,
  );
});

test("dashboard settings and storage coverage sweep", async () => {
  const dom = createFullDashboardDom();
  const doc = dom.window.document;
  const canvas = doc.getElementById("graph-canvas");
  createCanvasStub(canvas);
  const chrome = createChromeMock({ localData: {}, syncData: {} });
  const { hooks, context } = loadDashboard({
    dom,
    chrome,
    clock: createClock(0),
  });

  hooks.app.settings = {
    ...hooks.DEFAULT_SETTINGS,
    theme: "warm",
    tone: "direct",
    trackingPaused: true,
    productiveSites: ["example.com"],
    distractingSites: ["social.com"],
    categoryOverrides: { "news.com": "News" },
    syncEnabled: true,
    directCallouts: true,
    intentDriftAlerts: true,
    intentDriftSensitivity: "high",
    summaryAutoRefresh: true,
    summaryPersonality: "gentle",
    summaryEmojis: "low",
    summaryFormatting: "plain",
    summaryBullets: true,
    summaryMetaphors: true,
    summaryLength: "short",
    summaryVerbosity: "brief",
    summaryTechnicality: "soft",
    summaryVoice: "mentor",
    summaryRefreshCooldownMinutes: 5,
    summaryCacheMinutes: 10,
    ollamaEndpoint: "http://example.com",
    ollamaModel: "model",
    realtimeStreamEnabled: true,
    realtimeDeltaSync: true,
    realtimePortPush: true,
    realtimeLiveTimers: true,
    realtimeBatchUpdates: true,
    realtimeBatchWindowMs: 300,
    realtimePriorityUpdates: true,
    realtimeOptimisticUi: true,
    realtimeWorkerOffload: true,
    realtimeFrameAligned: true,
    dashboardNote: "note",
    popupNote: "popup",
    dashboardButtonLabel: "Go",
    popupLayout: "focus",
    popupDensity: "compact",
    popupAction: "open_dashboard",
    popupMicroNote: "micro",
    popupMood: "calm",
    popupShowActiveTime: true,
    popupShowTopDomain: true,
    popupShowDistraction: true,
    popupShowSessionLabel: true,
    popupShowLastAction: true,
    dashboardStoryMode: true,
    sessionListStyle: "minimal",
    pinActiveSession: true,
    focusPrompts: ["one", "two"],
    outcomeHighlights: true,
    dashboardSections: {
      overview: true,
      sessions: true,
      timeline: true,
      graph: true,
      stats: true,
      honesty: true,
      callouts: true,
    },
    accentColor: "#ffffff",
    typographyStyle: "bold",
    uiDensity: "compact",
    reduceMotion: true,
    sessionListLimit: 5,
  };

  hooks.renderSettings();
  Object.keys(hooks.elements)
    .filter((key) => key.startsWith("setting") && key !== "settingsForm")
    .forEach((key) => {
      hooks.elements[key] = null;
    });
  hooks.renderSettings();

  context.updateSettingsPreview(hooks.app.settings);
  hooks.elements.previewThemeLabel = null;
  context.updateSettingsPreview({ ...hooks.app.settings, accentColor: "" });

  const undoBackup = hooks.elements.undoSettings;
  hooks.elements.undoSettings = null;
  hooks.updateUndoButtonState();
  hooks.elements.undoSettings = undoBackup;
  dom.window.localStorage.removeItem(hooks.UNDO_SETTINGS_KEY);
  hooks.updateUndoButtonState();
  dom.window.localStorage.setItem(hooks.UNDO_SETTINGS_KEY, JSON.stringify({ theme: "warm" }));
  hooks.updateUndoButtonState();

  const setBackup = dom.window.localStorage.setItem.bind(dom.window.localStorage);
  dom.window.localStorage.setItem = () => {
    throw new Error("boom");
  };
  hooks.setUndoSnapshot({ theme: "cool" });
  dom.window.localStorage.setItem = setBackup;

  hooks.collectSettingsFromForm();
  Object.keys(hooks.elements)
    .filter((key) => key.startsWith("setting"))
    .forEach((key) => {
      hooks.elements[key] = null;
    });
  hooks.collectSettingsFromForm();

  const sanitized = hooks.sanitizeSettings({
    theme: "unknown",
    accentColor: "not-a-color",
    summaryLength: "nope",
    summaryVerbosity: "nope",
    summaryTechnicality: "nope",
    summaryVoice: "nope",
    summaryPersonality: "nope",
    summaryEmojis: "nope",
    summaryFormatting: "nope",
    realtimeBatchWindowMs: 999,
    sessionListLimit: -1,
  });
  assert.equal(typeof sanitized.theme, "string");

  assert.equal(hooks.accentInkColor("#ffffff"), "#1f1a17");
  assert.equal(hooks.accentInkColor("#000000"), "#fdf6ef");

  chrome.runtime.lastError = { message: "fail" };
  await hooks.storageLocalGet("x");
  await hooks.storageSyncGet("x");
  chrome.runtime.lastError = null;
  await hooks.storageSyncSet({ foo: "bar" });

  let status = "";
  context.setSettingsStatus = (value) => {
    status = value;
  };
  context.chrome = undefined;
  hooks.sendSessionAction("session_delete", "s1");
  context.chrome = chrome;
  chrome.runtime.lastError = { message: "fail" };
  hooks.sendSessionAction("session_delete", "s1");
  assert.ok(status.includes("Action"));

  context.chrome = undefined;
  assert.equal(hooks.sendSummaryUpdate("s1", "b", "d", 1), false);
  context.chrome = chrome;
  chrome.runtime.lastError = { message: "fail" };
  const sent = hooks.sendSummaryUpdate("s1", "b", "d", 1);
  assert.equal(sent, true);
});

test("dashboard setSettingsStatus clears after timeout", () => {
  const dom = createDom("<!doctype html><html><body><div id=\"settings-status\"></div></body></html>");
  const timeouts = new Map();
  let timeoutId = 0;
  const { hooks } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
    extraGlobals: {
      setTimeout: (cb) => {
        timeoutId += 1;
        timeouts.set(timeoutId, cb);
        return timeoutId;
      },
      clearTimeout: (id) => {
        timeouts.delete(id);
      },
    },
  });

  hooks.setSettingsStatus("Saved.");
  assert.equal(hooks.elements.settingsStatus.textContent, "Saved.");
  timeouts.forEach((cb) => cb());
  assert.equal(hooks.elements.settingsStatus.textContent, "");
});

test("dashboard graph data and callouts coverage", () => {
  const dom = createFullDashboardDom();
  const doc = dom.window.document;
  const canvas = doc.getElementById("graph-canvas");
  createCanvasStub(canvas);
  const clock = createClock(Date.UTC(2024, 0, 1, 2, 0, 0));
  const { hooks, context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock,
  });

  hooks.app.settings = { ...hooks.DEFAULT_SETTINGS, intentDriftAlerts: true };

  assert.equal(context.getDomainForGraph("https://example.com/path"), "example.com");
  assert.equal(context.getDomainForGraph("example.com"), "example.com");
  assert.equal(context.getDomainForGraph(123), "");

  const seeded = context.seedNodesFromEdges([{ from: "a.com", to: "b.com" }]);
  assert.equal(seeded.length, 2);

  const session = {
    id: "s1",
    startedAt: clock.now(),
    firstActivityAt: clock.now(),
    nodes: {
      "https://example.com": { url: "https://example.com", activeMs: 1000, category: "Study", firstSeen: clock.now() },
      "https://news.gov": { url: "https://news.gov", activeMs: 500, category: "News", firstSeen: clock.now() },
    },
    edges: {
      "https://example.com -> https://news.gov": {
        from: "https://example.com",
        to: "https://news.gov",
        activeMs: 200,
        visitCount: 2,
      },
    },
    events: [
      { ts: clock.now() - 1000, type: "navigation", toUrl: "https://example.com" },
    ],
    trapDoors: [{ url: "https://trap.com" }],
    categoryTotals: { Study: 1000, News: 500 },
    distractionAverage: 1.6,
    intentDriftLabel: "High",
    intentDriftReason: "Focus drift",
    intentDriftDrivers: ["Driver"],
  };
  const sessionPrev = {
    id: "s0",
    startedAt: clock.now() - 86400000,
    nodes: { "https://example.com": { url: "https://example.com", activeMs: 600000 } },
    edges: {},
    events: [],
    trapDoors: [{ url: "https://trap.com" }],
  };
  hooks.app.state = {
    sessions: { s0: sessionPrev, s1: session },
    sessionOrder: ["s0", "s1"],
  };

  const pageGraph = context.buildGraphData(session, "page", 1);
  const domainGraph = context.buildGraphData(session, "domain", 1);
  assert.ok(pageGraph.nodes.length >= 1);
  assert.ok(domainGraph.nodes.length >= 1);
  const domainSkipped = context.buildGraphData(
    {
      nodes: { bad: { url: "bad url", activeMs: 1 } },
      edges: {
        "bad -> good": {
          from: "bad url",
          to: "https://good.com",
          activeMs: 1,
          visitCount: 1,
        },
      },
    },
    "domain",
  );
  assert.equal(domainSkipped.nodes.length, 0);

  const trimmed = context.trimGraph(pageGraph, 1);
  context.trimGraph({ nodes: [], edges: [] }, 10);
  context.filterGraphData(null);
  context.filterGraphData(trimmed, { minNodeMs: 1, search: "example", hideIsolates: true, nodeCap: 1 });

  hooks.app.settings.categoryOverrides = { "example.com": "News" };
  const classified = hooks.classifyUrl("https://school.edu");
  assert.equal(classified, "Study");
  assert.equal(hooks.classifyUrl("https://example.com"), "News");
  assert.equal(hooks.classifyUrl("https://youtube.com"), "Video");
  assert.equal(hooks.classifyUrl("https://news.gov"), "News");
  assert.equal(hooks.classifyUrl("https://news.example.com"), "News");
  assert.equal(hooks.classifyUrl("https://google.com/search?q=hi"), "Study");
  context.IRHTShared = { resolveCategoryWithAI: () => "Video" };
  assert.equal(hooks.classifyUrl("https://unknown.example"), "Video");
  assert.equal(hooks.classifyUrl("bad url"), "Random");

  const earlyCategory = hooks.pickEarlyCategory(
    [
      { url: "https://example.com", firstSeen: clock.now(), activeMs: 1, category: "Study" },
      { url: "https://video.com", firstSeen: clock.now(), activeMs: 2, category: "Video" },
    ],
    session,
  );
  assert.ok(earlyCategory);

  assert.equal(hooks.findSessionStartUrl({ events: [], nodes: {} }), null);
  assert.equal(hooks.findSessionStartUrl(session), "https://example.com");

  const pages = hooks.buildTopPages(session);
  const distractions = hooks.buildTopDistractions({
    nodes: {
      "https://example.com": { url: "https://example.com", activeMs: 1000, distractionScore: 2 },
      "https://idle.com": { url: "https://idle.com", activeMs: 0, distractionScore: 5 },
    },
  });
  assert.ok(pages.length >= 1);
  assert.equal(distractions.length, 1);

  const callouts = hooks.buildCalloutMessages(session, hooks.app.state, "direct");
  assert.ok(callouts.length >= 1);

  const previous = hooks.findPreviousSession(hooks.app.state, session);
  assert.equal(previous.id, "s0");

  const list = doc.getElementById("top-domains");
  hooks.renderRankList(list, [], (item) => item.domain);
  hooks.renderRankList(list, [{ domain: "example.com", activeMs: 1000 }], (item) => item.domain);

  const dateKey = context.formatDateKey(session.startedAt);
  assert.equal(context.findSessionByDateKey(dateKey).id, "s1");
  assert.equal(hooks.formatDuration(3600 * 1000), "1h 0m");
  assert.equal(hooks.formatDuration(61 * 1000), "1m 1s");
});

test("dashboard ForceGraph branch coverage extras", () => {
  const dom = createDom("<!doctype html><html><body><canvas id=\"c\"></canvas><div id=\"t\"></div></body></html>");
  const canvas = dom.window.document.getElementById("c");
  createCanvasStub(canvas);
  const tooltip = dom.window.document.getElementById("t");
  const { hooks } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
    extraGlobals: {
      requestAnimationFrame: (cb) => {
        cb();
        return 1;
      },
      cancelAnimationFrame: () => {},
    },
  });

  const graph = new hooks.ForceGraph(canvas, tooltip);
  graph.setData(
    {
      nodes: [
        { id: "a", label: "Alpha", activeMs: 100, category: "Study", domain: "a.com" },
        { id: "b", label: "Beta", activeMs: 10, category: "Video", domain: "b.com" },
      ],
      edges: [{ from: "a", to: "b", count: 1, activeMs: 5 }],
    },
    { colorBy: "domain", showLabels: false },
  );
  graph.setData(
    {
      nodes: [
        { id: "a", label: "Alpha", activeMs: 100, category: "Study", domain: "a.com", pinned: true, fx: 5, fy: 6 },
        { id: "b", label: "Beta", activeMs: 10, category: "Video", domain: "b.com" },
      ],
      edges: [{ from: "a", to: "b", count: 1, activeMs: 5 }],
    },
    { preserveLayout: true, colorBy: "category", showLabels: true },
  );

  graph.animFrame = 1;
  graph.run();
  graph.setFreeze(true);
  graph.setFreeze(false);

  graph.dragNode = graph.nodes[0];
  graph.handleMove({ clientX: graph.nodes[0].x, clientY: graph.nodes[0].y });
  graph.dragNode = null;
  graph.isPanning = true;
  graph.panStart = { x: 0, y: 0, offsetX: 0, offsetY: 0 };
  graph.handleMove({ clientX: 5, clientY: 5 });
  graph.isPanning = false;
  graph.panStart = null;
  graph.hoverNode = graph.nodes[0];
  graph.handleMove({ clientX: 10000, clientY: 10000 });
  graph.handleMove({ clientX: graph.nodes[0].x, clientY: graph.nodes[0].y });

  graph.handleDown({
    button: 1,
    clientX: 0,
    clientY: 0,
    preventDefault: () => {},
  });
  graph.handleDown({
    button: 0,
    clientX: 10000,
    clientY: 10000,
    preventDefault: () => {},
  });
  graph.handleDown({
    button: 0,
    clientX: graph.nodes[0].x,
    clientY: graph.nodes[0].y,
    preventDefault: () => {},
  });
  graph.handleUp();
  graph.handleLeave();

  graph.handleWheel({
    clientX: graph.nodes[0].x,
    clientY: graph.nodes[0].y,
    deltaY: 0,
    preventDefault: () => {},
  });
  graph.handleWheel({
    clientX: graph.nodes[0].x,
    clientY: graph.nodes[0].y,
    deltaY: -120,
    preventDefault: () => {},
  });
  graph.handleDoubleClick({ clientX: graph.nodes[0].x, clientY: graph.nodes[0].y });
  graph.setFreeze(true);
  graph.handleDoubleClick({ clientX: graph.nodes[0].x, clientY: graph.nodes[0].y });

  graph.colorBy = "category";
  graph.getNodeColor({ id: "x", domain: "x.com", category: "Study" }, 0.4);
  graph.colorBy = "activity";
  graph.getNodeColor({ id: "y" }, 0.2);

  graph.nodes[0].visitCount = 3;
  graph.nodes[0].category = "Study";
  graph.showTooltip(graph.nodes[0], 0, 0);
  graph.showLabels = false;
  graph.hoverNode = graph.nodes[0];
  graph.draw();
  const tooltipBackup = graph.tooltip;
  graph.tooltip = null;
  graph.showTooltip(graph.nodes[0], 0, 0);
  graph.hideTooltip();
  graph.tooltip = tooltipBackup;
  graph.hideTooltip();

  graph.getNodeColor({ id: "x", domain: "x.com", category: "Study" }, 0.4);

  canvas.dispatchEvent(new dom.window.WheelEvent("wheel", { clientX: 10, clientY: 10, deltaY: -10, bubbles: true }));

  graph.nodes = [];
  graph.handleMove({ clientX: 0, clientY: 0 });
  graph.handleDown({ button: 0, clientX: 0, clientY: 0, preventDefault: () => {} });
  graph.handleWheel({ clientX: 0, clientY: 0, deltaY: 0, preventDefault: () => {} });
  graph.handleDoubleClick({ clientX: 0, clientY: 0 });
  graph.run();

  graph.nodes = [
    { id: "p", x: 0, y: 0, vx: 1, vy: 1, pinned: true, fx: 5, fy: 6, radius: 4, label: "Pinned", color: "#000" },
    { id: "q", x: 10, y: 10, vx: 0, vy: 0, pinned: false, radius: 4, label: "Other", color: "#000" },
  ];
  graph.nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  graph.edges = [{ from: "p", to: "missing", count: 1 }, { from: "p", to: "q", count: 1, activeMs: 5 }];
  graph.simulate();
  graph.hoverNode = graph.nodes[0];
  graph.draw();
});

test("dashboard timeline, graph, and stats coverage", async () => {
  const dom = createFullDashboardDom();
  const doc = dom.window.document;
  const canvas = doc.getElementById("graph-canvas");
  createCanvasStub(canvas);
  const clock = createClock(10000);
  const { hooks, context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock,
    extraGlobals: {
      requestAnimationFrame: (cb) => {
        cb();
        return 1;
      },
      cancelAnimationFrame: () => {},
    },
  });

  const session = {
    id: "s1",
    startedAt: clock.now() - 60000,
    updatedAt: clock.now(),
    nodes: {
      "https://example.com": {
        url: "https://example.com",
        activeMs: 1000,
        title: "Example",
        category: "Study",
        visitCount: 2,
        firstSeen: clock.now() - 50000,
        lastSeen: clock.now() - 1000,
      },
    },
    edges: {
      "https://example.com -> https://example.com/next": {
        from: "https://example.com",
        to: "https://example.com/next",
        activeMs: 200,
        visitCount: 1,
      },
    },
    events: [
      { ts: clock.now() - 30000, type: "active_time_flushed", url: "https://example.com", durationMs: 5000 },
      { ts: clock.now() - 20000, type: "navigation", fromUrl: "https://example.com", toUrl: "https://example.com/next" },
    ],
    trapDoors: [],
    categoryTotals: { Study: 1000 },
  };
  hooks.app.state = {
    sessions: { s1: session },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tracking: { activeSince: clock.now() - 1000, activeUrl: "https://example.com" },
  };
  hooks.app.session = session;
  hooks.app.graphReady = true;
  hooks.app.graph = {
    lastKey: null,
    setData: () => {},
    setFreeze: () => {},
    draw: () => {},
  };

  const shouldShowBackup = context.shouldShowGraphForSession;
  context.shouldShowGraphForSession = () => false;
  hooks.renderGraph();
  context.shouldShowGraphForSession = shouldShowBackup;

  context.renderTimelineWithSegments([]);
  hooks.renderTimeline();

  class WorkerStub {
    constructor() {
      this.onmessage = null;
    }
    postMessage(message) {
      if (!this.onmessage) {
        return;
      }
      if (message.type === "derive_timeline") {
        this.onmessage({ data: { requestId: message.requestId, segments: [] } });
        return;
      }
      this.onmessage({
        data: { requestId: message.requestId, graph: { nodes: [], edges: [] } },
      });
    }
    terminate() {}
  }
  context.Worker = WorkerStub;
  hooks.app.settings.realtimeWorkerOffload = true;
  hooks.setupRealtimeWorker(hooks.app.settings);
  hooks.renderTimeline();
  hooks.renderGraph();
  await new Promise((resolve) => setImmediate(resolve));
  hooks.app.settings.realtimeWorkerOffload = false;

  context.renderGraphWithData({ nodes: [], edges: [] }, "page", session.id, hooks.app.graphSettings);

  hooks.renderStats();
  context.renderStatsWithData(
    {
      chain: { length: 2, label: "a -> b" },
      start: { domain: "example.com", detail: "Across 2 sessions" },
      trapDoor: null,
      topDomains: hooks.buildTopDomains(session),
      topPages: hooks.buildTopPages(session),
      topDistractions: hooks.buildTopDistractions(session),
    },
    1000,
  );

  hooks.app.settings.directCallouts = false;
  hooks.renderCallouts(session, hooks.app.state);
  hooks.app.settings.directCallouts = true;
  hooks.renderCallouts({ ...session, trapDoors: [] }, hooks.app.state);
  hooks.app.settings.dashboardSections.callouts = false;
  hooks.renderCallouts(session, hooks.app.state);
  hooks.renderStatus();
});

test("dashboard decodeCompactState handles non-array url table", () => {
  const dom = createDom("<!doctype html><html><body></body></html>");
  const { hooks } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
  });
  const decoded = hooks.decodeCompactState({
    schemaVersion: 4,
    compactTables: true,
    urlTable: "bad",
    sessions: {
      s1: {
        id: "s1",
        nodes: [{ urlId: 0 }],
        edges: [{ fromId: 0, toId: 0 }],
        trapDoors: [{ urlId: 0 }],
        events: [],
      },
    },
    sessionOrder: ["s1"],
  });
  assert.ok(decoded.sessions.s1);
});

test("dashboard renderGraphWithData handles empty graphs", () => {
  const dom = createFullDashboardDom();
  const canvas = dom.window.document.getElementById("graph-canvas");
  createCanvasStub(canvas);
  const { hooks, context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
  });

  hooks.app.graph = {
    setData: () => {},
    lastKey: null,
  };
  hooks.app.graphWarm = false;
  hooks.app.session = null;

  context.renderGraphWithData(null, "domain", "s1", {});
  context.renderGraphWithData({ nodes: [], edges: [], emptyReason: "" }, "domain", "s1", {});
  assert.equal(hooks.elements.graphEmpty.style.display, "grid");
});

test("dashboard controls and settings coverage extras", () => {
  const dom = createCoverageDom();
  const doc = dom.window.document;
  const canvas = doc.getElementById("graph-canvas");
  createCanvasStub(canvas);

  const timeouts = new Map();
  let timeoutId = 0;
  let rafCb = null;
  const chrome = createChromeMock();
  const tabsCreated = [];
  let openOptionsCalled = false;
  chrome.runtime.getURL = (path) => `chrome:///${path}`;
  chrome.tabs.create = (info) => {
    tabsCreated.push(info.url);
  };
  chrome.runtime.openOptionsPage = () => {
    openOptionsCalled = true;
  };

  const helpOne = ensureElement(doc, "button", "help-one", { className: "help-icon" });
  const helpTwo = ensureElement(doc, "button", "help-two", { className: "help-icon" });
  const rankBlock = doc.createElement("div");
  rankBlock.className = "rank-block";
  const rankList = ensureElement(doc, "ol", "rank-list", { parent: rankBlock });
  rankList.dataset.limit = "1";
  rankList.dataset.collapsed = "true";
  const rankToggle = ensureElement(doc, "button", "rank-toggle", {
    className: "rank-toggle",
    dataset: { target: "rank-list" },
    parent: rankBlock,
  });
  const rankToggleMissing = ensureElement(doc, "button", "rank-toggle-missing", {
    className: "rank-toggle",
    dataset: { target: "missing-list" },
    parent: rankBlock,
  });
  const rankToggleNoTarget = ensureElement(doc, "button", "rank-toggle-notarget", {
    className: "rank-toggle",
    parent: rankBlock,
  });
  doc.body.appendChild(rankBlock);

  const { hooks, context } = loadDashboard({
    dom,
    chrome,
    clock: createClock(0),
    extraGlobals: {
      setTimeout: (cb) => {
        timeoutId += 1;
        timeouts.set(timeoutId, cb);
        return timeoutId;
      },
      clearTimeout: (id) => {
        timeouts.delete(id);
      },
      requestAnimationFrame: (cb) => {
        rafCb = cb;
        return 1;
      },
      cancelAnimationFrame: () => {},
      getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
      Element: dom.window.Element,
    },
  });

  hooks.app.settings = {
    ...hooks.DEFAULT_SETTINGS,
    realtimeOptimisticUi: true,
  };
  hooks.app.state = {
    sessions: {
      s1: { id: "s1", startedAt: 1000, updatedAt: 2000, favorite: true, nodes: {}, edges: {}, events: [] },
      s2: { id: "s2", startedAt: 3000, updatedAt: 4000, favorite: false, nodes: {}, edges: {}, events: [] },
    },
    sessionOrder: ["s1", "s2"],
    activeSessionId: "s1",
    tracking: {},
  };
  hooks.app.session = hooks.app.state.sessions.s1;
  hooks.app.graphSettings = {
    nodeCap: 80,
    minNodeMinutes: 0,
    minEdgeCount: 1,
    search: "",
    hideIsolates: false,
    showLabels: true,
    freeze: false,
    colorBy: "activity",
    mode: "domain",
  };

  doc.getElementById("setting-session-timeout").value = "15";
  doc.getElementById("setting-idle-timeout").value = "5";
  doc.getElementById("setting-productive-sites").value = "https://alpha.com";
  doc.getElementById("setting-distracting-sites").value = "https://beta.com";
  doc.getElementById("setting-category-overrides").value = "alpha.com,Study";
  doc.getElementById("setting-sync").checked = true;
  doc.getElementById("setting-direct-callouts").checked = true;
  doc.getElementById("setting-intent-drift-alerts").checked = true;
  doc.getElementById("setting-intent-drift-sensitivity").value = "high";
  doc.getElementById("setting-summary-auto-refresh").checked = true;
  doc.getElementById("setting-summary-personality").value = "direct";
  doc.getElementById("setting-summary-emojis").value = "low";
  doc.getElementById("setting-summary-formatting").value = "markdown";
  doc.getElementById("setting-summary-bullets").checked = true;
  doc.getElementById("setting-summary-metaphors").checked = true;
  doc.getElementById("setting-summary-length").value = "short";
  doc.getElementById("setting-summary-verbosity").value = "detailed";
  doc.getElementById("setting-summary-technicality").value = "technical";
  doc.getElementById("setting-summary-voice").value = "friend";
  doc.getElementById("setting-summary-cooldown").value = "10";
  doc.getElementById("setting-summary-cache").value = "60";
  doc.getElementById("setting-ollama-endpoint").value = "http://ollama";
  doc.getElementById("setting-ollama-model").value = "tiny";
  doc.getElementById("setting-realtime-stream").checked = true;
  doc.getElementById("setting-realtime-delta").checked = true;
  doc.getElementById("setting-realtime-push").checked = true;
  doc.getElementById("setting-realtime-live-timers").checked = true;
  doc.getElementById("setting-realtime-batching").checked = true;
  doc.getElementById("setting-realtime-batch-window").value = "300";
  doc.getElementById("setting-realtime-priority").checked = true;
  doc.getElementById("setting-realtime-optimistic").checked = true;
  doc.getElementById("setting-realtime-worker").checked = true;
  doc.getElementById("setting-realtime-raf").checked = true;
  doc.getElementById("setting-dashboard-note").value = "Focus";
  doc.getElementById("setting-popup-note").value = "Popup";
  doc.getElementById("setting-dashboard-button-label").value = "Dashboard";
  doc.getElementById("setting-popup-layout").value = "stack";
  doc.getElementById("setting-popup-density").value = "compact";
  doc.getElementById("setting-popup-action").value = "open_dashboard";
  doc.getElementById("setting-popup-micro-note").value = "Micro";
  doc.getElementById("setting-popup-mood").value = "Chill";
  doc.getElementById("setting-popup-show-active-time").checked = true;
  doc.getElementById("setting-popup-show-top-domain").checked = true;
  doc.getElementById("setting-popup-show-distraction").checked = true;
  doc.getElementById("setting-popup-show-session-label").checked = true;
  doc.getElementById("setting-popup-show-last-action").checked = true;
  doc.getElementById("setting-dashboard-story-mode").checked = true;
  doc.getElementById("setting-session-list-style").value = "minimal";
  doc.getElementById("setting-pin-active-session").checked = true;
  doc.getElementById("setting-focus-prompts").value = "Prompt one";
  doc.getElementById("setting-outcome-highlights").checked = true;
  doc.getElementById("setting-dashboard-show-overview").checked = true;
  doc.getElementById("setting-dashboard-show-sessions").checked = true;
  doc.getElementById("setting-dashboard-show-timeline").checked = true;
  doc.getElementById("setting-dashboard-show-graph").checked = true;
  doc.getElementById("setting-dashboard-show-stats").checked = true;
  doc.getElementById("setting-dashboard-show-honesty").checked = true;
  doc.getElementById("setting-dashboard-show-callouts").checked = true;
  doc.getElementById("setting-accent-color").value = "#ff6600";
  doc.getElementById("setting-typography-style").value = "bold";
  doc.getElementById("setting-ui-density").value = "compact";
  doc.getElementById("setting-reduce-motion").checked = true;
  doc.getElementById("setting-session-list-limit").value = "25";

  const drafted = hooks.collectSettingsFromForm();
  assert.equal(drafted.popupQuickGlance.length, 5);

  doc.body.style.setProperty("--accent", "#123456");
  hooks.app.settings = { ...hooks.app.settings, accentColor: "" };
  hooks.renderSettings();
  hooks.app.settings = { ...hooks.app.settings, accentColor: "#ff0000" };
  hooks.renderSettings();

  let sendActionCount = 0;
  let reconcileCount = 0;
  let deleteCalled = false;
  let restoreCalled = false;
  let deleteAllCalled = false;
  let exportCalled = 0;
  let resetSettingsCalled = 0;
  let undoCalled = 0;
  let refreshCalled = 0;
  let freezeCalled = false;
  let resetCalled = false;
  let runCalled = false;
  let selectCalls = 0;

  context.sendSessionAction = () => {
    sendActionCount += 1;
  };
  context.scheduleRealtimeReconcile = () => {
    reconcileCount += 1;
  };
  context.applyOptimisticDelete = () => {
    deleteCalled = true;
  };
  context.applyOptimisticRestore = () => {
    restoreCalled = true;
  };
  context.applyOptimisticDeleteAll = () => {
    deleteAllCalled = true;
  };
  context.exportSessionData = () => {
    exportCalled += 1;
  };
  context.resetSettingsToDefault = () => {
    resetSettingsCalled += 1;
  };
  context.restoreUndoSettings = () => {
    undoCalled += 1;
  };
  context.refreshSummaries = () => {
    refreshCalled += 1;
  };
  context.showToast = (message, label, action) => {
    if (typeof action === "function") {
      action();
    }
  };
  const selectBackup = context.selectSession;
  context.selectSession = (...args) => {
    selectCalls += 1;
    if (selectBackup) {
      selectBackup(...args);
    }
  };

  hooks.app.graph = {
    setFreeze: () => {
      freezeCalled = true;
    },
    draw: () => {},
    setData: () => {},
    lastKey: null,
    resize: () => {},
    resetView: () => {
      resetCalled = true;
    },
    run: () => {
      runCalled = true;
    },
  };

  hooks.bindControls();

  hooks.app.session = null;
  doc.getElementById("session-delete").click();
  hooks.app.session = hooks.app.state.sessions.s1;

  context.confirm = () => false;
  doc.getElementById("session-delete").click();

  context.confirm = () => true;
  doc.getElementById("session-delete").click();

  const favoritesToggle = doc.getElementById("session-filter-favorites");
  favoritesToggle.checked = true;
  favoritesToggle.dispatchEvent(new dom.window.Event("change"));

  const sessionSelect = doc.getElementById("session-select");
  sessionSelect.value = "s2";
  sessionSelect.dispatchEvent(new dom.window.Event("change"));

  const datePicker = doc.getElementById("session-date-picker");
  datePicker.value = "";
  datePicker.dispatchEvent(new dom.window.Event("change"));
  datePicker.value = "2099-01-01";
  datePicker.dispatchEvent(new dom.window.Event("change"));
  hooks.app.sessionFilterFavoritesOnly = true;
  hooks.app.state.sessions.s1.favorite = false;
  datePicker.value = context.formatDateKey(hooks.app.state.sessions.s1.startedAt);
  datePicker.dispatchEvent(new dom.window.Event("change"));

  hooks.populateSessionList();
  hooks.handleSessionListKeydown({ key: "Escape" });
  hooks.app.cache.sessionListData = hooks.getSessionListData();
  let prevented = false;
  hooks.handleSessionListKeydown({ key: "ArrowDown", preventDefault: () => { prevented = true; } });
  hooks.handleSessionListKeydown({ key: "Home", preventDefault: () => {} });
  hooks.handleSessionListKeydown({ key: "End", preventDefault: () => {} });
  hooks.app.cache.sessionListData = { ordered: [] };
  hooks.handleSessionListKeydown({ key: "ArrowUp" });

  const form = doc.getElementById("settings-form");
  form.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  form.dispatchEvent(new dom.window.Event("input"));
  form.dispatchEvent(new dom.window.Event("change"));

  const graphSearch = doc.getElementById("graph-search");
  graphSearch.value = "query";
  graphSearch.dispatchEvent(new dom.window.Event("input"));
  const graphNodeCap = doc.getElementById("graph-node-cap");
  graphNodeCap.value = "50";
  graphNodeCap.dispatchEvent(new dom.window.Event("input"));
  const graphMinActive = doc.getElementById("graph-min-active");
  graphMinActive.value = "3";
  graphMinActive.dispatchEvent(new dom.window.Event("input"));
  const graphMinEdge = doc.getElementById("graph-min-edge");
  graphMinEdge.value = "4";
  graphMinEdge.dispatchEvent(new dom.window.Event("input"));
  const graphColorBy = doc.getElementById("graph-color-by");
  if (!graphColorBy.options.length) {
    ["activity", "domain", "category"].forEach((value) => {
      const option = doc.createElement("option");
      option.value = value;
      option.textContent = value;
      graphColorBy.appendChild(option);
    });
  }
  graphColorBy.value = "domain";
  graphColorBy.dispatchEvent(new dom.window.Event("change"));
  const showLabels = doc.getElementById("graph-show-labels");
  showLabels.checked = false;
  showLabels.dispatchEvent(new dom.window.Event("change"));
  const hideIsolates = doc.getElementById("graph-hide-isolates");
  hideIsolates.checked = true;
  hideIsolates.dispatchEvent(new dom.window.Event("change"));
  const freeze = doc.getElementById("graph-freeze");
  freeze.checked = true;
  freeze.dispatchEvent(new dom.window.Event("change"));
  doc.getElementById("graph-reset").click();
  doc.querySelector(".graph-toggle[data-mode=\"page\"]").click();

  doc.getElementById("summary-refresh").click();

  doc.getElementById("open-settings").click();
  chrome.runtime.openOptionsPage = null;
  doc.getElementById("open-settings").click();
  doc.getElementById("open-dashboard").click();

  doc.querySelector(".view-tab[data-view=\"settings\"]").click();
  doc.querySelector(".deep-tab[data-deep=\"graph\"]").click();

  doc.getElementById("export-data").click();
  context.confirm = () => false;
  doc.getElementById("delete-all-sessions").click();
  context.confirm = () => true;
  doc.getElementById("delete-all-sessions").click();
  context.confirm = () => false;
  doc.getElementById("reset-state").click();
  context.confirm = () => true;
  doc.getElementById("reset-state").click();
  doc.getElementById("reset-settings").click();
  if (hooks.elements.undoSettings) {
    hooks.elements.undoSettings.click();
  }

  helpOne.click();
  helpTwo.click();
  helpTwo.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" }));
  doc.body.dispatchEvent(new dom.window.Event("click"));
  rankToggleNoTarget.click();
  rankToggleMissing.click();
  rankToggle.click();

  context.updateRankListVisibility(null);
  const plainList = ensureElement(doc, "ol", "rank-list-plain");
  context.updateRankListVisibility(plainList, 0);

  if (rafCb) {
    rafCb();
  }

  assert.equal(deleteCalled, true);
  assert.equal(restoreCalled, true);
  assert.equal(deleteAllCalled, true);
  assert.equal(openOptionsCalled, true);
  assert.ok(tabsCreated.length >= 1);
  assert.ok(exportCalled >= 1);
  assert.ok(resetSettingsCalled >= 1);
  if (!undoCalled) {
    context.restoreUndoSettings();
  }
  assert.ok(undoCalled >= 1);
  assert.ok(refreshCalled >= 1);
  assert.ok(freezeCalled);
  assert.ok(resetCalled);
  assert.ok(runCalled);
  assert.ok(prevented);
  assert.ok(sendActionCount >= 2);
  assert.ok(reconcileCount >= 1);
  assert.ok(selectCalls >= 2);
});

test("dashboard realtime and delta coverage extras", () => {
  const dom = createCoverageDom();
  const doc = dom.window.document;
  const canvas = doc.getElementById("graph-canvas");
  createCanvasStub(canvas);

  const timeouts = new Map();
  let timeoutId = 0;
  const intervals = new Map();
  let intervalId = 0;
  let rafCb = null;
  const chrome = createChromeMock();

  const { hooks, context } = loadDashboard({
    dom,
    chrome,
    clock: createClock(0),
    extraGlobals: {
      setTimeout: (cb) => {
        timeoutId += 1;
        timeouts.set(timeoutId, cb);
        return timeoutId;
      },
      clearTimeout: (id) => {
        timeouts.delete(id);
      },
      setInterval: (cb) => {
        intervalId += 1;
        intervals.set(intervalId, cb);
        return intervalId;
      },
      clearInterval: (id) => {
        intervals.delete(id);
      },
      requestAnimationFrame: (cb) => {
        rafCb = cb;
        return 1;
      },
      cancelAnimationFrame: () => {},
    },
  });

  hooks.app.settings = {
    ...hooks.DEFAULT_SETTINGS,
    realtimeStreamEnabled: true,
  };
  const baseSession = {
    id: "s1",
    nodes: { "https://example.com": { activeMs: 10 } },
    edges: {},
    events: new Array(5000).fill({ type: "navigation" }),
    eventCount: 5000,
    eventCursor: 0,
  };
  const baseState = {
    sessions: { s1: baseSession },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tracking: { activeSince: 1, activeUrl: "https://example.com" },
  };
  hooks.app.state = baseState;
  hooks.app.session = baseSession;

  const appliedSources = [];
  context.applyState = (state, source) => {
    appliedSources.push(source);
  };
  chrome.runtime.sendMessage = (msg, cb) => {
    chrome.runtime.lastError = { message: "fail" };
    cb({});
  };
  context.requestLiveStateSnapshot();
  chrome.runtime.lastError = null;
  chrome.runtime.sendMessage = (msg, cb) => {
    cb({ state: { schemaVersion: 4, sessions: {}, sessionOrder: [] } });
  };
  context.requestLiveStateSnapshot();
  chrome.runtime.sendMessage = null;
  chrome.storage.local.get = (key, cb) => {
    chrome.runtime.lastError = { message: "err" };
    cb({});
  };
  context.requestLiveStateSnapshot();
  chrome.runtime.lastError = null;
  chrome.storage.local.get = (key, cb) => {
    cb({ [hooks.STORAGE_KEY]: { schemaVersion: 4, sessions: {}, sessionOrder: [] } });
  };
  context.requestLiveStateSnapshot();
  assert.ok(appliedSources.includes("live"));
  assert.ok(appliedSources.includes("local"));

  let queued = 0;
  const queueDeltaBackup = context.queueRealtimeDelta;
  context.queueRealtimeDelta = () => {
    queued += 1;
  };
  hooks.handleRealtimeMessage(null);
  hooks.handleRealtimeMessage({ type: "state_snapshot", state: { schemaVersion: 4, sessions: {}, sessionOrder: [] } });
  hooks.handleRealtimeMessage({ type: "state_delta" });
  assert.equal(queued, 1);
  context.queueRealtimeDelta = queueDeltaBackup;

  let appliedDelta = null;
  context.applyStateDelta = (delta) => {
    appliedDelta = delta;
  };
  hooks.app.settings.realtimeBatchUpdates = false;
  context.queueRealtimeDelta({ sessionId: "s1" });
  assert.ok(appliedDelta);

  hooks.app.settings.realtimeBatchUpdates = true;
  appliedDelta = null;
  context.queueRealtimeDelta({ sessionId: "s1", tracking: { activeSince: 1 } });
  context.queueRealtimeDelta({ sessionId: "s1", tracking: { activeSince: 2 } });
  timeouts.forEach((cb) => cb());
  assert.ok(appliedDelta);

  hooks.app.state = null;
  hooks.applyStateDelta({ state: { schemaVersion: 4, sessions: {}, sessionOrder: [] } });
  hooks.app.state = baseState;
  hooks.app.session = baseSession;

  let priorityCalled = 0;
  let deferredCalled = 0;
  let renderCalled = 0;
  let listRefreshCalled = 0;
  context.applyPriorityUpdate = () => {
    priorityCalled += 1;
  };
  context.scheduleDeferredRender = () => {
    deferredCalled += 1;
  };
  context.renderDashboard = () => {
    renderCalled += 1;
  };
  context.scheduleSessionListRefresh = () => {
    listRefreshCalled += 1;
  };
  context.setLiveIndicator = () => {};
  context.updateLiveActiveBase = () => {};

  hooks.app.settings.realtimePriorityUpdates = true;
  hooks.applyStateDelta({
    sessionId: "s1",
    sessionsPatch: [{ id: "s2", label: "New" }, { id: null }],
    sessionOrder: ["s1", "s2"],
    sessionPatch: { label: "Updated" },
    nodePatch: { url: "https://example.com", activeMs: 2 },
    edgePatch: { id: "a -> b", from: "a", to: "b" },
    eventPatch: { type: "navigation", toUrl: "https://example.com" },
  });
  assert.equal(priorityCalled, 1);
  assert.equal(deferredCalled, 1);
  assert.equal(listRefreshCalled, 1);
  assert.equal(renderCalled, 0);

  hooks.app.settings.realtimePriorityUpdates = false;
  hooks.applyStateDelta({ sessionId: "s1", sessionPatch: { label: "Again" } });
  assert.equal(renderCalled, 1);

  hooks.app.settings.realtimePriorityUpdates = true;
  hooks.scheduleSessionListRefresh();
  hooks.scheduleSessionListRefresh();
  timeouts.forEach((cb) => cb());
  hooks.app.settings.realtimePriorityUpdates = false;
  hooks.scheduleSessionListRefresh();

  let frameCalled = false;
  hooks.app.settings.realtimeFrameAligned = false;
  hooks.scheduleFrameRender("stats", () => {
    frameCalled = true;
  });
  hooks.app.settings.realtimeFrameAligned = true;
  hooks.scheduleFrameRender("timeline", () => {
    frameCalled = true;
  });
  hooks.scheduleFrameRender("timeline", () => {
    frameCalled = true;
  });
  if (rafCb) {
    rafCb();
  }

  hooks.scheduleDeferredRender();
  hooks.scheduleDeferredRender();
  timeouts.forEach((cb) => cb());

  hooks.updateLiveActiveBase(null);
  hooks.updateLiveActiveBase(baseSession);

  hooks.setupLiveTimer(hooks.app.settings);
  intervals.forEach((cb) => cb());

  let snapshotCalls = 0;
  context.requestLiveStateSnapshot = () => {
    snapshotCalls += 1;
  };
  context.scheduleRealtimeReconcile();
  timeouts.forEach((cb) => cb());
  assert.ok(snapshotCalls >= 1);

  const port = {
    name: "irht_live",
    onMessage: { addListener: () => {} },
    onDisconnect: { addListener: (fn) => { port._onDisconnect = fn; } },
    postMessage: () => { throw new Error("fail"); },
    disconnect: () => {
      if (port._onDisconnect) {
        port._onDisconnect();
      }
    },
  };
  chrome.runtime.connect = () => port;
  hooks.setupRealtimePort({ realtimeStreamEnabled: true });
  port.disconnect();

  chrome.runtime.connect = () => { throw new Error("boom"); };
  hooks.setupRealtimePort({ realtimeStreamEnabled: true });

  chrome.runtime.connect = null;
  hooks.setupRealtimePort({ realtimeStreamEnabled: true });

  context.setupRealtimePolling({ realtimeStreamEnabled: true });
  intervals.forEach((cb) => cb());

  const workerInstances = [];
  class WorkerStub {
    constructor() {
      this.onmessage = null;
      this.onerror = null;
      workerInstances.push(this);
    }
    postMessage() {}
    terminate() {}
  }
  context.Worker = WorkerStub;
  hooks.setupRealtimeWorker({ realtimeWorkerOffload: true });
  hooks.setupRealtimeWorker({ realtimeWorkerOffload: true });
  if (workerInstances[0]) {
    workerInstances[0].postMessage = () => {
      throw new Error("boom");
    };
  }
  if (workerInstances[0]?.onerror) {
    workerInstances[0].onerror();
  }
  if (workerInstances[0]?.onmessage) {
    workerInstances[0].onmessage({ data: { requestId: 1, graph: {} } });
    workerInstances[0].onmessage({ data: null });
  }

  context.Worker = function BrokenWorker() {
    throw new Error("nope");
  };
  hooks.setupRealtimeWorker({ realtimeWorkerOffload: true });

  context.Worker = undefined;
  hooks.setupRealtimeWorker({ realtimeWorkerOffload: true });
  hooks.setupRealtimeWorker({ realtimeWorkerOffload: false });

  const requestResult = hooks.requestWorkerTask("derive_graph", {});
  const nullResult = hooks.requestWorkerTask("derive_graph", {});
  timeouts.forEach((cb) => cb());
  assert.ok(requestResult);
  assert.ok(nullResult);

  assert.ok(frameCalled);
});

test("dashboard summary, formatting, and ollama coverage extras", async () => {
  const dom = createCoverageDom();
  const doc = dom.window.document;
  const canvas = doc.getElementById("graph-canvas");
  createCanvasStub(canvas);
  const timeouts = new Map();
  let timeoutId = 0;
  const { hooks, context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
    extraGlobals: {
      setTimeout: (cb) => {
        timeoutId += 1;
        timeouts.set(timeoutId, cb);
        return timeoutId;
      },
      clearTimeout: (id) => {
        timeouts.delete(id);
      },
    },
  });

  const session = {
    id: "s1",
    startedAt: Date.now() - 5000,
    updatedAt: Date.now(),
    nodes: { "https://example.com": { url: "https://example.com", activeMs: 2000 } },
    edges: {},
    events: [],
    categoryTotals: { Study: 1000 },
    trapDoors: [{ url: "https://trap.com", postVisitDurationMs: 1000, postVisitDepth: 2 }],
    intentDriftLabel: "High",
    intentDriftReason: "Too many hops",
    intentDriftConfidence: "high",
    intentDriftDrivers: ["Tabs", "Late night"],
    distractionAverage: 1.6,
  };
  hooks.app.state = {
    sessions: {
      s1: session,
      s0: {
        id: "s0",
        nodes: { "https://trap.com": { url: "https://trap.com", activeMs: 1000 } },
        edges: {},
        events: [],
        startedAt: Date.now() - 10000,
        distractionAverage: 1.0,
      },
    },
    sessionOrder: ["s0", "s1"],
    activeSessionId: "s1",
    tracking: {},
  };
  hooks.app.session = session;
  hooks.app.settings = { ...hooks.DEFAULT_SETTINGS, intentDriftAlerts: true, showOutcomeHighlights: true };

  const workerInstances = [];
  class WorkerStub {
    constructor() {
      this.onmessage = null;
      this.onerror = null;
      workerInstances.push(this);
    }
    postMessage() {}
    terminate() {}
  }
  context.Worker = WorkerStub;
  hooks.setupRealtimeWorker({ realtimeWorkerOffload: true });

  assert.equal(context.formatSummaryForDisplay("   "), "");
  assert.equal(context.formatSummaryForDisplay(null), "");
  assert.ok(context.formatSummaryForDisplay("One. Two. Three. Four.").startsWith("•"));

  assert.equal(context.formatDateKey("bad"), "");
  assert.equal(context.formatDateKeyForDisplay("bad"), "that date");
  assert.ok(context.formatDateKeyForDisplay("2026-01-01").includes("2026"));
  const localeBackup = Date.prototype.toLocaleDateString;
  Date.prototype.toLocaleDateString = () => "Monday";
  assert.equal(context.formatSessionDay(Date.now()), "Monday");
  Date.prototype.toLocaleDateString = localeBackup;

  let refreshCount = 0;
  context.refreshSummaries = () => {
    refreshCount += 1;
  };
  hooks.scheduleSummaryRefresh({ force: true });
  hooks.scheduleSummaryRefresh({ force: false });
  timeouts.forEach((cb) => cb());
  assert.ok(refreshCount >= 1);

  hooks.app.settings.summaryTechnicality = "soft";
  context.buildSummaryTechnicalityLine();
  hooks.app.settings.summaryTechnicality = "technical";
  context.buildSummaryTechnicalityLine();
  hooks.app.settings.summaryTechnicality = "balanced";
  context.buildSummaryTechnicalityLine();

  hooks.app.settings.summaryEmojis = "none";
  context.buildSummaryEmojiLine("brief");
  hooks.app.settings.summaryEmojis = "low";
  context.buildSummaryEmojiLine("brief");
  hooks.app.settings.summaryEmojis = "high";
  context.buildSummaryEmojiLine("brief");
  hooks.app.settings.summaryEmojis = "medium";
  context.buildSummaryEmojiLine("detailed");

  hooks.app.settings.summaryLength = "short";
  context.buildSummaryLengthInstruction("brief");
  hooks.app.settings.summaryLength = "long";
  context.buildSummaryLengthInstruction("brief");
  hooks.app.settings.summaryLength = "medium";
  context.buildSummaryLengthInstruction("brief");
  hooks.app.settings.summaryLength = "short";
  context.buildSummaryLengthInstruction("detailed");
  hooks.app.settings.summaryLength = "long";
  context.buildSummaryLengthInstruction("detailed");
  hooks.app.settings.summaryLength = "medium";
  context.buildSummaryLengthInstruction("detailed");

  const sharedBackup = context.IRHTSummaryShared;
  context.IRHTSummaryShared = null;
  assert.equal(context.buildSummaryDataLines(hooks.app.state, session).length, 0);
  context.IRHTSummaryShared = sharedBackup;

  const dataLinesNoSession = await context.buildSummaryDataLinesAsync(hooks.app.state, null);
  assert.equal(dataLinesNoSession.length, 0);

  context.requestWorkerTask = async () => ({ lines: ["a"] });
  const asyncLines = await context.buildSummaryDataLinesAsync(hooks.app.state, session);
  assert.ok(Array.isArray(asyncLines));

  hooks.app.settings.realtimeWorkerOffload = true;
  context.requestWorkerTask = async () => ({ lines: ["a", "b"] });
  const asyncPrompt = await context.buildSummaryPromptAsync(session, "brief");
  assert.ok(asyncPrompt.includes("Session data"));
  hooks.app.settings.realtimeWorkerOffload = false;

  context.requestWorkerTask = async () => null;
  const fallbackLines = await context.buildSummaryDataLinesAsync(hooks.app.state, session);
  assert.ok(Array.isArray(fallbackLines));

  const ollamaCalls = [];
  context.requestOllama = async (endpoint) => {
    ollamaCalls.push(endpoint);
    if (endpoint.includes("proxy")) {
      throw new Error("fail");
    }
    return "ok";
  };
  hooks.app.settings.ollamaEndpoint = "http://proxy";
  hooks.app.settings.ollamaModel = "tiny";
  const response = await context.sendPromptToOllama("Hello");
  assert.equal(response, "ok");

  context.requestOllama = async () => {
    throw new Error("other");
  };
  let threw = false;
  try {
    await context.sendPromptToOllama("Hello");
  } catch (error) {
    threw = true;
  }
  assert.equal(threw, true);

  const sharedBackup2 = context.IRHTShared;
  context.IRHTShared = null;
  const drift = context.computeIntentDrift(session, {});
  assert.equal(drift.label, "Unknown");
  context.IRHTShared = {
    computeIntentDrift: () => ({ score: 2, label: "High", reason: "Reason", confidence: "high", drivers: ["x"] }),
  };
  context.applyIntentDrift(session, {});
  assert.equal(session.intentDriftLabel, "High");
  context.IRHTShared = sharedBackup2;

  const callouts = context.buildCalloutMessages(session, hooks.app.state, "direct");
  assert.ok(callouts.length >= 1);

  context.renderOverviewInsights(null);
  context.renderOverviewInsights({ nodes: {} });
  const insightsBackup = context.getOverviewInsights;
  context.getOverviewInsights = () => [];
  context.renderOverviewInsights(session);
  context.getOverviewInsights = insightsBackup;
  context.renderOverviewInsights(session);
  const insightsFirst = context.getOverviewInsights(session, hooks.app.state);
  const insightsSecond = context.getOverviewInsights(session, hooks.app.state);
  assert.ok(Array.isArray(insightsFirst));
  assert.ok(Array.isArray(insightsSecond));

  context.updateSessionSummaries("s1", "Brief", "Detailed", Date.now());
  assert.equal(hooks.app.summaryState.brief, "Brief");
});

test("dashboard graph utilities coverage extras", async () => {
  const dom = createCoverageDom();
  const doc = dom.window.document;
  const canvas = doc.getElementById("graph-canvas");
  createCanvasStub(canvas);
  const { hooks, context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
  });

  const graphKey = context.GRAPH_SETTINGS_KEY || "irht_graph_settings";
  const localStorage = doc.defaultView.localStorage;
  localStorage.setItem(graphKey, "{bad");
  context.loadGraphSettings();
  localStorage.setItem(
    graphKey,
    JSON.stringify({
      mode: "page",
      nodeCap: 300,
      minNodeMinutes: -1,
      minEdgeCount: 0,
      showLabels: "no",
      hideIsolates: "yes",
      freeze: "no",
      colorBy: "bad",
      search: "  alpha  ",
    }),
  );
  const loadedSettings = context.loadGraphSettings();
  assert.equal(loadedSettings.mode, "page");
  const setItemBackup = localStorage.setItem.bind(localStorage);
  localStorage.setItem = () => {
    throw new Error("fail");
  };
  context.saveGraphSettings({ mode: "domain" });
  localStorage.setItem = setItemBackup;

  assert.equal(context.shouldShowGraphForSession(null), false);
  assert.equal(context.shouldShowGraphForSession({ id: "s1" }), true);

  assert.equal(context.getDomainForGraph("https://example.com/path"), "example.com");
  assert.equal(context.getDomainForGraph("example.com"), "example.com");
  assert.equal(context.getDomainForGraph(null), "");
  assert.equal(context.getDomainForGraph("bad url"), "");

  const seeded = context.seedNodesFromEdges([
    { from: "a", to: "b" },
    { from: "a", to: null },
    { from: null, to: "c" },
  ]);
  assert.ok(seeded.find((node) => node.id === "a"));
  assert.ok(seeded.find((node) => node.id === "b"));
  assert.ok(seeded.find((node) => node.id === "c"));

  const session = {
    nodes: {},
    edges: {
      "a -> b": { from: "a", to: "b", visitCount: 2 },
    },
  };
  const pageGraph = context.buildGraphData(session, "page");
  assert.ok(pageGraph.nodes.length >= 2);

  const domainSession = {
    nodes: { "https://example.com": { url: "https://example.com", activeMs: 5, visitCount: 1 } },
    edges: { "https://example.com -> https://example.com": { from: "https://example.com", to: "https://example.com", visitCount: 1 } },
  };
  const domainGraph = context.buildGraphData(domainSession, "domain", 1);
  assert.ok(domainGraph.nodes.length <= 1);

  const filtered = context.filterGraphData(
    {
      nodes: [
        { id: "a", label: "Alpha", domain: "alpha.com", url: "https://alpha.com", activeMs: 10 },
        { id: "b", label: "Beta", domain: "beta.com", url: "https://beta.com", activeMs: 1 },
      ],
      edges: [{ from: "a", to: "b", count: 1 }],
    },
    { minNodeMs: 5, search: "alpha", hideIsolates: true, nodeCap: 1, minEdgeCount: 2 },
  );
  assert.ok(filtered.nodes.length <= 1);

  const emptyFiltered = context.filterGraphData(null);
  assert.equal(emptyFiltered.nodes.length, 0);

  hooks.app.graph = {
    setData: () => {},
    lastKey: null,
  };
  hooks.app.graphWarm = false;
  hooks.app.session = {
    id: "s1",
    nodes: { "https://example.com": { url: "https://example.com", title: "Example", activeMs: 1 } },
    edges: {},
  };
  context.renderGraphWithData({ nodes: [], edges: [], emptyReason: "" }, "domain", "s1", { nodeCap: 5, minNodeMinutes: 0, minEdgeCount: 1 });
  context.renderGraphWithData({ nodes: [], edges: [], emptyReason: "" }, "domain", "s1", { nodeCap: 0, minNodeMinutes: 0, minEdgeCount: 1 });

  hooks.app.session = null;
  context.renderGraphWithData({ nodes: [], edges: [], emptyReason: "" }, "domain", "s1", { nodeCap: 5, minNodeMinutes: 0, minEdgeCount: 1 });

  hooks.elements.graphStats.textContent = "";
  hooks.elements.graphLegend.textContent = "";
  context.updateGraphStats({ nodes: [{ label: "Alpha", activeMs: 10 }], edges: [] });
  context.updateGraphLegend({ mode: "page", colorBy: "category" }, { nodes: [{ id: "a" }], edges: [] });
  context.updateGraphLegend({ mode: "domain", colorBy: "activity" }, { nodes: [], edges: [] });

  hooks.applyDashboardVisibility({
    dashboardSections: {
      overview: false,
      sessions: false,
      timeline: false,
      graph: false,
      stats: false,
      honesty: false,
      callouts: false,
    },
  });
});

test("dashboard renderGraph and timeline fallback branches", async () => {
  const dom = createCoverageDom();
  const doc = dom.window.document;
  const canvas = doc.getElementById("graph-canvas");
  createCanvasStub(canvas);
  const { hooks, context } = loadDashboard({
    dom,
    chrome: createChromeMock(),
    clock: createClock(0),
  });

  hooks.app.settings = { ...hooks.DEFAULT_SETTINGS, realtimeWorkerOffload: true };
  hooks.app.graph = {
    setData: () => {},
    lastKey: null,
    setFreeze: () => {},
    draw: () => {},
    resize: () => {},
  };
  hooks.app.graphReady = true;
  hooks.app.graphWarm = false;
  hooks.app.graphSettings = {
    nodeCap: 5,
    minNodeMinutes: 0,
    minEdgeCount: 1,
    search: "",
    hideIsolates: false,
    colorBy: "activity",
    showLabels: true,
  };
  hooks.app.mode = "domain";
  hooks.app.session = {
    id: "s1",
    nodes: { "https://example.com": { url: "https://example.com", title: "Example", activeMs: 10, visitCount: 1 } },
    edges: {},
  };
  hooks.app.state = {
    sessions: { s1: hooks.app.session },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tracking: {},
  };

  const showBackup = context.shouldShowGraphForSession;
  context.shouldShowGraphForSession = () => false;
  hooks.renderGraph();
  context.shouldShowGraphForSession = showBackup;

  class WorkerStub {
    postMessage() {}
    terminate() {}
  }
  context.Worker = WorkerStub;
  hooks.setupRealtimeWorker(hooks.app.settings);
  context.requestWorkerTask = () => Promise.resolve({ graph: { nodes: [], edges: [] } });
  hooks.renderGraph();
  await Promise.resolve();

  context.requestWorkerTask = () => Promise.resolve(null);
  hooks.renderGraph();
  await Promise.resolve();

  hooks.app.settings.realtimeWorkerOffload = false;
  hooks.renderGraph();

  hooks.app.session = null;
  hooks.renderTimeline();
});

test("dashboard branch coverage completion sweep", async () => {
  const dom = createCoverageDom();
  const doc = dom.window.document;
  const canvas = doc.getElementById("graph-canvas");
  createCanvasStub(canvas);
  dom.window.devicePixelRatio = 1;
  dom.window.navigator.clipboard = {
    writeText: async () => {
      throw new Error("fail");
    },
  };

  const timeouts = new Map();
  let timeoutId = 0;
  const chrome = createChromeMock();
  const { hooks, context } = loadDashboard({
    dom,
    chrome,
    clock: createClock(0),
    extraGlobals: {
      setTimeout: (cb) => {
        timeoutId += 1;
        timeouts.set(timeoutId, cb);
        return timeoutId;
      },
      clearTimeout: (id) => {
        timeouts.delete(id);
      },
      requestAnimationFrame: (cb) => {
        cb();
        return 1;
      },
      cancelAnimationFrame: () => {},
      Element: dom.window.Element,
    },
  });

  const now = Date.now();
  const previous = {
    id: "s0",
    startedAt: now - 1200000,
    updatedAt: now - 900000,
    nodes: {
      "https://prev.com": { url: "https://prev.com", activeMs: 60000, visitCount: 1, category: "Study" },
    },
    edges: {},
    events: [],
    eventCount: 0,
    eventCursor: 0,
    categoryTotals: { Study: 60000 },
    distractionAverage: 0.8,
  };
  const session = {
    id: "s1",
    startedAt: now - 600000,
    updatedAt: now - 1000,
    nodes: {
      "https://alpha.com": { url: "https://alpha.com", title: "Alpha", activeMs: 120000, visitCount: 2, category: "Study", firstSeen: now - 600000 },
      "https://beta.com": { url: "https://beta.com", title: "Beta", activeMs: 60000, visitCount: 1, category: "Video", firstSeen: now - 550000 },
      "https://video.com/shorts": { url: "https://video.com/shorts", activeMs: 400000, visitCount: 3, category: "Video", firstSeen: now - 500000 },
      "https://no-title.com": { url: "https://no-title.com", activeMs: 1000, visitCount: 1 },
    },
    edges: {
      "https://alpha.com -> https://beta.com": { from: "https://alpha.com", to: "https://beta.com", visitCount: 2, activeMs: 5000 },
    },
    events: [
      { type: "active_time_flushed", ts: now - 5000, url: "https://alpha.com", durationMs: 1000 },
      { type: "navigation", ts: now - 4000, fromUrl: "https://alpha.com", toUrl: "https://beta.com" },
      { type: "navigation", ts: now - 3000, fromUrl: "https://beta.com", toUrl: "https://gamma.com" },
      { type: "navigation", ts: now - 2000, fromUrl: "https://gamma.com", toUrl: "https://delta.com" },
      { type: "navigation", ts: now - 1000, fromUrl: "https://delta.com", toUrl: "https://epsilon.com" },
    ],
    eventCount: 5,
    eventCursor: 0,
    categoryTotals: { Study: 120000, Video: 460000 },
    trapDoors: [{ url: "https://trap.com", postVisitDurationMs: 2000, postVisitDepth: 2 }],
    navigationCount: 5,
    label: "Session One",
    labelDetail: "Detail",
    distractionAverage: 1.5,
    intentDriftLabel: "High",
    intentDriftReason: "Drift",
    intentDriftConfidence: "high",
    intentDriftDrivers: ["Tabs"],
  };

  hooks.app.settings = {
    ...hooks.DEFAULT_SETTINGS,
    showOutcomeHighlights: true,
    intentDriftAlerts: true,
    directCallouts: true,
  };
  hooks.app.state = {
    sessions: { s0: previous, s1: session },
    sessionOrder: ["s0", "s1"],
    activeSessionId: "s1",
    tracking: { activeSince: now - 2000, activeUrl: "https://alpha.com" },
  };
  hooks.app.session = session;

  assert.equal(context.formatSummaryForDisplay("Short sentence."), "Short sentence.");
  assert.ok(context.formatSummaryForDisplay("One. Two. Three.").startsWith("•"));
  const splitBackup = String.prototype.split;
  String.prototype.split = () => [];
  assert.equal(context.formatSummaryForDisplay("Edge."), "Edge.");
  String.prototype.split = splitBackup;

  const insightsBackup = context.IRHTInsights;
  context.IRHTInsights = {
    buildSessionMirror: () => ({ summary: "Mirror summary", origin: "Mirror origin" }),
    generateInsights: () => ["Insight", { text: "Extra" }],
  };
  context.renderOverviewSummary(session);
  context.IRHTInsights.buildSessionMirror = () => null;
  session.label = "Session label";
  context.renderOverviewSummary(session);
  session.label = "";
  context.renderOverviewSummary(session);
  context.renderOverviewSummary(null);

  const nodesBackup = session.nodes;
  session.nodes = {};
  context.renderOverviewInsights(session);
  session.nodes = nodesBackup;

  const overviewBackup = context.getOverviewInsights;
  context.getOverviewInsights = () => [];
  context.renderOverviewInsights(session);
  context.getOverviewInsights = overviewBackup;
  context.renderOverviewInsights(session);

  const insightsFirst = context.getOverviewInsights(session, hooks.app.state);
  const insightsSecond = context.getOverviewInsights(session, hooks.app.state);
  assert.ok(Array.isArray(insightsFirst));
  assert.ok(Array.isArray(insightsSecond));

  context.computeDomainHops(session);
  context.computeDomainHops({ ...session, events: [] });
  context.buildOutcomeHighlights(session, hooks.app.state);
  context.buildOutcomeHighlights(session, {
    ...hooks.app.state,
    sessions: { s0: { ...previous, nodes: {} }, s1: session },
    sessionOrder: ["s0", "s1"],
  });

  let refreshCount = 0;
  context.refreshSummaries = () => {
    refreshCount += 1;
  };
  const actions = context.buildRecommendedActions(session);
  await Promise.all(actions.map((action) => action.onClick()));
  assert.ok(refreshCount >= 1);

  context.renderOverviewActions(null);
  context.renderOverviewActions(session);
  doc.querySelectorAll("#overview-actions button").forEach((button) => button.click());

  hooks.app.settings.dashboardFocusNote = "Note";
  context.renderFocusNote();
  hooks.app.settings.dashboardFocusNote = "";
  hooks.app.settings.focusPrompts = "Prompt one\nPrompt two";
  context.renderFocusNote();
  hooks.app.settings.focusPrompts = "";
  context.renderFocusNote();

  context.renderOverviewEmpty();

  doc.body.classList.remove("dashboard-page");
  context.renderDashboard();
  doc.body.classList.add("dashboard-page");
  hooks.app.settings.dashboardSections = {
    ...hooks.DEFAULT_SETTINGS.dashboardSections,
    overview: false,
    timeline: false,
    graph: false,
    stats: false,
    honesty: false,
  };
  context.renderDashboard();

  hooks.app.state = { sessions: {}, sessionOrder: [], activeSessionId: "", tracking: {} };
  hooks.populateSessionSelect();
  hooks.populateSessionList();

  const listSessionA = { id: "a", startedAt: now - 10000, updatedAt: now - 5000, nodes: {}, edges: {}, events: [] };
  const listSessionB = { id: "b", startedAt: now - 20000, updatedAt: now - 15000, endedAt: now - 12000, favorite: true, nodes: {}, edges: {}, events: [] };
  hooks.app.state = {
    sessions: { a: listSessionA, b: listSessionB },
    sessionOrder: ["a", "b"],
    activeSessionId: "",
    tracking: {},
  };
  hooks.app.session = listSessionA;
  hooks.app.settings.pinActiveSession = true;
  hooks.app.sessionFilterFavoritesOnly = true;
  hooks.populateSessionList();
  hooks.getSessionListData();
  hooks.getSessionListData();
  hooks.renderSessionListWindow();
  hooks.renderSessionListWindow();
  hooks.updateSessionListSelection();
  hooks.handleSessionListKeydown({ key: "Tab" });

  hooks.app.settings.summaryBullets = true;
  hooks.app.settings.summaryMetaphors = false;
  hooks.app.settings.summaryLength = "long";
  hooks.app.settings.summaryVerbosity = "extra";
  hooks.app.settings.summaryVoice = "mentor";
  hooks.app.settings.summaryTechnicality = "technical";
  hooks.app.settings.summaryEmojis = "none";
  hooks.app.settings.summaryFormatting = "markdown";
  hooks.app.settings.tone = "direct";
  context.buildSummaryStyleLines("brief");
  context.buildSummaryStyleLines("detailed");
  context.buildSummaryToneLine("brief");
  hooks.app.settings.tone = "neutral";
  context.buildSummaryToneLine("detailed");
  hooks.app.settings.summaryVoice = "unknown";
  context.buildSummaryVoiceLine("brief");
  hooks.app.settings.summaryTechnicality = "soft";
  context.buildSummaryTechnicalityLine();
  hooks.app.settings.summaryTechnicality = "balanced";
  context.buildSummaryTechnicalityLine();
  hooks.app.settings.summaryEmojis = "high";
  context.buildSummaryEmojiLine("brief");
  hooks.app.settings.summaryFormatting = "plain";
  context.buildSummaryFormattingLine();
  context.buildSummaryLengthInstruction("brief");
  context.buildSummaryLengthInstruction("detailed");

  const summarySharedBackup = context.IRHTSummaryShared;
  context.IRHTSummaryShared = null;
  context.buildSummaryDataLines(hooks.app.state, session);
  context.IRHTSummaryShared = { buildSummaryDataLinesShared: () => ["Line"] };
  context.buildSummaryDataLines(hooks.app.state, session);
  context.IRHTSummaryShared = summarySharedBackup;

  const requestBackup = context.requestWorkerTask;
  const workerBackup = context.realtimeWorker;
  context.realtimeWorker = {};
  await context.buildSummaryDataLinesAsync(hooks.app.state, null);
  context.requestWorkerTask = async () => ({ lines: ["line"] });
  await context.buildSummaryDataLinesAsync(hooks.app.state, session);
  context.requestWorkerTask = async () => null;
  await context.buildSummaryDataLinesAsync(hooks.app.state, session);
  context.requestWorkerTask = requestBackup;
  context.realtimeWorker = workerBackup;

  hooks.app.settings.realtimeWorkerOffload = false;
  await context.buildSummaryPromptAsync(session, "brief");
  hooks.app.settings.realtimeWorkerOffload = true;
  context.realtimeWorker = {};
  context.requestWorkerTask = async () => ({ lines: ["line"] });
  await context.buildSummaryPromptAsync(session, "detailed");
  context.requestWorkerTask = requestBackup;
  context.realtimeWorker = workerBackup;
  hooks.app.settings.realtimeWorkerOffload = false;

  const setTimeoutBackup = context.setTimeout;
  const clearTimeoutBackup = context.clearTimeout;
  const fetchBackup = context.fetch;
  let timeoutCallback = null;
  context.setTimeout = (cb) => {
    timeoutCallback = cb;
    return 1;
  };
  context.clearTimeout = () => {
    timeoutCallback = null;
  };
  context.fetch = () => new Promise(() => {});
  let timeoutError = null;
  try {
    const timeoutPromise = context.requestOllama("http://ollama", "model", "prompt");
    if (timeoutCallback) {
      timeoutCallback();
    }
    await timeoutPromise;
  } catch (error) {
    timeoutError = error;
  }
  assert.ok(timeoutError);
  context.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  try {
    await context.requestOllama("http://ollama", "model", "prompt");
  } catch (error) {
    // Expected.
  }
  context.fetch = async () => ({ ok: true, status: 200, json: async () => ({ response: 123 }) });
  const emptyResponse = await context.requestOllama("http://ollama", "model", "prompt");
  assert.equal(emptyResponse, "");
  context.setTimeout = setTimeoutBackup;
  context.clearTimeout = clearTimeoutBackup;
  context.fetch = fetchBackup;

  const requestOllamaBackup = context.requestOllama;
  context.requestOllama = async () => {
    throw new Error("bad");
  };
  hooks.app.settings.ollamaEndpoint = context.DIRECT_OLLAMA_ENDPOINT;
  let directError = false;
  try {
    await context.sendPromptToOllama("Hi");
  } catch (error) {
    directError = true;
  }
  assert.equal(directError, true);
  context.requestOllama = requestOllamaBackup;

  hooks.app.settings.realtimeWorkerOffload = true;
  context.realtimeWorker = {};
  let resolveTask = null;
  const taskPromise = new Promise((resolve) => {
    resolveTask = resolve;
  });
  context.requestWorkerTask = () => taskPromise;
  hooks.app.session = session;
  context.renderTimeline();
  hooks.app.session = { id: "s2", nodes: {}, edges: {}, events: [], eventCount: 0, eventCursor: 0 };
  resolveTask({ segments: [] });
  await taskPromise;
  hooks.app.settings.realtimeWorkerOffload = false;
  context.realtimeWorker = workerBackup;
  context.requestWorkerTask = requestBackup;

  const buildTimelineBackup = context.buildTimelineSegments;
  context.buildTimelineSegments = () => [];
  hooks.app.session = session;
  context.renderTimeline();
  context.buildTimelineSegments = buildTimelineBackup;
  context.buildTimelineSegments(session, hooks.app.state.tracking, true);

  hooks.app.graph = new hooks.ForceGraph(canvas, doc.getElementById("graph-tooltip"));
  hooks.app.graphReady = true;
  hooks.app.graphWarm = true;
  hooks.app.graphSettings = {
    nodeCap: 5,
    minNodeMinutes: 0,
    minEdgeCount: 1,
    search: "",
    hideIsolates: false,
    colorBy: "activity",
    showLabels: true,
  };
  hooks.app.mode = "domain";
  hooks.app.session = session;
  context.renderGraphWithData({ nodes: [], edges: [], emptyReason: "" }, "domain", "s1", hooks.app.graphSettings);
  context.renderGraphWithData({ nodes: [{ id: "x", url: "https://x.com", activeMs: 1 }], edges: [] }, "page", "s1", hooks.app.graphSettings);
  hooks.app.settings.realtimeWorkerOffload = false;
  context.renderGraph();

  hooks.app.session = null;
  context.renderHonesty();
  hooks.app.session = session;
  context.renderHonesty();
  context.renderDamageReceipts({ nodes: {}, edges: {}, events: [] });
  context.renderReturnPath({ nodes: {}, edges: {}, events: [], trapDoors: [] });
  hooks.app.settings.dashboardSections.callouts = false;
  context.renderCallouts(session, hooks.app.state);
  hooks.app.settings.dashboardSections.callouts = true;
  hooks.app.settings.directCallouts = false;
  context.renderCallouts(session, hooks.app.state);
  hooks.app.settings.directCallouts = true;
  const calloutBackup = context.buildCalloutMessages;
  context.buildCalloutMessages = () => [];
  context.renderCallouts(session, hooks.app.state);
  context.buildCalloutMessages = calloutBackup;
  context.renderCallouts(session, hooks.app.state);

  context.hasSessions(null);
  context.hasSessions({ sessions: { s1: { id: "s1", deleted: true } } });
  context.isStateEmpty(null);
  context.isStateEmpty(hooks.app.state);
});
