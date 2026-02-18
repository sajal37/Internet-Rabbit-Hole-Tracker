const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  createClock,
  createContext,
  loadScript,
  rootPath,
} = require("./test-helpers");

function loadInsights(clock) {
  const context = createContext({ clock });
  loadScript(rootPath("shared.js"), context);
  loadScript(rootPath("insights.js"), context);
  return { context, hooks: context.__IRHT_TEST_HOOKS__.insights };
}

test("insights helpers and mirrors", () => {
  const clock = createClock(1000);
  const { hooks } = loadInsights(clock);

  assert.equal(hooks.resolveTone("direct"), "direct");
  assert.equal(hooks.resolveTone("unknown"), "neutral");

  assert.equal(hooks.formatDuration(3661000), "1h 1m");
  assert.equal(hooks.formatDuration(62000), "1m 2s");
  assert.equal(hooks.formatDuration(1500), "1s");

  assert.equal(hooks.getDomain("bad-url"), null);
  assert.equal(hooks.getDomain("https://www.example.com/path"), "example.com");

  const activeMs = hooks.getSessionActiveMs(
    { nodes: { a: { activeMs: 1000 }, b: { activeMs: 2000 } } },
    { activeSince: clock.now() - 1000, activeUrl: "a" },
  );
  assert.ok(activeMs >= 3000);

  const emptyMirror = hooks.buildSessionMirror(null, null);
  assert.equal(emptyMirror.summary, "No session yet.");

  const shortSession = {
    nodes: { a: { url: "https://example.com", activeMs: 1000 } },
    navigationCount: 0,
    startedAt: clock.now(),
  };
  const shortMirror = hooks.buildSessionMirror(shortSession, null);
  assert.equal(shortMirror.summary, "Just started. Not enough data yet.");

  const focusSession = {
    nodes: {
      a: { url: "https://example.com", activeMs: 10 * 60 * 1000, visitCount: 1 },
      b: { url: "https://example.com/2", activeMs: 2 * 60 * 1000, visitCount: 1 },
    },
    navigationCount: 1,
    startedAt: clock.now(),
  };
  const focusMirror = hooks.buildSessionMirror(focusSession, null);
  assert.equal(focusMirror.summary, "Steady focus on one thread.");
  const emptyOrigin = hooks.buildSessionMirror(focusSession, null, {
    testReasonCandidates: [],
  });
  assert.equal(emptyOrigin.origin, "No clear origin yet.");

  const wanderLoopSession = {
    nodes: {
      a: { url: "https://a.com", activeMs: 30000, visitCount: 2 },
      b: { url: "https://b.com", activeMs: 30000, visitCount: 2 },
      c: { url: "https://c.com", activeMs: 30000, visitCount: 2 },
      d: { url: "https://d.com", activeMs: 30000, visitCount: 2 },
    },
    navigationCount: 10,
    startedAt: clock.now(),
  };
  const wanderMirror = hooks.buildSessionMirror(wanderLoopSession, null);
  assert.equal(
    wanderMirror.summary,
    "Looping and hopping in the same stretch.",
  );

  const lateNight = new Date(clock.now());
  lateNight.setHours(23, 0, 0, 0);
  const lateSession = {
    nodes: {
      a: { url: "https://late.com", activeMs: 2 * 60 * 1000, visitCount: 1 },
      b: { url: "https://late.com/2", activeMs: 2 * 60 * 1000, visitCount: 1 },
    },
    navigationCount: 1,
    startedAt: lateNight.getTime(),
  };
  const lateMirror = hooks.buildSessionMirror(lateSession, null);
  assert.equal(
    lateMirror.summary,
    "Late-night browsing loosened the pace.",
  );

  const candidates = hooks.buildReasonCandidates(
    { shortSession: true },
    { insightShort: "Short", insightMixed: "Mixed" },
  );
  assert.equal(candidates[0].id, "short");

  const insights = hooks.generateInsights(focusSession, null);
  assert.ok(insights.length > 0);

  hooks.generateInsights(null, null);
});

