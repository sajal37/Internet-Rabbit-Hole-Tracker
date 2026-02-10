(() => {
  const MAX_INSIGHTS = 2;
  const DEFAULT_TONE = "neutral";
  const IS_TEST =
    typeof globalThis !== "undefined" && globalThis.__IRHT_TEST__ === true;

  const COPY = {
    neutral: {
      summaryEmpty: "No session yet.",
      summaryStarting: "Just started. Not enough data yet.",
      summaryFocus: "Steady focus on one thread.",
      summaryWander: "Quick hops without settling.",
      summaryLoop: "Repeated visits to the same places.",
      summaryLoopWander: "Looping and hopping in the same stretch.",
      summaryLateNight: "Late-night browsing loosened the pace.",
      summaryMixed: "Mixed pace with some focus and drift.",
      originMissing: "No clear origin yet.",
      originShort: "Not enough time yet to name a pattern.",
      insightFocus: "Focus streak: long dwell on one thread.",
      insightWander: "Quick switches: many short hops.",
      insightLoop: "Repeat loop: revisited the same sites.",
      insightLateNight: "Late-night bias: attention softened.",
      insightFeed: "Feed-like pace: steady scrolling.",
      insightShort: "Too short to label yet.",
      insightMixed: "Mixed rhythm: focus plus drift.",
    },
    direct: {
      summaryEmpty: "No session yet.",
      summaryStarting: "Just started. Not enough data yet.",
      summaryFocus: "Steady focus on one thread.",
      summaryWander: "Quick hops without settling.",
      summaryLoop: "Repeated visits to the same places.",
      summaryLoopWander: "Looping and hopping in the same stretch.",
      summaryLateNight: "Late-night browsing loosened the pace.",
      summaryMixed: "Mixed pace with some focus and drift.",
      originMissing: "No clear origin yet.",
      originShort: "Not enough time yet to name a pattern.",
      insightFocus: "Focus streak: long dwell on one thread.",
      insightWander: "Quick switches: many short hops.",
      insightLoop: "Repeat loop: revisited the same sites.",
      insightLateNight: "Late-night bias: attention softened.",
      insightFeed: "Feed-like pace: steady scrolling.",
      insightShort: "Too short to label yet.",
      insightMixed: "Mixed rhythm: focus plus drift.",
    },
  };

  function resolveTone(tone) {
    return tone === "direct" ? "direct" : DEFAULT_TONE;
  }

  function formatDuration(ms) {
    return globalThis.IRHTShared?.formatDuration
      ? globalThis.IRHTShared.formatDuration(ms)
      : `${Math.max(0, Math.floor(ms / 1000))}s`;
  }

  function analyzeSession(session, tracking) {
    const nodes = Object.values(session?.nodes || {});
    const totalActiveMs = getSessionActiveMs(session, tracking);
    const totalPages = nodes.length;
    const totalMinutes = totalActiveMs / 60000;
    const navCount = session?.navigationCount || 0;
    const avgActiveMs = totalPages ? totalActiveMs / totalPages : 0;
    const maxNodeMs = nodes.reduce(
      (max, node) => Math.max(max, node.activeMs || 0),
      0,
    );
    const topShare = totalActiveMs > 0 ? maxNodeMs / totalActiveMs : 0;
    const revisitCount = nodes.filter(
      (node) => (node.visitCount || 0) > 1,
    ).length;
    const revisitShare = totalPages ? revisitCount / totalPages : 0;
    const hopRate = totalMinutes > 0 ? navCount / totalMinutes : 0;
    const shortSession = totalActiveMs < 90 * 1000;
    const focus = topShare >= 0.6 && avgActiveMs >= 120000 && hopRate <= 1.5;
    const wandering = (avgActiveMs > 0 && avgActiveMs <= 45000) || hopRate >= 3;
    const looping = revisitShare >= 0.35 && totalPages >= 4;
    const feedLike =
      (avgActiveMs > 0 &&
        avgActiveMs < 40000 &&
        navCount >= totalPages * 1.3) ||
      hopRate >= 4;
    const lateNight = isLateNight(
      session?.firstActivityAt || session?.startedAt,
    );
    return {
      totalActiveMs,
      totalPages,
      navCount,
      avgActiveMs,
      topShare,
      revisitShare,
      hopRate,
      shortSession,
      focus,
      wandering,
      looping,
      feedLike,
      lateNight,
    };
  }

  function getDomain(url) {
    return globalThis.IRHTShared?.getDomain
      ? globalThis.IRHTShared.getDomain(url)
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

  function findSessionStartUrl(session) {
    return globalThis.IRHTShared?.findSessionStartUrl
      ? globalThis.IRHTShared.findSessionStartUrl(session)
      : null;
  }

  function isLateNight(timestamp) {
    return globalThis.IRHTShared?.isLateNight
      ? globalThis.IRHTShared.isLateNight(timestamp)
      : false;
  }

  function collectSessions(state) {
    if (!state || !Array.isArray(state.sessionOrder)) {
      return [];
    }
    return state.sessionOrder
      .map((id) => state.sessions?.[id])
      .filter((session) => session && !session.deleted);
  }

  function computeDriftMinutes(session) {
    const trap = (session?.trapDoors || [])[0];
    if (!trap || !trap.url) {
      return null;
    }
    const events = (session?.events || []).slice().sort((a, b) => a.ts - b.ts);
    const trapUrl = trap.url;
    let triggerTs = null;
    for (const event of events) {
      if (event.toUrl === trapUrl || event.url === trapUrl) {
        triggerTs = event.ts;
        break;
      }
    }
    if (!triggerTs) {
      const node = session?.nodes?.[trapUrl];
      triggerTs = node?.firstSeen || null;
    }
    const startTs =
      session?.firstActivityAt || session?.startedAt || events[0]?.ts || null;
    if (!startTs || !triggerTs) {
      return null;
    }
    const delta = triggerTs - startTs;
    if (!Number.isFinite(delta) || delta <= 0) {
      return null;
    }
    return Math.round(delta / 60000);
  }

  function median(values) {
    if (!values.length) {
      return null;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }
    return sorted[mid];
  }

  function computeDomainRepetition(state, domain, limit = 8) {
    if (!domain) {
      return { count: 0, total: 0 };
    }
    const sessions = collectSessions(state).slice(-limit);
    let count = 0;
    sessions.forEach((session) => {
      const topDomain = buildTopDomains(session)[0]?.domain;
      if (topDomain === domain) {
        count += 1;
      }
    });
    return { count, total: sessions.length };
  }

  function computeLateNightCount(state, limit = 8) {
    const sessions = collectSessions(state).slice(-limit);
    let count = 0;
    sessions.forEach((session) => {
      if (isLateNight(session.firstActivityAt || session.startedAt)) {
        count += 1;
      }
    });
    return { count, total: sessions.length };
  }

  function computeTypicalDrift(state, limit = 10) {
    const sessions = collectSessions(state).slice(-limit);
    const driftMinutes = sessions
      .map((session) => computeDriftMinutes(session))
      .filter((value) => Number.isFinite(value));
    return {
      minutes: median(driftMinutes),
      sampleCount: driftMinutes.length,
    };
  }

  function buildSessionMirror(session, state, options = {}) {
    const tone = resolveTone(options.tone);
    const copy = COPY[tone];
    if (!session || !Object.keys(session.nodes || {}).length) {
      return {
        summary: copy.summaryEmpty,
        origin: copy.originMissing,
      };
    }

    const analysis = analyzeSession(
      session,
      options.tracking || state?.tracking,
    );
    let summary = copy.summaryMixed;
    if (analysis.shortSession) {
      return { summary: copy.summaryStarting, origin: copy.originShort };
    }
    if (analysis.focus) {
      summary = copy.summaryFocus;
    } else if (analysis.wandering && analysis.looping) {
      summary = copy.summaryLoopWander;
    } else if (analysis.wandering) {
      summary = copy.summaryWander;
    } else if (analysis.looping) {
      summary = copy.summaryLoop;
    } else if (analysis.lateNight) {
      summary = copy.summaryLateNight;
    }

    const reasons =
      IS_TEST && Array.isArray(options.testReasonCandidates)
        ? options.testReasonCandidates
        : buildReasonCandidates(analysis, copy);
    const origin = reasons.length ? reasons[0].text : copy.originMissing;
    return { summary, origin };
  }

  function buildReasonCandidates(analysis, copy) {
    const candidates = [];
    if (analysis.shortSession) {
      candidates.push({ id: "short", text: copy.insightShort, score: 90 });
      return candidates;
    }
    if (analysis.focus) {
      candidates.push({ id: "focus", text: copy.insightFocus, score: 80 });
    }
    if (analysis.feedLike) {
      candidates.push({ id: "feed", text: copy.insightFeed, score: 75 });
    }
    if (analysis.wandering) {
      candidates.push({ id: "wander", text: copy.insightWander, score: 70 });
    }
    if (analysis.looping) {
      candidates.push({ id: "loop", text: copy.insightLoop, score: 65 });
    }
    if (analysis.lateNight) {
      candidates.push({ id: "late", text: copy.insightLateNight, score: 55 });
    }
    if (!candidates.length) {
      candidates.push({ id: "mixed", text: copy.insightMixed, score: 10 });
    }
    return candidates;
  }

  function generateInsights(session, state, options = {}) {
    if (!session || !Object.keys(session.nodes || {}).length) {
      return [];
    }
    const tone = resolveTone(options.tone);
    const copy = COPY[tone];
    const analysis = analyzeSession(
      session,
      options.tracking || state?.tracking,
    );
    const candidates =
      IS_TEST && Array.isArray(options.testCandidates)
        ? options.testCandidates
        : buildReasonCandidates(analysis, copy);
    return candidates
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.id.localeCompare(b.id);
      })
      .slice(0, MAX_INSIGHTS);
  }

  globalThis.IRHTInsights = {
    buildSessionMirror,
    generateInsights,
    resolveTone,
  };

  if (IS_TEST) {
    globalThis.__IRHT_TEST_HOOKS__ = globalThis.__IRHT_TEST_HOOKS__ || {};
    globalThis.__IRHT_TEST_HOOKS__.insights = {
      MAX_INSIGHTS,
      resolveTone,
      formatDuration,
      analyzeSession,
      getDomain,
      getSessionActiveMs,
      buildTopDomains,
      findSessionStartUrl,
      isLateNight,
      collectSessions,
      computeDriftMinutes,
      median,
      computeDomainRepetition,
      computeLateNightCount,
      computeTypicalDrift,
      buildSessionMirror,
      buildReasonCandidates,
      generateInsights,
    };
  }
})();
