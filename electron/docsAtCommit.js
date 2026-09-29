// The documentation of the run's own commit.
//
// The source tools already read pciSeq's code at pciSeq_provenance.commit, so the
// agent sees the code that made the run rather than whatever is newest. The docs
// have to match: a page describing a setting that changed since, or a tool added
// since, would contradict the run in front of the user.
//
// So website/docs is fetched from GitHub at that commit, as one tarball (a few
// hundred KB, one request), and kept in memory for the session. Without internet,
// or for a commit GitHub does not have (an unpushed one), the viewer falls back to
// the copy shipped in electron/pciseq_docs and the answer says which it used.

const zlib = require('zlib');

const REPO = 'acycliq/pciSeq_3d';
const PREFIX = 'website/docs/';

// commit -> Map(page -> text), or null when the fetch failed for this commit
const cache = new Map();

// The tar entries we want, decoded from the gzip stream. A tar is 512 byte blocks:
// a header block, then the file's bytes padded to the next block. Only the fields
// we need are read (name, size, type), which keeps this a few lines rather than a
// dependency.
function pagesFromTar(buf) {
  const pages = new Map();
  for (let off = 0; off + 512 <= buf.length;) {
    const header = buf.subarray(off, off + 512);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    if (!name) { off += 512; continue; }                 // end of archive padding
    const size = parseInt(header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim(), 8) || 0;
    const type = String.fromCharCode(header[156]);
    const body = off + 512;
    if (type === '0' || type === '\0') {
      // <repo>-<commit>/website/docs/<page>.md
      const rel = name.split('/').slice(1).join('/');
      if (rel.startsWith(PREFIX) && rel.endsWith('.md')) {
        const page = rel.slice(PREFIX.length);
        const parts = page.split('/');
        if (!parts.includes('.vitepress') && !parts.includes('_tables')) {
          pages.set(page, buf.subarray(body, body + size).toString('utf8'));
        }
      }
    }
    off = body + Math.ceil(size / 512) * 512;
  }
  return pages;
}

// The run's docs, or null when they cannot be had. Never throws: the docs tool
// falls back to the shipped copy, which is better than no answer at all.
async function docsAt(commit, fetchImpl) {
  if (!commit) return null;
  if (cache.has(commit)) return cache.get(commit);
  const f = fetchImpl || globalThis.fetch;
  let pages = null;
  try {
    const r = await f(`https://codeload.github.com/${REPO}/tar.gz/${commit}`,
                      { headers: { 'User-Agent': 'pciSeq_viewer' } });
    if (r.ok) {
      const tar = zlib.gunzipSync(Buffer.from(await r.arrayBuffer()));
      const got = pagesFromTar(tar);
      if (got.size) pages = got;
    }
  } catch (e) {
    // offline, or GitHub unreachable: the shipped copy will do
  }
  cache.set(commit, pages);
  return pages;
}

module.exports = { docsAt, pagesFromTar };
