const assert = require("node:assert/strict");
const { test } = require("node:test");
const vm = require("node:vm");
const {
  createClock,
  createChromeMock,
  createContext,
  loadScript,
  rootPath
} = require("./test-helpers");

function loadBackground({ chrome, clock, extraGlobals = {} }) {
  const context = createContext({ chrome, clock, extraGlobals });
  loadScript(rootPath("categories.js"), context);
  loadScript(rootPath("shared.js"), context);
  loadScript(rootPath("background.js"), context);
  return { context, hooks: context.__IRHT_TEST_HOOKS__.background, chrome };
}

function seedState(hooks, clock) {
  const state = hooks.createNewState();
  hooks.setState(state);
  hooks.setRuntime({
    activeTabId: 1,
    activeUrl: "https://example.com/",
    activeTitle: "Example",
    activeEdgeKey: null,
    activeSince: null,
    lastInteractionAt: clock.now(),
    userIdle: false,
    lastInactiveAt: null,
    windowFocused: true,
    idleState: "active",
    settings: { ...hooks.DEFAULT_SETTINGS }
  });
  hooks.ensureTabState(1);
  return state;
}

test("background loadState migration paths", async () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks, context } = loadBackground({ chrome, clock });

  const fresh = await hooks.loadState();
  assert.equal(fresh.schemaVersion, hooks.SCHEMA_VERSION);
  assert.ok(fresh.activeSessionId);

  const v3 = {
    schemaVersion: 3,
    sessions: {},
    sessionOrder: [],
    activeSessionId: null,
    tabs: {},
    tracking: {}
  };
  chrome._storage.local[hooks.STORAGE_KEY] = v3;
  const loadedV3 = await hooks.loadState();
  assert.equal(loadedV3.schemaVersion, hooks.SCHEMA_VERSION);

  const v2Session = {
    id: "v2",
    startedAt: clock.now(),
    updatedAt: clock.now(),
    nodes: {
      "https://example.com/": { id: "https://example.com/", url: "https://example.com/" }
    },
    edges: {}
  };
  const v2 = {
    schemaVersion: 2,
    sessions: { [v2Session.id]: v2Session },
    sessionOrder: [],
    activeSessionId: null,
    tabs: {},
    tracking: {}
  };
  chrome._storage.local[hooks.STORAGE_KEY] = v2;
  const loadedV2 = await hooks.loadState();
  assert.equal(loadedV2.schemaVersion, hooks.SCHEMA_VERSION);
  assert.ok(loadedV2.sessionOrder.length);
  assert.equal(loadedV2.activeSessionId, v2Session.id);

  const v1 = {
    schemaVersion: 1,
    session: {
      id: "legacy",
      startedAt: clock.now(),
      updatedAt: clock.now(),
      nodes: {},
      edges: {}
    }
  };
  chrome._storage.local[hooks.STORAGE_KEY] = v1;
  const loadedV1 = await hooks.loadState();
  assert.equal(loadedV1.schemaVersion, hooks.SCHEMA_VERSION);
  assert.ok(loadedV1.sessions[loadedV1.activeSessionId]);
});

test("background getActiveSession resolves multiple active sessions", () => {
  const clock = createClock(1050);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });

  const sessionA = hooks.createSession(clock.now() - 2000);
  sessionA.id = "a";
  sessionA.updatedAt = clock.now() - 1000;
  const sessionB = hooks.createSession(clock.now() - 1000);
  sessionB.id = "b";
  sessionB.updatedAt = clock.now();
  const sessionC = hooks.createSession(clock.now() - 3000);
  sessionC.id = "c";
  sessionC.updatedAt = null;
  sessionC.startedAt = null;
  sessionC.lastActivityAt = null;
  hooks.setState({
    schemaVersion: hooks.SCHEMA_VERSION,
    sessions: { a: sessionA, b: sessionB, c: sessionC },
    sessionOrder: ["a", "b", "c"],
    activeSessionId: null,
    tabs: {},
    tracking: {},
  });

  const active = hooks.getActiveSession();
  assert.equal(active.id, "b");
  assert.ok(sessionA.endedAt);
});

test("background getActiveSession handles missing timestamps", () => {
  const clock = createClock(1100);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  const sessionA = hooks.createSession(clock.now());
  sessionA.id = "a";
  sessionA.startedAt = null;
  sessionA.updatedAt = null;
  sessionA.lastActivityAt = null;
  const sessionB = hooks.createSession(clock.now());
  sessionB.id = "b";
  sessionB.startedAt = null;
  sessionB.updatedAt = null;
  sessionB.lastActivityAt = null;
  hooks.setState({
    schemaVersion: hooks.SCHEMA_VERSION,
    sessions: { a: sessionA, b: sessionB },
    sessionOrder: ["a", "b"],
    activeSessionId: null,
    tabs: {},
    tracking: {},
  });

  const active = hooks.getActiveSession();
  assert.ok(active);
});

test("background importScripts branch", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  let importScriptsArg = null;
  loadBackground({
    chrome,
    clock,
    extraGlobals: {
      importScripts: (path) => {
        importScriptsArg = path;
      }
    }
  });
  assert.equal(importScriptsArg, "shared.js");
});

test("background settings and classification", () => {
  const clock = createClock(2000);
  const chrome = createChromeMock();
  const { hooks, context } = loadBackground({ chrome, clock });

  const sanitized = hooks.sanitizeSettings({
    sessionTimeoutMinutes: 1,
    userIdleMinutes: 400,
    theme: "ink",
    tone: "direct",
    syncEnabled: "yes",
    trackingPaused: "yes",
    directCallouts: "yes",
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
    productiveSites: "docs.example.com\nmail.example.com",
    distractingSites: ["video.example.com", "social.example.com"],
    categoryOverrides: { "Example.com": "Study", "bad": "Other" }
  });
  assert.equal(sanitized.sessionTimeoutMinutes, 3);
  assert.equal(sanitized.userIdleMinutes, 30);
  assert.equal(sanitized.theme, "ink");
  assert.equal(sanitized.tone, "direct");
  assert.equal(sanitized.syncEnabled, true);
  assert.equal(sanitized.trackingPaused, true);
  assert.equal(sanitized.directCallouts, true);
  assert.equal(sanitized.productiveSites.length, 2);
  assert.equal(sanitized.distractingSites.length, 2);
  assert.equal(sanitized.categoryOverrides["example.com"], "Study");
  assert.equal(sanitized.categoryOverrides.bad, undefined);

  hooks.setRuntime({ settings: sanitized });
  assert.equal(hooks.getSessionIdleThresholdMs(), 3 * 60 * 1000);
  assert.equal(hooks.getUserIdleTimeoutMs(), 30 * 60 * 1000);

  assert.equal(hooks.normalizeUrl("not-a-url"), null);
  assert.equal(hooks.normalizeUrl("chrome://extensions"), null);
  assert.equal(hooks.normalizeUrl("https://example.com/path#hash"), "https://example.com/path");

  assert.equal(hooks.classifyUrl("https://example.com"), "Study");
  assert.equal(hooks.classifyUrl("https://news.ycombinator.com"), "News");
  assert.equal(hooks.classifyUrl("https://www.youtube.com/watch?v=1"), "Video");
  assert.equal(hooks.classifyUrl("https://unknown.domain"), "Random");
  assert.equal(hooks.classifyUrl("bad-url"), "Random");

  assert.equal(hooks.matchesDomain("sub.example.com", "*.example.com"), true);
  assert.equal(hooks.matchesDomain("example.com", "example.com"), true);
  assert.equal(hooks.matchesDomain("example.com", ".example.com"), false);
  assert.equal(hooks.matchesDomain("sub.example.com", ".example.com"), true);
  assert.equal(hooks.matchesDomain("example.com", "other.com"), false);

  assert.equal(hooks.normalizeSiteList(123).length, 0);
  assert.equal(context.canonicalizeCategory("  "), "");
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
});

test("background activity and session logic", async () => {
  const dayStart = new Date(2026, 0, 1, 0, 0, 0, 0).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1;
  const nextDayStart = dayStart + 24 * 60 * 60 * 1000;
  const clock = createClock(dayStart + 8 * 60 * 60 * 1000);
  const chrome = createChromeMock();
  const { hooks, context } = loadBackground({ chrome, clock });

  const state = seedState(hooks, clock);
  const session = hooks.getActiveSession();
  assert.equal(session.id, state.activeSessionId);

  hooks.markUserActive("input", 1, { timestamp: clock.now() });
  hooks.startActiveTiming();
  clock.advance(5000);
  hooks.flushActiveTime("manual");

  const node = session.nodes["https://example.com/"];
  assert.ok(node.activeMs >= 5000);

  const gapStart = clock.now();
  hooks.setRuntime({ lastInactiveAt: gapStart });
  clock.advance(hooks.getSessionIdleThresholdMs() + 1);
  const nextSession = hooks.ensureSessionForActivity(clock.now(), "resume");
  assert.equal(nextSession.id, session.id);

  hooks.setRuntime({ userIdle: false, lastInteractionAt: clock.now() - hooks.getUserIdleTimeoutMs() - 1 });
  hooks.evaluateUserIdle("timer");
  assert.equal(hooks.runtime.userIdle, true);

  hooks.setRuntime({ lastInteractionAt: clock.now() });
  hooks.evaluateUserIdle("resume");
  assert.equal(hooks.runtime.userIdle, false);

  hooks.setRuntime({ activeTabId: null, activeUrl: null, activeSince: null });
  hooks.startActiveTiming();
  hooks.flushActiveTime("none");

  clock.set(nextDayStart + 5 * 60 * 1000);
  const rolled = hooks.ensureSessionForActivity(clock.now(), "navigation");
  assert.notEqual(rolled.id, session.id);
  assert.equal(session.endedAt, dayEnd);
  assert.equal(session.endReason, "day_end");
});

test("background adaptive idle timeout and day rollover", () => {
  const dayStart = new Date(2026, 0, 2, 0, 0, 0, 0).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1;
  const nextDayStart = dayStart + 24 * 60 * 60 * 1000;
  const clock = createClock(dayStart + 2 * 60 * 60 * 1000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });

  hooks.setRuntime({
    settings: { ...hooks.DEFAULT_SETTINGS, userIdleMinutes: 2 },
    lastActivityType: "keydown",
  });
  const base = hooks.getUserIdleTimeoutMs();
  assert.ok(hooks.getAdaptiveIdleTimeoutMs() < base);

  hooks.setRuntime({ lastActivityType: "scroll" });
  assert.ok(hooks.getAdaptiveIdleTimeoutMs() > base);

  hooks.setState(hooks.createNewState());
  const session = hooks.getActiveSession();
  clock.set(nextDayStart + 1);
  const next = hooks.ensureSessionForActivity(clock.now(), "tick");
  assert.notEqual(next.id, session.id);
  assert.equal(session.endReason, "day_end");
  assert.equal(session.endedAt, dayEnd);
});

test("background intent split group checks", () => {
  const clock = createClock(9500);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });

  hooks.setState(hooks.createNewState());
  const session = hooks.getActiveSession();
  session.categoryTotals = { Study: 10000 };
  session.lastActivityAt = clock.now() - hooks.INTENT_GAP_MIN_MS - 1;
  hooks.setRuntime({ activeUrl: "https://agency.gov", lastInactiveAt: null });

  const stayed = hooks.ensureSessionForActivity(clock.now(), "tick");
  assert.equal(stayed.id, session.id);

  hooks.setRuntime({
    settings: { ...hooks.DEFAULT_SETTINGS, categoryOverrides: { "neutral.example": "Other" } },
    activeUrl: "https://neutral.example/page",
  });
  hooks.resetUrlMetaCache();
  session.lastActivityAt = clock.now() - hooks.INTENT_GAP_MIN_MS - 1;

  const still = hooks.ensureSessionForActivity(clock.now(), "tick");
  assert.equal(still.id, session.id);
});

test("background intent split early returns", () => {
  const clock = createClock(9600);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });

  hooks.setState(hooks.createNewState());
  const session = hooks.getActiveSession();
  session.startedAt = null;
  session.updatedAt = null;
  session.lastActivityAt = null;
  hooks.setRuntime({ activeUrl: "https://example.edu", lastInactiveAt: null });

  const stayed = hooks.ensureSessionForActivity(clock.now(), "tick");
  assert.equal(stayed.id, session.id);

  session.startedAt = clock.now() - hooks.INTENT_GAP_MIN_MS - 1;
  session.updatedAt = session.startedAt;
  session.lastActivityAt = session.startedAt;
  session.categoryTotals = { Study: 1 };
  hooks.setRuntime({ activeUrl: "https://example.edu" });

  const still = hooks.ensureSessionForActivity(clock.now(), "tick");
  assert.equal(still.id, session.id);
});

test("background intent split does not start a new session", () => {
  const clock = createClock(9700);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });

  hooks.setState(hooks.createNewState());
  const session = hooks.getActiveSession();
  session.categoryTotals = { Video: 5000 };
  session.lastActivityAt = clock.now() - hooks.INTENT_GAP_MIN_MS - 1;
  session.updatedAt = session.lastActivityAt;
  hooks.setRuntime({ activeUrl: "https://example.edu", lastInactiveAt: null });

  const next = hooks.ensureSessionForActivity(clock.now(), "tick");
  assert.equal(next.id, session.id);
  assert.equal(session.endReason, null);
});

test("background navigation and events", () => {
  const clock = createClock(4000);
  const chrome = createChromeMock({
    tabs: [
      { id: 1, url: "https://example.com/", title: "Example", windowId: 1 },
      { id: 2, url: "https://example.com/next", title: "Next", windowId: 1 }
    ],
    activeTabId: 1
  });
  const { hooks, context } = loadBackground({ chrome, clock });

  seedState(hooks, clock);

  hooks.handleNavigation({
    tabId: 1,
    windowId: 1,
    url: "https://example.com/",
    transitionType: "link",
    transitionQualifiers: [],
    frameId: 0
  }, "committed");

  hooks.handleNavigation({
    tabId: 1,
    windowId: 1,
    url: "https://example.com/next",
    transitionType: "link",
    transitionQualifiers: [],
    frameId: 0
  }, "committed");

  const session = hooks.getActiveSession();
  assert.ok(session.edges["https://example.com/ -> https://example.com/next"]);

  hooks.handleNavigation({ tabId: 1, frameId: 0, url: "chrome://extensions" }, "committed");

  hooks.handleReferenceFragmentUpdated({
    tabId: 1,
    windowId: 1,
    url: "https://example.com/page#section",
    frameId: 0
  });

  hooks.handleReferenceFragmentUpdated({
    tabId: 1,
    windowId: 1,
    url: "chrome://extensions",
    frameId: 0
  });

  hooks.handleReferenceFragmentUpdated({
    tabId: 1,
    windowId: 1,
    url: "https://example.com/page#section",
    frameId: 1
  });

  hooks.handleCreatedNavigationTarget({
    tabId: 2,
    sourceTabId: 1,
    url: "https://example.com/next"
  });

  hooks.handleCreatedNavigationTarget({ tabId: undefined });

  hooks.handleHistoryStateUpdated({ frameId: 1 });
  hooks.handleNavigationCommitted({ frameId: 1 });
});

test("background handleNavigation captures category snapshot", () => {
  const clock = createClock(4100);
  const chrome = createChromeMock({
    tabs: [{ id: 1, url: "https://source.example/", title: "Source", windowId: 1 }],
    activeTabId: 1,
  });
  const { hooks } = loadBackground({ chrome, clock });
  seedState(hooks, clock);

  const tabState = hooks.ensureTabState(1);
  tabState.lastUrl = "https://source.example/";
  tabState.lastTitle = "Source";
  const existing = hooks.ensureNode("https://target.example/");
  existing.category = "";

  hooks.handleNavigation(
    {
      tabId: 1,
      windowId: 1,
      url: "https://target.example/",
      transitionType: "link",
      transitionQualifiers: [],
      frameId: 0,
    },
    "committed",
  );

  const session = hooks.getActiveSession();
  assert.ok(session.nodes["https://target.example/"]);

  const second = hooks.ensureNode("https://target2.example/");
  second.category = "Study";
  tabState.lastUrl = "https://source.example/";
  hooks.handleNavigation(
    {
      tabId: 1,
      windowId: 1,
      url: "https://target2.example/",
      transitionType: "link",
      transitionQualifiers: [],
      frameId: 0,
    },
    "committed",
  );
});

