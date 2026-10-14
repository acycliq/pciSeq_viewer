// The sample run: a finished pciSeq run anyone can open with one click on the
// welcome screen, to try the viewer without data of their own.
//
// The run is one tar.zst archive in the pciSeq documentation bucket. The first
// click downloads it into the app's own data folder, checks its sha256, unpacks
// it and opens it; every later click opens the unpacked copy straight away.
// Help, Remove Sample Run frees the space again.
//
// No new dependency: Node's zlib decodes zstd (Node 22.15 and newer, Electron 40
// ships Node 24), and the tar is read by the few lines in untar() below. The
// archive is ours, plain files and folders in one viewer_data folder, so that
// is all the reader has to know.

const { app, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { Writable } = require('stream');

const SAMPLE = {
  url: 'https://storage.googleapis.com/pciseq_documentation/demo/pciSeq_demo_data.tar.zst',
  bytes: 598358587,
  sha256: 'd8f248f321a712cd929b217ba445bff95ba49824d8ca175b7d56d88c9675fefa',
};

let mainWindow = null;
let dataLoader = null;
let busy = null;           // the running download, so a second click joins it

function init(mw, loader) {
  mainWindow = mw;
  dataLoader = loader;
}

const root = () => path.join(app.getPath('userData'), 'sample-run');
const folder = () => path.join(root(), 'viewer_data');
const archive = () => path.join(root(), 'pciSeq_demo_data.tar.zst');

// unpacked and complete: the marker is written last, so a crash halfway through
// the unpack leaves no marker and the next click unpacks again
const ready = () => fs.existsSync(path.join(root(), '.complete'));

function send(state) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('sample-progress', state);
}

// ---------------------------------------------------------------- download

// GET with a Range header when part of the file is already on disk, so a broken
// download goes on where it stopped. Redirects are followed, up to five.
function get(url, start, hops = 0) {
  return new Promise((resolve, reject) => {
    const headers = start > 0 ? { Range: `bytes=${start}-` } : {};
    https.get(url, { headers }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops < 5) {
        res.resume();
        resolve(get(new URL(res.headers.location, url).toString(), start, hops + 1));
      } else if (res.statusCode === 200 || res.statusCode === 206) {
        resolve(res);
      } else {
        res.resume();
        reject(new Error(`the download answered ${res.statusCode}`));
      }
    }).on('error', reject);
  });
}

async function download() {
  fs.mkdirSync(root(), { recursive: true });
  const part = archive() + '.part';
  let have = fs.existsSync(part) ? fs.statSync(part).size : 0;
  if (have > SAMPLE.bytes) { fs.rmSync(part); have = 0; }
  if (have < SAMPLE.bytes) {
    const res = await get(SAMPLE.url, have);
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
    throw new Error('the downloaded file is damaged (its checksum does not match). Try again.');
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

async function unpack() {
  send({ phase: 'unpack' });
  const tmp = path.join(root(), 'unpacking');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  await pipeline(fs.createReadStream(archive()), zlib.createZstdDecompress(), untar(tmp));
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
async function openSample() {
  if (!busy) {
    busy = (async () => {
      if (!ready()) {
        if (!fs.existsSync(archive())) await download();
        await unpack();
      }
      const opened = dataLoader.openDataFolder(folder());
      if (!opened.success) throw new Error(opened.error || 'the sample run could not be opened');
      send({ phase: 'done' });
      return opened;
    })().finally(() => { busy = null; });
  }
  return busy;
}

function status() {
  return { ready: ready(), bytes: SAMPLE.bytes, folder: folder(), busy: !!busy };
}

function remove() {
  if (busy) return { success: false, error: 'the sample run is still downloading' };
  fs.rmSync(root(), { recursive: true, force: true });
  return { success: true };
}

ipcMain.handle('sample-status', () => status());
ipcMain.handle('sample-open', async () => {
  try {
    return await openSample();
  } catch (e) {
    send({ phase: 'error', error: e.message });
    return { success: false, error: e.message };
  }
});

module.exports = { init, openSample, status, remove, folder, SAMPLE };
