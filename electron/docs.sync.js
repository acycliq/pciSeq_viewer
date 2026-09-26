// Copies the pciSeq documentation pages into electron/pciseq_docs, for the chat
// panel's docs tool. The pages live in the pciSeq_3d repo (website/docs) and this
// repo cannot see it at build time, so the copy is committed here. Rerun after the
// docs change:
//
//   node electron/docs.sync.js [path/to/pciSeq_3d/website/docs]
//
// Only the markdown is copied, the images and the vitepress build folders are not.
// Same skip list as pack_docs in pciSeq_3d/setup.py. When the source is a git
// checkout only tracked pages are taken, so a draft sitting in the tree does not
// ship by accident.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SKIP = new Set(['node_modules', '.vitepress', '_tables', 'public']);
const src = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..', 'python', 'pciSeq_3d', 'website', 'docs'));
const dst = path.join(__dirname, 'pciseq_docs');

if (!fs.existsSync(path.join(src, 'index.md'))) {
  console.error('no docs at ' + src + ', give the path to pciSeq_3d/website/docs');
  process.exit(1);
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) {
      if (!SKIP.has(name)) walk(p, out);
    } else if (name.endsWith('.md')) {
      out.push(p);
    }
  }
  return out;
}

function tracked() {
  try {
    const out = execFileSync('git', ['-C', src, 'ls-files', '--', '*.md'], { encoding: 'utf8' });
    return out.split('\n').filter(Boolean).map(f => path.join(src, f))
      .filter(f => !f.split(path.sep).some(part => SKIP.has(part)));
  } catch {
    return null;
  }
}

fs.rmSync(dst, { recursive: true, force: true });
let n = 0;
for (const file of tracked() || walk(src)) {
  const rel = path.relative(src, file);
  fs.mkdirSync(path.dirname(path.join(dst, rel)), { recursive: true });
  fs.copyFileSync(file, path.join(dst, rel));
  n++;
}
console.log('copied ' + n + ' pages from ' + src + ' to ' + dst);