test("insights coverage extras", () => {
  const clock = createClock(5000);
  const { hooks, context } = loadInsights(clock);

  assert.equal(hooks.getDomain(null), null);
  assert.equal(hooks.getSessionActiveMs(null, null), 0);
  hooks.analyzeSession(null, null);
  hooks.analyzeSession({ nodes: {} }, null);
  hooks.getSessionActiveMs(
    { nodes: { a: { activeMs: 1000 } } },
    { activeSince: null, activeUrl: "a" },
  );

  const topDomains = hooks.buildTopDomains({
    nodes: {
      bad: { url: "bad-url", activeMs: 5 },
      good: { url: "https://good.com", activeMs: 10 },
    },
  });
  assert.equal(topDomains[0].domain, "good.com");
  assert.equal(hooks.buildTopDomains(null).length, 0);

  assert.equal(
    hooks.findSessionStartUrl({
      events: [{ ts: 1, type: "navigation", toUrl: "https://nav.com" }],
      nodes: {},
    }),
    "https://nav.com",
  );
  assert.equal(
    hooks.findSessionStartUrl({
      events: [{ ts: 2, type: "URL_CHANGED", url: "https://changed.com" }],
      nodes: {},
    }),
    "https://changed.com",
  );
  assert.equal(
    hooks.findSessionStartUrl({
      events: [{ ts: 2, type: "TAB_ACTIVE", url: "https://tab.com" }],
      nodes: {},
    }),
    "https://tab.com",
  );
  assert.equal(
    hooks.findSessionStartUrl({
      events: [],
      nodes: {
        a: { url: "https://late.com", firstSeen: 5 },
        b: { url: "https://early.com", firstSeen: 1 },
      },
    }),
    "https://early.com",
  );
  assert.equal(
    hooks.findSessionStartUrl({
      events: [],
      nodes: {},
    }),
    null,
  );

  assert.equal(hooks.isLateNight(null), false);

  const sharedBackup = context.IRHTShared;
  context.IRHTShared = null;
  assert.equal(hooks.formatDuration(1000), "1s");
  assert.equal(hooks.getDomain("https://example.com/"), null);
  assert.equal(hooks.getSessionActiveMs({ nodes: {} }, null), 0);
  assert.equal(hooks.buildTopDomains({ nodes: {} }).length, 0);
  assert.equal(
    hooks.findSessionStartUrl({
      events: [],
      nodes: {},
    }),
    null,
  );
  assert.equal(hooks.isLateNight(null), false);
  context.IRHTShared = sharedBackup;
  assert.equal(hooks.collectSessions({}).length, 0);
  assert.equal(
    hooks.generateInsights({ nodes: {} }, null).length,
    0,
  );

  assert.equal(hooks.computeDriftMinutes({}), null);
  assert.equal(
    hooks.computeDriftMinutes({
      startedAt: clock.now(),
      trapDoors: [{ url: "https://trap.com" }],
      events: [],
      nodes: {},
    }),
    null,
  );
  assert.equal(
    hooks.computeDriftMinutes({
      firstActivityAt: clock.now() - 60000,
      trapDoors: [{ url: "https://trap.com" }],
      events: [{ ts: clock.now() - 30000, type: "navigation", toUrl: "https://trap.com" }],
    }),
    1,
  );
  assert.equal(
    hooks.computeDriftMinutes({
      trapDoors: [{ url: "https://trap.com" }],
      events: [
        { ts: clock.now() - 90000, type: "navigation", toUrl: "https://start.com" },
        { ts: clock.now() - 30000, type: "navigation", toUrl: "https://trap.com" },
      ],
    }),
    1,
  );
  assert.equal(
    hooks.computeDriftMinutes({
      startedAt: clock.now() - 60000,
      trapDoors: [{ url: "https://trap.com" }],
      events: [],
      nodes: { "https://trap.com": { firstSeen: clock.now() - 30000 } },
    }),
    1,
  );
  assert.equal(hooks.computeDriftMinutes({ trapDoors: [] }), null);
  assert.equal(
    hooks.computeDriftMinutes({
      startedAt: 1000,
      trapDoors: [{ url: "https://trap.com" }],
      events: [{ ts: 1000, type: "navigation", toUrl: "https://trap.com" }],
    }),
    null,
  );

  const wanderSession = {
    nodes: {
      a: { url: "https://a.com", activeMs: 40000, visitCount: 1 },
      b: { url: "https://b.com", activeMs: 40000, visitCount: 1 },
      c: { url: "https://c.com", activeMs: 40000, visitCount: 1 },
    },
    navigationCount: 8,
    startedAt: clock.now(),
  };
  assert.equal(
    hooks.buildSessionMirror(wanderSession, null).summary,
    "Quick hops without settling.",
  );

  const loopSession = {
    nodes: {
      a: { url: "https://a.com", activeMs: 180000, visitCount: 2 },
      b: { url: "https://b.com", activeMs: 180000, visitCount: 2 },
      c: { url: "https://c.com", activeMs: 180000, visitCount: 2 },
      d: { url: "https://d.com", activeMs: 180000, visitCount: 2 },
    },
    navigationCount: 1,
    startedAt: clock.now(),
  };
  assert.equal(
    hooks.buildSessionMirror(loopSession, null).summary,
    "Repeated visits to the same places.",
  );

  const lateNight = new Date(clock.now());
  lateNight.setHours(23, 0, 0, 0);
  const lateSession = {
    nodes: {
      a: { url: "https://late.com", activeMs: 120000, visitCount: 1 },
      b: { url: "https://late.com/2", activeMs: 120000, visitCount: 1 },
    },
    navigationCount: 1,
    startedAt: lateNight.getTime(),
  };
  assert.equal(
    hooks.buildSessionMirror(lateSession, null).summary,
    "Late-night browsing loosened the pace.",
  );

  const noCandidate = hooks.buildReasonCandidates(
    {
      shortSession: false,
      focus: false,
      feedLike: false,
      wandering: false,
      looping: false,
      lateNight: false,
    },
    { insightMixed: "Mixed" },
  );
  assert.equal(noCandidate[0].id, "mixed");

  const manyCandidates = hooks.buildReasonCandidates(
    {
      shortSession: false,
      focus: true,
      feedLike: true,
      wandering: true,
      looping: true,
      lateNight: true,
    },
    {
      insightFocus: "Focus",
      insightFeed: "Feed",
      insightWander: "Wander",
      insightLoop: "Loop",
      insightLateNight: "Late",
    },
  );
  assert.ok(manyCandidates.length >= 5);

  const tieInsights = hooks.generateInsights(wanderSession, null, {
    testCandidates: [
      { id: "b", score: 1, text: "b" },
      { id: "a", score: 1, text: "a" },
    ],
  });
  assert.equal(tieInsights[0].id, "a");
});

