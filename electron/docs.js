// The pciSeq documentation pages, for the chat panel's docs tool.
//
// A port of pciSeq/src/mcp/docs.py: the list of pages and a keyword search over
// their paragraphs. No index, no embeddings, the corpus is a few dozen pages and
// is searched on the spot.
//
// A corpus is either a folder path (the committed copy in electron/pciseq_docs,
// made by docs.sync.js) or a Map of page -> text (the pages of the run's own
// commit, fetched by docsAtCommit.js). Whatever the run's code says is what the
// agent should read, so the fetched pages win when they are available.

const fs = require('fs');
const path = require('path');

const SKIP = new Set(['node_modules', '.vitepress', '_tables']);

function walk(dir, root, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) {
      if (!SKIP.has(name)) walk(p, root, out);
    } else if (name.endsWith('.md')) {
      out.push(path.relative(root, p).split(path.sep).join('/'));
    }
  }
  return out;
}

// every page, as its path relative to the root, sorted
function listPages(root) {
  if (root instanceof Map) return [...root.keys()].sort();
  if (!root || !fs.existsSync(path.join(root, 'index.md'))) return [];
  return walk(root, root, []).sort();
}

function readPage(root, page) {
  if (root instanceof Map) {
    if (!root.has(page)) throw new Error(`no docs page ${page}`);
    return root.get(page);
  }
  if (!listPages(root).includes(page)) throw new Error(`no docs page ${page}`);
  return fs.readFileSync(path.join(root, page), 'utf8');
}

// the first heading of a page, or its description from the frontmatter
function pageTitle(text) {
  let m = text.match(/^# (.+)$/m);
  if (m) return m[1].trim();
  m = text.match(/^description:\s*(.+)$/m);
  return m ? m[1].trim() : '';
}

// What a page is about, in one line. The description in the frontmatter is written
// for exactly this, so it wins; only a third of the pages carry one, and the copy
// saved inside a run drops the frontmatter, so the fallback is the page's first real
// paragraph, cut short. Tables, code, containers, html and a lone bold lead-in such
// as "**Simplifications.**" are passed over: they say nothing about the page.
function pageSummary(text, maxLength = 160) {
  const described = text.match(/^description:\s*(.+)$/m);
  if (described) return described[1].trim();
  for (const [, para] of paragraphs(text)) {
    if (/^[|`:<]/.test(para)) continue;
    const line = para.replace(/\s+/g, ' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
    if (!line || /^\*\*[^*]+\*\*[.:]?$/.test(line)) continue;
    return line.length > maxLength ? line.slice(0, maxLength - 1).replace(/\s+\S*$/, '') + '...' : line;
  }
  return '';
}

// Every page with its title and what it is about: the table of contents the agent
// needs to pick a page by subject when its words do not match the text.
function contents(root) {
  return listPages(root).map(page => {
    const text = readPage(root, page);
    return { page, title: pageTitle(text), about: pageSummary(text) };
  });
}

// [heading, paragraph] pairs, heading being the nearest one above. Frontmatter is
// dropped; code blocks are kept, config keys live in them. A table is split into
// its rows, one paragraph each: a row is the unit a reader wants back (a setting,
// a function and its line), and a long table would otherwise outrank the prose
// that explains the term.
function paragraphs(text) {
  text = text.replace(/^---[\s\S]*?---\s*/, '');
  let heading = '';
  const out = [];
  for (let block of text.split(/\n\s*\n/)) {
    block = block.trim();
    if (!block) continue;
    const m = block.match(/^#+ (.+)/);
    if (m) {
      heading = m[1].trim();
      const rest = block.slice(m[0].length).trim();
      if (rest) out.push([heading, rest]);
      continue;
    }
    if (block.startsWith('|')) {
      for (const row of block.split('\n')) {
        if (!/^\|[\s\-:|]*\|$/.test(row)) out.push([heading, row]);
      }
      continue;
    }
    out.push([heading, block]);
  }
  return out;
}

// Paragraphs matching a query, best first. Words are matched case-insensitively.
// A paragraph holding every word of the query outranks one holding some of them;
// among those, prose comes before a table row, since a paragraph explains and a
// row only points; then the one with more hits.
function searchDocs(root, query, n = 5) {
  const words = (String(query).toLowerCase().match(/[a-z0-9_]+/g) || []).filter(w => w.length > 1);
  if (!words.length) return [];
  const hits = [];
  for (const page of listPages(root)) {
    const text = readPage(root, page);
    const title = pageTitle(text);
    for (const [heading, para] of paragraphs(text)) {
      const low = para.toLowerCase();
      const present = words.filter(w => low.includes(w));
      if (!present.length) continue;
      const count = present.reduce((s, w) => s + low.split(w).length - 1, 0);
      hits.push({ present: present.length, count, row: para.startsWith('|') ? 1 : 0, page, title, heading, text: para });
    }
  }
  hits.sort((a, b) => b.present - a.present || a.row - b.row || b.count - a.count || (a.page < b.page ? -1 : 1));
  return hits.slice(0, n).map(({ page, title, heading, text }) => ({ page, title, heading, text }));
}

module.exports = { listPages, readPage, pageTitle, pageSummary, contents, paragraphs, searchDocs };