test("background prevSnapshot category fallbacks", async () => {
  const clock = createClock(4200);
  const chrome = createChromeMock({
    tabs: [{ id: 1, url: "https://example.com/", title: "Example", windowId: 1 }],
    activeTabId: 1,
  });
  const { hooks, context } = loadBackground({ chrome, clock });
  seedState(hooks, clock);

  const captured = [];
  const originalUpdate = context.updateSessionInsightsForNode;
  context.updateSessionInsightsForNode = (session, node, prevSnapshot) => {
    captured.push(prevSnapshot?.category || null);
  };

  const session = hooks.getActiveSession();
  const node = hooks.ensureNode("https://example.com/");
  node.category = null;
  session.lastActivityAt = clock.now();
  session.updatedAt = clock.now();
  hooks.setRuntime({ lastInactiveAt: null });
  hooks.setRuntime({ activeUrl: null });
  await hooks.refreshActiveTab();

  node.category = "Study";
  session.lastActivityAt = clock.now();
  session.updatedAt = clock.now();
  await hooks.refreshActiveTab();

  node.category = null;
  hooks.setRuntime({ activeTabId: 2, activeUrl: "https://other.example/" });
  session.lastActivityAt = clock.now();
  session.updatedAt = clock.now();
  await hooks.handleTabActivated({ tabId: 1, windowId: 1 });

  node.category = "Study";
  hooks.setRuntime({ activeTabId: 3, activeUrl: "https://other.example/" });
  session.lastActivityAt = clock.now();
  session.updatedAt = clock.now();
  await hooks.handleTabActivated({ tabId: 1, windowId: 1 });

  const tabState = hooks.ensureTabState(1);
  tabState.lastUrl = "https://source.example/";
  node.category = null;
  session.lastActivityAt = clock.now();
  session.updatedAt = clock.now();
  hooks.handleNavigation(
    {
      tabId: 1,
      windowId: 1,
      url: "https://example.com/",
      transitionType: "link",
      transitionQualifiers: [],
      frameId: 0,
    },
    "committed",
  );

  node.category = "Study";
  tabState.lastUrl = "https://source.example/";
  session.lastActivityAt = clock.now();
  session.updatedAt = clock.now();
  hooks.handleNavigation(
    {
      tabId: 1,
      windowId: 1,
      url: "https://example.com/",
      transitionType: "link",
      transitionQualifiers: [],
      frameId: 0,
    },
    "committed",
  );

  context.updateSessionInsightsForNode = originalUpdate;
  assert.ok(captured.includes("Random"));
  assert.ok(captured.includes("Study"));
});

test("background tab and window handlers", async () => {
  const clock = createClock(5000);
  const chrome = createChromeMock({
    tabs: [
      { id: 1, url: "https://example.com/", title: "Example", windowId: 1 }
    ],
    activeTabId: 1
  });
  const { hooks, context } = loadBackground({ chrome, clock });

  seedState(hooks, clock);

  hooks.handleTabCreated({ id: 2, windowId: 1, url: "https://example.com/" });
  hooks.handleTabCreated({
    id: 3,
    windowId: 1,
    url: "https://example.com/title",
    title: "Has Title",
  });

  hooks.handleTabUpdated(1, { title: "New Title" }, { id: 1, url: "https://example.com/", windowId: 1 });
  hooks.handleTabUpdated(1, { url: "chrome://extensions" }, { id: 1, url: "chrome://extensions" });

  hooks.handleTabRemoved(1, { windowId: 1 });
  hooks.handleTabRemoved(2, { windowId: 1 });

  await hooks.refreshWindowFocus();
  await hooks.refreshIdleState();
  await hooks.refreshActiveTab();

  await hooks.handleTabActivated({ tabId: 1, windowId: 1 });
  await hooks.handleTabActivated({ tabId: 999, windowId: 1 });

  hooks.handleWindowFocusChanged(chrome.windows.WINDOW_ID_NONE);
  hooks.handleWindowFocusChanged(1);

  hooks.handleIdleStateChanged("idle");
  hooks.handleIdleStateChanged("active");

  hooks.handleAlarm({ name: hooks.USER_IDLE_ALARM_NAME });
  hooks.handleAlarm({ name: "other" });

  const active = hooks.getActiveSession();
  const dayStart = new Date(clock.now());
  dayStart.setHours(0, 0, 0, 0);
  active.startedAt = dayStart.getTime() - 24 * 60 * 60 * 1000;
  const beforeId = hooks.getState().activeSessionId;
  hooks.handleAlarm({ name: hooks.USER_IDLE_ALARM_NAME });
  assert.notEqual(hooks.getState().activeSessionId, beforeId);
});

test("background handleTabUpdated schedules persist on change", () => {
  const clock = createClock(5050);
  const chrome = createChromeMock({
    tabs: [{ id: 1, url: "https://example.com/", title: "Example", windowId: 1 }],
    activeTabId: 1,
  });
  let timeoutCalls = 0;
  const { hooks } = loadBackground({
    chrome,
    clock,
    extraGlobals: {
      setTimeout: (cb) => {
        timeoutCalls += 1;
        return setTimeout(cb, 0);
      },
      clearTimeout: (id) => clearTimeout(id),
    },
  });
  seedState(hooks, clock);

  const tabState = hooks.ensureTabState(1);
  tabState.lastUrl = "https://example.com/";
  tabState.lastTitle = "Example";

  hooks.handleTabUpdated(
    1,
    { title: "Example" },
    { id: 1, url: "https://example.com/", title: "Example", windowId: 1 },
  );
  assert.equal(timeoutCalls, 0);

  hooks.handleTabUpdated(
    1,
    { url: "https://example.com/new" },
    { id: 1, url: "https://example.com/new", title: "Example", windowId: 1 },
  );
  assert.ok(timeoutCalls > 0);
});

test("background handleTabUpdated ignores untrackable url with no prior state", () => {
  const clock = createClock(5100);
  const chrome = createChromeMock({
    tabs: [{ id: 1, url: "chrome://extensions", title: "Extensions", windowId: 1 }],
    activeTabId: 1,
  });
  let timeoutCalls = 0;
  const { hooks } = loadBackground({
    chrome,
    clock,
    extraGlobals: {
      setTimeout: (cb) => {
        timeoutCalls += 1;
        return setTimeout(cb, 0);
      },
      clearTimeout: (id) => clearTimeout(id),
    },
  });
  seedState(hooks, clock);

  const tabState = hooks.ensureTabState(1);
  tabState.lastUrl = null;
  tabState.lastTitle = null;

  hooks.handleTabUpdated(
    1,
    { url: "chrome://extensions" },
    { id: 1, url: "chrome://extensions", title: "Extensions", windowId: 1 },
  );

  assert.equal(timeoutCalls, 0);
});

test("background pause tracking gates", async () => {
  const clock = createClock(5200);
  const chrome = createChromeMock({
    tabs: [{ id: 1, url: "https://example.com/", title: "Example", windowId: 1 }],
    activeTabId: 1
  });
  const { hooks } = loadBackground({ chrome, clock });

  seedState(hooks, clock);

  chrome._storage.sync[hooks.SETTINGS_KEY] = { trackingPaused: true };
  await hooks.loadSettings();
  const lastInteractionAt = hooks.runtime.lastInteractionAt;

  await hooks.refreshActiveTab();
  await hooks.handleTabActivated({ tabId: 1, windowId: 1 });
  hooks.handleTabCreated({ id: 2, windowId: 1, url: "https://example.com/" });
  hooks.handleTabUpdated(1, { title: "New Title" }, { id: 1, url: "https://example.com/", windowId: 1 });
  hooks.handleTabRemoved(1, { windowId: 1 });
  hooks.handleWindowFocusChanged(chrome.windows.WINDOW_ID_NONE);
  hooks.handleIdleStateChanged("idle");
  hooks.handleAlarm({ name: hooks.USER_IDLE_ALARM_NAME });
  hooks.handleReferenceFragmentUpdated({
    tabId: 1,
    windowId: 1,
    url: "https://example.com/#hash",
    frameId: 0
  });
  hooks.handleCreatedNavigationTarget({
    tabId: 2,
    sourceTabId: 1,
    url: "https://example.com/next"
  });
  hooks.handleNavigation(
    {
      tabId: 1,
      windowId: 1,
      url: "https://example.com/next",
      transitionType: "link",
      transitionQualifiers: [],
      frameId: 0
    },
    "committed"
  );
  hooks.markUserActive("input", 1, { timestamp: clock.now() });
  hooks.evaluateUserIdle("timer");

  assert.equal(hooks.runtime.lastInteractionAt, lastInteractionAt);
  assert.equal(hooks.isTrackingActive(), false);

  hooks.setRuntime({
    activeTabId: 1,
    activeUrl: "https://example.com/",
    activeSince: clock.now() - 5000
  });
  hooks.applyTrackingPauseState(true);
  assert.equal(hooks.runtime.activeSince, null);

  hooks.handleStorageChanged(
    { [hooks.SETTINGS_KEY]: { newValue: { trackingPaused: false } } },
    "sync"
  );

  hooks.setRuntime({ settings: { ...hooks.DEFAULT_SETTINGS, trackingPaused: false } });
  await hooks.applyTrackingPauseState(false);
});

test("background tab creation and activation snapshots", async () => {
  const clock = createClock(5250);
  const chrome = createChromeMock({
    tabs: [
      { id: 5, url: "https://focus.example/", title: "Focus", windowId: 1 },
    ],
    activeTabId: 5,
  });
  const { hooks } = loadBackground({ chrome, clock });
  seedState(hooks, clock);

  hooks.handleTabCreated({ id: 9, windowId: 1, url: "https://new.example/" });
  const createdState = hooks.ensureTabState(9);
  assert.equal(createdState.lastUrl, "https://new.example/");

  const session = hooks.getActiveSession();
  const existing = hooks.ensureNode("https://focus.example/");
  existing.category = "";
  hooks.setRuntime({ activeTabId: 2, activeUrl: "https://other.example/" });
  await hooks.handleTabActivated({ tabId: 5, windowId: 1 });
  assert.ok(session.nodes["https://focus.example/"]);

  existing.category = "Study";
  hooks.setRuntime({ activeTabId: 3, activeUrl: "https://other.example/" });
  await hooks.handleTabActivated({ tabId: 5, windowId: 1 });
});

test("background handleTabCreated normalizes non-http urls to null", () => {
  const clock = createClock(5275);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  seedState(hooks, clock);

  hooks.handleTabCreated({ id: 11, windowId: 1, url: "chrome://extensions" });
  const tabState = hooks.ensureTabState(11);
  assert.equal(tabState.lastUrl, null);
});

test("background refreshActiveTab uses fallback category", async () => {
  const clock = createClock(5300);
  const chrome = createChromeMock({
    tabs: [{ id: 1, url: "https://refresh.example/", title: "Refresh", windowId: 1 }],
    activeTabId: 1,
  });
  const { hooks } = loadBackground({ chrome, clock });
  seedState(hooks, clock);
  const session = hooks.getActiveSession();
  const node = hooks.ensureNode("https://refresh.example/");
  node.category = "";
  session.lastActivityAt = clock.now();
  hooks.setRuntime({ activeUrl: null });
  await hooks.refreshActiveTab();
});

test("background storage, sync, and pruning", () => {
  const clock = createClock(6000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });

  const state = seedState(hooks, clock);
  const session = hooks.getActiveSession();

  session.deleted = true;
  session.deletedAt = clock.now() - hooks.DELETED_RETENTION_MS - 1;
  hooks.pruneDeletedSessions(clock.now());
  assert.ok(!hooks.getState().sessions[session.id]);

  const keepSession = hooks.getActiveSession();
  hooks.setRuntime({ settings: { ...hooks.DEFAULT_SETTINGS, syncEnabled: true } });
  chrome.runtime.lastError = { message: "sync failed" };
  hooks.persistState();

  const syncState = hooks.buildSyncState({
    schemaVersion: 3,
    sessions: { [keepSession.id]: keepSession },
    sessionOrder: [keepSession.id],
    activeSessionId: keepSession.id,
    tracking: hooks.getState().tracking
  });
  assert.ok(syncState.sessions[keepSession.id]);

  hooks.pruneDeletedSessionsIfNeeded();
  hooks.pruneDeletedSessionsIfNeeded();
});

