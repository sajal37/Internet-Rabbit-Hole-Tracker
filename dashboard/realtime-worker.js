self.onmessage = (event) => {
  const payload = event.data || {};
  const { type, requestId } = payload;
  if (!type || !requestId) {
    return;
  }
  if (type === "derive_graph") {
    const graph = buildGraphPayload(payload.payload);
    postMessage({ requestId, graph });
    return;
  }
  if (type === "derive_timeline") {
    const segments = buildTimelinePayload(payload.payload);
    postMessage({ requestId, segments });
    return;
  }
  if (type === "derive_summary") {
    const lines = buildSummaryPayload(payload.payload);
    postMessage({ requestId, lines });
    return;
  }
  if (type === "derive_stats") {
    const stats = buildStatsPayload(payload.payload);
    postMessage({ requestId, stats });
  }
};

function buildGraphPayload(input) {
  if (!input || !input.session) {
    return { nodes: [], edges: [] };
  }
  const session = input.session;
  const mode = input.mode === "page" ? "page" : "domain";
  const cap = Number.isFinite(input.maxNodes) ? input.maxNodes : 80;
  const graphSettings = input.graphSettings || {};
  const graph = buildGraphData(session, mode, cap);
  const trimmed = trimGraph(graph, cap);
  return filterGraphData(trimmed, {
    nodeCap: Number.isFinite(graphSettings.nodeCap)
      ? graphSettings.nodeCap
      : cap,
    minNodeMs: (graphSettings.minNodeMinutes || 0) * 60 * 1000,
    minEdgeCount: graphSettings.minEdgeCount || 1,
    search: graphSettings.search || "",
    hideIsolates: !!graphSettings.hideIsolates,
  });
}

function buildTimelinePayload(input) {
  if (!input || !input.session) {
    return [];
  }
  const segments = buildTimelineSegments(
    input.session,
    input.tracking || null,
    !!input.isActiveSession,
  );
  return segments;
}

