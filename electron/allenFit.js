// The chat's fit_allen_regions tool: Allen brain regions on a coronal mouse section,
// fitted from one or two regions the user drew. The fitting lives in python,
// pciSeq.allen_regions; this file finds a python that has pciSeq, runs it on the
// user's annotations and reads back the Allen regions (bead pciSeq_3d-7wp).
//
// Which python: the one the user told us before (kept in the viewer's settings,
// never in the run), else python3 or python on the PATH, whichever can import the
// module. If none can, the tool asks for the path through the chat.

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const annotations = require('./annotations');

const MODULE = 'pciSeq.allen_regions';
const FIT_TIMEOUT_MS = 5 * 60 * 1000;   // the fit takes about half a minute; a first run also downloads the atlas
const CHECK_TIMEOUT_MS = 30 * 1000;

// store: the viewer's settings (electron-store); getMeta: the run's metadata
let deps = { store: null, getMeta: () => null };

function init(d) {
  deps = { ...deps, ...d };
}

function run(cmd, args, timeout) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim().split('\n').slice(-3).join(' ')));
      else resolve(stdout);
    });
  });
}

// can this python run the fit?
async function works(python) {
  try {
    await run(python, ['-c', `import ${MODULE}`], CHECK_TIMEOUT_MS);
    return true;
  } catch {
    return false;
  }
}

// the python to use, remembered once found; null if there is none
async function findPython(given) {
  const candidates = [given, deps.store.get('pythonPath'), 'python3', 'python'].filter(Boolean);
  for (const python of candidates) {
    if (await works(python)) {
      deps.store.set('pythonPath', python);
      return python;
    }
  }
  return null;
}

// landmarks: [{ region, allen, relation }] -> the module's --landmark arguments
function landmarkArgs(landmarks) {
  return landmarks.flatMap(l => ['--landmark',
    `${l.region}=${l.allen}${l.relation === 'inside' ? ':inside' : ''}`]);
}

// Returns { regions, summary }: the Allen regions to add to the annotations, and
// what the fit found. Throws with a message meant for the chat.
async function fitAllenRegions({ landmarks, python_path = null }) {
  const python = await findPython(python_path);
  if (!python) {
    throw new Error('no python with pciSeq (and its allen_regions module) was found. Ask the user ' +
                    'for the full path of the python they run pciSeq with (inside that environment, ' +
                    '"which python" on Linux or Mac, "where python" on Windows), then call again with ' +
                    'python_path. If pciSeq is older than this tool, they need to update it.');
  }
  const config = deps.getMeta()?.config || {};
  const px = config.voxel_size?.[0];
  const dim = config.img_dim;
  if (!px || !dim) throw new Error('this run does not record its pixel size or image size, so the atlas cannot be scaled to it');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pciseq-allen-'));
  try {
    const input = path.join(dir, 'outlines.geojson');
    const output = path.join(dir, 'allen.geojson');
    fs.writeFileSync(input, JSON.stringify(annotations.toGeoJSON(annotations.list())));
    const stdout = await run(python, ['-m', MODULE, input, output, ...landmarkArgs(landmarks),
                                      '--pixel-size', String(px), '--image-size', String(dim.w), String(dim.h)],
                             FIT_TIMEOUT_MS);
    const summary = JSON.parse(stdout.trim().split('\n').pop());
    const { regions } = annotations.fromGeoJSON(JSON.parse(fs.readFileSync(output, 'utf8')));
    return { regions, summary };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { init, fitAllenRegions, landmarkArgs };
