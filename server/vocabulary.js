/**
 * The Atlas' controlled vocabulary.
 *
 * Tags are free — anyone can coin one — but a curated core keeps the map from
 * fragmenting into fifty spellings of the same idea. Every incoming tag is
 * slugified and run through the alias table before it is stored, so
 * "Circular Economy", "circular-economy" and "circularity" land on one node.
 *
 * Facets group tags by what kind of thing they describe. The map uses them for
 * hierarchy: a source sits closest to its themes, and formats read as texture
 * rather than territory.
 */

export const FACETS = {
  theme: {
    label: 'Themes',
    note: 'The conceptual territory a source works in.',
  },
  material: {
    label: 'Materials',
    note: 'Physical matter the source is concerned with.',
  },
  method: {
    label: 'Methods',
    note: 'How the work is done, measured or tested.',
  },
  scale: {
    label: 'Scales',
    note: 'The grain the work operates at, from product to bioregion.',
  },
  format: {
    label: 'Formats',
    note: 'What kind of artefact this is to read or use.',
  },
  open: {
    label: 'Open tags',
    note: 'Coined by contributors, not yet part of the core vocabulary.',
  },
};

export const FACET_ORDER = ['theme', 'material', 'method', 'scale', 'format', 'open'];

/**
 * Curated tags: [slug, facet, label, note]
 */
const CORE = [
  // — themes ———————————————————————————————————————————————
  ['regenerative-systems', 'theme', 'Regenerative systems', 'Whole-system thinking that leaves places healthier than it found them.'],
  ['living-systems', 'theme', 'Living systems', 'Buildings and places understood as living, nested wholes.'],
  ['definition', 'theme', 'Definition', 'Texts that argue what regenerative actually means.'],
  ['circular-economy', 'theme', 'Circular economy', 'Keeping materials in use, designing out waste.'],
  ['biomimicry', 'theme', 'Biomimicry', 'Design that learns from how nature makes and adapts.'],
  ['carbon', 'theme', 'Carbon', 'Embodied and operational carbon, drawdown, accounting.'],
  ['biodiversity', 'theme', 'Biodiversity', 'Habitat, net gain, more-than-human inhabitants.'],
  ['soil', 'theme', 'Soil', 'Soil health, agriculture, ground as a living body.'],
  ['water', 'theme', 'Water', 'Catchment, flooding, water as a design system.'],
  ['energy', 'theme', 'Energy', 'Demand, supply, and the metabolism of buildings.'],
  ['place', 'theme', 'Place', 'Working from the specific character of a site.'],
  ['community', 'theme', 'Community', 'Who a project is for and who decides.'],
  ['governance', 'theme', 'Governance', 'Policy, procurement, ownership, regulation.'],
  ['economics', 'theme', 'Economics', 'Value, cost, and the economic models underneath.'],
  ['indigenous-knowledge', 'theme', 'Indigenous knowledge', 'Land relationships that long predate the field.'],
  ['climate-adaptation', 'theme', 'Climate adaptation', 'Designing for the climate that is arriving.'],
  ['degrowth', 'theme', 'Degrowth', 'Sufficiency, limits, building less.'],
  ['health', 'theme', 'Health', 'Human wellbeing, air, light, comfort, toxicity.'],
  ['ecology', 'theme', 'Ecology', 'Ecosystem function and succession as design grounding.'],
  ['justice', 'theme', 'Justice', 'Who carries the cost and who receives the benefit.'],

  // — materials ————————————————————————————————————————————
  ['materials', 'material', 'Materials', 'Material culture, sourcing, specification.'],
  ['bio-based', 'material', 'Bio-based', 'Materials grown rather than extracted.'],
  ['timber', 'material', 'Timber', 'Forestry, engineered timber, wood construction.'],
  ['earth', 'material', 'Earth', 'Rammed earth, cob, clay, unfired ground.'],
  ['straw', 'material', 'Straw', 'Straw bale and agricultural fibre construction.'],
  ['hemp', 'material', 'Hemp', 'Hempcrete and hemp fibre.'],
  ['mycelium', 'material', 'Mycelium', 'Grown fungal composites.'],
  ['stone', 'material', 'Stone', 'Load-bearing and low-processing stone.'],
  ['concrete', 'material', 'Concrete', 'Cement, its emissions, and its alternatives.'],
  ['steel', 'material', 'Steel', 'Steel production, reuse and substitution.'],
  ['reuse', 'material', 'Reuse', 'Salvage, second life, material passports.'],
  ['waste', 'material', 'Waste', 'Demolition, arisings, and what we throw away.'],

  // — methods ——————————————————————————————————————————————
  ['life-cycle-assessment', 'method', 'Life-cycle assessment', 'LCA, EPDs, whole-life measurement.'],
  ['measurement', 'method', 'Measurement', 'Metrics, targets, benchmarks, verification.'],
  ['mapping', 'method', 'Mapping', 'Making the invisible legible — flows, ownership, ecology.'],
  ['participatory-design', 'method', 'Participatory design', 'Co-design, deliberation, shared authorship.'],
  ['retrofit', 'method', 'Retrofit', 'Working with what already stands.'],
  ['modelling', 'method', 'Modelling', 'Simulation, scenarios, digital tools.'],
  ['systems-thinking', 'method', 'Systems thinking', 'Feedback, leverage, stocks and flows.'],
  ['pattern-language', 'method', 'Pattern language', 'Repeatable, named design moves.'],
  ['storytelling', 'method', 'Storytelling', 'Narrative as a way of shifting practice.'],

  // — scales ———————————————————————————————————————————————
  ['product', 'scale', 'Product', 'Objects, components, assemblies.'],
  ['building', 'scale', 'Building', 'The single building as the unit of work.'],
  ['neighbourhood', 'scale', 'Neighbourhood', 'Blocks, streets, shared ground.'],
  ['city', 'scale', 'City', 'Urban systems and municipal scale.'],
  ['bioregion', 'scale', 'Bioregion', 'Watershed and landscape scale.'],
  ['planetary', 'scale', 'Planetary', 'Global boundaries and budgets.'],

  // — formats ——————————————————————————————————————————————
  ['paper', 'format', 'Paper', 'Peer-reviewed or academic writing.'],
  ['report', 'format', 'Report', 'Institutional or industry publication.'],
  ['book', 'format', 'Book', 'Book-length work.'],
  ['essay', 'format', 'Essay', 'Shorter argued writing.'],
  ['framework', 'format', 'Framework', 'A structure for organising practice.'],
  ['diagrams', 'format', 'Diagrams', 'Work whose value is in how it draws the idea.'],
  ['case-study', 'format', 'Case study', 'A built or attempted project, examined.'],
  ['guidance', 'format', 'Guidance', 'Practical how-to for practitioners.'],
  ['standard', 'format', 'Standard', 'Certification, protocol, formal requirement.'],
  ['toolkit', 'format', 'Toolkit', 'Something you use, not only read.'],
  ['dataset', 'format', 'Dataset', 'Open data and databases.'],
  ['talk', 'format', 'Talk', 'Lecture, film, podcast, recorded conversation.'],
  ['glossary', 'format', 'Glossary', 'Vocabulary and terminology work.'],
];

