// Allen's records for a cell type, for the chat's allen_cell_type tool: where it
// sits in the Allen whole-mouse-brain taxonomy (Yao et al. 2023, CCN20230722),
// its neurotransmitter, how many clusters and cells Allen found, and Allen's colour.
//
// Allen's files ship with the viewer in allen_taxonomy/, used under the Allen
// Institute Terms of Use for research and noncommercial purposes; the README there
// has the source, the version and how to update them.

const fs = require('fs');
const path = require('path');

const FILES = {
  terms: 'cluster_annotation_term_with_counts.csv',
  clusters: 'cluster_to_cluster_annotation_membership_pivoted.csv',
  levels: 'cluster_annotation_term_set.csv',
};
const SOURCE = 'Allen Brain Cell Atlas, whole mouse brain taxonomy CCN20230722 ' +
               '(Yao et al. 2023, Nature), used under the Allen Institute Terms of Use';
const LEVEL_RANK = { class: 1, subclass: 2, supertype: 3, cluster: 4 };

// tokens that name a transmitter or a broad group rather than a cell type, so two
// names sharing only these are not look-alikes
const GENERIC = new Set(['glut', 'gaba', 'nn', 'glyc', 'dopa', 'sero', 'chol', 'hist', 'imn', 'ne']);

// dir: where the three files are; a check can point it at its own small copies
let deps = { dir: path.join(__dirname, 'allen_taxonomy') };
let taxonomy = null;

function init(d) {
  deps = { ...deps, ...d };
  taxonomy = null;
}

// ------------------------------------------------------------------ the files

// a small CSV reader: quoted fields may hold commas and doubled quotes
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map(r => Object.fromEntries(head.map((h, j) => [h, r[j]])));
}

const readFile = name => fs.readFileSync(path.join(deps.dir, name), 'utf8');

// ------------------------------------------------------------------ the taxonomy

const tokens = name => String(name).toLowerCase().split(/[\s_\-/]+/).filter(t => t && !/^\d+$/.test(t));

async function load() {
  if (taxonomy) return taxonomy;
  const [termRows, clusterRows, levelRows] =
    [FILES.terms, FILES.clusters, FILES.levels].map(f => parseCsv(readFile(f)));
  const byLabel = new Map(termRows.map(t => [t.label, t]));
  const terms = new Map(termRows.map(t => [t.name, {
    name: t.name,
    level: t.cluster_annotation_term_set_name,
    parent: byLabel.has(t.parent_term_label) ? byLabel.get(t.parent_term_label).name : null,
    clusters: Number(t.number_of_clusters),
    cells: Number(t.number_of_cells),
    colour: t.color_hex_triplet,
    neurotransmitters: new Set(),
    children: [],
  }]));
  for (const t of terms.values()) if (t.parent && terms.has(t.parent)) terms.get(t.parent).children.push(t.name);
  // the neurotransmitter is given per cluster; a term gets those of its clusters
  for (const r of clusterRows) {
    for (const level of ['class', 'subclass', 'supertype', 'cluster']) {
      const t = terms.get(r[level]);
      if (t && r.neurotransmitter) t.neurotransmitters.add(r.neurotransmitter);
    }
  }
  const levels = new Map(levelRows.map(l => [l.name, l.description]));
  taxonomy = { terms, levels };
  return taxonomy;
}

// the same words, numbers aside: 'Vip-Gaba' and '046 Vip Gaba'
function sameWords(a, b) {
  const x = tokens(a), y = tokens(b);
  return x.length === y.length && x.every(w => y.includes(w));
}

// names sharing a cell-type word (not just a transmitter), best first
function suggest(terms, name, n = 5) {
  const q = tokens(name).filter(w => !GENERIC.has(w));
  return [...terms.values()]
    .map(t => ({ t, shared: tokens(t.name).filter(w => q.includes(w)).length }))
    .filter(x => x.shared > 0)
    .sort((a, b) => b.shared - a.shared || (a.t.level === 'subclass' ? -1 : 0) - (b.t.level === 'subclass' ? -1 : 0) || b.t.cells - a.t.cells)
    .slice(0, n)
    .map(x => ({ name: x.t.name, level: x.t.level, parent: x.t.parent }));
}

function describe(tx, t) {
  const ancestors = [];
  for (let p = t.parent; p && tx.terms.has(p); p = tx.terms.get(p).parent) ancestors.push(p);
  // other terms at the same level carrying one of its cell-type words, elsewhere in the tree
  const own = tokens(t.name).filter(w => !GENERIC.has(w));
  const lookAlikes = [...tx.terms.values()]
    .filter(o => o.name !== t.name && o.level === t.level && o.parent !== t.parent &&
                 tokens(o.name).some(w => own.includes(w)))
    .map(o => ({ name: o.name, parent: o.parent }));
  return {
    name: t.name,
    level: t.level,
    level_is: tx.levels.get(t.level) || null,
    ancestors,
    neurotransmitter: [...t.neurotransmitters],
    clusters: t.clusters,
    cells_in_allen_data: t.cells,
    allen_colour: t.colour,
    children: t.children.length ? { count: t.children.length, names: t.children.slice(0, 20) } : null,
    look_alikes: lookAlikes.slice(0, 5),
    look_alikes_are: 'types elsewhere in the taxonomy whose names share a gene with this one; a shared name is not a shared identity',
  };
}

// Allen's record for a name. Exact match first; then a name with the same words
// ('Vip-Gaba' for '046 Vip Gaba'); otherwise not found, with suggestions.
async function cellType(name) {
  const tx = await load();
  const exact = tx.terms.get(String(name).trim());
  if (exact) return { found: true, ...describe(tx, exact), source: SOURCE };
  // the same words often match a type and its own subdivisions ('0173 Vip Gaba_1'
  // loses its number), so keep the highest level among the matches
  const same = [...tx.terms.values()].filter(t => sameWords(t.name, name));
  const top = Math.min(...same.map(t => LEVEL_RANK[t.level] ?? 9));
  const close = same.filter(t => (LEVEL_RANK[t.level] ?? 9) === top);
  if (close.length === 1) {
    return { found: true, ...describe(tx, close[0]),
             note: `'${name}' is not an exact Allen name; the exact term with the same words is '${close[0].name}'`,
             source: SOURCE };
  }
  return {
    found: false,
    note: `'${name}' is not a name in Allen's whole mouse brain taxonomy`,
    suggestions: suggest(tx.terms, name),
    suggestions_are: 'Allen types whose names share a word with it, what Allen would likely call such a ' +
                     'cell; a name match is not evidence of the same cells, mapping the expression ' +
                     '(e.g. Allen\'s MapMyCells) is what would settle it',
    source: SOURCE,
  };
}

// how many of a run's class names are Allen terms, and at which level
async function matchRun(classNames) {
  const tx = await load();
  const hits = classNames.filter(n => tx.terms.has(n));
  return {
    matched: hits.length,
    of: classNames.length,
    levels: [...new Set(hits.map(n => tx.terms.get(n).level))],
    not_matched: classNames.filter(n => !tx.terms.has(n)),
    source: SOURCE,
  };
}

module.exports = { init, cellType, matchRun, parseCsv };