test("insights drift, repetition, and typicals", () => {
  const clock = createClock(2000);
  const { hooks } = loadInsights(clock);

  const session = {
    startedAt: clock.now() - 120000,
    events: [
      { ts: clock.now() - 60000, type: "navigation", toUrl: "https://trap.com" },
    ],
    trapDoors: [{ url: "https://trap.com" }],
    nodes: {
      "https://trap.com": { url: "https://trap.com", firstSeen: clock.now() - 40000 },
    },
  };
  assert.equal(hooks.computeDriftMinutes(session), 1);

  const missingTrap = { trapDoors: [{ url: "https://trap.com" }], events: [] };
  assert.equal(hooks.computeDriftMinutes(missingTrap), null);

  assert.equal(hooks.median([]), null);
  assert.equal(hooks.median([1, 3, 2]), 2);
  assert.equal(hooks.median([1, 2, 3, 4]), 3);

  const state = {
    sessionOrder: ["a", "b", "c"],
    sessions: {
      a: { nodes: { x: { url: "https://repeat.com", activeMs: 10 } } },
      b: { nodes: { y: { url: "https://repeat.com", activeMs: 20 } } },
      c: { nodes: { z: { url: "https://other.com", activeMs: 30 } } },
    },
  };
  const repetition = hooks.computeDomainRepetition(state, "repeat.com", 3);
  assert.equal(repetition.count, 2);
  assert.equal(hooks.computeDomainRepetition(state, null).count, 0);

  const late = new Date(clock.now());
  late.setHours(1, 0, 0, 0);
  const lateState = {
    sessionOrder: ["x"],
    sessions: { x: { startedAt: late.getTime(), nodes: {} } },
  };
  const lateCount = hooks.computeLateNightCount(lateState, 1);
  assert.equal(lateCount.count, 1);

  const typical = hooks.computeTypicalDrift(
    {
      sessionOrder: ["s1", "s2"],
      sessions: {
        s1: session,
        s2: { ...session, startedAt: clock.now() - 120000 },
      },
    },
    2,
  );
  assert.equal(typical.sampleCount, 2);
});