test("background messaging and session actions", async () => {
  const clock = createClock(7000);
  const chrome = createChromeMock();
  const { hooks, context } = loadBackground({ chrome, clock });

  seedState(hooks, clock);

  const response = {};
  let asyncHandled = false;
  const sendResponse = (payload) => {
    response.payload = payload;
  };

  assert.equal(hooks.handleMessage({ type: "get_state" }, {}, sendResponse), false);

  assert.equal(hooks.handleMessage({ type: "user_activity" }, { tab: { id: 1 } }, () => {}), false);

  const resetResult = hooks.handleMessage({ type: "reset_state" }, {}, (payload) => {
    response.reset = payload;
  });
  assert.equal(resetResult, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(response.reset.ok, true);

  assert.equal(hooks.handleMessage({ type: "session_reset" }, {}, sendResponse), false);
  assert.equal(hooks.handleMessage({ type: "session_archive", sessionId: hooks.getState().activeSessionId }, {}, sendResponse), false);
  assert.equal(hooks.handleMessage({ type: "session_unarchive", sessionId: hooks.getState().activeSessionId }, {}, sendResponse), false);
  assert.equal(hooks.handleMessage({ type: "session_delete", sessionId: hooks.getState().activeSessionId }, {}, sendResponse), false);
  assert.equal(hooks.handleMessage({ type: "session_restore", sessionId: hooks.getState().activeSessionId }, {}, sendResponse), false);
  assert.equal(hooks.handleMessage({ type: "session_favorite_toggle", sessionId: hooks.getState().activeSessionId }, {}, sendResponse), false);
  assert.equal(hooks.getState().sessions[hooks.getState().activeSessionId].favorite, true);
  assert.equal(hooks.handleMessage({ type: "session_favorite_toggle", sessionId: "missing" }, {}, sendResponse), false);
  hooks.getState().sessions[hooks.getState().activeSessionId].deleted = true;
  assert.equal(hooks.handleMessage({ type: "session_favorite_toggle", sessionId: hooks.getState().activeSessionId }, {}, sendResponse), false);
  assert.equal(hooks.handleMessage({ type: "session_delete_all" }, {}, sendResponse), false);
  assert.equal(
    hooks.handleMessage(
      {
        type: "session_summary_update",
        sessionId: hooks.getState().activeSessionId,
        summaryBrief: "brief",
        summaryDetailed: "detailed",
        summaryUpdatedAt: clock.now()
      },
      {},
      sendResponse
    ),
    false
  );
  assert.equal(hooks.handleMessage({ type: "unknown" }, {}, sendResponse), false);

  hooks.handleStorageChanged({ [hooks.SETTINGS_KEY]: { newValue: { sessionTimeoutMinutes: 9 } } }, "sync");
  hooks.handleStorageChanged({}, "local");

  hooks.handleUserActivity({ type: "user_activity", activityType: "mousemove", ts: clock.now() }, { tab: { id: 1 } });
  hooks.handleUserActivity({ type: "user_activity" }, { tab: { id: 999 } });
});

test("background insight helpers and labels", () => {
  const clock = createClock(8000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });

  const session = hooks.createSession(clock.now());
  hooks.computeSessionInsights(session);
  assert.equal(session.label, "No activity captured.");

  session.nodes["https://example.com/"] = {
    id: "https://example.com/",
    url: "https://example.com/",
    category: "Study",
    activeMs: 10 * 60 * 1000,
    firstSeen: clock.now(),
    firstNavigationIndex: 0,
    lastNavigationIndex: 0
  };
  session.nodes["https://video.example/"] = {
    id: "https://video.example/",
    url: "https://video.example/",
    category: "Video",
    activeMs: 20 * 60 * 1000,
    firstSeen: clock.now(),
    firstNavigationIndex: 0,
    lastNavigationIndex: 1
  };
  session.navigationCount = 2;
  session.trapDoors = [{ url: "https://video.example/" }];

  const label1 = hooks.buildSessionLabel(session, Object.values(session.nodes), { Video: 10 }, 1.8);
  assert.ok(label1.text.length > 0);

  hooks.computeSessionInsights(session);
  assert.ok(session.distractionAverage > 0);

  const midday = new Date();
  midday.setHours(12, 0, 0, 0);
  assert.equal(hooks.isLateNight(midday.getTime()), false);

  assert.equal(hooks.getDomain("https://www.example.com/path"), "example.com");
  assert.equal(hooks.getDomain("not-a-url"), null);
  assert.equal(hooks.isEntertainmentCategory("Video"), true);
  assert.equal(hooks.isEntertainmentCategory("Random"), true);
  assert.equal(hooks.isProductiveCategory("Study"), true);
  assert.equal(hooks.isProductiveCategory("News"), true);
  assert.equal(hooks.isTechnicalUrl("https://example.com/login"), true);
  assert.equal(hooks.isTechnicalUrl("https://example.com/"), false);

  assert.equal(hooks.pickDominantCategory({ Study: 1, Video: 2 }), "Video");

  const shortSession = {
    startedAt: clock.now(),
    navigationCount: 0,
    nodes: { a: { url: "https://a.com", activeMs: 1000, visitCount: 1 } }
  };
  hooks.buildSessionLabel(shortSession, Object.values(shortSession.nodes), {}, 0);

  const focusSession = {
    startedAt: clock.now(),
    navigationCount: 1,
    nodes: {
      a: { url: "https://a.com", activeMs: 6 * 60 * 1000, visitCount: 1 },
      b: { url: "https://b.com", activeMs: 3 * 60 * 1000, visitCount: 1 }
    }
  };
  hooks.buildSessionLabel(focusSession, Object.values(focusSession.nodes), {}, 0);

  const wanderLoopSession = {
    startedAt: clock.now(),
    navigationCount: 20,
    nodes: {
      a: { url: "https://a.com", activeMs: 60000, visitCount: 2 },
      b: { url: "https://b.com", activeMs: 60000, visitCount: 2 },
      c: { url: "https://c.com", activeMs: 60000, visitCount: 1 },
      d: { url: "https://d.com", activeMs: 60000, visitCount: 1 }
    }
  };
  hooks.buildSessionLabel(wanderLoopSession, Object.values(wanderLoopSession.nodes), {}, 0);

  const wanderSession = {
    startedAt: clock.now(),
    navigationCount: 10,
    nodes: {
      a: { url: "https://a.com", activeMs: 60000, visitCount: 1 },
      b: { url: "https://b.com", activeMs: 60000, visitCount: 1 }
    }
  };
  hooks.buildSessionLabel(wanderSession, Object.values(wanderSession.nodes), {}, 0);

  const loopSession = {
    startedAt: clock.now(),
    navigationCount: 2,
    nodes: {
      a: { url: "https://a.com", activeMs: 2 * 60 * 1000, visitCount: 2 },
      b: { url: "https://b.com", activeMs: 2 * 60 * 1000, visitCount: 2 },
      c: { url: "https://c.com", activeMs: 2 * 60 * 1000, visitCount: 1 },
      d: { url: "https://d.com", activeMs: 2 * 60 * 1000, visitCount: 1 }
    }
  };
  hooks.buildSessionLabel(loopSession, Object.values(loopSession.nodes), {}, 0);

  const lateNight = new Date();
  lateNight.setHours(23, 0, 0, 0);
  const lateNightSession = {
    startedAt: lateNight.getTime(),
    navigationCount: 1,
    nodes: {
      a: { url: "https://a.com", activeMs: 2 * 60 * 1000, visitCount: 1 },
      b: { url: "https://b.com", activeMs: 2 * 60 * 1000, visitCount: 1 }
    }
  };
  hooks.buildSessionLabel(lateNightSession, Object.values(lateNightSession.nodes), {}, 0);

  hooks.computeDistractionScore(
    { activeMs: 60000, visitCount: 1, url: "https://accounts.example.com/login?redirect=next" },
    { navigationCount: 5, nodes: { a: { activeMs: 60000, visitCount: 1 } } }
  );
  hooks.computeDistractionScore(
    { activeMs: 1000, visitCount: 1, url: "https://example.com/login" },
    { navigationCount: 1, nodes: { a: { activeMs: 1000, visitCount: 1 } } }
  );
  hooks.computeDistractionScore(
    { activeMs: 1000, visitCount: 1, url: "not-a-url" },
    { navigationCount: 1, nodes: { a: { activeMs: 1000, visitCount: 1 } } }
  );

  hooks.pickEarlyCategory(
    [
      { url: "https://a.com", firstSeen: clock.now() - 1000, activeMs: 1000, category: "Study" },
      { url: "https://b.com", firstSeen: clock.now() - 900, activeMs: 2000, category: "Study" }
    ],
    { startedAt: null }
  );
  hooks.pickEarlyCategory(
    [
      { url: "https://a.com", firstSeen: undefined, activeMs: 1000, category: "Study" },
      { url: "https://b.com", firstSeen: undefined, activeMs: 2000, category: "Study" }
    ],
    { startedAt: null }
  );
  hooks.pickEarlyCategory(
    [
      { url: "https://a.com", firstSeen: clock.now(), activeMs: undefined, category: "Study" },
      { url: "https://b.com", firstSeen: clock.now(), activeMs: 2000, category: "Study" }
    ],
    { startedAt: clock.now() - 1000 }
  );
});

test("background auto init branch", async () => {
  const clock = createClock(9000);
  const chrome = createChromeMock({
    tabs: [{ id: 1, url: "https://example.com/", title: "Example", windowId: 1 }],
    activeTabId: 1
  });
  const context = createContext({
    chrome,
    clock,
    extraGlobals: { __IRHT_TEST__: false }
  });
  loadScript(rootPath("background.js"), context);
});

test("background test hooks init branch", () => {
  const chrome = createChromeMock();
  const context = createContext({
    chrome,
    extraGlobals: { __IRHT_TEST_HOOKS__: undefined }
  });
  loadScript(rootPath("background.js"), context);
  assert.ok(context.__IRHT_TEST_HOOKS__.background);
});

test("background extra branches", async () => {
  const clock = createClock(10000);
  const chrome = createChromeMock({
    tabs: [{ id: 1, url: "https://example.edu/", title: "Edu", windowId: 1 }],
    activeTabId: 1
  });
  const { hooks } = loadBackground({ chrome, clock });

  hooks.setState(null);
  hooks.hydrateRuntimeFromState();
  hooks.persistState();
  hooks.pruneDeletedSessions(null);

  const emptySession = hooks.createSession(clock.now());
  hooks.endSession(null, clock.now(), "none");
  hooks.endSession({ ...emptySession, endedAt: clock.now() }, clock.now(), "done");

  hooks.appendEvent(emptySession, { ts: clock.now(), type: "sample" });
  for (let i = 0; i < hooks.MAX_EVENTS + 2; i += 1) {
    hooks.appendEvent(emptySession, { ts: clock.now(), type: "spam" });
  }

  hooks.evaluateTrapDoors(null, clock.now());

  const oldState = {
    schemaVersion: 1,
    session: {
      id: "old",
      startedAt: clock.now(),
      updatedAt: clock.now(),
      nodes: {
        "https://example.com/": { id: "https://example.com/", url: "https://example.com/" }
      },
      edges: {}
    }
  };
  hooks.migrateState(oldState);

  hooks.setState(hooks.createNewState());
  clock.advance(hooks.DELETED_PRUNE_INTERVAL_MS + 1);
  hooks.pruneDeletedSessionsIfNeeded();
  hooks.pruneDeletedSessions(clock.now());
  hooks.storageSyncGet(hooks.SETTINGS_KEY);
  hooks.storageSyncSet({ [hooks.SETTINGS_KEY]: hooks.DEFAULT_SETTINGS });
  await hooks.loadSettings();
  hooks.hydrateRuntimeFromState();

  chrome.runtime.lastError = { message: "fail" };
  await hooks.storageGet(hooks.STORAGE_KEY);
  await hooks.storageSyncGet(hooks.SETTINGS_KEY);
  chrome.runtime.lastError = null;

  hooks.setRuntime({ settings: { ...hooks.DEFAULT_SETTINGS, categoryOverrides: null } });
  hooks.getCategoryOverride("example.com");

  hooks.setRuntime({
    settings: {
      ...hooks.DEFAULT_SETTINGS,
      categoryOverrides: { "": "Study", "example.com": "" }
    }
  });
  hooks.getCategoryOverride("example.com");

  hooks.sanitizeSettings({ categoryOverrides: { "": "Study", "example.com": "Bad" } });
  hooks.sanitizeSettings({ categoryOverrides: "invalid" });
  hooks.clampNumber("nope", 1, 2, 3);
  assert.equal(hooks.normalizeUrl(null), null);
  assert.equal(hooks.normalizeUrl("http://"), null);

  hooks.classifyUrl(null);
  hooks.classifyUrl("https://site.edu");
  hooks.classifyUrl("https://site.gov");
  hooks.classifyUrl("https://news.example.com");
  hooks.classifyUrl("https://www.google.com/search?q=test");

  assert.equal(hooks.matchesDomain(null, "example.com"), false);
  assert.equal(hooks.isLateNight(), false);

  hooks.computeSessionInsights(null);
  hooks.computeSessionInsights({ nodes: { "https://example.com/": { url: "https://example.com/" } } });
  hooks.computeSessionInsights({
    nodes: { "https://example.com/": { url: "https://example.com/", category: null, activeMs: 0 } },
    navigationCount: 0
  });

  hooks.pickEarlyCategory([], { startedAt: clock.now() });
  hooks.getDomain(null);

  const session = hooks.getActiveSession();
  const node = hooks.ensureNode("https://example.com/", "Example", session);
  node.category = null;
  hooks.ensureNode("https://example.com/", "Example", session);

  hooks.setRuntime({ userIdle: true, lastInteractionAt: null, activeTabId: 1, activeUrl: "https://example.com/" });
  hooks.markUserActive("input", 1, { timestamp: clock.now() });
  hooks.markUserActive("input", 1, { timestamp: clock.now(), silent: true, deferStart: true });
  hooks.evaluateUserIdle("no_interaction");

  const edgeSession = hooks.getActiveSession();
  const edge = hooks.ensureEdge("https://example.com/", "https://example.com/next", edgeSession);
  hooks.setRuntime({
    activeTabId: 1,
    activeUrl: "https://example.com/next",
    activeEdgeKey: edge.id,
    activeSince: clock.now() - 5000,
    activeTitle: "Next"
  });
  hooks.flushActiveTime("edge");

  hooks.handleNavigationCommitted({ frameId: 0, tabId: 1, windowId: 1, url: "https://example.com/" });
  hooks.handleHistoryStateUpdated({ frameId: 0, tabId: 1, windowId: 1, url: "https://example.com/" });

  const tabState = hooks.ensureTabState(1);
  tabState.lastUrl = null;
  tabState.pendingSourceUrl = "https://example.com/";
  hooks.handleNavigation(
    {
      tabId: 1,
      windowId: 1,
      url: "https://example.com/next",
      transitionType: "link",
      transitionQualifiers: [],
      frameId: 0
    },
    "committed"
  );

  hooks.handleMessage(null, {}, () => {});

  const label = hooks.buildSessionLabel(
    {
      trapDoors: [{ url: "https://video.example/" }],
      navigationCount: 2,
      startedAt: clock.now()
    },
    [
      { url: "https://study.example/", category: "Study", activeMs: 30000, firstSeen: clock.now() },
      { url: "https://video.example/", category: "Video", activeMs: 5000, firstSeen: clock.now() }
    ],
    { Video: 40000 },
    1.2
  );
  assert.ok(label.text.length > 0);

  const labelFocused = hooks.buildSessionLabel(
    { trapDoors: [], navigationCount: 1, startedAt: clock.now() },
    [{ url: "https://study.example/", category: "Study", activeMs: 5000, firstSeen: clock.now() }],
    { Study: 5000 },
    1.0
  );
  assert.ok(labelFocused.text.length > 0);

  const extraSession = hooks.createSession(clock.now());
  hooks.getState().sessions[extraSession.id] = extraSession;
  hooks.archiveSession(extraSession.id);

  const sessionId = hooks.getState().activeSessionId;
  hooks.archiveSession(null);
  hooks.archiveSession(sessionId);
  hooks.getState().sessions[sessionId].deleted = true;
  hooks.archiveSession(sessionId);

  hooks.unarchiveSession(null);
  hooks.unarchiveSession(sessionId);
  hooks.getState().sessions[sessionId].deleted = true;
  hooks.unarchiveSession(sessionId);

  hooks.deleteSessionById(null);
  hooks.deleteSessionById(sessionId);
  hooks.restoreDeletedSession(null);
  hooks.restoreDeletedSession(sessionId);
});

test("background scheduling and safe wrappers", async () => {
  const clock = createClock(12000);
  const chrome = createChromeMock({
    tabs: [{ id: 1, url: "https://example.com/", title: "Example", windowId: 1 }],
    activeTabId: 1
  });
  let timeoutCb = null;
  const { hooks } = loadBackground({
    chrome,
    clock,
    extraGlobals: {
      setTimeout: (cb) => {
        timeoutCb = cb;
        return 1;
      },
      clearTimeout: () => {}
    }
  });

  hooks.setState(hooks.createNewState());
  hooks.schedulePersistState("first");
  clock.advance(5001);
  hooks.schedulePersistState();
  if (timeoutCb) {
    timeoutCb();
  }
  hooks.flushPersistState("manual");

  hooks.schedulePersistState();
  if (timeoutCb) {
    timeoutCb();
  }

  hooks.scheduleSessionAnalysis(null, clock.now());

  const analysisSession = hooks.getActiveSession();
  analysisSession.nodes["https://example.com/"] = {
    url: "https://example.com/",
    activeMs: 1000,
    visitCount: 1,
    firstSeen: clock.now(),
    firstNavigationIndex: 0,
    lastNavigationIndex: 0
  };
  hooks.scheduleSessionAnalysis(analysisSession, clock.now());
  if (timeoutCb) {
    timeoutCb();
  }
  const priorClock = clock.now();
  clock.set(0);
  hooks.scheduleSessionAnalysis(analysisSession);
  if (timeoutCb) {
    timeoutCb();
  }
  clock.set(priorClock);

  const endedSession = hooks.createSession(clock.now() - 20 * 24 * 60 * 60 * 1000);
  endedSession.endedAt = clock.now() - 15 * 24 * 60 * 60 * 1000;
  endedSession.events = [{ ts: clock.now() - 1000, type: "sample" }];
  hooks.getState().sessions[endedSession.id] = endedSession;
  hooks.pruneOldEvents(clock.now());

  hooks.setState({ sessions: {} });
  hooks.scheduleSessionAnalysis(analysisSession, clock.now());
  if (timeoutCb) {
    timeoutCb();
  }

  hooks.setState(null);
  hooks.pruneOldEvents(clock.now());

  const originalGetLastFocused = chrome.windows.getLastFocused;
  chrome.windows.getLastFocused = (cb) => cb(null);
  await hooks.safeGetLastFocusedWindow();
  chrome.windows.getLastFocused = originalGetLastFocused;

  const originalTabsQuery = chrome.tabs.query;
  chrome.tabs.query = (query, cb) => cb(null);
  await hooks.safeTabsQuery({});
  chrome.tabs.query = originalTabsQuery;

  await hooks.safeGetLastFocusedWindow();
  await hooks.safeTabsQuery({});

  chrome.runtime.lastError = { message: "fail" };
  await hooks.safeGetLastFocusedWindow();
  await hooks.safeQueryIdleState();
  await hooks.safeTabsQuery({});
  await hooks.safeTabsGet(999);
  chrome.runtime.lastError = null;
});

test("background shared fallback branches", () => {
  const clock = createClock(13000);
  const chrome = createChromeMock();
  const { hooks, context } = loadBackground({ chrome, clock });

  const sharedBackup = context.IRHTShared;
  context.IRHTShared = null;
  hooks.computeSessionSignals({ nodes: {} });
  hooks.computeDistractionScore({ activeMs: 0 }, { navigationCount: 0 });
  hooks.isTechnicalUrl("https://example.com/login");
  context.IRHTShared = sharedBackup;
});

