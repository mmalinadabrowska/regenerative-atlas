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
  location: {
    label: 'Locations',
    note: 'Where the work is grounded — the ground it is about or for.',
    // The submission form is asking a contributor something, not glossing a
    // heading for a reader, so it puts the same thing as a question. Any facet
    // may carry one; where there is none the note stands in.
    ask: 'Where is this work grounded?',
  },
  open: {
    label: 'Open tags',
    note: 'Coined by contributors, not yet part of the core vocabulary.',
  },
};

export const FACET_ORDER = ['theme', 'location', 'material', 'method', 'scale', 'format', 'open'];

/**
 * Every country, by continent: 'Label' or 'Label|the name a sentence uses'.
 *
 * A record is grounded in a country and filed under its continent too (WITHIN,
 * built from this). The continent is what the map filters on — six places and
 * Global are a choice a reader can take in at a glance; two hundred are not —
 * and the country is what the record says about itself.
 */
const COUNTRIES = {
  'africa': [
    'Algeria', 'Angola', 'Benin', 'Botswana', 'Burkina Faso', 'Burundi', 'Cabo Verde',
    'Cameroon', 'Central African Republic|the Central African Republic', 'Chad',
    'Comoros|the Comoros', 'Congo|the Republic of the Congo',
    'DR Congo|the Democratic Republic of the Congo', "Côte d'Ivoire", 'Djibouti', 'Egypt',
    'Equatorial Guinea', 'Eritrea', 'Eswatini', 'Ethiopia', 'Gabon', 'Gambia|the Gambia',
    'Ghana', 'Guinea', 'Guinea-Bissau', 'Kenya', 'Lesotho', 'Liberia', 'Libya', 'Madagascar',
    'Malawi', 'Mali', 'Mauritania', 'Mauritius', 'Morocco', 'Mozambique', 'Namibia', 'Niger',
    'Nigeria', 'Rwanda', 'São Tomé and Príncipe', 'Senegal', 'Seychelles|the Seychelles',
    'Sierra Leone', 'Somalia', 'South Africa', 'South Sudan', 'Sudan', 'Tanzania', 'Togo',
    'Tunisia', 'Uganda', 'Zambia', 'Zimbabwe',
  ],
  'asia': [
    'Afghanistan', 'Armenia', 'Azerbaijan', 'Bahrain', 'Bangladesh', 'Bhutan', 'Brunei',
    'Cambodia', 'China', 'Georgia', 'India', 'Indonesia', 'Iran', 'Iraq', 'Israel', 'Japan',
    'Jordan', 'Kazakhstan', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Lebanon', 'Malaysia',
    'Maldives|the Maldives', 'Mongolia', 'Myanmar', 'Nepal', 'North Korea', 'Oman', 'Pakistan',
    'Palestine', 'Philippines|the Philippines', 'Qatar', 'Saudi Arabia', 'Singapore',
    'South Korea', 'Sri Lanka', 'Syria', 'Taiwan', 'Tajikistan', 'Thailand', 'Timor-Leste',
    'Türkiye', 'Turkmenistan', 'United Arab Emirates|the United Arab Emirates', 'Uzbekistan',
    'Vietnam', 'Yemen',
  ],
  'europe': [
    'Albania', 'Andorra', 'Austria', 'Belarus', 'Belgium', 'Bosnia and Herzegovina', 'Bulgaria',
    'Croatia', 'Cyprus', 'Czechia', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany',
    'Greece', 'Hungary', 'Iceland', 'Ireland', 'Italy', 'Kosovo', 'Latvia', 'Liechtenstein',
    'Lithuania', 'Luxembourg', 'Malta', 'Moldova', 'Monaco', 'Montenegro',
    'Netherlands|the Netherlands', 'North Macedonia', 'Norway', 'Poland', 'Portugal', 'Romania',
    'Russia', 'San Marino', 'Serbia', 'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland',
    'UK|the United Kingdom', 'Ukraine', 'Vatican City',
  ],
  'north-america': [
    'Antigua and Barbuda', 'Bahamas|the Bahamas', 'Barbados', 'Belize', 'Canada', 'Costa Rica',
    'Cuba', 'Dominica', 'Dominican Republic|the Dominican Republic', 'El Salvador', 'Grenada',
    'Guatemala', 'Haiti', 'Honduras', 'Jamaica', 'Mexico', 'Nicaragua', 'Panama',
    'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines',
    'Trinidad and Tobago', 'USA|the United States',
  ],
  'south-america': [
    'Argentina', 'Bolivia', 'Brazil', 'Chile', 'Colombia', 'Ecuador', 'Guyana', 'Paraguay',
    'Peru', 'Suriname', 'Uruguay', 'Venezuela',
  ],
  'oceania': [
    'Australia', 'Fiji', 'Kiribati', 'Marshall Islands|the Marshall Islands', 'Micronesia',
    'Nauru', 'New Zealand|Aotearoa New Zealand', 'Palau', 'Papua New Guinea', 'Samoa',
    'Solomon Islands|the Solomon Islands', 'Tonga', 'Tuvalu', 'Vanuatu',
  ],
};