test("insights coverage for empty and fallback branches", () => {
  const clock = createClock(3000);
  const { hooks } = loadInsights(clock);

  const emptySession = { nodes: {}, navigationCount: 0 };
  const analysis = hooks.analyzeSession(emptySession, {
    activeSince: clock.now() - 5000,
    activeUrl: "missing",
  });
  assert.equal(analysis.avgActiveMs, 0);

  const fallbackStart = hooks.findSessionStartUrl({
    events: [{ ts: 1, type: "misc" }],
    nodes: {
      a: { url: "https://later.com", firstSeen: 5 },
      b: { url: "https://earlier.com", firstSeen: 1 },
    },
  });
  assert.equal(fallbackStart, "https://earlier.com");

  const noStart = hooks.findSessionStartUrl({
    events: [{ ts: 1, type: "misc" }],
    nodes: {},
  });
  assert.equal(noStart, null);

  const driftNoTrigger = hooks.computeDriftMinutes({
    startedAt: clock.now() - 60000,
    trapDoors: [{ url: "https://trap.com" }],
    events: [{ ts: clock.now() - 59000, type: "navigation", toUrl: "https://other.com" }],
    nodes: {},
  });
  assert.equal(driftNoTrigger, null);
});

test("insights test hooks attach in main context", () => {
  const testBackup = global.__IRHT_TEST__;
  const hooksBackup = global.__IRHT_TEST_HOOKS__;
  global.__IRHT_TEST__ = true;
  global.__IRHT_TEST_HOOKS__ = null;
  const insightsPath = require.resolve("../insights.js");
  delete require.cache[insightsPath];
  require(insightsPath);
  assert.ok(global.__IRHT_TEST_HOOKS__.insights);
  delete require.cache[insightsPath];
  global.__IRHT_TEST__ = testBackup;
  global.__IRHT_TEST_HOOKS__ = hooksBackup;
});

test("insights test hooks reuse existing object", () => {
  const testBackup = global.__IRHT_TEST__;
  const hooksBackup = global.__IRHT_TEST_HOOKS__;
  global.__IRHT_TEST__ = true;
  global.__IRHT_TEST_HOOKS__ = { existing: true };
  const insightsPath = require.resolve("../insights.js");
  delete require.cache[insightsPath];
  require(insightsPath);
  assert.ok(global.__IRHT_TEST_HOOKS__.insights);
  delete require.cache[insightsPath];
  global.__IRHT_TEST__ = testBackup;
  global.__IRHT_TEST_HOOKS__ = hooksBackup;
});

