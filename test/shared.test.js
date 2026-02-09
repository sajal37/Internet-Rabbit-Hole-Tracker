const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createContext, loadScript, rootPath } = require("./test-helpers");

function loadShared() {
  const context = createContext();
  loadScript(rootPath("shared.js"), context);
  return { context, hooks: context.__IRHT_TEST_HOOKS__.shared };
}

test("shared helpers", () => {
  const { hooks, context } = loadShared();

  assert.equal(hooks.safeHostname(null), null);
  assert.equal(hooks.safeHostname("bad-url"), null);
  assert.equal(hooks.safeHostname("https://www.Example.com/a"), "example.com");

  assert.equal(hooks.matchesDomain(null, "*.example.com"), false);
  assert.equal(hooks.matchesDomain("example.com", null), false);
  assert.equal(hooks.matchesDomain("example.com", "example.com"), true);
  assert.equal(hooks.matchesDomain("sub.example.com", ".example.com"), true);
  assert.equal(hooks.matchesDomain("sub.example.com", "*.example.com"), true);

  assert.equal(hooks.matchHostToList("example.com", []), false);
  assert.equal(
    hooks.matchHostToList("example.com", ["example.com", "other.com"]),
    true,
  );

  assert.equal(hooks.isTechnicalUrl("https://example.com/login"), true);
  assert.equal(
    hooks.isTechnicalUrl("https://example.com/?redirect=https://a.com"),
    true,
  );
  assert.equal(hooks.isTechnicalUrl("https://example.com/"), false);

  assert.equal(hooks.resolveCategoryWithAI("https://a.com"), null);
  context.IRHTAICategoryHook = () => "  Study ";
  assert.equal(
    hooks.resolveCategoryWithAI("https://a.com", "Random"),
    "Study",
  );
  context.IRHTAICategoryHook = () => "   ";
  assert.equal(hooks.resolveCategoryWithAI("https://a.com"), null);
  context.IRHTAICategoryHook = () => {
    throw new Error("boom");
  };
  assert.equal(hooks.resolveCategoryWithAI("https://a.com"), null);
});

test("shared compute signals and distraction score", () => {
  const { hooks } = loadShared();

  const session = {
    navigationCount: 6,
    nodes: {
      a: { url: "https://example.com", activeMs: 120000, visitCount: 1 },
      b: { url: "https://example.com/login", activeMs: 30000, visitCount: 1 },
    },
    metrics: {
      totalActiveMs: 150000,
      maxNodeActiveMs: 0,
      maxDirty: true,
      nodesCount: 2,
      revisitCount: 1,
    },
  };
  const signalsWithMetrics = hooks.computeSessionSignals(session);
  assert.ok(signalsWithMetrics.totalActiveMs > 0);

  session.metrics = null;
  const signals = hooks.computeSessionSignals(session);
  assert.ok(signals.totalMinutes > 0);
  const nullSignals = hooks.computeSessionSignals(null);
  assert.equal(nullSignals.totalActiveMs, 0);
  const emptySignals = hooks.computeSessionSignals({
    nodes: {},
    metrics: {
      totalActiveMs: 0,
      maxNodeActiveMs: 0,
      maxDirty: true,
      nodesCount: 0,
      revisitCount: 0,
    },
  });
  assert.equal(emptySignals.revisitShare, 0);

  const score = hooks.computeDistractionScore(
    {
      url: "https://example.com/login",
      activeMs: 45000,
      visitCount: 1,
      category: "Random",
      firstNavigationIndex: 0,
      firstSeen: Date.now(),
    },
    { navigationCount: 6, nodes: session.nodes },
    {
      settings: {
        productiveSites: ["example.com"],
        distractingSites: ["video.example.com"],
      },
      categoryMultipliers: { Random: 1.1 },
      isLateNight: () => true,
      signals: {
        hopRate: 3.5,
        revisitShare: 0.4,
        feedLike: true,
      },
    },
  );
  assert.ok(score.score > 0);

  const basicScore = hooks.computeDistractionScore(
    {
      url: "https://example.com/",
      activeMs: 1000,
      visitCount: 1,
      category: "Study",
      firstNavigationIndex: 0,
      firstSeen: Date.now(),
    },
    { navigationCount: 1, nodes: {} },
    {},
  );
  assert.ok(basicScore.score >= 0);
});

