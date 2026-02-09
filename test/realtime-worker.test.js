const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createContext, loadScript, rootPath } = require("./test-helpers");

function loadWorker() {
  const messages = [];
  const context = createContext({
    extraGlobals: {
      postMessage: (msg) => messages.push(msg),
    },
  });
  context.self = context;
  context.postMessage = (msg) => messages.push(msg);
  context.importScripts = (...paths) => {
    paths.forEach((path) => loadScript(rootPath("dashboard", path), context));
  };
  loadScript(rootPath("dashboard", "summary-shared.js"), context);
  loadScript(rootPath("dashboard", "realtime-worker.js"), context);
  return { context, messages };
}

function sendMessage(context, message) {
  context.self.onmessage({ data: message });
}

test("realtime worker ignores invalid messages", () => {
  const { context, messages } = loadWorker();
  sendMessage(context, { type: "", requestId: 0 });
  sendMessage(context, {});
  context.self.onmessage({});
  assert.equal(messages.length, 0);
});

test("realtime worker derive_summary returns early", () => {
  const { context, messages } = loadWorker();
  context.buildStatsPayload = () => {
    throw new Error("stats should not run");
  };
  sendMessage(context, {
    type: "derive_summary",
    requestId: 1,
    payload: {
      session: { nodes: { "https://example.com/": { url: "https://example.com/" } } },
    },
  });
  assert.equal(messages.length, 1);
});

test("realtime worker derives graph data", () => {
  const { context, messages } = loadWorker();
  sendMessage(context, { type: "derive_graph", requestId: 1, payload: { session: null } });
  assert.equal(messages[0].graph.nodes.length, 0);

  const session = {
    nodes: {
      "https://example.com/": { url: "https://example.com/", activeMs: 10, title: "Short title" },
      "https://example.com/next": {
        url: "https://example.com/next",
        activeMs: 5,
        title: "This title is intentionally longer than forty-two characters.",
      },
    },
    edges: {
      "https://example.com/ -> https://example.com/next": {
        from: "https://example.com/",
        to: "https://example.com/next",
        activeMs: 3,
      },
    },
  };
  sendMessage(context, {
    type: "derive_graph",
    requestId: 2,
    payload: { session, mode: "page", maxNodes: 1 },
  });
  const pageGraph = messages[1].graph;
  assert.equal(pageGraph.nodes.length, 1);

  sendMessage(context, {
    type: "derive_graph",
    requestId: 3,
    payload: { session, mode: "page", maxNodes: 0 },
  });
  assert.equal(messages[2].graph.nodes.length, 0);

  const domainSession = {
    nodes: {
      "https://example.com/": { url: "https://example.com/", activeMs: 10, visitCount: 1 },
      "https://example.com/other": { url: "https://example.com/other", activeMs: 2, visitCount: 1 },
      "notaurl": { url: "notaurl", activeMs: 5, visitCount: 1 },
      "bad url": { url: "bad url", activeMs: 3, visitCount: 1 },
      "https://sample.com/": { url: "https://sample.com/", activeMs: 8, visitCount: 1 },
    },
    edges: {
      "https://example.com/ -> https://example.com/other": {
        from: "https://example.com/",
        to: "https://example.com/other",
        activeMs: 2,
        visitCount: 1,
      },
      "https://example.com/ -> https://sample.com/": {
        from: "https://example.com/",
        to: "https://sample.com/",
        activeMs: 4,
        visitCount: 1,
      },
    },
  };
  sendMessage(context, {
    type: "derive_graph",
    requestId: 4,
    payload: { session: domainSession, mode: "domain", maxNodes: 5 },
  });
  const domainGraph = messages[3].graph;
  assert.ok(domainGraph.nodes.find((node) => node.id === "example.com"));
  assert.ok(domainGraph.edges.find((edge) => edge.from === "example.com"));

  sendMessage(context, {
    type: "derive_graph",
    requestId: 4,
    payload: { session: domainSession, mode: "domain", maxNodes: 1 },
  });
  const limitedDomainGraph = messages[messages.length - 1].graph;
  assert.ok(limitedDomainGraph.nodes.length <= 1);

  const invalidEdgeSession = {
    nodes: {
      "https://valid.com/": { url: "https://valid.com/", activeMs: 5, visitCount: 1 },
    },
    edges: {
      "bad url -> https://valid.com/": {
        from: "bad url",
        to: "https://valid.com/",
        activeMs: 1,
        visitCount: 1,
      },
    },
  };
  sendMessage(context, {
    type: "derive_graph",
    requestId: 5,
    payload: { session: invalidEdgeSession, mode: "domain", maxNodes: 5 },
  });
  const invalidEdgeGraph = messages[messages.length - 1].graph;
  assert.equal(invalidEdgeGraph.edges.length, 0);

  const seedSession = {
    nodes: {},
    edges: {
      "https://alpha.com/ -> https://beta.com/": {
        from: "https://alpha.com/",
        to: "https://beta.com/",
        activeMs: 1,
      },
    },
  };
  sendMessage(context, {
    type: "derive_graph",
    requestId: 6,
    payload: { session: seedSession, mode: "page", maxNodes: 5 },
  });
  const seededGraph = messages[messages.length - 1].graph;
  assert.ok(seededGraph.nodes.find((node) => node.id === "https://alpha.com/"));
  assert.ok(seededGraph.nodes.find((node) => node.id === "https://beta.com/"));
});