test("insights active time and start url branches", () => {
  const { hooks } = loadInsights();
  const session = {
    nodes: {
      "https://example.com/": { url: "https://example.com/", activeMs: 1000, firstSeen: 5 },
    },
    events: [
      { ts: 1, type: "URL_CHANGED", url: "https://start.com" },
    ],
  };
  const tracking = { activeSince: Date.now() - 5000, activeUrl: "https://example.com/" };
  assert.ok(hooks.getSessionActiveMs(session, tracking) >= 1000);
  assert.equal(hooks.findSessionStartUrl({ nodes: {}, events: [] }), null);
  assert.equal(hooks.findSessionStartUrl(session), "https://start.com");
});

test("insights active time and fallback start url from nodes", () => {
  const clock = createClock(10000);
  const { hooks } = loadInsights(clock);
  const session = {
    nodes: {
      "https://late.com/": { url: "https://late.com/", activeMs: 60000, firstSeen: 10 },
      "https://zero.com/": { url: "https://zero.com/", activeMs: 60000 },
    },
    events: [],
  };
  const tracking = { activeSince: 9000, activeUrl: "https://zero.com/" };
  const total = hooks.getSessionActiveMs(session, tracking);
  assert.ok(total > 120000);
  assert.equal(hooks.findSessionStartUrl(session), "https://zero.com/");
});

test("insights active time handles missing nodes", () => {
  const clock = createClock(10000);
  const { hooks } = loadInsights(clock);
  const session = {};
  const tracking = { activeSince: 9000, activeUrl: "https://missing.com/" };
  assert.equal(hooks.getSessionActiveMs(session, tracking), 0);
});

test("insights start url sorts nodes without firstSeen", () => {
  const { hooks } = loadInsights();
  const start = hooks.findSessionStartUrl({
    events: [],
    nodes: {
      "https://a.com/": { url: "https://a.com/" },
      "https://b.com/": { url: "https://b.com/" },
    },
  });
  assert.ok(["https://a.com/", "https://b.com/"].includes(start));
});

test("insights drift minutes and candidates branches", () => {
  const { hooks } = loadInsights();
  const session = {
    startedAt: 1000,
    firstActivityAt: 1000,
    trapDoors: [{ url: "https://trap.com/" }],
    events: [{ ts: 61000, type: "navigation", toUrl: "https://trap.com/" }],
    nodes: { "https://trap.com/": { url: "https://trap.com/", firstSeen: 60000 } },
  };
  assert.ok(hooks.computeDriftMinutes(session) > 0);
  const noTrigger = hooks.computeDriftMinutes({
    trapDoors: [{ url: "https://missing.com/" }],
    events: [],
    nodes: {},
  });
  assert.equal(noTrigger, null);

  const generated = hooks.generateInsights(
    { nodes: { a: { url: "https://example.com", activeMs: 1 } } },
    {},
    { testCandidates: [{ id: "x", text: "Test", score: 1 }] },
  );
  assert.equal(generated[0].text, "Test");
});

test("insights branch coverage for fallbacks", () => {
  const { hooks } = loadInsights();

  assert.equal(hooks.getSessionActiveMs({ nodes: null }, null), 0);
  assert.equal(
    hooks.getSessionActiveMs(
      { nodes: { a: { activeMs: 1000 } } },
      { activeSince: Date.now() - 1000, activeUrl: "missing" },
    ),
    1000,
  );
  assert.ok(
    hooks.getSessionActiveMs(
      { nodes: { a: { activeMs: 1000 } } },
      { activeSince: Date.now() - 1000, activeUrl: "a" },
    ) >= 1000,
  );

  const domains = hooks.buildTopDomains({
    nodes: {
      a: { url: "https://example.com", activeMs: undefined },
      b: { url: "https://example.com", activeMs: 5 },
    },
  });
  assert.equal(domains[0].activeMs, 5);

  assert.equal(hooks.findSessionStartUrl(null), null);
  assert.equal(hooks.findSessionStartUrl({}), null);
  // After internal-URL filtering, null-URL nodes are skipped so the
  // first valid node ('later.com') becomes the start URL.
  assert.equal(
    hooks.findSessionStartUrl({
      events: [],
      nodes: {
        a: { url: null, firstSeen: 1 },
        b: { url: "https://later.com", firstSeen: 2 },
      },
    }),
    "https://later.com",
  );

  // When ALL nodes have null URLs, returns null.
  assert.equal(
    hooks.findSessionStartUrl({
      events: [],
      nodes: { a: { url: null, firstSeen: 1 } },
    }),
    null,
  );

  assert.equal(
    hooks.computeDriftMinutes({
      trapDoors: [{ url: "https://trap.com" }],
      events: undefined,
      nodes: {},
    }),
    null,
  );

  assert.equal(hooks.generateInsights(null, null).length, 0);
  assert.equal(hooks.generateInsights({ nodes: null }, null).length, 0);
});

