// The sample run: a finished pciSeq run anyone can open with one click on the
// welcome screen, to try the viewer without data of their own.
//
// The run is one tar.zst archive in the pciSeq documentation bucket. The first
// click downloads it into the app's own data folder, checks its sha256, unpacks
// it and opens it; every later click opens the unpacked copy straight away.
// Help, Remove Demo Data frees the space again.
//
// The archive is encrypted with a keyword, AES-256-GCM (made by
// dev_notes/demo_clip/encrypt_demo.sh), so only people given the keyword can use
// it. The keyword is checked against the file's 58-byte header before the big
// download, used once to decrypt while unpacking, and never saved.
//
// No new dependency: Node's zlib decodes zstd (Node 22.15 and newer, Electron 40
// ships Node 24), and the tar is read by the few lines in untar() below. The
// archive is ours, plain files and folders in one viewer_data folder, so that
// is all the reader has to know.

const { app, ipcMain, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { Writable } = require('stream');

const SAMPLE = {
  url: 'https://storage.googleapis.com/pciseq_documentation/demo/pciSeq_demo_data.tar.zst.enc',
  bytes: 598358661,         // the encrypted file: header, data, tag
  sha256: '1c50a7b92b5f6c8f0fd610b43c240fd772aef591f3123cdd7483ae89de647465',
  unpacked: 1526199647,     // the files inside, once unpacked
};

// The encrypted file, as encrypt_demo.js writes it: 'PCSQENC1', scrypt N (4 bytes,
// big endian), r, p, salt (16), iv (12), a keyword check (16), then the data, then
// the 16-byte GCM tag.
const HEADER = 58, TAG = 16;

// a keyword error: says so plainly, and keeps whatever was already downloaded
function wrongKeyword() {
  const e = new Error('wrong keyword');
  e.code = 'WRONG_KEYWORD';
  e.resumable = true;
  return e;
}

// the key from the keyword and the header; throws on a wrong keyword or a file
// that is not ours
function keyFrom(keyword, header) {
  if (header.length < HEADER || header.toString('ascii', 0, 8) !== 'PCSQENC1') {
    throw new Error('the demo file is not in the expected format');
  }
  if (!keyword) throw wrongKeyword();
  const N = header.readUInt32BE(8), r = header[12], p = header[13];
  const salt = header.subarray(14, 30), iv = header.subarray(30, 42), check = header.subarray(42, 58);
  const key = crypto.scryptSync(String(keyword), salt, 32, { N, r, p, maxmem: 256 * 1024 * 1024 });
  const mine = crypto.createHmac('sha256', key).update('pciseq-demo-check').digest().subarray(0, 16);
  if (!crypto.timingSafeEqual(mine, check)) throw wrongKeyword();
  return { key, iv };
}

// a download that receives nothing for this long is given up, so a connection that
// goes quiet without closing ends in an error the user can retry, not a frozen bar
const IDLE_MS = 30000;

// the menu items that would open another run while the sample is downloading; they
// are greyed out until it is done, or the sample would open over the user's run
const MENU_IDS = ['open-dataset', 'open-tiles', 'close-dataset'];
function menuEnabled(on) {
  const menu = Menu.getApplicationMenu();
  if (!menu) return;
  for (const id of MENU_IDS) {
    const item = menu.getMenuItemById(id);
    if (item) item.enabled = on;
  }
}

// an error the next click cannot fix by resuming: the partial file is gone
function fresh(message) {
  const e = new Error(message);
  e.resumable = false;
  return e;
}

let mainWindow = null;
let dataLoader = null;
let busy = null;           // the running download, so a second click joins it

function init(mw, loader) {
  mainWindow = mw;
  dataLoader = loader;
}

const root = () => path.join(app.getPath('userData'), 'sample_run');
const folder = () => path.join(root(), 'viewer_data');
const archive = () => path.join(root(), 'pciSeq_demo_data.tar.zst.enc');

// unpacked and complete: the marker is written last, so a crash halfway through
// the unpack leaves no marker and the next click unpacks again
const ready = () => fs.existsSync(path.join(root(), '.complete'));

function send(state) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('sample-progress', state);
}

// ---------------------------------------------------------------- download

// GET with a Range header when part of the file is already on disk, so a broken
// download goes on where it stopped. Redirects are followed, up to five.
function get(url, start, hops = 0, range = null) {
  return new Promise((resolve, reject) => {
    const headers = range ? { Range: range } : start > 0 ? { Range: `bytes=${start}-` } : {};
    const req = https.get(url, { headers }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops < 5) {
        res.resume();
        resolve(get(new URL(res.headers.location, url).toString(), start, hops + 1, range));
      } else if (res.statusCode === 200 || res.statusCode === 206) {
        resolve(res);
      } else {
        res.resume();
        reject(new Error(`the download answered ${res.statusCode}`));
      }
    });
    req.on('error', reject);
    // no answer at all, a server or network that never replies
    req.setTimeout(IDLE_MS, () => req.destroy(new Error('the server did not answer')));
  });
}

