const fs = require('fs');
const data = JSON.parse(fs.readFileSync('inventory_data.json', 'utf8'));
const cats = data.catalogues || [];

// ---- stats ---------------------------------------------------------------
const total = cats.length;
const counts = {};
for (const e of cats) { const k = e.profile.category || 'other'; counts[k] = (counts[k] || 0) + 1; }
const nConf = cats.filter(e => (e.verdict || {}).verdict === 'confirmed').length;
const nUnc = cats.filter(e => (e.verdict || {}).verdict === 'uncertain').length;
// Distinguish a DOI that identifies the DATASET from one that identifies only the
// PUBLICATION describing it. Registrant prefixes below are data repositories /
// bulletin producers; anything else resolving to a DOI is treated as a paper DOI.
const DATASET_DOI_PREFIXES = new Set([
  '10.21420', // GeoNet / GNS Science
  '10.5281',  // Zenodo
  '10.15778', // IRIS DMC
  '10.31905', // International Seismological Centre bulletins
  '10.6084',  // figshare
  '10.17605', // OSF
  '10.5061',  // Dryad
  '10.17632', // Mendeley Data
  '10.4121',  // 4TU.ResearchData
  '10.1594',  // PANGAEA / GFZ
  '10.5880',  // GFZ Data Services
  '10.7488',  // Edinburgh DataShare
  '10.25914', '10.26022', // AuScope / ANU
]);
const doiPrefix = v => { const m = /10\.\d{4,9}/.exec(String(v || '')); return m ? m[0] : null; };
const isDatasetDOI = v => { const p = doiPrefix(v); return !!p && DATASET_DOI_PREFIXES.has(p); };
const isNetworkDOI = v => doiPrefix(v) === '10.7914';   // FDSN network = waveforms, not the catalogue
const isPubDOI     = v => { const p = doiPrefix(v); return !!p && !DATASET_DOI_PREFIXES.has(p) && !isNetworkDOI(v); };
const nDatasetDOI = cats.filter(e => isDatasetDOI(e.profile.doi)).length;
const nPubDOI     = cats.filter(e => isPubDOI(e.profile.doi)).length;
const nNetDOI     = cats.filter(e => isNetworkDOI(e.profile.doi)).length;
const nDOI = cats.filter(e => (e.profile.doi || '').trim()).length;
const cf = { high: 0, medium: 0, low: 0 };
for (const e of cats) { const c = (e.profile.confidence || '').toLowerCase(); if (cf[c] !== undefined) cf[c]++; }
const geoScope = (v) => ((v.profile.geo || {}).scope || '');
const nNat  = cats.filter(e => geoScope(e) === 'nat').length;
const nOffN = cats.filter(e => geoScope(e) === 'offN').length;
const nReg  = cats.filter(e => geoScope(e) === 'reg').length;
const rawN = (data.totals || {}).discovered_raw || 100;

const CAT = [
  ['national-operational', 'National operational and network catalogues',
    'The authoritative national record and the permanent-network data products that underpin it.'],
  ['relocated-reprocessed', 'Relocated and reprocessed catalogues',
    'Catalogues that re-pick, relocate, or re-time existing events with improved velocity models or double-difference / matched-filter methods, including the New Zealand components of global relocation efforts.'],
  ['historical-macroseismic', 'Historical and macroseismic (felt-report) catalogues',
    'Pre-instrumental and felt-report catalogues that extend the record through the nineteenth century and quantify shaking via Modified Mercalli / macroseismic intensity.'],
  ['aftershock-response', 'Aftershock-sequence rapid-response catalogues',
    'Sequence-specific catalogues, often built from rapid-response temporary instrumentation deployed around a significant mainshock.'],
  ['temp-onshore', 'Temporary onshore passive-seismic deployments',
    'Published earthquake catalogues from time-limited onshore passive-seismic experiments and dense arrays; among the least-discoverable parts of the national record.'],
  ['temp-offshore-obs', 'Temporary offshore / ocean-bottom (OBS) deployments',
    'Ocean-bottom seismometer deployments along the offshore Hikurangi margin and the Kermadec volcanic arc.'],
  ['volcano-geothermal-induced', 'Volcano-seismic, geothermal and induced catalogues',
    'Volcano-monitoring, magmatic-unrest, and geothermal injection-induced microseismicity catalogues, typically from dense local or borehole networks.'],
  ['slowslip-tremor-cmt', 'Slow-slip, tremor, LFE and moment-tensor catalogues',
    'Catalogues of the subduction slow-earthquake family (slow-slip events, tectonic tremor, low-frequency and repeating earthquakes) together with regional moment-tensor solutions.'],
  ['derived-synthetic-hazard', 'Derived, homogenised and synthetic / hazard-model catalogues',
    'Magnitude-homogenised, declustered, and physics-based synthetic catalogues prepared for the National Seismic Hazard Model.'],
  ['ground-motion-db', 'Strong-motion and ground-motion databases',
    'Instrumental strong-motion and ground-motion databases that pair earthquake parameters with recorded waveforms and intensity measures for engineering and ground-motion-model use.'],
];