test("shared coverage extras", () => {
  const { hooks } = loadShared();

  assert.equal(hooks.normalizeDistractionScore(Number.NaN), 0);
  assert.equal(hooks.getDistractionLabel(Number.NaN), "Focused");
  assert.equal(hooks.getDistractionLabel(100), "Distracted");

  const node = {
    url: "https://video.example.com/watch",
    activeMs: 1000,
    visitCount: 1,
    category: "Random",
    firstNavigationIndex: 0,
    firstSeen: Date.now(),
  };
  const score = hooks.computeDistractionScore(
    node,
    { navigationCount: 1, nodes: { [node.url]: node } },
    {
      settings: {
        productiveSites: ["video.example.com"],
        distractingSites: ["video.example.com"],
      },
      categoryMultipliers: { Random: 1 },
      isLateNight: () => false,
      signals: {
        hopRate: 0,
        revisitShare: 0,
        feedLike: false,
      },
    },
  );
  assert.ok(score.score > 0);
});

test("shared handles invalid technical urls and optional inputs", () => {
  const { hooks } = loadShared();
  assert.equal(hooks.isTechnicalUrl("not a url"), false);

  const emptySignals = hooks.computeSessionSignals({
    nodes: null,
    metrics: {
      totalActiveMs: 0,
      maxNodeActiveMs: 0,
      maxDirty: true,
      nodesCount: 0,
      revisitCount: 0,
    },
  });
  assert.equal(emptySignals.avgDwellMs, 0);
});

test("shared intent drift branches and sensitivity", () => {
  const { hooks } = loadShared();

  const empty = hooks.computeIntentDrift(null, null);
  assert.equal(empty.label, "Unknown");

  const lowSession = { nodes: { a: { url: "https://a.com", activeMs: 1000 } } };
  const lowResult = hooks.computeIntentDrift(lowSession, { totalActiveMs: 1000 });
  assert.equal(lowResult.label, "Unknown");

  const session = {
    navigationCount: 10,
    nodes: {
      "https://work.com/": { url: "https://work.com/", activeMs: 6 * 60 * 1000, category: "Study" },
      "https://fun.com/": { url: "https://fun.com/", activeMs: 5 * 60 * 1000, category: "Video" },
      "https://fun.com/scroll": { url: "https://fun.com/scroll", activeMs: 2 * 60 * 1000, category: "Video" },
      "https://news.com/": { url: "https://news.com/", activeMs: 2 * 60 * 1000, category: "News" },
      "https://forum.com/": { url: "https://forum.com/", activeMs: 2 * 60 * 1000, category: "Social" },
      "https://extra.com/": { url: "https://extra.com/", activeMs: 2 * 60 * 1000, category: "Random" },
    },
  };
  const signals = {
    totalActiveMs: 20 * 60 * 1000,
    hopRate: 4,
    avgDwellMs: 12000,
    topShare: 0.45,
    feedLike: true,
    revisitShare: 0.5,
    navCount: 10,
  };

  const high = hooks.computeIntentDrift(session, signals, {
    settings: {
      productiveSites: ["work.com"],
      distractingSites: ["fun.com"],
      intentDriftSensitivity: "high",
    },
  });
  assert.ok(["High", "Medium", "Low"].includes(high.label));

  const low = hooks.computeIntentDrift(session, signals, {
    settings: {
      productiveSites: ["work.com"],
      distractingSites: ["fun.com"],
      intentDriftSensitivity: "low",
    },
  });
  assert.ok(["High", "Medium", "Low"].includes(low.label));
});

