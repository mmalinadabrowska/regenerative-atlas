/**
 * The map.
 *
 * A force-directed constellation drawn on canvas. Three things shape it:
 *
 *   springs   pull a source towards every tag it carries, and towards the
 *             sources it shares uncommon vocabulary with;
 *   repulsion pushes everything apart, Barnes-Hut approximated so the map
 *             stays smooth as the library grows past a few hundred entries;
 *   gravity   draws each node toward the centre of its cluster, which is what
 *             turns a hairball into readable territories.
 *
 * Rendering is deliberately hand-drawn: sources are ink blobs whose shape is
 * derived from their id, tags are asterisk stars, and the lines bow a little.
 */

import { blobPoints, inkLine, rng, seedOf, star, traceBlob } from './ink.js';

const THEME = {
  paper: '#f2ecdf',
  ink: '#100f0d',
  accents: ['#c2372a', '#2c4a8c', '#dda32f'],
};

/* --------------------------------------------------------------------------
   Barnes-Hut quadtree: approximate a distant crowd of nodes as one mass.
   -------------------------------------------------------------------------- */

class Quad {
  constructor(x, y, size) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.mass = 0;
    this.cx = 0;
    this.cy = 0;
    this.body = null;
    this.children = null;
  }

  insert(node) {
    this.mass += 1;
    this.cx += node.x;
    this.cy += node.y;

    if (this.size < 1) return;

    if (!this.children && !this.body) {
      this.body = node;
      return;
    }
    if (!this.children) {
      const existing = this.body;
      this.body = null;
      this.split();
      this.child(existing).insert(existing);
    }
    this.child(node).insert(node);
  }

  split() {
    const half = this.size / 2;
    this.children = [
      new Quad(this.x, this.y, half),
      new Quad(this.x + half, this.y, half),
      new Quad(this.x, this.y + half, half),
      new Quad(this.x + half, this.y + half, half),
    ];
  }

  child(node) {
    const half = this.size / 2;
    const right = node.x >= this.x + half ? 1 : 0;
    const bottom = node.y >= this.y + half ? 2 : 0;
    return this.children[right + bottom];
  }

  /**
   * Accumulate repulsion from this quad onto `node`.
   * `strength` is a positive magnitude; dx/dy point away from the quad's centre
   * of mass, so adding them pushes the node off. (Getting this sign backwards
   * turns the whole map into a single knot, which is how it was found.)
   */
  push(node, strength, theta) {
    if (this.mass === 0) return;
    const mx = this.cx / this.mass;
    const my = this.cy / this.mass;
    let dx = node.x - mx;
    let dy = node.y - my;
    let distanceSq = dx * dx + dy * dy;

    if (this.children && this.size * this.size > theta * theta * distanceSq) {
      for (const child of this.children) child.push(node, strength, theta);
      return;
    }
    if (this.body === node) return;
    if (distanceSq < 1) {
      // Coincident nodes need a nudge or they stay welded together forever.
      const jitter = (seedOf(node.id) % 100) / 100 - 0.5;
      dx = jitter || 0.5;
      dy = 0.5 - jitter;
      distanceSq = dx * dx + dy * dy;
    }
    const force = (strength * this.mass) / distanceSq;
    node.vx += dx * force;
    node.vy += dy * force;
  }
}

/* --------------------------------------------------------------------------
   The constellation itself
   -------------------------------------------------------------------------- */