/** The countries as vocabulary rows: [slug, 'location', label, note]. */
function countryRows() {
  return Object.values(COUNTRIES).flatMap((names) =>
    names.map((name) => {
      const [label, spoken = label] = name.split('|');
      return [slugify(label), 'location', label, `Grounded in ${spoken}.`];
    }),
  );
}

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

  // — locations ————————————————————————————————————————————
  // Where the work is grounded, not where its office is: a standard written
  // for one country is of that country, and a framework that would read the
  // same anywhere is global. A country is filed inside its region too, by
  // WITHIN below, so asking for Europe finds the work filed under Denmark.
  ['global', 'location', 'Global', 'Not bound to one place — planetary in scope, or read the same anywhere.'],

  ['africa', 'location', 'Africa', 'Grounded in Africa.'],
  ['asia', 'location', 'Asia', 'Grounded in Asia.'],
  ['europe', 'location', 'Europe', 'Grounded in Europe.'],
  ['north-america', 'location', 'North America', 'Grounded in North America, Central America and the Caribbean.'],
  ['south-america', 'location', 'South America', 'Grounded in South America.'],
  ['oceania', 'location', 'Oceania', 'Grounded in Australia, Aotearoa New Zealand and the Pacific.'],

  // Every country, each filed inside its continent — see COUNTRIES below.
  ...countryRows(),
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
  // 'global' used to fold onto the planetary scale. It is a place now — the
  // one that means no particular place — and the scale keeps its own name.
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

  // — places ———————————————————————————————————————————————
  // Written forms of a place, folded onto the one the Atlas files it under.
  // Countries the vocabulary does not name are folded to their region rather
  // than being lost as open tags: better a source findable under Africa than
  // one filed under a place nothing else shares.
  'worldwide': 'global',
  'international': 'global',
  'world': 'global',
  'everywhere': 'global',
  'anywhere': 'global',
  'united-kingdom': 'uk',
  'u-k': 'uk',
  'gb': 'uk',
  'great-britain': 'uk',
  'britain': 'uk',
  'british': 'uk',
  'england': 'uk',
  'scotland': 'uk',
  'wales': 'uk',
  'northern-ireland': 'uk',
  'london': 'uk',
  'eire': 'ireland',
  'republic-of-ireland': 'ireland',
  'eu': 'europe',
  'european-union': 'europe',
  'european': 'europe',
  'nordic': 'europe',
  'nordics': 'europe',
  'scandinavia': 'europe',
  'scandinavian': 'europe',
  'baltics': 'europe',
  'balkans': 'europe',
  'holland': 'netherlands',
  'dutch': 'netherlands',
  'deutschland': 'germany',
  'german': 'germany',
  'french': 'france',
  'danish': 'denmark',
  'swedish': 'sweden',
  'swiss': 'switzerland',
  'us': 'usa',
  'u-s': 'usa',
  'u-s-a': 'usa',
  'united-states': 'usa',
  'united-states-of-america': 'usa',
  'america': 'usa',
  'american': 'usa',
  'north-american': 'north-america',
  'central-america': 'north-america',
  'caribbean': 'north-america',
  'latin-america': 'south-america',
  'south-american': 'south-america',
  'aotearoa': 'new-zealand',
  'aotearoa-new-zealand': 'new-zealand',
  'nz': 'new-zealand',
  'australasia': 'oceania',
  'pacific': 'oceania',
  'pacific-islands': 'oceania',
  'sub-saharan-africa': 'africa',
  'east-africa': 'africa',
  'west-africa': 'africa',
  'southern-africa': 'africa',
  'north-africa': 'africa',
  'african': 'africa',
  'asian': 'asia',
  'east-asia': 'asia',
  'south-asia': 'asia',
  'south-east-asia': 'asia',
  'southeast-asia': 'asia',
  'middle-east': 'asia',
  'bharat': 'india',
  'prc': 'china',
  'hong-kong': 'china',
  'korea': 'south-korea',
  'turkey': 'turkiye',
  'ivory-coast': 'cote-divoire',
  'czech-republic': 'czechia',
  'burma': 'myanmar',
  'swaziland': 'eswatini',
  'east-timor': 'timor-leste',
  'drc': 'dr-congo',
  'democratic-republic-of-the-congo': 'dr-congo',
  'uae': 'united-arab-emirates',
  'holy-see': 'vatican-city',
  'cape-verde': 'cabo-verde',
}));