test("insights new pattern detection: deepDive, scattered, tabExplosion", () => {
  const clock = createClock(5000);
  const { hooks } = loadInsights(clock);

  // Deep dive: <=2 domains, >=5 pages, >=5min active
  const deepDiveSession = {
    nodes: {
      a: { url: "https://docs.example.com/page1", activeMs: 120000, visitCount: 1 },
      b: { url: "https://docs.example.com/page2", activeMs: 80000, visitCount: 1 },
      c: { url: "https://docs.example.com/page3", activeMs: 60000, visitCount: 1 },
      d: { url: "https://docs.example.com/page4", activeMs: 50000, visitCount: 1 },
      e: { url: "https://docs.example.com/page5", activeMs: 40000, visitCount: 1 },
    },
    navigationCount: 4,
    startedAt: clock.now(),
  };
  const ddAnalysis = hooks.analyzeSession(deepDiveSession, null);
  assert.ok(ddAnalysis.deepDive);
  assert.ok(ddAnalysis.domainCount <= 2);

  // Scattered: >=6 domains, avg < 60s
  const scatteredSession = {
    nodes: {
      a: { url: "https://a.com/", activeMs: 30000, visitCount: 1 },
      b: { url: "https://b.com/", activeMs: 30000, visitCount: 1 },
      c: { url: "https://c.com/", activeMs: 30000, visitCount: 1 },
      d: { url: "https://d.com/", activeMs: 30000, visitCount: 1 },
      e: { url: "https://e.com/", activeMs: 30000, visitCount: 1 },
      f: { url: "https://f.com/", activeMs: 30000, visitCount: 1 },
    },
    navigationCount: 5,
    startedAt: clock.now(),
  };
  const scAnalysis = hooks.analyzeSession(scatteredSession, null);
  assert.ok(scAnalysis.scattered);
  assert.ok(scAnalysis.domainCount >= 6);

  // Tab explosion: >=10 pages, >=4 pages/min
  const tabExplosionSession = {
    nodes: {},
    navigationCount: 15,
    startedAt: clock.now(),
  };
  for (let i = 0; i < 12; i++) {
    tabExplosionSession.nodes[`n${i}`] = {
      url: `https://site${i}.com/`,
      activeMs: 10000,
      visitCount: 1,
    };
  }
  const teAnalysis = hooks.analyzeSession(tabExplosionSession, null);
  assert.ok(teAnalysis.tabExplosion);

  // buildReasonCandidates with new flags
  const copy = {
    insightDeepDive: "Deep dive",
    insightTabExplosion: "Tab explosion",
    insightScatter: "Scatter",
    insightFocus: "Focus",
    insightFeed: "Feed",
    insightWander: "Wander",
    insightLoop: "Loop",
    insightLateNight: "Late",
    insightMixed: "Mixed",
  };
  const deepDiveCandidates = hooks.buildReasonCandidates(
    { shortSession: false, focus: false, deepDive: true, feedLike: false, tabExplosion: false, wandering: false, scattered: false, looping: false, lateNight: false },
    copy,
  );
  assert.ok(deepDiveCandidates.some((c) => c.id === "deepDive"));

  const tabExplosionCandidates = hooks.buildReasonCandidates(
    { shortSession: false, focus: false, deepDive: false, feedLike: false, tabExplosion: true, wandering: false, scattered: false, looping: false, lateNight: false },
    copy,
  );
  assert.ok(tabExplosionCandidates.some((c) => c.id === "tabExplosion"));

  const scatterCandidates = hooks.buildReasonCandidates(
    { shortSession: false, focus: false, deepDive: false, feedLike: false, tabExplosion: false, wandering: false, scattered: true, looping: false, lateNight: false },
    copy,
  );
  assert.ok(scatterCandidates.some((c) => c.id === "scatter"));
});