test("background branch coverage detail", async () => {
  const clock = createClock(11000);
  const chrome = createChromeMock({
    tabs: [
      { id: 1, url: "https://example.com/", windowId: 1 },
      { id: 2, url: "https://example.com/other", windowId: 1 }
    ],
    activeTabId: 1
  });
  const { hooks } = loadBackground({ chrome, clock });

  const state = hooks.createNewState();
  state.tracking.userIdle = undefined;
  hooks.setState(state);
  hooks.hydrateRuntimeFromState();
  state.tracking.userIdle = false;
  hooks.hydrateRuntimeFromState();

  hooks.upgradeState({ schemaVersion: 2, tracking: {} });
  hooks.upgradeState({
    schemaVersion: 2,
    sessions: { s1: hooks.createSession(clock.now()) },
    sessionOrder: ["s1"],
    tracking: { activeTabId: 2 }
  });

  hooks.migrateState({
    schemaVersion: 1,
    session: { id: "a", startedAt: 1000, updatedAt: 2000, nodes: {}, edges: {} },
    tracking: {
      activeTabId: 2,
      activeUrl: "https://example.com/",
      activeEdgeKey: "edge",
      activeSince: 999
    }
  });
  hooks.migrateState({
    schemaVersion: 1,
    session: { id: "b", startedAt: 3000, updatedAt: null, nodes: {}, edges: {} }
  });
  hooks.migrateState({
    schemaVersion: 1,
    session: { id: "c", startedAt: null, updatedAt: null, nodes: undefined, edges: undefined }
  });
  hooks.migrateState({ schemaVersion: 1 });

  hooks.endSession(hooks.createSession(clock.now() - 5000), clock.now(), "manual");
  hooks.endSession(hooks.createSession(clock.now() - 6000), clock.now());

  hooks.setState(hooks.createNewState());
  hooks.setRuntime({ lastInactiveAt: clock.now() - hooks.getSessionIdleThresholdMs() - 1 });
  hooks.ensureSessionForActivity(clock.now(), undefined);

  const trapSession = hooks.createSession(clock.now() - 20000);
  trapSession.navigationCount = 2;
  trapSession.nodes = {
    "https://first.com/": {
      url: "https://first.com/",
      firstSeen: 0,
      firstNavigationIndex: 0,
      activeMs: 1000
    },
    "https://second.com/": {
      url: "https://second.com/",
      firstNavigationIndex: 1,
      activeMs: 1000,
      category: "Study"
    }
  };
  hooks.evaluateTrapDoors(trapSession, clock.now());

  hooks.buildSyncState({});
  hooks.buildSyncState({
    sessions: { s1: { id: "s1", events: undefined } },
    sessionOrder: undefined,
    tracking: {}
  });
  hooks.buildSyncState({
    sessions: { s3: { id: "s3", events: undefined } },
    sessionOrder: ["s3"],
    tracking: {}
  });
  hooks.buildSyncState({
    sessions: { s4: { id: "s4", events: null } },
    sessionOrder: ["s4"],
    tracking: {}
  });
  hooks.buildSyncState({
    sessions: { s2: { id: "s2", events: [] } },
    sessionOrder: ["s2"],
    tracking: {}
  });

  hooks.setState({
    sessions: {
      s1: {
        id: "s1",
        deleted: true,
        deletedAt: clock.now() - hooks.DELETED_RETENTION_MS - 10
      }
    },
    sessionOrder: undefined,
    activeSessionId: "s1"
  });
  hooks.pruneDeletedSessions(clock.now());

  hooks.sanitizeSettings({ theme: 5, categoryOverrides: { "example.com": 123 } });
  hooks.sanitizeSettings({ categoryOverrides: { "example.com": "Study" } });

  hooks.setRuntime({ settings: null });
  hooks.getSessionIdleThresholdMs();
  hooks.getUserIdleTimeoutMs();

  hooks.computeDistractionScore(
    { activeMs: 0, category: null, firstNavigationIndex: null },
    { navigationCount: 0 }
  );
  hooks.computeDistractionScore(
    { activeMs: 0, category: "Unknown", firstNavigationIndex: 1 },
    { navigationCount: 2 }
  );

  hooks.computeSessionInsights({ nodes: undefined });
  hooks.pickDominantCategory(null);

  hooks.pickEarlyCategory([], { startedAt: clock.now() });
  hooks.pickEarlyCategory(
    [
      { url: "https://example.com/", firstSeen: undefined, activeMs: 1000 },
      { url: "https://video.example/", firstSeen: clock.now(), category: "Video", activeMs: 1000 }
    ],
    { startedAt: clock.now() - 1000 }
  );
  hooks.pickEarlyCategory(
    [
      { url: "https://video.example/", firstSeen: clock.now(), category: "Video", activeMs: 1000 },
      { url: "https://example.com/", firstSeen: undefined, activeMs: 1000 }
    ],
    { startedAt: clock.now() - 1000 }
  );
  hooks.pickEarlyCategory(
    [
      { url: "https://example.com/", firstSeen: undefined, activeMs: 1000 },
      { url: "https://another.example/", firstSeen: undefined, activeMs: 500 }
    ],
    { startedAt: clock.now() - 1000 }
  );

  hooks.buildSessionLabel(
    { trapDoors: [], navigationCount: 1, startedAt: clock.now() },
    [],
    null,
    1.2
  );
  hooks.buildSessionLabel(
    { trapDoors: [], navigationCount: 2, startedAt: clock.now() },
    [
      { url: "https://study.example/", category: "Study", activeMs: 3000, firstSeen: clock.now() - 1000 },
      { url: "https://video.example/", category: "Video", activeMs: 1000, firstSeen: clock.now() }
    ],
    { Video: 4000 },
    1.3
  );

  hooks.setState(hooks.createNewState());
  hooks.setRuntime({ activeTabId: 1, activeUrl: "https://example.com/", activeTitle: "Keep" });
  hooks.markUserActive("input", undefined, {});

  hooks.resetUrlMetaCache();
  hooks.normalizeUrl("https://example.com/path");
  hooks.normalizeUrl("https://example.com/path");
  hooks.normalizeUrl("chrome://extensions");
  hooks.getUrlMeta("https://example.com/path");
  hooks.getUrlMeta("bad-url");

  const encoded = hooks.encodeStateForStorage(hooks.getState());
  hooks.decodeStoredState(encoded);
  hooks.trimStateForStorage(hooks.getState());
  hooks.compactStateForStorage(hooks.trimStateForStorage(hooks.getState()));
  hooks.primeStateForDashboard();

  hooks.switchActiveTab(1, "https://example.com/", undefined);
  hooks.switchActiveTab(2, "https://example.com/other", "");

  hooks.setState(hooks.createNewState());
  chrome.setTabs([{ id: 1, url: "https://example.com/", windowId: 1 }]);
  chrome.setActiveTabId(1);
  hooks.setRuntime({ windowFocused: true, idleState: "active" });
  await hooks.refreshActiveTab();

  chrome.setTabs([{ id: 2, url: "https://example.com/other", windowId: 1 }]);
  await hooks.handleTabActivated({ tabId: 2, windowId: 1 });

  hooks.setRuntime({ activeTabId: 1, windowFocused: true, idleState: "active" });
  const sourceTab = hooks.ensureTabState(1);
  sourceTab.lastUrl = "https://example.com/";
  hooks.handleCreatedNavigationTarget({
    tabId: 2,
    sourceTabId: 1,
    url: "https://example.com/next"
  });

  hooks.setRuntime({ windowFocused: false });
  hooks.handleCreatedNavigationTarget({
    tabId: 3,
    sourceTabId: 1,
    url: "https://example.com/other"
  });
  hooks.handleCreatedNavigationTarget({ tabId: 4, url: "https://example.com/new" });

  hooks.setRuntime({ activeTabId: 1, windowFocused: false, idleState: "active" });
  hooks.handleNavigation(
    {
      tabId: 2,
      windowId: 1,
      url: "https://example.com/nav",
      transitionType: "link",
      transitionQualifiers: [],
      frameId: 0
    },
    "committed"
  );

  hooks.handleReferenceFragmentUpdated({
    tabId: 2,
    windowId: 1,
    url: "https://example.com/page#section",
    frameId: 0
  });

  hooks.setRuntime({ activeTabId: 1 });
  hooks.handleUserActivity(
    { activityType: "input", ts: "bad" },
    { tab: { id: 1 } }
  );
  hooks.handleUserActivity(
    { activityType: "input", ts: 0 },
    { tab: { id: 1 } }
  );
  hooks.handleUserActivity(
    { activityType: "input", ts: clock.now() },
    { tab: { id: 1 } }
  );

  hooks.setRuntime({ windowFocused: true });
  hooks.handleWindowFocusChanged(1);
  hooks.setRuntime({ idleState: "active" });
  hooks.handleIdleStateChanged("active");
  const sameTabState = hooks.ensureTabState(1);
  sameTabState.lastUrl = "https://example.com/";
  hooks.handleTabUpdated(1, { url: "https://example.com/" }, { id: 1, url: "https://example.com/", windowId: 1 });
});