/**
 * A place inside a larger place. Tagging the smaller files the source under
 * both, so the vocabulary carries its own hierarchy and a query never has to:
 * asking the library for Europe is a plain tag match, and it finds the work
 * filed under Denmark because Denmark put Europe there when it was stored.
 */
const WITHIN = new Map(
  Object.entries(COUNTRIES).flatMap(([region, names]) =>
    names.map((name) => [slugify(name.split('|')[0]), region]),
  ),
);

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
  // "material:Cork" is a tag coined under a facet: the contributor added it
  // among the materials, and it should sit with them rather than among the
  // open tags. If the word is already in the vocabulary, the vocabulary wins.
  const coined = String(input ?? '').match(COINED);
  if (coined) {
    const tag = resolveTag(coined[2]);
    if (!tag || tag.core) return tag;
    return { ...tag, facet: coined[1].toLowerCase() };
  }
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

/**
 * The facets a contributor may coin a tag in. Places are a fixed list, and a
 * tag with no facet is simply an open one.
 */
export const COINABLE = ['theme', 'material', 'method', 'scale', 'format'];

const COINED = new RegExp(`^\\s*(${COINABLE.join('|')})\\s*:\\s*(.+)$`, 'i');

/**
 * A resolved tag as it is written down wherever a list of plain strings has
 * to carry it — a submission waiting in the queue, a record in seed.json. A
 * curated or open tag is its slug; a coined one keeps its facet in front, so
 * it reads back into the same place.
 */
export function writeTag(tag) {
  return tag.core || !tag.facet || tag.facet === 'open' ? tag.slug : `${tag.facet}:${tag.slug}`;
}

/**
 * Resolve a list of tags, dropping empties and duplicates, preserving order.
 *
 * A place brings its region with it — see WITHIN. The region is added at the
 * end rather than beside the country, so the order a contributor chose is the
 * order that survives and the inherited tags read as what they are.
 */
export function resolveTags(inputs) {
  const seen = new Set();
  const out = [];
  for (const raw of inputs ?? []) {
    const tag = resolveTag(raw);
    if (!tag || seen.has(tag.slug)) continue;
    seen.add(tag.slug);
    out.push(tag);
  }
  for (const tag of [...out]) {
    const region = WITHIN.get(tag.slug);
    if (!region || seen.has(region)) continue;
    seen.add(region);
    out.push(resolveTag(region));
  }
  return out;
}

/** Is this slug a place? Used where the map wants subjects and not addresses. */
export function isLocation(slug) {
  return BY_SLUG.get(slug)?.facet === 'location';
}

/** The region a place sits in, or null for a region and for anything else. */
export function regionOf(slug) {
  return WITHIN.get(slug) ?? null;
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
