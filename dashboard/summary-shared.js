(() => {
  function buildSummaryDataLinesShared(options = {}) {
    const session = options.session;
    if (!session) {
      return [];
    }
    const tracking = options.tracking || null;
    const mirrorSummary = options.mirrorSummary || "Unavailable";
    const mirrorOrigin = options.mirrorOrigin || "Unavailable";
    const formatSessionRange = options.formatSessionRange || (() => "");
    const formatDuration = options.formatDuration || ((value) => String(value));
    const getSessionActiveMs = options.getSessionActiveMs || (() => 0);
    const getDomain = options.getDomain || (() => "");
    const truncate = options.truncate || ((value) => value);
    const topDomains = Array.isArray(options.topDomains) ? options.topDomains : [];
    const categoryTotals = options.categoryTotals || {};
    const trapDoor = options.trapDoor || null;

    const totalActiveMs = getSessionActiveMs(session, tracking);
    const isInternal = options.isInternalUrl || (() => false);
    const allNodeUrls = Object.values(session.nodes || {});
    const pageCount = allNodeUrls.filter((n) => !isInternal(n.url)).length || allNodeUrls.length;
    const navigationCount = session.navigationCount || 0;
    const sessionStartUrl = options.sessionStartUrl || "";
    const sessionStartDomain = options.sessionStartDomain || "";

    const lines = [
      `Range: ${formatSessionRange(session)}`,
      `Active time: ${formatDuration(totalActiveMs)}`,
      `Pages touched: ${pageCount}`,
      `Navigation events: ${navigationCount}`,
      `Label: ${session.label || "Unlabeled"}`,
      `Label detail: ${session.labelDetail || "None"}`,
      `Intent drift: ${session.intentDriftLabel || "Unknown"} (${session.intentDriftConfidence || "low"} confidence) - ${session.intentDriftReason || "Not enough data yet."}`,
      `Mirror summary: ${mirrorSummary}`,
      `Mirror origin: ${mirrorOrigin}`,
      `Session start: ${sessionStartUrl || "Unknown"}`,
      `Session start domain: ${sessionStartDomain || "Unknown"}`,
    ];

    const sortedTotals = Object.entries(categoryTotals)
      .filter((entry) => entry[1] > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    if (sortedTotals.length) {
      lines.push("[Top categories (optional, max 3)]");
      lines.push("");
      sortedTotals.forEach(([category, activeMs]) => {
        lines.push(`${category}: ${formatDuration(activeMs)}`);
      });
    }

    if (topDomains.length) {
      lines.push("[Top domains (optional, max 5)]");
      lines.push("");
      topDomains.forEach((item) => {
        lines.push(`${item.domain}: ${formatDuration(item.activeMs)}`);
      });
    }

    if (trapDoor) {
      const trapDomain = getDomain(trapDoor.url) || truncate(trapDoor.url, 48);
      lines.push(`[Turning point: ${trapDomain} (optional)]`);
    }

    return lines;
  }

  globalThis.IRHTSummaryShared = {
    buildSummaryDataLinesShared,
  };
})();
