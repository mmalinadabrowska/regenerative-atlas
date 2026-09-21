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

import { INK, blobPoints, crossInCircle, inkLine, rng, seedOf, traceBlob, washFor } from './ink.js';

/** Long enough to read as the map turning over rather than a cut. */
const TRANSITION_MS = 3000;

const THEME = {
  paper: '#f2ecdf',
  ink: INK,
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
  /** The marks the last arrangement had and this one does not, fading out. */
  let leaving = { nodes: [], links: [], islands: false };

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
  // Set by the record panel while you run down its list of research, so the
  // page and the map point at the same thing.
  let highlighted = null;
  let dragging = null;
  let panning = null;
  // The gesture in progress, and whether it has become a drag. A press is a tap
  // until it has travelled far enough not to be one.
  let gesture = null;
  // Every finger currently on the glass, and the pinch two of them make.
  const touching = new Map();
  let pinch = null;
  let dimmed = new Set();

  const settings = {
    repulsion: 260,
    theta: 0.9,
    // Affinity is what holds an island together — two tags pulled towards each
    // other by the research they share. It is the strongest, shortest tie on
    // the map because a theme has to read as one place from across the room.
    linkStrength: { tagged: 0.07, kin: 0.02, affinity: 0.1 },
    linkDistance: { tagged: 92, kin: 190, affinity: 74 },
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

  /**
   * Where the camera would sit to frame the constellation with a margin, so no
   * part of it is lost. `targets` reads the arrangement being travelled to
   * rather than the one on screen: during a rearrangement the destination is
   * the only stable thing to aim at, and framing the journey is what made the
   * camera swing wide and come back.
   */
  function frameOf({ targets = false, padding = 90 } = {}) {
    if (nodes.length === 0) return null;
    const gap = inset();
    const frame = {
      left: gap.left ?? 0,
      top: gap.top ?? 0,
      width: Math.max(width - (gap.left ?? 0) - (gap.right ?? 0), 120),
      height: Math.max(height - (gap.top ?? 0) - (gap.bottom ?? 0), 120),
    };

    // With a record open on a phone there is a band of map left rather than a
    // page of it. The orbit is the widest thing on screen and the quietest, so
    // in a band that shallow it is left out of the reckoning: what you opened
    // and what it is joined to get the room instead.
    const shallow = frame.height < 260;
    const framed = shallow ? nodes.filter((node) => !node.isHalo) : nodes;

    // Margin scales with the frame: ninety pixels is breathing room on a laptop
    // and a third of a phone.
    const margin = Math.min(padding, frame.width * 0.08, frame.height * 0.08);
    const ceiling = focused ? 1.7 : 2.8;

    // What the marks and their names occupy, at a given scale. Names are drawn
    // at a fixed size in screen pixels, so how much of the world they cover
    // depends on the very scale being solved for — hence the passes below.
    function boundsAt(k) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const node of framed.length ? framed : nodes) {
        const nx = targets ? node.tx ?? node.x : node.x;
        const ny = targets ? node.ty ?? node.y : node.y;
        minX = Math.min(minX, nx - node.radius);
        minY = Math.min(minY, ny - node.radius);
        maxX = Math.max(maxX, nx + node.radius);
        maxY = Math.max(maxY, ny + node.radius);
        const name = k > 0 ? labelExtent(node) : null;
        if (!name) continue;
        minX = Math.min(minX, nx - name.width / 2 / k);
        maxX = Math.max(maxX, nx + name.width / 2 / k);
        maxY = Math.max(maxY, ny + node.radius + name.drop / k);
      }
      return { minX, minY, maxX, maxY };
    }

    // Fit the marks, then fit them again knowing how much room their names took
    // at that scale, and once more to settle it. A measured allowance beats a
    // fixed one: a flat reserve wide enough for a long name on a laptop is a
    // third of a phone, which is what used to leave the map adrift in the middle
    // of a small screen.
    let bounds = boundsAt(0);
    let k = ceiling;
    for (let pass = 0; pass < 3; pass++) {
      const spanX = Math.max(bounds.maxX - bounds.minX, 1);
      const spanY = Math.max(bounds.maxY - bounds.minY, 1);
      // The islands are allowed to fill the frame: the blots are the content
      // there, not a summary of it. The floor only stops the marks becoming
      // dust — it must never be what keeps the map from fitting on a small
      // screen.
      k = Math.min(
        ceiling,
        Math.max(
          0.25,
          Math.min((frame.width - margin * 2) / spanX, (frame.height - margin * 2) / spanY),
        ),
      );
      bounds = boundsAt(k);
    }

    return {
      k,
      x: frame.left + frame.width / 2 - ((bounds.minX + bounds.maxX) / 2) * k,
      y: frame.top + frame.height / 2 - ((bounds.minY + bounds.maxY) / 2) * k,
    };
  }

  /**
   * How wide a node's name is drawn, and how far below the mark it hangs — in
   * screen pixels, since that is how names are drawn. Measured once per node
   * and kept: the text and its font only change when the library does.
   */
  const labelSizes = new Map();
  function labelExtent(node) {
    const policy = labelPolicy(node, node === focused, false);
    if (!policy) return null;
    const key = `${node.id}|${policy.limit}`;
    const known = labelSizes.get(key);
    if (known) return known;
    ctx.save();
    ctx.font = labelFont(node);
    const text = node.label.length > policy.limit
      ? `${node.label.slice(0, policy.limit - 1)}\u2026`
      : node.label;
    // A long name is allowed to hang over the edge a little rather than pull the
    // whole arrangement smaller: past a point the fit would be framing a line of
    // type instead of a map.
    const size = { width: Math.min(ctx.measureText(text).width, 140), drop: 22 };
    ctx.restore();
    labelSizes.set(key, size);
    return size;
  }

  // One face for everything written on the map. A tag's name is sized like the
  // tag — the bigger the territory, the louder it is allowed to be — and a
  // piece of research is named at the quiet end of the same scale, so weight
  // still tells you what you are looking at where the face no longer does.
  // Shared with the fit, so it measures the type the drawing will use.
  const TYPEFACE = '"Tremplin", "Century Gothic", system-ui, sans-serif';

  const labelFont = (node) =>
    node.type === 'tag'
      ? `${Math.max(11, Math.min(18, 10.5 + (node.count ?? 1) * 0.5))}px ${TYPEFACE}`
      : `11.5px ${TYPEFACE}`;

  // The face arrives after the first paint, and a name measured in whatever
  // stood in for it is the wrong width for the one that turns up — a width the
  // fit is then framed to and the cache would keep for good. So the
  // measurements are forgotten and the map drawn again, and reframed too unless
  // the reader has taken the camera by then.
  document.fonts?.ready.then(() => {
    labelSizes.clear();
    if (userAdjusted) draw();
    else fit();
  });

  /** Frame what is on screen now. */
  function fit(padding = 90) {
    const next = frameOf({ padding });
    if (!next) return;
    view.k = next.k;
    view.x = next.x;
    view.y = next.y;
    overview = next.k;
    draw();
  }

  /* --- layout ----------------------------------------------------------- */

  /** Cluster anchors sit on a ring, largest cluster first, so the map has regions. */
  function anchorFor(cluster) {
    if (cluster === null || cluster === undefined || clusters.length === 0) return { x: 0, y: 0 };
    const count = clusters.length;
    const angle = (cluster / count) * Math.PI * 2 - Math.PI / 2;
    const radius = count > 1 ? layoutRadius() : 0;
    // The archipelago takes the shape of the frame it is in — a wide band on a
    // laptop, a tall one on a phone held upright — so it fills the screen either
    // way instead of leaving half of it empty.
    const squash = focused
      ? Math.min(1, Math.max(0.5, height / Math.max(width, 1)))
      : Math.min(2.2, Math.max(0.7, (height / Math.max(width, 1)) * 1.25));
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

    // Every tag gets its own wash, the way a geological sheet gives every
    // formation its own colour. Alphabetical order only decides who is first in
    // the queue; the ramp itself puts consecutive tags most of a wheel apart, so
    // no two blots on screen are the same colour or close to it.
    library.nodes
      .filter((node) => node.type === 'tag')
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .forEach((node, index) => {
        node.wash = washFor(index);
      });

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

  /** Everything one hop from a node, whatever kind it is. */
  function neighboursOf(node) {
    if (node.type === 'tag') return sourcesOfTag.get(node.id) ?? [];
    return [
      ...(tagsOfSource.get(node.id) ?? []),
      ...(kinOf.get(node.id) ?? []).map((k) => k.other),
    ];
  }

  /**
   * What is two hops out: the things the ring is attached to that you are not
   * looking at yet. They orbit faintly outside the arrangement — enough to show
   * that the map continues past this view, not enough to compete with it.
   * Ranked by how many of the ring they hang off, so the orbit is the places
   * this neighbourhood actually leads.
   */
  const HALO_LIMIT = 22;

  function secondOrder(centre, shown) {
    const reach = new Map();
    for (const node of nodes) {
      if (node === centre) continue;
      for (const other of neighboursOf(node)) {
        if (shown.has(other.id) || other === centre) continue;
        if (!reach.has(other.id)) reach.set(other.id, { node: other, via: node, ties: 0 });
        reach.get(other.id).ties += 1;
      }
    }
    return [...reach.values()]
      .sort(
        (a, b) =>
          b.ties - a.ties ||
          (b.node.count ?? b.node.weight ?? 0) - (a.node.count ?? a.node.weight ?? 0) ||
          a.node.label.localeCompare(b.node.label),
      )
      .slice(0, HALO_LIMIT);
  }

  /**
   * Park the orbit on a ring outside everything else, each one near whatever it
   * hangs off, so a faint line has only a short way to travel.
   */
  function orbitLayout(halo) {
    if (halo.length === 0) return;
    const inner = Math.max(...nodes.map((n) => Math.hypot(n.tx, n.ty)), 1);
    const radius = inner + 170;

    // Each one wants to sit in the direction of whatever it hangs off. Sorting
    // by that and then spacing evenly keeps the association legible without
    // letting four things that share a parent pile up on the same spot.
    const wanted = halo.map((entry) => ({
      ...entry,
      towards: Math.atan2(entry.via.ty, entry.via.tx),
    }));
    wanted.sort((a, b) => a.towards - b.towards);

    const strongest = Math.max(...wanted.map((e) => e.ties), 1);
    const start = wanted[0].towards;
    wanted.forEach((entry, i) => {
      const angle = start + (i / wanted.length) * Math.PI * 2;
      const reach = standoff(radius, { node: entry.node, tie: entry.ties / strongest }, 120);
      entry.node.tx = Math.cos(angle) * reach;
      entry.node.ty = Math.sin(angle) * reach;
    });
  }

  /** A link's identity, for telling a link that is staying from one arriving. */
  const linkKey = (link) => `${link.a.id}>${link.b.id}:${link.kind}`;

  /** What is on screen, given what is open. */
  function compose({ animate = true } = {}) {
    const from = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    const previouslyPlaced = new Set(nodes.map((n) => n.id));
    const wasDrawn = drawLinks ? links : [];
    const wasShown = nodes;
    const wasIslands = !drawLinks;
    const heldKeys = new Set(wasDrawn.map(linkKey));

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
      // How much of this neighbourhood each source is bound into: kinship with
      // the others filed here draws it towards the middle.
      const kinHere = new Set(sources.map((s) => s.id));
      ringLayout(focused, [
        weighRing(sources, (source) =>
          (kinOf.get(source.id) ?? []).filter((k) => kinHere.has(k.other.id)).length,
        ),
      ]);
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
      //
      // A tag draws in by how many of these relatives are also filed under it —
      // the ground they actually share. A relative draws in by how close the
      // kinship is.
      const kinWeight = new Map(
        (kinOf.get(focused.id) ?? []).map((k) => [k.other.id, k.weight]),
      );
      fanLayout(
        focused,
        weighRing(tags, (tag) =>
          kin.filter((source) => (tagsOfSource.get(source.id) ?? []).includes(tag)).length,
        ),
        weighRing(kin, (source) => kinWeight.get(source.id) ?? 0),
      );
    }

    for (const node of library.nodes) node.isHalo = false;

    if (focused) {
      const halo = secondOrder(focused, new Set(nodes.map((n) => n.id)));
      orbitLayout(halo);
      for (const { node, via } of halo) {
        node.isHalo = true;
        nodes.push(node);
        links.push({ a: via, b: node, kind: 'halo', weight: 0.4 });
      }
    }

    byId = new Map(nodes.map((n) => [n.id, n]));

    // What this rearrangement adds, and what it takes away. Everything arriving
    // fades up over the second half and everything leaving fades down over the
    // first, so a click is a dissolve rather than a cut: the old picture is
    // never replaced in the frame you clicked in.
    for (const node of nodes) node.arriving = !previouslyPlaced.has(node.id);
    for (const link of links) link.arriving = !heldKeys.has(linkKey(link));
    leaving = {
      nodes: wasShown.filter((n) => !byId.has(n.id)),
      links: wasDrawn.filter((l) => !links.some((k) => linkKey(k) === linkKey(l))),
      islands: wasIslands,
    };

    neighbours = new Map(nodes.map((n) => [n.id, new Set()]));
    for (const link of links) {
      neighbours.get(link.a.id)?.add(link.b.id);
      neighbours.get(link.b.id)?.add(link.a.id);
    }

    drifting = false;
    userAdjusted = false;
    hovered = null;
    highlighted = null;

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
      transition = { at: performance.now(), until: TRANSITION_MS, fromView: { ...view } };
      // Set here as well as in the tick, so the frame between composing and the
      // first animation frame is the old picture rather than a flash of the new.
      enterFade = 0;
      exitFade = 1;
      labelFade = 1;
      run();
    } else {
      for (const node of nodes) {
        node.x = node.tx;
        node.y = node.ty;
      }
      transition = null;
      leaving = { nodes: [], links: [], islands: false };
      fitWhenSettled = true;
      if (!focused) reheat(1);
      else {
        fit();
        run();
      }
    }
  }

  /**
   * Sort a ring so that things of a kind, and things that are alike, adjoin,
   * and score each one on how tied it is to what you opened.
   *
   * The tie decides how far out it sits: closely bound things draw in, loose
   * ones hang back. That is what breaks the ring out of being a circle — the
   * distance means something rather than being uniform for its own sake.
   * `tieOf` returns any positive number; it is normalised against the ring.
   */
  function weighRing(list, tieOf) {
    const scored = [...list].sort(
      (a, b) =>
        (a.cluster ?? 99) - (b.cluster ?? 99) ||
        (b.count ?? b.weight ?? 0) - (a.count ?? a.weight ?? 0) ||
        a.label.localeCompare(b.label),
    );
    const ties = scored.map((node) => Math.max(tieOf(node), 0));
    const strongest = Math.max(...ties, 1);
    return scored.map((node, i) => ({ node, tie: ties[i] / strongest }));
  }

  /**
   * How far out one member sits. Weakly tied things fall back by up to a whole
   * step, and each is nudged a little off the true radius by its own seed, so
   * even an evenly tied ring never draws as a compass circle.
   */
  function standoff(radius, entry, step) {
    const loose = (1 - entry.tie) * step * 0.9;
    const wobble = ((entry.node.seed % 1000) / 1000 - 0.5) * step * 0.28;
    return radius + loose + wobble;
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
      const spacing = Math.max(...ring.map((e) => e.node.radius)) * 2 + 66;
      radius = Math.max(radius, (spacing * ring.length) / (Math.PI * 2));
      ring.forEach((entry, i) => {
        const angle = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
        const reach = standoff(radius, entry, spacing);
        entry.node.tx = Math.cos(angle) * reach;
        entry.node.ty = Math.sin(angle) * reach * 0.86;
      });
      radius += spacing * 1.6;
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
      const spacing = Math.max(...list.map((e) => e.node.radius)) * 2 + 76;
      if (list.length === 1) {
        list[0].node.tx = Math.cos(towards) * standoff(minRadius, list[0], spacing);
        list[0].node.ty = 0;
        return;
      }
      const span = Math.min(Math.PI * 0.8, 0.34 * (list.length - 1));
      const radius = Math.max(minRadius, (spacing * (list.length - 1)) / span);
      list.forEach((entry, i) => {
        const angle = towards - span / 2 + (i / (list.length - 1)) * span;
        const reach = standoff(radius, entry, spacing);
        entry.node.tx = Math.cos(angle) * reach;
        entry.node.ty = Math.sin(angle) * reach;
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

  /**
   * How readable the names are, part way through a rearrangement.
   *
   * They dissolve before anything moves far, stay gone while it moves, and
   * resolve once it is nearly settled. Text sliding across the screen is
   * unreadable and makes the movement feel like an error; text that clears out
   * and comes back makes it feel like the map turning over.
   */
  function labelOpacity(t) {
    if (t < 0.18) return 1 - t / 0.18;
    if (t < 0.62) return 0;
    return (t - 0.62) / 0.38;
  }

  /**
   * The same dissolve, for the marks themselves. What is leaving goes out while
   * everything is still near where you last saw it; what is arriving comes up
   * once the movement is nearly done. In between, the marks that are staying
   * carry the eye across on their own.
   */
  const smooth = (t) => t * t * (3 - 2 * t);
  const clamp01 = (t) => Math.min(Math.max(t, 0), 1);
  const exitOpacity = (t) => smooth(clamp01(1 - t / 0.34));
  const enterOpacity = (t) => smooth(clamp01((t - 0.52) / 0.48));

  let labelFade = 1;
  let enterFade = 1;
  let exitFade = 0;

  function tick(now = performance.now()) {
    if (transition) {
      const t = Math.min((now - transition.at) / transition.until, 1);
      const eased = easeInOut(t);
      labelFade = labelOpacity(t);
      enterFade = enterOpacity(t);
      exitFade = exitOpacity(t);
      for (const node of nodes) {
        node.x = node.fromX + (node.tx - node.fromX) * eased;
        node.y = node.fromY + (node.ty - node.fromY) * eased;
      }
      // The camera travels to where the arrangement is going, on the same
      // easing as the marks — not to where it happens to be part way there.
      // Aimed at the journey it swung wide and came back; aimed at the
      // destination it moves once. Anything clipped on the way is fine.
      const target = frameOf({ targets: true });
      if (target) {
        view.k = transition.fromView.k + (target.k - transition.fromView.k) * eased;
        view.x = transition.fromView.x + (target.x - transition.fromView.x) * eased;
        view.y = transition.fromView.y + (target.y - transition.fromView.y) * eased;
        overview = view.k;
      }
      if (t >= 1) {
        transition = null;
        leaving = { nodes: [], links: [], islands: false };
        labelFade = 1;
        enterFade = 1;
        exitFade = 0;
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
      const pull = node.type === 'tag' ? settings.clusterGravity * 3.4 : settings.clusterGravity;
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
  /**
   * The mark you are pointing at, or have just opened. Its name is the one you
   * were reading when you clicked, so it is the one name that does not dissolve
   * with the rest: it stays put and the map rearranges around it.
   */
  const held = (node) =>
    node === hovered || node === highlighted || node === selected || node === focused;

  function labelPolicy(node, active, nearFocus) {
    const closeness = view.k / (overview || 1);
    if (active) return { limit: node.type === 'tag' ? 30 : 76 };

    // On the islands the tags are the whole content, so they are all named and
    // the collision pass decides which fit. Inside an opened view everything on
    // screen is there because you asked for it, so it is named too — the map
    // only rations names when it is showing you the whole library at once.
    if (!focused) return node.type === 'tag' ? { limit: 26 } : null;
    if (node === focused) return { limit: node.type === 'tag' ? 30 : 76 };
    // The orbit stays quiet until you point at it, or it would be a second
    // ring of names competing with the one you opened.
    if (node.isHalo) return nearFocus ? { limit: 24 } : null;
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

  /* --- the ground ------------------------------------------------------- */

  /**
   * The islands are drawn on ground of their own: one outline round each theme,
   * hatched the way a survey sheet hatches a formation it has no colour left
   * for. It says what the layout already says — these tags belong together —
   * but says it to the eye at a glance, before a single name is read.
   *
   * Everything here is deliberately faint. The territories are the bottom layer
   * of the drawing and must never compete with the blots sitting on them.
   */
  /*
   * Ten fills, the way a survey sheet distinguishes ten formations it has no
   * colour left for: rules at four angles, two crossings, a stipple, a dotted
   * rule, a dot-dash, and one that is a wide rule with a row of dots between.
   * Distances are in multiples of the hatch spacing, so every one of them keeps
   * its texture at any zoom.
   */
  const HATCHES = [
    { lines: [{ angle: 45 }] },
    { lines: [{ angle: 135 }] },
    { lines: [{ angle: 45 }, { angle: 135 }] },
    { lines: [{ angle: 90 }] },
    { lines: [{ angle: 0 }] },
    { lines: [{ angle: 0 }, { angle: 90 }] },
    { dots: { stagger: true } },
    { lines: [{ angle: 22, dash: [0, 1.4] }] },
    { lines: [{ angle: 112, dash: [2, 1, 0, 1] }] },
    { lines: [{ angle: 68, gap: 2 }], dots: { gap: 2, shift: 1 } },
  ];

  /*
   * Which theme gets which is shuffled once on a fixed seed rather than taken
   * in order: neighbouring islands are numbered in sequence, and reading them
   * off in sequence lays the fills out in a visible progression. Shuffled, the
   * sheet looks like a sheet — no two neighbours obviously related — and it is
   * still the same fill for the same theme every time the page is opened.
   */
  const HATCH_ORDER = (() => {
    const order = HATCHES.map((_, i) => i);
    const random = rng(seedOf('hatches'));
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
  })();

  /**
   * One fill, laid across the box the outline occupies and clipped to it.
   *
   * The lattice is pinned to the middle of the frame rather than to the shape,
   * so a texture does not crawl while its island drifts; only the range drawn
   * comes from the shape, which is what keeps a stipple to a few hundred dots
   * instead of a screenful.
   */
  function paintHatch(spec, box, step, weight) {
    const ox = width / 2;
    const oy = height / 2;
    const corners = [
      [box.x, box.y],
      [box.x + box.w, box.y],
      [box.x, box.y + box.h],
      [box.x + box.w, box.y + box.h],
    ];

    for (const line of spec.lines ?? []) {
      const radians = (line.angle * Math.PI) / 180;
      const dx = Math.cos(radians);
      const dy = Math.sin(radians);
      const gap = step * (line.gap ?? 1);

      let alongMin = Infinity;
      let alongMax = -Infinity;
      let acrossMin = Infinity;
      let acrossMax = -Infinity;
      for (const [px, py] of corners) {
        const rx = px - ox;
        const ry = py - oy;
        const along = rx * dx + ry * dy;
        const across = rx * -dy + ry * dx;
        alongMin = Math.min(alongMin, along);
        alongMax = Math.max(alongMax, along);
        acrossMin = Math.min(acrossMin, across);
        acrossMax = Math.max(acrossMax, across);
      }

      // A rule broken into dots and dashes reads far lighter than a continuous
      // one of the same weight, so it is given a little back.
      ctx.setLineDash((line.dash ?? []).map((n) => Math.max(n * step, 0.01)));
      ctx.lineCap = line.dash ? 'round' : 'butt';
      ctx.lineWidth = line.dash ? weight * 1.7 : weight;
      ctx.beginPath();
      for (let across = Math.ceil(acrossMin / gap) * gap; across <= acrossMax; across += gap) {
        ctx.moveTo(ox + dx * alongMin - dy * across, oy + dy * alongMin + dx * across);
        ctx.lineTo(ox + dx * alongMax - dy * across, oy + dy * alongMax + dx * across);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineCap = 'butt';
    }

    if (!spec.dots) return;
    const gap = step * (spec.dots.gap ?? 1) * 1.2;
    const radius = Math.max(weight * 1.25, 0.6);
    const shift = (spec.dots.shift ?? 0) * gap * 0.5;
    ctx.beginPath();
    for (let j = Math.floor((box.y - oy) / gap); j <= Math.ceil((box.y + box.h - oy) / gap); j++) {
      const y = oy + j * gap + shift;
      const stagger = spec.dots.stagger && Math.abs(j % 2) === 1 ? gap / 2 : 0;
      for (let i = Math.floor((box.x - ox) / gap); i <= Math.ceil((box.x + box.w - ox) / gap); i++) {
        const x = ox + i * gap + stagger;
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }

  /**
   * The outline round a theme.
   *
   * It is the convex hull of the blots in it, each one ringed at arm's length —
   * but drawn as the hull of *discs* rather than of points, which is the whole
   * difference: the hull of a set of points has a corner at every vertex, while
   * the hull of a set of discs is arcs joined by their common tangents and has
   * no corner anywhere. Nothing it draws can turn tighter than the smallest
   * ringed blot on its edge.
   *
   * It is built from the support function h(θ) — how far the boundary stands
   * from the origin in direction θ — sampled all the way round and reassembled
   * by intersecting neighbouring tangent lines. A hand's unevenness is added to
   * h as two slow sine terms rather than as a jitter per corner: a low
   * frequency can only ever bend the outline, where the old per-corner wobble
   * pulled neighbouring points apart and left the kinks this is rid of.
   */
  const TERRITORY_STEPS = 96;

  function territoryPath(members, pad) {
    const discs = members.map((node) => {
      const { x, y } = toScreen(node);
      return { x, y, r: node.radius * view.k + pad };
    });
    if (discs.length === 0) return null;

    /*
     * The hull of the blots would have a corner wherever two of them sit on it,
     * and the corner would be as tight as the blot that made it — a small tag
     * on the edge of a big theme pulls the outline to a point. So the corners
     * are cut before the hull is taken: every blot is drawn in toward the middle
     * of its theme and given back the same distance as radius. The island keeps
     * its reach, since the outermost blot's far edge has not moved, and every
     * turn the outline makes is now at least that distance across.
     */
    const centre = discs.reduce(
      (sum, disc) => ({ x: sum.x + disc.x / discs.length, y: sum.y + disc.y / discs.length }),
      { x: 0, y: 0 },
    );
    const spread = Math.max(
      ...discs.map((disc) => Math.hypot(disc.x - centre.x, disc.y - centre.y) + disc.r),
      1,
    );
    const ease = Math.max(spread * 0.26, pad * 0.6);
    for (const disc of discs) {
      const dx = disc.x - centre.x;
      const dy = disc.y - centre.y;
      const away = Math.hypot(dx, dy);
      if (away > 0.001) {
        const pull = Math.min(ease, away);
        disc.x -= (dx / away) * pull;
        disc.y -= (dy / away) * pull;
      }
      // A shade less than it was pulled in, so rounding the corners does not
      // quietly inflate the theme into its neighbours.
      disc.r += ease * 0.88;
    }

    // How tight the outline is allowed to turn: the smallest ringed blot on it.
    // Everything below is measured against that, because it is the whole budget
    // the shape has for bending.
    const roundness = Math.min(...discs.map((disc) => disc.r));

    // Seeded off the theme, so an island's coastline is its own and keeps it.
    // One slow term only, and a small one. A sway of frequency k takes
    // (k² − 1) × its amplitude out of the radius of curvature, so anything
    // faster than a single lean either flattens the outline or — past the
    // budget — turns it inside out into the spikes this is written to avoid.
    // At a tenth of the roundness the tightest bend left is still half a blot
    // wide. k = 1 is free but useless: it only slides the shape sideways.
    const random = rng(seedOf(`ground:${members[0].cluster}`));
    const sway = {
      k: 2,
      amp: roundness * (0.1 + random() * 0.06),
      phase: random() * Math.PI * 2,
    };

    const outline = (lean) => {
      const lines = [];
      for (let i = 0; i < TERRITORY_STEPS; i++) {
        const angle = (i / TERRITORY_STEPS) * Math.PI * 2;
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        let h = -Infinity;
        for (const disc of discs) h = Math.max(h, disc.x * ux + disc.y * uy + disc.r);
        h += Math.sin(angle * sway.k + sway.phase) * sway.amp * lean;
        lines.push({ ux, uy, h });
      }

      // Where two neighbouring tangents cross is a point on the outline.
      // Sampled this finely the polygon turns less than four degrees at a time,
      // so the curve through it is gentle before any smoothing is asked of it.
      const made = [];
      for (let i = 0; i < TERRITORY_STEPS; i++) {
        const a = lines[i];
        const b = lines[(i + 1) % TERRITORY_STEPS];
        const det = a.ux * b.uy - a.uy * b.ux;
        if (Math.abs(det) < 1e-9) continue;
        made.push([(a.h * b.uy - b.h * a.uy) / det, (a.ux * b.h - b.ux * a.h) / det]);
      }
      return made;
    };

    // Belt and braces: an outline that turns back on itself anywhere is not an
    // outline, so it is redrawn without the lean rather than shown with a spike
    // in it.
    const turnsOneWay = (ring) =>
      ring.every((point, i) => {
        const before = ring[(i - 1 + ring.length) % ring.length];
        const after = ring[(i + 1) % ring.length];
        const ax = point[0] - before[0];
        const ay = point[1] - before[1];
        const bx = after[0] - point[0];
        const by = after[1] - point[1];
        return ax * by - ay * bx >= 0;
      });

    let points = outline(1);
    if (points.length < 3) return null;
    if (!turnsOneWay(points)) points = outline(0);
    if (points.length < 3) return null;

    // What the fill has to cover. Taken from the points themselves, so it is
    // the drawn outline it bounds rather than the discs it came from.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    const box = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };

    const path = new Path2D();
    const at = (i) => points[((i % points.length) + points.length) % points.length];
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const start = mid(at(0), at(1));
    path.moveTo(start[0], start[1]);
    for (let i = 1; i <= points.length; i++) {
      const control = at(i);
      const end = mid(control, at(i + 1));
      path.quadraticCurveTo(control[0], control[1], end[0], end[1]);
    }
    path.closePath();
    return { path, box };
  }

  function paintTerritories(alphaOf) {
    if (alphaOf < 0.01) return;

    const groups = new Map();
    for (const node of nodes) {
      if (node.type !== 'tag' || node.cluster == null) continue;
      if (!groups.has(node.cluster)) groups.set(node.cluster, []);
      groups.get(node.cluster).push(node);
    }

    // The padding is also the outline's roundness: the hull of the padded blots
    // cannot turn tighter than the smallest of them, so a little more of it
    // buys a gentler coastline everywhere.
    const pad = Math.max(22 * view.k, 14);
    const step = Math.max(9 * view.k, 6);

    for (const [cluster, members] of groups) {
      if (members.length < 2) continue;
      const territory = territoryPath(members, pad);
      if (!territory) continue;
      const { path, box } = territory;

      ctx.save();
      ctx.globalAlpha = alphaOf;
      ctx.clip(path);
      // The fill is drawn straight onto the canvas and clipped to the outline:
      // cheaper than a pattern, and it stays put when the map is panned because
      // it is laid out in screen space with the marks.
      const weight = Math.max(0.55 * view.k, 0.45);
      ctx.strokeStyle = 'rgba(16,15,13,0.16)';
      ctx.fillStyle = 'rgba(16,15,13,0.22)';
      ctx.lineWidth = weight;
      paintHatch(HATCHES[HATCH_ORDER[cluster % HATCH_ORDER.length]], box, step, weight);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = alphaOf;
      ctx.strokeStyle = 'rgba(16,15,13,0.38)';
      ctx.lineWidth = Math.max(1 * Math.min(view.k, 1.4), 0.8);
      ctx.lineJoin = 'round';
      ctx.stroke(path);
      ctx.restore();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = THEME.paper;
    ctx.fillRect(0, 0, width, height);

    const focus = focusSet();
    const isMuted = (node) =>
      (focus && !focus.has(node.id)) || (dimmed.size > 0 && dimmed.has(node.id));

    // The themes' ground, under everything, and only on the islands: inside an
    // opened view you are looking at one thing and its ties, not at territory.
    // It comes and goes on the same dissolve the islands themselves do.
    if (!focused) paintTerritories(transition ? enterFade : 1);
    else if (leaving.islands) paintTerritories(exitFade);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Lines first, so the ink sits on top of them. The islands have none: the
    // tags are laid out by their affinities, but drawing every one of those
    // would be the hairball this view exists to avoid. The lines the last
    // arrangement had go under the ones this one is bringing up.
    for (const link of leaving.links) paintLink(link, exitFade);
    for (const link of drawLinks ? links : []) paintLink(link, link.arriving ? enterFade : 1);

    function paintLink(link, alpha) {
      if (alpha < 0.01) return;
      const muted = isMuted(link.a) || isMuted(link.b);
      const lit = focus && focus.has(link.a.id) && focus.has(link.b.id);
      const a = toScreen(link.a);
      const b = toScreen(link.b);
      ctx.globalAlpha = alpha;

      // Line weight follows the zoom only so far. Past that the lines stop
      // being connections and start being the picture.
      const stroke = Math.min(view.k, 1.3);
      if (link.kind === 'halo') {
        ctx.strokeStyle = lit ? 'rgba(16,15,13,0.4)' : 'rgba(16,15,13,0.11)';
        ctx.lineWidth = Math.max(0.7 * stroke, 0.4);
      } else if (link.kind === 'kin') {
        ctx.strokeStyle = lit ? THEME.ink : muted ? 'rgba(16,15,13,0.07)' : 'rgba(16,15,13,0.42)';
        ctx.lineWidth = Math.max((lit ? 1.5 : 1) * stroke, 0.6);
      } else {
        ctx.strokeStyle = lit ? 'rgba(16,15,13,0.55)' : muted ? 'rgba(16,15,13,0.04)' : 'rgba(16,15,13,0.16)';
        ctx.lineWidth = Math.max(0.8 * stroke, 0.4);
      }
      inkLine(ctx, a.x, a.y, b.x, b.y, link.kind === 'kin' ? 0.05 : 0.02);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Glyphs. What is on its way out is drawn first and underneath, at whatever
    // is left of it.
    const labelQueue = [];

    for (const node of leaving.nodes) paintNode(node, exitFade, null);
    for (const node of nodes) paintNode(node, node.arriving ? enterFade : 1, labelQueue);

    function paintNode(node, alpha, queue) {
      if (alpha < 0.01) return;
      const { x, y } = toScreen(node);
      let radius = (node.isHalo ? Math.min(node.radius * 0.66, 15) : node.radius) * view.k;
      // A piece of research is a crosshair in a circle — the mark it wears in
      // the record card — and under about seven pixels a crosshair is a dot.
      // The glyph stops shrinking there while the map goes on zooming out.
      if (node.type === 'source') radius = Math.max(radius, node.isHalo ? 5 : 7);
      if (x < -160 || y < -160 || x > width + 160 || y > height + 160) return;

      const muted = isMuted(node);
      const lit = hovered === node || highlighted === node;
      const active = lit || selected === node || focused === node;
      const orbiting = node.isHalo && !active;
      ctx.globalAlpha = (muted ? 0.16 : orbiting ? 0.3 : 1) * alpha;

      if (node.type === 'tag') {
        const wash = node.wash ?? THEME.ink;
        ctx.fillStyle = wash;
        traceBlob(ctx, node.blob, x, y, radius);
        ctx.fill();
        // Pointed at or opened, a shape is drawn round in ink — an outline on
        // the shape itself rather than a halo around it, so it reads as the
        // same blot picked out rather than a second mark.
        if (active) {
          ctx.strokeStyle = THEME.ink;
          ctx.lineWidth = Math.max(2 * view.k, 1.2);
          ctx.lineJoin = 'round';
          traceBlob(ctx, node.blob, x, y, radius);
          ctx.stroke();
        }

        // An ink dot on the tag that names its cluster — ink, now that the blot
        // under it carries a colour of its own.
        const cluster = clusters[node.cluster ?? -1];
        if (cluster && cluster.tags?.[0] === node.slug) {
          ctx.fillStyle = THEME.ink;
          ctx.beginPath();
          ctx.arc(x + radius * 0.82, y - radius * 0.72, Math.max(radius * 0.2, 2.5), 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // A piece of research is a crosshair in a circle, wherever it appears.
        // Pointed at, it fills in: the mark goes to paper on an ink disc, which
        // is the same swap the list in the record card makes.
        if (lit) {
          ctx.fillStyle = THEME.ink;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = lit ? THEME.paper : THEME.ink;
        ctx.lineWidth = Math.max((active ? 1.9 : 1.3) * Math.min(view.k, 1.4), 1);
        crossInCircle(ctx, x, y, radius);
        ctx.stroke();
        // The one you have open is ringed again, outside its own circle: with
        // every mark carrying a circle, that second ring is what tells the point
        // the map is about from the points it is showing you.
        if (selected === node || focused === node) {
          ctx.strokeStyle = THEME.ink;
          ctx.beginPath();
          ctx.arc(x, y, radius + 5 * Math.min(view.k, 1.4), 0, Math.PI * 2);
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      if (!queue) return;
      const nearFocus = Boolean(focus && focus.has(node.id));
      const policy = muted ? null : labelPolicy(node, active, nearFocus);
      if (policy) {
        queue.push({
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
    // Mid-dissolve the rest of the names are gone, and placing them would only
    // reserve space against positions that are still moving. The name you are
    // holding is still placed, and still drawn.
    const dissolved = labelFade < 0.02;
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
      const stays = held(node);
      if (dissolved && !stays) continue;
      const active = stays;
      ctx.font = labelFont(node);

      const { limit } = policy;
      const text = node.label.length > limit ? `${node.label.slice(0, limit - 1)}…` : node.label;
      const metrics = ctx.measureText(text);
      const box = { x: entry.x - metrics.width / 2 - 3, y: entry.y - 2, w: metrics.width + 6, h: 16 };

      if (!active && overlaps(box)) continue;
      occupied.push(box);

      ctx.globalAlpha = stays ? 1 : 0.85 * labelFade;
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

  /** The two fingers of a pinch: how far apart, and the point between them. */
  function spanOf() {
    const [a, b] = [...touching.values()];
    return {
      distance: Math.max(Math.hypot(b.x - a.x, b.y - a.y), 1),
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
  }

  /**
   * A second finger ends whatever the first one was doing. Nothing it had begun
   * is worth finishing — a blot half-dragged towards a pinch is not a drag, and
   * the tap it would otherwise have counted as is not a tap either.
   */
  function startPinch() {
    dragging = null;
    panning = null;
    gesture = null;
    canvas.classList.remove('is-dragging');
    const span = spanOf();
    pinch = { ...span, k: view.k, viewX: view.x, viewY: view.y };
    userAdjusted = true;
  }

  canvas.addEventListener('pointermove', (event) => {
    if (touching.has(event.pointerId)) {
      touching.get(event.pointerId).x = event.clientX;
      touching.get(event.pointerId).y = event.clientY;
    }

    // Pinching zooms about the point between the fingers, and carries the map
    // along as that point moves: one gesture for how close you are and where
    // you are, which is how a map is read by hand.
    if (pinch && touching.size >= 2) {
      const rect = canvas.getBoundingClientRect();
      const span = spanOf();
      const next = Math.min(4, Math.max(0.25, pinch.k * (span.distance / pinch.distance)));
      const heldX = (pinch.x - rect.left - pinch.viewX) / pinch.k;
      const heldY = (pinch.y - rect.top - pinch.viewY) / pinch.k;
      view.k = next;
      view.x = span.x - rect.left - heldX * next;
      view.y = span.y - rect.top - heldY * next;
      draw();
      return;
    }

    if (gesture && !gesture.moved) {
      const travelled = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
      if (travelled > gesture.slop) gesture.moved = true;
    }

    if (panning) {
      if (!gesture.moved) return;
      // The camera stops reframing itself once you have moved it yourself —
      // which is now the moment you actually move it, not the moment you touch
      // the glass.
      userAdjusted = true;
      view.x = panning.viewX + (event.clientX - panning.x);
      view.y = panning.viewY + (event.clientY - panning.y);
      draw();
      return;
    }
    if (dragging) {
      // Nothing moves until the press has become a drag, so a tap that wobbles
      // a pixel or two leaves the map exactly as it found it.
      if (!gesture.moved) return;
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
    // Capture can be refused for a pointer the browser has already let go of,
    // and losing it is not a reason to lose the gesture with it.
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      /* followed without it */
    }
    touching.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touching.size >= 2) return startPinch();

    // A thumb is not a mouse: it lands on a wider spot and rolls as it lifts,
    // so it is allowed more travel before the press stops being a tap.
    gesture = {
      x: event.clientX,
      y: event.clientY,
      slop: event.pointerType === 'mouse' ? 4 : 10,
      moved: false,
    };
    const found = nodeAt(event.clientX, event.clientY);
    if (found) {
      dragging = found;
    } else {
      panning = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y };
      canvas.classList.add('is-dragging');
    }
  });

  canvas.addEventListener('pointerup', (event) => {
    // Symmetrical with the capture above: a pointer the browser has already
    // taken back cannot be released, and that is not an error here.
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      /* already let go */
    }
    touching.delete(event.pointerId);
    // A pinch ends with the first finger off, and the one still down is not the
    // beginning of anything: it is the remains of a gesture already had.
    if (pinch) {
      if (touching.size < 2) pinch = null;
      else pinch = { ...spanOf(), k: view.k, viewX: view.x, viewY: view.y };
      return;
    }

    const wasDragging = dragging;
    const wasPanning = panning;
    const moved = gesture?.moved ?? false;
    dragging = null;
    panning = null;
    gesture = null;
    canvas.classList.remove('is-dragging');

    // A drag is a drag and nothing else. Dragging a blot used to open it as
    // well, because the blot follows your finger and so is still under it when
    // you let go — which made every drag a tap, and left you reading a record
    // you did not ask for.
    if (wasDragging) {
      if (moved) return reheat(0.25);
      const found = nodeAt(event.clientX, event.clientY);
      if (found === wasDragging) choose(found);
      return;
    }
    if (wasPanning && !moved) choose(null);
  });

  // A gesture the system takes away — a scroll it decided was a page gesture, a
  // second finger — is over, and it was not a tap.
  canvas.addEventListener('pointercancel', (event) => {
    touching.delete(event.pointerId);
    if (touching.size < 2) pinch = null;
    dragging = null;
    panning = null;
    gesture = null;
    canvas.classList.remove('is-dragging');
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
      // A trackpad pinch arrives here rather than as two pointers, as a wheel
      // event holding ctrl and carrying a much smaller delta. It is the same
      // gesture and should move the map as far.
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.0075 : 0.0016));
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
    // Only a source is a selection. Opening a tag clears one, but saying so
    // would tell the page there is nothing to show — and the page would put the
    // record away a frame before the tag's own record arrives. What is open is
    // announced by the focus below either way.
    if (selected) onSelect(selected);
    setFocus(node);
  }

  /* --- public surface --------------------------------------------------- */

  return {
    setGraph,
    resize,
    fit,
    /** The colour a tag is drawn in, so the panel can carry the same one. */
    washOf(id) {
      return allById.get(id)?.wash ?? null;
    },
    /** Point at a node from outside — the panel's list, running down it. */
    highlight(id) {
      const next = id ? allById.get(id) ?? null : null;
      if (next === highlighted) return;
      highlighted = next;
      draw();
    },
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
      if (selected) onSelect(selected);
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