test("background primeStateForDashboard handles null sessions", () => {
  const clock = createClock(15000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  hooks.setState({
    schemaVersion: hooks.SCHEMA_VERSION,
    sessions: { s1: null },
    sessionOrder: undefined,
    activeSessionId: null,
    tabs: {},
    tracking: {},
  });
  hooks.primeStateForDashboard();
});

test("background navigation coalesce timing helper", () => {
  const clock = createClock(16000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  const session = hooks.createSession(clock.now());
  session.events = [];
  session.eventCount = 0;
  assert.equal(
    hooks.getNavigationCoalesceMs(session, clock.now()),
    hooks.NAV_EVENT_COALESCE_MS,
  );
  hooks.appendEvent(session, { ts: clock.now(), type: "TAB_ACTIVE" });
  assert.equal(
    hooks.getNavigationCoalesceMs(session, clock.now()),
    hooks.NAV_EVENT_COALESCE_MS,
  );
});

test("background storage compaction, ring buffer, and caches", async () => {
  const clock = createClock(6000);
  const chrome = createChromeMock();
  const { hooks, context } = loadBackground({ chrome, clock });

  const sessions = {};
  const sessionOrder = [];
  for (let i = 0; i < 7; i += 1) {
    const session = hooks.createSession(clock.now() - (7 - i) * 1000);
    session.id = `s${i}`;
    session.nodes = {
      [`https://example.com/${i}`]: {
        url: `https://example.com/${i}`,
        activeMs: 1000 + i,
        visitCount: 1,
        firstSeen: clock.now() - 2000,
        lastSeen: clock.now() - 1000
      },
      [`https://video.example/${i}`]: {
        url: `https://video.example/${i}`,
        activeMs: 500 + i,
        visitCount: i > 2 ? 2 : 1,
        firstSeen: clock.now() - 1500,
        lastSeen: clock.now() - 500
      }
    };
    session.edges = {
      [`https://example.com/${i} -> https://video.example/${i}`]: {
        id: `https://example.com/${i} -> https://video.example/${i}`,
        from: `https://example.com/${i}`,
        to: `https://video.example/${i}`,
        visitCount: 1,
        activeMs: 100
      }
    };
    session.events = [
      { ts: clock.now() - 1000, type: "navigation", toUrl: `https://example.com/${i}` }
    ];
    session.trapDoors = [{ url: `https://video.example/${i}` }];
    sessions[session.id] = session;
    sessionOrder.push(session.id);
  }

  const state = {
    schemaVersion: hooks.SCHEMA_VERSION,
    sessions,
    sessionOrder,
    activeSessionId: "s1",
    tabs: {
      1: {
        lastUrl: "https://example.com/1",
        lastEdgeKey: "edge-1",
        pendingSourceUrl: "https://example.com/source"
      },
      2: null
    },
    tracking: {}
  };

  const trimmed = hooks.trimStateForStorage(state);
  assert.ok(trimmed.sessions.s2);
  assert.ok(Object.keys(trimmed.tabs).length === 1);

  const compact = hooks.compactStateForStorage(trimmed);
  assert.ok(compact.compactTables);
  const decoded = hooks.decodeStoredState(compact);
  assert.ok(decoded.sessions.s1);

  const rawCompact = {
    schemaVersion: hooks.SCHEMA_VERSION,
    compactTables: true,
    urlTable: ["https://example.com/"],
    sessions: {
      s1: {
        id: "s1",
        nodes: [{ urlId: 0 }, { urlId: 2 }],
        edges: [{ fromId: 0, toId: 2 }, { fromId: 0, toId: 0 }],
        events: [{ ts: 1, type: "navigation" }],
        trapDoors: [{ urlId: 0 }],
      }
    },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tabs: {},
    tracking: {}
  };
  const decodedRaw = hooks.decodeStoredState(rawCompact);
  assert.ok(decodedRaw.sessions.s1.nodes["https://example.com/"]);
  assert.ok(decodedRaw.sessions.s1.edges["https://example.com/ -> https://example.com/"]);

  const rawMissing = {
    schemaVersion: hooks.SCHEMA_VERSION,
    compactTables: true,
    urlTable: ["https://example.com/"],
    sessions: {
      s1: {
        id: "s1",
        nodes: null,
        edges: null,
        events: [],
        trapDoors: [],
      },
    },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tabs: {},
    tracking: {},
  };
  const decodedMissing = hooks.decodeStoredState(rawMissing);
  assert.equal(Object.keys(decodedMissing.sessions.s1.nodes).length, 0);
  assert.equal(Object.keys(decodedMissing.sessions.s1.edges).length, 0);
  assert.equal(hooks.decodeStoredState(null), null);

  const cache = new Map();
  hooks.cacheSet(cache, "a", 1, 2);
  hooks.cacheSet(cache, "a", 2, 2);
  hooks.cacheSet(cache, "b", 3, 2);
  hooks.cacheSet(cache, "c", 4, 2);
  assert.ok(cache.has("c"));

  const ringSession = {
    events: [{ ts: 1, type: "a" }, { ts: 2, type: "b" }, { ts: 3, type: "c" }],
    eventCursor: 1,
    eventCount: 1
  };
  hooks.getSessionEvents(ringSession);
  hooks.getLatestEvent(ringSession);

  const negativeCountSession = {
    events: [{ ts: 1, type: "a" }],
    eventCursor: 0,
    eventCount: -1
  };
  hooks.getSessionEvents(negativeCountSession);

  const ringBufferSession = {
    events: Array.from({ length: hooks.MAX_EVENTS }, (_, i) => ({ ts: i })),
    eventCursor: 0,
    eventCount: hooks.MAX_EVENTS
  };
  hooks.appendEvent(ringBufferSession, { ts: clock.now(), type: "ring" });
  hooks.getLatestEvent(ringBufferSession);
  const sparseRingSession = {
    events: [undefined, { ts: 2, type: "b" }],
    eventCursor: 1,
    eventCount: 2,
  };
  assert.equal(hooks.getLatestEvent(sparseRingSession), null);

  const upgradeInput = {
    schemaVersion: 3,
    sessions: {
      s1: { id: "s1", events: [{ ts: 1 }], nodes: {}, edges: {} },
    },
    sessionOrder: [],
    tracking: {}
  };
  hooks.upgradeState(upgradeInput);

  hooks.setState({
    schemaVersion: hooks.SCHEMA_VERSION,
    sessions: {
      sA: { id: "sA", nodes: {}, edges: {}, label: null, categoryTotals: null },
      sB: { id: "sB", nodes: {}, edges: {}, label: "Label", categoryTotals: { Study: 1 } }
    },
    sessionOrder: ["sA", "sB"],
    activeSessionId: "sB",
    tracking: {}
  });
  hooks.primeStateForDashboard();

  hooks.setState(hooks.createNewState());
  hooks.setRuntime({ activeTabId: 1, windowFocused: true, idleState: "active" });
  const tabState = hooks.ensureTabState(1);
  tabState.lastUrl = "https://example.com/";
  hooks.handleTabUpdated(
    1,
    { url: "chrome://extensions" },
    { id: 1, url: "chrome://extensions", windowId: 1 },
  );

  hooks.updateSessionSummaries("missing", "brief", "detail", clock.now());

  hooks.setState(hooks.createNewState());
  const coalesceSession = hooks.getActiveSession();
  hooks.recordEvent("navigation", { tabId: 1, toUrl: "https://a.com" });
  clock.advance(100);
  hooks.recordEvent("navigation", { tabId: 1, toUrl: "https://b.com" });
  assert.equal(coalesceSession.events.length, 1);
  assert.equal(coalesceSession.events[0].toUrl, "https://b.com");

  clock.advance(3000);
  hooks.recordEvent("navigation", { tabId: 1, toUrl: "https://c.com" });
  clock.advance(hooks.NAV_EVENT_COALESCE_MS - 10);
  hooks.recordEvent("navigation", { tabId: 1, toUrl: "https://d.com" });
  assert.ok(coalesceSession.events.length >= 2);

  clock.advance(5000);
  hooks.recordEvent("navigation", { tabId: 1, toUrl: "https://e.com" });
  clock.advance(hooks.NAV_EVENT_COALESCE_MAX_MS - 10);
  hooks.recordEvent("navigation", { tabId: 1, toUrl: "https://f.com" });
  assert.ok(coalesceSession.events.length >= 3);

  const session = hooks.getActiveSession();
  const node = hooks.ensureNode("https://example.com/late");
  node.category = "Random";
  node.visitCount = 2;
  session.metrics = {
    version: 1,
    totalActiveMs: 6000,
    nodesCount: 0,
    revisitCount: 1,
    maxNodeActiveMs: 6000,
    maxDirty: false,
    weightedScore: 0,
    categoryTotals: { Random: 6000 }
  };
  node.activeMs = 5000;
  node._lateNight = undefined;
  hooks.updateSessionInsightsForNode(session, node, {
    activeMs: 6000,
    score: 1,
    category: "Random",
    visitCount: 2
  });
  assert.equal(session.metrics.nodesCount, 1);

  node._lateNight = null;
  hooks.ensureNode(node.url, "Title");

  const ensureBackup = context.ensureSessionMetrics;
  context.ensureSessionMetrics = () => null;
  node.category = "";
  hooks.updateSessionInsightsForNode(session, node);
  context.ensureSessionMetrics = ensureBackup;

  const nodeCategory = hooks.ensureNode("https://example.com/category");
  nodeCategory.category = "";
  hooks.updateSessionInsightsForNode(session, nodeCategory);

  hooks.updateSessionInsightsForNode(null, nodeCategory);

  const metricsSession = hooks.createSession(clock.now());
  metricsSession.nodes = {
    "https://example.com/visit": {
      url: "https://example.com/visit",
      activeMs: 2000,
      visitCount: 2,
      firstSeen: clock.now(),
    },
  };
  hooks.ensureSessionMetrics(metricsSession);

  hooks.setState(null);
  hooks.invalidateScoreCaches();
  hooks.ensureSessionMetrics(null);
  hooks.primeStateForDashboard();

  hooks.setState({
    sessions: { a: { id: "a", nodes: {}, edges: {} } },
    sessionOrder: null,
    activeSessionId: "a",
    tabs: {},
    tracking: {},
  });
  hooks.primeStateForDashboard();

  chrome._storage.local[hooks.STORAGE_KEY] = { schemaVersion: hooks.SCHEMA_VERSION };
  await hooks.loadState();

  chrome._storage.local[hooks.STORAGE_KEY] = hooks.encodeStateForStorage(hooks.getState());
  await hooks.loadState();

  hooks.setState(hooks.createNewState());
  hooks.runtime.normalizedUrlCache.set("bad", "https://%");
  hooks.getUrlMeta("bad");
  hooks.computeDistractionScoreCached(null, null, null);

  const appendSession = {};
  hooks.appendEvent(appendSession, { ts: clock.now(), type: "custom" });

  const latestSession = { events: [{ ts: 1 }], eventCursor: undefined, eventCount: 0 };
  hooks.getLatestEvent(latestSession);

  const compactBase = hooks.trimStateForStorage(hooks.getState());
  compactBase.sessions[compactBase.activeSessionId].nodes = { "": { url: null } };
  hooks.compactStateForStorage(compactBase);

  hooks.updateSessionSummaries(
    compactBase.activeSessionId,
    null,
    undefined,
    NaN,
  );
});

test("background trimStateForStorage scoring branches", () => {
  const clock = createClock(16500);
  const chrome = createChromeMock();
  const { hooks, context } = loadBackground({ chrome, clock });

  if (context.IRHTShared) {
    context.IRHTShared = {
      ...context.IRHTShared,
      computeSessionSignals: () => ({
        totalActiveMs: 0,
        totalMinutes: 0,
        navCount: 0,
        avgDwellMs: 0,
        topShare: 0,
        revisitShare: 0,
      }),
    };
  }

  const sessions = {};
  const sessionOrder = [];
  for (let i = 0; i < 6; i += 1) {
    const session = hooks.createSession(clock.now() - (6 - i) * 1000);
    session.id = `s${i}`;
    session.nodes = i === 0
      ? {
          "https://a.com/": { url: "https://a.com/", activeMs: 0 },
          "https://b.com/": { url: "https://b.com/", activeMs: 0 },
        }
      : { "https://keep.com/": { url: "https://keep.com/", activeMs: 100 } };
    session.edges = i === 0
      ? {
          "edge-1": {
            id: "edge-1",
            from: "https://a.com/",
            to: "https://b.com/",
            activeMs: 0,
          },
          "edge-2": {
            id: "edge-2",
            from: "https://b.com/",
            to: "https://a.com/",
            activeMs: 0,
          },
        }
      : {};
    sessions[session.id] = session;
    sessionOrder.push(session.id);
  }

  const trimmed = hooks.trimStateForStorage({
    schemaVersion: hooks.SCHEMA_VERSION,
    sessions,
    sessionOrder,
    activeSessionId: "s5",
    tabs: {},
    tracking: {},
  });
  assert.ok(trimmed.sessions.s0);

  const baseSession = sessions.s0;
  const signals = context.computeSessionSignals(baseSession);
  context.scoreNodeForTrim(null, baseSession, signals);
  context.scoreEdgeForTrim(null, new Map(), 0);
});

test("background trim helpers coverage", () => {
  const clock = createClock(9000);
  const chrome = createChromeMock();
  const { hooks, context } = loadBackground({ chrome, clock });

  assert.equal(context.trimEventsForStorage(null, 3).length, 0);
  assert.equal(
    context.trimEventsForStorage([{ type: "navigation" }], 3).length,
    1,
  );

  const denseEvents = Array.from({ length: 6 }, (_, i) => ({
    type: "navigation",
    ts: i,
  }));
  const denseTrim = context.trimEventsForStorage(denseEvents, 2);
  assert.equal(denseTrim.length, 2);

  const mixedEvents = [
    { type: "idle_state_changed" },
    { type: "navigation" },
    { type: "user_active" },
    { type: "navigation" },
    { type: "user_inactive" },
  ];
  const mixedTrim = context.trimEventsForStorage(mixedEvents, 3);
  assert.equal(mixedTrim.length, 3);

  assert.equal(
    context.getSessionActiveMs({ metrics: { totalActiveMs: 5000 } }),
    5000,
  );
  assert.equal(context.getSessionActiveMs(null), 0);
  assert.equal(
    context.getSessionActiveMs({ nodes: { a: { activeMs: 1000 } } }),
    1000,
  );

  assert.equal(context.isTrivialSession({ navigationCount: 0, nodes: {} }), true);
  assert.ok(
    context.scoreSessionValue({
      navigationCount: 1,
      nodes: { a: { activeMs: 1000 } },
      distractionAverage: 1,
    }) > 0,
  );

  const sessions = {};
  const sessionOrder = [];
  const baseTime = clock.now() - 100000;
  for (let i = 0; i < 81; i += 1) {
    const id = `s${i}`;
    const startedAt = baseTime + i * 1000;
    const session =
      i === 0
        ? {
            id,
            startedAt,
            updatedAt: startedAt,
            navigationCount: 0,
            nodes: {},
            edges: {},
            events: [],
          }
        : {
            id,
            startedAt,
            updatedAt: startedAt,
            navigationCount: i < 21 ? 10 : 1,
            nodes: {
              [`https://example.com/${id}`]: {
                url: `https://example.com/${id}`,
                activeMs: i < 21 ? 10 * 60 * 1000 : 2 * 60 * 1000,
              },
            },
            edges: {},
            events: [],
          };
    sessions[id] = session;
    sessionOrder.push(id);
  }

  const trimmed = hooks.trimStateForStorage({
    schemaVersion: hooks.SCHEMA_VERSION,
    sessions,
    sessionOrder,
    activeSessionId: "s80",
    tabs: {},
    tracking: {},
  });
  assert.equal(trimmed.sessions.s0, undefined);
});

test("background branch coverage extras", async () => {
  const clock = createClock(20000);
  let timerCallback = null;
  const chrome = createChromeMock({
    tabs: [{ id: 1, url: "https://example.com/", title: "Example", windowId: 1 }],
    activeTabId: 1,
  });
  const { hooks, context } = loadBackground({
    chrome,
    clock,
    extraGlobals: {
      setTimeout: (cb) => {
        timerCallback = cb;
        return 1;
      },
      clearTimeout: () => {},
    },
  });

  context.trimTabsForStorage(null);
  context.trimTabsForStorage({
    1: { lastUrl: "https://a.com", lastEdgeKey: "edge", pendingSourceUrl: null },
  });

  context.getSessionActiveMs({});
  context.getSessionActiveMs({
    nodes: { a: { activeMs: 0 }, b: { activeMs: 5 } },
  });

  context.scoreSessionValue({ navigationCount: 0, nodes: null, distractionAverage: 0 });
  context.scoreSessionValue({
    navigationCount: 1,
    nodes: { a: { activeMs: 1 } },
    distractionAverage: 2,
  });
  context.isTrivialSession({ navigationCount: 0, nodes: null });
  context.isTrivialSession({ navigationCount: 10, nodes: { a: { activeMs: 1 } } });

  const edge = { from: "a", to: "b", activeMs: 10 };
  context.scoreEdgeForTrim(edge, new Map(), 5);
  context.scoreEdgeForTrim(edge, new Map([["a", 2], ["b", 3]]), 3);

  context.trimSessionDetails({ id: "s", nodes: null, edges: null, events: null }, false);

  context.trimStateForStorage({ schemaVersion: hooks.SCHEMA_VERSION });

  context.compactStateForStorage({ sessions: null });
  context.compactStateForStorage({
    sessions: {
      s1: {
        id: "s1",
        nodes: {
          "https://a.com/": { url: "https://a.com/", visitCount: 0 },
        },
        edges: {
          "a->b": { from: "https://a.com/", to: "https://b.com/", visitCount: 0 },
          "b->c": { from: "https://b.com/", to: "https://c.com/", visitCount: 2 },
        },
        trapDoors: [{ url: "https://trap.com" }, {}],
      },
      s2: { id: "s2", nodes: null, edges: null },
    },
  });

  context.decodeStoredState({
    schemaVersion: hooks.SCHEMA_VERSION,
    compactTables: true,
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
        events: [{ ts: 1 }],
      },
      s2: { id: "s2", nodes: [], edges: [], events: null, eventCursor: 0, eventCount: 0 },
      s3: { id: "s3", nodes: [], edges: [], events: null },
    },
    sessionOrder: null,
    activeSessionId: null,
    tabs: null,
    tracking: null,
  });
  context.decodeStoredState({
    schemaVersion: hooks.SCHEMA_VERSION,
    compactTables: true,
    urlTable: "bad",
    sessions: null,
  });

  const createSessionBackup = context.createSession;
  context.createSession = (startedAt) => {
    const state = hooks.getState();
    if (!state.sessions) {
      state.sessions = {};
    }
    return createSessionBackup(startedAt);
  };
  hooks.setState({
    schemaVersion: hooks.SCHEMA_VERSION,
    sessions: null,
    sessionOrder: [],
    activeSessionId: null,
    tabs: {},
    tracking: {},
  });
  hooks.getActiveSession();
  context.createSession = createSessionBackup;

  hooks.setState({
    schemaVersion: hooks.SCHEMA_VERSION,
    sessions: {
      a: { id: "a", startedAt: 1, updatedAt: 2 },
      b: { id: "b", startedAt: 3, lastActivityAt: 4 },
      c: { id: "c", startedAt: 5 },
      d: { id: "d" },
    },
    sessionOrder: ["a", "b", "c", "d"],
    activeSessionId: null,
    tabs: {},
    tracking: {},
  });
  hooks.getActiveSession();

  hooks.setState(hooks.createNewState());
  let session = hooks.getActiveSession();
  session.categoryTotals = { Video: 5000 };
  session.lastActivityAt = clock.now() - hooks.INTENT_GAP_MIN_MS - 1;
  session.updatedAt = session.lastActivityAt;
  hooks.setRuntime({ activeUrl: "https://example.edu", lastInactiveAt: null });
  hooks.ensureSessionForActivity(clock.now(), undefined);

  session = hooks.getActiveSession();
  const rolloverDay = new Date(clock.now());
  rolloverDay.setHours(0, 0, 0, 0);
  session.startedAt = rolloverDay.getTime() - 24 * 60 * 60 * 1000;
  hooks.ensureSessionForActivity(clock.now(), undefined);

  context.shouldSplitSessionForIntent({ lastActivityAt: 1 }, "https://example.com", 2);
  hooks.setRuntime({
    settings: { ...hooks.DEFAULT_SETTINGS, categoryOverrides: { "neutral.example": "Other" } },
  });
  hooks.resetUrlMetaCache();
  context.shouldSplitSessionForIntent(
    { lastActivityAt: clock.now(), categoryTotals: { Other: 1 } },
    "https://neutral.example",
    clock.now() + hooks.INTENT_GAP_MIN_MS + 1,
  );

  context.getLatestEvent({ events: [{ ts: 1 }, null], eventCursor: undefined, eventCount: 0 });
  context.getLatestEvent({ events: [{ ts: 1 }, { ts: 2 }], eventCursor: 1, eventCount: 2 });

  hooks.setState(hooks.createNewState());
  const analysisSession = hooks.getActiveSession();
  analysisSession.nodes = null;
  hooks.setState({
    ...hooks.getState(),
    sessions: { [analysisSession.id]: analysisSession },
  });
  context.scheduleSessionAnalysis(analysisSession, clock.now());
  if (timerCallback) {
    timerCallback();
  }

  const metaBackup = context.getUrlMeta;
  context.getUrlMeta = () => ({ category: null });
  assert.equal(context.classifyUrl("https://example.com"), "Random");
  context.getUrlMeta = metaBackup;

  context.buildSessionInsightsKey({ nodes: {} }, null);
  context.buildSessionInsightsKey(
    { nodes: {}, categoryTotals: { Study: 1 }, navigationCount: 1 },
    { nodesCount: 2, categoryTotals: { Video: 1 }, totalActiveMs: 60000 },
  );

  hooks.setState(hooks.createNewState());
  hooks.setRuntime({ settings: { ...hooks.DEFAULT_SETTINGS, syncEnabled: false } });
  chrome._storage.sync = {};
  context.handleStorageChanged(
    { [hooks.SETTINGS_KEY]: { newValue: { syncEnabled: true } } },
    "sync",
  );
  assert.ok(chrome._storage.sync[hooks.SYNC_STATE_KEY]);

  hooks.setRuntime({ settings: { ...hooks.DEFAULT_SETTINGS, syncEnabled: true } });
  await hooks.resetState();
  assert.ok(chrome._storage.sync[hooks.SYNC_STATE_KEY]);

  const nodeA = { activeMs: 1, visitCount: 1, category: "" };
  context.computeDistractionScoreCached(nodeA, { navigationCount: 0 }, {});
  nodeA.category = "Study";
  context.computeDistractionScoreCached(nodeA, { navigationCount: 0 }, {});

  hooks.setState({
    schemaVersion: hooks.SCHEMA_VERSION,
    sessions: { s1: { id: "s1", nodes: null } },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tabs: {},
    tracking: {},
  });
  context.invalidateScoreCaches();

  context.ensureSessionMetrics({ nodes: null });

  const metricsSession = hooks.createSession(clock.now());
  metricsSession.nodes = { "https://a.com/": { url: "https://a.com/", activeMs: 10, visitCount: 1 } };
  metricsSession.metrics = {
    version: 1,
    totalActiveMs: 0,
    nodesCount: 0,
    maxNodeActiveMs: 0,
    revisitCount: 0,
    weightedScore: 0,
    categoryTotals: {},
    maxDirty: false,
  };
  hooks.updateSessionInsightsForNode(metricsSession, metricsSession.nodes["https://a.com/"], {
    activeMs: 0,
    score: 0,
    category: "Study",
    visitCount: 1,
  });
  assert.equal(metricsSession.metrics.nodesCount, 1);
  metricsSession.nodes["https://a.com/"].visitCount = 2;
  hooks.updateSessionInsightsForNode(metricsSession, metricsSession.nodes["https://a.com/"], {
    activeMs: 5,
    score: 1,
    category: "Study",
    visitCount: 1,
  });
  metricsSession.nodes["https://a.com/"].visitCount = 1;
  hooks.updateSessionInsightsForNode(metricsSession, metricsSession.nodes["https://a.com/"], {
    activeMs: 5,
    score: 1,
    category: "Study",
    visitCount: 2,
  });
  const looseSession = hooks.createSession(clock.now());
  looseSession.nodes = null;
  looseSession.metrics = {
    version: 1,
    totalActiveMs: 0,
    nodesCount: 1,
    maxNodeActiveMs: 0,
    revisitCount: 0,
    weightedScore: 0,
    categoryTotals: {},
    maxDirty: false,
  };
  context.updateSessionInsightsForNode(
    looseSession,
    {
      url: "https://b.com/",
      activeMs: 0,
      visitCount: 0,
      category: "",
      firstSeen: clock.now(),
      lastSeen: clock.now(),
    },
    {
      activeMs: 0,
      score: 0,
      category: "",
      visitCount: 0,
    },
  );
  const countSession = hooks.createSession(clock.now());
  const countNode = {
    url: "https://c.com/",
    activeMs: 0,
    category: "",
    firstSeen: clock.now(),
    lastSeen: clock.now(),
  };
  countSession.nodes = { [countNode.url]: countNode };
  countSession.metrics = {
    version: 1,
    totalActiveMs: 0,
    nodesCount: 0,
    maxNodeActiveMs: 0,
    revisitCount: 0,
    weightedScore: 0,
    categoryTotals: {},
    maxDirty: false,
  };
  hooks.updateSessionInsightsForNode(countSession, countNode, null);
  const nullCategorySession = hooks.createSession(clock.now());
  const nullCategoryNode = {
    url: "https://d.com/",
    category: null,
    firstSeen: clock.now(),
    lastSeen: clock.now(),
  };
  nullCategorySession.nodes = { [nullCategoryNode.url]: nullCategoryNode };
  nullCategorySession.metrics = {
    version: 1,
    totalActiveMs: 0,
    nodesCount: 0,
    maxNodeActiveMs: 0,
    revisitCount: 0,
    weightedScore: 0,
    categoryTotals: {},
    maxDirty: false,
  };
  hooks.updateSessionInsightsForNode(nullCategorySession, nullCategoryNode, null);
  assert.equal(nullCategorySession.metrics.nodesCount, 1);

  context.computeSessionInsights({ nodes: null, edges: {}, events: [] });

  const ensureMetaBackup = context.getUrlMeta;
  context.getUrlMeta = () => ({ category: "" });
  const classifyBackup = context.classifyUrl;
  context.classifyUrl = () => "Study";
  hooks.ensureNode("https://example.com/");
  context.getUrlMeta = ensureMetaBackup;
  context.classifyUrl = classifyBackup;

  hooks.setState(hooks.createNewState());
  const active = hooks.getActiveSession();
  hooks.recordEvent("navigation", { tabId: 1, toUrl: "https://a.com" }, { session: active });
  hooks.recordEvent("navigation", { tabId: 1 }, { session: active });

  hooks.markUserActive(null, 1, { timestamp: clock.now(), force: true });

  hooks.setRuntime({
    activeTabId: 1,
    activeUrl: "https://example.com/",
    activeTitle: "Example",
    activeSince: clock.now() - 1000,
    windowFocused: true,
    idleState: "active",
  });
  const metaFallback = context.getUrlMeta;
  context.getUrlMeta = () => ({ category: "" });
  const classifyFallback = context.classifyUrl;
  context.classifyUrl = () => null;
  hooks.flushActiveTime("manual");
  context.classifyUrl = classifyFallback;
  context.getUrlMeta = metaFallback;

  hooks.setState(hooks.createNewState());
  chrome.setTabs([{ id: 1, url: "https://example.com/", title: "Example", windowId: 1 }]);
  chrome.setActiveTabId(1);
  hooks.setRuntime({ activeTabId: null, activeUrl: null, windowFocused: true, idleState: "active" });
  const metaBackup2 = context.getUrlMeta;
  context.getUrlMeta = () => ({ category: "" });
  const classifyBackup2 = context.classifyUrl;
  context.classifyUrl = () => "";
  await hooks.refreshActiveTab();
  const classifyBackup3 = context.classifyUrl;
  const metaBackup3 = context.getUrlMeta;
  context.__classifyBackup = classifyBackup3;
  context.__metaBackup = metaBackup3;
  vm.runInContext(
    "classifyUrl = () => null; getUrlMeta = () => ({ category: null });",
    context,
  );
  await hooks.handleTabActivated({ tabId: 1, windowId: 1 });
  vm.runInContext(
    "classifyUrl = globalThis.__classifyBackup; getUrlMeta = globalThis.__metaBackup;",
    context,
  );
  context.__classifyBackup = null;
  context.__metaBackup = null;
  hooks.handleNavigation(
    {
      tabId: 1,
      windowId: 1,
      url: "https://example.com/next",
      transitionType: "link",
      transitionQualifiers: [],
      frameId: 0,
    },
    "committed",
  );
  context.classifyUrl = classifyBackup2;
  context.getUrlMeta = metaBackup2;
});