// ---- helpers -------------------------------------------------------------
const clean = (s) => (s == null ? '' : String(s)).trim();
// strip source-trail / verification caveats embedded in data fields
function scrub(s) {
  if (s == null) return '';
  let t = String(s).replace(/\s+/g, ' ').trim();
  t = t.replace(/\s*[—–-]\s*paywalled/gi, '');
  t = t.replace(/;?\s*treat as approximate\s*\/\s*unverified/gi, '');
  t = t.replace(/\(?\s*citation reconstructed[^)]*\)?/gi, '');
  t = t.replace(/\(?\s*reconstructed from [^).;]*\)?/gi, '');
  t = t.replace(/\(\s*per (?:candidate )?brief[^)]*\)/gi, '(approximate)');
  t = t.replace(/\(\s*approximate;[^)]*\)/gi, '(approximate)');
  t = t.replace(/\s*\bper (?:candidate )?brief\b/gi, '');
  t = t.replace(/\bcandidate brief\b/gi, 'source');
  t = t.replace(/[;.—–]\s*[^.;—–]*\bnot (?:independently )?(?:explicitly )?(?:stated|documented|reported|verified|confirmed|extracted|given)\b[^.;—–]*?\b(?:fetched|accessible|available)\s+(?:open\s+)?(?:sources?|metadata|text|abstract)\b[^.;—–]*/gi, '');
  t = t.replace(/[;.—–]\s*[^.;—–]*\bnot independently (?:verified|confirmed)\b[^.;—–]*/gi, '');
  t = t.replace(/[;.—–]\s*[^.;—–]*\b(?:paywalled|not read from)\b[^.;—–]*/gi, '');
  t = t.replace(/\bin the brief\b/gi, '');
  // Repair an unbalanced '(' left behind by the caveat strippers above by closing it,
  // NOT by discarding the rest of the field (which silently dropped real content).
  {
    const op = (t.match(/\(/g) || []).length, cl = (t.match(/\)/g) || []).length;
    if (op > cl) t = t + ')'.repeat(op - cl);
    else if (cl > op) t = '('.repeat(cl - op) + t;
  }
  t = t.replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').replace(/\s+([);.,])/g, '$1').replace(/\(\s+/g, '(').trim();
  t = t.replace(/[;,]\s*$/, '').replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ').trim();
  return t;
}
// Remove an 'unknown / not documented' CAVEAT while keeping any substantive text around it.
// Previously any field merely CONTAINING 'not documented' was discarded in full, which deleted
// real content (contacts, coordinates, depth ranges) from ~90 fields across the inventory.
const CAVEAT_MARK = /\b(?:unknown|not documented|not stated|not extracted|not specified|not reported|not given|not published)\b/i;
// Remove an 'unknown / not documented' CAVEAT while keeping the substantive text around it.
// Previously any field merely CONTAINING 'not documented' was discarded in full, deleting real
// content (contacts, coordinates, depth ranges, event counts) from ~90 fields.
const stripUnknownCaveat = (t) => {
  if (!t) return '';
  // 1) leading marker(s) wrapping the real content in parentheses -> promote the content
  const m = t.match(/^[\s\u2014\u2013,;-]*(?:(?:unknown|not documented|not stated|not extracted|not specified)[\s,;\u2014\u2013-]*)+\((.+)\)\s*$/i);
  if (m) t = m[1];
  // 2) drop ';'/dash-delimited segments that are caveats carrying no actual data (no digits)
  t = t.split(/\s*[;\u2014\u2013]\s*/).filter(seg => !(CAVEAT_MARK.test(seg) && !/\d/.test(seg))).join('; ');
  // 3) if only markers/punctuation survive, the field really is unknown
  if (!t.replace(CAVEAT_MARK, '').replace(/[^A-Za-z0-9]/g, '').length) return '';
  t = t.replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').replace(/\s+([);.,])/g, '$1');
  return t.replace(/^[\s;,.-]+|[\s;,.-]+$/g, '').trim();
};
const norm = (s) => {
  s = scrub(clean(s).replace(/^<([^>]*)>$/, '$1'));
  if (!s) return '';
  const stripped = stripUnknownCaveat(s);
  // Keep the stripped remainder when it still says something; otherwise the field really is unknown.
  return stripped.length >= 3 ? stripped : '';
};
// Catalogue NAMES use an em dash as an apposition separator ("SAPSE - Southern Alps ...").
// tex() turns em dashes into commas, which is right for prose but makes a name read as a
// list, so names keep an en dash instead.
const texName = (v) => tex(String(v || '').replace(/\s*\u2014\s*/g, ' @@ENDASH@@ ')).replace(/@@ENDASH@@/g, '--');
function tex(s) {
  if (s == null) return '';
  // Normalise ASCII stand-ins so the entry fields match the hand-written prose
  // ($\sim$, $\geq$, $\leq$) instead of printing ~, >=, <=.
  s = String(s).replace(/(^|[\s(\[])~(?=\d|\s*\d)/g, '$1\u223c')
               .replace(/>\s*=/g, '\u2265').replace(/<\s*=/g, '\u2264');
  s = String(s);
  s = s.replace(/\s*—\s*/g, ', ');   // avoid em-dashes in prose
  s = s.replace(/\\/g, '@@BS@@');
  s = s.replace(/([&%$#_{}])/g, '\\$1');
  s = s.replace(/~/g, '@@TIL@@').replace(/\^/g, '@@CAR@@');
  s = s.replace(/</g, '@@LT@@').replace(/>/g, '@@GT@@');
  s = s.replace(/≥/g, '$\\geq$').replace(/≤/g, '$\\leq$').replace(/×/g, '$\\times$')
       .replace(/±/g, '$\\pm$').replace(/≈/g, '$\\approx$').replace(/[∼]/g, '$\\sim$')
       .replace(/°/g, '$^{\\circ}$').replace(/[µμ]/g, '$\\mu$').replace(/·/g, '$\\cdot$')
       .replace(/−/g, '$-$').replace(/√/g, '$\\surd$');
  s = s.replace(/@@BS@@/g, '\\textbackslash{}').replace(/@@TIL@@/g, '\\textasciitilde{}')
       .replace(/@@CAR@@/g, '\\textasciicircum{}').replace(/@@LT@@/g, '\\textless{}').replace(/@@GT@@/g, '\\textgreater{}');
  return s;
}
function doiTeX(v) {
  // A doi field may carry several identifiers plus prose; link only the first real DOI
  // so the hyperlink target is never a sentence (which produced one dead link).
  const raw = String(v || '').trim();
  const m = raw.match(/10\.\d{4,9}\/[^\s,;]+/);
  const first = m ? m[0].replace(/[.,;]+$/, '') : raw.split(/[;,]/)[0].trim();
  const url = /^https?:/i.test(first) ? first : 'https://doi.org/' + first;
  const extra = (m && raw.replace(m[0], '').match(/10\.\d{4,9}\//)) ? ' (further identifiers in the entry text)' : '';
  return `\\href{${url}}{\\nolinkurl{${first}}}` + extra;
}

// ASCII-safe escaper for .bib field values
function bibEsc(s) {
  if (s == null) return '';
  s = String(s);
  s = s.replace(/\\/g, '@@BS@@');
  s = s.replace(/([&%$#_])/g, '\\$1');   // NB: do not escape { } — they are grouping chars in BibTeX
  s = s.replace(/~/g, '@@TIL@@').replace(/\^/g, '@@CAR@@');
  const map = { 'ā': '\\=a', 'Ā': '\\=A', 'ē': '\\=e', 'Ē': '\\=E', 'ī': '\\=\\i', 'Ī': '\\=I', 'ō': '\\=o', 'Ō': '\\=O', 'ū': '\\=u', 'Ū': '\\=U', 'ó': "\\'o", 'é': "\\'e", 'á': "\\'a", 'í': "\\'i", 'ú': "\\'u", 'ñ': '\\~n', 'ü': '\\"u', 'ö': '\\"o' };
  s = s.replace(/[āĀēĒīĪōŌūŪóéáíúñüö]/g, c => map[c] || c);
  s = s.replace(/≥/g, '$\\geq$').replace(/≤/g, '$\\leq$').replace(/×/g, '$\\times$').replace(/±/g, '$\\pm$')
       .replace(/°/g, '$^{\\circ}$').replace(/[–—]/g, '--').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/·/g, '$\\cdot$').replace(/[−]/g, '-');
  s = s.replace(/@@BS@@/g, '\\textbackslash{}').replace(/@@TIL@@/g, '\\textasciitilde{}').replace(/@@CAR@@/g, '\\textasciicircum{}');
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x00-\x7F]/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

// ---- reference parsing → BibTeX -----------------------------------------
function parseRef(raw) {
  raw = clean(raw).replace(/\s+/g, ' ');
  const doiM = raw.match(/10\.\d{4,9}\/[^\s,;]+/); let doi = doiM ? doiM[0].replace(/[.,;]+$/, '') : '';
  const urlM = raw.match(/https?:\/\/[^\s]+/); let url = urlM ? urlM[0].replace(/[.,;]+$/, '') : '';
  if (!url && doi) url = 'https://doi.org/' + doi;
  let authorPart = '', rest = raw, year = '';
  // Year detection, in order of preference:
  //  (1) the FIRST parenthetical, if year-shaped - tolerates (2022a), (2022/2023),
  //      (2012-2030), and stops a corporate author being swallowed by a later year;
  //  (2) failing that, the first strictly (YYYY) parenthetical anywhere, the original rule.
  const fp = raw.match(/^(.*?)\(([^)]*)\)\.?\s*(.*)$/);
  let paren = (fp && /^\d{4}(?:[a-z]|\s*[\/\u2013-]\s*\d{4})?$/.test(fp[2].trim()))
    ? [null, fp[1], fp[2].trim().slice(0, 4), fp[3]] : null;
  if (!paren) paren = raw.match(/^(.*?)\((\d{4})[a-z]?\)\.?\s*(.*)$/);
  if (paren) { authorPart = paren[1].trim().replace(/[,;]\s*$/, ''); year = paren[2]; rest = paren[3].trim(); }
  else { const ym = raw.match(/\b(19|20)\d{2}\b/); if (ym) year = ym[0]; }
  let title = '', venue = '';
  if (rest) {
    // Split title from venue on '. ', but never immediately after a known abbreviation
    // or a single capital letter, which severed titles such as 'at Mt. Ruapehu'.
    const ABBR = /(?:\b(?:Mt|St|Dr|Prof|Fig|No|Vol|pp|ed|eds|Jr|Sr|approx|ca|cf|e\.g|i\.e)|\b[A-Z])\.$/;
    const chunks = rest.split(/\.\s+/);
    const acc = [];
    while (chunks.length) {
      acc.push(chunks.shift());
      if (!ABBR.test(acc[acc.length - 1] + '.')) break;
    }
    title = acc.join('. ').replace(/\.$/, '').trim();
    venue = chunks.join('. ').trim();
  }
  venue = venue.replace(/https?:\/\/[^\s]+/g, '').replace(/doi:\s*\S+/ig, '').replace(/\[[^\]]*\]/g, '').replace(/\(\s*no\s+doi[^)]*\)/ig, '').replace(/[\s.,]+$/, '').trim();
  // Robust author parse: tokenise on commas, then pair each surname with the
  // following initials group so every BibTeX name has at most one comma.
  let author = '';
  if (authorPart) {
    const a = authorPart.replace(/\s*,?\s*(?:&|\band\b)\s*/g, ', ').replace(/\s{2,}/g, ' ').replace(/[;,]\s*$/, '').trim();
    const toks = a.split(/,\s*/).map(t => t.trim()).filter(Boolean);
    // Accept compound initials with lowercase parts ("W.-x.") and treat a trailing
    // "et al." as BibTeX's `others` rather than a person named "et al".
    const isInit = t => /^[A-Za-z]\.(?:[-\s]*[A-Za-z]\.?)*$/.test(t)   // "C.H.", "G.A", "W.-x."
                     || /^[A-Z]$/.test(t)                                // "H"
                     || /^et\s+al\.?$/i.test(t);
    const authors = []; let cur = null;
    for (const t of toks) {
      if (isInit(t) && cur) cur = cur + ', ' + t;
      else { if (cur) authors.push(cur); cur = t; }
    }
    if (cur) authors.push(cur);
    author = authors
      .map(x => /^et\s+al\.?$/i.test(x.trim()) ? 'others'
              : x.replace(/,?\s*et\s+al\.?$/i, '').trim())
      .filter(Boolean)
      .map(x => (x === 'others' || /,/.test(x)) ? x : `{${x}}`)
      .join(' and ');
    if (/\bet\s+al\.?/i.test(authorPart) && !/\bothers\b/.test(author)) author += ' and others';
  }
  // Corporate-author fallback: references with no "(year)" after the author still need a
  // sortable author. Use the leading sentence when it reads like an organisation name.
  if (!author && !authorPart) {
    const lead = raw.split(/\.\s+/)[0].trim();
    if (lead && lead.length <= 90 && !/\d/.test(lead) && /^[A-Z]/.test(lead) && !/^https?:/i.test(lead)) {
      author = `{${lead}}`;
      authorPart = lead;   // so the generated citation key derives from the organisation
      if (rest === raw) { const pr = raw.split(/\.\s+/).slice(1); title = (pr.shift() || '').replace(/\.$/, '').trim(); venue = pr.join('. ').trim(); }
    }
  }
  let type = 'misc', journal = venue, volume = '', number = '', pages = '';
  const low = (venue + ' ' + title + ' ' + raw).toLowerCase();
  if (/\[\s*(?:data ?set|code|software)[^\]]*\]/i.test(raw) ||
      /\b(?:zenodo|figshare|pangaea|dryad|geonet|fdsn|federation of digital)\b/i.test(venue)) type = 'dataset';
  else if (/thesis|dissertation|\bph\.?d\b|m\.?sc/i.test(low)) type = /\b(?:m\.?sc|master)/i.test(low) ? 'mastersthesis' : 'thesis';
  else if (/(\breport\b|technical report|\beqc\b|earthquake commission|natural hazards commission|gns science report|open[- ]file)/i.test(low) && !/seismological society/i.test(low)) type = 'report';
  else if (/\bproceedings\b|world geothermal congress|geothermal workshop|\bconference\b|\bsymposium\b/i.test(low)) type = 'inproceedings';
  else if (/\bmonograph\b|\bisbn\b|\batlas of\b/i.test(low)) type = 'book';
  else if (venue) type = 'article';
  if (type === 'article') {
    // volume may be a range (353-354); pages may be an e-locator (e2021JB022304),
    // a section id (B08S04, L18315), a range, or a bare article number after ',' or ':'
    const PG = '(?:[A-Za-z]?\\d+[A-Za-z0-9]*\\s*[-\u2013]\\s*[A-Za-z]?\\d+[A-Za-z0-9]*|[A-Za-z]?\\d+[A-Za-z0-9]*)';
    const vm = venue.match(new RegExp('^(.*?),\\s*(\\d+(?:\\s*[-\u2013]\\s*\\d+)?)\\s*(?:\\(([^)]+)\\))?\\s*[,:]\\s*(' + PG + ')\\s*$'));
    if (vm) { journal = vm[1].trim(); volume = vm[2].replace(/\s*[-–]\s*/, '--'); number = vm[3] || ''; pages = vm[4].replace(/\s*[-–]\s*/g, '--').replace(/\s/g, ''); }
    else { const vm2 = venue.match(/^(.*?),\s*(\d+)\b/); if (vm2) { journal = vm2[1].trim(); volume = vm2[2]; } }
    journal = journal.replace(/[\s.,]+$/, '');
  }
  let surname = authorPart ? authorPart.split(/,| and |&/)[0].replace(/[^A-Za-z]/g, '') : (title.replace(/[^A-Za-z]/g, '').slice(0, 8) || 'Ref');
  if (!surname) surname = 'Ref';
  return { raw, doi, url, year, author, title, venue, journal, volume, number, pages, type, base: surname + (year || 'nd') };
}

const refByRaw = new Map(); const usedKeys = new Set(); const bibEntries = [];
function addRef(rawText) {
  const raw = scrub(clean(rawText)); if (!raw) return '';
  const nk = raw.toLowerCase();
  if (refByRaw.has(nk)) return refByRaw.get(nk);
  const p = parseRef(raw);
  let key = p.base, i = 0;
  while (usedKeys.has(key)) { key = p.base + String.fromCharCode(97 + i); i++; }
  usedKeys.add(key); refByRaw.set(nk, key); bibEntries.push({ key, p });
  return key;
}

const out = []; const W = (s) => out.push(s);

// ===================== PREAMBLE ==========================================
W(String.raw`\documentclass[10pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage[margin=2.3cm]{geometry}
\usepackage{microtype}
\usepackage{booktabs}
\usepackage{longtable}
\usepackage{graphicx}
\usepackage{rotating}
\usepackage{array}
\usepackage{enumitem}
\usepackage{xcolor}
\usepackage{titlesec}
\usepackage{fancyhdr}
\usepackage{parskip}
\usepackage[numbers,sort&compress,square]{natbib}
\usepackage[hidelinks]{hyperref}
\usepackage{xurl}
\setlength{\emergencystretch}{3em}
\hypersetup{colorlinks=true, linkcolor=teal!60!black, citecolor=teal!55!black, urlcolor=blue!55!black,
  pdftitle={Earthquake Catalogues of Aotearoa New Zealand 1960-2026}, pdfauthor={Kenny Graham}}

\DeclareUnicodeCharacter{0100}{\=A}\DeclareUnicodeCharacter{0101}{\=a}
\DeclareUnicodeCharacter{0112}{\=E}\DeclareUnicodeCharacter{0113}{\=e}
\DeclareUnicodeCharacter{012A}{\=I}\DeclareUnicodeCharacter{012B}{\=\i}
\DeclareUnicodeCharacter{014C}{\=O}\DeclareUnicodeCharacter{014D}{\=o}
\DeclareUnicodeCharacter{016A}{\=U}\DeclareUnicodeCharacter{016B}{\=u}
\DeclareUnicodeCharacter{00F3}{\'o}\DeclareUnicodeCharacter{00E9}{\'e}\DeclareUnicodeCharacter{00FC}{\"u}
\DeclareUnicodeCharacter{2013}{--}\DeclareUnicodeCharacter{2014}{--}
\DeclareUnicodeCharacter{2018}{\textquoteleft}\DeclareUnicodeCharacter{2019}{\textquoteright}
\DeclareUnicodeCharacter{201C}{\textquotedblleft}\DeclareUnicodeCharacter{201D}{\textquotedblright}
\DeclareUnicodeCharacter{2265}{$\geq$}\DeclareUnicodeCharacter{2264}{$\leq$}
\DeclareUnicodeCharacter{00D7}{$\times$}\DeclareUnicodeCharacter{00B1}{$\pm$}
\DeclareUnicodeCharacter{00B0}{$^{\circ}$}\DeclareUnicodeCharacter{00B7}{$\cdot$}
\DeclareUnicodeCharacter{2248}{$\approx$}\DeclareUnicodeCharacter{2212}{$-$}\DeclareUnicodeCharacter{03BC}{$\mu$}

\definecolor{barblue}{RGB}{38,114,128}
\definecolor{rulegrey}{RGB}{120,120,120}
\newcolumntype{L}[1]{>{\raggedright\arraybackslash}p{#1}}
\titleformat{\section}{\Large\bfseries\color{teal!50!black}}{\thesection}{0.7em}{}
\titleformat{\subsection}{\large\bfseries}{\thesubsection}{0.6em}{}
\setlength{\parskip}{4pt}
\pagestyle{fancy}\fancyhf{}
\fancyhead[L]{\small\itshape Earthquake Catalogues of Aotearoa New Zealand, 1960--2026}
\fancyhead[R]{\small\thepage}
\renewcommand{\headrulewidth}{0.3pt}

\newcommand{\catentryrule}{\par\vspace{3pt}\noindent\textcolor{rulegrey}{\rule{\linewidth}{0.3pt}}\par\vspace{5pt}}
\newcommand{\kv}[2]{\item \textbf{#1:} #2}

\title{\vspace{-1.0cm}\Huge\bfseries Earthquake Catalogues of Aotearoa New Zealand, 1960--2026\\[6pt]
\Large A Curated Inventory of National, Regional, Temporary-Deployment, and Derived Catalogues\thanks{Each entry is a discovery record summarising what a catalogue contains and where to obtain it; confirm details against the cited source before quantitative use.}}
\author{Kenny Graham\\\small Earth Sciences New Zealand\\\small Aotearoa New Zealand FAIR Earthquake Catalogue Framework project}
\date{18 June 2026}

\begin{document}
\maketitle
\thispagestyle{fancy}`);

// ---- abstract ------------------------------------------------------------
W(String.raw`
\begin{abstract}
\noindent New Zealand's earthquake-catalogue record is curated nationally by GeoNet (Earth Sciences New Zealand / GNS Science) but is complemented by a large, fragmented body of regional, temporary-deployment, volcano-seismic, slow-earthquake, and derived catalogues that are individually valuable yet difficult to discover, compare, and cite. This report presents a curated inventory of \textbf{${total} distinct earthquake catalogues} that were developed for, or that cover, Aotearoa New Zealand and its offshore margins with an emphasis on the period 1960--2026, together with the foundational historical compilations on which the modern record rests, and with particular attention to \textbf{temporary seismic deployments} (passive-seismic experiments, ocean-bottom deployments, and aftershock rapid-response arrays). Each catalogue is profiled against the minimum-attributes \emph{Catalogue Submission Profile} proposed for a national \textquotedblleft catalogue of catalogues\textquotedblright, recording what it contains and how to obtain it. Of the ${total} catalogues, ${nDatasetDOI} carry a DOI that resolves to the dataset itself; a further ${nPubDOI} are identified only by the DOI of the publication that describes them, ${nNetDOI} carry only an FDSN network DOI for the underlying waveforms, and ${total - nDatasetDOI - nPubDOI - nNetDOI} carry neither. Catalogues from temporary deployments and targeted experiments make up a substantial share, reflecting both the diversity of New Zealand's regional seismology and the discoverability gap that a coordinated registry is intended to address. The inventory is offered as a working population of that registry and as a reproducible, citable reference for researchers, hazard modellers, and engineers.
\end{abstract}
\vspace{4pt}
{\small\noindent\textbf{Keywords:} earthquake catalogue; seismicity; temporary deployment; ocean-bottom seismometer; slow slip; FAIR data; Aotearoa New Zealand; GeoNet; metadata.}
\tableofcontents
\newpage`);

// ===================== 1. INTRODUCTION ===================================
W(String.raw`\section{Introduction and scope}\label{sec:intro}
An earthquake catalogue is the evidence base for seismicity research, seismic-hazard estimation, and engineering design. In Aotearoa New Zealand that evidence base is distributed across one authoritative national operational catalogue and many high-value but loosely coupled regional, temporary, and derived catalogues. Because these use different formats, identifiers, magnitude scales, and metadata conventions, combining them is manual and error-prone. Processing changes compound this: GeoNet's 2012 transition to SeisComP introduced a step change in reported magnitudes, so the 2022 National Seismic Hazard Model required a dedicated effort to standardise magnitudes to a consistent scale (Mw) across the full record.

This report addresses the first practical step toward a coordinated capability: \emph{knowing which catalogues exist}. It inventories the earthquake catalogues developed for, or covering, New Zealand and its offshore margins (including the Hikurangi and Kermadec subduction systems and the subantarctic) whose coverage overlaps the period 1960--2026. Catalogues that begin earlier and extend into the period, and historical or derived catalogues used for New Zealand even where compiled recently, are included. Special attention is given to \textbf{temporary deployments}, which are scientifically rich yet routinely invisible to the national system.

Each catalogue is described using the \emph{Catalogue Submission Profile} (Appendix~\ref{app:schema}): a concise, controlled set of attributes covering identification and contact, coverage, content, classification, and availability. The profile records \emph{what} a catalogue contains and \emph{how} to obtain it, so that a reader can assess relevance before consulting the full documentation. Consistent with that scope, each entry here is a discovery record rather than a quality certification; deeper detail is carried by the catalogue's own dataset, DOI, or defining publication and is cited accordingly.`);

// ===================== 2. SCOPE & SOURCES ================================
W(String.raw`\section{Scope, sources, and compilation}\label{sec:methods}
This inventory was curated from peer-reviewed publications, dataset repositories (for example Zenodo, IRIS/EarthScope, and PANGAEA), FDSN network records, and the catalogues and reports of GeoNet / GNS Science and partner institutions. Each catalogue was profiled against the submission schema (Appendix~\ref{app:schema}) and reviewed against its defining publication or dataset; persistent identifiers and citations were checked against the original source, and fields that could not be established from the sources are left blank rather than inferred. Because the inventory was compiled from published sources rather than submitted by each catalogue's custodian, the \emph{Producer / contact} field generally names the responsible author or institution rather than a monitored contact address, and coverage dates, bounding boxes, depth ranges and event counts are recorded only to the precision the source states.

The inventory is a \emph{discovery} resource: each entry summarises what a catalogue contains and how to obtain it, and is not a certification of scientific adequacy; confirm details against the cited source before quantitative use. It is also not a census: earthquake-catalogue production in Aotearoa New Zealand is decentralised and continuous, so a residual long tail of specialised and thesis-derived catalogues remains (Section~\ref{sec:gaps}). Of the ${total} catalogues listed, ${nDatasetDOI} carry a DOI that resolves to the dataset itself; a further ${nPubDOI} are identified only by the DOI of the publication that describes them, and ${nNetDOI} only by an FDSN network DOI for the underlying waveforms.`);

// ===================== 3. OVERVIEW =======================================
W(String.raw`\section{The shape of New Zealand's catalogue ecosystem}\label{sec:overview}
New Zealand's earthquake-catalogue landscape has three tiers.

\textbf{(1) One authoritative national operational catalogue.} The GeoNet catalogue, produced by GNS Science / Earth Sciences New Zealand, provides continuous instrumental coverage (locations from the 1930s; descriptive events from $\sim$1460) and is underpinned by the permanent National Seismograph Network (FDSN code \texttt{NZ}). It is the parent dataset for nearly every derived New Zealand catalogue.

\textbf{(2) A large, scattered body of regional, temporary-deployment, volcano/geothermal, and special-purpose catalogues}, produced mostly by universities (Victoria University of Wellington, Otago, Auckland, Canterbury) and international partners. These deliver far higher \emph{local} precision (dense arrays, ocean-bottom and borehole sensors, and matched-filter / template-matching detection), but are typically published as one-off datasets discoverable only through the originating paper.

\textbf{(3) Derived products}: relocated and reprocessed catalogues, magnitude-homogenised and declustered hazard-model catalogues (NSHM 2010 and 2022), and physics-based synthetic (RSQSim) catalogues.

Catalogues produced by temporary deployments and targeted experiments make up a substantial part of this inventory (${counts['temp-onshore'] || 0} onshore and ${counts['temp-offshore-obs'] || 0} offshore here, alongside much of the volcano-seismic and aftershock-response work), yet they are among the catalogues \emph{least} discoverable in the national system, and so are exactly the material a coordinated registry is designed to surface (their specific discoverability and heterogeneity issues are detailed in Section~\ref{sec:gaps}).`);

// ===================== 4. TIMELINE =======================================
W(String.raw`\section{Historical development, 1960--2026}\label{sec:timeline}
\begin{description}[leftmargin=0pt,style=unboxed,itemsep=3pt]
\item[1960s--1970s (analogue era).] The national catalogue is maintained by the DSIR Seismological Observatory; the \emph{Computer File of New Zealand Earthquakes} runs to 1974, while Eiby's \emph{Descriptive Catalogue} and \emph{Annotated List (1460--1965)} bridge the instrumental and historical records. Globally relocated coverage exists via ISC-GEM (from 1904) and later ISC-EHB (from 1964).
\item[1980s (digitisation).] Continuous digital waveforms are archived from September 1986. The 1987 Edgecumbe sequence is an early instrumented aftershock response.
\item[1990s (first large passive experiments).] SAPSE (Southern Alps Passive Seismic Experiment, 1995--96) is a landmark temporary deployment; Wellington-region relocation work begins; Downes' \emph{Atlas of Isoseismal Maps} (1995) systematises historical macroseismic intensities.
\item[2000s (targeted arrays and double-difference relocation).] A wave of temporary arrays (Marlborough \texttt{XB}, Tongariro, Taranaki, CNIPSE/NIGHT, SAHKE, ALFA08/09, and the SAMBA borehole array from 2008); double-difference relocation becomes standard; the 2003 Fiordland response.
\item[2010s (GeoNet modernises; sequences drive dense catalogues).] GeoNet moves to SeisComP with 3-D NonLinLoc (2012). The Canterbury sequence (Darfield 2010, Christchurch 2011) and Kaik\=oura 2016 drive dense aftershock and ocean-bottom catalogues (HOBITSS, 2014--15). Matched-filter / template-matching catalogues emerge, and slow-slip and tremor / low-frequency catalogues mature.
\item[2020s (machine-scale relocation, synthetics, multi-year geodetic catalogues).] High-precision matched-filter and nested-tomography catalogues (Taup\=o Volcanic Zone; Hikurangi); long RSQSim synthetic catalogues for NSHM 2022; multi-year GNSS slow-slip catalogues; dense onshore arrays (DWARFS, SALSA, SOSA); volcanic-unrest catalogues at Taup\=o (2019; 2022--23); and geothermal induced-seismicity monitoring (Rotokawa, Ngatamariki).
\end{description}`);

// ===================== 5. SUMMARY STATISTICS =============================
W(String.raw`\section{Summary statistics}\label{sec:stats}
Table~\ref{tab:counts} gives the distribution of the ${total} catalogues across categories; Table~\ref{tab:index} is a master index, numbered as in the detailed inventory (Section~\ref{sec:inventory}).

\begin{table}[h]
\centering
\caption{Catalogues by category.}\label{tab:counts}
\begin{tabular}{@{}L{9.5cm} r@{}}
\toprule
\textbf{Category} & \textbf{Count} \\
\midrule`);
for (const [k, title] of CAT) if (counts[k]) W(`${tex(title)} & ${counts[k]} \\\\`);
W(String.raw`\midrule
\textbf{Total} & \textbf{${total}} \\
\bottomrule
\end{tabular}
\end{table}

\begin{center}
{\small\textbf{Distribution by category}}\\[4pt]
\begin{tabular}{@{}L{6.6cm} l r@{}}`);
for (const [k, title] of CAT) if (counts[k]) {
  // Scale so the largest category fits the 8.55 cm available beside the 6.6 cm label
  // column; 0.45 cm/unit pushed the widest bar ~1 cm into the right margin.
  const w = (counts[k] * 0.35).toFixed(2);
  W(`${tex(title.replace(/ catalogues$/i, ''))} & \\textcolor{barblue}{\\rule{${w}cm}{8pt}} & ${counts[k]} \\\\`);
}
W(String.raw`\end{tabular}
\end{center}

\paragraph{Availability.} ${nDatasetDOI} of the ${total} catalogues carry a DOI that resolves to the dataset itself. A further ${nPubDOI} have no dataset identifier of their own but are described by a DOI-bearing publication, ${nNetDOI} carry only an FDSN network DOI covering the waveforms rather than the catalogue, and ${total - nDatasetDOI - nPubDOI - nNetDOI} carry neither. A publication DOI identifies the paper, not the data, so it does not by itself make a catalogue citable as a dataset.

\begin{small}
\begin{longtable}{@{}r L{4.5cm} L{1.9cm} L{1.6cm} L{5.7cm}@{}}
\caption{Master index of catalogues (number matches the detailed entry in Section~\ref{sec:inventory}). The final column gives availability, the primary reference, and the DOI / dataset link where one exists.}\label{tab:index}\\
\toprule
\textbf{\#} & \textbf{Catalogue} & \textbf{Period} & \textbf{Type} & \textbf{Availability, ref \& DOI} \\
\midrule
\endfirsthead
\multicolumn{5}{l}{\small\itshape Table~\ref{tab:index} continued}\\
\toprule
\textbf{\#} & \textbf{Catalogue} & \textbf{Period} & \textbf{Type} & \textbf{Availability, ref \& DOI} \\
\midrule
\endhead
\bottomrule
\endfoot`);
let idx = 0;
for (const [k] of CAT) {
  for (const e of cats.filter(e => e.profile.category === k)) {
    idx++;
    const p = e.profile;
    const period = `${tex(norm(p.start_date) || '?')}\\,--\\,${tex(norm(p.end_date) || '?')}`;
    const availWord = norm(p.data_availability).replace(/available \(DOI\)/i, doiPrefix(p.doi) ? 'open (DOI)' : 'open (link)').replace(/available on request/i, 'on request').replace(/not available/i, 'not avail.');
    const parts = [];
    if (availWord) parts.push(tex(availWord));
    const rk = (p.key_references && p.key_references[0]) ? addRef(p.key_references[0]) : '';
    if (rk) parts.push(`\\cite{${rk}}`);
    if (clean(p.doi)) parts.push(`{\\footnotesize ${doiTeX(p.doi)}}`);
    const avail = parts.length ? parts.join(', ') : '--';
    W(`${idx} & \\hyperlink{c:${idx}}{${texName(clean(p.name))}} & ${period} & ${tex(norm(p.catalogue_type) || '--')} & ${avail} \\\\`);
  }
}
W(String.raw`\end{longtable}
\end{small}`);

// ===================== 5b. SPATIAL COVERAGE ==============================
W(String.raw`\section{Spatial coverage}\label{sec:spatial}
Figure~\ref{fig:coverage} maps where the inventory's catalogues sit. Panel~(a) shows the footprint of each regional catalogue (a representative bounding box) over the New Zealand coastline and active-fault network, coloured by type; the ${nNat} national / NZ-wide catalogues are not drawn because they span the whole country, and ${nOffN} Kermadec-arc catalogues lie north of the map. Panel~(b) counts how many regional catalogues overlap each $0.1^\circ$ cell, which shows where catalogues concentrate, the Taup\=o Volcanic Zone, the Hikurangi margin, Canterbury, and the central Alpine Fault, while large offshore tracts, Fiordland, and the far south remain thinly catalogued. This spatial unevenness is the visual counterpart of the gaps discussed in Section~\ref{sec:gaps}.

\begin{sidewaysfigure}
\centering
\includegraphics[width=0.9\textheight]{figures/nz_catalogue_coverage.pdf}
\caption{Spatial coverage of the Aotearoa New Zealand earthquake-catalogue inventory. \textbf{(a)} Regional catalogue footprints (representative bounding boxes) coloured by category, over the coastline and active-fault network; national / NZ-wide and Kermadec-arc catalogues are handled in the annotations. \textbf{(b)} Number of regional catalogues overlapping each $0.1^\circ$ grid cell. Footprints are indicative extents for discovery, not precise data boundaries.}
\label{fig:coverage}
\end{sidewaysfigure}`);

// ===================== 6. COVERAGE GAPS ==================================
W(String.raw`\section{Coverage gaps and FAIR weaknesses}\label{sec:gaps}
\begin{itemize}[leftmargin=1.4em,itemsep=3pt]
\item \textbf{Not a census.} Because earthquake-catalogue production is decentralised and continuous, a residual long tail remains: likely-missing material includes further PhD-thesis catalogues, additional dedicated catalogues for New Zealand $M_w\!\geq\!6$ aftershock responses since 1960, more geothermal fields (Ohaaki, Mokai, Ng\=awh\=a), and the SISIE/MOANA/SHIRE offshore experiments not yet retained as distinct event catalogues.
\item \textbf{Discoverability is the core problem.} Temporary-deployment and regional catalogues live across journal supplements, Zenodo, IRIS/EarthScope, and FDSN network DOIs: the fragmentation a registry exists to fix.
\item \textbf{Heterogeneity.} Magnitude scales vary ($M_L$; $M_w$ via the GeoNet moment-tensor catalogue from 2003; the homogenised $M_{LNZ20}\!\rightarrow\!M_w$ used for NSHM 2022); the magnitude of completeness $M_c$ is rarely stated and is spatially variable; depths span 0--$\sim$600\,km for subduction seismicity, while many regional catalogues are shallow-crustal only.
\end{itemize}`);

// ===================== 7. THE INVENTORY ==================================
W(String.raw`\section{The inventory}\label{sec:inventory}
Each entry follows the submission-profile schema (Appendix~\ref{app:schema}). The italic header line gives \emph{catalogue type $\cdot$ focus $\cdot$ detection method $\cdot$ review status}. References are cited to the bibliography at the end of the report.`);

let n = 0;
for (const [k, title, intro] of CAT) {
  const group = cats.filter(e => e.profile.category === k);
  if (!group.length) continue;
  W(`\\subsection{${tex(title)}}`);
  W(`\\textit{${tex(intro)}}\\par\\vspace{4pt}`);
  for (const e of group) {
    n++;
    const p = e.profile;
    W(`\\subsubsection*{\\hypertarget{c:${n}}{${n}.}~ ${texName(clean(p.name))}}`);
    const meta = [];
    for (const f of ['catalogue_type', 'focus', 'detection_method', 'review_status']) if (norm(p[f])) meta.push(norm(p[f]));
    if (meta.length) W(`{\\small\\itshape ${tex(meta.join(' · '))}}\\par\\vspace{2pt}`);
    W(`\\begin{itemize}[leftmargin=1.3em,itemsep=0.6pt,topsep=1pt,parsep=0pt]`);
    if (norm(p.aka)) W(`\\kv{Also known as}{${tex(norm(p.aka))}}`);
    {
      const sd = norm(p.start_date), ed = norm(p.end_date);
      // Say 'not documented' once, rather than printing 'unknown to unknown'.
      const cov = (!sd && !ed) ? 'not documented in the cited source'
                : (sd && ed)   ? `${tex(sd)} to ${tex(ed)}`
                : sd           ? `${tex(sd)} onwards (end not documented)`
                               : `start not documented, to ${tex(ed)}`;
      W(`\\kv{Coverage}{${cov}}`);
    }
    if (norm(p.region)) W(`\\kv{Region}{${tex(norm(p.region))}}`);
    if (norm(p.bounding_box)) W(`\\kv{Bounding box}{${tex(norm(p.bounding_box))}}`);
    if (norm(p.depth_range)) W(`\\kv{Depth range}{${tex(norm(p.depth_range))}}`);
    if (norm(p.magnitude_info)) W(`\\kv{Magnitude}{${tex(norm(p.magnitude_info))}}`);
    if (norm(p.event_count)) W(`\\kv{Events}{${tex(norm(p.event_count))}}`);
    if (norm(p.content_flags)) W(`\\kv{Content}{${tex(norm(p.content_flags))}}`);
    if (norm(p.contact)) W(`\\kv{Producer / contact}{${tex(norm(p.contact)).replace(/@/g, '@\\allowbreak{}')}}`);
    if (norm(p.data_source)) W(`\\kv{Data source}{${tex(norm(p.data_source))}}`);
    const av = [];
    if (norm(p.data_availability)) {
      let da = norm(p.data_availability);
      if (da === 'available (DOI)' && !doiPrefix(p.doi)) da = 'available (open link)';
      av.push(tex(da));
    }
    if (clean(p.doi)) {
      const lbl = !doiPrefix(p.doi) ? 'Link '
                : isDatasetDOI(p.doi) ? 'Dataset DOI '
                : isNetworkDOI(p.doi) ? 'FDSN network DOI '
                : 'Publication DOI ';
      av.push(lbl + doiTeX(p.doi));
    }
    if (av.length) W(`\\kv{Availability}{${av.join(' $\\cdot$ ')}}`);
    W(`\\end{itemize}`);
    if (norm(p.description)) W(`\\par\\vspace{2pt}${tex(scrub(clean(p.description)))}`);
    if (norm(p.related)) W(`\\par{\\small\\itshape Related: ${tex(scrub(clean(p.related)))}}`);
    const keys = (p.key_references || []).filter(Boolean).map(addRef).filter(Boolean);
    if (keys.length) W(`\\par\\vspace{2pt}\\textbf{Key references:} \\cite{${keys.join(',')}}.`);
    W(`\\catentryrule`);
  }
}

// ===================== 8. CONCLUSION =====================================
W(String.raw`\section{Conclusion}\label{sec:conclusion}
This report inventories ${total} earthquake catalogues developed for, or covering, Aotearoa New Zealand with coverage spanning 1960--2026, profiled to a common submission schema. The exercise confirms both the strength of the national record and the scale of the discoverability gap below it: temporary deployments and regional catalogues, often the most detailed local datasets available, are also the hardest to find, compare, and cite. Populating a lightweight, openly versioned registry with descriptors such as these is a low-cost, near-term step that would make the country's earthquake science measurably more findable, comparable, and reusable. This inventory is offered as a starting population of that registry and as a reproducible reference that can be extended as the long tail is filled in.`);

// ===================== APPENDIX + BIBLIOGRAPHY ===========================
W(String.raw`\appendix
\section{The Catalogue Submission Profile (schema)}\label{app:schema}
Each entry is described by the minimum-attributes submission profile proposed for the national \textquotedblleft catalogue of catalogues\textquotedblright. Required fields are kept to a small core to lower the barrier to contribution; controlled drop-downs are preferred over free text.
\begin{itemize}[leftmargin=1.4em,itemsep=1pt]
\item \textbf{Identification and contact:} catalogue name; contact person(s); data source; brief description; additional notes.
\item \textbf{Coverage:} start date; end date (or \emph{continuous/ongoing}); bounding box (lat/long); depth range; region of interest; magnitude information (range and/or completeness).
\item \textbf{Content present} (tick all): hypocentral locations; relative relocations; phase arrival-time picks; amplitude picks; fault-geometry; historical observations; quality information; other.
\item \textbf{Classification} (controlled): catalogue type (background / aftershock / induced / historical / compilation / large-events-only); focus (geographical / parameter-testing / particular-event-type); detection method (manual / automatic / template-matching / machine-learning / felt-reports / other); review status (non-reviewed / partially reviewed / reviewed).
\item \textbf{Availability:} available (DOI) / available on request / not available; plus DOI or dataset link where one exists.
\end{itemize}
This profile complements the richer event-level metadata profile (aligned with QuakeML and FDSN conventions) used for catalogues ingested in full.

\addcontentsline{toc}{section}{References}
\bibliographystyle{plainnat}
\bibliography{nz_catalogues}

\end{document}`);

const OUTDIR = '.';
fs.mkdirSync(OUTDIR, { recursive: true });
const rendered = (out.join('\n').match(/\\hypertarget\{c:\d+\}/g) || []).length;
if (rendered !== cats.length) {
  throw new Error(`FATAL: ${cats.length} records in inventory_data.json but ${rendered} rendered. `
    + `A record's "category" is missing or absent from CAT, so it would be silently dropped `
    + `while still being counted in the totals.`);
}
fs.writeFileSync(OUTDIR + '/nz_earthquake_catalogues_1960-2026.tex', out.join('\n'));

// ---- write the .bib ------------------------------------------------------
const bib = [];
bib.push('% BibTeX database for: Earthquake Catalogues of Aotearoa New Zealand, 1960-2026');
bib.push('% Bibliography for the inventory report; keys are cited from the report.');
bib.push('');
const F = (name, val) => val ? `  ${name} = {${val}},` : null;
for (const { key, p } of bibEntries) {
  const typeMap = { article: 'article', report: 'techreport', thesis: 'phdthesis', mastersthesis: 'mastersthesis', dataset: 'misc', inproceedings: 'inproceedings', book: 'book', misc: 'misc' };
  const bt = typeMap[p.type] || 'misc';
  bib.push(`% source: ${p.raw.replace(/[\r\n]+/g, ' ')}`);
  const lines = [`@${bt}{${key},`];
  const push = (s) => { if (s) lines.push(s); };
  push(F('author', bibEsc(p.author)));
  push(F('title', p.title ? `{${bibEsc(p.title)}}` : ''));
  push(F('year', bibEsc(p.year)));
  if (bt === 'article') { push(F('journal', bibEsc(p.journal))); push(F('volume', bibEsc(p.volume))); push(F('number', bibEsc(p.number))); push(F('pages', bibEsc(p.pages))); }
  else if (bt === 'inproceedings') { push(F('booktitle', bibEsc(p.venue))); }
  else if (bt === 'book') { push(F('publisher', bibEsc(p.venue))); }
  else if (bt === 'techreport') { push(F('institution', bibEsc(p.venue))); }
  else if (bt === 'phdthesis' || bt === 'mastersthesis') {
    // school is the institution only; strip the degree wording, which BibTeX prints itself
    const school = String(p.venue || '')
      .replace(/^[^,]*\b(?:thesis|dissertation)\b[^,]*,\s*/i, '')
      .replace(/\b(?:MSc|M\.Sc\.?|PhD|Ph\.D\.?)\s+thesis\b\s*/gi, '')
      .replace(/\(.*?\)/g, '').replace(/^[\s,;-]+|[\s,;-]+$/g, '').trim();
    push(F('school', bibEsc(school || 'Institution not stated')));
  }
  else { push(F('howpublished', bibEsc(p.venue))); }
  push(F('doi', p.doi));
  push(F('url', p.url));
  // note intentionally omitted: it duplicated `url` in every reference
  // remove trailing comma from last field
  let last = lines.length - 1;
  lines[last] = lines[last].replace(/,$/, '');
  lines.push('}');
  bib.push(lines.join('\n'));
  bib.push('');
}
fs.writeFileSync(OUTDIR + '/nz_catalogues.bib', bib.join('\n'));

console.log('Wrote report/nz_earthquake_catalogues_1960-2026.tex');
console.log('Wrote report/nz_catalogues.bib');
console.log('entries:', n, '| bib refs:', bibEntries.length);
const byType = {}; for (const b of bibEntries) byType[b.p.type] = (byType[b.p.type] || 0) + 1;
console.log('bib types:', JSON.stringify(byType));
