// Graph utilities and rendering for the dashboard.

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

function buildGraphData(session, mode, maxNodes = null) {
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
        const title = node.title || url || key || "";
        return {
          id: url || node.id || "",
          label: title,
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
    const domainEntry = domainMap.get(domain) || {
      id: domain,
      label: domain,
      domain,
      activeMs: 0,
      visitCount: 0,
      categoryTotals: {},
    };
    domainEntry.activeMs += node.activeMs || 0;
    domainEntry.visitCount += node.visitCount || 0;
    const category = node.category || "Random";
    domainEntry.categoryTotals[category] =
      (domainEntry.categoryTotals[category] || 0) + (node.activeMs || 0);
    domainMap.set(domain, domainEntry);
  });

  const edgeMap = new Map();
  edgeValues.forEach((edge) => {
    const fromDomain = getDomainForGraph(edge.from);
    const toDomain = getDomainForGraph(edge.to);
    if (!fromDomain || !toDomain) {
      return;
    }
    const key = `${fromDomain} -> ${toDomain}`;
    const entry = edgeMap.get(key) || {
      from: fromDomain,
      to: toDomain,
      count: 0,
      activeMs: 0,
    };
    entry.count += edge.visitCount || 1;
    entry.activeMs += edge.activeMs || 0;
    edgeMap.set(key, entry);
  });

  let nodes = Array.from(domainMap.values());
  nodes = nodes.map((node) => ({
    ...node,
    category: pickDominantCategory(node.categoryTotals),
  }));
  let keep = null;
  if (maxNodes && nodes.length > maxNodes) {
    nodes = nodes
      .sort((a, b) => b.activeMs - a.activeMs)
      .slice(0, maxNodes);
    keep = new Set(nodes.map((node) => node.id));
  }
  const edges = Array.from(edgeMap.values()).filter((edge) =>
    keep ? keep.has(edge.from) && keep.has(edge.to) : true,
  );

  return { nodes, edges };
}