test("background branch coverage sweep", async () => {
  const clock = createClock(30000);
  const chrome = createChromeMock();
  const { hooks, context } = loadBackground({ chrome, clock });

  const stateBackup = hooks.getState();
  hooks.setState(null);
  context.hydrateRuntimeFromState();
  hooks.setState({});
  context.hydrateRuntimeFromState();

  hooks.setState(hooks.createNewState());
  const session = hooks.getActiveSession();
  context.trimEventsForStorage(
    [
      { type: "user_active" },
      { type: "user_inactive" },
      { type: "navigation" },
    ],
    2,
  );
  context.getSessionActiveMs({ metrics: { totalActiveMs: 123 }, nodes: {} });
  context.scoreNodeForTrim(null, session, {});

  const baseSession = {
    id: "base",
    startedAt: clock.now(),
    updatedAt: clock.now(),
    endedAt: null,
    endReason: null,
    firstActivityAt: null,
    lastActivityAt: null,
    navigationCount: 0,
    trapDoors: [],
    categoryTotals: {},
    distractionAverage: 0,
    summaryBrief: "",
    summaryDetailed: "",
    summaryUpdatedAt: 0,
  };
  context.pickSessionBase(baseSession);
  context.pickSessionBase({
    ...baseSession,
    archived: true,
    deleted: true,
    favorite: true,
  });

  const trimSession = {
    ...baseSession,
    nodes: {
      "https://a.com/": {
        url: "https://a.com/",
        activeMs: 10,
        visitCount: 1,
        firstNavigationIndex: 0,
        firstSeen: clock.now(),
      },
    },
    edges: {
      "https://a.com/ -> https://missing.com/": {
        id: "https://a.com/ -> https://missing.com/",
        from: "https://a.com/",
        to: "https://missing.com/",
        visitCount: 1,
        activeMs: 1,
        firstSeen: clock.now(),
        lastSeen: clock.now(),
      },
    },
    events: [],
    trapDoors: [],
  };
  context.trimSessionDetails(trimSession, false);
  context.trimSessionDetails(trimSession, true);

  const trivialSession = {
    id: "t",
    startedAt: clock.now(),
    updatedAt: clock.now(),
    navigationCount: 0,
    nodes: {},
    edges: {},
    events: [],
    trapDoors: [],
    categoryTotals: {},
    distractionAverage: 0,
  };
  const keepSession = {
    id: "k",
    startedAt: clock.now(),
    updatedAt: clock.now(),
    navigationCount: 10,
    nodes: {
      "https://a.com/": {
        url: "https://a.com/",
        activeMs: 10 * 60 * 1000,
        visitCount: 1,
        firstNavigationIndex: 0,
        firstSeen: clock.now(),
      },
    },
    edges: {},
    events: [],
    trapDoors: [],
    categoryTotals: {},
    distractionAverage: 0,
  };
  context.trimStateForStorage({
    schemaVersion: hooks.SCHEMA_VERSION,
    sessions: { t: trivialSession, k: keepSession },
    sessionOrder: ["t", "k"],
    activeSessionId: "k",
    tabs: {},
    tracking: {},
  });

  context.compactStateForStorage({
    sessions: {
      s1: {
        id: "s1",
        nodes: {
          a: { url: "https://a.com/" },
          b: { url: "https://a.com/" },
          c: { url: "" },
        },
        edges: {
          "a->b": { from: "https://a.com/", to: "https://a.com/", visitCount: 1 },
        },
        trapDoors: [{ url: "https://a.com/" }, {}],
      },
    },
  });

  context.decodeStoredState({
    schemaVersion: hooks.SCHEMA_VERSION,
    compactTables: true,
    urlTable: ["https://a.com/"],
    sessions: {
      s1: {
        id: "s1",
        nodes: [
          { urlId: 0, title: "", category: "", visitCount: 0 },
          { urlId: 3, url: "" },
        ],
        edges: [
          { fromId: 0, toId: 1, to: "https://b.com/" },
          { fromId: 0, toId: 3 },
        ],
        trapDoors: [{ urlId: 0 }, { url: "https://c.com/" }],
        events: [],
      },
    },
    sessionOrder: ["s1"],
    activeSessionId: "s1",
    tabs: {},
    tracking: {},
  });

  context.migrateState({
    session: {
      id: "old",
      nodes: { "https://a.com/": { url: "https://a.com/" } },
      edges: {},
    },
    tabs: {},
    tracking: {},
  });

  hooks.setState({
    schemaVersion: hooks.SCHEMA_VERSION,
    sessions: {
      s1: { id: "s1", startedAt: clock.now(), updatedAt: clock.now(), endedAt: null, deleted: false },
    },
    sessionOrder: ["s1"],
    activeSessionId: null,
    tabs: {},
    tracking: {},
  });
  context.getActiveSession(clock.now());
  context.startNewSession(clock.now(), "manual");
  context.ensureSessionForActivity(clock.now(), "tick");

  assert.equal(context.shouldSplitSessionForIntent(null, null, clock.now()), false);
  const intentSession = {
    id: "intent",
    startedAt: clock.now() - hooks.INTENT_GAP_MIN_MS - 1,
    updatedAt: clock.now() - hooks.INTENT_GAP_MIN_MS - 1,
    lastActivityAt: clock.now() - hooks.INTENT_GAP_MIN_MS - 1,
    categoryTotals: { Study: 1000 },
  };
  assert.equal(
    context.shouldSplitSessionForIntent(
      intentSession,
      "https://youtube.com/watch?v=1",
      clock.now(),
    ),
    true,
  );

  const trapSession = {
    startedAt: clock.now(),
    navigationCount: 1,
    nodes: { "https://a.com/": { url: "https://a.com/", firstSeen: null } },
  };
  context.evaluateTrapDoors(trapSession, clock.now());

  hooks.setRuntime({
    settings: { ...hooks.DEFAULT_SETTINGS, userIdleMinutes: 5, categoryOverrides: { "example.com": "Study", "": "News" } },
  });
  context.getUserIdleTimeoutMs();
  context.getUrlMeta("https://example.com/");
  context.getCategoryOverride("example.com");

  const sharedBackup = context.IRHTShared;
  context.IRHTShared = null;
  context.computeSessionSignals({});
  context.computeDistractionScore({}, {});
  context.IRHTShared = sharedBackup;
  context.computeDistractionScore({}, {}, null, { isLateNight: () => true });
  context.computeDistractionScoreCached({ activeMs: 0, visitCount: 0, category: "" }, { navigationCount: 0 }, {});

  const metaBackup = context.getUrlMeta;
  context.getUrlMeta = () => ({ normalized: null, domain: null, category: "" });
  const classifyBackup = context.classifyUrl;
  context.classifyUrl = () => "Study";
  context.ensureNode("https://example.com/", "Example", hooks.getActiveSession());
  context.getUrlMeta = metaBackup;
  context.classifyUrl = classifyBackup;

  hooks.setRuntime({ settings: { trackingPaused: true } });
  context.isTrackingPaused();
  hooks.setRuntime({ settings: { trackingPaused: false } });

  hooks.setRuntime({
    activeSince: clock.now() - 1000,
    activeUrl: "https://example.com/",
    activeEdgeKey: "edge",
    activeTitle: "Example",
  });
  const active = hooks.getActiveSession();
  active.edges = { edge: { activeMs: 0, lastSeen: clock.now() } };
  context.flushActiveTime("tick");

  chrome.runtime.lastError = { message: "fail" };
  await context.safeGetLastFocusedWindow();
  chrome.runtime.lastError = null;

  context.handleAlarm({ name: "other" });

  const getActiveBackup = context.getActiveSession;
  context.getActiveSession = () => null;
  context.recordEvent("navigation", {}, {});
  context.getActiveSession = getActiveBackup;

  hooks.setState(stateBackup);
});

test("background realtime broadcast sends delta updates", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  const state = hooks.createNewState();
  const session = {
    id: "s1",
    startedAt: clock.now(),
    updatedAt: clock.now(),
    nodes: {
      "https://example.com/": {
        id: "https://example.com/",
        url: "https://example.com/",
        activeMs: 100,
      },
    },
    edges: {
      "https://example.com/ -> https://example.com/next": {
        id: "https://example.com/ -> https://example.com/next",
        from: "https://example.com/",
        to: "https://example.com/next",
        activeMs: 50,
      },
    },
    events: [
      {
        ts: clock.now(),
        type: "active_time_flushed",
        url: "https://example.com/",
        durationMs: 100,
      },
    ],
    eventCursor: 1,
    eventCount: 1,
  };
  state.sessions = { s1: session };
  state.sessionOrder = ["s1"];
  state.activeSessionId = "s1";
  state.tracking = {
    activeTabId: 1,
    activeUrl: "https://example.com/",
    activeEdgeKey: "https://example.com/ -> https://example.com/next",
    activeSince: clock.now(),
  };
  hooks.setState(state);
  hooks.setRuntime({
    settings: {
      ...hooks.DEFAULT_SETTINGS,
      realtimeStreamEnabled: true,
      realtimePortPush: true,
      realtimeDeltaSync: true,
      realtimeBatchUpdates: false,
    },
  });
  const messages = [];
  const port = {
    name: "irht_live",
    onDisconnect: { addListener: (fn) => { port._onDisconnect = fn; } },
    onMessage: { addListener: (fn) => { port._onMessage = fn; } },
    postMessage: (msg) => messages.push(msg),
    disconnect: () => {
      if (port._onDisconnect) {
        port._onDisconnect();
      }
    },
  };
  hooks.handlePortConnect(port);
  session.events.push({
    ts: clock.now() + 1,
    type: "active_time_flushed",
    url: "https://example.com/",
    durationMs: 50,
  });
  session.eventCursor = 2;
  session.eventCount = 2;
  hooks.broadcastRealtime("tick");
  const delta = messages.find((msg) => msg.type === "state_delta");
  assert.ok(delta);
  assert.equal(delta.sessionId, "s1");
  assert.ok(delta.nodePatch);
  assert.ok(delta.edgePatch);
  assert.ok(delta.eventPatch);
});