export function createConstellation(canvas, options = {}) {
  const { onSelect = () => {}, onTagToggle = () => {} } = options;
  const ctx = canvas.getContext('2d');

  let nodes = [];
  let links = [];
  let clusters = [];
  let byId = new Map();
  let neighbours = new Map();

  let alpha = 0;
  let running = false;
  let fitWhenSettled = false;
  let frame = null;

  const view = { x: 0, y: 0, k: 1 };
  let hovered = null;
  let selected = null;
  let dragging = null;
  let panning = null;
  let dimmed = new Set();

  const settings = {
    repulsion: 260,
    theta: 0.9,
    linkStrength: { tagged: 0.07, kin: 0.02 },
    linkDistance: { tagged: 70, kin: 190 },
    clusterGravity: 0.055,
    centreGravity: 0.006,
    decay: 0.78,
    minAlpha: 0.0025,
  };

  /**
   * The simulation runs in its own coordinate space at a fixed scale and the
   * camera is fitted to whatever it settles into. Tying the layout to the
   * viewport instead makes the map collapse on a short window and drift on a
   * tall one, which is exactly what you don't want from a map.
   */
  function layoutRadius() {
    return 120 + clusters.length * 44 + Math.sqrt(nodes.length) * 16;
  }

  /* --- sizing ----------------------------------------------------------- */

  let width = 1;
  let height = 1;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    width = Math.max(rect.width, 1);
    height = Math.max(rect.height, 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }

  const observer = new ResizeObserver(() => {
    resize();
    if (!userAdjusted) fit();
  });
  observer.observe(canvas);

  /** True once the reader has panned or zoomed — after that we stop reframing. */
  let userAdjusted = false;

  /** Frame everything with a margin, so no part of the constellation is lost. */
  function fit(padding = 90) {
    if (nodes.length === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.x - node.radius);
      minY = Math.min(minY, node.y - node.radius);
      maxX = Math.max(maxX, node.x + node.radius);
      maxY = Math.max(maxY, node.y + node.radius);
    }
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    // Never shrink so far that the marks stop being marks — past this the
    // reader pans instead, which is the honest trade for a growing library.
    view.k = Math.min(
      1.6,
      Math.max(0.5, Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY)),
    );
    view.x = width / 2 - ((minX + maxX) / 2) * view.k;
    view.y = height / 2 - ((minY + maxY) / 2) * view.k;
    draw();
  }

  /* --- layout ----------------------------------------------------------- */

  /** Cluster anchors sit on a ring, largest cluster first, so the map has regions. */
  function anchorFor(cluster) {
    if (cluster === null || cluster === undefined || clusters.length === 0) return { x: 0, y: 0 };
    const count = clusters.length;
    const angle = (cluster / count) * Math.PI * 2 - Math.PI / 2;
    const radius = count > 1 ? layoutRadius() : 0;
    const squash = Math.min(1, Math.max(0.5, height / Math.max(width, 1)));
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * squash };
  }

  function setGraph(graph, { keepView = false } = {}) {
    const previous = new Map(nodes.map((n) => [n.id, n]));
    clusters = graph.clusters ?? [];

    nodes = (graph.nodes ?? []).map((node) => {
      const before = previous.get(node.id);
      const random = rng(seedOf(node.id));
      const anchor = anchorFor(node.cluster);
      return {
        ...node,
        x: before?.x ?? anchor.x + (random() - 0.5) * 260,
        y: before?.y ?? anchor.y + (random() - 0.5) * 260,
        vx: 0,
        vy: 0,
        seed: seedOf(node.id),
        radius:
          node.type === 'tag'
            ? 4 + Math.min(Math.sqrt(node.count ?? 1) * 3, 13)
            : 7 + Math.min((node.weight ?? 1) * 1.1, 7),
        blob: node.type === 'source' ? blobPoints(seedOf(node.id), { lobes: 6, wobble: 0.55 }) : null,
      };
    });

    byId = new Map(nodes.map((n) => [n.id, n]));
    links = (graph.links ?? [])
      .map((link) => ({ ...link, a: byId.get(link.source), b: byId.get(link.target) }))
      .filter((link) => link.a && link.b);

    neighbours = new Map(nodes.map((n) => [n.id, new Set()]));
    for (const link of links) {
      neighbours.get(link.a.id).add(link.b.id);
      neighbours.get(link.b.id).add(link.a.id);
    }

    if (!keepView) userAdjusted = false;
    fitWhenSettled = true;
    reheat(1);
  }

  function reheat(value = 0.6) {
    alpha = Math.max(alpha, value);
    if (!running) {
      running = true;
      frame = requestAnimationFrame(tick);
    }
  }

  function tick() {
    step();
    draw();
    if (alpha > settings.minAlpha || dragging) {
      frame = requestAnimationFrame(tick);
    } else {
      running = false;
      if (fitWhenSettled) {
        fitWhenSettled = false;
        if (!userAdjusted) fit();
      }
      draw();
    }
  }

  function step() {
    if (nodes.length === 0) return;

    // Repulsion, via a fresh quadtree each step.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x);
      maxY = Math.max(maxY, node.y);
    }
    const size = Math.max(maxX - minX, maxY - minY, 1) * 1.2;
    const tree = new Quad(minX - size * 0.1, minY - size * 0.1, size);
    for (const node of nodes) tree.insert(node);
    for (const node of nodes) tree.push(node, settings.repulsion * alpha, settings.theta);

    // Springs.
    for (const link of links) {
      const target = settings.linkDistance[link.kind] ?? 100;
      const strength = (settings.linkStrength[link.kind] ?? 0.04) * (link.weight ?? 1);
      const dx = link.b.x - link.a.x;
      const dy = link.b.y - link.a.y;
      const distance = Math.hypot(dx, dy) || 0.01;
      const shift = ((distance - target) / distance) * strength * alpha;
      link.a.vx += dx * shift;
      link.a.vy += dy * shift;
      link.b.vx -= dx * shift;
      link.b.vy -= dy * shift;
    }

    // Cluster and centre gravity.
    for (const node of nodes) {
      const anchor = anchorFor(node.cluster);
      const pull = node.type === 'tag' ? settings.clusterGravity * 1.9 : settings.clusterGravity;
      node.vx += (anchor.x - node.x) * pull * alpha;
      node.vy += (anchor.y - node.y) * pull * alpha;
      node.vx += -node.x * settings.centreGravity * alpha;
      node.vy += -node.y * settings.centreGravity * alpha;
    }

    collide();

    for (const node of nodes) {
      if (node === dragging) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      node.vx *= settings.decay;
      node.vy *= settings.decay;
      node.x += node.vx;
      node.y += node.vy;
    }

    alpha *= 0.978;
  }

  /**
   * Collision, so blobs sit beside each other rather than on top. Pairs are
   * found through a uniform grid rather than by comparing everything to
   * everything, which keeps the map smooth as the library grows.
   */
  const COLLIDE_PAD = 20;

  function collide() {
    let cell = 0;
    for (const node of nodes) cell = Math.max(cell, node.radius);
    cell = cell * 2 + COLLIDE_PAD;

    const grid = new Map();
    const key = (cx, cy) => `${cx}:${cy}`;
    for (const node of nodes) {
      const k = key(Math.floor(node.x / cell), Math.floor(node.y / cell));
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(node);
    }

    for (const node of nodes) {
      const cx = Math.floor(node.x / cell);
      const cy = Math.floor(node.y / cell);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          for (const other of grid.get(key(cx + ox, cy + oy)) ?? []) {
            if (other === node || other.id <= node.id) continue;
            const min = node.radius + other.radius + COLLIDE_PAD;
            const dx = other.x - node.x;
            const dy = other.y - node.y;
            const distance = Math.hypot(dx, dy);
            if (distance === 0 || distance >= min) continue;
            const push = ((min - distance) / distance) * 0.34;
            node.x -= dx * push;
            node.y -= dy * push;
            other.x += dx * push;
            other.y += dy * push;
          }
        }
      }
    }
  }

  /* --- painting --------------------------------------------------------- */

  const toScreen = (node) => ({ x: node.x * view.k + view.x, y: node.y * view.k + view.y });

  function focusSet() {
    const focus = hovered ?? selected;
    if (!focus) return null;
    const set = new Set([focus.id, ...(neighbours.get(focus.id) ?? [])]);
    return set;
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = THEME.paper;
    ctx.fillRect(0, 0, width, height);

    const focus = focusSet();
    const isMuted = (node) =>
      (focus && !focus.has(node.id)) || (dimmed.size > 0 && dimmed.has(node.id));

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Lines first, so the ink sits on top of them.
    for (const link of links) {
      const muted = isMuted(link.a) || isMuted(link.b);
      const lit = focus && focus.has(link.a.id) && focus.has(link.b.id);
      const a = toScreen(link.a);
      const b = toScreen(link.b);

      if (link.kind === 'kin') {
        ctx.strokeStyle = lit ? THEME.ink : muted ? 'rgba(16,15,13,0.07)' : 'rgba(16,15,13,0.42)';
        ctx.lineWidth = Math.max((lit ? 1.5 : 1) * view.k, 0.6);
      } else {
        ctx.strokeStyle = lit ? 'rgba(16,15,13,0.55)' : muted ? 'rgba(16,15,13,0.04)' : 'rgba(16,15,13,0.16)';
        ctx.lineWidth = Math.max(0.8 * view.k, 0.4);
      }
      inkLine(ctx, a.x, a.y, b.x, b.y, link.kind === 'kin' ? 0.05 : 0.02);
      ctx.stroke();
    }

    // Glyphs.
    const labelQueue = [];

    for (const node of nodes) {
      const { x, y } = toScreen(node);
      const radius = node.radius * view.k;
      if (x < -160 || y < -160 || x > width + 160 || y > height + 160) continue;

      const muted = isMuted(node);
      const active = hovered === node || selected === node;
      ctx.globalAlpha = muted ? 0.16 : 1;

      if (node.type === 'tag') {
        ctx.strokeStyle = THEME.ink;
        ctx.lineWidth = Math.max((active ? 2.1 : 1.35) * view.k, 0.7);
        star(ctx, x, y, radius, node.seed);
        ctx.stroke();

        // A Miró accent on the tag that names its cluster.
        const cluster = clusters[node.cluster ?? -1];
        if (cluster && cluster.tags?.[0] === node.slug) {
          ctx.fillStyle = THEME.accents[(node.cluster ?? 0) % THEME.accents.length];
          ctx.beginPath();
          ctx.arc(x + radius * 0.72, y - radius * 0.72, Math.max(radius * 0.28, 2), 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = THEME.ink;
        traceBlob(ctx, node.blob, x, y, radius);
        ctx.fill();
        if (active) {
          ctx.strokeStyle = THEME.ink;
          ctx.lineWidth = 1.2;
          traceBlob(ctx, node.blob, x, y, radius + 6 * view.k);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      const nearFocus = Boolean(focus && focus.has(node.id));
      const wants =
        active ||
        nearFocus ||
        (node.type === 'tag' ? view.k > 0.55 || node.count >= 4 : view.k > 1.5);
      if (wants && !muted) {
        labelQueue.push({
          node,
          x,
          y: y + radius + 6,
          priority: (active ? 1000 : 0) + (nearFocus ? 400 : 0) +
            (node.type === 'tag' ? 100 + (node.count ?? 0) : node.weight ?? 0),
        });
      }
    }

    /*
     * Labels last, and only where they fit. A constellation with every name
     * printed over every other name is unreadable, so the most important
     * label in any patch of the map wins and the rest wait for a zoom.
     */
    labelQueue.sort((a, b) => b.priority - a.priority);
    const occupied = [];
    const overlaps = (box) =>
      occupied.some(
        (other) =>
          box.x < other.x + other.w &&
          box.x + box.w > other.x &&
          box.y < other.y + other.h &&
          box.y + box.h > other.y,
      );

    for (const entry of labelQueue) {
      const { node } = entry;
      const active = hovered === node || selected === node;
      ctx.font =
        node.type === 'tag'
          ? `${Math.max(11, Math.min(15, 10 + (node.count ?? 1) * 0.3))}px "Poppins", "Century Gothic", system-ui, sans-serif`
          : '13px "EB Garamond", Georgia, serif';

      const limit = node.type === 'tag' ? 28 : active ? 64 : 34;
      const text = node.label.length > limit ? `${node.label.slice(0, limit - 1)}…` : node.label;
      const metrics = ctx.measureText(text);
      const box = { x: entry.x - metrics.width / 2 - 3, y: entry.y - 2, w: metrics.width + 6, h: 16 };

      if (!active && overlaps(box)) continue;
      occupied.push(box);

      ctx.globalAlpha = active ? 1 : 0.85;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = THEME.paper;
      ctx.lineWidth = 3.5;
      ctx.strokeText(text, entry.x, entry.y);
      ctx.fillStyle = THEME.ink;
      ctx.fillText(text, entry.x, entry.y);
      ctx.globalAlpha = 1;
    }
  }

  /* --- interaction ------------------------------------------------------ */

  function nodeAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    let best = null;
    let bestDistance = Infinity;
    for (const node of nodes) {
      const { x, y } = toScreen(node);
      const distance = Math.hypot(px - x, py - y);
      const reach = node.radius * view.k + 10;
      if (distance < reach && distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    return best;
  }

  canvas.addEventListener('pointermove', (event) => {
    if (panning) {
      view.x = panning.viewX + (event.clientX - panning.x);
      view.y = panning.viewY + (event.clientY - panning.y);
      draw();
      return;
    }
    if (dragging) {
      const rect = canvas.getBoundingClientRect();
      dragging.x = (event.clientX - rect.left - view.x) / view.k;
      dragging.y = (event.clientY - rect.top - view.y) / view.k;
      reheat(0.35);
      return;
    }
    const found = nodeAt(event.clientX, event.clientY);
    if (found !== hovered) {
      hovered = found;
      canvas.classList.toggle('is-over', Boolean(found));
      canvas.title = found ? found.label : '';
      draw();
    }
  });

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    const found = nodeAt(event.clientX, event.clientY);
    if (found) {
      dragging = found;
      dragging.moved = false;
    } else {
      panning = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y };
      canvas.classList.add('is-dragging');
      userAdjusted = true;
    }
  });

  canvas.addEventListener('pointerup', (event) => {
    canvas.releasePointerCapture?.(event.pointerId);
    const wasDragging = dragging;
    const moved = panning && Math.hypot(event.clientX - panning.x, event.clientY - panning.y) > 4;
    dragging = null;
    panning = null;
    canvas.classList.remove('is-dragging');

    if (wasDragging) {
      reheat(0.25);
      const found = nodeAt(event.clientX, event.clientY);
      if (found === wasDragging) choose(found);
      return;
    }
    if (!moved) choose(null);
  });

  canvas.addEventListener('pointerleave', () => {
    if (hovered) {
      hovered = null;
      draw();
    }
  });

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const factor = Math.exp(-event.deltaY * 0.0016);
      const next = Math.min(4, Math.max(0.25, view.k * factor));
      view.x = px - ((px - view.x) / view.k) * next;
      view.y = py - ((py - view.y) / view.k) * next;
      view.k = next;
      userAdjusted = true;
      draw();
    },
    { passive: false },
  );

  function choose(node) {
    if (node?.type === 'tag') {
      onTagToggle(node.slug);
      return;
    }
    selected = node;
    onSelect(node);
    draw();
  }

  /* --- public surface --------------------------------------------------- */

  return {
    setGraph,
    resize,
    fit,
    reheat,
    select(id) {
      selected = id ? byId.get(id) ?? null : null;
      draw();
    },
    /** Grey out everything that isn't in this set of node ids. */
    setDimmed(ids) {
      dimmed = new Set(ids ?? []);
      draw();
    },
    /** Bring a node to the middle of the frame — used by search results. */
    focus(id) {
      const node = byId.get(id);
      if (!node) return;
      view.k = Math.max(view.k, 1.5);
      userAdjusted = true;
      view.x = width / 2 - node.x * view.k;
      view.y = height / 2 - node.y * view.k;
      selected = node;
      onSelect(node);
      draw();
    },
    zoomBy(factor) {
      userAdjusted = true;
      const next = Math.min(4, Math.max(0.25, view.k * factor));
      view.x = width / 2 - ((width / 2 - view.x) / view.k) * next;
      view.y = height / 2 - ((height / 2 - view.y) / view.k) * next;
      view.k = next;
      draw();
    },
    reset() {
      userAdjusted = false;
      fitWhenSettled = true;
      reheat(0.8);
      fit();
    },
    destroy() {
      observer.disconnect();
      cancelAnimationFrame(frame);
      running = false;
    },
  };
}