test("summary-shared returns empty without session", () => {
  const { context } = loadWorker();
  const lines = context.IRHTSummaryShared.buildSummaryDataLinesShared({});
  assert.equal(lines.length, 0);
});

test("summary-shared uses defaults when helpers omitted", () => {
  const { context } = loadWorker();
  const lines = context.IRHTSummaryShared.buildSummaryDataLinesShared({
    session: { nodes: { "https://example.com/": { url: "https://example.com/" } } },
  });
  assert.ok(lines.includes("Mirror summary: Unavailable"));
  assert.ok(lines.includes("Mirror origin: Unavailable"));
  assert.ok(lines.includes("Pages touched: 1"));
});

test("summary-shared handles missing nodes", () => {
  const { context } = loadWorker();
  const lines = context.IRHTSummaryShared.buildSummaryDataLinesShared({
    session: { navigationCount: 0 },
  });
  assert.ok(lines.includes("Pages touched: 0"));
});

test("realtime worker graph filters and seed nodes", () => {
  const { context, messages } = loadWorker();
  const session = {
    nodes: {},
    edges: {
      "example.com -> other.com": {
        from: "example.com",
        to: "other.com",
        activeMs: 100,
        visitCount: 2,
      },
    },
  };
  sendMessage(context, {
    type: "derive_graph",
    requestId: 1,
    payload: {
      session,
      mode: "domain",
      maxNodes: 5,
      graphSettings: {
        nodeCap: 5,
        minNodeMinutes: 2,
        minEdgeCount: 3,
        search: "missing",
        hideIsolates: true,
      },
    },
  });
  const graph = messages[0].graph;
  assert.equal(graph.nodes.length, 0);
  assert.ok(graph.emptyReason);

  sendMessage(context, {
    type: "derive_graph",
    requestId: 2,
    payload: {
      session,
      mode: "domain",
      maxNodes: 5,
      graphSettings: {
        nodeCap: 5,
        minNodeMinutes: 0,
        minEdgeCount: 1,
        search: "example",
        hideIsolates: false,
      },
    },
  });
  const graph2 = messages[1].graph;
  assert.ok(graph2.nodes.find((node) => node.id === "example.com"));
});