test("background port lifecycle and idle alarm branches", async () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  const state = seedState(hooks, clock);
  state.sessions = {
    s1: { id: "s1", startedAt: 1, updatedAt: 2, nodes: {}, edges: {} },
  };
  state.sessionOrder = ["s1"];
  state.activeSessionId = "s1";
  state.tracking = { activeSince: clock.now() };
  hooks.setState(state);
  hooks.setRuntime({
    settings: {
      ...hooks.DEFAULT_SETTINGS,
      realtimeStreamEnabled: true,
      realtimePortPush: true,
      realtimeBatchUpdates: true,
      realtimeBatchWindowMs: 300,
      realtimeDeltaSync: true,
    },
  });

  const port = {
    name: "irht_live",
    postMessage: () => {},
    onDisconnect: { addListener: (fn) => { port._onDisconnect = fn; } },
    onMessage: { addListener: (fn) => { port._onMessage = fn; } },
  };
  hooks.handlePortConnect(port);
  hooks.livePorts.add(port);
  hooks.livePortMeta.set(port, {});
  port._onMessage({ type: "request_snapshot" });
  hooks.scheduleRealtimeBroadcast("batch");
  clock.advance(1000);
  hooks.scheduleRealtimeBroadcast("max_wait");
  port._onDisconnect();

  hooks.setRuntime({
    activeSince: clock.now(),
    activeUrl: "https://example.com/",
    activeTabId: 1,
    windowFocused: true,
    idleState: "active",
  });
  hooks.handleAlarm({ name: hooks.ACTIVE_FLUSH_ALARM_NAME });

  chrome._storage.local[hooks.DAILY_SESSION_RESET_KEY] = clock.now();
  const resetResult = await hooks.applyDailySessionResetIfNeeded();
  assert.equal(resetResult, false);

  const deletedState = hooks.createNewState();
  deletedState.sessions = {
    bad: { id: "bad", deleted: true, endedAt: 1 },
    good: { id: "good", deleted: false, endedAt: null, startedAt: 1 },
  };
  deletedState.sessionOrder = ["bad", "good"];
  deletedState.activeSessionId = "bad";
  hooks.setState(deletedState);
  hooks.getActiveSession(clock.now());
  assert.equal(hooks.getState().activeSessionId, "good");
});

test("background intent split edge branches", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  const baseSession = {
    lastActivityAt: clock.now() - hooks.INTENT_GAP_MIN_MS - 1,
    updatedAt: clock.now(),
    startedAt: clock.now(),
    categoryTotals: { Study: 100 },
  };
  assert.equal(hooks.shouldSplitSessionForIntent(null, "https://a.com", clock.now()), false);
  assert.equal(hooks.shouldSplitSessionForIntent(baseSession, "", clock.now()), false);
  assert.equal(hooks.shouldSplitSessionForIntent({ ...baseSession, lastActivityAt: null }, "https://a.com", clock.now()), false);
  assert.equal(hooks.shouldSplitSessionForIntent(baseSession, "https://a.com", baseSession.lastActivityAt + 1), false);

  const noCategory = { ...baseSession, categoryTotals: {} };
  assert.equal(hooks.shouldSplitSessionForIntent(noCategory, "https://a.com", clock.now()), false);

  const sameCategory = { ...baseSession, categoryTotals: { Study: 100 } };
  assert.equal(hooks.shouldSplitSessionForIntent(sameCategory, "https://developer.mozilla.org", clock.now()), false);
});

test("background startNewSession defaults to now when startedAt missing", () => {
  const clock = createClock(2000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  hooks.setState(hooks.createNewState());

  const session = hooks.startNewSession(undefined, "manual");
  assert.equal(session.startedAt, clock.now());
});

test("background intent split handles missing totals and neutral current category", () => {
  const clock = createClock(3000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  hooks.setRuntime({
    settings: {
      ...hooks.DEFAULT_SETTINGS,
      categoryOverrides: { "neutral.com": "Other" },
    },
  });
  const baseSession = {
    lastActivityAt: clock.now() - hooks.INTENT_GAP_MIN_MS - 1,
    updatedAt: clock.now() - hooks.INTENT_GAP_MIN_MS - 1,
    startedAt: clock.now() - hooks.INTENT_GAP_MIN_MS - 1,
    categoryTotals: { Study: 100 },
  };
  const noTotals = { ...baseSession };
  delete noTotals.categoryTotals;
  assert.equal(
    hooks.shouldSplitSessionForIntent(noTotals, "https://neutral.com", clock.now()),
    false,
  );
  assert.equal(
    hooks.shouldSplitSessionForIntent(baseSession, "https://neutral.com", clock.now()),
    false,
  );
});

test("background port connect validation and request_full", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  const state = hooks.createNewState();
  state.sessions = { s1: { id: "s1", startedAt: 1, updatedAt: 2, nodes: {}, edges: {} } };
  state.sessionOrder = ["s1"];
  state.activeSessionId = "s1";
  hooks.setState(state);

  hooks.handlePortConnect(null);
  hooks.handlePortConnect({ name: "other" });

  const messages = [];
  const port = {
    name: "irht_live",
    postMessage: (msg) => messages.push(msg),
    onDisconnect: { addListener: (fn) => { port._onDisconnect = fn; } },
    onMessage: { addListener: (fn) => { port._onMessage = fn; } },
  };
  hooks.handlePortConnect(port);
  port._onMessage(null);
  port._onMessage("not-object");
  port._onMessage({ type: "request_full" });
  assert.ok(messages.find((msg) => msg.type === "state_snapshot"));
});

test("background realtime broadcast immediate and meta missing branches", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  const state = hooks.createNewState();
  state.sessions = { s1: { id: "s1", startedAt: 1, updatedAt: 2, nodes: {}, edges: {} } };
  state.sessionOrder = ["s1"];
  state.activeSessionId = "s1";
  hooks.setState(state);
  hooks.setRuntime({
    settings: {
      ...hooks.DEFAULT_SETTINGS,
      realtimeStreamEnabled: true,
      realtimePortPush: true,
      realtimeDeltaSync: false,
      realtimeBatchUpdates: false,
    },
  });
  const port = {
    name: "irht_live",
    postMessage: () => {},
    onDisconnect: { addListener: (fn) => { port._onDisconnect = fn; } },
    onMessage: { addListener: (fn) => { port._onMessage = fn; } },
  };
  hooks.handlePortConnect(port);
  hooks.livePortMeta.delete(port);
  hooks.broadcastRealtime("immediate");
});

test("background buildSessionOrderKey and latest event branches", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });

  assert.equal(hooks.buildSessionOrderKey(null), "");
  assert.equal(hooks.buildSessionOrderKey([]), "0");
  assert.equal(hooks.buildSessionOrderKey(["a", "b"]), "2:a:b");

  const session = { events: [{ id: 1 }, { id: 2 }] };
  assert.equal(hooks.getLatestSessionEvent(session).id, 2);
  session.eventCursor = 1;
  assert.equal(hooks.getLatestSessionEvent(session).id, 1);
});

test("background applyIntentDrift and idle checks", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  hooks.applyIntentDrift(null, null);

  hooks.setRuntime({
    idleState: "idle",
    activeSince: null,
    lastInteractionAt: clock.now() - 100000,
    windowFocused: true,
  });
  assert.equal(hooks.isUserIdle(), true);

  hooks.setRuntime({
    idleState: "active",
    activeSince: clock.now(),
    windowFocused: true,
  });
  assert.equal(hooks.isUserIdle(), false);

  hooks.setRuntime({
    idleState: "active",
    activeSince: null,
    lastInteractionAt: null,
  });
  assert.equal(hooks.isUserIdle(), false);
});

test("background evaluateUserIdle triggers session split", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  const state = seedState(hooks, clock);
  const session = hooks.getActiveSession(clock.now());
  hooks.setRuntime({
    userIdle: true,
    lastInactiveAt: clock.now() - hooks.getSessionIdleThresholdMs() - 1,
    sessionIdleEndedAt: null,
  });
  hooks.evaluateUserIdle("timer");
  assert.ok(state.sessionOrder.length >= 1);
});

test("background evaluateUserIdle ignores repeated idle window", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  const state = seedState(hooks, clock);
  const beforeCount = state.sessionOrder.length;
  hooks.setRuntime({
    userIdle: true,
    idleState: "idle",
    lastInactiveAt: clock.now() - hooks.getSessionIdleThresholdMs() - 1,
    sessionIdleEndedAt: clock.now(),
  });
  hooks.evaluateUserIdle("timer");
  assert.equal(state.sessionOrder.length, beforeCount);
});

test("background refreshWindowFocus without chrome windows", async () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  delete chrome.windows.getLastFocused;
  const { hooks } = loadBackground({ chrome, clock });
  await hooks.refreshWindowFocus();
  assert.equal(hooks.runtime.windowFocused, true);
});

test("background markUserActive records tabId fallbacks", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  seedState(hooks, clock);
  hooks.setRuntime({ userIdle: true, activeTabId: 7 });
  const session = hooks.getActiveSession(clock.now());
  hooks.markUserActive("input");
  const fallbackEvent = session.events[session.events.length - 1];
  assert.equal(fallbackEvent.tabId, 7);

  hooks.setRuntime({ userIdle: true });
  hooks.markUserActive("input", 9, { timestamp: clock.now() + 1 });
  const explicitEvent = session.events[session.events.length - 1];
  assert.equal(explicitEvent.tabId, 9);
});

test("background handleTabActivated uses category fallback snapshot", async () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  chrome.setTabs([
    { id: 1, url: "https://example.com/", title: "Example", windowId: 1 },
  ]);
  const { hooks, context } = loadBackground({ chrome, clock });
  seedState(hooks, clock);
  hooks.setRuntime({ activeTabId: 2, activeUrl: "https://other.com/" });
  context.ensureNode = (url, title, session) => {
    session.nodes = session.nodes || {};
    const node = {
      id: url,
      url,
      title,
      category: "",
      activeMs: 0,
      distractionScore: 0,
      visitCount: 0,
    };
    session.nodes[url] = node;
    return node;
  };
  await hooks.handleTabActivated({ tabId: 1, windowId: 1 });
  const session = hooks.getActiveSession(clock.now());
  assert.ok(session.events.length > 0);
});

test("background toggle favorite clears timestamp", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  const state = hooks.createNewState();
  const session = {
    id: "s1",
    startedAt: clock.now(),
    updatedAt: clock.now(),
    nodes: {},
    edges: {},
    events: [],
  };
  state.sessions = { s1: session };
  state.sessionOrder = ["s1"];
  state.activeSessionId = "s1";
  hooks.setState(state);

  hooks.toggleSessionFavorite("s1");
  assert.ok(session.favoriteAt);
  clock.advance(1000);
  hooks.toggleSessionFavorite("s1");
  assert.equal(session.favoriteAt, null);
});

test("background applyIntentDrift handles non-array drivers", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks, context } = loadBackground({ chrome, clock });
  const session = { id: "s1", nodes: {}, edges: {} };
  context.computeIntentDrift = () => ({
    score: 1,
    label: "Low",
    reason: "Test",
    confidence: "low",
    drivers: null,
  });
  hooks.applyIntentDrift(session, {});
  assert.equal(session.intentDriftDrivers.length, 0);

  context.computeIntentDrift = () => ({
    score: Number.NaN,
    label: "",
    reason: "",
    confidence: "",
    drivers: [],
  });
  hooks.applyIntentDrift(session, {});
  assert.equal(session.intentDriftScore, 0);
  assert.equal(session.intentDriftLabel, "Unknown");
  assert.equal(session.intentDriftReason, "Not enough data yet.");
  assert.equal(session.intentDriftConfidence, "low");
});

test("background buildSessionInsightsKey handles missing nodes", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { context } = loadBackground({ chrome, clock });
  const key = context.buildSessionInsightsKey({}, null);
  assert.equal(typeof key, "string");
});

test("background updateSessionInsightsForNode fills nodesCount", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  const session = {
    nodes: {
      "https://example.com/": {
        url: "https://example.com/",
        activeMs: 10,
        visitCount: 1,
        category: "Study",
        firstSeen: clock.now(),
      },
    },
    edges: {},
    metrics: {
      version: 1,
      totalActiveMs: 0,
      nodesCount: 0,
      maxNodeActiveMs: 0,
      revisitCount: 0,
      weightedScore: 0,
      categoryTotals: {},
      maxDirty: false,
    },
  };
  const node = session.nodes["https://example.com/"];
  hooks.updateSessionInsightsForNode(session, node, null);
  assert.equal(session.metrics.nodesCount, 1);

  const sessionNoNodes = {
    nodes: undefined,
    edges: {},
    metrics: {
      version: 1,
      totalActiveMs: 0,
      nodesCount: 0,
      maxNodeActiveMs: 0,
      revisitCount: 0,
      weightedScore: 0,
      categoryTotals: {},
      maxDirty: false,
    },
  };
  hooks.updateSessionInsightsForNode(sessionNoNodes, node, null);
  assert.equal(sessionNoNodes.metrics.nodesCount, 0);
});

test("background buildEdgePatch fills missing values", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  const full = hooks.buildEdgePatch({
    id: "edge-1",
    from: "a",
    to: "b",
    visitCount: 2,
    activeMs: 5,
    firstSeen: 10,
    lastSeen: 20,
  });
  assert.equal(full.activeMs, 5);
  const fallback = hooks.buildEdgePatch({ id: "edge-2", from: "a", to: "b" });
  assert.equal(fallback.activeMs, 0);
  assert.equal(fallback.firstSeen, 0);
});

test("background sanitizeSettings falls back invalid sensitivity", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { context } = loadBackground({ chrome, clock });
  const next = context.sanitizeSettings({ intentDriftSensitivity: "invalid" });
  assert.equal(next.intentDriftSensitivity, "balanced");
});

test("background normalizeDomainPattern handles path input", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { context } = loadBackground({ chrome, clock });
  const normalized = context.normalizeDomainPattern("example.com/path");
  assert.equal(normalized, "example.com");
});

test("background buildSessionFingerprint handles archived and drivers", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { context } = loadBackground({ chrome, clock });
  const fingerprint = context.buildSessionFingerprint({
    updatedAt: 1,
    summaryUpdatedAt: 2,
    favorite: true,
    deleted: false,
    archived: true,
    navigationCount: 3,
    eventCursor: 4,
    intentDriftLabel: "Low",
    intentDriftScore: 5,
    intentDriftDrivers: ["a", "b"],
  });
  assert.ok(fingerprint.includes("|1|"));
});

test("background buildSessionPatch handles intent drift drivers", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  const patch = hooks.buildSessionPatch({
    id: "s1",
    nodes: {},
    edges: {},
    events: [],
    intentDriftDrivers: ["a", "b", "c", "d"],
  });
  assert.equal(patch.intentDriftDrivers.length, 3);
});

test("background buildSessionFingerprint fills defaults", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { context } = loadBackground({ chrome, clock });
  const fingerprint = context.buildSessionFingerprint({
    deleted: true,
    archived: false,
  });
  assert.ok(fingerprint.includes("|1|"));
});

test("background buildNodePatch fills missing activeMs", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  const full = hooks.buildNodePatch({
    id: "node-1",
    url: "https://example.com/",
    title: "Example",
    category: "Study",
    visitCount: 2,
    activeMs: 10,
    firstSeen: 1,
    lastSeen: 2,
    distractionScore: 0,
  });
  assert.equal(full.activeMs, 10);
  const fallback = hooks.buildNodePatch({
    id: "node-2",
    url: "https://example.com/",
  });
  assert.equal(fallback.activeMs, 0);
});

test("background buildStateDelta handles missing sessions", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  const state = hooks.createNewState();
  delete state.sessions;
  delete state.sessionOrder;
  state.activeSessionId = null;
  state.tracking = null;
  hooks.setState(state);
  const delta = hooks.buildStateDelta({ lastSessionOrderKey: "prev" });
  assert.ok(Array.isArray(delta.sessionOrder));
});

test("background primeStateForDashboard handles missing collections", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  const state = hooks.createNewState();
  delete state.sessions;
  delete state.sessionOrder;
  state.tracking = null;
  hooks.setState(state);
  hooks.primeStateForDashboard();
  assert.equal(hooks.getState().sessionOrder, undefined);
});

test("background sendPortStateSnapshot handles empty session state", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  const port = {
    name: "irht_live",
    postMessage: () => {},
    onDisconnect: { addListener: () => {} },
    onMessage: { addListener: () => {} },
  };
  hooks.livePortMeta.set(port, {});
  const state = hooks.createNewState();
  delete state.sessions;
  delete state.sessionOrder;
  state.activeSessionId = null;
  state.tracking = null;
  hooks.setState(state);
  hooks.sendPortStateSnapshot(port, "snapshot");
  assert.ok(hooks.livePortMeta.has(port));
});

