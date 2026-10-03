// The annotations (regions, outlines on the map, and cell annotations, a set of
// cells drawn with their own outlines) are kept like
// layers in Photoshop: in memory while you work, written to a file only when you
// press Save, and when you close the window or open another dataset with changes
// not saved, you are asked first. Nothing is written anywhere by itself, the data
// folder may well be read only.
//
// The file is GeoJSON, one Polygon feature per region, in the same pixel
// coordinates as the region CSVs. Plain GeoJSON polygons made elsewhere open too.
// A cell annotation has no geometry of its own, just its labels in the
// properties; the viewer draws the cells' outlines from the run.

const fs = require('fs');
const path = require('path');

const FILTERS = [{ name: 'Annotations (GeoJSON)', extensions: ['geojson', 'json'] }];

// what the renderer last sent, and whether it has been saved since
let current = { regions: [], dirty: false };

// ------------------------------------------------------------------ the file format

const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];

// GeoJSON wants the ring closed, the first point repeated at the end
const closeRing = pts => (samePoint(pts[0], pts[pts.length - 1]) ? pts : [...pts, pts[0]]);

function toGeoJSON(regions) {
  return {
    type: 'FeatureCollection',
    features: regions.map(r => {
      const common = { name: r.name, visible: r.visible !== false, by: r.by || 'you' };
      if (r.kind === 'cells') {
        return { type: 'Feature', properties: { kind: 'cells', ...common, labels: r.labels }, geometry: null };
      }
      return {
        type: 'Feature',
        properties: { kind: 'region', ...common },
        geometry: { type: 'Polygon', coordinates: [closeRing(r.boundaries)] },
      };
    }),
  };
}

// back to regions. Anything that is not a simple polygon is skipped and counted,
// so the user can be told
function fromGeoJSON(obj) {
  if (!obj || obj.type !== 'FeatureCollection' || !Array.isArray(obj.features)) {
    throw new Error('not a GeoJSON FeatureCollection');
  }
  const regions = [];
  let skipped = 0;
  obj.features.forEach((f, i) => {
    const p = f?.properties || {};
    // who made it: the user, the chat, or the Allen atlas fitted to the section (bead 7wp)
    const by = ['chat', 'allen'].includes(p.by) ? p.by : 'you';
    if (p.kind === 'cells' && Array.isArray(p.labels)) {
      regions.push({ name: String(p.name || `Cells ${i + 1}`), kind: 'cells', labels: p.labels.map(Number),
                     visible: p.visible !== false, by });
      return;
    }
    const ring = f?.geometry?.type === 'Polygon' && Array.isArray(f.geometry.coordinates?.[0])
      ? f.geometry.coordinates[0].map(p => [Number(p[0]), Number(p[1])])
      : [];
    if (ring.length > 1 && samePoint(ring[0], ring[ring.length - 1])) ring.pop();
    if (ring.length < 3 || ring.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) {
      skipped++;
      return;
    }
    regions.push({
      name: String(p.name || p.classification?.name || `Region ${i + 1}`),
      boundaries: ring,
      visible: p.visible !== false,
      by,
    });
  });
  return { regions, skipped };
}

// ------------------------------------------------------------------ save and open

function writeTo(file) {
  fs.writeFileSync(file, JSON.stringify(toGeoJSON(current.regions)), 'utf8');
  current.dirty = false;
  return file;
}

function saveOptions(documentsDir) {
  return { title: 'Save annotations', defaultPath: path.join(documentsDir, 'annotations.geojson'), filters: FILTERS };
}

function registerIpc(ipcMain, { dialog, getWindow, documentsDir }) {
  ipcMain.handle('annotations-changed', (_e, regions) => { current = { regions, dirty: true }; });

  ipcMain.handle('annotations-save', async () => {
    const r = await dialog.showSaveDialog(getWindow(), saveOptions(documentsDir()));
    return r.canceled ? null : writeTo(r.filePath);
  });

  ipcMain.handle('annotations-open', async () => {
    const r = await dialog.showOpenDialog(getWindow(), { title: 'Open annotations', filters: FILTERS, properties: ['openFile'] });
    if (r.canceled) return null;
    const file = r.filePaths[0];
    const { regions, skipped } = fromGeoJSON(JSON.parse(fs.readFileSync(file, 'utf8')));
    current = { regions, dirty: false };
    return { file, regions, skipped };
  });
}

// The renderer blocks the unload while there are unsaved changes (beforeunload in
// regionsManager.js); this is where the user is asked. Closing the window and
// loading another dataset (a page reload) both come through here.
function guardUnload(win, { dialog, documentsDir }) {
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Save', 'Don\'t save', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      message: 'Save your annotations?',
      detail: 'They are kept only until the window closes or another dataset opens.',
    });
    if (choice === 0) {
      const file = dialog.showSaveDialogSync(win, saveOptions(documentsDir()));
      if (!file) return;           // cancelled the save, so stay
      writeTo(file);
    }
    if (choice === 2) return;
    current = { regions: [], dirty: false };
    event.preventDefault();        // go ahead with the close or reload
  });
}

// what the chat tools see: the annotations as the viewer has them now
const list = () => current.regions;

module.exports = { registerIpc, guardUnload, toGeoJSON, fromGeoJSON, list };
