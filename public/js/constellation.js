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
 * Rendering is deliberately hand-drawn, and the hierarchy is carried by the
 * marks themselves: a tag is an ink shape that grows with the number of sources
 * filed under it, so the territories of the map are the biggest blots on it.
 * Research is a circled cross — small, near-uniform, a plotted point against
 * drawn ink. Lines bow a little.
 */

import { blobPoints, crossInCircle, inkLine, rng, seedOf, traceBlob } from './ink.js';

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
  const {
    onSelect = () => {},
    onFocus = () => {},
    // Rectangles, in canvas coordinates, that the page's own chrome sits over.
    // Labels are not placed under them.
    avoid = () => [],
    // How much of the frame the page's own panels are covering, so the map is
    // fitted to the part of it you can actually see.
    inset = () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  } = options;
  const ctx = canvas.getContext('2d');

  // The whole library, built once. What is on screen is a view of it.
  let library = { nodes: [], clusters: [] };
  let allById = new Map();
  let affinity = [];          // tag-to-tag, used to shape the islands only
  let sourcesOfTag = new Map();
  let tagsOfSource = new Map();
  let kinOf = new Map();

  // The current view: the islands, or one node opened.
  let focused = null;
  let nodes = [];
  let links = [];
  let clusters = [];
  let byId = new Map();
  let neighbours = new Map();
  let drawLinks = true;

  let transition = null;      // { at, until } while the graph is rearranging
  let drifting = false;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  let alpha = 0;
  let running = false;
  let fitWhenSettled = false;
  // The zoom at which the whole map is in frame. Label detail is expressed
  // relative to this rather than as absolute zoom, so a library of thirty and a
  // library of three thousand both start as territory and reveal titles at the
  // same point in the gesture.
  let overview = 1;
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
    linkDistance: { tagged: 92, kin: 190 },
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
    // The islands are only the tags, so they gather more tightly than a view
    // holding every source would — which lets the blots themselves read bigger.
    if (!focused) return 70 + clusters.length * 26 + Math.sqrt(nodes.length) * 10;
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

    const gap = inset();
    const frame = {
      left: gap.left ?? 0,
      top: gap.top ?? 0,
      width: Math.max(width - (gap.left ?? 0) - (gap.right ?? 0), 120),
      height: Math.max(height - (gap.top ?? 0) - (gap.bottom ?? 0), 120),
    };

    // Never shrink so far that the marks stop being marks — past this the
    // reader pans instead, which is the honest trade for a growing library.
    // The islands are allowed to fill the frame: the blots are the content
    // there, not a summary of it.
    view.k = Math.min(
      focused ? 1.7 : 2.8,
      Math.max(
        0.5,
        Math.min((frame.width - padding * 2) / spanX, (frame.height - padding * 2) / spanY),
      ),
    );
    overview = view.k;
    view.x = frame.left + frame.width / 2 - ((minX + maxX) / 2) * view.k;
    view.y = frame.top + frame.height / 2 - ((minY + maxY) / 2) * view.k;
    draw();
  }

  /* --- layout ----------------------------------------------------------- */

  /** Cluster anchors sit on a ring, largest cluster first, so the map has regions. */
  function anchorFor(cluster) {
    if (cluster === null || cluster === undefined || clusters.length === 0) return { x: 0, y: 0 };
    const count = clusters.length;
    const angle = (cluster / count) * Math.PI * 2 - Math.PI / 2;
    const radius = count > 1 ? layoutRadius() : 0;
    // A rounder archipelago than the frame, so the map fills the height too
    // rather than laying itself out in a thin band.
    const squash = focused ? Math.min(1, Math.max(0.5, height / Math.max(width, 1))) : 0.76;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * squash };
  }

  /**
   * Take the whole library in once, and build the indexes every view needs.
   * Node objects are made here and reused across views, so a tag keeps its
   * shape, its size and its place in your memory of the map.
   */
  function setGraph(graph) {
    clusters = graph.clusters ?? [];
    library = {
      clusters,
      nodes: (graph.nodes ?? []).map((node) => ({
        ...node,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        seed: seedOf(node.id),
        // A tag's size is its weight in the library: one source is a small
        // blot, ten is a territory. Research stays small and near-uniform.
        radius:
          node.type === 'tag'
            ? 7 + Math.min(Math.max((node.count ?? 1) - 1, 0) ** 0.62 * 8.5, 30)
            : 5 + Math.min((node.weight ?? 1) * 0.35, 2.5),
        blob:
          node.type === 'tag'
            ? blobPoints(seedOf(node.id), { lobes: 8, wobble: 0.85 })
            : null,
        drift: {
          rate: 0.00007 + (seedOf(`${node.id}r`) % 1000) / 1e7,
          phase: (seedOf(`${node.id}p`) % 628) / 100,
        },
      })),
    };
    allById = new Map(library.nodes.map((n) => [n.id, n]));

    sourcesOfTag = new Map();
    tagsOfSource = new Map();
    kinOf = new Map();
    for (const link of graph.links ?? []) {
      const a = allById.get(link.source);
      const b = allById.get(link.target);
      if (!a || !b) continue;
      if (link.kind === 'tagged') {
        const [source, tag] = a.type === 'source' ? [a, b] : [b, a];
        if (!sourcesOfTag.has(tag.id)) sourcesOfTag.set(tag.id, []);
        if (!tagsOfSource.has(source.id)) tagsOfSource.set(source.id, []);
        sourcesOfTag.get(tag.id).push(source);
        tagsOfSource.get(source.id).push(tag);
      } else {
        for (const [one, other] of [[a, b], [b, a]]) {
          if (!kinOf.has(one.id)) kinOf.set(one.id, []);
          kinOf.get(one.id).push({ other, weight: link.weight ?? 0, shared: link.shared ?? [] });
        }
      }
    }
    for (const list of kinOf.values()) list.sort((x, y) => y.weight - x.weight);

    affinity = tagAffinity();
    focused = null;
    compose({ animate: false });
  }

  /**
   * Two tags are drawn together when they are filed on the same research,
   * normalised so a tag on half the library does not pull the whole map into
   * itself. Only each tag's strongest few ties are kept — the rest are the
   * incidental overlaps that would smear the islands back into one continent.
   */
  function tagAffinity() {
    const weights = new Map();
    for (const tags of tagsOfSource.values()) {
      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const key = tags[i].id < tags[j].id ? `${tags[i].id}|${tags[j].id}` : `${tags[j].id}|${tags[i].id}`;
          weights.set(key, (weights.get(key) ?? 0) + 1);
        }
      }
    }

    const scored = [...weights].map(([key, shared]) => {
      const [a, b] = key.split('|');
      const na = allById.get(a)?.count ?? 1;
      const nb = allById.get(b)?.count ?? 1;
      return { a, b, weight: shared / Math.sqrt(na * nb) };
    });

    const best = new Map();
    for (const edge of scored) {
      for (const [from, to] of [[edge.a, edge.b], [edge.b, edge.a]]) {
        if (!best.has(from)) best.set(from, []);
        best.get(from).push({ to, weight: edge.weight });
      }
    }
    const kept = new Set();
    for (const [from, edges] of best) {
      edges
        .sort((x, y) => y.weight - x.weight || x.to.localeCompare(y.to))
        .slice(0, 3)
        .forEach(({ to }) => kept.add(from < to ? `${from}|${to}` : `${to}|${from}`));
    }

    return scored
      .filter((edge) => kept.has(edge.a < edge.b ? `${edge.a}|${edge.b}` : `${edge.b}|${edge.a}`))
      .map((edge) => ({ a: allById.get(edge.a), b: allById.get(edge.b), kind: 'affinity', weight: edge.weight }));
  }

  /* --- the three views -------------------------------------------------- */

  const kinAmong = (ids) => {
    const drawn = new Set();
    const out = [];
    for (const id of ids) {
      for (const { other, weight, shared } of kinOf.get(id) ?? []) {
        if (!ids.has(other.id)) continue;
        const key = id < other.id ? `${id}|${other.id}` : `${other.id}|${id}`;
        if (drawn.has(key)) continue;
        drawn.add(key);
        out.push({ a: allById.get(id), b: other, kind: 'kin', weight, shared });
      }
    }
    return out;
  };

  /** What is on screen, given what is open. */
  function compose({ animate = true } = {}) {
    const from = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    const previouslyPlaced = new Set(nodes.map((n) => n.id));

    if (!focused) {
      nodes = library.nodes.filter((n) => n.type === 'tag');
      links = affinity.filter((l) => l.a && l.b);
      drawLinks = false;
      islandLayout(previouslyPlaced);
    } else if (focused.type === 'tag') {
      const sources = sourcesOfTag.get(focused.id) ?? [];
      nodes = [focused, ...sources];
      links = [
        ...sources.map((source) => ({ a: focused, b: source, kind: 'tagged', weight: 1 })),
        ...kinAmong(new Set(sources.map((s) => s.id))),
      ];
      drawLinks = true;
      ringLayout(focused, [orderRing(sources)]);
    } else {
      const tags = tagsOfSource.get(focused.id) ?? [];
      const kin = (kinOf.get(focused.id) ?? []).map((k) => k.other);
      nodes = [focused, ...tags, ...kin];
      links = [
        ...tags.map((tag) => ({ a: focused, b: tag, kind: 'tagged', weight: 1 })),
        ...kinAmong(new Set([focused.id, ...kin.map((k) => k.id)])),
      ];
      drawLinks = true;
      // A fan, not two rings: what it is filed under to one side, what it sits
      // beside to the other. Concentric rings put the tags inside the relatives
      // and every line crossed every other one.
      fanLayout(focused, orderRing(tags), orderRing(kin));
    }

    byId = new Map(nodes.map((n) => [n.id, n]));
    neighbours = new Map(nodes.map((n) => [n.id, new Set()]));
    for (const link of links) {
      neighbours.get(link.a.id)?.add(link.b.id);
      neighbours.get(link.b.id)?.add(link.a.id);
    }

    drifting = false;
    userAdjusted = false;
    hovered = null;

    if (animate && !reducedMotion) {
      // Anything new arrives from where you clicked, so the rearrangement
      // reads as the map opening rather than as a different map.
      const origin = focused ? { x: focused.tx, y: focused.ty } : { x: 0, y: 0 };
      for (const node of nodes) {
        const start = from.get(node.id) ?? origin;
        node.fromX = start.x;
        node.fromY = start.y;
        node.x = start.x;
        node.y = start.y;
      }
      transition = { at: performance.now(), until: 620 };
      run();
    } else {
      for (const node of nodes) {
        node.x = node.tx;
        node.y = node.ty;
      }
      transition = null;
      fitWhenSettled = true;
      if (!focused) reheat(1);
      else {
        fit();
        run();
      }
    }
  }

  /** Sort a ring so that things of a kind, and things that are alike, adjoin. */
  function orderRing(list) {
    return [...list].sort(
      (a, b) =>
        (a.cluster ?? 99) - (b.cluster ?? 99) ||
        (b.count ?? b.weight ?? 0) - (a.count ?? a.weight ?? 0) ||
        a.label.localeCompare(b.label),
    );
  }

  /**
   * The opened node at the centre, everything else on rings around it. A ring
   * is the most legible arrangement there is for "these belong to that": no
   * crossings, even spacing, and the centre unmistakable.
   */
  function ringLayout(centre, rings) {
    centre.tx = 0;
    centre.ty = 0;
    let radius = centre.radius + 105;
    for (const ring of rings) {
      if (ring.length === 0) continue;
      const spacing = Math.max(...ring.map((n) => n.radius)) * 2 + 66;
      radius = Math.max(radius, (spacing * ring.length) / (Math.PI * 2));
      ring.forEach((node, i) => {
        const angle = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
        node.tx = Math.cos(angle) * radius;
        node.ty = Math.sin(angle) * radius * 0.86;
      });
      radius += spacing * 1.15;
    }
  }

  /**
   * The opened source in the middle, its tags fanned to the left and the
   * research it sits beside fanned to the right. Reading the picture and
   * reading the sentence — filed under, sits beside — are the same act.
   */
  function fanLayout(centre, left, right) {
    centre.tx = 0;
    centre.ty = 0;
    place(left, Math.PI, centre.radius + 210);
    // The relatives sit further out than the tags: their names are titles, and
    // titles need room the way a one-word tag does not.
    place(right, 0, centre.radius + 320);

    function place(list, towards, minRadius) {
      if (list.length === 0) return;
      if (list.length === 1) {
        list[0].tx = Math.cos(towards) * minRadius;
        list[0].ty = 0;
        return;
      }
      const spacing = Math.max(...list.map((n) => n.radius)) * 2 + 76;
      const span = Math.min(Math.PI * 0.8, 0.34 * (list.length - 1));
      const radius = Math.max(minRadius, (spacing * (list.length - 1)) / span);
      list.forEach((node, i) => {
        const angle = towards - span / 2 + (i / (list.length - 1)) * span;
        node.tx = Math.cos(angle) * radius;
        node.ty = Math.sin(angle) * radius;
      });
    }
  }

  /** The islands keep whatever the simulation last settled them into. */
  function islandLayout(previouslyPlaced) {
    for (const node of nodes) {
      if (previouslyPlaced.has(node.id) && node.homeX !== undefined) {
        node.tx = node.homeX;
        node.ty = node.homeY;
        continue;
      }
      const random = rng(node.seed);
      const anchor = anchorFor(node.cluster);
      node.tx = node.homeX ?? anchor.x + (random() - 0.5) * 240;
      node.ty = node.homeY ?? anchor.y + (random() - 0.5) * 240;
    }
  }

  function setFocus(node) {
    if (focused === node) return;
    focused = node;
    compose();
    onFocus(focused);
  }

  function reheat(value = 0.6) {
    alpha = Math.max(alpha, value);
    run();
  }

  function run() {
    if (running || document.hidden) return;
    running = true;
    frame = requestAnimationFrame(tick);
  }

  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

  function tick(now = performance.now()) {
    if (transition) {
      const t = Math.min((now - transition.at) / transition.until, 1);
      const eased = easeInOut(t);
      for (const node of nodes) {
        node.x = node.fromX + (node.tx - node.fromX) * eased;
        node.y = node.fromY + (node.ty - node.fromY) * eased;
      }
      // Reframe as it moves, so the arrangement is never half off the edge.
      fit();
      if (t >= 1) {
        transition = null;
        if (!focused) reheat(0.7);
      }
    } else if (!focused) {
      // Physics belong to the islands. An opened node keeps its ring.
      if (alpha > settings.minAlpha) {
        step();
        if (alpha <= settings.minAlpha) {
          for (const node of nodes) {
            node.homeX = node.x;
            node.homeY = node.y;
          }
          drifting = true;
          if (!userAdjusted) fit();
        }
      } else if (drifting && !reducedMotion) {
        drift(now);
      }
    }

    draw();

    const keepGoing =
      transition || dragging || alpha > settings.minAlpha || (drifting && !reducedMotion && !focused);
    if (keepGoing && !document.hidden) {
      frame = requestAnimationFrame(tick);
    } else {
      running = false;
      if (fitWhenSettled && !transition) {
        fitWhenSettled = false;
        if (!userAdjusted) fit();
      }
      draw();
    }
  }

  /**
   * The islands breathe. Each blot wanders a few pixels around where the
   * simulation left it, on its own slow period, so the map is alive without
   * ever moving far enough to make you chase it.
   */
  function drift(now) {
    for (const node of nodes) {
      if (node === dragging || node.homeX === undefined) continue;
      node.x = node.homeX + Math.cos(now * node.drift.rate + node.drift.phase) * 9;
      node.y = node.homeY + Math.sin(now * node.drift.rate * 0.8 + node.drift.phase * 1.7) * 7;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) run();
  });

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

  /**
   * What a node is allowed to say at this zoom, and how much of it.
   *
   * Far out, the map should read as territory: only the tags that actually
   * organise the library are named, and no titles at all — a title is detail,
   * and detail is what coming closer is for. Each step in tightens the bar on
   * tags and lets more of each title through. Whatever you are pointing at is
   * always named in full, wherever you are standing.
   *
   * Returns { limit } in characters, or null for "say nothing".
   */
  function labelPolicy(node, active, nearFocus) {
    const closeness = view.k / (overview || 1);
    if (active) return { limit: node.type === 'tag' ? 30 : 76 };

    // On the islands the tags are the whole content, so they are all named and
    // the collision pass decides which fit. Inside an opened view everything on
    // screen is there because you asked for it, so it is named too — the map
    // only rations names when it is showing you the whole library at once.
    if (!focused) return node.type === 'tag' ? { limit: 26 } : null;
    if (node === focused) return { limit: node.type === 'tag' ? 30 : 76 };
    if (node.type === 'tag') return { limit: 26 };
    if (nearFocus || closeness >= 1.6) return { limit: 46 };
    return { limit: 30 };
  }

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

    // Lines first, so the ink sits on top of them. The islands have none: the
    // tags are laid out by their affinities, but drawing every one of those
    // would be the hairball this view exists to avoid.
    for (const link of drawLinks ? links : []) {
      const muted = isMuted(link.a) || isMuted(link.b);
      const lit = focus && focus.has(link.a.id) && focus.has(link.b.id);
      const a = toScreen(link.a);
      const b = toScreen(link.b);

      // Line weight follows the zoom only so far. Past that the lines stop
      // being connections and start being the picture.
      const stroke = Math.min(view.k, 1.3);
      if (link.kind === 'kin') {
        ctx.strokeStyle = lit ? THEME.ink : muted ? 'rgba(16,15,13,0.07)' : 'rgba(16,15,13,0.42)';
        ctx.lineWidth = Math.max((lit ? 1.5 : 1) * stroke, 0.6);
      } else {
        ctx.strokeStyle = lit ? 'rgba(16,15,13,0.55)' : muted ? 'rgba(16,15,13,0.04)' : 'rgba(16,15,13,0.16)';
        ctx.lineWidth = Math.max(0.8 * stroke, 0.4);
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
        ctx.fillStyle = THEME.ink;
        traceBlob(ctx, node.blob, x, y, radius);
        ctx.fill();
        if (active) {
          ctx.strokeStyle = THEME.ink;
          ctx.lineWidth = 1.2;
          traceBlob(ctx, node.blob, x, y, radius + 6 * view.k);
          ctx.stroke();
        }

        // A Miró accent on the tag that names its cluster.
        const cluster = clusters[node.cluster ?? -1];
        if (cluster && cluster.tags?.[0] === node.slug) {
          ctx.fillStyle = THEME.accents[(node.cluster ?? 0) % THEME.accents.length];
          ctx.beginPath();
          ctx.arc(x + radius * 0.82, y - radius * 0.72, Math.max(radius * 0.2, 2.5), 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.strokeStyle = THEME.ink;
        ctx.lineWidth = Math.max((active ? 2.2 : 1.4) * view.k, 0.8);
        crossInCircle(ctx, x, y, radius);
        ctx.stroke();
        if (active) {
          ctx.beginPath();
          ctx.arc(x, y, radius + 5 * view.k, 0, Math.PI * 2);
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      const nearFocus = Boolean(focus && focus.has(node.id));
      const policy = muted ? null : labelPolicy(node, active, nearFocus);
      if (policy) {
        labelQueue.push({
          node,
          policy,
          x,
          y: y + radius + 6,
          // The heaviest tags claim label space first: they are the ones a
          // reader needs to orient by.
          priority: (active ? 1000 : 0) + (nearFocus ? 400 : 0) +
            (node.type === 'tag' ? 100 + (node.count ?? 0) * 4 : node.weight ?? 0),
        });
      }
    }

    /*
     * Labels last, and only where they fit. A constellation with every name
     * printed over every other name is unreadable, so the most important
     * label in any patch of the map wins and the rest wait for a zoom.
     */
    labelQueue.sort((a, b) => b.priority - a.priority);
    const occupied = avoid();
    const overlaps = (box) =>
      occupied.some(
        (other) =>
          box.x < other.x + other.w &&
          box.x + box.w > other.x &&
          box.y < other.y + other.h &&
          box.y + box.h > other.y,
      );

    for (const entry of labelQueue) {
      const { node, policy } = entry;
      const active = hovered === node || selected === node;
      // A tag's name is sized like the tag: the bigger the territory, the
      // louder it is allowed to be.
      ctx.font =
        node.type === 'tag'
          ? `${Math.max(11, Math.min(18, 10.5 + (node.count ?? 1) * 0.5))}px "Tremplin", "Century Gothic", system-ui, sans-serif`
          : '12px "EB Garamond", Georgia, serif';

      const { limit } = policy;
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
      // Research marks are deliberately small, so the target is not: a node is
      // always at least a comfortable thumb-width to hit, however far out you are.
      const reach = Math.max(node.radius * view.k, 10) + 6;
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

  /**
   * One gesture drives the whole map. Open a node and the graph rearranges
   * around it; click the empty ground and you are back on the islands.
   */
  function choose(node) {
    if (!node) {
      if (focused) {
        selected = null;
        onSelect(null);
        setFocus(null);
      } else if (selected) {
        selected = null;
        onSelect(null);
        draw();
      }
      return;
    }
    selected = node.type === 'source' ? node : null;
    onSelect(selected);
    setFocus(node);
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
    /** Open a node by id — used by the record panel's "read alongside" list. */
    open(id) {
      const node = allById.get(id);
      if (!node) return;
      selected = node.type === 'source' ? node : null;
      onSelect(selected);
      setFocus(node);
    },
    /** What is currently open, or null for the islands. */
    opened: () => focused,
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
      if (focused) {
        selected = null;
        onSelect(null);
        setFocus(null);
        return;
      }
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
