// The main process's way to ask the renderer for something and wait for the answer.
// cell_image and plane_image work out WHAT to draw (which tiles, which polygons, at
// which pixel); the drawing itself needs a canvas, and only the renderer has one. So
// the main process sends the draw list over IPC, the renderer composes it invisibly
// (src/chatImageComposer.js) and sends the finished png back. fly_to_cell goes the
// same way: only the renderer knows which cells the map has, so it does the lookup
// and the glide and says whether the cell was there (src/app.js).
//
// A request carries an id and the renderer answers on <channel>-done with the same
// id. One that never answers times out rather than wedging the tool call.

let getWindow = () => null;
let nextId = 1;
const pending = new Map();
const CHANNELS = ['chat-compose-image', 'chat-fly-to-cell', 'chat-all-planes', 'chat-export-per-class',
                  'chat-viewer-state', 'chat-spot-filters', 'chat-misread-display', 'chat-map-layers', 'chat-go-to-plane', 'chat-gene-count-filter'];

function init(d, ipcMain) {
  getWindow = d.getWindow;
  for (const channel of CHANNELS) {
    ipcMain.on(channel + '-done', (_e, { id, error, ...result }) => {
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      clearTimeout(p.timer);
      if (error) p.reject(new Error(error));
      else p.resolve(result);
    });
  }
}

// resolves with whatever the renderer sent back besides id, rejects with its error
function ask(channel, payload, timeoutMs, tooLate) {
  const win = getWindow();
  if (!win) return Promise.reject(new Error('the viewer window is not open'));
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(tooLate));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    win.webContents.send(channel, { id, ...payload });
  });
}

// payload: { canvasW, canvasH, tiles: [{ b64, mime, dx, dy }], crop: { sx, sy, sw, sh },
//            outW, outH, autocontrast, polygons: [{ pts, stroke, fill, width }],
//            ring: { x, y, r, stroke, width } | null, labels: [{ x, y, text, ... }] }
function compose(payload, timeoutMs = 30000) {
  return ask('chat-compose-image', payload, timeoutMs, 'the viewer did not draw the picture in time')
    .then(r => r.dataUrl);
}

// the renderer looks the cell up and starts the glide. A label the run does not
// have rejects with the message the lookup box would have shown.
function flyToCell(label, timeoutMs = 10000) {
  return ask('chat-fly-to-cell', { label }, timeoutMs, 'the viewer did not move the map in time');
}

// the renderer flips the Cells from all planes switch and answers once every plane
// is loaded and drawn, which on a big run takes minutes, hence the long timeout
function showAllPlanes(on, timeoutMs = 600000) {
  return ask('chat-all-planes', { on }, timeoutMs, 'the viewer did not finish loading the planes in time');
}

// the renderer runs the drawer's per-class png export over region (image pixels)
// or the whole view, writing each png into dir. It may have to load the planes
// first, so this one is given a long time too
function exportPerClassPngs({ region, dir }, timeoutMs = 600000) {
  return ask('chat-export-per-class', { region, dir }, timeoutMs, 'the export did not finish in time');
}

// viewer_state: what the map shows now, read by the renderer from its state, the
// same object every drawer control writes into and the map draws from
function viewerState(timeoutMs = 5000) {
  return ask('chat-viewer-state', {}, timeoutMs, 'the viewer did not report its state in time');
}

// spot_filters: the page moves the sliders and counts the spots still drawn
function spotFilters(settings, timeoutMs = 10000) {
  return ask('chat-spot-filters', settings, timeoutMs, 'the viewer did not apply the filters in time');
}

// misread_display: the page ticks the two misread boxes and counts the misreads
function misreadDisplay(settings, timeoutMs = 10000) {
  return ask('chat-misread-display', settings, timeoutMs, 'the viewer did not change the misreads in time');
}

// map_layers: the page ticks the background and cell boxes, picks the channel
// and moves the cell opacity slider
function mapLayers(settings, timeoutMs = 10000) {
  return ask('chat-map-layers', settings, timeoutMs, 'the viewer did not change the layers in time');
}

// go_to_plane: the page moves the plane slider and waits for that plane's cells
function goToPlane(settings, timeoutMs = 30000) {
  return ask('chat-go-to-plane', settings, timeoutMs, 'the viewer did not change plane in time');
}

// cells_by_gene_count: the page moves the Min and Max genes sliders and counts the
// cells still drawn
function geneCountFilter(settings, timeoutMs = 10000) {
  return ask('chat-gene-count-filter', settings, timeoutMs, 'the viewer did not filter the cells in time');
}

module.exports = { init, compose, flyToCell, showAllPlanes, exportPerClassPngs, viewerState, spotFilters, misreadDisplay, mapLayers, goToPlane, geneCountFilter };