// the first bytes of the file: from what is already on disk when there is enough,
// otherwise a range request for just the header
async function readHeader() {
  for (const f of [archive(), archive() + '.part']) {
    if (fs.existsSync(f) && fs.statSync(f).size >= HEADER) {
      const fd = fs.openSync(f, 'r');
      const h = Buffer.alloc(HEADER);
      fs.readSync(fd, h, 0, HEADER, 0);
      fs.closeSync(fd);
      return h;
    }
  }
  const res = await get(SAMPLE.url, 0, 0, `bytes=0-${HEADER - 1}`);
  const chunks = [];
  let n = 0;
  for await (const c of res) { chunks.push(c); n += c.length; if (n >= HEADER) { res.destroy(); break; } }
  return Buffer.concat(chunks).subarray(0, HEADER);
}

// space for what is still to come: the rest of the archive and the unpacked files,
// with a little room on top. Checked before the download, not discovered halfway
// through the unpack.
function checkSpace(have) {
  let free;
  try {
    const st = fs.statfsSync(root());
    free = st.bavail * st.bsize;
  } catch {
    return;                                    // cannot tell: let it try
  }
  const need = (SAMPLE.bytes - have) + SAMPLE.unpacked + 100e6;
  if (free < need) {
    const gb = n => (n / 1e9).toFixed(1);
    const e = new Error(`not enough space on the disk: the demo data needs ${gb(need)} GB, ${gb(free)} GB are free`);
    e.resumable = true;
    throw e;
  }
}

async function download() {
  fs.mkdirSync(root(), { recursive: true });
  const part = archive() + '.part';
  let have = fs.existsSync(part) ? fs.statSync(part).size : 0;
  if (have > SAMPLE.bytes) { fs.rmSync(part); have = 0; }
  checkSpace(have);
  if (have < SAMPLE.bytes) {
    const res = await get(SAMPLE.url, have);
    // data that stops coming: give up after a while, the part on disk is kept
    res.setTimeout(IDLE_MS, () => res.destroy(new Error('the connection stalled')));
    // a server that ignores the range sends the whole file again: start over
    if (have > 0 && res.statusCode === 200) have = 0;
    let got = have, last = 0;
    res.on('data', chunk => {
      got += chunk.length;
      const now = Date.now();
      if (now - last > 200) { last = now; send({ phase: 'download', done: got, total: SAMPLE.bytes }); }
    });
    await pipeline(res, fs.createWriteStream(part, { flags: have > 0 ? 'a' : 'w' }));
  }
  send({ phase: 'check' });
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(part), hash);
  const sum = hash.digest('hex');
  if (sum !== SAMPLE.sha256) {
    fs.rmSync(part, { force: true });
    throw fresh('the downloaded file was damaged and has been deleted');
  }
  fs.renameSync(part, archive());
}

// ---------------------------------------------------------------- unpack

// A tar reader for our own archive: 512 byte headers, each followed by the file's
// bytes padded to 512. Regular files and folders only, names kept inside the
// target folder. The long-name extension of GNU tar (type L) is honoured, pax
// headers (x, g) are skipped.
function untar(dest) {
  let buf = Buffer.alloc(0);
  let file = null;        // { fd, left, pad }
  let longName = null;
  const destRoot = path.resolve(dest);

  const field = (h, at, len) => h.subarray(at, at + len).toString('utf8').replace(/\0.*$/s, '');
  const octal = (h, at, len) => parseInt(field(h, at, len).trim() || '0', 8);

  return new Writable({
    write(chunk, _enc, done) {
      try {
        buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
        for (;;) {
          if (file) {
            if (file.left > 0) {
              const n = Math.min(file.left, buf.length);
              if (n === 0) break;
              if (file.fd !== null) fs.writeSync(file.fd, buf, 0, n);
              else file.text.push(buf.subarray(0, n));
              buf = buf.subarray(n); file.left -= n;
              if (file.left > 0) break;
            }
            if (buf.length < file.pad) break;
            buf = buf.subarray(file.pad);
            if (file.fd !== null) fs.closeSync(file.fd);
            else if (file.isLongName) longName = Buffer.concat(file.text).toString('utf8').replace(/\0.*$/s, '');
            file = null;
          }
          if (buf.length < 512) break;
          const h = buf.subarray(0, 512);
          buf = buf.subarray(512);
          if (h.every(b => b === 0)) continue;          // the end blocks
          const type = String.fromCharCode(h[156] || 48);
          const prefix = field(h, 345, 155);
          let name = longName || (prefix ? prefix + '/' : '') + field(h, 0, 100);
          if (type !== 'L') longName = null;
          const size = octal(h, 124, 12);
          const pad = (512 - (size % 512)) % 512;
          const target = path.resolve(destRoot, name);
          if (target !== destRoot && !target.startsWith(destRoot + path.sep)) {
            throw new Error('the archive holds a path outside its folder: ' + name);
          }
          if (type === '5') {
            fs.mkdirSync(target, { recursive: true });
            file = { fd: null, left: size, pad, text: [] };
          } else if (type === '0' || type === '\0' || type === '7') {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            file = { fd: fs.openSync(target, 'w'), left: size, pad };
          } else if (type === 'L') {
            file = { fd: null, left: size, pad, text: [], isLongName: true };
          } else {
            file = { fd: null, left: size, pad, text: [] };   // pax and the rest: skipped
          }
        }
        done();
      } catch (e) {
        if (file && file.fd !== null) { try { fs.closeSync(file.fd); } catch {} }
        done(e);
      }
    },
  });
}

