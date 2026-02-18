(() => {
  const DEFAULT_ACTIVE_WEIGHT_CAP = 1.6;
  const DEFAULT_LATE_NIGHT_WEIGHT = 0.6;
  const DEFAULT_ACTIVE_WEIGHT_DIVISOR = 1.45;
  const DEFAULT_DISTRACTION_MAX = 5;
  const FOCUSED_MAX = 34;
  const MIXED_MAX = 69;
  const PRODUCTIVE_WEIGHT = 0.7;
  const DISTRACTING_WEIGHT = 1.2;
  const IS_TEST =
    typeof globalThis !== "undefined" && globalThis.__IRHT_TEST__ === true;

  function safeHostname(url) {
    if (!url) {
      return null;
    }
    try {
      return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    } catch (error) {
      return null;
    }
  }

  function isInternalUrl(url) {
    if (!url || typeof url !== "string") {
      return false;
    }
    return /^(chrome(-extension)?|about|edge|brave|moz-extension|extension):/i.test(url);
  }

  function getDomain(url) {
    return safeHostname(url);
  }

  function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }

  function matchesDomain(host, pattern) {
    if (!host || !pattern) {
      return false;
    }
    const normalized = pattern.replace(/^\*\./, "").toLowerCase();
    if (normalized.startsWith(".")) {
      return host.endsWith(normalized);
    }
    return host === normalized || host.endsWith(`.${normalized}`);
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
    if (!session || !Array.isArray(session.events) || !session.events.length) {
      return null;
    }
    if (typeof session.eventCursor !== "number" || session.eventCount === 0) {
      return session.events[session.events.length - 1] || null;
    }
    const length = session.events.length;
    const index = (session.eventCursor - 1 + length) % length;
    return session.events[index] || null;
  }

  function getSessionActiveMs(session, tracking = null, options = {}) {
    if (!session) {
      return 0;
    }
    const preferMetrics = options.preferMetrics !== false;
    let totalActiveMs = 0;
    if (
      preferMetrics &&
      session.metrics &&
      Number.isFinite(session.metrics.totalActiveMs)
    ) {
      totalActiveMs = session.metrics.totalActiveMs;
    } else {
      totalActiveMs = Object.values(session.nodes || {}).reduce(
        (sum, node) => sum + (node.activeMs || 0),
        0,
      );
    }
    if (
      tracking?.activeSince &&
      tracking.activeUrl &&
      session.nodes &&
      tracking.activeUrl in session.nodes
    ) {
      const live = Math.max(0, Date.now() - tracking.activeSince);
      return totalActiveMs + live;
    }
    return totalActiveMs;
  }

  function buildTopDomains(session) {
    if (!session || !session.nodes) {
      return [];
    }
    const totals = new Map();
    Object.values(session.nodes || {}).forEach((node) => {
      if (isInternalUrl(node.url)) {
        return;
      }
      const domain = getDomain(node.url);
      if (!domain) {
        return;
      }
      totals.set(domain, (totals.get(domain) || 0) + (node.activeMs || 0));
    });
    return Array.from(totals.entries())
      .map(([domain, activeMs]) => ({ domain, activeMs }))
      .sort((a, b) => b.activeMs - a.activeMs);
  }

  function findSessionStartUrl(session) {
    if (!session) {
      return null;
    }
    const events = getSessionEvents(session)
      .slice()
      .sort((a, b) => (a?.ts || 0) - (b?.ts || 0));
    for (const event of events) {
      if (event?.type === "navigation" && event.toUrl && !isInternalUrl(event.toUrl)) {
        return event.toUrl;
      }
      if (
        (event?.type === "TAB_ACTIVE" || event?.type === "URL_CHANGED") &&
        event.url && !isInternalUrl(event.url)
      ) {
        return event.url;
      }
    }
    const nodes = Object.values(session.nodes || {})
      .filter((n) => n.url && !isInternalUrl(n.url));
    if (!nodes.length) {
      return null;
    }
    nodes.sort((a, b) => (a.firstSeen || 0) - (b.firstSeen || 0));
    return nodes[0].url || null;
  }

  function isLateNight(timestamp, start = 23, end = 6) {
    if (!timestamp) {
      return false;
    }
    const hour = new Date(timestamp).getHours();
    return hour >= start || hour < end;
  }

  function matchHostToList(host, list, matcher = matchesDomain) {
    if (!host || !Array.isArray(list) || !list.length) {
      return false;
    }
    return list.some((pattern) => matcher(host, pattern));
  }

  function isTechnicalUrl(url) {
    if (!url) {
      return false;
    }
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();
      const query = parsed.searchParams;
      if (
        host.startsWith("accounts.") ||
        host.includes("login.") ||
        host.includes("auth.")
      ) {
        return true;
      }
      if (
        path.includes("/login") ||
        path.includes("/signin") ||
        path.includes("/sign-in") ||
        path.includes("/logout") ||
        path.includes("/auth") ||
        path.includes("/oauth") ||
        path.includes("/callback") ||
        path.includes("/redirect") ||
        path.includes("/consent") ||
        path.includes("/verify")
      ) {
        return true;
      }
      const redirectKeys = [
        "redirect",
        "redirect_uri",
        "return",
        "next",
        "continue",
      ];
      return redirectKeys.some((key) => query.has(key));
    } catch (error) {
      return false;
    }
  }

  function computeSessionSignals(session) {
    const metrics = session?.metrics;
    if (metrics && Number.isFinite(metrics.totalActiveMs)) {
      const nodes = Object.values(session?.nodes || {});
      const nodesCount = metrics.nodesCount || nodes.length;
      if (metrics.maxDirty) {
        metrics.maxNodeActiveMs = nodes.reduce(
          (max, node) => Math.max(max, node.activeMs || 0),
          0,
        );
        metrics.maxDirty = false;
      }
      const totalActiveMs = metrics.totalActiveMs || 0;
      const totalMinutes = totalActiveMs / 60000;
      const navCount = session?.navigationCount || 0;
      const avgDwellMs = nodesCount ? totalActiveMs / nodesCount : 0;
      const maxNodeMs = metrics.maxNodeActiveMs || 0;
      const topShare = totalActiveMs > 0 ? maxNodeMs / totalActiveMs : 0;
      const revisitCount = metrics.revisitCount || 0;
      const revisitShare = nodesCount ? revisitCount / nodesCount : 0;
      const hopRate = totalMinutes > 0 ? navCount / totalMinutes : 0;
      const feedLike =
        (avgDwellMs > 0 &&
          avgDwellMs < 40000 &&
          navCount >= nodesCount * 1.3) ||
        hopRate >= 4;
      return {
        totalActiveMs,
        totalMinutes,
        navCount,
        avgDwellMs,
        topShare,
        revisitShare,
        hopRate,
        feedLike,
      };
    }

    const nodes = Object.values(session?.nodes || {});
    const totalActiveMs = nodes.reduce(
      (sum, node) => sum + (node.activeMs || 0),
      0,
    );
    const totalMinutes = totalActiveMs / 60000;
    const navCount = session?.navigationCount || 0;
    const avgDwellMs = nodes.length ? totalActiveMs / nodes.length : 0;
    const maxNodeMs = nodes.reduce(
      (max, node) => Math.max(max, node.activeMs || 0),
      0,
    );
    const topShare = totalActiveMs > 0 ? maxNodeMs / totalActiveMs : 0;
    const revisitCount = nodes.filter(
      (node) => (node.visitCount || 0) > 1,
    ).length;
    const revisitShare = nodes.length ? revisitCount / nodes.length : 0;
    const hopRate = totalMinutes > 0 ? navCount / totalMinutes : 0;
    const feedLike =
      (avgDwellMs > 0 &&
        avgDwellMs < 40000 &&
        navCount >= nodes.length * 1.3) ||
      hopRate >= 4;
    return {
      totalActiveMs,
      totalMinutes,
      navCount,
      avgDwellMs,
      topShare,
      revisitShare,
      hopRate,
      feedLike,
    };
  }

  function resolveCategoryWithAI(url, fallbackCategory) {
    const hook = globalThis.IRHTAICategoryHook;
    if (typeof hook !== "function") {
      return null;
    }
    try {
      const proposed = hook(url, fallbackCategory);
      return typeof proposed === "string" && proposed.trim()
        ? proposed.trim()
        : null;
    } catch (error) {
      return null;
    }
  }

  function computeDistractionScore(node, session, options = {}) {
    const signals = options.signals || computeSessionSignals(session);
    const settings = options.settings || {};
    const categoryMultipliers = options.categoryMultipliers || {};
    const activeWeightCap =
      options.activeWeightCap ?? DEFAULT_ACTIVE_WEIGHT_CAP;
    const lateNightWeightValue =
      options.lateNightWeight ?? DEFAULT_LATE_NIGHT_WEIGHT;
    const weightDivisor =
      options.activeWeightDivisor ?? DEFAULT_ACTIVE_WEIGHT_DIVISOR;
    const isLateNight = options.isLateNight || (() => false);
    const matchDomain = options.matchDomain || matchesDomain;

    const activeMinutes = (node.activeMs || 0) / 60000;
    const baseActiveWeight = Math.min(
      activeWeightCap,
      Math.log1p(activeMinutes) / weightDivisor,
    );
    const category = node.category || "Random";
    const multiplier = categoryMultipliers[category] || 1.0;
    const activeTimeWeight = baseActiveWeight * multiplier;

    const navIndex =
      node.firstNavigationIndex === null ||
      node.firstNavigationIndex === undefined
        ? null
        : node.firstNavigationIndex;
    const navCount = session?.navigationCount || 0;
    const postDepth = navIndex === null ? 0 : Math.max(0, navCount - navIndex);
    const chainDepthWeight = navCount ? Math.min(1, postDepth / navCount) : 0;

    const lateNightWeight = isLateNight(node.firstSeen)
      ? lateNightWeightValue
      : 0;

    let intentWeight = 1;
    const dwellMs = node.activeMs || 0;
    const visitCount = node.visitCount || 0;
    const sustainedFocus = dwellMs >= 3 * 60 * 1000 && visitCount <= 2;
    const rapidHop = dwellMs > 0 && dwellMs <= 45000 && visitCount <= 1;
    const looping = visitCount >= 3 || signals.revisitShare >= 0.35;

    if (isTechnicalUrl(node.url)) {
      intentWeight *= 0.4;
    }
    if (sustainedFocus) {
      intentWeight *= 0.75;
    }
    if (signals.feedLike) {
      intentWeight *= 1.1;
    }
    if (rapidHop && signals.hopRate >= 3) {
      intentWeight *= 1.15;
    }
    if (looping) {
      intentWeight *= 1.1;
    }

    const host = safeHostname(node.url);
    if (matchHostToList(host, settings.productiveSites, matchDomain)) {
      intentWeight *= PRODUCTIVE_WEIGHT;
    }
    if (matchHostToList(host, settings.distractingSites, matchDomain)) {
      intentWeight *= DISTRACTING_WEIGHT;
    }

    const score =
      (activeTimeWeight + chainDepthWeight + lateNightWeight) * intentWeight;

    return {
      score,
      components: {
        activeTimeWeight,
        chainDepthWeight,
        lateNightWeight,
        category,
        intentWeight,
      },
    };
  }

  function normalizeDistractionScore(score, maxScore = DEFAULT_DISTRACTION_MAX) {
    if (!Number.isFinite(score)) {
      return 0;
    }
    const capped = Math.max(0, Math.min(maxScore, score));
    return Math.round((capped / maxScore) * 100);
  }

  function getDistractionLabel(normalizedScore) {
    if (!Number.isFinite(normalizedScore)) {
      return "Focused";
    }
    if (normalizedScore <= FOCUSED_MAX) {
      return "Focused";
    }
    if (normalizedScore <= MIXED_MAX) {
      return "Mixed";
    }
    return "Distracted";
  }

  function computeNormalizedEntropy(shares) {
    if (!Array.isArray(shares) || shares.length <= 1) {
      return 0;
    }
    const denominator = Math.log(shares.length);
    if (!Number.isFinite(denominator) || denominator === 0) {
      return 0;
    }
    return (
      -shares.reduce(
        (sum, share) => sum + (share > 0 ? share * Math.log(share) : 0),
        0,
      ) / denominator
    );
  }

  function getMaxShare(shares) {
    if (!Array.isArray(shares) || shares.length === 0) {
      return 0;
    }
    return Math.max(...shares);
  }

  function computeIntentDrift(session, signals, options = {}) {
    if (!session) {
      return {
        score: 0,
        label: "Unknown",
        reason: "Not enough data yet.",
        confidence: "low",
        drivers: [],
      };
    }
    const nodes = Object.values(session.nodes || {});
    const totalActiveMs =
      signals?.totalActiveMs ??
      nodes.reduce((sum, node) => sum + (node.activeMs || 0), 0);
    if (totalActiveMs < 2 * 60 * 1000 || nodes.length < 2) {
      return {
        score: 0,
        label: "Unknown",
        reason: "Not enough data yet.",
        confidence: "low",
        drivers: [],
      };
    }

    const matchDomain = options.matchDomain || matchesDomain;
    const settings = options.settings || {};
    const sensitivity = options.sensitivity || settings.intentDriftSensitivity || "balanced";

    const hopRate = signals?.hopRate ?? 0;
    const avgDwellMs = signals?.avgDwellMs ?? 0;
    const topShare = signals?.topShare ?? 0;
    const feedLike = !!signals?.feedLike;
    const revisitShare = signals?.revisitShare ?? 0;
    const navCount = signals?.navCount ?? session?.navigationCount ?? 0;

    const domainTotals = new Map();
    const categoryTotals = {};
    let shortDwellCount = 0;
    let ultraShortCount = 0;
    let technicalCount = 0;
    nodes.forEach((node) => {
      const activeMs = node.activeMs || 0;
      const host = safeHostname(node.url);
      if (host) {
        domainTotals.set(host, (domainTotals.get(host) || 0) + activeMs);
      }
      const category = node.category || "Random";
      categoryTotals[category] = (categoryTotals[category] || 0) + activeMs;
      if (activeMs > 0 && activeMs < 20000) {
        shortDwellCount += 1;
      }
      if (activeMs > 0 && activeMs < 10000) {
        ultraShortCount += 1;
      }
      if (isTechnicalUrl(node.url)) {
        technicalCount += 1;
      }
    });

    const domainActiveTotal = Array.from(domainTotals.values()).reduce(
      (sum, value) => sum + value,
      0,
    );
    const domainShares = Array.from(domainTotals.values()).map((value) =>
      domainActiveTotal > 0 ? value / domainActiveTotal : 0,
    );
    const domainEntropy = computeNormalizedEntropy(domainShares);
    const categoryActiveTotal = Object.values(categoryTotals).reduce(
      (sum, value) => sum + value,
      0,
    );
    const categoryShares = Object.values(categoryTotals).map((value) =>
      categoryActiveTotal > 0 ? value / categoryActiveTotal : 0,
    );
    const categoryEntropy = computeNormalizedEntropy(categoryShares);
    const dominantCategoryShare = getMaxShare(categoryShares);

    let crossDomainTransitions = 0;
    Object.values(session.edges || {}).forEach((edge) => {
      const fromDomain = safeHostname(edge.from);
      const toDomain = safeHostname(edge.to);
      if (!fromDomain || !toDomain || fromDomain === toDomain) {
        return;
      }
      crossDomainTransitions += edge.visitCount || 1;
    });
    const transitionShare = navCount > 0 ? crossDomainTransitions / navCount : 0;

    const nodeCount = Math.max(nodes.length, 1);
    const shortShare = shortDwellCount / nodeCount;
    const ultraShortShare = ultraShortCount / nodeCount;
    const technicalShare = technicalCount / nodeCount;

    const topDomain = (() => {
      let best = null;
      domainTotals.forEach((value, domain) => {
        if (!best || value > best.value) {
          best = { domain, value };
        }
      });
      return best;
    })();

    const alignsWithProductive =
      !!topDomain &&
      matchHostToList(topDomain.domain, settings.productiveSites, matchDomain);
    const alignsWithDistracting =
      !!topDomain &&
      matchHostToList(topDomain.domain, settings.distractingSites, matchDomain);

    const contributions = [];
    const addContribution = (value, label) => {
      if (value <= 0) {
        return;
      }
      contributions.push({ value, label });
    };

    const hopScore = Math.min(1, hopRate / 5) * 0.24;
    addContribution(hopScore, "Rapid switching between pages.");

    const shortScore = Math.min(1, shortShare / 0.6) * 0.2;
    addContribution(shortScore, "Many short page visits.");

    const ultraShortScore = Math.min(1, ultraShortShare / 0.35) * 0.1;
    addContribution(ultraShortScore, "Very short visits add up.");

    const entropyScore = domainEntropy * 0.18;
    addContribution(entropyScore, "Attention spread across many domains.");

    const categoryMixScore = categoryEntropy * 0.12;
    addContribution(categoryMixScore, "Categories are highly mixed.");

    const anchorScore = Math.min(1, (1 - topShare) / 0.6) * 0.14;
    addContribution(anchorScore, "No clear anchor page held attention.");

    const transitionScore = Math.min(1, transitionShare / 0.7) * 0.1;
    addContribution(transitionScore, "Frequent jumps between domains.");

    if (feedLike) {
      addContribution(0.08, "Feed-like scrolling detected.");
    }

    let score = contributions.reduce((sum, item) => sum + item.value, 0);

    const focusCut =
      topShare >= 0.6 && avgDwellMs >= 120000 && hopRate <= 1.5;
    if (focusCut) {
      score -= 0.32;
    }

    if (dominantCategoryShare >= 0.6) {
      score -= 0.15;
    }

    if (revisitShare >= 0.35 && hopRate < 2) {
      score -= 0.1;
    }

    if (technicalShare >= 0.4) {
      score -= 0.12;
    }

    if (alignsWithProductive) {
      score -= 0.1;
    }
    if (alignsWithDistracting) {
      score += 0.06;
    }

    if (sensitivity === "high") {
      score += 0.07;
    } else if (sensitivity === "low") {
      score -= 0.06;
    }

    score = Math.max(0, Math.min(1, score));

    let highThreshold = 0.7;
    let mediumThreshold = 0.4;
    if (sensitivity === "high") {
      highThreshold = 0.6;
      mediumThreshold = 0.32;
    } else if (sensitivity === "low") {
      highThreshold = 0.78;
      mediumThreshold = 0.48;
    }

    const label = score >= highThreshold ? "High" : score >= mediumThreshold ? "Medium" : "Low";

    let confidence = "low";
    if (totalActiveMs >= 8 * 60 * 1000 && nodes.length >= 6 && navCount >= 6) {
      confidence = "high";
    } else if (totalActiveMs >= 3 * 60 * 1000 && nodes.length >= 3) {
      confidence = "medium";
    }

    const drivers = contributions
      .filter((item) => item.value > 0.06)
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
      .map((item) => item.label);

    const reason = drivers[0] || "Stable browsing pattern.";

    return {
      score,
      label,
      reason,
      confidence,
      drivers,
    };
  }

  globalThis.IRHTShared = {
    computeDistractionScore,
    computeSessionSignals,
    isTechnicalUrl,
    isInternalUrl,
    matchesDomain,
    matchHostToList,
    resolveCategoryWithAI,
    normalizeDistractionScore,
    getDistractionLabel,
    formatDuration,
    getDomain,
    getSessionEvents,
    getLatestEvent,
    getSessionActiveMs,
    buildTopDomains,
    findSessionStartUrl,
    isLateNight,
    computeIntentDrift,
  };

  if (IS_TEST) {
    globalThis.__IRHT_TEST_HOOKS__ = globalThis.__IRHT_TEST_HOOKS__ || {};
    globalThis.__IRHT_TEST_HOOKS__.shared = {
      safeHostname,
      getDomain,
      formatDuration,
      matchesDomain,
      matchHostToList,
      isTechnicalUrl,
      isInternalUrl,
      resolveCategoryWithAI,
      computeNormalizedEntropy,
      getMaxShare,
      getSessionEvents,
      getLatestEvent,
      getSessionActiveMs,
      buildTopDomains,
      findSessionStartUrl,
      isLateNight,
      computeSessionSignals,
      computeDistractionScore,
      normalizeDistractionScore,
      getDistractionLabel,
      computeIntentDrift,
    };
  }
})();