test("realtime worker derives timeline and summary", () => {
  const { context, messages } = loadWorker();
  sendMessage(context, {
    type: "derive_timeline",
    requestId: 1,
    payload: { session: { events: [] }, tracking: null, isActiveSession: false },
  });
  assert.equal(messages[0].segments.length, 0);

  assert.equal(context.buildTimelinePayload({}).length, 0);
  assert.equal(
    context.buildTimelinePayload({ session: { events: [] }, tracking: {}, isActiveSession: false })
      .length,
    0,
  );
  assert.equal(
    context.buildTimelinePayload({ session: { events: [] }, tracking: null, isActiveSession: true })
      .length,
    0,
  );
  const payloadSegments = context.buildTimelinePayload({
    session: {
      events: [
        { ts: 5, type: "active_time_flushed", url: "https://a.com", durationMs: 5 },
      ],
      eventCursor: 1,
      eventCount: 1,
    },
    tracking: null,
    isActiveSession: false,
  });
  assert.equal(payloadSegments.length, 1);

  const ignored = context.buildTimelineSegments(
    { events: [{ ts: 1, type: "navigation", toUrl: "https://skip.com" }] },
    null,
    false,
  );
  assert.equal(ignored.length, 0);

  sendMessage(context, {
    type: "derive_timeline",
    requestId: 2,
    payload: {
      session: {
        events: [{ ts: 1, type: "active_time_flushed", url: "https://a.com", durationMs: 10 }],
        eventCursor: 0,
        eventCount: -1,
      },
      tracking: null,
      isActiveSession: false,
    },
  });
  assert.equal(messages[1].segments.length, 0);

  sendMessage(context, {
    type: "derive_timeline",
    requestId: 3,
    payload: {
      session: {
        events: [{ ts: 1, type: "active_time_flushed", url: "https://a.com", durationMs: 10 }, { ts: 2, type: "active_time_flushed", url: "https://a.com", durationMs: 10 }],
        eventCursor: 1,
        eventCount: 1,
      },
      tracking: null,
      isActiveSession: false,
    },
  });
  assert.equal(messages[2].segments.length, 1);

  const session = {
    id: "s1",
    startedAt: 1000,
    endedAt: 2000,
    _displayEndAt: 3000,
    navigationCount: 3,
    label: "Focused",
    labelDetail: "Deep work",
    categoryTotals: {
      Study: 7200000,
      Social: 120000,
      Random: 30000,
    },
    nodes: {
      "https://example.com/": { url: "https://example.com/", activeMs: 3600000 },
      "https://sample.com/": { url: "https://sample.com/", activeMs: 60000 },
    },
    events: [
      {
        ts: 1500,
        type: "active_time_flushed",
        url: "https://example.com/",
        durationMs: 1000,
      },
    ],
    eventCursor: 1,
    eventCount: 1,
    trapDoors: [{ url: "https://trap.com/", postVisitDurationMs: 1000, postVisitDepth: 2 }],
  };
  const tracking = { activeSince: 2500, activeUrl: "https://example.com/" };
  sendMessage(context, {
    type: "derive_timeline",
    requestId: 4,
    payload: { session, tracking, isActiveSession: true },
  });
  assert.ok(messages[3].segments.length >= 1);

  sendMessage(context, {
    type: "derive_summary",
    requestId: 5,
    payload: {
      session,
      tracking,
      mirrorSummary: "Mirror",
      mirrorOrigin: "Heuristic",
    },
  });
  const lines = messages[4].lines.join("\n");
  assert.ok(lines.includes("Range:"));
  assert.ok(lines.includes("Active time:"));
  assert.ok(lines.includes("Top categories"));
  assert.ok(lines.includes("Top domains"));
  assert.ok(lines.includes("Turning point"));

  sendMessage(context, {
    type: "derive_summary",
    requestId: 6,
    payload: {
      session: {
        startedAt: 1,
        nodes: { "https://example.com/": { url: "https://example.com/", activeMs: 1 } },
      },
      tracking: { activeUrl: "https://missing.com/", activeSince: 5 },
      mirrorSummary: "",
      mirrorOrigin: "",
    },
  });
  assert.ok(messages[5].lines.join("\n").includes("Active time:"));
});

test("realtime worker summary returns empty without shared helpers", () => {
  const { context, messages } = loadWorker();
  context.IRHTSummaryShared = null;
  sendMessage(context, {
    type: "derive_summary",
    requestId: 1,
    payload: { session: { nodes: {} } },
  });
  assert.equal(messages[0].lines.length, 0);
});

test("realtime worker buildSummaryPayload handles missing session", () => {
  const { context } = loadWorker();
  assert.equal(context.buildSummaryPayload({}).length, 0);
});

test("realtime worker buildSummaryPayload uses fallbacks", () => {
  const { context } = loadWorker();
  const sharedBackup = context.IRHTSummaryShared.buildSummaryDataLinesShared;
  let received = null;
  context.IRHTSummaryShared.buildSummaryDataLinesShared = (payload) => {
    received = payload;
    return ["ok"];
  };
  const lines = context.buildSummaryPayload({ session: { nodes: {} } });
  assert.equal(lines.length, 1);
  assert.equal(received.mirrorSummary, "Unavailable");
  assert.equal(received.mirrorOrigin, "Unavailable");
  assert.equal(received.tracking, null);
  assert.equal(Object.keys(received.categoryTotals).length, 0);
  assert.equal(received.trapDoor, undefined);
  context.IRHTSummaryShared.buildSummaryDataLinesShared = sharedBackup;
});

test("realtime worker buildSummaryPayload mirrors summary when provided", () => {
  const { context } = loadWorker();
  const sharedBackup = context.IRHTSummaryShared.buildSummaryDataLinesShared;
  const seen = [];
  context.IRHTSummaryShared.buildSummaryDataLinesShared = ({ mirrorSummary }) => {
    seen.push(mirrorSummary);
    return ["ok"];
  };
  context.buildSummaryPayload({ session: { nodes: {} }, mirrorSummary: "Mirror" });
  context.buildSummaryPayload({ session: { nodes: {} }, mirrorSummary: "" });
  assert.equal(seen[0], "Mirror");
  assert.equal(seen[1], "Unavailable");
  context.IRHTSummaryShared.buildSummaryDataLinesShared = sharedBackup;
});