function buildSummaryPayload(input) {
  if (!input || !input.session) {
    return [];
  }
  const session = input.session;
  const tracking = input.tracking || null;
  const mirrorSummary = input.mirrorSummary || "Unavailable";
  const mirrorOrigin = input.mirrorOrigin || "Unavailable";
  const categoryTotals = session.categoryTotals || {};
  const topDomains = buildTopDomains(session).slice(0, 5);
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
    mirrorSummary,
    mirrorOrigin,
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

function buildStatsPayload(input) {
  if (!input || !input.session) {
    return {
      chain: { length: 0, label: "" },
      start: { domain: null, detail: "" },
      trapDoor: null,
      topDomains: [],
      topPages: [],
      topDistractions: [],
    };
  }
  const session = input.session;
  const state = input.state || {};
  return {
    chain: computeDeepestChain(session),
    start: computeCommonStart(state),
    trapDoor: (session.trapDoors || [])[0] || null,
    topDomains: buildTopDomains(session),
    topPages: buildTopPages(session),
    topDistractions: buildTopDistractions(session),
  };
}

function getDomainForGraph(url) {
  const direct = getDomain(url);
  if (direct) {
    return direct;
  }
  if (!url || typeof url !== "string") {
    return "";
  }
  try {
    return new URL(`https://${url}`).hostname.replace(/^www\./, "");
  } catch (error) {
    return "";
  }
}

function seedNodesFromEdges(edges) {
  const nodes = new Map();
  edges.forEach((edge) => {
    if (edge.from && !nodes.has(edge.from)) {
      nodes.set(edge.from, {
        id: edge.from,
        url: edge.from,
        title: edge.from,
        category: "Random",
        activeMs: 0,
        visitCount: 0,
      });
    }
    if (edge.to && !nodes.has(edge.to)) {
      nodes.set(edge.to, {
        id: edge.to,
        url: edge.to,
        title: edge.to,
        category: "Random",
        activeMs: 0,
        visitCount: 0,
      });
    }
  });
  return Array.from(nodes.values());
}

function buildGraphData(session, mode, maxNodes) {
  const nodeEntries = Object.entries(session.nodes || {});
  const nodeValues = nodeEntries.map(([key, value]) => ({
    key,
    value,
  }));
  const edgeValues = Object.values(session.edges || {});
  if (mode === "page") {
    const allNodes = nodeValues.length
      ? nodeValues
      : edgeValues.length
        ? seedNodesFromEdges(edgeValues)
        : [];
    const limited =
      maxNodes && allNodes.length > maxNodes
        ? [...allNodes]
            .sort(
              (a, b) =>
                (b.value?.activeMs ?? b.activeMs ?? 0) -
                (a.value?.activeMs ?? a.activeMs ?? 0),
            )
            .slice(0, maxNodes)
        : allNodes;
    const nodes = limited
      .map((entry) => {
        const node = entry.value || entry || {};
        const key = entry.key || "";
        const url = node.url || node.id || key || "";
        return {
          id: url || node.id || "",
          label: node.title || url || key || "",
          url,
          domain: getDomainForGraph(url) || "",
          category: node.category || "Random",
          activeMs: node.activeMs || 0,
          visitCount: node.visitCount || 0,
        };
    })
      .filter((node) => node.id);
    const keep = new Set(nodes.map((node) => node.id));
    const edges = edgeValues
      .filter((edge) => keep.has(edge.from) && keep.has(edge.to))
      .map((edge) => ({
        from: edge.from,
        to: edge.to,
        count: edge.visitCount || 1,
        activeMs: edge.activeMs || 0,
      }));
    return { nodes, edges };
  }

  const domainMap = new Map();
  const sourceNodes = nodeValues.length
    ? nodeValues
    : edgeValues.length
      ? seedNodesFromEdges(edgeValues)
      : [];
  sourceNodes.forEach((entry) => {
    const node = entry.value || entry;
    const key = entry.key || "";
    const url = node.url || node.id || key || "";
    const domain = getDomainForGraph(url);
    if (!domain) {
      return;
    }
    const existing = domainMap.get(domain) || {
      id: domain,
      label: domain,
      domain,
      activeMs: 0,
      visitCount: 0,
      categoryTotals: {},
    };
    existing.activeMs += node.activeMs || 0;
    existing.visitCount += node.visitCount || 0;
    const category = node.category || "Random";
    existing.categoryTotals[category] =
      (existing.categoryTotals[category] || 0) + (node.activeMs || 0);
    domainMap.set(domain, existing);
  });

  const edgeMap = new Map();
  edgeValues.forEach((edge) => {
    const fromDomain = getDomainForGraph(edge.from);
    const toDomain = getDomainForGraph(edge.to);
    if (!fromDomain || !toDomain) {
      return;
    }
    const id = `${fromDomain} -> ${toDomain}`;
    const existing = edgeMap.get(id) || {
      id,
      from: fromDomain,
      to: toDomain,
      activeMs: 0,
      count: 0,
    };
    existing.activeMs += edge.activeMs || 0;
    existing.count += edge.visitCount || 1;
    edgeMap.set(id, existing);
  });

  let nodes = Array.from(domainMap.values());
  nodes = nodes.map((node) => ({
    ...node,
    category: pickDominantCategory(node.categoryTotals),
  }));
  let keep = null;
  if (maxNodes && nodes.length > maxNodes) {
    nodes.sort((a, b) => b.activeMs - a.activeMs);
    nodes = nodes.slice(0, maxNodes);
    keep = new Set(nodes.map((node) => node.id));
  }
  const edges = Array.from(edgeMap.values()).filter((edge) =>
    keep ? keep.has(edge.from) && keep.has(edge.to) : true,
  );
  return { nodes, edges };
}

function pickDominantCategory(categoryTotals) {
  if (!categoryTotals) {
    return "Random";
  }
  let best = "Random";
  let bestValue = -1;
  Object.entries(categoryTotals).forEach(([category, value]) => {
    if (value > bestValue) {
      best = category;
      bestValue = value;
    }
  });
  return best;
}

function trimGraph(graph, maxNodes) {
  if (!graph.nodes.length || graph.nodes.length <= maxNodes) {
    return graph;
  }
  const sorted = [...graph.nodes].sort((a, b) => b.activeMs - a.activeMs);
  const keep = new Set(sorted.slice(0, maxNodes).map((node) => node.id));
  const nodes = sorted.filter((node) => keep.has(node.id));
  const edges = graph.edges.filter(
    (edge) => keep.has(edge.from) && keep.has(edge.to),
  );
  return { nodes, edges };
}

function filterGraphData(graph, settings = {}) {
  if (!graph) {
    return { nodes: [], edges: [] };
  }
  const minNodeMs = settings.minNodeMs || 0;
  const minEdgeCount = settings.minEdgeCount || 1;
  const search = (settings.search || "").toLowerCase();
  let nodes = graph.nodes || [];
  let edges = graph.edges || [];

  if (minNodeMs > 0) {
    nodes = nodes.filter((node) => (node.activeMs || 0) >= minNodeMs);
  }
  if (search) {
    nodes = nodes.filter((node) => {
      const label = (node.label || "").toLowerCase();
      const domain = (node.domain || "").toLowerCase();
      const url = (node.url || "").toLowerCase();
      return (
        label.includes(search) || domain.includes(search) || url.includes(search)
      );
    });
  }

  const keepIds = new Set(nodes.map((node) => node.id));
  edges = edges.filter(
    (edge) =>
      keepIds.has(edge.from) &&
      keepIds.has(edge.to) &&
      (edge.count || 1) >= minEdgeCount,
  );

  if (settings.hideIsolates) {
    const connected = new Set();
    edges.forEach((edge) => {
      connected.add(edge.from);
      connected.add(edge.to);
    });
    nodes = nodes.filter((node) => connected.has(node.id));
  }

  const cap = settings.nodeCap || 80;
  if (cap && nodes.length > cap) {
    nodes = [...nodes]
      .sort((a, b) => (b.activeMs || 0) - (a.activeMs || 0))
      .slice(0, cap);
    const capKeep = new Set(nodes.map((node) => node.id));
    edges = edges.filter(
      (edge) => capKeep.has(edge.from) && capKeep.has(edge.to),
    );
  }

  const emptyReason =
    !nodes.length && (minNodeMs > 0 || search || settings.hideIsolates)
      ? "No nodes match the current filters."
      : "";

  return { nodes, edges, emptyReason };
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

function computeDeepestChain(session) {
  const events = getSessionEvents(session)
    .filter((event) => event.type === "navigation" && event.toUrl)
    .sort((a, b) => a.ts - b.ts);

  let current = [];
  let maxChain = [];
  let lastUrl = null;

  events.forEach((event) => {
    if (lastUrl && event.fromUrl === lastUrl) {
      current.push(event.toUrl);
    } else {
      current = [];
      if (event.fromUrl) {
        current.push(event.fromUrl);
      }
      current.push(event.toUrl);
    }
    lastUrl = event.toUrl;
    if (current.length > maxChain.length) {
      maxChain = [...current];
    }
  });

  return {
    length: maxChain.length,
    label: maxChain.length
      ? `${truncate(maxChain[0], 32)} -> ${truncate(
          maxChain[maxChain.length - 1],
          32,
        )}`
      : "",
  };
}

function computeCommonStart(state) {
  if (!state || !state.sessions) {
    return { domain: null, detail: "" };
  }
  const counts = new Map();
  Object.values(state.sessions).forEach((session) => {
    if (!session || session.deleted) {
      return;
    }
    const url = findSessionStartUrl(session);
    const domain = getDomain(url);
    if (!domain) {
      return;
    }
    counts.set(domain, (counts.get(domain) || 0) + 1);
  });
  let topDomain = null;
  let topCount = 0;
  counts.forEach((count, domain) => {
    if (count > topCount) {
      topCount = count;
      topDomain = domain;
    }
  });
  return {
    domain: topDomain,
    detail: topDomain ? `Across ${topCount} sessions` : "",
  };
}

function findSessionStartUrl(session) {
  return globalThis.IRHTShared?.findSessionStartUrl
    ? globalThis.IRHTShared.findSessionStartUrl(session)
    : null;
}

function getSessionActiveMs(session, tracking) {
  return globalThis.IRHTShared?.getSessionActiveMs
    ? globalThis.IRHTShared.getSessionActiveMs(session, tracking, {
        preferMetrics: false,
      })
    : 0;
}

function buildTopDomains(session) {
  return globalThis.IRHTShared?.buildTopDomains
    ? globalThis.IRHTShared.buildTopDomains(session)
    : [];
}

function buildTopPages(session) {
  return Object.values(session.nodes || {})
    .map((node) => ({
      url: node.url,
      activeMs: node.activeMs || 0,
    }))
    .sort((a, b) => b.activeMs - a.activeMs);
}

function buildTopDistractions(session) {
  return Object.values(session.nodes || {})
    .map((node) => ({
      url: node.url,
      activeMs: node.activeMs || 0,
      distractionScore: node.distractionScore || 0,
    }))
    .filter((node) => node.activeMs > 0)
    .sort((a, b) => b.distractionScore - a.distractionScore);
}

function formatSessionRange(session) {
  const start = session.startedAt ? formatDate(session.startedAt) : "-";
  const endAt =
    session._displayEndAt !== undefined ? session._displayEndAt : session.endedAt;
  const end = endAt ? formatDate(endAt) : "Active";
  return `${start} -> ${end}`;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function formatDuration(ms) {
  return globalThis.IRHTShared?.formatDuration
    ? globalThis.IRHTShared.formatDuration(ms)
    : `${Math.max(0, Math.floor(ms / 1000))}s`;
}

function getDomain(url) {
  return globalThis.IRHTShared?.getDomain
    ? globalThis.IRHTShared.getDomain(url)
    : null;
}

function truncate(value, max) {
  if (!value || typeof value !== "string") {
    return "";
  }
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, Math.max(0, max - 3))}...`;
}
self.importScripts && self.importScripts("../shared.js", "summary-shared.js");