test("shared intent drift contribution branches", () => {
  const { hooks } = loadShared();
  const session = {
    navigationCount: 12,
    nodes: {
      a: { url: "https://accounts.example.com/login", activeMs: 8000, category: "Study" },
      b: { url: "https://video.example.com/", activeMs: 9000, category: "Video" },
      c: { url: "https://example.com/", activeMs: 200000, category: "Study" },
      d: { url: "https://example.com/2", activeMs: 5000, category: "Study" },
    },
    edges: {
      "https://example.com/ -> https://video.example.com/": {
        from: "https://example.com/",
        to: "https://video.example.com/",
        visitCount: 3,
      },
      "https://example.com/ -> https://example.com/2": {
        from: "https://example.com/",
        to: "https://example.com/2",
        visitCount: 1,
      },
    },
  };
  const signals = {
    totalActiveMs: 300000,
    hopRate: 1,
    avgDwellMs: 130000,
    topShare: 0.7,
    feedLike: true,
    revisitShare: 0.4,
    navCount: 12,
  };
  const result = hooks.computeIntentDrift(session, signals, {
    settings: {
      productiveSites: ["example.com"],
      distractingSites: ["video.example.com"],
      intentDriftSensitivity: "high",
    },
  });
  assert.ok(result.score >= 0);
});

test("shared intent drift defaults and entropy helpers", () => {
  const { hooks, context } = loadShared();

  assert.equal(hooks.computeNormalizedEntropy([]), 0);
  assert.equal(hooks.computeNormalizedEntropy([1]), 0);
  assert.ok(hooks.computeNormalizedEntropy([0.5, 0.5]) >= 0);
  const logBackup = context.Math.log;
  context.Math.log = () => 0;
  assert.equal(hooks.computeNormalizedEntropy([0.5, 0.5]), 0);
  context.Math.log = logBackup;
  assert.equal(hooks.getMaxShare([]), 0);
  assert.equal(hooks.getMaxShare([0.2, 0.8]), 0.8);

  const baseSession = {
    navigationCount: 0,
    nodes: {
      a: { url: "https://example.com/", activeMs: 150000, category: "Study" },
      b: { url: "https://example.com/page", activeMs: 150000, category: "Study" },
    },
  };
  const result = hooks.computeIntentDrift(baseSession, {
    totalActiveMs: 300000,
    hopRate: 0,
    avgDwellMs: 180000,
    topShare: 1,
    feedLike: false,
    revisitShare: 0,
    navCount: 0,
  });
  assert.equal(result.reason, "Stable browsing pattern.");
});

test("shared intent drift falls back to node totals and zero-share entropy", () => {
  const { hooks } = loadShared();
  const sessionFromNodes = {
    navigationCount: 4,
    nodes: {
      a: { url: "https://alpha.com/", activeMs: 60000, category: "Study" },
      b: { url: "https://beta.com/", activeMs: 60000, category: "Study" },
      c: { url: "https://gamma.com/", activeMs: 0, category: "Study" },
    },
    edges: {},
  };
  const fromNodes = hooks.computeIntentDrift(sessionFromNodes);
  assert.ok(fromNodes.label);

  const zeroShareSession = {
    nodes: {
      a: { url: "https://alpha.com/", activeMs: 0, category: "Study" },
      b: { url: "https://beta.com/", activeMs: 0, category: "Study" },
    },
    edges: {},
  };
  const zeroShare = hooks.computeIntentDrift(zeroShareSession, { totalActiveMs: 240000 });
  assert.ok(zeroShare.label);
});