export const CORE_TAGS = CORE.map(([slug, facet, label, note]) => ({ slug, facet, label, note }));

const BY_SLUG = new Map(CORE_TAGS.map((t) => [t.slug, t]));

/**
 * Written form -> canonical slug. Keys are already slugified, so the lookup is
 * done after `slugify` and covers plurals, abbreviations and near-synonyms.
 */
const ALIASES = new Map(Object.entries({
  'regenerative': 'regenerative-systems',
  'regenerative-design': 'regenerative-systems',
  'regenerative-system': 'regenerative-systems',
  'regeneration': 'regenerative-systems',
  'whole-systems': 'systems-thinking',
  'systems': 'systems-thinking',
  'system-thinking': 'systems-thinking',
  'living-system': 'living-systems',
  'definitions': 'definition',
  'defining': 'definition',
  'terminology': 'glossary',
  'circularity': 'circular-economy',
  'circular': 'circular-economy',
  'circular-design': 'circular-economy',
  'cradle-to-cradle': 'circular-economy',
  'biomimetics': 'biomimicry',
  'bio-mimicry': 'biomimicry',
  'biophilia': 'health',
  'biophilic-design': 'health',
  'wellbeing': 'health',
  'embodied-carbon': 'carbon',
  'operational-carbon': 'carbon',
  'whole-life-carbon': 'carbon',
  'net-zero': 'carbon',
  'decarbonisation': 'carbon',
  'decarbonization': 'carbon',
  'nature': 'ecology',
  'nature-based': 'ecology',
  'nature-based-solutions': 'ecology',
  'ecosystems': 'ecology',
  'ecosystem-services': 'ecology',
  'more-than-human': 'biodiversity',
  'rewilding': 'biodiversity',
  'biodiversity-net-gain': 'biodiversity',
  'agriculture': 'soil',
  'farming': 'soil',
  'permaculture': 'soil',
  'agroecology': 'soil',
  'hydrology': 'water',
  'flooding': 'water',
  'watershed': 'bioregion',
  'catchment': 'water',
  'renewables': 'energy',
  'passivhaus': 'energy',
  'passive-house': 'energy',
  'genius-loci': 'place',
  'locality': 'place',
  'bioregionalism': 'bioregion',
  'commons': 'community',
  'co-design': 'participatory-design',
  'coproduction': 'participatory-design',
  'participation': 'participatory-design',
  'policy': 'governance',
  'procurement': 'governance',
  'planning': 'governance',
  'regulation': 'governance',
  'ownership': 'governance',
  'value': 'economics',
  'doughnut-economics': 'economics',
  'indigenous': 'indigenous-knowledge',
  'traditional-knowledge': 'indigenous-knowledge',
  'first-nations': 'indigenous-knowledge',
  'adaptation': 'climate-adaptation',
  'resilience': 'climate-adaptation',
  'overheating': 'climate-adaptation',
  'sufficiency': 'degrowth',
  'build-nothing': 'degrowth',
  'equity': 'justice',
  'climate-justice': 'justice',
  'social-value': 'justice',
  'material': 'materials',
  'material-culture': 'materials',
  'specification': 'materials',
  'biobased': 'bio-based',
  'bio-material': 'bio-based',
  'biomaterials': 'bio-based',
  'natural-materials': 'bio-based',
  'wood': 'timber',
  'clt': 'timber',
  'cross-laminated': 'timber',
  'cross-laminated-timber': 'timber',
  'mass-timber': 'timber',
  'forestry': 'timber',
  'rammed-earth': 'earth',
  'cob': 'earth',
  'clay': 'earth',
  'adobe': 'earth',
  'strawbale': 'straw',
  'straw-bale': 'straw',
  'hempcrete': 'hemp',
  'fungi': 'mycelium',
  'masonry': 'stone',
  'cement': 'concrete',
  'reused': 'reuse',
  'salvage': 'reuse',
  'material-passport': 'reuse',
  'material-passports': 'reuse',
  'demolition': 'waste',
  'lca': 'life-cycle-assessment',
  'life-cycle': 'life-cycle-assessment',
  'lifecycle': 'life-cycle-assessment',
  'life-cycle-analysis': 'life-cycle-assessment',
  'lifecycle-assessment': 'life-cycle-assessment',
  'epd': 'life-cycle-assessment',
  'metrics': 'measurement',
  'benchmarks': 'measurement',
  'kpis': 'measurement',
  'targets': 'measurement',
  'maps': 'mapping',
  'cartography': 'mapping',
  'refurbishment': 'retrofit',
  'reuse-of-buildings': 'retrofit',
  'adaptive-reuse': 'retrofit',
  'simulation': 'modelling',
  'digital-tools': 'modelling',
  'patterns': 'pattern-language',
  'narrative': 'storytelling',
  'objects': 'product',
  'components': 'product',
  'buildings': 'building',
  'architecture': 'building',
  'masterplanning': 'neighbourhood',
  'urban-design': 'city',
  'urbanism': 'city',
  'cities': 'city',
  'landscape': 'bioregion',
  'territory': 'bioregion',
  'global': 'planetary',
  'planetary-boundaries': 'planetary',
  'papers': 'paper',
  'journal-article': 'paper',
  'article': 'essay',
  'research-paper': 'paper',
  'reports': 'report',
  'white-paper': 'report',
  'whitepaper': 'report',
  'books': 'book',
  'essays': 'essay',
  'writing': 'essay',
  'frameworks': 'framework',
  'model': 'framework',
  'diagram': 'diagrams',
  'drawing': 'diagrams',
  'drawings': 'diagrams',
  'visualisation': 'diagrams',
  'visualization': 'diagrams',
  'case-studies': 'case-study',
  'project': 'case-study',
  'projects': 'case-study',
  'guide': 'guidance',
  'design-guide': 'guidance',
  'guides': 'guidance',
  'how-to': 'guidance',
  'best-practice': 'guidance',
  'standards': 'standard',
  'certification': 'standard',
  'living-building': 'standard',
  'living-building-challenge': 'standard',
  'protocol': 'standard',
  'toolkits': 'toolkit',
  'tool': 'toolkit',
  'tools': 'toolkit',
  'data': 'dataset',
  'database': 'dataset',
  'lecture': 'talk',
  'film': 'talk',
  'video': 'talk',
  'podcast': 'talk',
  'documentary': 'talk',
}));