test("insights poetic tone resolution", () => {
  const { hooks } = loadInsights();
  assert.equal(hooks.resolveTone("poetic"), "poetic");
  assert.equal(hooks.resolveTone("direct"), "direct");
  assert.equal(hooks.resolveTone("casual"), "neutral");
});

test("insights computeSessionTrend", () => {
  const clock = createClock(5000);
  const { hooks } = loadInsights(clock);

  // Not enough sessions
  const emptyTrend = hooks.computeSessionTrend({}, null, 5);
  assert.equal(emptyTrend.trend, "neutral");

  const state = {
    sessionOrder: ["a", "b", "c"],
    sessions: {
      a: { nodes: { x: { activeMs: 60000 } } },
      b: { nodes: { y: { activeMs: 60000 } } },
      c: { nodes: { z: { activeMs: 60000 } } },
    },
  };

  // Current session much longer than average => "longer"
  const longerTrend = hooks.computeSessionTrend(
    state,
    { nodes: { x: { activeMs: 300000 } } },
    5,
  );
  assert.equal(longerTrend.trend, "longer");

  // Current session much shorter => "shorter"
  const shorterTrend = hooks.computeSessionTrend(
    state,
    { nodes: { x: { activeMs: 10000 } } },
    5,
  );
  assert.equal(shorterTrend.trend, "shorter");

  // Normal range
  const neutralTrend = hooks.computeSessionTrend(
    state,
    { nodes: { x: { activeMs: 60000 } } },
    5,
  );
  assert.equal(neutralTrend.trend, "neutral");
});

test("insights computeProductivityStreak", () => {
  const clock = createClock(5000);
  const { hooks } = loadInsights(clock);

  // Empty
  const empty = hooks.computeProductivityStreak({}, 5);
  assert.equal(empty.streak, 0);

  // Focus sessions have topShare >= 0.6, avgActiveMs >= 120000, hopRate <= 1.5
  const state = {
    sessionOrder: ["a", "b", "c"],
    sessions: {
      a: {
        nodes: {
          x: { url: "https://a.com", activeMs: 600000, visitCount: 1 },
          y: { url: "https://a.com/2", activeMs: 60000, visitCount: 1 },
        },
        navigationCount: 1,
        startedAt: clock.now(),
      },
      b: {
        nodes: {
          x: { url: "https://b.com", activeMs: 500000, visitCount: 1 },
          y: { url: "https://b.com/2", activeMs: 50000, visitCount: 1 },
        },
        navigationCount: 1,
        startedAt: clock.now(),
      },
      c: {
        nodes: {
          x: { url: "https://c.com", activeMs: 10000, visitCount: 1 },
          y: { url: "https://c.com/2", activeMs: 10000, visitCount: 1 },
          z: { url: "https://c.com/3", activeMs: 10000, visitCount: 1 },
        },
        navigationCount: 10,
        startedAt: clock.now(),
      },
    },
  };

  // c is last and unfocused => breaks streak, b and a are focus
  const streak = hooks.computeProductivityStreak(state, 5);
  assert.equal(streak.streak, 0); // c breaks the streak from the end
  assert.equal(streak.total, 3);

  // All focused sessions
  const allFocused = {
    sessionOrder: ["a", "b"],
    sessions: {
      a: state.sessions.a,
      b: state.sessions.b,
    },
  };
  const focusStreak = hooks.computeProductivityStreak(allFocused, 5);
  assert.equal(focusStreak.streak, 2);
});