test("realtime worker derives stats payload", () => {
  const { context, messages } = loadWorker();
  sendMessage(context, { type: "derive_stats", requestId: 1, payload: {} });
  assert.equal(messages[0].stats.topDomains.length, 0);

  const session = {
    id: "s1",
    startedAt: 1000,
    nodes: {
      "https://example.com/": {
        url: "https://example.com/",
        activeMs: 100,
        distractionScore: 2,
      },
      "https://example.com/next": {
        url: "https://example.com/next",
        activeMs: 50,
        distractionScore: 4,
      },
    },
    events: [
      { ts: 1, type: "navigation", fromUrl: "https://start.com", toUrl: "https://example.com/" },
      { ts: 2, type: "navigation", fromUrl: "https://example.com/", toUrl: "https://example.com/next" },
    ],
    eventCursor: 2,
    eventCount: 2,
    trapDoors: [{ url: "https://trap.com/", postVisitDurationMs: 10, postVisitDepth: 2 }],
  };
  const state = {
    sessions: {
      s1: session,
      s2: {
        id: "s2",
        nodes: { "https://example.com/": { url: "https://example.com/", activeMs: 1 } },
        events: [],
      },
    },
  };
  sendMessage(context, {
    type: "derive_stats",
    requestId: 2,
    payload: { session, state },
  });
  const stats = messages[1].stats;
  assert.equal(stats.chain.length, 3);
  assert.ok(stats.start.domain);
  assert.equal(stats.topDomains.length, 1);
  assert.equal(stats.topPages.length, 2);
  assert.equal(stats.topDistractions[0].url, "https://example.com/next");

  sendMessage(context, {
    type: "derive_stats",
    requestId: 3,
    payload: { session },
  });
  const statsFallback = messages[2].stats;
  assert.ok(Array.isArray(statsFallback.topDomains));

  const noTrapSession = {
    id: "s2",
    nodes: {},
    events: [],
  };
  sendMessage(context, {
    type: "derive_stats",
    requestId: 4,
    payload: { session: noTrapSession, state: {} },
  });
  assert.equal(messages[3].stats.trapDoor, null);
});

test("realtime worker start url and common start fallbacks", () => {
  const { context } = loadWorker();
  const urlChanged = context.findSessionStartUrl({
    events: [{ ts: 1, type: "URL_CHANGED", url: "https://changed.com/" }],
    nodes: {},
  });
  assert.equal(urlChanged, "https://changed.com/");

  const tabActive = context.findSessionStartUrl({
    events: [{ ts: 1, type: "TAB_ACTIVE", url: "https://tab.com/" }],
    nodes: {},
  });
  assert.equal(tabActive, "https://tab.com/");

  const missingUrl = context.findSessionStartUrl({
    events: [{ ts: 1, type: "URL_CHANGED" }],
    nodes: null,
  });
  assert.equal(missingUrl, null);

  const nodeFallback = context.findSessionStartUrl({
    events: [],
    nodes: {
      "https://first.com/": { url: "https://first.com/", firstSeen: 1 },
      "https://later.com/": { url: "https://later.com/", firstSeen: 10 },
    },
  });
  assert.equal(nodeFallback, "https://first.com/");

  const common = context.computeCommonStart({
    sessions: null,
  });
  assert.equal(common.domain, null);

  const commonFallback = context.computeCommonStart({
    sessions: {
      s1: {
        events: [],
        nodes: { bad: { url: "notaurl", firstSeen: 1 } },
      },
      s2: { deleted: true },
    },
  });
  assert.equal(commonFallback.domain, null);
});