function trimGraph(graph, maxNodes = MAX_GRAPH_NODES) {
  if (graph.nodes.length <= maxNodes) {
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
      return label.includes(search) || domain.includes(search) || url.includes(search);
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

  const cap = settings.nodeCap || MAX_GRAPH_NODES;
  if (cap && nodes.length > cap) {
    nodes = [...nodes]
      .sort((a, b) => (b.activeMs || 0) - (a.activeMs || 0))
      .slice(0, cap);
    const capKeep = new Set(nodes.map((node) => node.id));
    edges = edges.filter(
      (edge) => capKeep.has(edge.from) && capKeep.has(edge.to),
    );
  }

  const emptyReason = !nodes.length && (minNodeMs > 0 || search || settings.hideIsolates)
    ? "No nodes match the current filters."
    : "";

  return { nodes, edges, emptyReason };
}

function buildGraphKey(graph, mode, sessionId) {
  const nodeIds = graph.nodes.map((node) => node.id).sort().join(",");
  const edgeIds = graph.edges
    .map((edge) => `${edge.from}>${edge.to}`)
    .sort()
    .join(",");
  return `${sessionId || "session"}:${mode}:${graph.nodes.length}:${
    graph.edges.length
  }:${nodeIds}|${edgeIds}`;
}

function updateGraphStats(graph) {
  if (!elements.graphStats) {
    return;
  }
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const totalActive = nodes.reduce((sum, node) => sum + (node.activeMs || 0), 0);
  const topNode = nodes[0];
  const stats = [
    `Nodes: ${nodes.length}`,
    `Edges: ${edges.length}`,
    totalActive ? `Total active: ${formatDuration(totalActive)}` : "Total active: -",
    topNode ? `Top: ${truncate(topNode.label, 24)}` : "Top: -",
  ];
  elements.graphStats.textContent = stats.join(" • ");
}

function updateGraphLegend(settings, graph) {
  if (!elements.graphLegend) {
    return;
  }
  elements.graphLegend.innerHTML = "";
  const modeLabel = settings.mode === "page" ? "Page" : "Domain";
  const colorLabel =
    settings.colorBy === "category"
      ? "Color: category"
      : settings.colorBy === "domain"
        ? "Color: domain"
        : "Color: activity";
  const chips = [
    { label: `${modeLabel} view`, color: "var(--accent-2)" },
    { label: colorLabel, color: "var(--accent)" },
  ];
  if (graph?.nodes?.length) {
    chips.push({ label: "Wheel to zoom", color: "var(--muted)" });
    chips.push({ label: "Drag to pan / drag nodes to pin", color: "var(--muted)" });
  }
  const fragment = document.createDocumentFragment();
  chips.forEach((chip) => {
    const item = document.createElement("span");
    item.className = "legend-chip";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = chip.color;
    const text = document.createElement("span");
    text.textContent = chip.label;
    item.appendChild(swatch);
    item.appendChild(text);
    fragment.appendChild(item);
  });
  elements.graphLegend.appendChild(fragment);
}

function colorFor(key) {
  if (!key) {
    return "#d3c4b3";
  }
  const hash = hashString(key);
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function ForceGraph(canvas, tooltip) {
  this.canvas = canvas;
  this.ctx = canvas.getContext("2d");
  this.tooltip = tooltip;
  this.nodes = [];
  this.edges = [];
  this.animFrame = null;
  this.iterations = 0;
  this.nodeMap = new Map();
  this.neighbors = new Map();
  this.hoverNode = null;
  this.dragNode = null;
  this.isPanning = false;
  this.panStart = null;
  this.zoom = 1;
  this.minZoom = 0.5;
  this.maxZoom = 3.5;
  this.offsetX = 0;
  this.offsetY = 0;
  this.freeze = false;
  this.showLabels = true;
  this.colorBy = "activity";
  this.pixelRatio = window.devicePixelRatio || 1;

  this.resize();

  window.addEventListener("resize", () => {
    this.resize();
    this.run();
  });

  this.canvas.addEventListener("mousemove", (event) => this.handleMove(event));
  this.canvas.addEventListener("mousedown", (event) => this.handleDown(event));
  window.addEventListener("mouseup", (event) => this.handleUp(event));
  this.canvas.addEventListener("mouseleave", () => this.handleLeave());
  this.canvas.addEventListener(
    "wheel",
    (event) => this.handleWheel(event),
    { passive: false },
  );
  this.canvas.addEventListener("dblclick", (event) =>
    this.handleDoubleClick(event),
  );
}

ForceGraph.prototype.setData = function setData(data, options = {}) {
  if (!data.nodes.length) {
    this.nodes = [];
    this.edges = [];
    this.nodeMap = new Map();
    this.neighbors = new Map();
    this.draw();
    return;
  }
  const preserveLayout = !!options.preserveLayout && this.nodeMap;
  const previousMap = this.nodeMap;
  this.colorBy = options.colorBy || this.colorBy || "activity";
  this.showLabels =
    options.showLabels !== undefined ? options.showLabels : this.showLabels;
  this.hoverNode = null;
  this.nodes = data.nodes.map((node) => {
    const prior = preserveLayout ? previousMap.get(node.id) : null;
    return {
      ...node,
      x: prior ? prior.x : Math.random() * this.width,
      y: prior ? prior.y : Math.random() * this.height,
      vx: prior ? prior.vx : 0,
      vy: prior ? prior.vy : 0,
      pinned: prior ? prior.pinned : false,
      fx: prior ? prior.fx : null,
      fy: prior ? prior.fy : null,
    };
  });
  this.edges = data.edges.map((edge) => ({ ...edge }));
  this.nodeMap = new Map(this.nodes.map((node) => [node.id, node]));
  this.neighbors = new Map();
  this.edges.forEach((edge) => {
    if (!this.neighbors.has(edge.from)) {
      this.neighbors.set(edge.from, new Set());
    }
    if (!this.neighbors.has(edge.to)) {
      this.neighbors.set(edge.to, new Set());
    }
    this.neighbors.get(edge.from).add(edge.to);
    this.neighbors.get(edge.to).add(edge.from);
  });

  const maxMs = Math.max(1, ...this.nodes.map((node) => node.activeMs || 0));
  this.nodes.forEach((node) => {
    const scale = Math.sqrt((node.activeMs || 0) / maxMs);
    node.radius = 7 + scale * 18;
    node.color = this.getNodeColor(node, scale);
  });

  const labels = [...this.nodes]
    .sort((a, b) => b.activeMs - a.activeMs)
    .slice(0, 8);
  this.nodes.forEach((node) => {
    node.labelVisible = labels.includes(node);
  });

  this.run();
};

ForceGraph.prototype.resize = function resize() {
  if (!this.canvas) {
    return;
  }
  const rect = this.canvas.getBoundingClientRect();
  this.width = rect.width;
  this.height = rect.height;
  this.pixelRatio = window.devicePixelRatio || 1;
  this.canvas.width = rect.width * this.pixelRatio;
  this.canvas.height = rect.height * this.pixelRatio;
  this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
};

ForceGraph.prototype.run = function run() {
  if (this.animFrame) {
    cancelAnimationFrame(this.animFrame);
  }
  if (!this.nodes.length) {
    this.draw();
    return;
  }
  if (this.freeze) {
    this.draw();
    return;
  }
  this.iterations = 0;
  const animate = () => {
    this.iterations += 1;
    this.simulate();
    this.draw();
    if (this.iterations < 240) {
      this.animFrame = requestAnimationFrame(animate);
    }
  };
  animate();
};

ForceGraph.prototype.simulate = function simulate() {
  const repulsion = 1400;
  const spring = 0.0025;
  const centerForce = 0.0015;
  const damping = 0.85;
  const targetDistance = 120;

  for (let i = 0; i < this.nodes.length; i += 1) {
    const nodeA = this.nodes[i];
    for (let j = i + 1; j < this.nodes.length; j += 1) {
      const nodeB = this.nodes[j];
      const dx = nodeA.x - nodeB.x;
      const dy = nodeA.y - nodeB.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = repulsion / (distance * distance);
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      if (!nodeA.pinned) {
        nodeA.vx += fx;
        nodeA.vy += fy;
      }
      if (!nodeB.pinned) {
        nodeB.vx -= fx;
        nodeB.vy -= fy;
      }
    }
  }

  this.edges.forEach((edge) => {
    const nodeA = this.nodeMap.get(edge.from);
    const nodeB = this.nodeMap.get(edge.to);
    if (!nodeA || !nodeB) {
      return;
    }
    const dx = nodeB.x - nodeA.x;
    const dy = nodeB.y - nodeA.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = (distance - targetDistance) * spring;
    const fx = (dx / distance) * force;
    const fy = (dy / distance) * force;
    if (!nodeA.pinned) {
      nodeA.vx += fx;
      nodeA.vy += fy;
    }
    if (!nodeB.pinned) {
      nodeB.vx -= fx;
      nodeB.vy -= fy;
    }
  });

  const centerX = this.width / 2;
  const centerY = this.height / 2;
  this.nodes.forEach((node) => {
    if (!node.pinned) {
      node.vx += (centerX - node.x) * centerForce;
      node.vy += (centerY - node.y) * centerForce;
      node.vx *= damping;
      node.vy *= damping;
      node.x += node.vx;
      node.y += node.vy;
    } else {
      node.vx = 0;
      node.vy = 0;
      if (Number.isFinite(node.fx)) {
        node.x = node.fx;
      }
      if (Number.isFinite(node.fy)) {
        node.y = node.fy;
      }
    }
  });
};

ForceGraph.prototype.draw = function draw() {
  this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
  this.ctx.clearRect(0, 0, this.width, this.height);
  this.ctx.lineCap = "round";
  this.ctx.save();
  this.ctx.translate(this.offsetX, this.offsetY);
  this.ctx.scale(this.zoom, this.zoom);

  const hoveredId = this.hoverNode ? this.hoverNode.id : null;
  const neighborSet = hoveredId ? this.neighbors.get(hoveredId) : null;

  this.edges.forEach((edge) => {
    const nodeA = this.nodeMap.get(edge.from);
    const nodeB = this.nodeMap.get(edge.to);
    if (!nodeA || !nodeB) {
      return;
    }
    const isConnected =
      hoveredId &&
      (edge.from === hoveredId ||
        edge.to === hoveredId ||
        (neighborSet &&
          (neighborSet.has(edge.from) || neighborSet.has(edge.to))));
    const edgeWeight = Math.max(1, edge.count || 1);
    const width = (1 + Math.log1p(edgeWeight) * 1.2) / Math.max(1, this.zoom);
    const intensity = Math.min(
      0.7,
      0.15 + Math.log1p(edge.activeMs || edgeWeight) / 10,
    );
    const alpha = hoveredId ? (isConnected ? 0.55 : 0.08) : intensity;
    this.ctx.strokeStyle = `rgba(35, 26, 20, ${alpha})`;
    this.ctx.lineWidth = width;
    this.ctx.beginPath();
    this.ctx.moveTo(nodeA.x, nodeA.y);
    this.ctx.lineTo(nodeB.x, nodeB.y);
    this.ctx.stroke();
  });

  this.nodes.forEach((node) => {
    const isHovered = hoveredId && node.id === hoveredId;
    const isNeighbor = neighborSet && neighborSet.has(node.id);
    const dimmed = hoveredId && !isHovered && !isNeighbor;
    this.ctx.fillStyle = dimmed ? "rgba(196, 182, 167, 0.45)" : node.color;
    this.ctx.beginPath();
    this.ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    this.ctx.fill();
    if (isHovered) {
      this.ctx.lineWidth = 2 / Math.max(1, this.zoom);
      this.ctx.strokeStyle = "rgba(35, 26, 20, 0.6)";
      this.ctx.stroke();
    }
  });

  if (this.showLabels || hoveredId) {
    const fontSize = Math.max(9, Math.min(16, 12 / this.zoom));
    this.ctx.font = `${fontSize}px 'Space Grotesk', sans-serif`;
    this.ctx.fillStyle = "rgba(35, 26, 20, 0.85)";
    this.nodes.forEach((node) => {
      const isHovered = hoveredId && node.id === hoveredId;
      const isNeighbor = neighborSet && neighborSet.has(node.id);
      if (!this.showLabels && !isHovered) {
        return;
      }
      if (this.showLabels && !node.labelVisible && !isHovered && !isNeighbor) {
        return;
      }
      const label = truncate(node.label, 16);
      this.ctx.fillText(label, node.x + node.radius + 6, node.y + 4);
    });
  }
  this.ctx.restore();
};

ForceGraph.prototype.handleMove = function handleMove(event) {
  if (!this.nodes.length) {
    return;
  }
  const { x, y } = this.getPointer(event);
  const world = this.screenToWorld(x, y);

  if (this.dragNode) {
    this.dragNode.fx = world.x;
    this.dragNode.fy = world.y;
    this.draw();
    return;
  }
  if (this.isPanning && this.panStart) {
    this.offsetX = this.panStart.offsetX + (x - this.panStart.x);
    this.offsetY = this.panStart.offsetY + (y - this.panStart.y);
    this.draw();
    return;
  }

  const nearest = this.getNodeAt(world.x, world.y);
  if (!nearest) {
    if (this.hoverNode) {
      this.hoverNode = null;
      this.draw();
    }
    this.hideTooltip();
    return;
  }

  if (!this.hoverNode || this.hoverNode.id !== nearest.id) {
    this.hoverNode = nearest;
    this.draw();
  }
  this.showTooltip(nearest, event.clientX, event.clientY);
};

ForceGraph.prototype.handleDown = function handleDown(event) {
  if (!this.nodes.length) {
    return;
  }
  if (event.button !== 0) {
    return;
  }
  event.preventDefault();
  const { x, y } = this.getPointer(event);
  const world = this.screenToWorld(x, y);
  const target = this.getNodeAt(world.x, world.y);
  if (target) {
    this.dragNode = target;
    target.pinned = true;
    target.fx = world.x;
    target.fy = world.y;
    this.hideTooltip();
    return;
  }
  this.isPanning = true;
  this.panStart = { x, y, offsetX: this.offsetX, offsetY: this.offsetY };
  this.hideTooltip();
};

ForceGraph.prototype.handleUp = function handleUp() {
  if (this.dragNode) {
    this.dragNode = null;
  }
  if (this.isPanning) {
    this.isPanning = false;
    this.panStart = null;
  }
};

ForceGraph.prototype.handleLeave = function handleLeave() {
  this.isPanning = false;
  this.dragNode = null;
  this.panStart = null;
  this.hideTooltip();
};

ForceGraph.prototype.handleWheel = function handleWheel(event) {
  if (!this.nodes.length) {
    return;
  }
  event.preventDefault();
  const { x, y } = this.getPointer(event);
  const world = this.screenToWorld(x, y);
  const delta = -event.deltaY;
  const zoomFactor = Math.exp(delta * 0.001);
  const nextZoom = Math.min(
    this.maxZoom,
    Math.max(this.minZoom, this.zoom * zoomFactor),
  );
  if (nextZoom === this.zoom) {
    return;
  }
  this.zoom = nextZoom;
  this.offsetX = x - world.x * this.zoom;
  this.offsetY = y - world.y * this.zoom;
  this.draw();
};

ForceGraph.prototype.handleDoubleClick = function handleDoubleClick(event) {
  if (!this.nodes.length) {
    return;
  }
  const { x, y } = this.getPointer(event);
  const world = this.screenToWorld(x, y);
  const target = this.getNodeAt(world.x, world.y);
  if (target) {
    target.pinned = false;
    target.fx = null;
    target.fy = null;
    if (!this.freeze) {
      this.run();
    } else {
      this.draw();
    }
  }
};

ForceGraph.prototype.showTooltip = function showTooltip(node, x, y) {
  if (!this.tooltip) {
    return;
  }
  const label = truncate(node.label, 40);
  const parts = [formatDuration(node.activeMs || 0)];
  if (node.visitCount) {
    parts.push(`${node.visitCount} visits`);
  }
  if (node.category) {
    parts.push(node.category);
  }
  this.tooltip.textContent = `${label} - ${parts.join(" • ")}`;
  this.tooltip.style.left = `${x + 12}px`;
  this.tooltip.style.top = `${y + 12}px`;
  this.tooltip.classList.add("show");
};

ForceGraph.prototype.hideTooltip = function hideTooltip() {
  if (!this.tooltip) {
    return;
  }
  this.tooltip.classList.remove("show");
};

ForceGraph.prototype.setFreeze = function setFreeze(value) {
  this.freeze = !!value;
  if (this.freeze && this.animFrame) {
    cancelAnimationFrame(this.animFrame);
    this.animFrame = null;
  }
  if (!this.freeze) {
    this.run();
  } else {
    this.draw();
  }
};

ForceGraph.prototype.resetView = function resetView() {
  this.zoom = 1;
  this.offsetX = 0;
  this.offsetY = 0;
  this.draw();
};

ForceGraph.prototype.getPointer = function getPointer(event) {
  const rect = this.canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
};

ForceGraph.prototype.screenToWorld = function screenToWorld(x, y) {
  return {
    x: (x - this.offsetX) / this.zoom,
    y: (y - this.offsetY) / this.zoom,
  };
};

ForceGraph.prototype.getNodeAt = function getNodeAt(x, y) {
  let nearest = null;
  let minDist = Infinity;
  const scale = 1 / Math.max(0.5, this.zoom);
  this.nodes.forEach((node) => {
    const dx = node.x - x;
    const dy = node.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const threshold = node.radius + 8 * scale;
    if (dist < threshold && dist < minDist) {
      minDist = dist;
      nearest = node;
    }
  });
  return nearest;
};

ForceGraph.prototype.getNodeColor = function getNodeColor(node, scale) {
  if (this.colorBy === "domain") {
    return colorFor(node.domain || node.id);
  }
  if (this.colorBy === "category") {
    return colorFor(node.category || "Random");
  }
  return mixHex("#f2e7d6", "#c84c37", Math.min(1, Math.max(0, scale)));
};