/** Loose text -> a safe, comparable tag slug. */
export function slugify(input) {
  return String(input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** Turn a slug back into something readable when we have no curated label. */
export function titleize(slug) {
  return String(slug)
    .split('-')
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Resolve any written tag to its canonical form.
 * Returns null for input that slugifies to nothing.
 */
export function resolveTag(input) {
  const slug = slugify(input);
  if (!slug) return null;
  const canonical = ALIASES.get(slug) ?? slug;
  const core = BY_SLUG.get(canonical);
  return {
    slug: canonical,
    label: core?.label ?? titleize(canonical),
    facet: core?.facet ?? 'open',
    note: core?.note ?? null,
    core: Boolean(core),
    aliasOf: canonical !== slug ? slug : null,
  };
}

/** Resolve a list of tags, dropping empties and duplicates, preserving order. */
export function resolveTags(inputs) {
  const seen = new Set();
  const out = [];
  for (const raw of inputs ?? []) {
    const tag = resolveTag(raw);
    if (!tag || seen.has(tag.slug)) continue;
    seen.add(tag.slug);
    out.push(tag);
  }
  return out;
}

/**
 * Canonical slug -> the written forms that fold into it.
 * Served to the submission form so a contributor sees the tag they will
 * actually get, rather than being quietly corrected after they press add.
 */
export function aliasIndex() {
  const index = {};
  for (const [written, canonical] of ALIASES) {
    (index[canonical] ??= []).push(written);
  }
  return index;
}

export function isCoreTag(slug) {
  return BY_SLUG.has(slug);
}

export function coreTag(slug) {
  return BY_SLUG.get(slug) ?? null;
}