test("shared intent drift branch coverage for counts and fallbacks", () => {
  const { hooks } = loadShared();

  const session = {
    navigationCount: 5,
    nodes: {
      a: { url: "https://video.example.com/login", activeMs: 5000, category: "" },
      b: { url: "https://docs.example.com/login", activeMs: 15000, category: "Study" },
      c: { url: "https://news.example.com/", activeMs: 0, category: "News" },
      d: { url: "https://example.com/", activeMs: 30000, category: "Other" },
    },
    edges: {
      "https://example.com/ -> https://video.example.com/login": {
        from: "https://example.com/",
        to: "https://video.example.com/login",
        visitCount: 2,
      },
      "https://example.com/ -> https://example.com/again": {
        from: "https://example.com/",
        to: "https://example.com/again",
        visitCount: 1,
      },
      "missing -> missing": { from: "", to: "", visitCount: 1 },
    },
  };
  const result = hooks.computeIntentDrift(session, {
    totalActiveMs: 300000,
    hopRate: 1,
    avgDwellMs: 5000,
    topShare: 0.2,
    feedLike: true,
    revisitShare: 0.4,
    navCount: 10,
  }, {
    settings: {
      productiveSites: ["example.com"],
      distractingSites: ["example.com"],
    },
  });
  assert.ok(["High", "Medium", "Low"].includes(result.label));

  const fallbackSignals = hooks.computeIntentDrift(
    {
      navigationCount: 4,
      nodes: {
        a: { url: "bad-url", activeMs: 120000, category: "Study" },
        b: { url: "bad-url-2", activeMs: 120000, category: "Study" },
      },
    },
    undefined,
    {},
  );
  assert.ok(["High", "Medium", "Low"].includes(fallbackSignals.label));
});

test("shared intent drift focus cut and productive alignment", () => {
  const { hooks } = loadShared();
  const session = {
    navigationCount: 8,
    nodes: {
      a: { url: "https://work.example.com/login", activeMs: 5 * 60 * 1000, category: "Study" },
      b: { url: "https://work.example.com/docs", activeMs: 4 * 60 * 1000, category: "Study" },
      c: { url: "https://work.example.com/page", activeMs: 3 * 60 * 1000, category: "Study" },
      d: { url: "https://fun.example.com/", activeMs: 60 * 1000, category: "Video" },
    },
    edges: {},
  };
  const result = hooks.computeIntentDrift(session, {
    totalActiveMs: 15 * 60 * 1000,
    hopRate: 1,
    avgDwellMs: 130000,
    topShare: 0.7,
    feedLike: false,
    revisitShare: 0.4,
    navCount: 8,
  }, {
    settings: {
      productiveSites: ["work.example.com"],
      distractingSites: [],
      intentDriftSensitivity: "low",
    },
  });
  assert.ok(["High", "Medium", "Low"].includes(result.label));
});

test("shared test hooks attach in main context", () => {
  const testBackup = global.__IRHT_TEST__;
  const hooksBackup = global.__IRHT_TEST_HOOKS__;
  global.__IRHT_TEST__ = true;
  global.__IRHT_TEST_HOOKS__ = null;
  const sharedPath = require.resolve("../shared.js");
  delete require.cache[sharedPath];
  require(sharedPath);
  assert.ok(global.__IRHT_TEST_HOOKS__.shared);
  const signalSession = {
    nodes: { a: { url: "https://example.com", activeMs: 0, visitCount: 1 } },
    metrics: { totalActiveMs: 0, maxNodeActiveMs: 0, maxDirty: true, nodesCount: 1, revisitCount: 0 },
  };
  const signals = global.IRHTShared.computeSessionSignals(signalSession);
  assert.equal(signals.totalActiveMs, 0);
  const fallbackScore = global.IRHTShared.computeDistractionScore(
    { url: "https://example.com", activeMs: 0, visitCount: 0, category: "Random" },
    { navigationCount: 0, nodes: {} },
    {},
  );
  assert.ok(fallbackScore.score >= 0);
  delete require.cache[sharedPath];
  global.__IRHT_TEST__ = testBackup;
  global.__IRHT_TEST_HOOKS__ = hooksBackup;
});

test("shared test hooks reuse existing object", () => {
  const testBackup = global.__IRHT_TEST__;
  const hooksBackup = global.__IRHT_TEST_HOOKS__;
  global.__IRHT_TEST__ = true;
  global.__IRHT_TEST_HOOKS__ = { existing: true };
  const sharedPath = require.resolve("../shared.js");
  delete require.cache[sharedPath];
  require(sharedPath);
  assert.ok(global.__IRHT_TEST_HOOKS__.shared);
  delete require.cache[sharedPath];
  global.__IRHT_TEST__ = testBackup;
  global.__IRHT_TEST_HOOKS__ = hooksBackup;
});