test("background sendPortStateSnapshot updates meta for active session", () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  const port = {
    name: "irht_live",
    postMessage: () => {},
    onDisconnect: { addListener: () => {} },
    onMessage: { addListener: () => {} },
  };
  hooks.livePortMeta.set(port, {});
  const state = hooks.createNewState();
  const session = { id: "s1", updatedAt: clock.now(), eventCursor: 2, nodes: {}, edges: {}, events: [] };
  state.sessions = { s1: session };
  state.sessionOrder = ["s1"];
  state.activeSessionId = "s1";
  state.tracking = { activeSince: clock.now() - 5 };
  hooks.setState(state);
  hooks.sendPortStateSnapshot(port, "snapshot");
  assert.equal(hooks.livePortMeta.get(port).lastSessionId, "s1");
});

test("background realtime broadcast max wait and batch fallbacks", async () => {
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks, context } = loadBackground({ chrome, clock });
  const state = hooks.createNewState();
  state.sessions = { s1: { id: "s1", updatedAt: clock.now(), nodes: {}, edges: {}, events: [] } };
  state.sessionOrder = ["s1"];
  state.activeSessionId = "s1";
  hooks.setState(state);
  const port = {
    name: "irht_live",
    postMessage: () => {},
    onDisconnect: { addListener: () => {} },
    onMessage: { addListener: () => {} },
  };
  hooks.livePorts.add(port);
  hooks.livePortMeta.set(port, {});
  hooks.setRuntime({
    settings: {
      ...hooks.DEFAULT_SETTINGS,
      realtimeStreamEnabled: true,
      realtimePortPush: true,
      realtimeBatchUpdates: true,
      realtimeBatchWindowMs: 30,
      realtimeDeltaSync: false,
    },
  });

  vm.runInContext(`realtimeBroadcastPendingSince = ${clock.now() - 100}`, context);
  hooks.scheduleRealtimeBroadcast("custom");
  vm.runInContext(`realtimeBroadcastPendingSince = ${clock.now() - 100}`, context);
  hooks.scheduleRealtimeBroadcast();

  vm.runInContext("realtimeBroadcastPendingSince = null", context);
  hooks.scheduleRealtimeBroadcast();
  await new Promise((resolve) => setTimeout(resolve, 60));

  hooks.setRuntime({
    settings: {
      ...hooks.DEFAULT_SETTINGS,
      realtimeStreamEnabled: true,
      realtimePortPush: true,
      realtimeBatchUpdates: false,
      realtimeDeltaSync: false,
    },
  });
  hooks.scheduleRealtimeBroadcast("snapshot");
  hooks.scheduleRealtimeBroadcast();
});

test("background realtime max_wait reason fallback", () => {
  const clock = createClock(2000);
  const chrome = createChromeMock();
  const { hooks, context } = loadBackground({ chrome, clock });
  const state = hooks.createNewState();
  state.sessions = {
    s1: { id: "s1", updatedAt: clock.now(), nodes: {}, edges: {}, events: [] },
  };
  state.sessionOrder = ["s1"];
  state.activeSessionId = "s1";
  hooks.setState(state);

  const port = {
    name: "irht_live",
    postMessage: () => {},
    onDisconnect: { addListener: () => {} },
    onMessage: { addListener: () => {} },
  };
  hooks.livePorts.add(port);
  hooks.livePortMeta.set(port, {});

  hooks.setRuntime({
    settings: {
      ...hooks.DEFAULT_SETTINGS,
      realtimeStreamEnabled: true,
      realtimePortPush: true,
      realtimeBatchUpdates: true,
      realtimeBatchWindowMs: 250,
    },
  });

  context.__broadcastReason = null;
  vm.runInContext("broadcastRealtime = (reason) => { __broadcastReason = reason; }", context);
  vm.runInContext(`realtimeBroadcastPendingSince = ${clock.now() - 300}`, context);
  hooks.scheduleRealtimeBroadcast();
  assert.equal(context.__broadcastReason, "max_wait");
});

test("background broadcastRealtime snapshot fallback", () => {
  const clock = createClock(1500);
  const chrome = createChromeMock();
  const { hooks, context } = loadBackground({ chrome, clock });
  const state = hooks.createNewState();
  state.sessions = {
    s1: { id: "s1", updatedAt: clock.now(), nodes: {}, edges: {}, events: [] },
  };
  state.sessionOrder = ["s1"];
  state.activeSessionId = "s1";
  hooks.setState(state);

  const port = {
    name: "irht_live",
    postMessage: () => {},
    onDisconnect: { addListener: () => {} },
    onMessage: { addListener: () => {} },
  };
  hooks.livePorts.add(port);
  hooks.livePortMeta.set(port, {});

  hooks.setRuntime({
    settings: {
      ...hooks.DEFAULT_SETTINGS,
      realtimeStreamEnabled: true,
      realtimePortPush: true,
      realtimeBatchUpdates: false,
      realtimeDeltaSync: false,
    },
  });

  context.__snapshotReason = null;
  vm.runInContext("sendPortStateSnapshot = (port, reason) => { __snapshotReason = reason; }", context);
  hooks.broadcastRealtime();
  assert.equal(context.__snapshotReason, "snapshot");
});

test("background realtime scheduling and delta branch coverage", async () => {
  const clock = createClock(5000);
  const chrome = createChromeMock();
  const { hooks, context } = loadBackground({ chrome, clock });

  const state = hooks.createNewState();
  state.sessions = {
    s1: { id: "s1", startedAt: clock.now(), updatedAt: clock.now(), nodes: {}, edges: {} },
  };
  state.sessionOrder = ["s1"];
  state.activeSessionId = "s1";
  hooks.setState(state);

  const port = {
    name: "irht_live",
    postMessage: () => {},
    onDisconnect: { addListener: (fn) => { port._onDisconnect = fn; } },
    onMessage: { addListener: (fn) => { port._onMessage = fn; } },
  };
  hooks.handlePortConnect(port);
  hooks.livePorts.add(port);
  hooks.livePortMeta.set(port, {});

  hooks.setRuntime({
    settings: {
      ...hooks.DEFAULT_SETTINGS,
      realtimeStreamEnabled: true,
      realtimePortPush: true,
      realtimeBatchUpdates: false,
    },
  });
  assert.equal(hooks.livePorts.size > 0, true);
  assert.equal(hooks.shouldBroadcastRealtime(), true);
  const broadcastBackup = context.broadcastRealtime;
  context.__broadcastCalls = 0;
  vm.runInContext("broadcastRealtime = () => { __broadcastCalls += 1; }", context);
  hooks.scheduleRealtimeBroadcast("immediate");
  assert.equal(context.__broadcastCalls, 1);

  hooks.setRuntime({
    settings: {
      ...hooks.DEFAULT_SETTINGS,
      realtimeStreamEnabled: true,
      realtimePortPush: true,
      realtimeBatchUpdates: true,
      realtimeBatchWindowMs: 260,
    },
  });
  assert.equal(hooks.shouldBroadcastRealtime(), true);
  context.__broadcastCalls = 0;
  vm.runInContext("broadcastRealtime = () => { __broadcastCalls += 1; }", context);
  hooks.scheduleRealtimeBroadcast("batch");
  await new Promise((resolve) => setTimeout(resolve, 320));
  assert.equal(context.__broadcastCalls, 1);

  context.broadcastRealtime = broadcastBackup;

  hooks.sendPortStateSnapshot(null, "noop");

  const badState = hooks.createNewState();
  badState.sessions = { bad: { updatedAt: 1 } };
  hooks.setState(badState);
  hooks.sendPortStateSnapshot(port, "snapshot");

  const errorPort = { postMessage: () => { throw new Error("boom"); } };
  hooks.livePorts.add(errorPort);
  hooks.livePortMeta.set(errorPort, {});
  context.safePortPost(errorPort, { type: "state_snapshot" });
  assert.equal(hooks.livePorts.has(errorPort), false);
  assert.equal(hooks.livePortMeta.has(errorPort), false);

  hooks.setState(null);
  assert.equal(hooks.buildStateDelta({}), null);

  hooks.setState(state);
  const meta = {
    lastSessionId: null,
    lastSessionUpdatedAt: null,
    lastEventCursor: null,
    lastTrackingActiveSince: null,
    lastSessionFingerprints: {},
    lastSessionOrderKey: "old",
  };
  const delta = hooks.buildStateDelta(meta);
  assert.ok(delta.sessionOrder);
});

test("background handleAlarm null and intent drift fallbacks", () => {
  const clock = createClock(6000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });

  hooks.handleAlarm(null);

  hooks.handlePortConnect({ name: "wrong" });
  const port = {
    name: "irht_live",
    postMessage: () => {},
    onDisconnect: { addListener: (fn) => { port._onDisconnect = fn; } },
    onMessage: { addListener: (fn) => { port._onMessage = fn; } },
  };
  hooks.handlePortConnect(port);
  port._onMessage(null);

  const noLastActivity = {
    lastActivityAt: null,
    updatedAt: null,
    startedAt: null,
    categoryTotals: { Study: 100 },
  };
  assert.equal(
    hooks.shouldSplitSessionForIntent(noLastActivity, "https://example.com", clock.now()),
    false,
  );

  const neutralCategory = {
    lastActivityAt: clock.now() - hooks.INTENT_GAP_MIN_MS - 1,
    updatedAt: clock.now() - hooks.INTENT_GAP_MIN_MS - 1,
    startedAt: clock.now() - hooks.INTENT_GAP_MIN_MS - 1,
    categoryTotals: { Other: 100 },
  };
  assert.equal(
    hooks.shouldSplitSessionForIntent(neutralCategory, "https://example.com", clock.now()),
    false,
  );

  const productiveSession = {
    lastActivityAt: clock.now() - hooks.INTENT_GAP_MIN_MS - 1,
    updatedAt: clock.now() - hooks.INTENT_GAP_MIN_MS - 1,
    startedAt: clock.now() - hooks.INTENT_GAP_MIN_MS - 1,
    categoryTotals: { Video: 100 },
  };
  assert.equal(
    hooks.shouldSplitSessionForIntent(productiveSession, "https://news.ycombinator.com", clock.now()),
    true,
  );

  hooks.applyIntentDrift(null, null);

  hooks.setRuntime({
    idleState: "idle",
    activeSince: null,
    lastInteractionAt: clock.now() - 100000,
    windowFocused: true,
  });
  assert.equal(hooks.isUserIdle(), true);
});

test("background idle session split branches", () => {
  const clock = createClock(7000);
  const chrome = createChromeMock();
  const { hooks } = loadBackground({ chrome, clock });
  const state = seedState(hooks, clock);
  const session = hooks.getActiveSession();
  hooks.setRuntime({
    userIdle: true,
    lastInactiveAt: clock.now() - hooks.getSessionIdleThresholdMs() - 1,
    sessionIdleEndedAt: null,
    lastInteractionAt: clock.now() - 1000,
  });
  hooks.evaluateUserIdle("timer");
  assert.ok(state.sessionOrder.length >= 1);

  const noCursorSession = { events: [{ id: 1 }, { id: 2 }] };
  assert.equal(hooks.getLatestSessionEvent(noCursorSession).id, 2);

  assert.equal(hooks.buildSessionOrderKey(null), "");
  assert.equal(hooks.buildSessionOrderKey([]), "0");
});

test("background coverage for remaining guard branches", async () => {
  const clock = createClock(9000);
  const chrome = createChromeMock();
  const { hooks, context } = loadBackground({ chrome, clock });

  hooks.handlePortConnect({ name: "bad" });

  const port = {
    name: "irht_live",
    postMessage: () => {},
    onDisconnect: { addListener: (fn) => { port._onDisconnect = fn; } },
    onMessage: { addListener: (fn) => { port._onMessage = fn; } },
  };
  hooks.handlePortConnect(port);
  port._onMessage(null);

  const noLastActivity = { lastActivityAt: null, updatedAt: null, startedAt: null };
  assert.equal(
    hooks.shouldSplitSessionForIntent(noLastActivity, "https://news.ycombinator.com", clock.now()),
    false,
  );
  const neutralSession = {
    lastActivityAt: clock.now() - hooks.INTENT_GAP_MIN_MS - 1,
    updatedAt: clock.now() - hooks.INTENT_GAP_MIN_MS - 1,
    startedAt: clock.now() - hooks.INTENT_GAP_MIN_MS - 1,
    categoryTotals: { Other: 100 },
  };
  assert.equal(
    hooks.shouldSplitSessionForIntent(neutralSession, "https://example.com", clock.now()),
    false,
  );
  const productiveSession = {
    lastActivityAt: clock.now() - hooks.INTENT_GAP_MIN_MS - 1,
    updatedAt: clock.now() - hooks.INTENT_GAP_MIN_MS - 1,
    startedAt: clock.now() - hooks.INTENT_GAP_MIN_MS - 1,
    categoryTotals: { Video: 100 },
  };
  assert.equal(
    hooks.shouldSplitSessionForIntent(productiveSession, "https://news.ycombinator.com", clock.now()),
    true,
  );

  const state = hooks.createNewState();
  state.sessions = { s1: { id: "s1", startedAt: 1, updatedAt: 2, nodes: {}, edges: {} } };
  state.sessionOrder = ["s1"];
  state.activeSessionId = "s1";
  hooks.setState(state);
  hooks.livePorts.add(port);
  hooks.livePortMeta.set(port, {});
  hooks.setRuntime({
    settings: {
      ...hooks.DEFAULT_SETTINGS,
      realtimeStreamEnabled: true,
      realtimePortPush: true,
      realtimeBatchUpdates: false,
    },
  });
  context.__broadcastCalls = 0;
  vm.runInContext("broadcastRealtime = () => { __broadcastCalls += 1; }", context);
  hooks.scheduleRealtimeBroadcast("immediate");
  assert.equal(context.__broadcastCalls, 1);

  hooks.setRuntime({
    settings: {
      ...hooks.DEFAULT_SETTINGS,
      realtimeStreamEnabled: true,
      realtimePortPush: true,
      realtimeBatchUpdates: true,
      realtimeBatchWindowMs: 260,
    },
  });
  context.__broadcastCalls = 0;
  vm.runInContext("broadcastRealtime = () => { __broadcastCalls += 1; }", context);
  hooks.scheduleRealtimeBroadcast("batch");
  await new Promise((resolve) => setTimeout(resolve, 320));
  assert.equal(context.__broadcastCalls, 1);

  hooks.livePortMeta.delete(port);
  hooks.broadcastRealtime("missing_meta");

  hooks.sendPortStateSnapshot(null, "noop");

  const badState = hooks.createNewState();
  badState.sessions = { bad: { updatedAt: 1 } };
  hooks.setState(badState);
  hooks.sendPortStateSnapshot(port, "snapshot");

  const errorPort = { postMessage: () => { throw new Error("boom"); } };
  hooks.livePorts.add(errorPort);
  hooks.livePortMeta.set(errorPort, {});
  context.safePortPost(errorPort, { type: "state_snapshot" });

  hooks.setState(null);
  hooks.buildStateDelta({});

  hooks.setState({
    schemaVersion: hooks.SCHEMA_VERSION,
    sessions: { ok: { id: "ok", updatedAt: 1 }, bad: {} },
    sessionOrder: ["ok"],
    activeSessionId: null,
    tabs: {},
    tracking: {},
  });
  hooks.buildStateDelta({
    lastSessionId: null,
    lastSessionUpdatedAt: null,
    lastEventCursor: null,
    lastTrackingActiveSince: null,
    lastSessionFingerprints: {},
    lastSessionOrderKey: "old",
  });

  hooks.buildSessionOrderKey(null);
  hooks.buildSessionOrderKey([]);
  hooks.getLatestSessionEvent({ events: [{ id: 1 }, { id: 2 }] });
  hooks.applyIntentDrift(null, null);

  hooks.setRuntime({ idleState: "idle" });
  hooks.isUserIdle();

  hooks.setState(hooks.createNewState());
  hooks.setRuntime({
    userIdle: true,
    lastInactiveAt: clock.now() - hooks.getSessionIdleThresholdMs() - 1,
    sessionIdleEndedAt: null,
    lastInteractionAt: clock.now() - 1000,
    idleState: "idle",
  });
  hooks.evaluateUserIdle("timer");

  delete chrome.windows.getLastFocused;
  await hooks.refreshWindowFocus();
  hooks.handleAlarm(null);
});