test("realtime worker helper fallbacks", () => {
  const { context } = loadWorker();
  const topDomains = context.buildTopDomains({
    nodes: {
      bad: { url: "notaurl", activeMs: 5 },
      good: { url: "https://good.com", activeMs: 1 },
    },
  });
  assert.equal(topDomains.length, 1);
  assert.equal(topDomains[0].domain, "good.com");
  assert.equal(context.buildTopDomains({}).length, 0);
  const repeatedDomains = context.buildTopDomains({
    nodes: {
      a: { url: "https://same.com", activeMs: 2 },
      b: { url: "https://same.com/page", activeMs: 3 },
      c: { url: "https://same.com/other" },
    },
  });
  assert.equal(repeatedDomains[0].activeMs, 5);
  assert.equal(context.pickDominantCategory(null), "Random");
  assert.equal(context.getDomainForGraph("bad url"), "");
  assert.equal(context.getDomainForGraph(null), "");
  assert.equal(
    context.buildTopDistractions({ nodes: { a: { url: "https://a.com", activeMs: 0 } } }).length,
    0,
  );
  assert.equal(context.buildTopDistractions({}).length, 0);
  assert.equal(context.buildTopPages({}).length, 0);
  assert.equal(
    context.buildTopPages({ nodes: { c: { url: "https://c.com" } } })[0].activeMs,
    0,
  );
  assert.equal(
    context.getSessionActiveMs(
      { nodes: { "https://a.com": { activeMs: 100 }, "https://b.com": {} } },
      { activeSince: Date.now() - 1000, activeUrl: "https://a.com" },
    ) > 100,
    true,
  );
  assert.equal(
    context.getSessionActiveMs(
      { nodes: { "https://a.com": { activeMs: 100 } } },
      { activeSince: Date.now() - 1000, activeUrl: "https://missing.com" },
    ),
    100,
  );
  assert.equal(
    context.getSessionActiveMs(
      { nodes: null },
      { activeSince: Date.now() - 1000, activeUrl: "https://missing.com" },
    ),
    0,
  );
  const distractions = context.buildTopDistractions({
    nodes: { b: { url: "https://b.com", activeMs: 5 } },
  });
  assert.equal(distractions[0].distractionScore, 0);
  assert.equal(context.formatSessionRange({ startedAt: null, endedAt: null }), "- -> Active");
  assert.equal(
    context.formatSessionRange({ startedAt: 1000, endedAt: 2000, _displayEndAt: 3000 }).includes(
      " -> ",
    ),
    true,
  );
  assert.equal(context.truncate(null, 5), "");
  assert.equal(context.truncate("abcdef", 5), "ab...");
});

test("realtime worker filterGraphData handles isolates and caps", () => {
  const { context } = loadWorker();
  const empty = context.filterGraphData(null);
  assert.equal(empty.nodes.length, 0);
  const graph = {
    nodes: [
      { id: "a", activeMs: 5 },
      { id: "b", activeMs: 4 },
      { id: "c", activeMs: 3 },
    ],
    edges: [{ from: "a", to: "b", count: 1 }],
  };
  const filtered = context.filterGraphData(graph, {
    hideIsolates: true,
    nodeCap: 1,
    minEdgeCount: 1,
  });
  assert.ok(filtered.nodes.length <= 2);
  assert.ok(filtered.nodes.find((node) => node.id === "a"));

  const capGraph = {
    nodes: [
      { id: "x", activeMs: 0 },
      { id: "y", activeMs: 10 },
      { id: "z" },
    ],
    edges: [{ from: "x", to: "y", count: 0 }],
  };
  const capped = context.filterGraphData(capGraph, {
    nodeCap: 2,
    minEdgeCount: 1,
  });
  assert.ok(capped.nodes.length <= 2);
  assert.ok(capped.edges.length >= 1);
});