async function unpack({ key, iv }) {
  send({ phase: 'unpack' });
  const tmp = path.join(root(), 'unpacking');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  // decrypt, decompress and untar in one stream. The tag sits at the end of the
  // file and is read first; a changed byte makes the decipher fail at the end,
  // and nothing reaches the folder the viewer opens, it is all still in tmp.
  const size = fs.statSync(archive()).size;
  const tag = Buffer.alloc(TAG);
  const fd = fs.openSync(archive(), 'r');
  fs.readSync(fd, tag, 0, TAG, size - TAG);
  fs.closeSync(fd);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    await pipeline(fs.createReadStream(archive(), { start: HEADER, end: size - TAG - 1 }),
                   decipher, zlib.createZstdDecompress(), untar(tmp));
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    // the GCM tag did not match: a changed byte. The file is no use, start over
    if (/authenticate/i.test(e.message)) {
      fs.rmSync(archive(), { force: true });
      throw fresh('the demo file failed its integrity check and has been deleted');
    }
    throw e;
  }
  if (!fs.existsSync(path.join(tmp, 'viewer_data', 'arrow_cells'))) {
    throw new Error('the archive does not hold a viewer_data folder');
  }
  fs.rmSync(folder(), { recursive: true, force: true });
  fs.renameSync(path.join(tmp, 'viewer_data'), folder());
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(archive(), { force: true });          // the unpacked copy is all we keep
  fs.writeFileSync(path.join(root(), '.complete'), SAMPLE.sha256 + '\n');
}

// ---------------------------------------------------------------- the entry points

// Download and unpack when needed, then open it like any data folder. The
// renderer reloads on success, the same as after Open Data Folder.
// The window is reloaded here, in the main process, once the sample is open, not
// by the page that was clicked: that page may have been reloaded meanwhile, and
// --sample has no click at all.
async function openSample(keyword) {
  if (!busy) {
    busy = (async () => {
      if (!ready()) {
        menuEnabled(false);
        fs.mkdirSync(root(), { recursive: true });
        // the keyword first, against the header: a wrong one costs 58 bytes, not 600 MB
        const k = keyFrom(keyword, await readHeader());
        if (!fs.existsSync(archive())) await download();
        await unpack(k);
      }
      const opened = dataLoader.openDataFolder(folder());
      if (!opened.success) throw new Error(opened.error || 'the demo data could not be opened');
      send({ phase: 'done' });
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
      return opened;
    })().catch(e => {
      // whoever started it, a click or --sample, the welcome screen says what went
      // wrong, and whether the next click goes on from where this one stopped
      send({ phase: 'error', error: e.message, resumable: e.resumable !== false, code: e.code || null });
      throw e;
    }).finally(() => { busy = null; menuEnabled(true); });
  }
  return busy;
}

function status() {
  return { ready: ready(), bytes: SAMPLE.bytes, folder: folder(), busy: !!busy };
}

function remove() {
  if (busy) return { success: false, error: 'the demo data is still downloading' };
  fs.rmSync(root(), { recursive: true, force: true });
  return { success: true };
}

ipcMain.handle('sample-status', () => status());
ipcMain.handle('sample-open', async (_e, keyword) => {
  try {
    return await openSample(keyword);
  } catch (e) {
    return { success: false, error: e.message, resumable: e.resumable !== false, code: e.code || null };
  }
});

module.exports = { init, openSample, status, remove, folder, SAMPLE };