test("realtime worker coverage extras", () => {
  const { context } = loadWorker();

  assert.equal(context.buildTimelinePayload(null).length, 0);
  assert.equal(context.buildSummaryPayload(null).length, 0);

  assert.equal(context.getDomainForGraph("https://example.com/path"), "example.com");
  assert.equal(context.getDomainForGraph(123), "");
  assert.equal(context.getDomainForGraph("bad url"), "");

  const pageSeedSession = {
    nodes: {},
    edges: {
      "a -> b": { from: "alpha.com", to: "beta.com", activeMs: 1, visitCount: 2 },
    },
  };
  const pageSeedGraph = context.buildGraphData(pageSeedSession, "page", 2);
  assert.ok(pageSeedGraph.nodes.length >= 2);

  const pageSortGraph = context.buildGraphData(
    {
      nodes: {
        "https://a.com": { url: "https://a.com" },
        "https://b.com": { url: "https://b.com" },
        "https://c.com": { url: "https://c.com", activeMs: 5 },
      },
      edges: {},
    },
    "page",
    1,
  );
  assert.equal(pageSortGraph.nodes.length, 1);

  const seededSortGraph = context.buildGraphData(
    {
      nodes: {},
      edges: {
        "a -> b": { from: "https://a.com", to: "https://b.com" },
      },
    },
    "page",
    1,
  );
  assert.equal(seededSortGraph.nodes.length, 1);

  const seedBackup = context.seedNodesFromEdges;
  context.seedNodesFromEdges = () => [0];
  const seedFallbackGraph = context.buildGraphData(
    { nodes: {}, edges: { "a -> b": { from: "a", to: "b" } } },
    "page",
    5,
  );
  assert.equal(seedFallbackGraph.nodes.length, 0);
  context.seedNodesFromEdges = seedBackup;

  const emptyPageGraph = context.buildGraphData({ nodes: {}, edges: {} }, "page", 5);
  assert.equal(emptyPageGraph.nodes.length, 0);

  const missingCollectionsGraph = context.buildGraphData({}, "page", 5);
  assert.equal(missingCollectionsGraph.nodes.length, 0);

  const pageEdgeFallback = context.buildGraphData(
    {
      nodes: {
        "https://alpha.com/": { url: "https://alpha.com/" },
        "https://beta.com/": { url: "https://beta.com/" },
      },
      edges: {
        "alpha -> beta": {
          from: "https://alpha.com/",
          to: "https://beta.com/",
          activeMs: 0,
          visitCount: 0,
        },
      },
    },
    "page",
    5,
  );
  assert.equal(pageEdgeFallback.edges[0].activeMs, 0);
  assert.equal(pageEdgeFallback.edges[0].count, 1);

  const pageNodeFallbackGraph = context.buildGraphData(
    {
      nodes: (() => {
        const flippingNode = {};
        let idReads = 0;
        Object.defineProperty(flippingNode, "id", {
          get() {
            idReads += 1;
            return idReads === 1 ? "" : "https://flip.com";
          },
        });
        return {
          "key-only": {},
          "bad url": {},
          ignored: { id: "https://id.com" },
          "zero-value": 0,
          "": flippingNode,
        };
      })(),
      edges: {},
    },
    "page",
    10,
  );
  assert.ok(pageNodeFallbackGraph.nodes.find((node) => node.id === "key-only"));
  assert.ok(pageNodeFallbackGraph.nodes.find((node) => node.id === "bad url"));
  assert.ok(pageNodeFallbackGraph.nodes.find((node) => node.id === "https://id.com"));
  assert.ok(pageNodeFallbackGraph.nodes.find((node) => node.id === "https://flip.com"));

  const emptyIdGraph = context.buildGraphData(
    { nodes: { "": {} }, edges: {} },
    "page",
    5,
  );
  assert.equal(emptyIdGraph.nodes.length, 0);

  const emptyDomainGraph = context.buildGraphData({ nodes: {}, edges: {} }, "domain", 5);
  assert.equal(emptyDomainGraph.nodes.length, 0);

  const keyFallbackGraph = context.buildGraphData(
    { nodes: { "https://key.com": {}, ignored: { id: "https://id.com" }, "": {} }, edges: {} },
    "domain",
    5,
  );
  assert.ok(keyFallbackGraph.nodes.find((node) => node.id === "key.com"));
  assert.ok(keyFallbackGraph.nodes.find((node) => node.id === "id.com"));

  const domainSession = {
    nodes: {
      bad: { url: "bad url", activeMs: 1 },
      good: { url: "https://good.com", activeMs: 5, category: "Study", visitCount: 1 },
    },
    edges: {
      "good -> good2": {
        from: "https://good.com",
        to: "https://good2.com",
        activeMs: 1,
        visitCount: 1,
      },
      "same -> same": {
        from: "https://same.com",
        to: "https://same.com",
        activeMs: 1,
        visitCount: 1,
      },
    },
  };
  const domainGraph = context.buildGraphData(domainSession, "domain", 1);
  assert.ok(domainGraph.nodes.length <= 1);

  const aggregatedGraph = context.buildGraphData(
    {
      nodes: {
        a: { url: "https://alpha.com", activeMs: 5, category: "Study" },
        b: { url: "https://beta.com", activeMs: 3, category: "Video" },
      },
      edges: {
        "alpha -> beta 1": {
          from: "https://alpha.com",
          to: "https://beta.com",
          activeMs: 2,
          visitCount: 1,
        },
        "alpha -> beta 2": {
          from: "https://alpha.com",
          to: "https://beta.com",
          activeMs: 3,
          visitCount: 2,
        },
      },
    },
    "domain",
  );
  const aggregatedEdge = aggregatedGraph.edges.find(
    (edge) => edge.from === "alpha.com" && edge.to === "beta.com",
  );
  assert.equal(aggregatedEdge.activeMs, 5);
  assert.equal(aggregatedEdge.count, 3);

  const fallbackEdgeGraph = context.buildGraphData(
    {
      nodes: {},
      edges: {
        "alpha -> beta 3": {
          from: "https://alpha.com",
          to: "https://beta.com",
          activeMs: 0,
          visitCount: 0,
        },
      },
    },
    "domain",
  );
  const fallbackEdge = fallbackEdgeGraph.edges.find(
    (edge) => edge.from === "alpha.com" && edge.to === "beta.com",
  );
  assert.equal(fallbackEdge.activeMs, 0);
  assert.equal(fallbackEdge.count, 1);

  const trimmed = context.trimGraph(
    {
      nodes: [
        { id: "a", activeMs: 3 },
        { id: "b", activeMs: 2 },
        { id: "c", activeMs: 1 },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "a", to: "c" },
      ],
    },
    2,
  );
  assert.equal(trimmed.nodes.length, 2);
  assert.equal(trimmed.edges.length, 1);
  assert.equal(context.trimGraph({ nodes: [], edges: [] }, 5).nodes.length, 0);

  const filtered = context.filterGraphData(
    {
      nodes: [
        { id: "a", activeMs: 5, label: "Alpha" },
        { id: "b", activeMs: 1, label: "Beta" },
      ],
      edges: [{ from: "a", to: "b", count: 2 }],
    },
    { search: "alpha", minEdgeCount: 2, hideIsolates: true, nodeCap: 1 },
  );
  assert.equal(filtered.nodes.length, 0);
  assert.ok(filtered.emptyReason.length > 0);

  const fallbackFiltered = context.filterGraphData({ nodes: null, edges: null }, {});
  assert.equal(fallbackFiltered.nodes.length, 0);
  const searchFiltered = context.filterGraphData(
    {
      nodes: [
        { id: "s", label: "Alpha", domain: "example.com", url: "https://example.com" },
      ],
      edges: [],
    },
    { search: "example" },
  );
  assert.equal(searchFiltered.nodes.length, 1);
  const labelFiltered = context.filterGraphData(
    {
      nodes: [{ id: "l", label: "Example", domain: "nomatch", url: "" }],
      edges: [],
    },
    { search: "example" },
  );
  assert.equal(labelFiltered.nodes.length, 1);
  const urlFiltered = context.filterGraphData(
    {
      nodes: [{ id: "u", label: "Nomatch", domain: "nomatch", url: "https://example.com" }],
      edges: [],
    },
    { search: "example" },
  );
  assert.equal(urlFiltered.nodes.length, 1);
  const missingLabelFiltered = context.filterGraphData(
    {
      nodes: [{ id: "m", url: "https://example.com" }],
      edges: [],
    },
    { search: "example" },
  );
  assert.equal(missingLabelFiltered.nodes.length, 1);

  const segments = context.buildTimelineSegments(
    {
      events: [
        { ts: 10, type: "active_time_flushed", url: "https://a.com", durationMs: 5 },
        { ts: 12, type: "navigation", toUrl: "https://skip.com" },
      ],
      eventCursor: 0,
      eventCount: 0,
    },
    null,
    false,
  );
  assert.equal(segments.length, 1);

  const invalidSegments = context.buildTimelineSegments(
    {
      events: [{ ts: 10, type: "active_time_flushed", url: "notaurl", durationMs: 5 }],
      eventCursor: 0,
      eventCount: 0,
    },
    { activeSince: Date.now() - 1000, activeUrl: "notaurl" },
    true,
  );
  assert.ok(invalidSegments.some((segment) => segment.title === "notaurl"));

  const chain = context.computeDeepestChain({
    events: [
      { ts: 1, type: "navigation", fromUrl: "https://a.com", toUrl: "https://b.com" },
      { ts: 2, type: "navigation", fromUrl: "https://b.com", toUrl: "https://c.com" },
    ],
    eventCursor: 2,
    eventCount: 2,
  });
  assert.ok(chain.length >= 2);

  const common = context.computeCommonStart({
    sessions: {
      s1: { events: [{ ts: 1, type: "navigation", toUrl: "https://alpha.com" }], nodes: {} },
      s2: { events: [], nodes: {} },
    },
  });
  assert.equal(common.domain, "alpha.com");

  const startFromNodes = context.findSessionStartUrl({
    events: [],
    nodes: { a: { url: "https://start.com", firstSeen: 1 } },
  });
  assert.equal(startFromNodes, "https://start.com");

  const topDomains = context.buildTopDomains({
    nodes: { bad: { url: "bad url", activeMs: 3 } },
  });
  assert.equal(topDomains.length, 0);

  assert.equal(context.getDomain(null), "");
  assert.equal(context.truncate("short", 10), "short");
  assert.equal(context.truncate("longer text", 5), "lo...");
});

test("realtime worker branch coverage sweep", () => {
  const { context, messages } = loadWorker();

  sendMessage(context, { type: "derive_graph" });
  sendMessage(context, { requestId: 1 });
  assert.equal(messages.length, 0);

  sendMessage(context, {
    type: "derive_stats",
    requestId: 2,
    payload: { session: { nodes: {}, edges: {}, trapDoors: [] }, state: {} },
  });
  assert.ok(messages[0].stats);

  const session = {
    nodes: {
      a: { url: "https://alpha.com", activeMs: 5, category: "Study", visitCount: 1 },
      b: { url: "https://beta.com", activeMs: 3, category: "Video", visitCount: 1 },
      bad: { url: "bad url", activeMs: 1 },
    },
    edges: {
      "a -> b": { from: "https://alpha.com", to: "https://beta.com", activeMs: 2, visitCount: 2 },
      "b -> b": { from: "https://beta.com", to: "https://beta.com", activeMs: 1, visitCount: 1 },
    },
    events: [
      { ts: Date.now() - 2000, type: "active_time_flushed", url: "https://alpha.com", durationMs: 500 },
      { ts: Date.now() - 1000, type: "navigation", fromUrl: "https://alpha.com", toUrl: "https://beta.com" },
      { ts: Date.now() - 500, type: "TAB_ACTIVE", url: "https://beta.com" },
    ],
    trapDoors: [{ url: "https://trap.com" }],
  };

  const graphPayload = context.buildGraphPayload({
    session,
    mode: "domain",
    maxNodes: Number.NaN,
    graphSettings: {
      nodeCap: 1,
      minNodeMinutes: 1,
      minEdgeCount: 2,
      search: "alpha",
      hideIsolates: true,
    },
  });
  assert.ok(graphPayload.nodes.length <= 1);

  const timelineSegments = context.buildTimelinePayload({
    session,
    tracking: { activeSince: Date.now() - 1000, activeUrl: "https://live.com" },
    isActiveSession: true,
  });
  assert.ok(timelineSegments.length >= 1);

  const sharedBackup = context.IRHTSummaryShared;
  context.IRHTSummaryShared = null;
  assert.equal(context.buildSummaryPayload({ session }).length, 0);
  context.IRHTSummaryShared = sharedBackup;

  const statsEmpty = context.buildStatsPayload({});
  assert.equal(statsEmpty.topDomains.length, 0);

  assert.equal(context.getDomainForGraph("example.com"), "example.com");
  assert.equal(context.getDomainForGraph("https://alpha.com"), "alpha.com");

  const pageGraph = context.buildGraphData({ nodes: {}, edges: session.edges }, "page", 1);
  assert.ok(pageGraph.nodes.length >= 1);

  const domainGraph = context.buildGraphData(session, "domain", 1);
  assert.ok(domainGraph.nodes.length <= 1);

  const smallGraph = { nodes: [{ id: "a", activeMs: 1 }], edges: [] };
  assert.equal(context.trimGraph(smallGraph, 5), smallGraph);

  const filtered = context.filterGraphData(
    {
      nodes: [
        { id: "a", activeMs: 10, label: "Alpha", url: "https://alpha.com" },
        { id: "b", activeMs: 1, label: "Beta", url: "https://beta.com" },
      ],
      edges: [{ from: "a", to: "b", count: 2 }],
    },
    { minNodeMs: 5, search: "alpha", hideIsolates: true, nodeCap: 1 },
  );
  assert.ok(filtered.emptyReason.length >= 0);

  const activeSegments = context.buildTimelineSegments(
    {
      events: [{ ts: 10, type: "active_time_flushed", url: "https://a.com", durationMs: 0 }],
      eventCursor: 0,
      eventCount: 0,
    },
    { activeSince: Date.now() - 1000, activeUrl: "https://a.com" },
    true,
  );
  assert.ok(Array.isArray(activeSegments));

  const emptyChain = context.computeDeepestChain({ events: [] });
  assert.equal(emptyChain.length, 0);

  const common = context.computeCommonStart({
    sessions: {
      s1: { events: [{ ts: 1, type: "navigation", toUrl: "https://alpha.com" }], nodes: {} },
      s2: { events: [], nodes: {}, deleted: true },
    },
  });
  assert.equal(common.domain, "alpha.com");

  const startUrl = context.findSessionStartUrl({
    events: [{ ts: 1, type: "URL_CHANGED", url: "https://start.com" }],
    nodes: {},
  });
  assert.equal(startUrl, "https://start.com");
  assert.equal(context.findSessionStartUrl({ events: [], nodes: {} }), null);

  const activeMs = context.getSessionActiveMs(
    { nodes: { "https://alpha.com": { activeMs: 100 } } },
    { activeSince: Date.now() - 1000, activeUrl: "https://alpha.com" },
  );
  assert.ok(activeMs >= 100);

  assert.equal(context.buildTopDomains({ nodes: { bad: { url: "bad url" } } }).length, 0);
  assert.equal(context.buildTopPages({ nodes: {} }).length, 0);
  assert.equal(context.buildTopDistractions({ nodes: { a: { url: "https://a.com", activeMs: 0 } } }).length, 0);

  assert.equal(context.getDomain("bad url"), "");
  assert.equal(context.truncate(null, 5), "");
});
